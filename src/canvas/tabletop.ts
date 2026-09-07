import { Application, Container, Graphics, Text, TextStyle, type FederatedPointerEvent } from "pixi.js";

export interface SceneShape {
  width: number;
  height: number;
  gridSize: number;
}

export interface TokenShape {
  id: string;
  name: string;
  x: number;
  y: number;
  disposition: string;
}

export interface WallShape {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  door: boolean;
  doorOpen: boolean;
}

export interface CursorShape {
  userId: string;
  name: string;
  x: number;
  y: number;
}

export interface TabletopHandlers {
  onMoved?: (id: string, x: number, y: number) => void;
  onDragging?: (id: string, x: number, y: number) => void;
  onSelected?: (id: string | null) => void;
  onPointer?: (x: number, y: number) => void;
  onView?: (zoom: number) => void;
  onWall?: (x1: number, y1: number, x2: number, y2: number) => void;
}

const DISPOSITION_TOKENS: Record<string, string> = {
  friendly: "--success",
  hostile: "--danger",
  secret: "--secret",
  neutral: "--neutral",
};

const CURSOR_PALETTE = ["--accent", "--success", "--attention", "--secret", "--danger"];

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 4;
const CURSOR_TIMEOUT = 6000;

function cssColor(name: string, fallback: string): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return Number.isNaN(parsed) ? Number.parseInt(fallback, 16) : parsed;
}

