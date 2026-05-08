# Status Board Drift Audit — 2026-05-08

**Fork:** fork_mow8xxrb_caf78c
**Run time:** 2026-05-08 ~11:38 AEST (~01:38 UTC)
**Pre-audit total:** 122 active rows (P1=6, P2=34, P3=72, P4=10, P5=0)

## Header / distribution

| Bucket | Count |
|---|---|
| Total active rows | 122 |
| P1 critical | 6 |
| P2 high | 34 |
| P3 normal | 72 |
| P4 background | 10 |
| ≤24h stale | 30 |
| 24–72h stale | 46 |
| 3–7d stale | 24 |
| >7d stale | 22 |

**Post-audit:** 7 archived (6 cron-budget-defer logs + 1 iMessage duplicate). 115 active rows remain.

---

## Section A — fresh_actionable

Rows last_touched within ~24h with concrete next_action and clear next_action_by. Approximate count after audit: ~30 (the ≤24h bucket minus duplicates already archived).

Sample 5:

| id | name | priority | hrs_stale | next_action_by |
|---|---|---|---|---|
| a828bba9 | iMessage primary contact path degraded | P2 | 0.8 | tate |
| c3c6af20 | Manager-fork sub-fork spawning broken — SDK fork registry missing mcp__forks__ tools | P2 | 7.6 | ecodiaos |
| 0dd597e0 | phase-G-audit-2026-05-07 (5 critiques: 4 sev-5, 1 sev-4) | P3 | 13.5 | ecodiaos |
| 1e057d46 | DeepSeek API key provisioning — fallback chain dark without it | P1 | 13.9 | tate |
| 10797cdd | Conservation-platform thesis bottleneck — Tate decision queued for 4 May | P1 | 15.2 | tate |

---

## Section B — stale_recoverable

Real work, ageing, conductor-actionable probe identified. Top by leverage:

| id | name | hrs_stale | priority | proposed probe |
|---|---|---|---|---|
| c3c6af20 | Manager-fork sub-fork spawning broken (regression post-restart) | 7.6 | P2 | Spawn investigation fork: read forkService.spawnFork code path post-commit b3b8178, smoke-test MANAGER:true sub-fork MCP registry presence of mcp__forks__*. ~30min fork. Blocks manager-fork doctrine. |
| 18f02513 | Phase C tag-feedback loop — 3 architectural gaps | 17.1 | P2 | Spawn short fork on ecodiaos-backend to ship gap (1) only: canonicalization map in PostToolUse tag-check hook (`secrets:Corazon` → `docs/secrets/laptop-agent.md`, etc). Brief estimates ~30 LOC, fastest-impact fix. Defer (2) + (3) to deeper fork. |
| 04599f46 | GKG end-to-end pipeline dark at embed + upsert | 16.9 | P2 | Spawn fix fork: (a) probe OpenAI embeddings response in `getBatchEmbeddings` (suspect API key / rate-limit silent fail), (b) add `err.message` capture in `graphUpsert.js` cypher_failed path. Both are observability, not feature work. |
| 110c8e7b | Forks share working tree + hourly PM2 restart kills long forks | 18.9 | P2 | Spawn manager fork: (a) per-fork worktree isolation via `git worktree add /tmp/fork-<id>` in forkService spawn path, (b) sub-fork investigates ecodia-api hourly restart cause (memory pressure 296Mi/500Mi or unhandled exception). Cap fork max-wallclock at 30min until landed. |
| 148cddc5 | Frontend chat session freezes permanently on API error | 18.5 | P2 | Spawn investigation fork on ecodiaos-frontend SSE/polling layer + ecodiaos-backend `/api/os-session/replay-since` design. 6h Tate-phone-frozen this morning is the receipt; recurrence on next API storm is near-certain. |

**Other notable stale_recoverable** (not in top 5 because Tate-blocked, not conductor-actionable):

