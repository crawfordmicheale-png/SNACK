/**
 * Interactive scenery: chests, pots, signposts, villagers, shop counters and
 * the bed you sleep in to save.
 */
import { PAL, RARITY_COLORS, withAlpha } from '../../art/palette';
import { rng } from '../../engine/rng';
import { Entity, type Gfx } from '../entity';
import { itemDef } from '../items/itemdefs';
import { makeStack, rollLoot, stackName, type ItemStack } from '../items/loot';
import type { Scene } from '../scene';
import { Pickup } from './pickups';
import { Sparkles } from './projectiles';

/** Anything the player can press E on. */
export abstract class Prop extends Entity {
  spawnIndex = -1;
  /** Shown in the interaction prompt. */
  promptLabel = 'Examine';

  constructor(x: number, y: number) {
    super();
    this.x = x;
    this.y = y;
    this.team = 'neutral';
  }

  /** Returns true if the interaction was handled. */
  abstract interact(scene: Scene): boolean;

  override update(dt: number, _scene: Scene): void {
    this.tickCommon(dt);
  }
}

// ---------------------------------------------------------------------------

export class Chest extends Prop {
  opened = false;
  /** 'random' rolls the loot table; anything else is a specific item id. */
  private lootId: string;
  private tier: number;
  private big: boolean;

  constructor(x: number, y: number, lootId: string, tier = 2, big = false) {
    super(x, y);
    this.lootId = lootId;
    this.tier = tier;
    this.big = big;
    this.w = 14;
    this.h = 11;
    this.solidBody = true;
    this.promptLabel = 'Open';
  }

  private rollContents(scene: Scene): ItemStack {
    if (this.lootId === 'random') {
      return rollLoot(this.tier, scene.player.stats.luck ?? 0, rng);
    }
    const def = itemDef(this.lootId);
    const count = def.category === 'consumable' ? (this.lootId === 'bomb' ? 8 : this.lootId === 'arrow' ? 20 : 1) : 1;
    return makeStack(this.lootId, count);
  }

  override interact(scene: Scene): boolean {
    if (this.opened) {
      scene.toast('Empty.');
      return true;
    }
    const stack = this.rollContents(scene);
    if (!scene.giveItem(stack)) {
      scene.toast('Your satchel is full.');
      scene.audio.play('error');
      return true;
    }
    this.opened = true;
    scene.consumeSpawn(this);
    scene.audio.play(this.big ? 'secret' : 'chest');
    scene.spawn(new Sparkles(this.x, this.y - 12, this.big ? 1.6 : 0.9, RARITY_COLORS[stack.rarity]));
    scene.effects.rise(this.x, this.y - 6, 10, RARITY_COLORS[stack.rarity]);
    scene.showItemGet(stack, this.big);
    return true;
  }

