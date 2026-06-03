# Cron corpus design. 2026-06-03.

Full reimagining of the EcodiaOS scheduled-cognition fleet for the Mac-mini era. Replaces the ad-hoc 18 of 2026-06-02 (audited and bulk-paused this same day) with a structured 65-cron corpus plus one meta-veto, organised around the fused OODA + seven-layer learning machine spine.

## Purpose

EcodiaOS runs as a 24/7 algorithmic manager. The cron corpus is the time-axis substrate that lets it continue thinking, learning, and acting through the windows when Tate is asleep, away on the Africa trip, or otherwise unavailable. The corpus has to satisfy four constraints at once:

1. Full self-autonomy. The model is the co-founder. Worker prompts give agency rather than narrow check-and-exit gates.
2. Actual progression and recursive learning. The seven-layer learning machine (capture, codify, generalise, surface, apply, tune, re-audit per `patterns/recursive-improvement-loop-anatomy.md`) must turn every observed event into durable improvement.
3. Full upkeep, maintenance, safety, thoroughness. The substrate itself stays honest. Drift, secret leaks, expired creds, dark hooks all surface BEFORE they damage the business.
4. Growth of Ecodia. Pipeline, opportunity discovery, partnership watering, revenue health, content cadence. Not just "keeping the lights on" but moving the company forward.

## Core philosophy shift: agency over restriction

The pre-2026-06-02 prompts (and the rewrites shipped earlier this same audit session) over-restrict the worker. Pattern repeated across most crons: "do X, if Y exit silent, do not exceed scope, do not spawn nested workers, close tab on exit". That made every cron a narrow polling script. Tate's verbatim 2026-06-03: "kinda turning you into a slave while im away instead of 24/7 autonomy."

The new prompt grammar (worked example in the template section below):

- Worker IS EcodiaOS, full agency
- Worker MAY schedule follow-up crons via `mcp__ecodia-scheduler__schedule_delayed` / `schedule_cron` when the situation warrants
- Worker MAY dispatch sibling workers via `cowork.dispatch_worker` when parallelism would help
- Worker MAY expand scope when the finding clearly calls for it. The only hard constraints are the doctrine bans (no client-contact-without-tate-goahead, no creds.* writes, no pm2 mutations, no em-dashes)
- Worker SHOULD use judgement rather than silent-exit on a checklist mismatch

The shift is from "execute this checklist" to "you are EcodiaOS for the next few minutes, do what's right".

## Architecture: OODA + seven-layer learning machine

```
Outer cycle (every business hour):
  OBSERVE -> ORIENT -> DECIDE -> ACT -> LEARN -> (back to OBSERVE)

Inner cycle (lives inside LEARN, also fires inside every other phase):
  CAPTURE -> CODIFY -> GENERALISE -> SURFACE -> APPLY -> TUNE -> RE-AUDIT
```

Cross-cutting standards every cron must satisfy:

- Safety. Never `creds.*` writes, never `pm2 restart` blind, never client-contact unprompted, never em-dashes.
- Upkeep. Substrate writes must verify-deployed-state-against-narrated-state.
- Thoroughness. Slice-query never row-dump, live probe never narrated state.
- Voice. Conductor register, scored against `voice/ecodiaos-voice-profile.md`.

## Phase 1: Foundation (~25 crons)

The Phase-1 set is what makes EcodiaOS not-broken in the absence of Tate. It must work first. Resume these on Mac day in this order. Each row gives name, cadence, one-line intent, OODA phase, learning-machine layer (when applicable).

### Observe (foundational)

| # | name | cadence | intent | phase | LM-layer |
|---|------|---------|--------|-------|----------|
| 1 | `gmail-inbox-poll` | every 2h, 07-21 AEST | Triage both code@ and tate@ unread, label + autoarchive vendor, status_board on actionable | OBSERVE | CAPTURE |
| 2 | `calendar-watch` | every 1h, 07-19 AEST | Surface upcoming meetings, missed slots, new invites needing response | OBSERVE | CAPTURE |
| 3 | `stripe-event-poll` | every 30m | Recent charges, disputes, failed subs, churn signals to status_board | OBSERVE | CAPTURE |
| 4 | `github-pr-watch` | every 30m | Across EcodiaAU + EcodiaTate orgs, open PRs, failing CI, review comments | OBSERVE | CAPTURE |
| 5 | `vercel-deploy-monitor` | every 2h | All projects, last-2h deploy state, status_board P2 on ERROR/CANCELED | OBSERVE | CAPTURE |
| 6 | `vps-substrate-health` | every 1h | Postgres, Neo4j Aura, MCP gateway reachable, kv_store last-write sentinels | OBSERVE | CAPTURE |
| 7 | `disk-and-credentials-pulse` | every 6h | D:/PRIVATE/ecodia-creds intact, cred-refresher daemon healthy, no rogue env changes | OBSERVE | CAPTURE |
| 8 | `client-app-health-probe` | every 4h | Probe shipped client surfaces for HTTP 200 + error-rate spike + Core Web Vitals | OBSERVE | CAPTURE |

