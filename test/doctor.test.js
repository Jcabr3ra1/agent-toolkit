import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.js";
import { diagnoseMemory } from "../src/doctor.js";

const REQUIRED_DIRECTORIES = [
  "00-INICIO",
  "01-PRODUCTO",
  "02-ARQUITECTURA",
  "03-IMPLEMENTACION",
  "04-DECISIONES",
  "05-ENTREGAS",
  "06-OPERACION",
  "07-AGENTES",
  "08-RECURSOS",
  "09-ARCHIVO"
];

const REQUIRED_NOTES = [
  "00-INICIO/Inicio del proyecto.md",
  "00-INICIO/Mapa de la memoria.md",
  "00-INICIO/Estado actual.md",
  "00-INICIO/Fuentes de verdad.md",
  "00-INICIO/Mantenimiento de la memoria.md",
  "00-INICIO/Registro de sincronización.md"
];

test("acepta una memoria mínima saludable", async (context) => {
  const fixture = createFixture(context);
  const report = await diagnoseMemory(fixture.root);

  assert.equal(report.status, "ok");
  assert.equal(report.summary.errors, 0);
  assert.equal(report.summary.warnings, 0);
  assert.equal(report.layoutProfile, "canonical-v1");
});

test("acepta una estructura estable declarada", async (context) => {
  const fixture = createFixture(context, {
    memory: {
      vaultPath: "./vault",
      repositoryBranch: "main",
      mcpServerName: "test-project-memory",
      syncMode: "none",
      layout: {
        profile: "declared",
        requiredDirectories: ["00-INICIO", "02-BACKEND"],
        requiredNotes: ["00-INICIO/Inicio del proyecto.md"]
      }
    }
  });
  fs.rmSync(path.join(fixture.vault, "02-ARQUITECTURA"), {
    recursive: true,
    force: true
  });
  fs.mkdirSync(path.join(fixture.vault, "02-BACKEND"));

  const report = await diagnoseMemory(fixture.root);

  assert.equal(report.status, "ok");
  assert.equal(report.layoutProfile, "declared");
});

test("rechaza un perfil declarado sin listas estructurales", async (context) => {
  const fixture = createFixture(context, {
    memory: {
      vaultPath: "./vault",
      repositoryBranch: "main",
      mcpServerName: "test-project-memory",
      syncMode: "none",
      layout: {
        profile: "declared"
      }
    }
  });

  const report = await diagnoseMemory(fixture.root);

  assert.equal(report.status, "error");
  assert.ok(
    report.checks.some(
      (check) => check.id === "manifest-schema" && check.level === "error"
    )
  );
});

test("rechaza rutas declaradas que salen de la bóveda", async (context) => {
  const fixture = createFixture(context, {
    memory: {
      vaultPath: "./vault",
      repositoryBranch: "main",
      mcpServerName: "test-project-memory",
      syncMode: "none",
      layout: {
        profile: "declared",
        requiredDirectories: ["../otra-memoria"],
        requiredNotes: ["00-INICIO/Inicio del proyecto.md"]
      }
    }
  });

  const report = await diagnoseMemory(fixture.root);

  assert.equal(report.status, "error");
  assert.ok(
    report.checks.some(
      (check) => check.id === "manifest-schema" && check.level === "error"
    )
  );
});

test("rechaza un manifiesto con permisos inseguros", async (context) => {
  const fixture = createFixture(context, {
    security: {
      mcpAccess: "read-write",
      sensitiveDataPolicy: "allowed",
      writeRequiresExplicitAuthorization: false,
      allowCredentialsInMemory: true
    }
  });
  const report = await diagnoseMemory(fixture.root);

  assert.equal(report.status, "error");
  assert.ok(
    report.checks.some(
      (check) => check.id === "manifest-schema" && check.level === "error"
    )
  );
});

test("rechaza credenciales incrustadas en una URL", async (context) => {
  const fixture = createFixture(context, {
    source: {
      repositoryPath: "./source",
      remoteUrl: "https://usuario:clave@example.com/proyecto.git",
      defaultBranch: "main"
    }
  });
  const report = await diagnoseMemory(fixture.root);

  assert.equal(report.status, "error");
  assert.ok(
    report.checks.some(
      (check) =>
        check.id === "manifest-credentials" && check.level === "error"
    )
  );
  assert.doesNotMatch(JSON.stringify(report), /usuario|clave/);
});

