/**
 * Entity base class and shared physics.
 *
 * Positions are in world pixels. `x, y` is the actor's feet — the point that
 * touches the ground — so depth sorting and tile collision both key off the
 * same value, and sprites can hang above it by any amount.
 */
import type { Art } from '../art';
import { PAL, withAlpha } from '../art/palette';
import { TILE } from '../engine/screen';
import { clamp, type Dir, type Rect } from '../engine/math';
import type { Scene } from './scene';
import { tileDef } from '../world/tiledefs';

export interface Gfx {
  ctx: CanvasRenderingContext2D;
  camX: number;
  camY: number;
  art: Art;
  /** Seconds since boot, for shimmer and glow effects. */
  time: number;
}

export type Team = 'player' | 'enemy' | 'neutral';

export abstract class Entity {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  /** Collision box, anchored at the feet. */
  w = 12;
  h = 10;
  /** Height above ground, used for hops and flight. */
  z = 0;
  hp = 1;
  maxHp = 1;
  dead = false;
  facing: Dir = 'down';
  team: Team = 'neutral';
  /** Seconds of damage immunity remaining. */
  invuln = 0;
  /** Seconds of white-flash remaining. */
  flash = 0;
  /** Knockback velocity, decays independently of input. */
  kx = 0;
  ky = 0;
  animTime = 0;
  /** Entities with `solidBody` push the player out instead of overlapping. */
  solidBody = false;
  /** Skip tile collision (flying enemies, projectiles handle their own). */
  ghost = false;
  /** Draw order tiebreaker; higher draws on top at equal y. */
  layer = 0;

  abstract update(dt: number, scene: Scene): void;
  abstract draw(g: Gfx): void;

  /** Axis-aligned collision box in world space. */
  hitbox(): Rect {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }

  /** Slightly generous box used for damage checks. */
  hurtbox(): Rect {
    return this.hitbox();
  }

  centerX(): number {
    return this.x;
  }

  centerY(): number {
    return this.y - this.h / 2 - this.z;
  }

  /** Applies knockback away from a point. */
  applyKnockback(fromX: number, fromY: number, force: number): void {
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    this.kx = (dx / len) * force;
    this.ky = (dy / len) * force;
  }

  /** Returns true if the hit landed. */
  takeDamage(amount: number, scene: Scene, fromX?: number, fromY?: number, force = 120): boolean {
    if (this.dead || this.invuln > 0 || amount <= 0) return false;
    this.hp -= amount;
    this.flash = 0.16;
    this.invuln = 0.4;
    if (fromX !== undefined && fromY !== undefined) this.applyKnockback(fromX, fromY, force);
    if (this.hp <= 0) {
      this.hp = 0;
      this.onDeath(scene);
      this.dead = true;
    }
    return true;
  }

  protected onDeath(_scene: Scene): void {
    /* subclasses hook in */
  }

  /** Decays knockback and timers. Call from `update`. */
  protected tickCommon(dt: number): void {
    this.animTime += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.flash > 0) this.flash -= dt;
    const decay = Math.pow(0.0009, dt);
    this.kx *= decay;
    this.ky *= decay;
    if (Math.abs(this.kx) < 2) this.kx = 0;
    if (Math.abs(this.ky) < 2) this.ky = 0;
  }

  /** Draws the standard elliptical drop shadow under an actor. */
  protected drawShadow(g: Gfx, width = 14): void {
    const img = width > 20 ? g.art.shadowLarge : g.art.shadowSmall;
    const w = width;
    const h = Math.max(5, width * 0.45);
    g.ctx.drawImage(img, Math.round(this.x - g.camX - w / 2), Math.round(this.y - g.camY - h / 2), w, h);
  }

  /**
   * Blits a sprite frame with the actor's flash and hover offsets applied.
   */
  protected drawFrame(g: Gfx, frame: CanvasImageSource, ox: number, oy: number): void {
    const dx = Math.round(this.x - g.camX + ox);
    const dy = Math.round(this.y - g.camY + oy - this.z);
    g.ctx.drawImage(frame, dx, dy);
    if (this.flash > 0) {
      // Additive white wash keyed to the sprite's alpha.
      g.ctx.save();
      g.ctx.globalCompositeOperation = 'lighter';
      g.ctx.globalAlpha = clamp(this.flash * 5, 0, 0.85);
      g.ctx.drawImage(frame, dx, dy);
      g.ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// Tile collision
// ---------------------------------------------------------------------------

export interface CollisionResult {
  hitX: boolean;
  hitY: boolean;
}

/** Tests whether a box overlaps any solid tile. */
export function boxHitsTiles(scene: Scene, box: Rect): boolean {
  const world = scene.world;
  const x0 = Math.floor(box.x / TILE);
  const x1 = Math.floor((box.x + box.w - 0.001) / TILE);
  const y0 = Math.floor(box.y / TILE);
  const y1 = Math.floor((box.y + box.h - 0.001) / TILE);
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      if (world.isSolidTile(gx, gy)) return true;
    }
  }
  return false;
}

