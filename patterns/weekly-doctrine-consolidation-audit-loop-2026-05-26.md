---
triggers: doctrine-consolidation-audit, weekly-doctrine-audit, doctrine-lifecycle-cron, pattern-application-rate, pattern-corpus-health-check, narrow-triggers-candidates, retire-or-restate-candidates, archive-candidates-quiet-patterns, dead-substrate-refs-audit, doctrine-self-improvement-loop, layer-3-telemetry-consumer, applied-tag-telemetry-rollup, recursive-improvement-cron, doctrine-drift-row
status: active
canonical: true
---

# Weekly doctrine consolidation audit loop

## Rule

The doctrine corpus self-improves through a weekly mechanical loop. Pattern-application telemetry (Layer 3, written by the Stop-event hook `applied_tag_telemetry.py`) feeds a deterministic audit script that classifies every pattern against four tuning thresholds and surfaces drift to status_board. No agentic decision component; pure aggregation.

The script: `D:/.code/EcodiaOS/backend/scripts/doctrine_consolidation_audit.py`. Run weekly via Windows Task Scheduler on Corazon (where the telemetry JSONL lives at `~/.claude/hooks/ecodia/logs/telemetry/application-events.jsonl`). Writes a P3 status_board row tagged `entity_ref='doctrine-consolidation-audit'` with the audit numbers + candidate lists. The conductor picks the row up demand-driven on the next session that touches doctrine work.

## Why

Doctrine corpus is 365+ patterns and growing. Without a mechanical drift detector, the corpus accumulates stale triggers, noise-fires patterns, dead-substrate refs, and zero-fire archive candidates faster than any human-led audit can clear. The 2026-05-26 Phase 0 audit found 122 of 365 patterns referenced dead substrate keywords and pattern-application telemetry was effectively dark (1 event total before Phase 1a rewired the hook). The fix is a recurring telemetry-driven loop, not a one-time consolidation pass.

This pattern lives as the third leg of the recursive-improvement substrate triad per `~/ecodiaos/patterns/recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18.md`: helper (the script) + hook (`applied_tag_telemetry.py` on Stop event, Phase 1a) + doctrine (this file).

## How to apply

### Cron registration

The script is a DIRECT_EXEC_CRON candidate (deterministic, no LLM cost, no fork dispatch needed). Two viable registration paths on Corazon:

1. **Windows Task Scheduler** (preferred for true weekly cadence):
   ```powershell
   $action = New-ScheduledTaskAction -Execute 'python' -Argument 'D:\.code\EcodiaOS\backend\scripts\doctrine_consolidation_audit.py'
   $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '21:00'
   Register-ScheduledTask -TaskName 'EcodiaOS-doctrine-consolidation-audit' -Action $action -Trigger $trigger -Description 'Weekly doctrine drift audit (Sunday 21:00 AEST)'
   ```

2. **PM2 cron on Corazon** (if Tate prefers PM2-managed; the laptop-agent already runs under PM2):
   Add a `cron_restart` block to `ecosystem.config.js` that invokes the script weekly.

Either path is fine. The script is idempotent; multiple fires per week produce the same status_board row via the `ON CONFLICT (entity_ref) DO UPDATE` clause.

### Output shape

A single P3 status_board row at `entity_ref='doctrine-consolidation-audit'`, with `context` of the form:

```
Doctrine consolidation audit (7d window). N active, M archived, K application events.
| Narrow-triggers candidates (NOT-APPLIED rate >70%, n>=3): pattern.md(0.85, n=4), ...
| Retire-or-restate candidates (tagged_silent >50%, n>=4): pattern.md(0.62, n=8), ...
| High-traffic patterns (most applied): pattern.md(12), ...
| Quiet patterns (P files >30d mtime + zero fires): name.md, name.md, ...
| Dead-substrate refs (D active patterns): name.md(6), name.md(5), ...
```

The row's `next_action_by='ecodiaos'`. The conductor reads it on its next session-orient, decides per-candidate (narrow trigger, archive, restate, fold into canonical), executes, archives the row when audit findings are processed.

### Thresholds (tunable in the script)

- `NARROW_RATE_THRESHOLD = 0.70` - `[NOT-APPLIED]` rate over 7d triggering trigger-tightening
- `SILENT_RATE_THRESHOLD = 0.50` - `tagged_silent` rate over 7d triggering retire-or-restate
- `ARCHIVE_QUIET_DAYS = 30` - days-without-fire + days-without-mtime-change classifying a pattern as archive candidate
- `DEAD_SUBSTRATE_KEYWORDS` - the keyword list flagging "this pattern still references a dead vehicle"

Tune these once we have a real baseline (4+ weeks of telemetry). Until then, use the defaults and treat the first few audit rows as exploratory data.

### Hand-off to the conductor

The audit row is read demand-driven, not interrupt-driven. The conductor sees it next time a doctrine-relevant action surfaces it (status_board hygiene hook keyword match on the row's context text, or any session-orient sweep). Per `~/ecodiaos/patterns/_archived/decide-do-not-ask.md` and `~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md`, per-row decisions (narrow / archive / restate / fold) are conductor-decides; never `next_action_by='tate'`.

## Cross-references

- [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]] - the meta-rule this loop honours.
- [[layer-3-applied-tag-telemetry-rewired-via-stop-event-2026-05-26]] - the telemetry producer this audit consumes.
- [[hook-matchers-must-follow-live-dispatch-primitive-not-dead-substrate-2026-05-26]] - the meta-rule for hook coverage that this audit periodically re-verifies.
- [[pattern-lifecycle-active-narrowed-archived]] - the three-state lifecycle the audit's classifications feed into.
- [[status-board-hygiene-is-a-0th-class-reflex-2026-05-21]] - the conductor-side reflex that surfaces the audit row when relevant.
- [[crons-route-to-forks-by-default]] - the dispatch routing principle this script intentionally bypasses (DIRECT_EXEC candidate).

## Origin

2026-05-26 doctrine consolidation Phase 6. Closes the loop opened in Phase 1a: telemetry alive at Stop event (Phase 1a), telemetry-consuming audit script + doctrine (Phase 6). The four phases between (1b/c hook migration, 2a-h cluster collapses, 3 client archive, 4 CLAUDE.md cuts, 5 hook quality pass) did the one-time consolidation work that the weekly cron now keeps from regressing.

Origin Tate verbatim 2026-05-26 (Phase 0 review answer): "Yes - add weekly self-audit cron." The audit's intent (recon doc §5.6) was explicit: "Once telemetry is collecting, run a 7-day baseline before any lifecycle classification decisions."
