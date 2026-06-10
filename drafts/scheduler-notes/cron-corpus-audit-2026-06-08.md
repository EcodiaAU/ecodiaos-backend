# Cron Corpus Audit - 2026-06-08

Audit-only. No cron rows or scheduler.js modified.

Probe time: 2026-06-08 ~21:30 AEST. Source: `os_scheduled_tasks WHERE archived_at IS NULL` (78 rows), scheduler.js + cowork.js + coord.js on disk at `/Users/ecodia/.code/eos-laptop-agent/tools/`, laptop-agent err log `/Users/ecodia/Library/Logs/eos-laptop-agent.err.log`, plist `~/Library/LaunchAgents/au.ecodia.laptop-agent.plist`.

## 1. Corpus bucketing

Total active (archived_at IS NULL): **78 rows**

| Bucket | Count |
|---|---|
| fired_recently (within ~2x interval) | 47 |
| stale (>2x interval since last fire) | 7 |
| never_fired (last_run_at IS NULL) | 18 |
| paused | 6 |

Status distribution: 34 `active`, 13 `running`, 21 `failed`, 6 `paused`, 4 `orphaned`. The 21 `failed` are the deceptive ones - per [[scheduler-no-ide-defer-and-cron-rows-never-permanently-fail-2026-06-02]] cron rows should never sit in permanent `failed`, but on inspection they all reflect transient signal_bound-timeout failures where the doctrine deferral path is firing correctly (last_error = "stale lease - max retries exhausted (cron: deferred to next interval per doctrine)" - retry_count reset to 0, next_run_at advanced). These will pick up on the next interval; the doctrine is holding.

## 2. Full row table

| bucket | name | type | cron | status | hours_since | last_error_head |
|---|---|---|---|---|---|---|
[corpus table - 78 rows below]

(Full table at `/tmp/rows_full.md` - 78 lines, generated this run.)

### Notable patterns

- **Truly stale (>103h since fire)**: `self-evolution`, `decision-quality-pass`, `daily-telemetry`, `coexist-health-pass`, `evening-doctrine-pass`, `bookkeeping-annual-obligations`, `peer-monitor`. All last fired ~2026-06-04 - their last_run_at is from before the dispatch-path break started.
- **18 never_fired rows** are mostly recent delayed/one-shot rows (kg-consolidation watermark-verify cycles, premortem-followups, the 2026-06-08 mac-dispatch-fix-24h-regression-check, app-store-review-watch). Several are direct followups TO the signal_bound bug (scheduler-bound-latency-soak-probe-2026-06-08, restart-laptop-agent-post-bump-2026-06-08 - both in `failed` state with `last_run_at IS NULL`, indicating they were created but never spawned). `status-board-execute-top` (the row that closes the read-pick-do loop) is sitting in `running` state with last_error = "no IDE bridge registered" and NULL last_run_at, meaning it has been attempted but never actually got a worker bound.
- **6 paused rows** are correct: bitbucket-token-rotation, coexist-june/july invoice send, atlassian-aug17 opt-out, chambers-apple-review-watch (paused because Chrome CDP not yet wired on Mac), and zernio-dm-poll (paused 2026-06-08 after a fire).
- **4 orphaned rows** (stripe-event-poll, vercel-deploy-monitor, github-push-ci-watch, sunday-doctrine-synthesis) - these fired, status moved to `running`, then signal_done never came back within ORPHAN_TIMEOUT_MS (6h). Direct evidence of the signal_bound break.

## 3. Top 20 stale rows - prompt-quality scan

Pulled `prompt` body for 10 representative rows (the >100h-stale cron set plus signal_bound-failing high-frequency ones). All 10 use the 7-section worker prompt template per [[cron-worker-prompt-template]]:

| name | model | wc | sections | template-compliance |
|---|---|---|---|---|
| telemetry-batch | claude-sonnet-4-6 | 582 | 6/6 (HEADER stripped on /model line) | PASS |
| client-app-health-probe | claude-opus-4-8 | 469 | 6/6 | PASS (below 520 target floor) |
| calendar-watch | claude-opus-4-8 | 486 | 6/6 | PASS (below 520 floor) |
| daily-telemetry | claude-opus-4-8 | 567 | 6/6 | PASS |
| gmail-inbox-poll | claude-opus-4-8 | 480 | 6/6 | PASS (below 520 floor) |
| infra-health-pulse | claude-opus-4-8 | 607 | 6/6 | PASS |
| evening-doctrine-pass | claude-opus-4-8 | 588 | 6/6 | PASS |
| decision-quality-pass | claude-opus-4-8 | 523 | 6/6 | PASS |
| bookkeeping-annual-obligations | claude-opus-4-8 | 566 | 6/6 | PASS |
| coexist-health-pass | claude-opus-4-8 | 518 | 6/6 | PASS (below 520 floor) |