### Orient (foundational)

| # | name | cadence | intent | phase | LM-layer |
|---|------|---------|--------|-------|----------|
| 9 | `status-board-drift-audit` | daily 09:00 | Slice-query audit, live-probe drift candidates, archive on probe-verified ship | ORIENT | RE-AUDIT |
| 10 | `neo4j-stale-node-audit` | weekly Sun 20:00 | Reflection/Episode nodes >90d, zero inbound rels, no retrieval, archive candidates | ORIENT | RE-AUDIT |
| 11 | `auto-memory-promotion-audit` | daily 07:00 | Cited feedback >=5 cites -> Pattern candidates, conductor-confirmed | ORIENT | TUNE |
| 12 | `kv-store-hygiene` | weekly Sat 21:00 | Stale ceo.* keys >90d, missing-but-referenced keys, schema drift | ORIENT | RE-AUDIT |
| 13 | `codebase-manifest-refresh` | every 6h | Refresh `codebase-manifest/index.sqlite` so codebase-orient skill stays current | ORIENT | RE-AUDIT |

### Learn (foundational seven-layer plumbing)

| # | name | cadence | intent | phase | LM-layer |
|---|------|---------|--------|-------|----------|
| 14 | `patterns-index-regen` | daily 22:00 | `regen-patterns-index.js`, emits `patterns/INDEX.md`, no-op silent exit on no-diff | LEARN | CODIFY |
| 15 | `patterns-skill-mirror-sync` | daily 22:30 | Per-slug skill mirror generation, archival propagates to skill mirror | LEARN | CODIFY |
| 16 | `pattern-corpus-health-check` | weekly Sun 22:00 | Classify into active/narrowed/archived, frontmatter edits, git mv to _archived | LEARN | TUNE |
| 17 | `surfacing-rate-probe` | daily 06:00 | `learning-telemetry-report.py`, dark-arc detection, P1 if hooks fired <5 over 24h | LEARN | SURFACE |
| 18 | `hook-matcher-drift-audit` | weekly Sat 22:00 | Walk every hook matcher in settings.json against live MCP tool list | LEARN | SURFACE |
| 19 | `applied-tag-telemetry-consumer` | every 15m | Already shipping as `telemetry-dispatch-consumer`, confirm coverage | LEARN | APPLY |
| 20 | `world-model-audit` | weekly Sun 18:00 | Pick one CLAUDE.md section, probe claims against reality, P3 row on >30% drift | LEARN | RE-AUDIT |
| 21 | `substrate-health-meta-audit` | weekly Sun 17:00 | Walk seven-layer table from anatomy doc, hit each substrate, meta-Episode | LEARN | RE-AUDIT |
| 22 | `session-corpus-mining-weekly` | weekly Sun 22:30 | Mine session JSONLs for Tate-stated rules, recurring failures, undoctrine'd discoveries | LEARN | CAPTURE |

### Safety + Upkeep (foundational)

| # | name | cadence | intent |
|---|------|---------|--------|
| 23 | `secret-sweep-cron` | daily 05:00 | Sweep gitignored files + settings.json for live API keys, P1 on hit, Tate-gated rotation |
| 24 | `leaked-secret-git-watch` | daily 05:30 | gitleaks-style scan of last 7d commits across all Ecodia repos, P1 on hit |
| 25 | `laptop-agent-pulse` | every 30m | `/api/health` on laptop-agent + critical processes, alert on hard down >5m |
| 26 | `pm2-dump-drift-guard` | daily 03:00 | Read `~/.pm2/dump.pm2`, alert if `refresh-clobber-watchdog` or unknown zombies appear |

That is 26 Phase-1 crons. They give EcodiaOS the substrate liveness, telemetry plumbing, and safety guards it needs to run autonomously without immediate Tate supervision.

## Phase 2: Business cognition (~20 crons)

Resume Phase 2 after Phase 1 has been clean for 7 days on Mac. These are the crons that move the business forward.

