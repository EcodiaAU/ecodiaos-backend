---
triggers: createSdkMcpServer, in-process-mcp, sdkMcpServerInstances, forkConductorTool, getForkConductorMcpServer, mcp-server-singleton, mcp-server-cache, already-connected-to-a-transport, server-connect-throws, mcp-transport-stolen, manager-fork-sub-spawn-broken, forks-mcp-transport-disconnects, mcp__forks__-missing-from-fork-surface, allowed-tools-lists-but-tool-missing
---

# SDK in-process MCP Server instances must be per-query, not singleton

The MCP SDK's `Server.connect()` throws `Already connected to a transport`
if the same Server instance is connected to a second transport. The Claude
Agent SDK silently catches this in `connectSdkMcpServer()` and removes the
server from `sdkMcpServerInstances` â€” so the second SDK query loses the
in-process tool surface even though `--allowedTools` still lists the
`mcp__<name>__*` patterns.

## The trap

A factory like this LOOKS correct but breaks the second-and-later caller:

```js
let _serverConfig = null
async function getServer() {
  if (_serverConfig) return _serverConfig
  _serverConfig = createSdkMcpServer({name:'forks', tools:[...]})
  return _serverConfig
}
```

What happens at runtime:

1. Conductor calls `getServer()` â†’ builds new server, caches it. SDK init
   adds it to `sdkMcpServerInstances`. SDK calls `instance.connect(transport_main)`
   â†’ succeeds. Conductor has the tools.
2. Fork spawns. Calls `getServer()` â†’ returns the SAME cached instance. SDK
   init re-adds it to `sdkMcpServerInstances`. SDK calls
   `instance.connect(transport_fork)` â†’ THROWS `Already connected to a
   transport` (protocol.js:215-218 of `@modelcontextprotocol/sdk`).
3. Claude Agent SDK's `connectSdkMcpServer()` swallows the error in a
   `.catch()`, removes the server from `sdkMcpServerInstances`, logs
   `[Query.connectSdkMcpServer] Failed to connect MCP server '<name>'`.
4. The fork's CLI args still list `mcp__<name>__*` in `--allowedTools`
   because `Object.keys(mcpServers)` ran BEFORE the connect attempt. But the
   actual tool surface lacks the tools. The model can't call them. A
   manager-flagged fork can describe sub-fork plans but cannot trigger them.
   Phantom-shipped: `[FORK_REPORT]` claims success, no `os_forks` rows
   appear with `parent_id=<manager_fork_id>`.

The same trap fires symmetrically for cron-fired forks: when a cron fork
claims the transport, the conductor's cached instance loses ITS transport.
Recurring "MCP forks transport disconnects on hourly cron fire" pattern.

## The fix

Rebuild the server fresh per call. Cache the tool wrappers (pure data) but
NEVER cache the `createSdkMcpServer()` return value across SDK queries.

```js
let _toolsCache = null
let _createSdkMcpServer = null

async function _buildTools() {
  if (_toolsCache) return _toolsCache
  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  const { createSdkMcpServer, tool } = sdk
  _createSdkMcpServer = createSdkMcpServer
  _toolsCache = [
    tool('spawn_fork', '...', schema, handler),
    // ...
  ]
  return _toolsCache
}

async function getServer() {
  const tools = await _buildTools()
  return _createSdkMcpServer({ name: 'forks', version: '1.0.0', tools })
}
```

Validation: `await getServer() === await getServer()` MUST be `false`. Each
call must produce a distinct Server instance with its own `_transport`.

## When this rule applies

Any time a service is shared across:
- main conductor session (`osSessionService`) AND fork sub-sessions (`forkService`)
- main conductor session AND scheduler-fired cron forks (`schedulerPollerService`)
- main conductor AND any future SDK query path (subagents, factory bridges, etc.)

If only one consumer ever runs at a time AND there's a clean teardown
between consumers, caching is safe. In EcodiaOS that's almost never true:
forks run concurrently with the conductor by design.

## Detection

- Symptom 1 (manager forks): `os_forks` shows manager rows with `is_manager=true`
  but no children with `parent_id=<manager_fork_id>`. Manager `tool_calls`
  counter never advances past pre-spawn baseline. `[FORK_REPORT]` claims
  workers were spawned.
- Symptom 2 (cron fire): conductor MCP transport drops at every cron-fire tick,
  reconnects ~1min later. Conductor cannot fork during the window but the cron
  fork itself spawns fine.
- Symptom 3 (process introspection): running fork process has
  `--allowedTools mcp__<name>__*` in its CLI args BUT the model's deferred-tools
  list doesn't include the corresponding tools. That gap is the silent loss.

To probe: in a fresh Node REPL, `const m = require('./service.js'); a = await m.getServer(); b = await m.getServer(); a === b`. If `true`, you have the
singleton trap.

## Origin

8 May 2026 16:40-17:14 AEST. Diagnosis fork `fork_mowkbcm4_ca76a0`. Earlier
signal: `fork_mov38cpu_054df5` (7 May) self-reported manager primitive
failed silently. Fix shipped commit `1c7ea11` on `forkConductorTool.js`.

## Cross-refs

- `~/ecodiaos/patterns/_archived/manager-forks-for-multi-worker-decomposition.md` â€” the
  primitive that depends on this rule.
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` â€”
  same shape: wired but dark surface, fails silently because no layer checks
  end-to-end.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` â€”
  manager forks emitting `[FORK_REPORT]` with sub-fork claims while no children
  appear is the canonical narration-vs-disk drift.
