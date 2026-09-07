import { Texture } from "pixi.js";

const DEFAULT_CAPACITY = 96;

/**
 * TextureCache keeps decoded art on the GPU and evicts the least recently used entry once
 * it is full. Asset URLs are content addressed, so a hit is always the right image and a
 * texture never has to be invalidated.
 *
 * Images are fetched and decoded here rather than through the renderer's own loader,
 * because an asset URL carries no file extension for a loader to recognize.
 */
export class TextureCache {
  private entries = new Map<string, Texture>();
  private pending = new Map<string, Promise<Texture | null>>();

  constructor(private readonly capacity = DEFAULT_CAPACITY) {}

  peek(url: string): Texture | null {
    const texture = this.entries.get(url);
    if (!texture) return null;

    this.entries.delete(url);
    this.entries.set(url, texture);
    return texture;
  }

  async load(url: string): Promise<Texture | null> {
    const cached = this.peek(url);
    if (cached) return cached;

    const inFlight = this.pending.get(url);
    if (inFlight) return inFlight;

    const request = decode(url)
      .then((texture) => {
        if (texture) this.remember(url, texture);
        return texture;
      })
      .finally(() => this.pending.delete(url));

    this.pending.set(url, request);
    return request;
  }

  private remember(url: string, texture: Texture): void {
    this.entries.set(url, texture);

    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;

      this.entries.get(oldest.value)?.destroy(true);
      this.entries.delete(oldest.value);
    }
  }

  clear(): void {
    for (const texture of this.entries.values()) {
      texture.destroy(true);
    }
    this.entries.clear();
    this.pending.clear();
  }
}

async function decode(url: string): Promise<Texture | null> {
  try {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) return null;

    const bitmap = await createImageBitmap(await response.blob());
    return Texture.from(bitmap);
  } catch {
    return null;
  }
}
