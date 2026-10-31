import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { resolvePackageLock } from '../src/package-lock-path.js';

test('package lock uses root first, packaged fallback only on ENOENT', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'toolkit-lock-'));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  const source = path.join(root, 'package-lock.json');
  const fallback = path.join(root, 'assets/runtime/package-lock.json');
  await fs.mkdir(path.dirname(fallback), {recursive:true});
  await fs.writeFile(fallback, '{}');
  assert.equal(await resolvePackageLock(root), fallback);
  await fs.writeFile(source, '{}');
  assert.equal(await resolvePackageLock(root), source);
  await assert.rejects(resolvePackageLock(root, {lstat: async () => { throw Object.assign(new Error('denied'), {code:'EACCES'}); }}), {code:'EACCES'});
});

test('prepack lock copy matches the root lock byte for byte', async () => {
  const copy = new URL('../assets/runtime/package-lock.json', import.meta.url);
  // A clean development checkout has no generated copy until its first pack.
  try { await fs.access(copy); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await import('../scripts/prepare-package.js');
  }
  assert.deepEqual(await fs.readFile(copy), await fs.readFile(new URL('../package-lock.json', import.meta.url)));
});
