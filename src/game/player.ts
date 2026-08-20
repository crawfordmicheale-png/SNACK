/**
 * The hero. Movement, sword (tap, charge, spin), shield, dash, item use and
 * the resource bookkeeping the HUD reads from.
 */
import type { AnimSet } from '../art/actors';
import { PAL, withAlpha } from '../art/palette';
import type { Input } from '../engine/input';
import { clamp, DIR_VECTORS, rectsOverlap, vectorToDir, type Rect } from '../engine/math';
import { TILE } from '../engine/screen';
import { Entity, groundAt, moveWithCollision, slideAroundCorners, type Gfx } from './entity';
import { itemDef, type StatBlock } from './items/itemdefs';
import type { Scene } from './scene';
import { Arrow, Bomb, Boomerang, SlashFx, SwordBeam } from './entities/projectiles';
import { Enemy } from './entities/enemies';

const BASE_SPEED = 74;
const DASH_SPEED = 210;
const SWING_TIME = 0.26;
const SPIN_TIME = 0.55;
const CHARGE_TIME = 0.62;
const SPIN_COST = 12;

type Action = 'idle' | 'walk' | 'swing' | 'spin' | 'hurt' | 'dash' | 'dead';

export class Player extends Entity {
  action: Action = 'idle';
  /** Half-hearts. */
  hearts = 6;
  maxHearts = 6;
  magic = 0;
  maxMagic = 0;

  /** Cached equipment + mastery stats, refreshed by the scene. */
  stats: StatBlock = {};

  private actionTimer = 0;
  private chargeTime = 0;
  private charging = false;
  private blockHeld = false;
  private dashCharge = 0;
  private dashTimer = 0;
  private dashDirX = 0;
  private dashDirY = 0;
  /** Enemies already struck by the current swing. */
  private swingHits = new Set<Entity>();
  private beamFired = false;
  /** Prevents a door from re-triggering while standing on it. */
  private linkLockTile = -1;
  private stepTimer = 0;
  /** Seconds of ward (full immunity) from an Ether. */
  private ward = 0;
  /** Set while the pit-fall recovery animation plays. */
  private falling = 0;
  /** Where to put the player back after a pit or a room reset. */
  respawnX = 0;
  respawnY = 0;

  constructor(x: number, y: number) {
    super();
    this.x = x;
    this.y = y;
    this.respawnX = x;
    this.respawnY = y;
    this.team = 'player';
    this.w = 11;
    this.h = 9;
    this.facing = 'down';
  }

  // -------------------------------------------------------------------------
  // Resources
  // -------------------------------------------------------------------------

  heal(halfHearts: number): void {
    this.hearts = Math.min(this.maxHearts, this.hearts + halfHearts);
  }

  restoreMagic(amount: number): void {
    this.magic = Math.min(this.maxMagic, this.magic + amount);
  }

  spendMagic(amount: number): boolean {
    if (this.magic < amount) return false;
    this.magic -= amount;
    return true;
  }

  grantWard(seconds: number): void {
    this.ward = Math.max(this.ward, seconds);
  }

  /** Recomputes derived maxima; called whenever gear or mastery changes. */
  applyStats(stats: StatBlock, baseHearts: number, baseMagic: number): void {
    this.stats = stats;
    const previousMax = this.maxHearts;
    this.maxHearts = Math.max(2, baseHearts + (stats.maxHearts ?? 0) * 2);
    this.maxMagic = Math.max(0, baseMagic + (stats.magic ?? 0));
    // Gaining containers should not silently leave you at low health.
    if (this.maxHearts > previousMax) this.hearts += this.maxHearts - previousMax;
    this.hearts = clamp(this.hearts, 0, this.maxHearts);
    this.magic = clamp(this.magic, 0, this.maxMagic);
  }

  get moveSpeed(): number {
    return BASE_SPEED * (1 + (this.stats.speed ?? 0) / 100);
  }

