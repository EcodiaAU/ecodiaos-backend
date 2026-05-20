---
triggers: macro-recipe, captured-recipe, apple-dev-apns-auth-key-create, apns-auth-key, apns-key-download, p8-download, push-notification-key, apple-dev-keys, apns-key-create-portal, apns-auth-key-download, AuthKey_.p8, apple-developer-keys-section, apns-key-generation, certificates-identifiers-profiles
capture_method: os-hook-recorder
captured_at: 2026-05-07T03:13:34.660Z
flow_slug: apple-dev-apns-auth-key-create
note: Renamed 7 May 2026 13:22 AEST per Tate correction — captured flow is APNs Auth Key creation/download, NOT bundle-id register (Xcode automatic signing handled bundle-id automatically; no recording needed). Original slug apple-dev-bundle-id-register was a brief-time mislabel.
status: untested_spec
replay_method: uia_or_pixel
raw_event_count: 12
vision_enriched_count: 0
vision_errored_count: 0
vision_skipped_count: 12
vision_auth_source: os_oauth_chain
session_id: 2026-05-07-1226-wzhn9t
---

# Apple Dev Bundle Id Register (captured via os-hook-recorder)

<!--
Trigger-narrowing audit 2026-05-20 (self-evolution Routine):
OLD triggers included `apple, dev, certificates, identifiers, profiles, developer, push-notifications` as bare common nouns.
NEW triggers replace these with compounds: `apns-key-create-portal`, `apns-auth-key-download`, `AuthKey_.p8`, `apple-developer-keys-section`, `apns-key-generation`, `certificates-identifiers-profiles`.
Why: `apple`, `dev`, `developer`, `certificates`, `identifiers`, `profiles` would surface this recipe on any Apple developer brief, push token brief, certificate-rotation brief, etc. Per triggers-must-be-narrow-not-broad.md, narrow to literal flow identifiers and the AuthKey p8 file path.
-->

## Origin

Captured 2026-05-07 ~12:26 AEST during the EOS Mobile iOS-release pipeline setup. Tate hit Ctrl+Shift+R on Corazon, performed the Apple Developer portal flow in Chrome (creating + downloading the EOS Mobile APNs auth key for the registered bundle ID), stopped the recorder. Slug `apple-dev-bundle-id-register` is the per-app one-time-setup arc — bundle ID registration plus the APNs key it needs for push notifications. Captured at 1366x768 Chrome window. Status remains `untested_spec` per `macros-must-be-validated-by-real-run-before-codification.md`; flips to `validated_v1` after a real replay against a fresh app's Apple Dev portal.

## When to use this

Run this recipe whenever a new EOS Mobile-class app needs its bundle ID + APNs auth key registered against the Ecodia Pty Ltd Apple Developer team (`team_id 86PUY7393S`). One-time-per-app at the start of an iOS release pipeline; pairs with `xcode-signing-team-select` (Xcode-side) and `asc-app-record-create` (ASC-side).

Inferred destination(s): New tab - Google Chrome, Ecodia OS - Google Chrome, Certificates, Identifiers & Profiles - Apple Developer - Google Chrome.


## Pre-flight

<!-- TODO: list kv_store creds, state assumptions, prerequisite tools, foreground requirements (cowork-no-focus-collision check). -->

Program(s) involved:
- New tab - Google Chrome (program: chrome.exe)
- Ecodia OS - Google Chrome (program: chrome.exe)
- Certificates, Identifiers & Profiles - Apple Developer - Google Chrome (program: chrome.exe)


## Verified coordinates table


