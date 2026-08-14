/**
 * Touch smoke test. Boots the built game in an emulated phone, in portrait and
 * in landscape, and plays it entirely through the on-screen controls — no
 * keyboard events at all — to prove the mobile path works end to end.
 *
 *   node scripts/touch-smoke.mjs
 */
import { chromium, devices } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(dir, 'shots');
mkdirSync(shots, { recursive: true });

const URL = process.env.SMOKE_URL ?? 'http://localhost:4173/';
const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM ?? (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: !process.argv.includes('--headed'),
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});

const errors = [];
const failures = [];
const fail = (label, message) => failures.push(`[${label}] ${message}`);

async function run(label, viewport) {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    viewport,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${label}] console: ${m.text()}`);
  });

  const state = () => page.evaluate(() => window.__hollow?.() ?? null);
  const layout = () => page.evaluate(() => window.__hollowTouch?.() ?? null);

  /** Presses a finger down, optionally drags, then lifts. */
  const finger = async (x, y, { dx = 0, dy = 0, hold = 120, id = 11 } = {}) => {
    const send = (type, cx, cy) =>
      page.dispatchEvent('body', type, {
        pointerId: id,
        pointerType: 'touch',
        isPrimary: true,
        clientX: cx,
        clientY: cy,
        bubbles: true,
        cancelable: true,
      });
    await send('pointerdown', x, y);
    if (dx || dy) await send('pointermove', x + dx, y + dy);
    await page.waitForTimeout(hold);
    await send('pointerup', x + dx, y + dy);
    await page.waitForTimeout(90);
  };

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.tap('#boot-start');
  await page.waitForTimeout(1500);

  const geo = await layout();
  if (!geo?.enabled) fail(label, 'on-screen controls did not activate');
  if (!geo) {
    await context.close();
    return null;
  }

  // --- The picture must survive the layout, and not hide under the controls.
  const frame = await page.evaluate(() => {
    const r = document.getElementById('frame').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height, width: r.width, viewH: window.innerHeight };
  });
  if (frame.height < 120) fail(label, `game frame collapsed to ${Math.round(frame.height)}px tall`);
  if (frame.bottom > frame.viewH + 1) {
    fail(label, `game frame overflows the viewport by ${Math.round(frame.bottom - frame.viewH)}px`);
  }
  if (geo.reserved > 0 && frame.bottom > frame.viewH - geo.reserved * 0.5) {
    fail(label, 'game frame reaches into the reserved control band');
  }

  // --- Thumbstick moves the hero.
  const before = await state();
  await finger(geo.stick.x, geo.stick.y, { dy: -geo.stick.r, hold: 900 });
  const moved = await state();
  if (Math.abs(moved.playerY - before.playerY) < 12) {
    fail(label, `thumbstick did not move the hero (y ${before.playerY} -> ${moved.playerY})`);
  }

  // --- Sword button swings. Poll while the animation is live.
  const attack = geo.buttons.find((b) => b.action === 'attack');
  let swung = false;
  for (let i = 0; i < 5 && !swung; i++) {
    await finger(attack.x, attack.y, { hold: 40, id: 12 });
    for (let p = 0; p < 6 && !swung; p++) {
      const s = await state();
      if (s.playerAction === 'swing') swung = true;
      await page.waitForTimeout(35);
    }
  }
  if (!swung) fail(label, 'sword button never produced a swing');

  // --- BAG opens the satchel; the close button shuts it.
  const bag = geo.buttons.find((b) => b.action === 'inventory');
  await finger(bag.x, bag.y, { hold: 60, id: 13 });
  await page.waitForTimeout(450);
  const opened = await state();
  if (!opened.menuOpen) fail(label, 'BAG button did not open the satchel');
  await page.screenshot({ path: path.join(shots, `touch-${label}-satchel.png`) });

  const menuGeo = await layout();
  await finger(menuGeo.close.x, menuGeo.close.y, { hold: 60, id: 14 });
  await page.waitForTimeout(450);
  const closed = await state();
  if (closed.menuOpen) fail(label, 'close button did not shut the satchel');

  await page.screenshot({ path: path.join(shots, `touch-${label}.png`) });
  const final = await state();
  await context.close();
  return { final, frame, reserved: geo.reserved };
}

const portrait = await run('portrait', { width: 412, height: 915 });
if (portrait) {
  console.log(
    `portrait:  frame ${Math.round(portrait.frame.width)}x${Math.round(portrait.frame.height)}` +
      `  reserved ${portrait.reserved}px  fps ${portrait.final.fps}`,
  );
}

const landscape = await run('landscape', { width: 915, height: 412 });
if (landscape) {
  console.log(
    `landscape: frame ${Math.round(landscape.frame.width)}x${Math.round(landscape.frame.height)}` +
      `  reserved ${landscape.reserved}px  fps ${landscape.final.fps}`,
  );
}

await browser.close();

for (const e of errors) console.error('  ! ' + e);
for (const f of failures) console.error('  ✗ ' + f);

if (errors.length || failures.length) process.exit(1);
console.log('\ntouch smoke: PASS');
