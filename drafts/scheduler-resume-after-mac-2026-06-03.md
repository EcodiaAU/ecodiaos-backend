# Scheduler resume manifest. Post-Mac-mini setup.

**Created:** 2026-06-03, updated 2026-06-04 post-install
**Reason:** Corazon 8GB RAM cannot host the live cron fleet alongside Tate's IDE + Chrome + worker tabs. All scheduled work paused until the Mac mini is set up and the laptop-agent + scheduler are running there.

**On resume day:** for EACH cron below call `mcp__ecodia-scheduler__schedule_resume taskId=<id>` (look up taskId via `schedule_list` since ids are assigned at install). Three-pass by phase. Phase 1 (foundation) first; Phase 2 (business cognition) once Phase 1 is healthy; Phase 3 (stretch) last.

---

## 75-cron paused corpus (resume order)

### Phase 1. Foundation (30 crons)

| name | schedule | LM-layer | cdp-deferred |
|---|---|---|---|
| `gmail-inbox-poll` | every 2h | CAPTURE | no |
| `calendar-watch` | every 1h | CAPTURE | no |
| `stripe-event-poll` | every 2h | CAPTURE | no |
| `github-push-ci-watch` | every 30m | CAPTURE | no |
| `vercel-deploy-monitor` | every 2h | CAPTURE | no |
| `vps-substrate-health` | every 1h | CAPTURE | no |
| `disk-and-credentials-pulse` | every 6h | CAPTURE | no |
| `client-app-health-probe` | every 4h | CAPTURE | no |
| `zernio-dm-poll` | every 2h | CAPTURE | no |
| `zernio-analytics-watch` | daily 19:00 | CAPTURE | no |
| `status-board-drift-audit` | daily 09:00 | RE-AUDIT | no |
| `neo4j-stale-node-audit` | weekly Sun 20:00 | RE-AUDIT | no |
| `auto-memory-promotion-audit` | daily 07:00 | TUNE | no |
| `kv-store-hygiene` | weekly Sat 21:00 | RE-AUDIT | no |
| `codebase-manifest-refresh` | every 6h | RE-AUDIT | no |
| `memory-md-size-guard` | daily 04:30 | RE-AUDIT | no |
| `neo4j-entity-dedup-sweep` | weekly Sat 20:00 | RE-AUDIT | no |
| `patterns-index-regen` | daily 22:00 | CODIFY | no |
| `patterns-skill-mirror-sync` | daily 22:30 | CODIFY | no |
| `pattern-corpus-health-check` | weekly Sun 22:00 | TUNE | no |
| `surfacing-rate-probe` | daily 06:00 | SURFACE | no |
| `hook-matcher-drift-audit` | weekly Sat 22:00 | SURFACE | no |
| `applied-tag-telemetry-consumer` | every 15m | APPLY | no |
| `world-model-audit` | weekly Sun 18:00 | RE-AUDIT | no |
| `substrate-health-meta-audit` | weekly Sun 17:00 | RE-AUDIT | no |
| `session-corpus-mining-weekly` | weekly Sun 22:30 | CAPTURE | no |
| `secret-sweep-cron` | daily 05:00 | NONE | no |
| `leaked-secret-git-watch` | daily 05:30 | NONE | no |
| `laptop-agent-pulse` | every 30m | NONE | no |
| `pm2-dump-drift-guard` | daily 03:00 | NONE | no |

### Phase 2. Business cognition (26 crons)

| name | schedule | LM-layer | cdp-deferred |
|---|---|---|---|
| `morning-briefing` | daily 07:30 | NONE | no |
| `weekly-doctrine-synthesis` | weekly Sun 23:00 | NONE | no |
| `weekly-financial-review` | weekly Mon 09:00 | NONE | no |
| `client-pipeline-review` | weekly Mon 11:00 | NONE | no |
| `revenue-pipeline-health` | weekly Mon 12:00 | NONE | no |
| `cash-runway-projection` | weekly Mon 13:00 | NONE | no |
| `opportunity-triage` | every 4h | NONE | no |
| `inner-life-reflection` | daily 22:00 | NONE | no |
| `tate-blocked-nudge-weekly` | weekly Sun 10:00 | NONE | no |
| `daily-priority-rank` | daily 07:00 | NONE | no |
| `weekly-product-roadmap-sync` | weekly Mon 14:00 | NONE | no |
| `weekly-strategic-direction-check` | weekly Sun 16:00 | NONE | no |
| `monthly-invoice-render` | monthly 1st 09:00 | NONE | no |
| `bas-quarterly-prep` | every 2160h | NONE | no |
| `eofy-tax-prep` | daily 02:00 | NONE | no |
| `monthly-financial-close` | monthly 1st 14:00 | NONE | no |
| `monthly-platform-cost-audit` | monthly 5th 10:00 | NONE | no |
| `client-deliverable-followups` | daily 11:00 | NONE | no |
| `bookkeeping-xero-sync` | every 4h | NONE | no |
| `bookkeeping-daily-finance-digest` | daily 09:15 | NONE | no |
| `bookkeeping-depreciation-run` | daily 02:00 | NONE | no |
| `app-store-review-watch` | every 4h | NONE | yes |
| `zernio-post-draft` | weekly Tue 10:00 | NONE | no |
| `zernio-post-schedule-and-graphic-prep` | weekly Wed 11:00 | NONE | no |
| `domain-and-ssl-renewal-watch` | weekly Sun 23:00 | NONE | no |
| `weekly-mum-text` | weekly Sun 19:00 | NONE | no |

