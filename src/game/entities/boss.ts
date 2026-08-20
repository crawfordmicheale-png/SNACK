/**
 * Thornmaw, Root of the Hollow, and the Warden mini-boss that guards the
 * boomerang. Both are phase machines: they telegraph, commit, then expose a
 * window where they can actually be hurt.
 */
import { PAL, withAlpha } from '../../art/palette';
import { clamp, dist, rectsOverlap, vectorToDir, type Rect } from '../../engine/math';
import { rng } from '../../engine/rng';
import { Entity, moveWithCollision, type Gfx } from '../entity';
import type { Scene } from '../scene';
import { createEnemy, Enemy } from './enemies';
import { EnemyShot } from './projectiles';
import { VIEW_H, VIEW_W } from '../../engine/screen';

type BossPhase = 'dormant' | 'idle' | 'wind' | 'spit' | 'vulnerable' | 'summon' | 'enraged' | 'dying';

export class Thornmaw extends Entity {
  private phase: BossPhase = 'dormant';
  private timer = 0;
  private cycle = 0;
  spawnIndex = -1;
  /** Set once the intro has played, so re-entering does not replay it. */
  private introDone = false;
  private minions: Enemy[] = [];

  constructor(x: number, y: number) {
    super();
    this.x = x;
    this.y = y;
    this.team = 'enemy';
    this.w = 34;
    this.h = 26;
    this.maxHp = 60;
    this.hp = this.maxHp;
    this.solidBody = true;
  }

  /** Only the exposed eye can be damaged. */
  override hurtbox(): Rect {
    if (this.phase === 'vulnerable' || this.phase === 'enraged') {
      return { x: this.x - 16, y: this.y - 40, w: 32, h: 30 };
    }
    // A tiny box that nothing realistically reaches while clamped shut.
    return { x: this.x - 2, y: this.y - 2, w: 1, h: 1 };
  }

  private get enraged(): boolean {
    return this.hp <= this.maxHp * 0.4;
  }

  override takeDamage(amount: number, scene: Scene, fromX?: number, fromY?: number): boolean {
    if (this.phase !== 'vulnerable' && this.phase !== 'enraged') {
      // Ping off the shell so the player learns the timing.
      scene.audio.play('block');
      scene.effects.burst(fromX ?? this.x, (fromY ?? this.y) - 10, 6, PAL.plantLight, { speed: 70, life: 0.3 });
      return false;
    }
    const landed = super.takeDamage(amount, scene, fromX, fromY, 0);
    if (landed) {
      // The boss is rooted; knockback only shakes the screen.
      this.kx = 0;
      this.ky = 0;
      scene.effects.addShake(3);
      scene.effects.burst(this.x, this.y - 26, 10, PAL.bloodLight, { speed: 100, life: 0.4 });
      if (!this.dead) {
        this.phase = 'idle';
        this.timer = this.enraged ? 0.5 : 0.9;
      }
    }
    return landed;
  }

  protected override onDeath(scene: Scene): void {
    scene.onBossKilled(this);
  }

