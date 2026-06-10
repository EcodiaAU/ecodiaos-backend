# Auto-memory hygiene 2026-06-08

## Numbers

Memory files before five, after five. MEMORY.md lines before five, after five. Files archived zero. Files promoted to Neo4j Pattern node zero. Files left in place five.

## Inventory and classification

| File | Type | Age | Status |
|---|---|---|---|
| `kv-mirror-substrate.md` | reference | under 1d | left in place |
| `ecodia-conductor-decommissioned-2026-06-08.md` | project | under 1d | left in place |
| `cred-rotation-works-on-mac-2026-06-08.md` | project | under 1d | left in place |
| `cron-prompts-default-to-opus-4-8-explicit-ids.md` | feedback | under 1d | left in place |
| `feedback_ecodia-marketing-title-template.md` | feedback | under 1d | left in place |

## Archive pass

Zero candidates. All five memories were authored 2026-06-08. The doctrine demotion path requires age over 90d plus no inbound rels plus no retrieval hits in 30d. None qualify.

## Promotion pass

Threshold is cited at least three times in `patterns/`. Results below.

`kv-mirror-substrate` has zero cites in `patterns/`. Reference type, not promotion shaped (machine-local pointer). Stays as memory.

`ecodia-conductor-decommissioned-2026-06-08` has zero cites. Project state record of a one-time decommission. The architectural rule it implies sits already in `backend/CLAUDE.md` ARCHITECTURE DELTAS table plus `pm2-restart-reloads-dangerous-dump-never-blind-restart-2026-05-27`. No promotion needed.

`cred-rotation-works-on-mac-2026-06-08` has zero cites in `patterns/`, but the matching pattern `cred-rotation-mac-port-shipped-2026-06-08.md` already exists. Memory is the session level "we landed it" record. Doctrine is already promoted. No action.

`cron-prompts-default-to-opus-4-8-explicit-ids` is referenced by `patterns/cron-worker-prompt-template.md` (1 cite). Pattern already exists. Memory is the originating feedback. Below threshold for promotion. Doctrine is already in place.

`feedback_ecodia-marketing-title-template` has zero cites in `patterns/`. Highest leverage candidate (clear triggers plus how to apply plus anti patterns) but brand new and below the three cite threshold. Re-evaluate next hygiene run if cites accrue. Holding back per the task brief rule against pre-promotion on speculation.

## MEMORY.md sanity pass

All entries one line: yes (5 of 5). All entries follow `[Title](file.md) hook` format: yes. All referenced files exist: yes. Total line count at or under 200: yes (5). Reordered by semantic cluster (was chronological). Substrate and infrastructure first (conductor, kv-mirror, cred-rotation). Cron doctrine next. Brand doctrine last.

## Outstanding for next run

Marketing title template memory is the next promotion candidate once cite count rises. Add a `triggers:` hook on the marketing title PreToolUse path if regressions recur.

Verify cron prompts memory is still useful after 30d. The `claude-opus-4-8` model ID will move. Check if a generalisation lift to "always pin model IDs explicitly" doctrine is warranted.
