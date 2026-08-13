/**
 * Mastery screen: five tracks side by side, each a vertical ladder of nodes.
 * Nodes unlock in order, so the screen reads as five commitments rather than
 * a grab bag.
 */
import { PAL, withAlpha } from '../art/palette';
import type { Input } from '../engine/input';
import { clamp } from '../engine/math';
import { PERCENT_STATS, STAT_LABEL, type StatBlock } from '../game/items/itemdefs';
import { TRACKS, xpToNext } from '../game/mastery';
import type { Scene } from '../game/scene';
import { bar, clipText, hovered, icon, measure, panel, rect, strokeRect, text, wrapText, type UiCtx } from './draw';

const HEADER_Y = 58;
const COL_X = 20;
const COL_W = 113;
const COL_GAP = 8;
/** Top of the first node box; the track header sits just above it. */
const TRACK_Y = 116;
const NODE_H = 44;
const NODE_GAP = 4;
const SUMMARY_Y = 364;

export class MasteryUiState {
  track = 0;
  node = 0;
}

export function handleMasteryInput(state: MasteryUiState, input: Input, scene: Scene): void {
  const trackCount = TRACKS.length;
  const nodeCount = TRACKS[state.track].nodes.length;

  if (input.consumePress('left')) {
    state.track = (state.track - 1 + trackCount) % trackCount;
    state.node = clamp(state.node, 0, TRACKS[state.track].nodes.length - 1);
    scene.audio.play('menu');
  }
  if (input.consumePress('right')) {
    state.track = (state.track + 1) % trackCount;
    state.node = clamp(state.node, 0, TRACKS[state.track].nodes.length - 1);
    scene.audio.play('menu');
  }
  if (input.consumePress('up')) {
    state.node = (state.node - 1 + nodeCount) % nodeCount;
    scene.audio.play('menu');
  }
  if (input.consumePress('down')) {
    state.node = (state.node + 1) % nodeCount;
    scene.audio.play('menu');
  }
  if (input.consumePress('confirm') || input.consumePress('attack')) {
    purchase(scene, TRACKS[state.track].nodes[state.node].id);
  }
}

function purchase(scene: Scene, nodeId: string): void {
  const p = scene.progression;
  if (!p.isAvailable(nodeId)) {
    scene.audio.play('error');
    return;
  }
  if (!p.canAfford(nodeId)) {
    scene.audio.play('error');
    scene.toast('Not enough motes.');
    return;
  }
  p.purchase(nodeId);
  scene.markStatsDirty();
  scene.refreshStats();
  scene.audio.play('levelup');
}

