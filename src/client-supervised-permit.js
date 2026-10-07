// Independent S2 capabilities: trusted code only, never JSON or a C2 handle.
const permits = new WeakMap();
export function createSupervisedPermit(binding, claim, started) {
  const h = Object.freeze(Object.create(null));
  permits.set(h, { binding, claim, started, live: true, used: false });
  return h;
}
export function revokeSupervisedPermit(h) { const p = permits.get(h); if (p) p.live = false; }
export async function claimSupervisedPermit(h, binding) {
  const p = permits.get(h);
  if (!p || !p.live || p.used) throw Error("Supervised permit unavailable");
  p.used = true;
  if (p.binding !== binding) throw Error("Supervised permit binding mismatch");
  await p.claim();
  if (!p.live) throw Error("Supervised permit unavailable");
  return Object.freeze({ started: async () => {
    if (!p.live || p.startedUsed) throw Error("Supervised observation unavailable");
    p.startedUsed = true; return p.started();
  } });
}
