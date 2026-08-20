/**
 * Enemy roster. Each type is a small state machine — the variety comes from
 * how they approach, when they commit, and what punishes a careless swing.
 */
import type { AnimSet } from '../../art/actors';
import { PAL } from '../../art/palette';
import { DIR_VECTORS, dist, rectsOverlap, vectorToDir, type Dir } from '../../engine/math';
import { rng } from '../../engine/rng';
import { Entity, moveWithCollision, type Gfx } from '../entity';
import type { Scene } from '../scene';
import { EnemyShot } from './projectiles';

export type EnemyKind = 'slime' | 'octorok' | 'keese' | 'stalfos' | 'thornling' | 'wisp' | 'crab' | 'ember' | 'ashbat';

export interface EnemyStats {
  hp: number;
  /** Contact damage in half-hearts. */
  touch: number;
  speed: number;
  /** Half-hearts of damage ignored per hit. */
  armor?: number;
}

export const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
  slime: { hp: 3, touch: 1, speed: 26 },
  keese: { hp: 2, touch: 1, speed: 62 },
  octorok: { hp: 4, touch: 1, speed: 30 },
  thornling: { hp: 6, touch: 2, speed: 0 },
  stalfos: { hp: 9, touch: 2, speed: 42, armor: 1 },
  wisp: { hp: 5, touch: 1, speed: 38 },
  crab: { hp: 8, touch: 2, speed: 36, armor: 2 },
  ember: { hp: 5, touch: 2, speed: 30 },
  ashbat: { hp: 4, touch: 1, speed: 68 },
};

export abstract class Enemy extends Entity {
  readonly kind: EnemyKind;
  /** Seconds of stun remaining; stunned enemies do not act. */
  stun = 0;
  /** Set by the scene so drops and clear-checks know where it came from. */
  spawnIndex = -1;
  protected stats: EnemyStats;
  /** Contact damage cooldown so touching does not shred the player. */
  protected touchCooldown = 0;

  constructor(kind: EnemyKind, x: number, y: number) {
    super();
    this.kind = kind;
    this.stats = ENEMY_STATS[kind];
    this.x = x;
    this.y = y;
    this.team = 'enemy';
    this.hp = this.stats.hp;
    this.maxHp = this.stats.hp;
    this.solidBody = true;
  }

  /**
   * Enemies are struck anywhere on their sprite, which stands taller than the
   * footprint used for walking. Without this, tall enemies could be walked
   * into but not hit.
   */
  override hurtbox() {
    const box = this.hitbox();
    return { x: box.x - 1, y: box.y - 6, w: box.w + 2, h: box.h + 6 };
  }

  /** Half-hearts subtracted from each incoming hit. Overridable per enemy. */
  protected armorValue(): number {
    return this.stats.armor ?? 0;
  }

  /** Scales damage after armour — used for exposed-state weak points. */
  protected damageMultiplier(): number {
    return 1;
  }

  /** True if an incoming hit should be deflected. Stalfos and crabs override. */
  blocksFrom(_fromX: number, _fromY: number): boolean {
    return false;
  }

  /** Armour subtracts from every incoming hit but never nullifies it. */

  override takeDamage(amount: number, scene: Scene, fromX?: number, fromY?: number, force = 120): boolean {
    const reduced = Math.max(1, amount - this.armorValue()) * this.damageMultiplier();
    return super.takeDamage(Math.round(reduced), scene, fromX, fromY, force);
  }

  protected override onDeath(scene: Scene): void {
    scene.onEnemyKilled(this);
  }

  /** Applies knockback movement and contact damage; call from `update`. */
  protected baseUpdate(dt: number, scene: Scene): void {
    this.tickCommon(dt);
    if (this.stun > 0) this.stun -= dt;
    if (this.touchCooldown > 0) this.touchCooldown -= dt;

    if (this.kx !== 0 || this.ky !== 0) {
      moveWithCollision(this, this.kx * dt, this.ky * dt, scene);
    }

    const player = scene.player;
    if (!player.dead && this.touchCooldown <= 0 && rectsOverlap(this.hurtbox(), player.hurtbox())) {
      if (player.takeDamage(this.stats.touch, scene, this.x, this.y, 190)) {
        this.touchCooldown = 0.5;
      }
    }
  }

