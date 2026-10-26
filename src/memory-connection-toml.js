import { createHash } from "node:crypto";
import { parseTOML } from "toml-eslint-parser";

import { copyBytes, copyInertJson, decode } from "./client-output-json.js";
import {
  MEMORY_CONNECTION_FACTS, MEMORY_CONNECTION_VERSION, freezeMemoryConnectionData
} from "./memory-connection-descriptor.js";
import { containsSensitiveData } from "./sensitive-data.js";

export const MEMORY_CONNECTION_TOML_LIMITS = Object.freeze({
  inputBytes: 1048576, astNodes: 30000, astDepth: 64,
  stringBytes: 4096, args: 16, tools: 256, reportBytes: 65536
});
const FIELDS = new Set(["command", "args", "cwd", "enabled_tools", "enabled"]);
const CONTROL = /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u;
class Rejected extends Error {
  constructor(code, state = "blocked") { super(code); this.code = code; this.state = state; }
}
const reject = (code, state) => { throw new Rejected(code, state); };
const keys = (key) => key.keys.map((part) => part.type === "TOMLBare" ? part.name : part.value);

// Traverse semantic nodes, not cyclic parent links, token text or comments.
// These bounds apply AFTER parsing; they do not sandbox the parser itself.
function boundAst(ast) {
  const stack = [[ast, 0]]; let count = 0;
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (++count > MEMORY_CONNECTION_TOML_LIMITS.astNodes || depth > MEMORY_CONNECTION_TOML_LIMITS.astDepth) {
      reject("MC_TOML_AST_LIMIT");
    }
    for (const [key, value] of Object.entries(node)) {
      if (["parent", "tokens", "comments", "loc", "range"].includes(key)) continue;
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child === "object" && typeof child.type === "string") {
          stack.push([child, depth + 1]);
        }
      } else if (value && typeof value === "object" && typeof value.type === "string") {
        stack.push([value, depth + 1]);
      }
    }
  }
}

function ownTable(ast, name) {
  const matches = [];
  for (const item of ast.body[0].body) {
    if (item.type === "TOMLKeyValue") {
      const path = keys(item.key);
      if (path[0] !== "mcp_servers") continue;
      // A sealed inline/scalar namespace cannot safely accept a future table.
      if (path.length === 1) reject("MC_TOML_NAMESPACE");
      if (path[1] === name) reject("MC_TOML_LAYOUT");
      continue;
    }
    if (item.type !== "TOMLTable" || item.resolvedKey[0] !== "mcp_servers") continue;
    const path = item.resolvedKey;
    if (typeof path[1] === "number") reject("MC_TOML_NAMESPACE");
    if (path.length === 1) {
      if (item.body.some((field) => keys(field.key)[0] === name)) reject("MC_TOML_LAYOUT");
    } else if (path[1] === name) {
      if (path.length !== 2 || item.kind !== "standard") reject("MC_TOML_LAYOUT");
      matches.push(item);
    }
  }
  if (matches.length > 1) reject("MC_TOML_LAYOUT");
  return matches[0] ?? null;
}

function textValue(node) {
  if (node.type !== "TOMLValue" || node.kind !== "string" || typeof node.value !== "string") {
    reject("MC_TOML_FIELD_TYPE");
  }
  const value = node.value;
  if (Buffer.byteLength(value) > MEMORY_CONNECTION_TOML_LIMITS.stringBytes) reject("MC_TOML_STRING_LIMIT");
  if (Buffer.from(value, "utf8").toString("utf8") !== value || CONTROL.test(value)) reject("MC_TOML_FIELD_VALUE");
  if (containsSensitiveData(value)) reject("MC_TOML_SENSITIVE");
  return value;
}

function fieldValue(name, node) {
  if (name === "enabled") {
    if (node.type !== "TOMLValue" || node.kind !== "boolean" || typeof node.value !== "boolean") {
      reject("MC_TOML_FIELD_TYPE");
    }
    return node.value;
  }
  if (name === "args" || name === "enabled_tools") {
    if (node.type !== "TOMLArray") reject("MC_TOML_FIELD_TYPE");
    if (node.elements.length > MEMORY_CONNECTION_TOML_LIMITS[name === "args" ? "args" : "tools"]) {
      reject("MC_TOML_ARRAY_LIMIT");
    }
    return node.elements.map(textValue);
  }
  return textValue(node);
}

/**
 * Inspect caller-provided TOML bytes for one explicit standard MCP table.
 * No file discovery, reads, writes, client launch or public CLI integration.
 * Hash/ranges attest these bytes only, never their origin or a live connection.
 */
export function readMemoryConnectionToml(input, options) {
  let mcpName = null, configurationSha256 = null, byteSyntaxVerified = false;
  const report = (state, server = null, ranges = null, reasons = []) => {
    const result = {
      schemaVersion: MEMORY_CONNECTION_VERSION, state, mcpName, configurationSha256,
      server, ranges, reasons,
      facts: { ...MEMORY_CONNECTION_FACTS, evidence: "provided-bytes", byteSyntaxVerified,
        configurationSourceVerified: false }
    };
    if (Buffer.byteLength(JSON.stringify(result)) > MEMORY_CONNECTION_TOML_LIMITS.reportBytes) {
      reject("MC_TOML_REPORT_LIMIT");
    }
    return freezeMemoryConnectionData(result);
  };
  try {
    let opts;
    try { opts = copyInertJson(options); } catch { reject("MC_TOML_OPTIONS", "invalid"); }
    if (!opts || Array.isArray(opts) || Object.keys(opts).length !== 1 || !Object.hasOwn(opts, "mcpName") ||
        typeof opts.mcpName !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(opts.mcpName) ||
        ["constructor", "prototype", "__proto__"].includes(opts.mcpName)) reject("MC_TOML_OPTIONS", "invalid");
    mcpName = opts.mcpName;
    let bytes;
    try { bytes = copyBytes(input, MEMORY_CONNECTION_TOML_LIMITS.inputBytes); }
    catch (error) {
      reject(error?.code === "byte-limit" ? "MC_TOML_INPUT_LIMIT" : "MC_TOML_BYTES", "invalid");
    }
    configurationSha256 = createHash("sha256").update(bytes).digest("hex");
    let source;
    try { source = decode(bytes); } catch { reject("MC_TOML_UTF8", "invalid"); }
    if (source.startsWith("\ufeff")) reject("MC_TOML_BOM", "invalid");
    let ast;
    try { ast = parseTOML(source, { tomlVersion: "1.0.0" }); }
    catch { reject("MC_TOML_SYNTAX", "invalid"); }
    byteSyntaxVerified = true;
    boundAst(ast);
    const table = ownTable(ast, mcpName);
    if (!table) return report("absent");
    const server = {}, fields = {};
    for (const field of table.body) {
      const path = keys(field.key);
      if (path.length !== 1 || !FIELDS.has(path[0])) reject("MC_TOML_FIELD");
      const name = path[0];
      server[name] = fieldValue(name, field.value);
      fields[name] = { key: [...field.key.range], value: [...field.value.range] };
    }
    return report("observed", server, { table: [...table.range], fields });
  } catch (error) {
    // Never return parser diagnostics, arbitrary exception messages or source.
    return report(error instanceof Rejected ? error.state : "invalid", null, null,
      [error instanceof Rejected ? error.code : "MC_TOML_INVALID"]);
  }
}
