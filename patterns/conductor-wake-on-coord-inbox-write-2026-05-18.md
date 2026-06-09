---
triggers: conductor-wake, wake-hook, signal_done-never-wakes, coord-inbox-write, file-backed-inbox-stale, persistMessage-side-effect, register-conductor, set_wake_policy, notification-toast-wake, conductor-tab-notification, autonomous-handoff, worker-done-signal-lost, coord-message-no-pickup, never-awakened, chat-conductor-inbox-prefix, conductor-self-register, wake-policy-mode, parent-conductor-tab-id
---

# Conductor wake on `chat.conductor.*` inbox writes

`coord.signal_done` writes to `/Users/ecodia/.code/ecodiaos/coordination/messages/<id>.json` and to the inbox index for `chat.conductor.inbox`. The conductor is a Claude Code chat tab. CC tabs have no background loop polling the coord inbox - they wake only on user input. Without a wake hook, every `signal_done` message sits on disk until a human happens to prompt the conductor tab. Autonomous worker → conductor handoff is broken.

Origin: Tate verbatim 2026-05-18 ~13:35 AEST: "you reported done… it shouldve actually sent a message to the chat or something shouldnt it? Otherwise itll never be awakened again." Authored same turn (see [[codify-at-the-moment-a-rule-is-stated-not-after]]).

## Architecture

Three-tier wake, configurable via `coord.set_wake_policy`:

- **Tier A: toast** - `notification.toast` fires on every wake-eligible message. Visible without focus-stealing. Falls back from BurntToast → NotifyIcon balloon → `msg.exe`. Always on (unless mode=silent).
- **Tier B: flash** - `notification.flash_window` flashes the registered conductor window's taskbar icon. Non-focus-stealing attention grab. Requires `coord.register_conductor` first.
- **Tier C: auto_type** - focuses the registered conductor window, pastes a wake message into chat input, presses Enter. **Focus-stealing.** Opt-in only (`mode=auto_type`). Skipped if the conductor window is already foreground (no need to wake).

The hook is wired into `persistMessage()` in `tools/coord.js`. After the write + inbox-index update, if the message topic starts with `chat.conductor.` and the body type is in `wake_policy.notify_types`, `wakeConductor(msg)` fires under `setImmediate` so the persist call returns immediately. Errors inside the wake path are swallowed - wake is best-effort, the message write must succeed under all conditions.

## Public surface (5 new MCP tools on `/api/mcp/coord`)

- `coord.register_conductor({ide?, title_match?})` - one-time registration of THIS Claude Code tab as the conductor. Captures the foreground window title if `title_match` is omitted. Call once per tab spin-up + after IDE relaunch or window-title change.
- `coord.unregister_conductor()` - remove registration. Toast still fires (no dependency on registration) but flash + auto_type are skipped.
- `coord.get_conductor_state()` - read the registered conductor + active wake policy + last-wake timestamp. Diagnostic / preflight.
- `coord.set_wake_policy({mode, notify_types?, toast_duration_ms?, rate_limit_ms?})` - configure. Defaults: `mode=toast`, `notify_types=['done', 'error']`, `toast_duration_ms=6000`, `rate_limit_ms=2000`.

`coord.signal_done` now also stamps `parent_conductor_tab_id` onto the message body (read from the worker row). v1 wake uses the single registered conductor regardless; v2 will route per-conductor when multi-conductor topology lands.

`cowork.dispatch_worker` auto-stamps `parent_conductor_tab_id` from the registered conductor when the caller omits it. The dispatched worker's row records WHO dispatched it.

## Wake-topic filter

`WAKE_TOPIC_PREFIXES = ['chat.conductor.']`. Prefix-match so `chat.conductor.inbox` AND any future `chat.conductor.<scope>.inbox` both wake. Other topics (worker inboxes, scratch topics, telemetry) never trigger wake - they have their own consumers.

## Notify-types filter

`body.type` discriminates. Defaults to `['done', 'error']`. Set to `['*']` for all (test mode), or `['done', 'error', 'progress']` if the conductor wants progress streaming (will flood). Free-form messages with no `body.type` field never wake (treated as noise).

