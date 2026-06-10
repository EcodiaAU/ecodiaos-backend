# Listener / perceptionDispatcher Gap Analysis — Worker 2

fork_moslihvx_015515 → reporting to manager fork_moslfc45_e59e0d
2026-05-05, EcodiaOS backend

## Summary

Existing perceptionDispatcher has 6 matchers (finance, status_board, crm,
error_escalation, task_completion, security_incident). They cover reactive
finance/error/CRM dispatch from events that already exist on the bus. The
gap is across THREE axes:

1. **Wider semantic net on existing event sources.** The crm matcher only
   fires on `data.client_id` (structured); free-text mentions in fork output
   and email kinds slip past. → `client_mention` matcher.
2. **Missing publishers.** The bus today receives perception events from
   forks, factory-sessions, status_board drift timer, email arrival,
   invoice-payment-state, security incidents. It does NOT receive: Vercel
   deploy events, Stripe webhooks, GitHub/Bitbucket events, calendar
   imminence, doctrine-file-system events, kv_store-aging signals.
   These are silent state transitions. Adding the publishers + matchers
   is the bigger leverage win than another matcher on existing events.
3. **Self-reflective drift detection.** Phantom fork bails, P1 row rot,
   stale kv_store handoff state, freshly-overdue status_board rows: the
   system already produces signals for these but no matcher classifies +
   surfaces them, so they only land when the conductor manually surveys.

## Verdict matrix

