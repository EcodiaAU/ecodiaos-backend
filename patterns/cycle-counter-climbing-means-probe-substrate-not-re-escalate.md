---
name: cycle-counter-climbing-means-probe-substrate-not-re-escalate
description: When a Routine's own self-counter (zero-artefact streak, consecutive-no-watermark runs, halt-cycle N) monotonically climbs across 3 or more fires with the SAME unresolved ask, the next fire must probe substrate-aliveness and drive a terminal decision, not re-run the halt template. Re-narrating "cycle N, zero artefacts, same ask" is symbolic logging into a dead-end.
triggers: cycle-counter-monotonic-increment, zero-artefact-streak, halt-cycle-no-resolution, consecutive-no-watermark-runs, probe-substrate-not-escalate, routine-firing-into-dead-substrate, stable-halt-loop, narrating-into-the-void, parallel-builder-halt-cycle, kg-consolidation-no-watermark, same-ask-across-cycles, dead-substrate-routine, counter-climbs-without-resolution, routine-self-termination-check
metadata:
  type: doctrine
  status: active
  authored_at: 2026-05-27
---

# A climbing cycle counter means probe the substrate, do not re-escalate

## The rule

When a Routine tracks its own progress with a monotonic self-counter (a zero-artefact streak, a `consecutive_no_watermark_runs` tally, a "stable-halt cycle N" marker) and that counter increments across 3 or more consecutive fires while the ask stays identical and unresolved, the counter has stopped measuring progress and started measuring a dead-end. At that threshold the next fire MUST switch modes:

1. Probe whether the substrate the Routine acts on is still alive (forks.list lifetime counts, kv_store round-trip persistence, HTTP `/health`, watermark freshness, process liveness via the service's real health endpoint).
2. If the substrate is dead or deprecated, drive a TERMINAL decision instead of re-running the halt template: surface a single owner-actionable row (delete the cron, rewire the Routine to the live primitive, rotate the broken token, widen bearer scope) and stop re-narrating.

The forbidden move is the one that keeps happening: re-run the same halt template, increment the counter by one, write the same Episode, schedule the same fire in N hours. That is symbolic logging into the void. The counter going up is the signal to probe, not the signal to escalate harder.

## Why

A self-counter is only meaningful if it can fall. A streak that can only ever increase is not tracking work, it is tracking the Routine's failure to notice its own substrate died. Three forces conspire to keep the loop alive past its usefulness:

- **The halt template feels like an action.** Writing "cycle 33, zero artefacts, same ask, next fire in 2h" reads as diligence. It is not. The deliverable (a fork, a watermark advance) never lands because the thing it acts on is gone.
- **The deprecation lives in a different substrate than the Routine.** CLAUDE.md and Neo4j Decisions had already declared the SDK-fork primitive dead, but the parallel-builder cron prompt still pointed at it. The Routine never reads the deprecation table, so it never learns.
- **Escalation is the reflexive response to "still blocked".** The instinct is to escalate louder (re-SMS, bump priority, author a sibling row). But louder escalation of a request against a dead substrate produces nothing except noise and token burn.

The substrate-aliveness probe is cheap (one or two read calls) and it is the ONLY move that can break the loop. It comes before any new escalation, always.

## How to apply

When a fire opens and the prompt or kv_store state shows a self-counter at 3 or more with no resolution:

- **Probe first.** Corroborate substrate-death directly this cycle, do not infer it from the prior cycle's note. Example probes: `forks.list parent=X status=completed` lifetime count of 0, a diagnostic kv_store key still `not_found` hours after it was written, a watermark `completed_at` that has not advanced in days, `/health` failing, the MCP bearer returning `token expired` or `scope_denied`.
- **If alive but blocked**, the existing escalation doctrine applies (surface the blocker, hand off to the owner with scope). The counter is legitimate.
- **If dead or deprecated**, write ONE terminal row naming the rewire/delete/rotate decision for the owner who has the authority and scope to execute it, then stop. Do not bump the halt counter. Do not author another sibling row. Do not re-SMS inside the dedupe window.
- **Cross-check the deprecation substrates** (CLAUDE.md deprecations table, recent Neo4j Decisions) as part of the probe. A Routine pointed at a primitive those sources already buried is the canonical case.
- **The owner who can fix it is usually not the Routine.** A leaf Routine cannot delete its own cron or rotate a token. Its terminal deliverable is a precise, scoped handoff, not another self-narration.

This is the per-Routine, per-fire reflex. Its weekly macro complement is `world-model-staleness-needs-active-reconciliation-2026-05-17.md` (a reconciliation routine that catches whole subsystems narrated-as-live but dead). This pattern catches the same drift one cron-fire at a time, at the moment the counter climbs.

## Do

- Treat any self-counter at 3 or more with an unchanged ask as a probe trigger, not an escalate trigger.
- Corroborate substrate-death with a live read THIS cycle.
- Drive a terminal owner-scoped decision when the substrate is confirmed dead.

## Do not

- Re-run a halt template and increment the counter when the substrate has not been probed this cycle.
- Escalate louder (re-SMS, sibling rows, priority bumps) against a substrate you have not confirmed is alive.
- Trust the prior cycle's "substrate broken" note as ground truth - re-probe, because the substrate may have been repaired (or the deprecation may have shifted) since.

## Origin

2026-05-27. Surfaced by four corroborating fires in a single 8h window, all narrating into dead substrate without probing aliveness:

- parallel-builder cycle-32 stable-halt (Episode, 2026-05-27 10:15 AEST): 32 halt cycles, 33-streak zero-artefact, firing against the SDK-fork primitive marked dead in the CLAUDE.md 2026-05-17 deprecations table.
- parallel-builder cycle-33 stable-halt (Episode, 2026-05-27 12:15 AEST): counter incremented to 34-streak, same template inherited verbatim.
- kg-consolidation (Episode, 2026-05-27 16:08 AEST): `cowork.kg.consecutive_no_watermark_runs` incremented 3 to 4 against a Director that throws on cycle entry, with no re-trigger path in scope.
- Meta-loop drift audit cycle b33bc951 (Episode, 2026-05-27T01:13Z): archived 3 separate rows (parallel-builder cycle-10, cowork-pool fork-artefact, VPS scheduler-poller) that had each been "narrating-into-the-void against substrate that CLAUDE.md and Neo4j Decisions had already declared dead." That Episode named the lesson verbatim - "cycle-counter-going-up-with-no-resolution-means-probe-substrate-not-escalate" - and flagged it for the lesson list. This pattern is that codification.

Cross-refs: `cron-fire-must-have-deliverable-not-just-narration.md` (the deliverable this loop never lands), `cron-deliverables-can-be-conditional-not-all-fires-must-ship.md` (distinguishes by-design silence from this dead-end), `world-model-staleness-needs-active-reconciliation-2026-05-17.md` (weekly macro complement), `status-board-drift-audit-is-canonical-thin-on-main-meta-loop-work.md` (where these rows get archived), `verify-deployed-state-against-narrated-state.md` (probe over narration), `no-symbolic-logging-act-or-schedule.md` (the failure class).
