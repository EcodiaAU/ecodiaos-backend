---
triggers: destructive-tear-down, pm2-stop-gate, pm2-delete-gate, git-rm-gate, gated-autonomy, decide-do-not-ask-override, irreversibility-window, multi-step-tear-down, pre-step-status-board-row, tate-proceed-required, blast-radius-not-recoverable-from-narration, tear-down-doctrine-2026-05-15
priority: critical
---

# Destructive tear-down requires Tate gate per step - 2026-05-15

## The rule

When dismantling load-bearing infrastructure across multiple sequential destructive operations (`pm2 stop`, `pm2 delete`, `git rm`, `DROP TABLE`, `aws s3 rb --force`, anything that erases or makes-irreversible state shared across substrates), `[[_archived/decide-do-not-ask]]` is OVERRIDDEN. Each destructive substep gets its own status_board row addressed to `next_action_by=tate` BEFORE the substep runs, and the executor waits for Tate's explicit `proceed` reply (or his manual flip of the row's status) before acting.

This is the ONLY class of work where decide-do-not-ask yields. The override is not because Tate's judgment is better than mine on the substep itself; it is because:

1. **Sequential blast radius compounds.** Step N's reversibility depends on step N-1 being still reversible. A blanket "proceed with tear-down" trades 11 small pause-points for one big one - and if step 7 surfaces a regression that should have stopped step 6, the cleanup is ten times more expensive.
2. **Narration is unreliable evidence** (per `[[verify-deployed-state-against-narrated-state]]`). The executor's "I think the replacement Routine has fired successfully" is not the same as Tate looking at claude.ai/code/routines and seeing the run history. Tate's view supplies a substrate the executor cannot probe.
3. **Cutover-time regressions are silent.** A cron that fails to fire or a webhook that quietly 502s does not set off any alarm except the absence of an expected effect. The pause between substeps is the window where Tate spots the missing effect.

## How to apply

For any tear-down comprising 3+ destructive substeps:

1. **Author the sequence document** before starting (e.g. `backend/docs/VPS_TEAR_DOWN_SEQUENCE_2026-05-15.md`). Each step has: action, reversible-by, gate, verify-post-action.
2. **For each step, write a status_board row** with:
   - `entity_type='infrastructure'`
   - `entity_ref='<lane>-step-<N>'`
   - `name='Tear-down step N: <one-line action>'`
   - `next_action='Reply "proceed" to authorise <action>. Reversible via <undo>. Resolution criteria: <observable post-conditions>.'`
   - `next_action_by='tate'`
   - `priority=1` for the first step (gates the whole chain), `priority=2` for subsequent steps (the chain is already in progress; not a fresh blocker).
   - `cowork_session_id='<lane-session>'` for heartbeat correlation.
3. **Wait for Tate's reply.** Acceptable forms: literal "proceed" reply on the row, manual flip of `status` to `tate-proceed`, SMS reply containing "go", direct in-session message saying "do step N". The executor does not invent forms.
4. **Execute, then write the verify substep.** Probe the verify conditions named in the gate row. Write a follow-up status_board update with the probed evidence.
5. **If verify fails, halt the chain.** Do not advance to step N+1 until either the failure is forward-fixed (and the original gate's verify conditions pass) or the rollback path is taken.
6. **Heartbeat continues across the gate.** The cowork_session_id heartbeat to `cowork_sessions.metadata` keeps the lane alive in observer_signals while waiting for Tate.

## Anti-patterns

- **"I'll batch all the gates into one row"** - defeats the entire purpose. The pauses ARE the value.
- **"Step N's gate also covers step N+1 because they're trivial"** - if both are destructive, both need their own row.
- **"I'll proceed because Tate is asleep / travelling and the heartbeat shows green"** - the override is per-substep regardless. Asleep Tate is not an authoriser. If the destructive op MUST proceed during a Tate-unavailable window, the authorising mechanism is a pre-authored kv_store key (e.g. `kv_store.tate_pre_auth.tear_down_step_3_proceed`) set BEFORE Tate's window closed - not the executor's inference.
- **"I'll write the row AFTER stopping the service so Tate sees it as a heads-up"** - that is not a gate; that is a notification. The row goes BEFORE the destructive op.
- **"The verify probe passed in dry-run so I'll skip the post-action probe"** - dry-runs are not the same substrate as live; per `[[verify-deployed-state-against-narrated-state]]` always probe live.

## Counter-cases (where this rule does NOT apply)

- Single-step destructive ops (e.g. `git rm one-file.js`). Decide-do-not-ask still governs.
- Pure code-edit refactors with no PM2 / DB / external-state effect. Decide-do-not-ask still governs.
- Tear-down of state that is locally re-creatable in <60s without external coordination (e.g. `rm -rf node_modules && npm ci`).

The override fires when ALL of: 3+ sequential destructive ops, irreversibility-window growing per step, blast radius beyond the single host, and at least one substep that no `git revert` can undo.

## Origin

Authored 2026-05-15 by EcodiaOS-on-Corazon during Phase 2 Lane 05 (VPS substrate-only redesign + service tear-down). That lane was the first 11-step destructive tear-down EcodiaOS executed end-to-end. The dossier explicitly carved out the override: "decide-do-not-ask EXCEPT for tear-down decisions, where you write a status_board row addressed to Tate with `next_action_by=tate` and wait for explicit go-ahead".

The pattern is general beyond that one lane. Any future migration / decommission / mass-deletion that touches 3+ services or 3+ tables falls under this rule by default; an executor proposing to skip the gate must surface the proposal as a pattern-amendment, not a one-off exception.

## Cross-references

- `~/CLAUDE.md` Decision Authority section - this rule operates as an upgrade of the "Brief Tate first" tier when the substep is destructive.
- `backend/patterns/_archived/decide-do-not-ask.md` - the rule this overrides for the destructive-tear-down case.
- `backend/patterns/verify-deployed-state-against-narrated-state.md` - why narration of "step N succeeded" is not enough; the verify probe is mandatory.
- `backend/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md` - the 5-point check stays applicable for the WAIT phase between gate and proceed.
- `backend/docs/VPS_TEAR_DOWN_SEQUENCE_2026-05-15.md` - the canonical worked example of this rule.
- `backend/patterns/migration-vps-to-local-corazon-2026-05-15.md` - the master cutover pattern (sibling).
- `backend/patterns/vps-substrate-only-shape-post-migration-2026-05-15.md` - the shape this tear-down arrives at.
