// Synthetic diagnostics only: no account, provider, filesystem reads or network.
const mode = process.argv[2], recipe = process.argv[3];
const hang = () => setInterval(() => {}, 1000);
const help = () => process.stdout.write("Usage: claude [options]\n  -p, --print\n  --tools <tools>\n  --model <model>\n  --strict-mcp-config\n");
if (mode === "silent") hang();
else if (mode === "ignore-term") { process.on("SIGTERM", () => {}); hang(); }
else if (mode === "invalid-utf8") process.stdout.write(Buffer.from([0xff]));
else if (mode === "truncated-utf8") process.stdout.write(Buffer.from([0xc3]));
else if (mode === "stdout-overflow") { process.stdout.write(Buffer.alloc(140000, 120)); hang(); }
else if (mode === "stderr-overflow") { process.stderr.write(Buffer.alloc(40000, 120)); hang(); }
else if (mode === "stderr-invalid") process.stderr.write(Buffer.from([0xff]));
else if (mode === "failure") { process.stderr.write("synthetic-private-error"); process.exitCode = 5; }
else if (mode === "junk") process.stdout.write("synthetic-private-token=do-not-save\n");
else if (mode === "environment") {
  const allowed = ["HOME", "TMPDIR", "PATH", "LANG", "LC_ALL", "DISABLE_AUTOUPDATER", "DISABLE_UPDATES", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "ENABLE_CLAUDEAI_MCP_SERVERS", "__CF_USER_TEXT_ENCODING"];
  if (Object.keys(process.env).some(k => !allowed.includes(k))) process.exitCode = 6;
  else if (recipe === "--version") process.stdout.write("0.0.0-demo (Claude Code)\n"); else help();
} else if (mode === "split-utf8") {
  const text = recipe === "--version" ? "\x1b[32m0.0.0-demo (Claude Code)\x1b[0m\n" : "Usage: claude [options]\r\n  -p, --print\r\n  --tools <tools>  descripción á🐣\r\n";
  const b = Buffer.from(text); let i = 0;
  const step = () => { if (i < b.length) { process.stdout.write(b.subarray(i, ++i)); setTimeout(step, 1); } }; step();
} else if (recipe === "--version") process.stdout.write("0.0.0-demo (Claude Code)\n");
else if (recipe === "--help") help();
else process.exitCode = 7;
