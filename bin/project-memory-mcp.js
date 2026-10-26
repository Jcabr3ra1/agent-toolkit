#!/usr/bin/env node
import path from "node:path";

const args = process.argv.slice(2);
if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
  process.stdout.write("project-memory-mcp --manifest <ruta-absoluta>\nMCP STDIO de lectura con raíz fija. No configura clientes ni ejecuta IA.\n");
} else if (args.length !== 2 || args[0] !== "--manifest" || !path.isAbsolute(args[1])) {
  process.stderr.write("project-memory-mcp: RG_INPUT_INVALID\n"); process.exitCode = 2;
} else {
  const controller = new AbortController(), stop = () => controller.abort();
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  try {
    const { runMemoryMcp } = await import("../src/memory-mcp-server.js");
    await runMemoryMcp(args[1], { signal: controller.signal });
  } catch (error) {
    const code = /^RG_[A-Z_]+$/.test(error?.code ?? "") ? error.code : "RG_START_FAILED";
    process.stderr.write(`project-memory-mcp: ${code}\n`); process.exitCode = 2;
  } finally { process.off("SIGTERM", stop); process.off("SIGINT", stop); }
}
