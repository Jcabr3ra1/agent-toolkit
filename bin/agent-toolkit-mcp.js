#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createTaskWorkflowMcp } from "../src/task-workflow-mcp.js";

serveStdio(() => createTaskWorkflowMcp(), {
  onerror() {
    process.stderr.write("agent-toolkit-mcp: error de conexión MCP\n");
  }
});
