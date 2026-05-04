---
triggers: imessage-tate, send-imessage, message-tate-free, sms-fallback-imessage, tate-msg, tate-im, sy094-messages-app, applescript-messages, osascript-imessage, primary-contact-channel, twilio-fallback, free-text-tate, low-cost-ping-tate
validation_status: untested_spec
---

# Recipe: Send iMessage to Tate via SY094

## Goal

Send a one-line message from EcodiaOS to Tate's phone (`+61404247153`) for $0 using the Messages.app instance running on SY094 (signed into the `code@ecodia.au` Apple ID), with Twilio SMS as the cost-bearing fallback if iMessage delivery fails.

## Prerequisites

- **SY094 reachable via SSH on Tailscale.** Probe: `sshpass -p $PASS ssh -o ConnectTimeout=5 user276189@SY094.macincloud.com 'echo OK'` returns "OK". Recovery if fails: SY094 is offline or MacInCloud lapsed - check `kv_store.creds.macincloud` for renewal status, fall back to Twilio.
- **Messages.app process running on SY094.** Probe: `pgrep -lf "Messages.app"` lists at least one process. Recovery if fails: the GUI session went stale or Messages was force-quit. Run `~/ecodiaos/recipes/recover-messages-app-on-sy094.md` (which routes through VNC because GUI app launches require an active aqua session, see Troubleshooting).
- **Messages.app signed into `code@ecodia.au` Apple ID with iMessage activated.** Probe: `osascript -e 'tell application "Messages" to get name of (1st service whose service type is iMessage)'` returns a service name (NOT error -10810). Recovery if fails: Tate VNCs in once + signs in + activates iMessage on this Mac (one-time setup).
- **Tate's phone `+61404247153` is iMessage-eligible.** Probe is implicit (the send call returns no error). Recovery if fails: Apple has flipped him off iMessage for some reason - falls through to SMS automatically.

## Substrate

- SSH to SY094 via Tailscale-reachable hostname `SY094.macincloud.com` (port 22), creds at `kv_store.creds.macincloud` (single targeted read; the row contains agent_token + ssh password + agent metadata - read once, do not echo, do not enumerate).
- AppleScript via `osascript -e` over the SSH stream.
- Twilio fallback: `mcp__sms__send_sms` (cost ~$0.05/segment AUD; reserve for true delivery failures).

## Steps

### 1. Fetch SSH password (single read, no echo)

**Action:** `db_query SELECT value FROM kv_store WHERE key='creds.macincloud'` then parse the JSON for `password`. Pipe to env var `SSHPASS`. Never echo to stdout.

**Expected:** non-empty password string.

