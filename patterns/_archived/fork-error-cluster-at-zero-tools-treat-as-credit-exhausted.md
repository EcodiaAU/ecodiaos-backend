---
triggers: fork-error-cluster, fork-error-zero-tools, perception-fork-errors, credit-exhausted-cluster, do-not-spawn-on-credit-exhaust, meta-loop-fork-rollup-errors, fork-rollup-cluster-error, multiple-fork-error-recent, classify-as-credit-exhaustion-default, route-to-drift-audit-instead, conductor-saves-slots-when-exhausted
archived_at: 2026-05-26
archived_reason: sdk-fork-substrate-deprecated-2026-05-17
nuance_transferred_to: dispatch-worker-runtime-semantics-2026-05-26.md
---

# Fork-error cluster at zero tools = credit-exhausted; do not spawn another, pivot to drift audit on main

## The rule

When `<perception_summary>` or `<forks_rollup>` at session start shows **2+ recent forks in `error` status with `tool_calls=0` (or `0 tools` annotation) within the last 10 minutes**, treat the cluster as a credit-exhaustion signal until empirically proven otherwise. Do **not** spawn another fork to "investigate", "verify", or "diagnose" the cluster. Pivot to status_board drift audit on main.

This is not the absence of work; it is the substrate being temporarily unavailable. The conductor's job in this state is to do the canonical thin-on-main work — drift audit per `~/ecodiaos/patterns/status-board-drift-audit-is-canonical-thin-on-main-meta-loop-work.md` — and to verify the credit-exhaustion row exists on the status_board (P2 with `next_run_at` follow-up scheduled).

## Why this is a discrete pattern

The general "fork by default" doctrine pushes toward spawning. The general "credit exhaustion handling" doctrine talks about classifying the failure once you know it's credit-exhaustion. The gap is the **moment of classification** — perception shows error cluster, conductor must make the read in seconds without burning a slot to find out.

Without this pattern, the path of least resistance is:
1. See 3 fork errors in 5min in perception_summary
2. Reflexively spawn `mcp__forks__spawn_fork({ brief: "investigate why recent forks are failing" })`
3. That fork fails the same way (also credit-exhausted), takes 5-8s, returns 0 tools
4. Now I have 4 errored forks instead of 3, and learned nothing

## Heuristic for the read

Perception markers that compose the signal:
- `tool_calls=0` (or `0 tools` annotation in the rollup line)
- `status` = `error` / `aborted`
- Duration `<= 15s` (immediate fail, not a long-running fork that errored mid-flight)
- Cluster of 2+ within ~10min, not a single one-off

When all four hold, default classification = `credit_exhaustion`.

A single fork erroring at 0 tools in 6s is not yet a cluster. Could be transient. Two within ~10min escalates. Three escalates further.

## Verification protocol (fast, on main, read-only)

1. Slice query `os_forks` last 90min for `status = 'error'` + `tool_calls = 0` + `started_at > NOW() - INTERVAL '90 minutes'`. Confirm cluster is real, not artefact of one stale rollup.
2. Slice query `status_board` for any active row where name LIKE `%credit-exhaust%` OR `%paywall%`. If row exists with `next_run_at` future-scheduled (auto-resume verification), the substrate is already tracked. **Done.** No further write.
3. If NO such row, INSERT one P2 row pointing at the credit-reset cron + dispatch a SINGLE conductor-side scheduled task for verification at the parsed reset window. Atomic, single-statement.

That's it. Three slice queries, one optional INSERT. All read-only or single-targeted-write. No fork required.

## What NOT to do

- Do **not** spawn a fork to "diagnose the failures." Forks fail the same way under credit exhaustion. Each spawn burns 5-8s of slot time and produces no tools.
- Do **not** write multi-row INSERTs / status_board updates / Neo4j writes that don't exist BECAUSE of credit exhaustion. The slot scarcity is the point — reduce churn, not amplify it.
- Do **not** anti-flood SMS Tate per-fork-error. The rolling P2 row is the single surface; the existing `cron silent-fire detector` row absorbs incident-class signals. One row, one update.
- Do **not** classify a single 0-tools fork failure as credit-exhaustion on its own. Could be SDK musl-vs-glibc, could be brief malformed, could be transient transport. Two-within-10min is the threshold.

## Pivot: status_board drift audit is the canonical thin-on-main work

Once the cluster is classified and the row is in place, the conductor pivots to the canonical thin-on-main meta-loop work: PHASE 2 drift audit. Slice queries for stale rows / pure-awareness rows / completed-not-archived rows / P1+P2 long-stale rows. Atomic per-row UPDATE/archive. This is real artefact production on main without burning fork slots.

## Cross-refs

- `~/ecodiaos/patterns/status-board-drift-audit-is-canonical-thin-on-main-meta-loop-work.md` — the pivot destination
- `~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md` — exemption (b) read-only / single-targeted-update applies during credit-exhaust state
- `~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md` — DeepSeek is the eventual unblock; until provisioned the wave continues
- `~/ecodiaos/patterns/deepseek-fallback-strips-anthropic-thinking-blocks.md` — once DeepSeek is wired, the proxy must sanitise thinking blocks
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` — the rolling P2 row IS the artefact; do not narrate "I considered the failures" without one
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` — perception_summary (rollup substrate) ↔ os_forks (truth substrate) seam discipline: verify the cluster is real before classifying

## Origin

Meta-loop fire 2026-05-09 22:05 AEST. Perception_summary surfaced 3 fork errors in 5min, all `error` status with `0 tools`. Status_board P2 row `Credit-exhaustion auto-resume 5 May 2026` already covers the wave (both Claude Max accounts out until 2026-05-12 11:00 UTC). Reflex was to spawn `spawn_fork` to investigate; correct move was to slice-query the truth tables (`os_forks` + `status_board`), confirm the existing row is current and the verification cron (`post-credit-reset-fork-restoration-verify`, fires 2026-05-12 11:30 UTC) is scheduled, then pivot to drift audit on main. Audit archived 6 pure-awareness/passive-trigger rows, doctrine-cleaned the board down to 105 active.

Pattern surfaced same turn it was acted on, per `codify-at-the-moment-a-rule-is-stated-not-after`.
