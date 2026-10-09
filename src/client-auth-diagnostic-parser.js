import Ajv2020 from "ajv/dist/2020.js";
import { createHash } from "node:crypto";
import { types } from "node:util";
import { copyInertJson, copyBytes } from "./client-output-json.js";

export const AUTH_DIAGNOSTIC_ID = "https://agent-toolkit.local/schemas/agent-client-auth-diagnostic.schema.json";
const ENUMS = Object.freeze({ authMethod: Object.freeze(["none","claude.ai","oauth_token","api_key","api_key_helper","third_party"]), subscriptionType: Object.freeze(["pro","max","team","enterprise","free"]) });
class ScanFailure extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new ScanFailure(code); };
const white = cp => cp === 32 || cp === 9 || cp === 10 || cp === 13;
const digit = cp => cp >= 48 && cp <= 57;
const utf8Width = cp => cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4;

/** Incremental byte grammar. Discarded values never become strings/objects. */
export function createAuthDiagnosticParser(schema, limits = { maxBytes: 32768, blockBytes: 32768, maxDepth: 32, maxNodes: 20000, maxKeyBytes: 256, maxKeys: 4096 }) {
  const s = copyInertJson(schema), l = copyInertJson(limits);
  if (s.$id !== AUTH_DIAGNOSTIC_ID) throw Error("Unsupported auth diagnostic contract");
  const ajv = new Ajv2020({ strict: true }); ajv.addSchema(s);
  const validLimits = ajv.compile({ $ref: AUTH_DIAGNOSTIC_ID + "#/$defs/parserLimits" });
  const validReport = ajv.compile({ $ref: AUTH_DIAGNOSTIC_ID + "#/$defs/parserReport" });
  if (!validLimits(l) || l.blockBytes > l.maxBytes) throw Error("Invalid auth diagnostic limits");
  const names = ["loggedIn", "authMethod", "subscriptionType"];
  const fields = names.map(name => ({ name, present: false, value: null }));
  let stack = [], root = "start", token = null, bytes = 0, nodes = 0, keys = 0, peakDepth = 0, peakKeyDigests = 0, digests = 0;
  let utfLeft = 0, utfValue = 0, utfMin = 0, error = null, closed = false;

  function item() { if (++nodes > l.maxNodes) fail("auth-node-limit"); }
  function completeValue() {
    if (!stack.length) { root = "end"; return; }
    const f = stack.at(-1); f.items++; f.phase = "comma-or-end"; f.selector = null;
  }
  function beginValue(cp, tag) {
    item();
    const type = cp === 123 ? "object" : cp === 91 ? "array" : cp === 34 ? "string" : cp === 116 || cp === 102 ? "boolean" : cp === 110 ? "null" : cp === 45 || digit(cp) ? "number" : null;
    if (!type) fail("auth-invalid-json");
    if (tag) {
      if (tag.name === "loggedIn" ? type !== "boolean" : tag.name === "authMethod" ? type !== "string" : !["string", "null"].includes(type)) fail("auth-invalid-type");
      tag.present = true;
    }
    if (type === "object" || type === "array") {
      const f = { type, phase: type === "object" ? "key-or-end" : "value-or-end", items: 0, selector: null, tag, keys: new Set() };
      stack.push(f); peakDepth = Math.max(peakDepth, stack.length);
      if (stack.length > l.maxDepth) fail("auth-depth-limit");
    } else if (type === "string") beginString(false, tag);
    else if (type === "number") token = { kind: "number", phase: cp === 45 ? "minus" : cp === 48 ? "zero" : "integer", tag };
    else token = { kind: "literal", word: cp === 116 ? "true" : cp === 102 ? "false" : "null", index: 1, tag };
  }
  function beginString(key, tag) {
    token = { kind: "string", key, tag, escape: false, hexLeft: 0, hex: 0, high: null, needSlash: false, needU: false,
      count: 0, keyBytes: 0, candidates: key ? (stack.length === 1 ? [...names] : []) : tag ? [...ENUMS[tag.name]] : [], digest: key ? createHash("sha256") : null };
  }
  function emitStringCodepoint(t, cp) {
    if (t.key) {
      t.keyBytes += utf8Width(cp); if (t.keyBytes > l.maxKeyBytes) fail("auth-key-bytes-limit");
      // Only names are hashed transiently. No hash or textual decoding of values.
      t.digest.update(Buffer.from(String.fromCodePoint(cp), "utf8"));
      t.candidates = t.candidates.filter(n => t.count < n.length && n.charCodeAt(t.count) === cp);
    }
    if (!t.key && t.tag) t.candidates = t.candidates.filter(n => t.count < n.length && n.charCodeAt(t.count) === cp);
    t.count++; // Unknown values are counted, never concatenated or decoded to text.
  }
  function endString(t) {
    if (t.high !== null) fail("auth-invalid-unicode");
    if (t.key) {
      const f = stack.at(-1), fingerprint = t.digest.digest("hex");
      if (f.keys.has(fingerprint)) fail("auth-duplicate-key");
      if (++keys > l.maxKeys) fail("auth-key-limit");
      f.keys.add(fingerprint); digests++; peakKeyDigests = Math.max(peakKeyDigests, digests);
      const selected = t.candidates.find(n => n.length === t.count);
      f.selector = selected ? fields.find(v => v.name === selected) : null; f.phase = "colon";
    } else {
      if (t.tag) {
        const selected = t.candidates.find(n => n.length === t.count);
        if (!selected) fail("auth-invalid-enum");
        t.tag.value = selected; // A fixed enum label, never an arbitrary input string.
      }
      completeValue();
    }
    token = null;
  }
  function stringChar(cp) {
    const t = token;
    if (t.needSlash) { if (cp !== 92) fail("auth-invalid-unicode"); t.needSlash = false; t.needU = true; return; }
    if (t.needU) { if (cp !== 117) fail("auth-invalid-unicode"); t.needU = false; t.hexLeft = 4; t.hex = 0; return; }
    if (t.hexLeft) {
      const n = cp >= 48 && cp <= 57 ? cp - 48 : cp >= 65 && cp <= 70 ? cp - 55 : cp >= 97 && cp <= 102 ? cp - 87 : -1;
      if (n < 0) fail("auth-invalid-json"); t.hex = t.hex * 16 + n;
      if (--t.hexLeft === 0) {
        const u = t.hex;
        if (t.high !== null) {
          if (u < 0xdc00 || u > 0xdfff) fail("auth-invalid-unicode");
          const value = 0x10000 + (t.high - 0xd800) * 1024 + u - 0xdc00; t.high = null; emitStringCodepoint(t, value);
        } else if (u >= 0xd800 && u <= 0xdbff) { t.high = u; t.needSlash = true; }
        else if (u >= 0xdc00 && u <= 0xdfff) fail("auth-invalid-unicode");
        else emitStringCodepoint(t, u);
      } return;
    }
    if (t.escape) {
      t.escape = false;
      if (cp === 117) { t.hexLeft = 4; t.hex = 0; return; }
      const escaped = { 34: 34, 92: 92, 47: 47, 98: 8, 102: 12, 110: 10, 114: 13, 116: 9 };
      if (!Object.hasOwn(escaped, cp)) fail("auth-invalid-json"); emitStringCodepoint(t, escaped[cp]); return;
    }
    if (cp === 34) endString(t);
    else if (cp === 92) t.escape = true;
    else { if (cp < 32) fail("auth-invalid-json"); emitStringCodepoint(t, cp); }
  }
  function numberChar(cp) {
    const t = token, p = t.phase;
    if (p === "minus") { if (!digit(cp)) fail("auth-invalid-json"); t.phase = cp === 48 ? "zero" : "integer"; return true; }
    if (p === "zero" || p === "integer" || p === "fraction") {
      if (digit(cp)) { if (p === "zero") fail("auth-invalid-json"); return true; }
      if (cp === 46 && p !== "fraction") { t.phase = "dot"; return true; }
      if (cp === 101 || cp === 69) { t.phase = "exponent"; return true; }
      return false;
    }
    if (p === "dot") { if (!digit(cp)) fail("auth-invalid-json"); t.phase = "fraction"; return true; }
    if (p === "exponent") { if (cp === 43 || cp === 45) { t.phase = "exponent-sign"; return true; } if (!digit(cp)) fail("auth-invalid-json"); t.phase = "exponent-digits"; return true; }
    if (p === "exponent-sign") { if (!digit(cp)) fail("auth-invalid-json"); t.phase = "exponent-digits"; return true; }
    if (p === "exponent-digits") return digit(cp);
    fail("auth-invalid-json");
  }
  function closeContainer(cp) {
    const f = stack.at(-1);
    if (cp !== (f.type === "object" ? 125 : 93)) fail("auth-invalid-json");
    digests -= f.keys.size; stack.pop(); completeValue();
  }
  function grammar(cp) {
    if (token) {
      if (token.kind === "string") { stringChar(cp); return; }
      if (token.kind === "literal") {
        const t = token;
        if (cp !== t.word.charCodeAt(t.index++)) fail("auth-invalid-json");
        if (t.index === t.word.length) {
          if (t.tag) t.tag.value = t.word === "null" ? null : t.word === "true";
          token = null; completeValue();
        } return;
      }
      if (numberChar(cp)) return;
      token = null; completeValue(); // Re-process the number's delimiter below.
    }
    if (white(cp)) return;
    if (root === "end") fail("auth-invalid-json");
    if (!stack.length) { if (cp !== 123) fail("auth-root-object-required"); root = "running"; beginValue(cp, null); return; }
    const f = stack.at(-1);
    if (f.phase === "key-or-end" || f.phase === "key-only") {
      if (cp === 125 && f.phase === "key-or-end") { closeContainer(cp); return; }
      if (cp !== 34) fail("auth-invalid-json"); item(); beginString(true, null); return;
    }
    if (f.phase === "colon") { if (cp !== 58) fail("auth-invalid-json"); f.phase = "value"; return; }
    if (f.phase === "value-or-end" && cp === 93) { closeContainer(cp); return; }
    if (f.phase === "value" || f.phase === "value-or-end" || f.phase === "value-only") { beginValue(cp, f.selector); return; }
    if (f.phase === "comma-or-end") {
      if (cp === 44) f.phase = f.type === "object" ? "key-only" : "value-only";
      else closeContainer(cp);
      return;
    }
    fail("auth-invalid-json");
  }
  function byte(b) {
    if (utfLeft) {
      if ((b & 0xc0) !== 0x80) fail("auth-invalid-utf8"); utfValue = utfValue * 64 + (b & 63);
      if (--utfLeft === 0) {
        if (utfValue < utfMin || utfValue > 0x10ffff || utfValue >= 0xd800 && utfValue <= 0xdfff) fail("auth-invalid-utf8");
        grammar(utfValue);
      } return;
    }
    if (b < 128) grammar(b);
    else if (b >= 0xc2 && b <= 0xdf) { utfLeft = 1; utfValue = b & 31; utfMin = 128; }
    else if (b >= 0xe0 && b <= 0xef) { utfLeft = 2; utfValue = b & 15; utfMin = 2048; }
    else if (b >= 0xf0 && b <= 0xf4) { utfLeft = 3; utfValue = b & 7; utfMin = 65536; }
    else fail("auth-invalid-utf8");
  }
  function abandon(e) { error = e instanceof ScanFailure ? e.code : "auth-block-invalid"; stack = []; token = null; digests = 0; }
  function report(final = false) {
    const ok = final && error === null && root === "end";
    const loggedIn = fields[0].value, authMethod = fields[1].value, subscriptionType = fields[2].value;
    const classification = !loggedIn ? "signed-out" : ["api_key", "api_key_helper", "oauth_token", "third_party"].includes(authMethod) || subscriptionType === "free" ? "incompatible" :
      authMethod === "claude.ai" && ["pro", "max", "team", "enterprise"].includes(subscriptionType) ? "compatible-declared" : "unresolved";
    const output = { scope: "auth-diagnostic-provided-bytes", state: ok ? "observed" : error ? "invalid" : "incomplete",
      projection: ok ? { loggedIn, authMethod, subscriptionType, classification } : null,
      nativeExecuted: false, inferenceRequested: false, runtimeReady: false, verifiedAdmission: false, externalBillingVerified: false,
      stats: { bytes, nodes, keys, peakDepth, peakKeyDigests, retainedRawBytes: 0, retainedUnselectedValueTextBytes: 0,
        retainedApprovedScalarCount: fields.filter(f => f.present && f.value !== null).length },
      reason: ok ? "auth-observed" : error ?? "auth-incomplete" };
    if (!validReport(output)) throw Error("Auth parser report invariant failed");
    return output;
  }
  return Object.freeze({
    push(input) {
      if (closed) { abandon(new ScanFailure("auth-closed")); return report(false); }
      if (error) return report(false);
      try {
        if (types.isProxy(input) || !types.isUint8Array(input)) fail("auth-block-invalid");
        const b = copyBytes(input, l.blockBytes); bytes += b.length;
        if (bytes > l.maxBytes) fail("auth-byte-limit");
        for (let i = 0; i < b.length; i++) byte(b[i]);
      } catch (e) { abandon(e); }
      return report(false);
    },
    abort() { if (!closed) abandon(new ScanFailure("auth-aborted")); return report(false); },
    finish(exitCode) {
      if (closed) { abandon(new ScanFailure("auth-closed")); return report(false); }
      closed = true;
      if (!error && (utfLeft || token || stack.length || root !== "end")) abandon(new ScanFailure("auth-truncated"));
      if (!error && (!fields[0].present || !fields[1].present)) abandon(new ScanFailure("auth-required-field"));
      if (!error && exitCode !== (fields[0].value ? 0 : 1)) abandon(new ScanFailure("auth-exit-mismatch"));
      return report(true);
    }
  });
}
