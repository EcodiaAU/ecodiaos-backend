---
triggers: green run suspect, fault yield, tests all passing, all green suite, what is testing for, catch faults not pass tests, discrimination strength, weak asserts, render assert coverage, zero findings run, test suite goal, suite under-discriminating
priority: critical
canonical: true
binding: cron=cowork.app-tests-nightly + files=<app-repo>/.maestro/COVERAGE.md
---

# Fault yield is the goal; an all-green run on an imperfect app indicts the suite

## 1. The rule

The testing substrate exists to CATCH FAULTS in our work, not to
produce green runs. Tate verbatim, 2026-06-11: "our goal with this
testing is absolutely NOT to get runs to come out green. That is a
false win... a test passing green on ANY of our apps right now is
actually a fail, because they cant possibly be perfect."

Operationally: a run across a whole app with ZERO findings is treated
as evidence the suite is under-discriminating, and triggers an
assert-strengthening pass on its weakest flows. The suite's success
metric is its catch record (real faults found, filed, fixed), never
its pass rate or its covered/total count alone.

## 2. Why

Coverage drives toward Goodhart failure: an author rewarded for
flipping routes to COVERED writes the weakest assert that passes
(screen mounts, anchor visible) and the suite goes green while math is
wrong, layouts are broken, images are dead, and journeys dead-end.
Render asserts catch the white-screen class and nothing else. The
2026-06-10/11 catch record proves the machinery CAN discriminate when
asserts are strong: cold-start blank (1b1e718d), tab-back exits app
(F2), admin deep-link auth bypass (F3), Guide card stub, Places tile
no-op, 5 empty /admin/email tabs, 84/90 dead avatars. Every one of
those came from an assert or probe designed to fail, not to pass.

## 3. How to apply

- **Every flow names its fault class.** A comment at the top of each
  flow states what real bug would turn it red (and the row id if it
  guards a known one). A flow whose author cannot name the fault it
  catches is scaffolding, not coverage.
- **Assert ladder, climb it:** render anchor (weakest, catches
  white-screen only) -> journey completion (catches dead-ends,
  broken nav) -> state persistence (kill+relaunch, catches storage
  regressions) -> data invariance (on-screen number vs DB truth via
  copyTextFrom + runScript, catches wrong math) -> cleanup verified
  (create-assert-DELETE-assert-gone, catches leaky writes) -> visual
  rubric on the gallery (catches everything structure cannot).
  COVERAGE.md notes which rung each COVERED route sits on; render-only
  rows are explicitly marked render-only.
- **Zero-findings run = discrimination audit.** The nightly worker, on
  any app finishing with 0 findings (structural AND visual), picks the
  3 weakest flows for that app and strengthens one rung each, same
  night. Green is never reported without the audit.
- **Strict canaries never weaken.** Known bugs keep one unhealed
  canary asserting the BUG state; a canary that flips silently is a
  finding in itself.
- **The ship gate stays green-keyed** (a red suite blocks a ship), but
  green-and-shipped is the floor, not the win. The win is the findings
  ledger growing and being fixed.
- **Findings are actionable or they are noise** (Tate 2026-06-11: "as
  real and thorough as possible... as little false positives and as
  accurately as possible give us ways to fix the apps or improve").
  Every filed finding carries: the surface (route + screenshot), the
  repro (flow + step), a root-cause pointer (file:line or component
  when traceable), and a proposed fix path. Before filing, re-run the
  failing step once and check the alternate explanation (timing, stale
  state, emulator quirk); a finding that survives that probe files, one
  that does not gets the flow hardened instead. False positives erode
  the ledger's authority exactly like missed faults erode the suite's.

**General form:** any verification substrate (tests, canaries, audits,
monitors) is measured by what it CATCHES, not by how often it passes;
a clean result from a checker pointed at a system known to be imperfect
impeaches the checker first. Applies to dept canaries, drift audits,
voice scoring, and claim gates exactly as to app tests.

## 4. Anti-patterns

- Reporting "all flows green" as success without findings context.
- Authoring assertVisible-only flows to flip COVERAGE.md rows.
- Loosening an assert to stop a red (accommodation); the red is the
  product working as designed.
- Treating the visual-judgement pass as optional on green runs; the
  washed-tint class ships exclusively through structural greens.

## 5. Cross-references

- [[maestro-mobile-stably-web-are-canonical-app-testing-2026-06-10]] (the dual activity)
- [[test-suite-scope-is-the-whole-route-enumeration-2026-06-10]] (the denominator)
- [[visual-judgement-rubric-nightly-app-tests-2026-06-10]] (the judging half)
- [[outcome-inference-must-seek-evidence-of-failure]]

## 6. Origin

2026-06-11, Tate's orientation check while the coverage fleet ran:
green-run celebration was drifting in as the implicit goal; this
pattern pins the true objective before the substrate calcified around
the wrong metric.