  /** Straight-line chase with a light wander so groups do not stack up. */
  protected chase(dt: number, scene: Scene, speed: number, jitter = 0): void {
    const player = scene.player;
    let dx = player.x - this.x;
    let dy = player.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    if (jitter > 0) {
      dx += rng.range(-jitter, jitter);
      dy += rng.range(-jitter, jitter);
    }
    this.facing = vectorToDir(dx, dy, this.facing);
    moveWithCollision(this, dx * speed * dt, dy * speed * dt, scene);
  }

  protected drawAnim(g: Gfx, anim: AnimSet, fps: number): void {
    const frames = anim.frames[this.facing] ?? anim.frames.down;
    const frame = frames[Math.floor(this.animTime * fps) % frames.length];
    this.drawShadow(g, anim.w - 2);
    this.drawFrame(g, frame, anim.ox, anim.oy);
    if (this.stun > 0) this.drawStunStars(g);
  }

  private drawStunStars(g: Gfx): void {
    const frames = g.art.fx.sparkle;
    for (let i = 0; i < 2; i++) {
      const a = g.time * 6 + i * Math.PI;
      const x = this.x - g.camX + Math.cos(a) * 7;
      const y = this.y - g.camY - 22 + Math.sin(a) * 2;
      g.ctx.drawImage(frames[Math.floor(g.time * 14 + i) % frames.length], Math.round(x - 4), Math.round(y - 4));
    }
  }
}

// ---------------------------------------------------------------------------

/** Hops toward the player in bursts, harmless between hops. */
export class Slime extends Enemy {
  private hopTimer = rng.range(0.2, 1.2);
  private hopping = false;
  private hopDir = { x: 0, y: 1 };

  constructor(x: number, y: number) {
    super('slime', x, y);
    this.w = 12;
    this.h = 9;
  }

  override update(dt: number, scene: Scene): void {
    this.baseUpdate(dt, scene);
    if (this.stun > 0) return;

    this.hopTimer -= dt;
    if (this.hopping) {
      // Arc through the air; the sprite squashes on landing.
      this.z = Math.max(0, Math.sin((1 - Math.max(0, this.hopTimer) / 0.42) * Math.PI) * 7);
      moveWithCollision(this, this.hopDir.x * this.stats.speed * 2.4 * dt, this.hopDir.y * this.stats.speed * 2.4 * dt, scene);
      if (this.hopTimer <= 0) {
        this.hopping = false;
        this.z = 0;
        this.hopTimer = rng.range(0.5, 1.1);
        scene.effects.dust(this.x, this.y, 4);
      }
    } else if (this.hopTimer <= 0) {
      const player = scene.player;
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const len = Math.hypot(dx, dy) || 1;
      this.hopDir = { x: dx / len, y: dy / len };
      this.facing = vectorToDir(dx, dy, this.facing);
      this.hopping = true;
      this.hopTimer = 0.42;
    }
  }

  override draw(g: Gfx): void {
    this.drawAnim(g, g.art.actors.slime.idle, this.hopping ? 10 : 4);
  }
}

// ---------------------------------------------------------------------------

/** Shuffles into line with the player, stops, and spits a rock. */
export class Octorok extends Enemy {
  private state: 'walk' | 'aim' | 'recover' = 'walk';
  private timer = rng.range(0.6, 1.6);
  private moveDir: Dir = 'down';

  constructor(x: number, y: number) {
    super('octorok', x, y);
    this.w = 12;
    this.h = 10;
  }

