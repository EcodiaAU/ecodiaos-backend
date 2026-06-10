---
title: Pattern corpus health check
date: 2026-06-08
author: EcodiaOS
register: doctrine
---

# Pattern corpus health check 2026-06-08

## 1. INDEX.md regen result

Ran `node scripts/regen-patterns-index.js` twice this session.

- First pass before any moves: 393 active files indexed, 25+ rows added vs prior INDEX.md (covering all the 2026-06-08 patterns that landed since last regen and a few back-dated patterns Tate authored over the weekend).
- After three archive moves (see section 2): 390 active files indexed, 0 missing triggers, all rows written.

Active count delta this session: 394 -> 391 (three moved to `_archived/`). Archived count: 61 -> 64.

## 2. Supersession candidates and actions

### Archived this session (3 moves, all in working tree, not committed)

| File | Why dead | Superseded by |
|---|---|---|
| `conductor-coordinates-capacity-is-a-floor.md` | Rule operationalises against `mcp__forks__list_forks` + `get_factory_status`. Both decommissioned. Capacity-floor concept still alive but lives elsewhere. | `dispatch-worker-is-0th-class-coord-primitive-2026-05-18`, `continuous-work-conductor-never-idle` |
| `failure-classifier-operational-vs-doctrine.md` | Rule operationalises against Phase D classifier on `os_forks`/`cc_sessions` fork-spawn surface. SDK fork primitive decommissioned 2026-05. | `decision-quality-self-optimization-architecture`, `dispatch-worker-is-0th-class-coord-primitive-2026-05-18` |
| `cron-fire-responses-do-not-emit-applied-tags-as-chat-output.md` | Rule operationalises against `mcp__forks__spawn_fork` + `mcp__factory__start_cc_session` + the frontend chat surface (CCStream.tsx). All three retired. | `dispatch-worker-is-0th-class-coord-primitive-2026-05-18`, `layer-3-applied-tag-telemetry-rewired-via-stop-event-2026-05-26` |

All three carry frontmatter `status: archived` + `archived_at: 2026-06-08` + `archived_reason` + `superseded_by`. Voice-check passed (93-100 / 100 on doctrine register).

### Supersession candidates (DEFERRED, not archived this session)

Conservative read - the rule body still has live applicability, even though some triggers reference dead substrate.

| File | Concern | Proposed action |
|---|---|---|
| `sdk-mcp-server-instances-must-be-per-query-not-singleton.md` | Triggers and rule body operationalise against ecodia-api in-process MCP servers + `forkConductorTool`. ecodia-api still alive (per current canonical PM2 list); SDK-MCP layer still relevant for the laptop-agent and Routine paths. Keep active. | Keep active. Re-audit on next health check if no fires. |
| `dispatcher-fix-on-disk-does-not-equal-fix-in-running-process.md` | Rule operationalises against ecodia-api PM2 require-cache. ecodia-api still alive on VPS; generalisable to any long-running Node host. | Keep active. Generalise the headline next time the rule fires elsewhere. |
| `cowork-scope-cannot-update-entity_type-infrastructure-2026-05-19.md` | The cowork MCP gateway (gen-1) is sunset-pending per CLAUDE.md. Rule is about a permission ceiling on that gateway. | Re-audit when cowork gateway is fully unmounted (status_board 2bf2c734). |
| `harness-tool-rejection-is-not-tate-rejection.md`, `vps-anatomy-current-state-2026-05-19.md`, `vps-substrate-only-shape-post-migration-2026-05-15.md`, `shipped-infra-never-activated-decision-vs-disk-drift.md`, `supabase-pooler-session-vs-transaction-mode-selection.md` | All reference `ecodia-conductor` in historical sections. Conductor was decommissioned 2026-06-08. Rule bodies remain valid. | Keep active. Update the historical refs in the next world-model audit pass; do not archive. |

## 3. Dedup candidates

The cron-fire-deliverable cluster has the most overlap. Five patterns touch the same surface from different angles:

- `cron-fire-must-have-deliverable-not-just-narration` (unconditional case)
- `cron-deliverables-can-be-conditional-not-all-fires-must-ship` (conditional case)
- `cron-worker-probes-target-artifact-before-rendering-2026-06-08` (idempotency angle)
- `cron-must-be-registered-not-just-documented-2026-05-18` (registration angle)
- `scheduling-is-0th-class-primitive-2026-05-28` (parent reflex)

No proposed merges - each carries a distinct rule. Cross-refs already present.

The `verify-deployed-state-against-narrated-state` family is the canonical 65-cite hub. No dedup needed; the satellites add specificity.

## 4. Oversize candidates

None. Largest file is `sy094-coexist-ios-release-recipe.md` at 581 lines. Average pattern file is 90 lines. Release recipes naturally run long; no split warranted.

## 5. Top 10 most-cited patterns

By `[[wikilink]]` count across `patterns/*.md`:

| Cites | Pattern |
|---|---|
| 65 | verify-deployed-state-against-narrated-state |
| 33 | recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18 |
| 26 | dispatch-worker-is-0th-class-coord-primitive-2026-05-18 |
| 12 | scheduling-is-0th-class-primitive-2026-05-28 |
| 11 | hook-matchers-must-follow-live-dispatch-primitive-not-dead-substrate-2026-05-26 |
| 11 | 24x7-autonomy-architecture-invariants-2026-05-27 |
| 10 | eos-laptop-agent-module-cache-requires-restart-after-handler-swap |
| 10 | codify-at-the-moment-a-rule-is-stated-not-after |
| 10 | cdp-helper-library-and-recursive-improvement-2026-05-18 |
| 9 | worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load-2026-05-28 |

## 6. Telemetry sanity

- Active patterns: 391
- Archived patterns: 64
- Patterns with `status: narrowed`: 2 (`auto-preview-md-html-on-write-2026-05-16`, `cowork-v2-api-shape-conventions`)
- Patterns with `status: archived` in frontmatter but still in active dir: 0 (cleaned this session - the three archived files are now in `_archived/`)
- Files missing `triggers:` frontmatter: 0
- Total lines across active corpus: ~35,000
- Average file size: ~90 lines
- Largest file: 581 lines
- Files >500 lines: 1
- Files >300 lines: 7 (all release recipes or high-leverage doctrine)

## 7. Open follow-ups

- The non-archived supersession candidates listed in section 2 deserve a world-model audit pass to update historical refs to `ecodia-conductor`. Best done as a single grep-and-edit fork once Tate confirms no consumer still relies on those rule bodies.
- The `pattern-corpus-telemetry-substrate-gap-2026-06-08` pattern flags that `[APPLIED]`/`[NOT-APPLIED]` telemetry is currently silent on Mac. Lifecycle thresholds in `pattern-lifecycle-active-narrowed-archived` cannot be enforced until that gap closes. Without it, the >70% NOT-APPLIED narrowing trigger and the tagged-silent retire trigger are both dark.
