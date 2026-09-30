import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.js";
import {
  parseGitHubRepository,
  planMemorySync,
  SyncPlanningError
} from "../src/sync.js";

test("sync plan excluye PR revisados y ordena los pendientes", async (context) => {
  const fixture = createFixture(context, { reviewed: [12] });
  let receivedCommand;
  let receivedArguments;
  const report = await planMemorySync(
    { targetPath: fixture.root },
    {
      diagnoseMemory: async () => healthyDoctor(fixture),
      runCommand(command, args) {
        receivedCommand = command;
        receivedArguments = args;
        return JSON.stringify([
          pullRequest(14, "Segundo", "2026-09-29T12:00:00Z"),
          pullRequest(12, "Registrado", "2026-09-27T12:00:00Z"),
          pullRequest(13, "Primero", "2026-09-28T12:00:00Z"),
          pullRequest(11, "Histórico", "2026-09-26T12:00:00Z")
        ]);
      }
    }
  );

  assert.equal(report.status, "pending");
  assert.deepEqual(report.reviewed, [12]);
  assert.deepEqual(report.baseline, {
    number: 12,
    mergedAt: "2026-09-27T12:00:00Z"
  });
  assert.deepEqual(report.pending.map(({ number }) => number), [13, 14]);
  assert.equal(receivedCommand, "gh");
  assert.deepEqual(receivedArguments.slice(0, 10), [
    "pr",
    "list",
    "--repo",
    "owner/project",
    "--state",
    "merged",
    "--base",
    "develop",
    "--limit",
    "100"
  ]);
});

test("sync plan devuelve clean y no modifica el registro", async (context) => {
  const fixture = createFixture(context, { reviewed: [21] });
  const before = fs.readFileSync(fixture.ledgerPath, "utf8");
  const report = await planMemorySync(
    { targetPath: fixture.root },
    {
      diagnoseMemory: async () => healthyDoctor(fixture),
      runCommand: () =>
        JSON.stringify([
          pullRequest(21, "Ya revisado", "2026-09-29T12:00:00Z")
        ])
    }
  );

  assert.equal(report.status, "clean");
  assert.deepEqual(report.pending, []);
  assert.equal(fs.readFileSync(fixture.ledgerPath, "utf8"), before);
});

test("acepta el encabezado existente de AVISENS", async (context) => {
  const fixture = createFixture(context, {
    reviewed: [22],
    avisensHeader: true
  });
  const report = await planMemorySync(
    { targetPath: fixture.root },
    {
      diagnoseMemory: async () => healthyDoctor(fixture),
      runCommand: () =>
        JSON.stringify([
          pullRequest(22, "Ya revisado", "2026-09-29T12:00:00Z")
        ])
    }
  );

  assert.equal(report.status, "clean");
  assert.deepEqual(report.reviewed, [22]);
});

test("ignora filas incompletas y enlaces de otro repositorio", async (context) => {
  const fixture = createFixture(context, { reviewed: [] });
  fs.appendFileSync(
    fixture.ledgerPath,
    [
      "| [#30](https://github.com/other/project/pull/30) | Revisado | 2026-09-29 | Otro | — |",
      "| [#31](https://github.com/owner/project/pull/31) | Pendiente | 2026-09-29 | Otro | — |",
      "| fila incompleta | Revisado |"
    ].join("\n") + "\n"
  );

  const report = await planMemorySync(
    { targetPath: fixture.root },
    {
      diagnoseMemory: async () => healthyDoctor(fixture),
      runCommand: () =>
        JSON.stringify([
          pullRequest(30, "Otro número", "2026-09-29T10:00:00Z"),
          pullRequest(31, "Pendiente", "2026-09-29T11:00:00Z")
        ])
    }
  );

  assert.deepEqual(report.reviewed, []);
  assert.deepEqual(report.pending.map(({ number }) => number), [30, 31]);
});

test("rechaza automatización deshabilitada", async (context) => {
  const fixture = createFixture(context, { automationEnabled: false });

  await assert.rejects(
    planMemorySync(
      { targetPath: fixture.root },
      {
        diagnoseMemory: async () => healthyDoctor(fixture),
        runCommand: () => "[]"
      }
    ),
    (error) =>
      error instanceof SyncPlanningError &&
      error.details.some((detail) => /automation\.enabled/.test(detail))
  );
});

