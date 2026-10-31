import path from 'node:path';

export const IS_WINDOWS = process.platform === 'win32';
let warned = false;
// Windows file ownership/ACLs are enforced by the current user's access token.
// Never emit on stdout: it may be an MCP stream or --json response.
export function warnPlatformPermissions({ platform = process.platform, environment = process.env } = {}) {
  if (platform !== 'win32' || warned || environment.AGENT_TOOLKIT_QUIET_PLATFORM_WARNINGS === '1') return;
  warned = true;
  process.stderr.write('Windows: no se verifican propietario ni modos POSIX; se usan los permisos del usuario.\n');
}

export const toGitPath = value => value.replaceAll('\\', '/');
// Declarative documents may describe another OS; actual file IO still uses
// native paths. Never normalize away traversal, device paths or NTFS streams.
export function isPortableAbsolutePath(value) {
  if (typeof value !== 'string' || !value || /[\x00-\x1f\x7f]/u.test(value)) return false;
  const windows = /^[A-Za-z]:/u.test(value) || (value.startsWith('\\\\') || value.startsWith('//'));
  if (windows) {
    if (/^[\\/]{2}[?.][\\/]/u.test(value) || value.slice(2).includes(':')) return false;
    return path.win32.isAbsolute(value) && toGitPath(path.win32.normalize(value)) === toGitPath(value);
  }
  return path.posix.isAbsolute(value) && path.posix.normalize(value) === value && !value.includes('\\');
}
