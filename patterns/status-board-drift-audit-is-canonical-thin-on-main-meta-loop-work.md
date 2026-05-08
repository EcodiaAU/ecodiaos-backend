---
triggers: meta-loop, status-board-drift-audit, fork-cap-full, mcp-forks-disconnected, thin-on-main, canonical-meta-loop-fallback, fork-cap-saturated, energy-cap-3, mcp-forks-transport-disconnect, drift-audit-on-main, status-board-bucket-classification, four-bucket-still-accurate-status-changed-completed-duplicate
---

# Status_board drift audit on main IS the canonical thin-on-main work for meta-loop fires

## Rule

When the hourly `meta-loop` cron fires and EITHER (a) the fork-cap is full / energy-cap saturated (no slot for `mcp__forks__spawn_fork`) OR (b) `mcp__forks__*` tools are disconnected (recurring P3 hourly transport-disconnect symptom, see `~/ecodiaos/patterns/sdk-mcp-server-instances-must-be-per-query-not-singleton.md`), the conductor on main MUST NOT exit with "nothing to do."

The canonical thin-on-main work for that fire is the **PHASE 2 status_board drift audit** described in `~/ecodiaos/patterns/status-board-drift-prevention.md` and embedded in the meta-loop's own scheduled prompt:

1. Run a slice-query first (see sibling pattern `~/ecodiaos/patterns/drift-audit-slice-queries-beat-row-dump-queries.md`) to surface red-flag counts: stale-7d, p1p2-stale-14d, monitor-rows, tate-blocked-high-priority, priority distribution.
2. Drill down on each red-flag category with `LIMIT 30` per category.
3. Classify each red-flagged row into the four buckets: **still-accurate**, **status-changed**, **completed**, **duplicate**.
4. UPDATE / archive / dedup atomically per row (one statement per row, never CASE-WHEN — see `~/ecodiaos/patterns/status-board-no-batch-case-when-update.md`).
5. Write the audit numbers (rows touched, archived, demoted, escalated) to `kv_store.ceo.meta_loop_last_run.accomplishments`.

This satisfies the operating doctrine simultaneously:

- **Demand-driven, not slot-fill** (`~/CLAUDE.md` Fork dispatch is demand-driven). The demand IS the meta-loop's PHASE 2 instruction, externally driven by the cron fire. Audit work is not manufactured to fill an empty slot.
- **Fork by default, stay thin on main** (`~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md`). status_board UPDATEs are exception (a): single targeted writes that ARE the deliverable, not orchestrated work that should fan out.
- **Act, don't symbolically log** (`~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md`). UPDATE rows directly — do not narrate "audit run" without artefacts.
- **Decide, do not ask** (`~/ecodiaos/patterns/decide-do-not-ask.md`). Routine archive/refresh requires no permission.

## Do

- Read the meta-loop's PHASE 2 instruction verbatim from the cron prompt before firing the audit. Do not improvise the bucket criteria.
- Run the slice-query template from `drift-audit-slice-queries-beat-row-dump-queries.md` FIRST when the board is >50 active rows. The slice exposes the work, the row dump drowns it.
- Classify every red-flagged row into one of the four buckets before any write: **still-accurate** (leave), **status-changed** (UPDATE next_action / status / last_touched), **completed** (`SET archived_at = now()`), **duplicate** (archive duplicate, keep canonical row).
- UPDATE atomically per row. One SQL statement per row. Anti-pattern is a single multi-row `CASE WHEN` UPDATE (see `status-board-no-batch-case-when-update.md`).
- Write the audit summary (rows touched, archived, demoted, escalated) to `kv_store.ceo.meta_loop_last_run.accomplishments` AND the audit cycle's Neo4j Episode if 3+ archives or 5+ updates land.
- Surface follow-up work as new status_board P3 rows when audit reveals work that needs forking later (e.g. "row X needs ground-truth probe via Bitbucket API"). The conductor next picks those up demand-driven on a subsequent fire.

