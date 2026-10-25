import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/pages/api/prepare.js";

const task = {
  title: "Landing sencilla",
  project: "sitio-web",
  mode: "autonomous",
  objective: "Crear una página de presentación adaptable a móvil.",
  scope: "Página principal y estilos asociados.",
  acceptance: "Contenido claro, diseño adaptable y enlaces funcionales.",
  checks: "Ejecutar las pruebas del proyecto."
};
const responses = {
  plan: "Plan de prueba con rutas y criterios.",
  proposal: "Cambiar la página inicial y añadir estilos.",
  implementation: "Se modificaron los archivos y se ejecutó npm test.",
  review: ""
};

function makeContext(body, headers = {}) {
  const request = new Request("http://127.0.0.1:4321/api/prepare", {
    method: "POST",
    headers: {
      host: "127.0.0.1:4321",
      origin: "http://127.0.0.1:4321",
      "content-type": "application/json",
      ...headers
    },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
  return { request };
}

async function prepare(stage, options = {}) {
  return POST(makeContext({ stage, task, responses, applyAuthorized: false, ...options }));
}

test("local API creates manual handoffs without invoking providers", async () => {
  const response = await prepare("claude-proposal");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.stage, "claude-proposal");
  assert.equal(body.externalCalls, false);
  assert.equal(body.savedOnServer, false);
  assert.match(body.prompt, /Actúa como Claude/);
  assert.match(body.prompt, /Plan de OpenAI/);
  assert.match(body.prompt, /No edites archivos/);
});

test("Claude Code receives write authorization only after autonomous consent", async () => {
  const denied = await prepare("claude-implementation");
  const deniedBody = await denied.json();
  assert.match(deniedBody.prompt, /No tienes autorización para editar/);

  const approved = await prepare("claude-implementation", { applyAuthorized: true });
  const approvedBody = await approved.json();
  assert.match(approvedBody.prompt, /autorización explícita para que la apliques/);
  assert.match(approvedBody.prompt, /No crees commits, no hagas push/);

  const tutor = await prepare("claude-implementation", { task: { ...task, mode: "tutor" }, applyAuthorized: true });
  const tutorPrompt = (await tutor.json()).prompt;
  assert.match(tutorPrompt, /No edites archivos/);
  assert.match(tutorPrompt, /que el usuario lo escriba/);
});

test("final OpenAI review asks for real diff and evidence", async () => {
  const response = await prepare("openai-review");
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(body.prompt, /Revisa el diff real y la evidencia/);
  assert.match(body.prompt, /Implementación de Claude/);
  assert.match(body.prompt, /no infieras que se aplicó o probó algo/);
});

test("refuses cross-origin and non-loopback requests", async () => {
  const crossOrigin = await POST(makeContext({ stage: "openai-plan", task, responses, applyAuthorized: false }, {
    origin: "http://attacker.example"
  }));
  assert.equal(crossOrigin.status, 403);

  const remoteHost = await POST(makeContext({ stage: "openai-plan", task, responses, applyAuthorized: false }, {
    host: "192.168.1.8:4321",
    origin: "http://192.168.1.8:4321"
  }));
  assert.equal(remoteHost.status, 403);
});

test("rejects unsupported stages, missing handoffs, control characters and oversized input", async () => {
  assert.equal((await prepare("unknown")).status, 400);
  assert.equal((await prepare("claude-proposal", { responses: { plan: "" } })).status, 400);
  assert.equal((await prepare("openai-plan", { task: { ...task, objective: "bad\u0000text" } })).status, 400);
  assert.equal((await prepare("openai-plan", { task: { ...task, objective: "x".repeat(4001) } })).status, 400);
  const tooLarge = await POST(makeContext("x".repeat(100000)));
  assert.equal(tooLarge.status, 413);
});
