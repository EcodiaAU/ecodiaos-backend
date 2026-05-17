---
triggers: asc-auto-release, app-store-auto-release, asc-submit-for-release, asc-release-pending, asc-approved-not-released, app-store-approved-build-sitting, ios-release-step, ios-manual-release, app-store-connect-release, asc-day-N-sitting, asc-needs-release, app-store-ready-for-release, post-approval-release-step
status: active
---

# ASC auto-release-on-approval is ON for our apps - no manual release step

Default state for all Ecodia-published iOS apps in App Store Connect is **automatic release after Apple approval**. Once Apple Review approves a build for distribution, ASC pushes it live to all users automatically. There is no separate "submit for release" step.

**Do NOT:**
- Surface "Build X.Y.Z sitting approved in ASC day N" as a Tate action item
- Tell Tate to "open ASC > submit for release" after Apple approval
- Track "approved but unreleased" as a pending state
- Author morning-briefing / status_board / day-plan rows that imply a manual post-approval release click

**Do:**
- After upload to ASC, the only Tate-touchable step is review-submission (if not already auto-submitted). Once submitted-for-review, the next state transition is Apple's review verdict, after which ASC auto-releases.
- Treat the flow as: upload -> processing -> submit-for-review -> Apple review -> live. No "release" step belongs after "Apple approves."
- If a build IS sitting in ASC post-approval without going live, that means auto-release was toggled OFF for that build specifically (rare). Verify via ASC API `appStoreVersions.attributes.releaseType` before claiming a manual release is needed.

**Why this matters:** the morning-briefing fork has been echoing "1.8.4 sitting approved day N, Tate submit for release" into `ceo.current_priorities` / `ceo.active_threads` / `ceo.day_plan_*` for multiple days running. That action item is hallucinated - auto-release is on. Tate flagged it 17 May 2026: "once a build is approved for distribution, it gets automatically released to everyone so we don't need to then release it." Cluttering Tate's Sunday brief with a ghost action degrades signal/noise.

**How to apply:**
- When authoring any brief/row mentioning "build sitting in ASC needing release," stop and verify via the ASC API that the build's `state` is something other than `READY_FOR_SALE` / `PROCESSING_FOR_APP_STORE`. If it's already `READY_FOR_SALE`, the build IS live.
- When seeing a stale row of this shape in inherited state, archive/rewrite it, do not propagate it forward.
- Co-Exist iOS specifically: current released version is 1.8.5. 1.8.6 builds are being uploaded for review.

## Origin

Tate verbatim 17 May 2026 ~14:40 AEST: "Also you keep sending me daily briefs etc about coexist 1.8.4 sitting in ASC and needing to be released lmao.... once a build is approved for distribution, it gets automatically released to everyone so we dont need to then release it + the latest version released is 1.8.5 so the .4 thing is redundant anyway hahaha. We're about to be doing 1.8.6."

Root cause: stale `ceo.doctrine.coexist_ios_build_path_2026-05-07` mentioned "1.8.4 iOS ship is greenlit by Tate (he wants more feedback first)" - the doctrine was correct at write-time, but 1.8.5 shipped past it (commit f7194c1, 11 May), 1.8.6 builds 5+6 went to TestFlight (~13 May), and the daily morning-briefing fork kept pulling the stale "1.8.4" string forward into `ceo.current_priorities` / `ceo.active_threads` without re-grounding against the actual ASC state.

## Cross-references

- [coexist-ios-headless-ship-recipe.md](coexist-ios-headless-ship-recipe.md) - the SSH upload recipe (stops at TestFlight upload; review-submission + auto-release happens after)
- [re-probe-stale-health-check-readings-before-acting-on-cached-alerts.md](re-probe-stale-health-check-readings-before-acting-on-cached-alerts.md) - sibling discipline: never propagate cached state into a brief without re-grounding
- [verify-deployed-state-against-narrated-state.md](verify-deployed-state-against-narrated-state.md) - sibling discipline: claimed-X != actual-X
