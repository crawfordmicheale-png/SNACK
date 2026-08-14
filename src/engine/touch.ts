/**
 * On-screen controls for touch devices.
 *
 * Rendered on a full-viewport overlay rather than inside the 320x208 game
 * buffer, so the thumbstick and buttons can sit in the letterboxing beside the
 * picture instead of covering it.
 *
 * The overlay itself is `pointer-events: none`; input arrives through
 * capture-phase window listeners. A touch that lands on a control is claimed
 * and its propagation stopped, so it never also reaches the UI canvas
 * underneath. Anything else falls through untouched, which is what lets the
 * satchel keep its drag-and-drop.
 */
import type { Art } from '../art';
import type { IconName } from '../art/icons';
import { PAL, withAlpha } from '../art/palette';
import { clamp } from './math';
import type { Action, Input } from './input';

/** What the player is currently looking at, which decides what to show. */
export type TouchMode = 'play' | 'menu' | 'dialogue' | 'overlay';

interface TouchButton {
  action: Action;
  /** Short text drawn when there is no icon. */
  label: string;
  icon: IconName | null;
  x: number;
  y: number;
  r: number;
  /** Pointer currently holding it down, or null. */
  pointer: number | null;
  /** Hidden unless this returns true. */
  visible: boolean;
}

const IDLE_ALPHA = 0.34;
const HELD_ALPHA = 0.72;

export class TouchControls {
  /** True once we believe this is a touch device. */
  enabled = false;
  /** Set by the host each frame. */
  mode: TouchMode = 'play';
  /** Whether the dash button should be offered (mastery-gated). */
  showDash = false;
  /** Icon for the item button, mirroring quick slot 1. */
  itemIcon: IconName | null = null;

  /** Called when the layout changes so the presentation can re-fit. */
  onLayoutChange: (() => void) | null = null;
  /** Called when the close button is tapped. */
  onClose: (() => void) | null = null;

  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;

  private buttons: TouchButton[] = [];
  private closeButton = { x: 0, y: 0, r: 0, pointer: null as number | null };

  /** Floating thumbstick state. */
  private stick = {
    pointer: null as number | null,
    homeX: 0,
    homeY: 0,
    originX: 0,
    originY: 0,
    knobX: 0,
    knobY: 0,
    radius: 60,
  };

  /** Pointer used for tap-to-advance in dialogue and full-screen overlays. */
  private tapPointer: number | null = null;

  /**
   * Seconds left on the "turn your phone" nudge. A 20x13 picture is always
   * width-bound in portrait, so landscape is genuinely a much bigger view —
   * but the hint says so once and then gets out of the way.
   */
  private rotateHint = 14;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly input: Input,
    private readonly art: Art,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('touch overlay needs a 2D context');
    this.ctx = ctx;

    this.buttons = [
      { action: 'attack', label: 'A', icon: 'sword1', x: 0, y: 0, r: 0, pointer: null, visible: true },
      { action: 'item', label: 'B', icon: null, x: 0, y: 0, r: 0, pointer: null, visible: true },
      { action: 'shield', label: 'G', icon: 'shield2', x: 0, y: 0, r: 0, pointer: null, visible: true },
      { action: 'interact', label: 'E', icon: null, x: 0, y: 0, r: 0, pointer: null, visible: true },
      { action: 'dash', label: 'DASH', icon: null, x: 0, y: 0, r: 0, pointer: null, visible: false },
      { action: 'inventory', label: 'BAG', icon: null, x: 0, y: 0, r: 0, pointer: null, visible: true },
    ];

    // A coarse pointer is a strong hint, but a real touch is proof.
    this.enabled = window.matchMedia?.('(pointer: coarse)').matches ?? false;

    window.addEventListener('pointerdown', this.onPointerDown, { capture: true, passive: false });
    window.addEventListener('pointermove', this.onPointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', this.onPointerUp, { capture: true });
    window.addEventListener('pointercancel', this.onPointerUp, { capture: true });
    window.addEventListener('resize', this.layout);
    window.addEventListener('orientationchange', this.layout);
    this.layout();
  }

  /** Vertical space the controls need reserved beneath the picture. */
  get reservedHeight(): number {
    if (!this.enabled) return 0;
    // In landscape the controls sit beside the picture, so nothing is reserved.
    return this.h > this.w ? Math.round(this.stick.radius * 3.1) : 0;
  }

  private unit(): number {
    return clamp(Math.min(this.w, this.h) * 0.115, 38, 74);
  }

