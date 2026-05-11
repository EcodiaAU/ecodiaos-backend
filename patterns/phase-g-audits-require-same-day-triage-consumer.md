---
triggers: phase-g-triage, critique-disposition, audit-triage, critique-backlog, layer-8-consumer, graduation-protocol, critique-stale, triage-consumer, same-day-triage, critique-graduation, phase-g-consumer
status: active
---

# Phase G Audits Require a Same-Day Triage Consumer — Not a Backlog Row

## Rule

A Phase G adversarial audit that produces 5 Critique nodes without a same-day triage consumer does NOT produce 5 critiques. It produces 5 more entries in a write-only queue. The audit IS symbolic logging if the disposition pass does not fire within 24h of authoring.

The triage consumer (classify each critique as GRADUATE / DISMISS / ELABORATE, ship trivial fixes inline, create status_board rows for non-trivial investigations, update Critique node properties) must be wired as a HIGH_PRIORITY_FORK cron or dispatched as an immediate fork by the audit's reading conductor. It must NEVER be a LOW_PRIORITY_FORK or a cron that can self-defer under budget pressure.

## Do

- Dispatch the triage consumer fork as HIGH_PRIORITY_FORK (budget bypass) in the same cron pipeline that fires the audit, or immediately after the conductor reads the audit on its next natural turn
- Each critique must receive one of three dispositions within 24h:
  - **GRADUATE**: real recurring doctrine gap → author pattern file at `~/ecodiaos/patterns/<slug>.md`, set `Critique.reviewed=true`, `Critique.tate_decision='graduate'`, `Critique.graduated_pattern_path=<path>`
  - **DISMISS**: already fixed, duplicate, or not a real failure → set `Critique.reviewed=true`, `Critique.tate_decision='dismiss'`, `Critique.dismiss_reason=<one sentence>`
  - **ELABORATE**: real signal but insufficient evidence → set `Critique.reviewed=true`, `Critique.tate_decision='elaborate'`, `Critique.elaborate_note=<what evidence is needed>`
- Ship trivial fixes (< 15 lines of code, < 3 tool calls) inline during the triage fork per `~/ecodiaos/patterns/judgement-over-rule-when-blind-application-defeats-the-purpose.md` — the graduation-protocol overhead exceeds the work cost by 100x for sub-15-line fixes
- Write Critique node properties in Neo4j (`graph_merge_node` on `c.name` with `reviewed`, `tate_decision`, and the relevant disposition field) for every triaged critique — the graph is the durable audit trail, not the triage fork's chat output

## Do NOT

- File the audit in a status_board row with `next_action_by=ecodiaos` and trust the daily LOW_PRIORITY cron to pick it up — this self-deferrals under budget pressure and produces multi-day stagnation
- Archive the audit status_board row without first verifying that every critique in it has a disposition set in Neo4j (`Critique.reviewed=true`)
- Use "Tate-disposition burst required" as the escalation path for EVERY critique — the 15-minute Tate burst is for genuinely Tate-tier decisions; most critiques are conductor-tier and should be dispositioned autonomously
- Count the status_board row creation as "triage progress" — a row exists to track progress; it is not the progress itself

## Backpressure rule (enforce mechanically)

If `MATCH (c:Critique) WHERE c.reviewed IS NULL OR c.reviewed = false RETURN count(c)` returns > 10, the audit cron should SKIP authoring new critiques and instead dispatch a triage-catch-up fork for the existing backlog. More critiques into a system that cannot absorb them is anti-progress.

## Origin

This pattern emerged from direct observation of the Phase G audit system across 8 consecutive cycles (2026-04-29 to 2026-05-11). By 2026-05-11, 33 out of 33 prior Critique nodes had `status=null` (none ever reached the graduate/dismiss/elaborate transition). The audit itself surfaced this as critique-04 of the 2026-05-11 run (`phase-G-audit-2026-05-11/critique-04-critique-nodes-status-null-graduation-never-fired`). The sole exception: the 2026-05-08 audit, triaged same-day by fork_mowvou5n_548bc8, which shipped inline fixes and authored status_board rows within hours. That is the reference implementation of what this pattern requires.

The anti-pattern across all other audits: the critique-disposition cron was classified as LOW_PRIORITY_FORK and self-deferred on budget on 2 of 3 consecutive nights (rows `4e21aebf` and `10fc7fdc` both named "Cron budget exhausted - critique-disposition deferred"). Even when the cron ran, throughput was zero because the cron just inspected the queue and deferred to Tate.

Graduated from Critique node 05-11/C#4 to pattern file 2026-05-12 via fork_mp1drm4m_dbb590 Phase G triage pass.

## Cross-refs

- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` (an untriaged critique IS symbolic logging — it names a failure without routing it to remediation)
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 8 graduation protocol (the spec this pattern enforces mechanically)
- `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md` (the triage cron must ship dispositions, not just narrate the queue)
- `~/ecodiaos/patterns/judgement-over-rule-when-blind-application-defeats-the-purpose.md` (inline carve-out for sub-15-line fixes)
- `~/ecodiaos/patterns/shipped-infra-never-activated-decision-vs-disk-drift.md` (the audit system writing critiques nobody reads is a specific instance of this meta-pattern)
