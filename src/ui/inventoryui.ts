/**
 * The satchel screen: equipment column, grid backpack with drag-and-drop,
 * quick-slot bar, sort and filter controls, and a comparison tooltip.
 *
 * Coordinates are in the 2x menu space (640x416) set up by `menu.ts`.
 */
import { PAL, RARITY_COLORS, withAlpha } from '../art/palette';
import type { Input } from '../engine/input';
import { clamp } from '../engine/math';
import {
  BACKPACK_COLS,
  BACKPACK_ROWS,
  EQUIP_LABEL,
  EQUIP_SLOTS,
  QUICK_SLOTS,
  type SortMode,
} from '../game/items/inventory';
import {
  CATEGORY_LABEL,
  itemDef,
  PERCENT_STATS,
  STAT_LABEL,
  slotForCategory,
  type EquipSlot,
  type ItemCategory,
  type StatBlock,
} from '../game/items/itemdefs';
import { AFFIXES, stackName, stackStats, stackValue, type ItemStack } from '../game/items/loot';
import type { Scene } from '../game/scene';
import { bar, clipText, hatch, hovered, icon, measure, panel, rect, strokeRect, text, wrapText, type UiCtx } from './draw';

// Layout, in the 2x menu space. Everything below the tab strip is derived
// from these so the columns cannot drift into each other.
const HEADER_Y = 58;
const BODY_Y = 80;

const EQUIP_X = 20;
const EQUIP_Y = BODY_Y;
const EQUIP_STEP = 46;

const GRID_X = 190;
const GRID_Y = BODY_Y;
const CELL = 46;
const SLOT = 42;
const GRID_RIGHT = GRID_X + BACKPACK_COLS * CELL;

const QUICK_Y = 330;
const CONTROLS_Y = 380;
const STATS_Y = 310;
const STATS_H = 76;
const STATS_ROW_H = 10;
/** Hint line, tucked under the stats panel in the left column. */
const HINT_Y = 390;

type FilterId = 'all' | ItemCategory;

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: 'all', label: 'ALL' },
  { id: 'weapon', label: 'GEAR' },
  { id: 'consumable', label: 'USE' },
  { id: 'quest', label: 'QUEST' },
  { id: 'material', label: 'MATS' },
];

const SORTS: Array<{ id: SortMode; label: string }> = [
  { id: 'category', label: 'TYPE' },
  { id: 'rarity', label: 'RARITY' },
  { id: 'power', label: 'POWER' },
  { id: 'name', label: 'NAME' },
];

/** Which categories a filter chip shows. */
function filterMatches(filter: FilterId, category: ItemCategory): boolean {
  if (filter === 'all') return true;
  if (filter === 'weapon') return category === 'weapon' || category === 'shield' || category === 'armor' || category === 'charm' || category === 'tool';
  return category === filter;
}

