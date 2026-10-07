import { decode, parseEventJson, fail } from "./client-output-json.js";

/** S2 protocol is synthetic and versioned separately; raw data is discarded. */
export function createSupervisedProtocol(limits) {
  let bytes = 0, events = 0, pending = Buffer.alloc(0), state = "initial";
  function line(input) {
    if (state === "terminal") fail("supervised-after-terminal");
    if (++events > limits.maxEvents) fail("supervised-event-limit");
    const e = parseEventJson(decode(input.at(-1) === 13 ? input.subarray(0, -1) : input));
    if (e.s !== 2) fail("supervised-invalid-event");
    const keys = Object.keys(e).sort().join(",");
    if (e.type === "start" && state === "initial" && keys === "s,type") state = "running";
    else if (e.type === "data" && state === "running" && keys === "s,text,type" && typeof e.text === "string") { /* No capture retained. */ }
    else if (e.type === "end" && state === "running" && keys === "ok,s,type" && e.ok === true) state = "terminal";
    else fail("supervised-forbidden-event");
  }
  return Object.freeze({
    push(chunk) {
      bytes += chunk.length;
      if (bytes > limits.maxOutputBytes) fail("supervised-output-limit");
      let start = 0;
      for (let i = 0; i < chunk.length; i++) if (chunk[i] === 10) {
        const size = pending.length + i - start;
        if (size > limits.maxLineBytes) fail("supervised-line-limit");
        line(Buffer.concat([pending, chunk.subarray(start, i)], size));
        pending = Buffer.alloc(0); start = i + 1;
      }
      if (pending.length + chunk.length - start > limits.maxLineBytes) fail("supervised-line-limit");
      pending = Buffer.concat([pending, chunk.subarray(start)]);
    },
    finish() {
      if (pending.length) fail("supervised-unterminated-line");
      if (state !== "terminal") fail("supervised-incomplete-protocol");
    },
    counts: () => ({ stdoutBytes: bytes, events, retainedLineBytes: pending.length })
  });
}
