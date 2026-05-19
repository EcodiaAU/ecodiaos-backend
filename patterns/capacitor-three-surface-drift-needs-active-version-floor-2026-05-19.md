---
name: capacitor-three-surface-drift-needs-active-version-floor
description: Capacitor apps ship to three independent surfaces (web on Vercel, iOS via App Store, Android via Play Store). Without OTA live-updates configured, native fixes only reach users when each platform's binary is rebuilt and re-shipped. The three surfaces drift wildly. A bug fix on main is only meaningfully shipped when all three surfaces (or the relevant ones) have absorbed it.
triggers: capacitor, capacitor-shipping, version-drift, ios-vs-android-version-skew, native-bundle-vs-web, no-ota, no-live-updates, capgo-not-configured, ios-1.8.11-android-1.8.3, push-fix-only-in-1.8.7, capacitor-three-surface, web-fix-doesnt-reach-mobile, ship-arc-multi-platform, capacitor-version-floor
metadata:
  type: pattern
---

# Capacitor apps need a tracked version floor across all three surfaces

## The recurring confusion

Co-Exist shipped v59 (event-detail RLS embed fix) to web at 17:00 AEST
on 2026-05-19. By 18:00 a Sydney leader hit the bug on production. Was
the fix not working? No: the fix was live on `app.coexistaus.org`, but
she was on the native Android app, which is on `webDir: 'dist'` (local
bundle, no `server.url`), built from a `1.8.3` IPA / AAB shipped weeks
earlier. None of v59 had reached her device.

This is the standard three-surface drift trap for Capacitor:

| Surface | Update path | Speed | Reaches user via |
|---|---|---|---|
| **web** | `git push` → Vercel auto-deploy | ~60s | next page refresh |
| **iOS native** | xcodebuild + altool + App Store review | 1-3 days | TestFlight (24-48h) or App Store update |
| **Android native** | gradle + Play Console + review | hours to 2 days | Play Store update (rolls out over hours) |

Without OTA (Capgo or Capacitor Live Updates), the native bundles are
frozen at build time. A bug fix on main only reaches mobile users when
their platform's binary is rebuilt.

## What goes wrong if you forget

- "I shipped the fix" usually means "I pushed to main and Vercel
  deployed". Mobile users see nothing for days or weeks.
- A web-only test (Tate's Chrome) passes; a phone test fails because
  the phone is on an older bundle. You waste time hunting a ghost
  regression.
- Cross-platform drift compounds. Co-Exist had iOS at 1.8.10 + Android
  at 1.8.3 simultaneously. Android users had been missing the
  1.8.7 NotificationCenter push fix for weeks; iOS users had it.
  Same support thread, two completely different bug surfaces.
- A patch that requires the native bundle (push, plugin update, native
  module, deep link config, build-time env var) WILL NOT take effect on
  any user via web-only deploy. Verify before claiming the ship.

## The discipline

**1. Track the version floor.** At any moment, know:
- Web HEAD commit
- iOS production version + TestFlight version
- Android production version + Internal track version
- Which one is the laggard

For Co-Exist 2026-05-19 the floor was:
`web=main`, `iOS=1.8.10 (App Store)`, `iOS=1.8.11(44) (TestFlight)`,
`Android=1.8.3 (Play Store)`. The Android floor was the binding
constraint.

**2. Classify every fix.** When you write a bug fix, label it for
shipping intent:
- **Web-only**: pure JS, no Capacitor plugin / native config / build-time
  env. One Vercel deploy reaches everyone.
- **Native-only**: plugin update, Info.plist / AndroidManifest change,
  signing config, splash / icon assets, push registration. Web deploy
  does nothing; needs a binary rebuild per platform.
- **Mixed**: JS code that runs on the native WebView and uses a
  Capacitor plugin. Web users get partial fix; mobile users wait for
  bundle.

**3. Bump native versions when fixes accumulate.** Don't let Android
sit at 1.8.3 while iOS is at 1.8.10. The marketing version is the user-
visible label; bump it on Android too (versionCode + versionName) when
shipping cumulative web fixes, so the AAB picks up the rebuilt bundle.
Co-Exist 1.8.11 bumped Android from 18→19 (versionCode) and
"1.8.3"→"1.8.11" (versionName) in one move.

**4. Verify on the actual surface, not the one that's easy.** Tate's
Chrome with v59 deployed is NOT proof that Winnie's Android phone
will work. CDP-verify on the production URL is a useful smoke test,
but the binding test for native-bound bugs is on a phone with the
relevant TestFlight / Internal Track build.

## When to add OTA

Capgo or Capacitor Live Updates ship the `dist/` bundle over the air
to native devices without an App Store / Play Store round trip. Add
this when:
- You're shipping web fixes weekly and the App Store review cadence is
  blocking velocity.
- You have a P0 bug affecting native users that's pure JS (no plugin
  change).
- Cross-platform user counts are large enough that 2 days of drift on a
  push notification or RLS-blocked page means real impact.

For Co-Exist with ~few-hundred installs and weekly-shipping cadence,
OTA is justified. Defer until the next infra cycle if there's nothing
acutely on fire.

## Checklist for every "I shipped X" claim

Before saying "fix is live":

1. Web on Vercel: commit hash on production, verify via `vercel_list_deployments`.
2. iOS App Store: appStoreState of the current ASV. WAITING_FOR_REVIEW
   is not "shipped"; READY_FOR_SALE is.
3. iOS TestFlight: build number processed + tester pool seeded.
4. Android Play Store: production track version. Internal Track only
   reaches testers.
5. Affected user can actually receive the fix on their device. If the
   fix is native-only, they need a binary upgrade.

If any of those answers is "no", say so explicitly. "Shipped to web,
native pending" is the honest report.

## Origin

Tate verbatim 19:00 AEST 2026-05-19 after watching the
Winnie-Sydney-event-blocker arc reveal that Android was at 1.8.3 while
iOS shipped 1.8.10 + 1.8.11 in the same arc, and the push fix that
landed in 1.8.7 had never reached a single Android user.

## Cross-refs

- [[ios-headless-build-needs-keychain-unlock-via-macos-login-password]] -
  iOS side of the rebuild pipeline.
- [[chrome-cdp-network-enable-times-out-under-tab-memory-pressure]] -
  when CDP-verify on web fails, you can't even smoke-test the surface
  before claiming ship.
- [[verify-deployed-state-against-narrated-state]] - the broader
  "narrated vs deployed" doctrine; this pattern is its Capacitor-
  specific application.