export function drawMasteryTab(m: UiCtx, scene: Scene, state: MasteryUiState): void {
  const p = scene.progression;

  // Header: level, XP bar, unspent motes.
  text(m, `LEVEL ${p.level}`, COL_X, HEADER_Y + 4, { size: 13, weight: 700, color: PAL.uiAccent, letterSpacing: 1.4 });
  const xpW = 170;
  bar(m, COL_X + 104, HEADER_Y + 6, xpW, 10, p.xp / xpToNext(p.level), PAL.uiAccent);
  text(m, `${Math.floor(p.xp)} / ${xpToNext(p.level)} XP`, COL_X + 112 + xpW, HEADER_Y + 5, {
    size: 10,
    color: PAL.uiTextDim,
  });

  icon(m, m.art.icons.get('mote'), m.w - 142, HEADER_Y, 22);
  text(m, `${p.motes} MOTES`, m.w - 116, HEADER_Y + 5, { size: 12, weight: 700, color: PAL.magicLight });

  TRACKS.forEach((track, ti) => {
    const x = COL_X + ti * (COL_W + COL_GAP);
    const owned = p.trackProgress(track.id);

    // Track header.
    rect(m, x, TRACK_Y - 28, COL_W, 24, withAlpha(PAL.uiPanel, 0.7));
    strokeRect(m, x, TRACK_Y - 28, COL_W, 24, withAlpha(track.color, 0.5), 1);
    icon(m, m.art.icons.get(track.icon), x + 3, TRACK_Y - 27, 20);
    text(m, clipText(m, track.name.toUpperCase(), COL_W - 52, 10), x + 26, TRACK_Y - 23, {
      size: 10,
      weight: 700,
      color: track.color,
    });
    text(m, `${owned}/${track.nodes.length}`, x + COL_W - 5, TRACK_Y - 23, {
      align: 'right',
      size: 10,
      color: PAL.uiTextDim,
    });

    track.nodes.forEach((node, ni) => {
      const y = TRACK_Y + ni * (NODE_H + NODE_GAP);
      const purchased = p.isPurchased(node.id);
      const available = p.isAvailable(node.id);
      const affordable = available && p.canAfford(node.id);
      const selected = state.track === ti && state.node === ni;
      const hot = hovered(m, x, y, COL_W, NODE_H);

      // Connector to the node above.
      if (ni > 0) {
        rect(m, x + COL_W / 2 - 1, y - NODE_GAP, 2, NODE_GAP, purchased ? track.color : withAlpha(PAL.uiEdge, 0.5));
      }

      const fill = purchased
        ? withAlpha(track.color, 0.22)
        : available
          ? withAlpha(PAL.uiPanelLight, hot ? 0.95 : 0.7)
          : withAlpha(PAL.uiPanel, 0.35);
      rect(m, x, y, COL_W, NODE_H, fill);
      strokeRect(
        m,
        x,
        y,
        COL_W,
        NODE_H,
        purchased ? track.color : available ? withAlpha(PAL.uiEdgeBright, 0.7) : withAlpha(PAL.uiEdge, 0.35),
        1,
      );
      if (selected) strokeRect(m, x - 2, y - 2, COL_W + 4, NODE_H + 4, PAL.uiAccent, 2);

      const nameColor = purchased ? track.color : available ? PAL.uiText : withAlpha(PAL.uiTextDim, 0.55);
      text(m, clipText(m, node.name, COL_W - 34, 10), x + 6, y + 5, { size: 10, weight: 700, color: nameColor });

      // Cost badge, or a tick once owned.
      if (purchased) {
        text(m, '✓', x + COL_W - 6, y + 4, { align: 'right', size: 12, weight: 700, color: track.color });
      } else {
        const costStr = String(node.cost);
        const cw = measure(m, costStr, 10, 700) + 14;
        rect(m, x + COL_W - cw - 4, y + 5, cw, 13, withAlpha(affordable ? PAL.magic : PAL.uiPanel, 0.9));
        text(m, costStr, x + COL_W - 4 - cw / 2, y + 6, {
          align: 'center',
          size: 10,
          weight: 700,
          color: affordable ? PAL.white : PAL.uiTextDim,
        });
      }

      // Two lines is all the box affords; descriptions are written to fit.
      const lines = wrapText(m, node.description, COL_W - 12, 9);
      for (let i = 0; i < Math.min(2, lines.length); i++) {
        const line = i === 1 && lines.length > 2 ? clipText(m, lines.slice(1).join(' '), COL_W - 12, 9) : lines[i];
        text(m, line, x + 6, y + 20 + i * 11, {
          size: 9,
          color: withAlpha(purchased ? PAL.uiText : PAL.uiTextDim, purchased || available ? 0.95 : 0.5),
        });
      }

      if (hot && m.mouse?.pressed) {
        state.track = ti;
        state.node = ni;
        purchase(scene, node.id);
      }
    });
  });

  drawSummary(m, scene);
}

/** Bottom strip: what mastery is currently contributing. */
function drawSummary(m: UiCtx, scene: Scene): void {
  const y = SUMMARY_Y;
  const w = m.w - COL_X * 2;
  panel(m, COL_X, y, w, 36, { fill: withAlpha(PAL.uiPanel, 0.5) });
  text(m, 'MASTERY BONUS', COL_X + 10, y + 5, { size: 10, weight: 700, color: PAL.uiTextDim, letterSpacing: 1.2 });

  const stats = scene.progression.bonusStats();
  const keys = Object.keys(stats) as Array<keyof StatBlock>;
  if (keys.length === 0) {
    text(m, 'Nothing purchased yet. Motes are earned every level — arrows move, ENTER buys.', COL_X + 10, y + 20, {
      size: 10,
      color: PAL.uiTextDim,
    });
    return;
  }

  let x = COL_X + 10;
  for (const key of keys) {
    const value = stats[key] ?? 0;
    const suffix = PERCENT_STATS.has(key) ? '%' : '';
    const label = `${STAT_LABEL[key]} +${value}${suffix}`;
    text(m, label, x, y + 20, { size: 10, color: PAL.uiGood });
    x += measure(m, label, 10) + 18;
    if (x > m.w - 200) break;
  }

  const unlocks: string[] = [];
  for (const track of TRACKS) {
    for (const node of track.nodes) {
      if (node.unlock && scene.progression.isPurchased(node.id)) unlocks.push(node.name);
    }
  }
  if (unlocks.length > 0) {
    text(m, clipText(m, unlocks.join(' · '), 180, 10), m.w - COL_X - 10, y + 20, {
      align: 'right',
      size: 10,
      color: PAL.magicLight,
    });
  }
}