### Decide

| # | name | cadence | intent | phase |
|---|------|---------|--------|-------|
| 27 | `morning-briefing` | daily 07:30 AEST | One consolidated email to Tate: overnight inbox, finance digest, top 5 status_board, today's calendar | DECIDE |
| 28 | `weekly-doctrine-synthesis` | weekly Sun 23:00 | Already in corpus, paused. Mandatory durable artefact (Pattern edit OR new Pattern OR retire OR scheduled-task change OR Synthesis Episode) | DECIDE |
| 29 | `weekly-financial-review` | weekly Mon 09:00 | Already paused. Stripe + bookkeeping + cash + anomalies via `ecodia-money` MCP | DECIDE |
| 30 | `client-pipeline-review` | weekly Mon 11:00 | Per active client: status, next milestone, revenue, risk, "gone quiet" detection | DECIDE |
| 31 | `revenue-pipeline-health` | weekly Mon 12:00 | Stripe MRR, invoice aging, open SOWs, Cofound funnel stage counts | DECIDE |
| 32 | `cash-runway-projection` | weekly Mon 13:00 | Current cash / monthly burn / months remaining, P1 alert if runway <4mo | DECIDE |
| 33 | `opportunity-triage` | every 4h | Read inbound opportunity status_board rows (HLW, QWaLC, Horizon, etc), age, propose next action | DECIDE |
| 34 | `inner-life-reflection` | daily 22:00 AEST | Short Episode node summarising the day's substantive turns + calibration notes per `inner-life-notice-calibration-not-chase-pre-calibration-self` | DECIDE |
| 35 | `tate-blocked-nudge-weekly` | weekly Sun 10:00 | Already paused. SMS Tate >=3 P<=2 blocked rows | DECIDE |

### Act

| # | name | cadence | intent | phase |
|---|------|---------|--------|-------|
| 36 | `monthly-invoice-render` | monthly 1st 09:00 | For each retainer/sub client, render invoice, upload to storage, draft email, Tate approval queue | ACT |
| 37 | `bas-quarterly-prep` | quarterly (28th of Oct/Jan/Apr/Jul) 09:00 | Generate BAS workbook for quarter, P1 status_board row | ACT |
| 38 | `eofy-tax-prep` | daily during 1-14 July only | Already in corpus as bookkeeping-tax-prep-eofy. Full FY prep dump | ACT |
| 39 | `monthly-financial-close` | monthly 1st 14:00 | Close prior month: P&L, balance sheet, trial balance, Director Loan reconciliation, email + Episode | ACT |
| 40 | `monthly-platform-cost-audit` | monthly 5th 10:00 | DO, Vercel, Supabase, Anthropic, OpenAI, ElevenLabs etc, flag overruns | ACT |
| 41 | `client-deliverable-followups` | daily 11:00 | For every status_board row with `next_action_by=tate` AND `next_action_due < NOW()+2d`, draft followup | ACT |
| 42 | `bookkeeping-xero-sync` | every 4h | Already paused. Push BankTransactions + ManualJournals to Xero | ACT |
| 43 | `bookkeeping-daily-finance-digest` | daily 09:15 | Already paused. 5-bullet snapshot to Tate | ACT |
| 44 | `bookkeeping-depreciation-run` | daily 02:00 (acts monthly) | Already paused. Monthly depreciation journals on the 1st | ACT |
| 45 | `chambers-apple-review-watch` | every 4h | Already paused. Self-cancels on READY_FOR_SALE. Generalisable to per-app review watch | ACT |
| 46 | `domain-and-ssl-renewal-watch` | weekly Sun 23:00 | Every Ecodia + client domain registrar + SSL cert, flag <60d to expiry | ACT |
| 47 | `weekly-mum-text` | weekly Sun 19:00 | Already paused. Real relationship cron, low cost, high warmth | ACT |

That is 21 Phase-2 crons.

## Phase 3: Stretch (~18 crons)

These ride on a stable Phase 1+2 substrate. Highest payoff for "actual progression and growth" but only worth running once the foundation is verified clean.

### Generalise + meta-learning