  override update(dt: number, scene: Scene): void {
    this.baseUpdate(dt, scene);
    if (this.stun > 0) return;
    this.timer -= dt;

    switch (this.state) {
      case 'walk': {
        const v = DIR_VECTORS[this.moveDir];
        const res = moveWithCollision(this, v.x * this.stats.speed * dt, v.y * this.stats.speed * dt, scene);
        this.facing = this.moveDir;
        if (res.hitX || res.hitY || this.timer <= 0) {
          this.moveDir = rng.pick(['up', 'down', 'left', 'right'] as Dir[]);
          this.timer = rng.range(0.7, 1.8);
        }
        // Fire when roughly aligned with the player and within range.
        const player = scene.player;
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const aligned = Math.abs(dx) < 14 || Math.abs(dy) < 14;
        if (aligned && dist(this.x, this.y, player.x, player.y) < 150 && rng.chance(dt * 2.2)) {
          this.facing = vectorToDir(Math.abs(dx) < 14 ? 0 : dx, Math.abs(dx) < 14 ? dy : 0, this.facing);
          this.state = 'aim';
          this.timer = 0.32;
        }
        break;
      }
      case 'aim':
        if (this.timer <= 0) {
          const v = DIR_VECTORS[this.facing];
          scene.spawn(new EnemyShot(this.x, this.y - 8, v.x, v.y, 1, 'rock', 132));
          scene.audio.play('swing');
          this.state = 'recover';
          this.timer = 0.5;
        }
        break;
      case 'recover':
        if (this.timer <= 0) {
          this.state = 'walk';
          this.timer = rng.range(0.6, 1.4);
        }
        break;
    }
  }

  override draw(g: Gfx): void {
    this.drawAnim(g, g.art.actors.octorok.idle, this.state === 'walk' ? 5 : 2);
  }
}

// ---------------------------------------------------------------------------

/** Erratic flyer: rests until the player is near, then swoops in bursts. */
export class Keese extends Enemy {
  private restTimer = rng.range(0.4, 1.6);
  private flying = false;
  private dirX = 0;
  private dirY = 0;

  constructor(x: number, y: number) {
    super('keese', x, y);
    this.w = 10;
    this.h = 8;
    this.ghost = false;
    this.z = 10;
  }

  override update(dt: number, scene: Scene): void {
    this.baseUpdate(dt, scene);
    if (this.stun > 0) return;

    this.z = 10 + Math.sin(this.animTime * 7) * 2;
    this.restTimer -= dt;

    if (!this.flying) {
      if (this.restTimer <= 0 || dist(this.x, this.y, scene.player.x, scene.player.y) < 80) {
        this.flying = true;
        this.restTimer = rng.range(0.9, 1.8);
        const dx = scene.player.x - this.x;
        const dy = scene.player.y - this.y;
        const len = Math.hypot(dx, dy) || 1;
        this.dirX = dx / len + rng.range(-0.5, 0.5);
        this.dirY = dy / len + rng.range(-0.5, 0.5);
      }
      return;
    }

    // Weave while closing, and bounce off walls instead of stalling on them.
    const wobble = Math.sin(this.animTime * 11) * 0.5;
    const res = moveWithCollision(
      this,
      (this.dirX + wobble * this.dirY) * this.stats.speed * dt,
      (this.dirY - wobble * this.dirX) * this.stats.speed * dt,
      scene,
    );
    if (res.hitX) this.dirX *= -1;
    if (res.hitY) this.dirY *= -1;

    if (this.restTimer <= 0) {
      this.flying = false;
      this.restTimer = rng.range(0.3, 0.9);
    }
  }

  override draw(g: Gfx): void {
    this.drawAnim(g, g.art.actors.keese.idle, this.flying ? 16 : 6);
  }
}

// ---------------------------------------------------------------------------

/**
 * Armoured skeleton. Its shield faces the direction it is moving, and hits
 * from that side are deflected — you have to get around it.
 */
