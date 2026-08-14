/**
 * A tiny painter for generating pixel art at runtime. Everything the game
 * shows is drawn through this into offscreen canvases once at boot, then
 * blitted like a conventional sprite atlas.
 */
import { Rng } from '../engine/rng';

export type Canvas = HTMLCanvasElement;

export function makeCanvas(w: number, h: number): { canvas: Canvas; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('failed to acquire 2D context for generated art');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** Chainable pixel painter scoped to one offscreen canvas. */
export class Painter {
  readonly canvas: Canvas;
  readonly ctx: CanvasRenderingContext2D;
  readonly w: number;
  readonly h: number;
  /** Offset applied to every draw call, so sprite cells can share code. */
  private ox = 0;
  private oy = 0;

  constructor(w: number, h: number) {
    const { canvas, ctx } = makeCanvas(w, h);
    this.canvas = canvas;
    this.ctx = ctx;
    this.w = w;
    this.h = h;
  }

  /** Runs `fn` with the origin moved to (x, y). */
  at(x: number, y: number, fn: () => void): this {
    const px = this.ox;
    const py = this.oy;
    this.ox = px + x;
    this.oy = py + y;
    fn();
    this.ox = px;
    this.oy = py;
    return this;
  }

  px(x: number, y: number, color: string): this {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(this.ox + x, this.oy + y, 1, 1);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, color: string): this {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(this.ox + x, this.oy + y, w, h);
    return this;
  }

  /** One-pixel-thick outline drawn inside the given bounds. */
  frame(x: number, y: number, w: number, h: number, color: string): this {
    this.rect(x, y, w, 1, color);
    this.rect(x, y + h - 1, w, 1, color);
    this.rect(x, y, 1, h, color);
    this.rect(x + w - 1, y, 1, h, color);
    return this;
  }

  hline(x: number, y: number, w: number, color: string): this {
    return this.rect(x, y, w, 1, color);
  }

  vline(x: number, y: number, h: number, color: string): this {
    return this.rect(x, y, 1, h, color);
  }

  /** Filled axis-aligned ellipse, rasterised per-pixel to stay crisp. */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, color);
      }
    }
    return this;
  }

  circle(cx: number, cy: number, r: number, color: string): this {
    return this.ellipse(cx, cy, r, r, color);
  }

  line(x0: number, y0: number, x1: number, y1: number, color: string): this {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x, y, color);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    return this;
  }

  /** Scatters `count` pixels of `color` inside the rect using `rng`. */
  speckle(x: number, y: number, w: number, h: number, count: number, color: string, rng: Rng): this {
    for (let i = 0; i < count; i++) {
      this.px(x + rng.int(0, w - 1), y + rng.int(0, h - 1), color);
    }
    return this;
  }

  /** Mirrors the left half of a region onto the right — handy for faces. */
  mirrorX(x: number, y: number, w: number, h: number): this {
    const half = Math.floor(w / 2);
    const data = this.ctx.getImageData(this.ox + x, this.oy + y, half, h);
    const flipped = this.ctx.createImageData(half, h);
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < half; col++) {
        const src = (row * half + col) * 4;
        const dst = (row * half + (half - 1 - col)) * 4;
        flipped.data[dst] = data.data[src];
        flipped.data[dst + 1] = data.data[src + 1];
        flipped.data[dst + 2] = data.data[src + 2];
        flipped.data[dst + 3] = data.data[src + 3];
      }
    }
    this.ctx.putImageData(flipped, this.ox + x + w - half, this.oy + y);
    return this;
  }

  /** Draws another generated canvas into this one. */
  blit(src: Canvas, x: number, y: number, sx = 0, sy = 0, sw = src.width, sh = src.height): this {
    this.ctx.drawImage(src, sx, sy, sw, sh, this.ox + x, this.oy + y, sw, sh);
    return this;
  }

  clear(): this {
    this.ctx.clearRect(0, 0, this.w, this.h);
    return this;
  }
}

/**
 * Produces a white silhouette of a sprite region, used for damage flashes.
 * Keeps alpha, replaces every colour with `color`.
 */
export function tintSilhouette(src: Canvas, color: string): Canvas {
  const { canvas, ctx } = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, src.width, src.height);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}
