/**
 * Everything that flies: arrows, enemy shots, the boomerang, bombs and their
 * blasts, and the sword beam earned from the Blade track.
 */
import { PAL, withAlpha } from '../../art/palette';
import { DIR_VECTORS, rectsOverlap, type Dir, type Rect } from '../../engine/math';
import { TILE } from '../../engine/screen';
import { rng } from '../../engine/rng';
import { Entity, type Gfx } from '../entity';
import type { Scene } from '../scene';
import { Pickup } from './pickups';

/** Shared behaviour for straight-line shots. */
abstract class Shot extends Entity {
  protected life = 2.4;
  damage = 1;
  /** Whose hurtboxes this shot checks. */
  target: 'player' | 'enemy' = 'enemy';
  /** Enemies already hit, so a piercing arrow does not multi-hit one target. */
  protected hitSet = new Set<Entity>();

  constructor(x: number, y: number, dx: number, dy: number, speed: number) {
    super();
    this.x = x;
    this.y = y;
    const len = Math.hypot(dx, dy) || 1;
    this.vx = (dx / len) * speed;
    this.vy = (dy / len) * speed;
    this.ghost = true;
    this.w = 8;
    this.h = 8;
    this.z = 8;
  }

  protected blockedByTiles(scene: Scene): boolean {
    const gx = Math.floor(this.x / TILE);
    const gy = Math.floor(this.y / TILE);
    return scene.world.blocksShot(gx, gy);
  }

  protected hitTargets(scene: Scene): Entity[] {
    const box = this.hitbox();
    const out: Entity[] = [];
    if (this.target === 'enemy') {
      for (const e of scene.entities) {
        if (e.team !== 'enemy' || e.dead || this.hitSet.has(e)) continue;
        if (rectsOverlap(box, e.hurtbox())) out.push(e);
      }
    } else if (!scene.player.dead && !this.hitSet.has(scene.player)) {
      if (rectsOverlap(box, scene.player.hurtbox())) out.push(scene.player);
    }
    return out;
  }

  override hitbox(): Rect {
    return { x: this.x - this.w / 2, y: this.y - this.z - this.h / 2, w: this.w, h: this.h };
  }
}

// ---------------------------------------------------------------------------

export class Arrow extends Shot {
  private pierce: boolean;
  private angle: number;

  constructor(x: number, y: number, dir: Dir, damage: number, pierce: boolean) {
    const v = DIR_VECTORS[dir];
    super(x, y, v.x, v.y, 260);
    this.damage = damage;
    this.pierce = pierce;
    this.angle = Math.atan2(v.y, v.x);
    this.facing = dir;
    this.life = 1.6;
  }

  override update(dt: number, scene: Scene): void {
    this.tickCommon(dt);
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.life <= 0 || this.blockedByTiles(scene)) {
      scene.effects.burst(this.x, this.y - this.z, 4, PAL.plaster, { speed: 40, life: 0.25 });
      this.dead = true;
      return;
    }

    for (const target of this.hitTargets(scene)) {
      this.hitSet.add(target);
      scene.damageEnemy(target, this.damage, this.x, this.y, 140);
      if (!this.pierce) {
        this.dead = true;
        return;
      }
    }
  }

  override draw(g: Gfx): void {
    const img = g.art.fx.arrow;
    g.ctx.save();
    g.ctx.translate(Math.round(this.x - g.camX), Math.round(this.y - g.camY - this.z));
    g.ctx.rotate(this.angle);
    g.ctx.drawImage(img, -img.width / 2, -img.height / 2);
    g.ctx.restore();
  }
}

// ---------------------------------------------------------------------------

/** Enemy projectile: octorok rocks and thornling seeds. */
export class EnemyShot extends Shot {
  private art: 'rock' | 'seed';
  private spin = 0;

  constructor(x: number, y: number, dx: number, dy: number, damage: number, art: 'rock' | 'seed', speed = 120) {
    super(x, y, dx, dy, speed);
    this.damage = damage;
    this.target = 'player';
    this.art = art;
    this.life = 3;
    this.w = 7;
    this.h = 7;
  }

  override update(dt: number, scene: Scene): void {
    this.tickCommon(dt);
    this.life -= dt;
    this.spin += dt * 9;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.life <= 0 || this.blockedByTiles(scene)) {
      scene.effects.burst(this.x, this.y - this.z, 5, this.art === 'rock' ? PAL.rock : PAL.plant, { speed: 50, life: 0.25 });
      this.dead = true;
      return;
    }

    // A raised shield facing the shot deflects it.
    const player = scene.player;
    if (!player.dead && rectsOverlap(this.hitbox(), player.hurtbox())) {
      if (player.isBlocking(this.vx, this.vy)) {
        scene.audio.play('block');
        scene.effects.burst(this.x, this.y - this.z, 6, PAL.steelLight, { speed: 80, life: 0.3 });
        this.dead = true;
        return;
      }
      player.takeDamage(this.damage, scene, this.x, this.y, 160);
      this.dead = true;
    }
  }

  override draw(g: Gfx): void {
    const img = this.art === 'rock' ? g.art.fx.rock : g.art.fx.seed;
    g.ctx.save();
    g.ctx.translate(Math.round(this.x - g.camX), Math.round(this.y - g.camY - this.z));
    g.ctx.rotate(this.spin);
    g.ctx.drawImage(img, -img.width / 2, -img.height / 2);
    g.ctx.restore();
  }
}

