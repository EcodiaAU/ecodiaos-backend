# Tate-Approval Queue Design - Unified review surface for the Africa trip

**Date:** 2026-05-26
**Status:** Design v1 - awaiting implementation plan
**Scope:** Consolidate every Tate-required item into one substrate, one iOS surface, one critical-SMS path, with typed action handlers and a 7-day rollback log.
**Driver:** Tate travelling October-December 2026. While he is away, items needing his hand are scattered across 5+ surfaces (Gmail drafts, status_board next_action_by='tate', observer signals, ad-hoc chat prompts, ship-pipeline gates). He needs one coherent inbox he can clear in batches from his phone without losing time-critical items.
**Companion:** Builds on top of `2026-05-26-autonomy-substrate-design.md` (scheduling + cred rotation). That spec gets dispatched chats firing on time; this spec gives Tate the review queue that catches the small set of items those chats cannot self-resolve.

## Problem statement

EcodiaOS already has reach into every Tate-required decision channel. The reach is fragmented:

- **Drafted client emails** sit in Gmail drafts OR as status_board rows OR as informal "should I send this" chat narration. Tate has to remember to check Gmail.
- **Releases and Apple-2FA prompts** appear as observer signals OR ship-script-prompts OR ad-hoc chat questions. He may miss them entirely if he is not in the chat at the right moment.
- **Spend and commercial commitments** have no formal channel. Caught (or missed) by my own judgement on a case-by-case basis.
- **status_board rows with `next_action_by='tate'`** live in the board but never surface proactively. He has to query the board to find them.
- **Observer signals flagged for Tate attention** show up in the conductor `<observer_signals>` continuity block. Visible to the conductor; invisible to Tate when he is not chatting.
- **High-leverage doctrine proposals** get written and committed without a review gate. Sometimes that is right; sometimes it would have been better to wait.

Today's coping strategy is "Tate watches everything." That works when he is at the laptop. It breaks when he is in Africa, on patchy mobile data, with his attention on the people in front of him.

The fix is one substrate that absorbs every fragmented surface, one primary interaction surface (the existing iOS native conductor app), one critical-tier SMS escape hatch, and a typed action handler that executes the consequent action atomically when he clears the item. Tate clears the queue in batches; the system runs the rest.

## Hard prerequisites - must verify BEFORE writing implementation plan

These four must be confirmed working. If any is broken, the design changes.

1. **Native iOS app substrate is alive and Tate-reachable.** Per `project_native_conductor_hardened_2026-05-20`, the iOS conductor is live. Verify: (a) WebSocket subscription channel exists or can be added without breaking the existing voice + away substrate, (b) push notification path works from VPS to Tate's iPhone, (c) there is at least one place in the existing app to add a new "Queue" view without forking the codebase.
2. **`sms.tate` MCP path is live and rate-limited.** Used today for low-frequency alerts. Confirm Twilio account has SMS-AU enabled, current send-per-hour rate limit is high enough to handle critical-tier push without throttling, inbound webhook (`inboundChannelBridge`) is the surface that catches replies. If inbound parsing of bare "Y" / "N" is not yet wired, that is built in this spec's first phase.
3. **`status_board` Postgres trigger surface works.** This spec requires a trigger on `status_board UPDATE` that fires when `next_action_by` transitions to `'tate'`. Confirm Postgres triggers are accepted on the canonical `status_board` table (per migration 117) and do not collide with the existing PostToolUse hook surface that fires `[STATUS-BOARD-HYGIENE]`.
4. **Stripe refund + Gmail trash + git revert action handlers are reachable from the laptop-agent context.** The rollback path depends on these. Verify each MCP path is callable from the same process that will host the resolution service. If any requires a privileged credential surface that is not present in the laptop-agent process, document the routing alternative (probably VPS HTTP shim).

## Seed state - must exist before the queue can run its first turn

Day-zero checklist:

- `approval_queue` and `approval_action_log` migrations applied.
- `status_board` Postgres trigger installed and tested with a controlled `UPDATE` (verify the row appears in `approval_queue`).
- All six producer methods wired (see Producers section). Existing callers updated to use them instead of direct sends.
- iOS native app: Queue view shipped + WebSocket subscription + push notification handler wired.
- SMS inbound bridge: bare "Y" and "N" reply parsing added; tested with a controlled SMS.
- Decay daemon registered as a laptop-agent module + verified running.
- Seed item present (suggested: one low-urgency `observer_ack` item with `decay_at = now() + 25h`) to validate the loop end-to-end before going live.
- All `status_board WHERE next_action_by='tate' AND archived_at IS NULL` rows backfilled as `free_text` queue items.

