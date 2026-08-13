/**
 * Procedural tileset. Each tile id is painted into one or more 16x16 variant
 * canvases at boot; the world renderer picks a variant per cell from a
 * coordinate hash so large fields of grass do not visibly tile.
 */
import { TILE } from '../engine/screen';
import { Rng } from '../engine/rng';
import { Tile } from '../world/tiledefs';
import { PAL, shade, withAlpha } from './palette';
import { Painter, makeCanvas, type Canvas } from './paint';

const T = TILE;

/** Deterministic per-tile art seed so the world looks the same every load. */
function seeded(tile: Tile, variant: number): Rng {
  return new Rng(0x5eed_0000 + tile * 977 + variant * 31);
}

type Draw = (p: Painter, r: Rng, variant: number) => void;

/** Ground base with a light dither so flat fills do not look like plastic. */
function ground(p: Painter, r: Rng, base: string, dark: string, light: string, flecks = 10): void {
  p.rect(0, 0, T, T, base);
  p.speckle(0, 0, T, T, flecks, dark, r);
  p.speckle(0, 0, T, T, Math.floor(flecks * 0.6), light, r);
}

const DRAWERS: Partial<Record<Tile, { variants: number; draw: Draw }>> = {
  [Tile.Void]: {
    variants: 1,
    draw: (p) => p.rect(0, 0, T, T, PAL.black),
  },

  [Tile.Grass]: {
    variants: 4,
    draw: (p, r, v) => {
      ground(p, r, PAL.grass, PAL.grassDark, PAL.grassLight, 12);
      // Occasional tuft so the field reads as organic.
      if (v > 0) {
        const x = r.int(2, T - 4);
        const y = r.int(2, T - 4);
        p.px(x, y, PAL.grassHi).px(x + 1, y - 1, PAL.grassHi).px(x + 2, y, PAL.grassHi);
      }
    },
  },

  [Tile.GrassTall]: {
    variants: 2,
    draw: (p, r) => {
      ground(p, r, PAL.grass, PAL.grassDark, PAL.grassLight, 8);
      for (let i = 0; i < 5; i++) {
        const x = 1 + i * 3 + r.int(0, 1);
        const h = r.int(5, 9);
        p.vline(x, T - h, h, PAL.grassDark);
        p.vline(x + 1, T - h + 2, h - 2, PAL.grassLight);
        p.px(x, T - h - 1, PAL.grassHi);
      }
    },
  },

  [Tile.Flowers]: {
    variants: 3,
    draw: (p, r) => {
      ground(p, r, PAL.grass, PAL.grassDark, PAL.grassLight, 10);
      const colors = [PAL.white, PAL.uiAccent, PAL.bloodLight, PAL.magicLight];
      for (let i = 0; i < 3; i++) {
        const x = r.int(2, T - 3);
        const y = r.int(2, T - 3);
        const c = r.pick(colors);
        p.px(x, y, c).px(x - 1, y, shade(c, 0.75)).px(x + 1, y, shade(c, 0.75));
        p.px(x, y - 1, shade(c, 0.85)).px(x, y + 1, PAL.grassDark);
      }
    },
  },

  [Tile.Path]: {
    variants: 3,
    draw: (p, r) => {
      ground(p, r, PAL.dirtLight, PAL.dirt, PAL.sand, 16);
      for (let i = 0; i < 4; i++) {
        const x = r.int(1, T - 3);
        const y = r.int(1, T - 2);
        p.px(x, y, PAL.dirtDark).px(x + 1, y, PAL.dirtDark);
      }
    },
  },

  [Tile.Dirt]: {
    variants: 2,
    draw: (p, r) => ground(p, r, PAL.dirt, PAL.dirtDark, PAL.dirtLight, 18),
  },

  [Tile.Sand]: {
    variants: 2,
    draw: (p, r) => ground(p, r, PAL.sand, PAL.dirtLight, PAL.sandLight, 14),
  },

  [Tile.Rubble]: {
    variants: 2,
    draw: (p, r) => {
      ground(p, r, PAL.dungeonFloorDark, PAL.stoneDark, PAL.stone, 10);
      for (let i = 0; i < 6; i++) {
        const x = r.int(1, T - 4);
        const y = r.int(1, T - 3);
        p.rect(x, y, r.int(1, 3), r.int(1, 2), PAL.stoneLight);
        p.px(x, y, PAL.stoneHi);
      }
    },
  },

  [Tile.Tree]: {
    variants: 2,
    draw: (p, r) => {
      ground(p, r, PAL.grassDark, PAL.leafDark, PAL.grass, 6);
      // Trunk, then a lumpy canopy built from overlapping blobs.
      p.rect(7, 10, 3, 6, PAL.woodDark);
      p.vline(7, 10, 6, shade(PAL.woodDark, 0.7));
      p.ellipse(8, 7, 7.5, 6.5, PAL.leafDark);
      p.ellipse(8, 6.5, 6, 5, PAL.leaf);
      p.ellipse(6.5, 5.5, 3.5, 3, PAL.leafLight);
      p.speckle(2, 1, 12, 10, 10, PAL.leafDark, r);
      p.speckle(3, 2, 10, 7, 7, PAL.leafLight, r);
      p.px(5, 3, PAL.grassHi).px(10, 4, PAL.grassHi);
    },
  },

  [Tile.Bush]: {
    variants: 2,
    draw: (p, r) => {
      ground(p, r, PAL.grass, PAL.grassDark, PAL.grassLight, 8);
      p.ellipse(8, 9.5, 6.5, 5.5, PAL.leafDark);
      p.ellipse(8, 9, 5.5, 4.5, PAL.leaf);
      p.ellipse(6.5, 7.5, 3, 2.5, PAL.leafLight);
      p.speckle(3, 5, 11, 9, 9, PAL.leafDark, r);
      p.hline(3, 14, 10, shade(PAL.grassDark, 0.8));
    },
  },

  [Tile.Rock]: {
    variants: 2,
    draw: (p, r) => {
      ground(p, r, PAL.grass, PAL.grassDark, PAL.grassLight, 6);
      p.ellipse(8, 9.5, 6.5, 5.5, PAL.rockDark);
      p.ellipse(8, 9, 5.5, 4.5, PAL.rock);
      p.ellipse(6.5, 7, 3, 2.2, PAL.rockLight);
      p.speckle(3, 5, 11, 9, 7, PAL.rockDark, r);
      p.hline(2, 14, 12, withAlpha(PAL.black, 0.3));
    },
  },

  [Tile.Water]: {
    variants: 3,
    draw: (p, r, v) => {
      p.rect(0, 0, T, T, PAL.water);
      p.speckle(0, 0, T, T, 10, PAL.waterDeep, r);
      // Two staggered wave crests per variant.
      for (let i = 0; i < 2; i++) {
        const y = 3 + i * 7 + ((v * 2) % 3);
        const x = r.int(1, 8);
        p.hline(x, y, 4, PAL.waterLight);
        p.px(x + 4, y - 1, PAL.foam);
        p.hline(x + 6, y + 3, 3, PAL.waterLight);
      }
    },
  },

  [Tile.WaterDeep]: {
    variants: 2,
    draw: (p, r) => {
      p.rect(0, 0, T, T, PAL.waterDeep);
      p.speckle(0, 0, T, T, 8, shade(PAL.waterDeep, 0.75), r);
      p.speckle(0, 0, T, T, 4, PAL.water, r);
    },
  },

  [Tile.Shallow]: {
    variants: 2,
    draw: (p, r) => {
      p.rect(0, 0, T, T, PAL.waterLight);
      p.speckle(0, 0, T, T, 12, PAL.water, r);
      p.speckle(0, 0, T, T, 8, PAL.foam, r);
      p.speckle(0, 0, T, T, 5, PAL.sand, r);
    },
  },

  [Tile.Bridge]: {
    variants: 1,
    draw: (p) => {
      p.rect(0, 0, T, T, PAL.woodDark);
      for (let y = 0; y < T; y += 4) {
        p.rect(0, y, T, 3, PAL.wood);
        p.hline(0, y + 3, T, shade(PAL.woodDark, 0.8));
        p.hline(0, y, T, PAL.woodLight);
      }
      p.vline(0, 0, T, PAL.woodDark);
      p.vline(T - 1, 0, T, PAL.woodDark);
    },
  },

  [Tile.Cliff]: {
    variants: 2,
    draw: (p, r) => {
      p.rect(0, 0, T, T, PAL.rock);
      p.hline(0, 0, T, PAL.rockLight);
      p.hline(0, 1, T, PAL.rockLight);
      // Blocky strata.
      for (let y = 3; y < T; y += 5) {
        p.hline(0, y, T, PAL.rockDark);
        const notch = r.int(2, T - 5);
        p.rect(notch, y + 1, 3, 3, shade(PAL.rock, 0.86));
      }
      p.vline(0, 0, T, PAL.rockDark);
      p.vline(T - 1, 0, T, shade(PAL.rockDark, 0.85));
      p.speckle(1, 2, T - 2, T - 3, 8, PAL.rockLight, r);
    },
  },

  [Tile.HouseWall]: {
    variants: 2,
    draw: (p, r) => {
      p.rect(0, 0, T, T, PAL.plaster);
      p.speckle(0, 0, T, T, 10, PAL.plasterDark, r);
      // Timber framing.
      p.hline(0, 0, T, PAL.woodDark);
      p.hline(0, T - 1, T, PAL.woodDark);
      p.vline(0, 0, T, PAL.woodDark);
      p.vline(T - 1, 0, T, PAL.woodDark);
      p.hline(1, 7, T - 2, PAL.wood);
    },
  },

  [Tile.HouseRoof]: {
    variants: 2,
    draw: (p, r) => {
      p.rect(0, 0, T, T, PAL.roof);
      // Overlapping shingles.
      for (let y = 0; y < T; y += 4) {
        for (let x = (y % 8 === 0 ? 0 : -3); x < T; x += 6) {
          p.rect(x, y, 5, 3, PAL.roof);
          p.hline(x, y, 5, PAL.roofLight);
          p.hline(x, y + 3, 5, PAL.roofDark);
          p.vline(x + 5, y, 4, PAL.roofDark);
        }
      }
      p.speckle(0, 0, T, T, 6, PAL.roofDark, r);
    },
  },

  [Tile.HouseDoor]: {
    variants: 1,
    draw: (p) => {
      p.rect(0, 0, T, T, PAL.plaster);
      p.rect(2, 1, 12, 15, PAL.woodDark);
      p.rect(3, 2, 10, 14, PAL.wood);
      p.vline(8, 2, 14, PAL.woodDark);
      p.rect(3, 2, 10, 2, PAL.woodLight);
      p.px(11, 9, PAL.gold).px(11, 10, PAL.goldDark);
      p.rect(0, 0, T, 1, PAL.woodDark);
    },
  },

  [Tile.Window]: {
    variants: 1,
    draw: (p) => {
      p.rect(0, 0, T, T, PAL.plaster);
      p.rect(3, 3, 10, 10, PAL.woodDark);
      p.rect(4, 4, 8, 8, PAL.waterDeep);
      p.rect(4, 4, 4, 4, shade(PAL.water, 1.15));
      p.vline(8, 4, 8, PAL.woodDark);
      p.hline(4, 8, 8, PAL.woodDark);
    },
  },

  [Tile.Sign]: {
    variants: 1,
    draw: (p, r) => {
      ground(p, r, PAL.grass, PAL.grassDark, PAL.grassLight, 8);
      p.rect(7, 9, 2, 6, PAL.woodDark);
      p.rect(2, 3, 12, 8, PAL.woodDark);
      p.rect(3, 4, 10, 6, PAL.woodLight);
      p.hline(4, 6, 8, PAL.woodDark);
      p.hline(4, 8, 6, PAL.woodDark);
    },
  },

  [Tile.ShopCounter]: {
    variants: 1,
    draw: (p) => {
      p.rect(0, 0, T, T, PAL.woodDark);
      p.rect(0, 2, T, 12, PAL.wood);
      p.hline(0, 2, T, PAL.woodLight);
      p.hline(0, 13, T, shade(PAL.woodDark, 0.8));
      p.rect(2, 5, 4, 4, PAL.gold);
      p.rect(2, 5, 4, 1, PAL.goldLight);
      p.rect(9, 6, 4, 3, PAL.bloodLight);
      p.px(9, 6, PAL.white);
    },
  },

  [Tile.Statue]: {
    variants: 1,
    draw: (p, r) => {
      ground(p, r, PAL.grass, PAL.grassDark, PAL.grassLight, 6);
      p.rect(3, 12, 10, 4, PAL.stoneDark);
      p.rect(4, 13, 8, 2, PAL.stone);
      p.rect(5, 3, 6, 10, PAL.stone);
      p.rect(6, 2, 4, 4, PAL.stoneLight);
      p.px(6, 4, PAL.stoneDark).px(9, 4, PAL.stoneDark);
      p.rect(4, 7, 8, 1, PAL.stoneHi);
      p.vline(5, 3, 10, PAL.stoneHi);
    },
  },

  [Tile.Shrine]: {
    variants: 1,
    draw: (p, r) => {
      ground(p, r, PAL.grassDark, PAL.grassDark, PAL.grass, 6);
      p.rect(2, 11, 12, 5, PAL.stoneDark);
      p.rect(3, 12, 10, 3, PAL.stone);
      p.rect(4, 2, 8, 10, PAL.stoneDark);
      p.rect(5, 3, 6, 9, PAL.stone);
      p.ellipse(8, 6.5, 2.5, 3, PAL.magic);
      p.ellipse(8, 6, 1.5, 2, PAL.magicLight);
      p.px(8, 5, PAL.white);
      p.hline(4, 10, 8, PAL.stoneHi);
    },
  },

  [Tile.DungeonFloor]: {
    variants: 3,
    draw: (p, r) => {
      p.rect(0, 0, T, T, PAL.dungeonFloor);
      p.speckle(0, 0, T, T, 12, PAL.dungeonFloorDark, r);
      p.speckle(0, 0, T, T, 6, PAL.dungeonFloorLight, r);
      p.hline(0, T - 1, T, PAL.dungeonFloorDark);
      p.vline(T - 1, 0, T, PAL.dungeonFloorDark);
    },
  },

  [Tile.DungeonTile]: {
    variants: 2,
    draw: (p, r) => {
      p.rect(0, 0, T, T, PAL.dungeonFloorDark);
      p.rect(1, 1, 6, 6, PAL.dungeonFloor);
      p.rect(9, 1, 6, 6, PAL.dungeonFloorLight);
      p.rect(1, 9, 6, 6, PAL.dungeonFloorLight);
      p.rect(9, 9, 6, 6, PAL.dungeonFloor);
      p.speckle(0, 0, T, T, 8, PAL.dungeonFloorDark, r);
    },
  },

  [Tile.Carpet]: {
    variants: 1,
    draw: (p) => {
      p.rect(0, 0, T, T, PAL.bloodDark);
      p.rect(1, 1, T - 2, T - 2, PAL.blood);
      p.frame(2, 2, T - 4, T - 4, PAL.gold);
      p.rect(6, 6, 4, 4, PAL.goldDark);
      p.rect(7, 7, 2, 2, PAL.goldLight);
    },
  },

  [Tile.RuneFloor]: {
    variants: 2,
    draw: (p, r, v) => {
      p.rect(0, 0, T, T, PAL.dungeonFloorDark);
      p.speckle(0, 0, T, T, 10, PAL.dungeonFloor, r);
      p.frame(2, 2, 12, 12, PAL.magic);
      if (v === 0) {
        p.line(4, 4, 11, 11, PAL.magicLight);
        p.line(11, 4, 4, 11, PAL.magicLight);
      } else {
        p.circle(8, 8, 3, PAL.magic);
        p.circle(8, 8, 1.5, PAL.magicLight);
      }
    },
  },

  [Tile.DungeonWall]: {
    variants: 2,
    draw: (p, r) => {
      p.rect(0, 0, T, T, PAL.dungeonWall);
      // Two courses of offset masonry.
      for (let y = 0; y < T; y += 8) {
        const off = (y / 8) % 2 === 0 ? 0 : -4;
        for (let x = off; x < T; x += 8) {
          p.rect(x + 1, y + 1, 6, 6, PAL.dungeonWallLight);
          p.hline(x + 1, y + 1, 6, shade(PAL.dungeonWallLight, 1.2));
          p.hline(x + 1, y + 6, 6, PAL.dungeonWallDark);
        }
      }
      p.speckle(0, 0, T, T, 8, PAL.dungeonWallDark, r);
    },
  },

  [Tile.CrackedWall]: {
    variants: 1,
    draw: (p, r) => {
      p.rect(0, 0, T, T, PAL.dungeonWall);
      for (let y = 0; y < T; y += 8) {
        const off = (y / 8) % 2 === 0 ? 0 : -4;
        for (let x = off; x < T; x += 8) {
          p.rect(x + 1, y + 1, 6, 6, PAL.dungeonWallLight);
        }
      }
      p.line(3, 1, 6, 7, PAL.dungeonWallDark);
      p.line(6, 7, 4, 14, PAL.dungeonWallDark);
      p.line(6, 7, 12, 9, PAL.dungeonWallDark);
      p.line(12, 9, 13, 15, PAL.dungeonWallDark);
      p.speckle(2, 2, 12, 12, 10, PAL.black, r);
    },
  },

  [Tile.Pit]: {
    variants: 1,
    draw: (p) => {
      p.rect(0, 0, T, T, PAL.pit);
      p.hline(0, 0, T, PAL.dungeonWallDark);
      p.hline(0, 1, T, shade(PAL.dungeonWallDark, 0.7));
      p.vline(0, 0, T, PAL.dungeonWallDark);
      p.vline(T - 1, 0, T, PAL.dungeonWallDark);
    },
  },

  [Tile.Spikes]: {
    variants: 1,
    draw: (p) => {
      p.rect(0, 0, T, T, PAL.dungeonFloorDark);
      for (let i = 0; i < 4; i++) {
        const x = 1 + i * 4;
        p.line(x, 14, x + 2, 3, PAL.steel);
        p.line(x + 2, 3, x + 4, 14, PAL.steelDark);
        p.px(x + 2, 2, PAL.steelLight);
        p.hline(x, 14, 5, PAL.stoneDark);
      }
    },
  },

  [Tile.Doorway]: {
    variants: 1,
    draw: (p) => {
      p.rect(0, 0, T, T, PAL.dungeonFloorDark);
      p.rect(2, 0, 12, T, PAL.dungeonFloor);
      p.vline(1, 0, T, PAL.dungeonWallDark);
      p.vline(14, 0, T, PAL.dungeonWallDark);
    },
  },

  [Tile.Torch]: {
    variants: 1,
    draw: (p) => {
      p.rect(0, 0, T, T, PAL.dungeonWall);
      p.rect(1, 1, 14, 14, PAL.dungeonWallLight);
      p.rect(6, 8, 4, 7, PAL.woodDark);
      p.rect(5, 6, 6, 3, PAL.steelDark);
      p.ellipse(8, 4, 3, 4, PAL.fire);
      p.ellipse(8, 4, 1.8, 2.8, PAL.fireLight);
      p.px(8, 1, PAL.white);
    },
  },

  [Tile.Pedestal]: {
    variants: 1,
    draw: (p) => {
      p.rect(0, 0, T, T, PAL.dungeonFloorDark);
      p.rect(3, 10, 10, 5, PAL.stoneDark);
      p.rect(4, 11, 8, 3, PAL.stone);
      p.rect(5, 5, 6, 6, PAL.stoneLight);
      p.rect(6, 4, 4, 2, PAL.stoneHi);
      p.frame(5, 5, 6, 6, PAL.stoneDark);
    },
  },

  [Tile.StairsDown]: {
    variants: 1,
    draw: (p) => {
      p.rect(0, 0, T, T, PAL.stoneDark);
      for (let i = 0; i < 4; i++) {
        const y = 2 + i * 3;
        const inset = i;
        p.rect(1 + inset, y, 14 - inset * 2, 3, shade(PAL.stone, 1 - i * 0.14));
        p.hline(1 + inset, y, 14 - inset * 2, shade(PAL.stoneLight, 1 - i * 0.14));
      }
      p.rect(5, 13, 6, 3, PAL.black);
    },
  },

  [Tile.StairsUp]: {
    variants: 1,
    draw: (p) => {
      p.rect(0, 0, T, T, PAL.stoneDark);
      for (let i = 0; i < 4; i++) {
        const y = 13 - i * 3;
        const inset = i;
        p.rect(1 + inset, y - 2, 14 - inset * 2, 3, shade(PAL.stone, 0.7 + i * 0.12));
        p.hline(1 + inset, y - 2, 14 - inset * 2, shade(PAL.stoneHi, 0.7 + i * 0.12));
      }
      p.rect(6, 0, 4, 3, withAlpha(PAL.white, 0.35));
    },
  },
};

