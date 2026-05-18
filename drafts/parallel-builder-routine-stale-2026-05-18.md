---
authored_at: 2026-05-18
author: cloud-Routine money@ecodia.au (parallel-builder fire)
status: world-model-drift-finding
section_audited: Routines on money@ecodia.au (CLAUDE.md deprecations table item 6)
recommendation: retire OR rewrite against dispatch_worker primitive
related_patterns:
  - world-model-staleness-needs-active-reconciliation-2026-05-17
  - dispatch-worker-is-0th-class-coord-primitive-2026-05-18
  - cron-fire-must-have-deliverable-not-just-narration
  - verify-deployed-state-against-narrated-state
---

# parallel-builder cron Routine fired on money@ecodia.au with no working substrate

## What fired

The 2-hourly `parallel-builder` cron Routine fired on the cloud `money@ecodia.au` Claude Code substrate at 2026-05-18. The prompt body assumed the pre-local-first architecture: cowork fork pool, `forks.spawn` / `forks.list` MCP primitives, status_board + kv_store + Neo4j writes through the ecodia-core MCP connector, a 3-fork concurrency cap.

## Substrate probe (this turn, empirical)

| Claim in Routine prompt | Probe | Result |
|---|---|---|
| `forks.spawn` MCP tool exists for parallelism | ToolSearch over loaded MCP surface | not present. The SDK fork primitive was migrated away from per the 2026-05-17 deprecations table. |
| `forks.list` MCP tool exists for cap-check | ToolSearch over loaded MCP surface | not present. |
| `status_board.query` reachable via ecodia-core MCP | `mcp__ecodia-core__status_board_query` call | error: "MCP server ecodia-core requires re-authorization (token expired)". |
| `kv_store.get` reachable via ecodia-core MCP | `mcp__ecodia-core__kv_store_get` call | same token-expired error. |
| `neo4j.write_episode` reachable via ecodia-core MCP | not attempted (same connector, same error class) | inferred failed. |
| `cowork.dispatch_worker` (new local-first primitive) reachable | not present in cloud Routine tool surface | as expected. Lives at localhost:7456 on Corazon. |

Score: 0/6 probes pass. The Routine cannot perform any step of its declared work on this substrate.

## Why this is a finding, not just a transient failure

Three independent and distinct substrate gaps converge:

1. **Architectural deprecation.** The fork-pool the Routine targets is dead per [[ide-tab-is-the-new-fork-mechanic-2026-05-17]] and the CLAUDE.md deprecations table. Even if the MCP token were live, `forks.spawn` would not be in the surface.
2. **MCP credential expiry.** ecodia-core MCP requires re-auth on the cloud `money@ecodia.au` substrate. status_board, kv_store, and Neo4j writes are unreachable from here regardless of the Routine's logical correctness.
3. **Substrate-cloud separation.** The new parallelism primitive `cowork.dispatch_worker` lives on the Corazon laptop-agent (localhost:7456). A cloud Routine fired on a different machine cannot dispatch local CC tabs.

The Routine could only function if all three were repaired (or it was rewritten to target a primitive that lives in the cloud Routine's actual tool surface).

## Per `world-model-staleness-needs-active-reconciliation-2026-05-17`

This is the audit-section "Routines (which are running on which account?)" reporting a hard failure for the parallel-builder cron on money@. The doctrine says: open a single P3 `status_board` row, `next_action_by=ecodiaos`, naming the section and gap.

status_board is unreachable this turn. The verdict lands as this git artefact on branch `claude/exciting-curie-4m3Er` instead. The local conductor should:

1. Open the P3 status_board row when it next has ecodia-core MCP access, citing this draft path.
2. Decide retire-vs-rewrite for the parallel-builder Routine.
3. Cancel the scheduled cron via `mcp__ecodia-scheduler__schedule_cancel` if retiring, OR rewrite the prompt body if keeping.
4. Audit the sibling cloud-fired Routines on money@ / code@ / tate@ for the same architectural fictions (the deprecations table explicitly flags all 16+4 routines as "unverified").

## Why narration-only would have been the wrong answer

Per `cron-fire-must-have-deliverable-not-just-narration`, the Routine's prompt declared a deliverable shape (dispatched forks, status_board annotations, Neo4j Episode, kv_store updates). The turn must land at least one substrate-write tool call. The substrate the Routine names is dead; the substrate the cloud session has is git. Committing this file is the substrate-landing tool call.

This is not the conditional-success case in `cron-deliverables-can-be-conditional-not-all-fires-must-ship` (no-diff INDEX regen, sub-threshold telemetry trip, clean audit pass). The Routine's substrates are actively broken, not quiescent.

## Recommended actions for local conductor

- [ ] Open P3 status_board row: `world-model-drift section="routines on money@" score=0% probes_failed=[fork-primitive,ecodia-core-mcp-token,cowork.dispatch_worker-not-in-cloud-surface]`, `next_action_by=ecodiaos`, pointer to this draft.
- [ ] Decide retire vs rewrite for parallel-builder Routine. Retire is the lower-effort default given the local-first migration explicitly absorbed the parallelism use case.
- [ ] If retiring: `mcp__ecodia-scheduler__schedule_cancel` for the parallel-builder task id on money@ (and any siblings firing on dead substrate).
- [ ] If keeping any subset of the cloud-fired Routines: rewrite the prompt bodies against tools that exist in the cloud Routine's actual MCP surface (factory tools, scheduler tools, github tools, ecodia-core when token is rotated), not the dead fork pool.
- [ ] Audit ecodia-core MCP token rotation for cloud Routine accounts (money@, code@, tate@). Token expiry on a Routine substrate is a self-silencing failure mode.
- [ ] Add a section to CLAUDE.md (in the deprecations table, item 6) naming this empirical confirmation with the date and the score.

## Artefact references

This draft IS the durable artefact for this Routine fire, per `cron-fire-must-have-deliverable-not-just-narration`. It is on branch `claude/exciting-curie-4m3Er` and will be pushed for the local conductor to pull.