test("rechaza un ledger sin la tabla canónica", async (context) => {
  const fixture = createFixture(context, { reviewed: [] });
  fs.writeFileSync(fixture.ledgerPath, "# Registro\n\nSin tabla.\n");

  await assert.rejects(
    planMemorySync(
      { targetPath: fixture.root },
      {
        diagnoseMemory: async () => healthyDoctor(fixture),
        runCommand: () => "[]"
      }
    ),
    /tabla canónica/
  );
});

test("rechaza límites fuera del rango permitido", async () => {
  await assert.rejects(
    planMemorySync({ targetPath: "/tmp", limit: "0" }),
    /--limit/
  );
  await assert.rejects(
    planMemorySync({ targetPath: "/tmp", limit: "muchos" }),
    /--limit/
  );
});

test("acepta remotos HTTPS, SSH y SCP de GitHub", () => {
  assert.equal(
    parseGitHubRepository("https://github.com/Owner/Project.git"),
    "Owner/Project"
  );
  assert.equal(
    parseGitHubRepository("ssh://git@github.com/owner/project.git"),
    "owner/project"
  );
  assert.equal(
    parseGitHubRepository("git@github.com:owner/project.git"),
    "owner/project"
  );
  assert.throws(
    () => parseGitHubRepository("https://gitlab.com/owner/project.git"),
    /GitHub/
  );
});

test("la CLI emite JSON y strict falla solo cuando hay pendientes", async (context) => {
  const fixture = createFixture(context, { reviewed: [] });
  const executionContext = {
    diagnoseMemory: async () => healthyDoctor(fixture),
    runCommand: () =>
      JSON.stringify([
        pullRequest(40, "Nuevo", "2026-09-29T12:00:00Z")
      ])
  };
  const normalIo = captureIo();
  const normalExit = await runCli(
    ["sync", "plan", fixture.root, "--json"],
    normalIo,
    executionContext
  );
  const report = JSON.parse(normalIo.stdout.join("\n"));

  assert.equal(normalExit, 0);
  assert.equal(report.status, "pending");
  assert.equal(report.pending[0].mergeCommit, "commit-40");

  const strictIo = captureIo();
  const strictExit = await runCli(
    ["sync", "plan", fixture.root, "--strict"],
    strictIo,
    executionContext
  );
  assert.equal(strictExit, 1);
});

test("la CLI valida la operación y las opciones de sync", async () => {
  const missingOperationIo = captureIo();
  assert.equal(await runCli(["sync"], missingOperationIo), 2);
  assert.match(missingOperationIo.stderr.join("\n"), /operación de sync/);

  const unknownOptionIo = captureIo();
  assert.equal(
    await runCli(["sync", "plan", "--desconocida"], unknownOptionIo),
    2
  );
  assert.match(unknownOptionIo.stderr.join("\n"), /Opción desconocida/);
});

function createFixture(context, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-sync-"));
  const vault = path.join(root, "vault");
  const ledgerPath = path.join(
    vault,
    "00-INICIO/Registro de sincronización.md"
  );
  const manifestPath = path.join(root, "project-memory.json");
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const reviewedRows = (options.reviewed ?? [])
    .map(
      (number) =>
        `| [#${number}](https://github.com/owner/project/pull/${number}) | Revisado | 2026-09-29 | Sin cambios documentales | — |`
    )
    .join("\n");
  fs.writeFileSync(
    ledgerPath,
    [
      "# Registro de sincronización",
      "",
      options.avisensHeader
        ? "| PR | Estado | Fecha de revisión | Resultado | Commit de memoria |"
        : "| Cambio | Estado | Fecha | Resultado | Commit de memoria |",
      "| --- | --- | --- | --- | --- |",
      reviewedRows,
      ""
    ].join("\n")
  );
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        source: {
          remoteUrl: "https://github.com/owner/project.git"
        },
        automation: {
          enabled: options.automationEnabled ?? true,
          reviewBranch: "develop",
          requiresMergedChange: true
        }
      },
      null,
      2
    )}\n`
  );
  return { root, vault, ledgerPath, manifestPath };
}

function healthyDoctor(fixture) {
  return {
    status: "ok",
    manifestPath: fixture.manifestPath,
    vaultPath: fixture.vault,
    checks: [],
    summary: { errors: 0, warnings: 0, passed: 1, info: 0 }
  };
}

function pullRequest(number, title, mergedAt) {
  return {
    number,
    title,
    url: `https://github.com/owner/project/pull/${number}`,
    mergedAt,
    mergeCommit: { oid: `commit-${number}` }
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
