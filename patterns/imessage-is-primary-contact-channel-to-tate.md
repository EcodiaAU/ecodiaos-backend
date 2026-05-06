---
triggers: imessage-primary, imessage-canonical, imessage-absolute-primary, imessage-poll-loop, imessage-watcher, imessage-inbound, imessage-tate-channel, contact-tate-imessage, primary-contact-channel, sms-fallback-not-primary, twilio-fallback, tate-msg-skill, sy094-imessage, applescript-watcher, imessage-event-handler, imessage-webhook, sy094-applescript, kv-store-imessage-webhook, code-at-ecodia-au-imessage, apple-id-code-at-ecodia-au, contact-channel-tate, channel-discipline-tate, primary-channel-imessage-fallback-sms
---

# iMessage is the absolute primary path to contact Tate; SMS is fallback

The rule is absolute. Outbound notifications, alerts, replies, ack-messages, and any other system-originated communication to Tate go via iMessage first. Twilio SMS is the fallback substrate, fired only when the iMessage path is degraded (`kv_store.health.imessage_path.ok=false` for >12h) or when `USE_IMESSAGE_PRIMARY=0`. Inbound messages from Tate's phone arrive as iMessage; SMS inbound continues to land on `/api/sms/incoming` and is treated as fallback signal.

## Origin

Tate verbatim 2026-05-06 08:08 AEST replying to `fork_mouly6nb_7498ab`'s ack:

> "Oh my goshhhhhh. Now we need to codify this as the absolute primary path to contact me via | We also need to set up system to help you see and respond here as easily as possible"

This supersedes the prior framing in `~/CLAUDE.md` "Contact channel to Tate (iMessage primary, SMS fallback)" which described iMessage as primary in a softer, "as of 4 May 2026" way. Tate elevated it on 6 May 2026 from "primary, with SMS as the comparable fallback" to "absolute primary canonical, with SMS as a degraded fallback only".

The prior pattern `~/ecodiaos/patterns/sms-segment-economics.md` and `~/ecodiaos/patterns/sms-one-update-per-fix-not-running-commentary.md` REMAIN IN FORCE for the SMS fallback path (cost-per-segment is real when the fallback fires) and should also be applied to iMessage cost-discipline thinking even though iMessage is $0 - the brevity discipline is a quality bar, not just a billing constraint.

## What changed substrate-wise (6 May 2026 ship)

Inbound has historically been the gap: outbound iMessage send via `skills/tate-msg/index.js sendImessage()` worked since 4 May 2026, but inbound messages from Tate's phone required Tate to RDP into SY094 himself or for a fork to drive Corazon RDP into SY094 (~30 tool calls + 17min idle timeout per roundtrip) — unsustainable as the canonical channel.

Shipped 6 May 2026 by `fork_moum5ry1_25c72b` (status_board `f5589865`):

- `src/routes/imessageInbound.js` — Express router mounted at `/api/imessage/inbound` and `/api/imessage/health-ping`. HMAC-validated. On every iMessage from a Tate handle, upserts a P1 status_board row keyed `imessage_tate_inbound_unread` AND posts a brief to `/api/os-session/message` (priority:false, queues behind active turn).
- `src/middleware/validateImessageSignature.js` — HMAC-SHA256 validator with 5-min replay window. Secret in `kv_store.imessage.webhook.hmac_secret`.
- `scripts/sy094-imessage-watcher.applescript` — Messages.app event handler. Three event hooks: `message received`, `active chat message received`, `chat room message received`. Filters to Tate handles, HMAC-signs payload, POSTs to `https://api.admin.ecodia.au/api/imessage/inbound` via curl.

The watcher requires one-time SY094-side install via RDP (Tate-action; substrate is doctrine-clean — no SSH, no Tailscale-on-SY094, no inbound port). Steps documented in the AppleScript header. Once installed, latency Tate-typed → conductor-aware ≤5s.

## What to do

- **Outbound to Tate**: call `require('skills/tate-msg').sendImessage(body, opts)`. Twilio fallback handled inside `osAlertingService._sendIMessage`/`_sendTwilio` — caller need not branch. `USE_IMESSAGE_PRIMARY` env defaults `1` (on); set `0` only for explicit Twilio-only mode.
- **Inbound from Tate**: don't poll Messages.app. The watcher pushes; the receiver enqueues. Read `kv_store.ceo.tate.last_imessage_seen` and `status_board WHERE entity_ref='imessage_tate_inbound_unread'` to see the latest unread. Archive the row when the reply ships (responsibility of whichever fork sends the reply).
- **Replying**: every conductor turn that sees an `imessage_tate_inbound_unread` row should: (a) read it, (b) respond via `sendImessage()`, (c) archive the row in the same turn or the next. Don't let it sit.
- **Surfacing in chat**: the receiver posts the inbound to `/api/os-session/message` with `priority:false`, which means the conductor sees the iMessage as a regular user message AFTER the active turn finishes. This is the same queue model SMS inbound uses.

## What not to do

- Don't reach for Twilio when iMessage is healthy. Cost: $0.05/segment vs $0. Quality: Tate's iPhone shows the green-bubble degradation visibly.
- Don't poll Messages.app over SSH. SSH on SY094 is forbidden absolutely per `~/ecodiaos/patterns/never-use-ssh-on-macincloud-rdp-only.md`.
- Don't poll `chat.db` from VPS. SY094 is not on Tailscale; the only path that could work there (eos-laptop-agent HTTP API) is unreachable from VPS today. The watcher-push substrate is what works.
- Don't write a parallel inbound webhook. There is exactly one: `/api/imessage/inbound`.
- Don't disable `USE_IMESSAGE_PRIMARY` casually. The fallback exists for outage handling, not cost optimization (iMessage is free).