export class InventoryUiState {
  /** Keyboard cursor: index into the backpack, or an equipment slot. */
  cursor = 0;
  focus: 'bag' | 'equip' | 'quick' = 'bag';
  equipCursor = 0;
  quickCursor = 0;
  filter: FilterId = 'all';
  sortMode: SortMode = 'category';
  /** Item currently held by the mouse. */
  dragging: { stack: ItemStack; from: { where: 'bag'; index: number } | { where: 'equip'; slot: EquipSlot } } | null = null;
  /** Slot the mouse is hovering, for the tooltip. */
  hoverStack: ItemStack | null = null;
  hoverIsEquipped = false;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export function handleInventoryInput(state: InventoryUiState, input: Input, scene: Scene): void {
  const inv = scene.inventory;

  if (state.focus === 'bag') {
    const col = state.cursor % BACKPACK_COLS;
    const row = Math.floor(state.cursor / BACKPACK_COLS);
    if (input.consumePress('left')) {
      if (col === 0) {
        state.focus = 'equip';
        state.equipCursor = clamp(row, 0, EQUIP_SLOTS.length - 1);
      } else state.cursor--;
      scene.audio.play('menu');
    }
    if (input.consumePress('right')) {
      if (col < BACKPACK_COLS - 1) state.cursor++;
      scene.audio.play('menu');
    }
    if (input.consumePress('up')) {
      if (row > 0) state.cursor -= BACKPACK_COLS;
      scene.audio.play('menu');
    }
    if (input.consumePress('down')) {
      if (row < BACKPACK_ROWS - 1) state.cursor += BACKPACK_COLS;
      else {
        state.focus = 'quick';
        state.quickCursor = clamp(col, 0, QUICK_SLOTS - 1);
      }
      scene.audio.play('menu');
    }
    if (input.consumePress('confirm') || input.consumePress('attack')) {
      useOrEquip(scene, state.cursor);
    }
    for (let i = 0; i < QUICK_SLOTS; i++) {
      if (input.consumePress(`slot${i + 1}` as 'slot1')) {
        const stack = inv.slots[state.cursor];
        if (stack && itemDef(stack.defId).use) {
          inv.bindQuick(i, stack.uid);
          scene.audio.play('select');
        } else {
          scene.audio.play('error');
        }
      }
    }
  } else if (state.focus === 'equip') {
    if (input.consumePress('up')) {
      state.equipCursor = (state.equipCursor - 1 + EQUIP_SLOTS.length) % EQUIP_SLOTS.length;
      scene.audio.play('menu');
    }
    if (input.consumePress('down')) {
      state.equipCursor = (state.equipCursor + 1) % EQUIP_SLOTS.length;
      scene.audio.play('menu');
    }
    if (input.consumePress('right')) {
      state.focus = 'bag';
      state.cursor = state.equipCursor * BACKPACK_COLS;
      scene.audio.play('menu');
    }
    if (input.consumePress('confirm') || input.consumePress('cancel') || input.consumePress('attack')) {
      if (scene.inventory.unequip(EQUIP_SLOTS[state.equipCursor])) {
        scene.markStatsDirty();
        scene.refreshStats();
        scene.audio.play('select');
      } else {
        scene.audio.play('error');
      }
    }
  } else {
    if (input.consumePress('left')) {
      state.quickCursor = (state.quickCursor - 1 + QUICK_SLOTS) % QUICK_SLOTS;
      scene.audio.play('menu');
    }
    if (input.consumePress('right')) {
      state.quickCursor = (state.quickCursor + 1) % QUICK_SLOTS;
      scene.audio.play('menu');
    }
    if (input.consumePress('up')) {
      state.focus = 'bag';
      state.cursor = (BACKPACK_ROWS - 1) * BACKPACK_COLS + clamp(state.quickCursor, 0, BACKPACK_COLS - 1);
      scene.audio.play('menu');
    }
    if (input.consumePress('confirm') || input.consumePress('cancel')) {
      inv.bindQuick(state.quickCursor, null);
      scene.audio.play('menu');
    }
  }

  // Unequip from anywhere with backspace when the cursor is on gear.
  if (state.focus === 'bag' && input.consumePress('cancel')) {
    const stack = inv.slots[state.cursor];
    if (stack) {
      const slot = slotForCategory(itemDef(stack.defId).category);
      if (slot) {
        useOrEquip(scene, state.cursor);
        return;
      }
    }
    scene.audio.play('error');
  }
}

function useOrEquip(scene: Scene, index: number): void {
  const inv = scene.inventory;
  const stack = inv.slots[index];
  if (!stack) {
    scene.audio.play('error');
    return;
  }
  const def = itemDef(stack.defId);

  if (def.category === 'consumable' && def.use === 'consume') {
    scene.player.useItem(stack.defId, scene);
    scene.markStatsDirty();
    scene.refreshStats();
    return;
  }

  if (slotForCategory(def.category)) {
    if (inv.equipFromBag(index)) {
      scene.markStatsDirty();
      scene.refreshStats();
      scene.audio.play('select');
      return;
    }
  }

  scene.audio.play('error');
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export function drawInventoryTab(m: UiCtx, scene: Scene, state: InventoryUiState): void {
  state.hoverStack = null;
  state.hoverIsEquipped = false;

  drawEquipColumn(m, scene, state);
  drawStatsPanel(m, scene);
  drawGrid(m, scene, state);
  drawQuickBar(m, scene, state);
  drawControls(m, scene, state);
  drawTooltip(m, scene, state);
  drawDragged(m, state);

  handleMouse(m, scene, state);
}

function slotFrame(m: UiCtx, x: number, y: number, size: number, stack: ItemStack | null, selected: boolean, hot: boolean): void {
  rect(m, x, y, size, size, withAlpha(PAL.uiPanel, hot ? 0.95 : 0.7));
  if (stack && stack.rarity !== 'common') {
    rect(m, x, y, size, size, withAlpha(RARITY_COLORS[stack.rarity], 0.14));
    strokeRect(m, x, y, size, size, withAlpha(RARITY_COLORS[stack.rarity], 0.75), 1);
  } else {
    strokeRect(m, x, y, size, size, withAlpha(PAL.uiEdge, 0.7), 1);
  }
  if (selected) strokeRect(m, x - 2, y - 2, size + 4, size + 4, PAL.uiAccent, 2);
}

function drawStackIn(m: UiCtx, stack: ItemStack, x: number, y: number, size: number): void {
  const def = itemDef(stack.defId);
  const iconSize = 32;
  icon(m, m.art.icons.get(def.icon), x + (size - iconSize) / 2, y + (size - iconSize) / 2, iconSize);
  if (stack.count > 1) {
    text(m, String(stack.count), x + size - 4, y + size - 16, {
      align: 'right',
      size: 11,
      weight: 700,
      color: PAL.uiText,
    });
  }
  if (stack.affixes.length > 0) {
    rect(m, x + 3, y + 3, 4, 4, RARITY_COLORS[stack.rarity]);
  }
}

function drawEquipColumn(m: UiCtx, scene: Scene, state: InventoryUiState): void {
  text(m, 'EQUIPPED', EQUIP_X, HEADER_Y, { size: 11, weight: 700, color: PAL.uiTextDim, letterSpacing: 1.5 });

  EQUIP_SLOTS.forEach((slot, i) => {
    const y = EQUIP_Y + i * EQUIP_STEP;
    const stack = scene.inventory.equipment[slot];
    const selected = state.focus === 'equip' && state.equipCursor === i;
    const hot = hovered(m, EQUIP_X, y, SLOT, SLOT);

    slotFrame(m, EQUIP_X, y, SLOT, stack, selected, hot);
    if (stack) {
      drawStackIn(m, stack, EQUIP_X, y, SLOT);
      if (hot) {
        state.hoverStack = stack;
        state.hoverIsEquipped = true;
      }
    } else {
      hatch(m, EQUIP_X + 4, y + 4, SLOT - 8, SLOT - 8, withAlpha(PAL.uiEdge, 0.22));
    }

    const labelX = EQUIP_X + SLOT + 8;
    const labelW = GRID_X - 12 - labelX;
    text(m, EQUIP_LABEL[slot], labelX, y + 5, { size: 10, weight: 700, color: PAL.uiTextDim });
    const name = stack ? stackName(stack) : 'empty';
    text(m, clipText(m, name, labelW, 10), labelX, y + 20, {
      size: 10,
      color: stack ? RARITY_COLORS[stack.rarity] : withAlpha(PAL.uiTextDim, 0.6),
    });
  });
}

function drawStatsPanel(m: UiCtx, scene: Scene): void {
  const x = EQUIP_X;
  const y = STATS_Y;
  const w = GRID_X - EQUIP_X - 14;
  const h = STATS_H;
  panel(m, x, y, w, h, { fill: withAlpha(PAL.uiPanel, 0.55) });
  text(m, 'STATS', x + 8, y + 7, { size: 11, weight: 700, color: PAL.uiTextDim, letterSpacing: 1.2 });

  const stats = scene.stats;
  const rows: Array<[string, string]> = [
    ['ATK', String(scene.player.swordDamage)],
    ['DEF', String(stats.defense ?? 0)],
    ['SPD', `${100 + (stats.speed ?? 0)}%`],
    ['CRIT', `${stats.crit ?? 0}%`],
    ['LUCK', `${stats.luck ?? 0}%`],
  ];
  rows.forEach(([label, value], i) => {
    const ry = y + 19 + i * STATS_ROW_H;
    text(m, label, x + 8, ry, { size: 10, color: PAL.uiTextDim });
    text(m, value, x + w - 8, ry, { align: 'right', size: 10, weight: 700, color: PAL.uiText });
  });
}

function drawGrid(m: UiCtx, scene: Scene, state: InventoryUiState): void {
  const used = scene.inventory.slots.filter(Boolean).length;
  text(m, 'SATCHEL', GRID_X, HEADER_Y, { size: 11, weight: 700, color: PAL.uiTextDim, letterSpacing: 1.5 });
  text(m, `${used}/${scene.inventory.slots.length}`, GRID_X + 66, HEADER_Y, {
    size: 11,
    weight: 700,
    color: used >= scene.inventory.slots.length ? PAL.uiBad : PAL.uiTextDim,
  });

  for (let i = 0; i < scene.inventory.slots.length; i++) {
    const col = i % BACKPACK_COLS;
    const row = Math.floor(i / BACKPACK_COLS);
    const x = GRID_X + col * CELL;
    const y = GRID_Y + row * CELL;
    const stack = scene.inventory.slots[i];
    const selected = state.focus === 'bag' && state.cursor === i;
    const hot = hovered(m, x, y, SLOT, SLOT);
    const dimmed = stack ? !filterMatches(state.filter, itemDef(stack.defId).category) : false;

    slotFrame(m, x, y, SLOT, dimmed ? null : stack, selected, hot);

    if (stack && state.dragging?.from.where === 'bag' && state.dragging.from.index === i) {
      // The dragged item is drawn under the cursor instead.
      continue;
    }

    if (stack) {
      m.ctx.save();
      if (dimmed) m.ctx.globalAlpha = 0.22;
      drawStackIn(m, stack, x, y, SLOT);
      m.ctx.restore();
      if (hot && !dimmed) {
        state.hoverStack = stack;
        state.hoverIsEquipped = false;
      }
      // Mark items bound to a quick slot.
      const quickIndex = scene.inventory.quick.indexOf(stack.uid);
      if (quickIndex >= 0) {
        rect(m, x + SLOT - 14, y + 2, 12, 12, withAlpha(PAL.uiAccent, 0.9));
        text(m, String(quickIndex + 1), x + SLOT - 8, y + 3, {
          align: 'center',
          size: 9,
          weight: 700,
          color: PAL.uiBackDeep,
          shadow: false,
        });
      }
    }
  }
}

function drawQuickBar(m: UiCtx, scene: Scene, state: InventoryUiState): void {
  const total = QUICK_SLOTS * CELL;
  const x0 = GRID_X + (BACKPACK_COLS * CELL - total) / 2;
  // Label sits beside the row rather than above it, clear of the slot numbers.
  text(m, 'QUICK', GRID_X, QUICK_Y + 8, { size: 11, weight: 700, color: PAL.uiTextDim, letterSpacing: 1.2 });
  text(m, 'SLOTS', GRID_X, QUICK_Y + 22, { size: 11, weight: 700, color: PAL.uiTextDim, letterSpacing: 1.2 });

  for (let i = 0; i < QUICK_SLOTS; i++) {
    const x = x0 + i * CELL;
    const uid = scene.inventory.quick[i];
    const stack = uid !== null ? scene.inventory.stackByUid(uid) : null;
    const selected = state.focus === 'quick' && state.quickCursor === i;
    const hot = hovered(m, x, QUICK_Y, SLOT, SLOT);

    slotFrame(m, x, QUICK_Y, SLOT, stack, selected, hot);
    if (stack) {
      drawStackIn(m, stack, x, QUICK_Y, SLOT);
      if (hot) {
        state.hoverStack = stack;
        state.hoverIsEquipped = false;
      }
    } else {
      hatch(m, x + 4, QUICK_Y + 4, SLOT - 8, SLOT - 8, withAlpha(PAL.uiEdge, 0.22));
    }
    text(m, String(i + 1), x + 4, QUICK_Y - 13, { size: 10, weight: 700, color: PAL.uiAccent });
  }
}

/** Small labelled chip. Returns true when clicked this frame. */
function chip(m: UiCtx, x: number, y: number, label: string, active: boolean, accent: string): { w: number; hit: boolean } {
  const w = measure(m, label, 10, 700) + 12;
  const hot = hovered(m, x, y, w, 20);
  rect(m, x, y, w, 20, active ? PAL.uiPanelLight : withAlpha(PAL.uiPanel, hot ? 0.9 : 0.5));
  strokeRect(m, x, y, w, 20, active ? accent : withAlpha(PAL.uiEdge, 0.6), 1);
  text(m, label, x + w / 2, y + 5, {
    align: 'center',
    size: 10,
    weight: 700,
    color: active ? accent : PAL.uiTextDim,
  });
  return { w, hit: hot && (m.mouse?.pressed ?? false) };
}

function drawControls(m: UiCtx, scene: Scene, state: InventoryUiState): void {
  // Filter chips sit on the header row, right-aligned above the grid.
  const filterWidths = FILTERS.map((f) => measure(m, f.label, 10, 700) + 12);
  let fx = GRID_RIGHT - filterWidths.reduce((a, b) => a + b, 0) - (FILTERS.length - 1) * 4;
  FILTERS.forEach((filter, i) => {
    const { hit } = chip(m, fx, HEADER_Y - 4, filter.label, state.filter === filter.id, PAL.uiAccent);
    if (hit) {
      state.filter = filter.id;
      scene.audio.play('menu');
    }
    fx += filterWidths[i] + 4;
  });

  // Sort buttons sit below the quick bar, also right-aligned.
  const sortWidths = SORTS.map((s) => measure(m, s.label, 10, 700) + 12);
  let sx = GRID_RIGHT - sortWidths.reduce((a, b) => a + b, 0) - (SORTS.length - 1) * 4;
  text(m, 'SORT', sx - 34, CONTROLS_Y + 5, { size: 10, weight: 700, color: PAL.uiTextDim });
  SORTS.forEach((sort, i) => {
    const { hit } = chip(m, sx, CONTROLS_Y, sort.label, state.sortMode === sort.id, PAL.uiGood);
    if (hit) {
      state.sortMode = sort.id;
      scene.inventory.sort(sort.id);
      scene.audio.play('select');
    }
    sx += sortWidths[i] + 4;
  });

  // Worded for both a keyboard and a thumb.
  text(m, 'tap or ENTER to equip · drag to move', EQUIP_X, HINT_Y, { size: 9, color: PAL.uiTextDim });
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

function drawTooltip(m: UiCtx, scene: Scene, state: InventoryUiState): void {
  const stack = state.hoverStack ?? keyboardStack(scene, state);
  if (!stack || state.dragging) return;

  const def = itemDef(stack.defId);
  const stats = stackStats(stack);
  const slot = slotForCategory(def.category);
  const equipped = slot ? scene.inventory.equipment[slot === 'charm1' ? pickCharmSlot(scene) : slot] : null;
  const comparing = equipped && equipped.uid !== stack.uid && !state.hoverIsEquipped;
  const equippedStats = comparing ? stackStats(equipped) : null;

  const w = 240;
  const descLines = wrapText(m, def.description, w - 24, 10);
  const statKeys = Object.keys(stats) as Array<keyof StatBlock>;
  const affixLines = stack.affixes.length;
  const h =
    58 +
    descLines.length * 13 +
    statKeys.length * 14 +
    affixLines * 13 +
    (comparing ? 18 : 0) +
    (def.value ? 16 : 0);

  // Anchor near the cursor, clamped inside the panel.
  const mx = m.mouse?.x ?? GRID_X + BACKPACK_COLS * CELL;
  const my = m.mouse?.y ?? GRID_Y;
  const x = clamp(mx + 18, 20, m.w - w - 20);
  const y = clamp(my - 10, 20, m.h - h - 20);

  panel(m, x, y, w, h, { fill: withAlpha(PAL.uiBackDeep, 0.98), edge: RARITY_COLORS[stack.rarity] });

  let cy = y + 10;
  text(m, stackName(stack), x + 12, cy, { size: 12, weight: 700, color: RARITY_COLORS[stack.rarity] });
  cy += 16;
  text(m, `${stack.rarity.toUpperCase()}  ·  ${CATEGORY_LABEL[def.category]}`, x + 12, cy, {
    size: 9,
    color: PAL.uiTextDim,
    letterSpacing: 0.8,
  });
  cy += 16;

  for (const key of statKeys) {
    const value = stats[key] ?? 0;
    const suffix = PERCENT_STATS.has(key) ? '%' : '';
    text(m, STAT_LABEL[key], x + 12, cy, { size: 10, color: PAL.uiTextDim });
    const valueStr = `${value > 0 ? '+' : ''}${value}${suffix}`;

    if (equippedStats) {
      const diff = value - (equippedStats[key] ?? 0);
      const diffColor = diff > 0 ? PAL.uiGood : diff < 0 ? PAL.uiBad : PAL.uiTextDim;
      const diffStr = diff === 0 ? '' : `  ${diff > 0 ? '▲' : '▼'}${Math.abs(diff)}${suffix}`;
      text(m, valueStr, x + w - 12 - measure(m, diffStr, 10, 700), cy, {
        align: 'right',
        size: 10,
        weight: 700,
        color: PAL.uiText,
      });
      if (diffStr) text(m, diffStr, x + w - 12, cy, { align: 'right', size: 10, weight: 700, color: diffColor });
    } else {
      text(m, valueStr, x + w - 12, cy, { align: 'right', size: 10, weight: 700, color: PAL.uiText });
    }
    cy += 14;
  }

  for (const affix of stack.affixes) {
    const a = AFFIXES[affix.id];
    if (!a) continue;
    text(m, `◆ ${a.label}`, x + 12, cy, { size: 10, color: PAL.magicLight });
    cy += 13;
  }

  cy += 4;
  for (const line of descLines) {
    text(m, line, x + 12, cy, { size: 10, color: withAlpha(PAL.uiTextDim, 0.9) });
    cy += 13;
  }

  if (comparing) {
    text(m, `vs. ${clipText(m, stackName(equipped), w - 60, 9)}`, x + 12, cy, { size: 9, color: PAL.uiTextDim });
    cy += 16;
  }

  if (def.value) {
    text(m, `Worth ${stackValue(stack)}`, x + 12, cy, { size: 9, color: PAL.goldLight });
  }
}

function keyboardStack(scene: Scene, state: InventoryUiState): ItemStack | null {
  if (state.focus === 'bag') return scene.inventory.slots[state.cursor];
  if (state.focus === 'equip') return scene.inventory.equipment[EQUIP_SLOTS[state.equipCursor]];
  const uid = scene.inventory.quick[state.quickCursor];
  return uid !== null ? scene.inventory.stackByUid(uid) : null;
}

/** Compares a charm against whichever ring slot the player would replace. */
function pickCharmSlot(scene: Scene): EquipSlot {
  return scene.inventory.equipment.charm1 && !scene.inventory.equipment.charm2 ? 'charm2' : 'charm1';
}

// ---------------------------------------------------------------------------
// Mouse: drag and drop
// ---------------------------------------------------------------------------

function drawDragged(m: UiCtx, state: InventoryUiState): void {
  const drag = state.dragging;
  if (!drag || !m.mouse) return;
  const size = SLOT;
  const x = m.mouse.x - size / 2;
  const y = m.mouse.y - size / 2;
  m.ctx.save();
  m.ctx.globalAlpha = 0.9;
  slotFrame(m, x, y, size, drag.stack, false, true);
  drawStackIn(m, drag.stack, x, y, size);
  m.ctx.restore();
}

interface DropTarget {
  where: 'bag' | 'equip' | 'quick';
  index: number;
  slot?: EquipSlot;
}

function targetAt(mx: number, my: number): DropTarget | null {
  // Backpack grid.
  for (let i = 0; i < BACKPACK_COLS * BACKPACK_ROWS; i++) {
    const x = GRID_X + (i % BACKPACK_COLS) * CELL;
    const y = GRID_Y + Math.floor(i / BACKPACK_COLS) * CELL;
    if (mx >= x && mx < x + SLOT && my >= y && my < y + SLOT) return { where: 'bag', index: i };
  }
  // Equipment column.
  for (let i = 0; i < EQUIP_SLOTS.length; i++) {
    const y = EQUIP_Y + i * EQUIP_STEP;
    if (mx >= EQUIP_X && mx < EQUIP_X + SLOT && my >= y && my < y + SLOT) {
      return { where: 'equip', index: i, slot: EQUIP_SLOTS[i] };
    }
  }
  // Quick bar.
  const total = QUICK_SLOTS * CELL;
  const x0 = GRID_X + (BACKPACK_COLS * CELL - total) / 2;
  for (let i = 0; i < QUICK_SLOTS; i++) {
    const x = x0 + i * CELL;
    if (mx >= x && mx < x + SLOT && my >= QUICK_Y && my < QUICK_Y + SLOT) return { where: 'quick', index: i };
  }
  return null;
}

function handleMouse(m: UiCtx, scene: Scene, state: InventoryUiState): void {
  const mouse = m.mouse;
  if (!mouse) return;
  const inv = scene.inventory;

  if (mouse.pressed && !state.dragging) {
    const target = targetAt(mouse.x, mouse.y);
    if (!target) return;
    if (target.where === 'bag') {
      const stack = inv.slots[target.index];
      if (stack) {
        state.dragging = { stack, from: { where: 'bag', index: target.index } };
        state.focus = 'bag';
        state.cursor = target.index;
        scene.audio.play('menu');
      }
    } else if (target.where === 'equip' && target.slot) {
      const stack = inv.equipment[target.slot];
      if (stack) {
        state.dragging = { stack, from: { where: 'equip', slot: target.slot } };
        state.focus = 'equip';
        state.equipCursor = target.index;
        scene.audio.play('menu');
      }
    } else if (target.where === 'quick') {
      // Clicking a quick slot clears it.
      if (inv.quick[target.index] !== null) {
        inv.bindQuick(target.index, null);
        scene.audio.play('menu');
      }
    }
    return;
  }

  if (mouse.released && state.dragging) {
    const drag = state.dragging;
    state.dragging = null;
    const target = targetAt(mouse.x, mouse.y);

    if (!target) {
      scene.audio.play('menu');
      return;
    }

    if (target.where === 'quick') {
      if (itemDef(drag.stack.defId).use) {
        inv.bindQuick(target.index, drag.stack.uid);
        scene.audio.play('select');
      } else {
        scene.audio.play('error');
      }
      return;
    }

    if (drag.from.where === 'bag' && target.where === 'bag') {
      inv.moveSlot(drag.from.index, target.index);
      scene.audio.play('menu');
      return;
    }

    if (drag.from.where === 'bag' && target.where === 'equip' && target.slot) {
      if (inv.canEquip(drag.stack, target.slot)) {
        inv.equipFromBag(drag.from.index, target.slot);
        scene.markStatsDirty();
        scene.refreshStats();
        scene.audio.play('select');
      } else {
        scene.audio.play('error');
      }
      return;
    }

    if (drag.from.where === 'equip' && target.where === 'bag') {
      const existing = inv.slots[target.index];
      if (existing && !inv.canEquip(existing, drag.from.slot)) {
        scene.audio.play('error');
        return;
      }
      inv.equipment[drag.from.slot] = existing;
      inv.slots[target.index] = drag.stack;
      scene.markStatsDirty();
      scene.refreshStats();
      scene.audio.play('select');
      return;
    }

    if (drag.from.where === 'equip' && target.where === 'equip' && target.slot) {
      if (!inv.canEquip(drag.stack, target.slot)) {
        scene.audio.play('error');
        return;
      }
      const other = inv.equipment[target.slot];
      inv.equipment[target.slot] = drag.stack;
      inv.equipment[drag.from.slot] = other;
      scene.markStatsDirty();
      scene.refreshStats();
      scene.audio.play('select');
    }
  }
}

/** Small helper reused by the HUD: fraction of the satchel in use. */
export function satchelFullness(scene: Scene): number {
  const used = scene.inventory.slots.filter(Boolean).length;
  return used / scene.inventory.slots.length;
}

/** Draws a compact capacity meter, used on the journal tab. */
export function drawCapacityBar(m: UiCtx, scene: Scene, x: number, y: number, w: number): void {
  bar(m, x, y, w, 10, satchelFullness(scene), satchelFullness(scene) > 0.9 ? PAL.uiBad : PAL.uiGood);
}
