/**
 * The satchel: a fixed grid of slots, five equipment slots and four quick
 * slots. Drag-and-drop, auto-sort and equip/compare all operate on this.
 */
import { RARITY_ORDER } from '../../art/palette';
import { itemDef, slotForCategory, type EquipSlot, type ItemCategory, type StatBlock } from './itemdefs';
import { bumpUid, stackPower, stackStats, type ItemStack } from './loot';

export const BACKPACK_COLS = 8;
export const BACKPACK_ROWS = 5;
export const BACKPACK_SIZE = BACKPACK_COLS * BACKPACK_ROWS;
export const QUICK_SLOTS = 4;

export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'shield', 'armor', 'charm1', 'charm2'];

export const EQUIP_LABEL: Record<EquipSlot, string> = {
  weapon: 'Weapon',
  shield: 'Shield',
  armor: 'Armor',
  charm1: 'Charm I',
  charm2: 'Charm II',
};

/** Categories accepted by each equipment slot. */
const SLOT_ACCEPTS: Record<EquipSlot, ItemCategory[]> = {
  weapon: ['weapon'],
  shield: ['shield'],
  armor: ['armor'],
  charm1: ['charm'],
  charm2: ['charm'],
};

export type SortMode = 'category' | 'rarity' | 'power' | 'name';

export interface AddResult {
  /** How many units actually fit. */
  added: number;
  /** True if the whole stack was absorbed. */
  full: boolean;
}

export class Inventory {
  slots: Array<ItemStack | null> = new Array(BACKPACK_SIZE).fill(null);
  equipment: Record<EquipSlot, ItemStack | null> = {
    weapon: null,
    shield: null,
    armor: null,
    charm1: null,
    charm2: null,
  };
  /** uids of the stacks bound to keys 1-4. */
  quick: Array<number | null> = new Array(QUICK_SLOTS).fill(null);

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  countOf(defId: string): number {
    let total = 0;
    for (const s of this.slots) if (s?.defId === defId) total += s.count;
    return total;
  }

  has(defId: string): boolean {
    return this.countOf(defId) > 0;
  }

  /** Whether the item is equipped in any slot. */
  isEquipped(defId: string): boolean {
    return EQUIP_SLOTS.some((s) => this.equipment[s]?.defId === defId);
  }

  findByUid(uid: number): { where: 'bag'; index: number } | { where: 'equip'; slot: EquipSlot } | null {
    const index = this.slots.findIndex((s) => s?.uid === uid);
    if (index >= 0) return { where: 'bag', index };
    for (const slot of EQUIP_SLOTS) {
      if (this.equipment[slot]?.uid === uid) return { where: 'equip', slot };
    }
    return null;
  }

  stackByUid(uid: number): ItemStack | null {
    const found = this.findByUid(uid);
    if (!found) return null;
    return found.where === 'bag' ? this.slots[found.index] : this.equipment[found.slot];
  }

  firstEmpty(): number {
    return this.slots.findIndex((s) => s === null);
  }

  get isFull(): boolean {
    return this.firstEmpty() < 0;
  }

  // -------------------------------------------------------------------------
  // Mutation
  // -------------------------------------------------------------------------

  /** Merges into existing stacks first, then fills empty slots. */
  add(stack: ItemStack): AddResult {
    const def = itemDef(stack.defId);
    const maxStack = def.stack ?? 1;
    let remaining = stack.count;
    let added = 0;

    if (maxStack > 1) {
      for (const slot of this.slots) {
        if (remaining <= 0) break;
        if (!slot || slot.defId !== stack.defId) continue;
        // Affixed instances never merge — they are distinct items.
        if (slot.affixes.length > 0 || stack.affixes.length > 0) continue;
        const room = maxStack - slot.count;
        if (room <= 0) continue;
        const take = Math.min(room, remaining);
        slot.count += take;
        remaining -= take;
        added += take;
      }
    }

    while (remaining > 0) {
      const empty = this.firstEmpty();
      if (empty < 0) break;
      const take = Math.min(maxStack, remaining);
      this.slots[empty] = { ...stack, uid: stack.uid, count: take };
      // Subsequent splits need their own identity.
      if (remaining > take) this.slots[empty] = { ...this.slots[empty]!, uid: this.mintUid() };
      remaining -= take;
      added += take;
      this.autoBindQuick(this.slots[empty]!);
    }

    bumpUid(stack.uid);
    return { added, full: remaining === 0 };
  }

