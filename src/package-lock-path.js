import fs from 'node:fs/promises';
import path from 'node:path';

// npm excludes the root lock from tarballs. prepack generates this fallback;
// retain the root lock in development and never mask permission or IO errors.
export async function resolvePackageLock(toolkitRoot, io = fs) {
  const rootLock = path.join(toolkitRoot, 'package-lock.json');
  try { await io.lstat(rootLock); return rootLock; }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return path.join(toolkitRoot, 'assets', 'runtime', 'package-lock.json');
  }
}
