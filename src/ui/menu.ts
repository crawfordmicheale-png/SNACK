/**
 * The pause menu shell: tab strip, shared state, and input routing.
 *
 * Menus are laid out in a 2x virtual space (640x416) rather than the 320x208
 * game buffer, so there is room for a real inventory screen while icons still
 * land on integer pixel scales.
 */
import { PAL, withAlpha } from '../art/palette';
import type { Input } from '../engine/input';
import type { Scene } from '../game/scene';
import { panel, rect, scrim, strokeRect, text, type UiCtx } from './draw';
import { drawInventoryTab, handleInventoryInput, InventoryUiState } from './inventoryui';
import { drawJournalTab } from './journalui';
import { drawMapTab } from './mapui';
import { drawMasteryTab, handleMasteryInput, MasteryUiState } from './masteryui';

export type Tab = 'satchel' | 'mastery' | 'map' | 'journal';

/** Tab strip geometry, shared so every tab can lay out beneath it. */
export const TAB_Y = 20;
export const TAB_H = 28;
/** First usable row below the tab strip. */
export const CONTENT_TOP = 54;

const TABS: Array<{ id: Tab; label: string; key: string }> = [
  { id: 'satchel', label: 'SATCHEL', key: 'TAB' },
  { id: 'mastery', label: 'MASTERY', key: 'U' },
  { id: 'map', label: 'MAP', key: 'M' },
  { id: 'journal', label: 'JOURNAL', key: 'J' },
];

/** Builds a UiCtx that addresses the 2x menu coordinate space. */
export function menuSpace(u: UiCtx): UiCtx {
  return {
    ...u,
    s: u.s / 2,
    w: u.w * 2,
    h: u.h * 2,
    mouse: u.mouse ? { ...u.mouse, x: u.mouse.x * 2, y: u.mouse.y * 2 } : null,
  };
}

export class Menu {
  open = false;
  tab: Tab = 'satchel';
  /** Set by the host; hides keyboard-only hints on touch devices. */
  touchMode = false;
  readonly inventory = new InventoryUiState();
  readonly mastery = new MasteryUiState();

  /** Opens the menu on a specific tab. */
  show(tab: Tab, scene: Scene): void {
    this.open = true;
    this.tab = tab;
    scene.audio.play('select');
    scene.input.flush();
  }

  close(scene: Scene): void {
    this.open = false;
    this.inventory.dragging = null;
    scene.audio.play('menu');
    scene.input.flush();
  }

  /** Returns true when the menu consumed the frame's input. */
  update(input: Input, scene: Scene): boolean {
    if (!this.open) {
      if (scene.isBusy || scene.gameOver || scene.victory) return false;
      if (input.consumePress('inventory')) {
        this.show('satchel', scene);
        return true;
      }
      if (input.consumePress('mastery')) {
        this.show('mastery', scene);
        return true;
      }
      if (input.consumePress('map')) {
        this.show('map', scene);
        return true;
      }
      if (input.consumePress('pause')) {
        this.show('satchel', scene);
        return true;
      }
      return false;
    }

    if (input.consumePress('pause') || input.consumePress('inventory')) {
      this.close(scene);
      return true;
    }
    // Direct tab hotkeys while open.
    if (input.consumePress('mastery')) this.switchTab('mastery', scene);
    if (input.consumePress('map')) this.switchTab('map', scene);

    switch (this.tab) {
      case 'satchel':
        handleInventoryInput(this.inventory, input, scene);
        break;
      case 'mastery':
        handleMasteryInput(this.mastery, input, scene);
        break;
      default:
        break;
    }
    return true;
  }

  private switchTab(tab: Tab, scene: Scene): void {
    if (this.tab === tab) return;
    this.tab = tab;
    this.inventory.dragging = null;
    scene.audio.play('menu');
  }

  draw(u: UiCtx, scene: Scene): void {
    if (!this.open) return;
    scrim(u, 0.72);
    const m = menuSpace(u);

    panel(m, 12, 12, m.w - 24, m.h - 24, { fill: withAlpha(PAL.uiBack, 0.97), edge: PAL.uiEdge });

    this.drawTabs(m, scene);

    switch (this.tab) {
      case 'satchel':
        drawInventoryTab(m, scene, this.inventory);
        break;
      case 'mastery':
        drawMasteryTab(m, scene, this.mastery);
        break;
      case 'map':
        drawMapTab(m, scene);
        break;
      case 'journal':
        drawJournalTab(m, scene);
        break;
    }

  }

  private drawTabs(m: UiCtx, scene: Scene): void {
    let x = 24;
    for (const tab of TABS) {
      const label = tab.label;
      const w = 108;
      const active = this.tab === tab.id;
      const hot = m.mouse && m.mouse.x >= x && m.mouse.x < x + w && m.mouse.y >= TAB_Y && m.mouse.y < TAB_Y + TAB_H;

      rect(m, x, TAB_Y, w, TAB_H, active ? PAL.uiPanelLight : withAlpha(PAL.uiPanel, hot ? 0.9 : 0.55));
      if (active) {
        strokeRect(m, x, TAB_Y, w, TAB_H, PAL.uiAccent, 1);
        rect(m, x, TAB_Y + TAB_H - 2, w, 2, PAL.uiAccent);
      }
      text(m, label, x + w / 2, TAB_Y + 8, {
        align: 'center',
        size: 13,
        weight: 700,
        color: active ? PAL.uiAccent : PAL.uiTextDim,
        letterSpacing: 1.5,
      });

      if (hot && m.mouse?.pressed) this.switchTab(tab.id, scene);
      x += w + 6;
    }

    // Unspent motes badge, so the mastery tab nags appropriately.
    if (scene.progression.motes > 0) {
      const badgeX = 24 + 108 + 6 + 108 - 22;
      rect(m, badgeX, TAB_Y + 4, 18, 18, PAL.magic);
      text(m, String(scene.progression.motes), badgeX + 9, TAB_Y + 8, {
        align: 'center',
        size: 11,
        weight: 700,
        color: PAL.white,
      });
    }

    if (!this.touchMode) {
      text(m, 'ESC  close', m.w - 28, TAB_Y + 8, { align: 'right', size: 11, color: PAL.uiTextDim });
    }
  }
}
