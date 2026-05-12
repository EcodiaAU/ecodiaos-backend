---
triggers: observer-interventions, observer-signals, haiku-observer, coherence-observer, action-audit-observer, attention-economy-observer, observer-postIntervention, observer-pollution, chat-pollution, observer-loop, meta-cognition-substrate, observer-feedback, observer-ack, observer-mute, observer-conflict, observers-not-user-input, observer-as-tate, observer-recursion
---

# Observer interventions are ambient context, never user-source chat

Rule. Haiku meta-cognition observers (Coherence / Action-Audit /
Attention-Economy / future) MUST write interventions to the
`observer_signals` substrate and MUST NOT POST to `/api/os-session/message`.
The conductor reads observer output via the `<observer_signals>` turn-start
continuity block (ambient context), never as user input. If an observer
intervention shows up in the chat stream as `tate\n<observer source=...>`,
that is the bug.

**Why:** Tate verbatim 13 May 2026: *"all the coherence stuff is coming
through main chat and polluting the os context.... its doing what we
didnt want it to do right?"* Yes — the original `_postIntervention` path
sent observer messages through the same `/api/os-session/message` wire as
Tate's typed input. Frontend rendered them as user-source bubbles.
Conductor treated them as new Tate input → responded → observer fired on
the response → loop. Observer noise also accumulated in
`os_session_messages` and contaminated the conductor's `recent_exchanges`
context window. Architectural breach: observers ARE NOT users.

**How to apply (producer side):**
- Every Haiku observer module routes intervention output through
  `observerSignalsService.writeSignal({ observer_name, signal_kind,
  message, reason, confidence })`. The `_observerBase._postIntervention`
  wrapper does this for you — don't re-implement.
- Confidence floor: 0.85. Anything below should not fire.
- Self-mute: same fingerprint 3× in 10min triggers automatic 1h cooldown
  + a status_board P3 row for tuning visibility.
- Conflict resolution: if another observer has an overlapping unacknowledged
  signal (Jaccard ≥ 0.3 on tokens, 5min window), both are suppressed in
  favor of a single `conflict_resolved` signal that surfaces the
  disagreement.
- 30-min expiry: stale unacknowledged signals auto-disappear.

**How to apply (consumer side):**
- Conductor sees `<observer_signals count="N">` block at turn-start with
  confidence-weighted ordering and an explicit header reminding it the
  content is meta-cognition not user input.
- When the conductor acts on a signal, call `mcp__observer__ack(id)` (or
  equivalent endpoint) to mark `acknowledged = true` so it doesn't
  re-surface.
- If a signal feels wrong or the observer is looping, the conductor can
  IGNORE — the signal auto-expires + future fingerprint repeats trigger
  the observer's self-mute.
- Observer signals are advisory. The conductor decides.

**How to apply (frontend):**
- ChatLog renders only conversational messages. Any message whose content
  begins with `<observer source=` is stripped at render. Defensive — the
  backend already routes them to the new substrate, but this catches
  legacy artifacts from older sessions.

**Verification (post-deploy):**
- `SELECT COUNT(*) FROM os_session_messages WHERE source='observer' OR
  body LIKE '%<observer source%';` after deploy should be **0** for all
  rows newer than the deploy timestamp.
- `SELECT COUNT(*) FROM observer_signals;` should grow as observers fire.
- Conductor turn-start logs `OS Session: stitching continuity blocks into
  user message` should include `observer_signals: true` when signals
  are present.
- Frontend chat stream contains zero `<observer source=` strings.

**Origin:** 13 May 2026. The observer-pollution bug surfaced ~45min after
the Haiku Observer Trio was wired (the Trio's _postIntervention used
axios.post to `/api/os-session/message`). Tate flagged it within minutes
of observing the conductor responding to its own observer interventions
as if Tate had typed them. Architectural rewrite shipped commit `084c00f4`
(observer_signals substrate) + `f54d1006` (migration index fix) +
ecodiaos-frontend `eb1c8531` (chat strip).

**Cross-refs:**
- [[decision-quality-self-optimization-architecture]] — observers are
  Layer 3 of the architecture; this pattern defines their substrate
  contract.
- [[haiku-semantic-reviewer-complement-to-heuristic-hooks]] — semantic
  review is observer-class work.
- [[tate-facing-context-blocks-must-not-render-to-frontend]] — same
  doctrine class: model-context blocks ≠ chat surface.
- [[system-injection-blocks-must-not-render-in-director-chat]] — the
  original chat-stream-hygiene doctrine this extends.
- [[perception-must-not-claim-chain-exhausted-from-single-fork-error]] —
  sibling doctrine for another class of telemetry-vs-reality mismatch.
