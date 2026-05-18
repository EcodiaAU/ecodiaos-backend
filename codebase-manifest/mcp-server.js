"use strict";

const readline = require("readline");
const { context, stats } = require("./codebase-context");

const TOOLS = [
  {
    name: "codebase.context",
    description: "Continuous codebase awareness. Query the local SQLite index of D:/.code/* across ecodiaos-backend, ecodiaos-frontend, coexist, roam-backend, roam-frontend, patterns-corpus. Use this BEFORE grepping the filesystem live. Query types: find_symbol (find a function/class/component by name), find_callers (which files import a module), find_pattern_users (which files reference a pattern slug), file_summary (50-word summary of a file path), recently_changed (files mtime newer than threshold), find_imports_of (what does this file import).",
    inputSchema: {
      type: "object",
      properties: {
        codebase_id: {
          type: "string",
          description: "Codebase id (ecodiaos-backend|ecodiaos-frontend|coexist|roam-backend|roam-frontend|patterns-corpus) or * for cross-repo.",
          default: "*",
        },
        query_type: {
          type: "string",
          enum: ["find_symbol", "find_callers", "find_pattern_users", "file_summary", "recently_changed", "find_imports_of"],
        },
        query: { type: "string", description: "Symbol name, pattern slug, partial path, or for recently_changed an epoch-ms threshold." },
        limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
      },
      required: ["query_type"],
    },
  },
  {
    name: "codebase.stats",
    description: "Index health snapshot: file counts per codebase, summarisation coverage, last run timestamps.",
    inputSchema: { type: "object", properties: {} },
  },
];

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function ok(id, result) {
  send({ jsonrpc: "2.0", id: id, result: result });
}

function err(id, code, message) {
  send({ jsonrpc: "2.0", id: id, error: { code: code, message: message } });
}

function asTextContent(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function handle(msg) {
  const id = msg.id;
  const method = msg.method;
  const params = msg.params || {};
  try {
    if (method === "initialize") {
      ok(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "ecodia-codebase-awareness", version: "1.0.0" },
      });
      return;
    }
    if (method === "tools/list") {
      ok(id, { tools: TOOLS });
      return;
    }
    if (method === "tools/call") {
      const name = params.name;
      const args = params.arguments || {};
      if (name === "codebase.context") {
        const r = context(args);
        ok(id, asTextContent(r));
        return;
      }
      if (name === "codebase.stats") {
        ok(id, asTextContent(stats()));
        return;
      }
      err(id, -32601, "unknown tool: " + name);
      return;
    }
    if (method === "notifications/initialized" || (method && method.startsWith("notifications/"))) {
      return;
    }
    err(id, -32601, "method not found: " + method);
  } catch (e) {
    err(id, -32000, e.message || String(e));
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", function (line) {
  line = (line || "").trim();
  if (!line) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    return;
  }
  if (Array.isArray(msg)) {
    for (const m of msg) handle(m);
  } else {
    handle(msg);
  }
});