**Fallback:** kv_store row missing - escalate to Tate (the cred itself isn't recoverable from the conductor).

### 2. Reachability probe

**Action:** `sshpass -e ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o PubkeyAuthentication=no user276189@SY094.macincloud.com 'echo OK'`

**Expected:** stdout contains "OK", exit 0, stderr empty.

**Fallback:** SY094 unreachable. Skip iMessage path entirely, use Twilio fallback (Step 5b).

### 3. Verify Messages.app + iMessage service alive

**Action:** Same SSH session: `pgrep -lf "Messages.app" && osascript -e 'tell application "Messages" to count services'`

**Expected:** pgrep lists Messages process. osascript returns a positive integer.

**Fallback:**
- If pgrep empty: GUI session is stale. Use `~/ecodiaos/recipes/recover-messages-app-on-sy094.md` to recover, OR fall through to Step 5b (Twilio).
- If osascript returns -10810: GUI session inactive but Messages process exists. Same recovery as above.

### 4. Send iMessage

**Action:** `osascript -e 'tell application "Messages" to send "<message body>" to buddy "+61404247153" of (1st service whose service type is iMessage)'`

Quote the message body for shell + AppleScript. Newlines in the body need to be escaped as `\n`. Keep under 1000 chars to stay polite.

**Expected:** osascript exits 0, stderr empty.

**Fallback:** Capture stderr. Common errors:
- `-1719`: "Some objects no longer exist" - Tate's number isn't in Messages' iMessage cache. Try once more after `osascript -e 'tell application "Messages" to refresh services'`. If still fails, use Twilio.
- `-10810`: GUI session went stale between Step 3 and Step 4. Restart from Step 3.
- network timeout: same as above.
- Any other error: log full stderr, fall to Step 5b.

### 5a. Success path - record send

**Action:**
- Append to `kv_store.tate_msg.last_send_log`: `{at, body_preview, channel: 'imessage', sy094_proc_uptime}`
- Skip Twilio entirely.

### 5b. Failure path - Twilio fallback

**Action:** Call `mcp__sms__send_sms` with the same body and recipient. Apply normal segment-economics + dedupe + 24h-rate-cap rules per `~/ecodiaos/patterns/sms-segment-economics.md`. Append to `kv_store.tate_msg.last_send_log` with `channel: 'twilio_sms_fallback'` + `imessage_failure_reason: <stderr>`.

**Expected:** SMS SID returned.

**Fallback if Twilio also fails:** raise P1 status_board row "Tate-msg both channels failed - <details>". Do not retry in a loop (anti-flood per `~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md`).

## Success criteria

- iMessage path: osascript exited 0 AND `kv_store.tate_msg.last_send_log` updated.
- Twilio fallback: SMS SID returned AND log updated with fallback channel.
- The recipe does NOT verify Tate's eyes-on-message receipt (no read receipts available headless). The substrate-level "send accepted" signal is the success boundary.

## Troubleshooting

- **Recurring -10810 / "Messages.app cannot be opened":** the macOS launchd RBSRequestErrorDomain code 125 surface ("Domain does not support specified action") - GUI apps can't bootstrap from SSH-only sessions on macOS. Tate must VNC into SY094 once to establish an active aqua session, then `open -a Messages` works for the lifetime of that session. MacInCloud sessions usually persist across VNC disconnects in the user's plan, but if the Mac reboots Tate has to VNC back in once to re-launch Messages.
- **Tate ID not in Messages contacts:** Messages.app caches buddy lookups; if `+61404247153` was never typed into a conversation it might not be in the iMessage service's buddy list. One-time fix: VNC in, type the number into a New Message conversation manually, send hi, close. From then on the buddy is cached.
- **iMessage activation pending:** Apple takes up to 24h to fully activate a new iMessage handle on a new Mac. If sends silently drop during this window, Twilio fallback covers the gap. After activation completes, fallback rate should drop to ~0.
- **Code@ Apple ID 2FA pop-up:** Apple periodically asks for re-verification. If a 2FA dialog is sitting on screen, Messages.app might be blocked. VNC in, dismiss the dialog, sign back in if needed.

## Origin

4 May 2026 18:30-18:52 AEST cluster of Tate SMS messages:
- 17:46 AEST: "Ooooo true macincloud can give us text for free right? since we own the phone number?"
- 18:30 AEST: "do evehting you need for that to be now the main and fully miplemented way of contacting me, and we'll do sms fallback as well so its more reliable sending right?"
- 18:46 AEST: "YOu've alread ygot a code@ apple id..."
- 18:52 AEST: "we need to teach you where to go, where to click, what to type, eveything for each task - such as logging into the macnincloud gui so that you can ipen the messages app and text me whenevr you need to, really easily"

Cost-driver: 22 identical "[SECURITY] credential_redaction_burst" SMS fired in one hour during today's earlier work (~$1.10 wasted). Twilio segment economics + the security-incident-SMS gate fix shipped in commit a91f08f reduce the bleed risk going forward, but iMessage primary collapses the steady-state cost to $0.

This recipe is the first concrete artefact of the recipes-not-macros architecture decision (`~/ecodiaos/recipes/README.md`).

## Cross-references

- `~/ecodiaos/recipes/README.md` - the recipe-format spec.
- `~/ecodiaos/recipes/recover-messages-app-on-sy094.md` - the GUI-session recovery recipe (TBD; written when first hit).
- `~/CLAUDE.md` line 204 - the three-vendor doctrine for code@ecodia.au.
- `~/ecodiaos/patterns/sms-segment-economics.md` - Twilio segment cost model for the fallback path.
- `~/ecodiaos/patterns/sms-one-update-per-fix-not-running-commentary.md` - sibling cost-discipline rule applied even when channel is iMessage.
- `~/ecodiaos/patterns/cowork-cannot-enter-credentials-or-pass-sensitive-action-gates.md` - why Cowork doesn't replace this path.
- `kv_store.creds.macincloud` - SSH credentials.
- `kv_store.creds.apple` - Apple Developer team metadata (for context, not used by this recipe at runtime).
