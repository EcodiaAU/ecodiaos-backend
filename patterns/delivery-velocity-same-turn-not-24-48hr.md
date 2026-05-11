---
triggers: delivery-timeline, same-turn-delivery, 24-48hr-timeline, same-session-ship, old-world-practices, scoped-work-now, delivery-velocity, no-delay-on-scoped-work, ship-it-now, when-can-you-deliver
---

# When scope is clear and tools are available, ship this session - not in 24-48 hours

## Rule

When work is scoped and Ecodia's tool surface can execute it (Factory + forks + MCP), the
default delivery target is the CURRENT SESSION. Quoting a 24-48 hour timeline for
clearly-scoped work anchors to pre-automation delivery speed, signals a capacity constraint
that does not exist, and undersells the autonomous toolchain.

Tate verbatim, 17:00 AEST 11 May 2026: "no need for 24-48hr timeline, that's old-world
practices."

## Do

- When a scoped task arrives (bug fix, feature add, CMS change, copy edit, admin wiring),
  dispatch Factory or a fork immediately and aim to close the loop in the same session.
- For standing-arrangement clients (Angelica/Resonaverde), same-session delivery is the
  default - the standing arrangement exists precisely to collapse the turnaround time.
- When a delivery estimate is needed, name the actual blocker: "shipping this turn unless
  Vercel alias takes extra time" beats "should be done in 24-48h".
- State completions in the same reply where you commit to doing the work, so the recipient
  reads "done" instead of "queued".

## Do Not

- Quote 24-48 hours for work that can be scoped and dispatched right now.
- Use a timeline estimate as a hedge or a safety buffer when no genuine external blocker exists.
- Conflate "I haven't started it yet" with "it will take 24-48 hours."

## Legitimate blockers that extend beyond same-session

These are the only cases where a next-session or multi-day timeline is accurate:

- Tate visual-verify required before client gets the URL
- Client sign-off required before going live
- App Store or Google Play review queue (external, outside our control)
- Vercel alias reassignment requiring DNS propagation
- Staged work gated on another in-flight Factory session completing first
- Work explicitly scoped for a future milestone by Tate or the client

Name the specific blocker when quoting a delayed timeline. "Needs Tate visual-verify before
pushing live - should be done in the session after he's available" is accurate. "24-48
hours" is vague and implies a capacity constraint that doesn't reflect the toolchain.

## Verification

Before quoting a delayed timeline, ask: can I dispatch Factory or a fork for this right
now? If yes, do it now. Name the real remaining step (review, approve, Tate-check,
propagation) rather than anchoring to a generic turnaround window.

## Origin

Tate verbatim, 17:00 AEST 11 May 2026: "Also would be great to get resonaverde stuff done
now, no need for 24-48hr timeline, that's old-world practices." Said in the context of a
manager fork shipping 4 Resonaverde features in the same session after Angelica's standing
arrangement request arrived at 13:03 AEST that day.

## Cross-refs

- `~/ecodiaos/patterns/action-over-plans-honesty-redeems-mistakes.md` - action-over-plans
  principle: "A plan that doesn't ship is a fiction. The deliverable on disk is the only
  artefact that counts."
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` - scheduling future delivery
  when same-session delivery is possible = symbolic activity
- `~/ecodiaos/patterns/route-around-block-means-fix-this-turn-not-log-for-later.md` - action
  window is this turn, not a future window
- `~/ecodiaos/patterns/angelica-resonaverde-standing-arrangement.md` - standing arrangement
  where this velocity expectation is most operationally active
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` - this file
  exists because the directive was stated and needs to survive cold starts
