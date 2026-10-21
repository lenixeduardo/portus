// Same tested win-unpacked output as the installer, distributed as files, never NSIS.
import { readdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = resolve(process.argv[2] || 'release/win-unpacked');
const version = process.argv[3] || JSON.parse(await readFile('package.json','utf8')).version;
const files = [];
async function walk(dir) {
  for (const item of await readdir(dir, {withFileTypes:true})) {
    const path = join(dir,item.name);
    if (item.isSymbolicLink()) throw new Error(`Link is not allowed: ${path}`);
    if (item.isDirectory()) await walk(path);
    else if (item.name !== '.portus-update-manifest.json') {
      files.push({path:relative(root,path).replaceAll('\\','/'),sha256:createHash('sha256').update(await readFile(path)).digest('hex'),size:(await lstat(path)).size});
    }
  }
}
await walk(root);
if (!files.some(f=>f.path === 'Portus.exe') || !files.some(f=>f.path === 'resources/app.asar')) throw new Error('Incomplete application');
await writeFile(join(root,'.portus-update-manifest.json'),JSON.stringify({schema:1,version,files},null,2));
const archive = resolve(process.argv[4] || `release/PORTUS-Update-${version}-x64.zip`);
execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',resolve('build/portus-package-update.ps1'),'-Source',root,'-Destination',archive],{stdio:'inherit'});
console.log(`Update package: ${archive}`);