test("detecta variables pendientes y enlaces rotos", async (context) => {
  const fixture = createFixture(context);
  fs.appendFileSync(
    path.join(fixture.vault, "00-INICIO/Inicio del proyecto.md"),
    "\n{{PROJECT_NAME}}\n[[Nota inexistente]]\n"
  );

  const report = await diagnoseMemory(fixture.root);

  assert.equal(report.status, "error");
  assert.ok(
    report.checks.some(
      (check) => check.id === "template-variables" && check.level === "error"
    )
  );
  assert.ok(
    report.checks.some(
      (check) => check.id === "markdown-links" && check.level === "error"
    )
  );
});

test("ignora enlaces ilustrativos dentro de código Markdown", async (context) => {
  const fixture = createFixture(context);
  fs.appendFileSync(
    path.join(fixture.vault, "00-INICIO/Inicio del proyecto.md"),
    [
      "",
      "Ejemplo: `[[Nota inexistente]]`.",
      "",
      "```markdown",
      "[[Otra nota inexistente]]",
      "[Ejemplo](archivo-ausente.md)",
      "```",
      ""
    ].join("\n")
  );

  const report = await diagnoseMemory(fixture.root);

  assert.equal(report.status, "ok");
  assert.ok(
    report.checks.some(
      (check) => check.id === "markdown-links" && check.level === "pass"
    )
  );
});

test("detecta patrones sensibles de alta confianza", async (context) => {
  const fixture = createFixture(context);
  fs.appendFileSync(
    path.join(fixture.vault, "00-INICIO/Estado actual.md"),
    "\ntoken = ghp_1234567890abcdefghij1234567890\n"
  );

  const report = await diagnoseMemory(fixture.root);

  assert.equal(report.status, "error");
  assert.ok(
    report.checks.some(
      (check) => check.id === "secret-scan" && check.level === "error"
    )
  );
});

test("informa cuando falta el manifiesto", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-doctor-empty-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const report = await diagnoseMemory(root);

  assert.equal(report.status, "error");
  assert.ok(
    report.checks.some(
      (check) => check.id === "manifest-presence" && check.level === "error"
    )
  );
});

test("la CLI devuelve JSON válido para una memoria saludable", async (context) => {
  const fixture = createFixture(context);
  const io = captureIo();

  const exitCode = await runCli(["doctor", fixture.root, "--json"], io);
  const report = JSON.parse(io.stdout.join("\n"));

  assert.equal(exitCode, 0);
  assert.equal(report.status, "ok");
  assert.equal(report.sourcePath, path.join(fixture.root, "source"));
  assert.equal(report.vaultPath, fixture.vault);
});

test("el modo estricto falla ante una advertencia", async (context) => {
  const fixture = createFixture(context, {
    source: {
      repositoryPath: "./source-ausente",
      defaultBranch: "main"
    }
  });
  const io = captureIo();

  const exitCode = await runCli(["doctor", fixture.root, "--strict"], io);

  assert.equal(exitCode, 1);
  assert.match(io.stdout.join("\n"), /source-repository/);
});

test("la CLI rechaza argumentos desconocidos", async () => {
  const io = captureIo();

  const exitCode = await runCli(["doctor", "--desconocida"], io);

  assert.equal(exitCode, 2);
  assert.match(io.stderr.join("\n"), /Opción desconocida/);
});

function createFixture(context, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-doctor-"));
  const vault = path.join(root, "vault");
  const source = path.join(root, "source");
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(source, { recursive: true });
  execFileSync("git", ["-C", source, "init", "-q"]);

  for (const directory of REQUIRED_DIRECTORIES) {
    fs.mkdirSync(path.join(vault, directory), { recursive: true });
  }

  for (const note of REQUIRED_NOTES) {
    const destination = path.join(vault, note);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `# ${path.basename(note, ".md")}\n`);
  }

  fs.appendFileSync(
    path.join(vault, "00-INICIO/Inicio del proyecto.md"),
    "\n[[Mapa de la memoria]]\n"
  );

  const manifest = {
    schemaVersion: "1.0.0",
    project: {
      id: "test-project",
      name: "Test Project"
    },
    source: {
      repositoryPath: "./source",
      defaultBranch: "main"
    },
    memory: {
      vaultPath: "./vault",
      repositoryBranch: "main",
      mcpServerName: "test-project-memory",
      syncMode: "none"
    },
    agents: [
      {
        id: "codex",
        enabled: true,
        skillName: "test-project"
      }
    ],
    security: {
      mcpAccess: "read-only",
      sensitiveDataPolicy: "forbidden",
      writeRequiresExplicitAuthorization: true,
      allowCredentialsInMemory: false
    },
    ...overrides
  };

  fs.writeFileSync(
    path.join(root, "project-memory.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  return { root, vault };
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
