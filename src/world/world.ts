/**
 * Runtime world. Each map is flattened into one global tile grid so entities
 * can use continuous world coordinates and the camera can slide smoothly
 * between screens, while rooms remain the unit of spawning and locking.
 */
import { ROOM_COLS, ROOM_ROWS, TILE } from '../engine/screen';
import type { Tileset } from '../art/tileset';
import { LEGEND, Tile, tileDef } from './tiledefs';
import type { MapDef, RoomDef } from './types';
import { OVERWORLD } from './maps/overworld';
import { DUNGEON } from './maps/dungeon';
import { DROWNED } from './maps/drowned';
import { ASHEN } from './maps/ashen';
import { INTERIORS } from './maps/interiors';

export const MAPS: Record<string, MapDef> = {
  overworld: OVERWORLD,
  dungeon: DUNGEON,
  drowned: DROWNED,
  ashen: ASHEN,
  interiors: INTERIORS,
};

export interface RoomRuntime {
  def: RoomDef;
  rx: number;
  ry: number;
  /** True once every enemy spawned here has been killed. */
  cleared: boolean;
  /** True once the player has entered; drives the dungeon map screen. */
  visited: boolean;
  /** Spawns already consumed (opened chests, killed enemies) by index. */
  consumed: Set<number>;
}

function roomKey(rx: number, ry: number): string {
  return `${rx},${ry}`;
}