Rationale: `progress` messages from active workers fire many times per task; toasting each one is unusable. `done` is the single load-bearing wake - exactly when the conductor needs to act.

## Rate limit

`rate_limit_ms` (default 2000) suppresses consecutive wakes within the window. Prevents toast spam when multiple workers `signal_done` near-simultaneously. In-memory only (resets on agent restart). Set to 0 to disable.

## When to set `mode=auto_type`

When you actually want the conductor's chat to receive the wake message INTO its input box and submit it. Use cases:

- Long autonomous loops where Tate is not at the keyboard and you want a worker's done-signal to immediately re-engage the conductor.
- Headless overnight runs.

Anti-cases:

- Any time Tate is actively driving the conductor or another tab - focus-collision per [[cowork-no-focus-collision]]. Defaults to skipping the type if the conductor window is already foreground (no need to wake), but still steals focus from whatever other window Tate may be in.
- High-churn message paths (set `notify_types=['done']` first to narrow what triggers auto-type).

## Verification

```bash
TOK=$(cat ~/.ecodiaos/laptop-agent.token)
# Register THIS tab as conductor (captures foreground title)
curl -s -X POST http://localhost:7456/api/tool -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"tool":"coord.register_conductor","params":{"ide":"cursor"}}'
# Fire a smoke wake
curl -s -X POST http://localhost:7456/api/tool -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"tool":"coord.send_message","params":{"to":"chat.conductor.inbox","body":{"type":"done","task_id":"smoke","result_summary":"if you see this toast, wake hook works"},"task_id":"smoke"}}'
# Read last-wake state
curl -s -X POST http://localhost:7456/api/tool -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"tool":"coord.get_conductor_state","params":{}}'
```

## Don't

- Don't make wake blocking on persistMessage. The write must succeed under memory pressure / dead PS daemon / broken notification path. Wake is fire-and-forget via `setImmediate`.
- Don't make Tier B / Tier C auto-active by default. Toast-only is the safe default. Flash and auto_type are opt-in.
- Don't widen `WAKE_TOPIC_PREFIXES` to all topics - worker inboxes have their own poll-based readers, telemetry has its own subscribers. Only `chat.conductor.*` warrants wake.
- Don't ack the wake message inside the hook. Wake is a side-effect; ack is the conductor's job after acting on the message.

## Implementation

- `tools/coord.js`: state load/persist for `coordination/conductors/default.json` + `coordination/wake_policy.json`; `wakeConductor(msg)`; new tool handlers `register_conductor`, `unregister_conductor`, `get_conductor_state`, `set_wake_policy`; hook inside `persistMessage()`.
- `routes/mcpCoord.js`: 4 new entries in the MCP `TOOLS` list (routes to coord module by default - no `USAGE_TOOLS` whitelist entry needed).
- `tools/cowork.js`: `dispatch_worker` auto-stamps `parent_conductor_tab_id` from registered conductor when caller omits it; `signal_done` includes `parent_conductor_tab_id` in the message body.

Restart required after edits - Node require-cache holds the module. See [[eos-laptop-agent-module-cache-requires-restart-after-handler-swap]]. Restart via `D:\.code\eos-laptop-agent\restart-detached.ps1`.

## Future (v2)

- Multi-conductor routing: wake reads `msg.body.parent_conductor_tab_id` and dispatches to the matching conductor row (file already keyed by tab_id). Today: single global `default.json`.
- Conductor heartbeat: optional `coord.conductor_heartbeat` so dead conductor tabs auto-unregister. Today: registration persists indefinitely; stale registrations gracefully degrade (toast still fires, flash/auto_type silently fail when window not found).
- Wake-on-paste: workers that need a response could ALSO write to `chat.conductor.inbox.priority` (separate topic, separate rate limit). Today: single inbox.

Pairs with [[conductor-wake-substrate-2026-05-18]] (the wakeConductor() mechanism this inbox-write trigger fires), [[gui-sequence-composition-primitives-wait-for-and-branch-2026-05-18]], [[ps-daemon-long-lived-powershell-for-gui-substrate-2026-05-18]], [[gui-substrate-beast-mode-2026-05-17]], [[cowork-no-focus-collision]].
