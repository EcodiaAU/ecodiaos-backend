---
triggers: forkComplete-listener, fork-error-perception, fork-status-error, conductor-chat-pollution, perception-fork-error, fork-error-listener, no-investigate-prompt, listener-emits-to-conductor
archived_at: 2026-05-26
archived_reason: sdk-fork-substrate-deprecated-2026-05-17
nuance_transferred_to: dispatch-worker-runtime-semantics-2026-05-26.md
---

# Fork error events stay in perception/forks_rollup; never become conductor chat messages.

## Rule

When an `os_forks` row transitions to `status='error'` or `status='aborted'`, the system MUST:

- publish a `fork_error` / `fork_aborted` event to the perception bus, AND
- log to the DB,

and MUST NOT:

- POST a wake message to `/api/os-session/message` like `"Fork fork_xxx completed with status=error (FAILED). Result: ... Next step: investigate. Source: forkComplete listener (sourceEventId=...)"`.

The conductor sees fork failures via two existing channels that already carry that information without polluting chat:

1. `<forks_rollup>` block stitched into the next user-message context by `osSessionService._sendMessage`.
2. `perception_summary` derived from the perception bus.

Conductor chat = Tate-typed messages + the conductor's own replies + (rare) error/exhaustion alerts. Listener-emitted fork-error narration is none of those.

## Do

- In `forkComplete` (and any sibling listener that handles fork-terminal events): for `status='aborted'` or `status='error'`, do publish to `perceptionBus`, do log to `logger.info`, do NOT call `_wakeOsSession`.
- For `status='done'`: continue to be silent (already correct per silent-ears architecture).
- For stale-heartbeat (running fork past 10min without progress): keep waking the conductor. A hung fork is different from a failed fork — the hang signal isn't otherwise captured.

## Do NOT

- Do NOT `axios.post('/api/os-session/message', { message: 'Fork ... completed with status=error ...' })` from any listener.
- Do NOT add a "next step: investigate" prompt as a chat message; the conductor decides whether to investigate on its next natural turn based on `<forks_rollup>` and status_board context.
- Do NOT carry the wrapped fork-result/next-step text into a conductor message; perception bus payload + DB logs are enough.

## Verification

```bash
grep -rn "Next step: investigate\|completed with status=error" ~/ecodiaos/src/services/listeners/
```

Should return zero hits. The previous wake-POST string is the canonical fingerprint for this anti-pattern.

```bash
grep -rn "_wakeOsSession\|/api/os-session/message" ~/ecodiaos/src/services/listeners/forkComplete.js
```

Should return only the stale-heartbeat path (running fork hung 10+ min without heartbeat). Terminal-error path must not call `_wakeOsSession`.

## Origin

Tate verbatim 5 May 2026 12:40 AEST: "Stop dealing with this in the conductor chat for fuck sake. You're still dealing with things in the conductor too much".

The forkComplete listener was emitting `"Fork fork_xxx completed with status=error (FAILED). Result: none. Next step: investigate. Source: forkComplete listener (sourceEventId=...)"` into the conductor's chat stream every time a sibling fork errored or aborted — duplicating the `<forks_rollup>` signal the conductor already sees via context-stitching.

## Cross-refs

- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` — every listener subsystem has 5 layers; the `side-effect` layer here moves from "POST chat message" to "publish perception only".
- `~/ecodiaos/patterns/no-retrospective-dumps-in-director-chat.md` — director-chat hygiene: actions taken (1 line), forks dispatched (1 line), blockers (1 line). Listener-emitted fork-error narration violates this just as a retrospective dump does.
- `~/ecodiaos/patterns/system-injection-blocks-must-not-render-in-director-chat.md` — companion rule on the frontend side: continuity blocks render to a context column, not chat. Same posture: listener output is context, not message.
- Silent-ears architecture (forkComplete header, Tate 30 Apr 2026 13:18 AEST): `done` was already silent. This rule extends that to `error` + `aborted`.

---

## CLARIFICATION (Tate 6 May 2026 ~10:29 AEST) — successful done WITH FORK_REPORT MUST wake

**Scope of the rule above:** the silent-on-listener-emission contract applies to `status='aborted'` and `status='error'` ONLY. It does **not** apply to `status='done'` with a real `[FORK_REPORT]` body — those MUST wake the conductor. That is the autonomy delivery path.

**Why the carve-out:** the silent-on-done branch added 5 May 2026 (in the original interpretation of this rule) overshot. Errors/aborts SHOULD stay silent because the conductor sees them via `<forks_rollup>` context-stitching on the next natural turn. But successful completions with a FORK_REPORT body are the actual deliverable of fork-driven work — they need to land in the conductor's inbox the moment the fork closes, not on the next Tate-typed message or scheduled cron tick.

**Tate verbatim 6 May 2026 ~10:29 AEST:** "some forks still arent returning a fork report since they jsut turn into queued messages and dont really send until i send a message which doesnt work for autonomy".

**Mechanics:** `forkService._enqueueForkReport` puts the FORK_REPORT into `messageQueue` with `mode='queue'`. Without a wake trigger, that row sits there until the next direct message arrives at `/api/os-session/message` (drained by `drainIntoDirectMessage`) or the meta-loop cron fires (hourly). Both paths break autonomy when Tate is away. The `forkComplete` listener now POSTs a wake to `/api/os-session/message` in `direct` mode for `status='done'` with a non-empty, non-phantom-bail result — that POST drains the queued report alongside a brief wake notification in a single turn.

**The status='done' decision tree:**
- `result` empty OR starts with phantom-bail marker `(no [FORK_REPORT] emitted` → SILENT (no wake POST). Phantom-bails are forks that closed without emitting the closing tag; the inbox already has a `no_report_emitted=true` SYSTEM message via the forkService enqueue path.
- `result` is a real FORK_REPORT body → WAKE via `_wakeOsSession` with a short `[SYSTEM: fork_report fork_xxx wake_on_done=true]` excerpt header. The full queued report drains automatically via `drainIntoDirectMessage` prepending.

**The status='aborted' / status='error' decision tree is unchanged** — still silent per the original 5 May 2026 rule above.

**Verification:**

```bash
grep -nE "wake_on_done=true|FALLBACK_MARKER_PREFIX" ~/ecodiaos/src/services/listeners/forkComplete.js
```

Should return at least 2 lines: the constant declaration and the wake-message construction.

```bash
grep -nE "if \(status === 'done'\)" ~/ecodiaos/src/services/listeners/forkComplete.js
```

Should show the done branch reads `row.result`, checks empty/phantom-bail, and conditionally POSTs.

**Origin:** Tate verbatim 6 May 2026 ~10:29 AEST. Fork-driven autonomous chains were stalling because successful FORK_REPORTs were queueing without delivery. The fix preserves the 5 May "no chat-stream pollution from errors" rule while restoring the autonomy delivery path for successful completions.
