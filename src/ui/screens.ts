/**
 * Full-screen states outside normal play: game over and the ending card.
 * Both draw in the 2x menu space for legible type.
 */
import { PAL, withAlpha } from '../art/palette';
import { clamp } from '../engine/math';
import type { Scene } from '../game/scene';
import { icon, measure, panel, rect, scrim, strokeRect, text, type UiCtx } from './draw';
import { menuSpace } from './menu';

export function drawGameOver(u: UiCtx, scene: Scene, elapsed: number): void {
  scrim(u, clamp(elapsed * 0.9, 0, 0.88));
  const m = menuSpace(u);
  const alpha = clamp((elapsed - 0.3) * 1.6, 0, 1);

  m.ctx.save();
  m.ctx.globalAlpha = alpha;

  text(m, 'YOU FELL', m.w / 2, m.h / 2 - 90, {
    align: 'center',
    size: 34,
    weight: 700,
    color: PAL.uiBad,
    letterSpacing: 6,
  });
  text(m, 'The Hollow keeps what it takes — but not your mastery.', m.w / 2, m.h / 2 - 44, {
    align: 'center',
    size: 12,
    color: PAL.uiTextDim,
  });

  const p = scene.progression;
  const stats = `Level ${p.level}   ·   ${p.kills} felled   ·   ${p.deaths} death${p.deaths === 1 ? '' : 's'}`;
  text(m, stats, m.w / 2, m.h / 2 - 18, { align: 'center', size: 11, color: PAL.uiTextDim });

  const label = 'PRESS  ENTER  TO RETURN TO ELDERBROOK';
  const w = measure(m, label, 13, 700) + 40;
  const x = (m.w - w) / 2;
  const y = m.h / 2 + 24;
  panel(m, x, y, w, 40, { fill: withAlpha(PAL.uiPanelLight, 0.9), edge: PAL.uiAccent });
  text(m, label, m.w / 2, y + 13, { align: 'center', size: 13, weight: 700, color: PAL.uiAccent, letterSpacing: 1.5 });

  text(m, 'You will lose a quarter of your rupees.', m.w / 2, y + 56, {
    align: 'center',
    size: 10,
    color: withAlpha(PAL.uiTextDim, 0.8),
  });

  m.ctx.restore();
}

export function drawVictory(u: UiCtx, scene: Scene, elapsed: number): void {
  scrim(u, clamp(elapsed * 0.5, 0, 0.8));
  const m = menuSpace(u);
  const alpha = clamp(elapsed * 1.1, 0, 1);

  m.ctx.save();
  m.ctx.globalAlpha = alpha;

  // Slow drift of rising motes behind the text.
  for (let i = 0; i < 24; i++) {
    const t = (m.time * 0.35 + i * 0.13) % 1;
    const px = ((i * 97) % 100) / 100;
    rect(m, px * m.w, m.h - t * m.h, 2, 2, withAlpha(PAL.magicLight, (1 - t) * 0.5));
  }

  text(m, 'THE ROOT IS CUT', m.w / 2, 96, {
    align: 'center',
    size: 32,
    weight: 700,
    color: PAL.uiAccent,
    letterSpacing: 5,
  });
  text(m, 'Thornmaw is dead. Elderbrook will sleep tonight.', m.w / 2, 144, {
    align: 'center',
    size: 13,
    color: PAL.uiText,
  });

  const p = scene.progression;
  const rows: Array<[string, string]> = [
    ['Level reached', String(p.level)],
    ['Enemies felled', String(p.kills)],
    ['Secrets found', String(p.secrets)],
    ['Deaths', String(p.deaths)],
    ['Heart containers', String(3 + p.heartContainers)],
    ['Rupees held', String(scene.rupees)],
  ];

  const boxW = 380;
  const boxH = 40 + rows.length * 22;
  const boxX = (m.w - boxW) / 2;
  const boxY = 180;
  panel(m, boxX, boxY, boxW, boxH, { fill: withAlpha(PAL.uiBackDeep, 0.92), edge: PAL.uiAccent });
  rows.forEach(([label, value], i) => {
    const y = boxY + 22 + i * 22;
    text(m, label, boxX + 20, y, { size: 11, color: PAL.uiTextDim });
    text(m, value, boxX + boxW - 20, y, { align: 'right', size: 12, weight: 700, color: PAL.uiText });
  });

  icon(m, m.art.icons.get('sword3'), m.w / 2 - 16, boxY + boxH + 18, 32);
  text(m, 'The Hollow Edge is yours.', m.w / 2, boxY + boxH + 58, {
    align: 'center',
    size: 11,
    color: PAL.magicLight,
  });

  const hint = 'PRESS  ENTER  TO KEEP EXPLORING';
  const hw = measure(m, hint, 12, 700) + 36;
  const hx = (m.w - hw) / 2;
  const hy = m.h - 76;
  rect(m, hx, hy, hw, 34, withAlpha(PAL.uiPanelLight, 0.9));
  strokeRect(m, hx, hy, hw, 34, PAL.uiAccent, 1);
  text(m, hint, m.w / 2, hy + 11, { align: 'center', size: 12, weight: 700, color: PAL.uiAccent, letterSpacing: 1.4 });

  m.ctx.restore();
}

/** Small save indicator shown briefly after an autosave. */
export function drawSaveFlash(u: UiCtx, life: number): void {
  const alpha = clamp(life / 0.5, 0, 1);
  u.ctx.save();
  u.ctx.globalAlpha = alpha;
  text(u, 'saved', u.w - 6, u.h - 20, { align: 'right', size: 7, color: PAL.uiTextDim });
  u.ctx.restore();
}