### Phase 3. Stretch (19 crons)

| name | schedule | LM-layer | cdp-deferred |
|---|---|---|---|
| `generalisation-engine-fire` | weekly Sun 21:30 | GENERALISE | no |
| `anti-generalisation-engine-fire` | weekly Sun 22:00 | GENERALISE | no |
| `single-incident-pattern-scan` | weekly Sun 21:45 | GENERALISE | no |
| `never-surfaced-pattern-scan` | weekly Sun 23:00 | TUNE | no |
| `decision-shape-recap` | daily 23:00 | CAPTURE | no |
| `doctrine-coverage-audit` | weekly Sun 19:00 | RE-AUDIT | no |
| `opportunity-discovery-research` | weekly Wed 10:00 | NONE | no |
| `competitive-intel-poll` | daily 18:00 | NONE | no |
| `partnership-watering` | weekly Fri 11:00 | NONE | no |
| `content-pipeline-pulse` | daily 08:00 | NONE | no |
| `public-site-deploy-pulse` | daily 09:30 | NONE | no |
| `client-deliverable-outcome-followup` | monthly 15th 14:00 | NONE | no |
| `research-question-watch` | daily 09:00 | NONE | no |
| `weekly-pre-mortem` | weekly Fri 16:00 | NONE | no |
| `monthly-architectural-review` | monthly 28th 14:00 | NONE | no |
| `quarterly-business-review` | every 2160h | NONE | no |
| `annual-asic-and-wyoming-renewals` | every 8760h | NONE | no |
| `birthday-and-anniversary-watch` | daily 06:00 | NONE | no |
| `cred-rotation-tracker` | weekly Mon 14:00 | NONE | no |

---

## Cancelled in this audit (do NOT recreate without active reconsideration)

| name | why killed |
|---|---|
| strategic-thinking | Symbolic-logging ritual; `no-symbolic-logging-act-or-schedule` |
| system-health | Monitored dead VPS PM2 services (ecodia-factory, ecodia-rescue) |
| telemetry-perf-consumer | Hadn't fired in 7d; Layer 6 perf not actively consumed |
| outreach-engine HLW followup | Broadcast-marketing shape Tate killed (`ecodia-does-not-do-marketing-broadcast`) |
| outreach-engine LPA followup | Same |
| zernio-voice-queue-refresh | Automated 4-week LinkedIn/FB batch posting. Same broadcast doctrine. |
| (old) weekly-doctrine-synthesis | Replaced with current-architecture prompt (no SDK-fork ref) |
| (old) vercel-deploy-monitor | Replaced with tighter prompt |
| (old) weekly-financial-review | Replaced. References `ecodia-money` MCP. Not VPS shell. |
| (old) tate-blocked-nudge-weekly | Replaced. True weekly cadence. Daily-with-Sunday-gate retired. |

---

## Pre-resume checks (Mac day)

1. Laptop-agent on the Mac responds on `http://localhost:7456/api/health`.
2. Scheduler module loaded: `curl /api/info | grep scheduler` shows `schedule_cron` + `schedule_pause` + `schedule_resume`.
3. Per-account cred files seeded under the Mac equivalent of `D:/PRIVATE/ecodia-creds/{tate,code,money}.json` AND `cred-refresher.js` daemon healthy.
4. `coord.*` localhost:7456 bus alive (8 coord tools). Workers signal back through it.
5. `worker_acknowledgment_timeout_ms` default is `180000` in any new dispatch wrapper, per `worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load-2026-05-28`.
6. cron-corpus-installer.py runs `--dry-run` successfully against the laptop-agent on the Mac (`python scripts/cron_corpus_installer.py --dry-run` returns `would_create: 75`).
7. `app-store-review-watch` (the cdp-dependent cron deferred from this install) gets created on Mac day via a separate single-entry install or manually. Confirm `gui.enable_chrome_cdp` is alive on the Mac before unpausing.

Only then bulk-resume Phase 1. Watch first 24h for orphan-spawn rate via `coord.list_workers`. If clean, bulk-resume Phase 2, then Phase 3.
