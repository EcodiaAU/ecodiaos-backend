---
name: session-subscription-via-coord-inbox-routing-2026-05-18
description: Inbound SMS and Telegram messages route into the active conductor's coord inbox when one is registered with fresh heartbeat. Only cold-spawn a new CC tab when no active conductor exists. Closes the "new chat every text" failure.
triggers: session-subscription, inbound-sms-routing, inbound-telegram-routing, tab-accumulation-fix, conductor-heartbeat, coord-inbox-routing, reflex-fallback, inbound-channel-bridge, sms-into-existing-chat, telegram-into-existing-chat, debounce-vs-subscribe, conductor-freshness, last_seen_at, no-new-tab-per-text
status: active
---

# Inbound chat messages route into the active conductor, not a new tab

Per Tate verbatim 2026-05-18: "opening a new chat every time does NOT work. We need... a chat is opened on the first text I send per session... then subscribes to further texts, then maybe unsubscribes at the end once it's done."

The fix is NOT a new subscription primitive. It's using the coord bus + wake substrate that already exist: when a tab is the registered conductor and heartbeating, inbound webhooks route to its inbox instead of spawning a fresh CC tab.

## The rule

For every inbound chat channel (SMS, Telegram, future iMessage, future voice transcript):

1. **The webhook MUST first call `inboundChannelBridge.routeInbound(...)`**.
2. **If the bridge returns `routed: true`**, the webhook stops. The conductor receives the message via its `chat.conductor.inbox` coord topic, and the wake substrate (toast / flash / auto_type) surfaces it.
3. **If the bridge returns `routed: false`**, fall back to the existing path (`reflex.fire` for SMS, `reflex.append_to_master` for Telegram). The cold-spawned tab will register itself as conductor on its first turn-start (via the conductor_heartbeat hook).

## Component breakdown

- **`backend/src/services/inboundChannelBridge.js`** - the bridge module. Probes `coord.get_conductor_state` over HTTP. If `is_active: true` (registered AND heartbeated within 30min), routes via `coord.send_message {to: 'chat.conductor.inbox', body: {type: 'inbound_sms'|'inbound_telegram', from, body, ...}}`. Otherwise returns `routed: false`.

- **`coord.js` extensions (2026-05-18)**:
  - `last_seen_at` field on conductor registration (updated on register + heartbeat).
  - `coord.conductor_heartbeat` tool - called by Corazon UserPromptSubmit hook each turn.
  - `loadActiveConductorRegistration` - returns null if `last_seen_at > 30min` (stale).
  - `is_active` field on `coord.get_conductor_state` response.
  - Default wake-policy `notify_types` extended with `inbound_sms` + `inbound_telegram`.

- **`~/.claude/hooks/ecodia/conductor_heartbeat.py`** - UserPromptSubmit hook. On every turn-start: if no active conductor, register THIS tab; else send heartbeat. Reads bearer from `.mcp.json` coord block.

## Why this works

The wake substrate (`wakeConductor` in `coord.js`) already toast/flashes when a coord message arrives at a `chat.conductor.*` topic with a matching `body.type` in the policy. Adding `inbound_sms` + `inbound_telegram` to the default `notify_types` is the entire UX hookup - no AHK macro changes needed.

When a tab is heartbeating, it's THE conductor; inbound messages surface in its prelude via the wake-substrate + the existing inbox-read pattern. When the tab is closed or idle >30min, the heartbeat goes stale, the next inbound falls back to a fresh reflex.fire spawn, and the new tab registers itself on its first turn.

The "subscribe / unsubscribe" mechanic Tate described is implicit:
- "Subscribe" = `register_conductor` (auto-fired on first turn-start by the hook).
- "Stay subscribed" = `conductor_heartbeat` (auto-fired on every turn-start).
- "Unsubscribe" = the heartbeat going stale 30min after last turn (auto), OR `unregister_conductor` (explicit, can be wired into "I'm done" signals later).

No new subscription tables. No debounce window. No new MCP primitives. Just `last_seen_at` + a hook + a bridge.

## Verification protocol

After ship:
1. Open a fresh CC tab. Check `coord.get_conductor_state` returns `is_active: true` after the first prompt.
2. Send a Telegram message from Tate. Expected: bridge logs `routed: true` + the existing tab flashes/toasts. NO new `telegram-conductor` workspace window opens.
3. Close the tab. Wait 30min. Send another message. Expected: bridge logs `routed: false reason: conductor_stale`, reflex.fire spawns a fresh tab.
4. Repeat send while the new tab is alive. Expected: routed:true into the new tab.

## Failure modes

- **Hook fails to send heartbeat** (Python error, agent down): conductor goes stale on its own freshness window even while the tab is active. Side effect: inbound goes to a NEW tab. Recovery: tab still works, the next manual prompt re-registers. Acceptable.
- **Wake substrate misfires** (laptop-agent crashed): bridge succeeds (writes to inbox), but no visible alert. Recovery: tab still reads the inbox on next prompt via the existing `<chat_conductor_inbox>` continuity block. Tate sees the message on his next interaction.
- **Bridge HTTP timeout** (3s): falls back to reflex.fire. Tab spawn happens, mild UX regression on that one message.

## Doctrine cross-refs

- [[conductor-wake-substrate-2026-05-18]] (the toast/flash/auto_type substrate this rides on)
- [[conductor-wake-on-coord-inbox-write-2026-05-18]] (sibling wake-trigger doctrine)
- [[coord-conventions-heartbeat-signal-done-2026-05-18]] (heartbeat conventions for workers, now extended to conductor)
- [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]] (the other-direction coord usage)

## Origin

Tate verbatim 2026-05-18: "openeing a new chat every time does NOT work. We need... a chat is opened on the first text I send per session... then subscribes to further texts, then maybe unsubscribes at the end."

Architecture chosen 2026-05-18 evening. The `telegram-conductor` workspace + `reflex.append_to_master` approach (shipped 2026-05-16) was the first attempt - it used AHK to focus an existing window and paste. That broke whenever Tate closed the dedicated workspace window (every fire would re-seed a fresh window). The coord-bus inbox approach has none of that fragility because the wake substrate is window-agnostic.