  layout = (): void => {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;

    const u = this.unit();
    const portrait = this.h > this.w;
    // Keep clear of rounded corners and home indicators.
    const inset = portrait ? u * 0.7 : u * 0.55;

    this.stick.radius = u * 1.05;
    this.stick.homeX = inset + this.stick.radius;
    this.stick.homeY = this.h - inset - this.stick.radius;
    if (this.stick.pointer === null) this.resetStick();

    const br = u * 0.6;
    const cx = this.w - inset - br;
    const cy = this.h - inset - br;
    // Diamond cluster, with the sword under the resting thumb.
    const place: Record<string, [number, number]> = {
      attack: [cx, cy],
      item: [cx - br * 2.1, cy - br * 0.35],
      shield: [cx - br * 0.35, cy - br * 2.1],
      interact: [cx - br * 2.3, cy - br * 2.3],
      dash: [cx - br * 4.3, cy - br * 0.7],
      inventory: [this.w - inset - br * 0.8, inset + br * 0.8],
    };

    for (const button of this.buttons) {
      const [x, y] = place[button.action] ?? [0, 0];
      button.x = x;
      button.y = y;
      button.r = button.action === 'inventory' ? br * 0.8 : button.action === 'dash' ? br * 0.75 : br;
    }

    this.closeButton.r = br * 0.85;
    this.closeButton.x = this.w - inset - this.closeButton.r;
    this.closeButton.y = inset + this.closeButton.r;

    this.onLayoutChange?.();
  };

  private resetStick(): void {
    this.stick.originX = this.stick.homeX;
    this.stick.originY = this.stick.homeY;
    this.stick.knobX = this.stick.homeX;
    this.stick.knobY = this.stick.homeY;
  }

  /** Buttons on show for the current mode. */
  private activeButtons(): TouchButton[] {
    if (this.mode !== 'play') return [];
    return this.buttons.filter((b) => (b.action === 'dash' ? this.showDash : true));
  }

  private hitButton(x: number, y: number): TouchButton | null {
    for (const button of this.activeButtons()) {
      // Generous hit radius; the drawn circle is the smaller, honest one.
      if (Math.hypot(x - button.x, y - button.y) <= button.r * 1.28) return button;
    }
    return null;
  }

  private inStickZone(x: number, y: number): boolean {
    if (this.mode !== 'play') return false;
    return x < this.w * 0.5 && y > this.h * 0.42;
  }

  private showsClose(): boolean {
    return this.mode === 'menu';
  }

  // -------------------------------------------------------------------------
  // Pointer handling
  // -------------------------------------------------------------------------

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') this.enabled = true;
    if (!this.enabled) return;

    const x = e.clientX;
    const y = e.clientY;

    if (this.showsClose() && Math.hypot(x - this.closeButton.x, y - this.closeButton.y) <= this.closeButton.r * 1.3) {
      this.closeButton.pointer = e.pointerId;
      this.claim(e);
      this.onClose?.();
      return;
    }

    const button = this.hitButton(x, y);
    if (button) {
      button.pointer = e.pointerId;
      this.input.pressVirtual(button.action);
      this.claim(e);
      return;
    }

    if (this.inStickZone(x, y) && this.stick.pointer === null) {
      // The stick materialises wherever the thumb lands.
      this.stick.pointer = e.pointerId;
      this.stick.originX = x;
      this.stick.originY = y;
      this.stick.knobX = x;
      this.stick.knobY = y;
      this.claim(e);
      return;
    }

    // A tap anywhere advances text and dismisses full-screen cards.
    if ((this.mode === 'dialogue' || this.mode === 'overlay') && this.tapPointer === null) {
      this.tapPointer = e.pointerId;
      this.input.pressVirtual('confirm');
      this.claim(e);
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (e.pointerId !== this.stick.pointer) return;

    const dx = e.clientX - this.stick.originX;
    const dy = e.clientY - this.stick.originY;
    const len = Math.hypot(dx, dy);
    const max = this.stick.radius;
    const clamped = Math.min(len, max);
    const nx = len > 0 ? dx / len : 0;
    const ny = len > 0 ? dy / len : 0;

    this.stick.knobX = this.stick.originX + nx * clamped;
    this.stick.knobY = this.stick.originY + ny * clamped;

    // A short dead zone keeps a resting thumb from creeping.
    const magnitude = clamp((clamped / max - 0.12) / 0.68, 0, 1);
    this.input.setVirtualAxis(nx * magnitude, ny * magnitude);
    this.claim(e);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.enabled) return;

