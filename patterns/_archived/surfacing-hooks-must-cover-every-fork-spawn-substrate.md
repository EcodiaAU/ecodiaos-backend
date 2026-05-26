---
triggers: cron fork spawn, hook coverage, surfacing substrate, dispatch telemetry, cron dispatcher, hook blind spot, phase d coverage, cron telemetry
status: active
archived_at: 2026-05-26
archived_reason: sdk-fork-substrate-deprecated-2026-05-17
superseded_by: hook-matchers-must-follow-live-dispatch-primitive-not-dead-substrate-2026-05-26.md
---

# Surfacing hooks must cover every fork-spawn substrate, not just the MCP tool-call path

## Rule

Every path that spawns a fork must run the Phase D surfacing hooks (brief-consistency-check, cred-mention-surface, etc.) against the brief before spawning. The SDK harness PreToolUse/PostToolUse hooks cover ONE substrate: the conductor model calling `mcp__forks__spawn_fork`. Any other spawn path is dark unless explicitly wired.

## Why this matters

The Decision Quality Self-Optimization telemetry (dispatch_event + surface_event + application_event) is only accurate for the substrates it actually observes. A spawn path that bypasses the hook layer produces dispatch_event rows with `surfaces=[]`, which makes pattern coverage look high when it is actually zero for that substrate.

As of May 2026, the cron substrate (cronForkDispatcher.js) accounts for ~90%+ of daily fork spawns. Before this pattern was codified, every email-triage, system-health, inner-life, deep-research, self-evolution, morning-briefing, and all other cron-routed forks produced zero telemetry - making the Phase D layer measure ~10% of actual work.

## Do

- When adding a new fork-spawn path (server-side function, webhook handler, scheduler poller, event listener), add a `_runHooksForCronBrief(brief, contextName)`-style call before the spawn.
- Pass `tool_name: 'cron_fork_spawn'` (or a more specific synthetic name) in the synthesized payload so `derive_kind_from_tool()` in `emit-telemetry.sh` maps it to the correct `kind` value.
- Always fire-and-forget + catch - hook errors must never block spawn.
- Log `[BRIEF-CHECK WARN]` / `[CONTEXT-SURFACE WARN]` / `[CRED-SURFACE WARN]` lines to server log (no model turn available to inject into).

## Do not

- Assume the SDK harness hooks cover all fork spawns. They cover ONLY the case where the conductor model makes a `mcp__forks__spawn_fork` tool call through the Claude SDK.
- Gate spawn on hook output (hooks are warn-only by design).
- Skip the telemetry path even when the brief is short or "obviously safe" - coverage consistency is more valuable than per-brief judgment.

## Verification protocol (five layers - per listener-pipeline-needs-five-layer-verification.md)

1. **Producer**: cronForkDispatcher calls `_runHooksForCronBrief()` before every spawn
2. **Hook execution**: hook scripts receive valid JSON on stdin, emit JSONL to `logs/telemetry/dispatch-events.jsonl`
3. **Consumer**: dispatchEventConsumer reads JSONL, inserts `dispatch_event` rows with `action_type='cron_fork_spawn'`
4. **DB row**: `SELECT action_type, COUNT(*) FROM dispatch_event GROUP BY action_type` shows `cron_fork_spawn` entries appearing within 15 minutes of a cron fire
5. **Telemetry query**: `/api/telemetry/decision-quality` returns `cron_fork_spawn` entries in the distribution

## Origin

Status board row "Decision Quality telemetry has cron-driven blind spot" (2026-05-04, priority 3). Probe confirmed the hooks fire exclusively via SDK harness matcher on `mcp__forks__spawn_fork`. cronForkDispatcher.js calls `forkService.spawnFork()` directly in Node.js - no model turn, no MCP tool call, no hook fire. Fixed by adding `_runHooksForCronBrief()` to cronForkDispatcher.js (commit shipped 2026-05-11, fork_mp1i2ryr_9e9896).

`emit-telemetry.sh` already had `cron_fire` as a reserved kind comment, confirming this gap was anticipated at the telemetry layer but never wired at the spawn layer.

## Cross-references

- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` - five-layer check for any listener subsystem
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` - the Layer 1/2/3/4/5 architecture this hook covers
- `~/ecodiaos/patterns/crons-route-to-forks-by-default.md` - why the cron substrate is the dominant spawn path
- `~/ecodiaos/scripts/hooks/lib/emit-telemetry.sh` - `derive_kind_from_tool()` case arm for `cron_fork_spawn`
- `~/ecodiaos/src/services/cronForkDispatcher.js` - `_runHooksForCronBrief()` implementation
