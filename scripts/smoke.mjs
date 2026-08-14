/**
 * Browser smoke test. Boots the built game, plays a scripted sequence of
 * inputs, and fails on any console error, page error, or map validation
 * warning. Screenshots land in scripts/shots/.
 *
 *   node scripts/smoke.mjs [--headed]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const shots = path.join(dir, 'shots');
mkdirSync(shots, { recursive: true });

const URL = process.env.SMOKE_URL ?? 'http://localhost:4173/';

/**
 * Prefer an explicitly configured browser, then a preinstalled one, and
 * otherwise let Playwright use the copy it manages itself — which is what
 * happens in CI after `playwright install chromium`.
 */
const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM ?? (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: !process.argv.includes('--headed'),
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});

const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });

const errors = [];
const warnings = [];
page.on('console', (msg) => {
  const text = msg.text();
  if (msg.type() === 'error') errors.push(text);
  if (msg.type() === 'warning') warnings.push(text);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}\n${err.stack ?? ''}`));

const step = async (label, fn) => {
  await fn();
  await page.screenshot({ path: path.join(shots, `${label}.png`) });
  process.stdout.write(`  ✓ ${label}\n`);
};

const key = async (k, times = 1, delay = 90) => {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(k);
    await page.waitForTimeout(delay);
  }
};

const hold = async (k, ms) => {
  await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  await page.keyboard.up(k);
  await page.waitForTimeout(60);
};

const readState = () => page.evaluate(() => {
  const w = /** @type {any} */ (window);
  return w.__hollow ? w.__hollow() : null;
});

/**
 * Walks the hero toward a world pixel position by holding the movement keys
 * and re-checking position, correcting drift on one axis at a time. Heals from
 * quick slot 1 when hurt and recovers from a death, so a bad fight does not
 * fail the run.
 */
async function navigate(targetX, targetY, { timeout = 25000, tolerance = 9 } = {}) {
  const deadline = Date.now() + timeout;
  const down = new Set();
  const setKey = async (k, want) => {
    if (want && !down.has(k)) {
      await page.keyboard.down(k);
      down.add(k);
    } else if (!want && down.has(k)) {
      await page.keyboard.up(k);
      down.delete(k);
    }
  };
  const release = async () => {
    for (const k of [...down]) await page.keyboard.up(k);
    down.clear();
  };

  let last = null;
  while (Date.now() < deadline) {
    const s = await readState();
    last = s;
    if (!s) break;

    if (s.gameOver) {
      await release();
      await page.waitForTimeout(1200);
      await key('Enter', 2, 300);
      continue;
    }
    if (s.hearts <= 2) {
      await release();
      await key('Digit1');
    }
    if (s.busy) {
      await release();
      await key('Enter');
      continue;
    }

    const dx = targetX - s.playerX;
    const dy = targetY - s.playerY;
    if (Math.abs(dx) < tolerance && Math.abs(dy) < tolerance) break;

    // Straighten up before advancing, so corridors are entered squarely.
    const fixX = Math.abs(dx) > tolerance;
    await setKey('KeyA', fixX && dx < 0);
    await setKey('KeyD', fixX && dx > 0);
    await setKey('KeyW', !fixX && dy < 0);
    await setKey('KeyS', !fixX && dy > 0);
    await page.waitForTimeout(85);
  }
  await release();
  await page.waitForTimeout(120);
  return last;
}

/**
 * Closes on the nearest enemy and swings until something dies. Exercises the
 * whole combat path — approach, hitbox overlap, damage, death, drops.
 */
async function hunt({ timeout = 22000 } = {}) {
  const deadline = Date.now() + timeout;
  const startKills = (await readState())?.kills ?? 0;
  while (Date.now() < deadline) {
    const s = await readState();
    if (!s || s.gameOver) {
      await key('Enter', 2, 300);
      continue;
    }
    if ((s.kills ?? 0) > startKills) return true;
    if (s.hearts <= 2) await key('Digit1');

    const target = (s.enemies ?? [])
      .map((e) => ({ ...e, d: Math.hypot(e.x - s.playerX, e.y - s.playerY) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!target) return false;

    if (target.d < 19) {
      await key('KeyJ', 1, 120);
      continue;
    }
    const dx = target.x - s.playerX;
    const dy = target.y - s.playerY;
    const k = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'KeyA' : 'KeyD') : dy < 0 ? 'KeyW' : 'KeyS';
    await page.keyboard.down(k);
    await page.waitForTimeout(90);
    await page.keyboard.up(k);
  }
  return false;
}

/** Clicks a point given in menu space (640x416). */
const clickMenu = async (mx, my) => {
  const box = await page.locator('#frame').boundingBox();
  await page.mouse.move(box.x + (mx / 640) * box.width, box.y + (my / 416) * box.height);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForTimeout(120);
};

console.log(`smoke: ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle' });

await step('00-boot', async () => {
  await page.waitForSelector('#boot-start');
});

await step('01-village', async () => {
  // Always start a fresh game so the run is deterministic.
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('#boot-start');
  await page.waitForTimeout(1400);
});

await step('02-swing', async () => {
  await key('KeyJ', 3, 170);
});

await step('03-satchel', async () => {
  await key('Tab');
  await page.waitForTimeout(400);
  await key('ArrowRight', 2);
  await key('ArrowDown');
});

await step('04-mastery', async () => {
  await key('KeyU');
  await page.waitForTimeout(400);
  await key('ArrowRight', 2);
  await key('ArrowDown', 2);
});

await step('05-map', async () => {
  await key('KeyM');
  await page.waitForTimeout(400);
});

let mouseWorks = false;
await step('06-journal', async () => {
  // Journal has no hotkey, so reaching it proves pointer input is wired up.
  // Tabs sit at menu-space y 20..48; JOURNAL spans x 366..474.
  await clickMenu(420, 34);
  await page.waitForTimeout(400);
  mouseWorks = (await readState())?.menuTab === 'journal';
});

await step('07-close-menu', async () => {
  await key('Escape');
  await page.waitForTimeout(300);
});

await step('08-north-road', async () => {
  // Straight up the village path into the North Road screen (world y 208-416).
  await navigate(472, 370);
});

await step('09-fight', async () => {
  const killed = await hunt();
  if (!killed) console.warn('  (no kill in the North Road screen)');
});

await step('10-hollow-gate', async () => {
  await navigate(472, 240);
  await navigate(472, 150);
});

await step('11-descend', async () => {
  // Walk onto the stair at the top of the Hollow Gate screen.
  await navigate(472, 45, { timeout: 20000 });
  await hold('KeyW', 900);
  await page.waitForTimeout(1400);
});

await step('12-in-dungeon', async () => {
  await key('KeyJ', 2, 200);
  await page.waitForTimeout(400);
});

// Layout audit: can the player actually reach everything that matters?
const audit = await page.evaluate(() => {
  const w = /** @type {any} */ (window);
  return w.__hollowAudit ? w.__hollowAudit() : null;
});

// Probe internal state through a debug hook the game exposes in dev builds.
const state = await page.evaluate(() => {
  const w = /** @type {any} */ (window);
  return w.__hollow ? w.__hollow() : null;
});

await browser.close();

console.log('\nstate:', JSON.stringify(state, null, 2));

if (audit) {
  console.log(`\naudit: ${audit.reachableTiles} reachable tiles, ${audit.issues.length} issue(s)`);
  for (const issue of audit.issues) {
    console.error(`  ! [${issue.map}] ${issue.room}: ${issue.detail}`);
  }
}

const mapWarnings = warnings.filter((w) => w.includes('[map') || w.includes('unknown legend') || w.includes('unknown spawn'));

if (mapWarnings.length) {
  console.error('\nMAP WARNINGS:');
  for (const w of mapWarnings) console.error('  ' + w);
}
if (errors.length) {
  console.error('\nERRORS:');
  for (const e of errors) console.error('  ' + e);
}

// Behavioural assertions: the run has to actually get somewhere.
const checks = [
  ['game started', state?.started === true],
  ['reached the dungeon', state?.map === 'dungeon'],
  ['gained experience', (state?.level ?? 1) > 1 || (state?.xp ?? 0) > 0],
  ['killed something', (state?.kills ?? 0) > 0],
  ['sword equipped', state?.equipped?.weapon === 'sword1'],
  ['frame rate healthy', (state?.fps ?? 0) > 45],
  ['world fully reachable', (audit?.issues.length ?? 1) === 0],
  ['mouse input reaches the UI', mouseWorks],
];
const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`  ${ok ? '✓' : '✗'} ${label}`);

if (errors.length || mapWarnings.length || failed.length) {
  process.exit(1);
}
console.log('\nsmoke: PASS');
