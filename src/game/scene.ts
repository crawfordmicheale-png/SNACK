/**
 * The scene owns the live world: which room is loaded, what is in it, the
 * camera, and every gameplay event the UI needs to react to.
 *
 * UI state (dialogue, banners, toasts, shop) lives here rather than in the UI
 * layer because these things pause or gate gameplay.
 */
import type { Art } from '../art';
import { PAL, RARITY_COLORS, withAlpha } from '../art/palette';
import { audio, type AudioEngine, type SongName } from '../engine/audio';
import type { Input } from '../engine/input';
import { clamp, easeInOutQuad, rectsOverlap, type Rect } from '../engine/math';
import { rng } from '../engine/rng';
import { ROOM_COLS, ROOM_ROWS, TILE, VIEW_H, VIEW_W } from '../engine/screen';
import { Tile, tileDef } from '../world/tiledefs';
import type { LinkDef, SpawnDef } from '../world/types';
import { GameWorld, WorldRegistry, type RoomRuntime } from '../world/world';
import { Effects } from './effects';
import { Entity, type Gfx } from './entity';
import { createEnemy, DEATH_COLOR, Enemy, type EnemyKind } from './entities/enemies';
import { Thornmaw, Warden, Bellwight, Tideheart } from './entities/boss';
import { Pickup } from './entities/pickups';
import { Boomerang, Sparkles } from './entities/projectiles';
import { Bed, Chest, Npc, Pot, Prop, ShopCounter, SignPost, type NpcId } from './entities/props';
import { Inventory } from './items/inventory';
import { addStats, itemDef, type StatBlock } from './items/itemdefs';
import { DROP_TABLES, ENEMY_LOOT_TIER, makeStack, rollLoot, stackName, type ItemStack } from './items/loot';
import { Progression, XP_TABLE } from './mastery';
import { npcDialogue, QuestLog, SIGNS, TOASTS } from './dialogue';
import { Player } from './player';

const BASE_HEART_HALVES = 6;
const BASE_MAGIC = 24;
const ROOM_FADE = 0.42;
const MAP_FADE = 0.3;

export interface DialogueState {
  pages: string[];
  page: number;
  /** Characters revealed so far on the current page. */
  reveal: number;
  speaker: string;
}

export interface Toast {
  text: string;
  life: number;
}

export interface Banner {
  title: string;
  sub: string;
  life: number;
}

export interface ItemGetState {
  stack: ItemStack;
  big: boolean;
  life: number;
}

export interface ShopOffer {
  defId: string;
  count: number;
  price: number;
}

export interface ShopState {
  title: string;
  offers: ShopOffer[];
  cursor: number;
}

const SHOP_STOCK: Record<string, ShopOffer[]> = {
  general: [
    { defId: 'arrow', count: 10, price: 30 },
    { defId: 'bomb', count: 5, price: 40 },
    { defId: 'shield1', count: 1, price: 90 },
    { defId: 'tunic1', count: 1, price: 80 },
    { defId: 'potion', count: 1, price: 60 },
  ],
  potions: [
    { defId: 'potion', count: 1, price: 55 },
    { defId: 'elixir', count: 1, price: 70 },
    { defId: 'ether', count: 1, price: 180 },
    { defId: 'fairy', count: 1, price: 240 },
  ],
  mill: [
    { defId: 'arrow', count: 15, price: 36 },
    { defId: 'bomb', count: 4, price: 32 },
    { defId: 'potion', count: 1, price: 50 },
    { defId: 'elixir', count: 1, price: 65 },
  ],
};

export class Scene {
  readonly worlds = new WorldRegistry();
  world: GameWorld;
  player: Player;
  entities: Entity[] = [];
  readonly effects = new Effects();
  readonly inventory = new Inventory();
  readonly progression = new Progression();
  readonly quest = new QuestLog();
  readonly audio: AudioEngine = audio;

  rupees = 0;
  time = 0;

  camX = 0;
  camY = 0;

  /** Room the camera is settled on. */
  activeRoom: RoomRuntime | null = null;
  private roomFade = 0;
  private roomFadeFrom = { x: 0, y: 0 };
  private roomFadeTo = { x: 0, y: 0 };
  private pendingRoom: RoomRuntime | null = null;

  /** Cross-map transition (doors and stairs). */
  private mapFade = 0;
  private mapFadeOut = true;
  private pendingLink: LinkDef | null = null;

  dialogue: DialogueState | null = null;
  toasts: Toast[] = [];
  banner: Banner | null = null;
  itemGet: ItemGetState | null = null;
  shop: ShopState | null = null;

  /** Set when the player dies; the UI shows the game-over screen. */
  gameOver = false;
  /** Set once Thornmaw falls, for the ending screen. */
  victory = false;

  private lanternTimer = 0;
  private nearbyProp: Prop | null = null;
  private currentSong: SongName | null = null;
  /** Suppresses stat recomputation churn inside tight loops. */
  private statsDirty = true;
  private cachedStats: StatBlock = {};

