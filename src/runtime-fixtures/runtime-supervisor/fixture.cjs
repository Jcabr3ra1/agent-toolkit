// Closed registry of trusted local experiments, not user-supplied programs.
const { spawn } = require("node:child_process");
const path = require("node:path");
const mode = process.argv[2];
const emit = e => process.stdout.write(JSON.stringify({ v: 1, ...e }) + "\n");
const start = () => emit({ type: "start" });
const end = () => emit({ type: "end", ok: true });
const hang = () => setInterval(() => {}, 1000);
process.stdin.on("error", () => {});
if (mode === "blocked-stdin") { start(); hang(); }
else if (mode === "closed-stdin") { process.stdin.pause(); require("node:fs").closeSync(0); hang(); }
else {
  process.stdin.resume();
  process.stdin.on("end", () => {
    if (mode === "silent") return hang();
    start();
    switch (mode) {
      case "success": emit({ type: "data", text: "fixture-private-payload" }); end(); break;
      case "split-utf8": {
        const b = Buffer.from(JSON.stringify({ v: 1, type: "data", text: "á🐣" }) + "\r\n");
        let i = 0; const step = () => { if (i < b.length) { process.stdout.write(b.subarray(i, ++i)); setTimeout(step, 1); } else end(); }; step(); break;
      }
      case "failure": process.stderr.write("fixture-private-error"); process.exitCode = 3; break;
      case "stdout-overflow": process.stdout.write(Buffer.alloc(131072, 120)); hang(); break;
      case "stderr-overflow": process.stderr.write(Buffer.alloc(32768, 120)); hang(); break;
      case "stderr-invalid": process.stderr.write(Buffer.from([0xff])); end(); break;
      case "long-line": process.stdout.write(Buffer.alloc(20000, 120)); hang(); break;
      case "event-overflow": for (let i = 0; i < 30; i++) emit({ type: "data", text: "x" }); end(); break;
      case "invalid-utf8": process.stdout.write(Buffer.from([0xff, 10])); hang(); break;
      case "forbidden-event": emit({ type: "tool", command: "do-not-run" }); hang(); break;
      case "duplicate-json": process.stdout.write('{"v":1,"type":"data","type":"end"}\n'); hang(); break;
      case "after-terminal": end(); emit({ type: "data", text: "late" }); break;
      case "unterminated": process.stdout.write('{"v":1,"type":"end","ok":true}'); break;
      case "incomplete": break;
      case "ignore-term": process.on("SIGTERM", () => {}); hang(); break;
      case "parent-child": case "child-after-parent": {
        const child = spawn(process.execPath, [path.join(__dirname, "child.cjs")], { env: { LANG: "C", LC_ALL: "C" }, stdio: ["ignore", "inherit", "inherit"] });
        child.on("error", () => { process.exitCode = 4; });
        child.on("spawn", () => { if (mode === "child-after-parent") process.exit(0); else hang(); }); break;
      }
      case "environment": {
        // macOS may add this platform text-encoding variable even with an explicit env.
        if (Object.keys(process.env).some(k => !["LANG", "LC_ALL", "__CF_USER_TEXT_ENCODING"].includes(k))) { process.exitCode = 9; break; }
        end(); break;
      }
      default: process.exitCode = 5;
    }
  });
}