  get swordDamage(): number {
    return Math.max(1, 1 + (this.stats.attack ?? 0));
  }

  /** True while the shield is up and facing roughly toward (vx, vy). */
  isBlocking(vx: number, vy: number): boolean {
    if (!this.blockHeld || this.action === 'swing' || this.action === 'spin') return false;
    const v = DIR_VECTORS[this.facing];
    const len = Math.hypot(vx, vy) || 1;
    // Incoming direction must be roughly opposite the way we are facing.
    return (-vx / len) * v.x + (-vy / len) * v.y > 0.35;
  }

  override takeDamage(amount: number, scene: Scene, fromX?: number, fromY?: number, force = 180): boolean {
    if (this.dead || this.invuln > 0 || this.ward > 0 || this.falling > 0) return false;

    const defense = this.stats.defense ?? 0;
    // Defense always leaves at least a half-heart of damage getting through.
    const taken = Math.max(1, amount - Math.floor(defense / 2));

    this.hearts -= taken;
    this.flash = 0.2;
    this.invuln = 1.0;
    this.action = 'hurt';
    this.actionTimer = 0.28;
    this.charging = false;
    this.chargeTime = 0;

    if (fromX !== undefined && fromY !== undefined) this.applyKnockback(fromX, fromY, force);

    scene.audio.play('hurt');
    scene.effects.addShake(3);
    scene.effects.flashScreen(PAL.uiBad, 0.28, 4);
    scene.effects.spray(this.x, this.y - 10, this.x - (fromX ?? this.x), this.y - (fromY ?? this.y), 8, PAL.blood);

    if (this.hearts <= 0) {
      this.hearts = 0;
      this.onPlayerDeath(scene);
    }
    return true;
  }

  private onPlayerDeath(scene: Scene): void {
    // A bottled fairy spends itself rather than letting you fall.
    if (scene.inventory.consume('fairy', 1)) {
      this.hearts = Math.min(this.maxHearts, Math.max(6, Math.floor(this.maxHearts / 2)));
      this.invuln = 2;
      scene.audio.play('levelup');
      scene.effects.rise(this.x, this.y - 10, 20, PAL.ice);
      scene.toast('A fairy revives you!');
      return;
    }
    this.action = 'dead';
    this.dead = true;
    scene.audio.play('die');
    scene.onPlayerDied();
  }

