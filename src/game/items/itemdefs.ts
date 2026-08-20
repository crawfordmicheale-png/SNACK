/**
 * Item catalogue. Definitions are static; the things the player actually
 * carries are `ItemStack` instances, which layer a rolled rarity and affixes
 * on top of a definition.
 */
import type { IconName } from '../../art/icons';
import type { Rarity } from '../../art/palette';

export type ItemCategory = 'weapon' | 'shield' | 'armor' | 'charm' | 'tool' | 'consumable' | 'quest' | 'material';

export type EquipSlot = 'weapon' | 'shield' | 'armor' | 'charm1' | 'charm2';

/** Every stat the game understands. All are additive unless noted. */
export interface StatBlock {
  /** Sword damage in half-hearts. */
  attack?: number;
  /** Flat damage reduction in half-hearts (capped so enemies always chip). */
  defense?: number;
  /** Extra heart containers while equipped. */
  maxHearts?: number;
  /** Percent move speed. */
  speed?: number;
  /** Percent critical chance; crits deal double damage. */
  crit?: number;
  /** Extra magic capacity. */
  magic?: number;
  /** Magic regenerated per second (tenths). */
  magicRegen?: number;
  /** Percent bonus to loot rarity rolls. */
  luck?: number;
  /** Bonus damage for arrows. */
  arrowDamage?: number;
  /** Bonus damage for bombs. */
  bombDamage?: number;
  /** Percent bonus to knockback dealt. */
  force?: number;
}

export interface ItemEffect {
  /** Half-hearts restored. */
  heal?: number;
  /** Magic restored. */
  magic?: number;
  /** Seconds of damage immunity. */
  ward?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  icon: IconName;
  category: ItemCategory;
  /** Floor rarity; loot rolls may push an item above this. */
  rarity: Rarity;
  description: string;
  /** Max per stack; 1 means the item never stacks. */
  stack?: number;
  stats?: StatBlock;
  /** How the item behaves when triggered from a quick slot. */
  use?: 'bow' | 'bomb' | 'boomerang' | 'lantern' | 'consume';
  effect?: ItemEffect;
  /** Base shop price in rupees. Also drives sell value. */
  value?: number;
  /** Never generated as random loot. */
  unique?: boolean;
  /** Cannot be dropped, sold, or scrapped. */
  bound?: boolean;
}

