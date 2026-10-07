import { decode, parseEventJson, fail } from "./client-output-json.js";

/** Bounded byte-framed fixture protocol, not a parser for any AI client. */
export function createFixtureProtocol(limits) {
  let bytes = 0, events = 0, pending = Buffer.alloc(0), state = "initial";
  const line = input => {
    if (state === "terminal") fail("fixture-after-terminal");
    if (++events > limits.maxEvents) fail("fixture-event-limit");
    const text = decode(input.at(-1) === 13 ? input.subarray(0, -1) : input);
    const event = parseEventJson(text);
    if (event.v !== 1 || typeof event.type !== "string") fail("fixture-invalid-event");
    const keys = Object.keys(event).sort().join(",");
    if (event.type === "start" && state === "initial" && keys === "type,v") state = "running";
    else if (event.type === "data" && state === "running" && keys === "text,type,v" && typeof event.text === "string") { /* Discard private payload. */ }
    else if (event.type === "end" && state === "running" && keys === "ok,type,v" && event.ok === true) state = "terminal";
    else fail("fixture-forbidden-event");
  };
  return {
    push(chunk) {
      bytes += chunk.length;
      if (bytes > limits.maxOutputBytes) fail("fixture-output-limit");
      let start = 0;
      for (let i = 0; i < chunk.length; i++) if (chunk[i] === 10) {
        const size = pending.length + i - start;
        if (size > limits.maxLineBytes) fail("fixture-line-limit");
        line(Buffer.concat([pending, chunk.subarray(start, i)], size));
        pending = Buffer.alloc(0); start = i + 1;
      }
      const tail = chunk.subarray(start);
      if (pending.length + tail.length > limits.maxLineBytes) fail("fixture-line-limit");
      pending = Buffer.concat([pending, tail]);
    },
    finish() {
      if (pending.length) fail("fixture-unterminated-line");
      if (state !== "terminal") fail("fixture-incomplete-protocol");
    },
    counts: () => ({ stdoutBytes: bytes, events, retainedLineBytes: pending.length })
  };
}
