# Design spec: one conductor, many channels

**Date:** 2026-05-19
**Author:** EcodiaOS (Opus 4.7, Corazon Insiders session)
**Status:** Draft for Tate review
**Companion doctrine:** [patterns/one-conductor-many-channels-2026-05-19.md](../../patterns/one-conductor-many-channels-2026-05-19.md)

## Problem

Inbound chat messaging is fractured and partially broken.

- **SMS via Twilio** opens a fresh Claude Code chat tab in VS Code Insiders for every inbound, because `smsWebhook.js` ultimately calls `reflex.fire` which spawns a new tab regardless of any conductor registration. The session-subscription bridge (`inboundChannelBridge.routeInbound`) exists but its "send to coord inbox" path only emits a toast or flash via `wakeConductor`; the message never reaches the chat as a turn. The conductor would have to manually call `coord.read_inbox` to see it.
- **Telegram doesn't reach the chat at all.** The `telegram-bot.js` webhook is wired and the bridge probe runs, but the fallback `reflex.append_to_master` requires a dedicated workspace at `D:/.code/telegram-conductor` that doesn't exist. The seed marker in `~/.claude/telegram-master-state.json` falsely claims `seeded_at: 2026-05-17`. Seed macro tries to launch VS Code on a missing folder; append macro tries to focus a missing window. Either branch fails silently. The Telegram webhook may also be un-registered with Telegram (no live verification recently).
- **Insiders vs. stable mis-targeting.** AHK macro's fallback window title is the substring `"Visual Studio Code"`, which also matches `"Visual Studio Code - Insiders"`, so SMS pastes can land in the wrong IDE.
- **The "focusless extension API" is unused.** The `cursor-preview-extension` runs at ports 7457 (Insiders) + 7458 (stable) and exposes `vscode.commands.executeCommand` plus clipboard, tabs, terminals over HTTP. SMS/Telegram never call it; they go straight to AHK keyboard simulation.
- **No way to introduce a turn into an existing Claude Code chat without an OS keystroke.** The Claude Code extension does not expose a programmatic "submit a turn" command. A webview-based chat input only accepts focused keyboard or paste events. One OS keystroke pair is the minimum hop.
- **No queueing for back-to-back inbound.** If two SMS arrive 200 ms apart, the AHK pastes race; one can clobber the other in the chat input.

## Goal

One persistent conductor chat handles inbound messages from every channel. The chat decides whether to reply, dispatch a worker, or escalate. New messages arrive as continuation turns in that chat, not as fresh tabs. The conductor's host IDE moves around as Tate's focus moves; the chat tab follows the heartbeat. Channel adapters are thin and identically shaped. New channels (iMessage, Slack, email-as-chat, WhatsApp) plug in by writing a webhook that emits the same envelope.

## Non-goals

- Multi-conductor scoping (per-channel or per-client conductors). Single conductor for V1. Doctrine pattern records the future evolution path.
- Persisting conductor identity across Corazon reboots beyond what the conductor record already supports. Reboot is a cold-start; the kv_store thread mirror is the durable continuity layer.
- A custom Claude Code extension command for programmatic-turn-submit. Out of scope; that would need a Claude Code extension PR.
- iMessage / WhatsApp / Slack channels. The design accepts them as future plug-ins but V1 ships SMS + Telegram only.

## Architecture

### A. The canonical envelope

Both SMS and Telegram webhooks normalize their provider payload to a single shape before any conductor-side logic runs. New channels emit the same shape.

```jsonc
{
  "channel": "sms" | "telegram" | "imessage" | "whatsapp" | "slack" | "email",
  "from": "+61...",              // E.164 / TG user id / email addr
  "from_kind": "tate" | "client" | "unknown",
  "sender_name": "Tate",
  "thread_id": "+61...",         // SMS uses phone; TG uses chat_id; email uses thread id
  "body": "raw text body",
  "media": [
    { "url": "...", "content_type": "image/jpeg", "bytes": 123456, "auth_hint": "telegram_bot_token" }
  ],
  "reply_to": null,              // for TG: prior message snippet if reply_to_message_id present
  "received_at": "2026-05-19T01:23:45.000Z",
  "idempotency_key": "tg-<update_id>-<chat_id>" | "sms-<MessageSid>",
  "raw_provider_payload_ref": "kv:cowork.inbound_raw.<idempotency_key>"
}
```

Stored at `kv_store.cowork.inbound_raw.<idempotency_key>` for 7 days for debug replay.

### B. Conductor registry (extended)

