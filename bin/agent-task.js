#!/usr/bin/env node

import { runTaskCli } from "../src/task-cli.js";

const write = (stream, text) => new Promise((resolve, reject) => stream.write(text, error => error ? reject(error) : resolve()));
// Catch stream errors such as EPIPE without a raw stack or a retry.
process.stdout.on("error", () => {});
process.stderr.on("error", () => {});
process.exitCode = await runTaskCli(process.argv.slice(2), {
  out: text => write(process.stdout, text),
  err: text => write(process.stderr, text)
});
