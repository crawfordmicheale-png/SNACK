/**
 * Journal tab: the current objective, favours, run statistics, and controls.
 */
import { PAL, withAlpha } from '../art/palette';
import { QUEST_STEPS, SIDE_QUESTS } from '../game/dialogue';
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
  text(m, current.title, 34, 88, { size: 14, weight: 700, color: PAL.uiAccent });
  const detail = wrapText(m, current.detail, leftW - 28, 10);
  detail.slice(0, 2).forEach((line, i) => {
    text(m, line, 34, 108 + i * 13, { size: 10, color: PAL.uiTextDim });
  });

  QUEST_STEPS.forEach((step, i) => {
    const y = 140 + i * 16;
    const done = i < scene.quest.step;
    const active = step.id === current.id;
    rect(m, 34, y + 3, 7, 7, done ? PAL.uiGood : active ? PAL.uiAccent : withAlpha(PAL.uiEdge, 0.5));
    text(m, step.title, 48, y, {
      size: 10,
      weight: active ? 700 : 500,
      color: done ? withAlpha(PAL.uiTextDim, 0.7) : active ? PAL.uiAccent : PAL.uiTextDim,
    });
  });

  // ---- Statistics + favours ------------------------------------------
  const p = scene.progression;
  panel(m, rightX, 58, rightW, 154, { fill: withAlpha(PAL.uiPanel, 0.45) });
  text(m, 'RECORD', rightX + 14, 68, { size: 11, weight: 700, color: PAL.uiTextDim, letterSpacing: 1.4 });

  const rows: Array<[string, string]> = [
    ['Level', String(p.level)],
    ['Unspent motes', String(p.motes)],
    ['Enemies felled', String(p.kills)],
    ['Secrets found', String(p.secrets)],
    ['Deaths', String(p.deaths)],
    ['Heart pieces', `${p.heartPieces} / 4`],
    ['Time played', formatTime(p.playSeconds) as string],
  ];
  rows.forEach(([label, value], i) => {
    const y = 88 + i * 16;
    text(m, label, rightX + 14, y, { size: 10, color: PAL.uiTextDim });
    text(m, value, rightX + rightW - 14, y, { align: 'right', size: 11, weight: 700, color: PAL.uiText });
  });

  panel(m, rightX, 220, rightW, 88, { fill: withAlpha(PAL.uiPanel, 0.45) });
  text(m, 'FAVOURS', rightX + 14, 228, { size: 11, weight: 700, color: PAL.uiTextDim, letterSpacing: 1.4 });
  SIDE_QUESTS.forEach((side, i) => {
    const y = 248 + i * 18;
    const done = scene.quest.has(side.doneFlag);
    const asked = scene.quest.has(side.askedFlag);
    const label = done ? side.title : asked ? side.title : '???';
    rect(m, rightX + 14, y + 3, 7, 7, done ? PAL.uiGood : asked ? PAL.uiAccent : withAlpha(PAL.uiEdge, 0.45));
    text(m, label, rightX + 28, y, {
      size: 10,
      color: done ? withAlpha(PAL.uiTextDim, 0.75) : asked ? PAL.uiText : withAlpha(PAL.uiTextDim, 0.55),
    });
  });

  text(m, 'Satchel', rightX + 14, 314, { size: 10, color: PAL.uiTextDim });
  drawCapacityBar(m, scene, rightX + 74, 314, rightW - 90);

  // ---- Controls -------------------------------------------------------
  panel(m, 20, 320, m.w - 40, 76, { fill: withAlpha(PAL.uiPanel, 0.45) });
  text(m, 'CONTROLS', 34, 328, { size: 11, weight: 700, color: PAL.uiTextDim, letterSpacing: 1.4 });

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

  const toolIds = ['bow', 'boomerang', 'lantern', 'boots'] as const;
  let tx = m.w - 36;
  for (const id of [...toolIds].reverse()) {
    if (!scene.inventory.has(id)) continue;
    tx -= 26;
    icon(m, m.art.icons.get(id), tx, 328, 22);
  }
}