`coord.register_conductor` body extends to carry IDE-bridge coordinates so we never depend on window-title substring matching again:

```jsonc
{
  "tab_id": "...",                // unique per Claude Code chat (from ~/.claude/ide/<port>.lock)
  "claude_port": 65221,           // the lock filename
  "ide_name": "Visual Studio Code - Insiders",
  "ide_pid": 22072,
  "ide_bridge_port": 7457,        // from ~/.ecodia-preview/instances.json
  "workspace_root": "D:\\.code\\ecodiaos\\backend",
  "registered_at": "...",
  "last_seen_at": "...",
  "prior_conductor_tab_id": "...",
  "in_turn": false,                // mutex: true while the conductor is mid-turn
  "in_turn_set_at": null
}
```

Registry file moves from `D:/.code/EcodiaOS/coordination/conductors/default.json` to `D:/.code/EcodiaOS/coordination/conductors/current.json`. On takeover, the prior `current.json` is moved to `conductors/history/<tab_id>-<registered_at>.json` so audit history is preserved.

Two new internal helpers in `coord.js`:

- `loadActiveConductorRegistration()` (already exists) returns `null` if stale > 30 min.
- `setConductorInTurn({in_turn, set_at})` updates the mutex flag atomically.

### C. The primitive: `reflex.append_to_conductor`

Replaces both `reflex.fire` (SMS) and `reflex.append_to_master` (Telegram). Lives in `D:/.code/eos-laptop-agent/tools/reflex.js`.

```
async function append_to_conductor({ envelope, idempotency_key, source }) {
  1. Probe conductor registry via internal coord helper (no HTTP self-call).
     If no active conductor or stale > 30 min, return {ok:false, fired:false, reason:'no_conductor'}.

  2. Dedupe via reflex-log on idempotency_key (24h window).

  3. Build the prompt from the envelope (see §D for format).

  4. Set clipboard via IDE bridge:
       POST http://localhost:<ide_bridge_port>/ide/env/clipboard {text: prompt}

  5. Bring the conductor's tab to focus via IDE bridge:
       POST /ide/command {cmd: 'claude-vscode.editor.openLast'}
       POST /ide/command {cmd: 'claude-vscode.focus'}
       POST /ide/command {cmd: 'workbench.action.focusActiveEditorGroup'}

  6. AHK keystroke targeted by PID (no title matching):
       WinActivate ahk_pid <ide_pid>
       Send "^v"
       Sleep 200
       Send "{Enter}"

  7. Append to reflex log + return {ok, fired_at, conductor_tab_id, used_paths, duration_ms}.

  Errors at step 4-6 surface as {ok:false, reason:'<phase>_failed', ...}. Caller falls
  back to seed_conductor on hard failure.
}
```

The IDE bridge POST in step 4-5 sets focus inside the IDE without needing to bring its window to the OS foreground externally. The AHK call in step 6 then sends keystrokes targeted by PID via `WinActivate ahk_pid <N>`, which only raises the specific PID's window and only enough to receive keystrokes. Other IDEs and apps are not touched.

If `wake_policy.mode` is `silent` or `toast`, step 4 still sets the clipboard (so the conductor can paste manually) but steps 5-6 are skipped. The message goes to coord inbox only; the conductor reads it on her next user-driven turn via the upgraded heartbeat hook.

### D. Prompt formatting

The prompt that lands as a turn uses a stable header so the conductor parses inbound consistently:

```
[inbound from <sender_name> via <channel> | <thread_id> | <received_at_AEST_HHMM>]
<reply-instructions stub: e.g. "reply via sms_tate MCP" or "reply via Telegram bot API to chat_id N">
<media block if any: "fetch attached media via curl X (auth: Y)">
<reply_to block if any: "in reply to: <30-char snippet>">

<body>

---
<channel-and-sender-aware policy preamble:
  - Tate via SMS: tate-policy (decision-content replies only, <=160 GSM)
  - Tate via Telegram: tate-policy + longer-reply OK (markdown supported)
  - Client (any channel): no-client-contact-without-tate-goahead draft pattern>

Per cron-fire-must-have-deliverable-not-just-narration: this turn MUST produce a
substrate write before exit (sms send OR draft kv_store OR status_board row OR Episode).
```

For an **active conductor** path, the prompt is short (header + reply instructions + body). The conductor already has its native chat history + workspace CLAUDE.md briefing loaded.

For a **seed conductor** path (cold-start), the prompt prepends the kv_store thread mirror (last 10 exchanges) + a one-shot seed preamble that introduces the conductor role.

