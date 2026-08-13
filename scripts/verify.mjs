/**
 * One-command verification: build, serve the bundle, run the browser smoke
 * test against it, then shut the server down.
 *
 *   npm run verify
 */
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.VERIFY_PORT ?? 4319);
const URL = `http://127.0.0.1:${PORT}/`;

const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });

console.log('› building');
if (run('npx', ['vite', 'build']).status !== 0) process.exit(1);

console.log(`› serving on ${URL}`);
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1'], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
});

const shutdown = () => {
  if (!server.killed) server.kill('SIGTERM');
};
process.on('exit', shutdown);
process.on('SIGINT', () => {
  shutdown();
  process.exit(130);
});

// Wait for the preview server to answer before driving the browser.
let ready = false;
for (let i = 0; i < 40 && !ready; i++) {
  await sleep(250);
  try {
    const res = await fetch(URL);
    ready = res.ok;
  } catch {
    /* not up yet */
  }
}
if (!ready) {
  console.error('preview server did not start');
  shutdown();
  process.exit(1);
}

console.log('› smoke test');
const result = run('node', ['scripts/smoke.mjs'], {
  env: { ...process.env, SMOKE_URL: URL, NO_PROXY: '*', no_proxy: '*' },
});

shutdown();
process.exit(result.status ?? 1);