    if (e.pointerId === this.stick.pointer) {
      this.stick.pointer = null;
      this.resetStick();
      this.input.setVirtualAxis(0, 0);
    }
    if (e.pointerId === this.closeButton.pointer) this.closeButton.pointer = null;
    if (e.pointerId === this.tapPointer) {
      this.tapPointer = null;
      this.input.releaseVirtual('confirm');
    }
    for (const button of this.buttons) {
      if (button.pointer === e.pointerId) {
        button.pointer = null;
        this.input.releaseVirtual(button.action);
      }
    }
  };

  private claim(e: PointerEvent): void {
    // Capture phase + stopPropagation keeps the UI canvas from also reacting.
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
  }

  /** Advances the hint timer. Called once per frame by the host. */
  tick(dt: number): void {
    if (this.rotateHint > 0 && this.enabled && this.h > this.w && this.mode === 'play') {
      this.rotateHint -= dt;
    }
  }

  /** Drops held controls, e.g. when the mode changes underneath a finger. */
  releaseAll(): void {
    this.stick.pointer = null;
    this.tapPointer = null;
    this.resetStick();
    for (const button of this.buttons) button.pointer = null;
    this.input.clearVirtual();
  }

  /** Control geometry in CSS pixels, for the touch smoke test. */
  debugLayout() {
    return {
      enabled: this.enabled,
      mode: this.mode,
      reserved: this.reservedHeight,
      stick: { x: this.stick.homeX, y: this.stick.homeY, r: this.stick.radius },
      close: { x: this.closeButton.x, y: this.closeButton.y, r: this.closeButton.r },
      buttons: this.buttons.map((b) => ({ action: b.action, x: b.x, y: b.y, r: b.r })),
    };
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  draw(): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.enabled) return;

    if (this.showsClose()) {
      this.drawCircle(this.closeButton.x, this.closeButton.y, this.closeButton.r, this.closeButton.pointer !== null);
      this.drawGlyph('CLOSE', this.closeButton.x, this.closeButton.y, this.closeButton.r * 0.42);
      return;
    }

    if (this.mode !== 'play') return;

    this.drawRotateHint();
    this.drawStick();
    for (const button of this.activeButtons()) {
      const held = button.pointer !== null;
      this.drawCircle(button.x, button.y, button.r, held);
      const icon = button.action === 'item' ? this.itemIcon : button.icon;
      if (icon) {
        const size = button.r * 1.05;
        ctx.globalAlpha = held ? 1 : 0.9;
        ctx.drawImage(this.art.icons.get(icon), button.x - size / 2, button.y - size / 2, size, size);
        ctx.globalAlpha = 1;
      } else {
        this.drawGlyph(button.label, button.x, button.y, button.r * (button.label.length > 1 ? 0.42 : 0.72));
      }
    }
  }

  /** Sits in the empty band between the picture and the controls. */
  private drawRotateHint(): void {
    if (this.rotateHint <= 0 || this.h <= this.w) return;
    const { ctx } = this;
    const alpha = clamp(this.rotateHint / 2.5, 0, 1) * 0.75;
    const y = this.h - this.stick.radius * 3.1 - 18;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${Math.round(this.unit() * 0.3)}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PAL.uiTextDim;
    ctx.fillText('Turn your phone sideways for a bigger view', this.w / 2, y);
    ctx.restore();
  }

  private drawStick(): void {
    const { ctx } = this;
    const active = this.stick.pointer !== null;

    ctx.globalAlpha = active ? 0.5 : IDLE_ALPHA;
    ctx.fillStyle = PAL.uiPanel;
    ctx.beginPath();
    ctx.arc(this.stick.originX, this.stick.originY, this.stick.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = withAlpha(PAL.uiEdgeBright, 0.8);
    ctx.stroke();

    ctx.globalAlpha = active ? 0.95 : 0.55;
    ctx.fillStyle = PAL.uiPanelLight;
    ctx.beginPath();
    ctx.arc(this.stick.knobX, this.stick.knobY, this.stick.radius * 0.44, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = active ? PAL.uiAccent : withAlpha(PAL.uiEdgeBright, 0.9);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawCircle(x: number, y: number, r: number, held: boolean): void {
    const { ctx } = this;
    ctx.globalAlpha = held ? HELD_ALPHA : IDLE_ALPHA;
    ctx.fillStyle = held ? PAL.uiAccent : PAL.uiPanel;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = held ? 1 : 0.75;
    ctx.lineWidth = 2;
    ctx.strokeStyle = held ? PAL.uiAccent : withAlpha(PAL.uiEdgeBright, 0.85);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawGlyph(label: string, x: number, y: number, size: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.font = `700 ${size}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = withAlpha(PAL.black, 0.6);
    ctx.fillText(label, x + 1, y + 1);
    ctx.fillStyle = PAL.uiText;
    ctx.fillText(label, x, y);
    ctx.restore();
  }
}
