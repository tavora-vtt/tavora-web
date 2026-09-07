import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { FrameSchema, type Frame as WireFrame } from "@tavora/protocol";
import type { Frame } from "./socket";

export interface Codec {
  readonly name: string;
  readonly binary: boolean;
  encode(frame: Frame): string | Uint8Array;
  decode(data: string | ArrayBuffer | Uint8Array): Frame;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBytes(value: unknown): Uint8Array {
  if (value === undefined || value === null) return new Uint8Array();
  return encoder.encode(JSON.stringify(value));
}

function fromBytes(value: Uint8Array): unknown {
  if (value.length === 0) return undefined;
  try {
    return JSON.parse(decoder.decode(value));
  } catch {
    return undefined;
  }
}

export const jsonCodec: Codec = {
  name: "json",
  binary: false,
  encode(frame) {
    return JSON.stringify(frame);
  },
  decode(data) {
    if (typeof data !== "string") {
      throw new Error("json codec received binary data");
    }
    return JSON.parse(data) as Frame;
  },
};

export const protoCodec: Codec = {
  name: "protobuf",
  binary: true,

  encode(frame) {
    return toBinary(FrameSchema, toWire(frame));
  },

  decode(data) {
    if (typeof data === "string") {
      throw new Error("protobuf codec received text data");
    }
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    return fromWire(fromBinary(FrameSchema, bytes));
  },
};

function toWire(frame: Frame): WireFrame {
  const message = create(FrameSchema, { lane: frame.lane });

  switch (frame.type) {
    case "hello":
      message.body = {
        case: "hello",
        value: {
          $typeName: "tavora.v1.Hello",
          ticket: frame.hello?.ticket ?? "",
          worldId: frame.hello?.worldId ?? "",
          protocolVersion: frame.hello?.protocolVersion ?? 0,
          lastSeq: BigInt(frame.hello?.lastSeq ?? 0),
          locale: frame.hello?.locale ?? "",
          capabilities: [],
        },
      };
      break;

    case "intent":
      message.body = {
        case: "intent",
        value: {
          $typeName: "tavora.v1.Intent",
          requestId: frame.intent?.requestId ?? 0,
          kind: frame.intent?.kind ?? "",
          worldId: frame.intent?.worldId ?? "",
          payload: toBytes(frame.intent?.payload),
        },
      };
      break;

    case "ephemeral":
      message.body = {
        case: "ephemeral",
        value: {
          $typeName: "tavora.v1.Ephemeral",
          kind: frame.ephemeral?.kind ?? "",
          key: frame.ephemeral?.key ?? "",
          worldId: frame.ephemeral?.worldId ?? "",
          sceneId: frame.ephemeral?.sceneId ?? "",
          payload: toBytes(frame.ephemeral?.payload),
        },
      };
      break;

    case "ping":
      message.body = {
        case: "ping",
        value: {
          $typeName: "tavora.v1.Ping",
          sentAtUnixMs: BigInt(frame.ping?.sentAtUnixMs ?? 0),
        },
      };
      break;

    default:
      throw new Error(`the client does not send ${frame.type} frames`);
  }

  return message;
}

function fromWire(message: WireFrame): Frame {
  const lane = message.lane as Frame["lane"];
  const body = message.body;

  switch (body.case) {
    case "welcome":
      return {
        lane,
        type: "welcome",
        welcome: {
          sessionId: body.value.sessionId,
          userId: body.value.userId,
          role: body.value.role,
          seq: Number(body.value.seq),
          deltaFrom: Number(body.value.deltaFrom),
        },
      };

    case "ack":
      return {
        lane,
        type: "ack",
        ack: {
          requestId: body.value.requestId,
          seq: Number(body.value.seq),
          result: fromBytes(body.value.result),
        },
      };

    case "event":
      return {
        lane,
        type: "event",
        event: {
          seq: Number(body.value.seq),
          kind: body.value.kind,
          worldId: body.value.worldId,
          sceneId: body.value.sceneId,
          payload: fromBytes(body.value.payload),
        },
      };

    case "ephemeral":
      return {
        lane,
        type: "ephemeral",
        ephemeral: {
          kind: body.value.kind,
          key: body.value.key,
          worldId: body.value.worldId,
          sceneId: body.value.sceneId,
          payload: fromBytes(body.value.payload),
        },
      };

    case "error":
      return {
        lane,
        type: "error",
        error: {
          requestId: body.value.requestId,
          code: body.value.code,
          messageKey: body.value.messageKey,
        },
      };

    case "pong":
      return {
        lane,
        type: "pong",
        ping: { sentAtUnixMs: Number(body.value.sentAtUnixMs) },
      };

    case "ping":
      return {
        lane,
        type: "ping",
        ping: { sentAtUnixMs: Number(body.value.sentAtUnixMs) },
      };

    case "resync":
      return {
        lane,
        type: "resync",
        resync: { reason: body.value.reason, fromSeq: Number(body.value.fromSeq) },
      };

    default:
      throw new Error("frame carried no recognised body");
  }
}
