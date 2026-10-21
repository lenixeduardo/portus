import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright-core';
const root = fileURLToPath(new URL('../../', import.meta.url));
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
let vite, browser;
let log = '';
const url = 'http://127.0.0.1:5187';
before(async () => {
  vite = spawn(process.execPath, [join(root,'node_modules/vite/bin/vite.js'), '--configLoader','runner','--host','127.0.0.1','--port','5187','--strictPort'], { cwd: root });
  for (const stream of [vite.stdout,vite.stderr]) stream.on('data', chunk => { log += chunk; });
  const deadline = Date.now()+45000;
  while (true) {
    if (vite.exitCode !== null || Date.now()>deadline) throw new Error(log);
    try { if ((await fetch(url)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve,100));
  }
  browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
});
after(async () => { await browser?.close(); if (vite?.exitCode === null) vite.kill(); });

async function openUpdate({ offline = false } = {}) {
  const page = await browser.newPage();
  await page.addInitScript(({version,offline}) => {
    localStorage.setItem('portus:last-seen-version',version);
    window.updateOffline=offline;
    window.downloads=0; window.installs=0;
    window.api={
      auth:{currentUser:async()=>null},
      setup:{status:async()=>({configured:true,available:true,setupCompleted:true})},
      updates:{
        check:async()=>window.updateOffline?null:({currentVersion:version,version:'0.9.0'}),
        onProgress:callback=>{window.progressCallback=callback;return()=>{window.progressCallback=null;};},
        download:()=>{window.downloads++;return new Promise(resolve=>{window.finishDownload=resolve;});},
        install:async()=>{window.installs++;return window.installs===1?{ok:false,error:'Conclua a captura em andamento antes de instalar a atualização.'}:{ok:true,data:true};}
      }
    };
  },{version,offline});
  await page.goto(url);
  return page;
}

test('download interno mantém modal, mostra progresso e oferece instalação na mesma pasta',async()=>{
  const page=await openUpdate();
  try {
    await page.getByRole('button',{name:'Baixar atualização',exact:true}).click();
    await page.evaluate(()=>window.progressCallback({receivedBytes:50,totalBytes:100}));
    await page.getByText('50% baixado',{exact:true}).waitFor();
    assert.equal(await page.getByRole('progressbar').getAttribute('value'),'50');
    assert.equal(await page.getByRole('button',{name:'Baixando atualização…'}).isDisabled(),true);
    assert.equal(page.context().pages().length,1);
    await page.evaluate(()=>window.finishDownload({ok:true,data:true}));
    const install=page.getByRole('button',{name:'Instalar e reiniciar',exact:true});
    await install.click();
    await page.getByRole('alert').filter({hasText:'captura em andamento'}).waitFor();
    await install.click();
    await page.getByText('Fechando o PORTUS para instalar a atualização…',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.downloads),1);
    assert.equal(await page.evaluate(()=>window.installs),2);
    assert.equal(page.context().pages().length,1);
  } finally {await page.close();}
});
test('conexão recuperada dispara nova consulta sem reabrir o app',async()=>{
  const page=await openUpdate({offline:true});
  try {
    await page.getByRole('button',{name:'Entrar',exact:true}).waitFor();
    await page.evaluate(()=>{window.updateOffline=false;window.dispatchEvent(new Event('online'));});
    await page.getByRole('button',{name:'Baixar atualização',exact:true}).waitFor();
  } finally {await page.close();}
});
