import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { runGeminiCli } from "../src/gemini-cli.js";
import { estado, imagen, investigar } from "../src/gemini-tools.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "gemini-tools-"));
after(() => fs.rm(root, { recursive: true, force: true }));
const CONVERSATION = "a142b972-d487-4b75-ac9c-f3d8970787e1";

async function fixture() {
  const directory = await fs.mkdtemp(path.join(root, "case-"));
  const calls = [];
  const brainDirectory = path.join(directory, "brain");
  const ok = (extra = {}) => ({ conversation_id: CONVERSATION, status: "SUCCESS", response: "Respuesta con fuentes https://ejemplo.org", duration_seconds: 1.5, usage: { total_tokens: 100 }, ...extra });
  return { directory, outRoot: path.join(directory, "out"), brainDirectory, calls, ok,
    run: (result, effect = async () => {}) => async (args, cwd, timeout) => { calls.push({ args, cwd, timeout }); await effect(cwd); return result; } };
}

test("a prompt and a model are validated before anything runs", async () => {
  const f = await fixture();
  for (const bad of [{ prompt: "" }, { prompt: "   " }, { prompt: "x".repeat(6_001) }, { prompt: "con \u0000 nulo" }, { prompt: "ok", model: "Modelo Con Espacios; rm -rf" }, { prompt: 7 }]) {
    await assert.rejects(investigar({ ...bad, outRoot: f.outRoot, run: f.run(f.ok()) }), { code: "gemini-tools" });
    await assert.rejects(imagen({ ...bad, outRoot: f.outRoot, run: f.run(f.ok()) }), { code: "gemini-tools" });
  }
  assert.equal(f.calls.length, 0);
  await assert.rejects(fs.access(f.outRoot));
});

test("research runs read-only in a private empty folder and keeps the answer", async () => {
  const f = await fixture();
  const result = await investigar({ prompt: "¿Qué hay de nuevo en Node?", outRoot: f.outRoot, run: f.run(f.ok()) });
  const [call] = f.calls;
  assert.deepEqual(call.args.slice(0, 1), ["-p"]);
  assert.match(call.args[1], /no uses subagentes/u);
  assert.match(call.args[1], /Pregunta: ¿Qué hay de nuevo en Node\?/u);
  assert.deepEqual(call.args.slice(2), ["--model", "gemini-4-argon-medium", "--mode", "plan", "--output-format", "json", "--print-timeout", "600s"]);
  assert.equal(call.cwd, result.directory);
  assert.equal(path.dirname(path.dirname(call.cwd)), f.outRoot);
  assert.equal((await fs.stat(call.cwd)).mode & 0o777, 0o700);
  assert.equal(await fs.readFile(result.files[0], "utf8"), "Respuesta con fuentes https://ejemplo.org");
  assert.equal(JSON.parse(await fs.readFile(path.join(call.cwd, "meta.json"), "utf8")).conversationId, CONVERSATION);
  assert.equal(result.response.includes("fuentes"), true);
  await assert.rejects(investigar({ prompt: "x", outRoot: f.outRoot, run: f.run({ status: "ERROR" }) }), { message: /no completó/u });
});

test("copying a result never overwrites what is already there", async () => {
  const f = await fixture();
  const target = path.join(f.directory, "proyecto", "docs");
  const first = await investigar({ prompt: "a", outRoot: f.outRoot, copyTo: target, run: f.run(f.ok()) });
  assert.deepEqual(first.copied, [path.join(target, "respuesta.md")]);
  await fs.writeFile(path.join(target, "respuesta.md"), "mío\n");
  await assert.rejects(investigar({ prompt: "b", outRoot: f.outRoot, copyTo: target, run: f.run(f.ok()) }), { message: /Ya existe .*respuesta\.md/u });
  assert.equal(await fs.readFile(path.join(target, "respuesta.md"), "utf8"), "mío\n");
});