  override update(dt: number, scene: Scene): void {
    this.tickCommon(dt);
    this.timer -= dt;
    this.minions = this.minions.filter((m) => !m.dead);

    const player = scene.player;

    if (this.phase === 'dormant') {
      if (dist(this.x, this.y, player.x, player.y) < 110) {
        this.phase = 'idle';
        this.timer = 1.2;
        if (!this.introDone) {
          this.introDone = true;
          scene.audio.play('secret');
          scene.effects.addShake(6);
          scene.showBanner('THORNMAW', 'Root of the Hollow');
        }
      }
      return;
    }

    // Contact damage from the thrashing petals.
    if (!player.dead && rectsOverlap({ x: this.x - 20, y: this.y - 34, w: 40, h: 34 }, player.hurtbox())) {
      player.takeDamage(2, scene, this.x, this.y, 240);
    }

    switch (this.phase) {
      case 'idle':
        if (this.timer <= 0) {
          this.cycle++;
          // Every third cycle calls for help instead of attacking.
          this.phase = this.cycle % 3 === 0 ? 'summon' : 'wind';
          this.timer = this.phase === 'summon' ? 0.7 : 0.6;
        }
        break;

      case 'wind':
        if (this.timer <= 0) {
          this.phase = 'spit';
          this.timer = this.enraged ? 1.5 : 1.0;
        }
        break;

      case 'spit': {
        // Rotating spray of seeds while the maw is open and dangerous.
        if (rng.chance(dt * (this.enraged ? 26 : 16))) {
          const a = this.animTime * (this.enraged ? 3.4 : 2.2) + rng.range(-0.2, 0.2);
          scene.spawn(new EnemyShot(this.x, this.y - 22, Math.cos(a), Math.sin(a), 2, 'seed', this.enraged ? 128 : 104));
        }
        if (this.timer <= 0) {
          this.phase = this.enraged ? 'enraged' : 'vulnerable';
          this.timer = this.enraged ? 2.6 : 2.2;
          scene.audio.play('hurt');
        }
        break;
      }

      case 'vulnerable':
      case 'enraged':
        if (this.phase === 'enraged' && rng.chance(dt * 5)) {
          const a = rng.next() * Math.PI * 2;
          scene.spawn(new EnemyShot(this.x, this.y - 22, Math.cos(a), Math.sin(a), 2, 'seed', 96));
        }
        if (this.timer <= 0) {
          this.phase = 'idle';
          this.timer = this.enraged ? 0.6 : 1.0;
        }
        break;

      case 'summon': {
        if (this.timer <= 0) {
          if (this.minions.length < 4) {
            for (let i = 0; i < (this.enraged ? 3 : 2); i++) {
              const a = rng.next() * Math.PI * 2;
              const m = createEnemy(rng.chance(0.5) ? 'keese' : 'thornling', this.x + Math.cos(a) * 46, this.y + Math.sin(a) * 34);
              this.minions.push(m);
              scene.spawn(m);
              scene.effects.burst(m.x, m.y - 8, 8, PAL.plantLight, { speed: 70 });
            }
            scene.audio.play('charge');
          }
          this.phase = 'idle';
          this.timer = 1.0;
        }
        break;
      }

      case 'dying':
        break;
    }
  }

  override draw(g: Gfx): void {
    const art = g.art.actors.boss;
    const open = this.phase === 'vulnerable' || this.phase === 'enraged' || this.phase === 'spit';
    const set = this.flash > 0 ? art.hurt : open ? art.open : art.idle;
    const frame = set[Math.floor(this.animTime * (this.enraged ? 8 : 4)) % set.length];

    this.drawShadow(g, 40);

    // A wind-up shudder telegraphs the spit.
    const shudder = this.phase === 'wind' ? Math.sin(this.animTime * 40) * 1.6 : 0;
    const dx = Math.round(this.x - g.camX + art.ox + shudder);
    const dy = Math.round(this.y - g.camY + art.oy);
    g.ctx.drawImage(frame, dx, dy);

    if (this.flash > 0) {
      g.ctx.save();
      g.ctx.globalCompositeOperation = 'lighter';
      g.ctx.globalAlpha = clamp(this.flash * 5, 0, 0.8);
      g.ctx.drawImage(frame, dx, dy);
      g.ctx.restore();
    }

    // Glow while the eye is open, to read the damage window from across the room.
    if (open) {
      g.ctx.save();
      g.ctx.globalAlpha = 0.22 + Math.sin(g.time * 9) * 0.08;
      g.ctx.fillStyle = withAlpha(PAL.bloodLight, 1);
      g.ctx.beginPath();
      g.ctx.ellipse(this.x - g.camX, this.y - g.camY - 24, 16, 14, 0, 0, Math.PI * 2);
      g.ctx.fill();
      g.ctx.restore();
    }
  }

  /** Fraction of health remaining, for the boss bar. */
  healthFraction(): number {
    return clamp(this.hp / this.maxHp, 0, 1);
  }

  get isAwake(): boolean {
    return this.phase !== 'dormant';
  }
}

// ---------------------------------------------------------------------------

/**
 * The Warden: a heavy stalfos that alternates between a shielded advance and
 * a telegraphed lunge, leaving it open just after it commits.
 */
export class Warden extends Enemy {
  private state: 'stalk' | 'wind' | 'lunge' | 'stagger' = 'stalk';
  private timer = 1.2;
  private lungeX = 0;
  private lungeY = 0;

  constructor(x: number, y: number) {
    super('stalfos', x, y);
    this.w = 16;
    this.h = 14;
    this.maxHp = 26;
    this.hp = this.maxHp;
  }

  /** Plated while it advances; wide open for a beat after each lunge. */
  protected override armorValue(): number {
    return this.state === 'stagger' ? 0 : 2;
  }

