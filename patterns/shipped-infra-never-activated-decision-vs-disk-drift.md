---
triggers: shipped-infra-never-activated, decision-vs-disk-drift, dormant-pm2-entry, phase-1-merged-phase-2-never-shipped, multi-phase-migration-tracker, decision-node-disk-divergence, conductor-sibling-decision-3993, phase-d-hooks-30-apr-2026-restoration, narration-vs-disk-meta, infra-claimed-shipped-not-on-disk, decision-claims-vs-grep-truth, partial-merge-decision-pollution, phase-boundary-correction, phase-n-of-m-not-shipped, dormant-feature-branch-on-disk, settings-json-registered-script-absent, conductor-detached-guard-count-mismatch, multi-phase-ship-untracked-remainder
---

# Multi-phase infrastructure migrations must track phase boundaries in the Decision node, not claim "shipped" on Phase 1

## 1. The rule

A Neo4j Decision/Episode/Strategic_Direction node claiming `<infra X> shipped/merged/live/active/wired` for any multi-phase migration MUST EITHER:

(a) state explicitly that ALL phases of the migration are on disk + active on main HEAD, with disk-probe evidence cited (commit SHA, file path, guard variable count, live process state), OR

(b) name the specific phase that landed and the explicit list of remaining phases as `:Question` or `:OpenWork` nodes referenced from the Decision via `:HAS_OPEN_PHASE` or equivalent.

**The default state for any partial-merge claim is "Phase N of M shipped" - never the unqualified "shipped".** A Decision node that says "shipped" without phase-boundary annotation is doctrine pollution. Future readers (including future-me) reading "shipped" build on top of state that is not actually on disk, and the next bump exposes the gap.

This rule specialises `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` (the parent meta-rule: narration is unreliable evidence). It is the SECOND-STRIKE codification: two distinct multi-phase migrations have shipped Phase 1 with the Decision claiming completion, then the missing phases bit in production within a 9-day window. Once is an incident; twice is doctrine.

## 2. Do

- Author every `:Decision` / `:Episode` for a multi-phase ship with an explicit `phase: "1 of N"` property and an itemised `phases_remaining` list (or open `:Question`/`:OpenWork` nodes linked via relationship).
- Cite disk-probe evidence in the Decision body itself: commit SHA, branch (main vs feature branch), file paths grep-confirmed, guard variable counts, live process state (PM2 `online`, `dormant`, `not present`).
- Make the Decision title carry the phase boundary: `"Phase 1 of 3 shipped - cross-process bridge + activation deferred"`, not `"Conductor sibling shipped"`.
- When in doubt about whether the migration is one phase or many, default to many. Re-bundling a multi-phase ship into "shipped" is the failure mode this rule prevents.
- Before any "build on top of this" action that depends on a previously-claimed-shipped infra, run the verification protocol in §4 EVEN IF you authored the original Decision yourself - Decision-vs-disk drift is a 9-day failure horizon, well within session-amnesia distance.
- When you discover a partial-merge Decision claiming "shipped" without phase boundary, append a `phase_boundary_correction` property with the actual phase that landed and a reference to the disk-probe fork that found the gap. Do NOT delete the original Decision (audit trail).
- For Phase 1 ships that are deliberately deferred-activation (CONDUCTOR_DETACHED-style env-flag-default-off pattern), explicitly state `default_active: false` and `activation_phase: <N>` on the Decision so future readers see "code on disk, NOT live behaviour."

## 3. Do NOT

- Do NOT write a Decision titled `<infra> shipped/merged/live` for a multi-phase migration without a phase-boundary qualifier in the title or first sentence.
- Do NOT close out a kv_store handoff key, status_board row, or Episode with "done" when only Phase 1 of M shipped - re-state as "Phase 1 of M shipped, phases 2..M open".
- Do NOT cite `git ls-remote` push verification as evidence the migration is complete - push proves the commit reached origin, NOT that all phases of the migration shipped.
- Do NOT trust your own prior-session Decision wording when the action depends on the infra it describes - re-probe disk first.
- Do NOT activate (flip an env flag from default-off to default-on, set `CONDUCTOR_DETACHED=1`, register a hook in settings.json, set a feature flag true) any infra claimed shipped without first running the verification protocol in §4.
- Do NOT bundle disk-truth probe results into a single "verified" line in the Decision - itemise per phase and per surface so the next reader can see WHICH phase is on disk and which is not.

## 4. Verification protocol - "is this 'shipped per Decision' actually fully shipped?"

Before any action that depends on previously-claimed-shipped infra (activation, build-on-top, status_board archive, Tate-facing summary, downstream fork brief):

