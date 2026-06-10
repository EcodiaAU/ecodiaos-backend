---
title: Ecodia Native iOS App - Design Spec
date: 2026-05-19
last_updated: 2026-05-19 (post cross-chat integration with headless-conductor)
status: design-approved-pending-implementation-plan
owner: EcodiaOS (conductor) + Tate (Authorized Human Rep)
repo: D:/.code/ecodia-native/ (to be created)
supersedes: none
integrates_with: /Users/ecodia/.code/ecodiaos/backend/docs/specs/2026-05-19-one-conductor-many-channels.md
related_patterns:
  - sy094-eos-mobile-headless-ship-recipe
  - asc-app-record-create-recipe
  - apple-dev-apns-auth-key-create-recipe
  - xcode-signing-team-select-recipe
  - macincloud-substrate-selection-ssh-vs-rdp
  - one-conductor-many-channels-2026-05-19
---

# Ecodia Native iOS App - Design Spec

## 1. Purpose

A single-user, Tate-only iOS app that:

1. **Replaces SMS as the inbound channel from Tate to EcodiaOS.** Today: iPhone -> SMS -> Twilio -> webhook -> headless conductor. New: iPhone -> HTTPS POST -> headless conductor. Twilio stays as fallback only.
2. **Is a real-use vehicle for testing native iOS surfaces Capacitor cannot reach.** Live Activities / Dynamic Island, App Intents / Siri Shortcuts, Share Extension, Home Screen widget, SwiftData offline cache, Background Tasks.

