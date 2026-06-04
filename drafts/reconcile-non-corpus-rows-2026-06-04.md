# Non-corpus scheduler row reconciliation. 2026-06-04.

**Context:** the 74-row paused cron corpus was installed 2026-06-03 to 2026-06-04 per `docs/superpowers/specs/2026-06-03-cron-corpus-design.md` and `drafts/scheduler-resume-after-mac-2026-06-03.md`. The corpus stays paused until the Mac mini hosts the live scheduler. Every other row in `os_scheduled_tasks` is non-corpus and needs classification.

**Scope discrepancy with brief.** The reconciliation brief expected "16 non-corpus active rows" (citing the manifest line at `scheduler-resume-after-mac-2026-06-03.md:123`). Actual enumeration found 66 non-corpus rows (41 live recurring or future one-shots plus 25 past-due one-shots whose `archived_at` was never set). The "16" figure in the manifest underestimated the past-due-unarchived pile. This reconciliation covers all 66.

**Outcome:** 38 KILL applied (archived with `last_status='cancelled'`), 28 KEEP-OUT-OF-CORPUS documented, 0 FOLD-INTO-CORPUS.

Final non-corpus active count: 28 (24 recurring + 4 intentional paused one-shots).
Final paused count: 78 (74 corpus + 4 intentional kept).

---

## KILL bucket (38 rows archived)

### Past-due one-shot test / validation / probe rows (already fired, no future value)

| id (short) | name | reason |
|---|---|---|
| 9aa6aa39 | `cowork.checkpoint.chain_mp6iomny_982959.iter1` | Dead cowork checkpoint chain. Run_at 2026-05-15, last_run_at null. Cowork checkpoint primitive is sunset. |
| feb13008 | `remind-tate-master-key-2026-05-22` | Reminder already fired 2026-05-26. Underlying work resolved. |
| 9a7e88df | `carbon-mrv-bundle-master-row-staleness-check-fork_moyjfvs5_b9df46` | One-shot fork follow-up, fired 2026-05-26. |
| 39abff20 | `self-sched-validation-2026-05-27` | Self-scheduling validation test, fired. |
| ad5dd486 | `kg-consolidation-director-probe-2026-05-28` | One-shot probe, fired. |
| 08309d40 | `cowork.scheduling-0th-class-e2e-validation-2026-05-28` | Scheduling e2e validation test. |
| 18b3b27c | `cowork.scheduling-vps-fire-validation-2026-05-28` | VPS-fire validation test. |
| 03bdf809 | `cowork.scheduling-vps-fire-validation-post-patch-2026-05-28` | Post-patch validation test. |
| e1bc4ea2 | `cowork.scheduling-spawn-and-die-2026-05-28` | Spawn-and-die test. |
| 8ae1fe51 | `cowork.scheduling-focus-independent-v2-2026-05-28` | Focus-independent validation test. |
| 596be4dc | `migration-roundtrip-proof-2bf2c734` | Narrow MCP migration probe, work resolved. |
| 447f6f52 | `webhook.stripe.PROBE_TEST_2bf2c734` | Same migration probe family. |
| 42aade1a | `glovebox-android-phase1-build-retry` | Build retry, fired. |
| 238a6469 | `scheduler-unification-A1-recovery-check` | Recovery check, fired. |
| 1bcf594c | `dao-amendment-state-approval-checkpoint-june-1` | Fired 2026-06-01, work resolved. |
| 097c7498 | `e2e-submit-key-fix-2026-06-02` | E2E test fix probe. |
| 1b13432e | `e2e-pid-target-fix-2026-06-02` | E2E test fix probe. |
| 31a67c6f | `e2e-hwnd-fix-2026-06-02` | E2E test fix probe. |
| 8c571ba5 | `e2e-long-prompt-2026-06-03` | E2E test probe. |
| e1355f4a | `e2e-focus-group-2026-06-03` | E2E test probe. |
| cc8a215b | `locals-ios v1.0.0(2) attach build to Internal TestFlight group` | One-shot ship task, fired 2026-06-03. |

### Explicitly cancelled in resume-manifest audit (broadcast-marketing + dead-VPS-monitor + symbolic-logging)

| id (short) | name | reason |
|---|---|---|
| 1ef8fb7f | `strategic-thinking` | Symbolic-logging ritual per `no-symbolic-logging-act-or-schedule`. Manifest explicit kill. |
| 6300912a | `system-health` | Monitored dead VPS PM2 services (ecodia-factory, ecodia-rescue). Manifest explicit kill. |
| 3c5929ef | `telemetry-perf-consumer` | Hadn't fired 7d, Layer 6 perf not actively consumed. Manifest explicit kill. |
| 30148e06 | `outreach-engine HLW followup check` | Broadcast-marketing shape Tate killed (`ecodia-does-not-do-marketing-broadcast`). |
| 00a2b73c | `outreach-engine LPA followup check` | Same. |
| b2d631ee | `zernio-voice-queue-refresh-jun-6` | Same broadcast-marketing doctrine. |
| 45332b75 | `marketing-outreach` | Broadcast-marketing shape, last_run 2026-04-14. Same kill. |
| 369cbb62 | `outreach-engine` | Broadcast-marketing shape, last_run 2026-04-12. Same kill. |
| 103e321e | `outreach-engine followup: QWaLC (Darryl Ebenezer)` | Outreach-engine descendant, broadcast shape. |
| c700363a | `outreach-engine followup: Silicon Coast / UniSC warm-channel` | Same. |

