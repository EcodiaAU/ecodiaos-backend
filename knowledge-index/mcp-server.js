"use strict";

// MCP server exposing the knowledge front door over stdio JSON-RPC.
// Cloned from codebase-manifest/mcp-server.js. Two tools:
//   knowledge.lookup - the single retrieval front door (L1 trigger / L2 facet /
//                      L3 FTS5). Use BEFORE grepping the corpus or asking Tate.
//   knowledge.stats  - index health + freshness.

const readline = require("readline");
const { lookup, lookupHybrid, stats } = require("./lookup");

const TOOLS = [
  {
    name: "knowledge.lookup",
    description:
      "The single front door to EcodiaOS's own knowledge (doctrine, recipes, reference, memory, identity, secrets-locations). Query this BEFORE grepping patterns/, before re-deriving a fact, and before asking Tate 'did we decide X'. Returns ranked file paths with category, facet, triggers and a freshness banner, across three layers: L1 exact trigger match, L2 faceted browse, L3 FTS5 keyword. Read the full body of the top hits before acting. A no-hit against a fresh index means the knowledge likely does not exist yet - author it after acting.",
    inputSchema: {
      type: "object",
      properties: {
        need: { type: "string", description: "What you need to know or do, in plain words (e.g. 'how do I ship coexist ios', 'what did we decide about pm2 restarts', 'resonaverde standing arrangement')." },
        facet: { type: "string", description: "Optional domain filter: release|gui|autonomy|memory|infra|comms|finance|clients|voice-brand|scheduler|meta." },
        category: { type: "string", description: "Optional category filter: doctrine|recipes|reference|memory|identity|secrets|workbench." },
        limit: { type: "integer", default: 5, minimum: 1, maximum: 25 },
      },
      required: ["need"],
    },
  },
  {
    name: "knowledge.stats",
    description: "Knowledge index health: doc counts per category, trigger rows, and index freshness (stale flag + age).",
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
function asText(payload) {
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
        serverInfo: { name: "ecodia-knowledge", version: "1.0.0" },
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
      if (name === "knowledge.lookup") {
        lookupHybrid(args.need, { facet: args.facet, category: args.category, limit: args.limit })
          .then((r) => ok(id, asText(r)))
          .catch(() => ok(id, asText(lookup(args.need, { facet: args.facet, category: args.category, limit: args.limit }))));
        return;
      }
      if (name === "knowledge.stats") {
        ok(id, asText(stats()));
        return;
      }
      err(id, -32601, "unknown tool: " + name);
      return;
    }
    if (method && method.startsWith("notifications/")) return;
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
  if (Array.isArray(msg)) for (const m of msg) handle(m);
  else handle(msg);
});