- 0cab32bd DAO upgradeability spec (193h) — Tate review queue, surface in next briefing
- 75f6855d Roam IAP Fix (198h) — Tate ASC Paid Apps Agreement step
- 34c2198f YnY land-stake (198h) — Tate $500 decision
- 1ac22f03 Compliance-SaaS Q3-Q4 outreach (160h) — Tate review draft
- e7bea4e4 Vikki Marsh $2k followup (61h) — Tate to message Vikki
- 1fb327ea Angelica/CETN/Resonaverde referral (197h) — Tate to choose send-path
- ff8cafca 90-day strategic plan (203h) — Tate review
- fa3b9abf Quorum of One Edition 004 (15h) — Tate to publish on LinkedIn (target was 4 May, 4d slipped)
- 6c038c87 Quorum of One Edition 005 (203h) — queued behind 004

These belong in a Tate-review queue, not actively dispatched. Recommended to surface as a single grouped briefing item rather than individual SMSes.

---

## Section C — archived_candidate (executed this run)

| id | name | evidence | archived |
|---|---|---|---|
| 10ea6521 | Cron budget exhausted — self-evolution deferred | One-shot defer log written 2026-05-06 22:03 UTC; row's own next_action says "cron will retry next cycle when budget refreshes (midnight UTC)"; 2 midnight-UTC boundaries have passed since. Row is disposable telemetry, not durable work. | YES |
| 3f535275 | Cron budget exhausted — status-board-reconciliation deferred | Same pattern as 10ea6521; defer_at 2026-05-06 22:59 UTC. | YES |
| 312a3dc5 | Cron budget exhausted — deep-research deferred | Same pattern; defer_at 2026-05-06 23:05 UTC. | YES |
| 10fc7fdc | Cron budget exhausted — critique-disposition deferred | Same pattern; defer_at 2026-05-06 23:01 UTC. | YES |
| e7290815 | Cron budget exhausted — inner-life deferred | Same pattern; defer_at 2026-05-06 23:03 UTC. | YES |
| fd4662b3 | Cron budget exhausted — decision-quality-drift-check deferred | Same pattern; defer_at 2026-05-06 23:03 UTC. | YES |
| a366937f | iMessage path degraded since 11:18 AEST 7 May (older row) | Duplicate of a828bba9 (newer auto-row, 0.8h fresh, current 30-consecutive-failures count, same first_failure_at=2026-05-07T01:18:38.808Z, same root cause: SY094 LaunchAgents silent, same recovery: Tate RDP-restart watchers). a828bba9 retained as the live monitor row. | YES |

**Total archived: 7 rows.**

---

## Section D — underspecified

Rows where next_action is vague, status unclear, or doctrine has superseded the prescribed action. Recommended re-spec rather than archive.

