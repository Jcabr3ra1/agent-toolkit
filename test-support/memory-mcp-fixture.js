import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MEMORY_READ_TOOLS, MEMORY_TOOL_SCHEMAS } from "../src/memory-mcp-policy.js";

export async function memoryFixture(t) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "memory-mcp-test-")));
  const owner = await fs.lstat(base);
  t.after(async () => {
    const s = await fs.lstat(base).catch(() => null);
    if (s?.isDirectory() && !s.isSymbolicLink() && s.dev === owner.dev && s.ino === owner.ino) await fs.rm(base, { recursive: true });
  });
  const root = path.join(base, "vault"), source = path.join(base, "source"), manifestPath = path.join(base, "project-memory.json");
  await fs.mkdir(root, { mode: 0o700 }); await fs.mkdir(source, { mode: 0o700 });
  const manifest = { schemaVersion: "1.0.0", project: { id: "demo-memory", name: "Demo memory" },
    source: { repositoryPath: source, defaultBranch: "main" },
    memory: { vaultPath: "vault", mcpServerName: "demo-memory", repositoryBranch: "main", syncMode: "none" },
    agents: [{ id: "codex", enabled: true, skillName: "demo-memory" }],
    security: { mcpAccess: "read-only", sensitiveDataPolicy: "forbidden", writeRequiresExplicitAuthorization: true, allowCredentialsInMemory: false } };
  const save = async value => { await fs.writeFile(manifestPath, JSON.stringify(value ?? manifest), { mode: 0o600 }); };
  const put = async (name, data = "Fixture note.\n") => {
    const file = path.join(root, name); await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(file, data, { mode: 0o600 }); return file;
  };
  await save(); const note = await put("notes/state.md");
  return { base, root, source, manifest, manifestPath, save, put, note };
}

export function fakeMemoryBackend(root, options = {}) {
  const log = { starts: 0, closes: 0, calls: [], catalogs: 0 };
  const backend = {
    async start() { log.starts++; await options.start?.(); },
    async listTools() {
      log.catalogs++;
      return { tools: options.tools ?? MEMORY_READ_TOOLS.map(name => ({ name, inputSchema: MEMORY_TOOL_SCHEMAS[name], annotations: { readOnlyHint: true } })) };
    },
    async call(name, args) {
      log.calls.push({ name, args });
      if (name === "list_allowed_directories") return { content: [{ type: "text", text: "Allowed directories:\n" + (options.scope ?? root) }] };
      return await options.call?.(name, args) ?? { content: [{ type: "text", text: "Fixture response." }] };
    },
    async close() { log.closes++; await options.close?.(); }
  };
  return { backend, log };
}