// ---------------------------------------------------------------------------

/**
 * Boomerang: flies out, then homes back to the thrower. Stuns rather than
 * kills, and drags loose pickups home with it.
 */
export class Boomerang extends Shot {
  private owner: Entity;
  private outTime: number;
  private returning = false;
  private carried: Entity[] = [];

  constructor(owner: Entity, dir: Dir, damage: number, range = 0.42) {
    const v = DIR_VECTORS[dir];
    super(owner.x, owner.y - 8, v.x, v.y, 190);
    this.owner = owner;
    this.damage = damage;
    this.outTime = range;
    this.life = 4;
    this.w = 10;
    this.h = 10;
  }

  override update(dt: number, scene: Scene): void {
    this.tickCommon(dt);
    this.life -= dt;

    if (!this.returning) {
      this.outTime -= dt;
      if (this.outTime <= 0 || this.blockedByTiles(scene)) this.returning = true;
    }

    if (this.returning) {
      const dx = this.owner.x - this.x;
      const dy = this.owner.y - 8 - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = 230;
      this.vx = (dx / d) * speed;
      this.vy = (dy / d) * speed;
      if (d < 10 || this.owner.dead) {
        for (const carried of this.carried) {
          carried.x = this.owner.x;
          carried.y = this.owner.y;
        }
        this.dead = true;
        return;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    for (const target of this.hitTargets(scene)) {
      this.hitSet.add(target);
      scene.damageEnemy(target, this.damage, this.x, this.y, 90);
      scene.stunEnemy(target, 1.1);
      this.returning = true;
    }

    // Sweep up drops on the way past.
    for (const e of scene.entities) {
      if (e.dead || !(e instanceof Pickup) || this.carried.includes(e)) continue;
      if (rectsOverlap(this.hitbox(), e.hitbox())) this.carried.push(e);
    }
    for (const carried of this.carried) {
      carried.x = this.x;
      carried.y = this.y;
    }

    if (this.life <= 0) this.dead = true;
  }

  override draw(g: Gfx): void {
    const frames = g.art.fx.boomerang;
    const frame = frames[Math.floor(this.animTime * 22) % frames.length];
    g.ctx.drawImage(frame, Math.round(this.x - g.camX - 6), Math.round(this.y - g.camY - 6 - this.z));
  }
}

// ---------------------------------------------------------------------------

export class SwordBeam extends Shot {
  private angle: number;

  constructor(x: number, y: number, dir: Dir, damage: number) {
    const v = DIR_VECTORS[dir];
    super(x, y, v.x, v.y, 300);
    this.damage = damage;
    this.angle = Math.atan2(v.y, v.x);
    this.life = 0.9;
    this.w = 14;
    this.h = 12;
  }

  override update(dt: number, scene: Scene): void {
    this.tickCommon(dt);
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.life <= 0 || this.blockedByTiles(scene)) {
      this.dead = true;
      return;
    }
    for (const target of this.hitTargets(scene)) {
      this.hitSet.add(target);
      scene.damageEnemy(target, this.damage, this.x, this.y, 130);
    }
  }

  override draw(g: Gfx): void {
    const img = g.art.fx.swordBeam;
    g.ctx.save();
    g.ctx.globalAlpha = Math.min(1, this.life * 2);
    g.ctx.translate(Math.round(this.x - g.camX), Math.round(this.y - g.camY - this.z));
    g.ctx.rotate(this.angle);
    g.ctx.drawImage(img, -img.width / 2, -img.height / 2);
    g.ctx.restore();
  }
}

// ---------------------------------------------------------------------------

export class Explosion extends Entity {
  private timer = 0;
  private readonly duration = 0.42;
  private radius: number;
  private damage: number;
  private hitSet = new Set<Entity>();

  constructor(x: number, y: number, damage: number, radius = 26) {
    super();
    this.x = x;
    this.y = y;
    this.damage = damage;
    this.radius = radius;
    this.ghost = true;
    this.team = 'neutral';
    this.layer = 3;
  }

