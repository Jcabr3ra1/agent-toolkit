import path from "node:path";
import { createRequire } from "node:module";
import fs from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InitializeRequestSchema, ListToolsRequestSchema, CallToolRequestSchema, McpError, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import {
  MEMORY_READ_TOOLS, MEMORY_TOOL_SCHEMAS, MEMORY_MCP_LIMITS, MemoryMcpError,
  loadMemoryPolicy, recheckMemoryRoot, validateMemoryCall, recheckMemoryEntries, checkMemoryResult
} from "./memory-mcp-policy.js";
import { MemoryMcpTransport } from "./memory-mcp-transport.js";

const require = createRequire(import.meta.url);
const codeOf = error => error instanceof MemoryMcpError ? error.code : "RG_BACKEND_ERROR";
const resultText = r => r?.structuredContent?.content ?? r?.content?.filter(b => b.type === "text").map(b => b.text).join("\n");

/** Runtime never resolves a package from npx, cwd, the manifest or client input. */
export function createFilesystemBackend(root, onFatal) {
  const manifest = require.resolve("@modelcontextprotocol/server-filesystem/package.json");
  const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
  if (pkg.version !== "2026.8.31" || pkg.bin?.["mcp-server-filesystem"] !== "dist/index.js") throw new MemoryMcpError("RG_BACKEND_VERSION", true);
  const client = new Client({ name: "project-memory-guard-backend", version: "0.1.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [path.join(path.dirname(manifest), "dist/index.js"), root], cwd: path.dirname(manifest),
    stderr: "pipe", maxBufferSize: MEMORY_MCP_LIMITS.responseBytes });
  // Drain, never print the child's paths, stack traces or payloads.
  transport.stderr.resume();
  let closing = false;
  client.onerror = () => { if (!closing) onFatal("RG_BACKEND_PROTOCOL"); };
  client.onclose = () => { if (!closing) onFatal("RG_BACKEND_CLOSED"); };
  client.fallbackRequestHandler = async () => { onFatal("RG_BACKEND_CALLBACK"); throw new McpError(-32601, "RG_BACKEND_CALLBACK"); };
  client.fallbackNotificationHandler = async () => { onFatal("RG_BACKEND_PROTOCOL"); };
  return {
    start: () => client.connect(transport, { timeout: MEMORY_MCP_LIMITS.timeoutMs }),
    listTools: () => client.listTools(undefined, { timeout: MEMORY_MCP_LIMITS.timeoutMs }),
    call: (name, args) => client.callTool({ name, arguments: args }, undefined, { timeout: MEMORY_MCP_LIMITS.timeoutMs }),
    async close() { closing = true; try { await client.close(); } finally { await transport.close(); } },
    get pid() { return transport.pid; }
  };
}

