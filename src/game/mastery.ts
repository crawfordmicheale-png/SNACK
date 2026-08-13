/**
 * Meta progression: five mastery tracks bought with motes earned by levelling.
 *
 * Unlike run-based roguelites, this progression lives on the save file and is
 * never reset — dying costs rupees and time, never mastery. Tracks are strictly
 * sequential so each one reads as a commitment rather than a shopping list.
 */
import type { IconName } from '../art/icons';
import { PAL } from '../art/palette';
import { addStats, type StatBlock } from './items/itemdefs';

export type TrackId = 'blade' | 'archery' | 'vitality' | 'arcane' | 'wayfaring';

/** Non-statistical abilities granted by mastery nodes. */
export type Unlock = 'spin' | 'beam' | 'pierce' | 'dash' | 'magnet' | 'reveal';

export interface MasteryNode {
  id: string;
  name: string;
  description: string;
  cost: number;
  stats?: StatBlock;
  unlock?: Unlock;
}

export interface MasteryTrack {
  id: TrackId;
  name: string;
  blurb: string;
  color: string;
  icon: IconName;
  nodes: MasteryNode[];
}

export const TRACKS: MasteryTrack[] = [
  {
    id: 'blade',
    name: 'Blade',
    blurb: 'Sword damage, critical strikes, and the techniques that come with practice.',
    color: PAL.steelLight,
    icon: 'sword2',
    nodes: [
      { id: 'blade1', name: 'Honed Edge', description: '+1 half-heart of damage.', cost: 1, stats: { attack: 1 } },
      { id: 'blade2', name: 'Spin Cut', description: 'Hold attack, release to spin.', cost: 2, unlock: 'spin' },
      { id: 'blade3', name: 'Deep Cut', description: 'Critical strikes land far more often.', cost: 2, stats: { crit: 10 } },
      { id: 'blade4', name: 'Sword Beam', description: 'Full hearts: swings fire beams.', cost: 3, unlock: 'beam' },
      { id: 'blade5', name: 'Executioner', description: 'Heavier swings, thrown further.', cost: 4, stats: { attack: 2, force: 20 } },
    ],
  },
  {
    id: 'archery',
    name: 'Archery',
    blurb: 'Arrows, bombs, and everything else you throw at a problem.',
    color: PAL.uiGood,
    icon: 'bow',
    nodes: [
      { id: 'arch1', name: 'Quiver Straps', description: 'Arrows strike for more.', cost: 1, stats: { arrowDamage: 1 } },
      { id: 'arch2', name: 'Bomb Bag', description: 'Bombs pack a larger charge.', cost: 2, stats: { bombDamage: 3 } },
      { id: 'arch3', name: 'Piercing Shot', description: 'Arrows pierce the first enemy.', cost: 2, unlock: 'pierce' },
      { id: 'arch4', name: "Fletcher's Eye", description: 'Steadier aim, sharper heads.', cost: 3, stats: { arrowDamage: 2, crit: 5 } },
      { id: 'arch5', name: 'Munitions', description: 'Everything you throw hits harder.', cost: 4, stats: { arrowDamage: 3, bombDamage: 6 } },
    ],
  },
  {
    id: 'vitality',
    name: 'Vitality',
    blurb: 'Heart containers and the armour discipline to keep them full.',
    color: PAL.bloodLight,
    icon: 'heartContainer',
    nodes: [
      { id: 'vit1', name: 'Toughened', description: 'Reduce all incoming damage.', cost: 1, stats: { defense: 1 } },
      { id: 'vit2', name: 'Second Wind', description: 'Gain a permanent heart container.', cost: 2, stats: { maxHearts: 1 } },
      { id: 'vit3', name: 'Ironhide', description: 'Reduce incoming damage further.', cost: 2, stats: { defense: 2 } },
      { id: 'vit4', name: 'Constitution', description: 'Gain two more heart containers.', cost: 3, stats: { maxHearts: 2 } },
      { id: 'vit5', name: 'Undying', description: 'Very hard to finish off.', cost: 4, stats: { defense: 2, maxHearts: 2 } },
    ],
  },
  {
    id: 'arcane',
    name: 'Arcane',
    blurb: 'The magic that feeds your lantern, your spin, and your stranger tools.',
    color: PAL.magicLight,
    icon: 'amulet',
    nodes: [
      { id: 'arc1', name: 'Inner Well', description: 'Carry more magic.', cost: 1, stats: { magic: 20 } },
      { id: 'arc2', name: 'Focus', description: 'Magic returns on its own.', cost: 2, stats: { magicRegen: 2 } },
      { id: 'arc3', name: 'Attunement', description: 'A deeper well that refills faster.', cost: 2, stats: { magic: 25, magicRegen: 2 } },
      { id: 'arc4', name: 'Ward', description: 'Ambient magic turns blows aside.', cost: 3, stats: { defense: 1, magicRegen: 3 } },
      { id: 'arc5', name: 'Overflow', description: 'Far more magic than you need.', cost: 4, stats: { magic: 40 } },
    ],
  },
  {
    id: 'wayfaring',
    name: 'Wayfaring',
    blurb: 'Speed, fortune, and finding what the Hollow would rather keep.',
    color: PAL.uiAccent,
    icon: 'boots',
    nodes: [
      { id: 'way1', name: 'Light Step', description: 'Move noticeably faster.', cost: 1, stats: { speed: 6 } },
      { id: 'way2', name: 'Pegasus Dash', description: 'Hold Shift to dash through foes.', cost: 2, unlock: 'dash' },
      { id: 'way3', name: 'Loot Magnet', description: 'Drops drift toward you.', cost: 2, unlock: 'magnet' },
      { id: 'way4', name: 'Fortune', description: 'Better loot from worse enemies.', cost: 3, stats: { luck: 15 } },
      { id: 'way5', name: 'Pathfinder', description: 'Faster, luckier, the map opens.', cost: 4, stats: { speed: 8, luck: 15 }, unlock: 'reveal' },
    ],
  },
];