function def(d: ItemDef): ItemDef {
  return d;
}

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  [
    // --------------------------------------------------------------- weapons
    def({
      id: 'sword1',
      name: "Traveler's Blade",
      icon: 'sword1',
      category: 'weapon',
      rarity: 'common',
      description: 'A plain shortsword, kept sharp by habit rather than pride.',
      stats: { attack: 2 },
      value: 40,
    }),
    def({
      id: 'sword2',
      name: "Knight's Blade",
      icon: 'sword2',
      category: 'weapon',
      rarity: 'rare',
      description: 'Balanced for the long guard. Bites deeper than it looks.',
      stats: { attack: 4, crit: 5 },
      value: 220,
    }),
    def({
      id: 'sword3',
      name: 'Hollow Edge',
      icon: 'sword3',
      category: 'weapon',
      rarity: 'legendary',
      description: 'Forged from the root that drank the Hollow dry.',
      stats: { attack: 7, crit: 10, force: 20 },
      value: 900,
      unique: true,
    }),
    def({
      id: 'sword4',
      name: 'Tidebrand',
      icon: 'sword4',
      category: 'weapon',
      rarity: 'legendary',
      description: 'Quenched in the drowned bell. The edge never quite dries.',
      stats: { attack: 8, crit: 8, magic: 15, force: 15 },
      value: 1100,
      unique: true,
    }),

    // -------------------------------------------------------------- shields
    def({
      id: 'shield1',
      name: 'Wooden Shield',
      icon: 'shield1',
      category: 'shield',
      rarity: 'common',
      description: 'Blocks arrows and rocks while raised. Do not test it on fire.',
      stats: { defense: 1 },
      value: 60,
    }),
    def({
      id: 'shield2',
      name: 'Ironbark Shield',
      icon: 'shield2',
      category: 'shield',
      rarity: 'rare',
      description: 'Bark grown over steel. Heavier, and worth the weight.',
      stats: { defense: 2, force: 10 },
      value: 260,
    }),

    // ---------------------------------------------------------------- armor
    def({
      id: 'tunic1',
      name: "Traveler's Tunic",
      icon: 'tunic',
      category: 'armor',
      rarity: 'common',
      description: 'Green wool, patched at both elbows.',
      stats: { defense: 1 },
      value: 50,
    }),
    def({
      id: 'tunic2',
      name: 'Verdant Mail',
      icon: 'tunic',
      category: 'armor',
      rarity: 'rare',
      description: 'Rings woven with living vine. Light, and quietly warm.',
      stats: { defense: 3, speed: 5 },
      value: 300,
    }),
    def({
      id: 'tunic3',
      name: 'Rootplate',
      icon: 'tunic',
      category: 'armor',
      rarity: 'epic',
      description: 'Heavy heartwood scales. Slower, but very hard to open.',
      stats: { defense: 6, speed: -8, maxHearts: 1 },
      value: 620,
    }),

    // --------------------------------------------------------------- charms
    def({
      id: 'ringVigor',
      name: 'Vigor Ring',
      icon: 'ring',
      category: 'charm',
      rarity: 'uncommon',
      description: 'Beats faintly against the finger.',
      stats: { maxHearts: 1 },
      value: 180,
    }),
    def({
      id: 'ringSwift',
      name: 'Swiftstep Ring',
      icon: 'ring',
      category: 'charm',
      rarity: 'uncommon',
      description: 'The ground seems to arrive sooner.',
      stats: { speed: 10 },
      value: 180,
    }),
    def({
      id: 'ringKeen',
      name: 'Keen Ring',
      icon: 'ring',
      category: 'charm',
      rarity: 'rare',
      description: 'Finds the seam in things.',
      stats: { crit: 12 },
      value: 260,
    }),
    def({
      id: 'amuletArcane',
      name: 'Arcane Amulet',
      icon: 'amulet',
      category: 'charm',
      rarity: 'rare',
      description: 'Holds more than it should.',
      stats: { magic: 20, magicRegen: 2 },
      value: 280,
    }),
    def({
      id: 'amuletLuck',
      name: 'Magpie Amulet',
      icon: 'amulet',
      category: 'charm',
      rarity: 'epic',
      description: 'Bright things find their way to you.',
      stats: { luck: 25 },
      value: 460,
    }),
    def({
      id: 'amuletTide',
      name: 'Tide Charm',
      icon: 'amulet',
      category: 'charm',
      rarity: 'epic',
      description: "The Hollow's water remembers you, and parts a little.",
      stats: { magic: 20, magicRegen: 3, defense: 1 },
      value: 420,
      unique: true,
    }),
    def({
      id: 'ringSmith',
      name: "Bren's Signet",
      icon: 'ring',
      category: 'charm',
      rarity: 'rare',
      description: "A smith's thumb-ring, still warm from the forge.",
      stats: { attack: 1, defense: 1 },
      value: 240,
      unique: true,
    }),

    // ---------------------------------------------------------------- tools
    def({
      id: 'bow',
      name: 'Hollow Bow',
      icon: 'bow',
      category: 'tool',
      rarity: 'rare',
      description: 'Draws smoothly. Spends arrows from your satchel.',
      use: 'bow',
      stats: { arrowDamage: 1 },
      value: 350,
      unique: true,
      bound: true,
    }),
    def({
      id: 'boomerang',
      name: 'Windcutter',
      icon: 'boomerang',
      category: 'tool',
      rarity: 'rare',
      description: 'Stuns what it strikes and drags loose treasure home.',
      use: 'boomerang',
      value: 320,
      unique: true,
      bound: true,
    }),
    def({
      id: 'lantern',
      name: 'Cinder Lantern',
      icon: 'lantern',
      category: 'tool',
      rarity: 'uncommon',
      description: 'Pushes back the dark. Costs magic to keep lit.',
      use: 'lantern',
      value: 150,
      unique: true,
      bound: true,
    }),
    def({
      id: 'boots',
      name: 'Pegasus Boots',
      icon: 'boots',
      category: 'tool',
      rarity: 'epic',
      description: 'Hold to charge, then run through anything in your way.',
      stats: { speed: 4 },
      value: 500,
      unique: true,
      bound: true,
    }),

    // ----------------------------------------------------------- consumables
    def({
      id: 'arrow',
      name: 'Arrow',
      icon: 'arrow',
      category: 'consumable',
      rarity: 'common',
      description: 'Ammunition for the bow.',
      stack: 60,
      value: 3,
    }),
    def({
      id: 'bomb',
      name: 'Bomb',
      icon: 'bomb',
      category: 'consumable',
      rarity: 'common',
      description: 'Cracks weak walls and anything standing near them.',
      stack: 30,
      use: 'bomb',
      value: 8,
    }),
    def({
      id: 'potion',
      name: 'Red Potion',
      icon: 'potion',
      category: 'consumable',
      rarity: 'common',
      description: 'Restores three hearts.',
      stack: 8,
      use: 'consume',
      effect: { heal: 6 },
      value: 45,
    }),
    def({
      id: 'elixir',
      name: 'Blue Elixir',
      icon: 'elixir',
      category: 'consumable',
      rarity: 'uncommon',
      description: 'Restores magic.',
      stack: 8,
      use: 'consume',
      effect: { magic: 40 },
      value: 55,
    }),
    def({
      id: 'ether',
      name: 'Green Ether',
      icon: 'ether',
      category: 'consumable',
      rarity: 'rare',
      description: 'Restores everything, and wards you briefly.',
      stack: 4,
      use: 'consume',
      effect: { heal: 40, magic: 100, ward: 3 },
      value: 140,
    }),
    def({
      id: 'fairy',
      name: 'Bottled Fairy',
      icon: 'fairy',
      category: 'consumable',
      rarity: 'epic',
      description: 'Revives you once, automatically, when you fall.',
      stack: 3,
      value: 200,
    }),

    // ----------------------------------------------------------- quest items
    def({
      id: 'smallKey',
      name: 'Small Key',
      icon: 'key',
      category: 'quest',
      rarity: 'common',
      description: 'Opens one locked dungeon door.',
      stack: 9,
      unique: true,
      bound: true,
    }),
    def({
      id: 'bossKey',
      name: 'Root Key',
      icon: 'bosskey',
      category: 'quest',
      rarity: 'epic',
      description: 'Opens the sealed door at the heart of a dungeon.',
      unique: true,
      bound: true,
    }),
    def({
      id: 'bellKey',
      name: 'Bell Key',
      icon: 'bellkey',
      category: 'quest',
      rarity: 'epic',
      description: 'Cold iron that still hums, as if a clapper just struck.',
      unique: true,
      bound: true,
    }),
    def({
      id: 'ashKey',
      name: 'Ash Key',
      icon: 'ashkey',
      category: 'quest',
      rarity: 'epic',
      description: 'Warm to the touch. The teeth look burned into place.',
      unique: true,
      bound: true,
    }),
    def({
      id: 'amuletAsh',
      name: 'Ember Charm',
      icon: 'amulet',
      category: 'charm',
      rarity: 'epic',
      description: 'Holds a coal that never cools. Episode One ends; the Hollow does not.',
      stats: { attack: 2, defense: 2, magicRegen: 2 },
      value: 480,
      unique: true,
    }),
    def({
      id: 'cinderScale',
      name: 'Cinder Scale',
      icon: 'shard',
      category: 'material',
      rarity: 'uncommon',
      description: 'Flakes of something that burned without wood.',
      stack: 99,
      value: 14,
    }),
    def({
      id: 'dungeonMap',
      name: 'Dungeon Map',
      icon: 'map',
      category: 'quest',
      rarity: 'uncommon',
      description: 'Reveals the whole floor plan on the map screen.',
      unique: true,
      bound: true,
    }),
    def({
      id: 'compass',
      name: 'Compass',
      icon: 'compass',
      category: 'quest',
      rarity: 'uncommon',
      description: 'Marks chests and the boss on the map screen.',
      unique: true,
      bound: true,
    }),
    def({
      id: 'heartPiece',
      name: 'Piece of Heart',
      icon: 'heartPiece',
      category: 'quest',
      rarity: 'rare',
      description: 'Four of these become a permanent heart container.',
      stack: 4,
      unique: true,
      bound: true,
    }),

    // ------------------------------------------------------------- materials
    def({
      id: 'gel',
      name: 'Slime Gel',
      icon: 'shard',
      category: 'material',
      rarity: 'common',
      description: 'Sells for a little. Smells like a pond.',
      stack: 99,
      value: 4,
    }),
    def({
      id: 'boneShard',
      name: 'Bone Shard',
      icon: 'shard',
      category: 'material',
      rarity: 'common',
      description: 'Chalky, and oddly warm.',
      stack: 99,
      value: 7,
    }),
    def({
      id: 'thornSeed',
      name: 'Thorn Seed',
      icon: 'shard',
      category: 'material',
      rarity: 'uncommon',
      description: 'Still twitching. Best kept in the satchel.',
      stack: 99,
      value: 14,
    }),
    def({
      id: 'ancientCoin',
      name: 'Ancient Coin',
      icon: 'rupee',
      category: 'material',
      rarity: 'rare',
      description: 'Older than the village. Collectors pay well.',
      stack: 99,
      value: 60,
    }),
    def({
      id: 'wispDust',
      name: 'Wisp Dust',
      icon: 'shard',
      category: 'material',
      rarity: 'uncommon',
      description: 'Glows a little, even in the satchel.',
      stack: 99,
      value: 12,
    }),
    def({
      id: 'crabShell',
      name: 'Crab Shell',
      icon: 'shard',
      category: 'material',
      rarity: 'common',
      description: 'Hard enough to turn a careless blade.',
      stack: 99,
      value: 8,
    }),
  ].map((d) => [d.id, d]),
);

