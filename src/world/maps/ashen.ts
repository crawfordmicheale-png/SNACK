/**
 * The Ashen Spire — Episode One's third dungeon, a 3x3 of soot and iron.
 *
 *   (0,0) Soot Reliquary      (1,0) Cindermouth's Crown   (2,0) Emberward's Hall
 *   (0,1) Furnace Gallery     (1,1) Spire Hub             (2,1) Cinder Crypt
 *   (0,2) Ash Cellar          (1,2) Spire Landing         (2,2) Boot Vault
 *
 * Entered from the Ruined Approach. Boots sit in the eastern vault.
 */
import type { MapDef } from '../types';
import { link } from '../types';

type Exit = 'n' | 's' | 'e' | 'w';

interface Doors {
  n?: string;
  s?: string;
  e?: string;
  w?: string;
}

const W = 'W';

function chamber(exits: string, interior: string[], doors: Doors = {}): string[] {
  const has = (e: Exit) => exits.includes(e);
  const wall9 = W.repeat(9);
  const gap = (open: boolean, leaf?: string) => (open ? (leaf ? leaf + leaf : '  ') : W + W);

  const rows: string[] = [];
  rows.push(wall9 + (has('n') ? '//' : W + W) + wall9);
  rows.push(wall9 + gap(has('n'), doors.n) + wall9);

  for (let i = 0; i < 9; i++) {
    const sideRow = i === 4 || i === 5;
    const left = has('w') && sideRow ? (doors.w ? doors.w + doors.w : '//') : W + W;
    const right = has('e') && sideRow ? (doors.e ? doors.e + doors.e : '//') : W + W;
    rows.push(left + interior[i] + right);
  }

  rows.push(wall9 + gap(has('s'), doors.s) + wall9);
  rows.push(wall9 + (has('s') ? '//' : W + W) + wall9);
  return rows;
}