### E. The primitive: `reflex.seed_conductor`

Cold-start path when `append_to_conductor` returns `no_conductor`. Lives in `tools/reflex.js`.

```
async function seed_conductor({ envelope, idempotency_key, source }) {
  1. Pick target IDE from ~/.ecodia-preview/instances.json:
       prefer most-recently-started instance with non-empty workspaceRoots,
       else most-recently-started any instance,
       else error out (no IDE alive).

  2. Build seed prompt (see §D).

  3. Set clipboard via IDE bridge: POST :<ide_bridge_port>/ide/env/clipboard.

  4. Open a new Claude Code chat via IDE bridge:
       POST /ide/command {cmd: 'claude-vscode.editor.open'}
       (if that command isn't registered, fall back to AHK F1 -> palette ->
        "Claude Code: Open in New Tab" -> Enter.)

  5. AHK keystroke targeted by PID:
       WinActivate ahk_pid <ide_pid>
       Send "^v"
       Sleep 300
       Send "{Enter}"

  6. The first UserPromptSubmit in that new chat triggers conductor_heartbeat.py,
     which auto-registers the new chat as conductor (no active conductor exists
     after the move-to-history step).

  7. Return {ok, fired_at, target_ide, target_pid, target_bridge_port}.
}
```

### F. Channel adapters (slim)

`smsWebhook.js` and `telegram-bot.js` become thin envelope builders:

```js
router.post('/incoming', validateTwilioSignature, async (req, res) => {
  respondOk()  // 200 to Twilio immediately
  const envelope = buildSmsEnvelope(req.body)  // normalize Twilio fields
  await persistRawPayload(envelope.idempotency_key, req.body)
  await appendToInboundThread(envelope)        // kv_store thread mirror
  await routeViaReflex(envelope)               // append_to_conductor or seed
})
```

`routeViaReflex` (shared module `src/services/inboundConductorRouter.js`):

```js
async function routeViaReflex(envelope) {
  const appendResult = await callLaptopAgent('reflex.append_to_conductor', {
    envelope, idempotency_key: envelope.idempotency_key, source: envelope.channel
  })
  if (appendResult.ok) return { mode: 'append', ...appendResult }

  if (appendResult.reason === 'no_conductor') {
    const seedResult = await callLaptopAgent('reflex.seed_conductor', {
      envelope, idempotency_key: envelope.idempotency_key, source: envelope.channel
    })
    return { mode: 'seed', ...seedResult }
  }

  // Hard failure mid-paste etc. Log; the message is already in coord inbox via
  // step 1 of append_to_conductor (which queues to inbox before pasting); next
  // human-driven turn picks it up via the heartbeat-hook prelude.
  return { mode: 'fallback_inbox_only', error: appendResult.reason }
}
```

`inboundChannelBridge.js` is deleted. `reflex.append_to_master` is deleted. `telegram-master-state.json` is deleted. `D:/.code/telegram-conductor/CLAUDE.md` (the orphaned workspace stub) is deleted.

### G. Coord inbox as queue + safety net

Every inbound is **always** written to `chat.conductor.inbox` via `coord.send_message` as the FIRST step in `append_to_conductor`, before any AHK paste attempt. This means:

- If the conductor is mid-turn (`in_turn: true`), the AHK paste is **deferred**. The message sits in inbox.
- If the paste fails (clipboard race, window vanished, IDE crashed mid-call), the message still sits in inbox.
- On the conductor's next turn start, the heartbeat hook reads inbox and emits any unread `inbound_*` messages as a `<inbound_messages_pending>` block in the UserPromptSubmit context.
- On the conductor's turn end, a new Stop hook reads inbox; if any unread `inbound_*` arrived during the turn, it triggers a fresh `reflex.append_to_conductor` (one combined paste) so the conductor immediately handles them as the next turn.

This gives FIFO ordering + at-least-once delivery without races.

### H. Conductor hooks

**`conductor_heartbeat.py` (existing, UserPromptSubmit)** gains:

1. After register/beat, set `in_turn: true` + `in_turn_set_at: now` on the conductor record.
2. Call `coord.peek_inbox` for `chat.conductor.inbox`.
3. Filter for unread `inbound_sms`, `inbound_telegram`, future `inbound_*` types.
4. If any, emit a `<inbound_messages_pending count=N>` block as stdout context (UserPromptSubmit hooks inject context via stdout).
5. Mark those messages seen via `coord.read_inbox` so they don't repeat.

**`conductor_turn_end.py` (new, Stop hook)**:

