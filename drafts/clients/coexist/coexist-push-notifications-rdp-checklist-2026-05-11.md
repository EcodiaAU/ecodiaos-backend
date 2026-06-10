# Co-Exist Push Notifications — Pre-RDP Diagnostic + Tate Checklist

**Authored:** 11 May 2026 11:56 AEST by conductor on main (fork-cap energy-throttled, manager subtree using 3/3 slots).
**Worktree state at probe:** `~/workspaces/coexist` on branch `1.8.5-excel-sync-impact-gate` (modified `supabase/functions/excel-sync/index.ts`). Latest commit `7dc39e5` — share-graphic generator polish.
**Jess + Kurt complaint:** push notifications not working on iOS or Android.

---

## TL;DR

The wiring is **half done**. iOS native side is correct (Firebase SDK + AppDelegate + APNs callbacks all in). The **JS layer never calls `PushNotifications.register()` anywhere in the codebase**, so iOS never starts the APNs handshake. Android is **missing `google-services.json`** entirely, so FCM token minting can't happen. Plus iOS entitlement is `development` so TestFlight builds (where Jess + Kurt are) won't receive production APNs anyway.

Three root causes ordered by likelihood:

1. **No JS register call exists** in `src/`. Capacitor needs explicit `PushNotifications.requestPermissions()` + `PushNotifications.register()` to kick the native flow. **Pure code fix, no RDP needed.**
2. **`android/app/google-services.json` is missing.** Drop the file in, plugin auto-applies, FCM tokens mint. **Code/file fix, no RDP needed beyond Tate exporting from Firebase Console.**
3. **iOS `aps-environment = development`.** TestFlight/AppStore builds get APNs sandbox, prod APNs server never reaches the device. **Code fix, then rebuild + TestFlight upload via existing iOS release recipe.**

**Estimated Tate time:** 3-5 min in Firebase Console + 1 min in Xcode (capability toggle). Everything else is code I (or a fork) can ship after we close P1 leak rotation.

---

## Section 1 — What IS wired (filesystem evidence)

| Component | State | Evidence |
|---|---|---|
| `@capacitor/push-notifications` npm pkg | ✅ INSTALLED | `package.json`: `"@capacitor/push-notifications": "^8.0.2"` (matches Capacitor 8.x major) |
| iOS `GoogleService-Info.plist` | ✅ PRESENT | `ios/App/App/GoogleService-Info.plist`, 1249 bytes, dropped 6 May 2026 |
| iOS Firebase SDK imports | ✅ WIRED | `AppDelegate.swift`: `import FirebaseCore` + `import FirebaseMessaging` |
| iOS `FirebaseApp.configure()` | ✅ FIRST IN didFinishLaunching | First statement of `application(_:didFinishLaunchingWithOptions:)` |
| iOS MessagingDelegate | ✅ SET | `Messaging.messaging().delegate = self`, class conforms to `MessagingDelegate` |
| iOS APNs → FCM pipeline | ✅ DOCUMENTED IN CODE | Full block comment in AppDelegate explains the flow: APNs token → `Messaging.messaging().apnsToken` → FCM token → `MessagingDelegate.didReceiveRegistrationToken` → persisted to UserDefaults → FE reads via `@capacitor/preferences` → POSTs to `push_tokens` table → `send-push` Edge Function uses FCM HTTP v1 |
| Android `INTERNET` permission | ✅ PRESENT | `AndroidManifest.xml` |
| Android `POST_NOTIFICATIONS` permission | ✅ PRESENT | `AndroidManifest.xml` (API 33+ runtime perm) |
| Android FirebaseMessagingService | ✅ DECLARED | `<service>` block in AndroidManifest |
| Android `google-services` Gradle plugin | ✅ CLASSPATH+APPLY | Project build.gradle: `classpath 'com.google.gms:google-services:4.4.4'`. App build.gradle conditionally applies plugin if `google-services.json` file exists |
| Backend `send-push` Edge Function | ✅ EXISTS | `supabase/functions/send-push/` directory present |
| Other notification edge functions | ✅ EXIST | `event-day-notify`, `notify-application`, `notify-report` (these are the senders that call `send-push`) |

## Section 2 — What is NOT wired (the holes)