export const ASHEN: MapDef = {
  id: 'ashen',
  name: 'The Ashen Spire',
  cols: 3,
  rows: 3,
  music: 'ashen',
  dungeon: true,
  rooms: [
    {
      rx: 1,
      ry: 2,
      name: 'Spire Landing',
      rows: chamber('nwe', [
        '                ',
        '   uu      uu   ',
        '   u        u   ',
        '                ',
        '                ',
        '                ',
        '   tt      tt   ',
        '       <<       ',
        '                ',
      ]),
      spawns: [{ kind: 'sign', x: 6, y: 4, opts: { text: 'ashEntry' } }],
      links: {
        '9,9': link('overworld', 0, 0, 9, 5, 'stairs'),
        '10,9': link('overworld', 0, 0, 10, 5, 'stairs'),
      },
    },
    {
      rx: 0,
      ry: 2,
      name: 'Ash Cellar',
      rows: chamber('e', [
        '                ',
        '  WW      WW    ',
        '  W   uu   W    ',
        '     uuuu       ',
        '     uuuu       ',
        '     uuuu       ',
        '  W   uu   W    ',
        '  WW      WW    ',
        '                ',
      ]),
      lockOnEnemies: true,
      spawns: [
        { kind: 'ember', x: 6, y: 4 },
        { kind: 'ember', x: 13, y: 8 },
        { kind: 'ashbat', x: 9, y: 6 },
        { kind: 'pot', x: 4, y: 3 },
        { kind: 'pot', x: 15, y: 9 },
        { kind: 'chest', x: 9, y: 3, opts: { loot: 'smallKey' } },
      ],
    },
    {
      rx: 2,
      ry: 2,
      name: 'Boot Vault',
      rows: chamber('w', [
        '  WWWWWWWWWWWW  ',
        '  Wt        tW  ',
        '  W   cccc   W  ',
        '  W   cccc   W  ',
        '      cccc      ',
        '      cccc      ',
        '  W   cccc   W  ',
        '  Wt        tW  ',
        '  WWWWWWWWWWWW  ',
      ], { w: 'L' }),
      spawns: [{ kind: 'chest', x: 9, y: 5, opts: { loot: 'boots', big: true } }],
    },
    {
      rx: 1,
      ry: 1,
      name: 'Spire Hub',
      rows: chamber('nswe', [
        '  W          W  ',
        '  W   rrrr   W  ',
        '      rrrr      ',
        '      rrrr      ',
        '      rrrr      ',
        '      rrrr      ',
        '      rrrr      ',
        '  W   rrrr   W  ',
        '  W          W  ',
      ], { n: 'B', e: 'L' }),
      lockOnEnemies: true,
      spawns: [
        { kind: 'ashbat', x: 5, y: 4 },
        { kind: 'ember', x: 14, y: 8 },
        { kind: 'stalfos', x: 9, y: 3 },
        { kind: 'chest', x: 9, y: 9, opts: { loot: 'smallKey' } },
        { kind: 'sign', x: 6, y: 9, opts: { text: 'ashHub' } },
      ],
    },
    {
      rx: 0,
      ry: 1,
      name: 'Furnace Gallery',
      rows: chamber('ne', [
        '                ',
        '  SS  uu  SS    ',
        '      uu        ',
        '    SS  uu  SS  ',
        '        uu      ',
        '        uu      ',
        '  SS  uu  SS    ',
        '      uu        ',
        '    SS  uu  SS  ',
      ], { n: 'C' }),
      spawns: [
        { kind: 'ember', x: 6, y: 4 },
        { kind: 'ashbat', x: 12, y: 8 },
        { kind: 'ashbat', x: 9, y: 6 },
        { kind: 'sign', x: 4, y: 6, opts: { text: 'cracked' } },
      ],
    },
    {
      rx: 0,
      ry: 0,
      name: 'Soot Reliquary',
      rows: chamber('s', [
        '  WWWWWWWWWWWW  ',
        '  W          W  ',
        '  W  rrrrrr  W  ',
        '  W  r    r  W  ',
        '  W  r    r  W  ',
        '  W  r    r  W  ',
        '  W  rrrrrr  W  ',
        '  W          W  ',
        '  WWWW    WWWW  ',
      ]),
      spawns: [
        { kind: 'chest', x: 9, y: 5, opts: { loot: 'dungeonMap', big: true } },
        { kind: 'chest', x: 9, y: 7, opts: { loot: 'heartPiece', big: true } },
      ],
    },
    {
      rx: 2,
      ry: 1,
      name: 'Cinder Crypt',
      dark: true,
      rows: chamber('nw', [
        '                ',
        '   tt      tt   ',
        '                ',
        '                ',
        '                ',
        '                ',
        '                ',
        '   tt      tt   ',
        '                ',
      ], { n: '+' }),
      lockOnEnemies: true,
      spawns: [
        { kind: 'ashbat', x: 5, y: 4 },
        { kind: 'ashbat', x: 14, y: 8 },
        { kind: 'ember', x: 9, y: 6 },
        { kind: 'chest', x: 9, y: 5, opts: { loot: 'compass', big: true } },
      ],
    },
    {
      rx: 2,
      ry: 0,
      name: "Emberward's Hall",
      rows: chamber('s', [
        '  WWWWWWWWWWWW  ',
        '  W          W  ',
        '  W  W    W  W  ',
        '  W          W  ',
        '  W          W  ',
        '  W          W  ',
        '  W  W    W  W  ',
        '  W          W  ',
        '  WWWW    WWWW  ',
      ]),
      spawns: [{ kind: 'emberward', x: 9, y: 5 }],
    },
    {
      rx: 1,
      ry: 0,
      name: "Cindermouth's Crown",
      music: 'boss',
      rows: chamber('s', [
        '  WWWWWWWWWWWW  ',
        '  Wr        rW  ',
        '  W          W  ',
        '  W          W  ',
        '  W          W  ',
        '  W          W  ',
        '  W          W  ',
        '  Wr        rW  ',
        '  WWWW    WWWW  ',
      ]),
      spawns: [{ kind: 'cindermouth', x: 9, y: 5 }],
    },
  ],
};