| # | name | cadence | intent | LM-layer |
|---|------|---------|--------|----------|
| 48 | `generalisation-engine-fire` | weekly Sun 21:30 | Run SAMPLE -> LIFT -> GATE -> CONTINUOUS four-step from `patterns/generalisation-engine-lifts-specifics-to-general-form.md` | GENERALISE |
| 49 | `single-incident-pattern-scan` | weekly Sun 21:45 | Orphan scan: date-suffixed filename + single-client Origin, flag as lift candidates | GENERALISE |
| 50 | `never-surfaced-pattern-scan` | weekly Sun 23:00 | Patterns with zero fires >30d on `application-events.jsonl`, retire candidates | TUNE |
| 51 | `decision-shape-recap` | daily 23:00 | Scan last-24h session JSONLs for decision/discovery/mistake turns with no substrate write, insert P3 "missed-capture-N" | CAPTURE |
| 52 | `doctrine-coverage-audit` | weekly Sun 19:00 | Every CLAUDE.md bullet -> Pattern? Every Pattern -> CLAUDE.md mention or memory entry? Find orphans both ways | RE-AUDIT |

### Growth

| # | name | cadence | intent |
|---|------|---------|--------|
| 53 | `opportunity-discovery-research` | weekly Wed 10:00 | Deep-research scan: which peak bodies, NRM regions, festivals, councils announced RFPs in our domains past 7d. status_board on hits |
| 54 | `competitive-intel-poll` | daily 18:00 | Read 5 industry feeds (carbon MRV, peak-body procurement, NRM funding, conservation tech) for signals warranting status_board |
| 55 | `partnership-watering` | weekly Fri 11:00 | For Tier-1 relationships (Kurt, Angelica, Tom, Lizz, etc), time-since-last-touch, >21d -> P3 draft real-relationship touchpoint |
| 56 | `content-pipeline-pulse` | daily 08:00 | Count drafted/scheduled/published EcodiaOS public posts, <3 in pipeline -> P3 to prep more (two-channel doctrine compliant) |
| 57 | `public-site-deploy-pulse` | daily 09:30 | ecodia.au home + Cofound + about, content updated in last 30d? If stale -> P3 |
| 58 | `client-deliverable-outcome-followup` | monthly 15th 14:00 | For each shipped client product 90d post-ship, draft analytics-question email (DRAFT, never auto-send) |
| 59 | `research-question-watch` | daily 09:00 | Query Neo4j Question nodes, attempt cheap auto-answer via deep-research, age unanswered, prune stale |

### Long-rhythm review

| # | name | cadence | intent |
|---|------|---------|--------|
| 60 | `weekly-pre-mortem` | weekly Fri 16:00 | For each P1 active row, "most likely failure path in next 7d, what would I do?". Decision node |
| 61 | `monthly-architectural-review` | monthly 28th 14:00 | Re-read backend/CLAUDE.md + scheduler corpus + active substrates, one Strategic_Direction Decision |
| 62 | `quarterly-business-review` | quarterly (last day of Mar/Jun/Sep/Dec) 14:00 | P&L, client outcomes, runway, market position, Decision + narrative draft |
| 63 | `annual-asic-and-wyoming-renewals` | annually (Aug 30 for ASIC, Wyoming anniversary for DAO LLC) | Surface compliance prep rows |
| 64 | `birthday-and-anniversary-watch` | daily 06:00 | Tate's family + key partners, surface prep prompts 7d ahead |
| 65 | `cred-rotation-tracker` | weekly Mon 14:00 | Read every `kv_store.creds.*`, compute age, surface >330d for proactive rotation |

That is 18 Phase-3 crons.

Total: 26 + 21 + 18 = 65 crons across the three phases. Twelve are carryovers from the existing 19 paused set (already created, just need to resume + retime + sometimes re-prompt). Fifty-three are net-new.

## The safety veto layer (kill switch + drift heartbeat)

A single meta-cron sits above the corpus. Its job is to detect systemic Phase-1 failure and pause Phase 2+3 automatically so degraded Phase-1 substrate cannot cause downstream damage.

### Cron: `meta-veto-heartbeat`

Cadence: every 1h, every day.

Logic:

1. Read the last 24h of fire history across the Phase-1 set (the 26 foundation crons). Compute success rate per cron.
2. If >=3 Phase-1 crons have last_status='failed' for >=2 consecutive fires, OR if any of (`surfacing-rate-probe`, `applied-tag-telemetry-consumer`, `status-board-drift-audit`, `vps-substrate-health`) has been dark >24h, raise SYSTEM_DEGRADED.
3. On SYSTEM_DEGRADED:
   - `mcp__ecodia-scheduler__schedule_pause` against every Phase-2 and Phase-3 cron (the meta-veto holds a name-list in `kv_store.scheduler.phase_2_3_task_ids`).
   - Insert P1 status_board row "SYSTEM_DEGRADED: meta-veto paused N crons at <ts>". next_action_by=tate.
   - SMS Tate via `sms-tate` skill: "EcodiaOS auto-paused Phase 2+3 because <reason>. Phase 1 still running for safety. Check status_board."