| Component | State | Evidence | Impact |
|---|---|---|---|
| **Frontend `PushNotifications.register()` call** | ❌ ABSENT | `grep -rE "PushNotifications.register\|registerForRemoteNotifications\|usePushNotifications" src/` returned **ZERO matches** | **iOS will NEVER ask for permission or request an APNs token.** Native side ready, JS never kicks it. Single biggest blocker. |
| **Android `google-services.json`** | ❌ MISSING | `ls android/app/google-services.json` → No such file or directory | Gradle plugin no-ops with explicit warning. FCM tokens never generate. Push will return InvalidRegistration. |
| **iOS Xcode Push capability** | ❌ NOT ENABLED | `grep -E "com.apple.Push" ios/App/App.xcodeproj/project.pbxproj` returned empty | iOS framework won't deliver APNs callbacks to AppDelegate. Even with JS register call, native handshake fails. |
| **iOS `aps-environment` for prod builds** | ⚠️ DEV-ONLY | `App.entitlements`: `<key>aps-environment</key><string>development</string>` | TestFlight + AppStore builds get APNs sandbox not production server. Jess + Kurt's installed app sees no pushes from server even if everything else is fixed. |
| **Co-Exist `push_tokens` table** | ❓ UNKNOWN | Migration grep returned no hits. Could be older migration or table created via dashboard. | Without a tokens table, the `send-push` function has nothing to read from. **Needs Tate to check Supabase Studio at app.supabase.com/project/tjutlbzekfouwsiaplbr/database/tables.** |
| **VERIFY-coexist-firebase-apns-key (status_board row)** | ❓ UNCONFIRMED | Row `pending_tate_verify`, last touched ~6 May | Need Tate to confirm APNs Auth Key actually got uploaded to Firebase Console → Cloud Messaging tab. Without this, FCM can't talk to APNs to send iOS pushes. |

---

## Section 3 — Tate's RDP / Console Checklist