  protected override damageMultiplier(): number {
    return this.state === 'stagger' ? 2 : 1;
  }

  override update(dt: number, scene: Scene): void {
    this.baseUpdate(dt, scene);
    if (this.stun > 0) return;
    this.timer -= dt;

    const player = scene.player;
    switch (this.state) {
      case 'stalk':
        this.chase(dt, scene, 34);
        if (this.timer <= 0 && dist(this.x, this.y, player.x, player.y) < 110) {
          this.state = 'wind';
          this.timer = 0.6;
          scene.audio.play('charge');
        } else if (this.timer <= 0) {
          this.timer = 0.8;
        }
        break;

      case 'wind': {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const len = Math.hypot(dx, dy) || 1;
        this.lungeX = dx / len;
        this.lungeY = dy / len;
        if (this.timer <= 0) {
          this.state = 'lunge';
          this.timer = 0.45;
          scene.effects.dust(this.x, this.y, 8);
        }
        break;
      }

      case 'lunge': {
        const res = moveWithCollision(this, this.lungeX * 300 * dt, this.lungeY * 300 * dt, scene);
        if (res.hitX || res.hitY || this.timer <= 0) {
          this.state = 'stagger';
          this.timer = 1.1;
          scene.effects.addShake(2.5);
          scene.effects.dust(this.x, this.y, 10);
        }
        break;
      }

      case 'stagger':
        if (this.timer <= 0) {
          this.state = 'stalk';
          this.timer = 0.9;
        }
        break;
    }
  }

  override draw(g: Gfx): void {
    const anim = g.art.actors.stalfos.idle;
    const frames = anim.frames[this.facing] ?? anim.frames.down;
    const frame = frames[Math.floor(this.animTime * (this.state === 'lunge' ? 14 : 5)) % frames.length];

    this.drawShadow(g, 20);
    const wind = this.state === 'wind' ? Math.sin(this.animTime * 44) * 1.4 : 0;
    const dx = Math.round(this.x - g.camX + anim.ox * 1.5 + wind);
    const dy = Math.round(this.y - g.camY + anim.oy * 1.5);

    // Drawn at 1.5x to read as a heavier version of the regular skeleton.
    g.ctx.save();
    g.ctx.imageSmoothingEnabled = false;
    g.ctx.drawImage(frame, dx, dy, frame.width * 1.5, frame.height * 1.5);
    if (this.flash > 0) {
      g.ctx.globalCompositeOperation = 'lighter';
      g.ctx.globalAlpha = clamp(this.flash * 5, 0, 0.85);
      g.ctx.drawImage(frame, dx, dy, frame.width * 1.5, frame.height * 1.5);
    }
    g.ctx.restore();

    if (this.state === 'stagger') {
      g.ctx.save();
      g.ctx.globalAlpha = 0.3 + Math.sin(g.time * 12) * 0.12;
      g.ctx.fillStyle = PAL.uiBad;
      g.ctx.beginPath();
      g.ctx.ellipse(this.x - g.camX, this.y - g.camY - 14, 12, 10, 0, 0, Math.PI * 2);
      g.ctx.fill();
      g.ctx.restore();
    }
  }

  /** Warden death is handled as a mini-boss by the scene. */
  protected override onDeath(scene: Scene): void {
    scene.onMinibossKilled(this);
  }
}

// ---------------------------------------------------------------------------

/**
 * Bellwight: a drowned warden. Teleports in a ring of motes, then hangs
 * visible and open just long enough to cut.
 */
export class Bellwight extends Enemy {
  private state: 'drift' | 'vanish' | 'appear' | 'volley' | 'open' = 'drift';
  private timer = 1.4;

  constructor(x: number, y: number) {
    super('wisp', x, y);
    this.w = 14;
    this.h = 14;
    this.maxHp = 30;
    this.hp = this.maxHp;
    this.solidBody = false;
    this.z = 8;
  }

  protected override armorValue(): number {
    return this.state === 'open' ? 0 : 3;
  }

  protected override damageMultiplier(): number {
    return this.state === 'open' ? 1.8 : 1;
  }

  override takeDamage(amount: number, scene: Scene, fromX?: number, fromY?: number, force = 120): boolean {
    if (this.state === 'vanish') {
      scene.audio.play('block');
      scene.effects.burst(this.x, this.y - 12, 5, PAL.wispLight, { speed: 60, life: 0.25 });
      return false;
    }
    return super.takeDamage(amount, scene, fromX, fromY, force);
  }

