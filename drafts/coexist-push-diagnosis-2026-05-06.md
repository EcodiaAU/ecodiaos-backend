# Co-Exist Push Notifications - End-to-End Diagnosis (2026-05-06)

Fork: `fork_motww72x_1dd484`. Origin: Tate verbatim 6 May 2026 20:22 AEST "i havent seen a single coexist push notificatio".

## TL;DR

**Push notifications have never worked in production.** Production stats:
- 168 user profiles
- 68 chat messages sent (each tried `supabase.functions.invoke('send-push')`)
- **0 device tokens registered** in `push_tokens`

Cause: native Firebase Cloud Messaging config files are missing from the repo. Without them, Android FCM init silently fails (build.gradle's `try`/`catch` skips the google-services plugin), and iOS has no Firebase iOS SDK initialised. The `PushNotifications.register()` call in `usePushRegistration` either resolves with no token (Android) or returns a raw APNs device token that the FCM v1 API rejects (iOS).

**First broken link: Layers 2c + 3b - `GoogleService-Info.plist` and `google-services.json` are not in the repo.**

## Layer-by-layer status

| # | Layer | Status | Notes |
|---|-------|--------|-------|
| 1a | `@capacitor/push-notifications` v8.0.2 in `package.json` | ✅ | Installed, sync'd into ios + android via Capacitor 8 |
| 1b | `usePushRegistration` mounted in `app-shell.tsx` | ✅ | Line 120 of `src/components/app-shell.tsx`, runs once for every authed user |
| 1c | FE permission request, register, listener, upsert `push_tokens` | ✅ | Well-implemented in `src/hooks/use-push.ts` (deduplicates, retries on storage error, re-registers on app resume, handles deep-link routing on tap) |
| 2a | iOS `App.entitlements` `aps-environment` | ⚠️ | Set to `development` only - should also resolve to `production` for App Store builds. Modern Xcode usually substitutes per-build, verify in next iOS release. |
| 2b | iOS `AppDelegate.swift` Firebase iOS SDK init | ❌ MISSING | `AppDelegate.swift` has no `FirebaseApp.configure()`, no `Messaging.messaging().delegate`, no `application:didRegisterForRemoteNotificationsWithDeviceToken:` forwarding. Capacitor's plugin swizzles APNs callbacks but without Firebase iOS SDK present, the token returned is an APNs hex token, not an FCM token. |
| 2c | iOS `GoogleService-Info.plist` | ❌ MISSING | Not in `ios/App/App/`. Required by Firebase iOS SDK to know which Firebase project to talk to. |
| 3a | Android `AndroidManifest.xml` `POST_NOTIFICATIONS` permission | ✅ | Line 87 |
| 3b | Android `google-services.json` | ❌ MISSING | Not in `android/app/`. `android/app/build.gradle` lines 57-64 have a `try`/`catch` that gracefully skips the google-services plugin if the JSON is absent - exactly what's happening in production today. The Gradle log even says "Push Notifications won't work". |
| 3c | Android `com.google.gms:google-services` classpath | ✅ | Wired in `android/build.gradle` line 11. Will activate as soon as the JSON arrives. |
| 4 | `push_tokens` table schema with RLS | ✅ | Migration `002_push_tokens.sql` defines `(id, user_id, token, platform, device_info, created_at, updated_at)`, unique on `(user_id, token)`, RLS scoped to `auth.uid() = user_id`, service role bypass. |
| 4a | `push_tokens` row count in production | ❌ ZERO | `content-range: */0` from PostgREST. Not a single device has ever registered a token. This is the symptom of layers 2c + 3b. |
| 5 | Edge function `supabase/functions/send-push/index.ts` exists | ✅ | Well-implemented: FCM HTTP v1, OAuth2 JWT exchange with service account, per-user notification preference filtering, quiet-hours filter (timezone-aware), invalid-token cleanup. |
| 5a | `send-push` deployed | ✅ | v36 ACTIVE per Supabase Management API, last updated 2026-05-01. |
| 5b | `FCM_PROJECT_ID` + `FCM_SERVICE_ACCOUNT_KEY` env vars set | ✅ | Both encrypted secrets present in project `tjutlbzekfouwsiaplbr` since 2026-03-26. (Cannot read values back through the API - they live only in the Edge runtime.) |
| 5c | Edge function honours `notification_preferences` + quiet hours + chat master gate | ✅ | Sound logic at lines 290-349. Includes the master `chat_messages` toggle that disables all `chat_*` subtypes. |
| 5d | End-to-end smoke test of edge function | ✅ | Direct invocation with the new `sb_secret_*` key returned `{"sent":0}` for a fake user UUID. Auth + DB query path works. (Note: had to switch to the new `sb_secret_*` key because `SUPABASE_SERVICE_ROLE_KEY` env var was rotated to the new key system today 2026-05-06 06:22 UTC; the legacy `eyJ...service_role` JWT no longer matches the env value.) |
| 6 | Trigger: `chat_messages` insert → `send-push` | ✅ | FE-side via `supabase.functions.invoke('send-push', {...})` in `src/hooks/use-chat.ts` line 439. Excludes sender from recipient list. Branches per message type into `chat_messages` / `chat_reply` / `chat_image` / `chat_poll` / `chat_announcement`. |
| 7 | Privacy settings (`profiles.notification_preferences`) | ✅ | Column exists on all 168 profiles (defaults to `{}`). Edge function correctly defaults to "send" when prefs absent. |

## What this means in user-facing terms

When User A sends a chat message right now:
1. The FE successfully INSERTs the row into `chat_messages` (works - 68 of these in prod).
2. The FE then fires `supabase.functions.invoke('send-push', { userIds: <recipients>, ... })` (fire-and-forget, non-blocking).
3. Edge function looks up `push_tokens` for those recipients.
4. **Result is ALWAYS empty** because no device has ever managed to register a token (no Firebase config). Function returns `{"sent": 0}`.
5. No push, no logs, no error to the user. Silently dark.

## First fix - what unblocks the entire chain

Get the existing Firebase project's two config files into the repo and commit:
- `android/app/google-services.json`
- `ios/App/App/GoogleService-Info.plist`

Both files are downloadable from the Firebase Console for the existing FCM project. The project already exists (FCM_PROJECT_ID env var was set 2026-03-26).

Once those land:
- **Android push will start working immediately** for the next release build (FCM auto-init via google-services plugin, no other code change needed).
- **iOS push will need one additional code change**: add the Firebase iOS SDK pod to `ios/App/Podfile` and call `FirebaseApp.configure()` in `AppDelegate.application(_:didFinishLaunchingWithOptions:)`. Without this, iOS will still emit raw APNs tokens that FCM HTTP v1 rejects. Verify the APNs Auth Key (`.p8`) is uploaded to the Firebase project's Cloud Messaging settings - without it, FCM cannot bridge to APNs at all.

## Items needing Tate

These need either Tate's logged-in Firebase Console session (via Corazon) or his Apple Developer Portal session:

1. **RECORD-* - Firebase Console: download `google-services.json`**
   - Location: Firebase Console → Project Settings → General → Your apps → Android app `org.coexistaus.app` → "google-services.json" download button
   - If the Android app entry doesn't exist yet, "Add app" → Android → bundle id `org.coexistaus.app` → Register → Download config file
   - Output: drop the file at `~/workspaces/coexist/android/app/google-services.json`, then `git add` + commit + `npx cap sync android`

2. **RECORD-* - Firebase Console: download `GoogleService-Info.plist`**
   - Location: Firebase Console → Project Settings → General → Your apps → iOS app `org.coexistaus.app` → "GoogleService-Info.plist" download button
   - If the iOS app entry doesn't exist yet, "Add app" → iOS → bundle id `org.coexistaus.app` → Register → Download config file
   - Output: drop the file at `~/workspaces/coexist/ios/App/App/GoogleService-Info.plist`, add to Xcode project, commit, `npx cap sync ios`

3. **VERIFY - APNs Auth Key uploaded to Firebase Cloud Messaging**
   - Location: Firebase Console → Project Settings → Cloud Messaging tab → Apple app configuration → "APNs Authentication Key" section
   - If empty, generate a `.p8` key in Apple Developer Portal → Keys → "+" → enable Apple Push Notifications service → Download → upload to Firebase
   - Without this, FCM cannot bridge to APNs and iOS pushes will never deliver even with everything else correct.

4. **POST-CONFIG - iOS Firebase SDK wiring** (conductor-doable once `GoogleService-Info.plist` is in the repo, no Tate-action needed)
   - Add `pod 'Firebase/Messaging'` to `ios/App/Podfile`
   - Add `FirebaseApp.configure()` to `AppDelegate.application(_:didFinishLaunchingWithOptions:)`
   - `cd ios/App && pod install && cd -` then `npx cap sync ios`

5. **POST-CONFIG - Verify `aps-environment` for production builds**
   - `App.entitlements` currently has `aps-environment = development`. Verify Xcode resolves this to `production` automatically for App Store / TestFlight builds, or split into per-config entitlements.

## Non-Tate fixes shipped this fork window

(See follow-up commits for details.)

- `kv_store.creds.coexist_supabase` updated with the new `sb_publishable_*` + `sb_secret_*` keys to replace the legacy `eyJ...` JWT keys that no longer match the rotated edge-function env vars.
- Status board P1 row tracking the dark-push state with full context.

## How to verify END-TO-END once Tate-required pieces land

1. Drop the two config files in place, commit, `npx cap sync ios && npx cap sync android`.
2. Build new iOS + Android binaries, install on a real device (not simulator - APNs tokens require a physical device for iOS).
3. Sign in. Open the app. Watch the device console: should see `[push] token received: <12-char-prefix>...` then `[push] token stored successfully`.
4. SQL on `tjutlbzekfouwsiaplbr`:
   ```sql
   SELECT user_id, platform, LEFT(token, 12) AS token_prefix, created_at
   FROM push_tokens ORDER BY created_at DESC LIMIT 5;
   ```
   Expect a row.
5. From a second account / device, post in any collective chat that the first user is a member of.
6. First device should receive the push notification within a few seconds. Title = sender name, body = message preview (or generic if `preview_disabled`).
7. Tap the notification → app opens to the chat thread.