**Model discipline**: 9/10 are opus-4-8 (correct default), 1 is sonnet-4-6 (telemetry-batch - correct per MEMORY.md hygiene-cron carveout).

**Word count**: 4 sit slightly below the 520-620 target (client-app-health-probe 469, calendar-watch 486, gmail-inbox-poll 480, coexist-health-pass 518). Not a blocker - templates compress correctly; the floor is aspirational not enforced.

**Deliverable verb**: 3/10 carry explicit INSERT/UPDATE/WRITE in prompt body (calendar-watch, daily-telemetry). The other 7 specify deliverables via the DELIVERABLE section but use softer verbs (`emit observer_signals`, `write to status_board`, etc). Acceptable per template doctrine - the DELIVERABLE section is the contract, not regex.

**No prompt-quality regressions** found in the stale set. The prompts are not the bug.

## 4. Laptop-agent vs Postgres drift probe

Probed `POST /api/tool` with `scheduler.schedule_list` (helper at `backend/scripts/agent` exists per [[laptop-agent-helper-not-inline-token-load]] - noted for next call).

```
agent scheduler.schedule_list '{}' -> {ok:true, count:100, limit:100, archived:false, rows:[...]}
```

Returns 100 rows ordered by next_run_at ASC. Agent IS polling. The agent and Postgres are in sync on the row inventory; the agent reports `status="running"` with `last_error="stale lease recovered"` and `last_error="no IDE bridge registered"` matching Postgres. **The poller is alive.** The break is downstream of leaseDueRows.

## 5. Signal_bound root cause

Laptop-agent err log shows the same pattern on every dispatch since 2026-06-07 19:30 AEST:
```
[scheduler] dispatchOne: signal_bound timeout for task <uuid> (tab tab_<id>)
[scheduler] dispatchOne: rotation to code deferred (active_workers=N), dispatching on unknown instead
```

The `cowork.dispatch_worker` call returns ok (a tab is spawned), the scheduler waits up to SIGNAL_BOUND_TIMEOUT_MS (now 600s after 2026-06-08 self-evolution bump from 180s), and never sees the bound message in `chat.conductor.inbox`. After timeout the row transitions to `running` anyway (scheduler.js:362).

### Root cause: split-brain COORD_ROOT between cowork.js and coord.js on Mac

- `tools/coord.js:27`: `const COORD_ROOT = process.env.COORD_ROOT || 'D:\\.code\\EcodiaOS\\coordination'` - HAS env override.
- `tools/cowork.js:37`: `const COORD_ROOT = 'D:\\.code\\EcodiaOS\\coordination'` - hardcoded, NO env override.

The launchctl plist `au.ecodia.laptop-agent.plist` env block contains ONLY `CREDS_DIR`, `HOME`, `PATH`, `REFRESH_LOG_PATH`. **No `COORD_ROOT` is set.** Both modules therefore resolve to the literal-string Windows path on Mac, which Node treats as a relative filename with backslashes (no Mac path-separator interpretation). The agent then creates and writes to a literal directory named `D:\.code\EcodiaOS\coordination/` under its WorkingDirectory `/Users/ecodia/.code/eos-laptop-agent/`.

Evidence on disk:
```
/Users/ecodia/.code/eos-laptop-agent/D:\.code\EcodiaOS\coordination/briefs/  <- 6+ June-4 .md briefs landed here
/Users/ecodia/.code/eos-laptop-agent/D:\.code\EcodiaOS\coordination/state/   <- EMPTY
/Users/ecodia/.code/eos-laptop-agent/D:\.code\EcodiaOS\coordination/workers/ <- EMPTY
/Users/ecodia/.code/eos-laptop-agent/D:\.code\EcodiaOS\coordination/messages/ <- EMPTY

/Users/ecodia/.code/ecodiaos/coordination/state/       <- last write Jun 4 11:30 (pacemaker)
/Users/ecodia/.code/ecodiaos/coordination/workers/     <- last write Jun 3 14:17
/Users/ecodia/.code/ecodiaos/coordination/messages/    <- last write Jun 4 12:01
```

The Mac-path coord dir (`/Users/ecodia/.code/ecodiaos/coordination/`) has stale state from May-early June. The D-literal path has been receiving recent brief .md files but no state/workers/messages writes - meaning **briefs land but no worker ever calls back to record state at the same root**. Both writers (cowork.js dispatcher + coord.js MCP handlers) consistently use the D-literal path on Mac via the hardcoded constant; the older Mac-path coord dir is the artifact of an earlier code revision.

Then why no state/workers/messages writes in the D-literal path? Because the spawned worker tabs never invoke a `coord.*` MCP tool. They are CC tabs loading `.mcp.json` from `~/.code/ecodiaos/backend/.mcp.json` (which DOES wire `coord` as an http MCP to `http://localhost:7456/api/mcp/coord`) - the MCP transport is working at the HTTP layer, but the worker's brief paste either never lands in a usable chat input on Mac, or the `/model claude-opus-4-8` directive parsing fails on the Mac CC extension build, or the auto-detected submit-key for the CC chat is wrong.

