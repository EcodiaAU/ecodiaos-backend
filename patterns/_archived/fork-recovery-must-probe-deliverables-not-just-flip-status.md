---
triggers: fork-recovery, recoverStaleForks, recover-stale-forks, fork-status-classifier, api_memory_restart-recovery, pm2-restart-fork-recovery, fork-crashed-but-shipped, phantom-shipped-fork, fork-detection-bug, crashed-vs-done, fork-result-null, fork-deliverable-probe, recovery-not-narration, status-reflects-process-not-deliverable, [SYSTEM:fork_crashed], fork-recovery-symbolic, recovery-must-probe, fork-rollup-misleading, fork-status-vs-disk
archived_at: 2026-05-26
archived_reason: sdk-fork-substrate-deprecated-2026-05-17
nuance_transferred_to: dispatch-worker-runtime-semantics-2026-05-26.md
---

# Fork recovery must probe deliverables, not just flip status

## Rule

When the api process is reaped (PM2 max_memory_restart, OOM, deploy, crash) with forks in flight, the recovery layer that reclassifies non-terminal `os_forks` rows MUST run the 5-substrate deliverable probe per fork BEFORE writing a terminal status. The probe outcome — not the heartbeat staleness — determines the terminal status. The recovery's [SYSTEM:] message body must embed the actual probe result, not a placeholder telling main to "go check the substrates."