/** Door leaves share geometry; only the studs and lock differ. */
function drawDoor(p: Painter, accent: string, horizontal: boolean, locked: boolean): void {
  p.rect(0, 0, T, T, PAL.dungeonWallDark);
  if (horizontal) {
    p.rect(0, 2, T, 12, PAL.woodDark);
    for (let x = 1; x < T; x += 4) p.vline(x, 3, 10, PAL.wood);
    p.hline(0, 2, T, accent);
    p.hline(0, 13, T, accent);
  } else {
    p.rect(2, 0, 12, T, PAL.woodDark);
    for (let y = 1; y < T; y += 4) p.hline(3, y, 10, PAL.wood);
    p.vline(2, 0, T, accent);
    p.vline(13, 0, T, accent);
  }
  if (locked) {
    p.rect(6, 6, 5, 5, PAL.steelDark);
    p.rect(7, 7, 3, 3, accent);
    p.px(8, 8, PAL.black);
    p.px(8, 9, PAL.black);
  } else {
    p.rect(7, 7, 3, 3, accent);
  }
}

export class Tileset {
  /** tile id -> variant canvases. */
  private cache = new Map<Tile, Canvas[]>();

  constructor() {
    for (const key of Object.keys(DRAWERS)) {
      const tile = Number(key) as Tile;
      const entry = DRAWERS[tile];
      if (!entry) continue;
      const variants: Canvas[] = [];
      for (let v = 0; v < entry.variants; v++) {
        const p = new Painter(T, T);
        entry.draw(p, seeded(tile, v), v);
        variants.push(p.canvas);
      }
      this.cache.set(tile, variants);
    }

    // Doors: variant 0 sits in a horizontal wall, variant 1 in a vertical one.
    const doors: Array<[Tile, string, boolean]> = [
      [Tile.DoorClosed, PAL.steel, false],
      [Tile.DoorLocked, PAL.gold, true],
      [Tile.DoorBoss, PAL.blood, true],
    ];
    for (const [tile, accent, locked] of doors) {
      const variants: Canvas[] = [];
      for (let v = 0; v < 2; v++) {
        const p = new Painter(T, T);
        drawDoor(p, accent, v === 0, locked);
        variants.push(p.canvas);
      }
      this.cache.set(tile, variants);
    }

    // Anything without a drawer falls back to a loud magenta so missing art
    // is impossible to miss during development.
    const fallback = new Painter(T, T);
    fallback.rect(0, 0, T, T, '#ff00ff').frame(0, 0, T, T, PAL.black);
    this.fallback = fallback.canvas;
  }

  private readonly fallback: Canvas;

  get(tile: Tile, variant: number): Canvas {
    const variants = this.cache.get(tile);
    if (!variants || variants.length === 0) return this.fallback;
    return variants[variant % variants.length];
  }

  variantCount(tile: Tile): number {
    return this.cache.get(tile)?.length ?? 1;
  }
}

/** Renders one tile-sized shadow gradient, reused for actor drop shadows. */
export function makeShadow(w: number, h: number): Canvas {
  const { canvas, ctx } = makeCanvas(w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(8, 6, 14, 0.5)');
  g.addColorStop(1, 'rgba(8, 6, 14, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return canvas;
}