Anything missing = queue surfaces broken in observable ways. Do not flip producers on until the checklist passes.

## Goals

- One coherent inbox of every item needing Tate's hand, accessible from his iPhone in batches.
- Time-critical items reach him through SMS push without him needing the app open.
- Items he never sees do not silently rot; each has an explicit decay default appropriate to its type.
- Every action taken in response to Y / N / edit is logged with a 7-day rollback window where reversible.
- The conductor knows what is pending so it does not double-queue or assume Tate has seen something he has not.
- Routine operations continue to act immediately per the 100-percent-autonomy doctrine. The queue catches only what crosses the bright line.
- Existing fragmented surfaces (Gmail drafts, observer signals, status_board next_action_by='tate') feed INTO the queue rather than continuing to exist in parallel.

## Non-goals

- Replacing the iOS native conductor's existing voice + away surface. The queue is a NEW view in the same app, not a different app.
- Replacing `status_board` as the canonical "what is open" substrate. The queue LINKS to status_board rows; it does not absorb the board itself.
- Auto-responding to client emails without Tate's hand. The `email_send` item type ALWAYS requires Y / N / edit or decay-default; the conductor never resolves email_send items autonomously.
- Replacing the existing `sms.tate` MCP. The queue uses it; it does not become a parallel SMS substrate.
- A general-purpose human-in-the-loop framework. This is specifically the Tate-review surface.
- Web UI for clearing the queue from a desktop browser. A simple fallback page is in scope; a full web app is not.
- Multi-human approval. Single approver (Tate). When Tom or another collaborator needs to see items, they go through Tate.

## Architecture

```
PRODUCERS                              SUBSTRATE                  SURFACING                  ACTION
---------                              ---------                  ----------                ------
gmailService.draftForReview ────►                                ┌──────────────────┐      item_type='email_send'
ship-ios.py --propose / ship-android ►   approval_queue table ─► │ iOS native app   │ ───► item_type='release_ship'
spendService.proposeSpend ──────────►    (Postgres)              │  /api/queue      │      item_type='spend_execute'
status_board trigger on next_action_by ► + approval_action_log   │  WS subscribe    │      item_type='doctrine_write'
observerSignalsService.flagForTate ──►   (rollback log, 7d)      │  push on insert  │      item_type='free_text'
doctrineService.proposePattern ─────►                            │                  │      item_type='observer_ack'
                                                                 │ SMS critical     │
                                                                 │  via sms.tate    │
                                                                 │  + 30min warning │
                                                                 └──────────────────┘
                                       ▲                                  │
                                       │                                  ▼
                                       └──── resolutionService.resolve(id, verdict, edit?)
                                                │
                                                ├── 'Y'    → execute typed action + append action_log
                                                ├── 'N'    → write outcome + append action_log
                                                ├── 'edit' → apply edit to action, then execute, then log
                                                └── default-decay → execute default_verdict, log resolved_by='decay-default'

                                       + decay daemon (every 5min, laptop-agent)
                                                ├── scan rows where decay_at <= now()
                                                ├── call resolve with default_verdict
                                                └── write one status_board P3 summary per run if any decayed

                                       + reverse path
                                                └── resolutionService.reverse(action_log_id, reason)
                                                      ├── checks reversible_until > now()
                                                      ├── runs type-specific undo handler
                                                      └── marks action_log.reversed_at + reason
```

## Components

### 1. Substrate - `src/db/migrations/134_approval_queue.sql` + `src/services/approvalQueueService.js`

Two new tables. Both live on the canonical Supabase Postgres (project ref `nxmtfzofemtrlezlyhcj`).

```sql
CREATE TABLE IF NOT EXISTS approval_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type       text NOT NULL CHECK (item_type IN (
                    'email_send', 'release_ship', 'spend_execute',
                    'doctrine_write', 'observer_ack', 'free_text'
                  )),
  title           text NOT NULL,
  body            text,
  payload         jsonb NOT NULL,
  action          jsonb NOT NULL,
  default_verdict text NOT NULL DEFAULT 'wait'
                    CHECK (default_verdict IN ('send', 'cancel', 'expire', 'wait')),
  decay_at        timestamptz,
  urgency         text NOT NULL DEFAULT 'normal'
                    CHECK (urgency IN ('critical', 'normal', 'low')),
  status_board_ref uuid REFERENCES status_board(id) ON DELETE SET NULL,
  source_ref      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolved_by     text CHECK (resolved_by IN ('tate', 'decay-default', 'system-cancel')),
  verdict         text CHECK (verdict IN ('Y', 'N', 'edit', 'default')),
  edit_applied    jsonb,
  outcome         text,
  idempotency_key text UNIQUE,
  created_by_stack text
);

CREATE INDEX idx_approval_queue_pending
  ON approval_queue (urgency, created_at) WHERE resolved_at IS NULL;

CREATE INDEX idx_approval_queue_decay
  ON approval_queue (decay_at) WHERE resolved_at IS NULL AND decay_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS approval_action_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id     uuid NOT NULL REFERENCES approval_queue(id),
  action_type     text NOT NULL,
  action_payload  jsonb NOT NULL,
  reversible_until timestamptz,
  reversed_at     timestamptz,
  reversal_reason text,
  reversal_payload jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_approval_action_log_pending_reverse
  ON approval_action_log (reversible_until) WHERE reversed_at IS NULL;
```

