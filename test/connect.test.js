import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCli } from "../src/cli.js";
import { connectMemory, READ_TOOLS, WRITE_TOOLS } from "../src/connect.js";
import { initializeMemory } from "../src/init.js";

test("connect muestra una vista previa sin modificar el equipo", async (context) => {
  const fixture = createFixture(context);
  const calls = [];

  const report = await connectMemory(
    {
      targetPath: fixture.memory,
      agentId: "codex"
    },
    {
      homeDirectory: fixture.home,
      runCommand(command, args) {
        calls.push([command, ...args]);
        return missingServer();
      }
    }
  );

  assert.equal(report.status, "preview");
  assert.equal(report.summary.create, 3);
  assert.deepEqual(calls, [["codex", "mcp", "get", "demo-project-memory"]]);
  assert.equal(fs.existsSync(path.join(fixture.home, ".agents")), false);
  assert.equal(fs.existsSync(path.join(fixture.home, ".codex")), false);
});

test("connect aplica Codex con Skill y lista blanca de lectura", async (context) => {
  const fixture = createFixture(context);
  let serverExists = false;
  const configPath = path.join(fixture.home, ".codex/config.toml");

  const runner = (command, args) => {
    assert.equal(command, "codex");
    if (args[1] === "get") {
      return serverExists
        ? codexServerOutput(fs.realpathSync(fixture.memory), true)
        : missingServer();
    }
    if (args[1] === "add") {
      serverExists = true;
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(
        configPath,
        `[mcp_servers.demo-project-memory]\ncommand = "npx"\nargs = ["-y", "@modelcontextprotocol/server-filesystem", "${fixture.memory}"]\n`
      );
      return success();
    }
    throw new Error(`Comando inesperado: ${args.join(" ")}`);
  };

  const first = await connectMemory(
    { targetPath: fixture.memory, agentId: "codex", apply: true },
    { homeDirectory: fixture.home, runCommand: runner }
  );

  assert.equal(first.status, "connected");
  const skillTarget = path.join(
    fixture.home,
    ".agents/skills/demo-project"
  );
  assert.equal(fs.lstatSync(skillTarget).isSymbolicLink(), true);
  assert.equal(
    fs.realpathSync(skillTarget),
    fs.realpathSync(path.join(fixture.memory, "07-AGENTES/skills/demo-project"))
  );
  const codexConfig = fs.readFileSync(configPath, "utf8");
  assert.match(codexConfig, /enabled_tools = \[/);
  for (const tool of READ_TOOLS) {
    assert.match(codexConfig, new RegExp(`"${tool}"`));
  }
  for (const tool of WRITE_TOOLS) {
    assert.doesNotMatch(codexConfig, new RegExp(`"${tool}"`));
  }

  const second = await connectMemory(
    { targetPath: fixture.memory, agentId: "codex", apply: true },
    { homeDirectory: fixture.home, runCommand: runner }
  );
  assert.equal(second.status, "unchanged");
});

test("connect configura Claude con permisos explícitos", async (context) => {
  const fixture = createFixture(context);
  let serverExists = false;

  const runner = (_command, args) => {
    if (args[1] === "get") {
      return serverExists
        ? claudeServerOutput(fixture.memory)
        : missingServer();
    }
    if (args[1] === "add") {
      serverExists = true;
      return success();
    }
    throw new Error(`Comando inesperado: ${args.join(" ")}`);
  };

  const report = await connectMemory(
    { targetPath: fixture.memory, agentId: "claude", apply: true },
    { homeDirectory: fixture.home, runCommand: runner }
  );

  assert.equal(report.status, "connected");
  const settings = JSON.parse(
    fs.readFileSync(path.join(fixture.home, ".claude/settings.json"), "utf8")
  );
  for (const tool of READ_TOOLS) {
    assert.ok(
      settings.permissions.allow.includes(
        `mcp__demo-project-memory__${tool}`
      )
    );
  }
  for (const tool of WRITE_TOOLS) {
    assert.ok(
      settings.permissions.deny.includes(
        `mcp__demo-project-memory__${tool}`
      )
    );
  }
});

test("connect rechaza agentes distintos de Codex y Claude", async (context) => {
  const fixture = createFixture(context);

  await assert.rejects(
    connectMemory(
      { targetPath: fixture.memory, agentId: "gemini" },
      { homeDirectory: fixture.home }
    ),
    (error) => error.details.includes("--agent debe ser codex o claude.")
  );
});

test("un enlace de Skill diferente detiene toda la aplicación", async (context) => {
  const fixture = createFixture(context);
  const target = path.join(fixture.home, ".agents/skills/demo-project");
  fs.mkdirSync(target, { recursive: true });
  let addWasCalled = false;

  const report = await connectMemory(
    { targetPath: fixture.memory, agentId: "codex", apply: true },
    {
      homeDirectory: fixture.home,
      runCommand(_command, args) {
        if (args[1] === "add") {
          addWasCalled = true;
        }
        return missingServer();
      }
    }
  );

  assert.equal(report.status, "conflict");
  assert.equal(addWasCalled, false);
});

test("un enlace de Skill roto se trata como conflicto", async (context) => {
  const fixture = createFixture(context);
  const target = path.join(fixture.home, ".agents/skills/demo-project");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(path.join(fixture.root, "missing-skill"), target, "dir");

  const report = await connectMemory(
    { targetPath: fixture.memory, agentId: "codex" },
    {
      homeDirectory: fixture.home,
      runCommand() {
        return missingServer();
      }
    }
  );

  assert.equal(report.status, "conflict");
  assert.match(
    report.components.find((item) => item.id === "skill").message,
    /otra ubicación|enlace/i
  );
});

test("revierte la Skill y el MCP nuevo si falla la política", async (context) => {
  const fixture = createFixture(context);
  const calls = [];

  await assert.rejects(
    connectMemory(
      {
        targetPath: fixture.memory,
        agentId: "codex",
        apply: true
      },
      {
        homeDirectory: fixture.home,
        runCommand(command, args) {
          calls.push([command, ...args]);
          return args[1] === "get" ? missingServer() : success();
        }
      }
    ),
    /Codex no creó su configuración/
  );

  assert.ok(calls.some((call) => call[1] === "mcp" && call[2] === "remove"));
  assert.equal(
    fs.existsSync(path.join(fixture.home, ".agents/skills/demo-project")),
    false
  );
});

test("un MCP homónimo diferente es conflicto", async (context) => {
  const fixture = createFixture(context);

  const report = await connectMemory(
    { targetPath: fixture.memory, agentId: "codex" },
    {
      homeDirectory: fixture.home,
      runCommand() {
        return {
          status: 0,
          stdout:
            "command: otro-comando\nargs: --ruta /otra/boveda\nenabled_tools: read_text_file\n",
          stderr: ""
        };
      }
    }
  );

  assert.equal(report.status, "conflict");
  assert.equal(report.summary.conflicts, 1);
});

test("la CLI exige seleccionar un agente compatible", async (context) => {
  const fixture = createFixture(context);
  const io = captureIo();

  const exitCode = await runCli(["connect", fixture.memory], io);

  assert.equal(exitCode, 1);
  assert.match(io.stderr.join("\n"), /--agent debe ser/);
});

function createFixture(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-connect-"));
  const source = path.join(root, "source");
  const memory = path.join(root, "memory");
  const home = path.join(root, "home");
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
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

  return { root, source, memory, home };
}

function codexServerOutput(vaultPath, withPolicy) {
  return {
    status: 0,
    stdout: [
      "demo-project-memory",
      "  command: npx",
      `  args: -y @modelcontextprotocol/server-filesystem ${vaultPath}`,
      withPolicy ? `  enabled_tools: ${READ_TOOLS.join(", ")}` : ""
    ].join("\n"),
    stderr: ""
  };
}

function claudeServerOutput(vaultPath) {
  return {
    status: 0,
    stdout: [
      "demo-project-memory:",
      "  Type: stdio",
      "  Command: npx",
      `  Args: -y @modelcontextprotocol/server-filesystem ${vaultPath}`
    ].join("\n"),
    stderr: ""
  };
}

function missingServer() {
  return { status: 1, stdout: "", stderr: "Server not found" };
}

function success() {
  return { status: 0, stdout: "", stderr: "" };
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
