/**
 * Heads-up display: hearts, magic, currency, quick slots, and the transient
 * overlays (dialogue, banners, toasts, item pickups, boss bar).
 */
import { PAL, RARITY_COLORS, withAlpha } from '../art/palette';
import { clamp } from '../engine/math';
import { Thornmaw } from '../game/entities/boss';
import { itemDef } from '../game/items/itemdefs';
import { stackName } from '../game/items/loot';
import { xpToNext } from '../game/mastery';
import type { Scene } from '../game/scene';
import { bar, hovered, icon, measure, panel, rect, strokeRect, text, wrapText, type UiCtx } from './draw';

const HEART_SIZE = 11;

/**
 * `interactive` is false while a menu covers the HUD, so a tap meant for the
 * menu cannot also fall through to a quick slot underneath it.
 */
export function drawHud(u: UiCtx, scene: Scene, interactive = true): void {
  drawHearts(u, scene);
  drawMagic(u, scene);
  drawCurrency(u, scene);
  drawQuickSlots(u, scene, interactive);
  drawXpStrip(u, scene);
  drawBossBar(u, scene);
  drawPrompt(u, scene);
  drawToasts(u, scene);
  drawItemGet(u, scene);
  drawBanner(u, scene);
  drawDialogue(u, scene);
  drawShop(u, scene);
}

// ---------------------------------------------------------------------------

function drawHearts(u: UiCtx, scene: Scene): void {
  const player = scene.player;
  const containers = Math.ceil(player.maxHearts / 2);
  const perRow = 10;
  const heartArt = u.art.icons.get('heart');
  const emptyArt = u.art.icons.get('heartEmpty');

  for (let i = 0; i < containers; i++) {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = 5 + col * (HEART_SIZE - 1);
    const y = 5 + row * (HEART_SIZE - 2);
    const filled = player.hearts - i * 2;

    // Empty container behind, then a full or half heart on top.
    u.ctx.save();
    u.ctx.globalAlpha = 0.8;
    icon(u, emptyArt, x, y, HEART_SIZE);
    u.ctx.restore();

    if (filled >= 2) {
      icon(u, heartArt, x, y, HEART_SIZE);
    } else if (filled === 1) {
      // Clip to the left half for a half heart.
      u.ctx.save();
      u.ctx.beginPath();
      u.ctx.rect(x * u.s, y * u.s, (HEART_SIZE / 2) * u.s, HEART_SIZE * u.s);
      u.ctx.clip();
      icon(u, heartArt, x, y, HEART_SIZE);
      u.ctx.restore();
    }
  }

  // Pulse the first heart when critically low.
  if (player.hearts <= 2 && !player.dead) {
    const pulse = 0.35 + Math.sin(u.time * 9) * 0.3;
    u.ctx.save();
    u.ctx.globalAlpha = clamp(pulse, 0, 1);
    icon(u, heartArt, 5, 5, HEART_SIZE);
    u.ctx.restore();
  }
}

function drawMagic(u: UiCtx, scene: Scene): void {
  const player = scene.player;
  if (player.maxMagic <= 0) return;
  const rows = Math.ceil(Math.ceil(player.maxHearts / 2) / 10);
  const y = 5 + rows * (HEART_SIZE - 2) + 2;
  bar(u, 5, y, 52, 5, player.magic / player.maxMagic, PAL.magic);
  icon(u, u.art.icons.get('mote'), 58, y - 3, 10);
}

function drawCurrency(u: UiCtx, scene: Scene): void {
  const right = u.w - 5;
  icon(u, u.art.icons.get('rupee'), right - 11, 5, 11);
  text(u, String(scene.rupees), right - 13, 7, { align: 'right', size: 9, weight: 700, color: PAL.uiText });

  const motes = scene.progression.motes;
  if (motes > 0) {
    icon(u, u.art.icons.get('mote'), right - 11, 17, 11);
    text(u, String(motes), right - 13, 19, { align: 'right', size: 9, weight: 700, color: PAL.magicLight });
  }

  const keys = scene.inventory.countOf('smallKey');
  if (keys > 0) {
    const y = motes > 0 ? 29 : 17;
    icon(u, u.art.icons.get('key'), right - 11, y, 11);
    text(u, String(keys), right - 13, y + 2, { align: 'right', size: 9, weight: 700, color: PAL.goldLight });
  }
}

