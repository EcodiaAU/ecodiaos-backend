---
triggers: chat-conductor-inbox, conductor-heartbeat, conductor-heartbeat-hook, cross-chat-coord, opus-to-conductor-dispatch, whisper-to-active-conductor, inbox-filter-bug, tate-directive-via-native-app, message-type-vocabulary, inbox-prelude, opus-message-dropped-silently, allow-list-vs-deny-list, coord-bus-vocabulary, cross-tab-routing-failure, ghosted-dispatch
---

# Coord-inbox filter must be a deny-list, not an allow-list

`conductor_heartbeat.py` (UserPromptSubmit hook) reads `chat.conductor.inbox` on the local coord bus at every turn-start and emits an `<inbound_messages_pending>` prelude so the conductor handles cross-chat directives as turn context. The original filter was an allow-list - `body.type.startsWith("inbound_")` - which silently dropped every message whose sender used a different type name.

This bit hard on 2026-05-20: Opus on the VPS dispatched a perfectly-composed directive to the local inbox via `whisper_to_active_conductor`, with type `tate_directive_via_native_app`. The HTTP call landed, the file was written to `D:/.code/EcodiaOS/coordination/messages/<uuid>.json`, but the hook dropped it because the type didn't begin with `inbound_`. The conductor never saw it. Tate's request from the native app went unactioned for ~14 hours while the system narrated success.

## Rule

The filter is a **deny-list of known noise types**. Anything else is signal.

```python
NOISE_TYPES = {"idle_check", "heartbeat", "ping"}
pending = [m for m in msgs
           if (m.get("body") or {}).get("type", "").lower() not in NOISE_TYPES]
```

Add to `NOISE_TYPES` only when a specific type is verifiably noise (high volume, no actionable content). Default for any unknown type is `surface`.

## Type vocabulary contract (sender side)

Senders writing to `chat.conductor.inbox` should use one of these types so the prelude routes consistently. New types are fine - the deny-list lets them through automatically, and we can refine the prelude formatter to handle them gracefully.

| Type prefix | Sender | Purpose | Surface as |
|---|---|---|---|
| `inbound_sms` | smsWebhook | Tate via Twilio SMS | inbound chat |
| `inbound_telegram` | telegram-bot | Tate via TG bot | inbound chat |
| `inbound_native` | (future) native-webhook | Tate via iOS app (currently routes via Opus directly to inbound pipe; this type is reserved for if/when we add a second hop) | inbound chat |
| `tate_directive_via_native_app` | Opus subprocess via whisper_to_active_conductor | Tate asked the conductor to do code-shipping work; conductor escalates to me (Corazon chat) since I have full session context | high-priority directive |
| `worker_done` | dispatched worker via coord.signal_done | A worker tab finished its assigned task | follow-up |
| `tate_response_pending` | sister-chat or routine | Tate replied somewhere and we need to chain | continuation |
| `idle_check` | conductor-pacemaker.ps1 | Heartbeat tick, no content | **NOISE - dropped** |
| `heartbeat` | various | Liveness check | **NOISE - dropped** |
| `ping` | smoke tests | Connectivity probe | **NOISE - dropped** |

## Implementation contract

**Sender side** (whisper_to_active_conductor and friends): always include `body.type`. Pick the closest existing type or invent a new one - the receiver will surface it.

**Receiver side** (`conductor_heartbeat.py` + future Stop hook): deny-list filter. Surface everything except `NOISE_TYPES`. When adding to `NOISE_TYPES`, document why in the body of this pattern.

## Why this matters

The cross-chat dispatch architecture (Opus on VPS -> whisper -> chat.conductor.inbox -> heartbeat prelude -> me on Corazon) is the only sustainable path for native-app code-shipping requests. Opus has CLAUDE.md doctrine but not my session context. I have the build pipeline state + the conversation thread + the design decisions. The dispatch needs to land reliably.

Allow-lists in coord vocabulary are the failure mode equivalent of CORS misconfiguration - they fail silently, by design. The fix is to default to surface, not default to drop.

## Verification

- Send a probe message of an unknown type to `chat.conductor.inbox` via the coord MCP
- Trigger a UserPromptSubmit (any turn in any conductor chat)
- The prelude must surface the message

If it doesn't surface: the heartbeat hook is either not registered, the local coord bus is down, or the filter has regressed to an allow-list.

## Canonical hook location

Hook source: `backend/scripts/hooks/ecodia/conductor_heartbeat.py` (git-tracked).
Live deployment: `C:/Users/tjdTa/.claude/hooks/ecodia/conductor_heartbeat.py` (where Claude Code reads it).
Sync: manual copy after edits in the canonical version. See `backend/scripts/hooks/README.md` for the workflow.

## Cross-refs

- `backend/docs/specs/2026-05-19-one-conductor-many-channels.md` (parent architecture)
- `backend/patterns/one-conductor-many-channels-2026-05-19.md`
- `backend/patterns/auto-prov-picks-dev-cert-prefer-manual-distribution-2026-05-20.md`
- The dropped Opus message: `D:/.code/EcodiaOS/coordination/messages/ff6df061-1f3a-46f1-813b-02e2d47120e9.json` (preserved as evidence; surfaces on the next turn now that the filter is fixed)

## Origin

2026-05-20 morning. Tate built native iOS app (builds 1-7), used the push-to-talk in build 7 to request three UX iterations the previous night. Opus subprocess on VPS correctly composed a directive brief + dispatched via `whisper_to_active_conductor`. Heartbeat hook on Corazon dropped it because the type was `tate_directive_via_native_app` not `inbound_*`. Tate spent the morning asking "where is build 8?" until I diagnosed the filter mismatch + fixed the hook + shipped build 8 manually. The fix: change the filter from allow-list to deny-list. Codified same-turn.
