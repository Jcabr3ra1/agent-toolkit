import { types } from "node:util";

// Limits apply before interpreting metadata. Never invoke getters or toJSON.
export function copyInertJson(value) {
  const ancestors = new Set(); let nodes = 0; let bytes = 0;
  const count = (s) => { bytes += Buffer.byteLength(s); if (bytes > 2_000_000) fail("metadata-limit"); };
  function visit(v, depth) {
    if (++nodes > 30_000 || depth > 64) fail("metadata-limit");
    if (typeof v === "string") { count(v); return v; }
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v !== "object" || types.isProxy(v) || ancestors.has(v)) fail("non-json-metadata");
    const array = Array.isArray(v);
    if (array && v.length > 256) fail("metadata-limit");
    if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail("non-json-metadata");
    if (Object.getOwnPropertySymbols(v).length) fail("non-json-metadata");
    const keys = Object.getOwnPropertyNames(v).filter((key) => !array || key !== "length");
    if (keys.length > 30_000) fail("metadata-limit");
    if (array && (keys.length !== v.length || keys.some((k, i) => k !== String(i)))) fail("non-json-metadata");
    ancestors.add(v); const result = array ? [] : {};
    for (const key of keys) {
      if (["__proto__", "constructor", "prototype"].includes(key)) fail("unsafe-json-key");
      const d = Object.getOwnPropertyDescriptor(v, key);
      if (!d.enumerable || !("value" in d)) fail("non-json-metadata");
      count(key); result[key] = visit(d.value, depth + 1);
    }
    ancestors.delete(v); return result;
  }
  return visit(value, 0);
}

// Read only genuine strings or byte arrays, without custom conversion hooks.
export function copyBytes(value, maxBytes) {
  if (typeof value === "string") {
    if (value.length > maxBytes) fail("byte-limit");
    const bytes = Buffer.from(value, "utf8");
    if (bytes.length > maxBytes) fail("byte-limit");
    if (decode(bytes) !== value) fail("invalid-unicode");
    return bytes;
  }
  if (!value || typeof value !== "object" || types.isProxy(value) || !types.isUint8Array(value)) fail("invalid-byte-input");
  if (![Uint8Array.prototype, Buffer.prototype].includes(Object.getPrototypeOf(value))) fail("invalid-byte-input");
  const typedProto = Object.getPrototypeOf(Uint8Array.prototype);
  const length = Object.getOwnPropertyDescriptor(typedProto, "length").get.call(value);
  if (length > maxBytes) fail("byte-limit");
  const bytes = Buffer.alloc(length);
  Uint8Array.prototype.set.call(bytes, value);
  return bytes;
}

export function decode(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { fail("invalid-utf8"); }
}

// Small strict JSON decoder: JSON.parse alone silently overwrites duplicate keys.
// Strings use JSON.parse only for escape decoding, not whole event objects.
export function parseEventJson(text) {
  let i = 0; let nodes = 0;
  const whitespace = () => { while (/[ \t\r\n]/.test(text[i] ?? "x")) i++; };
  function string() {
    const start = i++; let closed = false;
    while (i < text.length) {
      if (text[i] === "\\") { i += 2; continue; }
      if (text[i++] === '"') { closed = true; break; }
    }
    if (!closed) fail("invalid-json");
    let decoded;
    try { decoded = JSON.parse(text.slice(start, i)); } catch { fail("invalid-json"); }
    if (Buffer.from(decoded, "utf8").toString("utf8") !== decoded) fail("invalid-unicode");
    return decoded;
  }
  function value(depth) {
    if (++nodes > 30_000 || depth > 64) fail("event-json-limit");
    whitespace(); const c = text[i];
    if (c === '"') return string();
    if (c === "{" || c === "[") {
      const object = c === "{"; const result = object ? Object.create(null) : [];
      const end = object ? "}" : "]"; const keys = new Set(); i++; whitespace();
      if (text[i] === end) { i++; return result; }
      while (i < text.length) {
        let key;
        if (object) {
          if (text[i] !== '"') fail("invalid-json"); key = string(); whitespace();
          if (keys.has(key)) fail("duplicate-json-key"); keys.add(key);
          if (["__proto__", "constructor", "prototype"].includes(key)) fail("unsafe-json-key");
          if (text[i++] !== ":") fail("invalid-json");
        }
        const item = value(depth + 1);
        if (object) result[key] = item; else { if (result.length >= 256) fail("event-json-limit"); result.push(item); }
        whitespace(); if (text[i] === end) { i++; return result; }
        if (text[i++] !== ",") fail("invalid-json"); whitespace();
      }
      fail("invalid-json");
    }
    for (const [word, v] of [["true", true], ["false", false], ["null", null]]) {
      if (text.startsWith(word, i)) { i += word.length; return v; }
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if (!match) fail("invalid-json"); i += match[0].length;
    const number = Number(match[0]); if (!Number.isFinite(number)) fail("non-finite-json-number");
    // Do not turn fractional/underflowing token counts into apparently safe integers.
    const [mantissa, exponent = "0"] = match[0].split(/[eE]/);
    const digits = mantissa.replace(/[-.]/g, "");
    if (number === 0 && /[1-9]/.test(digits)) fail("json-number-precision-loss");
    const scale = Number(exponent) - (mantissa.split(".")[1]?.length ?? 0);
    if (Number.isInteger(number) && scale < 0 && /[1-9]/.test(digits.slice(Math.max(0, digits.length + scale)))) fail("json-number-precision-loss");
    return number;
  }
  const result = value(0); whitespace();
  if (i !== text.length || !result || Array.isArray(result) || typeof result !== "object") fail("invalid-event-object");
  return result;
}

export function fail(code) { throw new ParseFailure(code); }
export class ParseFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}
