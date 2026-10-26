#!/usr/bin/env node

import { runGeminiCli } from "../src/gemini-cli.js";

const write = (stream, text) => new Promise((resolve, reject) => stream.write(text, error => error ? reject(error) : resolve()));
process.stdout.on("error", () => {});
process.stderr.on("error", () => {});
process.exitCode = await runGeminiCli(process.argv.slice(2), {
  out: text => write(process.stdout, text),
  err: text => write(process.stderr, text)
});