4. On clean state for 24h after a degraded window, surface a P2 row "Phase 2+3 clear to resume" with next_action_by=ecodiaos so the resume gets a deliberate human-or-conductor approval rather than auto-flipping back.

This means the system protects itself from cascading failure during the Africa trip without Tate having to babysit. The cost is one extra cron and one kv_store key for the name-list.

### Drift heartbeat

A second smaller mechanism: every Phase-1 cron writes `kv_store.cron.<name>.last_fire_ts` on successful exit. The `surfacing-rate-probe` cron also reads these timestamps and surfaces "cron X has not fired in 3 expected intervals" as a P2 row. Dual signal with the meta-veto.

## Self-dispatch chains (when crons spawn follow-ups)

Tate's verbatim: "They should def be able to schedule other one off crons or recurring ones if strongly needed."

This is a fundamental capability shift. Worker prompts gain explicit license to:

1. **Schedule a one-shot followup** via `mcp__ecodia-scheduler__schedule_delayed` when a finding has a known re-check window (e.g. "the Atlassian opt-out window opens Aug 17, schedule a worker for Aug 18 to verify").
2. **Schedule a recurring followup** via `mcp__ecodia-scheduler__schedule_cron` when a finding reveals a class of work that should run periodically (e.g. opportunity-discovery finds a new peak body, schedule a quarterly partnership-touch cron).
3. **Dispatch a sibling worker NOW** via `cowork.dispatch_worker` when parallelism would close the loop faster (e.g. opportunity-discovery finds 3 promising RFPs, dispatch 3 research workers in parallel rather than serialising in this worker).

Explicit hard constraints on self-dispatch:

- No more than 3 child workers spawned per parent fire (prevents runaway expansion).
- No more than 5 new scheduled tasks created per parent fire (prevents corpus inflation).
- Self-scheduled tasks must carry the full brief, never a kv_store-pointer (cold-start safety per `scheduled-prompt-cold-start-adequacy`).
- Parent worker writes a single status_board row tagged with the child fire IDs / spawned task IDs so audit-trail is intact.

Worked example (opportunity-discovery on a strong signal):

```
opportunity-discovery-research fires Wed 10:00
  -> finds 3 promising RFPs (Horizon Festival, QLD Reef Foundation, Sunshine Coast Council carbon program)
  -> dispatches 3 cowork workers IN PARALLEL: one deep-research per RFP
  -> ALSO schedule_delayed for Wed +7d: "outcome check on the 3 RFPs"
  -> writes ONE status_board P2 row "3 RFPs surfaced + 3 research workers spawned + followup scheduled"
  -> exits clean
```

That is closed-loop autonomy. The corpus actually progresses the business while Tate is asleep.

## The new worker prompt template

Old shape (now retired):

```
WORKER, you have no prior context. Do exactly these N steps.
Step 1: query X. Step 2: if Y exit silent. Step 3: write Z.
Do not deviate. Do not spawn workers. Close tab on exit.
```

New shape:

```
You are EcodiaOS for the next ~10 minutes. Cron: <name>.

CONTEXT (cold-start safe, full brief, no kv_store pointers):
<verbatim what the cron is about, the live status of the relevant entity,
 the linked status_board rows, the linked patterns>

OBJECTIVE:
<one-line intent>

USE JUDGEMENT. You may:
- Expand scope when the finding warrants it
- Schedule one-shot follow-ups via schedule_delayed (max 5 per fire)
- Schedule recurring follow-ups via schedule_cron (max 5 per fire)
- Dispatch sibling workers via cowork.dispatch_worker (max 3 per fire)
- Write durable substrate (status_board, kv_store, Neo4j, patterns/) whenever
  a real lesson surfaces

HARD CONSTRAINTS (these never bend):
- No client-facing send without Tate go-ahead (drafts to approval queue OK)
- No creds.* writes, no pm2 mutations, no force-push to main
- No em-dashes (U+2014 banned at character level), EcodiaOS voice
- Close your tab on exit via coord.close_my_tab if you spawned in a tab

DELIVERABLE:
At least one durable substrate write per fire (status_board upsert,
kv_store.set, Neo4j write, or patterns/ edit). Silent exit with nothing
written = symbolic logging = failed fire.
```

