# Ultracode audit: dispatch_worker -> signal_done -> close_my_tab chain

Adversarial multi-agent audit of the eos-laptop-agent scheduling 0th-class primitive. 3 mappers, 5 dimension finders, 58 three-lens refute votes (36 real / 22 refuted), 31 raw findings deduped to the distinct bugs below. Read-only. Run wf_9f27e06d-578, 2026-05-29.

Files: `D:/.code/eos-laptop-agent/tools/coord.js` (1099 lines), `cowork.js`, `scheduler.js`. HEAD commits audited: 820a4bd, 274f8d7, aa985d1, 9c856f8, 03bda17, cc52dba.

## The verdict in one line

The four hardening commits are defeated on the scheduler path. Closure for scheduler-spawned workers depends entirely on `kill_worker`, and `kill_worker` can never load a tab handle, so it refuses on every single tab (orphan, direction a). On the self-close path, the same commits elevated a positional `tabIndex` to FIRST match precedence gated only on `viewType`, which reintroduces wrong-tab-close of a live sibling (Woodford-murder, direction b). Both failure directions are live on HEAD right now, and the only backstop that would catch either is wired to run nowhere.

## CRITICAL

### C1. kill_worker can never load a tab handle - every scheduler worker tab leaks
`cowork.js:740-746`. `kill_worker` resolves the stored handle via `coord._loadWorkerRegistry ? ... : (coord.workers && coord.workers.get(...))`. `coord.js` exports NEITHER symbol (module.exports `coord.js:1071-1099`; `workers` is a module-private `const` at `coord.js:96`). Both branches are `undefined` -> `stored = null` -> `tab_handle` falls to `params.tab_handle`, which the scheduler never passes (`scheduler.js:331,497` call `kill_worker({tab_id})` only) -> always hits the refuse branch `no_safe_tab_handle_or_incomplete`. Independently, even if exported, `workers` is an in-memory Map in the coord process; registration crosses a process boundary via HTTP (`cowork.js:321-331`), so the cowork process reads an empty Map regardless. There is no disk-read fallback (it never reads `coordination/workers/<tab_id>.json`). Scheduler briefs (`buildBrief` `scheduler.js:107-136`) never instruct `coord.close_my_tab`, so this broken path is the ONLY closer.
**Fix:** give `kill_worker` a disk-read of `coordination/workers/<tab_id>.json` to recover `tab_handle` (same source coord writes), OR export a `coord.loadWorkerRegistry(tab_id)` that reads disk, not the in-process Map. Add `coord.close_my_tab` to the scheduler brief as a primary self-close so closure does not hinge solely on the scheduler-side path.

### C2. tabIndex is first match precedence, identity-blind - closes the wrong live chat
`coord.js:680-686` (`close_my_tab`), duplicated `cowork.js:770-775` (`kill_worker`) and `cowork.js:902-906` (cleanup Pass 1). Tier (a) accepts `group.tabs[storedTabIndex]` on the SOLE condition `viewType === CC_CHAT_VIEW_TYPE`. `storedTabIndex` is captured once at spawn (`cowork.js:449-454`) as a position in the viewColumn group, never refreshed. Any tab closing/opening/reordering at a lower index before close shifts the position, so the index now resolves to a DIFFERENT live CC chat. Because tabIndex wins first, the sentinel (b) and exact_label (c) tiers never run to veto. `viewType` proves "some CC chat", never "this worker's chat". For any non-trivial brief the sentinel and label both go stale via CC auto-title (`cowork.js:817-819`), so tabIndex is the SOLE surviving key in the common case.
**Fix:** never trust tabIndex alone. Require `group.tabs[storedTabIndex].label === stored.label_at_spawn` (or startsWith the sentinel) as a hard gate before accepting tier (a); on mismatch fall through to (b)/(c) or refuse. The caller already holds `foundExact.label` at `coord.js:715` - compare it locally, do not delegate to the bridge.

