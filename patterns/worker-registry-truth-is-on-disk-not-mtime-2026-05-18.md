---
name: worker-registry-truth-is-on-disk-not-mtime-2026-05-18
description: Sweepers and registry consumers compute liveness from coordination/workers/<tab_id>.json fields, never from coordination/state/<tab_id>.spawned mtime. Mtime is spawn-time, registry is truth-time. They diverge by the lifetime of a worker.
triggers: worker-registry, tab-teardown, coord-sweeper, .spawned-mtime, terminated_at, last_heartbeat_at, worker-liveness, tab-accumulation, registry-vs-mtime, sweeper-blind, coord-workers-json, signal_done-cleanup, cursor-extension-sweeper, worker-death-detection, ide-tab-leak
status: active
---

# Worker registry truth is on disk, not mtime

The coord bus uses two substrates that look like they say the same thing but don't:

- **`coordination/state/<tab_id>.spawned`** - a marker file dropped when a worker spawns. Mtime = spawn-time. Never updated.
- **`coordination/workers/<tab_id>.json`** - the registry row. `last_heartbeat_at` updates every heartbeat. `terminated_at` is set on `signal_done`.

The registry is truth. The `.spawned` marker is a spawn-time signal that becomes stale the moment the worker dies. **Sweepers, garbage collectors, and "is this tab alive" checks MUST consult the registry, never the marker.**

## The rule

Anywhere code asks "is this worker alive":

```javascript
// WRONG: mtime of spawn marker
const liveWorkers = fs.readdirSync(STATE_DIR)
  .filter(f => f.endsWith('.spawned'))
  .filter(f => Date.now() - fs.statSync(path.join(STATE_DIR, f)).mtimeMs < 5*60*1000);

// RIGHT: registry truth
const liveWorkers = fs.readdirSync(WORKERS_DIR)
  .map(f => JSON.parse(fs.readFileSync(path.join(WORKERS_DIR, f))))
  .filter(w => !w.terminated_at)
  .filter(w => Date.now() - new Date(w.last_heartbeat_at).getTime() < 5*60*1000);
```

Two corollaries:

1. **`signal_done` MUST delete the `.spawned` marker** so even consumers that incorrectly use mtime get a partially-correct answer (gone = not running).
2. **The coord sweep loop MUST write `terminated_at` for workers whose `stale_ms > 2x DEAD_HEARTBEAT_MS`** even when they never called `signal_done` (crashed, killed, browser closed). The registry self-heals on a cadence; mtime never self-heals.

## Why

Audit 2026-05-18: 11 of 16 workers in `coordination/workers/` show ALIVE with hours-stale heartbeats and no `terminated_at`. The Cursor sweeper at `backend/laptop-agent/cursor-preview-extension/sweeper.js:108-122` reads `.spawned` mtime to decide "should I close idle tabs?" and a freshly-spawned worker that signal_done'd 30 seconds ago still has a fresh `.spawned` file blocking the sweep for 5 minutes. **The two layers don't agree on what "alive" means.** Tabs accumulate (status_board row 01f0b33e).

The root cause is two parallel "is alive?" signals where one is volatile (registry, updates every heartbeat) and one is frozen at spawn (marker file). Anything reading the frozen signal is reading a lie.

## How to apply

**On every coord codebase change:**

- Grep for `.spawned` references. Each one is a potential mtime-as-truth bug.
- Replace mtime reads with registry reads.
- If something MUST use a file existence check (e.g. cross-process locking), use a different filename pattern (`coordination/locks/<tab_id>.lock`) and unlink on release.

**On `signal_done`:**

```javascript
await atomicWriteJson(workersPath, { ...worker, terminated_at: nowIso });
fs.unlinkSync(path.join(STATE_DIR, ctx.tab_id + '.spawned'));  // belt-and-braces
```

**On coord sweep tick (every 60s):**

```javascript
for (const [tab_id, worker] of workers.entries()) {
  const stale_ms = Date.now() - new Date(worker.last_heartbeat_at).getTime();
  if (stale_ms > DEAD_HEARTBEAT_MS * 2 && !worker.terminated_at) {
    await atomicWriteJson(workerPath(tab_id), { ...worker, terminated_at: nowIso, terminated_reason: 'stale_heartbeat' });
    try { fs.unlinkSync(path.join(STATE_DIR, tab_id + '.spawned')); } catch {}
  }
}
```

**For new sweepers / consumers:**

Default to registry. If you find yourself reading `.spawned`, stop and ask whether registry would answer the same question. Almost always yes.

## Verification

- After a deliberate worker kill (Ctrl+W on its tab), the registry row gets `terminated_at` within 2x heartbeat threshold.
- After `signal_done`, the `.spawned` file is gone within 100ms.
- `liveWorkersPresent()` in Cursor sweeper returns the same set as `coord.list_workers({status: 'alive'})`.

## Origin

Coord-bus + dispatch_worker substrate landed 2026-05-17 / 2026-05-18. Tate flagged "every Telegram/SMS inbound spawns a new CC tab and tabs never close" (status_board row 01f0b33e, Tate verbatim 2026-05-17 05:19Z). The reflex-rewind-modal bug was a sub-issue; the structural bug is the two-layer mtime-vs-registry divergence. Audit 2026-05-18 isolated this as the load-bearing fix. SHIPPED 2026-05-18: sweep loop in `d:/.code/eos-laptop-agent/tools/coord.js` + `signal_done` unlink.

## Cross-refs

- [[coord-conventions-heartbeat-signal-done-2026-05-18]]
- [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]]
- [[conductor-wake-substrate-2026-05-18]]
- [[verify-deployed-state-against-narrated-state]]
- [[narration-vs-disk-reconciliation-checklist]]
