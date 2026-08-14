/**
 * UI drawing primitives. The UI renders on a display-resolution canvas laid
 * over the pixel game buffer, so text is crisp while icons stay pixel art.
 *
 * All coordinates are in *game pixels* (the 320x208 space) and multiplied by
 * `u.s` on the way out, so layouts read the same at any window size.
 */
import type { Art } from '../art';
import { PAL, withAlpha } from '../art/palette';
import type { Canvas } from '../art/paint';

export interface UiCtx {
  ctx: CanvasRenderingContext2D;
  /** Scale from game pixels to CSS pixels. */
  s: number;
  /** Viewport size in game pixels. */
  w: number;
  h: number;
  art: Art;
  time: number;
  /** Pointer position in game pixels, or null when outside. */
  mouse: { x: number; y: number; down: boolean; pressed: boolean; released: boolean } | null;
}

export const FONT_STACK = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace';

export interface TextOpts {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  weight?: number;
  /** Draws a hard 1px shadow beneath, for legibility over art. */
  shadow?: boolean;
  letterSpacing?: number;
  alpha?: number;
}

export function text(u: UiCtx, str: string, x: number, y: number, opts: TextOpts = {}): void {
  const size = (opts.size ?? 8) * u.s;
  const { ctx } = u;
  ctx.save();
  ctx.font = `${opts.weight ?? 500} ${size}px ${FONT_STACK}`;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = opts.baseline ?? 'top';
  if (opts.letterSpacing) {
    // letterSpacing is widely supported; harmless where it is not.
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${opts.letterSpacing * u.s}px`;
  }
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (opts.shadow !== false) {
    ctx.fillStyle = withAlpha(PAL.black, 0.75);
    ctx.fillText(str, x * u.s + Math.max(1, u.s * 0.5), y * u.s + Math.max(1, u.s * 0.5));
  }
  ctx.fillStyle = opts.color ?? PAL.uiText;
  ctx.fillText(str, x * u.s, y * u.s);
  ctx.restore();
}

export function measure(u: UiCtx, str: string, size = 8, weight = 500): number {
  const { ctx } = u;
  ctx.save();
  ctx.font = `${weight} ${size * u.s}px ${FONT_STACK}`;
  const width = ctx.measureText(str).width / u.s;
  ctx.restore();
  return width;
}

export function rect(u: UiCtx, x: number, y: number, w: number, h: number, color: string): void {
  u.ctx.fillStyle = color;
  u.ctx.fillRect(Math.round(x * u.s), Math.round(y * u.s), Math.round(w * u.s), Math.round(h * u.s));
}

export function strokeRect(u: UiCtx, x: number, y: number, w: number, h: number, color: string, thickness = 1): void {
  const t = Math.max(1, Math.round(thickness * u.s));
  u.ctx.fillStyle = color;
  const X = Math.round(x * u.s);
  const Y = Math.round(y * u.s);
  const W = Math.round(w * u.s);
  const H = Math.round(h * u.s);
  u.ctx.fillRect(X, Y, W, t);
  u.ctx.fillRect(X, Y + H - t, W, t);
  u.ctx.fillRect(X, Y, t, H);
  u.ctx.fillRect(X + W - t, Y, t, H);
}

export interface PanelOpts {
  fill?: string;
  edge?: string;
  /** Adds a brighter inner highlight line. */
  inset?: boolean;
  alpha?: number;
}

/** The standard framed box used by every menu. */
export function panel(u: UiCtx, x: number, y: number, w: number, h: number, opts: PanelOpts = {}): void {
  const { ctx } = u;
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  rect(u, x, y, w, h, opts.fill ?? withAlpha(PAL.uiBackDeep, 0.94));
  strokeRect(u, x, y, w, h, opts.edge ?? PAL.uiEdge, 1);
  if (opts.inset !== false) {
    strokeRect(u, x + 1, y + 1, w - 2, h - 2, withAlpha(PAL.uiEdgeBright, 0.18), 1);
  }
  ctx.restore();
}

/** Blits a generated pixel icon, scaled by an integer factor. */
export function icon(u: UiCtx, image: Canvas, x: number, y: number, size = 16): void {
  u.ctx.imageSmoothingEnabled = false;
  u.ctx.drawImage(image, Math.round(x * u.s), Math.round(y * u.s), Math.round(size * u.s), Math.round(size * u.s));
}

export function bar(
  u: UiCtx,
  x: number,
  y: number,
  w: number,
  h: number,
  fraction: number,
  color: string,
  background = withAlpha(PAL.black, 0.6),
): void {
  rect(u, x, y, w, h, background);
  const filled = Math.max(0, Math.min(1, fraction)) * (w - 2);
  if (filled > 0) rect(u, x + 1, y + 1, filled, h - 2, color);
  strokeRect(u, x, y, w, h, withAlpha(PAL.uiEdge, 0.8), 1);
}

/** Returns true if the pointer is inside the rect. */
export function hovered(u: UiCtx, x: number, y: number, w: number, h: number): boolean {
  const m = u.mouse;
  if (!m) return false;
  return m.x >= x && m.x < x + w && m.y >= y && m.y < y + h;
}

/** Hover + click helper for simple buttons. */
export function clicked(u: UiCtx, x: number, y: number, w: number, h: number): boolean {
  return hovered(u, x, y, w, h) && (u.mouse?.pressed ?? false);
}

/** Wraps text to a pixel width, returning the lines. */
export function wrapText(u: UiCtx, str: string, maxWidth: number, size = 8): string[] {
  const words = str.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(u, candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Truncates a string with an ellipsis so it fits `maxWidth` pixels. */
export function clipText(u: UiCtx, str: string, maxWidth: number, size = 8): string {
  if (measure(u, str, size) <= maxWidth) return str;
  let out = str;
  while (out.length > 1 && measure(u, `${out}…`, size) > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

/** Dims the whole screen; used behind modal menus. */
export function scrim(u: UiCtx, alpha = 0.62): void {
  u.ctx.save();
  u.ctx.globalAlpha = alpha;
  u.ctx.fillStyle = PAL.uiBackDeep;
  u.ctx.fillRect(0, 0, u.w * u.s, u.h * u.s);
  u.ctx.restore();
}

/** Subtle diagonal hatch, used to mark locked or empty slots. */
export function hatch(u: UiCtx, x: number, y: number, w: number, h: number, color: string): void {
  const { ctx } = u;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x * u.s, y * u.s, w * u.s, h * u.s);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, u.s * 0.5);
  for (let i = -h; i < w; i += 4) {
    ctx.beginPath();
    ctx.moveTo((x + i) * u.s, y * u.s);
    ctx.lineTo((x + i + h) * u.s, (y + h) * u.s);
    ctx.stroke();
  }
  ctx.restore();
}