export function itemDef(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`unknown item: ${id}`);
  return d;
}

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  weapon: 'Weapons',
  shield: 'Shields',
  armor: 'Armor',
  charm: 'Charms',
  tool: 'Tools',
  consumable: 'Consumables',
  quest: 'Quest',
  material: 'Materials',
};

/** Which equipment slot a category can occupy, if any. */
export function slotForCategory(cat: ItemCategory): EquipSlot | null {
  switch (cat) {
    case 'weapon':
      return 'weapon';
    case 'shield':
      return 'shield';
    case 'armor':
      return 'armor';
    case 'charm':
      return 'charm1';
    default:
      return null;
  }
}

export const STAT_LABEL: Record<keyof StatBlock, string> = {
  attack: 'Attack',
  defense: 'Defense',
  maxHearts: 'Max Hearts',
  speed: 'Move Speed',
  crit: 'Critical',
  magic: 'Magic',
  magicRegen: 'Magic Regen',
  luck: 'Luck',
  arrowDamage: 'Arrow Damage',
  bombDamage: 'Bomb Damage',
  force: 'Knockback',
};

/** Stats rendered as percentages rather than flat numbers. */
export const PERCENT_STATS = new Set<keyof StatBlock>(['speed', 'crit', 'luck', 'force']);

export function addStats(into: StatBlock, from: StatBlock | undefined): StatBlock {
  if (!from) return into;
  for (const key of Object.keys(from) as Array<keyof StatBlock>) {
    into[key] = (into[key] ?? 0) + (from[key] ?? 0);
  }
  return into;
}