| Step | Action | X | Y | Target text | UIA selector hint | Window | Captured-at |
|---|---|---|---|---|---|---|---|
| 1 | keypress |  |  | Enter | - | New tab - Google Chrome | 2026-05-07T02:26:59.000Z |
| 2 | keypress |  |  | Ctrl+v | - | New tab - Google Chrome | 2026-05-07T02:26:59.000Z |
| 3 | keypress |  |  | Ctrl+t | - | Ecodia OS - Google Chrome | 2026-05-07T02:26:59.000Z |
| 4 | click | 305 | 281 | - | type=main | Certificates, Identifiers & Profiles - Apple Developer - Google Chrome | 2026-05-07T02:27:08.000Z |
| 5 | click | 111 | 506 | Establish connectivity between your notification server and the Apple Push Notification service. One key is used for all of your apps. Learn moreThis service must have environment and type configuredConfigure | type=list item name="Establish connectivity between your notification server and the Apple Push Notification service. One key is used for all of your apps. Learn moreThis service must have environment and type configuredConfigure" | Certificates, Identifiers & Profiles - Apple Developer - Google Chrome | 2026-05-07T02:27:24.000Z |
| 6 | click | 1151 | 522 | - | type=main | Certificates, Identifiers & Profiles - Apple Developer - Google Chrome | 2026-05-07T02:27:30.000Z |
| 7 | click | 420 | 579 | - | type=main | Certificates, Identifiers & Profiles - Apple Developer - Google Chrome | 2026-05-07T02:27:33.000Z |
| 8 | click | 1213 | 265 | Continue | type=button name="Continue" automation_id=action-save | Certificates, Identifiers & Profiles - Apple Developer - Google Chrome | 2026-05-07T02:27:38.000Z |
| 9 | click | 1201 | 226 | - | type=main | Certificates, Identifiers & Profiles - Apple Developer - Google Chrome | 2026-05-07T02:27:41.000Z |
| 10 | click | 1226 | 322 | Done | type=link name="Done" automation_id=action-done | Certificates, Identifiers & Profiles - Apple Developer - Google Chrome | 2026-05-07T02:27:44.000Z |
| 11 | click | 1104 | 326 | Downloaded auth key EOS Mobile APNs | type=button name="Downloaded auth key EOS Mobile APNs" class=tb-btn--disabled | Certificates, Identifiers & Profiles - Apple Developer - Google Chrome | 2026-05-07T02:27:47.000Z |
| 12 | click | 1206 | 319 | APNS ENVIRONMENT | type=column header name="APNS ENVIRONMENT" class=  | Certificates, Identifiers & Profiles - Apple Developer - Google Chrome | 2026-05-07T02:27:50.000Z |

<!-- Coordinates above were captured at recording time. Re-verify against the live UI before codifying as `validated_v1`. -->


## Step-by-step procedure

1. Keyboard input in **New tab - Google Chrome** - typed: `Enter` (`2026-05-07T02:26:59.000Z`)
 - Pixel coords (fallback): `(, )`

2. Keyboard input in **New tab - Google Chrome** - typed: `Ctrl+v` (`2026-05-07T02:26:59.000Z`)
 - Pixel coords (fallback): `(, )`

3. Keyboard input in **Ecodia OS - Google Chrome** - typed: `Ctrl+t` (`2026-05-07T02:26:59.000Z`)
 - Pixel coords (fallback): `(, )`

4. Left-click on **(unknown target)** in **Certificates, Identifiers & Profiles - Apple Developer - Google Chrome** (`2026-05-07T02:27:08.000Z`)
 - UIA: `type=main`
 - Pixel coords (fallback): `(305, 281)`

5. Left-click on **Establish connectivity between your notification server and the Apple Push Notification service. One key is used for all of your apps. Learn moreThis service must have environment and type configuredConfigure** in **Certificates, Identifiers & Profiles - Apple Developer - Google Chrome** (`2026-05-07T02:27:24.000Z`)
 - UIA: `type=list item name="Establish connectivity between your notification server and the Apple Push Notification service. One key is used for all of your apps. Learn moreThis service must have environment and type configuredConfigure"`
 - Pixel coords (fallback): `(111, 506)`

6. Left-click on **(unknown target)** in **Certificates, Identifiers & Profiles - Apple Developer - Google Chrome** (`2026-05-07T02:27:30.000Z`)
 - UIA: `type=main`
 - Pixel coords (fallback): `(1151, 522)`

7. Left-click on **(unknown target)** in **Certificates, Identifiers & Profiles - Apple Developer - Google Chrome** (`2026-05-07T02:27:33.000Z`)
 - UIA: `type=main`
 - Pixel coords (fallback): `(420, 579)`

8. Left-click on **Continue** in **Certificates, Identifiers & Profiles - Apple Developer - Google Chrome** (`2026-05-07T02:27:38.000Z`)
 - UIA: `type=button name="Continue" automation_id=action-save`
 - Pixel coords (fallback): `(1213, 265)`

9. Left-click on **(unknown target)** in **Certificates, Identifiers & Profiles - Apple Developer - Google Chrome** (`2026-05-07T02:27:41.000Z`)
 - UIA: `type=main`
 - Pixel coords (fallback): `(1201, 226)`

10. Left-click on **Done** in **Certificates, Identifiers & Profiles - Apple Developer - Google Chrome** (`2026-05-07T02:27:44.000Z`)
 - UIA: `type=link name="Done" automation_id=action-done`
 - Pixel coords (fallback): `(1226, 322)`

11. Left-click on **Downloaded auth key EOS Mobile APNs** in **Certificates, Identifiers & Profiles - Apple Developer - Google Chrome** (`2026-05-07T02:27:47.000Z`)
 - UIA: `type=button name="Downloaded auth key EOS Mobile APNs" class=tb-btn--disabled`
 - Pixel coords (fallback): `(1104, 326)`

