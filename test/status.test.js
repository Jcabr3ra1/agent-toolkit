import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.js";
import { initializeMemory } from "../src/init.js";
import { inspectMemoryStatus } from "../src/status.js";

test("status informa una memoria y tres agentes saludables", async (context) => {
  const fixture = createFixture(context);
  const report = await inspectMemoryStatus(
    { targetPath: fixture.memory },
    {
      diagnoseMemory: async () => healthyDoctor(fixture),
      connectMemory: async (_options) => healthyConnection()
    }
  );

  assert.equal(report.status, "ok");
  assert.equal(report.summary.healthyAgents, 3);
  assert.equal(report.summary.errors, 0);
  assert.equal(report.summary.warnings, 0);
});

test("status convierte una conexión pendiente en advertencia", async (context) => {
  const fixture = createFixture(context);
  const report = await inspectMemoryStatus(
    { targetPath: fixture.memory },
    {
      diagnoseMemory: async () => healthyDoctor(fixture),
      connectMemory: async (options) =>
        options.agentId === "gemini"
          ? pendingConnection()
          : healthyConnection()
    }
  );

  assert.equal(report.status, "warning");
  assert.equal(report.summary.pendingAgents, 1);
  assert.equal(
    report.agents.find((agent) => agent.id === "gemini").status,
    "warning"
  );
});

test("status convierte un conflicto de conexión en error", async (context) => {
  const fixture = createFixture(context);
  const report = await inspectMemoryStatus(
    { targetPath: fixture.memory, agentId: "codex" },
    {
      diagnoseMemory: async () => healthyDoctor(fixture),
      connectMemory: async () => conflictConnection()
    }
  );

  assert.equal(report.status, "error");
  assert.equal(report.summary.errors, 1);
  assert.equal(report.agents.length, 1);
});

test("status informa error cuando el agente no está declarado", async (context) => {
  const fixture = createFixture(context);
  const report = await inspectMemoryStatus(
    { targetPath: fixture.memory, agentId: "otro" },
    {
      diagnoseMemory: async () => healthyDoctor(fixture),
      connectMemory: async () => healthyConnection()
    }
  );

  assert.equal(report.status, "error");
  assert.match(report.findings[0].message, /no declara el agente otro/);
});

test("status omite conexiones de agentes deshabilitados", async (context) => {
  const fixture = createFixture(context);
  const manifestPath = path.join(fixture.memory, "project-memory.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.agents[0].enabled = false;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  let connectionCalls = 0;

  const report = await inspectMemoryStatus(
    { targetPath: fixture.memory, agentId: "codex" },
    {
      diagnoseMemory: async () => healthyDoctor(fixture),
      connectMemory: async () => {
        connectionCalls += 1;
        return healthyConnection();
      }
    }
  );

  assert.equal(report.status, "ok");
  assert.equal(report.summary.disabledAgents, 1);
  assert.equal(connectionCalls, 0);
});

test("la CLI status emite JSON y strict falla ante advertencias", async (context) => {
  const fixture = createFixture(context);
  const manifestPath = path.join(fixture.memory, "project-memory.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.agents = manifest.agents.map((agent) => ({
    ...agent,
    enabled: false
  }));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.rmSync(fixture.source, { recursive: true, force: true });

  const normalIo = captureIo();
  const normalExit = await runCli(
    ["status", fixture.memory, "--json"],
    normalIo
  );
  const report = JSON.parse(normalIo.stdout.join("\n"));
  assert.equal(normalExit, 0);
  assert.equal(report.status, "warning");

  const strictIo = captureIo();
  const strictExit = await runCli(
    ["status", fixture.memory, "--strict"],
    strictIo
  );
  assert.equal(strictExit, 1);
});

function createFixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-status-"));
  const source = path.join(root, "source");
  const memory = path.join(root, "memory");
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, "README.md"), "# Demo\n");
  execFileSync("git", ["-C", source, "init", "-q"]);
  initializeMemory(
    {
      destination: memory,
      projectId: "demo-project",
      projectName: "Demo Project",
      sourcePath: source,
      apply: true
    },
    { now: new Date("2026-09-29T12:00:00Z") }
  );
  return { root, source, memory };
}

function healthyDoctor(fixture) {
  return {
    status: "ok",
    manifestPath: path.join(fixture.memory, "project-memory.json"),
    sourcePath: fixture.source,
    vaultPath: fixture.memory,
    layoutProfile: "canonical-v1",
    checks: [],
    summary: { errors: 0, warnings: 0, passed: 17, info: 0 }
  };
}

function healthyConnection() {
  return {
    status: "preview",
    summary: { create: 0, update: 0, unchanged: 3, conflicts: 0 },
    components: [
      { id: "skill", action: "unchanged", message: "Skill correcta." },
      { id: "mcp", action: "unchanged", message: "MCP correcto." },
      { id: "policy", action: "unchanged", message: "Política correcta." }
    ]
  };
}

function pendingConnection() {
  return {
    status: "preview",
    summary: { create: 0, update: 1, unchanged: 2, conflicts: 0 },
    components: [
      { id: "skill", action: "unchanged", message: "Skill correcta." },
      { id: "mcp", action: "unchanged", message: "MCP correcto." },
      { id: "policy", action: "update", message: "Política pendiente." }
    ]
  };
}

function conflictConnection() {
  return {
    status: "conflict",
    summary: { create: 0, update: 0, unchanged: 2, conflicts: 1 },
    components: [
      { id: "mcp", action: "conflict", message: "MCP diferente." }
    ]
  };
}

function captureIo() {
  const stdout = [];
  const stderr = [];
  return {
    stdout,
    stderr,
    out(value) {
      stdout.push(value);
    },
    err(value) {
      stderr.push(value);
    }
  };
}
