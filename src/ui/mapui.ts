/**
 * Map screen. Draws the current map's room grid, marking visited rooms, the
 * player's position, and — once the Pathfinder node is bought — everything else.
 */
import { PAL, withAlpha } from '../art/palette';
import { ROOM_COLS, ROOM_ROWS } from '../engine/screen';
import { Chest } from '../game/entities/props';
import type { Scene } from '../game/scene';
import type { RoomRuntime } from '../world/world';
import { clipText, icon, panel, rect, strokeRect, text, type UiCtx } from './draw';

export function drawMapTab(m: UiCtx, scene: Scene): void {
  const world = scene.world;
  const reveal = scene.progression.has('reveal') || (world.def.dungeon === true && scene.inventory.has('dungeonMap'));
  const hasCompass = scene.inventory.has('compass') || scene.progression.has('reveal');

  text(m, world.def.name.toUpperCase(), 20, 58, { size: 14, weight: 700, color: PAL.uiAccent, letterSpacing: 2 });
  text(m, scene.activeRoom?.def.name ?? '', 20, 78, { size: 11, color: PAL.uiTextDim });

  // Fit the room grid into the available area, preserving aspect ratio.
  const areaX = 20;
  const areaY = 104;
  const areaW = m.w - 300;
  const areaH = m.h - 150;
  const cellW = Math.floor(Math.min(areaW / world.cols, (areaH / world.rows) * (ROOM_COLS / ROOM_ROWS)));
  const cellH = Math.floor(cellW * (ROOM_ROWS / ROOM_COLS));
  const gridW = cellW * world.cols;
  const gridH = cellH * world.rows;
  const originX = areaX + (areaW - gridW) / 2;
  const originY = areaY + (areaH - gridH) / 2;

  panel(m, originX - 10, originY - 10, gridW + 20, gridH + 20, { fill: withAlpha(PAL.uiBackDeep, 0.6) });

  for (let ry = 0; ry < world.rows; ry++) {
    for (let rx = 0; rx < world.cols; rx++) {
      const room = world.roomAt(rx, ry);
      const x = originX + rx * cellW;
      const y = originY + ry * cellH;
      if (!room) {
        rect(m, x + 2, y + 2, cellW - 4, cellH - 4, withAlpha(PAL.black, 0.35));
        continue;
      }

      const known = room.visited || reveal;
      if (!known) {
        rect(m, x + 2, y + 2, cellW - 4, cellH - 4, withAlpha(PAL.uiPanel, 0.28));
        strokeRect(m, x + 2, y + 2, cellW - 4, cellH - 4, withAlpha(PAL.uiEdge, 0.25), 1);
        if (hasCompass) drawRoomMarkers(m, scene, room, x, y, cellH, true);
        continue;
      }

      const isHere = room === scene.activeRoom;
      const fill = room.visited ? withAlpha(PAL.uiPanelLight, 0.85) : withAlpha(PAL.uiPanel, 0.5);
      rect(m, x + 2, y + 2, cellW - 4, cellH - 4, isHere ? withAlpha(PAL.uiAccent, 0.28) : fill);
      strokeRect(m, x + 2, y + 2, cellW - 4, cellH - 4, isHere ? PAL.uiAccent : withAlpha(PAL.uiEdge, 0.7), 1);

      if (room.def.name) {
        text(m, clipText(m, room.def.name, cellW - 10, 9), x + cellW / 2, y + 6, {
          align: 'center',
          size: 9,
          color: isHere ? PAL.uiAccent : PAL.uiTextDim,
        });
      }

      drawRoomMarkers(m, scene, room, x, y, cellH);

      if (isHere) {
        // Player dot, positioned within the room cell.
        const px = x + 2 + ((scene.player.x / 16 - rx * ROOM_COLS) / ROOM_COLS) * (cellW - 4);
        const py = y + 2 + ((scene.player.y / 16 - ry * ROOM_ROWS) / ROOM_ROWS) * (cellH - 4);
        const pulse = 3 + Math.sin(m.time * 6) * 1;
        rect(m, px - pulse / 2, py - pulse / 2, pulse, pulse, PAL.uiAccent);
      }
    }
  }

  drawLegend(m, scene, originX + gridW + 30, originY);
}

function drawRoomMarkers(m: UiCtx, scene: Scene, room: RoomRuntime, x: number, y: number, cellH: number, force = false): void {
  const hasCompass = scene.inventory.has('compass') || scene.progression.has('reveal');
  const markers: string[] = [];
  if (force || hasCompass || room.visited) {
    const spawns = room.def.spawns ?? [];
    spawns.forEach((spawn, index) => {
      if (room.consumed.has(index)) return;
      if (spawn.kind === 'chest') markers.push('chest');
      if (spawn.kind === 'boss' || spawn.kind === 'tideheart' || spawn.kind === 'cindermouth') markers.push('boss');
      if (spawn.kind === 'miniboss' || spawn.kind === 'bellwight' || spawn.kind === 'emberward') markers.push('miniboss');
    });
  }
  if (room === scene.activeRoom) {
    for (const e of scene.entities) {
      if (e instanceof Chest && e.opened) markers.pop();
    }
  }
  let mx = x + 6;
  const my = y + cellH - 22;
  for (const marker of markers.slice(0, 3)) {
    if (marker === 'chest') icon(m, m.art.icons.get('chestClosed'), mx, my, 16);
    else if (marker === 'boss') icon(m, m.art.icons.get('bosskey'), mx, my, 16);
    else icon(m, m.art.icons.get('shard'), mx, my, 16);
    mx += 18;
  }
}

function drawLegend(m: UiCtx, scene: Scene, x: number, y: number): void {
  const w = m.w - x - 24;
  if (w < 100) return;
  panel(m, x, y, w, 176, { fill: withAlpha(PAL.uiPanel, 0.5) });
  text(m, 'LEGEND', x + 12, y + 10, { size: 11, weight: 700, color: PAL.uiTextDim, letterSpacing: 1.2 });

  const rows: Array<[string, string]> = [
    ['chestClosed', 'Unopened chest'],
    ['bosskey', 'Sealed door / boss'],
    ['shard', 'Guardian'],
  ];
  rows.forEach(([iconName, label], i) => {
    const ry = y + 32 + i * 22;
    icon(m, m.art.icons.get(iconName as 'chestClosed'), x + 12, ry, 16);
    text(m, label, x + 34, ry + 3, { size: 10, color: PAL.uiTextDim });
  });

  const explored = [...scene.world.rooms.values()].filter((r) => r.visited).length;
  const total = scene.world.rooms.size;
  text(m, 'EXPLORED', x + 12, y + 112, { size: 10, weight: 700, color: PAL.uiTextDim });
  text(m, `${explored} / ${total} rooms`, x + 12, y + 128, { size: 11, weight: 700, color: PAL.uiText });

  if (!scene.progression.has('reveal')) {
    const hint = scene.world.def.dungeon
      ? scene.inventory.has('dungeonMap')
        ? scene.inventory.has('compass')
          ? 'Map and compass are working.'
          : 'A compass would mark chests and bosses.'
        : 'A dungeon map would reveal this floor.'
      : 'The Pathfinder mastery reveals the rest.';
    text(m, hint, x + 12, y + 152, { size: 9, color: withAlpha(PAL.uiTextDim, 0.7) });
  }
}