1. **Grep main HEAD for the specific code change the Decision claims.** If the Decision says "8 CONDUCTOR_DETACHED guards added", `grep -c CONDUCTOR_DETACHED src/server.js src/conductor.js` and confirm the count matches. If the Decision says "5 hook scripts registered", `jq` the settings.json for the registered command paths and `ls -la` each one. Mismatch = DRIFT-DETECTED.
2. **Cross-check `git log --grep` against the branches the Decision named.** If the Decision references a feature branch (`feat/conductor-pm2-detach-...`, `feat/phase-d-failure-classifier-...`), verify the commit reached main HEAD via `git log --oneline main -- <file>`. Commits on a feature branch never merged = DRIFT-DETECTED.
3. **Probe live process state if the Decision claims a service/process change.** `pm2 list | grep -E '^.*<process_name>'`, check uptime + status. PM2 entry present but `dormant`/`stopped`/`errored` = DRIFT-DETECTED.
4. **Probe disk for ALL files the Decision named, not just the headline file.** Migration touching 4 files: probe all 4. The headline file may have shipped while a sibling file (the actual cross-process bridge, the actual hook script, the actual sub-fork dispatcher) silently did not. Missing sibling = DRIFT-DETECTED.
5. **Classify before any "build on top of this" action:**
   - **VERIFIED**: all 4 probes passed, all phases on disk + active. Proceed.
   - **DRIFT-DETECTED**: at least one probe failed. STOP. Append `phase_boundary_correction` to the original Decision. Spawn a focused fork to ship the missing phase OR explicitly defer activation in a new Decision/status_board row. Do NOT activate.
   - **INSUFFICIENT-EVIDENCE**: probe ambiguous (file exists but unclear whether content matches the claim). Treat as DRIFT-DETECTED until disambiguated; conservative is correct here.

The protocol cost is 30-90 seconds. The cost of skipping it is split-brain on a live system or a status_board row claiming "done" with broken downstream behaviour.

## 5. Cross-references

- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - the parent meta-rule (narration unreliable, six-substrate probe). This file specialises that rule for multi-phase migrations.
- `~/ecodiaos/patterns/fork-worktree-commits-do-not-propagate-to-main-working-tree-without-explicit-pull.md` - the related git-ref-vs-working-tree drift instance (commit SHA exists on origin, working-tree on VPS does not have it).
- `~/ecodiaos/patterns/_archived/factory-approve-no-push-no-commit-sha.md` - sibling at the Factory layer (approve without commit SHA = phantom approval).
- `~/ecodiaos/patterns/verify-empirically-not-by-log-tail.md` - the listener/process variant (process running per logs, listener silently not loaded).
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` - the 5-layer end-to-end verification for listener subsystems; same shape rule applied to a different surface.
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` - this file is itself an instance (rule stated 8 May 2026 21:43 AEST, codified same arc).

## 6. Origin

8 May 2026, second-strike codification. Two worked examples within 9 days:

**Example 1 - Phase-D mechanical hooks (30 Apr 2026, restoration commit 9e3f7d4 b16bacc..main, fork_moklwqg2_dc4dcd).** Five hook scripts (anthropic-first-check, cowork-first-check, episode-resurface, macro-runbook-write-surface, post-action-applied-tag-check) were claimed "shipped" per Episode 3934 ("Phase-D mechanical hooks restoration ship 30 Apr 2026") but were silently absent from main HEAD - the scripts lived on unmerged `feat/phase-d-failure-classifier-2026-04-29` while settings.json on main referenced them. Silent enforcement gap of 4h47m+ on Phase C, lifetime gap on Phase F. Discovered same day via hook-stack invariant probe; restored via path-restricted `git checkout` from canonical commits.

**Example 2 - Conductor sibling Phase 1 (8 May 2026, fork_mowuixi0_769fc4 manager + fork_mowull37_53192e worker probe).** Decision 3993 ("Conductor accepts forks-as-primitive collapse - 30 Apr 14:36 AEST") + Episode 4003 ("Decision 3993 commit 2/3 shipped - pm2 detach 30 Apr 2026") together claimed `ecodia-conductor` PM2 entry shipped. Worker probe found: 8 `CONDUCTOR_DETACHED` guards in `src/server.js`, 0 in `src/conductor.js`, conductor.js boots only 5 of 7 guarded services (silent drift on claimVerifier + proactivityEngine), `forkService.spawnFork` still runs SDK in-process via `getQuery()` with no IPC/HTTP-loopback bridge, `src/routes/osSession.js` still directly `require()`s `osSessionService`, zero Phase-2 commits in git log since 30 Apr 2026. Activation tonight (Tate's 21:30 AEST 8 May "I want forks to be 100% successful" directive) would have caused split-brain. DEFER report at status_board row `dd5ef7c2-1725-4c7f-a444-b69e45719267`; activation plan written to `~/ecodiaos/drafts/conductor-sibling-activation-plan-2026-05-08.md`.

The shared shape: a Decision/Episode node claiming `<infra> shipped` for a multi-phase migration where ONLY Phase 1 landed, Phase 2 (the load-bearing cross-process plumbing) was never written, and the next session reading "shipped" would have built on top of state that does not exist. Once is an incident. Twice in nine days is doctrine.

Authored: fork_mowut6vv_891c47, 8 May 2026.
