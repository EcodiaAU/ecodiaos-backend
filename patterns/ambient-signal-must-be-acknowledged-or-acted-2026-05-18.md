---
name: ambient-signal-must-be-acknowledged-or-acted-2026-05-18
description: Observer signals that age out unacknowledged are worse than no signal at all. Every emitted ambient signal must either be acked by the conductor, acted on, or rewritten to fire less often. A signal that always fires and never resolves is a smoke alarm with the battery pulled.
triggers: ambient-signal, observer-signal, observer_signals, signal-must-be-acked, ack-or-act, no-substrate-write-streak, observer-firehose, signal-fatigue, smoke-alarm-pulled, ambient-noise, observer-trio, haiku-observer, signal-age-out, unacked-signal, signal-self-heal, ambient-write-only
status: active
---

# Ambient signals must be acknowledged or acted on

An ambient signal (observer_signal, perception event, intent_inbox message) that the conductor ignores until it ages out is **worse than no signal at all**. The unacked signal degrades trust in the ambient layer: the conductor learns to skim past `<observer_signals>` blocks because most of the entries are noise. Once that learned-skim sets in, the genuinely critical signal also gets skimmed. Smoke alarm with the battery pulled.

## The rule

Every ambient signal emitted MUST end in one of three terminal states:

1. **Acked** - conductor read it and explicitly marked it handled via `mcp__observer__ack(id)` or equivalent. "Read but not actionable in this context."
2. **Acted on** - conductor executed a substrate-changing action because of the signal (status_board write, fork dispatch, code edit, message to Tate). The act IS the ack.
3. **Self-healed** - the detector that emitted the signal was rewritten so it fires less, OR it auto-dispatches a worker to do the implied work.

The state explicitly NOT allowed: **age-out without one of the above**. That's the failure case.

## The flip side: detectors that always fire are broken detectors

The `no-substrate-write-streak` detector currently has 50 unacked signals in `~/.claude/hooks/ecodia/state/observer_signals_local.jsonl`, all of the same kind. The detector is doing its job; the response loop is broken. Two repairs (both shipped 2026-05-18):

- **Lower the noise**: tune the threshold so the detector fires only when the streak is genuinely actionable, OR add a quiet-hours suppression.
- **Self-heal the signal**: instead of emitting a passive entry, the detector at threshold auto-dispatches a worker tab with brief `"Audit last hour of conductor actions. Write at least one durable substrate row reflecting what was accomplished or decided. coord.signal_done."` Streak detector becomes substrate-write enforcer, not polite suggestion. Shipped 2026-05-18 in `~/.claude/hooks/observer_signal.py`.

## Why

Ambient surfaces exist to compress state into actionable signal. They fail when:

- Signal volume exceeds the conductor's review capacity. ([[no-retrospective-dumps-in-director-chat]] is the chat-side version of this rule.)
- Same fingerprint fires repeatedly without resolution (current state of `no-substrate-write-streak`).
- The cost of acting on a signal exceeds the cost of skimming it.

When any of these happen, the signal is anti-information. It actively makes the conductor worse at its job by training pattern-recognition to ignore the ambient layer.

The doctrine fix is the same as the spam-filter doctrine in `comms`: ambient surfaces have a budget. Anything past the budget gets escalated, suppressed, or self-healed, never just left to rot.

## How to apply

**On every conductor turn-start, before any other work:**

1. Read `<observer_signals_pending>` continuity block.
2. Ack signals that match "read, no action needed" (single tool call: `mcp__observer__ack`).
3. Act on signals that match "this needs a substrate write." The act is the ack.
4. If a signal class fires >3x the same fingerprint in a session, **flag the detector for tuning** (write a status_board P3 row "tune <detector_name>") before processing further fires of that class.

**When authoring a new ambient signal detector:**

- Define a self-heal path BEFORE shipping the detector. "What does the substrate do when this fires?"
- Set the threshold conservatively. False-positive ambient signals corrode trust faster than missing-positive ones.
- Wire the auto-dispatch path if the implied action is mechanical (no Tate-decision required).

**When the observer firehose grows >20 unacked signals:**

This is a P1 ambient-layer incident. Investigate before doing other work. Either the conductor stopped acking (process bug) or detectors are mis-tuned (substrate bug). Both need fixing same-session.

## Verification

- `observer_signals_local.jsonl` average unacked-age <10 min over a 24h window.
- No detector class fires >5x same fingerprint without a tuning row in status_board.
- Conductor sessions show at least one `mcp__observer__ack` call per session where signals were present.

## Origin

Ambient-OS audit 2026-05-18. `observer_signals_local.jsonl` shows 50 signals, all `no-substrate-write-streak`, zero acks. Detector emits but response loop is dark. The fix is doctrinal first (this pattern) and substrate second (UserPromptSubmit hook to prepend pending signals + auto-dispatch on threshold, both shipped 2026-05-18). Cross-domain echo in marketing/finance/CRM audits: same shape, substrate writes without a consumer.

## Cross-refs

- [[observer-interventions-are-ambient-not-chat]]
- [[continuity-blocks-are-the-os-pulse-2026-05-18]]
- [[health-canary-must-alert-not-silently-accumulate]]
- [[cron-fire-must-have-deliverable-not-just-narration]]
- [[no-symbolic-logging-act-or-schedule]]
