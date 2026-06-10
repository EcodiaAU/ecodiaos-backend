---
triggers: release walker matrix, state matrix testing, pairwise cells, permission state testing, pm grant pm revoke walker, simctl privacy walker, appearance dark cell, font_scale cell, network offline cell, data_state returning, matrix release gate, release cut gate, mobile app release verification, walk away from a release, operator away release safety, walker editfield target, capacitor input fill editfield, fill-verify probe, offline white screen capacitor, cell state reset baseline, uncovered dimensions verdict
priority: low
canonical: false
status: archived
superseded_by: maestro-mobile-stably-web-are-canonical-app-testing-2026-06-10
binding: hook=release-walker-ship-gate.py + skill=release-walker + cron=cowork.release-walker-nightly + script=backend/scripts/release-walker/bin/release-walk.sh
---

# [ARCHIVED 2026-06-10, same day] Release gate = spec flows x state-matrix cells + exploration

> ARCHIVED hours after going green: the bespoke engine was retired per
> [[buy-before-build-market-sweep-gates-infrastructure-builds-2026-06-10]]
> and deleted from the tree (git history keeps it). Maestro + Stably are
> canonical per [[maestro-mobile-stably-web-are-canonical-app-testing-2026-06-10]].
> The state-DIMENSION analysis and device gotchas below still hold and
> inform Maestro flow authoring; the engine sections do not.

## 1. The rule

A production release gate for a mobile app runs its spec flows across
pairwise state cells (permission x appearance x font_scale x network x
data_state), plus the exploration walk, and its verdict names the
dimensions it could NOT cover. One fixed-state walk is a smoke test, not a
gate. Implementation: `backend/scripts/release-walker/` (`--matrix
--explore`), design at `backend/drafts/release-walker/STATE-MATRIX.md`.

## 2. Why

Every recent shipped bug lived in a state cell, not on the default path:
denied-location x Discover, offline x Saved persistence, dark x map tint,
post-onboarding cold-launch routing, Capacitor focus x soft keyboard. The
2026-06-09 harness walked one state and scored 26 GREEN flows while five
of those bugs shipped. On the matrix's FIRST integration run
(20260610T001309Z, coexist), the offline cell caught two real ones:
signin -> signup navigation no-ops offline (D2 signature-unchanged;
probable lazy route-chunk fetch), and an offline cold-clear start leaves
the WebView accessibility tree EMPTY at 45s while the pixels render fine
(screenshot shows the complete signin page; uiautomator sees one bare
WebView node). The second is a TalkBack-user defect AND a tooling trap:
hierarchy absence is not pixel absence, so hierarchy findings carry their
screenshot and the conductor vision-judges before declaring a
customer-facing blank (the agent-is-the-vision-llm design choice doing
load-bearing work). Pairwise keeps the matrix affordable: every shipped
bug above is a 1- or 2-way interaction, and all-pairs covers 24
full-product cells in 7.

## 3. How to apply

- Spec gains a `matrix:` block: `permissions` map (symbolic group ->
  android permission ids + simctl privacy service), `dimensions` pools,
  `flows[].vary` lists. Pairwise default; full product only on suspected
  3-way interactions.
- App-scope state (permissions) re-applies AFTER every `pm clear`, inside
  the launch step: pm clear resets grants, so ordering is load-bearing.
- Every cell starts from baseline (light / 1.0 / online) before applying
  its own dims; the run exits through a reset trap. A cell inheriting the
  previous cell's leftover state is an invalid experiment.
- Permission variants: granted = `pm grant`; denied = `pm revoke` +
  `pm set-permission-flags ... user-set user-fixed` (no-rationale path);
  never_asked = revoke + clear-permission-flags. iOS: `simctl privacy
  grant/revoke/reset`.
- iOS has NO network primitive (sim shares the Mac NIC): the generator
  DROPS the dim and the verdict prints `uncovered_dims=network`. Reporting
  a dropped dimension as covered is the lying-gate failure mode.
- Capacitor form fills target `editfield:N` (Nth EditText, resolved live
  from the hierarchy), never the floating label text and never hardcoded
  coord percentages; the fill-verify probe (typed value must surface in
  the post-typing hierarchy) is what catches the soft-keyboard/focus bug
  class.
- A GREEN release-cut claim cites flows x cells + explore taps + the
  uncovered list. Per [[exploratory-walker-is-first-class-test-substrate-2026-06-09]]
  both layers are mandatory.
- ENFORCEMENT is mechanical, not prose: the PreToolUse hook
  `release-walker-ship-gate.py` (registered in ~/.claude/settings.json)
  blocks ship-ios.py / bundleRelease / Play / ASC-submit commands for a
  tracked app unless the newest walker verdict is green and under 24h
  old. Bypass token `walker-ok` (conscious, logged). Verified live
  2026-06-10: glovebox blocked (no run), coexist allowed (green 0.5h),
  locals blocked (findings verdict), non-ship commands untouched.

## 4. Anti-patterns

- Varying network on a flow whose anchors need a live fetch (glovebox
  paywall entitlement row) - models a dependency as a bug.
- Hardcoding coord:% for inputs: theme/font_scale cells shift the layout
  and the target goes stale; editfield:N re-resolves per cell.
- `adb shell` (or simctl) inside a `while read` loop fed by a pipe: it
  slurps stdin and the loop silently runs once. Iterate over fd 3
  (`while read -u 3 ... done 3< file`). Observed live: run
  20260610T001125Z announced 4 cells, ran 1.
- Treating a single-state plain walk as the release gate because the
  matrix takes longer; cap with `--cells=N` instead of dropping the layer.

## 5. Cross-references

- [[testing-harness-needs-exploration-layer-not-regression-only-2026-06-09]]
- [[exploratory-walker-is-first-class-test-substrate-2026-06-09]]
- [[maestro-tapon-by-text-misses-capacitor-webview-input-use-coord-tap]]
- [[cross-platform-parity-needs-explicit-verifier-2026-06-09]]
- [[sim-driving-must-be-focusless-idb-simctl-never-activate-cliclick-2026-06-09]]
- backend/drafts/release-walker/STATE-MATRIX.md (design + Tier-2 ladder)

## 6. Origin

2026-06-10 production-readiness brief: four apps, operator offline for
weeks, release gate must exercise the customer-state cross product.
Built same-day on the 2026-06-09 walker spine; first matrix run caught
the coexist offline a11y-empty tree (pixels fine, TalkBack blind) plus
the dead offline signup nav, and the harness's own stdin-slurp bug.