12. Left-click on **APNS ENVIRONMENT** in **Certificates, Identifiers & Profiles - Apple Developer - Google Chrome** (`2026-05-07T02:27:50.000Z`)
 - UIA: `type=column header name="APNS ENVIRONMENT" class= `
 - Pixel coords (fallback): `(1206, 319)`


## Verification protocol

<!-- TODO: per-step pre/post-verify probes (see ~/ecodiaos/patterns/gui-step-verify-protocol.md). -->

| Step | Pre-verify (must hold before action) | Action | Post-verify (must hold within budget) | Budget |
|---|---|---|---|---|
| 1 | <!-- TODO --> | type in "New tab - Google Chrome" "Enter" | <!-- TODO --> | <!-- TODO --> |
| 2 | <!-- TODO --> | type in "New tab - Google Chrome" "Ctrl+v" | <!-- TODO --> | <!-- TODO --> |
| 3 | <!-- TODO --> | type in "Ecodia OS - Google Chrome" "Ctrl+t" | <!-- TODO --> | <!-- TODO --> |
| 4 | <!-- TODO --> | click "?" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome" | <!-- TODO --> | <!-- TODO --> |
| 5 | <!-- TODO --> | click "Establish connectivity between your notification server and the Apple Push Notification service. One key is used for all of your apps. Learn moreThis service must have environment and type configuredConfigure" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome" | <!-- TODO --> | <!-- TODO --> |
| 6 | <!-- TODO --> | click "?" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome" | <!-- TODO --> | <!-- TODO --> |
| 7 | <!-- TODO --> | click "?" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome" | <!-- TODO --> | <!-- TODO --> |
| 8 | <!-- TODO --> | click "Continue" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome" | <!-- TODO --> | <!-- TODO --> |
| 9 | <!-- TODO --> | click "?" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome" | <!-- TODO --> | <!-- TODO --> |
| 10 | <!-- TODO --> | click "Done" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome" | <!-- TODO --> | <!-- TODO --> |
| 11 | <!-- TODO --> | click "Downloaded auth key EOS Mobile APNs" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome" | <!-- TODO --> | <!-- TODO --> |
| 12 | <!-- TODO --> | click "APNS ENVIRONMENT" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome" | <!-- TODO --> | <!-- TODO --> |


## Fast-path checklist

<!-- TODO: optimised cmd-by-cmd run with verified end-to-end target timing. After validation, replace this stub with the codified fast path. -->

```
# Step 1: type in "New tab - Google Chrome" "Enter"
# Step 2: type in "New tab - Google Chrome" "Ctrl+v"
# Step 3: type in "Ecodia OS - Google Chrome" "Ctrl+t"
# Step 4: click "?" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome"
# Step 5: click "Establish connectivity between your notification server and the Apple Push Notification service. One key is used for all of your apps. Learn moreThis service must have environment and type configuredConfigure" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome"
# Step 6: click "?" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome"
# Step 7: click "?" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome"
# Step 8: click "Continue" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome"
# Step 9: click "?" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome"
# Step 10: click "Done" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome"
# Step 11: click "Downloaded auth key EOS Mobile APNs" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome"
# Step 12: click "APNS ENVIRONMENT" in "Certificates, Identifiers & Profiles - Apple Developer - Google Chrome"
```


## Speed wins identified

<!-- TODO: annotated TODOs for the next optimisation pass. -->

- [ ] Batch consecutive `input.*` calls into a single `shell.shell` PowerShell SendInput to remove per-call Tailscale RTT.
- [ ] Replace any fixed-sleep with a UIA state-probe loop where the next-step element exposes a queryable property.
- [ ] Walk the UI tree at replay time to upgrade pixel-clicks to programmatic UIA pattern mutation where supported.


## Failure modes

<!-- TODO: capture symptom + cause + fix as you encounter them during replay. -->

- Symptom: <fill in>. Cause: <fill in>. Fix: <fill in>


## Anti-patterns

- Pixel-click first when UI Automation works on the target. Walk the tree, prefer `InvokePattern`/`ValuePattern`/`TogglePattern` mutation.
- Authoring coords from imagination - this recipe was captured from a real run; do NOT amend coords without a fresh recording or live UIA enumeration.
- Marking this recipe `validated_v1` without a real replay. The capture proves the flow happened once; it does NOT prove the codified replay path works.


## Cross-references

- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` - the meta-doctrine this recipe instantiates.
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` - status flips to `validated_v1` only after a real replay run.
- `~/ecodiaos/patterns/macro-capture-via-os-hook-recorder.md` - capture-method-specific doctrine.
- `~/ecodiaos/patterns/gui-step-verify-protocol.md` - the per-step pre/post-verify protocol all recipes implement.
