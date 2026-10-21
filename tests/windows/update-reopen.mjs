// Executes real NSIS installers against the real public release channel on a disposable Windows runner.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { _electron } from 'playwright-core';
import { extractFile, uncache } from '@electron/asar';

assert.equal(process.platform, 'win32', 'This acceptance test requires real Windows.');
const evidence = resolve('test-results/windows-update');
await mkdir(evidence, { recursive: true });
const baseline = '0.1.35';
const installDir = join(process.env.RUNNER_TEMP, 'PORTUS Update Acceptance');
const executable = join(installDir, 'Portus.exe');
const installerDir = join(process.env.RUNNER_TEMP, 'portus-baseline');
await mkdir(installerDir, { recursive: true });
const repo = 'lenixeduardo/portus';
const latestResponse = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
  headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PORTUS-Windows-Acceptance', Authorization: `Bearer ${process.env.GH_TOKEN}` }
});
assert.ok(latestResponse.ok, `Published channel returned ${latestResponse.status}`);
const latest = await latestResponse.json();
const target = latest.tag_name.replace(/^v/, '');
assert.notEqual(target, baseline, 'The console-log version must be published before testing.');
execFileSync('gh', ['release','download',`v${baseline}`,'--repo',repo,'--pattern',`PORTUS-Setup-${baseline}-x64.exe`,'--dir',installerDir], { stdio: 'inherit' });

const timeline = [];
const record = (step, details = {}) => {
  const item = { time: new Date().toISOString(), step, ...details };
  timeline.push(item); console.log(JSON.stringify(item));
};
async function waitFor(check, description, timeout = 180_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const value = await check(); if (value) return value; } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Timed out: ${description}`);
}
async function run(file, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: 'inherit', windowsVerbatimArguments: true });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Baseline installer exceeded 180 seconds')); }, 180_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Installer exit ${code}`)); });
  });
}
async function launch() {
  return _electron.launch({ executablePath: executable, timeout: 90_000,
    env: { ...process.env, NODE_ENV: 'production', ELECTRON_ENABLE_LOGGING: '1' } });
}
function installedVersion() {
  const archive = join(installDir,'resources','app.asar');
  // The installer replaces this same path; stale ASAR offsets must never be reused.
  uncache(archive);
  return JSON.parse(extractFile(archive, 'package.json').toString()).version;
}
let app;
try {
  await run(join(installerDir,`PORTUS-Setup-${baseline}-x64.exe`), ['/S', `/D=${installDir}`]);
  assert.equal(installedVersion(), baseline);
  const oldHash = createHash('sha256').update(await readFile(join(installDir,'resources','app.asar'))).digest('hex');
  record('baseline-installed', { version: baseline, installDir, oldHash });
  app = await launch();
  const initialVersion = await app.evaluate(({ app }) => app.getVersion());
  assert.equal(initialVersion, baseline);
  record('baseline-opened', { version: initialVersion });
  // Close the process entirely, then reopen the installed old version against the new public Release.
  await app.close(); app = undefined;
  app = await launch();
  const page = await app.firstWindow();
  page.setDefaultTimeout(120_000);
  await page.getByRole('heading', { name: 'Atualização disponível', exact: true }).waitFor();
  await page.getByText(`Nova versão: ${target}`, { exact: false }).waitFor();
  assert.match(await page.locator('.modal-card').filter({has:page.getByRole('heading',{name:'Atualização disponível',exact:true})}).innerText(), new RegExp(baseline.replaceAll('.','\\.')));
  await page.screenshot({ path: join(evidence,'01-reopened-update-detected.png') });
  record('reopened-update-detected', { installed: baseline, offered: target, source: latest.html_url });
  const userData = await app.evaluate(({ app }) => app.getPath('userData'));
  await page.getByRole('button', { name: 'Baixar atualização', exact: true }).click();
  await page.getByRole('button', { name: 'Instalar e reiniciar', exact: true }).waitFor({timeout: 900_000});
  await page.screenshot({ path: join(evidence,'02-real-download-completed.png') });
  record('real-download-completed', { target });
  let didClose = false;
  app.once('close', () => { didClose = true; });
  await page.getByRole('button',{name:'Instalar e reiniciar',exact:true}).click({ noWaitAfter: true });
  await waitFor(() => didClose, 'PORTUS closing for installation');
  app = undefined;
  await waitFor(() => installedVersion() === target, 'replacement of app.asar in the same directory');
  const newHash = createHash('sha256').update(await readFile(join(installDir,'resources','app.asar'))).digest('hex');
  assert.notEqual(newHash, oldHash, 'Installed application files must actually change.');
  const main = extractFile(join(installDir,'resources','app.asar'), 'dist/main/index.js').toString();
  assert.ok(main.includes('[PORTUS_UPDATE_SMOKE]'), 'The new console.log must be in the installed application.');
  record('files-replaced', { version: installedVersion(), installDir, newHash });
  await waitFor(() => {
    const paths = execFileSync('powershell.exe', ['-NoProfile','-Command', "Get-Process Portus -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path | ConvertTo-Json"], {encoding:'utf8'}).trim();
    if (!paths) return false;
    const value = JSON.parse(paths);
    return (Array.isArray(value) ? value : [value]).some(p => p.toLowerCase() === executable.toLowerCase());
  }, 'automatic restart of the updated executable');
  record('automatic-restart-confirmed');
  await waitFor(async () => {
    const date = new Date().toISOString().slice(0,10);
    const log = await readFile(join(userData,'logs',`portus-${date}.log`),'utf8');
    if (!log.includes(`[PORTUS_UPDATE_SMOKE] versão carregada: ${target}`)) return false;
    await writeFile(join(evidence,'updated-startup.log'),log);
    return true;
  }, 'startup marker of the updated application');
  // Reopen under automation too, confirming the installed runtime version and absence of another update.
  execFileSync('taskkill', ['/F','/IM','Portus.exe'], {stdio:'inherit'});
  app = await launch();
  const updatedVersion = await app.evaluate(({ app }) => app.getVersion());
  assert.equal(updatedVersion, target);
  const updatedPage = await app.firstWindow();
  await updatedPage.waitForFunction(() => typeof window.api?.updates?.check === 'function');
  const update = await updatedPage.evaluate(() => window.api.updates.check());
  assert.equal(update, null, 'Installed latest version must not offer itself again.');
  await updatedPage.screenshot({path:join(evidence,'03-reopened-latest-version.png')});
  record('updated-reopen-confirmed', { version: updatedVersion, updateOffered: false });
  await writeFile(join(evidence,'result.json'),JSON.stringify({passed:true,baseline,target,installDir,timeline},null,2));
} catch (error) {
  if (app) { try { await (await app.firstWindow()).screenshot({path:join(evidence,'failure.png')}); } catch {} }
  await writeFile(join(evidence,'result.json'),JSON.stringify({passed:false,error:error.stack,baseline,target,timeline},null,2));
  throw error;
} finally { await app?.close().catch(()=>{}); }