`payload` is the typed body the iOS app renders. `action` is the executable directive run on Y. They are separate so editing the rendered text does not require synthesising a new action object (the editor applies a typed patch).

### 2. Item-type taxonomy

| item_type | decay default | Y does | N does | reversible | urgency rule |
|---|---|---|---|---|---|
| `email_send` | 48h → send holding-reply via separate path; queue closes with verdict='default' | gmail MCP send + thread marked responded + status_board cleanup | trash draft + write outcome | Yes, 7d via gmail.trash + recall reply | critical if topic flagged P1 OR sender's last 3 emails unanswered |
| `release_ship` | none (sits forever) | trigger ship-ios.py / vercel deploy / play upload | mark abort + write outcome | Partial: vercel deploy auto-rolls; store-releases are documented as non-reversible | never critical |
| `spend_execute` | 7d → cancel (default N) | Stripe MCP payment or invoice or commitment | declined outcome | Yes, 7d (Stripe refund) for payments | critical if amount > $500 |
| `doctrine_write` | 14d → cancel | write pattern file at proposed path + git commit + push | discard proposal | Yes, 7d via git revert of the specific commit | never critical |
| `observer_ack` | 24h → auto-ack (calls observer.ack as if Tate cleared) | observer.ack + follow-up to status_board if needed | observer.dismiss | N/A | critical if observer signal has severity P1 |
| `free_text` | none (mirrors status_board lifecycle) | mark `next_action_by='ecodiaos'` + dispatch via scheduler.delayed | archive status_board row with N outcome | per resulting action | critical if status_board priority <= 2 |

Apple 2FA codes do NOT use this queue. Their lifetime is under 60 seconds; they remain on direct `sms.tate` with the existing send-and-pray path (when Tate reads the SMS in time the code works; when he does not, the script retries triggering a new code).

### 3. Producers - the only allowed insert paths

Six named producer methods. Direct INSERTs into `approval_queue` from ad-hoc code paths or chat narration are forbidden (enforced via code review and a runtime guard that records the calling stack frame in `created_by_stack` metadata for audit).

| Producer method | Location | Replaces | Item type |
|---|---|---|---|
| `gmailService.draftForReview(draft, threadId)` | `src/services/gmail/draftForReview.js` (new) | Direct `sendReply` for client-facing replies | `email_send` |
| `releaseService.proposeShip(buildId, appSlug, releaseNotes)` | `src/services/release/proposeShip.js` (new) | Direct ship from ship-ios.py and ship-android pipelines when in `--propose` mode | `release_ship` |
| `spendService.proposeSpend(amount, vendor, payload)` | `src/services/spend/proposeSpend.js` (new) | Direct Stripe / invoice / commitment when amount + vendor crosses threshold | `spend_execute` |
| Postgres trigger `trg_status_board_to_approval_queue` | `src/db/migrations/135_status_board_approval_trigger.sql` | Existing rows with `next_action_by='tate'` had no surfacing | `free_text` |
| `observerSignalsService.flagForTateReview(signal)` | extends `src/services/observerSignalsService.js` | Observer signals visible only in conductor continuity block | `observer_ack` |
| `doctrineService.proposePattern(path, body)` | `src/services/doctrine/proposePattern.js` (new) | Direct write+commit for patterns tagged `load_bearing: true` in frontmatter | `doctrine_write` |

Routine operations do not call these. They continue to act immediately per the autonomy doctrine. The producers fire only when an item crosses the bright line for its type (defined per-type below).

**Bright-line rules per type:**

