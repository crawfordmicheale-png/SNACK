/**
 * Building interiors and the bomb cave. Each is a single sealed room whose
 * only exit is the doorway at the bottom centre, matching where the player
 * arrives from the overworld.
 */
import type { MapDef, SpawnDef } from '../types';
import { link } from '../types';

/** Standard one-room interior: walls all round, exit doorway at (9-10, 11). */
function interior(floor: string, props: string[] = []): string[] {
  const wall = 'W'.repeat(20);
  const body = 'WW' + floor.repeat(16) + 'WW';
  const rows = [wall, wall];
  for (let i = 0; i < 9; i++) {
    rows.push(props[i] !== undefined ? 'WW' + props[i] + 'WW' : body);
  }
  rows.push('WWWWWWWWW//WWWWWWWWW');
  rows.push(wall);
  return rows;
}

const exitToVillage = (x: number, y: number) => ({
  '9,11': link('overworld', 1, 2, x, y + 1, 'door'),
  '10,11': link('overworld', 1, 2, x, y + 1, 'door'),
});

const elderProps = [
  'FFFFFFFFFFFFFFFF',
  'FccccFFFFFFccccF',
  'FccccFFFFFFccccF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFcccccc FFFF',
  'FFFFFcccccc FFFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
];

const shopProps = [
  'FFFFFFFFFFFFFFFF',
  'F$$$$$$$$$$$$$$F',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
];

const homeProps = [
  'FFFFFFFFFFFFFFFF',
  'FccccFFFFFFFFFFF',
  'FccccFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFrrrrFF',
  'FFFFFFFFFFrrrrFF',
  'FFFFFFFFFFFFFFFF',
];

const caveProps = [
  '  uuuu    uuuu  ',
  '  uu        uu  ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '  uu        uu  ',
  '  uuuu    uuuu  ',
];

function room(
  rx: number,
  ry: number,
  name: string,
  rows: string[],
  spawns: SpawnDef[],
  links: Record<string, ReturnType<typeof link>>,
  dark = false,
) {
  return { rx, ry, name, rows, spawns, links, dark };
}

export const INTERIORS: MapDef = {
  id: 'interiors',
  name: 'Elderbrook',
  cols: 3,
  rows: 2,
  music: 'village',
  rooms: [
    room(
      0,
      0,
      "Elder's Cottage",
      interior('F', elderProps),
      [
        { kind: 'npc', x: 9, y: 6, opts: { npc: 'elderIndoors' } },
        { kind: 'pot', x: 4, y: 3 },
        { kind: 'pot', x: 15, y: 3 },
      ],
      exitToVillage(6, 4),
    ),
    room(
      1,
      0,
      'The Bellows',
      interior('F', shopProps),
      [
        { kind: 'npc', x: 9, y: 4, opts: { npc: 'smithIndoors' } },
        { kind: 'shopkeeper', x: 5, y: 4 },
      ],
      exitToVillage(13, 4),
    ),
    room(
      2,
      0,
      'Your Cottage',
      interior('F', homeProps),
      [
        { kind: 'bed', x: 4, y: 3 },
        { kind: 'pot', x: 15, y: 8 },
        { kind: 'npc', x: 12, y: 8, opts: { npc: 'mirror' } },
      ],
      exitToVillage(6, 10),
    ),
    room(
      0,
      1,
      'Herbalist',
      interior('F', shopProps),
      [
        { kind: 'npc', x: 9, y: 4, opts: { npc: 'herbalist' } },
        { kind: 'shopkeeper', x: 13, y: 4, opts: { stock: 'potions' } },
      ],
      exitToVillage(14, 10),
    ),
    room(
      1,
      1,
      'Cinder Cave',
      interior(' ', caveProps),
      [
        { kind: 'chest', x: 9, y: 5, opts: { loot: 'bomb', big: true } },
        { kind: 'keese', x: 5, y: 8 },
        { kind: 'keese', x: 14, y: 8 },
      ],
      {
        '9,11': link('overworld', 3, 2, 17, 3, 'stairs'),
        '10,11': link('overworld', 3, 2, 17, 3, 'stairs'),
      },
      true,
    ),
  ],
};