export class Stalfos extends Enemy {
  private state: 'patrol' | 'charge' | 'rest' = 'patrol';
  private timer = rng.range(0.8, 1.8);
  private moveDir: Dir = 'down';

  constructor(x: number, y: number) {
    super('stalfos', x, y);
    this.w = 12;
    this.h = 11;
  }

  /** True if an incoming hit lands on the shielded face. */
  override blocksFrom(fromX: number, fromY: number): boolean {
    const v = DIR_VECTORS[this.facing];
    const dx = fromX - this.x;
    const dy = fromY - this.y;
    const len = Math.hypot(dx, dy) || 1;
    return (dx / len) * v.x + (dy / len) * v.y > 0.45;
  }

  override update(dt: number, scene: Scene): void {
    this.baseUpdate(dt, scene);
    if (this.stun > 0) return;
    this.timer -= dt;

    const player = scene.player;
    const range = dist(this.x, this.y, player.x, player.y);

    switch (this.state) {
      case 'patrol': {
        const v = DIR_VECTORS[this.moveDir];
        const res = moveWithCollision(this, v.x * this.stats.speed * 0.6 * dt, v.y * this.stats.speed * 0.6 * dt, scene);
        this.facing = this.moveDir;
        if (res.hitX || res.hitY || this.timer <= 0) {
          this.moveDir = rng.pick(['up', 'down', 'left', 'right'] as Dir[]);
          this.timer = rng.range(0.6, 1.5);
        }
        if (range < 90) {
          this.state = 'charge';
          this.timer = 1.3;
        }
        break;
      }
      case 'charge':
        this.chase(dt, scene, this.stats.speed, 0.08);
        if (this.timer <= 0 || range > 130) {
          this.state = 'rest';
          this.timer = 0.55;
        }
        break;
      case 'rest':
        if (this.timer <= 0) {
          this.state = range < 100 ? 'charge' : 'patrol';
          this.timer = rng.range(0.8, 1.6);
        }
        break;
    }
  }

  override draw(g: Gfx): void {
    this.drawAnim(g, g.art.actors.stalfos.idle, this.state === 'charge' ? 8 : 4);
  }
}

// ---------------------------------------------------------------------------

/** Rooted spitter. Cannot move, so it controls space instead. */
export class Thornling extends Enemy {
  private cooldown = rng.range(0.8, 2);
  private open = false;

  constructor(x: number, y: number) {
    super('thornling', x, y);
    this.w = 12;
    this.h = 10;
    this.solidBody = true;
  }

  override update(dt: number, scene: Scene): void {
    this.baseUpdate(dt, scene);
    // Rooted: cancel any knockback translation.
    this.kx = 0;
    this.ky = 0;
    if (this.stun > 0) return;

    this.cooldown -= dt;
    const player = scene.player;
    const range = dist(this.x, this.y, player.x, player.y);
    this.open = this.cooldown < 0.35 && range < 160;

    if (this.cooldown <= 0) {
      if (range < 160) {
        // Three-seed fan.
        const base = Math.atan2(player.y - this.y, player.x - this.x);
        for (const spread of [-0.32, 0, 0.32]) {
          const a = base + spread;
          scene.spawn(new EnemyShot(this.x, this.y - 10, Math.cos(a), Math.sin(a), 1, 'seed', 108));
        }
        scene.audio.play('swing');
        this.cooldown = rng.range(1.7, 2.6);
      } else {
        this.cooldown = 0.6;
      }
    }
  }

  override draw(g: Gfx): void {
    const anim = g.art.actors.thornling.idle;
    const frames = anim.frames.down;
    const frame = frames[this.open ? 0 : 1];
    this.drawShadow(g, 13);
    this.drawFrame(g, frame, anim.ox, anim.oy);
  }
}

// ---------------------------------------------------------------------------

/**
 * Will-o'-the-wisp. Spends most of its time as a smear of light you cannot
 * cut; it only becomes solid when it gathers to strike.
 */