  constructor(
    readonly input: Input,
    readonly art: Art,
  ) {
    this.world = this.worlds.get('overworld');
    this.player = new Player(0, 0);
    this.startNewGame();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  startNewGame(): void {
    this.worlds.reset();
    this.world = this.worlds.get('overworld');
    this.entities = [];
    this.rupees = 0;
    this.time = 0;
    this.gameOver = false;
    this.victory = false;
    this.dialogue = null;
    this.shop = null;
    this.itemGet = null;
    this.banner = null;
    this.toasts = [];
    this.effects.clear();

    this.progression.restore({});
    this.quest.restore({});
    this.inventory.restore({ slots: [], equipment: {} as never, quick: [] });

    // Starting kit: a sword you are already holding, and a few supplies.
    const sword = makeStack('sword1');
    this.inventory.add(sword);
    this.inventory.equipFromBag(this.inventory.slots.findIndex((s) => s?.uid === sword.uid));
    this.inventory.add(makeStack('potion', 2));
    this.inventory.add(makeStack('arrow', 10));

    // Start in bed, in the village.
    const spawn = { rx: 1, ry: 2, x: 9, y: 8 };
    this.player = new Player((spawn.rx * ROOM_COLS + spawn.x) * TILE + 8, (spawn.ry * ROOM_ROWS + spawn.y) * TILE + 12);
    this.markStatsDirty();
    this.refreshStats();
    this.player.hearts = this.player.maxHearts;
    this.player.magic = this.player.maxMagic;

    const room = this.world.roomForPixel(this.player.x, this.player.y);
    if (room) this.enterRoom(room, true);
    this.quest.advanceTo('start');
    this.showBanner('VERDANT HOLLOW', 'Elderbrook Village');
  }

  markStatsDirty(): void {
    this.statsDirty = true;
  }

  /** Recomputes equipment + mastery bonuses onto the player. */
  refreshStats(): void {
    if (!this.statsDirty) return;
    this.statsDirty = false;
    const total: StatBlock = {};
    addStats(total, this.inventory.totalStats());
    addStats(total, this.progression.bonusStats());
    this.cachedStats = total;
    this.player.applyStats(total, BASE_HEART_HALVES + this.progression.heartContainers * 2, BASE_MAGIC);
  }

  get stats(): StatBlock {
    return this.cachedStats;
  }

  // -------------------------------------------------------------------------
  // Rooms and travel
  // -------------------------------------------------------------------------

  private roomOrigin(room: RoomRuntime): { x: number; y: number } {
    return { x: room.rx * VIEW_W, y: room.ry * VIEW_H };
  }

  /** Loads a room's entities and snaps or slides the camera to it. */
  private enterRoom(room: RoomRuntime, immediate: boolean): void {
    this.activeRoom = room;
    room.visited = true;

    // Clear everything except the player; drops do not survive a screen change.
    this.entities = [];
    this.spawnRoomEntities(room);

    const origin = this.roomOrigin(room);
    if (immediate) {
      this.camX = origin.x;
      this.camY = origin.y;
      this.roomFade = 0;
    }

    this.player.respawnX = this.player.x;
    this.player.respawnY = this.player.y;

    const song = room.def.music ?? this.world.def.music;
    this.playSong(song);
    if (room.def.name && !immediate) this.showRoomName(room.def.name);
  }

  private spawnRoomEntities(room: RoomRuntime): void {
    const spawns = room.def.spawns ?? [];
    const isDungeon = this.world.def.dungeon === true;
    // Cleared dungeon rooms stay cleared; overworld enemies come back.
    const skipEnemies = isDungeon && room.cleared;

    spawns.forEach((spawn, index) => {
      if (room.consumed.has(index)) return;
      const entity = this.createSpawn(spawn, room, index, skipEnemies);
      if (entity) {
        this.entities.push(entity);
      }
    });
  }

  private createSpawn(spawn: SpawnDef, room: RoomRuntime, index: number, skipEnemies: boolean): Entity | null {
    const wx = (room.rx * ROOM_COLS + spawn.x) * TILE + TILE / 2;
    const wy = (room.ry * ROOM_ROWS + spawn.y) * TILE + TILE - 2;
    const opts = spawn.opts ?? {};

    switch (spawn.kind) {
      case 'slime':
      case 'octorok':
      case 'keese':
      case 'stalfos':
      case 'thornling':
      case 'wisp':
      case 'crab': {
        if (skipEnemies) return null;
        const enemy = createEnemy(spawn.kind as EnemyKind, wx, wy);
        enemy.spawnIndex = index;
        return enemy;
      }
      case 'boss': {
        if (room.cleared) return null;
        const boss = new Thornmaw(wx, wy);
        boss.spawnIndex = index;
        return boss;
      }
      case 'tideheart': {
        if (room.cleared) return null;
        const boss = new Tideheart(wx, wy);
        boss.spawnIndex = index;
        return boss;
      }
      case 'miniboss': {
        if (room.cleared) return null;
        const warden = new Warden(wx, wy);
        warden.spawnIndex = index;
        return warden;
      }
      case 'bellwight': {
        if (room.cleared) return null;
        const wight = new Bellwight(wx, wy);
        wight.spawnIndex = index;
        return wight;
      }
      case 'chest': {
        const chest = new Chest(wx, wy, String(opts.loot ?? 'random'), Number(opts.tier ?? 2), opts.big === true);
        chest.spawnIndex = index;
        return chest;
      }
      case 'pot': {
        const pot = new Pot(wx, wy);
        pot.spawnIndex = index;
        return pot;
      }
      case 'sign': {
        const sign = new SignPost(wx, wy, String(opts.text ?? 'default'));
        sign.spawnIndex = index;
        return sign;
      }
      case 'npc': {
        const npc = new Npc(wx, wy, String(opts.npc ?? 'elder') as NpcId);
        npc.spawnIndex = index;
        return npc;
      }
      case 'shopkeeper': {
        const shop = new ShopCounter(wx, wy, String(opts.stock ?? 'general'));
        shop.spawnIndex = index;
        return shop;
      }
      case 'bed': {
        const bed = new Bed(wx, wy);
        bed.spawnIndex = index;
        return bed;
      }
      default:
        console.warn(`unknown spawn kind: ${spawn.kind}`);
        return null;
    }
  }

  consumeSpawn(entity: Entity & { spawnIndex: number }): void {
    if (entity.spawnIndex >= 0 && this.activeRoom) this.activeRoom.consumed.add(entity.spawnIndex);
  }

  /** Starts a sliding transition to an adjacent room. */
  private startRoomSlide(room: RoomRuntime): void {
    this.pendingRoom = room;
    this.roomFadeFrom = { x: this.camX, y: this.camY };
    this.roomFadeTo = this.roomOrigin(room);
    this.roomFade = ROOM_FADE;
    this.input.flush();
  }

  /** Cross-map travel through a door or stair. */
  travel(target: LinkDef): void {
    if (this.pendingLink) return;
    this.pendingLink = target;
    this.mapFade = MAP_FADE;
    this.mapFadeOut = true;
    this.audio.play(target.sfx === 'stairs' ? 'stairs' : 'menu');
  }

  private completeTravel(): void {
    const target = this.pendingLink;
    if (!target) return;
    this.pendingLink = null;

    this.world = this.worlds.get(target.map);
    this.player.x = target.gx * TILE + TILE / 2;
    this.player.y = target.gy * TILE + TILE - 2;
    this.player.kx = 0;
    this.player.ky = 0;
    this.player.lockCurrentLinkTile();

    const room = this.world.roomForPixel(this.player.x, this.player.y);
    if (room) this.enterRoom(room, true);
    if (this.world.def.dungeon) {
      if (this.world.def.id === 'drowned') this.quest.advanceTo('enterBell');
      else this.quest.advanceTo('enterRoot');
    }
  }

  /** Places the player after a load, without a fade. */
  enterSavedPosition(mapId: string, x: number, y: number): void {
    this.world = this.worlds.get(mapId);
    this.player.x = x;
    this.player.y = y;
    this.player.kx = 0;
    this.player.ky = 0;
    this.player.lockCurrentLinkTile();
    this.pendingLink = null;
    this.mapFade = 0;
    this.roomFade = 0;
    this.pendingRoom = null;
    const room = this.world.roomForPixel(x, y);
    if (room) this.enterRoom(room, true);
  }

  private playSong(song: SongName): void {
    if (song === this.currentSong) return;
    this.currentSong = song;
    this.audio.playSong(song);
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    this.progression.playSeconds += dt;
    this.effects.update(dt);
    this.tickUiTimers(dt);
    this.refreshStats();

    if (this.mapFade > 0) {
      this.mapFade -= dt;
      if (this.mapFade <= 0) {
        if (this.mapFadeOut) {
          this.completeTravel();
          this.mapFadeOut = false;
          this.mapFade = MAP_FADE;
        } else {
          this.mapFade = 0;
        }
      }
      return;
    }

    if (this.roomFade > 0) {
      this.updateRoomSlide(dt);
      return;
    }

    if (this.gameOver || this.victory) return;

    if (this.dialogue) {
      this.updateDialogue(dt);
      return;
    }
    if (this.shop) {
      this.updateShop();
      return;
    }

    if (this.lanternTimer > 0) this.lanternTimer -= dt;

    // Quick slots are always live, even mid-swing.
    for (let i = 0; i < 4; i++) {
      if (this.input.consumePress(`slot${i + 1}` as 'slot1')) this.player.useQuickSlot(i, this);
    }
    if (this.input.consumePress('item')) this.player.useQuickSlot(0, this);

    this.player.update(dt, this);

    for (const e of this.entities) {
      if (!e.dead) e.update(dt, this);
    }
    this.resolveBodyCollisions();
    this.entities = this.entities.filter((e) => !e.dead);

    this.updateInteraction();
    this.checkRoomChange();
    this.checkRoomCleared();
  }

  private updateRoomSlide(dt: number): void {
    this.roomFade -= dt;
    const t = easeInOutQuad(clamp(1 - this.roomFade / ROOM_FADE, 0, 1));
    this.camX = this.roomFadeFrom.x + (this.roomFadeTo.x - this.roomFadeFrom.x) * t;
    this.camY = this.roomFadeFrom.y + (this.roomFadeTo.y - this.roomFadeFrom.y) * t;

    // Walk the player a little further into the new room as the camera moves.
    const dx = Math.sign(this.roomFadeTo.x - this.roomFadeFrom.x);
    const dy = Math.sign(this.roomFadeTo.y - this.roomFadeFrom.y);
    this.player.x += dx * 26 * dt;
    this.player.y += dy * 22 * dt;

    if (this.roomFade <= 0) {
      this.camX = this.roomFadeTo.x;
      this.camY = this.roomFadeTo.y;
      if (this.pendingRoom) {
        this.enterRoom(this.pendingRoom, false);
        this.pendingRoom = null;
      }
    }
  }

  private checkRoomChange(): void {
    const room = this.world.roomForPixel(this.player.x, this.player.y);
    if (!room || room === this.activeRoom) return;
    this.startRoomSlide(room);
  }

  /** Solid bodies push each other apart so enemies do not stack. */
  private resolveBodyCollisions(): void {
    const solids = this.entities.filter((e) => e.solidBody && !e.dead);
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i];
        const b = solids[j];
        if (!rectsOverlap(a.hitbox(), b.hitbox())) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const push = 0.6;
        // Props are immovable; enemies give way.
        const aMobile = a instanceof Enemy;
        const bMobile = b instanceof Enemy;
        if (aMobile) {
          a.x -= (dx / len) * push;
          a.y -= (dy / len) * push;
        }
        if (bMobile) {
          b.x += (dx / len) * push;
          b.y += (dy / len) * push;
        }
      }
    }

    // Push the player out of solid props.
    for (const e of this.entities) {
      if (!e.solidBody || e.dead || e instanceof Enemy) continue;
      const box = e.hitbox();
      const pbox = this.player.hitbox();
      if (!rectsOverlap(box, pbox)) continue;
      const overlapX = Math.min(pbox.x + pbox.w - box.x, box.x + box.w - pbox.x);
      const overlapY = Math.min(pbox.y + pbox.h - box.y, box.y + box.h - pbox.y);
      if (overlapX < overlapY) {
        this.player.x += this.player.x < e.x ? -overlapX : overlapX;
      } else {
        this.player.y += this.player.y < e.y ? -overlapY : overlapY;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  private updateInteraction(): void {
    this.nearbyProp = this.findFacingProp();
    if (!this.input.consumePress('interact')) return;

    if (this.nearbyProp) {
      this.nearbyProp.interact(this);
      return;
    }
    this.interactWithTile();
  }

  private findFacingProp(): Prop | null {
    const reach: Rect = this.facingProbe(14);
    let best: Prop | null = null;
    let bestDist = Infinity;
    for (const e of this.entities) {
      if (!(e instanceof Prop) || e.dead) continue;
      if (!rectsOverlap(reach, e.hitbox())) continue;
      const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  /** Box just in front of the player, used for reach checks. */
  private facingProbe(reach: number): Rect {
    const p = this.player;
    switch (p.facing) {
      case 'left':
        return { x: p.x - reach - 6, y: p.y - 14, w: reach, h: 16 };
      case 'right':
        return { x: p.x + 6, y: p.y - 14, w: reach, h: 16 };
      case 'up':
        return { x: p.x - 8, y: p.y - 14 - reach, w: 16, h: reach };
      default:
        return { x: p.x - 8, y: p.y - 2, w: 16, h: reach };
    }
  }

  private interactWithTile(): void {
    const probe = this.facingProbe(12);
    const gx = Math.floor((probe.x + probe.w / 2) / TILE);
    const gy = Math.floor((probe.y + probe.h / 2) / TILE);
    const tile = this.world.rawTileAt(gx, gy);
    const def = tileDef(tile);

    switch (def.interact) {
      case 'locked':
        if (this.inventory.consume('smallKey', 1)) {
          this.world.setTile(gx, gy, Tile.Doorway);
          this.audio.play('unlock');
          this.toast(TOASTS.usedKey);
          this.spawn(new Sparkles(gx * TILE + 8, gy * TILE + 8, 0.7, PAL.gold));
        } else {
          this.audio.play('error');
          this.toast(TOASTS.lockedDoor);
        }
        break;

      case 'boss': {
        const keyId = this.world.def.id === 'drowned' ? 'bellKey' : 'bossKey';
        const keyName = keyId === 'bellKey' ? 'Bell Key' : 'Root Key';
        if (this.inventory.consume(keyId, 1)) {
          this.world.setTile(gx, gy, Tile.Doorway);
          // Boss doors are two tiles wide.
          for (const nx of [gx - 1, gx + 1]) {
            if (this.world.rawTileAt(nx, gy) === Tile.DoorBoss) this.world.setTile(nx, gy, Tile.Doorway);
          }
          for (const ny of [gy - 1, gy + 1]) {
            if (this.world.rawTileAt(gx, ny) === Tile.DoorBoss) this.world.setTile(gx, ny, Tile.Doorway);
          }
          this.audio.play('secret');
          this.toast(TOASTS.bossDoorOpen);
          if (keyId === 'bellKey') this.quest.advanceTo('drownBoss');
          else this.quest.advanceTo('boss');
        } else {
          this.audio.play('error');
          this.toast(`A heavy seal. It wants the ${keyName}.`);
        }
        break;
      }

      case 'shrine':
        this.audio.play('select');
        this.openMastery?.();
        break;

      case 'shop':
        this.openShop(this.findShopStockInRoom());
        break;

      case 'sign':
        this.readSign('default');
        break;

      case 'pedestal':
        this.toast('An empty pedestal.');
        break;

      default:
        break;
    }
  }

  private findShopStockInRoom(): string {
    for (const e of this.entities) {
      if (e instanceof ShopCounter) return e.stock;
    }
    return 'general';
  }

  /** Set by the UI layer so shrines can open the mastery screen. */
  openMastery: (() => void) | null = null;

  // -------------------------------------------------------------------------
  // Gameplay events
  // -------------------------------------------------------------------------

  spawn(entity: Entity): void {
    this.entities.push(entity);
  }

  hasActiveBoomerang(): boolean {
    return this.entities.some((e) => e instanceof Boomerang && !e.dead);
  }

  damageEnemy(target: Entity, amount: number, fromX: number, fromY: number, force = 140, crit = false): void {
    const landed = target.takeDamage(Math.round(amount), this, fromX, fromY, force);
    if (!landed) return;
    this.audio.play('hit');
    this.effects.addShake(crit ? 2.6 : 1.2);
    this.effects.spray(target.x, target.y - 8, target.x - fromX, target.y - fromY, crit ? 10 : 6, PAL.white);
    this.effects.text(target.x, target.y - 20, crit ? `${Math.round(amount)}!` : `${Math.round(amount)}`, crit ? PAL.uiAccent : PAL.white, crit);
  }

  stunEnemy(target: Entity, seconds: number): void {
    if (target instanceof Enemy) target.stun = Math.max(target.stun, seconds);
  }

  onEnemyKilled(enemy: Enemy): void {
    this.progression.kills++;
    const xp = XP_TABLE[enemy.kind] ?? 5;
    const levels = this.progression.addXp(xp);
    this.effects.burst(enemy.x, enemy.y - 8, 14, DEATH_COLOR[enemy.kind], { speed: 110, life: 0.5 });
    this.audio.play('die');
    if (levels > 0) this.announceLevelUp(levels);
    this.rollDrops(enemy.kind, enemy.x, enemy.y);
  }

  onMinibossKilled(warden: Warden): void {
    this.progression.kills++;
    this.progression.addXp(XP_TABLE.miniboss);
    this.effects.burst(warden.x, warden.y - 12, 40, PAL.plaster, { speed: 170, life: 0.8 });
    this.effects.addShake(7);
    this.audio.play('secret');
    if (this.activeRoom) {
      this.activeRoom.cleared = true;
      this.activeRoom.consumed.add(warden.spawnIndex);
    }
    // The Warden guards the boomerang and the key to the sealed door.
    this.dropReward(warden.x, warden.y, makeStack('boomerang'));
    this.dropReward(warden.x + 20, warden.y, makeStack('bossKey'));
    this.showBanner('THE WARDEN FALLS', 'It was holding something');
    this.quest.advanceTo('boss');
  }

  onBossKilled(boss: Thornmaw): void {
    this.progression.addXp(XP_TABLE.boss);
    this.effects.addShake(10, 2);
    this.effects.flashScreen(PAL.white, 0.9, 1.2);
    this.effects.burst(boss.x, boss.y - 20, 60, PAL.plantLight, { speed: 200, life: 1.1 });
    this.audio.play('secret');
    if (this.activeRoom) {
      this.activeRoom.cleared = true;
      this.activeRoom.consumed.add(boss.spawnIndex);
    }
    this.quest.set('bossDefeated');
    // A permanent container, plus the blade that cut the root.
    this.progression.heartContainers++;
    this.markStatsDirty();
    this.refreshStats();
    this.player.hearts = this.player.maxHearts;
    this.dropReward(boss.x, boss.y + 8, makeStack('sword3'));
    this.showBanner('THE ROOT IS CUT', 'Thornmaw is dead. The marsh still rings.');
    this.quest.advanceTo('afterRoot');
    this.playSong('overworld');
  }

  onBellwightKilled(wight: Bellwight): void {
    this.progression.kills++;
    this.progression.addXp(XP_TABLE.miniboss);
    this.effects.burst(wight.x, wight.y - 12, 40, PAL.wispLight, { speed: 170, life: 0.8 });
    this.effects.addShake(7);
    this.audio.play('secret');
    if (this.activeRoom) {
      this.activeRoom.cleared = true;
      this.activeRoom.consumed.add(wight.spawnIndex);
    }
    this.dropReward(wight.x, wight.y, makeStack('bellKey'));
    this.dropReward(wight.x + 20, wight.y, makeStack('amuletTide'));
    this.showBanner('THE BELLWIGHT FALLS', 'The nave key is cold in the hand');
    this.quest.advanceTo('drownBoss');
  }

  onTideheartKilled(boss: Tideheart): void {
    this.progression.addXp(XP_TABLE.tideheart);
    this.effects.addShake(10, 2);
    this.effects.flashScreen(PAL.foam, 0.9, 1.2);
    this.effects.burst(boss.x, boss.y - 20, 60, PAL.waterLight, { speed: 200, life: 1.1 });
    this.audio.play('secret');
    if (this.activeRoom) {
      this.activeRoom.cleared = true;
      this.activeRoom.consumed.add(boss.spawnIndex);
    }
    this.quest.set('tideheartDefeated');
    this.quest.advanceTo('done');
    this.progression.heartContainers++;
    this.markStatsDirty();
    this.refreshStats();
    this.player.hearts = this.player.maxHearts;
    this.dropReward(boss.x, boss.y + 8, makeStack('sword4'));
    this.victory = true;
    this.playSong('overworld');
  }

  private dropReward(x: number, y: number, stack: ItemStack): void {
    this.spawn(new Pickup(x, y, 'item', 1, stack));
    this.spawn(new Sparkles(x, y - 8, 1.4, RARITY_COLORS[stack.rarity]));
  }

  private rollDrops(kind: string, x: number, y: number): void {
    const rules = DROP_TABLES[kind];
    if (!rules) return;
    const luck = (this.stats.luck ?? 0) / 100;
    for (const rule of rules) {
      if (!rng.chance(Math.min(0.95, rule.chance * (1 + luck * 0.5)))) continue;
      const amount = rule.min !== undefined ? rng.int(rule.min, rule.max ?? rule.min) : 1;
      if (rule.kind === 'heart' || rule.kind === 'rupee' || rule.kind === 'magic') {
        this.spawn(new Pickup(x, y, rule.kind, amount));
      } else if (rule.kind === 'loot') {
        this.spawn(new Pickup(x, y, 'item', 1, rollLoot(ENEMY_LOOT_TIER[kind] ?? 1, this.stats.luck ?? 0, rng)));
      } else {
        this.spawn(new Pickup(x, y, 'item', 1, makeStack(rule.kind, amount)));
      }
    }
  }

  private checkRoomCleared(): void {
    const room = this.activeRoom;
    if (!room || room.cleared) return;
    const hadEnemies = (room.def.spawns ?? []).some((s) =>
      ['slime', 'octorok', 'keese', 'stalfos', 'thornling', 'wisp', 'crab', 'boss', 'miniboss', 'bellwight', 'tideheart'].includes(
        s.kind,
      ),
    );
    if (!hadEnemies) return;
    const alive = this.entities.some((e) => e.team === 'enemy' && !e.dead);
    if (alive) return;

    room.cleared = true;
    if (room.def.lockOnEnemies) {
      this.audio.play('unlock');
      this.toast(TOASTS.roomCleared);
      this.effects.addShake(2);
    }
  }

  onGrassCut(gx: number, gy: number): void {
    this.audio.play('swing');
    this.effects.burst(gx * TILE + 8, gy * TILE + 10, 6, PAL.grassLight, { speed: 70, life: 0.35 });
    const roll = rng.next();
    if (roll < 0.06) this.spawn(new Pickup(gx * TILE + 8, gy * TILE + 12, 'rupee', 1));
    else if (roll < 0.09) this.spawn(new Pickup(gx * TILE + 8, gy * TILE + 12, 'heart'));
  }

  onSecretFound(): void {
    this.progression.secrets++;
    this.audio.play('secret');
    this.toast(TOASTS.secret);
    this.progression.addXp(20);
  }

  breakPropsIn(box: Rect): void {
    for (const e of this.entities) {
      if (e instanceof Pot && !e.dead && rectsOverlap(box, e.hitbox())) e.smash(this);
    }
  }

  breakPropsNear(x: number, y: number, radius: number): void {
    for (const e of this.entities) {
      if (e instanceof Pot && !e.dead && Math.hypot(e.x - x, e.y - y) <= radius) e.smash(this);
    }
  }

  onPlayerDied(): void {
    this.progression.deaths++;
    this.gameOver = true;
    this.effects.flashScreen(PAL.uiBad, 0.5, 1);
    this.playSong('dungeon');
  }

  /** Restarts from the village, keeping all progression but losing rupees. */
  respawnAfterDeath(): void {
    this.gameOver = false;
    const lost = Math.floor(this.rupees * 0.25);
    this.rupees -= lost;
    this.world = this.worlds.get('overworld');
    this.player.x = (1 * ROOM_COLS + 9) * TILE + 8;
    this.player.y = (2 * ROOM_ROWS + 8) * TILE + 12;
    this.player.revive(Math.max(6, Math.floor(this.player.maxHearts / 2)));
    this.player.lockCurrentLinkTile();
    const room = this.world.roomForPixel(this.player.x, this.player.y);
    if (room) this.enterRoom(room, true);
    if (lost > 0) this.toast(`You lost ${lost} rupees.`);
  }

  addRupees(amount: number): void {
    this.rupees = Math.max(0, this.rupees + amount);
  }

  /** Adds an item, handling quest items and heart pieces specially. */
  giveItem(stack: ItemStack): boolean {
    const def = itemDef(stack.defId);

    if (stack.defId === 'heartPiece') {
      const completed = this.progression.addHeartPiece();
      if (completed) {
        this.markStatsDirty();
        this.refreshStats();
        this.player.hearts = this.player.maxHearts;
        this.audio.play('levelup');
        this.showBanner('HEART CONTAINER', 'Your maximum life has grown');
      } else {
        this.audio.play('secret');
        this.toast(`Piece of Heart  ${this.progression.heartPieces}/4`);
      }
      return true;
    }

    const result = this.inventory.add(stack);
    if (result.added <= 0) return false;

    if (def.category === 'weapon' || def.category === 'shield' || def.category === 'armor') {
      // Auto-equip into an empty slot so early gear is never missed.
      const index = this.inventory.slots.findIndex((s) => s?.uid === stack.uid);
      const slot = def.category === 'weapon' ? 'weapon' : def.category === 'shield' ? 'shield' : 'armor';
      if (index >= 0 && !this.inventory.equipment[slot]) {
        this.inventory.equipFromBag(index, slot);
      }
    }

    this.markStatsDirty();
    this.refreshStats();
    this.audio.play('pickup');
    if (def.category !== 'quest' && def.category !== 'material') {
      this.effects.text(this.player.x, this.player.y - 26, stackName(stack), RARITY_COLORS[stack.rarity]);
    }
    if (stack.defId === 'bow') this.quest.advanceTo('boss');
    if (stack.defId === 'lantern') this.toast('Hold K to burn magic for light.');
    return true;
  }

  lightLantern(): void {
    this.lanternTimer = 14;
    this.audio.play('pickup');
    this.toast('The lantern flares.');
  }

  private get lanternLit(): boolean {
    return this.lanternTimer > 0;
  }

  restAtBed(): void {
    this.player.heal(this.player.maxHearts);
    this.player.restoreMagic(this.player.maxMagic);
    this.audio.play('heart');
    this.showBanner('RESTED', 'Health and magic restored');
    this.onRest?.();
  }

  /** Set by the UI so resting can also save the game. */
  onRest: (() => void) | null = null;

  // -------------------------------------------------------------------------
  // Dialogue, toasts, banners
  // -------------------------------------------------------------------------

  private tickUiTimers(dt: number): void {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= dt;
      if (this.toasts[i].life <= 0) this.toasts.splice(i, 1);
    }
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
    if (this.itemGet) {
      this.itemGet.life -= dt;
      if (this.itemGet.life <= 0) this.itemGet = null;
    }
  }

  toast(text: string): void {
    this.toasts.push({ text, life: 2.6 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  showBanner(title: string, sub: string): void {
    this.banner = { title, sub, life: 2.8 };
  }

  private showRoomName(name: string): void {
    this.banner = { title: name, sub: '', life: 1.8 };
  }

  showItemGet(stack: ItemStack, big: boolean): void {
    this.itemGet = { stack, big, life: big ? 3.2 : 2 };
  }

  private announceLevelUp(levels: number): void {
    this.audio.play('levelup');
    this.effects.rise(this.player.x, this.player.y - 12, 18, PAL.magicLight);
    this.showBanner(`LEVEL ${this.progression.level}`, levels > 1 ? `+${levels} mastery motes` : '+1 mastery mote');
  }

  say(speaker: string, pages: string[]): void {
    this.dialogue = { pages, page: 0, reveal: 0, speaker };
    this.input.flush();
  }

  readSign(key: string): void {
    const pages = SIGNS[key] ?? SIGNS.default;
    this.audio.play('menu');
    this.say('', pages);
  }

  talkTo(npcId: NpcId): void {
    if (this.tryNpcTrade(npcId)) return;

    const pages = npcDialogue(
      npcId,
      {
        hasBoss: this.quest.has('bossDefeated'),
        hasTideheart: this.quest.has('tideheartDefeated'),
        hasBow: this.inventory.has('bow'),
        hasBossKey: this.inventory.has('bossKey'),
        enteredDungeon: this.worlds.get('dungeon').rooms.get('1,2')?.visited ?? false,
        enteredDrowned: this.worlds.get('drowned').rooms.get('1,2')?.visited ?? false,
        level: this.progression.level,
        motes: this.progression.motes,
        heartPieces: this.progression.heartPieces,
        thornSeeds: this.inventory.countOf('thornSeed'),
        boneShards: this.inventory.countOf('boneShard'),
      },
      this.quest,
    );
    const names: Record<NpcId, string> = {
      elder: 'ELDER MARN',
      elderIndoors: 'ELDER MARN',
      smith: 'SMITH BREN',
      smithIndoors: 'SMITH BREN',
      child: 'TILLY',
      herbalist: 'HERBALIST SAE',
      mirror: 'YOUR REFLECTION',
      miller: 'MILLER OAT',
      millerIndoors: 'MILLER OAT',
      cal: 'CAL',
    };
    this.audio.play('menu');
    this.say(names[npcId], pages);
  }

  /** Completes a favour if the NPC is waiting on goods or news. */
  private tryNpcTrade(npcId: NpcId): boolean {
    if ((npcId === 'herbalist') && this.quest.has('seedsReady') && !this.quest.has('seedsDone')) {
      if (!this.inventory.consume('thornSeed', 5)) return false;
      this.quest.set('seedsDone');
      this.giveItem(makeStack('ether'));
      this.audio.play('secret');
      this.say('HERBALIST SAE', [
        'The seeds go still in the bowl. That is how you know they agreed.',
        'Drink this when the Hollow asks more than you have.',
      ]);
      return true;
    }
    if ((npcId === 'smith' || npcId === 'smithIndoors') && this.quest.has('bonesReady') && !this.quest.has('bonesDone')) {
      if (!this.inventory.consume('boneShard', 8)) return false;
      this.quest.set('bonesDone');
      this.giveItem(makeStack('ringSmith'));
      this.audio.play('secret');
      this.say('SMITH BREN', [
        'Eight shards, eight strikes, and a ring that will not bend.',
        'Wear it. Tell people a smith made it, if they ask.',
      ]);
      return true;
    }
    if (npcId === 'child' && this.quest.has('calFound') && !this.quest.has('calDone')) {
      this.quest.set('calDone');
      this.giveItem(makeStack('heartPiece'));
      this.audio.play('secret');
      this.say('TILLY', [
        'He is alive! I knew the marsh would not keep him.',
        'He left this in the grass behind the mill. I think it is for you, for going.',
      ]);
      return true;
    }
    return false;
  }

  private updateDialogue(dt: number): void {
    const d = this.dialogue;
    if (!d) return;
    const page = d.pages[d.page] ?? '';
    const advance = this.input.consumePress('interact') || this.input.consumePress('confirm') || this.input.consumePress('attack');

    if (d.reveal < page.length) {
      const before = Math.floor(d.reveal);
      d.reveal = Math.min(page.length, d.reveal + dt * 52);
      if (Math.floor(d.reveal) > before && Math.floor(d.reveal) % 3 === 0) this.audio.play('text');
      if (advance) d.reveal = page.length;
      return;
    }

    if (advance) {
      d.page++;
      d.reveal = 0;
      if (d.page >= d.pages.length) {
        this.dialogue = null;
        this.input.flush();
      } else {
        this.audio.play('menu');
      }
    }
  }

  // -------------------------------------------------------------------------
  // Shop
  // -------------------------------------------------------------------------

  openShop(stock: string): void {
    const offers = SHOP_STOCK[stock] ?? SHOP_STOCK.general;
    this.shop = { title: stock === 'potions' ? 'HERBALIST' : stock === 'mill' ? 'THE MILL' : 'THE BELLOWS', offers, cursor: 0 };
    this.audio.play('select');
    this.input.flush();
  }

  private updateShop(): void {
    const shop = this.shop;
    if (!shop) return;

    if (this.input.consumePress('up')) {
      shop.cursor = (shop.cursor - 1 + shop.offers.length) % shop.offers.length;
      this.audio.play('menu');
    }
    if (this.input.consumePress('down')) {
      shop.cursor = (shop.cursor + 1) % shop.offers.length;
      this.audio.play('menu');
    }
    if (this.input.consumePress('pause') || this.input.consumePress('cancel') || this.input.consumePress('inventory')) {
      this.shop = null;
      this.audio.play('menu');
      this.input.flush();
      return;
    }
    if (this.input.consumePress('confirm') || this.input.consumePress('interact') || this.input.consumePress('attack')) {
      this.buy(shop.offers[shop.cursor]);
    }
  }

  buy(offer: ShopOffer): void {
    if (this.rupees < offer.price) {
      this.audio.play('error');
      this.toast('Not enough rupees.');
      return;
    }
    const stack = makeStack(offer.defId, offer.count);
    if (this.inventory.isFull && !this.inventory.has(offer.defId)) {
      this.audio.play('error');
      this.toast('Your satchel is full.');
      return;
    }
    if (!this.giveItem(stack)) {
      this.audio.play('error');
      this.toast('Your satchel is full.');
      return;
    }
    this.rupees -= offer.price;
    this.audio.play('rupee');
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D): void {
    const shake = this.effects.shakeOffset();
    const camX = Math.round(this.camX + shake.x);
    const camY = Math.round(this.camY + shake.y);

    ctx.fillStyle = PAL.black;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    this.world.render(ctx, this.art.tiles, camX, camY, VIEW_W, VIEW_H);

    const g: Gfx = { ctx, camX, camY, art: this.art, time: this.time };

    // Depth sort: feet position, then explicit layer.
    const drawables: Entity[] = [...this.entities];
    if (!this.player.dead) drawables.push(this.player);
    drawables.sort((a, b) => a.y - b.y || a.layer - b.layer);
    for (const e of drawables) e.draw(g);

    this.effects.drawParticles(g);
    this.drawDarkness(ctx, camX, camY);
    this.drawInteractPrompt(g);
    this.effects.drawTint(ctx, VIEW_W, VIEW_H);
    this.drawFades(ctx);
  }

  /** Dark rooms are lit only by torches, the player, and the lantern. */
  private drawDarkness(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    const room = this.activeRoom;
    if (!room?.def.dark) return;

    const radius = this.lanternLit ? 96 : 46;
    ctx.save();
    ctx.fillStyle = 'rgba(4, 4, 10, 0.92)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalCompositeOperation = 'destination-out';

    const punch = (wx: number, wy: number, r: number) => {
      const x = wx - camX;
      const y = wy - camY;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.55, 'rgba(0,0,0,0.85)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    punch(this.player.x, this.player.y - 10, radius + Math.sin(this.time * 4) * 3);

    // Torch tiles inside the room.
    for (let ty = 0; ty < ROOM_ROWS; ty++) {
      for (let tx = 0; tx < ROOM_COLS; tx++) {
        const gx = room.rx * ROOM_COLS + tx;
        const gy = room.ry * ROOM_ROWS + ty;
        if (this.world.rawTileAt(gx, gy) !== Tile.Torch) continue;
        punch(gx * TILE + 8, gy * TILE + 8, 52 + Math.sin(this.time * 7 + gx) * 4);
      }
    }

    ctx.restore();
  }

  private drawInteractPrompt(g: Gfx): void {
    const prop = this.nearbyProp;
    if (!prop || this.dialogue || this.shop) return;
    const x = Math.round(prop.x - g.camX);
    const y = Math.round(prop.y - g.camY - prop.h - 16);
    const bob = Math.sin(this.time * 6) < 0 ? 0 : 1;
    g.ctx.fillStyle = withAlpha(PAL.uiAccent, 0.9);
    // Small downward chevron.
    for (let i = 0; i < 4; i++) {
      g.ctx.fillRect(x - 3 + i, y - bob + i, 7 - i * 2, 1);
    }
  }

  private drawFades(ctx: CanvasRenderingContext2D): void {
    if (this.mapFade <= 0) return;
    const t = clamp(this.mapFade / MAP_FADE, 0, 1);
    const alpha = this.mapFadeOut ? 1 - t : t;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = PAL.black;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }

  /** True when normal play input should be ignored by the UI layer. */
  get isBusy(): boolean {
    return this.dialogue !== null || this.shop !== null || this.roomFade > 0 || this.mapFade > 0;
  }

  /** Label for the prop the player is standing next to, for the HUD. */
  get promptLabel(): string | null {
    return this.nearbyProp ? this.nearbyProp.promptLabel : null;
  }
}
