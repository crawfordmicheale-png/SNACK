/**
 * Journal tab: the current objective, run statistics, and the controls list.
 */
import { PAL, withAlpha } from '../art/palette';
import { QUEST_STEPS } from '../game/dialogue';
import type { Scene } from '../game/scene';
import { icon, measure, panel, rect, text, wrapText, type UiCtx } from './draw';
import { drawCapacityBar } from './inventoryui';

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const mn = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}h ${mn}m` : `${mn}m ${s}s`;
}

export function drawJournalTab(m: UiCtx, scene: Scene): void {
  const leftW = Math.floor((m.w - 60) * 0.58);
  const rightX = 20 + leftW + 20;
  const rightW = m.w - rightX - 20;

  // ---- Objectives -----------------------------------------------------
  panel(m, 20, 58, leftW, 250, { fill: withAlpha(PAL.uiPanel, 0.45) });
  text(m, 'QUEST', 34, 68, { size: 11, weight: 700, color: PAL.uiTextDim, letterSpacing: 1.4 });

  const current = scene.quest.current();
  QUEST_STEPS.forEach((step, i) => {
    const y = 92 + i * 34;
    const done = i < scene.quest.step;
    const active = step.id === current.id;

    rect(m, 34, y + 5, 10, 10, done ? PAL.uiGood : active ? PAL.uiAccent : withAlpha(PAL.uiEdge, 0.5));
    text(m, step.title, 54, y, {
      size: 12,
      weight: active ? 700 : 500,
      color: done ? withAlpha(PAL.uiTextDim, 0.75) : active ? PAL.uiAccent : PAL.uiTextDim,
    });
    if (active) {
      const lines = wrapText(m, step.detail, leftW - 50, 10);
      text(m, lines[0] ?? '', 54, y + 16, { size: 10, color: PAL.uiTextDim });
    }
  });

  // ---- Statistics -----------------------------------------------------
  const p = scene.progression;
  panel(m, rightX, 58, rightW, 250, { fill: withAlpha(PAL.uiPanel, 0.45) });
  text(m, 'RECORD', rightX + 14, 68, { size: 11, weight: 700, color: PAL.uiTextDim, letterSpacing: 1.4 });

  const rows: Array<[string, string]> = [
    ['Level', String(p.level)],
    ['Unspent motes', String(p.motes)],
    ['Enemies felled', String(p.kills)],
    ['Secrets found', String(p.secrets)],
    ['Deaths', String(p.deaths)],
    ['Heart pieces', `${p.heartPieces} / 4`],
    ['Containers earned', String(p.heartContainers)],
    ['Rupees', String(scene.rupees)],
    ['Time played', formatTime(p.playSeconds)],
  ];
  rows.forEach(([label, value], i) => {
    const y = 92 + i * 20;
    text(m, label, rightX + 14, y, { size: 10, color: PAL.uiTextDim });
    text(m, value, rightX + rightW - 14, y, { align: 'right', size: 11, weight: 700, color: PAL.uiText });
  });

  text(m, 'Satchel', rightX + 14, 280, { size: 10, color: PAL.uiTextDim });
  drawCapacityBar(m, scene, rightX + 74, 280, rightW - 90);

  // ---- Controls -------------------------------------------------------
  panel(m, 20, 320, m.w - 40, 76, { fill: withAlpha(PAL.uiPanel, 0.45) });
  text(m, 'CONTROLS', 34, 328, { size: 11, weight: 700, color: PAL.uiTextDim, letterSpacing: 1.4 });

  // Two rows so nothing has to be dropped on narrow windows.
  const controlRows = [
    ['WASD / arrows  move', 'J or SPACE  sword', 'K  use item', 'L  raise shield', 'SHIFT  dash'],
    ['E  interact', '1-4  quick slots', 'TAB  satchel', 'U  mastery', 'M  map', 'N  mute'],
  ];
  controlRows.forEach((row, ri) => {
    let x = 34;
    for (const control of row) {
      text(m, control, x, 348 + ri * 18, { size: 10, color: PAL.uiTextDim });
      x += measure(m, control, 10) + 20;
      if (x > m.w - 120) break;
    }
  });

  // Tools you are carrying, as a reminder of what the item key can fire.
  const toolIds = ['bow', 'boomerang', 'lantern', 'boots'] as const;
  let tx = m.w - 36;
  for (const id of [...toolIds].reverse()) {
    if (!scene.inventory.has(id)) continue;
    tx -= 26;
    icon(m, m.art.icons.get(id), tx, 328, 22);
  }
}