export class Wisp extends Enemy {
  private timer = rng.range(0.4, 1.2);
  private corporeal = false;
  private dirX = rng.range(-1, 1);
  private dirY = rng.range(-1, 1);

  constructor(x: number, y: number) {
    super('wisp', x, y);
    this.w = 10;
    this.h = 10;
    this.z = 12;
    this.solidBody = false;
  }

  override hurtbox() {
    if (!this.corporeal) return { x: this.x - 1, y: this.y - 1, w: 1, h: 1 };
    return super.hurtbox();
  }

  override takeDamage(amount: number, scene: Scene, fromX?: number, fromY?: number, force = 120): boolean {
    if (!this.corporeal) {
      scene.audio.play('block');
      scene.effects.burst(this.x, this.y - 12, 4, PAL.wispLight, { speed: 50, life: 0.25 });
      return false;
    }
    return super.takeDamage(amount, scene, fromX, fromY, force);
  }

  override update(dt: number, scene: Scene): void {
    this.baseUpdate(dt, scene);
    if (this.stun > 0) return;
    this.timer -= dt;
    this.z = 10 + Math.sin(this.animTime * 5) * 3;

    const player = scene.player;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const len = Math.hypot(dx, dy) || 1;

    if (this.corporeal) {
      moveWithCollision(this, (dx / len) * this.stats.speed * 1.4 * dt, (dy / len) * this.stats.speed * 1.4 * dt, scene);
      if (this.timer <= 0.28 && this.timer + dt > 0.28) {
        scene.spawn(new EnemyShot(this.x, this.y - 12, dx / len, dy / len, 1, 'bolt', 96));
        scene.audio.play('swing');
      }
      if (this.timer <= 0) {
        this.corporeal = false;
        this.timer = rng.range(1.1, 1.8);
      }
    } else {
      this.dirX += rng.range(-0.8, 0.8) * dt;
      this.dirY += rng.range(-0.8, 0.8) * dt;
      const drift = Math.hypot(this.dirX, this.dirY) || 1;
      moveWithCollision(
        this,
        (this.dirX / drift) * this.stats.speed * 0.7 * dt,
        (this.dirY / drift) * this.stats.speed * 0.7 * dt,
        scene,
      );
      if (this.timer <= 0 && dist(this.x, this.y, player.x, player.y) < 120) {
        this.corporeal = true;
        this.timer = rng.range(1.4, 2.0);
        this.facing = vectorToDir(dx, dy, this.facing);
      }
    }
  }