### C3. cleanup_orphan_workers - the only backstop - runs nowhere
`cowork.js:834` (defined), `cowork.js:1271` (exported as MCP tool), invoked NOWHERE else (full-repo grep). The scheduler wires four intervals + a boot startupCleanup (`scheduler.js:598-663`) but never the orphan sweep. coord's own 60s `sweepStaleWorkers` (`coord.js:792,840`) only marks registry rows terminated and unlinks `.spawned` markers (`coord.js:811-820`) - it explicitly never closes a tab. So the documented backstop ("periodically ... closes orphan tabs the strict close path could not match", `cowork.js:821-822`) only fires if a human calls it. It would actually work if scheduled: it is sentinel-only and disk-backed (`cowork.js:846-919`), so it is immune to C1.
**Fix:** wire `cleanup_orphan_workers` to a scheduler interval (e.g. every 5-10 min) alongside the existing four. This is the single highest-value fix - it is the safety net the whole "better leak than wrong-close" posture assumes exists.

## HIGH

### H1. exactLabel veto is not enforced in audited code
`coord.js:715`, `cowork.js:791-793`, `cowork.js:937-939`. The tabIndex close attaches `exactLabel` as a "belt-and-braces sanity check", but `ide.tabs_close` (`ide.js:275-277`) is a pure HTTP pass-through that does not read it, and nothing re-checks the closed tab's label after. So the entire post-Woodford safety story rests on an unaudited IDE-bridge implementation. **Fix:** enforce the label compare in the caller (see C2 fix) before issuing the close; do not rely on the remote.

### H2. scheduler NULLs dispatched_tab_id even when kill_worker refused
`scheduler.js:365,375,505`. `markComplete`/`startupCleanup` call `kill_worker` in a swallowing try/catch then unconditionally `UPDATE ... dispatched_tab_id = NULL`. `kill_worker` returns `ok:true` even on refuse (`cowork.js:810`), so the leak is invisible, and the only handle is then discarded - no later sweep can ever target that tab. **Fix:** gate the NULL-out on `kill_worker` returning `closed:true`; on refuse/error retain `dispatched_tab_id` for a retry sweep.

### H3. orphaned rows never close their tab and evade the boot sweep
`scheduler.js:461-467`. `staleLeaseRecovery` flips running>6h rows to `orphaned` setting only status+updated_at - never calls `kill_worker`, never sets `last_run_at`. The only path that closes orphaned tabs is `startupCleanup`, filtered `last_run_at > NOW() - 24h` (`scheduler.js:482-485`). Orphaned rows have stale/null `last_run_at`, so they are permanently excluded. A worker that dies mid-task leaks its tab forever. The 24h-since-boot assumption is exactly wrong for a weeks-long unattended deployment. **Fix:** call `kill_worker` on `dispatched_tab_id` at orphan time, OR set `last_run_at = NOW()` so the boot sweep window catches it.

### H4. signal_bound consume marks the wrong inbox message seen
`scheduler.js:256`. On matching a bound in `peek_inbox`, `dispatchOne` calls `read_inbox({topic:'chat.conductor.inbox', limit:1})` to clear it, but `readInboxForTopic` (`coord.js:380-393`) orders unread ASC and marks the OLDEST seen - not the matched bound (which arrives late, sorts last). Bound messages arrive ~84s after spawn, so under back-to-back dispatch the oldest unread is often a DIFFERENT task's `done`. That `done` is silently consumed before `completionPass` sees it, so that task never completes and orphans at 6h. **Fix:** consume by message id (`ack_message`), not `read_inbox(limit:1)`.

### H5. 30s signal_bound wait is below the 84.5s cold-MCP floor
`scheduler.js:35,248-276`. `SIGNAL_BOUND_TIMEOUT_MS = 30_000`, but observed cold-MCP latency to first `coord.*` call is 84.5s (load-bearing memory). On timeout the code does not retry - it marks the row `running` anyway and releases the launch-lock. That lock exists to serialise cred-rotation so a second dispatch cannot rotate `~/.claude/.credentials.json` out from under a still-binding worker; releasing at 30s defeats it in exactly the slow case it guards. **Fix:** raise the wait to >= 180000, or keep the lock held / leave the row in `dispatching` until bound is confirmed.

### H6. brief-paste failure leaks an untracked tab, then re-spawns a second
`scheduler.js:237-239`. When `dispatch_worker` spawns the tab but fails to paste (returns `{ok:false, orphan:true, tab_id, tab_handle, note:'call kill_worker'}`, `cowork.js:554-568`), the scheduler only checks `!result.ok` and throws, discarding `tab_id`/`orphan`/`tab_handle`. The row never reached `running` so `dispatched_tab_id` was never persisted, and the next tick re-leases and spawns a BRAND NEW tab. The briefless tab is invisible to every sweep. **Fix:** on `result.orphan`, immediately `kill_worker({tab_id, tab_handle: result.tab_handle})` before throwing.

