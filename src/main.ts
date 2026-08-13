/**
 * Boot and top-level orchestration: builds the art, wires input to the scene,
 * routes each frame between play, menus and full-screen states, and owns
 * autosaving.
 */
import { buildArt } from './art';
import { auditWorld } from './dev/audit';
import { PAL } from './art/palette';
import { audio } from './engine/audio';
import { Input } from './engine/input';
import { Loop } from './engine/loop';
import { Screen, VIEW_H, VIEW_W } from './engine/screen';
import { Scene } from './game/scene';
import { hasSave, loadGame, saveGame } from './save/save';
import type { UiCtx } from './ui/draw';
import { text } from './ui/draw';
import { drawHud } from './ui/hud';
import { Menu } from './ui/menu';
import { drawGameOver, drawSaveFlash, drawVictory } from './ui/screens';

const gameCanvas = document.getElementById('game') as HTMLCanvasElement;
const uiCanvas = document.getElementById('ui') as HTMLCanvasElement;
const frame = document.getElementById('frame') as HTMLElement;
const boot = document.getElementById('boot') as HTMLElement;
const startButton = document.getElementById('boot-start') as HTMLButtonElement;

const screen = new Screen(gameCanvas, uiCanvas, frame);
const input = new Input(uiCanvas);
const art = buildArt();
const scene = new Scene(input, art);
const menu = new Menu();

/** Autosave cadence, in seconds of play. */
const AUTOSAVE_INTERVAL = 25;

let saveFlash = 0;
let autosaveTimer = AUTOSAVE_INTERVAL;
let overlayElapsed = 0;
let started = false;

// Shrines and beds reach back into the UI layer.
scene.openMastery = () => menu.show('mastery', scene);
scene.onRest = () => {
  if (saveGame(scene)) saveFlash = 1.4;
};

function uiContext(): UiCtx {
  const inside = input.pointer.inside;
  return {
    ctx: screen.ui,
    s: screen.scale,
    w: VIEW_W,
    h: VIEW_H,
    art,
    time: scene.time,
    mouse: inside
      ? {
          x: input.pointer.x / screen.scale,
          y: input.pointer.y / screen.scale,
          down: input.pointer.down,
          pressed: input.pointer.pressed,
          released: input.pointer.released,
        }
      : null,
  };
}

function update(dt: number): void {
  input.beginFrame(dt);

  if (!started) {
    input.endFrame();
    return;
  }

  if (scene.gameOver) {
    overlayElapsed += dt;
    scene.effects.update(dt);
    if (overlayElapsed > 0.8 && (input.consumePress('confirm') || input.consumePress('attack') || input.consumePress('interact'))) {
      overlayElapsed = 0;
      scene.respawnAfterDeath();
      saveGame(scene);
    }
    input.endFrame();
    return;
  }

  if (scene.victory) {
    overlayElapsed += dt;
    scene.effects.update(dt);
    if (overlayElapsed > 1.2 && (input.consumePress('confirm') || input.consumePress('attack') || input.consumePress('interact'))) {
      overlayElapsed = 0;
      scene.victory = false;
      saveGame(scene);
      saveFlash = 1.4;
    }
    input.endFrame();
    return;
  }

  // The menu swallows input while open.
  const menuHandled = menu.update(input, scene);
  if (!menuHandled) {
    scene.update(dt);
  } else {
    // Keep visuals alive behind the menu without advancing the simulation.
    scene.effects.update(dt);
  }

  if (saveFlash > 0) saveFlash -= dt;

  autosaveTimer -= dt;
  if (autosaveTimer <= 0) {
    autosaveTimer = AUTOSAVE_INTERVAL;
    if (!scene.isBusy && !menu.open && saveGame(scene)) saveFlash = 1.2;
  }

  input.endFrame();
}

function render(): void {
  scene.render(screen.game);

  screen.clearUi();
  const u = uiContext();

  if (!started) {
    input.endRender();
    return;
  }

  if (scene.gameOver) {
    drawGameOver(u, scene, overlayElapsed);
    input.endRender();
    return;
  }
  if (scene.victory) {
    drawVictory(u, scene, overlayElapsed);
    input.endRender();
    return;
  }

  drawHud(u, scene);
  menu.draw(u, scene);
  if (saveFlash > 0) drawSaveFlash(u, saveFlash);

  if (audio.muted) {
    text(u, 'muted (press N)', 5, VIEW_H - 20, { size: 7, color: PAL.uiTextDim });
  }

  input.endRender();
}

const loop = new Loop(update, render);

function start(loadExisting: boolean): void {
  audio.unlock();
  if (loadExisting && hasSave()) {
    loadGame(scene);
    scene.showBanner('WELCOME BACK', scene.activeRoom?.def.name ?? '');
  }
  started = true;
  boot.classList.add('hidden');
  input.flush();
  autosaveTimer = AUTOSAVE_INTERVAL;
}

// A save from a previous session turns the button into "continue".
if (hasSave()) {
  startButton.textContent = 'CONTINUE';
  const fresh = document.createElement('button');
  fresh.type = 'button';
  fresh.textContent = 'NEW GAME';
  fresh.style.background = 'transparent';
  fresh.style.color = '#98a0b4';
  fresh.style.boxShadow = 'inset 0 0 0 1px #3a4256';
  fresh.style.marginTop = '0';
  fresh.addEventListener('click', () => {
    scene.startNewGame();
    start(false);
  });
  startButton.after(fresh);
}

startButton.addEventListener('click', () => start(hasSave()));

// Mute toggle lives outside the input map so it works from any state.
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyN' && !e.repeat) audio.toggleMute();
});

window.addEventListener('beforeunload', () => {
  if (started && !scene.gameOver) saveGame(scene);
});

// Pause music when the tab is hidden so it does not play into the background.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audio.playSong(null);
  }
});

/**
 * Debug hook used by `scripts/smoke.mjs` to assert on live state. Harmless in
 * production, and the only way to check the simulation without pixel-diffing.
 */
(window as unknown as { __hollow: () => unknown }).__hollow = () => ({
  started,
  menuOpen: menu.open,
  menuTab: menu.open ? menu.tab : null,
  gameOver: scene.gameOver,
  busy: scene.isBusy,
  map: scene.world.def.id,
  room: scene.activeRoom?.def.name ?? null,
  playerX: Math.round(scene.player.x),
  playerY: Math.round(scene.player.y),
  hearts: scene.player.hearts,
  maxHearts: scene.player.maxHearts,
  rupees: scene.rupees,
  level: scene.progression.level,
  xp: Math.round(scene.progression.xp),
  motes: scene.progression.motes,
  kills: scene.progression.kills,
  entities: scene.entities.length,
  enemies: scene.entities
    .filter((e) => e.team === 'enemy' && !e.dead)
    .map((e) => ({ x: Math.round(e.x), y: Math.round(e.y) })),
  bagUsed: scene.inventory.slots.filter(Boolean).length,
  equipped: Object.fromEntries(
    Object.entries(scene.inventory.equipment).map(([slot, stack]) => [slot, stack?.defId ?? null]),
  ),
  fps: Math.round(loop.fps),
});

/** World reachability audit, invoked by the smoke test. */
(window as unknown as { __hollowAudit: () => unknown }).__hollowAudit = () =>
  auditWorld(scene.worlds, 'overworld', Math.floor(scene.player.x / 16), Math.floor(scene.player.y / 16));

loop.start();