  override update(dt: number, scene: Scene): void {
    this.baseUpdate(dt, scene);
    if (this.stun > 0 && this.state !== 'vanish') return;
    this.timer -= dt;
    this.z = 8 + Math.sin(this.animTime * 4) * 3;

    const player = scene.player;

    switch (this.state) {
      case 'drift':
        this.chase(dt, scene, 28, 0.2);
        if (this.timer <= 0) {
          this.state = 'vanish';
          this.timer = 0.45;
          scene.audio.play('charge');
          scene.effects.burst(this.x, this.y - 10, 12, PAL.wisp, { speed: 90, life: 0.4 });
        }
        break;

      case 'vanish':
        if (this.timer <= 0) {
          const a = rng.next() * Math.PI * 2;
          const nx = player.x + Math.cos(a) * rng.range(40, 70);
          const ny = player.y + Math.sin(a) * rng.range(30, 55);
          const room = scene.activeRoom;
          if (room) {
            const ox = room.rx * 320;
            const oy = room.ry * 208;
            this.x = clamp(nx, ox + 32, ox + VIEW_W - 32);
            this.y = clamp(ny, oy + 32, oy + VIEW_H - 32);
          } else {
            this.x = nx;
            this.y = ny;
          }
          this.kx = 0;
          this.ky = 0;
          this.state = 'appear';
          this.timer = 0.35;
          scene.effects.burst(this.x, this.y - 10, 12, PAL.foam, { speed: 90, life: 0.4 });
        }
        break;

      case 'appear':
        if (this.timer <= 0) {
          this.state = 'volley';
          this.timer = 0.9;
        }
        break;

      case 'volley': {
        if (rng.chance(dt * 8)) {
          const a = Math.atan2(player.y - this.y, player.x - this.x) + rng.range(-0.25, 0.25);
          scene.spawn(new EnemyShot(this.x, this.y - 14, Math.cos(a), Math.sin(a), 2, 'bolt', 110));
        }
        if (this.timer <= 0) {
          this.state = 'open';
          this.timer = 1.4;
          scene.audio.play('hurt');
        }
        break;
      }

      case 'open':
        if (this.timer <= 0) {
          this.state = 'drift';
          this.timer = 1.1;
        }
        break;
    }
  }

  override draw(g: Gfx): void {
    const anim = g.art.actors.wisp.idle;
    const frames = anim.frames.down;
    const frame = frames[Math.floor(this.animTime * 10) % frames.length];
    const hidden = this.state === 'vanish';
    this.drawShadow(g, hidden ? 8 : 16);
    const dx = Math.round(this.x - g.camX + anim.ox * 1.6);
    const dy = Math.round(this.y - g.camY + anim.oy * 1.6);
    g.ctx.save();
    g.ctx.imageSmoothingEnabled = false;
    g.ctx.globalAlpha = hidden ? 0.2 : 1;
    g.ctx.drawImage(frame, dx, dy, frame.width * 1.6, frame.height * 1.6);
    if (this.flash > 0) {
      g.ctx.globalCompositeOperation = 'lighter';
      g.ctx.globalAlpha = clamp(this.flash * 5, 0, 0.85);
      g.ctx.drawImage(frame, dx, dy, frame.width * 1.6, frame.height * 1.6);
    }
    g.ctx.restore();

    if (this.state === 'open') {
      g.ctx.save();
      g.ctx.globalAlpha = 0.3 + Math.sin(g.time * 11) * 0.12;
      g.ctx.fillStyle = PAL.uiBad;
      g.ctx.beginPath();
      g.ctx.ellipse(this.x - g.camX, this.y - g.camY - 14, 12, 11, 0, 0, Math.PI * 2);
      g.ctx.fill();
      g.ctx.restore();
    }
  }

  protected override onDeath(scene: Scene): void {
    scene.onBellwightKilled(this);
  }
}

// ---------------------------------------------------------------------------

type TidePhase = 'dormant' | 'idle' | 'wind' | 'ring' | 'vulnerable' | 'summon' | 'enraged';

/** Tideheart, the drowned bell that the Hollow Root was feeding. */
export class Tideheart extends Entity {
  private phase: TidePhase = 'dormant';
  private timer = 0;
  private cycle = 0;
  spawnIndex = -1;
  private introDone = false;
  private minions: Enemy[] = [];

