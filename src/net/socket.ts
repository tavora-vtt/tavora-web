export type Lane = 0 | 1 | 2;

export const LaneControl: Lane = 0;
export const LaneDocument: Lane = 1;
export const LaneEphemeral: Lane = 2;

export interface Frame {
  lane: Lane;
  type: string;
  hello?: Hello;
  welcome?: Welcome;
  intent?: Intent;
  ack?: Ack;
  event?: EventFrame;
  ephemeral?: EphemeralFrame;
  error?: ErrorFrame;
  ping?: Ping;
  resync?: Resync;
}

export interface Hello {
  ticket: string;
  worldId: string;
  protocolVersion: number;
  lastSeq: number;
  locale?: string;
}

export interface Welcome {
  sessionId: string;
  userId: string;
  role: string;
  seq: number;
  deltaFrom: number;
}

export interface Intent {
  requestId: number;
  kind: string;
  worldId: string;
  payload?: unknown;
}

export interface Ack {
  requestId: number;
  seq: number;
  result?: unknown;
}

export interface EventFrame {
  seq: number;
  kind: string;
  worldId: string;
  sceneId?: string;
  payload?: unknown;
}

export interface EphemeralFrame {
  kind: string;
  key: string;
  worldId: string;
  sceneId?: string;
  payload?: unknown;
}

export interface ErrorFrame {
  requestId?: number;
  code: string;
  messageKey: string;
}

export interface Ping {
  sentAtUnixMs: number;
}

export interface Resync {
  reason: string;
  fromSeq: number;
}

export type ConnectionState = "idle" | "connecting" | "live" | "reconnecting" | "failed";

export interface SocketHandlers {
  onState?: (state: ConnectionState, detail?: string) => void;
  onWelcome?: (welcome: Welcome) => void;
  onEvent?: (event: EventFrame) => void;
  onEphemeral?: (ephemeral: EphemeralFrame) => void;
  onError?: (error: ErrorFrame) => void;
  onLatency?: (milliseconds: number) => void;
}

const PROTOCOL_VERSION = 1;
const MAX_BACKOFF = 30_000;

export class Session {
  private socket: WebSocket | null = null;
  private requestId = 0;
  private lastSeq = 0;
  private attempt = 0;
  private closing = false;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: ErrorFrame) => void }>();

  constructor(
    private readonly worldId: string,
    private readonly issueTicket: () => Promise<string>,
    private readonly handlers: SocketHandlers = {},
  ) {}

  get sequence(): number {
    return this.lastSeq;
  }

  async connect(): Promise<void> {
    this.closing = false;
    this.handlers.onState?.(this.attempt === 0 ? "connecting" : "reconnecting");

    let ticket: string;
    try {
      ticket = await this.issueTicket();
    } catch (error) {
      this.scheduleReconnect(String(error));
      return;
    }

    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${location.host}/ws?format=json`);
    this.socket = socket;

    socket.onopen = () => {
      this.send({
        lane: LaneControl,
        type: "hello",
        hello: {
          ticket,
          worldId: this.worldId,
          protocolVersion: PROTOCOL_VERSION,
          lastSeq: this.lastSeq,
          locale: navigator.language,
        },
      });
    };

    socket.onmessage = (message) => this.receive(message.data as string);

    socket.onclose = () => {
      this.stopPing();
      this.socket = null;
      if (!this.closing) {
        this.scheduleReconnect("connection closed");
      }
    };

    socket.onerror = () => {
      if (!this.closing) {
        this.handlers.onState?.("reconnecting", "socket error");
      }
    };
  }

  close(): void {
    this.closing = true;
    this.stopPing();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.handlers.onState?.("idle");
  }

  intent<T = unknown>(kind: string, payload: unknown): Promise<T> {
    const requestId = ++this.requestId;

    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.send({
        lane: LaneDocument,
        type: "intent",
        intent: { requestId, kind, worldId: this.worldId, payload },
      });
    });
  }

  ephemeral(kind: string, key: string, payload: unknown): void {
    this.send({
      lane: LaneEphemeral,
      type: "ephemeral",
      ephemeral: { kind, key, worldId: this.worldId, payload },
    });
  }

  private send(frame: Frame): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(frame));
  }

  private receive(raw: string): void {
    let frame: Frame;
    try {
      frame = JSON.parse(raw) as Frame;
    } catch {
      return;
    }

    switch (frame.type) {
      case "welcome":
        this.attempt = 0;
        this.lastSeq = frame.welcome?.deltaFrom ?? 0;
        this.handlers.onState?.("live");
        this.startPing();
        if (frame.welcome) {
          this.handlers.onWelcome?.(frame.welcome);
        }
        break;

      case "event":
        if (frame.event) {
          this.lastSeq = Math.max(this.lastSeq, frame.event.seq);
          this.handlers.onEvent?.(frame.event);
        }
        break;

      case "ephemeral":
        if (frame.ephemeral) {
          this.handlers.onEphemeral?.(frame.ephemeral);
        }
        break;

      case "ack":
        if (frame.ack) {
          this.pending.get(frame.ack.requestId)?.resolve(frame.ack.result);
          this.pending.delete(frame.ack.requestId);
        }
        break;

      case "error":
        if (frame.error) {
          const waiting = frame.error.requestId ? this.pending.get(frame.error.requestId) : undefined;
          if (waiting && frame.error.requestId) {
            waiting.reject(frame.error);
            this.pending.delete(frame.error.requestId);
          }
          this.handlers.onError?.(frame.error);
        }
        break;

      case "pong":
        if (frame.ping) {
          this.handlers.onLatency?.(Date.now() - frame.ping.sentAtUnixMs);
        }
        break;

      case "resync":
        this.handlers.onState?.("reconnecting", frame.resync?.reason ?? "resync");
        break;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      this.send({ lane: LaneControl, type: "ping", ping: { sentAtUnixMs: Date.now() } });
    }, 10_000);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(detail: string): void {
    this.attempt += 1;
    const delay = Math.min(MAX_BACKOFF, 500 * 2 ** Math.min(this.attempt, 6));
    const jittered = delay * (0.7 + Math.random() * 0.6);

    this.handlers.onState?.("reconnecting", detail);
    this.reconnectTimer = window.setTimeout(() => void this.connect(), jittered);
  }
}