export const NODE_BY_ID = new Map<string, { track: MasteryTrack; node: MasteryNode; index: number }>();
for (const track of TRACKS) {
  track.nodes.forEach((node, index) => NODE_BY_ID.set(node.id, { track, node, index }));
}

/** XP needed to advance from `level` to the next one. */
export function xpToNext(level: number): number {
  return Math.round(28 + Math.pow(level, 1.72) * 11);
}

export interface ProgressionSnapshot {
  level: number;
  xp: number;
  motes: number;
  purchased: string[];
  heartPieces: number;
  heartContainers: number;
  kills: number;
  secrets: number;
  deaths: number;
  playSeconds: number;
}

export class Progression {
  level = 1;
  xp = 0;
  /** Unspent mastery motes. */
  motes = 0;
  purchased = new Set<string>();
  /** Loose pieces; four make a container. */
  heartPieces = 0;
  /** Containers earned from pieces and boss rewards, above the base three. */
  heartContainers = 0;

  kills = 0;
  secrets = 0;
  deaths = 0;
  playSeconds = 0;

  /** Levels gained since the last time the HUD showed a notification. */
  pendingLevelUps = 0;

  static readonly BASE_HEARTS = 3;
  static readonly PIECES_PER_CONTAINER = 4;

  /** Adds XP and returns how many levels were gained. */
  addXp(amount: number): number {
    if (amount <= 0) return 0;
    this.xp += amount;
    let gained = 0;
    while (this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      this.motes += 1;
      gained++;
    }
    this.pendingLevelUps += gained;
    return gained;
  }

  /** Adds a heart piece; returns true if it completed a container. */
  addHeartPiece(): boolean {
    this.heartPieces++;
    if (this.heartPieces >= Progression.PIECES_PER_CONTAINER) {
      this.heartPieces -= Progression.PIECES_PER_CONTAINER;
      this.heartContainers++;
      return true;
    }
    return false;
  }

  isPurchased(nodeId: string): boolean {
    return this.purchased.has(nodeId);
  }

  /** A node is available once its predecessor in the track is owned. */
  isAvailable(nodeId: string): boolean {
    const entry = NODE_BY_ID.get(nodeId);
    if (!entry) return false;
    if (this.purchased.has(nodeId)) return false;
    if (entry.index === 0) return true;
    return this.purchased.has(entry.track.nodes[entry.index - 1].id);
  }

  canAfford(nodeId: string): boolean {
    const entry = NODE_BY_ID.get(nodeId);
    return entry ? this.motes >= entry.node.cost : false;
  }

  purchase(nodeId: string): boolean {
    if (!this.isAvailable(nodeId) || !this.canAfford(nodeId)) return false;
    const entry = NODE_BY_ID.get(nodeId)!;
    this.motes -= entry.node.cost;
    this.purchased.add(nodeId);
    return true;
  }

  has(unlock: Unlock): boolean {
    for (const id of this.purchased) {
      if (NODE_BY_ID.get(id)?.node.unlock === unlock) return true;
    }
    return false;
  }

  /** Combined stat bonus from every purchased node. */
  bonusStats(): StatBlock {
    const out: StatBlock = {};
    for (const id of this.purchased) {
      addStats(out, NODE_BY_ID.get(id)?.node.stats);
    }
    return out;
  }

  /** How many nodes are owned in a track, for the progress bars. */
  trackProgress(trackId: TrackId): number {
    const track = TRACKS.find((t) => t.id === trackId);
    if (!track) return 0;
    return track.nodes.filter((n) => this.purchased.has(n.id)).length;
  }

  snapshot(): ProgressionSnapshot {
    return {
      level: this.level,
      xp: this.xp,
      motes: this.motes,
      purchased: [...this.purchased],
      heartPieces: this.heartPieces,
      heartContainers: this.heartContainers,
      kills: this.kills,
      secrets: this.secrets,
      deaths: this.deaths,
      playSeconds: this.playSeconds,
    };
  }

  restore(data: Partial<ProgressionSnapshot>): void {
    this.level = data.level ?? 1;
    this.xp = data.xp ?? 0;
    this.motes = data.motes ?? 0;
    this.purchased = new Set(data.purchased ?? []);
    this.heartPieces = data.heartPieces ?? 0;
    this.heartContainers = data.heartContainers ?? 0;
    this.kills = data.kills ?? 0;
    this.secrets = data.secrets ?? 0;
    this.deaths = data.deaths ?? 0;
    this.playSeconds = data.playSeconds ?? 0;
    this.pendingLevelUps = 0;
  }
}

/** XP awarded per enemy kind. */
export const XP_TABLE: Record<string, number> = {
  slime: 4,
  keese: 5,
  octorok: 7,
  thornling: 9,
  stalfos: 14,
  miniboss: 90,
  boss: 260,
};