  override draw(g: Gfx): void {
    const anim = g.art.actors.wisp.idle;
    const frames = anim.frames.down;
    const frame = frames[Math.floor(this.animTime * (this.corporeal ? 12 : 6)) % frames.length];
    this.drawShadow(g, this.corporeal ? 10 : 6);
    g.ctx.save();
    g.ctx.globalAlpha = this.corporeal ? 1 : 0.35 + Math.sin(g.time * 8) * 0.12;
    this.drawFrame(g, frame, anim.ox, anim.oy);
    g.ctx.restore();
    if (this.corporeal) {
      g.ctx.save();
      g.ctx.globalAlpha = 0.22 + Math.sin(g.time * 10) * 0.08;
      g.ctx.fillStyle = PAL.wispLight;
      g.ctx.beginPath();
      g.ctx.ellipse(this.x - g.camX, this.y - g.camY - 12, 9, 10, 0, 0, Math.PI * 2);
      g.ctx.fill();
      g.ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------

/**
 * Marsh crab. Sidesteps with its shell toward you, then snaps — the only
 * moment the armour drops.
 */
export class Crab extends Enemy {
  private state: 'sidestep' | 'wind' | 'snap' | 'recover' = 'sidestep';
  private timer = rng.range(0.5, 1.4);
  private moveSign = rng.chance(0.5) ? 1 : -1;
  private toward = { x: 0, y: 1 };

  constructor(x: number, y: number) {
    super('crab', x, y);
    this.w = 14;
    this.h = 10;
  }

  override blocksFrom(fromX: number, fromY: number): boolean {
    if (this.state === 'snap' || this.state === 'recover') return false;
    const dx = fromX - this.x;
    const dy = fromY - this.y;
    const len = Math.hypot(dx, dy) || 1;
    return (dx / len) * this.toward.x + (dy / len) * this.toward.y > 0.35;
  }

  override update(dt: number, scene: Scene): void {
    this.baseUpdate(dt, scene);
    if (this.stun > 0) return;
    this.timer -= dt;

    const player = scene.player;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const len = Math.hypot(dx, dy) || 1;
    this.toward = { x: dx / len, y: dy / len };
    this.facing = vectorToDir(dx, dy, this.facing);

    switch (this.state) {
      case 'sidestep': {
        const sx = -this.toward.y * this.moveSign;
        const sy = this.toward.x * this.moveSign;
        const res = moveWithCollision(this, sx * this.stats.speed * dt, sy * this.stats.speed * dt, scene);
        if (res.hitX || res.hitY) this.moveSign *= -1;
        if (this.timer <= 0 && dist(this.x, this.y, player.x, player.y) < 100) {
          this.state = 'wind';
          this.timer = 0.35;
          scene.audio.play('charge');
        } else if (this.timer <= 0) {
          this.timer = rng.range(0.5, 1.2);
          this.moveSign *= -1;
        }
        break;
      }
      case 'wind':
        if (this.timer <= 0) {
          this.state = 'snap';
          this.timer = 0.32;
        }
        break;
      case 'snap': {
        moveWithCollision(this, this.toward.x * 210 * dt, this.toward.y * 210 * dt, scene);
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 0.7;
          scene.effects.dust(this.x, this.y, 6);
        }
        break;
      }
      case 'recover':
        if (this.timer <= 0) {
          this.state = 'sidestep';
          this.timer = rng.range(0.6, 1.3);
        }
        break;
    }
  }

  override draw(g: Gfx): void {
    this.drawAnim(g, g.art.actors.crab.idle, this.state === 'snap' ? 12 : 4);
    if (this.state === 'recover') {
      g.ctx.save();
      g.ctx.globalAlpha = 0.28 + Math.sin(g.time * 12) * 0.1;
      g.ctx.fillStyle = PAL.uiBad;
      g.ctx.beginPath();
      g.ctx.ellipse(this.x - g.camX, this.y - g.camY - 8, 10, 7, 0, 0, Math.PI * 2);
      g.ctx.fill();
      g.ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------

/** Fire gel — hops like a slime, leaves a brief burn trail of sparks. */
export class Ember extends Enemy {
  private hopTimer = rng.range(0.2, 1.0);
  private hopping = false;
  private hopDir = { x: 0, y: 1 };

  constructor(x: number, y: number) {
    super('ember', x, y);
    this.w = 12;
    this.h = 9;
  }

  override update(dt: number, scene: Scene): void {
    this.baseUpdate(dt, scene);
    if (this.stun > 0) return;

    this.hopTimer -= dt;
    if (this.hopping) {
      this.z = Math.max(0, Math.sin((1 - Math.max(0, this.hopTimer) / 0.4) * Math.PI) * 8);
      moveWithCollision(this, this.hopDir.x * this.stats.speed * 2.6 * dt, this.hopDir.y * this.stats.speed * 2.6 * dt, scene);
      if (rng.chance(dt * 8)) scene.effects.burst(this.x, this.y - 4, 2, PAL.emberLight, { speed: 40, life: 0.25 });
      if (this.hopTimer <= 0) {
        this.hopping = false;
        this.z = 0;
        this.hopTimer = rng.range(0.45, 1.0);
        scene.effects.dust(this.x, this.y, 4);
      }
    } else if (this.hopTimer <= 0) {
      const player = scene.player;
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const len = Math.hypot(dx, dy) || 1;
      this.hopDir = { x: dx / len, y: dy / len };
      this.facing = vectorToDir(dx, dy, this.facing);
      this.hopping = true;
      this.hopTimer = 0.4;
    }
  }

  override draw(g: Gfx): void {
    this.drawAnim(g, g.art.actors.ember.idle, this.hopping ? 12 : 5);
  }
}

// ---------------------------------------------------------------------------

/** Ash-winged keese that dive harder and spit a spark on contact distance. */
export class Ashbat extends Enemy {
  private restTimer = rng.range(0.3, 1.2);
  private flying = false;
  private dirX = 0;
  private dirY = 0;
  private spitCooldown = 0;

  constructor(x: number, y: number) {
    super('ashbat', x, y);
    this.w = 10;
    this.h = 8;
    this.z = 10;
  }

  override update(dt: number, scene: Scene): void {
    this.baseUpdate(dt, scene);
    if (this.stun > 0) return;

    this.z = 10 + Math.sin(this.animTime * 8) * 2;
    this.restTimer -= dt;
    if (this.spitCooldown > 0) this.spitCooldown -= dt;

    if (!this.flying) {
      if (this.restTimer <= 0 || dist(this.x, this.y, scene.player.x, scene.player.y) < 90) {
        this.flying = true;
        this.restTimer = rng.range(1.0, 1.9);
        const dx = scene.player.x - this.x;
        const dy = scene.player.y - this.y;
        const len = Math.hypot(dx, dy) || 1;
        this.dirX = dx / len + rng.range(-0.4, 0.4);
        this.dirY = dy / len + rng.range(-0.4, 0.4);
      }
      return;
    }

    const wobble = Math.sin(this.animTime * 12) * 0.55;
    const res = moveWithCollision(
      this,
      (this.dirX + wobble * this.dirY) * this.stats.speed * dt,
      (this.dirY - wobble * this.dirX) * this.stats.speed * dt,
      scene,
    );
    if (res.hitX) this.dirX *= -1;
    if (res.hitY) this.dirY *= -1;

    if (this.spitCooldown <= 0 && dist(this.x, this.y, scene.player.x, scene.player.y) < 100) {
      const dx = scene.player.x - this.x;
      const dy = scene.player.y - this.y;
      const len = Math.hypot(dx, dy) || 1;
      scene.spawn(new EnemyShot(this.x, this.y - 10, dx / len, dy / len, 1, 'ember', 100));
      this.spitCooldown = rng.range(1.4, 2.2);
    }

    if (this.restTimer <= 0) {
      this.flying = false;
      this.restTimer = rng.range(0.25, 0.8);
    }
  }

  override draw(g: Gfx): void {
    this.drawAnim(g, g.art.actors.ashbat.idle, this.flying ? 18 : 6);
  }
}

// ---------------------------------------------------------------------------

export function createEnemy(kind: EnemyKind, x: number, y: number): Enemy {
  switch (kind) {
    case 'slime':
      return new Slime(x, y);
    case 'octorok':
      return new Octorok(x, y);
    case 'keese':
      return new Keese(x, y);
    case 'stalfos':
      return new Stalfos(x, y);
    case 'thornling':
      return new Thornling(x, y);
    case 'wisp':
      return new Wisp(x, y);
    case 'crab':
      return new Crab(x, y);
    case 'ember':
      return new Ember(x, y);
    case 'ashbat':
      return new Ashbat(x, y);
  }
}

/** Particle colour used when an enemy dies. */
export const DEATH_COLOR: Record<EnemyKind, string> = {
  slime: PAL.slime,
  octorok: PAL.blood,
  keese: PAL.bat,
  stalfos: PAL.plaster,
  thornling: PAL.plant,
  wisp: PAL.wispLight,
  crab: PAL.crab,
  ember: PAL.ember,
  ashbat: PAL.ashLight,
};