  override update(dt: number, scene: Scene): void {
    this.animTime += dt;
    this.timer += dt;
    if (this.timer >= this.duration) {
      this.dead = true;
      return;
    }

    // Damage lands on the first frame only.
    if (this.timer - dt <= 0) {
      scene.audio.play('bomb');
      scene.effects.addShake(4.5);
      scene.effects.burst(this.x, this.y - 6, 22, PAL.fireLight, { speed: 150, life: 0.5 });

      for (const e of scene.entities) {
        if (e.dead || this.hitSet.has(e)) continue;
        if (e.team !== 'enemy') continue;
        if (Math.hypot(e.x - this.x, e.y - this.y) > this.radius) continue;
        this.hitSet.add(e);
        scene.damageEnemy(e, this.damage, this.x, this.y, 220);
      }
      // Bombs hurt the player too, at reduced force.
      if (!scene.player.dead && Math.hypot(scene.player.x - this.x, scene.player.y - this.y) < this.radius) {
        scene.player.takeDamage(2, scene, this.x, this.y, 200);
      }

      // Break tiles in a cross around the blast.
      const gx = Math.floor(this.x / TILE);
      const gy = Math.floor(this.y / TILE);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 1 && !(dx === 0 && dy === 0)) continue;
          if (scene.world.blastTile(gx + dx, gy + dy)) {
            scene.effects.burst((gx + dx) * TILE + 8, (gy + dy) * TILE + 8, 10, PAL.stoneLight, { speed: 90 });
            scene.onSecretFound();
          }
        }
      }
      scene.breakPropsNear(this.x, this.y, this.radius);
    }
  }

  override draw(g: Gfx): void {
    const frames = g.art.fx.explosion;
    const i = Math.min(frames.length - 1, Math.floor((this.timer / this.duration) * frames.length));
    const img = frames[i];
    g.ctx.drawImage(img, Math.round(this.x - g.camX - img.width / 2), Math.round(this.y - g.camY - img.height / 2 - 6));
  }
}

// ---------------------------------------------------------------------------

export class Bomb extends Entity {
  private fuse = 1.9;
  private damage: number;

  constructor(x: number, y: number, damage: number) {
    super();
    this.x = x;
    this.y = y;
    this.damage = damage;
    this.team = 'neutral';
    this.w = 10;
    this.h = 8;
    this.solidBody = false;
  }

  override update(dt: number, scene: Scene): void {
    this.tickCommon(dt);
    this.fuse -= dt;
    // Friction, in case it was set down while moving.
    this.vx *= Math.pow(0.01, dt);
    this.vy *= Math.pow(0.01, dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.fuse <= 0) {
      scene.spawn(new Explosion(this.x, this.y, this.damage));
      this.dead = true;
    }
  }

  override draw(g: Gfx): void {
    this.drawShadow(g, 11);
    const frames = g.art.fx.bombLive;
    // Flash faster as the fuse burns down.
    const rate = this.fuse < 0.6 ? 18 : this.fuse < 1.2 ? 9 : 4;
    const frame = frames[Math.floor(this.animTime * rate) % frames.length];
    g.ctx.drawImage(frame, Math.round(this.x - g.camX - 8), Math.round(this.y - g.camY - 15));
  }
}

// ---------------------------------------------------------------------------

/** Brief crescent drawn where the sword swept; purely cosmetic. */
export class SlashFx extends Entity {
  private timer = 0;
  private readonly duration = 0.18;
  private angle: number;

  constructor(x: number, y: number, dir: Dir) {
    super();
    this.x = x;
    this.y = y;
    this.ghost = true;
    this.layer = 5;
    const v = DIR_VECTORS[dir];
    this.angle = Math.atan2(v.y, v.x) + Math.PI / 2;
  }

  override update(dt: number): void {
    this.timer += dt;
    if (this.timer >= this.duration) this.dead = true;
  }

  override draw(g: Gfx): void {
    const frames = g.art.fx.slash;
    const i = Math.min(frames.length - 1, Math.floor((this.timer / this.duration) * frames.length));
    g.ctx.save();
    g.ctx.translate(Math.round(this.x - g.camX), Math.round(this.y - g.camY - 8));
    g.ctx.rotate(this.angle);
    g.ctx.drawImage(frames[i], -12, -12);
    g.ctx.restore();
  }
}

/** Rising sparkles used for secrets, chests and level-ups. */
export class Sparkles extends Entity {
  private timer = 0;
  private duration: number;
  private color: string;

  constructor(x: number, y: number, duration = 0.8, color: string = PAL.uiAccent) {
    super();
    this.x = x;
    this.y = y;
    this.ghost = true;
    this.layer = 6;
    this.duration = duration;
    this.color = color;
  }

  override update(dt: number, scene: Scene): void {
    this.timer += dt;
    if (rng.chance(dt * 40)) {
      scene.effects.rise(this.x, this.y - 4, 1, this.color);
    }
    if (this.timer >= this.duration) this.dead = true;
  }

  override draw(g: Gfx): void {
    const frames = g.art.fx.sparkle;
    const frame = frames[Math.floor(this.timer * 16) % frames.length];
    g.ctx.save();
    g.ctx.globalAlpha = withAlphaFactor(1 - this.timer / this.duration);
    g.ctx.drawImage(frame, Math.round(this.x - g.camX - 4), Math.round(this.y - g.camY - 12));
    g.ctx.restore();
  }
}

function withAlphaFactor(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Convenience for the fade used by several effects. */
export const FADE = (v: number) => withAlpha(PAL.white, withAlphaFactor(v));