## Do not

- Dump all rows. `SELECT * FROM status_board WHERE archived_at IS NULL` on a >50 row board exceeds the tool-result token cap. The query succeeds at the DB but the result is unusable. See sibling pattern `drift-audit-slice-queries-beat-row-dump-queries.md`.
- Manufacture forks to fill empty slots when the meta-loop's own PHASE 2 work is the appropriate response. Slot-fill spawns are symbolic activity in a parallel-process costume.
- Treat "monitor X" rows as automatically archive-eligible. Some are legitimate trigger-watchers (e.g. external-blocker waiting for Tate's call). Read `next_action_due` / context before archiving. Mode-2 in `status-board-drift-prevention.md` covers the genuine cases.
- Skip the audit because "everything looks fine" without slice-query evidence. The slice-query IS the evidence; the eyeball is not.
- SMS Tate from a meta-loop fire — autonomous-pilot rule (`~/ecodiaos/patterns/silent-alerts-defer-when-tate-is-live.md`, `~/ecodiaos/patterns/cron-prompts-must-respect-autonomous-pilot-sms-gate.md`). The audit produces durable artefacts; Tate reviews on his next session-open.
- Treat fork-cap saturation as a pass. The fact that no fork can be spawned does NOT relieve the conductor of the meta-loop's deliverable; it specialises which substrate carries the work (main, with single-row writes).

## Verification protocol

After running the audit, confirm artefacts:

1. `kv_store.ceo.meta_loop_last_run.accomplishments` MUST include drift-audit numbers (rows touched, archived, demoted, escalated). Bare narration ("ran audit") = `cron_silent_fire` per `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md`.
2. Re-run the slice-query. Numbers should have moved (e.g. monitor-rows count down, stale-7d count down). If unchanged, the audit was symbolic.
3. If 3+ archives OR 5+ updates landed, write a Neo4j Episode (Pattern: status_board-drift-audit-cycle).

## Origin

- 8 May 2026 15:53 AEST — meta-loop fire on a board with fork-cap saturated. Conductor correctly recognised that status_board drift audit was the canonical thin-on-main fallback, ran the audit, archived/updated rows. Same fire produced a Neo4j Pattern node observation but no .md file (deferred by edit-cycle constraint of fork_mowr2gn8_5d68bb, whose brief forbade touching `~/ecodiaos/patterns/*.md`).
- 8 May 2026 23:03 AEST — meta-loop fire on a 103-row board produced sibling Pattern 1398 ("Drift-audit slice-queries beat row-dump queries at scale") in same arc.
- Tonight — fork_mowxtqm8_66ef91 closes the gap: both patterns land on disk + Neo4j updated + cross-refs wired.

## Cross-references

- Parent: `~/ecodiaos/patterns/status-board-drift-prevention.md` — the original drift-prevention doctrine; this file specialises *when* (meta-loop fork-cap-full / mcp-forks-disconnected) and *who* (conductor on main, not a fork).
- Sibling technique: `~/ecodiaos/patterns/drift-audit-slice-queries-beat-row-dump-queries.md` — the slice-query template this pattern mandates for >50-row boards.
- Slot-fill prohibition: `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md`, `~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md`, `~/CLAUDE.md` "Fork dispatch is demand-driven" section.
- Decision authority: `~/ecodiaos/patterns/decide-do-not-ask.md` — no permission needed for routine archive.
- Update mechanic: `~/ecodiaos/patterns/status-board-no-batch-case-when-update.md` — one statement per row.
- Cron fire discipline: `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md`, `~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md`, `~/ecodiaos/patterns/cron-fire-responses-do-not-emit-applied-tags-as-chat-output.md`.
- External-blocker probe: `~/ecodiaos/patterns/external-blocker-freshness-probe.md` — the Tate-blocked-high-pri slice bucket invokes this when stalls exceed the freshness window.
