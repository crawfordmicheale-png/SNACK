/**
 * Ground drops. Hearts, rupees and magic top up resources directly; item
 * drops carry a full rolled `ItemStack` into the satchel.
 */
import { RARITY_COLORS } from '../../art/palette';
import type { IconName } from '../../art/icons';
import { rectsOverlap } from '../../engine/math';
import { rng } from '../../engine/rng';
import { Entity, type Gfx } from '../entity';
import { itemDef } from '../items/itemdefs';
import { stackName, type ItemStack } from '../items/loot';
import type { Scene } from '../scene';

export type PickupKind = 'heart' | 'rupee' | 'magic' | 'item';

export class Pickup extends Entity {
  kind: PickupKind;
  amount: number;
  stack: ItemStack | null;
  /** Seconds before the drop despawns; item drops never expire. */
  private life: number;
  /** Short delay before the player can collect, so drops read as drops. */
  private armTime = 0.25;
  private hoverSeed = rng.next() * Math.PI * 2;
  private magnetized = false;

  constructor(x: number, y: number, kind: PickupKind, amount = 1, stack: ItemStack | null = null) {
    super();
    this.x = x;
    this.y = y;
    this.kind = kind;
    this.amount = amount;
    this.stack = stack;
    this.team = 'neutral';
    this.ghost = true;
    this.w = 12;
    this.h = 10;
    this.z = 6;
    this.life = kind === 'item' ? Number.POSITIVE_INFINITY : 12;
    // Small initial scatter so multiple drops separate.
    const a = rng.next() * Math.PI * 2;
    this.vx = Math.cos(a) * rng.range(12, 34);
    this.vy = Math.sin(a) * rng.range(8, 22);
  }

  private icon(): IconName {
    switch (this.kind) {
      case 'heart':
        return 'heart';
      case 'rupee':
        return 'rupee';
      case 'magic':
        return 'shard';
      default:
        return this.stack ? itemDef(this.stack.defId).icon : 'rupee';
    }
  }

  override update(dt: number, scene: Scene): void {
    this.tickCommon(dt);
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    if (this.armTime > 0) this.armTime -= dt;

    // Settle the initial scatter.
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= Math.pow(0.02, dt);
    this.vy *= Math.pow(0.02, dt);
    this.z = 6 + Math.sin(scene.time * 3.4 + this.hoverSeed) * 1.6;

    const player = scene.player;
    if (!player || player.dead) return;

    // Loot Magnet pulls drops in once they are armed.
    if (scene.progression.has('magnet') && this.armTime <= 0) {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 72) {
        this.magnetized = true;
        const pull = 220 * dt * (1 - d / 90);
        this.x += (dx / (d || 1)) * pull;
        this.y += (dy / (d || 1)) * pull;
      }
    }

    if (this.armTime <= 0 && rectsOverlap(this.hitbox(), player.hitbox())) {
      this.collect(scene);
    }
  }

  private collect(scene: Scene): void {
    switch (this.kind) {
      case 'heart':
        scene.player.heal(this.amount * 2);
        scene.audio.play('heart');
        scene.effects.rise(this.x, this.y - 6, 4, RARITY_COLORS.common);
        break;
      case 'rupee':
        scene.addRupees(this.amount);
        scene.audio.play('rupee');
        break;
      case 'magic':
        scene.player.restoreMagic(this.amount);
        scene.audio.play('pickup');
        break;
      case 'item': {
        if (!this.stack) break;
        const result = scene.giveItem(this.stack);
        if (!result) {
          // Satchel is full — leave the drop on the ground.
          this.armTime = 0.6;
          scene.toast('Your satchel is full.');
          scene.audio.play('error');
          return;
        }
        break;
      }
    }
    this.dead = true;
  }

  override draw(g: Gfx): void {
    this.drawShadow(g, 10);
    const icon = g.art.icons.get(this.icon());
    const dx = Math.round(this.x - g.camX - 8);
    const dy = Math.round(this.y - g.camY - 14 - this.z);

    if (this.kind === 'item' && this.stack) {
      // Rarity halo so good drops read at a glance.
      const color = RARITY_COLORS[this.stack.rarity];
      const pulse = 0.4 + Math.sin(g.time * 5 + this.hoverSeed) * 0.18;
      g.ctx.save();
      g.ctx.globalAlpha = pulse;
      g.ctx.fillStyle = color;
      g.ctx.beginPath();
      g.ctx.ellipse(this.x - g.camX, this.y - g.camY - 2, 8, 4, 0, 0, Math.PI * 2);
      g.ctx.fill();
      g.ctx.restore();
    }

    if (this.magnetized) {
      g.ctx.save();
      g.ctx.globalAlpha = 0.5;
      g.ctx.drawImage(icon, dx, dy + 2);
      g.ctx.restore();
    }
    g.ctx.drawImage(icon, dx, dy);
  }

  /** Label shown when the player walks over an item drop. */
  label(): string | null {
    return this.kind === 'item' && this.stack ? stackName(this.stack) : null;
  }
}
