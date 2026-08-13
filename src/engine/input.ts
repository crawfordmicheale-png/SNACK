/**
 * Keyboard + pointer input with edge detection and a short press buffer so
 * attacks queued a few frames early still register.
 */

export type Action =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'attack'
  | 'item'
  | 'shield'
  | 'dash'
  | 'interact'
  | 'inventory'
  | 'map'
  | 'mastery'
  | 'pause'
  | 'confirm'
  | 'cancel'
  | 'slot1'
  | 'slot2'
  | 'slot3'
  | 'slot4';

const BINDINGS: Record<string, Action> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyJ: 'attack',
  Space: 'attack',
  KeyK: 'item',
  KeyL: 'shield',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyE: 'interact',
  Tab: 'inventory',
  KeyI: 'inventory',
  KeyM: 'map',
  KeyU: 'mastery',
  Escape: 'pause',
  Enter: 'confirm',
  Backspace: 'cancel',
  Digit1: 'slot1',
  Digit2: 'slot2',
  Digit3: 'slot3',
  Digit4: 'slot4',
};

/** Buffered presses stay "fresh" this long (seconds). */
const BUFFER_TIME = 0.14;

export class Input {
  private held = new Set<Action>();
  private pressedAt = new Map<Action, number>();
  private consumed = new Set<Action>();
  private releasedThisFrame = new Set<Action>();
  private time = 0;

  /** Pointer state in UI-canvas CSS pixels. */
  readonly pointer = { x: 0, y: 0, down: false, pressed: false, released: false, inside: false };
  private pointerDownRaw = false;
  /**
   * Press and release are latched from the DOM events rather than derived by
   * comparing frames, so a click that begins and ends inside a single frame
   * still registers.
   */
  private pressLatch = false;
  private releaseLatch = false;

  /** Set while any modal (menu, dialogue) wants raw text-ish navigation. */
  anyKeyPressed = false;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    target.addEventListener('pointermove', this.onPointerMove);
    target.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    target.addEventListener('pointerleave', this.onPointerLeave);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const action = BINDINGS[e.code];
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!action) return;
    if (e.repeat) return;
    this.anyKeyPressed = true;
    this.held.add(action);
    this.pressedAt.set(action, this.time);
    this.consumed.delete(action);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const action = BINDINGS[e.code];
    if (!action) return;
    this.held.delete(action);
    this.releasedThisFrame.add(action);
  };

  private onBlur = () => {
    this.held.clear();
    this.pointerDownRaw = false;
    this.pressLatch = false;
    this.releaseLatch = false;
  };

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.target.getBoundingClientRect();
    this.pointer.x = e.clientX - rect.left;
    this.pointer.y = e.clientY - rect.top;
    this.pointer.inside = true;
  };

  private onPointerDown = (e: PointerEvent) => {
    this.onPointerMove(e);
    this.pointerDownRaw = true;
    this.pressLatch = true;
  };

  private onPointerUp = () => {
    if (this.pointerDownRaw) this.releaseLatch = true;
    this.pointerDownRaw = false;
  };

  private onPointerLeave = () => {
    this.pointer.inside = false;
  };

  /** True while the action's key is held. */
  isDown(action: Action): boolean {
    return this.held.has(action);
  }

  /**
   * True if the action was pressed within the buffer window and not yet
   * consumed. Consuming clears it so one press fires exactly one response.
   */
  consumePress(action: Action): boolean {
    const at = this.pressedAt.get(action);
    if (at === undefined) return false;
    if (this.consumed.has(action)) return false;
    if (this.time - at > BUFFER_TIME) return false;
    this.consumed.add(action);
    return true;
  }

  /** Non-consuming variant, for UI that only needs to know about this frame. */
  wasPressed(action: Action): boolean {
    const at = this.pressedAt.get(action);
    return at !== undefined && !this.consumed.has(action) && this.time - at <= BUFFER_TIME;
  }

  wasReleased(action: Action): boolean {
    return this.releasedThisFrame.has(action);
  }

  /** Normalized movement vector from the four direction actions. */
  moveVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.isDown('left')) x -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('up')) y -= 1;
    if (this.isDown('down')) y += 1;
    if (x !== 0 && y !== 0) {
      const inv = Math.SQRT1_2;
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }

  /** Drops every buffered press — used when switching UI contexts. */
  flush(): void {
    this.pressedAt.clear();
    this.consumed.clear();
    this.releasedThisFrame.clear();
    this.pressLatch = false;
    this.releaseLatch = false;
  }

  beginFrame(dt: number): void {
    this.time += dt;
    // Latched flags survive until the frame that reads them ends, so a click
    // is never lost between two simulation steps.
    this.pointer.pressed = this.pressLatch;
    this.pointer.released = this.releaseLatch;
    this.pointer.down = this.pointerDownRaw || this.pressLatch;
  }

  endFrame(): void {
    this.releasedThisFrame.clear();
    this.anyKeyPressed = false;
  }

  /**
   * Clears the pointer latches. Called once per rendered frame, after the UI
   * has read them — several simulation steps may run inside one frame, and a
   * click must survive all of them.
   */
  endRender(): void {
    this.pressLatch = false;
    this.releaseLatch = false;
  }
}
