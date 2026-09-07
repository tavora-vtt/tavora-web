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

export interface TabletopHandlers {
  onMoved?: (id: string, x: number, y: number) => void;
  onDragging?: (id: string, x: number, y: number) => void;
  onSelected?: (id: string | null) => void;
}

const DISPOSITION_TOKENS: Record<string, string> = {
  friendly: "--success",
  hostile: "--danger",
  secret: "--secret",
  neutral: "--neutral",
};

function cssColor(name: string, fallback: string): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return Number.isNaN(parsed) ? Number.parseInt(fallback, 16) : parsed;
}

interface TokenNode {
  container: Container;
  ring: Graphics;
  label: Text;
  shape: TokenShape;
  dragging: boolean;
  ghost: boolean;
}

export class Tabletop {
  private app = new Application();
  private world = new Container();
  private grid = new Graphics();
  private tokenLayer = new Container();
  private nodes = new Map<string, TokenNode>();
  private scene: SceneShape = { width: 2400, height: 1600, gridSize: 100 };
  private selected: string | null = null;
  private scale = 1;

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
    this.app.stage.addChild(this.world);

    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = { contains: () => true };
    this.app.stage.on("pointerdown", (event: FederatedPointerEvent) => {
      if (event.target === this.app.stage) {
        this.select(null);
      }
    });

    this.drawGrid();
    this.fit();
  }

  get renderer(): string {
    return this.app.renderer?.type === 1 ? "webgl" : "webgpu";
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
    this.nodes.clear();
  }

  setScene(scene: SceneShape): void {
    this.scene = scene;
    this.drawGrid();
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
    node.ghost = true;
    node.container.alpha = 0.6;
    node.container.position.set(x * this.scene.gridSize, y * this.scene.gridSize);
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
    node.ghost = false;
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

    const node: TokenNode = { container, ring, label, shape: token, dragging: false, ghost: false };
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
    this.scale = Math.min(
      (view.width - padding) / this.scene.width,
      (view.height - padding) / this.scene.height,
      1,
    );

    this.world.scale.set(this.scale);
    this.world.position.set(
      (view.width - this.scene.width * this.scale) / 2,
      (view.height - this.scene.height * this.scale) / 2,
    );
  }

  repaint(): void {
    this.drawGrid();
    for (const node of this.nodes.values()) {
      this.paintRing(node);
      node.label.style.fill = cssColor("--text", "16182a");
    }
    this.select(this.selected);
  }
}