A heartbeat-only classifier reflects PROCESS state (the SDK child got SIGKILLed). It does not reflect DELIVERABLE state (the fork's edits may already be committed and pushed). Conflating the two creates `status='crashed'` rows for forks whose work shipped — invisible regressions of the conductor's situational awareness, because `<forks_rollup>` and the [SYSTEM:fork_crashed] body relay process state as if it were outcome state.

## The empirical case that surfaced this

1 May 2026 11:22 AEST — Tate flagged `fork_mom80wlq_8709d4` showing `[crashed]` in the rollup. Cross-substrate probe found:
- `os_forks` row: `status='crashed'`, `result=NULL`, `tool_calls=0`, `abort_reason='api_memory_restart'`
- Git: commit `1db0c0f` authored 3min32s after `ended_at`, `Co-Authored-By: fork_mom80wlq_8709d4`, **on origin/main**
- The fork's actual deliverable (proactivity damper pre-execution probe) was complete, intent-matching, pushed, live in production

A sweep of all 4 historical `crashed` forks in `os_forks` revealed **100% drift**: every single api_memory_restart-killed fork on record had shipped its work to origin/main. The "crashed" status was meaningless as a deliverable signal — it just meant PM2 reaped the api at an inconvenient moment.

`forkService.recoverStaleForks` (src/services/forkService.js) was running ONE blanket UPDATE to flip all stale-heartbeat rows to `crashed`, then enqueueing a [SYSTEM:fork_crashed] message that literally cited `continuation-aware-fork-redispatch.md` and told main "go check the 5 substrates yourself." Symbolic logging dressed as recovery — per `no-symbolic-logging-act-or-schedule.md`.

## What recovery must do per stale fork

For each row with stale `last_heartbeat` AND status in `('spawning','running','reporting')`, run `probeForkDeliverables(forkId, startedAt)` BEFORE the status flip:

| Substrate | Probe | What "found" looks like |
|---|---|---|
| Git commits | `git log --all --grep="<forkId>" --since="<startedAt - 1min>"` filtered by body-contains-forkId | List of `{sha, subject, pushed: bool}` where pushed = `git branch -r --contains <sha>` includes `origin/<branch>` |
| Working tree | `git status --porcelain` | List of dirty files (best-effort; mtime filtering optional) |
| status_board | `SELECT entity_ref, last_touched FROM status_board WHERE context LIKE '%<forkId>%' AND last_touched > startedAt` | Rows the fork wrote |
| kv_store | `SELECT key, updated_at FROM kv_store WHERE updated_at > startedAt AND value::text LIKE '%<forkId>%'` | Keys the fork stamped |
| Neo4j | optional, expensive — skip unless cheap | Nodes referencing fork id |

## Classification rules (per fork, after probe)

- **Commits found AND all pushed AND working tree clean** → `status='done'`. `result='Fork crashed mid-flight but work shipped: <N> commits on origin. SHAs: <list>. Subjects: <list>.'`. `next_step=NULL`.
- **Commits found, some local-only, fast-forward push possible** → run `git push origin <branch>` (only if `git rev-list --count main..origin/main = 0`). Then `status='done'` with result naming the auto-pushed SHAs. If push fails, `status='done'` with result naming the failure and `next_step` describing the manual reconcile needed.
- **Commits found AND working tree dirty** → `status='done'` for the committed part, but result includes `Note: working tree still dirty with N uncommitted files: <head 10>. Conductor should review.`
- **No commits, working tree dirty** → `status='crashed'`, `result='Fork crashed before commit. Working tree dirty: <files>.'`, `next_step='Review fork worktree changes; commit if intent matches brief, else discard.'`
- **No commits, clean tree, zero kv_store/status_board/Neo4j writes** → `status='crashed'`, `result='Fork crashed before producing any disk artefact (tool_calls=N, last_heartbeat=X). Safe to redispatch.'`, `next_step='Continuation-aware redispatch per continuation-aware-fork-redispatch.md'`.

## What the [SYSTEM:] message must embed

The enqueued message body to main MUST embed the probe result, not a placeholder:

- If status='done' (work shipped): `[SYSTEM: fork_done <forkId>] Fork was reaped by api restart but work shipped. <N> commits on origin: <SHAs>. <subjects>. No action needed.`
- If status='crashed' with dirty tree: `[SYSTEM: fork_crashed <forkId>] Crashed before commit. Working tree dirty: <files>. Conductor: review and commit-or-discard.`
- If status='crashed' clean: `[SYSTEM: fork_crashed <forkId>] No deliverable on any substrate. Safe to redispatch with continuation-check brief per continuation-aware-fork-redispatch.md.`

This way `<forks_rollup>` on the conductor's next turn shows the right thing AND the [SYSTEM:] message has the actual deliverable info, eliminating the manual dig.

## Do

- Run the probe IN the recovery code path, not in a [SYSTEM:] message body that delegates the work to main.
- Use the existing `result` and `next_step` columns to surface deliverable state — no new schema needed.
- Auto-push fast-forward-only when commits exist locally but not on origin (the common case for forks whose api died after commit but before the conductor's post-commit push step).
- Keep the recovery idempotent: `WHERE status IN ('spawning','running','reporting')` skips already-terminal rows, so re-running the recovery is safe.
- Reflect probe outcome in `<forks_rollup>` — show `[done: <commit-summary>]` not `[crashed]` when work shipped.
- Cross-reference this pattern from the recovery function header so the rule is one-grep away from the implementation.

## Do NOT

- Do NOT use `last_heartbeat` staleness alone to decide status. Heartbeat reflects the api process's ability to write the heartbeat, not the SDK child's ability to do work. The two diverge whenever the api dies but the SDK keeps editing files (or whenever the api revives and a sibling conductor commits the dirty tree post-mortem, as happened with `1db0c0f`).
- Do NOT enqueue a [SYSTEM:] message that says "go check the substrates yourself." That is symbolic logging per `no-symbolic-logging-act-or-schedule.md`. The recovery layer is the one with full context (forkId, startedAt, brief); make it do the probe.
- Do NOT auto-push commits when local main is non-fast-forward of origin/main (rebase, divergence). Conservative default: surface the divergence in `result`, leave the push to the conductor.
- Do NOT trust `tool_calls=0` as evidence the fork did nothing. The heartbeat / tool_calls counter is updated by the api process; if api died, those columns flatline even if the SDK child kept making tool calls. The git log is the source of truth.
- Do NOT backfill historical `crashed` rows automatically as part of the recovery code. Recovery is idempotent over `('spawning','running','reporting')` — terminal rows stay untouched. Backfill is a separate one-shot job the conductor can run after deploying the new probe path; that way the new behavior is validated on fresh forks before being applied retroactively.

## Verification (post-deploy)

1. Inspect `forkService.recoverStaleForks` — it must call `probeForkDeliverables(forkId, startedAt)` before the per-row UPDATE.
2. Spawn a fork, kill ecodia-api mid-flight before it can commit, restart, observe: row should flip to `crashed` with `result` describing dirty tree (if any) or "no deliverable" (if SDK didn't reach Edit/Write).
3. Spawn a fork, let it commit + push, kill ecodia-api before normal terminal status, restart, observe: row should flip to `done` with `result` naming the shipped SHA.
4. Run the backfill script (one-shot) against historical `crashed` rows. Verify the 4 known-shipped historical cases (`fork_mom80wlq_8709d4`, `fork_molm9a17_218c6e`, `fork_molm7tyf_e9c692`, `fork_molm6c04_7bdffc`) flip to `done` with the right SHAs.

## Origin

1 May 2026 ~11:22 AEST. Tate verbatim: "You need to make the crash and phantom detection correct, you said the changes were created but they shouldve been pushed if tested and approved.... and it shouldve give nyou the actul result."

The conductor diagnosed `fork_mom80wlq_8709d4` and confirmed the bug was structural: 100% of historical api_memory_restart-killed forks (4/4) had shipped real work to origin/main, but their `os_forks` rows said `crashed` with `result=NULL`. The misclassification was systemic, not incidental.

Fix fork dispatched as `fork_mom8e913_73a492` to ship `probeForkDeliverables` + classifier overhaul + auto-push fast-forward + structured [SYSTEM:] message body + tests.

This pattern was authored at the moment per `codify-at-the-moment-a-rule-is-stated-not-after.md` so the fix fork's PR could cross-reference the doctrine.

## Cross-references

- `~/ecodiaos/patterns/continuation-aware-fork-redispatch.md` — the redispatch-side sibling rule (what the conductor does AFTER a fork is classified as lost). This pattern is the upstream half: how the classifier itself must work.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` — the meta-rule. The bug here IS narration (`status='crashed'`) drifting from disk reality (commit on origin/main).
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` — the existing recovery's [SYSTEM:] message saying "go check yourself" was symbolic; the probe must be IN the recovery.
- `~/ecodiaos/patterns/_archived/factory-approve-no-push-no-commit-sha.md` — sibling discipline at the Factory layer; same principle (work without push is not deliverable).
- `~/ecodiaos/patterns/check-pre-kill-commits-before-redispatch.md` — sibling: before redispatching a killed Factory session, check the branch tip for commits the session landed before it died.
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` — the architectural framing: `os_forks.status` and `git log` are two substrates and the seam between them needs an explicit consistency protocol.
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` — the meta-rule that triggered this file's authoring.
