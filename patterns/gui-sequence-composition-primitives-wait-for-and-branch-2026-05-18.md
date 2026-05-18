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

## Stream B v2 - additional primitives shipped same day

After Worker B v3's audit at [coordination/briefs/gui-composition-extensions-OUTPUT.md](../../EcodiaOS/coordination/briefs/gui-composition-extensions-OUTPUT.md), five more primitives landed (~300 LOC, all backward-compatible):

### Multi-condition `wait_for` (`any` / `all`)

```json
{"tool":"wait_for","params":{"until":{"any":[
  {"type":"cdp_url_contains","contains":"/dashboard"},
  {"type":"cdp_element_exists","selector":".error-banner"}
]},"timeout_ms":15000}}
```

`any: [...]` returns when ANY sub-condition fires (race-for-first). `all: [...]` returns when ALL are true. Backward-compat: single-condition `until: {type: ...}` still works. Response shape adds `matched_index` for `any`.

### Step-level `if:` precondition

Sibling field on every action object. Probed ONCE before the step. If false, step recorded as `{ok:true, skipped:true, if_probe: <result>}` and sequence continues. Collapses `branch{then:[X]}` → `{tool:X, if:...}`.

```json
{"actions":[
  {"tool":"cdp.click","params":{"selector":".dismiss"},"if":{"type":"cdp_element_exists","selector":".dismiss"}},
  {"tool":"cdp.navigate","params":{"url":"${url}"}}
]}
```

### `foreach` loop

```json
{"tool":"foreach","params":{
  "items":"${deploy_rows.elements}",
  "as":"row","index_as":"i","max_iterations":50,
  "body":[
    {"tool":"cdp.click","params":{"selector":"${row.selector}"}},
    {"tool":"wait_for","params":{"until":{"type":"cdp_ready_state"},"timeout_ms":3000}}
  ]
}, "as":"loop_result"}
```

`items` accepts a literal array OR a `${var}` that resolves to one. Iteration bindings are SCOPED (restored on loop exit). Default `stopOnError: false` (process all items, report per-iteration failures).

### `try` block with `catch` + `finally`

```json
{"tool":"try","params":{
  "body":[ {"tool":"gui.open_url","params":{"url":"${url}"}}, {"tool":"cdp.queryAll","params":{"selector":"..."}} ],
  "catch":{"as":"err","body":[
    {"tool":"coord.send_message","params":{"to":"chat.conductor.inbox","body":{"type":"extract_failed","error":"${err}"}}}
  ]},
  "finally":[ {"tool":"gui.close_tab"} ]
}}
```

`body` always runs; `catch` runs only if body fails (with the error bound to `${err}` by default, override via `catch.as`); `finally` always runs. Returns `{ok, taken: 'success'|'caught'|'rethrown', body_steps, catch_steps, finally_steps}`.

### `max_total_ms` envelope-level timeout

```json
{
  "tool":"gui.sequence",
  "params":{
    "max_total_ms": 300000,
    "actions":[ ... ]
  }
}
```

Hard whole-sequence deadline. Currently-running step is allowed to finish (atomic await), no further actions dispatched. Response adds `timed_out_at_step: <i>, max_total_ms: <ms>` when triggered. Default unbounded.

### Combined example - foreach + try + branch + wait_for + ${var}

```json
{
  "tool":"gui.sequence",
  "params":{
    "max_total_ms": 600000,
    "bindings": {"urls":["https://a.com","https://b.com","https://c.com"]},
    "actions":[
      {"tool":"gui.launch_cdp_chrome"},
      {"tool":"cdp.attach"},
      {"tool":"foreach","params":{
        "items":"${urls}","as":"url","index_as":"i","stopOnError":false,
        "body":[
          {"tool":"try","params":{
            "body":[
              {"tool":"cdp.navigate","params":{"url":"${url}"}},
              {"tool":"wait_for","params":{"until":{"any":[
                {"type":"cdp_ready_state"},
                {"type":"cdp_element_exists","selector":".error-page"}
              ]},"timeout_ms":10000}},
              {"tool":"cdp.pageScreenshot","as":"shot"}
            ],
            "catch":{"body":[
              {"tool":"coord.send_message","params":{"to":"chat.conductor.inbox","body":{"type":"page_failed","i":"${i}","url":"${url}","err":"${err}"}}}
            ]}
          }}
        ]
      }}
    ]
  }
}
```

One HTTP call. Navigate to N URLs in sequence, each with try/catch + multi-condition wait + screenshot; failures don't stop the loop; cleanup of the whole batch bounded by max_total_ms. This is the substrate at "absolutely flawless."

## What was NOT shipped (deferred per audit)

- `define` + `call` sub-sequence reuse (~100 LOC) - useful but lower F*L*B
- Sequence-level `max_attempts` + retry-whole (~40 LOC) - dangerous for side-effecting batches
- `dry_run` envelope flag / `gui.plan` (~60 LOC) - useful for CI/dev not load-bearing
- Push telemetry to coord topic (~50 LOC) - inline timing in `steps[].durationMs` already covers most needs
- Sequence-id / continuation token (~150 LOC) - defer until a flow actually wants async cancellation
- Result projection (`return_only: [...]`) (~40 LOC) - relevant only at high frequency

## Anti-additions (NEVER ship - audit §4)

- Expression DSL inside `${...}` (no `${var + 1}`, `${a ? b : c}`, etc)
- Server-side `eval` for JS-in-params
- Async/parallel that bypasses PS daemon serialisation
- Nested `gui.sequence` (already forbidden in runStep)
- `goto` / labels / `continue` / `break`
- Sequence-shared persistent state (use coord / kv_store instead)
- Per-key `${...}` substitution (values only, not keys)
- Sequence format `version` field (YAGNI until first break)

## Origin

2026-05-18 ~14:00 AEST. Stream B of the "absolutely flawless GUI" doctrine (Tate verbatim 01:00 AEST: "sequencing sequences together"). Stream A was reliability (PS daemon + audit-driven hardening). Stream B v1 was wait_for + branch + ${var} substitution + peek_inbox. Stream B v2 added the five from Worker B v3's audit-ranked roadmap. All shipped same day.

Pairs with [[gui-substrate-beast-mode-2026-05-17]] and [[ps-daemon-long-lived-powershell-for-gui-substrate-2026-05-18]].
