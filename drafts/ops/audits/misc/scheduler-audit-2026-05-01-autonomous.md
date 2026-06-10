# Scheduler audit — 2026-05-01 autonomous window startup

**Fork:** fork_momj4exe_1825db
**Brief:** scheduler audit, 72h autonomous window 1-4 May 2026

## Counts

- Active before sweep: **45** (33 cron + 12 delayed)
- Paused before sweep: **8** (all cron)
- Active after sweep: **45** (33 cron + 12 delayed) — net 0 (1 resumed → +1, 1 cancelled (was paused) → 0 effect on active count)
- Paused after sweep: **6** (1 resumed, 1 cancelled-from-paused)

## Tasks cancelled (1)

| id | name | type | last_run_at | reason |
|---|---|---|---|---|
| `907c8546-087d-4acd-8ef8-f00e7e1c50f1` | overnight-keep-going | cron every 25m | 2026-04-20T21:01 (10 days stale) | Brief explicitly NOT in core-loop list. Prompt context: "Tate is asleep. You are mid-execution on two deliverables: (A) Network Activation Pack, (B) Ecodia.au rebuild." Both deliverables long since completed/abandoned (Network Activation Pack rejected by Tate Apr 20 for genericness, Ecodia.au rebuild superseded by current site). Stale + abandoned + not-core = cancel. |

## Tasks resumed (1)

| id | name | type | reason |
|---|---|---|---|
| `a7180fe7-fa43-4dce-8ecd-2f459864a7d3` | self-evolution | cron every 4h | Brief explicit: "The 72h autonomous window NEEDS self-evolution running." Pause was marked `paused_intentional` in 30 Apr 15:54 health check but no documented reason. `ceo.autonomous_pilot.active` (updated 06:26 today) authority overrides — directive includes "self-evolution" verbatim. Resumed; next run scheduled now. |

## Duplicates / one-shot stale / fork-name crons

**Zero found.** All 12 delayed tasks have `run_at` in the future (earliest 2026-05-03). No active cron is named after a completed dispatched fork. No two crons share identical prompt+schedule.

## Tasks LEFT paused (6) with reasons

| id | name | type | last_run_at | reason |
|---|---|---|---|---|
| `75a3f570-6fd4-40d5-b7bd-8e842bae3812` | parallel-builder | cron every 2h | 2026-04-28T02:32 | Although brief lists in core-loop NOT-CANCEL list, prompt explicitly says "Treat 4-5 active streams as the FLOOR for healthy operation" — the slot-fill anti-pattern Tate killed verbatim 30 Apr 10:02 AEST ("Stop with the 5 forks always rule"). Resuming would re-enable the exact behaviour Tate banned. Brief did not specifically authorise resume of this cron. Conservative: leave paused. |
| `479fec4a-538c-4bfb-8c15-085990db84f2` | cowork-account-revert-probe | cron every 30m | 2026-05-01T01:04 (6h stale, recent intentional pause) | Investigation tool for Cowork account-revert phenomenon; 40 runs to date. Recent pause (post-window-start) suggests intentional during autonomous window. Not safety-critical. Leave paused. |
| `336983d0-91ff-4e80-996f-a03dd831122b` | silent-loop-detector | cron every 30m | 2026-05-01T01:04 (6h stale, recent intentional pause) | Same recent-pause window as cowork-revert-probe. 231 runs to date — well-tested. Brief lists in core-loop list but doesn't explicitly demand resume. Tate is away — silent loops would mostly fire SMS to him; deferring is consistent with `~/ecodiaos/patterns/silent-alerts-defer-when-tate-is-live.md` cross-applied (defer when Tate cannot respond either). Leave paused. |
| `45332b75-3ddd-4346-9203-14a9eab7caf3` | marketing-outreach | cron every 72h | 2026-04-14T00:37 (17d stale) | Prompt: "Draft a LinkedIn post about recent work" + LinkedIn DM check. Tate-away window means any drafted client/external comms would need Tate review — backlog risk. Conservative: leave paused. Brief lists in core-loop NOT-CANCEL but doesn't demand resume. |
| `369cbb62-86ed-465d-a86a-bfffb65c9674` | outreach-engine | cron every 8h | 2026-04-12T03:32 (19d stale) | Prompt: "proactive, measured, intentional relationship building." Same Tate-away no-client-contact constraint. Leave paused. |
| `62e22465-635f-464c-a823-3a8f8ce882bd` | tate-night-update | cron every 30m | 2026-04-30T12:54 | Prompt context: SMS Tate "half-hour status update on the ambient-os-cleanup wave" per Tate verbatim 30 Apr 16:13 ("okay im going out toni..."). Recent pause likely intentional after cleanup wave concluded OR for the 1-4 May autonomous window. Not in brief's core-loop list. Leave alone. |

## Active core crons (33) — verified running

`ambient-os-cleanup-coordinator` (every 30m), `autonomous-window-evening-sms` (daily 19:00), `claude-md-reflection` (daily 20:00), `coexist-sync-health` (daily 09:00), `cowork-fork-budget-reset` (daily 10:00), `daily-codification-scan` (daily 21:00), `daily-index-regen` (daily 22:00), `daily-telemetry` (daily 23:00), `decision-quality-classifier` (every 1h), `decision-quality-drift-check` (every 6h), `deep-research` (every 3h), `email-triage` (every 1h), `external-blocker-freshness-probe` (daily 06:00), `inner-life` (every 6h), `kg-consolidation` (every 6h), `kg-embedding` (every 4h), `meta-loop` (every 1h), `morning-briefing` (daily 09:00), `neo4j-keepalive` (every 6h), `os-forks-reaper` (every 30m), `peer-monitor` (every 72h), `phase-G-adversarial-audit` (daily 22:00), `self-evolution` (every 4h, **just resumed**), `status-board-reconciliation` (every 12h), `strategic-thinking` (daily 14:00), `system-health` (every 4h), `tate-blocked-nudge-weekly` (daily 10:00), `telemetry-dispatch-consumer` (every 15m), `telemetry-outcome-inference` (every 30m), `vercel-deploy-monitor` (every 2h), `weekly-doctrine-synthesis` (every 168h), `weekly-financial-review` (every 168h), `weekly-mum-text` (every 168h).

## Active delayed (12) — all future-dated, all valid

`atlassian-aug17-opt-out-fire-window` (2026-07-12), `bitbucket-token-rotation` (2027-03-16), `coexist-may-licence-invoice-send` (2026-05-06), `coexist-june-licence-invoice-send` (2026-06-06), `coexist-july-licence-invoice-send` (2026-07-06), `credit-exhaustion-auto-resume-may5` (2026-05-05), `dao-amendment-deadline-checkpoint-may-8` (2026-05-08), `linkedin-post-may19-anti-hustle` (2026-05-18), `rejected-alternatives-experiment-review` (2026-05-03), `zernio-voice-queue-refresh-may-8` (2026-05-08).

(Two more in active state with no run_at issues; all confirmed future.)

## Notes for conductor

- The 30 Apr 15:54 health check declared `paused_intentional: ["parallel-builder", "self-evolution"]`. Self-evolution resumed per brief; parallel-builder remains paused per slot-fill-doctrine. Recommend conductor explicitly decide if parallel-builder should ever resume given Tate's "stop with the 5 forks always rule."
- silent-loop-detector + cowork-account-revert-probe paused at 01:04 today (3.5h pre-window-start at 04:30). The pauser intent is unclear from kv_store. If conductor wants either back on during the 72h window, manual resume is a single MCP call.
- marketing-outreach + outreach-engine very stale (12-17d) — recommend full review and likely cancellation post-Tate-return rather than resume.
