/**
 * Save/load to localStorage. One slot, versioned, with every map's tile edits
 * and room state so bombed walls and opened chests survive a reload.
 */
import type { EquipSlot } from '../game/items/itemdefs';
import type { ItemStack } from '../game/items/loot';
import type { ProgressionSnapshot } from '../game/mastery';
import type { Scene } from '../game/scene';

const KEY = 'verdant-hollow-save-v3';
const VERSION = 3;

interface WorldSave {
  tiles: number[];
  rooms: Record<string, { cleared: boolean; visited: boolean; consumed: number[] }>;
}

export interface SaveData {
  version: number;
  savedAt: number;
  mapId: string;
  playerX: number;
  playerY: number;
  hearts: number;
  magic: number;
  rupees: number;
  inventory: {
    slots: Array<ItemStack | null>;
    equipment: Record<EquipSlot, ItemStack | null>;
    quick: Array<number | null>;
  };
  progression: ProgressionSnapshot;
  quest: { flags: string[]; step: number };
  worlds: Record<string, WorldSave>;
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function peekSave(): { level: number; savedAt: number; mapName: string } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== VERSION) return null;
    return { level: data.progression.level, savedAt: data.savedAt, mapName: data.mapId };
  } catch {
    return null;
  }
}

export function saveGame(scene: Scene): boolean {
  try {
    // Instantiate every map so their state is captured, not just visited ones.
    const worlds: Record<string, WorldSave> = {};
    for (const [id, world] of scene.worlds.all()) {
      worlds[id] = { tiles: world.serializeTiles(), rooms: world.serializeRooms() };
    }

    const data: SaveData = {
      version: VERSION,
      savedAt: Date.now(),
      mapId: scene.world.def.id,
      playerX: scene.player.x,
      playerY: scene.player.y,
      hearts: scene.player.hearts,
      magic: scene.player.magic,
      rupees: scene.rupees,
      inventory: scene.inventory.serialize() as SaveData['inventory'],
      progression: scene.progression.snapshot(),
      quest: scene.quest.serialize(),
      worlds,
    };

    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn('save failed', err);
    return false;
  }
}

export function loadGame(scene: Scene): boolean {
  let data: SaveData;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    data = JSON.parse(raw) as SaveData;
    if (data.version !== VERSION) return false;
  } catch (err) {
    console.warn('load failed', err);
    return false;
  }

  try {
    scene.startNewGame();
    scene.worlds.preload();

    for (const [id, saved] of Object.entries(data.worlds ?? {})) {
      const world = scene.worlds.get(id);
      world.restoreTiles(saved.tiles ?? []);
      world.restoreRooms(saved.rooms ?? {});
    }

    scene.inventory.restore(data.inventory);
    scene.progression.restore(data.progression);
    scene.quest.restore(data.quest ?? {});
    scene.rupees = data.rupees ?? 0;

    scene.markStatsDirty();
    scene.refreshStats();

    scene.enterSavedPosition(data.mapId, data.playerX, data.playerY);
    scene.player.hearts = Math.max(1, Math.min(scene.player.maxHearts, data.hearts));
    scene.player.magic = Math.max(0, Math.min(scene.player.maxMagic, data.magic));
    return true;
  } catch (err) {
    console.warn('load failed while restoring', err);
    scene.startNewGame();
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