function hashOf(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

interface TokenNode {
  container: Container;
  ring: Graphics;
  label: Text;
  shape: TokenShape;
  dragging: boolean;
}

interface CursorNode {
  container: Container;
  arrow: Graphics;
  label: Text;
  lastSeen: number;
}

export class Tabletop {
  private app = new Application();
  private world = new Container();
  private grid = new Graphics();
  private wallLayer = new Graphics();
  private draftWall = new Graphics();
  private tokenLayer = new Container();
  private cursorLayer = new Container();
  private nodes = new Map<string, TokenNode>();
  private cursors = new Map<string, CursorNode>();
  private scene: SceneShape = { width: 2400, height: 1600, gridSize: 100 };
  private selected: string | null = null;
  private panning = false;
  private panFrom = { x: 0, y: 0 };
  private lastBroadcast = 0;

  constructor(private readonly handlers: TabletopHandlers = {}) {}

  async mount(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      antialias: true,
      backgroundAlpha: 0,
      preference: "webgpu",
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });

    host.appendChild(this.app.canvas);

    this.world.addChild(this.grid);
    this.world.addChild(this.tokenLayer);
    this.world.addChild(this.wallLayer);
    this.world.addChild(this.draftWall);
    this.world.addChild(this.cursorLayer);
    this.app.stage.addChild(this.world);

    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = { contains: () => true };

    this.bindViewport(host);
    this.drawGrid();
    this.fit();

    this.app.ticker.add(() => this.expireCursors());
  }

  get renderer(): string {
    return this.app.renderer?.type === 1 ? "webgl" : "webgpu";
  }

  get zoom(): number {
    return this.world.scale.x;
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
    this.nodes.clear();
    this.cursors.clear();
  }

  private walls: WallShape[] = [];
  private wallTool = false;
  private wallStart: { x: number; y: number } | null = null;

  setWallTool(enabled: boolean): void {
    this.wallTool = enabled;
    this.wallStart = null;
    this.draftWall.clear();
  }

  setWalls(walls: WallShape[]): void {
    this.walls = walls;
    this.drawWalls();
  }

  private drawWalls(): void {
    const size = this.scene.gridSize;
    this.wallLayer.clear();

    for (const wall of this.walls) {
      const color = wall.door
        ? cssColor("--attention", "b26a00")
        : cssColor("--text-2", "5c6180");

      this.wallLayer
        .moveTo(wall.x1 * size, wall.y1 * size)
        .lineTo(wall.x2 * size, wall.y2 * size)
        .stroke({ color, width: 6, alpha: wall.doorOpen ? 0.35 : 0.9, cap: "round" });
    }
  }

  private snapToGrid(x: number, y: number): { x: number; y: number } {
    const size = this.scene.gridSize;
    return { x: Math.round(x / size), y: Math.round(y / size) };
  }

  setScene(scene: SceneShape): void {
    this.scene = scene;
    this.drawGrid();
    this.drawWalls();
    this.fit();
  }

  setTokens(tokens: TokenShape[]): void {
    const seen = new Set<string>();

    for (const token of tokens) {
      seen.add(token.id);
      this.upsert(token);
    }

    for (const [id, node] of this.nodes) {
      if (!seen.has(id)) {
        node.container.destroy({ children: true });
        this.nodes.delete(id);
      }
    }
  }

  applyRemote(token: TokenShape): void {
    const node = this.nodes.get(token.id);
    if (node?.dragging) {
      return;
    }
    this.upsert(token);
  }

  showGhost(id: string, x: number, y: number): void {
    const node = this.nodes.get(id);
    if (!node || node.dragging) return;
    node.container.alpha = 0.6;
    node.container.position.set(x * this.scene.gridSize, y * this.scene.gridSize);
  }

  showCursor(cursor: CursorShape): void {
    let node = this.cursors.get(cursor.userId);

    if (!node) {
      node = this.createCursor(cursor);
      this.cursors.set(cursor.userId, node);
      this.cursorLayer.addChild(node.container);
    }

    node.lastSeen = performance.now();
    node.label.text = cursor.name;
    node.container.position.set(cursor.x, cursor.y);
    node.container.scale.set(1 / this.world.scale.x);
    node.container.visible = true;
  }

  dropCursor(userId: string): void {
    const node = this.cursors.get(userId);
    if (!node) return;
    node.container.destroy({ children: true });
    this.cursors.delete(userId);
  }

  private expireCursors(): void {
    const now = performance.now();
    for (const node of this.cursors.values()) {
      if (now - node.lastSeen > CURSOR_TIMEOUT) {
        node.container.visible = false;
      }
    }
  }

  private createCursor(cursor: CursorShape): CursorNode {
    const container = new Container();
    const arrow = new Graphics();
    const paletteEntry = CURSOR_PALETTE[hashOf(cursor.userId) % CURSOR_PALETTE.length];
    const color = cssColor(paletteEntry ?? "--accent", "5b4be8");

    arrow.moveTo(0, 0).lineTo(0, 16).lineTo(4.5, 12).lineTo(11, 11).closePath().fill({ color });

    const label = new Text({
      text: cursor.name,
      style: new TextStyle({
        fontFamily: "IBM Plex Sans, sans-serif",
        fontSize: 11,
        fontWeight: "600",
        fill: color,
      }),
    });
    label.position.set(13, 9);

    container.addChild(arrow);
    container.addChild(label);
    container.eventMode = "none";

    return { container, arrow, label, lastSeen: performance.now() };
  }

  private bindViewport(host: HTMLElement): void {
    this.app.stage.on("pointerdown", (event: FederatedPointerEvent) => {
      if (event.target !== this.app.stage) return;

      if (this.wallTool) {
        const local = this.world.toLocal(event.global);
        const point = this.snapToGrid(local.x, local.y);
        if (!this.wallStart) {
          this.wallStart = point;
        } else {
          this.handlers.onWall?.(this.wallStart.x, this.wallStart.y, point.x, point.y);
          this.wallStart = null;
          this.draftWall.clear();
        }
        return;
      }

      this.select(null);
      this.panning = true;
      this.panFrom = {
        x: event.global.x - this.world.position.x,
        y: event.global.y - this.world.position.y,
      };
      host.style.cursor = "grabbing";
    });

    this.app.stage.on("pointermove", (event: FederatedPointerEvent) => {
      if (this.wallTool && this.wallStart) {
        const local = this.world.toLocal(event.global);
        const end = this.snapToGrid(local.x, local.y);
        const size = this.scene.gridSize;

        this.draftWall
          .clear()
          .moveTo(this.wallStart.x * size, this.wallStart.y * size)
          .lineTo(end.x * size, end.y * size)
          .stroke({ color: cssColor("--accent", "5b4be8"), width: 5, alpha: 0.8, cap: "round" });
        return;
      }

      if (this.panning) {
        this.world.position.set(event.global.x - this.panFrom.x, event.global.y - this.panFrom.y);
        return;
      }

      const now = performance.now();
      if (now - this.lastBroadcast < 50) return;
      this.lastBroadcast = now;

      const point = this.world.toLocal(event.global);
      this.handlers.onPointer?.(point.x, point.y);
    });

    const stopPan = () => {
      this.panning = false;
      host.style.cursor = "";
    };
    this.app.stage.on("pointerup", stopPan);
    this.app.stage.on("pointerupoutside", stopPan);

    host.addEventListener(
      "wheel",
      (event: WheelEvent) => {
        event.preventDefault();

        const rect = host.getBoundingClientRect();
        const pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const before = this.world.toLocal(pointer);

        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.world.scale.x * factor));
        this.world.scale.set(next);

        const after = this.world.toLocal(pointer);
        this.world.position.x += (after.x - before.x) * next;
        this.world.position.y += (after.y - before.y) * next;

        this.rescaleCursors();
        this.handlers.onView?.(next);
      },
      { passive: false },
    );
  }

  private rescaleCursors(): void {
    const inverse = 1 / this.world.scale.x;
    for (const node of this.cursors.values()) {
      node.container.scale.set(inverse);
    }
  }

  private select(id: string | null): void {
    this.selected = id;
    for (const [nodeId, node] of this.nodes) {
      node.ring.tint = nodeId === id ? cssColor("--accent", "5b4be8") : 0xffffff;
      node.ring.scale.set(nodeId === id ? 1.08 : 1);
    }
    this.handlers.onSelected?.(id);
  }

  private upsert(token: TokenShape): void {
    let node = this.nodes.get(token.id);

    if (!node) {
      node = this.create(token);
      this.nodes.set(token.id, node);
      this.tokenLayer.addChild(node.container);
    }

    node.shape = token;
    node.container.alpha = 1;

    if (!node.dragging) {
      node.container.position.set(token.x * this.scene.gridSize, token.y * this.scene.gridSize);
    }
    node.label.text = token.name;
    this.paintRing(node);
  }

  private paintRing(node: TokenNode): void {
    const size = this.scene.gridSize;
    const radius = size * 0.42;
    const color = cssColor(DISPOSITION_TOKENS[node.shape.disposition] ?? "--neutral", "5c6180");

    node.ring.clear();
    node.ring.circle(size / 2, size / 2, radius).fill({ color, alpha: 0.22 });
    node.ring.circle(size / 2, size / 2, radius).stroke({ color, width: 4 });
  }

  private create(token: TokenShape): TokenNode {
    const container = new Container();
    const ring = new Graphics();

    const label = new Text({
      text: token.name,
      style: new TextStyle({
        fontFamily: "IBM Plex Sans, sans-serif",
        fontSize: 20,
        fontWeight: "600",
        fill: cssColor("--text", "16182a"),
        align: "center",
      }),
    });

    label.anchor.set(0.5, 0);
    label.position.set(this.scene.gridSize / 2, this.scene.gridSize * 0.92);

    container.addChild(ring);
    container.addChild(label);
    container.eventMode = "static";
    container.cursor = "grab";

    const node: TokenNode = { container, ring, label, shape: token, dragging: false };
    this.bindDrag(node);
    return node;
  }

  private bindDrag(node: TokenNode): void {
    let offsetX = 0;
    let offsetY = 0;

    const move = (event: FederatedPointerEvent) => {
      const point = this.world.toLocal(event.global);
      node.container.position.set(point.x - offsetX, point.y - offsetY);

      const cell = this.cellOf(node.container.position.x, node.container.position.y);
      this.handlers.onDragging?.(node.shape.id, cell.x, cell.y);
    };

    const end = () => {
      if (!node.dragging) return;
      node.dragging = false;
      node.container.cursor = "grab";
      this.app.stage.off("pointermove", move);
      this.app.stage.off("pointerup", end);
      this.app.stage.off("pointerupoutside", end);

      const cell = this.cellOf(node.container.position.x, node.container.position.y);
      node.container.position.set(cell.x * this.scene.gridSize, cell.y * this.scene.gridSize);
      this.handlers.onMoved?.(node.shape.id, cell.x, cell.y);
    };

    node.container.on("pointerdown", (event: FederatedPointerEvent) => {
      event.stopPropagation();
      this.select(node.shape.id);

      const point = this.world.toLocal(event.global);
      offsetX = point.x - node.container.position.x;
      offsetY = point.y - node.container.position.y;

      node.dragging = true;
      node.container.cursor = "grabbing";
      this.app.stage.on("pointermove", move);
      this.app.stage.on("pointerup", end);
      this.app.stage.on("pointerupoutside", end);
    });
  }

  private cellOf(x: number, y: number): { x: number; y: number } {
    const size = this.scene.gridSize;
    const columns = Math.max(1, Math.floor(this.scene.width / size));
    const rows = Math.max(1, Math.floor(this.scene.height / size));

    return {
      x: Math.min(columns - 1, Math.max(0, Math.round(x / size))),
      y: Math.min(rows - 1, Math.max(0, Math.round(y / size))),
    };
  }

  private drawGrid(): void {
    const { width, height, gridSize } = this.scene;
    const ink = cssColor("--map-ink", "c9cbdd");
    const ground = cssColor("--map-ground", "dedfec");

    this.grid.clear();
    this.grid.rect(0, 0, width, height).fill({ color: ground });

    for (let x = 0; x <= width; x += gridSize) {
      this.grid.moveTo(x, 0).lineTo(x, height);
    }
    for (let y = 0; y <= height; y += gridSize) {
      this.grid.moveTo(0, y).lineTo(width, y);
    }
    this.grid.stroke({ color: ink, width: 1, alpha: 0.9 });
    this.grid.rect(0, 0, width, height).stroke({ color: ink, width: 4 });
  }

  fit(): void {
    const view = this.app.renderer?.screen;
    if (!view) return;

    const padding = 32;
    const scale = Math.min(
      (view.width - padding) / this.scene.width,
      (view.height - padding) / this.scene.height,
      1,
    );

    this.world.scale.set(scale);
    this.world.position.set(
      (view.width - this.scene.width * scale) / 2,
      (view.height - this.scene.height * scale) / 2,
    );

    this.rescaleCursors();
    this.handlers.onView?.(scale);
  }

  repaint(): void {
    this.drawGrid();
    this.drawWalls();
    for (const node of this.nodes.values()) {
      this.paintRing(node);
      node.label.style.fill = cssColor("--text", "16182a");
    }
    this.select(this.selected);
  }
}