  constructor(x: number, y: number) {
    super();
    this.x = x;
    this.y = y;
    this.team = 'enemy';
    this.w = 34;
    this.h = 26;
    this.maxHp = 72;
    this.hp = this.maxHp;
    this.solidBody = true;
  }

  override hurtbox(): Rect {
    if (this.phase === 'vulnerable' || this.phase === 'enraged') {
      return { x: this.x - 16, y: this.y - 40, w: 32, h: 30 };
    }
    return { x: this.x - 2, y: this.y - 2, w: 1, h: 1 };
  }

  private get enraged(): boolean {
    return this.hp <= this.maxHp * 0.4;
  }

  override takeDamage(amount: number, scene: Scene, fromX?: number, fromY?: number): boolean {
    if (this.phase !== 'vulnerable' && this.phase !== 'enraged') {
      scene.audio.play('block');
      scene.effects.burst(fromX ?? this.x, (fromY ?? this.y) - 10, 6, PAL.foam, { speed: 70, life: 0.3 });
      return false;
    }
    const landed = super.takeDamage(amount, scene, fromX, fromY, 0);
    if (landed) {
      this.kx = 0;
      this.ky = 0;
      scene.effects.addShake(3);
      scene.effects.burst(this.x, this.y - 26, 10, PAL.waterLight, { speed: 100, life: 0.4 });
      if (!this.dead) {
        this.phase = 'idle';
        this.timer = this.enraged ? 0.45 : 0.85;
      }
    }
    return landed;
  }

  protected override onDeath(scene: Scene): void {
    scene.onTideheartKilled(this);
  }

  override update(dt: number, scene: Scene): void {
    this.tickCommon(dt);
    this.timer -= dt;
    this.minions = this.minions.filter((m) => !m.dead);

    const player = scene.player;

    if (this.phase === 'dormant') {
      if (dist(this.x, this.y, player.x, player.y) < 110) {
        this.phase = 'idle';
        this.timer = 1.2;
        if (!this.introDone) {
          this.introDone = true;
          scene.audio.play('secret');
          scene.effects.addShake(6);
          scene.showBanner('TIDEHEART', 'The Drowned Bell');
        }
      }
      return;
    }

    if (!player.dead && rectsOverlap({ x: this.x - 20, y: this.y - 34, w: 40, h: 34 }, player.hurtbox())) {
      player.takeDamage(2, scene, this.x, this.y, 240);
    }

    switch (this.phase) {
      case 'idle':
        if (this.timer <= 0) {
          this.cycle++;
          this.phase = this.cycle % 3 === 0 ? 'summon' : 'wind';
          this.timer = this.phase === 'summon' ? 0.7 : 0.55;
        }
        break;

      case 'wind':
        if (this.timer <= 0) {
          this.fireRing(scene, this.enraged ? 10 : 8);
          this.phase = 'ring';
          this.timer = this.enraged ? 1.1 : 0.85;
          scene.audio.play('charge');
        }
        break;

      case 'ring':
        if (this.enraged && this.timer < 0.45 && this.timer + dt >= 0.45) {
          this.fireRing(scene, 8, 0.4);
        }
        if (this.timer <= 0) {
          this.phase = this.enraged ? 'enraged' : 'vulnerable';
          this.timer = this.enraged ? 2.4 : 2.1;
          scene.audio.play('hurt');
        }
        break;

      case 'vulnerable':
      case 'enraged':
        if (this.phase === 'enraged' && rng.chance(dt * 4)) {
          const a = rng.next() * Math.PI * 2;
          scene.spawn(new EnemyShot(this.x, this.y - 22, Math.cos(a), Math.sin(a), 2, 'bolt', 90));
        }
        if (this.timer <= 0) {
          this.phase = 'idle';
          this.timer = this.enraged ? 0.55 : 0.95;
        }
        break;

      case 'summon': {
        if (this.timer <= 0) {
          if (this.minions.length < 4) {
            for (let i = 0; i < (this.enraged ? 3 : 2); i++) {
              const a = rng.next() * Math.PI * 2;
              const kind = rng.chance(0.5) ? 'crab' : 'wisp';
              const m = createEnemy(kind, this.x + Math.cos(a) * 46, this.y + Math.sin(a) * 34);
              this.minions.push(m);
              scene.spawn(m);
              scene.effects.burst(m.x, m.y - 8, 8, PAL.foam, { speed: 70 });
            }
            scene.audio.play('charge');
          }
          this.phase = 'idle';
          this.timer = 1.0;
        }
        break;
      }
    }
  }

