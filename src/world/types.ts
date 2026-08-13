/** Shared map authoring types. Maps live in `world/maps/`. */
import { ROOM_COLS, ROOM_ROWS } from '../engine/screen';
import type { SongName } from '../engine/audio';

/** A spawn placed at room-local tile coordinates. */
export interface SpawnDef {
  kind: string;
  x: number;
  y: number;
  opts?: Record<string, string | number | boolean>;
}

/** Destination of a door, stair or cave mouth, in destination-map tile space. */
export interface LinkDef {
  map: string;
  gx: number;
  gy: number;
  /** Sound played on transit. */
  sfx?: 'stairs' | 'door';
}

export interface RoomDef {
  rx: number;
  ry: number;
  /** Display name, shown when entering the room. */
  name?: string;
  rows: string[];
  spawns?: SpawnDef[];
  /** Tile-keyed ("x,y") transitions. */
  links?: Record<string, LinkDef>;
  /** Doors marked `roomLock` stay shut until every enemy here is dead. */
  lockOnEnemies?: boolean;
  /** Renders with a vignette; only torches and the player light it. */
  dark?: boolean;
  music?: SongName;
}

export interface MapDef {
  id: string;
  name: string;
  cols: number;
  rows: number;
  music: SongName;
  /** Dungeons show a room-grid map screen and track keys separately. */
  dungeon?: boolean;
  rooms: RoomDef[];
}

/** Converts room-grid + room-local coords to a global tile position. */
export function gp(rx: number, ry: number, x: number, y: number): { gx: number; gy: number } {
  return { gx: rx * ROOM_COLS + x, gy: ry * ROOM_ROWS + y };
}

/** Builds a link definition in one call. */
export function link(map: string, rx: number, ry: number, x: number, y: number, sfx?: 'stairs' | 'door'): LinkDef {
  const { gx, gy } = gp(rx, ry, x, y);
  return sfx ? { map, gx, gy, sfx } : { map, gx, gy };
}
