#!/usr/bin/env node
import { runToolkitCli } from '../src/toolkit-cli.js';
process.exitCode = await runToolkitCli(process.argv.slice(2), { out: t => process.stdout.write(t), err: t => process.stderr.write(t) });