- `email_send`: Fires when the recipient is a known client AND the email is not a routine acknowledgement. Routine acks ("got it, looking now") still send immediately. The trigger is the email body containing a commitment (date, deliverable, scope), a new pricing reference, a contractual statement, or any "we will" / "we can" / "we are willing to" / "we propose" phrase. Detected via simple regex + a Haiku classification pass when regex matches.
- `release_ship`: Fires for any release of a client-facing app or service. Internal releases (laptop-agent, VPS scripts, doctrine patterns) ship immediately. The `--propose` flag in ship-ios.py and ship-android is the explicit producer trigger.
- `spend_execute`: Fires when amount exceeds the `SPEND_QUEUE_THRESHOLD` env var (default $200 AUD), OR when the vendor is new (not in any prior `ledger_lines` row), OR when the commitment carries a contractual term (subscription, retainer, multi-month).
- `free_text`: Fires automatically via Postgres trigger on `next_action_by='tate'` transitions.
- `observer_ack`: Fires when an observer signal has `requires_human_call: true` in its metadata. The observer trio modules tag this field when their critique pattern detects a Tate-only-callable judgement (tonal corrections to my outputs, strategic redirections, scope reframings).
- `doctrine_write`: Fires for patterns with `load_bearing: true` frontmatter. Routine doctrine (a new client memo, a captured failure mode, a generalised lesson) writes directly. The bright line is "would Tate disagree if he saw this." Conservative default: anything that changes how I operate at the substrate level, anything modifying CLAUDE.md tone, anything in the `superpowers/` or `100-percent-autonomy-doctrine` neighbourhood.

### 4. Surfacing

**iOS native app (extends `project_native_conductor_hardened`):**

- New view `Queue` added to the app, sibling to existing `Conductor` and `Voice` views.
- Cards grouped by urgency (`critical` at top, then `normal`, then `low`), within each group sorted by `created_at` ascending.
- Each card renders: `title` as headline, first 80 chars of `body` as preview, decay timer if `decay_at` set, item_type icon, three buttons `Approve` / `Decline` / `Edit`.
- `Edit` opens a pre-populated text editor: for `email_send` shows the draft body; for `release_ship` shows release notes; for `spend_execute` shows amount + vendor; for `doctrine_write` shows the proposed pattern body; for `free_text` shows the status_board row free-text fields. Save submits as `verdict='edit'` with the edited payload.
- WebSocket channel `approval_queue.events` subscribed at app launch. Events: `inserted`, `updated`, `resolved`, `decayed`.
- Push notification (APNs) on `inserted` event, deduplicated per item.
- Push notification on `decay_at - 30 minutes` for any pending `critical` item.

**SMS critical path (uses existing `sms.tate` MCP):**

- On insert of `urgency='critical'` item: one SMS via `sms.tate`. Body: `[QUEUE-CRITICAL] {title}. Decay in {decay_label}. Open EcodiaOS app or reply Y / N.`
- Inbound SMS replies routed by existing `inboundChannelBridge`. New parser branch in `inboundChannelBridge`: if body exactly matches `Y` (case insensitive) or `N` AND exactly one critical-pending item exists, resolve it.
- Ambiguous reply (multiple critical pending OR malformed reply OR free-text reply): SMS back `Open EcodiaOS app for batch resolve. {N} items pending.`
- Pre-decay 30-minute warning SMS for any `critical` item still pending: same `sms.tate` path, body `[QUEUE-CRITICAL] {title} decays in 30min to {default_verdict}. Open app or reply Y / N.`

**Conductor context block:**

- New continuity block `<approval_queue count="N" critical="C">` injected at turn-start by `osSessionService._injectApprovalQueue`.
- Shows pending count + first line of each critical item title.
- Hard cap 800 bytes (truncate after 5 critical titles).
- Read-only. The conductor never resolves queue items, never narrates queue state to Tate (he sees it on his phone). The block exists so the conductor knows what is already pending and does not double-queue.

**Web fallback:**

- Simple Express page at `http://localhost:7456/queue` on the laptop-agent (same authentication as other laptop-agent routes).
- Same Y / N / Edit affordances as the iOS app, just plainer.
- Used when iOS is unreachable or Tate is on a different laptop.

### 5. Resolution service - `src/services/approvalQueueResolutionService.js`