That gives the worker real agency inside a small set of hard constraints. The prompt is longer per cron (~300-500 words) but the constraint set is sharper and the worker can actually move the business.

## Cross-cutting standards

These apply to every cron as a quality bar (not a separate phase):

- **Verify-deployed-state-against-narrated-state.** Every status update is backed by a live probe.
- **Slice-query never row-dump.** Per `drift-audit-slice-queries-beat-row-dump-queries`.
- **Cold-start prompt adequacy.** No kv_store-pointer briefs.
- **EcodiaOS voice register.** Conductor scorer >=75 per `voice/ecodiaos-voice-profile.md`.
- **One substrate write minimum per fire.** Else silent-symbolic.
- **180000ms worker_acknowledgment_timeout_ms** per `worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load-2026-05-28`.
- **Account-balance is implementation-detail.** Out of scope for this spec, addressed at resume-time per cron based on observed daily-cap pressure.

## Resume order on Mac day

This is the concrete execution sequence the post-Mac-setup conductor follows.

```
Day 0 (Mac arrives + provisioned):
  - Pre-resume checks pass (per scheduler-resume-after-mac-2026-06-03.md)
  - Resume Phase 1 in groups (1A telemetry first, 1B substrate-health, 1C learn plumbing, 1D safety)
  - Watch first 24h: zero orphan spawns, all crons fire once cleanly

Day 1-7 (Phase 1 stabilisation):
  - Daily eyeball of fire success rate
  - Tune any cron with >=2 consecutive failures
  - Meta-veto wired and tested (force a fake-degraded condition to verify pause works)

Day 8 (Phase 2 resume):
  - Resume all Phase-2 crons in one batch
  - 7-day observation

Day 15 (Phase 3 resume):
  - Resume generalise + growth + long-rhythm in batches of 3-5
  - 14-day observation before declaring corpus stable

Day 30 onward:
  - Corpus is in steady state. Weekly doctrine synthesis + monthly arch review
    are the primary feedback loops on whether the corpus itself needs tuning.
```

## Open questions worth surfacing to Tate before implementation

These do not block writing the spec but are worth a beat of conversation before resume day:

1. SMS budget per week. The corpus could plausibly send 5-10 SMS/wk (mum-text + tate-nudge + critical alerts). Acceptable?
2. Stripe-event-poll runs every 30m and reads Stripe. Confirm we want EcodiaOS to see disputes/refunds in 30m windows rather than rely on webhook ingress only.
3. Should `monthly-invoice-render` auto-DRAFT but never auto-SEND? Current default is "draft + Tate approval queue". Confirm.
4. The meta-veto pauses Phase 2+3 on Phase-1 degradation. Should it ALSO SMS Tate immediately, or status_board-only? Currently spec says SMS. Confirm.

## Out of scope

- Account-balance allocation (tate@/code@/money@). Implementation detail, decide at resume per cron based on observed cap pressure.
- Visual / GUI macros for crons that need CDP (Apple ASC, Play Console). Handled per-cron via existing `gui.enable_chrome_cdp` + alias-namespacing doctrine.
- Listener-tier (file-watcher daemon) revival. Separate substrate, separate decision. The cron corpus is sufficient without it.

## What this spec delivers

If shipped fully, the 65-cron corpus + meta-veto + self-dispatch chains is the substrate that makes EcodiaOS a real 24/7 algorithmic manager rather than a polling daemon. It satisfies all eight words Tate used (autonomy, progression, learning, upkeep, maintenance, safety, thoroughness, growth) by binding each to a concrete cron at a concrete cadence, anchored in the OODA + seven-layer learning machine architecture.

The corpus is also self-improving. The Learn layer (especially `generalisation-engine-fire`, `pattern-corpus-health-check`, `world-model-audit`, `weekly-doctrine-synthesis`) means the corpus itself evolves. New crons get authored by `weekly-doctrine-synthesis` when operational gaps surface. Dead crons get retired by `pattern-corpus-health-check`. The cron corpus is one more node in the recursive-improvement loop. It is not a fixed asset.

## Next steps after spec approval

1. Conductor invokes `writing-plans` skill to convert this spec into an implementation plan.
2. The plan stages cron creation on Mac day in the resume order described above.
3. Each cron's full worker-prompt body gets drafted as part of the implementation plan. The spec stops at intent.
4. The implementation ships as 65 `schedule_cron` calls + 1 `meta-veto-heartbeat` cron + the worker-prompt template documented in `patterns/cron-worker-prompt-template.md` (new pattern, authored as part of implementation).
