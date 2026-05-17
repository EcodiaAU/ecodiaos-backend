---
triggers: capacitor-push-no-token, capacitor-registration-event-silent, capacitor-plugin-manual-bridge, capacitor-notification-center-name, capacitorDidRegisterForRemoteNotifications, push-tokens-empty-with-firebase, push-debug-all-unknown, manual-app-delegate-bridges-capacitor-plugin, firebase-messaging-capacitor-coexist, fcm-token-bridge-empty, preferences-plugin-key-prefix, capacitor-storage-prefix, capacitor-preferences-key-prefix-CapacitorStorage, capacitor-plugin-silent-typo, app-delegate-notificationCenter-rawValue
status: validated_v1
---

# Capacitor plugin manual-bridge must use the namespaced NotificationCenter name (and CapacitorStorage key prefix)

## Rule

When an iOS AppDelegate manually intercepts a system delegate callback (e.g. `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`) in order to wire it into a Capacitor plugin's chain, the AppDelegate MUST post the NotificationCenter event under the plugin's EXACT namespaced name. Likewise, anything an AppDelegate writes to `UserDefaults.standard` that is supposed to be readable from JS via `Preferences.get` MUST use the Capacitor Preferences key prefix (default `CapacitorStorage.`).

Concretely for push notifications:

```swift
import Capacitor
import FirebaseMessaging

func application(_ application: UIApplication,
                 didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    // (a) Hand the token to Firebase so it mints the FCM token
    Messaging.messaging().apnsToken = deviceToken

    // (b) CORRECT: post the Capacitor-defined notification name. The
    // @capacitor/push-notifications plugin observes this exact symbol;
    // posting ANYTHING else means the plugin never fires the JS
    // 'registration' event and no token ever reaches storeToken.
    NotificationCenter.default.post(
        name: .capacitorDidRegisterForRemoteNotifications,
        object: deviceToken
    )
}

func application(_ application: UIApplication,
                 didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NotificationCenter.default.post(
        name: .capacitorDidFailToRegisterForRemoteNotifications,
        object: error
    )
}
```

The raw values of those names are `"CapacitorDidRegisterForRemoteNotificationsNotification"` and `"CapacitorDidFailToRegisterForRemoteNotificationsNotification"` (defined in `@capacitor/ios/Capacitor/Capacitor/CAPNotifications.swift`).

## Preferences key prefix

`@capacitor/preferences` v8 reads `UserDefaults.standard` with a default group prefix of `CapacitorStorage.`. Any diagnostic or bridge value the JS side reads via `Preferences.get({ key: 'foo' })` must be written from Swift as:

```swift
UserDefaults.standard.set(value, forKey: "CapacitorStorage." + key)
```

Plain `UserDefaults.standard.set(value, forKey: "foo")` is invisible to the JS side.

## How this fails

Both bugs are **silent**. The plugin call `register()` returns success, the permission prompt accepts, no error is thrown, no console line warns. The symptom on production:

- `push_tokens` table stays at 0 rows across every active user
- The app's `/admin/push-debug` page shows all `Native diagnostics` fields as null
- iOS Settings shows the app has notification permission granted
- Firebase Cloud Messaging dashboard shows zero tokens registered

The wrong notification name skips the plugin's observer entirely, so the JS `registration` listener never fires. The wrong UserDefaults key namespace makes every diagnostic and the FCM token bridge poll silently return null.

## Why

The Capacitor `ApplicationDelegateProxy` pattern: when an AppDelegate defines a system delegate callback itself (rather than letting the proxy chain handle it), the AppDelegate's implementation wins and must explicitly forward to the plugin chain. The plugin chain listens on a specific `NotificationCenter` name — not the generic `"didRegisterForRemoteNotificationsWithDeviceToken"` string. The Capacitor team chose a namespaced rawValue (`"CapacitorDidRegisterForRemoteNotificationsNotification"`) precisely so that plugin code wouldn't collide with arbitrary other observers.

The Preferences prefix exists for the same reason — to allow multiple sub-systems on the same `UserDefaults.standard` without key collisions.

A plain Capacitor app with a stock 49-line AppDelegate (no manual interception) works for free, because the proxy chain posts the right name automatically. The bug only appears when an app needs to add Firebase or another native SDK that requires the APNs token, so the developer writes a custom AppDelegate to bridge. If they hand-type the name from the iOS delegate function signature, they get the wrong name and break the entire push pipeline.

## Verification protocol

Before merging any AppDelegate change that touches push:

1. `grep "capacitorDidRegisterForRemoteNotifications\|CapacitorDidRegisterForRemoteNotifications" ios/App/App/AppDelegate.swift` — must return at least one hit and that hit must be the `NotificationCenter.default.post` call.
2. `grep "didRegisterForRemoteNotificationsWithDeviceToken" ios/App/App/AppDelegate.swift` — should only appear in the iOS delegate function signature, NOT in any `NotificationCenter.default.post(name:...)` argument.
3. `grep "CapacitorStorage\." ios/App/App/AppDelegate.swift` — every `UserDefaults.standard.set(...)` that the JS side polls via Preferences must use this prefix.
4. After ship: open `/admin/push-debug` on a real device, tap "Force register". Within 5s the `apnsTokenHex`, `firebaseConfigured`, `didRegisterCalled` fields must populate, and the `push_tokens` DB rows section must show at least one entry.

## Origin

- 17 May 2026 16:30-17:00 AEST. Tate flagged that Co-Exist push notifications "STILL don't work" and that Roam (sister Capacitor app on the same team) was fine.
- Root cause traced in one pass: AppDelegate posted `Notification.Name(rawValue: "didRegisterForRemoteNotificationsWithDeviceToken")` while the plugin observed `Notification.Name.capacitorDidRegisterForRemoteNotifications` (rawValue `"CapacitorDidRegisterForRemoteNotificationsNotification"`). Single-typo bug, broke every device registration since the Firebase wiring landed at commit `4b1dbf0`.
- Compounded by the Preferences key-prefix mismatch — AppDelegate wrote bare keys (`fcmToken`, `firebaseConfigured`, `apnsTokenHex`, etc.) while the JS-side push-debug page polled `Preferences.get({ key: 'fcmToken' })` which reads `CapacitorStorage.fcmToken`. The diagnostic UI showed "all unknown" and the FCM token bridge poll silently returned null even when Firebase had actually minted the token.
- Fix in commit `3860821` ("fix(push): correct NotificationCenter name so Capacitor plugin sees APNs token"), shipped as Co-Exist 1.8.7(7) at 16:59 AEST 17 May 2026. Delivery UUID `4e63e949-f0e7-4a6b-ba24-7cc6612d5921`.

## Cross-references

- `~/ecodiaos/patterns/coexist-ios-headless-ship-recipe.md` - the ship recipe used to deliver the fix
- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` - higher-order doctrine on verifying client-facing changes
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - the bug class where TestFlight "has the push code" but registration still fails