/** Only the trusted programmatic test context can replace a backend. No CLI/RPC selector exists. */
export async function createMemoryGateway(manifestPath, context = {}) {
  const policy = await loadMemoryPolicy(manifestPath, context);
  let closed = false, busy = false, closePromise, cleanupError, backend;
  const timeout = context.timeoutMs ?? MEMORY_MCP_LIMITS.timeoutMs;
  const requestClose = () => {
    closed = true;
    return closePromise ??= Promise.resolve().then(() => backend?.close())
      .catch(() => { cleanupError = new MemoryMcpError("RG_CLOSE_FAILED", true); });
  };
  const close = async () => { await requestClose(); if (cleanupError) throw cleanupError; };
  const fatal = () => { void requestClose(); };
  backend = (context.backendFactory ?? createFilesystemBackend)(policy.root, fatal);
  const active = () => { if (closed) throw new MemoryMcpError("RG_SESSION_CLOSED", true); };
  async function deadline(work, signal) {
    active(); let timer, aborted;
    const stop = code => { fatal(); return new MemoryMcpError(code, true); };
    if (signal?.aborted) throw stop("RG_CANCELLED");
    try {
      const limit = new Promise((_, reject) => {
        timer = setTimeout(() => reject(stop("RG_TIMEOUT")), timeout);
        aborted = () => reject(stop("RG_CANCELLED"));
        if (signal?.aborted) aborted(); else signal?.addEventListener("abort", aborted, { once: true });
      });
      const value = await Promise.race([Promise.resolve().then(() => {
        if (signal?.aborted) throw stop("RG_CANCELLED"); active(); return work();
      }), limit]); active(); return value;
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", aborted); }
  }
  async function scope() {
    await recheckMemoryRoot(policy, context);
    const r = await backend.call("list_allowed_directories", {});
    if (r?.isError || resultText(r) !== "Allowed directories:\n" + policy.root) throw new MemoryMcpError("RG_BACKEND_SCOPE", true);
  }
  let tools;
  try {
    await deadline(async () => {
      await backend.start(); await scope();
      const catalog = await backend.listTools();
      const map = new Map(catalog.tools?.map(t => [t.name, t]));
      if (!Array.isArray(catalog.tools) || map.size !== catalog.tools.length) throw new MemoryMcpError("RG_BACKEND_CATALOG", true);
      tools = MEMORY_READ_TOOLS.map(name => {
        const tool = map.get(name), expected = MEMORY_TOOL_SCHEMAS[name];
        if (tool?.annotations?.readOnlyHint !== true || tool.inputSchema?.type !== "object" ||
          (expected.required ?? []).some(key => !tool.inputSchema?.properties?.[key]) ||
          (tool.inputSchema?.required ?? []).some(key => !(expected.required ?? []).includes(key)))
          throw new MemoryMcpError("RG_BACKEND_CATALOG", true);
        for (const [key, schema] of Object.entries(expected.properties)) {
          const upstream = tool.inputSchema.properties?.[key];
          if (!upstream || schema.type && !(upstream.type === schema.type || schema.type === "integer" && upstream.type === "number") ||
            schema.items && upstream.items?.type !== "string" ||
            schema.enum && upstream.enum && schema.enum.some(value => !upstream.enum.includes(value)))
            throw new MemoryMcpError("RG_BACKEND_CATALOG", true);
        }
        return { name, description: `Lectura limitada: ${name}. Raíz fijada por el manifiesto.`,
          inputSchema: structuredClone(expected), annotations: { readOnlyHint: true, openWorldHint: false } };
      });
      await recheckMemoryRoot(policy, context);
    }, context.signal);
  } catch (error) { await close(); throw error instanceof MemoryMcpError ? error : new MemoryMcpError("RG_BACKEND_START", true); }
  async function operation(work, signal) {
    active(); if (busy) throw new MemoryMcpError("RG_BUSY"); busy = true;
    try { return await deadline(work, signal); }
    catch (error) { if (!(error instanceof MemoryMcpError) || error.fatal) await close(); throw error instanceof MemoryMcpError ? error : new MemoryMcpError("RG_BACKEND_ERROR", true); }
    finally { busy = false; }
  }
  return Object.freeze({
    root: policy.root,
    get closed() { return closed; },
    get backendPid() { return backend.pid; },
    close,
    listTools: signal => operation(async () => { await scope(); return structuredClone(tools); }, signal),
    call: (name, args, signal) => operation(async () => {
      await recheckMemoryRoot(policy, context);
      const checked = await validateMemoryCall(policy, name, args, context);
      await scope();
      const raw = name === "list_allowed_directories"
        ? { content: [{ type: "text", text: "Allowed directories:\n" + policy.root }] }
        : await backend.call(name, checked.args);
      // Filesystem encodes per-file failures as text in a successful batch.
      // Do not report that partial result as a successful read or relay its raw errors.
      if (name === "read_multiple_files" && checked.args.paths.some(file => resultText(raw)?.includes(file + ": Error -")))
        throw new MemoryMcpError("RG_BACKEND_ERROR");
      const result = checkMemoryResult(raw, name === "read_media_file" ? checked.snapshots.map(s => s.path) : []);
      await recheckMemoryEntries(checked.snapshots, context); await recheckMemoryRoot(policy, context);
      return result;
    }, signal)
  });
}

export async function runMemoryMcp(manifestPath, context = {}) {
  const gateway = await createMemoryGateway(manifestPath, context);
  let resolveEnd, initialized = false;
  const ended = new Promise(resolve => { resolveEnd = resolve; });
  const server = new Server({ name: "project-memory-guard", version: "0.1.0" }, { capabilities: { tools: {} } });
  const transport = new MemoryMcpTransport(context.stdin ?? process.stdin, context.stdout ?? process.stdout,
    { onClose: resolveEnd, onFatal: () => { void gateway.close().catch(() => {}); } });
  const protocolError = code => new McpError(-32602, code);
  server.setRequestHandler(InitializeRequestSchema, request => {
    if (initialized) throw protocolError("RG_ALREADY_INITIALIZED");
    if (!SUPPORTED_PROTOCOL_VERSIONS.includes(request.params.protocolVersion)) throw protocolError("RG_PROTOCOL_UNSUPPORTED");
    initialized = true;
    return { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "project-memory-guard", version: "0.1.0" } };
  });
  server.setRequestHandler(ListToolsRequestSchema, async (_, extra) => {
    if (!initialized) throw protocolError("RG_NOT_INITIALIZED");
    try { return { tools: await gateway.listTools(extra.signal) }; }
    catch (error) { throw protocolError(codeOf(error)); }
  });
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (!initialized) throw protocolError("RG_NOT_INITIALIZED");
    if (request.params.task) throw protocolError("RG_INPUT_INVALID");
    try { return await gateway.call(request.params.name, request.params.arguments ?? {}, extra.signal); }
    catch (error) { return { isError: true, content: [{ type: "text", text: codeOf(error) }] }; }
  });
  server.onerror = () => { void transport.close(); };
  server.onclose = () => { void gateway.close().catch(() => {}); };
  const abort = () => { void transport.close(); };
  context.signal?.addEventListener("abort", abort, { once: true });
  try {
    if (context.signal?.aborted) throw new MemoryMcpError("RG_CANCELLED");
    await server.connect(transport); await ended;
  } finally { context.signal?.removeEventListener("abort", abort); await gateway.close(); await server.close(); }
}
