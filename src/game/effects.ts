/**
 * Transient visuals: particles, floating combat text, and screen shake.
 * None of these interact with gameplay, so they live outside the entity list.
 */
import { PAL, withAlpha } from '../art/palette';
import { clamp } from '../engine/math';
import { rng } from '../engine/rng';
import type { Gfx } from './entity';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Vertical offset above the ground, so debris can arc. */
  z: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  fade: boolean;
}

interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  /** Rendered on the crisp UI layer at this scale. */
  big: boolean;
}

export class Effects {
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private shake = 0;
  private shakeDecay = 6;
  /** Full-screen colour flash, e.g. when the player is hit. */
  private tint: { color: string; alpha: number; decay: number } | null = null;

  get shakeAmount(): number {
    return this.shake;
  }

  /** Current camera offset from shake, recomputed each frame. */
  shakeOffset(): { x: number; y: number } {
    if (this.shake <= 0.01) return { x: 0, y: 0 };
    return {
      x: (rng.next() * 2 - 1) * this.shake,
      y: (rng.next() * 2 - 1) * this.shake,
    };
  }

  addShake(amount: number, decay = 6): void {
    this.shake = Math.max(this.shake, amount);
    this.shakeDecay = decay;
  }

  flashScreen(color: string, alpha: number, decay = 3): void {
    this.tint = { color, alpha, decay };
  }

  burst(x: number, y: number, count: number, color: string, opts: { speed?: number; life?: number; size?: number; gravity?: number } = {}): void {
    const speed = opts.speed ?? 70;
    for (let i = 0; i < count; i++) {
      const a = rng.next() * Math.PI * 2;
      const s = speed * rng.range(0.35, 1);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * 0.6,
        z: 2,
        vz: rng.range(20, 70),
        life: opts.life ?? rng.range(0.28, 0.55),
        maxLife: opts.life ?? 0.5,
        size: opts.size ?? rng.int(1, 2),
        color,
        gravity: opts.gravity ?? 260,
        fade: true,
      });
    }
  }

  /** Directional spray, used for sword impacts. */
  spray(x: number, y: number, dx: number, dy: number, count: number, color: string): void {
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < count; i++) {
      const a = base + rng.range(-0.7, 0.7);
      const s = rng.range(50, 130);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * 0.7,
        z: 3,
        vz: rng.range(10, 50),
        life: rng.range(0.2, 0.4),
        maxLife: 0.4,
        size: rng.int(1, 2),
        color,
        gravity: 200,
        fade: true,
      });
    }
  }

  /** Rising motes, used for pickups and level-ups. */
  rise(x: number, y: number, count: number, color: string): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + rng.range(-6, 6),
        y,
        vx: rng.range(-8, 8),
        vy: 0,
        z: 0,
        vz: rng.range(24, 52),
        life: rng.range(0.5, 0.9),
        maxLife: 0.9,
        size: 1,
        color,
        gravity: -12,
        fade: true,
      });
    }
  }

  /** Dust ring left by dashes and heavy landings. */
  dust(x: number, y: number, count = 6): void {
    for (let i = 0; i < count; i++) {
      const a = rng.next() * Math.PI * 2;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * rng.range(14, 40),
        vy: Math.sin(a) * rng.range(6, 18),
        z: 1,
        vz: rng.range(2, 12),
        life: rng.range(0.22, 0.4),
        maxLife: 0.4,
        size: rng.int(1, 2),
        color: withAlpha(PAL.plaster, 0.7),
        gravity: 30,
        fade: true,
      });
    }
  }

  text(x: number, y: number, text: string, color: string = PAL.uiText, big = false): void {
    this.texts.push({ x, y, vy: -26, life: big ? 1.4 : 0.9, maxLife: big ? 1.4 : 0.9, text, color, big });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vz -= p.gravity * dt;
      p.z += p.vz * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz *= -0.3;
        p.vx *= 0.6;
        p.vy *= 0.6;
      }
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y += t.vy * dt;
      t.vy += 42 * dt;
    }

    if (this.shake > 0) {
      this.shake -= this.shakeDecay * dt * Math.max(1, this.shake);
      if (this.shake < 0.05) this.shake = 0;
    }

    if (this.tint) {
      this.tint.alpha -= this.tint.decay * dt;
      if (this.tint.alpha <= 0) this.tint = null;
    }
  }

  /** Particles draw on the pixel layer, beneath the UI. */
  drawParticles(g: Gfx): void {
    for (const p of this.particles) {
      const alpha = p.fade ? clamp(p.life / p.maxLife, 0, 1) : 1;
      g.ctx.globalAlpha = alpha;
      g.ctx.fillStyle = p.color;
      g.ctx.fillRect(Math.round(p.x - g.camX), Math.round(p.y - p.z - g.camY), p.size, p.size);
    }
    g.ctx.globalAlpha = 1;
  }

  drawTint(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.tint) return;
    ctx.save();
    ctx.globalAlpha = clamp(this.tint.alpha, 0, 1);
    ctx.fillStyle = this.tint.color;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /**
   * Floating text renders on the UI layer so it stays legible; positions are
   * supplied in game-buffer pixels and scaled by the caller.
   */
  drawTexts(ctx: CanvasRenderingContext2D, camX: number, camY: number, scale: number): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const alpha = clamp(t.life / t.maxLife, 0, 1);
      const size = (t.big ? 11 : 8) * scale;
      ctx.font = `700 ${size}px ui-monospace, Menlo, Consolas, monospace`;
      const x = (t.x - camX) * scale;
      const y = (t.y - camY) * scale;
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = PAL.black;
      ctx.fillText(t.text, x + Math.max(1, scale * 0.5), y + Math.max(1, scale * 0.5));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.particles.length = 0;
    this.texts.length = 0;
    this.shake = 0;
    this.tint = null;
  }
}
