---
triggers: play-console, google-play-console, android-release, android-upload, capacitor-android, gradle-bundle, aab-upload, signed-app-bundle, play-console-release, ship-android, android-shipping-pipeline, ecodia-android-release, app-bundle-upload, internal-testing, production-release, release-tracks, version-code-bump, gradlew-bundlerelease, capacitor-cap-sync-android, android-studio-build, generate-signed-app-bundle, aab-vs-apk, play-app-signing, upload-key-fingerprint, coexist-android-release, roam-android-release, com.coexistaus.app, ship coexist android, ship roam android, release android build, upload aab, drag-drop aab, play console internal testing, play console production track, fastlane-supply-fallback, play-developer-api, android-versionCode-bump, gradle-signingconfigs, jks-signing, android-deploy, deploy-android-build, play-store-upload
---

# Google Play Console Android release recipe — paper authored 6 May 2026 (verification pending)

> **VERIFICATION PENDING — 6 May 2026.** This recipe is authored from industry-standard knowledge of the Capacitor → Gradle → AAB → Play Console pipeline. No coordinates have been verified against a live Play Console session. On first real Android ship event, the operator MUST update this recipe with: (a) verified screenshot anchors, (b) verified click coordinates at known viewport, (c) actual end-to-end runtime measurement, (d) any failure modes encountered. Until then, treat as informational reference only — operator should expect to deviate where reality diverges from the paper.

> **Meta-doctrine.** This is a paper-authored worked instance of `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md`. The sibling iOS recipe `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` is the verified-end-to-end shape template for this style of release recipe. Read both before authoring or optimising further.

## Origin

Paper-authored 6 May 2026 by `fork_motcnat6_ea239b` (Worker B sub-task) under directive from Tate verbatim 6 May 2026 ~10:53 AEST: *"We need to get you uploading builds to asc and google play."*

Sibling deliverable to the iOS recipe re-author (Worker A in the same manager fork). No prior verified-run lineage on the Android side; first real ship will populate the coords table and runtime measurement. Authored against industry-standard knowledge of the Capacitor 7+ Android pipeline, the `gradlew bundleRelease` AAB build flow, and the Play Console v2 dashboard UI as documented at developer.android.com and support.google.com/googleplay/android-developer/ as of late 2025.

## When to use this

Use this recipe when:

