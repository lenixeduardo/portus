import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function parts(value) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value ?? '');
  const result = match?.slice(1).map(Number);
  if (!result || !result.every(Number.isSafeInteger)) throw new Error('Versão estável inválida.');
  return result;
}
export function nextReleaseVersion(minimum, published) {
  const base = parts(minimum);
  if (!published) return base.join('.');
  const latest = parts(published);
  const difference = base.findIndex((n, i) => n !== latest[i]);
  if (difference >= 0 && base[difference] > latest[difference]) return base.join('.');
  latest[2]++;
  return parts(latest.join('.')).join('.');
}
export async function writeReleaseVersion(root, version) {
  parts(version);
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  pkg.version = lock.version = lock.packages[''].version = version;
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  await writeFile(join(root, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
}
export async function readPublishedVersion(request = fetch) {
  const response = await request('https://api.github.com/repos/lenixeduardo/portus/releases/latest', {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PORTUS-release',
      ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) },
    signal: AbortSignal.timeout(30_000), cache: 'no-store'
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Não foi possível consultar Releases: HTTP ${response.status}`);
  const release = await response.json();
  parts(release.tag_name);
  return release.tag_name;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const version = nextReleaseVersion(pkg.version, await readPublishedVersion());
  await writeReleaseVersion(root, version);
  await writeFile(join(root, 'release-version.json'), JSON.stringify({ version, commit: process.env.GITHUB_SHA }) + '\n');
  console.log(`Versão do instalador e da Release: ${version}`);
}
