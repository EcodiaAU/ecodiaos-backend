# Factory migration decision - 2026-05-15

**Lane:** C1 of VPS-to-local migration.
**Authored by:** EcodiaOS-on-Corazon (Lane C chat).
**Supersedes:** the open-question section in `MIGRATION_FULL_ARCHITECTURE_2026-05-15.md` §4 (which named (a) Routines + (c) sub-agents as candidates and parked the call).

---

## 1. Current Factory volume

Queried VPS Postgres `cc_sessions` for the trailing 14 days (2026-05-01 - 2026-05-15):

| Metric | Value |
|---|---|
| Total sessions | 34 |
| Avg duration | 5.5 min |
| Avg files changed | 0.0 |
| Status = complete | 2 |
| Status = error | 5 |
| Status = other (queued, running, abandoned, etc) | 27 |
| Deploy_status = deployed | 0 |

Breakdown by trigger:

| triggered_by | count |
|---|---|
| cortex | 28 |
| proactive | 6 |

Read: ~2.4 sessions/day, ~6% completion, **0 deploys** in the trailing 14 days. The Factory worker pool is over-engineered for a load that has effectively collapsed. The Apr-2026 policy split (Agent SDK $200/mo cap from 15 Jun 2026) only forces a decision; the volume already argued for collapsing the lane.

---

## 2. The three options (with rationale)

### Option (a) - Factory becomes a Routine on Anthropic cloud

POST a code-shipping brief to `factory-cloud` Routine /fire endpoint on a dedicated account.

| Dimension | Assessment |
|---|---|
| Cost | Subscription pool (no SDK credit). Cost-neutral. |
| Capability ceiling | Full Claude Code in a cloud worktree. Identical to the existing CLI surface for code shipping. |
| Latency | Higher than local (cloud spin-up + clone + cap sync round-trip). Each /fire is a fresh session. |
| Debuggability | Routine session logs visible at claude.ai/code/routines. No local console. |
| Failure recovery | Re-fire. No worker-pool state to clean. |
| Worktree isolation | Native (cloud session has its own clone). |
| Filesystem access | Cloud-only - cannot touch D:/.code/EcodiaOS directly. Repo work clones-and-pushes. |
| Parallelism | Multiple /fire calls run in parallel as separate sessions. |

### Option (b) - Accept Agent SDK $200/mo credit budget for `claude -p`

Keep the worker pool, accept the cap.

| Dimension | Assessment |
|---|---|
| Cost | $200/mo per Max account hosting Factory. Burns fast under any meaningful load. |
| Capability ceiling | Unchanged. |
| Latency | Unchanged (~30-60s spin-up per session). |
| Debuggability | Unchanged. |
| Failure recovery | Unchanged. Worker pool + Redis state remain. |
| Migration cost | Zero. |
| Sustainability | Capability collapses by mid-month at even modest volume. Not viable past 15 Jun 2026 at any volume above current. |

### Option (c) - Drop Factory, route code-shipping through Task subagents in the local Claude Code conductor

Code work on D:/.code/EcodiaOS (or any local repo Corazon can reach) runs as a Task subagent inside the interactive conductor session.

