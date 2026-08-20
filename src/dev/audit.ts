/**
 * World reachability audit.
 *
 * Hand-authored ASCII maps are easy to get subtly wrong — a wall with no gap,
 * a chest walled in, a stair behind solid rock. This flood-fills the whole
 * game world from the starting position, walking through doors and stairs,
 * and reports anything important it cannot reach.
 *
 * It runs from the smoke test rather than in normal play.
 */
import { ROOM_COLS, ROOM_ROWS } from '../engine/screen';
import { tileDef } from '../world/tiledefs';
import { MAPS } from '../world/world';
import type { WorldRegistry } from '../world/world';

export interface AuditIssue {
  kind: 'spawn' | 'link' | 'room';
  map: string;
  room: string;
  detail: string;
}

export interface AuditReport {
  reachableTiles: number;
  issues: AuditIssue[];
}

/**
 * Whether the player could eventually cross this tile, given the tools and
 * keys the game provides. Locked and bombable barriers count as passable
 * because the audit is about layout, not about progression order.
 */
function isPassable(mapId: string, gx: number, gy: number, worlds: WorldRegistry): boolean {
  const world = worlds.get(mapId);
  if (!world.inBounds(gx, gy)) return false;
  const tile = world.rawTileAt(gx, gy);
  const def = tileDef(tile);

  // Pits genuinely cannot be crossed on foot.
  if (def.pit) return false;
  if (!def.solid) return true;

  // Barriers the player can remove: brush, bombable rock, locked and sealed
  // doors, and doors that open when a room is cleared.
  if (def.cutTo !== undefined || def.bombTo !== undefined) return true;
  if (def.roomLock) return true;
  return def.interact === 'locked' || def.interact === 'boss';
}

/** Spawn kinds worth asserting the player can actually walk to. */
const IMPORTANT_SPAWNS = new Set([
  'chest',
  'boss',
  'miniboss',
  'bellwight',
  'tideheart',
  'emberward',
  'cindermouth',
  'npc',
  'shopkeeper',
  'bed',
  'sign',
]);

export function auditWorld(worlds: WorldRegistry, startMap: string, startGx: number, startGy: number): AuditReport {
  worlds.preload();

  const key = (map: string, gx: number, gy: number) => `${map}:${gx},${gy}`;
  const seen = new Set<string>();
  const queue: Array<[string, number, number]> = [[startMap, startGx, startGy]];
  seen.add(key(startMap, startGx, startGy));

  while (queue.length > 0) {
    const [mapId, gx, gy] = queue.pop()!;
    const world = worlds.get(mapId);

    // Doors and stairs jump to another map, or another part of this one.
    const room = world.roomForTile(gx, gy);
    if (room) {
      const localX = gx - room.rx * ROOM_COLS;
      const localY = gy - room.ry * ROOM_ROWS;
      const target = room.def.links?.[`${localX},${localY}`];
      if (target) {
        const k = key(target.map, target.gx, target.gy);
        if (!seen.has(k) && isPassable(target.map, target.gx, target.gy, worlds)) {
          seen.add(k);
          queue.push([target.map, target.gx, target.gy]);
        }
      }
    }

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = gx + dx;
      const ny = gy + dy;
      const k = key(mapId, nx, ny);
      if (seen.has(k)) continue;
      if (!isPassable(mapId, nx, ny, worlds)) continue;
      seen.add(k);
      queue.push([mapId, nx, ny]);
    }
  }

  const issues: AuditIssue[] = [];

  for (const mapId of Object.keys(MAPS)) {
    const world = worlds.get(mapId);
    for (const room of world.rooms.values()) {
      const roomName = room.def.name ?? `${room.rx},${room.ry}`;

      // Every room should have at least one reachable tile.
      let roomReached = false;
      for (let y = 0; y < ROOM_ROWS && !roomReached; y++) {
        for (let x = 0; x < ROOM_COLS; x++) {
          if (seen.has(key(mapId, room.rx * ROOM_COLS + x, room.ry * ROOM_ROWS + y))) {
            roomReached = true;
            break;
          }
        }
      }
      if (!roomReached) {
        issues.push({ kind: 'room', map: mapId, room: roomName, detail: 'no tile in this room is reachable' });
        continue;
      }

      for (const spawn of room.def.spawns ?? []) {
        if (!IMPORTANT_SPAWNS.has(spawn.kind)) continue;
        const gx = room.rx * ROOM_COLS + spawn.x;
        const gy = room.ry * ROOM_ROWS + spawn.y;
        // Props stand on their tile, so check the four tiles around them too.
        const adjacent = [
          [gx, gy],
          [gx + 1, gy],
          [gx - 1, gy],
          [gx, gy + 1],
          [gx, gy - 1],
        ];
        if (!adjacent.some(([ax, ay]) => seen.has(key(mapId, ax, ay)))) {
          issues.push({
            kind: 'spawn',
            map: mapId,
            room: roomName,
            detail: `${spawn.kind} at ${spawn.x},${spawn.y} is unreachable`,
          });
        }
        // A prop standing on a solid tile can never be interacted with.
        if (spawn.kind !== 'sign' && tileDef(world.rawTileAt(gx, gy)).solid) {
          issues.push({
            kind: 'spawn',
            map: mapId,
            room: roomName,
            detail: `${spawn.kind} at ${spawn.x},${spawn.y} sits on a solid tile`,
          });
        }
      }

      for (const [local, target] of Object.entries(room.def.links ?? {})) {
        const [lx, ly] = local.split(',').map(Number);
        const gx = room.rx * ROOM_COLS + lx;
        const gy = room.ry * ROOM_ROWS + ly;
        if (!seen.has(key(mapId, gx, gy))) {
          issues.push({ kind: 'link', map: mapId, room: roomName, detail: `link at ${local} is unreachable` });
        }
        if (!MAPS[target.map]) {
          issues.push({ kind: 'link', map: mapId, room: roomName, detail: `link at ${local} targets unknown map ${target.map}` });
          continue;
        }
        const destWorld = worlds.get(target.map);
        if (tileDef(destWorld.rawTileAt(target.gx, target.gy)).solid) {
          issues.push({
            kind: 'link',
            map: mapId,
            room: roomName,
            detail: `link at ${local} lands inside a wall in ${target.map}`,
          });
        }
      }
    }
  }

  return { reachableTiles: seen.size, issues };
}