  /** Puts the player back on their feet after a game over or a pit. */
  revive(hearts: number): void {
    this.dead = false;
    this.hearts = Math.min(this.maxHearts, hearts);
    this.action = 'idle';
    this.actionTimer = 0;
    this.invuln = 1.5;
    this.kx = 0;
    this.ky = 0;
    this.falling = 0;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  override update(dt: number, scene: Scene): void {
    this.tickCommon(dt);
    if (this.ward > 0) this.ward -= dt;
    if (this.dead) return;

    if (this.falling > 0) {
      this.falling -= dt;
      this.z = 0;
      if (this.falling <= 0) {
        this.x = this.respawnX;
        this.y = this.respawnY;
        this.invuln = 1.2;
      }
      return;
    }

    // Magic regenerates slowly from the Arcane track.
    const regen = (this.stats.magicRegen ?? 0) * 1.4;
    if (regen > 0) this.restoreMagic(regen * dt);

    const input = scene.input;
    if (this.actionTimer > 0) this.actionTimer -= dt;

    this.updateShield(input);
    this.updateAttack(dt, input, scene);
    this.updateDash(dt, input, scene);
    this.updateMovement(dt, input, scene);
    this.updateTileEffects(scene);
    this.checkLinks(scene);
  }

  private updateShield(input: Input): void {
    const hasShield = !!this.stats.defense || true;
    this.blockHeld = hasShield && input.isDown('shield') && this.action !== 'swing' && this.action !== 'spin' && this.action !== 'dash';
  }

  private updateAttack(dt: number, input: Input, scene: Scene): void {
    const canSpin = scene.progression.has('spin');

    // Charging: hold attack to wind up a spin once the Blade track allows it.
    if (canSpin && input.isDown('attack') && (this.action === 'idle' || this.action === 'walk') && !this.charging) {
      this.chargeTime += dt;
      if (this.chargeTime > 0.12) this.charging = true;
    } else if (this.charging) {
      this.chargeTime += dt;
      if (!input.isDown('attack')) {
        // Release: spin if fully charged and magic allows, otherwise a normal cut.
        if (this.chargeTime >= CHARGE_TIME && this.magic >= SPIN_COST) {
          this.spendMagic(SPIN_COST);
          this.startSpin(scene);
        } else {
          this.startSwing(scene);
        }
        this.charging = false;
        this.chargeTime = 0;
      } else if (this.chargeTime >= CHARGE_TIME && Math.floor(this.chargeTime * 12) % 2 === 0) {
        scene.effects.rise(this.x, this.y - 8, 1, PAL.ice);
      }
    }

    if (!canSpin && input.consumePress('attack') && (this.action === 'idle' || this.action === 'walk')) {
      this.startSwing(scene);
    }
    if (canSpin && this.chargeTime === 0 && input.consumePress('attack') && (this.action === 'idle' || this.action === 'walk')) {
      // Instant tap before charge accumulates.
      this.startSwing(scene);
    }

    if (this.action === 'swing' || this.action === 'spin') {
      this.applySwordHits(scene);
      if (this.actionTimer <= 0) {
        this.action = 'idle';
        this.swingHits.clear();
      }
    } else if (this.action === 'hurt' && this.actionTimer <= 0) {
      this.action = 'idle';
    }
  }

  private startSwing(scene: Scene): void {
    this.action = 'swing';
    this.actionTimer = SWING_TIME;
    this.swingHits.clear();
    this.beamFired = false;
    scene.audio.play('swing');
    const v = DIR_VECTORS[this.facing];
    scene.spawn(new SlashFx(this.x + v.x * 10, this.y + v.y * 6, this.facing));

    // Sword Beam: rewarded for keeping your hearts topped up.
    if (scene.progression.has('beam') && this.hearts >= this.maxHearts && !this.beamFired) {
      this.beamFired = true;
      scene.spawn(new SwordBeam(this.x + v.x * 12, this.y - 8 + v.y * 8, this.facing, this.swordDamage));
    }
  }

  private startSpin(scene: Scene): void {
    this.action = 'spin';
    this.actionTimer = SPIN_TIME;
    this.swingHits.clear();
    scene.audio.play('spin');
    scene.effects.addShake(2);
    scene.effects.rise(this.x, this.y - 8, 8, PAL.ice);
  }

  /** The arc in front of the hero that the blade sweeps this frame. */
  private swordBox(): Rect {
    if (this.action === 'spin') {
      return { x: this.x - 22, y: this.y - 30, w: 44, h: 40 };
    }
    const v = DIR_VECTORS[this.facing];
    const reach = 18;
    const width = 20;
    // Torso height — hurtboxes sit above the feet, so the arc must too.
    const bodyY = this.y - 7;
    if (v.x !== 0) {
      return { x: this.x + (v.x > 0 ? 3 : -3 - reach), y: bodyY - width / 2, w: reach, h: width };
    }
    return { x: this.x - width / 2, y: v.y > 0 ? bodyY : bodyY - reach, w: width, h: reach };
  }

  private applySwordHits(scene: Scene): void {
    const box = this.swordBox();
    const crit = (this.stats.crit ?? 0) / 100;

    for (const e of scene.entities) {
      if (e.dead || this.swingHits.has(e)) continue;
      if (e.team !== 'enemy') continue;
      if (!rectsOverlap(box, e.hurtbox())) continue;

      // A stalfos shield deflects hits that land on its facing.
      if (e instanceof Enemy && e.blocksFrom(this.x, this.y)) {
        this.swingHits.add(e);
        scene.audio.play('block');
        scene.effects.burst(e.x, e.y - 10, 6, PAL.steelLight, { speed: 80, life: 0.3 });
        continue;
      }

      this.swingHits.add(e);
      const isCrit = Math.random() < crit;
      const damage = this.swordDamage * (isCrit ? 2 : 1);
      const force = 150 * (1 + (this.stats.force ?? 0) / 100) * (this.action === 'spin' ? 1.5 : 1);
      scene.damageEnemy(e, damage, this.x, this.y, force, isCrit);
    }

    // Cut grass, bushes and pots in the same sweep.
    const gx0 = Math.floor(box.x / TILE);
    const gx1 = Math.floor((box.x + box.w) / TILE);
    const gy0 = Math.floor(box.y / TILE);
    const gy1 = Math.floor((box.y + box.h) / TILE);
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        if (scene.world.cutTile(gx, gy)) {
          scene.onGrassCut(gx, gy);
        }
      }
    }
    scene.breakPropsIn(box);
  }

  private updateDash(dt: number, input: Input, scene: Scene): void {
    if (!scene.progression.has('dash') && !scene.inventory.has('boots')) return;

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      const res = moveWithCollision(this, this.dashDirX * DASH_SPEED * dt, this.dashDirY * DASH_SPEED * dt, scene);
      scene.effects.dust(this.x, this.y, 1);
      // Barge through enemies and props.
      const box = { x: this.x - 12, y: this.y - 16, w: 24, h: 20 };
      for (const e of scene.entities) {
        if (e.dead || e.team !== 'enemy') continue;
        if (rectsOverlap(box, e.hurtbox())) {
          scene.damageEnemy(e, Math.max(1, this.swordDamage - 1), this.x, this.y, 260);
        }
      }
      scene.breakPropsIn(box);
      if (res.hitX || res.hitY || this.dashTimer <= 0) {
        this.dashTimer = 0;
        this.action = 'idle';
        if (res.hitX || res.hitY) {
          scene.effects.addShake(2);
          scene.effects.dust(this.x, this.y, 8);
        }
      }
      return;
    }

    if (input.isDown('dash') && (this.action === 'idle' || this.action === 'walk')) {
      this.dashCharge += dt;
      if (this.dashCharge > 0.35) {
        const v = DIR_VECTORS[this.facing];
        this.dashDirX = v.x;
        this.dashDirY = v.y;
        this.dashTimer = 0.42;
        this.dashCharge = 0;
        this.action = 'dash';
        scene.audio.play('charge');
        scene.effects.dust(this.x, this.y, 10);
      }
    } else {
      this.dashCharge = 0;
    }
  }

  private updateMovement(dt: number, input: Input, scene: Scene): void {
    // Knockback always applies, even mid-swing.
    if (this.kx !== 0 || this.ky !== 0) {
      moveWithCollision(this, this.kx * dt, this.ky * dt, scene);
    }

    if (this.action === 'swing' || this.action === 'spin' || this.action === 'hurt' || this.action === 'dash') return;

    const move = input.moveVector();
    if (move.x === 0 && move.y === 0) {
      if (this.action === 'walk') this.action = 'idle';
      return;
    }

    this.facing = vectorToDir(move.x, move.y, this.facing);
    this.action = 'walk';

    const ground = groundAt(scene, this.x, this.y);
    const drag = ground.drag ?? 1;
    const speed = this.moveSpeed * drag * (this.blockHeld ? 0.55 : 1);

    const dx = move.x * speed * dt;
    const dy = move.y * speed * dt;
    moveWithCollision(this, dx, dy, scene);
    slideAroundCorners(this, dx, dy, scene);

    // Footstep dust on the beat.
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.stepTimer = 0.26;
      if (drag < 1) scene.effects.dust(this.x, this.y, 2);
    }
  }

  private updateTileEffects(scene: Scene): void {
    const ground = groundAt(scene, this.x, this.y);
    if (ground.hazard && this.invuln <= 0) {
      this.takeDamage(ground.hazard, scene, this.x, this.y + 8, 140);
    }
    if (ground.pit && this.falling <= 0 && this.dashTimer <= 0) {
      this.falling = 0.55;
      scene.audio.play('hurt');
      // Falling costs a half-heart and puts you back at the room entrance.
      this.hearts = Math.max(0, this.hearts - 1);
      if (this.hearts <= 0) this.onPlayerDeath(scene);
    }
  }

  private checkLinks(scene: Scene): void {
    const gx = Math.floor(this.x / TILE);
    const gy = Math.floor(this.y / TILE);
    const tileIndex = gy * 4096 + gx;
    if (tileIndex === this.linkLockTile) return;

    const room = scene.world.roomForTile(gx, gy);
    const localX = gx - (room?.rx ?? 0) * 20;
    const localY = gy - (room?.ry ?? 0) * 13;
    const target = room?.def.links?.[`${localX},${localY}`];
    if (!target) {
      this.linkLockTile = -1;
      return;
    }
    this.linkLockTile = tileIndex;
    scene.travel(target);
  }

  /** Called after a map transition so the arrival tile does not re-fire. */
  lockCurrentLinkTile(): void {
    this.linkLockTile = Math.floor(this.y / TILE) * 4096 + Math.floor(this.x / TILE);
  }

  // -------------------------------------------------------------------------
  // Item use
  // -------------------------------------------------------------------------

  /** Fires whatever is bound to a quick slot. */
  useQuickSlot(index: number, scene: Scene): void {
    if (this.dead || this.action === 'swing' || this.action === 'spin') return;
    const uid = scene.inventory.quick[index];
    if (uid === null) {
      scene.toast('Nothing in that slot.');
      return;
    }
    const stack = scene.inventory.stackByUid(uid);
    if (!stack) {
      scene.inventory.pruneQuick();
      return;
    }
    this.useItem(stack.defId, scene);
  }

  useItem(defId: string, scene: Scene): void {
    const def = itemDef(defId);
    const v = DIR_VECTORS[this.facing];

    switch (def.use) {
      case 'bow': {
        if (!scene.inventory.consume('arrow', 1)) {
          scene.toast('Out of arrows.');
          scene.audio.play('error');
          return;
        }
        const damage = 2 + (this.stats.arrowDamage ?? 0);
        scene.spawn(new Arrow(this.x + v.x * 8, this.y - 8 + v.y * 6, this.facing, damage, scene.progression.has('pierce')));
        scene.audio.play('bow');
        this.action = 'swing';
        this.actionTimer = 0.16;
        this.swingHits.clear();
        break;
      }
      case 'bomb': {
        if (!scene.inventory.consume('bomb', 1)) {
          scene.toast('Out of bombs.');
          scene.audio.play('error');
          return;
        }
        const damage = 6 + (this.stats.bombDamage ?? 0);
        scene.spawn(new Bomb(this.x + v.x * 14, this.y + v.y * 10, damage));
        scene.audio.play('pickup');
        break;
      }
      case 'boomerang': {
        if (scene.hasActiveBoomerang()) return;
        scene.spawn(new Boomerang(this, this.facing, Math.max(1, this.swordDamage - 1)));
        scene.audio.play('boomerang');
        break;
      }
      case 'lantern': {
        if (!this.spendMagic(8)) {
          scene.toast('Not enough magic.');
          scene.audio.play('error');
          return;
        }
        scene.lightLantern();
        break;
      }
      case 'consume': {
        if (!def.effect) return;
        const wouldWaste =
          (def.effect.heal ?? 0) > 0 && this.hearts >= this.maxHearts && !(def.effect.magic && this.magic < this.maxMagic);
        if (wouldWaste) {
          scene.toast('You feel fine already.');
          return;
        }
        if (!scene.inventory.consume(defId, 1)) return;
        if (def.effect.heal) this.heal(def.effect.heal);
        if (def.effect.magic) this.restoreMagic(def.effect.magic);
        if (def.effect.ward) this.grantWard(def.effect.ward);
        scene.audio.play('heart');
        scene.effects.rise(this.x, this.y - 10, 12, def.effect.magic ? PAL.magicLight : PAL.bloodLight);
        break;
      }
      default:
        scene.toast('You cannot use that here.');
    }
  }

  /** Called by the scene when the player falls in a pit. */
  isFalling(): boolean {
    return this.falling > 0;
  }

  // -------------------------------------------------------------------------
  // Draw
  // -------------------------------------------------------------------------

  override draw(g: Gfx): void {
    if (this.dead) return;

    if (this.falling > 0) {
      // Shrink into the hole.
      const t = 1 - this.falling / 0.55;
      const anim = g.art.actors.hero.idle;
      const frame = anim.frames.down[0];
      const scale = Math.max(0.05, 1 - t);
      g.ctx.save();
      g.ctx.globalAlpha = Math.max(0, 1 - t * 0.6);
      g.ctx.translate(this.x - g.camX, this.y - g.camY);
      g.ctx.rotate(t * 3);
      g.ctx.scale(scale, scale);
      g.ctx.drawImage(frame, anim.ox, anim.oy);
      g.ctx.restore();
      return;
    }

    this.drawShadow(g, 13);

    const hero = g.art.actors.hero;
    let anim: AnimSet = hero.idle;
    let fps = 3;

    if (this.action === 'spin') {
      anim = hero.spin;
      fps = 16;
    } else if (this.action === 'swing') {
      anim = hero.attack ?? hero.idle;
      fps = 4 / SWING_TIME;
    } else if (this.blockHeld) {
      anim = hero.shieldSet;
      fps = 1;
    } else if (this.action === 'walk' || this.action === 'dash') {
      anim = hero.walk;
      fps = this.action === 'dash' ? 18 : 8;
    }

    const frames = anim.frames[this.facing] ?? anim.frames.down;
    let index: number;
    if (this.action === 'swing' || this.action === 'spin') {
      const total = this.action === 'swing' ? SWING_TIME : SPIN_TIME;
      const t = 1 - clamp(this.actionTimer / total, 0, 1);
      index = Math.min(frames.length - 1, Math.floor(t * frames.length));
    } else {
      index = Math.floor(this.animTime * fps) % frames.length;
    }

    // Blink while invulnerable.
    const blink = this.invuln > 0 && this.ward <= 0 && Math.floor(this.invuln * 18) % 2 === 0;
    if (blink) g.ctx.globalAlpha = 0.45;
    this.drawFrame(g, frames[index], anim.ox, anim.oy);
    g.ctx.globalAlpha = 1;

    if (this.charging && this.chargeTime >= CHARGE_TIME) {
      // Fully charged: ring the hero so the spin read is obvious.
      g.ctx.save();
      g.ctx.globalAlpha = 0.4 + Math.sin(g.time * 22) * 0.2;
      g.ctx.strokeStyle = PAL.ice;
      g.ctx.lineWidth = 1;
      g.ctx.beginPath();
      g.ctx.ellipse(this.x - g.camX, this.y - g.camY - 8, 13, 15, 0, 0, Math.PI * 2);
      g.ctx.stroke();
      g.ctx.restore();
    }

    if (this.ward > 0) {
      g.ctx.save();
      g.ctx.globalAlpha = 0.28 + Math.sin(g.time * 6) * 0.1;
      g.ctx.fillStyle = withAlpha(PAL.uiGood, 1);
      g.ctx.beginPath();
      g.ctx.ellipse(this.x - g.camX, this.y - g.camY - 9, 12, 15, 0, 0, Math.PI * 2);
      g.ctx.fill();
      g.ctx.restore();
    }
  }
}
