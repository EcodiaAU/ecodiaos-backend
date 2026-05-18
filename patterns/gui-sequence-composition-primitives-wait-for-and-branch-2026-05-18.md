---
triggers: gui.sequence_chain, sequence-chain, wait_for, wait-for, branch, conditional-sequence, multi-phase-gui-flow, wait-until, gui-composition, gui-composition-primitives, sequence-composition, chained-flow, navigate-then-wait, cdp-ready-state, cdp-element-visible, cdp-url-contains, file-exists-wait, foreground-window-wait, coord-inbox-wait
---

# `gui.sequence` composition primitives - `wait_for` + `branch`

`gui.sequence` is the batch primitive that collapses N GUI round-trips into 1 HTTP call (see [[gui-sequence-batch-primitive-collapses-roundtrips-orthogonal-to-coord-brittleness-2026-05-17]]). On top of that, two new pseudo-actions turn a flat batch into a chained flow: **`wait_for`** (wait UNTIL condition) and **`branch`** (if-then-else).

This is the "sequencing sequences together" composition layer Tate's "absolutely flawless GUI" doctrine asked for (2026-05-18 01:00 AEST).

## When to reach for these

- **`wait`** (the old `wait` action) - you know EXACTLY how long to sleep. Use when the latency is deterministic.
- **`wait_for`** - you need "wait UNTIL X." Use whenever the next step depends on a state transition that takes variable time (page load, file appearance, foreground window shift, worker heartbeat).
- **`branch`** - take different paths based on observed state. Use when the same sequence runs in two situations and step N+1 differs by state.

If a sequence has more than one `wait {ms: N}` step, look for the underlying condition each `wait` is approximating - it usually wants to be a `wait_for`. `wait {ms: 1500}` after spawning a new tab is "wait approximately until the chat input is focused"; that's better as `wait_for {until: {type: 'foreground_window_matches', exe: 'Cursor', title_contains: 'Claude Code'}, timeout_ms: 5000}`.

## `wait_for` spec

```json
{
  "tool": "wait_for",
  "params": {
    "until": { "type": "<condition_kind>", ... },
    "timeout_ms": 10000,
    "poll_ms": 200,
    "throw_on_timeout": false
  }
}
```

Returns: `{ok, waited_ms, condition, last_value, timed_out, last_error?}`.

### Supported condition kinds

| `type`                          | Params                                           | True when                                          |
|---------------------------------|--------------------------------------------------|----------------------------------------------------|
| `cdp_url_contains`              | `contains: '/dashboard'`                         | CDP page url contains the substring                |
| `cdp_url_matches`               | `pattern: '^https://app\\..*'`                   | CDP page url matches the regex                     |
| `cdp_ready_state`               | `state: 'complete'`  (default)                   | `document.readyState === state`                    |
| `cdp_element_visible`           | `selector: 'button.submit'`                      | CSS selector resolves to >=1 element               |
| `cdp_element_exists`            | (same)                                           | (alias for above)                                  |
| `cdp_eval_truthy`               | `script: 'window.X?.ready === true'`             | Evaluating the JS returns truthy                   |
| `file_exists`                   | `path: 'D:/.../done.marker'`                     | Filesystem path exists                             |
| `cmd_returns_zero`              | `cmd: 'curl', args: ['-fsS', '<url>']`           | spawnSync exits 0 within 5s                        |
| `foreground_window_matches`     | `exe?, title_contains?, title_matches?`          | Foreground window matches all provided predicates  |
| `coord_inbox_has`               | `topic?, body_contains?`                         | coord.read_inbox returns >=1 matching message      |

### Failure semantics

- Default: timeout returns `{ok: false, timed_out: true}` (graceful). The sequence continues.
- Set `throw_on_timeout: true` if you want the sequence to abort on timeout. Combine with `stopOnError: true` at the sequence level to bubble the failure out.

## `branch` spec

```json
{
  "tool": "branch",
  "params": {
    "condition": { "type": "cdp_element_exists", "selector": ".already-signed-in" },
    "probe_timeout_ms": 1000,
    "then": [ { "tool": "cdp.click", "params": { "selector": ".continue" } } ],
    "else": [ { "tool": "cdp.click", "params": { "selector": ".sign-in" } } ]
  }
}
```

Probes the condition ONCE (with `probe_timeout_ms`, default 1000); runs `then` actions if true, `else` actions if false. Returns `{ok, taken: 'then'|'else', probe: <waitForResult>, steps: [<stepResults>]}`.

## Worked example: dispatch + wait for worker done

```json
{
  "actions": [
    {
      "tool": "cowork.dispatch_worker",
      "params": { "ide": "cursor", "task_id": "demo-1", "brief": "..." }
    },
    {
      "tool": "wait_for",
      "params": {
        "until": { "type": "coord_inbox_has", "topic": "chat.conductor.inbox", "body_contains": "demo-1" },
        "timeout_ms": 300000,
        "poll_ms": 2000
      }
    },
    { "tool": "screenshot.screenshot" }
  ]
}
```

