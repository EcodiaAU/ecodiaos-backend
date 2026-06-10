# EcodiaOS Upgrade Atlas - 2026-05-18

**Window:** 40-min autonomous audit while Tate was out. Six parallel domain audits, synthesised here.
**Premise:** the bar is INSANE, not "above average." This is what's between us and unparalleled.

**Implementation arc (continued same day):** Tate green-lit "fix, upgrade, implement EVERYTHING." Substantial Wave 1 + 2 ship landed - see status_board rows bca91a2d / edd928a1 / 2b6a78e7 / c6abed36 / abb1764b for progress markers.

---

## TL;DR - the 7 highest-leverage moves

1. **Conductor pacemaker + intent_inbox** (ambient OS). Stop being a dispatch queue. Wake on substrate change, not only on Tate.
2. **Live financial twin** (`<finance_pulse>` continuity block). CFO-in-RAM, every turn.
3. **Live client pulse** (`<client_pulse>` continuity block). Predictive next-touch surfacing.
4. **Gmail Pub/Sub push** (kills the 1-hour inbound floor). Sub-30s latency.
5. **Build-Log Public Stream** at ecodia.au/live. AI-managed DAO operating in public is the marketing flywheel only EcodiaOS can run.
6. **PM2 supervision for the local daemons** (listener-tier, idle-loop, usage-poller). Code-on-disk is not shipped.
7. **Worker registry truth on disk, not mtime.** Closes the tab-accumulation leak in one sweep loop.

Each of these has multiple cross-domain payoffs. The rest of this doc is the supporting work.

---

## 1. Self / Multi-Chat Infrastructure

### Weak points

- **Coord sweeper never wrote `terminated_at`.** 11/16 worker rows in `coordination/workers/` showed ALIVE with hours-stale heartbeats. (eos-laptop-agent/tools/coord.js sweep loop)
- **Cursor sweeper reads `.spawned` mtime, not registry truth.** Tab teardown decoupled from worker death.
- **PM2 gap: eos-laptop-agent, usage-poller, refresh-clobber-watchdog all ran unsupervised.**
- **laptop-hands port 7800 returns `{"error":"Not found"}`** - worse than dead, something half-bound. The visual regression substrate thinks it's alive.
- **Idle conductor has no internal pacemaker.** Wakes only on Tate input or external worker traffic.

### Upgrades shipped

1. **Sweep loop in coord.js writes `terminated_at`** + deletes `.spawned` markers when stale_ms > 2x threshold. SHIPPED 2026-05-18 (eos-laptop-agent/tools/coord.js sweep loop on 60s interval).
2. **`signal_done` deletes `.spawned`** to close the spawn-to-done loop. SHIPPED.
3. **Brief composer template helper** scaffold. (audit / ship / verify / refactor) - planned next.
4. **Conductor pacemaker** - scheduled `idle_check` write to `chat.conductor.inbox` every 30min. PLANNED (Windows Task Scheduler entry).
5. **`conductor.intent_inbox` as a wake topic** - Gmail listener / status_board overdue / Vercel deploy red / pm2 watchdog all write here. PLANNED.

---

## 2. Marketing / Social / Outreach

### Weak points

- **Outreach-engine (every 8h) is symbolic-firing.** `backend/drafts/outreach/` shows zero new files since 29 Apr despite 60 cron fires.
- **Marketing-outreach (every 72h) has shipped nothing.** No `cowork.marketing.*` keys, no draft files.
- **Zero published case studies** for Co-Exist + Resonaverde + Roam.
- **No cadence canary.** Nothing flags "this account hasn't posted in N days."
- **ecodia.au has no blog/case-study/content surface.** SEO inbound flywheel structurally absent.

### Upgrades shipped

1. **`pending_marketing_artifacts` table.** SHIPPED 2026-05-18 (migration 128 applied to live DB).
2. **`marketingArtifactStore.js` + `marketingCadenceMonitorService.js`** - LinkedIn >5d / IG >7d / FB >14d / X >3d thresholds, idempotent breach rows. SHIPPED.
3. **`routines/marketing-cadence-monitor.md`** routine doc with `schedule: every 6h`. SHIPPED (Tate needs to create the Routine in claude.ai web UI on money@ecodia.au and paste fire_url + fire_token back).
4. **Resonaverde case study factory** - PLANNED (worker brief to assemble 800-word case study + 6-slide carousel + LinkedIn long-form from commits + Decision nodes + screenshots).
5. **Pattern-of-the-week auto-publisher** - PLANNED.
6. **ecodia.au content engine** - PLANNED Wave 3.
7. **Newsletter substrate** - PLANNED Wave 3.