/**
 * Moves an entity by (dx, dy), resolving each axis separately so sliding
 * along walls feels right. Returns which axes were blocked.
 */
export function moveWithCollision(entity: Entity, dx: number, dy: number, scene: Scene): CollisionResult {
  const result: CollisionResult = { hitX: false, hitY: false };
  if (entity.ghost) {
    entity.x += dx;
    entity.y += dy;
    return result;
  }

  if (dx !== 0) {
    entity.x += dx;
    if (boxHitsTiles(scene, entity.hitbox())) {
      // Step back, then nudge to the tile edge for a snug fit.
      entity.x -= dx;
      result.hitX = true;
      const step = Math.sign(dx);
      for (let i = 0; i < Math.abs(dx); i++) {
        entity.x += step;
        if (boxHitsTiles(scene, entity.hitbox())) {
          entity.x -= step;
          break;
        }
      }
    }
  }

  if (dy !== 0) {
    entity.y += dy;
    if (boxHitsTiles(scene, entity.hitbox())) {
      entity.y -= dy;
      result.hitY = true;
      const step = Math.sign(dy);
      for (let i = 0; i < Math.abs(dy); i++) {
        entity.y += step;
        if (boxHitsTiles(scene, entity.hitbox())) {
          entity.y -= step;
          break;
        }
      }
    }
  }

  return result;
}

/**
 * Nudges an entity around thin obstacles when it is moving mostly along one
 * axis — the "corner assist" that keeps doorways from feeling sticky.
 */
export function slideAroundCorners(entity: Entity, dx: number, dy: number, scene: Scene): void {
  // Only assists straight-line movement; diagonals already slide on their own.
  const alongX = dx !== 0 && dy === 0;
  const alongY = dy !== 0 && dx === 0;
  if (!alongX && !alongY) return;

  const box = entity.hitbox();
  const ahead: Rect = alongX
    ? { ...box, x: box.x + Math.sign(dx) * 3 }
    : { ...box, y: box.y + Math.sign(dy) * 3 };
  if (!boxHitsTiles(scene, ahead)) return;

  // Look for a clear lane up to `MAX_ASSIST` pixels to either side, and drift
  // toward the nearest one. Both the probe and the body's own footprint have
  // to be clear, so the nudge never pushes the entity into a wall.
  const MAX_ASSIST = 6;
  const STEP = 1.5;
  for (let shift = 1; shift <= MAX_ASSIST; shift++) {
    for (const side of [-1, 1]) {
      const offset = side * shift;
      const probe: Rect = alongX ? { ...ahead, y: ahead.y + offset } : { ...ahead, x: ahead.x + offset };
      const body: Rect = alongX ? { ...box, y: box.y + offset } : { ...box, x: box.x + offset };
      if (boxHitsTiles(scene, probe) || boxHitsTiles(scene, body)) continue;
      const nudge = side * Math.min(shift, STEP);
      if (alongX) entity.y += nudge;
      else entity.x += nudge;
      return;
    }
  }
}

/** Ground effect at an entity's feet: drag from tall grass, hazards, pits. */
export function groundAt(scene: Scene, x: number, y: number) {
  return tileDef(scene.world.rawTileAt(Math.floor(x / TILE), Math.floor(y / TILE)));
}

/** Debug helper: outlines a box in world space. */
export function strokeBox(g: Gfx, box: Rect, color = withAlpha(PAL.uiBad, 0.8)): void {
  g.ctx.strokeStyle = color;
  g.ctx.lineWidth = 1;
  g.ctx.strokeRect(Math.round(box.x - g.camX) + 0.5, Math.round(box.y - g.camY) + 0.5, box.w - 1, box.h - 1);
}
