/**
 * Item instances, affixes and loot generation.
 *
 * A dropped item is a base definition plus a rolled rarity and up to four
 * affixes, so the same "Knight's Blade" can show up as a plain one or as a
 * "Keen Knight's Blade of the Fox" with meaningfully different stats.
 */
import { RARITY_ORDER, type Rarity } from '../../art/palette';
import { Rng } from '../../engine/rng';
import { addStats, itemDef, type ItemCategory, type ItemDef, type StatBlock } from './itemdefs';

export interface RolledAffix {
  id: string;
  value: number;
}

export interface ItemStack {
  /** Unique per instance; quick slots and drag state reference this. */
  uid: number;
  defId: string;
  count: number;
  rarity: Rarity;
  affixes: RolledAffix[];
}

let nextUid = 1;

export function newUid(): number {
  return nextUid++;
}

/** Keeps uid generation past anything restored from a save. */
export function bumpUid(minimum: number): void {
  if (minimum >= nextUid) nextUid = minimum + 1;
}

interface AffixDef {
  id: string;
  label: string;
  kind: 'prefix' | 'suffix';
  stat: keyof StatBlock;
  min: number;
  max: number;
  categories: ItemCategory[];
  weight: number;
}

const A = (d: AffixDef): AffixDef => d;

export const AFFIXES: Record<string, AffixDef> = Object.fromEntries(
  [
    A({ id: 'keen', label: 'Keen', kind: 'prefix', stat: 'crit', min: 3, max: 12, categories: ['weapon'], weight: 10 }),
    A({ id: 'heavy', label: 'Heavy', kind: 'prefix', stat: 'attack', min: 1, max: 3, categories: ['weapon'], weight: 10 }),
    A({ id: 'brutal', label: 'Brutal', kind: 'prefix', stat: 'force', min: 10, max: 40, categories: ['weapon'], weight: 7 }),
    A({ id: 'sturdy', label: 'Sturdy', kind: 'prefix', stat: 'defense', min: 1, max: 3, categories: ['shield', 'armor'], weight: 10 }),
    A({ id: 'guarded', label: 'Guarded', kind: 'prefix', stat: 'maxHearts', min: 1, max: 2, categories: ['shield', 'armor', 'charm'], weight: 5 }),
    A({ id: 'swift', label: 'Swift', kind: 'prefix', stat: 'speed', min: 3, max: 10, categories: ['armor', 'charm', 'shield'], weight: 8 }),
    A({ id: 'arcane', label: 'Arcane', kind: 'prefix', stat: 'magic', min: 5, max: 25, categories: ['armor', 'charm', 'weapon'], weight: 7 }),
    A({ id: 'gilded', label: 'Gilded', kind: 'prefix', stat: 'luck', min: 5, max: 20, categories: ['charm', 'armor'], weight: 6 }),

    A({ id: 'ofTheFox', label: 'of the Fox', kind: 'suffix', stat: 'speed', min: 3, max: 12, categories: ['weapon', 'shield', 'armor', 'charm'], weight: 9 }),
    A({ id: 'ofTheBear', label: 'of the Bear', kind: 'suffix', stat: 'maxHearts', min: 1, max: 2, categories: ['weapon', 'shield', 'armor', 'charm'], weight: 6 }),
    A({ id: 'ofTheHawk', label: 'of the Hawk', kind: 'suffix', stat: 'arrowDamage', min: 1, max: 4, categories: ['weapon', 'charm', 'armor'], weight: 6 }),
    A({ id: 'ofEmbers', label: 'of Embers', kind: 'suffix', stat: 'bombDamage', min: 2, max: 8, categories: ['weapon', 'charm', 'armor'], weight: 6 }),
    A({ id: 'ofTheWell', label: 'of the Well', kind: 'suffix', stat: 'magicRegen', min: 1, max: 4, categories: ['charm', 'armor', 'shield'], weight: 6 }),
    A({ id: 'ofRuin', label: 'of Ruin', kind: 'suffix', stat: 'attack', min: 1, max: 3, categories: ['charm', 'shield', 'armor'], weight: 5 }),
    A({ id: 'ofStone', label: 'of Stone', kind: 'suffix', stat: 'defense', min: 1, max: 3, categories: ['weapon', 'charm'], weight: 6 }),
  ].map((a) => [a.id, a]),
);

