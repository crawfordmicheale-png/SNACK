/**
 * Fixed-timestep game loop. Updates run at a constant 1/60s so physics and
 * animation timings are deterministic; rendering happens once per frame.
 */

const STEP = 1 / 60;
/** Never simulate more than this much wall time in one frame (tab-switch guard). */
const MAX_FRAME = 0.25;

export class Loop {
  private raf = 0;
  private last = 0;
  private accumulator = 0;
  private running = false;

  /** Smoothed frames-per-second, for the debug overlay. */
  fps = 60;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: () => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    const elapsed = Math.min((now - this.last) / 1000, MAX_FRAME);
    this.last = now;
    if (elapsed > 0) this.fps += (1 / elapsed - this.fps) * 0.08;

    this.accumulator += elapsed;
    let steps = 0;
    while (this.accumulator >= STEP && steps < 5) {
      this.update(STEP);
      this.accumulator -= STEP;
      steps++;
    }
    // If we blew the step budget, drop the backlog rather than spiralling.
    if (this.accumulator > STEP * 5) this.accumulator = 0;

    this.render();
  };
}
