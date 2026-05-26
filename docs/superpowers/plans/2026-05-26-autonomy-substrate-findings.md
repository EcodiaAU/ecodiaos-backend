# Autonomy Substrate - Phase 0 Findings

## Inventory

### coord.js tools that exist today

All exported tool handlers (callable via MCP):

- `send_message(params, ctx)` - params: `{to, body, task_id?, in_reply_to?}`. Delivers a message to a named topic inbox. Returns `{message_id, created_at}`.
- `read_inbox(params, ctx)` - params: `{topic?, since?, limit?}`. Reads + marks-seen unread messages for the caller's inbox (defaults to `chat.<tab_id>.inbox` or `chat.conductor.inbox`). Returns `{topic, count, messages}`.
- `peek_inbox(params, ctx)` - same shape as `read_inbox` but does NOT mark seen. Safe for polling without consuming messages.
- `wait_for_inbox(params, ctx)` - params: `{topic?, timeout?}`. Blocks (poll loop, 1s interval) until a message arrives or timeout (max 600s). Returns `{trigger_message, also_unread, more_unread, hold_duration_ms, timed_out}`.
- `ack_message(params, ctx)` - params: `{id, action_summary?}`. Marks a message acknowledged. Returns `{ok, id, acknowledged_at}`.
- `list_workers(params, ctx)` - params: `{include_dead?}`. Returns all live (and optionally dead) worker rows with heartbeat staleness. Returns `{count, workers}`.
- `heartbeat(params, ctx)` - params: `{status?, in_critical_section?}`. Updates `last_heartbeat_at` on the calling worker's row. Returns `{ok, last_heartbeat_at}`.
- `report_progress(params, ctx)` - params: `{task_id, summary}`. Sends a `{type:"progress"}` message to `chat.conductor.inbox`. Convenience wrapper over `send_message`.
- `signal_done(params, ctx)` - params: `{task_id, result_summary, result_pointer?, terminate?}`. Sends `{type:"done"}` to `chat.conductor.inbox`, stamps `terminated_at` on the worker row, unlinks the `.spawned` marker. Returns `{message_id, created_at}`.
- `verify_paste(params, ctx)` - params: `{task_id?}`. Reads the authoritative brief from disk (`coordination/briefs/<task_id>.md`) and returns `{ok, brief_body, brief_sha256, brief_size_bytes, brief_file, registered_at, ...}`. Used by workers on first turn to confirm the clipboard paste wasn't truncated.
- `register_conductor(params, ctx)` - params: `{tab_id?, ide?, title_match?, hwnd?, exe?, claude_port?, ide_pid?, ide_bridge_port?, workspace_root?}`. Writes conductor registration to `conductors/current.json` + `conductors/default.json`. Returns `{ok, conductor, took_over, prior_conductor_tab_id}`.
- `unregister_conductor(params, ctx)` - params: `{tab_id?}`. Removes conductor files. Returns `{ok, removed}`.
- `get_conductor_state(_params)` - no required params. Returns `{conductor, is_active, stale_ms, stale_threshold_ms, wake_policy, wake_topic_prefixes, last_wake_at}`.
- `conductor_heartbeat(params, _ctx)` - params: `{title_match?, hwnd?, exe?, claude_port?, ide_pid?, ide_bridge_port?, workspace_root?}`. Updates `last_seen_at` on the conductor row. Called by the Corazon UserPromptSubmit hook each turn-start. Returns `{ok, last_seen_at, in_turn}`.
- `set_conductor_in_turn(params, _ctx)` - params: `{in_turn}`. Sets/clears the in_turn mutex on the conductor row. Returns `{ok, in_turn, in_turn_set_at}`.
- `set_wake_policy(params, _ctx)` - params: `{mode?, notify_types?, toast_duration_ms?, rate_limit_ms?}`. Persists wake policy to disk. Returns `{ok, wake_policy}`.

Internal helpers (NOT tool-exposed, but used by cowork.js and tests):
- `_registerWorkerInternal({tab_id, task_id, tab_credential, parent_conductor_tab_id, account_active_when_spawned})` - the worker registration call used by the `/api/comms/register-worker` HTTP route.
- `_inboxTopicFor(ctx)` - computes canonical inbox topic string for a caller.
- `_loadConductorRegistration()` - reads conductor row from disk.
- `_sweepStaleWorkers()`, `_startSweepLoop()`, `_stopSweepLoop()` - sweep-loop control.