/** Affix count granted by each rarity. */
const AFFIX_COUNT: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

/**
 * Rarity weights per loot tier (1 = grass and pots, 5 = boss). Luck shifts
 * weight from common toward the top end.
 */
const TIER_WEIGHTS: Record<number, number[]> = {
  1: [72, 22, 5, 1, 0],
  2: [52, 32, 13, 3, 0],
  3: [34, 34, 22, 8, 2],
  4: [18, 30, 30, 17, 5],
  5: [6, 20, 32, 28, 14],
};

/** Base items that random loot can roll, by category. */
const LOOT_POOL: Record<number, string[]> = {
  1: ['gel', 'boneShard', 'potion', 'arrow', 'bomb', 'tunic1', 'shield1'],
  2: ['potion', 'elixir', 'arrow', 'bomb', 'tunic1', 'shield1', 'ringVigor', 'ringSwift', 'thornSeed'],
  3: ['sword2', 'shield2', 'tunic2', 'ringKeen', 'amuletArcane', 'elixir', 'ether', 'thornSeed', 'ancientCoin'],
  4: ['sword2', 'shield2', 'tunic2', 'tunic3', 'ringKeen', 'amuletArcane', 'amuletLuck', 'ether', 'ancientCoin', 'fairy'],
  5: ['sword2', 'tunic3', 'amuletLuck', 'amuletArcane', 'ether', 'fairy', 'ancientCoin'],
};

function rollRarity(tier: number, luck: number, rng: Rng): Rarity {
  const base = TIER_WEIGHTS[Math.max(1, Math.min(5, tier))] ?? TIER_WEIGHTS[1];
  // Luck moves weight up the ladder without ever guaranteeing a top roll.
  const bias = Math.max(0, luck) / 100;
  const weights = base.map((w, i) => w * (1 + bias * i * 0.9));
  return rng.weighted(RARITY_ORDER, weights);
}

/** Builds a plain stack with no affixes. */
export function makeStack(defId: string, count = 1, rarity?: Rarity): ItemStack {
  const d = itemDef(defId);
  return {
    uid: newUid(),
    defId,
    count: Math.max(1, Math.min(count, d.stack ?? 1)),
    rarity: rarity ?? d.rarity,
    affixes: [],
  };
}

/** Rolls a random item appropriate to a loot tier. */
export function rollLoot(tier: number, luck: number, rng: Rng): ItemStack {
  const pool = LOOT_POOL[Math.max(1, Math.min(5, tier))] ?? LOOT_POOL[1];
  const defId = rng.pick(pool);
  const d = itemDef(defId);

  // Stackables ignore rarity and roll a quantity instead.
  if ((d.stack ?? 1) > 1 && d.category !== 'quest') {
    const amount = d.category === 'consumable' ? rng.int(1, Math.min(5, d.stack ?? 1)) : rng.int(1, 3);
    return makeStack(defId, amount);
  }

  let rarity = rollRarity(tier, luck, rng);
  // Never roll an item below the quality its definition implies.
  if (RARITY_ORDER.indexOf(rarity) < RARITY_ORDER.indexOf(d.rarity)) rarity = d.rarity;

  const stack = makeStack(defId, 1, rarity);
  stack.affixes = rollAffixes(d, rarity, rng);
  return stack;
}

function rollAffixes(d: ItemDef, rarity: Rarity, rng: Rng): RolledAffix[] {
  const wanted = AFFIX_COUNT[rarity];
  if (wanted === 0) return [];
  const candidates = Object.values(AFFIXES).filter((a) => a.categories.includes(d.category));
  if (candidates.length === 0) return [];

  const chosen: RolledAffix[] = [];
  const used = new Set<string>();
  const usedKinds = { prefix: 0, suffix: 0 };
  for (let i = 0; i < wanted && candidates.length > used.size; i++) {
    const available = candidates.filter((a) => !used.has(a.id) && usedKinds[a.kind] < 2);
    if (available.length === 0) break;
    const pick = rng.weighted(
      available,
      available.map((a) => a.weight),
    );
    used.add(pick.id);
    usedKinds[pick.kind]++;
    // Higher rarities roll toward the top of each affix's range.
    const tierBias = RARITY_ORDER.indexOf(rarity) / (RARITY_ORDER.length - 1);
    const lo = pick.min + (pick.max - pick.min) * tierBias * 0.45;
    chosen.push({ id: pick.id, value: Math.max(1, Math.round(rng.range(lo, pick.max + 0.999))) });
  }
  return chosen;
}

