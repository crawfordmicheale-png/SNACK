/** Builds every generated art asset once and hands out a single handle. */
import { buildActorLibrary, type ActorLibrary } from './actors';
import { buildEffectArt, IconSet, type EffectArt } from './icons';
import { makeShadow, Tileset } from './tileset';
import type { Canvas } from './paint';

export interface Art {
  tiles: Tileset;
  actors: ActorLibrary;
  icons: IconSet;
  fx: EffectArt;
  shadowSmall: Canvas;
  shadowLarge: Canvas;
}

let cached: Art | null = null;

export function buildArt(): Art {
  if (cached) return cached;
  cached = {
    tiles: new Tileset(),
    actors: buildActorLibrary(),
    icons: new IconSet(),
    fx: buildEffectArt(),
    shadowSmall: makeShadow(14, 8),
    shadowLarge: makeShadow(40, 20),
  };
  return cached;
}
