/**
 * Two-layer presentation.
 *
 *  - The game layer is a fixed 320x208 buffer scaled by an integer factor and
 *    drawn with smoothing off, so sprites stay pixel-crisp.
 *  - The UI layer matches the display resolution, so menu text and inventory
 *    chrome render sharply instead of being upscaled into mush.
 *
 * Both canvases occupy the same rect, so UI coordinates are just game
 * coordinates multiplied by `scale`.
 */

export const TILE = 16;
export const ROOM_COLS = 20;
export const ROOM_ROWS = 13;
export const VIEW_W = ROOM_COLS * TILE; // 320
export const VIEW_H = ROOM_ROWS * TILE; // 208

export class Screen {
  readonly game: CanvasRenderingContext2D;
  readonly ui: CanvasRenderingContext2D;
  /** Integer upscale factor from the 320x208 buffer to CSS pixels. */
  scale = 3;
  /** CSS pixel size of the presented frame. */
  cssW = VIEW_W * 3;
  cssH = VIEW_H * 3;
  /**
   * Vertical space kept clear below the picture for on-screen controls, and
   * whether to allow fractional scaling. Touch devices trade pixel-perfect
   * upscaling for filling the screen; desktops keep integer scale.
   */
  reservedBottom = 0;
  allowFractionalScale = false;

  constructor(
    gameCanvas: HTMLCanvasElement,
    private readonly uiCanvas: HTMLCanvasElement,
    private readonly frame: HTMLElement,
  ) {
    gameCanvas.width = VIEW_W;
    gameCanvas.height = VIEW_H;
    const gctx = gameCanvas.getContext('2d', { alpha: false });
    const uctx = uiCanvas.getContext('2d');
    if (!gctx || !uctx) throw new Error('2D canvas is unavailable in this browser');
    this.game = gctx;
    this.ui = uctx;
    this.game.imageSmoothingEnabled = false;

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  resize = (): void => {
    const pad = this.reservedBottom > 0 ? 8 : 16;
    const availW = Math.max(240, window.innerWidth - pad * 2);
    const availH = Math.max(140, window.innerHeight - this.reservedBottom - pad * 2);
    // Prefer a whole-number scale; fall back to a fractional one on tiny
    // screens, and on touch layouts where filling the display matters more.
    let scale = Math.min(availW / VIEW_W, availH / VIEW_H);
    if (scale >= 1 && !this.allowFractionalScale) scale = Math.floor(scale);
    this.scale = scale;
    this.cssW = Math.round(VIEW_W * scale);
    this.cssH = Math.round(VIEW_H * scale);

    this.frame.style.width = `${this.cssW}px`;
    this.frame.style.height = `${this.cssH}px`;
    // Centring happens in the space above the reserved band.
    const stage = this.frame.parentElement;
    if (stage) stage.style.paddingBottom = `${this.reservedBottom}px`;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.uiCanvas.width = Math.round(this.cssW * dpr);
    this.uiCanvas.height = Math.round(this.cssH * dpr);
    this.ui.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ui.imageSmoothingEnabled = false;

    this.game.imageSmoothingEnabled = false;
  };

  clearUi(): void {
    this.ui.save();
    this.ui.setTransform(1, 0, 0, 1, 0, 0);
    this.ui.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);
    this.ui.restore();
  }

  /** Converts a point in the 320x208 game buffer to UI-canvas CSS pixels. */
  toUi(v: number): number {
    return v * this.scale;
  }
}
