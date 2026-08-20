/**
 * Item icons and world props. Icons are 16x16 and double as inventory art,
 * ground pickups and HUD glyphs, which keeps a single visual language.
 */
import { Rng } from '../engine/rng';
import { PAL, shade, withAlpha } from './palette';
import { Painter, type Canvas } from './paint';

export type IconName =
  | 'sword1' | 'sword2' | 'sword3' | 'sword4'
  | 'shield1' | 'shield2'
  | 'bow' | 'arrow' | 'bomb' | 'boomerang' | 'boots' | 'lantern'
  | 'tunic' | 'ring' | 'amulet'
  | 'potion' | 'elixir' | 'ether'
  | 'key' | 'bosskey' | 'bellkey' | 'ashkey' | 'map' | 'compass'
  | 'heart' | 'heartPiece' | 'heartContainer' | 'heartEmpty'
  | 'rupee' | 'mote' | 'shard'
  | 'chestClosed' | 'chestOpen' | 'pot' | 'fairy';

type Drawer = (p: Painter) => void;

const DRAWERS: Record<IconName, Drawer> = {
  sword1: (p) => {
    p.line(4, 12, 12, 3, PAL.steel);
    p.line(5, 12, 13, 3, PAL.steelLight);
    p.px(13, 2, PAL.white);
    p.line(2, 11, 6, 14, PAL.goldDark);
    p.line(3, 10, 7, 13, PAL.gold);
    p.rect(2, 12, 3, 3, PAL.woodDark);
  },
  sword2: (p) => {
    p.line(3, 12, 12, 2, PAL.steelLight);
    p.line(4, 13, 13, 3, PAL.steel);
    p.line(4, 12, 12, 3, PAL.white);
    p.px(13, 1, PAL.white);
    p.line(1, 11, 6, 15, PAL.gold);
    p.line(2, 10, 7, 14, PAL.goldLight);
    p.rect(1, 12, 4, 4, PAL.bronze);
    p.px(3, 13, PAL.magicLight);
  },
  sword3: (p) => {
    p.line(3, 12, 12, 2, PAL.ice);
    p.line(4, 13, 13, 3, PAL.steelLight);
    p.line(4, 12, 12, 3, PAL.white);
    p.px(13, 1, PAL.white).px(12, 2, PAL.white);
    p.line(1, 11, 6, 15, PAL.goldLight);
    p.rect(1, 12, 4, 4, PAL.gold);
    p.px(3, 13, PAL.magic);
    p.px(9, 6, withAlpha(PAL.white, 0.9));
  },
  sword4: (p) => {
    p.line(3, 12, 12, 2, PAL.waterLight);
    p.line(4, 13, 13, 3, PAL.ice);
    p.line(4, 12, 12, 3, PAL.white);
    p.px(13, 1, PAL.white).px(12, 2, PAL.foam);
    p.line(1, 11, 6, 15, PAL.goldLight);
    p.rect(1, 12, 4, 4, PAL.water);
    p.px(3, 13, PAL.foam);
    p.px(9, 6, withAlpha(PAL.white, 0.9));
  },
  shield1: (p) => {
    p.rect(3, 2, 10, 9, PAL.woodDark);
    p.rect(4, 3, 8, 8, PAL.wood);
    p.ellipse(8, 12, 5, 3.5, PAL.woodDark);
    p.ellipse(8, 11.5, 4, 3, PAL.wood);
    p.rect(6, 5, 4, 4, PAL.bronze);
    p.px(7, 6, PAL.goldLight);
  },
  shield2: (p) => {
    p.rect(3, 2, 10, 9, PAL.steelDark);
    p.rect(4, 3, 8, 8, PAL.steel);
    p.ellipse(8, 12, 5, 3.5, PAL.steelDark);
    p.ellipse(8, 11.5, 4, 3, PAL.steel);
    p.rect(6, 4, 4, 5, PAL.blood);
    p.rect(6, 4, 4, 1, PAL.bloodLight);
    p.px(8, 6, PAL.gold);
    p.hline(4, 3, 8, PAL.steelLight);
  },
  bow: (p) => {
    // Limb.
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const x = 4 + Math.round(Math.sin(t * Math.PI) * 5);
      p.px(x, 2 + i, PAL.wood);
      p.px(x + 1, 2 + i, PAL.woodLight);
    }
    p.line(4, 2, 4, 13, PAL.plaster);
    p.px(10, 7, PAL.goldDark);
  },
  arrow: (p) => {
    p.line(2, 13, 12, 3, PAL.wood);
    p.line(11, 2, 13, 4, PAL.steelLight);
    p.px(13, 2, PAL.white);
    p.line(2, 13, 5, 12, PAL.bloodLight);
    p.line(2, 13, 3, 10, PAL.bloodLight);
  },
  bomb: (p) => {
    p.circle(8, 10, 5, PAL.black);
    p.circle(8, 10, 4, shade(PAL.stoneDark, 1.1));
    p.ellipse(6, 8, 1.6, 1.2, PAL.stoneLight);
    p.rect(8, 3, 2, 3, PAL.woodDark);
    p.line(9, 3, 12, 1, PAL.dirtLight);
    p.px(12, 0, PAL.fireLight);
    p.px(13, 1, PAL.fire);
  },
  boomerang: (p) => {
    p.line(3, 3, 8, 8, PAL.wood);
    p.line(4, 3, 9, 8, PAL.woodLight);
    p.line(8, 8, 13, 4, PAL.wood);
    p.line(8, 9, 13, 5, PAL.woodLight);
    p.rect(7, 7, 3, 3, PAL.woodDark);
    p.px(3, 2, PAL.gold).px(13, 3, PAL.gold);
  },
  boots: (p) => {
    p.rect(3, 6, 5, 7, PAL.bloodDark);
    p.rect(3, 6, 5, 2, PAL.blood);
    p.rect(3, 12, 8, 2, PAL.woodDark);
    p.rect(9, 6, 4, 7, PAL.bloodDark);
    p.rect(9, 6, 4, 2, PAL.blood);
    p.px(5, 9, PAL.gold).px(11, 9, PAL.gold);
    // Speed streaks.
    p.hline(0, 4, 4, withAlpha(PAL.white, 0.5));
    p.hline(1, 7, 2, withAlpha(PAL.white, 0.4));
  },
  lantern: (p) => {
    p.rect(5, 2, 6, 2, PAL.steelDark);
    p.rect(4, 4, 8, 9, PAL.steelDark);
    p.rect(5, 5, 6, 7, PAL.fireLight);
    p.ellipse(8, 9, 2, 3, PAL.fire);
    p.px(8, 8, PAL.white);
    p.rect(4, 13, 8, 2, PAL.steel);
    p.px(7, 1, PAL.steelLight);
  },
  tunic: (p) => {
    p.rect(4, 3, 8, 10, PAL.tunic);
    p.rect(4, 3, 8, 1, PAL.tunicLight);
    p.rect(2, 4, 2, 5, PAL.tunic);
    p.rect(12, 4, 2, 5, PAL.tunic);
    p.rect(4, 8, 8, 1, PAL.woodDark);
    p.px(8, 8, PAL.gold);
    p.rect(6, 3, 4, 2, PAL.tunicDark);
  },
  ring: (p) => {
    p.circle(8, 10, 5, PAL.goldDark);
    p.circle(8, 10, 3.6, PAL.uiBack);
    p.rect(6, 3, 4, 4, PAL.goldDark);
    p.rect(7, 4, 2, 2, PAL.magicLight);
    p.px(7, 4, PAL.white);
  },
  amulet: (p) => {
    p.line(4, 2, 8, 8, PAL.goldDark);
    p.line(12, 2, 8, 8, PAL.goldDark);
    p.ellipse(8, 10, 4, 4.5, PAL.gold);
    p.ellipse(8, 10, 2.5, 3, PAL.magic);
    p.px(7, 9, PAL.white);
  },
  potion: (p) => {
    p.rect(6, 2, 4, 3, PAL.steelDark);
    p.ellipse(8, 10, 5, 5.5, PAL.plasterDark);
    p.ellipse(8, 11, 4, 4.5, PAL.blood);
    p.ellipse(6.5, 12, 1.5, 1.5, PAL.bloodLight);
    p.ellipse(7, 7, 2, 1.5, withAlpha(PAL.white, 0.45));
  },
  elixir: (p) => {
    p.rect(6, 2, 4, 3, PAL.steelDark);
    p.ellipse(8, 10, 5, 5.5, PAL.plasterDark);
    p.ellipse(8, 11, 4, 4.5, PAL.magic);
    p.ellipse(6.5, 12, 1.5, 1.5, PAL.magicLight);
    p.ellipse(7, 7, 2, 1.5, withAlpha(PAL.white, 0.45));
  },
  ether: (p) => {
    p.rect(6, 2, 4, 3, PAL.goldDark);
    p.ellipse(8, 10, 5, 5.5, PAL.plasterDark);
    p.ellipse(8, 11, 4, 4.5, PAL.uiGood);
    p.ellipse(6.5, 12, 1.5, 1.5, PAL.white);
  },
  key: (p) => {
    p.circle(5, 5, 3, PAL.gold);
    p.circle(5, 5, 1.4, PAL.uiBack);
    p.line(7, 7, 12, 12, PAL.gold);
    p.line(10, 12, 12, 10, PAL.goldLight);
    p.line(12, 14, 14, 12, PAL.goldLight);
    p.px(3, 3, PAL.goldLight);
  },
  bosskey: (p) => {
    p.circle(5, 5, 3.6, PAL.blood);
    p.circle(5, 5, 1.8, PAL.uiBack);
    p.px(5, 4, PAL.bloodLight);
    p.line(7, 7, 13, 13, PAL.blood);
    p.line(10, 13, 12, 11, PAL.bloodLight);
    p.line(12, 15, 14, 13, PAL.bloodLight);
    p.px(3, 3, PAL.white);
  },
  bellkey: (p) => {
    p.circle(5, 5, 3.6, PAL.water);
    p.circle(5, 5, 1.8, PAL.uiBack);
    p.px(5, 4, PAL.foam);
    p.line(7, 7, 13, 13, PAL.waterLight);
    p.line(10, 13, 12, 11, PAL.ice);
    p.line(12, 15, 14, 13, PAL.ice);
    p.px(3, 3, PAL.white);
  },
  ashkey: (p) => {
    p.circle(5, 5, 3.6, PAL.ember);
    p.circle(5, 5, 1.8, PAL.uiBack);
    p.px(5, 4, PAL.emberLight);
    p.line(7, 7, 13, 13, PAL.fire);
    p.line(10, 13, 12, 11, PAL.fireLight);
    p.line(12, 15, 14, 13, PAL.fireLight);
    p.px(3, 3, PAL.white);
  },
  map: (p) => {
    p.rect(2, 3, 12, 10, PAL.sandLight);
    p.rect(2, 3, 12, 1, PAL.sand);
    p.frame(2, 3, 12, 10, PAL.dirtDark);
    p.line(4, 10, 7, 6, PAL.blood);
    p.line(7, 6, 11, 8, PAL.blood);
    p.px(11, 8, PAL.bloodLight);
    p.hline(4, 5, 3, PAL.dirt);
  },
  compass: (p) => {
    p.circle(8, 8, 6, PAL.bronze);
    p.circle(8, 8, 4.6, PAL.plaster);
    p.line(8, 8, 11, 5, PAL.blood);
    p.line(8, 8, 5, 11, PAL.steelDark);
    p.px(8, 8, PAL.black);
    p.px(8, 2, PAL.goldLight);
  },
  heart: (p) => {
    p.ellipse(5.5, 6, 3, 3, PAL.blood);
    p.ellipse(10.5, 6, 3, 3, PAL.blood);
    p.rect(3, 6, 10, 3, PAL.blood);
    for (let i = 0; i < 5; i++) p.hline(3 + i, 9 + i, 10 - i * 2, PAL.blood);
    p.px(5, 5, PAL.bloodLight).px(6, 5, PAL.bloodLight).px(5, 6, PAL.bloodLight);
    p.px(8, 13, PAL.bloodDark);
  },
  heartPiece: (p) => {
    // A quarter of a heart, with the missing part outlined.
    p.ellipse(5.5, 6, 3, 3, PAL.blood);
    p.rect(3, 6, 5, 3, PAL.blood);
    for (let i = 0; i < 5; i++) p.hline(3 + i, 9 + i, Math.max(0, 5 - i), PAL.blood);
    p.px(5, 5, PAL.bloodLight);
    p.line(8, 3, 8, 13, withAlpha(PAL.white, 0.5));
    p.ellipse(10.5, 6, 3, 3, withAlpha(PAL.bloodDark, 0.35));
  },
  heartContainer: (p) => {
    p.ellipse(5.5, 6, 3.4, 3.4, PAL.bloodDark);
    p.ellipse(10.5, 6, 3.4, 3.4, PAL.bloodDark);
    p.rect(2, 6, 12, 3, PAL.bloodDark);
    for (let i = 0; i < 6; i++) p.hline(2 + i, 9 + i, 12 - i * 2, PAL.bloodDark);
    p.ellipse(5.5, 6, 2.4, 2.4, PAL.blood);
    p.ellipse(10.5, 6, 2.4, 2.4, PAL.blood);
    p.rect(3, 6, 10, 3, PAL.blood);
    for (let i = 0; i < 5; i++) p.hline(3 + i, 9 + i, 10 - i * 2, PAL.blood);
    p.px(5, 5, PAL.white);
  },
  heartEmpty: (p) => {
    // Outline only, so a drained container cannot be mistaken for a full one.
    p.ellipse(5.5, 6, 3.4, 3.4, PAL.bloodDark);
    p.ellipse(10.5, 6, 3.4, 3.4, PAL.bloodDark);
    p.rect(2, 6, 12, 3, PAL.bloodDark);
    for (let i = 0; i < 6; i++) p.hline(2 + i, 9 + i, 12 - i * 2, PAL.bloodDark);
    // Hollow the middle out again, leaving a one-pixel rim.
    p.ellipse(5.5, 6, 2.3, 2.3, PAL.uiBackDeep);
    p.ellipse(10.5, 6, 2.3, 2.3, PAL.uiBackDeep);
    p.rect(3, 6, 10, 3, PAL.uiBackDeep);
    for (let i = 0; i < 5; i++) p.hline(3 + i, 9 + i, 10 - i * 2, PAL.uiBackDeep);
  },
  rupee: (p) => {
    p.line(8, 1, 12, 6, PAL.uiGood);
    p.line(12, 6, 8, 14, PAL.uiGood);
    p.line(8, 14, 4, 6, PAL.uiGood);
    p.line(4, 6, 8, 1, PAL.uiGood);
    for (let y = 2; y < 14; y++) {
      const t = y < 6 ? (y - 1) / 5 : (14 - y) / 8;
      const half = Math.round(t * 4);
      if (half > 0) p.hline(8 - half, y, half * 2, shade(PAL.uiGood, 0.85));
    }
    p.line(8, 2, 8, 13, shade(PAL.uiGood, 1.25));
    p.px(6, 5, PAL.white);
  },
  mote: (p) => {
    // Mastery mote: a four-pointed star.
    p.line(8, 1, 8, 14, PAL.magicLight);
    p.line(2, 8, 13, 8, PAL.magicLight);
    p.ellipse(8, 8, 3.4, 3.4, PAL.magic);
    p.ellipse(8, 8, 2, 2, PAL.magicLight);
    p.px(8, 8, PAL.white);
    p.px(5, 5, PAL.magic).px(11, 5, PAL.magic).px(5, 11, PAL.magic).px(11, 11, PAL.magic);
  },
  shard: (p) => {
    p.line(8, 1, 12, 9, PAL.ice);
    p.line(12, 9, 8, 14, PAL.ice);
    p.line(8, 14, 5, 8, PAL.ice);
    p.line(5, 8, 8, 1, PAL.ice);
    p.ellipse(8.4, 8, 2, 4, withAlpha(PAL.white, 0.55));
  },
  chestClosed: (p) => {
    p.rect(1, 5, 14, 10, PAL.woodDark);
    p.rect(2, 6, 12, 8, PAL.wood);
    p.rect(1, 3, 14, 4, PAL.woodLight);
    p.rect(2, 4, 12, 2, PAL.wood);
    p.hline(1, 7, 14, PAL.woodDark);
    p.rect(6, 6, 4, 5, PAL.gold);
    p.rect(7, 8, 2, 2, PAL.goldDark);
    p.px(7, 9, PAL.black);
    p.vline(1, 3, 12, PAL.goldDark);
    p.vline(14, 3, 12, PAL.goldDark);
  },
  chestOpen: (p) => {
    p.rect(1, 7, 14, 8, PAL.woodDark);
    p.rect(2, 8, 12, 6, PAL.black);
    p.rect(1, 1, 14, 5, PAL.woodLight);
    p.rect(2, 2, 12, 3, PAL.wood);
    p.hline(1, 6, 14, PAL.woodDark);
    p.rect(6, 3, 4, 3, PAL.gold);
    p.speckle(4, 9, 8, 4, 6, PAL.goldLight, new Rng(0x60_1d));
  },
  pot: (p) => {
    p.ellipse(8, 10, 5.5, 5, PAL.bronze);
    p.ellipse(8, 10, 4.5, 4, shade(PAL.bronze, 1.15));
    p.ellipse(6, 8, 1.8, 1.4, PAL.sandLight);
    p.rect(4, 3, 8, 3, PAL.bronze);
    p.rect(5, 4, 6, 1, shade(PAL.bronze, 1.25));
    p.hline(3, 6, 10, shade(PAL.bronze, 0.75));
  },
  fairy: (p) => {
    p.ellipse(8, 9, 2, 2.6, PAL.bloodLight);
    p.circle(8, 5, 2, PAL.skin);
    p.px(7, 5, PAL.black).px(9, 5, PAL.black);
    p.ellipse(4.5, 8, 3, 4, withAlpha(PAL.ice, 0.7));
    p.ellipse(11.5, 8, 3, 4, withAlpha(PAL.ice, 0.7));
    p.px(8, 12, PAL.white);
  },
};