- A new Co-Exist (`com.coexistaus.app`) build is needed for Play Console (Internal Testing, Closed Testing, Open Testing, or Production tracks)
- A new Roam build is needed for Play Console (once Roam's Android signing wiring is completed per `~/ecodiaos/docs/secrets/android-keystores.md` "Build wiring drift" section)
- Any future Capacitor-based Ecodia Android app following the same Capacitor → Gradle → AAB shape
- The latest commits on `main` need to ship as the Android app binary

Do NOT use this recipe when:

- The app is not Capacitor-based (the Gradle bundle phase is portable; the Capacitor sync phase is not — re-author the build phase)
- The change is a Play Console settings mutation (app metadata, store listing, content rating, pricing) — that is outside the release-pipeline scope, drive directly via Play Console GUI without invoking this recipe
- The change is a Play App Signing key upgrade (slow, requires Play support intervention; not a routine release)
- The build needs to ship without a versionCode bump (Play rejects any AAB whose versionCode is equal to or lower than a previously-uploaded AAB for the same applicationId; bump is mandatory)

## Pre-flight

> **The build phase (Phase A) runs from inside Terminal — preferably on the VPS where the workspace is canonical, or on Tate's laptop if the VPS environment lacks a JDK/`keytool`. The upload phase (Phase B) runs on Corazon, driving Tate's logged-in Chrome at play.google.com/console via the Tailscale laptop-agent's `input.*` + `screenshot.*` primitives.**

Foreground-collision check applies to Phase B. See `~/ecodiaos/patterns/cowork-no-focus-collision.md`. Probe Corazon foreground-window equality before any `input.*` keystroke; defer or fall back if Tate's foreground is the planned Chrome target.

| Requirement | Verification | Per-app variant |
|---|---|---|
| App slug + applicationId known | `grep applicationId ~/workspaces/{slug}/android/app/build.gradle` | Co-Exist: `com.coexistaus.app` (verified per build.gradle). Roam: probe `~/workspaces/roam-frontend/android/app/build.gradle` `applicationId` field on first Roam ship. |
| Keystore present at expected path | `ls ~/workspaces/{slug}/android/app/{slug}-release.jks` (Co-Exist); for Roam, the keystore is currently at workspace root and the signing wiring is incomplete per `~/ecodiaos/docs/secrets/android-keystores.md` "Build wiring drift" — close that gap before first Roam ship | Co-Exist: yes, also committed to git per `git log --oneline -- android/app/coexist-release.jks` → `f56d01b`. Roam: at `~/workspaces/roam-frontend/roam-release.keystore` (workspace root), needs move into `android/app/` per drift note. |
| `creds.android.{slug}` row in kv_store with `keystore_b64` populated | `SELECT value::jsonb ? 'keystore_b64' FROM kv_store WHERE key='creds.android.{slug}'` returns `t` | Both slugs backed up 1 May 2026 by `fork_momjmkd0_a850d1`. Verify SHA-256 matches `keystore_sha256` field after restoration. |
| `creds.android.{slug}.keystore_password` + `creds.android.{slug}.key_password` populated | `SELECT (value::jsonb ->> 'keystore_password') IS NOT NULL FROM kv_store WHERE key='creds.android.{slug}'` returns `t` | **CURRENTLY NULL for both slugs** per `~/ecodiaos/docs/secrets/android-keystores.md` PARTIAL status (status_board row `d51856c1-d0aa-4842-bc8e-40605ab7ee97`). `scripts/release.sh:605-615` Android branch errors at preflight via `require_cred 'creds.android.$SLUG.keystore_password'` until populated. **HARD GATE on first real ship.** |
| Tate's Chrome on Corazon authenticated to play.google.com/console | After navigation in Phase B, `screenshot.screenshot` shows the Play Console developer dashboard, not the sign-in prompt | If sign-in prompt appears, run the 5-point laptop-route check per `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md`; do NOT classify as Tate-required without exhausting the saved-credential / passkey paths first. |
| `versionCode` in `~/workspaces/{slug}/android/app/build.gradle` strictly greater than highest versionCode previously uploaded | `grep versionCode ~/workspaces/{slug}/android/app/build.gradle` → compare against Play Console → Release → App bundle explorer | Rejection mode: Play returns "Version code N has already been used. Try another version code." See Failure mode B-2. |
| Play App Signing enrolled for the app | Play Console → Setup → App integrity → App signing shows "Play App Signing" enabled; the upload key SHA-1 fingerprint matches the keystore's | Required for upload-key separation (Play holds the signing key; we hold the upload key only). If not enrolled, Tate-action to enrol before first ship. |
| Build environment has JDK + Android SDK + Gradle wrapper able to run `./gradlew bundleRelease` | `cd ~/workspaces/{slug}/android && ./gradlew --version` returns Gradle version banner without error | VPS may lack JDK; in that case, Phase A runs on Tate's laptop or in a JDK-installed Docker container. The release.sh script wraps this. |
| `~/.android/` exists OR `gradle.properties` has `org.gradle.daemon=false` | `ls -d ~/.android` returns the dir, or grep gradle.properties | Build-environment hygiene; failure surfaces as Gradle daemon hangs on long-running builds. |

The keystore-passwords gate is the single hardest preflight blocker today. It is tracked at `status_board` row `d51856c1-d0aa-4842-bc8e-40605ab7ee97` and the recommended closure path is option 3 from the keystores doc: organic surfacing on first Android release attempt, with option 1 (Android Studio GUI macro to read cached passwords) as proactive fallback.

## Verified coordinates table

Resolution: **Likely 1366×768 Corazon RDP fullscreen** (matching iOS recipe convention; confirm on first real ship). All coords pending first-real-ship verification.

| UI element | Window / Context | (X, Y) | Verified |
|---|---|---|---|
| Play Console app card matching slug | play.google.com/console "All apps" dashboard | PENDING | not yet verified |
| Sidebar **Release** menu | Play Console app workspace, left rail | PENDING | not yet verified |
| Sidebar **Testing → Internal testing** menu item | Play Console app workspace, left rail expanded under Release | PENDING | not yet verified |
| Sidebar **Production** menu item | Play Console app workspace, left rail under Release | PENDING | not yet verified |
| **Create new release** button | Play Console release-track page, top-right | PENDING | not yet verified |
| **App bundles** drag-drop region | "Create release" page, "App bundles and APKs" section | PENDING | not yet verified |
| **Browse files** fallback button (alt to drag-drop) | "App bundles" section, inside drag-drop zone | PENDING | not yet verified |
| **Release notes** textarea | "Create release" page, below app bundles | PENDING | not yet verified |
| **Save** button | "Create release" page, bottom-right | PENDING | not yet verified |
| **Review release** button | "Create release" page, bottom-right next to Save | PENDING | not yet verified |
| **Start rollout to {track}** button | "Review release" page, bottom-right | PENDING | not yet verified |
| Confirmation dialog **Rollout** button | Modal "Rollout to {track}?" dialog | PENDING | not yet verified |
| Released-state status indicator | Release dashboard for the chosen track | PENDING | not yet verified |

`<all rows pending — populated on first real ship>`. On first real ship: walk the DOM via `browser.evaluate` accessibility tree if needed, otherwise screenshot + visual locate, capture (X, Y) at the recorded resolution, update this table with date-stamp.

## Step-by-step procedure

### Phase A — Build the signed AAB

Phase A runs from inside Terminal on whichever build machine has JDK + Android SDK. Default is the VPS workspace (`~/workspaces/{slug}/`); fallback is Tate's laptop if VPS lacks `keytool`/JDK.

**A.1 — Pull latest source.**

```bash
cd ~/workspaces/{slug}
git pull origin main
```

If `git pull` produces non-trivial output (merge conflicts, divergent branches, network failures), HALT the recipe per `~/ecodiaos/patterns/client-code-scope-discipline.md`. Do NOT auto-resolve. Surface a status_board P2 row with the verbatim error and exit.

**A.2 — Web build.**

```bash
npm install
npm run build
```

Vite `npm run build` produces `dist/` (Co-Exist) or analogous output. Watch for peer-dep failures or build errors; HALT and surface if either occurs.

**A.3 — Capacitor sync to Android.**

```bash
npx cap sync android
```

Capacitor 7+ uses Gradle (no CocoaPods on Android side; SPM is iOS-only). Plugins resolve via Gradle dependencies. Output may include advisory warnings about plugin compatibility — these do not block the sync.

**A.4 — Restore keystore from kv_store IF not already on disk.**

The .jks bytes live in `kv_store.creds.android.{slug}.keystore_b64`. Restoration block per `~/ecodiaos/docs/secrets/android-keystores.md`:

```bash
SLUG=coexist
mkdir -p ~/workspaces/$SLUG/android/app
psql -c "SELECT value::jsonb->>'keystore_b64' FROM kv_store WHERE key='creds.android.$SLUG'" -t \
  | tr -d ' \n' \
  | base64 -d \
  > ~/workspaces/$SLUG/android/app/${SLUG}-release.jks
sha256sum ~/workspaces/$SLUG/android/app/${SLUG}-release.jks
# Verify against kv_store.creds.android.$SLUG.keystore_sha256
```

Co-Exist's keystore is also committed to git (`f56d01b`) so this restoration is usually unnecessary; included for parity with the keystores doc and for slugs whose keystore is NOT committed.

**A.5 — Set keystore env vars from kv_store.**

`build.gradle` `signingConfigs.release` block reads passwords from environment. Co-Exist reads `COEXIST_KEYSTORE_PASSWORD` and `COEXIST_KEY_PASSWORD`; mirror per slug.

```bash
SLUG=coexist
SLUG_UPPER=$(echo "$SLUG" | tr 'a-z' 'A-Z')
export ${SLUG_UPPER}_KEYSTORE_PASSWORD=$(psql -At -c "SELECT value::jsonb->>'keystore_password' FROM kv_store WHERE key='creds.android.$SLUG'")
export ${SLUG_UPPER}_KEY_PASSWORD=$(psql -At -c "SELECT value::jsonb->>'key_password' FROM kv_store WHERE key='creds.android.$SLUG'")
```

**Currently NULL — release blocks here per PARTIAL status.** See keystores doc for closure paths. Until passwords ship, A.5 returns empty strings and `./gradlew bundleRelease` fails at signing with a Gradle exception about empty keystore password. Tracked at `status_board` row `d51856c1-d0aa-4842-bc8e-40605ab7ee97`; do not duplicate.

**A.6 — Bump versionCode.**

In `~/workspaces/{slug}/android/app/build.gradle`, increment `versionCode` by `+1` at minimum. Optionally also bump `versionName` to mirror the iOS MARKETING_VERSION when shipping a coordinated train.

```bash
# Sed approach (mirror Phase 0 of the iOS recipe):
cd ~/workspaces/{slug}/android/app
# Inspect current value
grep -E 'versionCode|versionName' build.gradle
# Bump versionCode by +1 (manual edit safer than sed for arithmetic)
```

Per `~/ecodiaos/patterns/client-code-scope-discipline.md`, leave the bump **uncommitted** by default. Tate decides whether to commit + push after upload success.

**A.7 — Build signed AAB.**

```bash
cd ~/workspaces/{slug}/android
./gradlew bundleRelease
```

Output lands at `android/app/build/outputs/bundle/release/app-release.aab`. Build time: ~30-90s warm derived data, ~3-5min cold (first-ever build on a fresh machine).

**A.8 — Verify AAB signed (optional, sanity check).**

```bash
keytool -list -keystore ~/workspaces/{slug}/android/app/{slug}-release.jks -v
```

Requires JDK with `keytool`. VPS currently lacks one; verify on Tate's laptop or a JDK-installed environment. Compare the SHA-1 fingerprint against the upload-key fingerprint registered in Play Console → Setup → App integrity → App signing.

**A.9 — Locally smoke-test if possible (optional, recommended before first ship).**

`bundletool` extract → install on connected device or emulator. Skip on subsequent ships once the pipeline is trusted.

```bash
# bundletool build-apks ... ; bundletool install-apks ...
```

### Phase B — Upload to Play Console (GUI flow on Corazon, drives Tate's logged-in Chrome)

Phase B runs on Corazon via the Tailscale laptop-agent. All `input.*` calls are gated by foreground-equality probe per `~/ecodiaos/patterns/cowork-no-focus-collision.md`.

**B.1 — Foreground-collision check.**

Probe Corazon foreground-window equality (Win32 `GetForegroundWindow` + title) via `shell.shell`. If Tate's foreground is the planned Chrome target (or another window he is actively typing into), defer Phase B or fall back to a different window. The laptop-agent CAN drive a Chrome tab while Tate types in another window; the probe is per-tool gating, not human-idle.

**B.2 — Navigate to Play Console.**

```bash
# Open address bar
curl ... -d '{"tool":"input.shortcut","params":{"keys":["ctrl","l"]}}'
sleep 0.5
# Type URL
curl ... -d '{"tool":"input.type","params":{"text":"play.google.com/console"}}'
# Press Enter
curl ... -d '{"tool":"input.key","params":{"key":"enter"}}'
sleep 5
# Confirm authenticated dashboard
curl ... -d '{"tool":"screenshot.screenshot","params":{}}'
```

If sign-in prompt appears instead of the dashboard, fall back to `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md`.

**B.3 — Click app card matching slug.**

Coords PENDING. On first real ship, screenshot the dashboard and click the Co-Exist (or Roam) app card. If multiple apps are listed, filter by name search at the top of the dashboard.

**B.4 — Choose release track via left sidebar.**

Sidebar → **Release** → choose track:

- **Internal testing** for fast in-team validation (no review wait)
- **Closed testing** for limited beta cohorts (no review wait once first build approved)
- **Open testing** for public beta (requires review)
- **Production** for full rollout (requires review)

Default for first ship of a new build: **Internal testing**. Promote to higher tracks after pre-launch report passes and TestFlight-equivalent validation completes.

**B.5 — Click "Create new release".**

Coords PENDING. Top-right of the chosen track's release page.

**B.6 — Upload the AAB (drag-drop preferred).**

Drag-drop the `app-release.aab` file into the "App bundles and APKs" drop zone. Drag-drop is preferred over the file-picker click-through because:
- Coords drift across Play Console UI iterations
- Drag-drop matches the `gui-macro-uses-logged-in-session-not-generated-api-key.md` doctrine (use the user's logged-in session naturally)
- Faster (one motion, no file picker dialog)

Drag-drop programmatic invocation may require synthesising a drag event via `browser.evaluate` if `input.drag` from the laptop-agent doesn't trigger the Play Console drop handler — verify on first real ship which path works.

**B.7 — Wait for upload + Play-side processing.**

Estimated 1-5 min depending on AAB size. Play renders a progress indicator; verify with `screenshot.screenshot` at ~30s intervals. Polling for "Processed" / "Ready" state is preferred over a fixed sleep.

**B.8 — Fill release notes (mandatory).**

Copy from `~/ecodiaos/clients/{slug}.md` "Release notes" section if present. Otherwise terse default:

```
{slug} {versionName} ({versionCode})
- Latest improvements and fixes.
```

Click into the release-notes textarea (coords PENDING) and `input.type` the contents.

**B.9 — Click "Save".**

Saves the draft release. Required before "Review release" is enabled.

**B.10 — Click "Review release".**

Play surfaces any policy / pre-launch-report / metadata issues at this step. Address blocking issues; advisory warnings can be acknowledged. If a hard block surfaces (e.g. missing privacy policy URL, missing content rating, sensitive permission gate), HALT and surface a status_board P2 row — do not paper over policy issues.

**B.11 — Click "Start rollout to {track}".**

For Production track, this initiates a staged rollout (default 5-20%, ramp managed via Play Console). For testing tracks, this releases immediately to the configured tester list.

**B.12 — Confirm in dialog.**

Modal "Rollout to {track}?" appears; click the **Rollout** confirm button.

**B.13 — Capture deliverable evidence.**

`screenshot.screenshot` of the "Released" / "In review" status state. Save to `~/ecodiaos/drafts/{slug}-android-release-runs/run-YYYY-MM-DD-HHMM/release-status.png`.

### Phase C — Post-upload monitoring

**C.1 — Pre-launch report.**

Play runs an automated test-suite on real devices ~30-60min after upload. Check Play Console → Release → Pre-launch report for crashes, accessibility warnings, performance issues, policy flags. For Co-Exist's first Android ship, the pre-launch report is the highest-value automated signal we get.

**C.2 — Production rollout ramp (Production track only).**

For Production: rollout starts at 5-20% of users by default. Stage manually via Play Console → Production → Manage rollout. Pause if crash rate spikes.

**C.3 — Update status_board.**

Insert a status_board row recording the upload (status='uploaded', next_action='monitor pre-launch report', next_action_by='ecodiaos', priority=3) so the meta-loop or morning briefing surfaces the next step naturally.

## Verification protocol

Cheapest tier per phase, per the verification-tier hierarchy in `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md`.

| Phase | Verification tier | Method |
|---|---|---|
| A.1 (git pull) | Tier 1 | `git pull` stdout contains `Updating .. Fast-forward` or `Already up to date`. |
| A.2 (web build) | Tier 3 | `dist/` (or build output dir) mtime is newer than build start. |
| A.3 (cap sync) | Tier 1 | stdout contains `Sync finished in` and lists Android plugins. |
| A.4 (keystore restore) | Tier 3 | `sha256sum` of restored .jks matches `kv_store.creds.android.{slug}.keystore_sha256`. |
| A.5 (env vars set) | Tier 0 | `[ -n "$COEXIST_KEYSTORE_PASSWORD" ]` exits 0; do NOT echo the value. |
| A.6 (versionCode bump) | Tier 3 | `grep versionCode build.gradle` shows N+1. |
| A.7 (gradle bundleRelease) | Tier 3 | `app-release.aab` exists at `android/app/build/outputs/bundle/release/` AND mtime is newer than build start AND size > 1MB sanity floor. |
| A.8 (keystore inspect) | Tier 1 | `keytool -list` exits 0 and shows the configured key alias. |
| B.2 (Play Console open) | Tier 4 | Cropped screenshot shows the Play Console dashboard "All apps" header. Tier 1 backup: `browser.evaluate` queries `document.title` includes "Google Play Console". |
| B.3 (app card click) | Tier 4 | Cropped screenshot of sidebar shows the chosen app's name in the top-left workspace context. |
| B.4 (track selected) | Tier 4 | Cropped screenshot of breadcrumb shows "Release > {Track}". |
| B.6 (AAB drop) | Tier 4 | Cropped screenshot of the app-bundles section shows the AAB filename + version code + size. |
| B.7 (Play-side processing) | Tier 4 | Cropped screenshot shows "Processed" or "Ready" state on the AAB row. |
| B.8 (release notes) | Tier 4 | Cropped screenshot of the textarea shows the typed contents. |
| B.10 (review release) | Tier 4 | Cropped screenshot shows the review summary page. |
| B.11-12 (rollout) | Tier 4 | Cropped screenshot of the post-rollout dashboard shows status "Released" / "In review". |
| C.1 (pre-launch report) | Tier 4 | Cropped screenshot of the pre-launch report tab shows test results (pass/fail counts). |

If a future Play Console release exposes UIA-friendly accessibility tree elements (`role`, `aria-label`), drop the Tier 4 dependency and use Tier 1 (DOM/AT walk) instead. Probe via `browser.evaluate({script: "document.querySelector('[aria-label=\"App bundles\"]')..."})` on first real ship.

## Fast-path checklist

End-to-end timing target: **paper-estimate ~15-20 minutes wall-clock from versionCode bump to "Released" / "In review"**, of which ~3-5min is Play-side processing latency. Verify on first real ship.

```bash
# A.1 git pull (~2s)
cd ~/workspaces/{slug} && git pull origin main

# A.2 web build (~30-90s)
npm install && npm run build

# A.3 cap sync android (~5s)
npx cap sync android

# A.4 restore keystore IF not committed (~1s)
SLUG=coexist
psql -c "SELECT value::jsonb->>'keystore_b64' FROM kv_store WHERE key='creds.android.$SLUG'" -t \
  | tr -d ' \n' | base64 -d > ~/workspaces/$SLUG/android/app/${SLUG}-release.jks

# A.5 export passwords (~0.1s)
export COEXIST_KEYSTORE_PASSWORD=$(psql -At -c "SELECT value::jsonb->>'keystore_password' FROM kv_store WHERE key='creds.android.coexist'")
export COEXIST_KEY_PASSWORD=$(psql -At -c "SELECT value::jsonb->>'key_password' FROM kv_store WHERE key='creds.android.coexist'")

# A.6 bump versionCode (~0.5s)
# (manual edit or sed in build.gradle)

# A.7 gradle bundleRelease (~30-90s warm, ~3-5min cold)
cd android && ./gradlew bundleRelease

# B.2 Play Console open
curl ... -d '{"tool":"input.shortcut","params":{"keys":["ctrl","l"]}}'
sleep 0.5
curl ... -d '{"tool":"input.type","params":{"text":"play.google.com/console"}}'
curl ... -d '{"tool":"input.key","params":{"key":"enter"}}'
sleep 5

# B.3 app card click (coords PENDING) (~2s)
# B.4 track sidebar click (coords PENDING) (~2s)
# B.5 Create new release button (~2s)
# B.6 drag-drop AAB (~3s + 1-5min Play processing)
# B.7 wait for processing (~3-5min)
# B.8 type release notes (~5s)
# B.9 Save (~1s)
# B.10 Review release (~2s)
# B.11-12 Start rollout + confirm (~2s + ~1s)
# B.13 screenshot deliverable (~1s)
```

Paper-estimate end-to-end timing breakdown:

| Phase | Estimated time | Notes |
|---|---|---|
| A.1-A.3 (pull/build/sync) | ~40-100s | warm |
| A.4-A.5 (keystore + env) | ~1s | already committed for Co-Exist |
| A.6 (versionCode bump) | ~0.5s | sed or manual |
| A.7 (gradle bundleRelease) | ~30-90s warm / ~3-5min cold | cold once per fresh machine |
| B.1-B.2 (foreground check + nav) | ~6s | |
| B.3-B.5 (app + track + create) | ~8s | coords pending |
| B.6 (AAB drop) | ~3s | drag-drop |
| B.7 (Play processing) | ~3-5min | external floor, cannot optimise |
| B.8 (release notes) | ~5s | typed |
| B.9-B.10 (save + review) | ~5s | |
| B.11-B.12 (rollout + confirm) | ~3s | |
| B.13 (deliverable screenshot) | ~1s | |

Conductor-driven steps: **~3 minutes**. External-floor latency: **~3-5 minutes** (Play-side processing). Total: **~6-10 minutes** estimated, slightly faster than iOS due to no app-review queue for Internal Testing.

## Speed wins identified

| Win | Status | Saves |
|---|---|---|
| **[APPLIED in design]** Drag-drop AAB upload over file-picker click-through | by-design | coords-drift resilience + ~5s |
| **[APPLIED in design]** Pre-cache AAB to disk before opening Play Console (Phase A and Phase B fully serial) | by-design | overlapping ~3-5min Play processing with no other parallel saving |
| **[APPLIED in design]** Use Tate's logged-in Chrome session (no service-account API key) | by-design per `gui-macro-uses-logged-in-session-not-generated-api-key.md` | avoids API key provisioning overhead + rotation surface |
| **[TODO MEDIUM]** Bookmark `play.google.com/console/u/0/developers/{dev-id}/app-list` in Tate's Chrome for one-click dashboard entry (skips dev-account selector) | proposed | ~3-5s on B.2 |
| **[TODO MEDIUM]** Use Internal Testing track first for new Capacitor sync changes (Play-side processing is faster than for Production-bound builds, no review queue) | proposed | up to ~24h on first ship vs Production direct |
| **[TODO HIGH]** Probe-for-state on Phase B.7 (poll for "Processed" via `browser.evaluate` DOM query) instead of fixed 3-5min sleep | proposed | up to 1-2min on warm Play days |
| **[TODO HIGH]** Single-shell PowerShell collapse of B.3+B.4+B.5+B.8+B.9 GUI clicks into one .NET SendInput batch | proposed | ~3s round-trip per click × 5 clicks = ~15s |
| **[TODO LOW]** Pre-warm Gradle daemon by running `./gradlew tasks` after every workspace pull (so first real bundleRelease is warm-not-cold) | proposed | ~2-4min on cold builds |
| **[INHERENT FLOOR]** Play-side processing (~3-5min per AAB upload) | cannot optimise | — |

## Failure modes

| Mode | Symptom | Cause | Fix |
|---|---|---|---|
| A-1 | Gradle fails "Failed to read keystore" / "Keystore was tampered with" | keystore_password env var empty or wrong | Verify `kv_store.creds.android.{slug}.keystore_password` populated; A.5 exported correctly. **Currently NULL gate** per pre-flight. |
| A-2 | Gradle fails "key alias not found" | `signingConfigs.release.keyAlias` mismatch with .jks | `keytool -list -keystore ...jks` shows the actual alias; align build.gradle. Co-Exist alias = `coexist`; Roam alias = `roam`. |
| A-3 | `./gradlew bundleRelease` hangs indefinitely | Gradle daemon stuck | `./gradlew --stop` then retry. Set `org.gradle.daemon=false` in `gradle.properties` for unattended runs. |
| A-4 | npm install fails peer-dep | upstream package change | HALT and surface; do not auto-resolve per client-code-scope-discipline. |
| A-5 | npx cap sync android prints "no Android platform added" | Capacitor not yet pointed at android | `npx cap add android` once, then re-run sync. (Co-Exist has android added; Roam confirm on first ship.) |
| B-1 | Play rejects upload: "Upload key signature mismatch" / "Your APK or Android App Bundle is signed with a key that's no longer valid" | Keystore on disk diverges from the upload key Play has registered | Verify `keystore_sha256` matches what Play has. If keystore was rotated, Play App Signing key upgrade flow is required (slow, support intervention). |
| B-2 | Play rejects: "Version code N has already been used. Try another version code." | versionCode collision with prior upload | Bump versionCode in build.gradle (re-run A.6+A.7). Play allows any monotonic increase. |
| B-3 | Play rejects: "This release is not compliant with the Google Play 64-bit requirement" | 32-bit-only AAB | Confirm Capacitor + Gradle build arm64-v8a (`abiFilters` includes 'arm64-v8a' or 'universal'). |
| B-4 | Play rejects at submit: "Your app needs a privacy policy" | Privacy policy URL missing in store listing | Play Console → Store presence → fill privacy policy URL. Tate-action if URL doesn't yet exist; conductor-action if URL is `ecodia.au/privacy` or analogous. |
| B-5 | Play surfaces "sensitive permission" gate | App declares a permission requiring justification | Play Console → App content → Permissions declaration → fill justification. Tate-action for content of the justification on first ship. |
| B-6 | Pre-launch report shows crash on real device | Capacitor or app-side crash | Investigate stack trace via Play Console → Pre-launch report → device row. Patch source, rebuild, re-upload (versionCode bump). |
| B-7 | 2FA prompt fires on Tate's Chrome session at Play Console | Google session rotated 2FA challenge | Run 5-point laptop-route check per `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md`. Passkey at Windows Hello on Corazon may resolve via `creds.laptop_passkey`. |
| B-8 | Play Console policy violation email arrives post-rollout | App content / metadata violates Play policy | Read policy email content, address (often a metadata or store-listing fix). Resubmit. Tate-action for policy disputes that involve responding to the policy team. |
| B-9 | AAB > 200 MB, Play rejects | Asset bundle exceeds limit | Restructure to use Play Asset Delivery (PAD) for asset packs. App-architecture change; HALT recipe and surface. |
| B-10 | Foreground-window collision with Tate's active Chrome tab | Tate is typing in another Chrome tab | Defer Phase B; or fall back to driving the Play Console tab while Tate types in another window (per `cowork-no-focus-collision.md` per-tool gating). |
| B-11 | "Browse files" button used (instead of drag-drop) and file picker coords drift | Play Console UI iteration moved the file picker | Re-measure file picker coords; or switch to drag-drop path which is more stable. |
| B-12 | Internal testing track has no testers configured, Play blocks rollout | Tester list empty | Play Console → Internal testing → Testers → add at least one email list. Tate-action on first ship to populate the tester list. |
| C-1 | Production rollout staged at low % and crashes spike before ramp | Crash regression in shipped build | Play Console → Production → Halt rollout. Investigate via crash reports. Patch + new versionCode + re-upload. |

## Anti-patterns

- **Do NOT use the service-account API to upload as the default path.** Per `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md`, Tate's logged-in Chrome session IS the canonical credential. The service account (`creds.google_play_service_account_json`) is fallback only and is currently unprovisioned / demoted per `~/ecodiaos/docs/secrets/_pending-google-play-service-account.md`.
- **Do NOT skip Internal Testing and ship straight to Production for new Capacitor sync changes.** The pre-launch report is the highest-value automated signal we get on Android, and it runs on every track. Production-direct skips zero process — but new Capacitor sync changes risk regressions worth catching in a low-risk track first.
- **Do NOT bump versionCode by +N "to be safe".** Play allows any monotonic increase; +1 is sufficient. Larger jumps consume the version-code namespace faster and provide zero safety benefit.
- **Do NOT upload the unsigned AAB and let Play sign it.** Play App Signing requires the upload-key-signed bundle as input. Unsigned uploads are rejected. Always sign with the upload key in `signingConfigs.release` block.
- **Do NOT click through the file picker instead of drag-drop.** Coords drift across Play Console UI iterations. Drag-drop is more stable, faster, and matches the logged-in-session doctrine.
- **Do NOT log into a different Google account to upload.** The Play developer account is `code@ecodia.au` per `~/ecodiaos/patterns/code-at-ecodia-au-is-only-google-workspace-and-claude-max.md`. Wrong account = 403 / dev-not-found, plus contaminates Tate's session.
- **Do NOT modify Co-Exist or Roam source.** Per `~/ecodiaos/patterns/client-code-scope-discipline.md`, the only mutation this recipe performs is the `versionCode` (and optionally `versionName`) bump in `android/app/build.gradle`. Even that is left **uncommitted** by default. Tate decides whether to commit + push after upload success.
- **Do NOT push the version bump to origin/{slug} from the build machine.** The bump is uncommitted; never `git push` from this recipe's flow.
- **Do NOT codify Play Console coords without live observation on first real ship.** Coords drift across UI iterations. The coordinates table date-stamps each entry; re-walk on Play Console upgrades. See `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md`.
- **Do NOT log keystore passwords or Apple-style credentials anywhere.** Run logs at `~/ecodiaos/drafts/{slug}-android-release-runs/run-*/` should pass through cred values without echoing them. The `set -x` Bash mode is FORBIDDEN inside Phase A.5 / A.7.
- **Do NOT auto-resolve git pull conflicts on the {slug} repo.** HALT + status_board P2 + Tate decides. Same rule as the iOS recipe.
- **Do NOT `taskkill` Tate's Chrome on Corazon to reach Play Console.** Use the foreground-collision check + defer/restore path. Never disturb other windows or processes.
- **Do NOT ignore Play pre-launch report warnings on first ship of a new app.** The report runs automatically and surfaces real issues (accessibility, security, crashes) that are easy to fix early and expensive to fix in Production rollout.

## Cross-references

- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` — meta-doctrine for recipe authoring/optimisation; this recipe is a paper-authored worked instance pending verification
- `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` — sibling iOS release recipe (verified end-to-end ~10min), strongest shape template for this recipe
- `~/ecodiaos/patterns/cowork-no-focus-collision.md` — foreground-window probe rule, applies to all `input.*` calls in Phase B regardless of substrate
- `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md` — doctrine that justifies driving Tate's logged-in Chrome session over generating a Play Developer API service account
- `~/ecodiaos/patterns/tailscale-macro-replaces-cowork.md` — current substrate doctrine: Tailscale laptop-agent on Corazon (`input.*` + `screenshot.*` + `shell.shell`) is the default UI-driving path
- `~/ecodiaos/docs/secrets/android-keystores.md` — `creds.android.{slug}` schema, restoration block, PARTIAL status (passwords pending), build wiring drift for Roam
- `~/ecodiaos/docs/secrets/_pending-google-play-service-account.md` — service-account JSON status (PENDING and demoted to fallback under the GUI-macro doctrine)
- `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md` — 5-point laptop-route check for Phase B sign-in / 2FA fallback
- `~/ecodiaos/patterns/client-code-scope-discipline.md` — the versionCode bump is the only mutation; left uncommitted; never `git push` from the recipe
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` — coords drift; re-walk on Play Console UI upgrades; first real ship populates the coords table
- `~/ecodiaos/patterns/code-at-ecodia-au-is-only-google-workspace-and-claude-max.md` — Play developer account lives on `code@ecodia.au` (Google Workspace), do not log into another account
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` — "Released" status in Play Console + first install on a real device is the ground-truth confirmation, not just upload-success dialog
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` — Corazon's full tool surface (input.*, screenshot.*, shell.shell, etc.) is what Phase B calls
- `~/ecodiaos/clients/coexist.md` (if exists) — Co-Exist client-specific architecture/contract context
