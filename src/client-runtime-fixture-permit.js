// Internal trusted-coordinator interface, never populated from model JSON.
// Handles are process-local, nontransferable and consumed before asynchronous checks.
const permits = new WeakMap();
export function createFixturePermit(check, started, bindingSha256 = null) {
  const handle = Object.freeze(Object.create(null));
  permits.set(handle, { check, started, bindingSha256, used: false, live: true });
  return handle;
}
export function revokeFixturePermit(handle) {
  const entry = permits.get(handle); if (entry) entry.live = false;
}
export async function claimFixturePermit(handle, bindingSha256 = null) {
  const entry = permits.get(handle);
  if (!entry || !entry.live || entry.used) throw Error("fixture-permit-unavailable");
  entry.used = true;
  if (entry.bindingSha256 !== bindingSha256) throw Error("fixture-permit-binding-mismatch");
  await entry.check();
  if (!entry.live) throw Error("fixture-permit-unavailable");
  return Object.freeze({ started: entry.started });
}