Notes on specific signals the autonomy substrate needs:

- `signal_done` - YES, exists. Sends `{type:"done"}` to `chat.conductor.inbox` and terminates the worker row.
- `signal_bound` / `signal_ready` - NO, does not exist by that name. The equivalent is `coord.heartbeat()` (first call after the tab starts), which advances `last_heartbeat_at` past the baseline registered at dispatch time. `dispatch_worker` in cowork.js treats a heartbeat advance as "acknowledged" (`ack_via: 'heartbeat'`). There is no dedicated launch-confirmation signal named `signal_bound` or `signal_ready`.
- `wait_for_signal_bound` - NO, does not exist. The conductor-side equivalent is the `acknowledged` flag in the `dispatch_worker` return value (cowork.js polls for heartbeat/message for up to 90s before returning).
- `wait_for_signal_done` - NO, does not exist as a named tool. The conductor uses `coord.wait_for_inbox` (with `topic: "chat.conductor.inbox"`) to receive the `{type:"done"}` message that `signal_done` sends. This is a general inbox-wait, not a task-scoped blocking primitive.
- Pub/sub or EventEmitter for coord events - NO. All waiting is poll-based (1s interval in `wait_for_inbox`). No server-side subscription or EventEmitter pattern. File-backed persistence only.

### cowork.dispatch_worker signature

Function: `dispatch_worker(params)`

Parameters:
- `params.brief` (string, required) - the task brief body
- `params.task_id` (string, optional) - auto-generated UUID if not provided
- `params.account` (string, optional, default `"current"`) - which account to attribute this worker to; `"current"` resolves via `usage._getActiveAccount()`
- `params.ide` (string, optional, default `"cursor"`) - IDE target; accepts `"cursor"`, `"insiders"`, or `"stable"`
- `params.parent_conductor_tab_id` (string, optional) - auto-resolved from registered conductor if not provided
- `params.coord_url` (string, optional, default `"http://localhost:7456"`) - coord substrate URL
- `params.worker_acknowledgment_timeout_ms` (number, optional, default 90000) - how long to wait for the first coord.* call from the worker; set to 0 for fire-and-forget
- `params.redispatch_on_orphan` (boolean, optional, default false) - auto-retry once if no acknowledgment
- `params._is_redispatch` (boolean, internal) - sentinel to prevent infinite redispatch recursion

Target IDE: Cursor (default). Changed via `params.ide`: `"cursor"` | `"insiders"` | `"stable"`.

Keybinding: calls `vscode.new_claude_code_chat({ ide: ide_target })`. This is NOT `cursor.new_chat_tab()` (which opens the native Cursor Composer panel). It opens a Claude Code extension chat tab via the VS Code command palette (`Claude Code: New Chat`). The actual keybinding is determined by the vscode.js handler, not hardcoded in cowork.js.

Returns on success:
```json
{
  "ok": true,
  "tab_id": "tab_<ts>_<hex>",
  "tab_credential": "<uuid>",
  "account_active_when_spawned": "tate@ecodia.au",
  "registered_at": "<iso>",
  "brief_size_bytes": 1234,
  "brief_storage": "inline | file",
  "brief_file_audit": "<path>",
  "role": "worker",
  "recovery_attempts": 0,
  "tab_handle": { "ide": "cursor", "hwnd": 12345, "title": "..." },
  "coord_url": "http://localhost:7456",
  "task_id": "<uuid>",
  "acknowledged": true,
  "ack_via": "heartbeat | message:<type>",
  "ack_elapsed_ms": 4200,
  "note": "..."
}
```

Returns `tab_id`: YES. The `tab_id` is returned in the success object (format: `tab_<timestamp>_<4-byte-hex>`).

`close_tab` exists: NO. There is no `close_tab` function exported. The equivalent is `kill_worker(params)` which accepts `{tab_id, tab_handle?}`, sends `Ctrl+W` to the IDE, removes the `.spawned` marker, and returns `{ok, tab_id, marker_removed}`. Note: `kill_worker` closes the CURRENTLY FOCUSED tab in the IDE window - it has no UIA-level tab targeting.

