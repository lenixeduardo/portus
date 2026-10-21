// Native acceptance against an unpublished file package. Release transport is intercepted; apply/restart are real.
import assert from 'node:assert/strict';
import { _electron } from 'playwright-core';
import { extractAll, createPackageWithOptions, uncache } from '@electron/asar';
import { cp, readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
assert.equal(process.platform,'win32');
// Node launched by pwsh inherits its module path; children use Windows PowerShell 5.1.
for (const key of Object.keys(process.env)) if (key.toLowerCase()==='psmodulepath') delete process.env[key];
process.env.PSModulePath=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','Modules');
const evidence=resolve('test-results/file-update');
await mkdir(evidence,{recursive:true});
const work=join(process.env.RUNNER_TEMP,'PORTUS Atualização de Arquivos');
const installed=join(work,'Installed App');
const targetRoot=join(work,'Target App');
const unpacked=join(work,'asar-source');
await mkdir(work,{recursive:true});
await cp(resolve('release/win-unpacked'),installed,{recursive:true});
// Hosted runners run as admin. Model the ownership of a normal per-user installation.
execFileSync('powershell.exe',['-NoProfile','-Command',"$acl=Get-Acl -LiteralPath $env:PORTUS_TEST_INSTALL; $acl.SetOwner([Security.Principal.WindowsIdentity]::GetCurrent().User); Set-Acl -LiteralPath $env:PORTUS_TEST_INSTALL -AclObject $acl"],{env:{...process.env,PORTUS_TEST_INSTALL:installed},stdio:'inherit'});
await cp(installed,targetRoot,{recursive:true});
let target;
const sourceArchive=join(targetRoot,'resources','app.asar');
extractAll(sourceArchive,unpacked);
const pkg=JSON.parse(await readFile(join(unpacked,'package.json'),'utf8'));
const baseline=pkg.version;
const parts=baseline.split('.').map(Number); parts[2]++; target=parts.join('.');
pkg.version=target;
await writeFile(join(unpacked,'package.json'),JSON.stringify(pkg));
await writeFile(join(unpacked,'dist','main','index.js'),`\nconsole.log('[PORTUS_FILE_UPDATE_TEST] ${target}');\nrequire('./logger').logInfo('updates:smoke','[PORTUS_FILE_UPDATE_TEST] ${target}');\n`,{flag:'a'});
await rm(sourceArchive);
await rm(`${sourceArchive}.unpacked`,{recursive:true,force:true});
await createPackageWithOptions(unpacked,sourceArchive,{unpack:'**/*.{node,dll}'});
const zip=join(work,`PORTUS-Update-${target}-x64.zip`);
execFileSync(process.execPath,['scripts/package-update.mjs',targetRoot,target,zip],{stdio:'inherit'});
const sha256=createHash('sha256').update(await readFile(zip)).digest('hex');
const url=`https://github.com/lenixeduardo/portus/releases/download/v${target}/PORTUS-Update-${target}-x64.zip`;
const release={tag_name:`v${target}`,draft:false,prerelease:false,assets:[{name:`PORTUS-Update-${target}-x64.zip`,browser_download_url:url,digest:`sha256:${sha256}`}]};
const executable=join(installed,'Portus.exe');
const executableHash=createHash('sha256').update(await readFile(executable)).digest('hex');
await writeFile(join(installed,'client-preserve.txt'),'client data stays');
let app;
const events=[];
const record=(step,details={})=>{events.push({step,...details});console.log(JSON.stringify(events.at(-1)));};
async function wait(check,description,timeout=180000){const end=Date.now()+timeout;while(Date.now()<end){try {if(await check())return;}catch{} await new Promise(r=>setTimeout(r,1000));}throw new Error(`Timeout: ${description}`);}
try {
 app=await _electron.launch({executablePath:executable,timeout:90000,env:{...process.env,NODE_ENV:'production'}});
 await app.evaluate(({net},{release,url,zip})=>{
  const fs=require('node:fs');
  net.fetch=async(input)=>{
   const address=String(input);
   if(address.endsWith('/releases/latest'))return new Response(JSON.stringify(release));
   if(address===url)return new Response(fs.readFileSync(zip));
   throw new Error(`Unexpected update request: ${address}`);
  };
 },{release,url,zip});
 const page=await app.firstWindow();
 await page.waitForFunction(()=>window.api?.updates);
 // Initial real release lookup may have completed before interception. Reopen the renderer to check on startup.
 await page.reload();
 await page.getByRole('heading',{name:'Atualização disponível',exact:true}).waitFor({timeout:90000});
 await page.screenshot({path:join(evidence,'01-file-package-offered.png')});
 record('offered',{baseline,target,transport:'intercepted-unpublished-release'});
 const userData=await app.evaluate(({app})=>app.getPath('userData'));
 await writeFile(join(userData,'update-test-settings.json'),'preserved settings');
 await page.getByRole('button',{name:'Baixar atualização',exact:true}).click();
 await page.getByRole('button',{name:'Aplicar e reiniciar',exact:true}).waitFor({timeout:180000});
 await page.screenshot({path:join(evidence,'02-ready-to-apply-files.png')});
 record('zip-downloaded');
 let closed=false;app.once('close',()=>{closed=true;});
 await page.getByRole('button',{name:'Aplicar e reiniciar',exact:true}).click({noWaitAfter:true});
 await wait(()=>closed,'app closes after ZIP verification');
 app=undefined;
 const sessions=await readdir(join(userData,'updates'));
 const downloadSession=join(userData,'updates',sessions[0]);
 const attempts=(await readdir(downloadSession)).filter(name=>name.startsWith('apply-'));
 const session=join(installed,'.portus-update-work',attempts[0].slice('apply-'.length));
 await wait(async()=>await readFile(join(session,'completed'),'utf8')===target,'files applied and restart launched');
 const log=await readFile(join(session,'apply.log'),'utf8');
 await writeFile(join(evidence,'apply.log'),log);
 assert.match(log,/APPLIED/);
 assert.equal(createHash('sha256').update(await readFile(executable)).digest('hex'),executableHash,'unchanged runtime stays identical');
 assert.equal(await readFile(join(installed,'client-preserve.txt'),'utf8'),'client data stays');
 assert.equal(await readFile(join(userData,'update-test-settings.json'),'utf8'),'preserved settings');
 const date=new Date().toISOString().slice(0,10);
 await wait(async()=> (await readFile(join(userData,'logs',`portus-${date}.log`),'utf8')).includes(`[PORTUS_FILE_UPDATE_TEST] ${target}`),'new code actually runs after restart');
 record('files-applied-and-automatically-restarted',{target,executable,runtimeUnchanged:true,userSettingsPreserved:true});
 execFileSync('taskkill',['/F','/IM','Portus.exe'],{stdio:'inherit'});
 uncache(join(installed,'resources','app.asar'));
 app=await _electron.launch({executablePath:executable,timeout:90000,env:{...process.env,NODE_ENV:'production'}});
 assert.equal(await app.evaluate(({app})=>app.getVersion()),target);
 await (await app.firstWindow()).screenshot({path:join(evidence,'03-updated-app-open.png')});
 record('reopened-new-version',{target});
 await writeFile(join(evidence,'result.json'),JSON.stringify({passed:true,events},null,2));
} catch(error){
 try {for(const dir of await readdir(join(installed,'.portus-update-work'))){for(const name of ['apply.log','failed']){try{await cp(join(installed,'.portus-update-work',dir,name),join(evidence,`${dir}-${name}`));}catch{}}}}catch{}
 await writeFile(join(evidence,'result.json'),JSON.stringify({passed:false,error:error.stack,events},null,2));throw error;}
finally{await app?.close().catch(()=>{});}