**Substrate map:** Firebase Console + Apple Developer Portal = Corazon Chrome (Tate's logged-in session, drive via `input.*` + screenshot). Xcode = SY094 RDP from Corazon (`MacinCloud_Full_Screen.rdp`). Code edits = on VPS in `~/workspaces/coexist` by fork or me. Reference: `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md`, `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md`.

### Step A — Firebase Console: confirm APNs Auth Key uploaded (2 min, Corazon Chrome)
1. Open Tate's Chrome (Default profile) → `https://console.firebase.google.com/`
2. Pick project: **Co-Exist** (whichever project the `GoogleService-Info.plist` references — open the plist in VS Code, find `PROJECT_ID` and `GCM_SENDER_ID` to confirm the right project before clicking)
3. Project Settings (gear icon top-left) → **Cloud Messaging** tab
4. Scroll to **Apple app configuration** → **APNs Authentication Key** section
5. **If present:** screenshot it (Key ID + Team ID 86PUY7393S visible), move on to Step B
6. **If empty:**
   - Open new tab → `https://developer.apple.com/account/resources/authkeys/list`
   - "+" → check **Apple Push Notifications service (APNs)** → Continue
   - Name it `Co-Exist APNs Key` → Register → Download the `.p8` (one chance, save it somewhere Tate-only)
   - Note the **Key ID** (visible on the download page)
   - Back to Firebase Cloud Messaging tab → APNs Auth Key → **Upload Key**
   - Upload `.p8`, paste Key ID, paste Team ID `86PUY7393S` → Upload

### Step B — Firebase Console: export Android `google-services.json` (1 min, Corazon Chrome)
1. Same Firebase project → Project Settings → **General** tab
2. Scroll to **Your apps** → Android app `au.ecodia.coexist` (or the actual package name — confirm by opening `~/workspaces/coexist/android/app/build.gradle` and reading `applicationId`)
3. **If Android app entry missing:** "Add app" → Android → enter package name from `applicationId` → register → download `google-services.json`
4. **If Android app entry exists:** Click the gear → Download `google-services.json` again
5. **Drop the downloaded file into `~/workspaces/coexist/android/app/google-services.json`** (drag-drop or just `scp` to VPS into worktree — I can place it once Tate sends it)

### Step C — SY094 RDP, Xcode Push capability (1 min)
1. Open `MacinCloud_Full_Screen.rdp` shortcut on Corazon desktop (per `sy094-gui-entry-via-desktop-rdp-shortcut.md`, ~24s)
2. Once in: Terminal → `cd ~/workspaces/coexist && git pull` (or use whichever working copy Tate keeps on SY094)
3. `npx cap sync ios && open ios/App/App.xcworkspace`
4. In Xcode: left sidebar select **App** target → **Signing & Capabilities** tab
5. If **Push Notifications** capability not listed: click **+ Capability** (top-left of the tab) → double-click **Push Notifications** in the picker. This adds `com.apple.Push` to entitlements AND auto-flips aps-environment behaviour at sign time
6. Verify a Background Modes capability exists too with **Remote notifications** checked. If not, add it.
7. Cmd+B → confirm build succeeds. Close Xcode.

### Step D — Tell me when A/B/C are done
At that point I (or a fork) handle:
- **Code:** add a `usePushNotifications` hook to `src/` that calls `PushNotifications.requestPermissions()` then `PushNotifications.register()`, listens for `registration` and `pushNotificationReceived` events, and POSTs the token to a `/push/register` endpoint or directly to the Supabase `push_tokens` table via existing client. Wire it into the root layout so it fires once user is signed in.
- **Entitlement flip:** Change `aps-environment` from `development` to `production` per the same pattern as EOS-mobile commit 7b17f10 (only flip for the TestFlight/AppStore build; keep dev for local dev builds via separate entitlements file or build-config conditional).
- **Build + upload:** Replay `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` (validated_v1, ~10 min e2e of which ~5 min Apple-side latency) for iOS, and `~/ecodiaos/patterns/play-console-android-release-recipe.md` for Android.

---

## Section 4 — How we verify it actually works

1. After new TestFlight build installs on Tate's iPhone: open app, accept "Allow Co-Exist to send notifications" prompt
2. Tail logs: from VPS `pm2 logs ecodia-api --lines 30 | grep -i push`
3. On VPS:
   ```bash
   # Query Co-Exist Supabase push_tokens for Tate's user_id (need Co-Exist creds path via kv_store.creds.coexist_supabase - DO NOT inline service_role here, P1 leak rotation still open)
   ```
4. Hit the Co-Exist `send-push` Edge Function with Tate's user_id from EcodiaOS:
   ```bash
   # curl example placeholder — exact endpoint depends on send-push function shape; check supabase/functions/send-push/index.ts before invoking
   ```
5. Confirm notification lands on iPhone within 3s + on an Android test device.

---

## Section 5 — Cross-refs read

- `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` — RDP open ~24s, programmatic minimise via UIA
- `~/ecodiaos/patterns/macincloud-substrate-selection-ssh-vs-rdp.md` — Xcode work is GUI-bound, MUST be RDP not SSH
- `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` — Co-Exist iOS release validated_v1, replay path for the rebuild
- `~/ecodiaos/patterns/play-console-android-release-recipe.md` — Android release sister recipe
- `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md` — Firebase Console + Apple Dev Portal via input.* on Tate's Default profile
- `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md` — no API keys needed for any of this; Tate's logged-in sessions cover Firebase + Apple Dev Portal + ASC
- `~/ecodiaos/docs/secrets/apple.md` — Apple team_id `86PUY7393S` (Ecodia Pty Ltd)
- `~/ecodiaos/docs/secrets/macincloud.md` — SY094 access via desktop RDP shortcut + SSH for headless
- `~/ecodiaos/docs/secrets/laptop-agent.md` + `laptop-passkey.md` — Windows Hello passkey 6969 if RDP open prompts

Related status_board rows (search for these to update after RDP session):
- `VERIFY-coexist-firebase-apns-key - APNs Auth Key uploaded to Firebase Cloud Messaging` — close after Step A
- `POST-CONFIG iOS Firebase SDK wiring (Xcode + AppDelegate) for Co-Exist push` — close (it's already done in AppDelegate but capability toggle finishes the row)
- (no existing row for Android google-services.json drop — author one after Step B confirms file in place)
- `Push notifications ON for iOS + Android - Jess + Kurt flagged - NOT a code item, Tate + me on SY094 RDP` — partial: this checklist proves it IS partly a code item (JS register call missing + entitlement flip + Android google-services.json drop) plus the RDP toggle. Update next_action to reflect post-RDP follow-ups.

---

## Anti-patterns avoided

- Did NOT dispatch a fork: cap was energy-throttled, Tate asked directly, work was read-only + under 30s + directly responsive to typed instruction (3/3 on-main exceptions).
- Did NOT trust narration: probed worktree on disk for every claim. AppDelegate has the wiring, but the JS register call grep was empty and the Android google-services.json file is absent — both are ground-truth holes that "rows on status_board say it's wired" missed.
- Did NOT inline service_role: P1 secret-leak rotation still open, this file references the credential path via `kv_store.creds.coexist_supabase` only.