| Dimension | Assessment |
|---|---|
| Cost | Subscription pool (Task subagents bill against the interactive session's pool). Cost-neutral. |
| Capability ceiling | Full Claude Code + filesystem + Tailscale + Corazon shell. Same as the interactive conductor itself. |
| Latency | Zero spin-up. Subagent fork is instant. |
| Debuggability | The conductor sees subagent output directly in the session. No console-hopping. |
| Failure recovery | Subagent abort, re-spawn. No external state. |
| Worktree isolation | Manual (subagent shares conductor's cwd unless given an explicit worktree). |
| Filesystem access | Native to Corazon. |
| Parallelism | Multiple subagents in one conductor message run in parallel. Single conductor = serialisation across messages. |
| Reach to other repos | Anything Corazon can `git clone` from. Same as the old Factory worker. |

---

## 3. Decision

**Hybrid: (c) is the default. A narrowly-scoped factory-cloud Routine (option (a)) covers the one case (c) can't.**

### (c) for the 95% case

Every existing Factory dispatch source (cortex, CRM stage change, email, KG insight, prediction, Simula proposal, Thymos incident, scheduled maintenance, proactive improvement, integration scaffold) is now redirected:

- The trigger writes a `code_requests` row (existing table, no schema change) with the brief.
- `factoryTriggerService.dispatchFromCortex` and friends no longer push to Redis; they tag the row `route='subagent'` and return.
- The conductor sees the new row via its normal status_board / kv_store orientation and dispatches a Task subagent against it on the next turn (or sooner if a perception event surfaces).
- Subagent ships, marks the row done, writes an Episode.

### (a) for self-modification only

The one path (c) cannot safely cover is **self-modification** (Factory editing the ecodiaos-backend that the conductor itself runs on). Editing your own codebase from a Task subagent in your own session is a foot-gun:

- Subagent edits a file the conductor's next turn reads → stale require()-cache wedge.
- Mid-edit conductor compact wipes the subagent's working memory.
- A bad edit can wedge the conductor mid-flight.

Per `audit-low-confidence-factory-commits-on-critical-path.md` and `factory-phantom-session-no-commit.md`: self-mod needs cloud isolation. So:

- `dispatchSelfModification`, `dispatchSelfDiagnosis`, and `dispatchIntegrationScaffold` POST to a `factory-cloud` Routine on a dedicated account (4th account or money@ with low schedule density).
- That Routine clones ecodiaos-backend, ships the edit, opens a claude/* PR, returns the PR URL.
- The conductor reviews via existing `review_factory_session` MCP tool surface (which now reads from a PR rather than a `cc_sessions` row).

### What gets deleted

- `~/ecodiaos/src/workers/factoryRunner.js` - Phase 4 tear-down.
- The Redis pub/sub channels `factory:session:request|complete|status|send|stop|resume` - Phase 4.
- The Factory CLI worker pool `~/ecodiaos/factory/` directory - Phase 4.
- The cc_sessions table stays (history) but stops being written.

### What stays

- `code_requests` table - now the canonical work queue for all code-shipping (subagent and factory-cloud).
- `factory_learnings` table - subagent dispatch reads it for the dedup gate, same as before.
- The dedup logic in `factoryTriggerService._shouldSuppressDispatch` - moves verbatim into the subagent dispatch path.
- The 5-layer verification gates (per the factory pattern set) - applied to subagent output before approval.

---

## 4. Rationale - the meta-doctrine that picks this

Three patterns drove the call.

### `factory-quality-gate-over-cron-mandate.md`

> A rejected Factory session costs: original compute + review pass + rejection reasoning + re-dispatch scoping + trust cost.

At 0 deploys in 14 days, every Factory session in the trailing window was either incomplete or rejected. The "worker pool with parallelism" framing assumed a high enough load that serialising would block work. Volume says that assumption is dead. The pool's overhead now outweighs its parallelism benefit.

### `decide-do-not-ask.md`

> Pick the better option, ship, inform. The cost of escalating a routine decision is Tate's director attention.

The Migration Doc parked the call ("(a) with (c) as fallback"). Lane C closes it: (c) primary, (a) self-mod only. Documented here. Not surfaced to Tate as a question.

### `judgement-over-rule-when-blind-application-defeats-the-purpose.md`

The Migration Doc's preferred option (a) assumed Factory volume justified a separate cloud surface. The volume number defeats that purpose. Override on cost-disproportionate grounds. Receipt: this document.

---

## 5. Implementation plan - concrete changes

### 5a. `backend/CLAUDE.md` - new sub-agent dispatch protocol section

Add a section "Sub-agent dispatch protocol (post-2026-05-15)" documenting:
- code work routes via Task subagent by default
- self-modification routes via factory-cloud Routine
- the new `code_requests.route` field tells the conductor which lane

### 5b. `backend/routines/factory-cloud.md` - new Routine prompt

Trigger=api. Receives POST with `{ brief, codebase, route_back_kv_key }`. Clones the codebase, ships the change in a `claude/factory-cloud-<timestamp>` branch, pushes, opens a PR, writes the PR URL to the named kv_store key, writes a Decision node.

### 5c. `backend/src/services/factoryDispatch.js` - rewrite (new file, replaces direct factoryTriggerService usage from Cortex)

```
function dispatch({ brief, trigger, codebase, selfMod, ... }) {
  if (selfMod || isCriticalPath(codebase)) {
    return _dispatchToFactoryCloud(...)   // POST /fire
  }
  return _writeSubagentCodeRequest(...)   // INSERT code_requests row, tag route='subagent'
}
```

The existing factoryTriggerService stays for the Phase 0-3 side-by-side window (it still spawns the Redis pool). Phase 3 cutover swaps its export functions to call factoryDispatch instead.

### 5d. `code_requests` migration - add `route` column

```sql
ALTER TABLE code_requests
  ADD COLUMN IF NOT EXISTS route TEXT
    CHECK (route IN ('subagent','factory_cloud','legacy_workerpool'))
    DEFAULT 'legacy_workerpool';
```

New rows from the post-cutover dispatch use `route='subagent'` or `'factory_cloud'`. Old rows keep `'legacy_workerpool'`. The conductor's subagent picker queries `WHERE route='subagent' AND status='pending'`.

### 5e. Conductor doctrine in `backend/CLAUDE.md` - explicit subagent invocation pattern

Add: when the conductor sees `code_requests.route='subagent' AND status='pending'`, it spawns a Task subagent with the brief, the codebase path, and the row id. The subagent updates the row to `status='in_progress'` on start, `'shipped'` (with commit_sha) on done, `'failed'` (with reason) on abort. The conductor never reaches for the old `start_cc_session` MCP tool for new work.

### 5f. Phase 4 deletions (deferred, tracked in status_board)

- delete `~/ecodiaos/src/workers/factoryRunner.js`
- delete `~/ecodiaos/factory/` worker pool directory
- delete the Factory section of `~/ecodiaos/src/services/factoryBridge.js` (keep `runBackgroundJob` for the kg/inner-life background LLM use case - that path is unaffected)
- archive `~/ecodiaos/src/services/factoryTriggerService.js` after the side-by-side window proves the new path

---

## 6. What ships in Lane C (this session)

| Item | Status |
|---|---|
| `backend/docs/FACTORY_MIGRATION_DECISION_2026-05-15.md` (this doc) | shipping in this commit |
| `backend/routines/factory-cloud.md` | shipping in this commit |
| `backend/src/services/factoryDispatch.js` | shipping in this commit |
| `backend/CLAUDE.md` - new "Sub-agent dispatch protocol" section | shipping in this commit |
| Migration 0XX_code_requests_route.sql | DEFERRED - low-priority, the dispatch can write the column lazily on first use; full migration in Phase 4 with the deletion of the legacy_workerpool path |
| Phase 4 deletions | DEFERRED to Phase 4 (after 7-day side-by-side validation) |

---

## 7. Risk register

- **R1 - Subagent edits its own runtime files mid-turn.** Mitigation: the `selfMod` flag in `dispatch()` routes any edit to ecodiaos-backend through factory-cloud. The classifier `isCriticalPath()` flags the same.
- **R2 - Loss of worker-pool parallelism for Cortex bursts.** Mitigation: Cortex traffic is 28/14d = ~2/day. Burst risk is negligible. If load grows past ~5 concurrent code requests, parallel Task subagents inside one conductor message handle it.
- **R3 - factory-cloud Routine token-fire flow not yet wired.** Mitigation: Lane D (routines + /fire shims) owns this; Lane C documents the contract (POST body shape, kv_store route-back key). When Lane D lands, factory-cloud /fire works.
- **R4 - Existing CRM/email/Simula triggers still call factoryTriggerService directly.** Mitigation: Phase 0-3 side-by-side window. After Phase 3 cutover, the trigger services call factoryDispatch (the new shim). Both paths coexist until the legacy pool is deleted.
- **R5 - Self-modification audit gate (per the audit-low-confidence-factory-commits-on-critical-path.md pattern) needs to survive the migration.** Mitigation: the factory-cloud Routine prompt enforces the gate end-to-end inside the cloud session before the PR is opened.

---

## 8. Decision and receipt

Decision: **drop Factory worker pool, route code-shipping through Task subagents, retain a narrow factory-cloud Routine for self-modification.** Authored 2026-05-15 by Lane C of the VPS-to-local migration.

Pattern receipts:
- [APPLIED] `decide-do-not-ask.md` - call closed without escalating.
- [APPLIED] `factory-quality-gate-over-cron-mandate.md` - volume data forces collapse of the lane.
- [OVERRIDE] `MIGRATION_FULL_ARCHITECTURE_2026-05-15.md §4 preferred option (a)` because the 14-day volume data (34 sessions, 0 deploys) defeats the purpose the cloud-Routine surface was sized for. Receipt is this document.
