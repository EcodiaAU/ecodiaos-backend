---
triggers: whole app mapped, test coverage scope, partial surfaces, coverage manifest, COVERAGE.md, route enumeration testing, how much of the app is tested, map the whole app, authoring queue flows, coverage regression
priority: critical
canonical: true
binding: cron=cowork.app-tests-nightly + files=<app-repo>/.maestro/COVERAGE.md
---

# Test-suite scope is the WHOLE route enumeration, not the harvested subset

## 1. The rule

When standing up or extending an app's test suite, the scope is EVERY
route/destination enumerated from source (router paths, NavHost
composables, Routes objects), written into `<repo>/.maestro/COVERAGE.md`
as a per-route status table (COVERED / PARTIAL / UNCOVERED / BLOCKED
with reason). "The flows are green" is meaningless without the
denominator. Coverage claims quote covered/total from the manifest,
never an impression.

## 2. Why

2026-06-10, Tate verbatim: "Is the whole of each of the apps mapped
tho? It still sounds like you're doing partial surfaces" then "i
shouldnt need ot ne pushing you to actually map the whole app... this
is jsut the most obvious thing if we're building somehting to tst an
app... a broken app release is the worst thing for us." The suite had
been built outward from harvested screenshots (9 of 124 coexist routes,
2 of 19 locals, 5 of 23 glovebox, 0 of 16 goodreach) and narrated as
"the entire observed app". Harvest-first is correct for ANCHORS; it is
the wrong basis for SCOPE. Scope comes from source enumeration; the
harvest then serves each queued surface.

## 3. How to apply

- Enumerate from source the day the suite starts: `grep path=` on the
  SPA router, `composable(`/Routes objects on Compose, router.tsx on
  React. The enumeration commit is the suite's first commit.
- COVERAGE.md lives next to the flows and updates in the SAME commit as
  any flow change (extends the flow-lifecycle rule in
  [[maestro-mobile-stably-web-are-canonical-app-testing-2026-06-10]]).
- A route is COVERED only when a flow drives it green on-device with
  dump-verified anchors. PARTIAL means reached but thinly asserted.
  BLOCKED requires the named blocker (row id where tracked).
- The nightly run reports covered/total per app alongside the verdict;
  a shrinking covered count or a manifest that no longer matches the
  source enumeration is a finding.
- Uncovered routes are an authoring QUEUE with priorities, worked by
  parallel workers until the map is whole; new routes added by feature
  PRs enter the manifest in that PR.

## 4. Anti-patterns

- Calling a suite "full-app" because it touches every tab (tabs are not
  routes).
- Scoping from screenshots: the harvest can only show what it already
  visited.
- Marking BLOCKED without the reason and tracking row.
- A feature PR adding a route without a manifest line.

## 5. Cross-references

- [[maestro-mobile-stably-web-are-canonical-app-testing-2026-06-10]]
- [[visual-judgement-rubric-nightly-app-tests-2026-06-10]]
- [[verify-e2e-harness-loads-before-claiming-coverage]]

## 6. Origin

2026-06-10, Tate's whole-app-mapped pushback on the Maestro suite
buildout, same day as the buy-before-build pivot.
