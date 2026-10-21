import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nextReleaseVersion, writeReleaseVersion, readPublishedVersion } from '../prepare-release-version.mjs';

test('first release uses the minimum version; subsequent builds always advance numerically', () => {
  assert.equal(nextReleaseVersion('0.1.35', null), '0.1.35');
  assert.equal(nextReleaseVersion('0.1.35', 'v0.1.9'), '0.1.35');
  assert.equal(nextReleaseVersion('0.1.35', 'v0.1.35'), '0.1.36');
  assert.equal(nextReleaseVersion('0.1.35', 'v0.1.99'), '0.1.100');
  assert.equal(nextReleaseVersion('0.1.35', 'v0.2.1'), '0.2.2');
  assert.throws(() => nextReleaseVersion('0.1.35', 'bad'));
});
test('package and both lockfile versions match the release artifact version', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'portus-version-'));
  try {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ version: '0.1.35', name: 'portus' }));
    await writeFile(join(dir, 'package-lock.json'), JSON.stringify({ version: '0.1.35', packages: { '': { version: '0.1.35' }, 'node_modules/demo': { version: '1.0.0' } } }));
    await writeReleaseVersion(dir, '0.1.36');
    const pkg = JSON.parse(await readFile(join(dir, 'package.json')));
    const lock = JSON.parse(await readFile(join(dir, 'package-lock.json')));
    assert.equal(pkg.version, '0.1.36'); assert.equal(lock.version, pkg.version); assert.equal(lock.packages[''].version, pkg.version);
    assert.equal(lock.packages['node_modules/demo'].version, '1.0.0');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('only a 404 represents an empty channel; API and authentication errors stop publication', async () => {
  assert.equal(await readPublishedVersion(async () => new Response('', { status: 404 })), null);
  assert.equal(await readPublishedVersion(async () => new Response(JSON.stringify({ tag_name: 'v0.1.35' }))), 'v0.1.35');
  await assert.rejects(readPublishedVersion(async () => new Response('', { status: 403 })), /403/);
  await assert.rejects(readPublishedVersion(async () => new Response(JSON.stringify({}))), /versão/i);
});