  override draw(g: Gfx): void {
    const art = g.art.actors.tideheart;
    const open = this.phase === 'vulnerable' || this.phase === 'enraged' || this.phase === 'ring';
    const set = this.flash > 0 ? art.hurt : open ? art.open : art.idle;
    const frame = set[Math.floor(this.animTime * (this.enraged ? 8 : 4)) % set.length];

    this.drawShadow(g, 40);
    const shudder = this.phase === 'wind' ? Math.sin(this.animTime * 40) * 1.6 : 0;
    const dx = Math.round(this.x - g.camX + art.ox + shudder);
    const dy = Math.round(this.y - g.camY + art.oy);
    g.ctx.drawImage(frame, dx, dy);

    if (this.flash > 0) {
      g.ctx.save();
      g.ctx.globalCompositeOperation = 'lighter';
      g.ctx.globalAlpha = clamp(this.flash * 5, 0, 0.8);
      g.ctx.drawImage(frame, dx, dy);
      g.ctx.restore();
    }

    if (open) {
      g.ctx.save();
      g.ctx.globalAlpha = 0.22 + Math.sin(g.time * 9) * 0.08;
      g.ctx.fillStyle = withAlpha(PAL.foam, 1);
      g.ctx.beginPath();
      g.ctx.ellipse(this.x - g.camX, this.y - g.camY - 24, 16, 14, 0, 0, Math.PI * 2);
      g.ctx.fill();
      g.ctx.restore();
    }
  }

  private fireRing(scene: Scene, count: number, offset = 0): void {
    const base = this.animTime + offset;
    for (let i = 0; i < count; i++) {
      const a = base + (i / count) * Math.PI * 2;
      scene.spawn(new EnemyShot(this.x, this.y - 22, Math.cos(a), Math.sin(a), 2, 'bolt', this.enraged ? 118 : 96));
    }
  }

  healthFraction(): number {
    return clamp(this.hp / this.maxHp, 0, 1);
  }

  get isAwake(): boolean {
    return this.phase !== 'dormant';
  }
}

// ---------------------------------------------------------------------------

/**
 * Emberward: a fire-plated knight. Circles while armoured, then throws a
 * three-ember fan and staggers open.
 */
export class Emberward extends Enemy {
  private state: 'orbit' | 'wind' | 'throw' | 'open' = 'orbit';
  private timer = 1.1;
  private angle = rng.next() * Math.PI * 2;

  constructor(x: number, y: number) {
    super('stalfos', x, y);
    this.w = 16;
    this.h = 14;
    this.maxHp = 32;
    this.hp = this.maxHp;
  }

  protected override armorValue(): number {
    return this.state === 'open' ? 0 : 3;
  }

  protected override damageMultiplier(): number {
    return this.state === 'open' ? 2 : 1;
  }

  override update(dt: number, scene: Scene): void {
    this.baseUpdate(dt, scene);
    if (this.stun > 0) return;
    this.timer -= dt;

    const player = scene.player;
    switch (this.state) {
      case 'orbit': {
        this.angle += dt * 1.6;
        const tx = player.x + Math.cos(this.angle) * 54;
        const ty = player.y + Math.sin(this.angle) * 40;
        const dx = tx - this.x;
        const dy = ty - this.y;
        const len = Math.hypot(dx, dy) || 1;
        moveWithCollision(this, (dx / len) * 70 * dt, (dy / len) * 70 * dt, scene);
        this.facing = vectorToDir(player.x - this.x, player.y - this.y, this.facing);
        if (this.timer <= 0) {
          this.state = 'wind';
          this.timer = 0.5;
          scene.audio.play('charge');
        }
        break;
      }
      case 'wind':
        if (this.timer <= 0) {
          this.state = 'throw';
          this.timer = 0.35;
          const base = Math.atan2(player.y - this.y, player.x - this.x);
          for (const spread of [-0.4, 0, 0.4]) {
            const a = base + spread;
            scene.spawn(new EnemyShot(this.x, this.y - 12, Math.cos(a), Math.sin(a), 2, 'ember', 120));
          }
          scene.audio.play('swing');
        }
        break;
      case 'throw':
        if (this.timer <= 0) {
          this.state = 'open';
          this.timer = 1.35;
        }
        break;
      case 'open':
        if (this.timer <= 0) {
          this.state = 'orbit';
          this.timer = 1.2;
        }
        break;
    }
  }

