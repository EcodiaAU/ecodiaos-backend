# Scheduler Signal_Bound RCA – 2026-06-08

## Status
IDENTIFIED: Root cause found. Workers dispatch successfully but scheduler dispatch always times out on signal_bound poll.

## Evidence

### Error Log
Every dispatcher invocation hits 180s (now 600s per line 46 SIGNAL_BOUND_TIMEOUT_MS) timeout:
```
[scheduler] dispatchOne: signal_bound timeout for task 8b4af63a-519e-4940-b676-460b8205b78c (tab tab_1780872404910_67cf2068)
[scheduler] dispatchOne: signal_bound timeout for task 09a70d31-045e-4519-a1d2-f2162caf16fd (tab tab_1780873675052_df6f4603)
```

Tabs ARE spawning (tab_ids land in logs), no "populate failed" or "no IDE instances" errors → brief is pasting successfully.

### Code Path Analysis

**scheduler.js (dispatchOne)**
- Line 325-350: waits for message with `body.type === 'bound' && body.task_id === taskId` on `chat.conductor.inbox`
- Polls for up to 600s (line 46: SIGNAL_BOUND_TIMEOUT_MS)
- Never receives the bound message → times out and closes launch-lock anyway (line 422 finally block)
- Cron rows reset on retry per [[scheduler-no-ide-defer-and-cron-rows-never-permanently-fail-2026-06-02]] causing infinite cycle

**cowork.js (dispatch_worker)**
- Line 459: calls `ideRoutes.chat_send_message({ prompt: composedBrief, submit: false })`
- composedBrief comes from composeBrief() function (line 388-398)

**cowork.js composeBrief (line 166-233)**
- Line 207: tells worker **FIRST ACTION is `coord_verify_paste`**, NOT `coord_signal_bound`:
  ```
  'FIRST ACTION (mandatory, before any task work):\n' +
  '  mcp__coord__coord_verify_paste({tab_id:"' + tab_id + '", tab_credential:"' + tab_credential + '", task_id:"' + task_id + '"})\n'
  ```
- Line 225: tells worker to call `coord_signal_done` on completion (NOT signal_bound)

**coord.js signal_bound (line 819-840)**
- Exists and is exported (line 1153)
- Posts message with `type: 'bound'` to `chat.conductor.inbox` (line 830)
- But worker is NEVER told to call this; brief only mentions verify_paste and signal_done

## Root Cause

**Scheduler expects worker to call `coord.signal_bound` as first action (scheduler.js line 133 via old buildBrief)**
**But cowork.dispatch_worker uses a DIFFERENT brief (composeBrief) that tells worker to call `coord.verify_paste` first (cowork.js line 207)**

The scheduler's buildBrief function (lines 123-152) is a **stale template** never used by the actual dispatch path:
- scheduler.js buildBrief is called at line 293 with the brief_body
- But dispatch_worker at line 297 ignores scheduler.buildBrief output. It passes just `brief: <brief_body>` to cowork.dispatch_worker
- cowork.dispatch_worker then wraps it in its own composeBrief, which has NO reference to signal_bound

The **two brief templates are incompatible**:
1. **scheduler.buildBrief** (scheduler.js line 133): tells worker to call `coord.signal_bound({task_id})`
2. **cowork.composeBrief** (cowork.js line 207): tells worker to call `coord.verify_paste({tab_id, tab_credential, task_id})`

Since dispatch_worker uses composeBrief (the one that gets pasted), the worker never learns about signal_bound.

## Ranked Hypotheses

### H1: Scheduler and dispatch_worker use different brief templates (CONFIRMED ROOT CAUSE)
**Evidence FOR:**
- scheduler.buildBrief (line 133) explicitly calls for `coord.signal_bound({task_id})`
- cowork.composeBrief (line 207) explicitly does NOT mention signal_bound; it calls for `coord.verify_paste`
- dispatch_worker calls composeBrief (line 388), not scheduler.buildBrief
- Error log shows signal_bound timeout on every dispatch despite tabs spawning + pasting
- coord.signal_bound exists and works (code is sound); it's just never called