/** Cheap 2D hash used to vary tile art without storing per-cell data. */
function hash2(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

export class GameWorld {
  readonly def: MapDef;
  readonly cols: number;
  readonly rows: number;
  readonly tilesW: number;
  readonly tilesH: number;

  private tiles: Uint8Array;
  private readonly baseTiles: Uint8Array;
  /** 0 = door sits in a horizontal wall, 1 = vertical. */
  private doorOrient: Uint8Array;
  readonly rooms = new Map<string, RoomRuntime>();

  constructor(def: MapDef) {
    this.def = def;
    this.cols = def.cols;
    this.rows = def.rows;
    this.tilesW = def.cols * ROOM_COLS;
    this.tilesH = def.rows * ROOM_ROWS;
    this.tiles = new Uint8Array(this.tilesW * this.tilesH).fill(Tile.Void);

    for (const room of def.rooms) {
      this.rooms.set(roomKey(room.rx, room.ry), {
        def: room,
        rx: room.rx,
        ry: room.ry,
        cleared: false,
        visited: false,
        consumed: new Set(),
      });
      this.stampRoom(room);
    }

    this.baseTiles = this.tiles.slice();
    this.doorOrient = new Uint8Array(this.tilesW * this.tilesH);
    this.computeDoorOrientation();
  }

  /** Writes one room's ASCII rows into the global grid. */
  private stampRoom(room: RoomDef): void {
    for (let y = 0; y < ROOM_ROWS; y++) {
      let line = room.rows[y] ?? '';
      if (line.length !== ROOM_COLS) {
        console.warn(
          `[map ${this.def.id}] room ${room.rx},${room.ry} row ${y} is ${line.length} chars, expected ${ROOM_COLS}`,
        );
        line = line.length > ROOM_COLS ? line.slice(0, ROOM_COLS) : line.padEnd(ROOM_COLS, line.at(-1) ?? ' ');
      }
      for (let x = 0; x < ROOM_COLS; x++) {
        const ch = line[x];
        const tile = LEGEND[ch];
        if (tile === undefined) {
          console.warn(`[map ${this.def.id}] unknown legend char '${ch}' at room ${room.rx},${room.ry} ${x},${y}`);
        }
        const gx = room.rx * ROOM_COLS + x;
        const gy = room.ry * ROOM_ROWS + y;
        this.tiles[gy * this.tilesW + gx] = tile ?? Tile.Void;
      }
    }
  }

  /**
   * Doors are drawn as leaves spanning their opening. A door flanked by solid
   * tiles on the left and right sits in a horizontal wall; otherwise vertical.
   */
  private computeDoorOrientation(): void {
    const doorTiles = new Set<Tile>([Tile.DoorClosed, Tile.DoorLocked, Tile.DoorBoss]);
    for (let gy = 0; gy < this.tilesH; gy++) {
      for (let gx = 0; gx < this.tilesW; gx++) {
        const t = this.tiles[gy * this.tilesW + gx] as Tile;
        if (!doorTiles.has(t)) continue;
        const leftSolid = this.isWallish(gx - 1, gy, doorTiles);
        const rightSolid = this.isWallish(gx + 1, gy, doorTiles);
        this.doorOrient[gy * this.tilesW + gx] = leftSolid && rightSolid ? 0 : 1;
      }
    }
  }

  private isWallish(gx: number, gy: number, doorTiles: Set<Tile>): boolean {
    const t = this.rawTileAt(gx, gy);
    return t === Tile.DungeonWall || t === Tile.Void || t === Tile.CrackedWall || doorTiles.has(t);
  }

  inBounds(gx: number, gy: number): boolean {
    return gx >= 0 && gy >= 0 && gx < this.tilesW && gy < this.tilesH;
  }

  rawTileAt(gx: number, gy: number): Tile {
    if (!this.inBounds(gx, gy)) return Tile.Void;
    return this.tiles[gy * this.tilesW + gx] as Tile;
  }

  setTile(gx: number, gy: number, tile: Tile): void {
    if (!this.inBounds(gx, gy)) return;
    this.tiles[gy * this.tilesW + gx] = tile;
  }

  /** Tile lookup from world pixel coordinates. */
  tileAtPixel(px: number, py: number): Tile {
    return this.rawTileAt(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  roomAt(rx: number, ry: number): RoomRuntime | undefined {
    return this.rooms.get(roomKey(rx, ry));
  }

  /** Room containing a global tile. */
  roomForTile(gx: number, gy: number): RoomRuntime | undefined {
    return this.roomAt(Math.floor(gx / ROOM_COLS), Math.floor(gy / ROOM_ROWS));
  }

  roomForPixel(px: number, py: number): RoomRuntime | undefined {
    return this.roomForTile(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  /**
   * Whether a tile blocks movement. Room-lock doors become passable once
   * their room is cleared, which is what makes "kill everything" gates work.
   */
  isSolidTile(gx: number, gy: number): boolean {
    const t = this.rawTileAt(gx, gy);
    const def = tileDef(t);
    if (def.roomLock) {
      const room = this.roomForTile(gx, gy);
      return !(room?.cleared ?? false);
    }
    return def.solid === true;
  }

  blocksShot(gx: number, gy: number): boolean {
    const t = this.rawTileAt(gx, gy);
    const def = tileDef(t);
    if (def.roomLock) {
      const room = this.roomForTile(gx, gy);
      return !(room?.cleared ?? false);
    }
    return def.blocksShot === true;
  }

  /** Applies a sword cut to a tile, returning true if something was cut. */
  cutTile(gx: number, gy: number): boolean {
    const t = this.rawTileAt(gx, gy);
    const to = tileDef(t).cutTo;
    if (to === undefined) return false;
    this.setTile(gx, gy, to);
    return true;
  }

  /** Applies a bomb blast, returning true if the tile changed. */
  blastTile(gx: number, gy: number): boolean {
    const t = this.rawTileAt(gx, gy);
    const def = tileDef(t);
    const to = def.bombTo ?? def.cutTo;
    if (to === undefined) return false;
    this.setTile(gx, gy, to);
    return true;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /** Draws every tile overlapping the camera rect. */
  render(ctx: CanvasRenderingContext2D, tileset: Tileset, camX: number, camY: number, viewW: number, viewH: number): void {
    const x0 = Math.floor(camX / TILE);
    const y0 = Math.floor(camY / TILE);
    const x1 = Math.ceil((camX + viewW) / TILE);
    const y1 = Math.ceil((camY + viewH) / TILE);

    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const tile = this.rawTileAt(gx, gy);
        const dx = Math.round(gx * TILE - camX);
        const dy = Math.round(gy * TILE - camY);
        const def = tileDef(tile);

        // Room-lock doors vanish once the room is cleared.
        if (def.roomLock) {
          const room = this.roomForTile(gx, gy);
          if (room?.cleared) {
            ctx.drawImage(tileset.get(Tile.Doorway, this.doorOrient[this.idx(gx, gy)]), dx, dy);
            continue;
          }
        }

        const variant =
          tile === Tile.DoorClosed || tile === Tile.DoorLocked || tile === Tile.DoorBoss
            ? this.doorOrient[this.idx(gx, gy)]
            : hash2(gx, gy) % tileset.variantCount(tile);
        ctx.drawImage(tileset.get(tile, variant), dx, dy);
      }
    }
  }

  private idx(gx: number, gy: number): number {
    if (!this.inBounds(gx, gy)) return 0;
    return gy * this.tilesW + gx;
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  /** Tiles changed since load, as flat [index, tile] pairs. */
  serializeTiles(): number[] {
    const diff: number[] = [];
    for (let i = 0; i < this.tiles.length; i++) {
      if (this.tiles[i] !== this.baseTiles[i]) diff.push(i, this.tiles[i]);
    }
    return diff;
  }

  restoreTiles(diff: number[]): void {
    this.tiles.set(this.baseTiles);
    for (let i = 0; i + 1 < diff.length; i += 2) {
      this.tiles[diff[i]] = diff[i + 1];
    }
  }

  serializeRooms(): Record<string, { cleared: boolean; visited: boolean; consumed: number[] }> {
    const out: Record<string, { cleared: boolean; visited: boolean; consumed: number[] }> = {};
    for (const [key, room] of this.rooms) {
      if (!room.cleared && !room.visited && room.consumed.size === 0) continue;
      out[key] = { cleared: room.cleared, visited: room.visited, consumed: [...room.consumed] };
    }
    return out;
  }

  restoreRooms(data: Record<string, { cleared: boolean; visited: boolean; consumed: number[] }>): void {
    for (const [key, saved] of Object.entries(data)) {
      const room = this.rooms.get(key);
      if (!room) continue;
      room.cleared = saved.cleared;
      room.visited = saved.visited;
      room.consumed = new Set(saved.consumed);
    }
  }
}

/** Lazily instantiated world per map id, so state persists across transitions. */
export class WorldRegistry {
  private worlds = new Map<string, GameWorld>();

  get(mapId: string): GameWorld {
    let world = this.worlds.get(mapId);
    if (!world) {
      const def = MAPS[mapId];
      if (!def) throw new Error(`unknown map: ${mapId}`);
      world = new GameWorld(def);
      this.worlds.set(mapId, world);
    }
    return world;
  }

  all(): Array<[string, GameWorld]> {
    return [...this.worlds.entries()];
  }

  /** Forces every map to instantiate — used before restoring a save. */
  preload(): void {
    for (const id of Object.keys(MAPS)) this.get(id);
  }

  reset(): void {
    this.worlds.clear();
  }
}