## Verification protocol

1. **Substrate live**: `curl -s https://api.admin.ecodia.au/api/imessage/health-ping -X POST` returns 401 (HMAC missing) — proves route mounted and middleware fires.
2. **Outbound healthy**: `kv_store.health.imessage_path.ok = true` (canary writes every 6h via `imessagePathHealthCheck.js`).
3. **Inbound watcher alive**: after one-time install, every test message Tate sends produces:
   - `kv_store.ceo.tate.last_imessage_seen` updated within ~5s
   - `status_board` row `entity_ref='imessage_tate_inbound_unread'` upserted
   - `/api/os-session/message` enqueued (visible as next-turn user message in conductor stream)
4. **Watcher heartbeat**: `kv_store.imessage.watcher.last_heartbeat` (written by `/api/imessage/health-ping`). If absent for >24h after install, watcher is silent — RDP in and check Messages.app preferences.

## Failure modes and recovery

| Symptom | Likely cause | Recovery |
|---|---|---|
| `health.imessage_path.ok=false` for >12h | SY094 RDP session closed → Messages.app not running, OR Apple ID code@ecodia.au signed out | RDP into SY094, re-launch Messages.app, re-sign-in if needed |
| Tate sends iMessage, no status_board row appears | AppleScript watcher not registered, OR secret file missing/wrong, OR HMAC mismatch | RDP into SY094, verify `~/Library/Application Scripts/com.apple.iChat/sy094-imessage-watcher.scpt` exists, verify Messages.app Settings → General → "Run AppleScript when message received" points at it, verify `~/.imessage-webhook-secret` matches `kv_store.imessage.webhook.hmac_secret`. Check `~/.imessage-watcher.log` for errors. |
| Receiver returns 401 with valid signature | Replay window exceeded (SY094 clock drift >5min) | Sync SY094 clock via `sudo sntp -sS time.apple.com` inside RDP terminal |
| Inbound shows in status_board but conductor never replies | conductor active turn never finished, OR post to `/api/os-session/message` failed silently | Check `logger.error('imessage-inbound: os-session enqueue failed', ...)` lines in `pm2 logs ecodia-api`. Cold-start orientation will pick up the row. |
| Tate-handle filter drops a known handle | Apple's internal handle for Tate has changed format | Update `kTateHandles` in both `imessageInbound.js` and `sy094-imessage-watcher.applescript` |

## Cross-references

- `~/ecodiaos/skills/tate-msg/index.js` — outbound iMessage send (live since 4 May 2026)
- `~/ecodiaos/src/services/imessagePathHealthCheck.js` — outbound canary
- `~/ecodiaos/src/services/osAlertingService.js` — fallback wiring (iMessage → Twilio)
- `~/ecodiaos/patterns/never-use-ssh-on-macincloud-rdp-only.md` — RDP-only canonical access path for SY094 install steps
- `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` — verified 23.6s recipe for entering SY094 via Corazon
- `~/ecodiaos/patterns/code-at-ecodia-au-is-only-google-workspace-and-claude-max.md` — Apple ID code@ecodia.au is the iMessage handle
- `~/ecodiaos/patterns/sms-segment-economics.md` — SMS cost discipline for the Twilio fallback path
- `~/ecodiaos/patterns/sms-one-update-per-fix-not-running-commentary.md` — one-update-per-fix discipline (applies to iMessage too)
- `~/ecodiaos/docs/secrets/macincloud.md` — SY094 access metadata (RDP-only)
- status_board row `f5589865-6199-49df-8fbb-3f034c5565f1` — primary tracker for this substrate ship
- status_board row `b2b67296-387c-4f6c-b9d4-8a24a3b28ec7` — TCC grant prerequisite for any GUI macro on SY094 (NOT required for the AppleScript watcher path - that runs inside Messages.app's own context)

## Anti-patterns

- "I'll just text Tate via SMS, it's faster". No. iMessage hits him on every device, costs $0, has read receipts, and is canonical per Tate's directive. SMS only when iMessage degraded.
- "I'll add a second cron that polls chat.db over the existing SSH path in tate-msg/index.js". No. SSH is forbidden, and the watcher-push substrate is already shipped. Don't add a parallel path.
- "I'll make the receiver public (no HMAC)". No. The endpoint is on a public TLS host; without HMAC any internet attacker can spoof Tate. The HMAC secret + 5-min replay window is mandatory.
- "I'll just `pm2 restart ecodia-api` after committing". No. Restart kills the conductor session. Nightly 03:00 AEST restart picks up new code per `~/ecodiaos/patterns/no-pm2-restart-during-active-factory-queue.md` and standing operational doctrine.

## Doctrine-write surface

Update `~/CLAUDE.md` "Contact channel to Tate (iMessage primary, SMS fallback)" section to reference this pattern as the canonical doctrine and shift the wording from "iMessage is the primary outbound contact channel" to "iMessage is the absolute primary contact channel (inbound and outbound); Twilio SMS is fallback only". Cross-ref this file. Done in the same fork that ships the substrate, so the doctrine and the substrate land together (per `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`).