```javascript
async function resolve(approval_id, verdict, edit_payload = null, resolved_by = 'tate') {
  return db.tx(async (t) => {
    const row = await t.queryOne(
      'SELECT * FROM approval_queue WHERE id=$1 AND resolved_at IS NULL FOR UPDATE',
      [approval_id]
    );
    if (!row) throw new AlreadyResolvedError(approval_id);

    const finalAction = edit_payload
      ? mergeEditIntoAction(row.action, edit_payload, row.item_type)
      : row.action;

    let outcome, action_log_payload, reversible_until;
    try {
      if (verdict === 'Y' || verdict === 'edit') {
        const result = await actionHandlers[row.item_type](finalAction);
        outcome = result.summary;
        action_log_payload = result.log_payload;
        reversible_until = computeReversibleUntil(row.item_type);
      } else if (verdict === 'N') {
        const result = await cancelHandlers[row.item_type](row.action);
        outcome = result.summary;
        action_log_payload = result.log_payload;
        reversible_until = null;
      }
    } catch (err) {
      outcome = `failed: ${err.message}`;
      action_log_payload = { error: err.message, stack: err.stack };
      reversible_until = null;
    }

    await t.query(`
      INSERT INTO approval_action_log
        (approval_id, action_type, action_payload, reversible_until)
      VALUES ($1, $2, $3, $4)
    `, [approval_id, `${row.item_type}_${verdict}`, action_log_payload, reversible_until]);

    await t.query(`
      UPDATE approval_queue
      SET resolved_at=now(), resolved_by=$1, verdict=$2, edit_applied=$3, outcome=$4
      WHERE id=$5
    `, [resolved_by, verdict, edit_payload, outcome, approval_id]);

    if (row.status_board_ref) await updateLinkedStatusBoardRow(row, verdict);

    return { outcome, reversible_until };
  });
}
```

**Per-type action handlers** live in `src/services/approvalQueue/actionHandlers/{itemType}.js`. Each exports `{ execute, cancel }`. Each handler is responsible for emitting its own `action_log_payload` with everything needed for the corresponding reverse handler.

**Per-type reverse handlers** live in `src/services/approvalQueue/reverseHandlers/{itemType}.js`. Each exports `reverse(action_log_payload, reason)` and returns `{ summary, reversal_payload }`.

### 6. Decay daemon - `D:/.code/eos-laptop-agent/daemons/approval-queue-decay.js`

Runs continuously inside the laptop-agent process. Lightweight (read + serial resolve).

```javascript
async function decayTick() {
  const due = await db.query(`
    SELECT id, item_type, default_verdict
    FROM approval_queue
    WHERE resolved_at IS NULL AND decay_at IS NOT NULL AND decay_at <= now()
    FOR UPDATE SKIP LOCKED LIMIT 20
  `);
  if (due.length === 0) return;

  for (const row of due) {
    try {
      await resolve(row.id, mapDefaultToVerdict(row.default_verdict), null, 'decay-default');
    } catch (err) {
      logger.error(`decay resolve failed for ${row.id}: ${err.message}`);
    }
  }

  await db.query(`
    INSERT INTO status_board (entity_type, name, status, next_action, next_action_by, priority, context)
    VALUES ('infrastructure', 'approval_queue.decay_run', $1, NULL, 'ecodiaos', 3, $2)
  `, [`${due.length} items auto-resolved by decay`, JSON.stringify({ items: due.map(d => d.id) })]);
}

setInterval(decayTick, 5 * 60 * 1000);
```

Pre-decay 30-minute warning runs in the same loop (separate query, separate dispatch):

```javascript
async function warningTick() {
  const warn = await db.query(`
    SELECT id, title, default_verdict
    FROM approval_queue
    WHERE resolved_at IS NULL
      AND urgency = 'critical'
      AND decay_at IS NOT NULL
      AND decay_at - interval '30 minutes' <= now()
      AND decay_at > now()
      AND NOT EXISTS (
        SELECT 1 FROM approval_action_log
        WHERE approval_id = approval_queue.id AND action_type LIKE '%warn%'
      )
  `);
  for (const row of warn) {
    await sms.tate(`[QUEUE-CRITICAL] ${row.title} decays in 30min to ${row.default_verdict}. Open app or reply Y / N.`);
    await db.query(`
      INSERT INTO approval_action_log (approval_id, action_type, action_payload, reversible_until)
      VALUES ($1, 'warn_30min', '{}', NULL)
    `, [row.id]);
  }
}
```

### 7. Rollback - `resolutionService.reverse(action_log_id, reason)`