Other exported functions in cowork.js:
- `list_workers()` - lists `.spawned` state markers (not the full worker registry from coord.js)
- `kill_worker(params)` - `{tab_id, tab_handle?}` - described above
- `swap_creds(params, ctx)` - `{account, force?, clobber_detection_ms?}` - atomically swaps `~/.claude/.credentials.json` to a different account's snapshot with advisory lock + in-flight critical-section check
- `swap_history(params)` - `{limit?}` - reads recent swap audit log

### usage.js cap-state API

MCP-exposed tool handlers:

- `pick_account(params, ctx)` - params: `{estimated_tokens?, exclude?, ignore_flaky?}`. Returns the account with the highest buffered headroom. Returns `{account, score, remaining_5h, remaining_weekly, buffer_factor, estimated_tokens, polled_at, reason, candidates, flaky_excluded}`.
- `get_usage_state(params, ctx)` - no required params. Returns the full state from `accounts.json` plus computed alerts: `{state, alerts}` where `state = {polled_at, active_account, accounts: {<account>: {tokens_5h, tokens_weekly, sessions_5h, sessions_weekly, remaining_5h, remaining_weekly, headroom_5h_fraction, headroom_weekly_fraction, headroom_score, cap_5h, cap_weekly, last_polled_at}}}` and `alerts = {current_account_low, all_low, accounts_low, threshold}`.
- `poll_now(params, ctx)` - no required params. Forces a fresh ccusage poll and writes updated state to `accounts.json`. Returns the same shape as `get_usage_state.state`.
- `get_active_account(params, ctx)` - returns `{account}` (the currently active account label).
- `set_active_account(params, ctx)` - params: `{account, set_by?}`. Sets the active account. Returns `{account, since_ts, set_by}`.
- `mark_flaky(params, ctx)` - params: `{account, reason?}`. Marks an account flaky for FLAKY_TTL_MS (10min). Returns `{ok, account, flaky_at, ttl_ms}`.
- `clear_flaky(params, ctx)` - params: `{account}`. Clears the flaky flag. Returns `{ok, cleared}`.
- `list_flaky(params, ctx)` - returns `{active, expired, ttl_ms}`.

Per-account data shape (from `get_usage_state`):
```json
{
  "tokens_5h": 0,
  "tokens_weekly": 0,
  "sessions_5h": 0,
  "sessions_weekly": 0,
  "remaining_5h": 220000000,
  "remaining_weekly": 1000000000,
  "headroom_5h_fraction": 1.0,
  "headroom_weekly_fraction": 1.0,
  "headroom_score": 1.0,
  "cap_5h": 220000000,
  "cap_weekly": 1000000000,
  "last_polled_at": "2026-05-26T00:00:00.000Z"
}
```

Cap defaults: 5h = 220M tokens, weekly = 1B tokens. Override via `CAPS_5H_TOKENS` / `CAPS_WEEKLY_TOKENS` env vars.

Scoring: `score(a) = min(remaining_5h, remaining_weekly) * 0.85 - estimated_tokens`. The 0.85 is the BUFFER_FACTOR (15% conservative buffer).

Known accounts: `['tate@ecodia.au', 'code@ecodia.au', 'money@ecodia.au']`.

Token counts: `ccusage` CLI is invoked via `spawnSync(NODE_EXE, [CCUSAGE_CLI_JS, 'session', '--json'])` and `spawnSync(NODE_EXE, [CCUSAGE_CLI_JS, 'blocks', '--json'])`. CCUSAGE_CLI_JS defaults to `D:\\SSD_Turbo\\node-global\\node_modules\\ccusage\\dist\\cli.js`.

Session-to-account attribution is heuristic (worker rows + swap history + active-account at session birth). No server-side session tagging at the CC process level.

---

## Prerequisite #1: IDE target decision

(to be filled in Task 0.4 - leave placeholder)

---

## Prerequisite #2: OAuth refresh endpoint

(to be filled in Task 0.3 - leave placeholder)

---

## Prerequisite #3: coord signal tools

(to be filled in Task 0.2 - leave placeholder)

---

## Prerequisite #4: MCP auto-connection in spawned chats

(to be filled in Task 0.5 - leave placeholder)

---

## Seed state checklist

(to be filled in Tasks 0.6 - 0.9 - leave placeholder)

---

## Routine migration log

(to be filled in Phase 9 - leave placeholder)