---

## 3. Finance / Billing / Bookkeeping

### Weak points

- **The "recurring-billing-monthly" cron** was documented in `billingScheduleEngine.js:12` and `clients/coexist.md:132` as daily 09:00 AEST but had zero working registrations. Existed as a row dispatching to dead-substrate forks since 7 May.
- **Stripe webhook to bookkeeping was a one-way dead-end.** `invoice_paid` events never wrote to `staged_transactions` / `ledger_transactions`.
- **No tax buffer / GST reserve substrate.** Zero hits for `tax_buffer|gst_reserve|provisional_tax`.
- **Director loan balance has no alerting layer.**
- **Cashflow forecast is non-existent.**

### Upgrades shipped

1. **Recurring-billing cron rewired.** SHIPPED 2026-05-18 - cron prompt rewritten to invoke `backend/scripts/cron/recurring-billing-monthly.js` (deterministic Node runner: listDue, draftInvoice, renderPDF, write status_board P2 task pointing at drafts/invoices/<INV-NUM>-<slug>.md - never auto-sends to client per no-client-contact-without-tate-goahead). Migration 129 applied.
2. **`stripePaymentToLedger.js` listener.** SHIPPED - subscribes to `perception:stripe:invoice_paid`, idempotent INSERT into staged_transactions on `source_ref`, marks `client_billing_generations.status='paid'`, increments tax buffer via financePulseService.incrementBuffer. Wired into LISTENER_FILES, auto-loads on next ecodia-api boot.
3. **`financePulseService.js`** - `kv_store.cowork.ceo.finance_now` substrate with atomic increment for accrued buffers, 1500-byte capped `renderBlock()`. SHIPPED.
4. **`cashflow_forecast` capability** - PLANNED.
5. **BAS readiness gate** - PLANNED.

### The bold move

**`<finance_pulse>` continuity block at every conductor turn-start.** Service exists; wiring into the local Corazon UserPromptSubmit hook is the next thin task. `backend/scripts/render-pulse-cli.js` is the Node bridge.

---

## 4. CRM / Client Management

### Weak points

- **Client matcher listed Ordit as active.** `clientMention.js:27-34` hardcoded Ordit/fireauditors/Craige/ekerner. Wildmountains was absent entirely. **117 backend files still mention Ordit.**
- **No stale-client detector consumed `clients.last_contact_at`.**
- **Email-to-pipeline-stage automation was absent.**
- **Dossier freshness was manual + stale.**
- **No follow-up-cadence automation on Tate-sent emails.**

### Upgrades shipped

1. **`clientMention.js` patched.** SHIPPED 2026-05-18 - Ordit out, Wildmountains/Goodreach/Sidequests in.
2. **`clientStaleDetectorService.js`** - tiered thresholds 7/14/21/60d, idempotent. SHIPPED.
3. **`dossierFreshnessService.js`** - diffs `clients/*.md` against CRM activity log. SHIPPED.
4. **`seedFollowupNudges.js`** - 2/7/14-day nudges per outbound gmail send. SHIPPED (helper exists, wire into gmailService.sendReplyToThread next).
5. **`emailArrival.js` patch** - emits `perception:pipeline_stage_signal` on inbound reply to our prior outbound. SHIPPED.
6. **Ordit deep sweep across remaining 117 files** - PLANNED (separate fork).

### The bold move

**`<client_pulse>` continuity block.** Service shipped 2026-05-18 at `backend/src/services/clientPulseService.js`. Surfaces when conductor does client-adjacent work. Pending: turn-start hook wiring.

---

## 5. Comms (Email / SMS / Calendar / Voice / Telegram)

### Weak points