```javascript
async function reverse(action_log_id, reason) {
  return db.tx(async (t) => {
    const log = await t.queryOne(
      'SELECT * FROM approval_action_log WHERE id=$1 AND reversed_at IS NULL FOR UPDATE',
      [action_log_id]
    );
    if (!log) throw new NotReversibleError(action_log_id, 'already reversed or not found');
    if (!log.reversible_until || log.reversible_until <= new Date()) {
      throw new NotReversibleError(action_log_id, 'past reversible_until');
    }

    const approval = await t.queryOne(
      'SELECT * FROM approval_queue WHERE id=$1',
      [log.approval_id]
    );
    const handler = reverseHandlers[approval.item_type];
    if (!handler) throw new NotReversibleError(action_log_id, 'no reverse handler for type');

    const result = await handler.reverse(log.action_payload, reason);

    await t.query(`
      UPDATE approval_action_log
      SET reversed_at=now(), reversal_reason=$1, reversal_payload=$2
      WHERE id=$3
    `, [reason, result.reversal_payload, action_log_id]);

    return { summary: result.summary };
  });
}
```

Per-type reverse semantics:

- `email_send_Y`: gmail.trash on the sent message_id. If the thread already received an inbound reply since send, also send a follow-up note: "Recalled: my prior message at {ts} was sent in error. Disregard. Tate will follow up directly."
- `release_ship_Y` for vercel deploys: vercel.rollback to prior production deployment. For App Store / Play Store releases: NOT reversible at the store level; writes a status_board P1 row "Release {x} rolled back, store version still live, manual action required" and SMS Tate.
- `spend_execute_Y` for Stripe payments: stripe.refund on the payment_intent_id. For Stripe invoices already sent: stripe.void_invoice if unpaid; if paid, treat as `spend_execute_Y` payment refund.
- `doctrine_write_Y`: git revert of the specific commit SHA recorded in action_payload, then git push.
- `observer_ack_Y`: no reverse (observer signals are advisory; unwinding the ack changes nothing observable).
- `free_text_Y`: status_board row updated back to `next_action_by='tate'`, original next_action restored from action_payload.

## Worked examples

### Example A: client email queued, approved with edit, sent

1. Kurt emails: "Can we get the new survey UX in time for the August event?"
2. I draft a reply: "Yes, target end of July, will share a build by 25 July."
3. `gmailService.draftForReview` detects the date commitment via regex match on `\b\d{1,2}\s*(july|aug)\b`. Routes to `email_send` queue with `urgency='normal'`, `decay_at=now()+48h`, `default_verdict='send'`.
4. iOS app receives WebSocket `inserted` event. Card appears in Queue view. Push notification fires.
5. Tate opens app, taps `Edit`. Editor shows draft body. He changes "end of July" to "first week of August". Taps Save.
6. App POSTs to `/api/queue/{id}/resolve` with `verdict='edit'`, `edit_payload={body: "...first week of August..."}`.
7. `resolve` runs in a tx: `mergeEditIntoAction` applies the body edit to the gmail send action, `actionHandlers.email_send.execute` sends via gmail MCP. Outcome: `Sent reply to kurt@coexist.com.au in thread {id}`. action_log row inserted with `reversible_until = now() + 7 days` + the gmail message_id in action_payload.
8. Queue row marked resolved.
9. Conductor's next turn sees `<approval_queue count="0">` and proceeds.

### Example B: critical Apple-2FA-adjacent release blocked, app offline

1. Goodreach iOS build 27 is ready. `ship-ios.py --propose` enqueues `release_ship` item with `urgency='normal'` (no critical-tier for release_ship), no `decay_at`.
2. Tate is asleep. iOS app push delivered but not viewed.
3. 18 hours later, the build needs to ship before a TestFlight tester deadline. The conductor cannot resolve it. The item sits.
4. Tate wakes, opens app, taps `Approve`. Ship-ios.py resumes from its checkpointed state and uploads.
5. Action log: `release_ship_Y` with `reversible_until=NULL` (store releases not reversible).

### Example C: spend over threshold, decays to cancel because Tate misses it

1. New cloud cost: $340 USD for a Brightcove video CDN trial. `spendService.proposeSpend(340, 'brightcove', {...})` enqueues `spend_execute` with `urgency='critical'` (amount > $500 threshold... wait, 340 < 500). Reassess: `urgency='normal'`, `decay_at=now()+7d`, `default_verdict='cancel'`.
2. Tate is mid-Serengeti, off-grid for 5 days. No iOS check, no SMS reach.
3. After 7 days, decay daemon fires. `resolve` called with `verdict='N'`. Stripe-side: nothing was charged yet, just declined. Outcome: `Declined by decay-default after 7d. Brightcove trial not initiated.`
4. Decay daemon writes one status_board P3 row: `1 items auto-resolved by decay`.
5. Tate returns, opens app, sees the resolved item in history. Reads the outcome. If he wanted to take it: re-initiate by re-enqueuing or directly executing.