One HTTP call dispatches the worker, blocks up to 5min waiting for the worker's `signal_done` message to arrive in the conductor inbox, then snaps the final screenshot. Composition.

## Variable binding (`as:` + `${var}` substitution)

Capture a step's result and reference it in later steps. Set `as: "name"` on any action, then any string in subsequent steps' `params` containing `${name}` (or `${name.field.nested}`) gets substituted with that result.

```json
{
  "actions": [
    { "tool": "cdp.url", "params": {}, "as": "current_url" },
    { "tool": "cdp.navigate", "params": { "url": "https://example.com/page2" } },
    { "tool": "wait_for", "params": { "until": { "type": "cdp_url_contains", "contains": "/page2" }, "timeout_ms": 5000 } },
    { "tool": "cdp.runJs", "params": { "script": "history.replaceState(null,'','${current_url}')" } }
  ],
  "bindings": { "API_HOST": "api.admin.ecodia.au" }
}
```

- `bindings` at the envelope level pre-seeds vars (good for config like `${API_HOST}`).
- Per-step `as` captures the step's result object - reference whole-object with `${var}` or nested fields with `${var.field}`.
- Unknown `${var}` tokens are LEFT IN PLACE so misnames are visible in the rendered params (and the response surface). Don't silently swallow them.
- Substitution is SHALLOW (string-template). Objects bound via `as` get JSON-stringified when used in a string context.

## Non-consuming inbox probe: `coord.peek_inbox`

`coord.read_inbox` marks messages SEEN as a side effect. For `wait_for {type: 'coord_inbox_has'}` and any observer-style use, **prefer `coord.peek_inbox`** - same shape, no `seen_at` mutation. Now exposed on both `/api/tool` (direct) and the MCP shim. `wait_for` internally uses `peek_inbox` so the wait probe doesn't consume the message the next `read_inbox` caller would have claimed.

## Worked example: navigate + wait + click + verify

```json
{
  "actions": [
    { "tool": "cdp.navigate", "params": { "url": "https://example.com/login" } },
    { "tool": "wait_for", "params": { "until": { "type": "cdp_ready_state" }, "timeout_ms": 5000 } },
    { "tool": "branch", "params": {
      "condition": { "type": "cdp_element_exists", "selector": "input[name='username']" },
      "then": [
        { "tool": "cdp.fillByLabel", "params": { "label": "Username", "value": "${USERNAME}" } },
        { "tool": "cdp.click", "params": { "selector": "button[type='submit']" } }
      ],
      "else": [
        { "tool": "screenshot.screenshot" }
      ]
    } },
    { "tool": "wait_for", "params": { "until": { "type": "cdp_url_contains", "contains": "/dashboard" }, "timeout_ms": 10000 } }
  ]
}
```

(Variable substitution `${USERNAME}` is NOT yet implemented as of 2026-05-18 - the brief above uses it for illustration; for now, inject values into the JSON at compose-time.)

## Don't

- Don't use `wait_for` for sleeps you actually want (`wait {ms: N}` is cheaper and the right primitive). `wait_for` polls and has overhead; use it ONLY when you need "until."
- Don't use `coord_inbox_has` as a probe without understanding that `read_inbox` marks messages SEEN as a side effect. The wait will consume the message the next caller would have read. For non-consuming probes, the future fix is a `peek_inbox` primitive.
- Don't nest `branch` inside `branch` more than 2 deep - readability tanks. Flatten with multiple sequential branches instead.
- Don't pass `throw_on_timeout: true` AND `stopOnError: false` at the sequence level - the throw aborts the step but the sequence keeps going, masking the failure intent.

## Implementation

- [tools/gui.js](D:/.code/eos-laptop-agent/tools/gui.js) `pseudoWaitFor()` + `pseudoBranch()` + dispatch hooks in `runStep()`.
- The condition types call live modules (cdp / window / coord / fs / spawnSync) on each poll - light-touch, no separate poller infrastructure.
- Single-in-flight serialization: the daemon (lib/ps-daemon) processes one PS call at a time, so a sequence with many wait_for probes that each call cdp/window/etc serialises naturally.

## Origin

2026-05-18 ~14:00 AEST. Stream B of the "absolutely flawless GUI" doctrine (Tate verbatim 01:00 AEST: "sequencing sequences together"). Stream A was reliability (PS daemon + audit-driven hardening). Stream B is composability (wait_for + branch). Both shipped same night.

Pairs with [[gui-substrate-beast-mode-2026-05-17]] and [[ps-daemon-long-lived-powershell-for-gui-substrate-2026-05-18]].