### Superseded by corpus row

| id (short) | name | reason |
|---|---|---|
| a45d74f3 | `bookkeeping-tax-prep-eofy` | Superseded by corpus `eofy-tax-prep`. |
| c2606d3b | `daily-index-regen` | Superseded by corpus `patterns-index-regen`. |

### Stale recurring crons (no fire >30d, no live consumer)

| id (short) | name | reason |
|---|---|---|
| 75a3f570 | `parallel-builder` | Last_run 2026-04-28, no consumer post-SDK-fork death. |
| 336983d0 | `silent-loop-detector` | Last_run 2026-05-01, dormant. |
| 62e22465 | `tate-night-update` | Last_run 2026-04-30, dormant. |
| fc0a3f6f | `phase-G-adversarial-audit` | Last_run 2026-05-18, phase-G work concluded. |
| c5cfdd12 | `critique-disposition` | Last_run 2026-05-18, no consumer. |

---

## KEEP-OUT-OF-CORPUS bucket (28 rows untouched)

### Intentional ad-hoc paused one-shots (future fire windows Tate set up)

| id (short) | name | run_at | reason |
|---|---|---|---|
| afdc314f | `coexist-june-licence-invoice-send` | 2026-06-06 | Co-Exist June invoice send, real future fire. |
| 29f4d145 | `coexist-july-licence-invoice-send` | 2026-07-06 | Co-Exist July invoice send, real future fire. |
| 0201ef58 | `atlassian-aug17-opt-out-fire-window` | 2026-07-12 | Atlassian opt-out window, real future fire. |
| 95d99194 | `bitbucket-token-rotation` | 2027-03-16 | Annual Bitbucket token rotation reminder, real future fire. |

### Live recurring crons (firing recently, no corpus replacement yet active)

| id (short) | name | cadence | last_run |
|---|---|---|---|
| 512beeaf | `chambers-apple-review-watch` | every 4h | (new, not yet fired) - active Chambers iOS review monitoring. |
| 28be1e95 | `coexist-stats-drift-check` | daily 02:00 | 2026-06-03 22:18 |
| 7866e857 | `external-blocker-freshness-probe` | daily 06:00 | 2026-06-03 22:18 |
| 276d2ce5 | `bookkeeping-annual-obligations` | daily 09:00 | 2026-06-03 22:18 |
| bad85847 | `coexist-dupe-suspect-check` | daily 09:00 | 2026-06-03 22:18 |
| 9f95b7f1 | `coexist-sync-health` | daily 09:00 | 2026-06-03 22:18 |
| 8982a038 | `bookkeeping-fx-rates-import` | daily 17:30 | 2026-06-03 22:18 |
| e12c26d8 | `claude-md-reflection` | daily 20:00 | 2026-06-03 22:18 |
| 3d0fdb78 | `daily-codification-scan` | daily 21:00 | 2026-06-03 22:18 |
| 79d871d0 | `daily-telemetry` | daily 23:00 | 2026-06-03 22:18 |
| 851cccd9 | `status-board-reconciliation` | every 12h | 2026-06-03 22:18 |
| 0c28bfbb | `telemetry-dispatch-consumer` | every 15m | 2026-06-02 19:37 - the design doc explicitly says this IS the corpus `applied-tag-telemetry-consumer` shipping. |
| 49d9ffe2 | `decision-quality-classifier` | every 1h | 2026-06-03 22:18 |
| f883f030 | `email-triage` | every 1h | 2026-06-03 22:18 - analogue of corpus `gmail-inbox-poll`; keep until corpus unpauses. |
| b33bc951 | `meta-loop` | every 1h | 2026-06-03 22:18 - the core hourly meta-loop. |
| c08194eb | `telemetry-outcome-inference` | every 30m | 2026-06-02 19:40 |
| 24a2890a | `deep-research` | every 3h | 2026-06-03 22:18 |
| 883c5fc4 | `kg-embedding` | every 4h | 2026-06-03 22:18 |
| a7180fe7 | `self-evolution` | every 4h | 2026-06-03 22:18 |
| 598453ff | `decision-quality-drift-check` | every 6h | 2026-06-03 22:18 |
| a41e0af3 | `inner-life` | every 6h | 2026-06-03 22:18 (distinct from corpus `inner-life-reflection`) |
| 80f8cb50 | `kg-consolidation` | every 6h | 2026-06-03 22:18 |
| d0c930e3 | `neo4j-keepalive` | every 6h | 2026-06-03 22:18 |
| 770bde0a | `peer-monitor` | every 72h | 2026-06-03 22:18 |

---

## FOLD-INTO-CORPUS bucket

Zero. The corpus is settled and these recurring rows are either already represented by a corpus equivalent (kept live until corpus unpause) or were authored to be retired in their pre-corpus form.

---

## Verification

Final state after kill:
- 78 paused (74 corpus + 4 intentional kept one-shots)
- 24 active recurring (all kept-out-of-corpus, all firing)
- 0 active one-shots in the past with no archive

Total non-corpus active = 28 (matches KEEP count).

Pattern reference: `cancel-stale-schedules-when-work-resolves-early` (stale one-shots whose work is resolved must be killed, not left to fire against resolved state).