  private uidCounter = 100000;

  private mintUid(): number {
    return this.uidCounter++;
  }

  /** Removes `count` units of an item id, returning true if all were removed. */
  consume(defId: string, count = 1): boolean {
    if (this.countOf(defId) < count) return false;
    let remaining = count;
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const slot = this.slots[i];
      if (!slot || slot.defId !== defId) continue;
      const take = Math.min(slot.count, remaining);
      slot.count -= take;
      remaining -= take;
      if (slot.count <= 0) this.clearSlot(i);
    }
    return true;
  }

  private clearSlot(index: number): void {
    const stack = this.slots[index];
    if (stack) {
      const q = this.quick.indexOf(stack.uid);
      if (q >= 0) this.quick[q] = null;
    }
    this.slots[index] = null;
  }

  removeAt(index: number): ItemStack | null {
    const stack = this.slots[index];
    if (!stack) return null;
    this.clearSlot(index);
    return stack;
  }

  /** Drag-and-drop: swaps two backpack slots, merging identical stacks. */
  moveSlot(from: number, to: number): void {
    if (from === to) return;
    const a = this.slots[from];
    const b = this.slots[to];
    if (!a) return;
    if (b && a.defId === b.defId && a.affixes.length === 0 && b.affixes.length === 0) {
      const max = itemDef(a.defId).stack ?? 1;
      const room = max - b.count;
      if (room > 0) {
        const take = Math.min(room, a.count);
        b.count += take;
        a.count -= take;
        if (a.count <= 0) this.clearSlot(from);
        return;
      }
    }
    this.slots[to] = a;
    this.slots[from] = b;
  }

  canEquip(stack: ItemStack, slot: EquipSlot): boolean {
    return SLOT_ACCEPTS[slot].includes(itemDef(stack.defId).category);
  }

  /** Equips the stack at a backpack index, swapping out whatever was worn. */
  equipFromBag(index: number, preferred?: EquipSlot): boolean {
    const stack = this.slots[index];
    if (!stack) return false;
    const natural = slotForCategory(itemDef(stack.defId).category);
    if (!natural) return false;

    let slot: EquipSlot = preferred && this.canEquip(stack, preferred) ? preferred : natural;
    // Charms fill the second ring slot before displacing the first.
    if (slot === 'charm1' && this.equipment.charm1 && !this.equipment.charm2 && !preferred) slot = 'charm2';

    const previous = this.equipment[slot];
    this.equipment[slot] = stack;
    this.slots[index] = previous;
    return true;
  }

  unequip(slot: EquipSlot): boolean {
    const stack = this.equipment[slot];
    if (!stack) return false;
    const empty = this.firstEmpty();
    if (empty < 0) return false;
    this.slots[empty] = stack;
    this.equipment[slot] = null;
    return true;
  }

  /** Puts a usable item on the first free quick slot when it is picked up. */
  private autoBindQuick(stack: ItemStack): void {
    const def = itemDef(stack.defId);
    if (!def.use) return;
    if (this.quick.includes(stack.uid)) return;
    // Do not shadow an existing binding for the same item type.
    for (const uid of this.quick) {
      if (uid === null) continue;
      const bound = this.stackByUid(uid);
      if (bound?.defId === stack.defId) return;
    }
    const free = this.quick.indexOf(null);
    if (free >= 0) this.quick[free] = stack.uid;
  }

  bindQuick(index: number, uid: number | null): void {
    // A stack can only occupy one quick slot.
    if (uid !== null) {
      const existing = this.quick.indexOf(uid);
      if (existing >= 0) this.quick[existing] = null;
    }
    this.quick[index] = uid;
  }

  /** Drops quick bindings whose stacks no longer exist. */
  pruneQuick(): void {
    for (let i = 0; i < this.quick.length; i++) {
      const uid = this.quick[i];
      if (uid !== null && !this.stackByUid(uid)) this.quick[i] = null;
    }
  }

  // -------------------------------------------------------------------------
  // Organisation
  // -------------------------------------------------------------------------

  sort(mode: SortMode): void {
    const items = this.slots.filter((s): s is ItemStack => s !== null);
    const catOrder: ItemCategory[] = ['weapon', 'shield', 'armor', 'charm', 'tool', 'consumable', 'quest', 'material'];

    // Merge partial stacks of the same plain item before ordering.
    const merged: ItemStack[] = [];
    for (const item of items) {
      const max = itemDef(item.defId).stack ?? 1;
      const target =
        max > 1 && item.affixes.length === 0
          ? merged.find((m) => m.defId === item.defId && m.affixes.length === 0 && m.count < max)
          : undefined;
      if (target) {
        const room = max - target.count;
        const take = Math.min(room, item.count);
        target.count += take;
        item.count -= take;
        if (item.count > 0) merged.push(item);
      } else {
        merged.push(item);
      }
    }

    merged.sort((a, b) => {
      const da = itemDef(a.defId);
      const db = itemDef(b.defId);
      switch (mode) {
        case 'rarity': {
          const d = RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity);
          if (d !== 0) return d;
          break;
        }
        case 'power': {
          const d = stackPower(b) - stackPower(a);
          if (d !== 0) return d;
          break;
        }
        case 'name':
          return da.name.localeCompare(db.name);
        case 'category':
        default:
          break;
      }
      const c = catOrder.indexOf(da.category) - catOrder.indexOf(db.category);
      if (c !== 0) return c;
      const r = RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity);
      if (r !== 0) return r;
      return da.name.localeCompare(db.name);
    });

    this.slots.fill(null);
    for (let i = 0; i < merged.length && i < this.slots.length; i++) this.slots[i] = merged[i];
    this.pruneQuick();
  }

  // -------------------------------------------------------------------------
  // Derived stats
  // -------------------------------------------------------------------------

  /** Sum of every equipped item's stats. */
  totalStats(): StatBlock {
    const out: StatBlock = {};
    for (const slot of EQUIP_SLOTS) {
      const stack = this.equipment[slot];
      if (!stack) continue;
      const stats = stackStats(stack);
      for (const key of Object.keys(stats) as Array<keyof StatBlock>) {
        out[key] = (out[key] ?? 0) + (stats[key] ?? 0);
      }
    }
    // Tools grant passive stats from the bag, so boots help without a slot.
    for (const stack of this.slots) {
      if (!stack) continue;
      const def = itemDef(stack.defId);
      if (def.category !== 'tool' || !def.stats) continue;
      for (const key of Object.keys(def.stats) as Array<keyof StatBlock>) {
        out[key] = (out[key] ?? 0) + (def.stats[key] ?? 0);
      }
    }
    return out;
  }

  serialize(): unknown {
    return {
      slots: this.slots,
      equipment: this.equipment,
      quick: this.quick,
    };
  }

  restore(data: { slots: Array<ItemStack | null>; equipment: Record<EquipSlot, ItemStack | null>; quick: Array<number | null> }): void {
    this.slots = new Array(BACKPACK_SIZE).fill(null);
    for (let i = 0; i < Math.min(data.slots.length, BACKPACK_SIZE); i++) {
      this.slots[i] = data.slots[i] ?? null;
    }
    this.equipment = Object.assign(
      { weapon: null, shield: null, armor: null, charm1: null, charm2: null } as Record<EquipSlot, ItemStack | null>,
      data.equipment,
    );
    this.quick = new Array(QUICK_SLOTS).fill(null);
    for (let i = 0; i < Math.min(data.quick?.length ?? 0, QUICK_SLOTS); i++) this.quick[i] = data.quick[i] ?? null;

    let maxUid = 0;
    for (const s of this.slots) if (s) maxUid = Math.max(maxUid, s.uid);
    for (const slot of EQUIP_SLOTS) {
      const s = this.equipment[slot];
      if (s) maxUid = Math.max(maxUid, s.uid);
    }
    bumpUid(maxUid);
    this.uidCounter = Math.max(this.uidCounter, maxUid + 1);
    this.pruneQuick();
  }
}
