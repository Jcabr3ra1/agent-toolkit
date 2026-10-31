import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.js";
import { diagnoseMemory } from "../src/doctor.js";
import { initializeMemory, InitializationError } from "../src/init.js";

const FIXED_DATE = new Date("2026-09-29T12:00:00Z");

test("la vista previa no escribe archivos", (context) => {
  const fixture = createFixture(context);

  const report = initializeMemory(baseOptions(fixture), { now: FIXED_DATE });

  assert.equal(report.status, "preview");
  assert.ok(report.summary.create > 0);
  assert.equal(report.summary.conflicts, 0);
  assert.equal(fs.existsSync(fixture.destination), false);
});

test("apply crea una memoria canónica diagnosticable", async (context) => {
  const fixture = createFixture(context);

  const report = initializeMemory(
    { ...baseOptions(fixture), apply: true },
    { now: FIXED_DATE }
  );

  assert.equal(report.status, "created");
  assert.equal(report.summary.conflicts, 0);
  assert.ok(fs.existsSync(path.join(fixture.destination, "project-memory.json")));
  assert.ok(
    fs.existsSync(
      path.join(
        fixture.destination,
        "07-AGENTES/skills/demo-project/SKILL.md"
      )
    )
  );

  const manifest = JSON.parse(
    fs.readFileSync(path.join(fixture.destination, "project-memory.json"), "utf8")
  );
  assert.equal(manifest.project.id, "demo-project");
  assert.equal(manifest.memory.layout.profile, "canonical-v1");
  assert.equal(manifest.security.mcpAccess, "read-only");

  const doctor = await diagnoseMemory(fixture.destination);
  assert.equal(doctor.status, "ok");

  const unresolved = collectFiles(fixture.destination).filter((filePath) =>
    /\{\{[A-Z][A-Z0-9_]*\}\}/.test(fs.readFileSync(filePath, "utf8"))
  );
  assert.deepEqual(unresolved, []);
});

test("repetir apply conserva todos los archivos", (context) => {
  const fixture = createFixture(context);
  const options = { ...baseOptions(fixture), apply: true };
  initializeMemory(options, { now: FIXED_DATE });
  const manifestPath = path.join(fixture.destination, "project-memory.json");
  const originalTimestamp = fs.statSync(manifestPath).mtimeMs;

  const report = initializeMemory(options, { now: FIXED_DATE });

  assert.equal(report.status, "unchanged");
  assert.equal(report.summary.create, 0);
  assert.equal(report.summary.conflicts, 0);
  assert.ok(report.summary.unchanged > 0);
  assert.equal(fs.statSync(manifestPath).mtimeMs, originalTimestamp);
});

test("un conflicto cancela toda la escritura", (context) => {
  const fixture = createFixture(context);
  const conflictingPath = path.join(
    fixture.destination,
    "00-INICIO/Inicio del proyecto.md"
  );
  fs.mkdirSync(path.dirname(conflictingPath), { recursive: true });
  fs.writeFileSync(conflictingPath, "contenido propio\n");

  const report = initializeMemory(
    { ...baseOptions(fixture), apply: true },
    { now: FIXED_DATE }
  );

  assert.equal(report.status, "conflict");
  assert.equal(report.summary.conflicts, 1);
  assert.equal(
    fs.existsSync(path.join(fixture.destination, "project-memory.json")),
    false
  );
  assert.equal(fs.readFileSync(conflictingPath, "utf8"), "contenido propio\n");
});

test("rechaza una memoria dentro del repositorio fuente", (context) => {
  const fixture = createFixture(context);

  assert.throws(
    () =>
      initializeMemory({
        ...baseOptions(fixture),
        destination: path.join(fixture.source, "memory")
      }),
    (error) =>
      error instanceof InitializationError &&
      error.message.includes("deben estar separados")
  );
});

test("rechaza credenciales en remotos", (context) => {
  const fixture = createFixture(context);

  assert.throws(
    () =>
      initializeMemory({
        ...baseOptions(fixture),
        sourceRemote: "https://usuario:clave@example.com/proyecto.git"
      }),
    (error) =>
      error instanceof InitializationError &&
      error.message.includes("no puede contener credenciales")
  );
});

test("rechaza identificadores inválidos", (context) => {
  const fixture = createFixture(context);

  assert.throws(
    () =>
      initializeMemory({
        ...baseOptions(fixture),
        projectId: "Proyecto Con Espacios"
      }),
    InitializationError
  );
});

test("rechaza identificadores de un solo carácter", (context) => {
  const fixture = createFixture(context);

  assert.throws(
    () =>
      initializeMemory({
        ...baseOptions(fixture),
        projectId: "a"
      }),
    InitializationError
  );
});

test(
  "resuelve enlaces simbólicos antes de separar fuente y memoria",
  {},
  (context) => {
    const fixture = createFixture(context);
    const alias = path.join(fixture.root, "source-alias");
    fs.symlinkSync(fixture.source, alias, process.platform === "win32" ? "junction" : "dir");

    assert.throws(
      () =>
        initializeMemory({
          ...baseOptions(fixture),
          destination: path.join(alias, "memory")
        }),
      (error) =>
        error instanceof InitializationError &&
        error.message.includes("deben estar separados")
    );
  }
);

test("la CLI muestra el plan sin escribir", async (context) => {
  const fixture = createFixture(context);
  const io = captureIo();

  const exitCode = await runCli(
    [
      "init",
      fixture.destination,
      "--project-id",
      "demo-project",
      "--project-name",
      "Demo Project",
      "--source",
      fixture.source,
      "--json"
    ],
    io
  );
  const report = JSON.parse(io.stdout.join("\n"));

  assert.equal(exitCode, 0);
  assert.equal(report.status, "preview");
  assert.equal(fs.existsSync(fixture.destination), false);
});

test("la CLI rechaza init sin argumentos obligatorios", async () => {
  const io = captureIo();

  const exitCode = await runCli(["init"], io);

  assert.equal(exitCode, 1);
  assert.match(io.stderr.join("\n"), /ruta de destino/);
  assert.match(io.stderr.join("\n"), /--source es obligatorio/);
});

function createFixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-init-"));
  const source = path.join(root, "source");
  const destination = path.join(root, "memory");
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, "README.md"), "# Demo\n");
  execFileSync("git", ["-C", source, "init", "-q"]);

  return { root, source, destination };
}

function baseOptions(fixture) {
  return {
    destination: fixture.destination,
    projectId: "demo-project",
    projectName: "Demo Project",
    sourcePath: fixture.source,
    defaultBranch: "main",
    integrationBranch: "develop"
  };
}

function collectFiles(rootDirectory) {
  const files = [];
  const pending = [rootDirectory];

  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function captureIo() {
  const stdout = [];
  const stderr = [];

  return {
    stdout,
    stderr,
    out(message) {
      stdout.push(message);
    },
    err(message) {
      stderr.push(message);
    }
  };
}