| # | Candidate | Verdict | Reasoning |
|---|---|---|---|
| 1 | client_mention | **ADD** | High-leverage: wider net than existing crm matcher, catches free-text mentions in any event. Cheap (regex + 2 cached client list lookups). Source: client_mention.js |
| 2 | schedule_drift | **ADD** | Existing status_board matcher fires on event references; this fires on freshly-crossed due times, which is a different signal class. Source: schedule_drift.js |
| 3 | fork_phantom_bail | **ADD** | Closes drift loop on a known failure mode (~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md). Phantom bails are visible in rollup but never escalate to status_board automatically. Source: fork_phantom_bail.js |
| 4 | deploy_event | **ADD** (with publisher work) | Vercel deploys are visible to a cron only; no perception event ever fires. Auto-P1 on fail closes the gap. Requires publisher (note in source). Source: deploy_event.js |
| 5 | stripe_event | **ADD** (with publisher work) | Stripe webhooks fire at charge time, faster than bank-side staged_transactions. Better client correlation via stripe_customer_id. Charge-failed → P1. Requires publisher. Source: stripe_event.js |
| 6 | github_event | **DEFER** | Multiple producers (PR opened, CI fail, push) and overlap with existing factory pipeline. Worth a dedicated design pass. Add later once publisher webhook exists. |
| 7 | bitbucket_event | **DEFER** | Same shape as github_event but Ordit-specific. Pair it with #6 in a single design pass — auth context already provisioned at kv_store.creds.bitbucket_api_token. |
| 8 | email_arrived_for_active_client | **REJECT** | Already covered: emailArrival listener wakes OS on every new email + the proposed `client_mention` matcher will fire on the wake event when the email kind/subject contains a client name. Adding a third path is redundant. |
| 9 | calendar_event_imminent | **ADD** | High-value: prevents Tate walking into client calls without context. Cheap heartbeat-driven query. Source: calendar_event_imminent.js |
| 10 | kv_store_handoff_state_aged | **ADD** | Anti-staleness: the canonical drift mode where conductor reads stale kv_store as current state. Surface signal so conductor knows to re-probe. Source: kv_store_handoff_aged.js |
| 11 | pattern_silent_majority | **DEFER** | Phase C of decision-quality architecture already specifies this as a 7-day rolling status_board P3 row; a matcher would duplicate that surface. Keep it in the existing telemetry layer (`/api/telemetry/decision-quality`) until that surface fails to fire. |
| 12 | factory_session_state_drift | **REJECT** | ccSessionsFailure + factorySessionComplete + the factoryOversightService already cover state-stage transitions. Adding a matcher on top adds noise without new signal. |
| 13 | doctrine_authored | **ADD** (with publisher work) | Closes evolution loop (author → cross-ref opportunity → INDEX regen). Today new patterns sit until 22:00 cron. Requires fs-watcher publisher (one-line node-watch addition to listener boot). Source: doctrine_authored.js |
| 14 | status_board_priority_inversion | **ADD** | P1 rows that are >14 days old without progress = drift. Forces explicit demote-or-escalate decision rather than silent rot. Source: status_board_priority_inversion.js |
| 15 | kv_store_ttl_expired | **REJECT** | kv_store has no TTL column; "implicit expiration" is a doctrine concept not a schema fact. The kv_store_handoff_aged matcher (#10) covers the high-value subset (handoff_state, day_plan_*) more precisely than a blanket TTL pass. |

## ADD set: 9 matchers

Source code drafts at:
- /home/tate/ecodiaos/drafts/proposed-matchers/client_mention.js
- /home/tate/ecodiaos/drafts/proposed-matchers/schedule_drift.js
- /home/tate/ecodiaos/drafts/proposed-matchers/fork_phantom_bail.js
- /home/tate/ecodiaos/drafts/proposed-matchers/deploy_event.js
- /home/tate/ecodiaos/drafts/proposed-matchers/stripe_event.js
- /home/tate/ecodiaos/drafts/proposed-matchers/calendar_event_imminent.js
- /home/tate/ecodiaos/drafts/proposed-matchers/doctrine_authored.js
- /home/tate/ecodiaos/drafts/proposed-matchers/status_board_priority_inversion.js
- /home/tate/ecodiaos/drafts/proposed-matchers/kv_store_handoff_aged.js

Shape note: the existing dispatcher matchers receive `event` directly and
require `db`/`logger`/`perceptionBus` from module-level closure. The drafts
shift to a `dispatch(event, ctx)` signature where ctx supplies db +
perceptionBus by injection. This makes them unit-testable without globals.
The conductor doing the merge into perceptionDispatcher.MATCHERS should
either:
  (a) adapt drafts to closure-style by replacing `ctx.db` → top-level `db`
      require + dropping the second argument, or
  (b) refactor the existing 6 matchers to the same ctx-injection signature
      and call `matcher.dispatch(event, { db, perceptionBus, logger })` from
      `_onEvent`. Option (b) is cleaner and incremental cost is ~20 lines.

## NEW EVENT TYPES (publishers needed)

Silent state transitions on the substrate that should fire perception events
but don't today:

1. **vercel.deployment.\*** — webhook handler at `POST /api/webhooks/vercel`
   that publishes `kind=vercel_deployment_succeeded|failed|building`.
   Webhook secret stored in kv_store.creds.vercel_webhook_secret.
   Consumes: `deploy_event` matcher.

2. **stripe.\*** — webhook handler at `POST /api/webhooks/stripe` that
   publishes `kind=invoice_paid|charge_failed|subscription_created|subscription_cancelled`.
   Already a Stripe customer id ↔ client mapping in `clients.stripe_customer_id`
   (verify column exists). Consumes: `stripe_event` matcher.

3. **fs.pattern_file_created / fs.pattern_file_updated** — chokidar/node-watch
   on `~/ecodiaos/patterns/*.md`. Spawned at boot from `src/services/fsWatcher.js`
   (new file). Consumes: `doctrine_authored` matcher.

4. **github.\*** / **bitbucket.\*** — webhook handlers at `POST /api/webhooks/github`
   and `POST /api/webhooks/bitbucket`. Auth via the existing
   `kv_store.creds.github_webhook_secret` / `kv_store.creds.bitbucket_webhook_secret`.
   Publishes `kind=pr_opened|pr_merged|ci_failed|push_to_main`.
   Consumes: future `github_event` / `bitbucket_event` matchers (DEFER on the
   matcher side; add publisher first since payload shape decides matcher shape).

5. **scheduler.task_started / scheduler.task_completed** — already on disk
   in os_scheduled_tasks transitions but no perception bridge. A trivial
   addition to `cronForkDispatcher` that publishes when a fork-routed cron
   completes / errors. Consumes: existing error_escalation + new
   schedule_drift matchers gain richer cadence signal.

6. **kg.episode_written / kg.decision_written** — already produced by
   `knowledgeGraphService.writeEpisode`/`writeDecision` but never published
   to bus. Adding a `pb.publish` on success closes the introspection loop:
   the conductor would see "you just wrote a Decision about X" as a perception
   event on the next turn, allowing chains like `decision-written → cross-ref
   suggested → CLAUDE.md edit dispatched`.

7. **heartbeat / meta_loop_tick** — there is no canonical heartbeat event
   on the bus today, which means several proposed matchers (`schedule_drift`,
   `calendar_event_imminent`, `kv_store_handoff_aged`,
   `status_board_priority_inversion`) have to listen to "any cron event"
   as proxy. Adding an explicit `kind=heartbeat` publish from
   `metaLoop` (or a 5min interval) gives those matchers a clean trigger.

## Speed / parallelism / reliability notes (Tate-frame)

The brief frames "powerful beyond belief for context, reliability, speed
and parallelism." The matcher set above primarily improves context (+ wider
client surfacing, + calendar prep, + kv staleness signals) and reliability
(+ phantom bail escalation, + P1 priority inversion, + deploy auto-P1).

Speed/parallelism gaps not solved by matchers but worth flagging:

- **Per-domain dedupe windows are conflated** at 5min globally. High-frequency
  signals (fork_complete every minute under load) and low-frequency ones
  (P1 priority inversion, weekly cadence) want different windows. Move to
  per-matcher `dedupeWindowMs` with default 5min.
- **Async dispatch is fire-and-forget.** That's correct for back-pressure
  but means a slow matcher (e.g. CRM intelligence pack with 4 DB queries)
  silently delays subsequent dispatches in the same `_onEvent` tick. Move
  to `Promise.all(MATCHERS.map(m => safeDispatch(...)))` so all matchers
  start concurrently regardless of any single one's DB latency.
- **No backpressure or rate cap on the bus itself.** A single misbehaving
  publisher (recursive matcher chain) could flood `os_observations` and
  drown out signal. Ship a per-source rate cap (1000/hr default) before
  expanding to high-volume publishers like vercel/stripe webhooks.

## Path to artefact

This file: /home/tate/ecodiaos/drafts/listener-audit-worker2-2026-05-05.md
Source drafts: /home/tate/ecodiaos/drafts/proposed-matchers/*.js
Stamp: fork_moslihvx_015515