  override draw(g: Gfx): void {
    const anim = g.art.actors.stalfos.idle;
    const frames = anim.frames[this.facing] ?? anim.frames.down;
    const frame = frames[Math.floor(this.animTime * (this.state === 'throw' ? 12 : 5)) % frames.length];
    this.drawShadow(g, 20);
    const dx = Math.round(this.x - g.camX + anim.ox * 1.5);
    const dy = Math.round(this.y - g.camY + anim.oy * 1.5);
    g.ctx.save();
    g.ctx.imageSmoothingEnabled = false;
    g.ctx.drawImage(frame, dx, dy, frame.width * 1.5, frame.height * 1.5);
    g.ctx.globalAlpha = 0.35;
    g.ctx.fillStyle = PAL.ember;
    g.ctx.fillRect(dx + 2, dy + 4, frame.width * 1.5 - 4, 2);
    if (this.flash > 0) {
      g.ctx.globalCompositeOperation = 'lighter';
      g.ctx.globalAlpha = clamp(this.flash * 5, 0, 0.85);
      g.ctx.drawImage(frame, dx, dy, frame.width * 1.5, frame.height * 1.5);
    }
    g.ctx.restore();
    if (this.state === 'open') {
      g.ctx.save();
      g.ctx.globalAlpha = 0.3 + Math.sin(g.time * 12) * 0.12;
      g.ctx.fillStyle = PAL.uiBad;
      g.ctx.beginPath();
      g.ctx.ellipse(this.x - g.camX, this.y - g.camY - 14, 12, 10, 0, 0, Math.PI * 2);
      g.ctx.fill();
      g.ctx.restore();
    }
  }

  protected override onDeath(scene: Scene): void {
    scene.onEmberwardKilled(this);
  }
}

// ---------------------------------------------------------------------------

type CinderPhase = 'dormant' | 'idle' | 'wind' | 'spray' | 'vulnerable' | 'summon' | 'enraged';

/** Cindermouth — the ash hunger that fed on root and bell. Episode One's end. */
export class Cindermouth extends Entity {
  private phase: CinderPhase = 'dormant';
  private timer = 0;
  private cycle = 0;
  spawnIndex = -1;
  private introDone = false;
  private minions: Enemy[] = [];

  constructor(x: number, y: number) {
    super();
    this.x = x;
    this.y = y;
    this.team = 'enemy';
    this.w = 34;
    this.h = 26;
    this.maxHp = 80;
    this.hp = this.maxHp;
    this.solidBody = true;
  }

  override hurtbox(): Rect {
    if (this.phase === 'vulnerable' || this.phase === 'enraged') {
      return { x: this.x - 16, y: this.y - 40, w: 32, h: 30 };
    }
    return { x: this.x - 2, y: this.y - 2, w: 1, h: 1 };
  }

  private get enraged(): boolean {
    return this.hp <= this.maxHp * 0.4;
  }

  override takeDamage(amount: number, scene: Scene, fromX?: number, fromY?: number): boolean {
    if (this.phase !== 'vulnerable' && this.phase !== 'enraged') {
      scene.audio.play('block');
      scene.effects.burst(fromX ?? this.x, (fromY ?? this.y) - 10, 6, PAL.emberLight, { speed: 70, life: 0.3 });
      return false;
    }
    const landed = super.takeDamage(amount, scene, fromX, fromY, 0);
    if (landed) {
      this.kx = 0;
      this.ky = 0;
      scene.effects.addShake(3);
      scene.effects.burst(this.x, this.y - 26, 10, PAL.fireLight, { speed: 100, life: 0.4 });
      if (!this.dead) {
        this.phase = 'idle';
        this.timer = this.enraged ? 0.4 : 0.8;
      }
    }
    return landed;
  }

  protected override onDeath(scene: Scene): void {
    scene.onCindermouthKilled(this);
  }

