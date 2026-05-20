import { _electron as electron } from 'playwright-core';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.resolve(fileURLToPath(import.meta.url), '..');
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/electron');
const SHOT_DIR = '/tmp/shots';

const app = await electron.launch({
  executablePath: electronBin,
  args: ['--no-sandbox', APP_DIR],
  env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99', NODE_ENV: 'production' },
  timeout: 30_000,
});
await new Promise(r => setTimeout(r, 7_000));

console.log('windows count:', app.windows().length);
for (const w of app.windows()) {
  console.log('window url:', w.url());
  try {
    const text = await w.evaluate(() => document.body?.innerHTML?.substring(0, 500) ?? '(empty)');
    console.log('html:', text.substring(0, 300));
  } catch(e) { console.log('err:', e.message); }
}

// Take screenshot of first window
try {
  const w = app.windows()[0];
  await w.screenshot({ path: '/tmp/shots/probe.png' });
  console.log('screenshot: /tmp/shots/probe.png');
} catch(e) { console.log('ss err:', e.message); }

await app.close();
