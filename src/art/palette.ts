/**
 * A deliberately small 16-bit-era palette. Everything the game draws — tiles,
 * actors, icons, UI chrome — pulls from these names, which is what keeps
 * procedurally generated art looking like it belongs to one cartridge.
 */
export const PAL = {
  // Foliage and ground
  grassDark: '#2c6b3f',
  grass: '#3d8a4e',
  grassLight: '#57a862',
  grassHi: '#7cc472',
  leafDark: '#1d4c2e',
  leaf: '#2f7440',
  leafLight: '#4f9a51',

  dirtDark: '#6b4a2b',
  dirt: '#8a6238',
  dirtLight: '#a97f4c',
  sand: '#d8c184',
  sandLight: '#ecdda8',

  // Water
  waterDeep: '#173a6b',
  water: '#2a5c9c',
  waterLight: '#4b8fd0',
  foam: '#a6d8f2',

  // Stone
  stoneDark: '#3a3f52',
  stone: '#586074',
  stoneLight: '#7d869c',
  stoneHi: '#a4adc2',
  rockDark: '#4a4438',
  rock: '#6d6553',
  rockLight: '#918872',

  // Dungeon
  dungeonWallDark: '#241f33',
  dungeonWall: '#3b3350',
  dungeonWallLight: '#544a70',
  dungeonFloor: '#6a627e',
  dungeonFloorDark: '#4f4860',
  dungeonFloorLight: '#847c98',
  pit: '#0b0a12',

  // Wood / structures
  woodDark: '#5a3a22',
  wood: '#7d5230',
  woodLight: '#a06e42',
  roofDark: '#7a2f2f',
  roof: '#a84343',
  roofLight: '#cc6060',
  plaster: '#d9c9a8',
  plasterDark: '#b3a184',

  // Hero
  tunicDark: '#1f6b34',
  tunic: '#2f9046',
  tunicLight: '#4cb85f',
  skin: '#e8b088',
  skinDark: '#c48a63',
  hair: '#e6c463',
  hairDark: '#b3903a',
  boot: '#5a3a22',

  // Metals
  steelDark: '#6b7385',
  steel: '#98a2b5',
  steelLight: '#c9d2e0',
  gold: '#e8c247',
  goldDark: '#a8862a',
  goldLight: '#ffe58a',
  bronze: '#b07a3a',

  // Enemies
  slimeDark: '#1d6b6b',
  slime: '#2e9a95',
  slimeLight: '#55c4b6',
  batDark: '#3a2b4a',
  bat: '#5d4574',
  batLight: '#8367a0',
  eyeWhite: '#f2f0e4',
  pupil: '#1a1524',
  bloodDark: '#7a1f2b',
  blood: '#b53243',
  bloodLight: '#e0596a',
  plantDark: '#2a5a1f',
  plant: '#438a30',
  plantLight: '#68b24c',
  crabDark: '#8a3a22',
  crab: '#c45a32',
  crabLight: '#e88a58',
  wispDark: '#3a4a8a',
  wisp: '#6a8ae0',
  wispLight: '#b0c8ff',
  ashDark: '#4a3428',
  ash: '#7a5a40',
  ashLight: '#b08a60',
  ember: '#f05a20',
  emberLight: '#ffb040',

  // Effects
  white: '#f7f4e6',
  black: '#0d0b12',
  shadow: 'rgba(10, 8, 16, 0.34)',
  flash: '#ffffff',
  magic: '#7c6ce0',
  magicLight: '#b0a4ff',
  fire: '#f08a2a',
  fireLight: '#ffcc55',
  ice: '#8fd4f0',

  // UI
  uiBack: '#141a26',
  uiBackDeep: '#0b0f18',
  uiPanel: '#1e2636',
  uiPanelLight: '#2b3550',
  uiEdge: '#5a6784',
  uiEdgeBright: '#8f9dbb',
  uiText: '#e8e2cf',
  uiTextDim: '#98a0b4',
  uiAccent: '#f0d67a',
  uiGood: '#6fd48a',
  uiBad: '#e05a5a',
} as const;

export type PaletteKey = keyof typeof PAL;

/** Rarity tints, shared by loot borders, tooltips and drop sparkles. */
export const RARITY_COLORS = {
  common: '#b9c0cf',
  uncommon: '#6fd48a',
  rare: '#5aa8f0',
  epic: '#b58cf0',
  legendary: '#f0a63c',
} as const;

export type Rarity = keyof typeof RARITY_COLORS;

export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Multiplies a hex color by `f`, clamped. Used for cheap shading. */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