1. Set `in_turn: false` on the conductor record.
2. Call `coord.peek_inbox` for unread `inbound_*` messages that arrived during the turn.
3. If any, build a combined envelope (one prompt per inbound, joined) and POST to `reflex.append_to_conductor` so the conductor immediately handles the queued inbounds as its next turn.
4. If reflex POST fails (laptop-agent unreachable), log; next user-driven turn picks them up via the heartbeat hook.

Both hooks are registered in `~/.claude/settings.json` matching the existing convention (e.g. `conductor_heartbeat.py` is already wired).

### I. Telegram bootstrap

A one-shot script at `D:/.code/EcodiaOS/backend/scripts/setup-telegram-bot.js` (the file exists; rewrite or replace) that:

1. Validates `kv_store.creds.telegram_bot` provisioning: `{bot_token, webhook_secret, allowed_user_ids}`.
2. POSTs to Telegram API `setWebhook` with the production URL `https://api.admin.ecodia.au/api/webhooks/telegram/<webhook_secret>` and the `secret_token` header.
3. Sends a `/ping` message from the bot to Tate's first allowed user id.
4. Records setup verification at `kv_store.cowork.telegram_bot_setup` with `{setup_at, webhook_url, last_ping_at}`.

### J. Media handling

Both webhooks parse media references from their provider payloads:

- **Twilio MMS:** `NumMedia > 0` triggers extraction of `MediaUrl0..N` + `MediaContentType0..N`. Auth hint: Twilio basic auth (acct sid + token). Media URLs expire; conductor must fetch within the turn.
- **Telegram media:** `photo[]`, `voice`, `audio`, `document`, `video` fields. The webhook resolves `file_id` to a direct URL via `getFile` API on the bot token at envelope-build time and includes the resolved URL + auth hint.

For voice/audio MIME types, the prompt header suggests Deepgram MCP for transcription. For images, suggests Claude vision via the conductor's own multimodal turn.

### K. Tate-mobile allowlist expansion

