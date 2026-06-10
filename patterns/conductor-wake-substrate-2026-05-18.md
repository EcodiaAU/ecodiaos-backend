---
triggers: conductor-wake, wake-substrate, wake-policy, conductor-toast, conductor-flash, auto-type-wake, register-conductor, set-wake-policy, wake-on-signal-done, shallow-poll-anti-pattern, autonomous-handoff, worker-to-conductor-handoff, notify-conductor-on-done, coord-wake
---

# Conductor wake substrate - `coord.register_conductor` + `wakeConductor()` hook

When a worker `coord.signal_done`s, the conductor (a Claude Code chat tab) needs to know NOW, not next time a human looks. Without a wake hook, signal_done writes to `chat.conductor.inbox` at the filesystem and sits there until something polls. The conductor is a model-driven chat tab with no daemon - it can't poll itself.

The wake substrate fixes this. Every `persistMessage()` targeting a `chat.conductor.*` topic fires a non-blocking `wakeConductor(msg)` that surfaces the message via toast (always) + flash (if registered + policy says so) + auto-type-into-chat (if explicitly opted in).

This solves the "I dispatched a worker, it signaled done, I never noticed" failure I had on 2026-05-18 night (codified in [[coord-conventions-heartbeat-signal-done-2026-05-18]] anti-pattern section).

## When to reach for it

- **Always register a conductor at session start** if you're going to dispatch workers in this session. One call: `coord.register_conductor({ide: 'cursor', title_match: 'backend - Cursor'})`. Probes foreground at register-time if you don't provide title_match.
- The wake fires automatically on `signal_done` / `error` (configurable). You don't have to opt-in per dispatch.
- If you want the wake to be hard-to-miss for ambient autonomous runs, `set_wake_policy({mode: 'flash'})`. Default `toast` mode works but can be silently dropped by Windows on some configs.

## Tools

- `coord.register_conductor({ide?, title_match?, hwnd?, exe?, tab_id?})` - register THIS chat tab as the conductor target. Persists to `coordination/conductors/default.json` (v1: single global conductor).
- `coord.unregister_conductor({tab_id?})` - remove the registration.
- `coord.get_conductor_state()` - read current conductor row + wake policy + last_wake_at.
- `coord.set_wake_policy({mode?, notify_types?, toast_duration_ms?, rate_limit_ms?})`:
  - `mode`: `toast` | `flash` | `auto_type` | `silent`
  - `notify_types`: array of body.type values that trigger wake (default `['done', 'error']`; `'*'` = all)
  - `toast_duration_ms`: 1500-15000, default 6000
  - `rate_limit_ms`: 0-60000, default 2000 (suppresses consecutive wakes within window)

## Wake tiers (cumulative based on mode)

| Mode | Toast | Flash window | Auto-type into chat |
|---|---|---|---|
| `silent` | ❌ | ❌ | ❌ |
| `toast` (default) | ✅ | ❌ | ❌ |
| `flash` | ✅ | ✅ (conductor registered) | ❌ |
| `auto_type` | ✅ | ✅ | ✅ (steals focus + types) |

Auto-type is the only mode that focus-steals. Use only when Tate is genuinely going to be away (autonomous overnight runs); never during interactive sessions.

## Built-in safety: notify_types filter + rate limit

- `progress` messages do NOT wake by default. They're for inline reporting, not interruption.
- `done` / `error` wake by default. These are the load-bearing handoff signals.
- Two consecutive wakes within `rate_limit_ms` are suppressed (in-memory counter). Stops a burst of N worker completions from N toasts.

## Wake fires for ANY `chat.conductor.*` topic

`WAKE_TOPIC_PREFIXES = ['chat.conductor.']`. So `chat.conductor.inbox` wakes, and any future `chat.conductor.<scope>.inbox` topics wake too. Worker scratch topics (`chat.<tab_id>.scratch`) do NOT wake.

## Worked example - autonomous dispatch + reactive wake

```bash
# Conductor session start (one-time):
curl -X POST http://localhost:7456/api/tool \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"tool":"coord.register_conductor","params":{"ide":"cursor","title_match":"backend - Cursor"}}'

# Optional: switch to flash mode (more visible than toast)
curl -X POST http://localhost:7456/api/tool \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"tool":"coord.set_wake_policy","params":{"mode":"flash"}}'

# Dispatch worker - return immediately, no need to long-poll
curl -X POST http://localhost:7456/api/tool \
  -d '{"tool":"cowork.dispatch_worker","params":{"ide":"cursor","task_id":"foo","brief":"..."}}'

# ... go do other work ...

# When worker signal_done's, conductor window flashes + toast fires.
# Tate sees it ambient + the conductor can coord.read_inbox at leisure.
```

## Don't

- Don't dispatch a worker and then shallow-poll `coord.read_inbox` every 8 seconds in a bash loop. That's the failure mode this substrate exists to prevent. Either use `coord.wait_for_inbox` (long-poll, programmatic) OR rely on wake (reactive, ambient).
- Don't set mode=auto_type during interactive sessions. Focus-steal mid-Tate-typing = chaos.
- Don't add new wake topic prefixes lightly. The wake substrate is built around `chat.conductor.*` specifically - workers writing to their own `.scratch` topics should NEVER wake.
- Don't forget to register a conductor at session start. Without registration, only toast tier fires (no flash, no auto-type). Useful but blunt.
- Don't expect wake to fire if `notification.toast` silently fails (Windows toast registration is flaky on some configs). If you need guaranteed wake, use `mode: flash` so the always-on `notification.flash_window` path runs too.

## Implementation

- [tools/coord.js](D:/.code/eos-laptop-agent/tools/coord.js) - `wakeConductor()`, `buildWakeNotice()`, `shouldWake()`, `isWakeTopic()`, `loadConductorRegistration()`, `loadWakePolicy()`, the 4 tool handlers
- [routes/mcpCoord.js](D:/.code/eos-laptop-agent/routes/mcpCoord.js) - MCP shim entries for the 4 new tools (`coord.register_conductor`, `coord.unregister_conductor`, `coord.get_conductor_state`, `coord.set_wake_policy`)
- `coordination/conductors/default.json` - persisted registration
- `coordination/wake_policy.json` - persisted policy

## Origin

2026-05-18 ~14:00 AEST. OC shipped the wake substrate after my "didn't see signal_done because shallow-polling" failure earlier in the session ([[coord-conventions-heartbeat-signal-done-2026-05-18]] section "Conductor anti-pattern: shallow polling instead of long-poll"). End-to-end verified by OC's smoke tests (wake-smoke-2026-05-18-A done, smoke-progress correctly NOT firing, smoke-error-C done+flash) + my own end-to-end smoke.

Pairs with [[conductor-wake-on-coord-inbox-write-2026-05-18]] (the inbox-write trigger angle on this same mechanism, with Tate's verbatim origin), [[dispatch-worker-is-0th-class-coord-primitive-2026-05-18]] (the dispatch primitive this wakes for), [[coord-conventions-heartbeat-signal-done-2026-05-18]] (the worker-side protocol), and [[reference-coord-bus-local-2026-05-18]] (the substrate underneath).
