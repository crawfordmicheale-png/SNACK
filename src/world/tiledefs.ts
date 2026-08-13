/**
 * Tile vocabulary. Maps are authored as ASCII grids (see `maps/`), and each
 * character resolves to one of these ids through `LEGEND`.
 */

export enum Tile {
  Void,
  Grass,
  GrassTall,
  Flowers,
  Path,
  Dirt,
  Sand,
  Tree,
  Bush,
  Rock,
  Water,
  WaterDeep,
  Shallow,
  Cliff,
  Bridge,
  HouseWall,
  HouseRoof,
  HouseDoor,
  Window,
  Sign,
  ShopCounter,
  Statue,
  DungeonFloor,
  DungeonTile,
  DungeonWall,
  Pit,
  Spikes,
  DoorClosed,
  DoorLocked,
  DoorBoss,
  Doorway,
  StairsDown,
  StairsUp,
  CrackedWall,
  Torch,
  Pedestal,
  RuneFloor,
  Rubble,
  Carpet,
  Shrine,
}

export interface TileDef {
  /** Blocks walking. */
  solid?: boolean;
  /** Blocks arrows and thrown items even when walkable (e.g. tall walls). */
  blocksShot?: boolean;
  /** Contact damage in half-hearts. */
  hazard?: number;
  /** Falling tile — player is respawned at the room entrance. */
  pit?: boolean;
  /** Slows movement (shallow water, tall grass). */
  drag?: number;
  /** Replaced by this tile when cut with a sword. */
  cutTo?: Tile;
  /** Replaced by this tile when caught in a bomb blast. */
  bombTo?: Tile;
  /** Interaction handled by the scene when the player presses E facing it. */
  interact?: 'sign' | 'shop' | 'shrine' | 'stairs' | 'door' | 'locked' | 'boss' | 'pedestal';
  /** Doors that open when the room is cleared. */
  roomLock?: boolean;
  /** Emits light in dark rooms. */
  light?: number;
}

export const TILES: Record<Tile, TileDef> = {
  [Tile.Void]: { solid: true, blocksShot: true },
  [Tile.Grass]: {},
  [Tile.GrassTall]: { drag: 0.82, cutTo: Tile.Grass },
  [Tile.Flowers]: {},
  [Tile.Path]: {},
  [Tile.Dirt]: {},
  [Tile.Sand]: { drag: 0.9 },
  [Tile.Tree]: { solid: true, blocksShot: true },
  [Tile.Bush]: { solid: true, cutTo: Tile.Grass, bombTo: Tile.Grass },
  [Tile.Rock]: { solid: true, blocksShot: true, bombTo: Tile.Dirt },
  [Tile.Water]: { solid: true },
  [Tile.WaterDeep]: { solid: true, blocksShot: true },
  [Tile.Shallow]: { drag: 0.7 },
  [Tile.Cliff]: { solid: true, blocksShot: true },
  [Tile.Bridge]: {},
  [Tile.HouseWall]: { solid: true, blocksShot: true },
  [Tile.HouseRoof]: { solid: true, blocksShot: true },
  [Tile.HouseDoor]: { interact: 'door' },
  [Tile.Window]: { solid: true, blocksShot: true },
  [Tile.Sign]: { solid: true, interact: 'sign' },
  [Tile.ShopCounter]: { solid: true, interact: 'shop' },
  [Tile.Statue]: { solid: true, blocksShot: true },
  [Tile.DungeonFloor]: {},
  [Tile.DungeonTile]: {},
  [Tile.DungeonWall]: { solid: true, blocksShot: true },
  [Tile.Pit]: { pit: true },
  [Tile.Spikes]: { hazard: 1 },
  [Tile.DoorClosed]: { solid: true, blocksShot: true, roomLock: true },
  [Tile.DoorLocked]: { solid: true, blocksShot: true, interact: 'locked' },
  [Tile.DoorBoss]: { solid: true, blocksShot: true, interact: 'boss' },
  [Tile.Doorway]: {},
  [Tile.StairsDown]: { interact: 'stairs' },
  [Tile.StairsUp]: { interact: 'stairs' },
  [Tile.CrackedWall]: { solid: true, blocksShot: true, bombTo: Tile.DungeonFloor },
  [Tile.Torch]: { solid: true, light: 64 },
  [Tile.Pedestal]: { solid: true, interact: 'pedestal' },
  [Tile.RuneFloor]: {},
  [Tile.Rubble]: { drag: 0.85 },
  [Tile.Carpet]: {},
  [Tile.Shrine]: { solid: true, interact: 'shrine', light: 40 },
};

/** ASCII character -> tile, used by every hand-authored map. */
export const LEGEND: Record<string, Tile> = {
  ' ': Tile.DungeonFloor,
  '.': Tile.Grass,
  '"': Tile.GrassTall,
  ',': Tile.Flowers,
  '=': Tile.Path,
  '-': Tile.Dirt,
  ':': Tile.Sand,
  '#': Tile.Tree,
  'o': Tile.Bush,
  'R': Tile.Rock,
  '~': Tile.Water,
  '@': Tile.WaterDeep,
  's': Tile.Shallow,
  '^': Tile.Cliff,
  'b': Tile.Bridge,
  'H': Tile.HouseWall,
  'A': Tile.HouseRoof,
  'D': Tile.HouseDoor,
  'w': Tile.Window,
  'i': Tile.Sign,
  '$': Tile.ShopCounter,
  'T': Tile.Statue,
  'x': Tile.Void,
  'F': Tile.DungeonTile,
  'W': Tile.DungeonWall,
  'P': Tile.Pit,
  'S': Tile.Spikes,
  '+': Tile.DoorClosed,
  'L': Tile.DoorLocked,
  'B': Tile.DoorBoss,
  '/': Tile.Doorway,
  '>': Tile.StairsDown,
  '<': Tile.StairsUp,
  'C': Tile.CrackedWall,
  't': Tile.Torch,
  'p': Tile.Pedestal,
  'r': Tile.RuneFloor,
  'u': Tile.Rubble,
  'c': Tile.Carpet,
  'Y': Tile.Shrine,
};

export function tileDef(t: Tile): TileDef {
  return TILES[t] ?? TILES[Tile.Void];
}

export function isSolid(t: Tile): boolean {
  return tileDef(t).solid === true;
}