function drawQuickSlots(u: UiCtx, scene: Scene, interactive: boolean): void {
  const size = 20;
  const gap = 3;
  const total = 4 * size + 3 * gap;
  const x0 = (u.w - total) / 2;
  const y = u.h - size - 5;
  const tappable = interactive && !scene.dialogue && !scene.shop && !scene.gameOver && !scene.victory;

  for (let i = 0; i < 4; i++) {
    const x = x0 + i * (size + gap);
    const hot = hovered(u, x, y, size, size);
    panel(u, x, y, size, size, { fill: withAlpha(PAL.uiBackDeep, hot && tappable ? 0.9 : 0.72) });

    // Quick slots double as touch targets, so an item is always one tap away.
    if (tappable && hot && u.mouse?.pressed) scene.player.useQuickSlot(i, scene);

    const uid = scene.inventory.quick[i];
    const stack = uid !== null ? scene.inventory.stackByUid(uid) : null;
    if (stack) {
      const def = itemDef(stack.defId);
      icon(u, u.art.icons.get(def.icon), x + 2, y + 2, 16);
      if (stack.count > 1) {
        text(u, String(stack.count), x + size - 2, y + size - 9, {
          align: 'right',
          size: 7,
          weight: 700,
          color: PAL.uiText,
        });
      }
      if (stack.rarity !== 'common') {
        strokeRect(u, x, y, size, size, withAlpha(RARITY_COLORS[stack.rarity], 0.8), 1);
      }
    }

    text(u, String(i + 1), x + 2, y - 8, { size: 7, color: PAL.uiTextDim });
  }
}

function drawXpStrip(u: UiCtx, scene: Scene): void {
  const p = scene.progression;
  const need = xpToNext(p.level);
  const w = 58;
  const x = u.w - w - 5;
  const y = u.h - 11;
  text(u, `LV ${p.level}`, x, y - 9, { size: 7, color: PAL.uiTextDim, weight: 700 });
  bar(u, x, y, w, 4, p.xp / need, PAL.uiAccent);
}

function drawBossBar(u: UiCtx, scene: Scene): void {
  const boss = scene.entities.find((e): e is Thornmaw => e instanceof Thornmaw && !e.dead && e.isAwake);
  if (!boss) return;
  const w = u.w * 0.6;
  const x = (u.w - w) / 2;
  const y = 12;
  text(u, 'THORNMAW', u.w / 2, y - 10, { align: 'center', size: 8, weight: 700, color: PAL.bloodLight, letterSpacing: 1.5 });
  bar(u, x, y, w, 6, boss.healthFraction(), PAL.blood, withAlpha(PAL.black, 0.75));
}

function drawPrompt(u: UiCtx, scene: Scene): void {
  const label = scene.promptLabel;
  if (!label || scene.dialogue || scene.shop) return;
  const str = `E  ${label}`;
  const w = measure(u, str, 8, 700) + 10;
  const x = (u.w - w) / 2;
  const y = u.h - 32;
  panel(u, x, y, w, 13, { fill: withAlpha(PAL.uiBackDeep, 0.86) });
  text(u, str, x + 5, y + 3, { size: 8, weight: 700, color: PAL.uiAccent });
}

function drawToasts(u: UiCtx, scene: Scene): void {
  let y = 42;
  for (const toast of scene.toasts) {
    const alpha = clamp(toast.life / 0.6, 0, 1);
    const w = measure(u, toast.text, 8) + 12;
    u.ctx.save();
    u.ctx.globalAlpha = alpha;
    panel(u, 5, y, w, 13, { fill: withAlpha(PAL.uiBackDeep, 0.86) });
    text(u, toast.text, 11, y + 3, { size: 8, color: PAL.uiText });
    u.ctx.restore();
    y += 16;
  }
}

function drawItemGet(u: UiCtx, scene: Scene): void {
  const get = scene.itemGet;
  if (!get) return;
  const alpha = clamp(get.life / 0.5, 0, 1);
  const name = stackName(get.stack);
  const count = get.stack.count > 1 ? ` x${get.stack.count}` : '';
  const label = name + count;
  const w = Math.max(90, measure(u, label, 9, 700) + 34);
  const h = get.big ? 34 : 26;
  const x = (u.w - w) / 2;
  const y = u.h / 2 - 46;

  u.ctx.save();
  u.ctx.globalAlpha = alpha;
  panel(u, x, y, w, h, { edge: RARITY_COLORS[get.stack.rarity] });
  const iconSize = get.big ? 22 : 16;
  const bob = Math.sin(u.time * 5) * 1.2;
  icon(u, u.art.icons.get(itemDef(get.stack.defId).icon), x + 7, y + (h - iconSize) / 2 + bob, iconSize);
  text(u, label, x + 12 + iconSize, y + 6, { size: 9, weight: 700, color: RARITY_COLORS[get.stack.rarity] });
  text(u, get.stack.rarity.toUpperCase(), x + 12 + iconSize, y + 17, { size: 7, color: PAL.uiTextDim, letterSpacing: 1 });
  u.ctx.restore();
}