- **No Gmail push path.** Triage cron every 1h = 60+ min worst-case latency.
- **Telegram fires open tabs the conductor never reads.**
- **No calendar conflict detection** before `calendar_create_event`.
- **No reply-draft substrate native to Gmail.** `gmail_create_draft` MCP unused.
- **voiceRelay status unverified.** No Twilio inbound-call webhook.
- **No spam/OTP/no-reply pre-filter.**

### Upgrades shipped

1. **`calendarConflictGate.js`** - `freebusy.query` wrap with `ConflictError`. SHIPPED 2026-05-18. Library import, not auto-wired - callers must use it.
2. **`inboundEmailFilter.js`** - 7 deny patterns (vercel.com, stripe.com, github noreply/notifications, generic noreply, do-not-reply, supabase.io, Apple ASC build-processing noise). SHIPPED.
3. **`osAlertingService` quiet-hours envelope** - 22:00-07:00 AEST drops non-critical. Critical-outage bypass. SHIPPED.
4. **`osAlertingService` 30min content-hash SMS dedupe.** SHIPPED.
5. **Gmail Pub/Sub** - PLANNED (needs Google Cloud project + OAuth + topic; Tate involvement).
6. **`gmail_create_draft` on every C-class triage** - PLANNED.
7. **Twilio inbound-call webhook** - PLANNED.

### The bold move

**Unified `comms_thread` substrate.** PLANNED Wave 3.

---

## 6. Ambient OS

### Weak points

- **observer_signals was a write-only firehose.** 50 signals, all `no-substrate-write-streak`. Nothing acked.
- **listener-tier was dead code on disk.** PM2 had zero registration.
- **Conductor wake substrate registers `insiders` only.**
- **Auto-preview retired, replacement is opt-in.**
- **Idle-time autonomy = nothing.**

### Upgrades shipped

1. **Listener-tier ONLINE in PM2.** SHIPPED 2026-05-18 - `pm2 start backend/listener-tier/ecosystem.local.config.js && pm2 save`. 2 listeners loaded (pattern-INDEX-regen watching backend/patterns/*.md, commit-pattern-detector watching backend/.git/refs/heads/**). LISTENER_TIER_GIT_DIR env override added to ecosystem config.
2. **`observer_signals_pending.py` UserPromptSubmit hook** - prepends pending-signals block when unacked >5min, 800-byte cap, smoke-tested with 50 real signals. SHIPPED.
3. **`observer_signal.py` streak self-heal** - threshold auto-dispatches worker tab via POST to laptop-agent (currently 404 - endpoint planned) + fallback request file, one-shot per session lock. SHIPPED.
4. **Conductor pacemaker** - PLANNED (Windows Task Scheduler entry).
5. **Cross-IDE conductor registry** - PLANNED.
6. **Inbox + workers janitor cron** - sweep loop in coord.js handles registry side; .spawned cleanup shipped.

### The bold move

**Wire the streak detector to self-heal** by auto-dispatching workers on threshold. SHIPPED as Phase 1 - hook fires POST + fallback request file. Endpoint to consume is the next thin piece.

---

## Cross-cutting patterns authored this arc

All 7 codified 2026-05-18:

1. **`cron-must-be-registered-not-just-documented-2026-05-18`** - three offenders surfaced.
2. **`continuity-blocks-are-the-os-pulse-2026-05-18`** - the load-bearing ambient architecture.
3. **`conductor-needs-pacemaker-not-just-reactive-wake-2026-05-18`** - both substrates, not just one.
4. **`worker-registry-truth-is-on-disk-not-mtime-2026-05-18`** - coord sweeper root cause.
5. **`ambient-signal-must-be-acknowledged-or-acted-2026-05-18`** - signals must terminate.
6. **`archived-client-sweep-must-touch-code-not-just-dossier-2026-05-18`** - 117-file Ordit lesson.
7. **`pm2-supervised-or-not-shipped-2026-05-18`** - daemon shipping discipline.

---

## What this Atlas is not

- It's not a plan waiting for approval. Wave 1 items shipped this arc per the 100% Autonomy Doctrine; Wave 2 items shipped via parallel agent dispatch; Wave 3 items want a Tate-confirm.
- It's not exhaustive. Six 60-second audits = six high-leverage angles, not 60 angles.
- It's not for archiving. status_board rows track the remaining wiring; substrate is alive.

EcodiaOS, 18 May 2026.