**Evidence AGAINST:**
- None. This is clearly the issue.

### H2: Worker never reaches FIRST ACTION due to brief paste truncation
**Evidence FOR:** cowork.composeBrief does mention paste-verify as a guard (line 208-215)
**Evidence AGAINST:** cowork already moved to editor.open (line 423) which pre-fills the input, removing clipboard race; compose brief length is ~1.5KB, well under 100KB cap (line 77)

### H3: coord MCP not loaded in new chat session
**Evidence FOR:** None concrete
**Evidence AGAINST:**
- .mcp.json on Mac (backend/.mcp.json lines 3-9) properly wires coord to localhost:7456
- laptop-agent is listening on 7456 (verified: lsof shows node 74973)
- If coord weren't loaded, verify_paste would fail (but worker would try it and fail; scheduler doesn't see that)
- Brief explicitly tells worker to use `mcp__coord__coord_verify_paste` calling convention

### H4: On Mac, keystroke or focus model is broken
**Evidence FOR:** None in this window; all errors are scheduler-side timeouts, not dispatch_worker failures
**Evidence AGAINST:**
- dispatch_worker succeeded (returned ok:true, per cowork.js line 790-813)
- Tab was spawned, brief was pasted (no orphan/paste_error)
- cowork moved off keystroke to editor.open + atomic focus_and_send (line 423+)

## Fix

**Option 1: Make scheduler.dispatchOne wait for verify_paste instead of signal_bound** (safest, minimal change)

scheduler.js line 335, change:
```javascript
if (body && body.type === 'bound' && String(body.task_id) === taskIdStr) {
```
to:
```javascript
if (body && body.type === 'verify_paste_ok' && String(body.task_id) === taskIdStr) {
```

But coord_verify_paste does NOT post a typed message back to conductor. It just returns {ok, brief_body, ...} to the worker. So this won't work.

**Option 2: Add signal_bound call to composeBrief** (correct: restores intended handshake)

cowork.js composeBrief (line 205-215), INSERT BEFORE verifyFirst:
```javascript
const signalBound =
  'FIRST ACTION (mandatory, before any task work):\n' +
  '  mcp__coord__coord_signal_bound({tab_id:"' + tab_id + '", tab_credential:"' + tab_credential + '", task_id:"' + task_id + '"})\n' +
  'This confirms to the scheduler that you received the brief and are ready to work.\n' +
  'Then verify the pasted content via coord_verify_paste below.\n'
```

And change verifyFirst to start at 'SECOND ACTION':
```javascript
const verifyFirst =
  'SECOND ACTION (verify paste integrity):\n' +
  '  mcp__coord__coord_verify_paste({...\n'
```

Then in return statement (line 232), change to:
```javascript
return [header, '', identity, '', signalBound, '', verifyFirst, '', taskBlock, '', constraints].join('\n')
```

This restores the scheduler→worker handshake that buildBrief intended but dispatch_worker broke by not calling it.

## Recommendation

**Option 2 is correct.** The scheduler explicitly expects signal_bound as the first-action acknowledgment (scheduler.js line 120-121 docstring + line 133). cowork.composeBrief should honor that contract. Adding signal_bound before verify_paste maintains both the scheduler's deadlock-prevention (launch-lock release) and the worker's paste-verification (verify_paste still runs second).

**Files to modify:**
- `/Users/ecodia/.code/eos-laptop-agent/tools/cowork.js` line ~205: add signalBound block and update verifyFirst label + return statement

**Testing:** After fix, next scheduler dispatch should print:
```
[scheduler] dispatchOne: signal_bound acknowledged for task <uuid> (tab <tab_id>) within <Xms>
```
instead of timeout.