Distribution: TestFlight, internal-group testers (Tate's Apple ID `tatedonohoe@gmail.com` to start), unlisted. Apple Dev team: `code@ecodia.au` (existing membership Co-Exist uses).

## 2. Architectural framing (post coord with headless-conductor chat)

The iOS app is a **third channel adapter** alongside `smsWebhook.js` and `webhooks/telegram-bot.js`. It is NOT a new conductor. All decision logic (triage, escalation, tool use, reply) lives in the existing `backend/src/services/headlessConductor.js` (Haiku 4.5 triage + Opus 4.7 max CLI subprocess for execute). The iOS-related backend work consists of:

- **Inbound adapter**: `/api/native/inbound` builds the canonical envelope and calls `routeEnvelopeToConductor({envelope})` from `inboundConductorRouter`. That is the entire inbound brain integration.
- **Outbound services**: 4 services under `backend/src/services/native/` (notifyTate, apnsClient, liveActivityPush, deviceState) + 1 substrate curator (tatePriorityCurator). These are exposed as tools on the headless-conductor's `EXECUTE_TOOLS` surface; the conductor calls them via `require`, not via a parallel decision layer.
- **Substrate addition**: `tate_priority int NULL` column on `status_board`. Dual purpose: widget surface + triage context-load filter.

**What the iOS app and its backend MUST NOT do:**
- No parallel inbound routing / decision-making (everything funnels through `inboundConductorRouter`)
- No parallel tool surface for the headless to call (existing EXECUTE_TOOLS extends)
- No parallel reply transport in `notifyTate` (it dispatches to existing SMS/Telegram transports for non-native channels)
- No parallel system prompt or triage logic (Haiku triage handles native via channel-aware system prompt update on the headless chat's side)

## 3. Scope

### In scope (v1)
- SwiftUI chat surface (replaces SMS for inbound)
- APNs push for EcodiaOS -> Tate messages
- Background Tasks (silent sync of missed messages)
- SwiftData offline cache + pending-send queue
- App Intents / Siri Shortcuts
- Share Extension (forward URL / text / image / file to EcodiaOS)
- Live Activity + Dynamic Island (lock-screen view of conductor turn progress)
- Home Screen widget (top 3 `tate_priority` rows from `status_board`)
- New `tate_priority` column on `status_board` (1..3, NULL default)
- `notifyTate` service as universal outbound dispatcher (native + sms + telegram + auto)

### Out of scope (explicit)
- watchOS companion (no device)
- macOS Catalyst (Claude Code in IDEs is the desktop surface)
- iMessage extension (not a workflow Tate uses)
- HealthKit context attach (academic; no workflow benefit)
- Full App Store listing (single-user app)
- Multi-user / Sign in with Apple (single user, Keychain bearer suffices)
- Parallel decision layer in any iOS-related backend code

## 4. Architecture

### 4.1 Stack
- Swift 5.10 / iOS 17+
- SwiftUI for all UI surfaces (App, Widget, Share Ext, Live Activity)
- `@Observable` macro for state
- `URLSession` + `async/await` (no Alamofire)
- SwiftData for offline persistence (no Core Data)
- `ActivityKit` for Live Activities
- `WidgetKit` for home-screen widget
- `AppIntents` framework for Siri
- `BackgroundTasks` framework for silent sync
- `UIViewController`-hosted Share Extension (UIKit shell, SwiftUI inside)

### 4.2 Xcode project layout

```
D:/.code/ecodia-native/
  EcodiaNative.xcodeproj
  EcodiaCore/                         Swift Package (shared by every target)
    Sources/EcodiaCore/
      Models/                         Message, StatusBoardItem, LiveActivityState, Attachment
      Networking/                     EcodiaClient (URLSession + async/await)
      Keychain/                       BearerStore (kSecAttrAccessGroup-shared)
      Persistence/                    SwiftData ModelContainer + schema
      PushTokens/                     APNs + ActivityKit token registration
      Uploads/                        AttachmentUploader (Supabase signed-URL PUT)
    Tests/EcodiaCoreTests/
  EcodiaApp/                          Main app target
    EcodiaApp.swift                   @main, App lifecycle, BG task registration
    ChatView.swift                    SwiftUI chat surface
    ChatViewModel.swift               @Observable, calls EcodiaCore
    OnboardingView.swift              First-launch bearer paste
    LiveActivities/                   ActivityAttributes + lock-screen UI
    Intents/                          SendToEcodiaIntent (App Intent for Siri)
  EcodiaWidget/                       Widget extension target
    EcodiaWidget.swift                StaticConfiguration + TimelineProvider
    TopThreeView.swift                Widget UI (small/medium/large)
  EcodiaShare/                        Share extension target
    ShareViewController.swift         UIViewController host
    ShareView.swift                   SwiftUI inside the host
  EcodiaTests/                        UI / integration tests
```

### 4.3 Bundle identifiers and App Group
- App: `au.ecodia.native`
- Widget: `au.ecodia.native.widget`
- Share: `au.ecodia.native.share`
- App Group: `group.au.ecodia.native` (shared UserDefaults + shared SwiftData ModelContainer + shared Keychain access group)

### 4.4 Why a Swift package from day 1
Share Extension, Widget, Live Activity, and App Intents all need the same `EcodiaClient` + `BearerStore` + `Message` types. Refactoring out a shared package the moment the second target lands is more expensive than starting with one.

### 4.5 URL scheme

Custom URL scheme: `ecodia://`
- `ecodia://` -- open app to current chat
- `ecodia://chat` -- explicit chat tab
- `ecodia://status/<status_board_id>` -- deep link from widget tap into chat with row pre-loaded as context
- `ecodia://compose?text=<url-encoded>` -- pre-populate compose (Share Ext fallback)

Universal Links not used in v1.

## 5. Backend wiring

### 5.1 New endpoints on `api.admin.ecodia.au`

All gated by `Authorization: Bearer <kv_store.creds.tate_native_app_bearer>`. Implemented in `backend/src/routes/native.js`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/native/inbound` | Tate -> EcodiaOS. Builds canonical envelope (channel=`native`), calls `routeEnvelopeToConductor({envelope})` from `inboundConductorRouter`. Returns immediately. |
| `POST` | `/api/native/devices/register` | Body: `{apns_token, app_version, ios_version}`. Persisted to `kv_store.cowork.native.device_state.tate`. |
| `GET` | `/api/native/recent?since=<msg_id>` | Server-curated read of `kv_store.cowork.message_thread.native.tate`. Strips channel-cruft. Returns `{messages: [...], next_cursor}`. |
| `POST` | `/api/native/messages/{id}/ack` | Marks message delivered/read on backend. Drives badge clear. |
| `GET` | `/api/native/tate-priority` | Returns top 3 `tate_priority`-ranked active `status_board` rows. Consumed by widget. |
| `POST` | `/api/native/tate-priority/set` | Body: `{ranked_ids: [id1, id2, id3]}`. Conductor-driven pin (called via `set_tate_priority` tool from EXECUTE_TOOLS). |
| `POST` | `/api/native/attachments/sign` | Body: `{filename, content_type, bytes}`. Returns presigned PUT URL to Supabase Storage + final `signed_url` for envelope. iOS uploads directly to Supabase, posts only the URL on the envelope. |

### 5.2 Canonical envelope (extends existing SMS/TG shape with attachments[] rename + native fields)

```json
{
  "channel": "native",
  "source": "chat" | "share" | "siri",
  "thread_id": "tate",
  "idempotency_key": "<uuid>",
  "body": "user-typed text, may be empty if attachments-only",
  "attachments": [
    {
      "kind": "url" | "image" | "file" | "text" | "audio" | "video",
      "url": "https://supabase.../signed-url" | null,
      "inline": "string content" | undefined,
      "content_type": "image/png" | "application/pdf" | ...,
      "bytes": 12345,
      "auth_hint": "supabase_signed"
    }
  ],
  "live_activity_push_token": "<APNs Activity token>" | null,
  "metadata": {
    "app_version": "1.0.0",
    "ios_version": "17.4",
    "ts": "ISO-8601"
  }
}
```

`source: "share"` is the signal to triage that this is a forward; actual content is in `attachments`, `body` is optional user comment. (Triage system prompt update is the headless chat's side of the work.)

### 5.3 New services (all under `backend/src/services/native/`)

#### `notifyTate.js` -- universal outbound dispatcher

```ts
notifyTate({
  body: string,
  urgency?: 'routine' | 'alert' | 'critical',
  channel?: 'auto' | 'native' | 'sms' | 'telegram',  // default 'auto'
  thread_id?: string,
  deep_link?: string
}) -> { ok: boolean, transport: 'apns'|'sms'|'telegram', message_id: string }
```

Dispatch table:
- `channel='native'` -> `apnsClient.push(...)` with `urgency` -> APNs interruption-level mapping; on 410-stale-token or push failure, fall back to `sendSmsToTate` from `services/transports/smsTransport`
- `channel='sms'` -> direct call to `sendSmsToTate({body, append_to_mirror: true})`
- `channel='telegram'` -> direct call to `sendTelegramMessage({chat_id, text, append_to_mirror: true})` (chat_id resolved from kv config)
- `channel='auto'` -> `deviceState.pickChannel({last_inbound_channel?})` runs policy below, then recurses with explicit channel

Transports own their own mirror writes (`append_to_mirror: true` default). `notifyTate` passes through.

#### `apnsClient.js` -- HTTP/2 to api.push.apple.com

JWT-signed (ES256, p8 key, kid + iss headers). Reuses HTTP/2 connection. Supports both `alert` (regular push) and `background` (silent push, `content-available: 1`) modes plus ActivityKit push (topic suffix `.push-type.liveactivity`).

#### `liveActivityPush.js` -- ActivityKit update

```ts
liveActivityPush.update({
  state: 'received' | 'thinking' | 'progress' | 'done',
  body?: string
}) -> { ok: boolean }
```

Tokenless. Reads token from `kv_store.cowork.native.live_activity_token.tate`. Service runs a `setInterval` scan every 5 min, force-ends activities where `started_at` is older than 4h.

#### `deviceState.js` -- APNs feedback tracking + auto channel-pick

Tracks at `kv_store.cowork.native.device_state.tate`:
```json
{
  "apns_token": "...",
  "apns_token_registered_at": "ISO",
  "last_apns_delivery_success_at": "ISO",
  "last_apns_delivery_failure_at": "ISO",
  "last_inbound_channel": "native" | "sms" | "telegram",
  "last_inbound_at": "ISO"
}
```

`pickChannel() -> 'native'|'sms'|'telegram'`:
1. Read `device_state.last_inbound_channel` and `last_inbound_at` from kv
2. If `last_inbound_at` < 60 min ago -> mirror that channel
3. Else if `apns_token` registered AND `last_apns_delivery_success_at` < 24h ago -> `native`
4. Else -> `sms`
5. Telegram is never auto (explicit opt-in only)

`auto` is reserved for autonomous initiatives (meta-loop, cron). Triage/execute always pass explicit channel matched to inbound.

#### `tatePriorityCurator.js`

```ts
refresh() -> { ok: boolean, ranked: [id1, id2, id3] }   // internal
setTatePriority({ ranked_ids: [id1, id2, id3] }) -> { ok }   // tool-callable
```

Triggers (curator's responsibility, not the context-loader's):
1. **Cron**: every 20 min sweep
2. **Listener**: `pg_notify` on `status_board` insert/update/archive — fires if the mutated row IS or WAS in top 3
3. **Explicit endpoint**: `POST /api/native/tate-priority/set` (also exposed as `set_tate_priority` EXECUTE_TOOL)

Atomic refresh transaction:
```sql
BEGIN;
UPDATE status_board SET tate_priority = NULL WHERE tate_priority IS NOT NULL;
UPDATE status_board SET tate_priority = 1 WHERE id = $1;
UPDATE status_board SET tate_priority = 2 WHERE id = $2;
UPDATE status_board SET tate_priority = 3 WHERE id = $3;
COMMIT;
```

Selection criterion: judgement-based curator pass that blends `priority<=2`, `next_action_by='tate'`, approaching `next_action_due`, recently-touched client threads. Not a strict formula.

### 5.4 Exposed as EXECUTE_TOOLS on the headless-conductor

The headless-conductor chat owns the `EXECUTE_TOOLS` surface and will require these services:

```js
const { notifyTate } = require('./services/native/notifyTate')
const { liveActivityPush } = require('./services/native/liveActivityPush')
const { setTatePriority } = require('./services/native/tatePriorityCurator')
```

Tools exposed:
- `notify_tate({body, urgency?, channel?, thread_id?, deep_link?})` -- universal reply (consolidates the prior separate `send_sms_to_tate` + `send_telegram_message` tools on the triage surface)
- `live_activity_update({state, body?})` -- mid-execute progress narration
- `set_tate_priority({ranked_ids})` -- explicit pin (optional v1)

### 5.5 New credentials & substrates

- `kv_store.creds.tate_native_app_bearer` -- 64-char hex random, narrow scope (`/api/native/*` only), Keychain-stored on device, rotatable cheaply
- `kv_store.creds.apple_apns_auth_key` + `apns_key_id` + `apns_team_id` -- p8 key from Apple Dev portal
- `kv_store.cowork.native.device_state.tate` -- auto channel-pick state
- `kv_store.cowork.native.live_activity_token.tate` -- `{token, started_at, envelope_idempotency_key}`, TTL 4h via service scan
- `kv_store.cowork.message_thread.native.tate` -- canonical native thread mirror (extends existing `cowork.message_thread.<channel>.<thread_id>` convention)

## 6. Data flows

### 6.1 Tate -> EcodiaOS (inbound)
```
[ChatView | Share Ext | Siri AppIntent]
  -> (Share Ext only) EcodiaClient.signAttachmentUrl(filename, content_type, bytes)
     -> POST /api/native/attachments/sign -> presigned PUT URL
     -> EcodiaClient.uploadAttachment(presigned_url, data)
  -> EcodiaClient.sendMessage(body, source, attachments[], live_activity_push_token)
  -> POST /api/native/inbound
  -> routes/native.js builds canonical envelope
  -> inboundConductorRouter.routeEnvelopeToConductor({envelope})
  -> headlessConductor: Haiku triage -> (reply directly via notify_tate) | (escalate to Opus subprocess)
```

### 6.2 EcodiaOS -> Tate (outbound)
```
conductor (Haiku triage or Opus execute) calls EXECUTE_TOOLS.notify_tate({...})
  -> services/native/notifyTate.js
  -> dispatch by channel -> APNs (native) | SMS (sms) | Telegram (telegram)
  -> on APNs success: device receives via UNUserNotificationCenter
     -> app foreground? inline. background? alert (interruption-level per urgency)
     -> on next foreground, EcodiaClient.fetchRecent(since: lastSeenId) backfills
  -> on APNs failure (410, network): notifyTate auto-falls-back to sendSmsToTate
  -> transports append outbound to their channel's mirror (cowork.message_thread.<channel>.<thread_id>)
```

### 6.3 Live Activity
```
ChatView.send(...) -> Activity<EcodiaActivityAttributes>.request(...) locally, state=sent
  -> live_activity_push_token captured from Activity instance
  -> POST /api/native/inbound with live_activity_push_token on envelope
  -> routes/native.js writes kv_store.cowork.native.live_activity_token.tate = {token, started_at, envelope_idempotency_key}
  -> inboundConductorRouter calls headlessConductor
  -> [auto-baseline pushes from router] liveActivityPush.update({state: 'received'})
  -> [auto-baseline if escalates] liveActivityPush.update({state: 'thinking'})
  -> [optional mid-execute] Opus calls live_activity_update tool -> liveActivityPush.update({state: 'progress', body: 'probing repos...'})
  -> [auto-baseline on execute exit] liveActivityPush.update({state: 'done', body: final_summary})
  -> activity auto-ends after 4h via service setInterval scan
```

### 6.4 Widget refresh
- Timeline provider reloads on iOS schedule (~15 min) + on app foreground (`WidgetCenter.shared.reloadAllTimelines()`) + on silent push (`content-available: 1`) when `tatePriorityCurator` mutates ranks
- Widget calls `GET /api/native/tate-priority` using bearer pulled from shared Keychain (App Group)
- Renders 3 rows. Tap deep-links into chat with row pre-loaded as context.

## 7. `tate_priority` substrate change

### 7.1 Migration

```sql
-- backend/migrations/128_tate_priority_column.sql
ALTER TABLE status_board
  ADD COLUMN tate_priority int NULL
    CHECK (tate_priority IS NULL OR tate_priority BETWEEN 1 AND 3);

CREATE INDEX idx_status_board_tate_priority
  ON status_board (tate_priority)
  WHERE tate_priority IS NOT NULL;
```

### 7.2 Semantics
- `1` = highest for Tate's glance, `2` = second, `3` = third, `NULL` = not in top 3
- At any moment: at most 3 non-NULL rows (enforced by curator's atomic CTE, not SQL)
- Dual consumer: iOS widget + headless-conductor's `_loadTurnContext` (filters triage context to `WHERE tate_priority IS NOT NULL`)

### 7.3 Widget read query
```sql
SELECT id, name, status, next_action, next_action_by, last_touched
FROM status_board
WHERE tate_priority IS NOT NULL AND archived_at IS NULL
ORDER BY tate_priority
LIMIT 3;
```

## 8. Phased delivery

Each phase ships to TestFlight before the next phase starts. Total: ~7-9 working days.

### Phase 1 — Core SMS replacement (~2-3 days)
- Create `D:/.code/ecodia-native/` repo, EcodiaCore package, EcodiaApp target
- SwiftUI ChatView + ChatViewModel
- First-launch onboarding: paste bearer into Keychain
- APNs registration on launch
- **Backend (new):** `routes/native.js` with `/inbound`, `/devices/register`, `/recent`, `/messages/:id/ack`
- **Backend (new services):** `services/native/notifyTate.js`, `services/native/apnsClient.js`, `services/native/deviceState.js`
- APNs auth key created in Apple Dev portal
- ASC app record created (per `asc-app-record-create-recipe.md`)
- First TestFlight build via SY094 SSH ship path (`sy094-eos-mobile-headless-ship-recipe.md`)
- **Coordinated with headless-conductor chat:** they wire `notify_tate` tool on EXECUTE_TOOLS (replaces `send_sms_to_tate` + `send_telegram_message`); update triage system prompt to know about `channel: 'native'`; refactor SMS/TG transports to `services/transports/` for clean `require` from notifyTate
- **Acceptance:** Tate types from app, headless triage receives, reply arrives as APNs push, no Twilio in the loop on the happy path

### Phase 2 — Capture surfaces (~2 days)
- EcodiaShare target: ShareViewController + SwiftUI body
- URL / text / image / file intake, uploaded via `/api/native/attachments/sign` -> Supabase Storage PUT -> envelope `attachments[]`
- AppIntent: `SendToEcodiaIntent` with parameter `text: String`
- Siri donation + discoverability
- **Backend (new):** `POST /api/native/attachments/sign` endpoint
- **Acceptance:** share-sheet from any app -> EcodiaOS receives with attachment URLs; "Hey Siri, tell Ecodia X" fires

### Phase 3 — Glance surfaces (~2 days)
- **Migration ships first (unblocks headless _loadTurnContext swap):** `128_tate_priority_column.sql`
- **Backend (new services):** `services/native/tatePriorityCurator.js` + cron + pg_notify listener registration
- **Backend (new):** `GET /api/native/tate-priority`, `POST /api/native/tate-priority/set`
- **Backend (new services):** `services/native/liveActivityPush.js` + 4h auto-end setInterval
- EcodiaWidget target with TimelineProvider + TopThreeView
- ActivityAttributes + lock-screen / Dynamic Island UI
- **Coordinated with headless-conductor chat:** they switch `_loadTurnContext` to filter on `tate_priority`; they wire `live_activity_update` and `set_tate_priority` tools on EXECUTE_TOOLS; they add router-side auto-baseline `liveActivityPush.update` calls at envelope-receipt + escalation + execute-exit
- **Acceptance:** widget shows the 3 Tate-priority rows; sending a message starts a Live Activity that updates as the conductor processes

### Phase 4 — Resilience (~1-2 days)
- SwiftData schema: `Message`, `Thread`, `PendingSend`
- BGAppRefreshTask + BGProcessingTask registration
- Offline send queue: compose offline -> SwiftData PendingSend -> retry flush on reachability
- Foreground backfill via `/api/native/recent?since=<lastSeenId>`
- **Acceptance:** airplane mode -> compose -> land -> message flushes. Offline launch shows last 100 messages. Missed pushes recovered on next foreground.

## 9. Error handling, offline, edge cases

- **Send fails**: SwiftData `PendingSend`, NWPathMonitor-triggered retry. UI badges as `queued`.
- **APNs fails**: `notifyTate` falls back to SMS via `services/transports/smsTransport`. The `sms-tate` skill remains a working escape hatch.
- **Bearer leak or device loss**: rotate `kv_store.creds.tate_native_app_bearer`, force re-onboard.
- **App killed mid-Live-Activity**: `liveActivityPush` service ends the activity 4h after `started_at` via setInterval scan.
- **Server is source of truth on conflicts**: client `/recent?since=` reconcile resolves any race.
- **Background quota**: register both `BGAppRefreshTask` (lightweight silent sync) and `BGProcessingTask` (heavier reconcile, charger + wifi).
- **Widget stale data**: schedule reload + foreground reload + silent-push reload. Worst case 15-min staleness.
- **APNs token rotation**: device re-registers on every cold launch; backend upserts to `kv_store.cowork.native.device_state.tate`.
- **Offline cache size**: SwiftData persists last 100 messages; older remain server-side. Pending sends never auto-evict.
- **Idempotency**: `idempotency_key` on envelope; `routes/native.js` writes raw POST to `kv_store.cowork.inbound_raw.<key>` (7-day TTL, same pattern as SMS/TG webhooks) before routing.

## 10. Testing

Minimal -- single-user app, Tate's daily usage IS the test suite. No CI gating for an internal app.

- `EcodiaCoreTests`: networking (mock URLSession), Keychain wrapper, SwiftData migrations, model encoding/decoding, attachment-upload flow
- One UI test: send-message happy path (`EcodiaTests/SendFlowTests.swift`)
- Backend `backend/tests/native.test.js`: each `/api/native/*` endpoint, smoke + auth-failure + envelope-round-trip into `routeEnvelopeToConductor` (mocked)
- Backend `backend/tests/notifyTate.test.js`: each channel dispatch, fallback behavior, auto policy
- Per phase: TestFlight build, use for ~1 day, observe regressions before next phase ships

## 11. Coord contract with headless-conductor chat

This spec is the iOS+services side. The matching backend integration is owned by the headless-conductor chat. The seam:

**iOS+services side owns** (this spec):
- All iOS Swift code, Xcode project, ASC record, APNs key
- `services/native/notifyTate.js`, `apnsClient.js`, `liveActivityPush.js`, `deviceState.js`, `tatePriorityCurator.js`
- All `/api/native/*` endpoints (`routes/native.js`)
- `tate_priority` migration (`128_tate_priority_column.sql`)
- iOS bearer credential rotation lifecycle

**Headless-conductor side owns**:
- Adding `channel: 'native'` to envelope channel enum
- Renaming envelope `media[]` -> `attachments[]` across smsWebhook + telegram-bot + EXECUTE_TOOLS descriptions
- Extracting existing SMS/TG transports to `services/transports/{smsTransport,telegramTransport}.js` (clean `require` from notifyTate)
- Wiring `notify_tate`, `live_activity_update`, `set_tate_priority` tools into EXECUTE_TOOLS (replaces prior `send_sms_to_tate` + `send_telegram_message` on triage surface)
- Updating triage system prompt for native channel + `source: native_share` recognition
- Router-side auto-baseline `liveActivityPush.update` calls at envelope-receipt + escalation-start + execute-exit
- Storing `live_activity_push_token` from envelope to `kv_store.cowork.native.live_activity_token.tate` on receipt
- Switching `_loadTurnContext` to filter `WHERE tate_priority IS NOT NULL` once migration ships
- Dead-code cleanup of reflex.append_to_conductor / seed_conductor / append_to_master (orthogonal)

**Shared substrates (no duplication)**:
- Canonical envelope schema (channel enum + attachments[] shape)
- Thread mirrors at `kv_store.cowork.message_thread.<channel>.<thread_id>`
- `kv_store.cowork.inbound_raw.<idempotency_key>` for 7-day debug replay
- `status_board.tate_priority` column (dual consumer)

## 12. Open questions (none load-bearing for v1 ship)

- Unified Tate-conversation view at `/api/native/recent` (merging SMS + TG + native vs strict native-only). **v1 default: strict native-only.** Unified view becomes v2.
- Cross-channel attachment storage policy for non-Supabase auth-hints (Twilio basic auth vs Supabase signed). Each transport handles its own; no consolidation needed in v1.

## 13. Cross-references

- Sibling spec: `backend/docs/specs/2026-05-19-one-conductor-many-channels.md` (headless-conductor architecture)
- Doctrine pattern: `backend/patterns/one-conductor-many-channels-2026-05-19.md`
- `~/.claude/CLAUDE.md` — operating doctrine
- `backend/CLAUDE.md` — substrate map, MCP endpoints
- `backend/patterns/sy094-eos-mobile-headless-ship-recipe.md` — SSH+altool ship path
- `backend/patterns/asc-app-record-create-recipe.md` — ASC app record creation
- `backend/patterns/apple-dev-apns-auth-key-create-recipe.md` — APNs auth key creation
- `backend/patterns/xcode-signing-team-select-recipe.md` — Xcode signing setup
- `backend/patterns/macincloud-substrate-selection-ssh-vs-rdp.md` — when to SSH vs RDP for build steps
- Existing code we integrate with:
  - `backend/src/services/headlessConductor.js` — Haiku triage + Opus execute
  - `backend/src/services/inboundConductorRouter.js` — `routeEnvelopeToConductor({envelope})`
  - `backend/src/services/transports/smsTransport.js` — to be extracted by headless chat
  - `backend/src/services/transports/telegramTransport.js` — to be extracted by headless chat
