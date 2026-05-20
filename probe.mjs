import { _electron as electron } from 'playwright-core';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = path.resolve(fileURLToPath(import.meta.url), '..');
const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/electron');

const app = await electron.launch({
  executablePath: electronBin,
  args: ['--no-sandbox', APP_DIR],
  env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' },
  timeout: 30_000,
});
await new Promise(r => setTimeout(r, 6_000));

for (const w of app.windows()) {
  console.log('window url:', w.url());
  const text = await w.evaluate(() => document.body?.innerText?.substring(0, 200) ?? '(empty)').catch(e => e.message);
  console.log('text:', text);
}
const wcs = await app.evaluate(({ webContents }) =>
  webContents.getAllWebContents().map(w => ({ id: w.id, type: w.getType(), url: w.getURL() })));
console.log('webContents:', JSON.stringify(wcs, null, 2));
await app.close();