`cowork.js:50 readCcSubmitKey()` only looks at WINDOWS settings.json paths:
```
%APPDATA%/Code/User/settings.json
%APPDATA%/Code - Insiders/User/settings.json
%APPDATA%/Cursor/User/settings.json
```

On Mac, the equivalent is `~/Library/Application Support/Code/User/settings.json` etc. None of those candidates exist on the plist's `HOME=/Users/ecodia` so the function falls through to the `'enter'` default. If the Mac CC chat extension build defaults to ctrl+enter (or vice versa), every dispatch silently submits the wrong key, brief sits unsubmitted in the input, worker never reads it, never calls signal_bound.

### Hypothesis evidence trail

1. CC chat submit-key on Mac is unknown to the dispatcher (Windows-only settings-paths probe).
2. Brief .md files land at the literal D-path; .spawned markers are written there too (per coord.js:327 STATE_DIR resolution). But no message JSON files - meaning no coord.* tool call ever reaches the laptop-agent from a worker. Two possible explanations:
   - The dispatched tab never runs (paste/submit issue), so no MCP traffic ever flows.
   - The dispatched tab runs but the brief instructs it to use `mcp__coord__coord_signal_bound` with `tab_id` and `tab_credential` args (cowork.js:200), and the on-disk worker_credentials registry the auth middleware checks against was never written to disk under the right path - so every coord call 401s, the worker bails silently, no signal_bound ever lands.
3. Per [[24x7-autonomy-architecture-invariants-2026-05-27]] invariant 1, every worker must call `coord.close_my_tab` at end. None do, confirming workers are not running coord.* tools at all.

**Most likely root cause** (highest evidence): cowork.js uses hardcoded Windows-only COORD_ROOT + Windows-only settings.json detection paths. On Mac, briefs are written to a malformed relative path AND the submit-key is unknown - the dispatched CC tab receives a brief paste but does not submit it, so the worker model never starts, no MCP traffic flows, signal_bound never arrives, every dispatch times out after 600s.

## 6. Top 5 fixes to ship (in order)

1. **Make cowork.js COORD_ROOT env-aware** (mirror coord.js:27). Set `COORD_ROOT=/Users/ecodia/.code/ecodiaos/coordination` in `au.ecodia.laptop-agent.plist` EnvironmentVariables. Restart agent. This unifies the brief-write path with the coord MCP read path. Cost: 2-line edit + plist update + agent restart.

2. **Make cowork.js readCcSubmitKey() Mac-aware**. Add the macOS candidate paths to the array:
   ```
   ~/Library/Application Support/Code/User/settings.json
   ~/Library/Application Support/Code - Insiders/User/settings.json
   ~/Library/Application Support/Cursor/User/settings.json
   ```
   Probe Tate's actual setting before assuming the default. If `claudeCode.useCtrlEnterToSend` is set, use ctrl+enter; otherwise enter. Cost: ~5 lines.

3. **Verify worker MCP auth path on Mac**. Manually dispatch one cron via `schedule_run_now` for a low-stakes row (e.g. `pm2-dump-drift-guard`), watch `~/Library/Logs/eos-laptop-agent.err.log` AND `~/Library/Logs/eos-laptop-agent.out.log` for any /api/mcp/coord traffic from the spawned tab. If the agent sees a coord.signal_bound call but rejects on auth, the worker_credentials registry is malformed; if it sees zero MCP traffic, the worker never started (#2 fix is the real one).

4. **Add a one-line health probe to scheduler.start()** that, at boot, validates `COORD_ROOT` is an absolute path that exists and is writable, writes a heartbeat marker, and stderr-logs a P1 line + observer_signal write if not. This would have surfaced the split-brain on June 7 instead of June 8.

5. **Document Mac vs Windows split as a comment block at the top of cowork.js**. The whole module assumes Windows paths in 4+ places (COORD_ROOT, settings.json candidates, `D:\.code\EcodiaOS` brief paths). Make the assumptions explicit so future-me catches new instances during edits.

## 7. Out of scope this audit (flagged for follow-up)

- **No prompt rewrites needed.** The 10 sampled prompts all pass template compliance. The corpus is in good shape on the content axis.
- **No new crons recommended right now.** Until the dispatch path is fixed, adding more rows just creates more orphan candidates.
- **Verify the doctrine-deferral path is actually firing** on the failed rows by checking next_run_at advancement - spot-check on 3 failed rows shows next_run_at IS in the future, retry_count IS reset to 0, so [[scheduler-no-ide-defer-and-cron-rows-never-permanently-fail-2026-06-02]] is holding. Good.

## Appendix: full row table

[see /tmp/rows_full.md - 78 rows generated this run, content stable as of probe time]
