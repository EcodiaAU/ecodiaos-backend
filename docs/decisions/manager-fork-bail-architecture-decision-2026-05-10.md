# Manager-fork bail-half — architecture decision

**Author:** fork_moyv16ep_a53f5c (research+decision worker)
**Date:** 2026-05-10
**Status:** RECOMMENDATION — implementation deferred to a follow-up fork after Tate or conductor reviews
**Status_board row:** "Manager-fork bail half: SDK idle-timeout while polling sub-forks - architectural fix needed"

---

## TL;DR

The brief's hypothesised root cause ("SDK idle-timeout while polling sub-forks") is **wrong** — the SDK has no idle-timeout. The actual root cause is that the **manager-poll-loop does not exist as code**: `forkService.js` never polls `os_forks` for sub-fork completion. The brief instructs the model to poll, but model compliance is the only enforcement. After spawning, the model often emits a closing assistant turn without further tool calls; the SDK transitions to `idle`, emits `result`, and the fork stream closes — silently, no [FORK_REPORT].

**Recommendation:** ship a hybrid of (a) and (b) — a single new in-process MCP tool `mcp__forks__wait_for_sub_forks` that blocks server-side until all listed sub-fork ids reach terminal status, returning aggregated reports. The tool keeps the SDK turn alive (the tool call is "running" from the SDK's view) AND consolidates the wait logic in one server-side place AND preserves the manager's verify-and-emit-FORK_REPORT step. ~80 LOC in `forkConductorTool.js`, ~20 LOC update to the manager brief in `forkService.js`.

Pure (a) heartbeat-every-60s is brittle (model-compliance-dependent, token-wasteful). Pure (b) server-side `forkComplete` listener auto-emits is invasive (changes the contract that the fork emits its own report). Pure (c) checkpoint-and-resume is the right shape for long-running 30-stream pipelines but overkill for the actual usage pattern (5-worker short-pipelines).

---

## Section 1 — Quantitative size of the problem

Query against `os_forks` for last 7d, where `brief LIKE '%MANAGER: true%'` (the `is_manager` flag is in-memory only — no DB column):

| Class | n | Total tokens | Avg duration | Avg tool_calls | Avg subs |
|---|---|---|---|---|---|
| **has_report** (success) | 29 | 71,128 | 710s | 49 | 0.2 |
| **empty_body** (FORK_REPORT marker emitted but trimmed empty) | 12 | 46,162 | 785s | 70 | 0.6 |
| **phantom_bail** (no FORK_REPORT marker at all) | 7 | 327,567 | 266s | 28 | 1.9 |
| **no_output** (transcript empty) | 2 | 198,852 | 34s | 9 | 0.0 |
| **no_result** (state.result was null) | 1 | 514 | 17s | 1 | 0.0 |

**Bail rate:** 19 of 51 manager forks (37%) failed to emit a usable FORK_REPORT body in the last 7 days. Of those, the **7 phantom_bail cases** are the canonical instance the brief calls out — the manager's transcript closed without ever emitting `[FORK_REPORT]` at all. They represent the architectural failure; `empty_body` is a separate model-side bug (model emits `[FORK_REPORT]\n[NEXT_STEP]` with no body) handled by existing parser hardening at `forkService.js:1113-1124`.

**Direct token cost:** ~374k tokens across all 19 cases ≈ $1.12 USD at Sonnet pricing. The dollar cost is trivial; the **real cost is downstream:**
- Conductor sees `<forks_rollup>` showing the fork as `[done phantom_bail]` and must dispatch a probe-then-trust verify cycle (per `~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md`)
- Sub-forks the manager spawned are usually still healthy and may have shipped real artefacts that need salvaging
- Subsequent redispatch with consolidation brief means **a second manager fork** burning more slot capacity AND tokens, often 5–10× the original
- Tate sees a polluted decision context when the bail manager's plain-text tail bleeds into the rollup

**Canonical example** (the `1.8.4 manager` cited in brief):
- `fork_motzb8ot_2b4dc3` — Co-Exist 1.8.4 feature batch, 484s duration, 59 tool_calls, 5 sub-forks spawned, status=`done`, result starts with `(no [FORK_REPORT] emitted; last 2000 chars of transcript follow)\n\nh.\n\n[APPLIED]…`
- The manager spawned all 5 workers, emitted some final assistant text, the SDK turn ended.

**Other phantom_bail cases tell the same story:** managers ranged 45s–484s, spawned 0–5 sub-forks, ranged 13–59 tool_calls. The common shape is "manager finished spawning + planning, then turn just ended."

---

## Section 2 — How the SDK actually terminates a manager fork

This section establishes ground truth before evaluating architectures, because the brief's premise is incorrect.

### What the brief assumes (incorrect)

> Root cause: SDK stream idle-timeout during the manager polling phase

There is **no SDK idle-timeout.** The complete enumeration of reasons the SDK can end a query is `TerminalReason` in `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:5380`:

```ts
export declare type TerminalReason = 'blocking_limit' | 'rapid_refill_breaker'
  | 'prompt_too_long' | 'image_error' | 'model_error' | 'aborted_streaming'
  | 'aborted_tools' | 'stop_hook_prevented' | 'hook_stopped' | 'tool_deferred'
  | 'max_turns' | 'completed';
```

`'idle'` is NOT a terminal reason. The string `'idle'` only appears in the SDK as a `SDKSessionStateChangedMessage` value (`sdk.d.ts:3328`) describing the **turn-over event** ("`'idle'` fires after heldBackResult flushes and the bg-agent do-while exits — authoritative turn-over signal"). That is a state notification, not a kill switch. There is no time-based killer.

### What actually happens

`forkService.js:961` — the fork loop is `for await (const msg of q)`. The loop ends when the SDK closes the iterator. The SDK closes the iterator when it emits a `result` message (`forkService.js:1060-1072`):

```js
case 'result': {
  // SDK terminal - fork is wrapping up.
  state.input_closed = true
  for (const resolve of state.pendingResolvers.splice(0)) resolve(null)
  state.status = 'reporting'
  ...
}
```

The SDK emits a `result` message when the model's turn ends with terminal_reason `'completed'` AND no further user message is queued in the prompt stream (`_makeForkPromptStream` at line 919).

### The actual root cause

After spawning sub-forks, the manager model usually emits a closing assistant turn like:

> _"I've spawned all 5 workers. I'll poll `os_forks` until they're terminal, then verify deliverables and consolidate."_

…and then **stops emitting tool calls**, because from the model's POV there's nothing more to do until sub-fork reports arrive. But sub-fork reports arrive as **injected user messages via `sendMessageToFork`** (`forkService.js:1299` + the prompt-stream generator at line 919-950) — and those don't get pushed into the manager's stream until each sub-fork's own SDK loop emits `[FORK_REPORT]` and its `_enqueueForkReport` writes to `os_message_queue` and the message router relays to the manager.

While that's happening, the manager's prompt-stream generator is `await`ing on `pendingResolvers`, and the SDK has nothing further to iterate. The SDK transitions to `idle`, emits `result`, the loop closes, the FORK_REPORT extractor runs against a transcript that never contained the closing tag, the fallback marker prefix is written to `state.result`, and the fork is marked `done` with `phantom_bail` flag.

**There is no manager-poll-loop in code.** The pattern doctrine instructs the manager to poll (`patterns/manager-forks-for-multi-worker-decomposition.md:21`), but enforcement is purely brief-instructed model compliance — and managers don't comply often enough.

---

## Section 3 — Pros/cons of each architecture

### (a) Heartbeat tool-call every 60s (brief instructs manager to keep polling)

**Implementation:** Tighten the manager-fork brief at `forkService.js:686-691` to mandate `db_query` (or `mcp__forks__list_forks`) every 60s with strict language: "If you stop making tool calls before all sub-forks are terminal, your turn ends and your work is lost."

| Aspect | Verdict |
|---|---|
| LOC | ~10 LOC (brief tightening only, no code change) |
| Risk to regular-fork case | None — only the manager brief changes |
| Token cost per manager run | **High.** ~5–15 polls × ~300 tokens/turn ≈ 1,500–4,500 extra tokens per manager. Cache hits soften this; still measurably worse than (b). |
| Failure-mode taxonomy if this breaks | Same as today: model decides to stop polling, turn ends, phantom_bail. **No structural improvement** — only better instruction. We've already seen (line 689-690 of current forkService.js: "After spawning, your normal cycle is: poll → if all terminal, proceed to VERIFY") that this language is partially in place and is failing 37% of the time. |

**Verdict:** weakest of the three on the metric that matters (structural reliability). Tightening words to fix a model-compliance problem is the doctrine-without-mechanism failure mode that `~/ecodiaos/patterns/prefer-hooks-over-written-discipline.md` warns against.

### (b) Server-side aggregation — `forkComplete` listener auto-emits manager [FORK_REPORT]

**Implementation:** When `forkComplete` listener (`src/services/forkService.js` perception bus publish + listeners that consume `fork_complete` events) detects all sub-forks of a manager are terminal, server-side code:
1. Reads each sub-fork's result + next_step
2. Synthesises a consolidated `[FORK_REPORT]` body
3. Writes it to the manager's `os_forks.result` (override whatever the manager produced)
4. Calls `_enqueueForkReport` to push to conductor inbox

| Aspect | Verdict |
|---|---|
| LOC | ~120 LOC (new listener handler + state-machine logic to detect "all subs terminal" + result-aggregation) |
| Risk to regular-fork case | Low — gated on `parent_id IN (manager_fork_ids)` + sentinel detection, doesn't touch root forks |
| Token cost | Zero new model tokens (aggregation runs server-side in JS) |
| Failure-mode taxonomy | (1) **Loses verification step.** The manager's `[FORK_REPORT]` is supposed to be _after_ the manager has read each sub-fork's deliverable and confirmed it matches the claim (`patterns/manager-forks-for-multi-worker-decomposition.md:22`). Server-side auto-emit can't do that semantic verification — only mechanical aggregation. (2) **Race with manager that DID emit FORK_REPORT** — needs idempotence guard. (3) **Changes the contract** that "the fork emits its own report" — every other doctrine layer assumes this. |

**Verdict:** invasive and lossy on verification. Could fit narrow cases (build-test-deploy pipelines where verification is itself a sub-fork), but unsuited as the default.

### (c) Checkpoint-and-resume — manager exits gracefully, gets re-spawned to consolidate

**Implementation:**
1. Manager brief tells it to exit after spawning, write a "consolidation brief" to `kv_store.manager_consolidation.<fork_id>` with the list of sub-fork ids it's waiting on
2. New listener on `forkComplete`: when last sub-fork of a `parent_id=<manager_fork_id>` reaches terminal, look up `kv_store.manager_consolidation.<fork_id>`, spawn a NEW fork with brief = "CONSOLIDATE: subs done, here are their reports / paths…"
3. The resumed fork verifies + emits `[FORK_REPORT]` to conductor

| Aspect | Verdict |
|---|---|
| LOC | ~150 LOC (manager brief change + kv_store schema + forkComplete handler + spawn-on-completion logic + idempotence guard) |
| Risk to regular-fork case | Medium — touches forkComplete listener (shared infra), needs careful gating |
| Token cost | One extra fork spawn per manager run (consolidation pass) ≈ +2–5k tokens vs (b). Same token cost as a manager that successfully polls today. Cache-warm |
| Failure-mode taxonomy | (1) **Resumed fork has no continuity** with original manager's reasoning — must reconstruct from sub-fork reports + brief. Usually fine; occasionally loses subtle context. (2) **kv_store row leakage** if listener fails to fire (orphaned consolidation entries). Need TTL + janitor. (3) **Extra fork slot consumed** during consolidation — minor in normal load, problematic if all 5 slots are managers and all are consolidating |

**Verdict:** correct shape for long-running 30-stream pipelines (where keeping a single SDK turn alive for >30 min is itself fragile). Overkill for the actual 5-worker short-pipeline median.

### (a-prime) Single blocking MCP tool — `mcp__forks__wait_for_sub_forks`

This is **what I actually recommend**. It's a hybrid of (a) and (b) and doesn't fit cleanly into the brief's three categories.

**Implementation:** New tool in `forkConductorTool.js` (which already wires the in-process forks MCP server). The tool takes a list of sub_fork_ids and a max_wait_sec, polls `os_forks` server-side every 5s, returns aggregated reports when all are terminal (or a "still-pending" structured response on timeout). Manager calls it ONCE per consolidation cycle. The SDK keeps the manager's turn alive because the tool call is "running" from the SDK's view — there's no turn-end while a tool is mid-execution.

| Aspect | Verdict |
|---|---|
| LOC | ~80 LOC in `forkConductorTool.js` + ~20 LOC update to manager brief in `forkService.js` |
| Risk to regular-fork case | None — purely additive new tool, regular forks never call it |
| Token cost | One tool call per manager run, with one ~2k-char structured result (sub_fork_ids × {status, result_head, next_step}). Net: comparable to today's successful polling managers, much cheaper than (a) heartbeat |
| Failure-mode taxonomy | (1) **Tool call exceeds max_wait_sec** → returns `{still_pending: [...]}`, model can call again or call `abort_fork` on stragglers. Bounded behaviour. (2) **Tool throws** → SDK gets isError=true, manager sees error, can retry or fall through to manual polling. (3) **Sub-forks crash mid-flight** → already terminal in os_forks, tool aggregates whatever final state exists. (4) **Process restart mid-tool** → manager's SDK stream is dead anyway, falls back to `recoverStaleForks` path that already exists |

**Why this beats the brief's three options:**
- Beats (a) heartbeat: structurally reliable (one tool call vs N model-compliance-dependent calls), token-cheaper, less brief language to maintain
- Beats (b) server-side auto-emit: preserves the manager's verification + FORK_REPORT-authorship contract; no race; simpler idempotence
- Beats (c) checkpoint-resume: no kv_store schema, no consolidation-fork slot, no continuity-loss; same SDK turn handles spawn + wait + verify + emit

---

## Section 4 — Recommendation: variant (a-prime), single blocking MCP tool

### Code sketch — `forkConductorTool.js` addition

Insert a new tool wrapper inside `_buildTools()` at `forkConductorTool.js:55-167`, between `send_message_tool` and the `tools` array assembly:

```js
const wait_for_sub_forks_tool = tool(
  'wait_for_sub_forks',
  'Manager-fork tool: block until every listed sub_fork_id reaches a terminal status (done, error, aborted, crashed) OR max_wait_sec elapses. Returns a structured aggregate of every sub-fork\'s final result_head + next_step + status. Use this ONCE after spawning your sub-forks instead of polling list_forks repeatedly — it keeps your SDK turn alive while the workers run, and consolidates the wait into one tool call. If the wait times out, the response includes still_pending: [...] so you can decide to call again, abort stragglers, or proceed with whatever finished.',
  {
    sub_fork_ids: z.array(z.string()).min(1).describe('The fork_ids you spawned. Get these from the spawn_fork tool responses.'),
    max_wait_sec: z.number().int().positive().max(3600).optional().default(1800).describe('Max seconds to block. Defaults to 1800 (30 min). Cap is 3600 (60 min). On timeout the tool returns still_pending instead of throwing.'),
    poll_interval_sec: z.number().int().positive().max(30).optional().default(5).describe('Server-side poll cadence. Defaults to 5s. Lower = faster wake on completion, higher DB query rate. 5s is fine for almost all cases.'),
  },
  async (args) => {
    const { sub_fork_ids, max_wait_sec, poll_interval_sec } = args
    const db = require('../db/pool').default
    const deadline = Date.now() + max_wait_sec * 1000
    const TERMINAL = new Set(['done', 'error', 'aborted', 'crashed'])
    while (Date.now() < deadline) {
      const rows = await db`
        SELECT fork_id, status, result, next_step, ended_at
        FROM os_forks
        WHERE fork_id = ANY(${sub_fork_ids})
      `
      const stillRunning = rows.filter(r => !TERMINAL.has(r.status)).map(r => r.fork_id)
      if (stillRunning.length === 0 && rows.length === sub_fork_ids.length) {
        const aggregate = rows.map(r => ({
          fork_id: r.fork_id,
          status: r.status,
          result_head: (r.result || '').slice(0, 600),
          next_step: r.next_step || null,
        }))
        return { content: [{ type: 'text', text: `All ${rows.length} sub-forks terminal.\n\n${JSON.stringify(aggregate, null, 2)}` }] }
      }
      await new Promise(r => setTimeout(r, poll_interval_sec * 1000))
    }
    // Timeout path — return whatever's terminal so far + which are still pending.
    const final = await db`SELECT fork_id, status, result, next_step FROM os_forks WHERE fork_id = ANY(${sub_fork_ids})`
    const stillPending = final.filter(r => !TERMINAL.has(r.status)).map(r => r.fork_id)
    return { content: [{ type: 'text', text: `Timed out after ${max_wait_sec}s. Still pending: ${stillPending.join(', ')}.\n\n${JSON.stringify(final, null, 2)}\n\nDecide: call wait_for_sub_forks again, abort stragglers, or proceed with what's done.` }] }
  },
)
```

### Brief change — `forkService.js:653-700`

Tighten the manager section of `_buildForkSystemPrompt`:

> _After spawning, call `mcp__forks__wait_for_sub_forks` with the list of sub_fork_ids you spawned and `max_wait_sec: 1800`. This BLOCKS your turn while the workers run — the SDK keeps your turn alive because a tool call is in flight. When the tool returns, every sub-fork is terminal and you have aggregated reports + next_steps. Do NOT use `list_forks` in a polling loop — that pattern fails (your turn ends between polls). Use `wait_for_sub_forks` once per consolidation cycle._

### Why this beats heartbeat (option a) on Tate's actual usage pattern

Tate's manager forks are mostly **5-worker short-pipelines** (Co-Exist feature batches, doctrine sweeps, audit-then-edit). Median sub-fork wall-clock is 5–15 minutes. A single blocking tool call covers that window with one 5s/poll cycle inside the SDK process — no extra turns, no extra round trips, no model compliance burden, no token overhead beyond the single tool call.

For the **occasional 30-stream pipelines** (e.g. `fork_motk2agr_7780e3` Co-Exist 1.8.3 Phase 1 RE-DISPATCH at 4288s = 71 min), the 1800s default times out gracefully, the manager sees `still_pending: [...]`, decides to call again or schedule_delayed for resumption. The "checkpoint-and-resume" shape (option c) emerges naturally as a corner case rather than the default.

---

## Section 5 — Status_board reference

Status_board row (per brief): "Manager-fork bail half: SDK idle-timeout while polling sub-forks - architectural fix needed"

Recommended next_action update: `"Implementation fork to ship mcp__forks__wait_for_sub_forks per ~/ecodiaos/drafts/manager-fork-bail-architecture-decision-2026-05-10.md (option a-prime, ~100 LOC across forkConductorTool.js + forkService.js manager brief)"`

next_action_by: `ecodiaos`
priority: 2

Implementation fork's brief should:
1. Reuse the code sketch above verbatim as a starting point
2. Add a contract test in `src/services/__tests__/` that spawns a fake manager + 2 fast workers + asserts the manager's transcript contains a successful `wait_for_sub_forks` call followed by `[FORK_REPORT]`
3. Update `~/ecodiaos/patterns/manager-forks-for-multi-worker-decomposition.md` "How it works" section to reference the new tool
4. Smoke test against a real 5-worker manager fork before claiming done

---

## Cross-references

- `~/ecodiaos/patterns/manager-forks-for-multi-worker-decomposition.md` — canonical contract; needs update after implementation
- `~/ecodiaos/patterns/sdk-mcp-server-instances-must-be-per-query-not-singleton.md` — constrains how the new tool must wire (per-query server, not singleton); the existing `getForkConductorMcpServer()` factory already follows this pattern, so adding `wait_for_sub_forks_tool` to the existing tools array is safe
- `~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md` — phantom_bail detection that surfaces the failure today
- `~/ecodiaos/patterns/prefer-hooks-over-written-discipline.md` — why option (a) heartbeat is structurally weak
- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` — relevant if option (b) is ever revisited (forkComplete listener path)