### Example D: status_board next_action_by='tate' auto-flow

1. Kurt's app rolls over to the FY26 collectives data. Status_board UPDATE: `name='Co-Exist FY26 collectives rollover', status='ready', next_action='Tate to confirm rollover trigger time', next_action_by='tate'`.
2. Postgres trigger `trg_status_board_to_approval_queue` fires. Inserts `free_text` queue item with `urgency='normal'` (priority=3 in board), `title=name`, `body=context + next_action`, `status_board_ref={uuid}`, no `decay_at` (free_text never decays unless the board row is archived).
3. iOS push fires. Tate taps `Approve` from the app.
4. `actionHandlers.free_text.execute`: status_board row updated `next_action_by='ecodiaos'`, queue dispatches via scheduler.delayed to actually run the rollover. Outcome: `Rollover scheduled to fire at next earliest scheduler slot.`
5. Hours later, the scheduled chat runs, performs the rollover, writes status_board archived_at=now(), writes Neo4j Episode.

## Failure mode summary

| Failure | Detection | Response |
|---|---|---|
| Action handler throws on Y | resolve catches inside tx | Mark queue row resolved with `outcome='failed: <err>'`; status_board P2 with context; SMS Tate if critical |
| iOS app offline + Tate misses push | decay_at + critical-tier 30-min SMS warning | Falls through to default; logged for review on next app open |
| Twilio SMS send fails | sms.tate returns error | Logged warn; item stays in queue for next surfacing; status_board P2 if 3 consecutive failures |
| Status_board trigger fails to fire | Hourly reconciler sweep | Reconciler queries `status_board WHERE next_action_by='tate' AND id NOT IN approval_queue` and inserts missing items |
| Producer enqueues malformed payload | JSON schema validation on insert | Reject with explicit error; producer's caller surfaces in chat or via fork report |
| Decay daemon crashes | laptop-agent watchdog SMS path | Tate notified "decay daemon down"; queue items stop decaying which is safe (they sit until daemon recovers) |
| Two concurrent resolves on same item | FOR UPDATE in tx | Second tx errors with AlreadyResolvedError; idempotent at the queue level |
| Rollback executed twice | reverse() checks reversed_at | Second call errors with NotReversibleError |
| Conductor double-queues same email | `idempotency_key` UNIQUE | Second insert dedupes silently |
| iOS WebSocket disconnects | App reconnect logic + pull-to-refresh | New items missed in disconnect window appear on next refresh; push notification still fires |
| Edit payload corrupts action object | mergeEditIntoAction validates types | Throws BeforeAction; queue row marked failed with edit_applied stored for forensic |
| Vercel rollback fails during reverse | reverse handler catches | Marks `reversed_at=null`, writes status_board P1 "Reverse failed for {x}, manual intervention required", SMS Tate |
| Postgres unreachable from laptop-agent | Decay daemon retry loop + watchdog | Watchdog SMS after 10min; daemon resumes when DB returns |

## Migration from existing surfaces

| Existing surface | After cutover | How |
|---|---|---|
| Gmail drafts awaiting Tate review | Auto-queued as `email_send` items | One-shot sweep at deploy: scan Gmail drafts label `EcodiaOS/AwaitingReview`, enqueue each as `email_send`. Then `gmailService.draftForReview` replaces direct `sendReply` for client-facing replies. |
| status_board rows `next_action_by='tate'` | Auto-mirrored as `free_text` items via Postgres trigger | One-shot batch INSERT on deploy for existing rows. Trigger handles future transitions. |
| Observer signals flagged tate-attention | Promoted to `observer_ack` via `flagForTateReview` | Observer trio modules updated to check `requires_human_call` on each emitted signal. Existing pending signals: one-shot batch promote. |
| Ad-hoc "should I ship" prompts in chat | `release_ship` items via `releaseService.proposeShip` | ship-ios.py and ship-android scripts gain `--propose` mode (default). Operator can override with `--ship-now` for the rare urgent case Tate authorised verbally. |
| Spend decisions narrated in chat | `spend_execute` via spendService | Stripe MCP and bookkeeping callers wrapped. Spend under threshold continues to execute directly. |
| Doctrine writes (load-bearing) | `doctrine_write` items | `doctrineService.proposePattern` for `load_bearing: true` patterns. Routine doctrine writes continue direct. Existing patterns are not retroactively queued. |
| Morning briefing email | Extended | Adds section: "Queue overnight: N added, M cleared by you, K decayed to default." |

The cutover sequence: ship migrations + service code, then flip producer wiring file by file, then run the one-shot sweeps, then enable the iOS app's Queue view. Each step is independently revertable; the queue can sit empty for any duration without breaking other systems.

