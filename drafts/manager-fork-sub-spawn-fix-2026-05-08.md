# Manager-fork sub-spawn regression — fixed, awaiting validation

**Diagnosis fork:** `fork_mowkbcm4_ca76a0`
**Date:** 8 May 2026 17:14 AEST
**Status board row:** `c3c6af20-bc43-4336-b26b-9c570e9865e6` (P3, awaiting validation)
**Related row:** `a5d7c6a0-ed92-4294-bbc3-f2460998c07a` (cron-fire transport drops, same root cause)

## Root cause

`src/services/forkConductorTool.js` cached a single MCP `Server` instance in
`_serverConfig` and returned it from every `getForkConductorMcpServer()` call.
The `@modelcontextprotocol/sdk` `Server.connect()` method
(`node_modules/@modelcontextprotocol/sdk/dist/esm/shared/protocol.js:215-218`)
throws `Already connected to a transport` if the same instance is connected
to a second transport. The Claude Agent SDK's `connectSdkMcpServer()` silently
catches this in a `.catch()` and removes the server from
`sdkMcpServerInstances`.

Sequence:
1. Conductor (or first SDK query) calls `getForkConductorMcpServer()` → cached
   instance created, `connect(transport_A)` succeeds.
2. Fork spawns. `getForkConductorMcpServer()` returns same cached instance.
   SDK calls `instance.connect(transport_B)` → throws.
3. Tool surface for the fork lacks `mcp__forks__*` even though `--allowedTools`
   lists them (Object.keys ran before the connect attempt).

Manager-flagged forks could describe sub-fork plans and emit `[FORK_REPORT]`
claiming workers were spawned, but no rows ever appeared in `os_forks` with
`parent_id=<manager_fork_id>`.

Symmetric symptom: cron-fired forks claim the transport second, conductor
loses its transport. Recurring "MCP transport disconnects on hourly meta-loop
fire" matches this exactly.

## The fix (commit `1c7ea11`)

Make `getForkConductorMcpServer()` a per-query factory:
- Cache the SDK module import + `tool()` wrappers (pure data, safe to reuse).
- Build a fresh `createSdkMcpServer()` instance on every call so each SDK
  query owns its own `Server` with its own `_transport` slot.

Pre-commit validation:
```
node -e "(async () => {
  const m = require('./src/services/forkConductorTool.js');
  const a = await m.getForkConductorMcpServer();
  const b = await m.getForkConductorMcpServer();
  console.log('same?', a === b, 'instance same?', a.instance === b.instance)
})()"
```
Output: `same? false instance same? false` — each call returns a distinct
Server instance. ✓

## Why I did not pm2 restart

Brief constraint: "Sister fork is fixing ecodia-api restart loop in parallel.
Do NOT pm2 restart ecodia-api yourself."

Sister fork `fork_mowkasur_95685e` finished at 07:07 UTC, shipped commit
`15fa2d8` adding a fork-aware restart-defer guard on top of `d7b8388`. Both
fixes ride on the next natural restart. Restarting now would also kill me
(this fork) before I emit `[FORK_REPORT]`.

## What main needs to do

1. **Trigger a controlled `pm2 restart ecodia-api`** when no critical forks
   are active. `15fa2d8` should now defer if forks are running.
2. **Validate**: spawn a tiny test manager fork with brief
   `MANAGER: true. Spawn one sub-fork that runs echo and exits. Report both fork_ids.`
   Verify both fork_ids appear in `os_forks` with `parent_id` linkage.
3. **Archive both rows** (`c3c6af20`, `a5d7c6a0`) once validation passes.

## Doctrine

Authored: `~/ecodiaos/patterns/sdk-mcp-server-instances-must-be-per-query-not-singleton.md`

Triggers cover: `createSdkMcpServer`, `forkConductorTool`, `getForkConductorMcpServer`,
`mcp-server-singleton`, `already-connected-to-a-transport`, `mcp-transport-stolen`,
`manager-fork-sub-spawn-broken`, `forks-mcp-transport-disconnects`,
`mcp__forks__-missing-from-fork-surface`.

## Commits

- `1c7ea11` — `fix(forks): per-query in-process MCP server instance — restores manager-fork sub-spawn`
- `217a740` — `doctrine(forks): codify SDK in-process MCP Server singleton trap`

Both pushed to `origin/main`.