  override update(dt: number, scene: Scene): void {
    this.tickCommon(dt);
    this.timer -= dt;
    this.minions = this.minions.filter((m) => !m.dead);
    const player = scene.player;

    if (this.phase === 'dormant') {
      if (dist(this.x, this.y, player.x, player.y) < 110) {
        this.phase = 'idle';
        this.timer = 1.2;
        if (!this.introDone) {
          this.introDone = true;
          scene.audio.play('secret');
          scene.effects.addShake(6);
          scene.showBanner('CINDERMOUTH', 'Hunger of Ash');
        }
      }
      return;
    }

    if (!player.dead && rectsOverlap({ x: this.x - 20, y: this.y - 34, w: 40, h: 34 }, player.hurtbox())) {
      player.takeDamage(2, scene, this.x, this.y, 240);
    }

    switch (this.phase) {
      case 'idle':
        if (this.timer <= 0) {
          this.cycle++;
          this.phase = this.cycle % 3 === 0 ? 'summon' : 'wind';
          this.timer = this.phase === 'summon' ? 0.7 : 0.55;
        }
        break;
      case 'wind':
        if (this.timer <= 0) {
          this.phase = 'spray';
          this.timer = this.enraged ? 1.5 : 1.1;
          scene.audio.play('charge');
        }
        break;
      case 'spray': {
        if (rng.chance(dt * (this.enraged ? 20 : 12))) {
          const a = this.animTime * 2.8 + rng.range(-0.3, 0.3);
          scene.spawn(new EnemyShot(this.x, this.y - 22, Math.cos(a), Math.sin(a), 2, 'ember', this.enraged ? 130 : 108));
        }
        if (this.timer <= 0) {
          this.phase = this.enraged ? 'enraged' : 'vulnerable';
          this.timer = this.enraged ? 2.5 : 2.15;
          scene.audio.play('hurt');
        }
        break;
      }
      case 'vulnerable':
      case 'enraged':
        if (this.phase === 'enraged' && rng.chance(dt * 5)) {
          const a = rng.next() * Math.PI * 2;
          scene.spawn(new EnemyShot(this.x, this.y - 22, Math.cos(a), Math.sin(a), 2, 'ember', 100));
        }
        if (this.timer <= 0) {
          this.phase = 'idle';
          this.timer = this.enraged ? 0.5 : 0.9;
        }
        break;
      case 'summon': {
        if (this.timer <= 0) {
          if (this.minions.length < 4) {
            for (let i = 0; i < (this.enraged ? 3 : 2); i++) {
              const a = rng.next() * Math.PI * 2;
              const kind = rng.chance(0.5) ? 'ember' : 'ashbat';
              const m = createEnemy(kind, this.x + Math.cos(a) * 46, this.y + Math.sin(a) * 34);
              this.minions.push(m);
              scene.spawn(m);
              scene.effects.burst(m.x, m.y - 8, 8, PAL.emberLight, { speed: 70 });
            }
            scene.audio.play('charge');
          }
          this.phase = 'idle';
          this.timer = 1.0;
        }
        break;
      }
    }
  }

  override draw(g: Gfx): void {
    const art = g.art.actors.cindermouth;
    const open = this.phase === 'vulnerable' || this.phase === 'enraged' || this.phase === 'spray';
    const set = this.flash > 0 ? art.hurt : open ? art.open : art.idle;
    const frame = set[Math.floor(this.animTime * (this.enraged ? 8 : 4)) % set.length];
    this.drawShadow(g, 40);
    const shudder = this.phase === 'wind' ? Math.sin(this.animTime * 40) * 1.6 : 0;
    const dx = Math.round(this.x - g.camX + art.ox + shudder);
    const dy = Math.round(this.y - g.camY + art.oy);
    g.ctx.drawImage(frame, dx, dy);
    if (this.flash > 0) {
      g.ctx.save();
      g.ctx.globalCompositeOperation = 'lighter';
      g.ctx.globalAlpha = clamp(this.flash * 5, 0, 0.8);
      g.ctx.drawImage(frame, dx, dy);
      g.ctx.restore();
    }
    if (open) {
      g.ctx.save();
      g.ctx.globalAlpha = 0.22 + Math.sin(g.time * 9) * 0.08;
      g.ctx.fillStyle = withAlpha(PAL.emberLight, 1);
      g.ctx.beginPath();
      g.ctx.ellipse(this.x - g.camX, this.y - g.camY - 24, 16, 14, 0, 0, Math.PI * 2);
      g.ctx.fill();
      g.ctx.restore();
    }
  }

  healthFraction(): number {
    return clamp(this.hp / this.maxHp, 0, 1);
  }

  get isAwake(): boolean {
    return this.phase !== 'dormant';
  }
}