test("image generation waits for the subagent's files and copies only images", async () => {
  const f = await fixture();
  const artifacts = path.join(f.brainDirectory, CONVERSATION);
  const effect = async () => setTimeout(async () => {
    await fs.mkdir(artifacts, { recursive: true });
    await fs.writeFile(path.join(artifacts, "notas.txt"), "no es imagen");
    await fs.writeFile(path.join(artifacts, "logo_1.png"), "PNG");
  }, 40);
  const result = await imagen({ prompt: "Un logo", outRoot: f.outRoot, brainDirectory: f.brainDirectory, pollMs: 10, waitMs: 2_000,
    run: f.run(f.ok(), effect) });
  assert.deepEqual(result.files.map(file => path.basename(file)), ["logo_1.png"]);
  assert.equal(await fs.readFile(result.files[0], "utf8"), "PNG");
  const [call] = f.calls;
  assert.match(call.args[1], /subagente image-generator.*Un logo/su);
  assert.deepEqual(call.args.slice(2, 6), ["--model", "gemini-3.8-flash-low", "--mode", "accept-edits"]);
  assert.equal(call.cwd, path.dirname(result.files[0]));
});

test("an image that never appears reports where it may still be", async () => {
  const f = await fixture();
  await assert.rejects(imagen({ prompt: "Nada", outRoot: f.outRoot, brainDirectory: f.brainDirectory, pollMs: 5, waitMs: 30, run: f.run(f.ok()) }),
    { code: "gemini-tools", message: new RegExp(`no terminó.*${CONVERSATION}`, "u") });
});

test("estado reports availability and models, or that agy is missing", async () => {
  const run = async args => args[0] === "--version" ? "1.4.7\n" : "gemini-4-argon-low\tGemini 4 Argon (Low)\nFetching available models...\nnone\n";
  const ok = await estado({ run });
  assert.deepEqual([ok.available, ok.version, ok.models], [true, "1.4.7", ["gemini-4-argon-low", "none"]]);
  assert.deepEqual(await estado({ run: async () => null }), { available: false });
});

test("the CLI maps options to the tools and rejects bad usage", async () => {
  const seen = [];
  const tools = { investigar: async input => { seen.push(["investigar", input]); return { ok: true }; }, imagen: async input => { seen.push(["imagen", input]); return { ok: true }; }, estado: async () => ({ available: true }) };
  const run = async argv => {
    const out = [], errors = [];
    const code = await runGeminiCli(argv, { tools, out: t => out.push(t), err: t => errors.push(t) });
    return { code, out: out.join(""), errors: errors.join("") };
  };
  assert.equal((await run(["investigar", "--prompt", "p", "--modelo", "gemini-4-argon-high", "--copiar-a", "/tmp/x"])).code, 0);
  assert.deepEqual(seen[0], ["investigar", { prompt: "p", model: "gemini-4-argon-high", copyTo: "/tmp/x" }]);
  await run(["imagen", "--prompt", "i", "--espera-seg", "90"]);
  assert.deepEqual(seen[1], ["imagen", { prompt: "i", model: undefined, copyTo: undefined, waitMs: 90_000 }]);
  assert.equal(JSON.parse((await run(["estado"])).out).available, true);
  for (const argv of [[], ["otra"], ["investigar"], ["investigar", "--prompt"], ["investigar", "--prompt", "a", "--prompt", "b"],
    ["investigar", "--prompt", "a", "--espera-seg", "5"], ["imagen", "--prompt", "a", "--espera-seg", "0"], ["imagen", "--prompt", "a", "--espera-seg", "601"],
    ["estado", "--prompt", "a"], ["imagen", "--prompt", "a", "--otro", "1"]]) {
    const result = await run(argv);
    assert.equal(result.code, 2, JSON.stringify(argv));
    assert.match(result.errors, /agent-toolkit-gemini investigar/u);
  }
  const failing = await runGeminiCli(["imagen", "--prompt", "x"], { tools: { ...tools, imagen: async () => { throw new Error("detalle interno"); } }, out: () => {}, err: t => seen.push(t) });
  assert.equal(failing, 1);
  assert.equal(seen.at(-1), "No se pudo completar la operación.\n");
});