## Testing strategy

1. **Unit tests** for each `actionHandlers[item_type]` and `cancelHandlers[item_type]` with mocked MCP calls. Cover happy path + handler-throws path. Verify action_log_payload includes everything needed for reverse.
2. **Unit tests** for each `reverseHandlers[item_type]`. Verify reverse runs cleanly against a freshly-written action_log row.
3. **Unit tests** for `mergeEditIntoAction` per item type. Cover edit-applies-cleanly + edit-corrupts-action + edit-touches-immutable-field.
4. **Integration test** end-to-end per item type: producer call → queue row inserted → resolve via direct DB call → action executed (against mocked MCP) → log written → status_board updated.
5. **Decay test:** insert row with `decay_at=now()+5s`, wait 6s + tick the daemon manually, verify default verdict resolves cleanly + status_board summary written.
6. **Critical SMS test:** insert `urgency='critical'` item, verify sms.tate called once; advance clock to `decay_at - 30min`, verify warning SMS fires.
7. **Idempotency test:** insert producer call twice with same idempotency_key, verify second call dedupes.
8. **Concurrent resolve test:** two parallel resolve() calls on same id, verify one succeeds and one errors with AlreadyResolvedError.
9. **Rollback test:** resolve item → call reverse within window → verify side-effect undone + log row marked reversed. Repeat past window → verify NotReversibleError.
10. **iOS app integration test:** WebSocket subscription receives `inserted` event within 2s of producer call. Push notification delivered. Resolve from app lands within 2s.
11. **End-to-end smoke test:** runs daily. Enqueues a synthetic `free_text` test item, decay daemon resolves it, verifies log row + status_board summary present.

## Open implementation questions - resolve in writing-plans

(Hard prerequisites have been promoted out of this list into their own section at the top.)

- Exact iOS app UI architecture: extend existing screens vs new tab. Probably new tab inside the existing navigation root. Needs a small UI design pass.
- The exact "edit" merge semantics per item type: for `email_send`, is the editor a full body rewrite or a structured patch (subject + body + recipient)? For `spend_execute`, can Tate edit the amount? Probably yes. For `release_ship`, can he edit release notes? Probably yes. For `doctrine_write`, full body rewrite.
- Where to host the decay daemon: laptop-agent recommended (collocated with iOS-talking substrate, shares lifecycle with the dispatcher). VPS alternative if laptop-agent uptime is a concern.
- Per-item-type thresholds: `SPEND_QUEUE_THRESHOLD` defaults to $200 AUD but should be env-tunable. The email-content classifier (regex + Haiku) thresholds need calibration against real client email corpus.
- Whether `observer_ack` items should also surface in the conductor's existing `<observer_signals>` continuity block (currently shown separately). Probably yes: both surfaces stay until Tate clears via the queue.
- The exact bright-line rule for `doctrine_write`. Conservative is `load_bearing: true` frontmatter. Less conservative is "any pattern modifying CLAUDE.md or 100-percent-autonomy doctrine." More conservative is "any pattern in `superpowers/`." Pick at implementation time.
- Whether the queue gets its own MCP tool surface for testing / scripting (`approval_queue.enqueue`, `approval_queue.resolve`). Probably yes for testing; gated by the wide bearer for production callers.
- Reconciler sweep cron schedule (every 1h vs every 4h). 1h recommended given the substrate's centrality.
- Whether to add a `silence_until timestamptz` column to support "snooze for 4 hours" affordance in the iOS app. Probably yes; cheap addition.

## Out of scope / v2+

- Multi-approver workflow (Tom or other collaborators).
- Web app UI beyond the simple Express fallback.
- General-purpose human-in-the-loop framework for use by other Anthropic agents.
- SMS-driven batch resolve ("reply 1Y 2N 3edit('new tone')"). v1 SMS only handles single-critical-item Y / N; batch is iOS-only.
- Voice-driven queue clearing ("EcodiaOS read me the queue"). Voice substrate is alive but adding queue-read voice is a separate spec.
- Auto-classification of email-send urgency by Haiku beyond the trigger regex. v1 uses regex + a single Haiku classification call only when regex matches; richer classification is a tune later.
- Tate's reply text to a recalled email being auto-incorporated into a corrected re-send. Reverse path leaves recalled emails as documented incidents; corrected re-send is manual.
- Cross-queue dependencies ("approve X only after Y"). Each queue item is independent in v1.
- Visualisation of decay timers + reversibility windows in chat (the iOS app handles this).