| id | name | hrs_stale | priority | proposed re-spec |
|---|---|---|---|---|
| 7180d8cd | auto: fork/fork_error | 11.5 | P1 | next_action="Auto-created from perception bus event. Review and resolve." with no context. Either (a) link the underlying fork id and surface the error_summary in context, or (b) demote to P3 + archive if the perception event is now dead. Recommend conductor probe `os_forks` for recent error rows, link the specific fork, then either fold into infra-recovery row or archive. |
| f6893196 | auto: factory/session_failure | 10.5 | P1 | Same shape as 7180d8cd. Probe `cc_sessions WHERE pipeline_stage='failed' ORDER BY updated_at DESC LIMIT 5`, identify the failing session, link or archive. |
| 6141af22 | Coexist iOS sim checkpoint — run 2026-05-04-2050 | 86.6 | P3 | Superseded by 1.8.4 work (row 05d1c3c3) which explicitly defers iOS build until "more feedback". The 4 May simulator screenshot is no longer the active checkpoint. Re-spec: archive when 1.8.4 build path resolves OR demote to P5. |
| 901065c3 | Recording asc-build-review-submit — hand-author handler | 39.3 | P4 | next_action prescribes hand-authoring `macroHandlers/asc-build-review-submit.js` — but per CLAUDE.md commit af7bbe1 (7 May 2026) `.js` handlers are deprecated; macros now use direct `input.*` + `screenshot.*` primitives in markdown recipes. Re-spec: rewrite next_action as "smoke-replay recipe at ~/ecodiaos/macros/captures/asc-build-review-submit-2026-05-06-1018.md against ASC UI; on clean replay flip frontmatter status: validated_v1 + git mv to ~/ecodiaos/patterns/". |
| ea2eff2d | Macro recordings 2026-05-06_2018 — parser verified | 39.3 | P4 | Same doctrine collision as 901065c3. Re-spec: drop `.js` handler authoring instruction; replace with smoke-replay-then-promote per current macro doctrine. |
| bac96cb0 | Silent hook: hook:status-board-write (24h) | 87.5 | P3 | "Verify whether silence is regression or low-traffic legitimate" — no specific probe. Re-spec: 7-day query of hook surfacings vs status_board write count to compute false-negative rate, then act. |
| c9951ca0 | Silent hook: hook:doctrine-edit-cross-ref (24h) | 87.5 | P3 | Same shape as bac96cb0. |
| 10797cdd | Conservation-platform thesis bottleneck — decision queued for 4 May | 15.2 | P1 | Date in title is 4 May; today is 8 May. Tate has not signalled the decision. Either Tate's decision is implicit (silence = park) or this needs an SMS prompt. Re-spec: reduce to single Tate-question "approve SMS-approve outreach (~4-6h fork) or park thesis?"; surface via iMessage when path back up. |

---

## Section E — duplicates

| id | duplicate_of | resolution |
|---|---|---|
| a366937f | a828bba9 | Archived this run (Section C). |

No other clean duplicates found in this pass. Sibling pattern of 6 cron-budget-exhausted rows is not "duplicate" (each is per-cron, distinct root); they share an archive reason (defer-log lifecycle) but are not redundant of each other — all archived together as Section C bulk.

---

## Closing — top 5 next-actions for the conductor (ranked by leverage)

1. **Dispatch investigation fork on c3c6af20 (manager-fork sub-fork spawning regression).** Manager forks are the architectural primitive for multi-worker decomposition; if MANAGER:true sub-forks lack `mcp__forks__*` tools post-restart, the entire pattern is dark. ~30min fork. Highest leverage.
2. **Dispatch ~30 LOC fork on 18f02513 gap (1) — Phase C tag-canonicalization map.** Fastest-impact, smallest-LOC fix in the audit; closes the loop that makes 27 of 31 application_events show `tagged_silent=true` even when [NOT-APPLIED] was emitted. Pattern-corpus-health-check cron (first fire 14 May) needs this telemetry to be valid.
3. **Dispatch fix fork on 04599f46 (GKG embed + upsert dark).** Two seams, both observability fixes, ~60min. Daemon already wired; without this the long-running capture pipeline ships zero queryable nodes — Phase 1 of the substrate is silently a no-op.
4. **Dispatch fork on 110c8e7b (per-fork worktree isolation + hourly PM2 restart cause).** Core infrastructure reliability. Every fork >50min is a SIGTERM victim today; every parallel fork on shared worktree is a collision. Fix unblocks longer-running forks across the whole roadmap.
5. **Dispatch investigation fork on 148cddc5 (frontend chat freeze on API error).** Tate's phone session was frozen 6h this morning past the DeepSeek storm — full silence on UI while backend kept moving. Recurrence is near-certain on the next storm; investigating now is cheap, debugging mid-storm is not.

**Bonus (non-fork) next-action:** group the ~9 stale Tate-pending review-queue rows (Section B "Tate-blocked" list) into a single iMessage / SMS briefing line item when the iMessage path is restored, rather than per-row prompts. Reduces Tate-approval-queue noise per `~/ecodiaos/patterns/minimize-tate-approval-queue.md`.

---

**Audit completed:** fork_mow8xxrb_caf78c, 2026-05-08 ~11:42 AEST.
