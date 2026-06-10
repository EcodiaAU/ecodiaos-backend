# Codification scan 2026-05-01 21:00 AEST

Fork: fork_momsy3wu_28b87b
Window: last 24h Neo4j Decision/Episode rule-shaped nodes
Patterns dir: 130 files

## Method

graph_query of (Decision|Episode) created in PT24H with rule/doctrine/pattern/never/from-now-on keywords. 24 nodes returned. Cross-checked against `ls patterns/` + read of likely-overlap files.

## Coverage analysis

| Candidate (rule-shape from Neo4j) | Existing pattern | Verdict |
|---|---|---|
| Edit-fork phantom-ship: writes to disk without commit/push/PR | `sdk-forks-must-commit-deliverables-not-leave-untracked.md` | SUBSUMED. Pattern covers commit + push behavior; today's claude-md edit fork is a fresh demonstration but adds no new doctrine. Mechanical enforcement (hook) is the missing piece, not a new pattern. |
| Cron silent-fire root cause = budget gate silently skipped low-priority forks | `cron-fire-must-have-deliverable-not-just-narration.md` | SUBSUMED per brief. The existing pattern's protocol catches the symptom (cron completed, no artefact) regardless of substrate-level vs turn-level cause. Loud-budget-gate-failure is an infra patch, not a behavioural rule. |
| Drift detector should filter newly-created patterns from dormant flags | n/a | INFRA PATCH. Per brief: do NOT codify. |
| Scope errors in dispatched forks (Co-Exist haptics + Chambers audit-only) traced to stale-plan momentum from kv_store queue | `no-self-prompting-from-queued-kv-store-plans.md` | SUBSUMED. Pattern explicitly authored against this exact 1 May 12:23 AEST event. |
| Master plan briefs authored from stale status_board context (Wave 1 Fork A + B both verified work already shipped) | `verify-empirically-not-by-log-tail.md` + `scheduled-redispatch-verify-not-shipped.md` + `verify-deployed-state-against-narrated-state.md` | SUBSUMED by combination. The forks DID empirically verify (right behavior). Brief-authoring discipline could be tightened but doesn't need a new file. |
| Token explosion = per-turn injection layer must have budget cap | n/a | IMPLEMENTATION. Already addressed by per-turn-injection-trim ship. Not behavioural doctrine. |
| Scheduled pm2_restart tasks self-kill conductor session + in-flight forks | NONE EXACT. `no-pm2-restart-during-active-factory-queue.md` covers MANUAL pm2_restart pre-check. `pre-stage-fork-briefs-before-session-killing-ops.md` covers brief-staging BEFORE kill. Neither covers "don't schedule the kill via the scheduler that runs inside the kill target". | **GAP**. Author. |

## Gap = 1

### Pattern to author

`never-schedule-host-process-restart-via-os-scheduled-tasks.md`

H1: Never schedule a pm2_restart of ecodia-api via os_scheduled_tasks - the cron poller runs inside the kill target

Origin: 1 May 2026, ecodia-api restart loop investigation 13:00-13:18 AEST. Two delayed tasks (post-trim-restart-ecodia-api-2026-05-01, post-restart-verify-trim-2026-05-01) scheduled by an earlier session fired at 03:02 + 03:07 UTC. Each shell_exec'd pm2 restart from inside the cron poller running in the ecodia-api process. Self-kill cascade: in-flight forks orphaned, conductor session torn down, post-restart-verify task ran git revert against a now-detached HEAD. 9 ecodia-api restarts in the night cluster. Earlier 01:04-01:32 UTC cluster shares the shape.

## P3 deferred

None. Single gap is being authored inline.