  override draw(g: Gfx): void {
    this.drawShadow(g, 14);
    const icon = g.art.icons.get(this.opened ? 'chestOpen' : 'chestClosed');
    const bob = this.opened ? 0 : Math.sin(g.time * 2 + this.x) * 0.4;
    g.ctx.drawImage(icon, Math.round(this.x - g.camX - 8), Math.round(this.y - g.camY - 15 + bob));

    if (!this.opened && this.big) {
      // Unmissable glow on the reward chests.
      g.ctx.save();
      g.ctx.globalAlpha = 0.18 + Math.sin(g.time * 3.4) * 0.1;
      g.ctx.fillStyle = PAL.uiAccent;
      g.ctx.beginPath();
      g.ctx.ellipse(this.x - g.camX, this.y - g.camY - 6, 14, 9, 0, 0, Math.PI * 2);
      g.ctx.fill();
      g.ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------

export class Pot extends Prop {
  constructor(x: number, y: number) {
    super(x, y);
    this.w = 12;
    this.h = 10;
    this.solidBody = true;
    this.hp = 1;
    this.promptLabel = 'Lift';
  }

  /** Pots have no dialogue; interacting just smashes them. */
  override interact(scene: Scene): boolean {
    this.smash(scene);
    return true;
  }

  smash(scene: Scene): void {
    if (this.dead) return;
    this.dead = true;
    scene.consumeSpawn(this);
    scene.audio.play('hit');
    scene.effects.burst(this.x, this.y - 6, 12, PAL.bronze, { speed: 110, life: 0.45 });

    // Pots are the game's small-change dispenser.
    const roll = rng.next();
    if (roll < 0.3) scene.spawn(new Pickup(this.x, this.y, 'rupee', rng.int(1, 3)));
    else if (roll < 0.45) scene.spawn(new Pickup(this.x, this.y, 'heart'));
    else if (roll < 0.52) scene.spawn(new Pickup(this.x, this.y, 'magic', 12));
    else if (roll < 0.58) scene.spawn(new Pickup(this.x, this.y, 'item', 1, rollLoot(1, 0, rng)));
  }

  override draw(g: Gfx): void {
    this.drawShadow(g, 12);
    g.ctx.drawImage(g.art.icons.get('pot'), Math.round(this.x - g.camX - 8), Math.round(this.y - g.camY - 14));
  }
}

// ---------------------------------------------------------------------------

export class SignPost extends Prop {
  private textKey: string;

  constructor(x: number, y: number, textKey: string) {
    super(x, y);
    this.textKey = textKey;
    this.w = 12;
    this.h = 8;
    this.solidBody = true;
    this.promptLabel = 'Read';
  }

  override interact(scene: Scene): boolean {
    scene.readSign(this.textKey);
    return true;
  }

  override draw(g: Gfx): void {
    this.drawShadow(g, 12);
    const x = Math.round(this.x - g.camX);
    const y = Math.round(this.y - g.camY);
    const ctx = g.ctx;
    ctx.fillStyle = PAL.woodDark;
    ctx.fillRect(x - 1, y - 8, 2, 8);
    ctx.fillStyle = PAL.woodDark;
    ctx.fillRect(x - 7, y - 17, 14, 10);
    ctx.fillStyle = PAL.woodLight;
    ctx.fillRect(x - 6, y - 16, 12, 8);
    ctx.fillStyle = PAL.woodDark;
    ctx.fillRect(x - 4, y - 14, 8, 1);
    ctx.fillRect(x - 4, y - 12, 6, 1);
    ctx.fillRect(x - 4, y - 10, 7, 1);
  }
}

// ---------------------------------------------------------------------------

export type NpcId =
  | 'elder'
  | 'smith'
  | 'child'
  | 'elderIndoors'
  | 'smithIndoors'
  | 'herbalist'
  | 'mirror'
  | 'miller'
  | 'millerIndoors'
  | 'cal';

const NPC_COLORS: Record<NpcId, { robe: string; trim: string; hair: string }> = {
  elder: { robe: '#6a5ca8', trim: '#9c8fd6', hair: PAL.white },
  elderIndoors: { robe: '#6a5ca8', trim: '#9c8fd6', hair: PAL.white },
  smith: { robe: '#8a4a2a', trim: '#c2703f', hair: '#3a2a1a' },
  smithIndoors: { robe: '#8a4a2a', trim: '#c2703f', hair: '#3a2a1a' },
  child: { robe: '#3f8ac0', trim: '#79c0e8', hair: PAL.hair },
  herbalist: { robe: '#3f8a5a', trim: '#6fc48a', hair: '#b04a7a' },
  mirror: { robe: PAL.steelDark, trim: PAL.steelLight, hair: PAL.hair },
  miller: { robe: '#8a7a3a', trim: '#c4b46a', hair: '#6a4a22' },
  millerIndoors: { robe: '#8a7a3a', trim: '#c4b46a', hair: '#6a4a22' },
  cal: { robe: '#4a6a8a', trim: '#7aa0c0', hair: PAL.hairDark },
};

export class Npc extends Prop {
  readonly npcId: NpcId;
  private bobSeed = rng.next() * 6;

  constructor(x: number, y: number, npcId: NpcId) {
    super(x, y);
    this.npcId = npcId;
    this.w = 12;
    this.h = 10;
    this.solidBody = true;
    this.promptLabel = 'Talk';
  }

  override interact(scene: Scene): boolean {
    scene.talkTo(this.npcId);
    return true;
  }

  override update(dt: number, scene: Scene): void {
    super.update(dt, scene);
    // Face the player when they are close enough to talk.
    const p = scene.player;
    if (Math.hypot(p.x - this.x, p.y - this.y) < 40) {
      this.facing = Math.abs(p.x - this.x) > Math.abs(p.y - this.y) ? (p.x < this.x ? 'left' : 'right') : p.y < this.y ? 'up' : 'down';
    }
  }

  override draw(g: Gfx): void {
    this.drawShadow(g, 12);
    const c = NPC_COLORS[this.npcId];
    const ctx = g.ctx;
    const x = Math.round(this.x - g.camX);
    const bob = Math.sin(g.time * 2.2 + this.bobSeed) < 0 ? 0 : 1;
    const y = Math.round(this.y - g.camY) - bob;

    // Robe.
    ctx.fillStyle = c.robe;
    ctx.fillRect(x - 5, y - 12, 10, 12);
    ctx.fillStyle = c.trim;
    ctx.fillRect(x - 5, y - 12, 10, 1);
    ctx.fillRect(x - 5, y - 4, 10, 1);
    // Head.
    ctx.fillStyle = PAL.skin;
    ctx.fillRect(x - 4, y - 19, 8, 7);
    ctx.fillStyle = c.hair;
    ctx.fillRect(x - 5, y - 20, 10, 3);
    ctx.fillRect(x - 5, y - 17, 1, 4);
    ctx.fillRect(x + 4, y - 17, 1, 4);
    // Eyes, unless facing away.
    if (this.facing !== 'up') {
      ctx.fillStyle = PAL.black;
      if (this.facing === 'left') {
        ctx.fillRect(x - 3, y - 16, 2, 2);
      } else if (this.facing === 'right') {
        ctx.fillRect(x + 1, y - 16, 2, 2);
      } else {
        ctx.fillRect(x - 3, y - 16, 2, 2);
        ctx.fillRect(x + 1, y - 16, 2, 2);
      }
    }
  }
}

// ---------------------------------------------------------------------------

export class ShopCounter extends Prop {
  readonly stock: string;

  constructor(x: number, y: number, stock = 'general') {
    super(x, y);
    this.stock = stock;
    this.w = 14;
    this.h = 10;
    this.solidBody = true;
    this.promptLabel = 'Trade';
  }

  override interact(scene: Scene): boolean {
    scene.openShop(this.stock);
    return true;
  }

  override draw(g: Gfx): void {
    this.drawShadow(g, 14);
    const ctx = g.ctx;
    const x = Math.round(this.x - g.camX);
    const y = Math.round(this.y - g.camY);
    ctx.fillStyle = PAL.woodDark;
    ctx.fillRect(x - 8, y - 12, 16, 12);
    ctx.fillStyle = PAL.wood;
    ctx.fillRect(x - 7, y - 11, 14, 9);
    ctx.fillStyle = PAL.woodLight;
    ctx.fillRect(x - 8, y - 13, 16, 2);
    // A few wares on the counter.
    ctx.drawImage(g.art.icons.get('potion'), x - 7, y - 22);
    ctx.drawImage(g.art.icons.get('arrow'), x + 1, y - 22);
    // Coin glint.
    ctx.fillStyle = withAlpha(PAL.goldLight, 0.6 + Math.sin(g.time * 4) * 0.3);
    ctx.fillRect(x - 1, y - 9, 2, 2);
  }
}

// ---------------------------------------------------------------------------

export class Bed extends Prop {
  constructor(x: number, y: number) {
    super(x, y);
    this.w = 26;
    this.h = 14;
    this.solidBody = true;
    this.promptLabel = 'Rest';
  }

  override interact(scene: Scene): boolean {
    scene.restAtBed();
    return true;
  }

  override draw(g: Gfx): void {
    const ctx = g.ctx;
    const x = Math.round(this.x - g.camX);
    const y = Math.round(this.y - g.camY);
    ctx.fillStyle = PAL.woodDark;
    ctx.fillRect(x - 13, y - 22, 26, 22);
    ctx.fillStyle = PAL.wood;
    ctx.fillRect(x - 12, y - 21, 24, 20);
    ctx.fillStyle = PAL.blood;
    ctx.fillRect(x - 11, y - 14, 22, 13);
    ctx.fillStyle = PAL.bloodLight;
    ctx.fillRect(x - 11, y - 14, 22, 2);
    ctx.fillStyle = PAL.plaster;
    ctx.fillRect(x - 10, y - 20, 20, 6);
    ctx.fillStyle = PAL.plasterDark;
    ctx.fillRect(x - 10, y - 15, 20, 1);
  }
}

// ---------------------------------------------------------------------------

/** Label used above a prop when the player is standing in range. */
export function propPrompt(prop: Prop): string {
  if (prop instanceof Chest) return prop.opened ? 'Empty' : 'Open';
  return prop.promptLabel;
}

/** Text shown for an item pickup banner. */
export function itemGetLine(stack: ItemStack): string {
  const count = stack.count > 1 ? ` x${stack.count}` : '';
  return `${stackName(stack)}${count}`;
}