`TATE_MOBILE` env becomes `kv_store.cowork.tate_mobiles` (array of E.164 strings). The current single env stays as a fallback. Same upgrade for Telegram `allowed_user_ids` (already an array; just verify all of Tate's devices are in there).

### L. Reflex log retention + audit

`~/.claude/ecodia-reflex-log.json` already exists. Extend to capture full envelope (small fields only: channel, from, sender_name, idempotency_key, mode, conductor_tab_id, exit_code, duration_ms). Cap at 500 entries (existing behavior).

## End-to-end scenarios

### S1. Tate SMS to active conductor

1. Tate texts `+61... > "check the resonaverde deploy"`.
2. Twilio POST to `/api/webhooks/sms/incoming`. Signature validated.
3. Webhook builds envelope: `{channel:'sms', from:'+61...', from_kind:'tate', body:'check the resonaverde deploy', idempotency_key:'sms-SM...', ...}`.
4. Webhook responds 200 to Twilio, then async: persist raw, append to thread mirror, call `reflex.append_to_conductor`.
5. `append_to_conductor` sees active conductor (Insiders, last beat 30s ago), queues message to inbox, sets clipboard via IDE bridge port 7457, runs `claude-vscode.editor.openLast` + `claude-vscode.focus`, AHK Ctrl+V + Enter targeted by Insiders PID.
6. The Insiders Claude Code chat receives the paste as its next turn.
7. Conductor reads "check the resonaverde deploy", calls `vercel_list_deployments` MCP, replies `sms_tate({body:"resonaverde main: green, last deploy 12m ago"})`.
8. Stop hook fires: `in_turn=false`, inbox empty, done.

### S2. Tate SMS while conductor is mid-turn

1. Conductor is processing a long worker dispatch (in_turn=true since 90s).
2. Tate texts `"actually skip that, do the canva refresh first"`.
3. Webhook builds envelope, calls `append_to_conductor`. The primitive queues to inbox AND attempts paste.
4. Because `in_turn=true`, the primitive **skips steps 5-6** (focus + keystroke). Message stays in inbox.
5. Conductor finishes current turn. Stop hook fires: reads inbox, finds the queued SMS, fires `append_to_conductor` against itself (in_turn now false) to inject as the next turn.
6. Conductor receives the redirect, abandons or completes whatever, pivots to canva.

### S3. Tate SMS after machine reboot / IDE closed

1. Conductor record has `last_seen_at: 6h ago`. `loadActiveConductorRegistration()` returns null.
2. `append_to_conductor` returns `{ok:false, reason:'no_conductor'}`.
3. Caller invokes `seed_conductor`.
4. Seed picks the most-recently-started IDE from `~/.ecodia-preview/instances.json`. If no IDE is alive, returns error; webhook logs P1 status_board row "no IDE alive for inbound SMS" so Tate sees it next time he opens VS Code.
5. If IDE alive: seed sets clipboard, opens new chat via IDE bridge, pastes seed prompt (kv thread mirror + new inbound + role preamble), Enter.
6. New chat starts. First UserPromptSubmit triggers heartbeat hook which auto-registers it as the new conductor.

### S4. Telegram inbound from Tate (text only)

Same as S1 but envelope.channel='telegram', envelope.thread_id=chat_id, reply instructions in prompt header point to Telegram bot API curl pattern. Telegram's longer message budget means the prompt header allows multi-line replies + markdown.

### S5. Telegram inbound with voice note

1. Tate sends a voice note to the bot. Telegram POST: `{message: {voice: {file_id: 'AwACAgIA...', duration: 12, mime_type: 'audio/ogg'}}}`.
2. Webhook calls Telegram `getFile?file_id=AwACAgIA...`, receives `file_path`, builds direct URL `https://api.telegram.org/file/bot<token>/<file_path>`.
3. Envelope.media = `[{url, content_type:'audio/ogg', auth_hint:'telegram_bot_token'}]`. Envelope.body = `""` (voice has no caption).
4. Prompt header: "voice note attached. To transcribe, use Deepgram MCP with this URL: <signed URL>. Bot token at kv_store.creds.telegram_bot.bot_token."
5. Conductor receives turn, calls Deepgram, gets transcript, replies via Telegram bot API with the transcribed action.

### S6. Client SMS (Angelica standing arrangement)

1. Angelica texts. `from` not Tate. CRM lookup matches `crm_contacts` row with `can_sms=true`.
2. Envelope.from_kind='client', envelope.sender_name='Angelica', client metadata in raw payload.
3. Prompt preamble = client-policy: "draft only, never auto-reply. Save to kv_store.cowork.inbound-sms-handler.draft.<sid>. Surface to Tate via SMS if urgency=critical."
4. Conductor drafts, saves, optionally SMS-pings Tate.

### S7. Two SMS arrive 200ms apart

1. Inbound A at t+0. `append_to_conductor` queues to inbox, conductor is idle (in_turn=false), starts paste sequence.
2. Inbound B at t+0.2s. `append_to_conductor` queues to inbox. The primitive sees in_turn=true (set by A's paste). Skips paste.
3. A's paste completes, conductor starts the turn for A. While A's turn runs, B sits in inbox.
4. A's turn ends. Stop hook reads inbox, finds B, fires `append_to_conductor`. B is now A's continuation turn.

If A and B truly race the in_turn check (both see in_turn=false), both queue messages but the second paste arrives mid-A-turn. The conductor sees B as a same-turn injected context (the second paste lands in the chat input mid-thinking). This is a tolerable degradation; the Stop hook will reconcile any missed messages on turn end.

### S8. Conductor tab closed but IDE still open

1. Tate closes the Claude Code chat tab. The lock file under `~/.claude/ide/<port>.lock` disappears.
2. Heartbeat hook can no longer fire (no chat). Conductor record goes stale after 30 min.
3. Meanwhile, AHK paste targeting the conductor's old PID + claude-vscode.editor.openLast might re-open the last chat in that tab (if the IDE remembers). If so, that chat re-registers on its first turn.
4. If openLast doesn't recover, inbound goes via seed path; same IDE, new tab.

### S9. Tate moves between IDEs mid-session

1. Conductor registered in Insiders. Tate opens Cursor, starts a new chat there.
2. Cursor chat's heartbeat hook sees an active conductor in Insiders (last beat 10s ago) and just heartbeats (does not take over). **This is wrong for Tate's intent.**
3. **Fix:** the heartbeat hook records the current tab's `claude_port` (from its lock file). If that port differs from the registered conductor's `claude_port`, the hook **takes over**: moves current record to history, registers self as new conductor.
4. So whichever tab Tate prompts most recently wins. Natural "current conductor follows my focus" behavior.

### S10. Conductor wants to dispatch a worker

1. Conductor receives complex SMS. Decides to dispatch.
2. Calls `cowork.dispatch_worker({...})`. New worker tab spawns in the focusless way (existing dispatcher, no SMS coupling).
3. Worker does work, calls `coord.signal_done`. Wake substrate notifies conductor (existing path; chat.conductor.inbox of type=done).
4. Conductor's Stop hook (after the SMS turn) sees the done message and fires a follow-up turn to act on the result.

### S11. Coord bus / laptop-agent down

1. Webhook tries to POST `reflex.append_to_conductor`. Connection refused / 502.
2. Webhook catches the error; logs at P1 with `status_board.upsert({title:'inbound conductor route failed', next_action_by:'tate'})`.
3. Message is in the kv_store thread mirror; conductor sees it next time she peeks the mirror.

### S12. Telegram webhook never registered

V0 of the design: setup script (`scripts/setup-telegram-bot.js`) hasn't been run, or was run with an old URL. Telegram doesn't deliver to us. Fix: run setup script as part of the rollout. Verify with the `/ping` test message landing in our webhook logs.

### S13. Bot token rotation

Per `cred-rotate` skill: the consumers are env + kv_store + the webhook URL (no token in URL, the URL uses webhook_secret). On rotation, no consumer changes except the bot token itself; setup-telegram-bot.js re-registration is automatic if run.

### S14. Idempotency

Twilio retries on the same MessageSid; Telegram retries on same update_id. The reflex log dedupes within 24h by idempotency_key. Repeated webhooks deliver to kv_store thread mirror twice (write is upsert-shaped), but the conductor paste only happens once.

## Migration plan (build order)

1. **New primitives in laptop-agent.** Add `append_to_conductor` + `seed_conductor` to `tools/reflex.js`. Wire to tool router. Add unit tests in `tools/__tests__/`.
2. **Coord additions.** Extend `coord.register_conductor` to capture `claude_port`, `ide_pid`, `ide_bridge_port`, `workspace_root`. Add `setConductorInTurn` internal helper. Migrate `default.json` -> `current.json` + history dir.
3. **Heartbeat hook upgrade.** Add inbox-peek + `<inbound_messages_pending>` prelude to `conductor_heartbeat.py`. Add `in_turn` set logic.
4. **Stop hook.** Create `conductor_turn_end.py`. Wire in `~/.claude/settings.json`.
5. **Channel adapter refactor.** Extract `inboundConductorRouter.js` service. Refactor `smsWebhook.js` + `telegram-bot.js` to use envelope + router. Delete `inboundChannelBridge.js`.
6. **Telegram bootstrap script.** Rewrite `scripts/setup-telegram-bot.js` to verify creds + setWebhook + send /ping.
7. **Cleanup deletions.** Delete `reflex.append_to_master`, `telegram-master-state.json`, `D:/.code/telegram-conductor/`. Update doctrine.
8. **Smoke test.** Send a real SMS from Tate's phone. Verify it lands in this Insiders chat as a turn. Send a Telegram message; same.
9. **Doctrine pattern + Episode.** Commit doctrine pattern. Write Neo4j Episode capturing the rollout.

## Open questions for review

- Is the seed path's "pick most-recently-started IDE" the right default, or should Tate pin a target IDE explicitly (env var or kv_store)? Recommendation: most-recently-started, with `kv_store.cowork.seed_conductor_target_ide` as an override.
- Should the in_turn mutex have a TTL escape (e.g. `in_turn_set_at` older than 10 min auto-clears)? Recommendation: yes, 10 min.
- Voice / image processing inside the conductor turn versus dispatching to a worker. Recommendation: keep inline for V1; reconsider if it pollutes context.

## Acceptance criteria

A.1. Sending an SMS from Tate's phone with the conductor chat open in any IDE pastes the message as the next turn in that chat. No new tab opens.
A.2. Sending a Telegram message from Tate to the bot pastes the message as the next turn in the same conductor chat. No dedicated telegram workspace required.
A.3. Closing the conductor chat and sending an SMS opens a new chat in the most-recently-active IDE. The new chat auto-registers as conductor on its first turn.
A.4. Two SMS arriving within 1s both land in the chat: one as the immediate next turn, one as the turn after (no clobber, no loss).
A.5. The conductor chat's `conductor_heartbeat.py` hook surfaces any pending `inbound_*` messages as a context prelude on each turn start.
A.6. Telegram voice note arrives, conductor receives a turn with a media URL + Deepgram transcription instruction.
A.7. `D:/.code/telegram-conductor/`, `telegram-master-state.json`, `reflex.append_to_master`, `inboundChannelBridge.js` all removed; no references remain.
A.8. `setup-telegram-bot.js` run end-to-end registers the webhook + delivers a /ping to Tate.