function drawBanner(u: UiCtx, scene: Scene): void {
  const banner = scene.banner;
  if (!banner) return;
  const alpha = clamp(banner.life / 0.6, 0, 1);
  u.ctx.save();
  u.ctx.globalAlpha = alpha;
  const y = 52;
  text(u, banner.title, u.w / 2, y, {
    align: 'center',
    size: 15,
    weight: 700,
    color: PAL.uiAccent,
    letterSpacing: 2.5,
  });
  if (banner.sub) {
    text(u, banner.sub, u.w / 2, y + 18, { align: 'center', size: 8, color: PAL.uiTextDim, letterSpacing: 0.8 });
  }
  u.ctx.restore();
}

function drawDialogue(u: UiCtx, scene: Scene): void {
  const d = scene.dialogue;
  if (!d) return;

  const h = 52;
  const y = u.h - h - 6;
  const x = 8;
  const w = u.w - 16;
  panel(u, x, y, w, h, { fill: withAlpha(PAL.uiBackDeep, 0.96), edge: PAL.uiEdgeBright });

  let textY = y + 8;
  if (d.speaker) {
    text(u, d.speaker, x + 8, y + 6, { size: 8, weight: 700, color: PAL.uiAccent, letterSpacing: 1.2 });
    textY = y + 19;
  }

  const page = d.pages[d.page] ?? '';
  const shown = page.slice(0, Math.floor(d.reveal));
  const lines = wrapText(u, shown, w - 18, 9);
  for (let i = 0; i < lines.length && i < 3; i++) {
    text(u, lines[i], x + 8, textY + i * 12, { size: 9, color: PAL.uiText });
  }

  // Blinking advance chevron once the page is fully revealed.
  if (d.reveal >= page.length && Math.sin(u.time * 7) > 0) {
    const cx = x + w - 12;
    const cy = y + h - 11;
    for (let i = 0; i < 4; i++) rect(u, cx - 3 + i, cy + i, 7 - i * 2, 1, PAL.uiAccent);
  }

  const pages = d.pages.length;
  if (pages > 1) {
    text(u, `${d.page + 1}/${pages}`, x + w - 8, y + 5, { align: 'right', size: 7, color: PAL.uiTextDim });
  }
}

function drawShop(u: UiCtx, scene: Scene): void {
  const shop = scene.shop;
  if (!shop) return;

  const w = 176;
  const rowH = 20;
  const h = 34 + shop.offers.length * rowH;
  const x = (u.w - w) / 2;
  const y = (u.h - h) / 2;

  panel(u, x, y, w, h, { edge: PAL.uiAccent });
  text(u, shop.title, x + 8, y + 7, { size: 10, weight: 700, color: PAL.uiAccent, letterSpacing: 1.5 });
  icon(u, u.art.icons.get('rupee'), x + w - 40, y + 5, 11);
  text(u, String(scene.rupees), x + w - 8, y + 7, { align: 'right', size: 9, weight: 700 });

  shop.offers.forEach((offer, i) => {
    const rowY = y + 26 + i * rowH;
    const selected = i === shop.cursor;
    const def = itemDef(offer.defId);
    const affordable = scene.rupees >= offer.price;

    // Tapping a row selects it; tapping the selected row buys it.
    if (hovered(u, x + 4, rowY - 2, w - 8, rowH - 2) && u.mouse?.pressed) {
      if (selected) scene.buy(offer);
      else {
        shop.cursor = i;
        scene.audio.play('menu');
      }
    }

    if (selected) {
      rect(u, x + 4, rowY - 2, w - 8, rowH - 2, withAlpha(PAL.uiPanelLight, 0.9));
      strokeRect(u, x + 4, rowY - 2, w - 8, rowH - 2, PAL.uiAccent, 1);
    }
    icon(u, u.art.icons.get(def.icon), x + 8, rowY, 15);
    const label = offer.count > 1 ? `${def.name} x${offer.count}` : def.name;
    text(u, label, x + 27, rowY + 3, { size: 8, color: affordable ? PAL.uiText : PAL.uiTextDim });
    text(u, String(offer.price), x + w - 10, rowY + 3, {
      align: 'right',
      size: 8,
      weight: 700,
      color: affordable ? PAL.uiGood : PAL.uiBad,
    });
  });

  text(u, 'ENTER buy    ESC leave', x + w / 2, y + h - 11, { align: 'center', size: 7, color: PAL.uiTextDim });

  // Anywhere outside the panel closes the shop, which is the only way out on
  // a touch device.
  if (u.mouse?.pressed && !hovered(u, x, y, w, h)) {
    scene.shop = null;
    scene.audio.play('menu');
  }
}