export class IconSet {
  private cache = new Map<IconName, Canvas>();

  constructor() {
    for (const name of Object.keys(DRAWERS) as IconName[]) {
      const p = new Painter(16, 16);
      DRAWERS[name](p);
      this.cache.set(name, p.canvas);
    }
  }

  get(name: IconName): Canvas {
    const c = this.cache.get(name);
    if (!c) throw new Error(`unknown icon: ${name}`);
    return c;
  }
}

// ---------------------------------------------------------------------------
// Projectiles and effects
// ---------------------------------------------------------------------------

export interface EffectArt {
  /** Arrow, drawn pointing right; other directions are rotated at blit time. */
  arrow: Canvas;
  rock: Canvas;
  seed: Canvas;
  boomerang: Canvas[];
  swordBeam: Canvas;
  bombLive: Canvas[];
  explosion: Canvas[];
  sparkle: Canvas[];
  slash: Canvas[];
}

export function buildEffectArt(): EffectArt {
  const arrow = new Painter(12, 6);
  arrow.line(0, 3, 8, 3, PAL.wood);
  arrow.line(8, 1, 11, 3, PAL.steelLight);
  arrow.line(8, 5, 11, 3, PAL.steel);
  arrow.px(0, 1, PAL.bloodLight).px(0, 5, PAL.bloodLight).px(1, 2, PAL.bloodLight);

  const rock = new Painter(8, 8);
  rock.circle(4, 4, 3.4, PAL.rockDark);
  rock.circle(4, 4, 2.4, PAL.rock);
  rock.px(3, 3, PAL.rockLight);

  const seed = new Painter(8, 8);
  seed.ellipse(4, 4, 2.4, 3, PAL.plantDark);
  seed.ellipse(4, 4, 1.6, 2, PAL.plantLight);
  seed.px(4, 2, PAL.white);

  const boomerang: Canvas[] = [];
  for (let f = 0; f < 4; f++) {
    const p = new Painter(12, 12);
    const a = (f / 4) * Math.PI * 2;
    const pts: Array<[number, number]> = [
      [6 + Math.cos(a) * 4, 6 + Math.sin(a) * 4],
      [6, 6],
      [6 + Math.cos(a + Math.PI / 2) * 4, 6 + Math.sin(a + Math.PI / 2) * 4],
    ];
    p.line(Math.round(pts[0][0]), Math.round(pts[0][1]), 6, 6, PAL.wood);
    p.line(6, 6, Math.round(pts[2][0]), Math.round(pts[2][1]), PAL.woodLight);
    p.px(Math.round(pts[0][0]), Math.round(pts[0][1]), PAL.gold);
    boomerang.push(p.canvas);
  }

  const swordBeam = new Painter(16, 10);
  swordBeam.ellipse(8, 5, 7, 3, withAlpha(PAL.ice, 0.5));
  swordBeam.ellipse(8, 5, 5, 2, withAlpha(PAL.white, 0.85));
  swordBeam.line(1, 5, 14, 5, PAL.white);

  const bombLive: Canvas[] = [];
  for (let f = 0; f < 2; f++) {
    const p = new Painter(16, 16);
    const r = f === 0 ? 5 : 5.6;
    p.circle(8, 10, r, PAL.black);
    p.circle(8, 10, r - 1, shade(PAL.stoneDark, f === 0 ? 1.1 : 1.5));
    p.ellipse(6, 8, 1.6, 1.2, PAL.stoneLight);
    p.rect(8, 3, 2, 3, PAL.woodDark);
    p.px(10, 2, f === 0 ? PAL.fireLight : PAL.white);
    p.px(11, 1, PAL.fire);
    bombLive.push(p.canvas);
  }

  const explosion: Canvas[] = [];
  for (let f = 0; f < 5; f++) {
    const p = new Painter(48, 48);
    const t = f / 4;
    const r = 6 + t * 17;
    const colors = [PAL.white, PAL.fireLight, PAL.fire, PAL.bloodDark];
    for (let i = 0; i < colors.length; i++) {
      const rr = r * (1 - i * 0.18);
      if (rr <= 0) continue;
      p.circle(24, 24, rr, withAlpha(colors[colors.length - 1 - i], 0.85 - t * 0.5));
    }
    // Ragged edge.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + t * 2;
      const rr = r + 3;
      p.circle(24 + Math.cos(a) * rr, 24 + Math.sin(a) * rr, 2.5 * (1 - t), withAlpha(PAL.fireLight, 0.7 - t * 0.5));
    }
    explosion.push(p.canvas);
  }

  const sparkle: Canvas[] = [];
  for (let f = 0; f < 4; f++) {
    const p = new Painter(8, 8);
    const r = [1, 2.5, 3.2, 1.6][f];
    p.line(4, Math.round(4 - r), 4, Math.round(4 + r), PAL.white);
    p.line(Math.round(4 - r), 4, Math.round(4 + r), 4, PAL.white);
    p.px(4, 4, PAL.uiAccent);
    sparkle.push(p.canvas);
  }

  const slash: Canvas[] = [];
  for (let f = 0; f < 3; f++) {
    const p = new Painter(24, 24);
    const spread = 0.9 - f * 0.15;
    const radius = 9 + f * 2;
    for (let i = 0; i < 14; i++) {
      const a = -spread + (i / 13) * spread * 2;
      const x = 12 + Math.cos(a - Math.PI / 2) * radius;
      const y = 12 + Math.sin(a - Math.PI / 2) * radius;
      p.px(Math.round(x), Math.round(y), withAlpha(PAL.white, 0.9 - f * 0.25));
      p.px(Math.round(x), Math.round(y) + 1, withAlpha(PAL.ice, 0.6 - f * 0.18));
    }
    slash.push(p.canvas);
  }

  return {
    arrow: arrow.canvas,
    rock: rock.canvas,
    seed: seed.canvas,
    boomerang,
    swordBeam: swordBeam.canvas,
    bombLive,
    explosion,
    sparkle,
    slash,
  };
}
