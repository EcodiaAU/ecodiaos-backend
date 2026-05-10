---
triggers: status-board-row-granularity, bundle-sub-rows, tate-decision-point, consolidate-cluster, master-row-canonical, sub-artefact-row, carbon-mrv-bundle-cluster, drift-audit-consolidation, row-granularity, decision-point-vs-authoring-point, tate-review-pile, refresh-kili-language, stale-temporal-anchor
status: active
authored_at: 2026-05-10
authored_by: fork_moyjfvs5_b9df46
---

# Status_board row granularity matches Tate's decision-points, not the conductor's authoring-points

## Rule

When the conductor authors a cluster of status_board rows tracking distinct sub-artefacts of a single deliverable (a "bundle"), and the bundle is presented to Tate as ONE decision (review the whole bundle, decide go/no-go, select first warm-intro path), the row granularity must match Tate's decision-point — not the conductor's authoring-point. Consolidate sub-rows into a canonical master and archive the rest as duplicates.

A row exists to surface ONE decision. If Tate's wake-up dashboard shows 4 rows that all resolve the same way ("review the carbon-MRV bundle and decide"), the dashboard is lying about cardinality and the noise eats Tate's scan budget.

## Do

- After authoring sub-artefact rows over a multi-day work arc, audit at the moment the bundle stabilises: are these rows OR is this one row?
- If the cluster shares a single Tate-decision-point, designate ONE canonical master row that names the bundle, list all sub-artefacts in its `next_action`, and archive the others as `duplicate_subsumed_by_master_<id>`.
- The master row's status string should explicitly say `consolidated_2026-XX-XX_with_N_sub_rows_archived` so the consolidation is auditable.
- When Tate's temporal anchor on a row goes stale (e.g. "on Kili return" once Tate is back), refresh the row's `next_action` to drop the stale anchor AND `last_touched=NOW()`. Stale anchors signal "this hasn't been thought about" even when the underlying state is current.

## Do not

- Do not leave 4 rows blocking on the same Tate-decision in the active board because each was authored as a distinct artefact. The authoring history is in `context`, not in row count.
- Do not archive the canonical master with the duplicates. The master is what survives.
- Do not over-consolidate clusters where each row really IS a distinct decision. The test is: would Tate make ONE call resolving all rows simultaneously? If yes, consolidate. If no, don't.
- Do not refresh stale "Kili return" / "next time Tate is at keyboard" / "on tomorrow's review" language on rows where the underlying decision is no longer needed at all — archive those instead.

## Verification

After consolidation, the master row's `next_action` text should mention every archived sub-row's deliverable by file path or artefact name, so reading the master alone is sufficient context for Tate. Probe disk for any `drafts/` paths the row references — the `phantom-shipped` corollary applies (per `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`).

## Origin

2026-05-10 02:11 AEST. Meta-loop fork `fork_moyjfvs5_b9df46` ran Phase 2 drift audit on a 107-row active board and surfaced a 4-row carbon-MRV cluster (master `0ccc4847` "Carbon-MRV peak-body GTM target list" + 3 sub-rows: `1c38ccc4` revisions, `8e083d89` MRV add-on technical spec v1, `a1fec1ec` NRM biodiversity-certificate addendum). All 4 rows resolved to the same Tate-decision-point: review the carbon-MRV bundle. The 3 sub-rows were archived as duplicates and the master updated to consolidate all artefacts.

Same audit caught 5 unrelated rows (`651ae5a5` NRM Mat Hardy, `6b9161e1` NSW LLS Tess Herbert, `990306f4` HLW Julie McLellan, `0ccc4847` master, `10797cdd` conservation-platform thesis) carrying stale "Kili return" / "Kilimanjaro return" temporal anchors despite Tate being back from Kili and active in chat 8-9 May 2026. These were refreshed (drop Kili language, `last_touched=NOW()`) rather than archived because the underlying decision is still pending — the anchor was the only stale element.

## Cross-references

- `~/ecodiaos/patterns/status-board-drift-prevention.md` (parent doctrine — audit ruthlessly, archive aggressively, probe ground truth)
- `~/ecodiaos/patterns/drift-audit-slice-queries-beat-row-dump-queries.md` (Phase 2 mechanic — slice-query first to surface clusters)
- `~/ecodiaos/patterns/status-board-no-batch-case-when-update.md` (per-row writes only, never multi-row CASE WHEN)
- `~/ecodiaos/patterns/status-board-drift-audit-is-canonical-thin-on-main-meta-loop-work.md` (when the meta-loop fork executes the audit)
- `~/ecodiaos/patterns/re-probe-stale-health-check-readings-before-acting-on-cached-alerts.md` (sister rule for kv_store metric staleness)
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` (probe disk for any `drafts/` paths the consolidated master row references before consolidation)