/** Full stat contribution of an instance, base definition plus affixes. */
export function stackStats(stack: ItemStack): StatBlock {
  const out: StatBlock = {};
  addStats(out, itemDef(stack.defId).stats);
  for (const affix of stack.affixes) {
    const a = AFFIXES[affix.id];
    if (!a) continue;
    out[a.stat] = (out[a.stat] ?? 0) + affix.value;
  }
  return out;
}

/** Display name including any rolled prefix and suffix. */
export function stackName(stack: ItemStack): string {
  const base = itemDef(stack.defId).name;
  const prefix = stack.affixes.map((a) => AFFIXES[a.id]).find((a) => a?.kind === 'prefix');
  const suffix = stack.affixes.map((a) => AFFIXES[a.id]).find((a) => a?.kind === 'suffix');
  return [prefix?.label, base, suffix?.label].filter(Boolean).join(' ');
}

/** Rupee value, scaled by rarity and affix count. */
export function stackValue(stack: ItemStack): number {
  const base = itemDef(stack.defId).value ?? 1;
  const rarityMul = 1 + RARITY_ORDER.indexOf(stack.rarity) * 0.6;
  const affixMul = 1 + stack.affixes.length * 0.15;
  return Math.max(1, Math.round(base * rarityMul * affixMul)) * stack.count;
}

/** A rough single number used to sort and to flag upgrades. */
export function stackPower(stack: ItemStack): number {
  const s = stackStats(stack);
  return (
    (s.attack ?? 0) * 10 +
    (s.defense ?? 0) * 8 +
    (s.maxHearts ?? 0) * 12 +
    (s.crit ?? 0) * 0.8 +
    (s.speed ?? 0) * 0.7 +
    (s.magic ?? 0) * 0.3 +
    (s.magicRegen ?? 0) * 2 +
    (s.luck ?? 0) * 0.5 +
    (s.arrowDamage ?? 0) * 5 +
    (s.bombDamage ?? 0) * 3 +
    (s.force ?? 0) * 0.2 +
    RARITY_ORDER.indexOf(stack.rarity)
  );
}

// ---------------------------------------------------------------------------
// Enemy drops
// ---------------------------------------------------------------------------

export interface DropRule {
  /** 'rupee' | 'heart' | 'magic' are world pickups, anything else is an item. */
  kind: string;
  chance: number;
  min?: number;
  max?: number;
}

export const DROP_TABLES: Record<string, DropRule[]> = {
  slime: [
    { kind: 'heart', chance: 0.22 },
    { kind: 'rupee', chance: 0.4, min: 1, max: 3 },
    { kind: 'gel', chance: 0.35 },
  ],
  octorok: [
    { kind: 'heart', chance: 0.18 },
    { kind: 'rupee', chance: 0.45, min: 1, max: 5 },
    { kind: 'arrow', chance: 0.3, min: 2, max: 5 },
  ],
  keese: [
    { kind: 'heart', chance: 0.16 },
    { kind: 'rupee', chance: 0.35, min: 1, max: 2 },
    { kind: 'magic', chance: 0.2 },
  ],
  stalfos: [
    { kind: 'heart', chance: 0.2 },
    { kind: 'rupee', chance: 0.5, min: 3, max: 10 },
    { kind: 'boneShard', chance: 0.4 },
    { kind: 'loot', chance: 0.12 },
  ],
  thornling: [
    { kind: 'heart', chance: 0.24 },
    { kind: 'rupee', chance: 0.35, min: 2, max: 6 },
    { kind: 'thornSeed', chance: 0.3 },
    { kind: 'bomb', chance: 0.15, min: 1, max: 3 },
  ],
  miniboss: [
    { kind: 'heart', chance: 1 },
    { kind: 'rupee', chance: 1, min: 20, max: 30 },
  ],
  boss: [{ kind: 'heart', chance: 1 }],
};

/** Loot tier used when a drop rule rolls a random item. */
export const ENEMY_LOOT_TIER: Record<string, number> = {
  slime: 1,
  octorok: 1,
  keese: 1,
  stalfos: 2,
  thornling: 2,
  miniboss: 4,
  boss: 5,
};