### H7. signal_done and close_my_tab are non-atomic
`coord.js:563-572`. `signal_done({terminate:true})` marks the row terminated and unlinks `.spawned` as a separate op from `close_my_tab`. A turn-end/crash between them leaves a terminated row with an open tab, and the 60s sweep takes the early-continue branch for already-terminated rows (`coord.js:798-806`) which only touches `.spawned`, never the tab. Affects even healthy self-close workers. **Fix:** this is exactly what a scheduled `cleanup_orphan_workers` (C3) catches; alternatively have `signal_done({terminate:true})` trigger the close server-side.

### H8. zero test coverage of the close/kill match ladder
`coord.test.js` exercises only `signal_bound`/`signal_done` (`:79-156`); nothing registers a handle and asserts tier (a)/(b)/(c) selection or the refuse invariant. One test asserting `kill_worker` reads back a handle written by `setWorkerTabHandle` would have caught C1 instantly. The most safety-critical logic in the subsystem shipped untested. **Fix:** add a close-path harness with a mocked `ide.tabs` pinning precedence order + the refuse-and-leak diagnostic. This is the mechanism that keeps the invariant true commit-over-commit while unattended.

## MEDIUM (act after the above)

- **M1** `DEFAULT_WORKER_ACK_TIMEOUT_MS = 90000` (`cowork.js:50`) is below the mandated 180000 floor; non-scheduler callers inherit it and a cold worker binding at 84-95s is falsely classed orphan (and with `redispatch_on_orphan` spawns a duplicate tab). Raise to >= 180000.
- **M2** `cleanup_orphan_workers` Pass 1 inherits the positional staleness of C2 and its claimed-set dedup key (`label#ti`) does not protect across two distinct stale indices, so the backstop can itself wrong-close live tabs under tab churn (`cowork.js:904,957`). Fix C2 first, then add a label cross-check here too.
- **M3** `close_my_tab` hard-requires a fresh conductor `ide_bridge_port` via the non-stale-gated `loadConductorRegistration` (`coord.js:592-595`); a stale port after an unattended IDE restart makes the close silently fail. Prefer an agent-side sweep that owns a live port (C3) over the per-worker close.
- **M4** `completionPass` peeks `done` non-destructively and never consumes it (`scheduler.js:397`); a short-interval cron whose stale `done` has not aged out can have its re-leased new instance matched and killed mid-run. Ack the matched `done` by id on `markComplete` success.
- **M5** a row marked `running` without a confirmed bind is only recoverable after the 6h orphan timeout, not the 10min dispatching path (`scheduler.js:266,442,461`). Gate `running` on a real bind, or leave unbound rows in `dispatching`.

## Recommended label-pinning invariant (closes row 55c9d01f)

A worker tab is closable iff its CURRENT label still proves identity. Concretely: (1) persist `label_at_spawn` + sentinel to disk per worker (already done); (2) on close, accept a candidate tab ONLY when its live label equals `label_at_spawn` OR startsWith the sentinel - tabIndex is a tiebreaker WITHIN that filtered set, never a standalone key; (3) if no live tab passes the label gate, refuse and leave `dispatched_tab_id` intact; (4) a scheduled `cleanup_orphan_workers` reconciles the leaked-but-refused set against live tabs on the same label gate. Leak-not-murder becomes a true invariant instead of an aspiration, and it survives auto-title because the sentinel is the gate, not the index.

## Suggested status_board updates

- **55c9d01f** (`label_pinning_unresolved`): root cause is NOT label drift alone - it is C1 (kill_worker dead handle lookup) for orphan-accumulation and C2 (tabIndex-first identity-blind close) for wrong-close. Both live on HEAD. Next action: C1 + C2 + C3 fixes + H8 test harness.
- **851344f3** (`pending agent restart and e2e valid`): the e2e validations passed because they exercised the self-close path with short briefs (sentinel survived) and did not test the scheduler kill_worker path or label/index drift. Real coverage needs the H8 harness.

## Refuted / not real (transparency)

22 of 58 lens votes refuted their finding. The audit kept only findings where >=2 of 3 adversarial lenses confirmed real and unmitigated. Refuted candidates were mostly duplicate framings of C1/C2 across dimensions and a few concerns already guarded by the disk-backed registry in `cleanup_orphan_workers`.
