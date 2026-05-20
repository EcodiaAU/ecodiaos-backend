---
triggers: macro-recipe, captured-recipe, asc-app-record-create, app-store-connect-create-app, new-app-record-asc, appstoreconnect-add-app, asc-app-creation, ios-app-record-bootstrap, asc-new-app-flow, register-new-app-asc
capture_method: os-hook-recorder
captured_at: 2026-05-07T03:13:50.169Z
flow_slug: asc-app-record-create
status: untested_spec
replay_method: uia_or_pixel
raw_event_count: 11
vision_enriched_count: 0
vision_errored_count: 0
vision_skipped_count: 0
vision_auth_source: skipped
session_id: 2026-05-07-1245-brmt01
---

# Asc App Record Create (captured via os-hook-recorder)

<!--
Trigger-narrowing audit 2026-05-20 (self-evolution Routine):
OLD triggers: macro-recipe, captured-recipe, asc-app-record-create, asc, app, record, create, new, google, chrome, chrome-exe, store, connect
NEW triggers: macro-recipe, captured-recipe, asc-app-record-create, app-store-connect-create-app, new-app-record-asc, appstoreconnect-add-app, asc-app-creation, ios-app-record-bootstrap, asc-new-app-flow, register-new-app-asc
Why: 9 of the 13 OLD triggers were bare common nouns (`asc`, `app`, `record`, `create`, `new`, `google`, `chrome`, `chrome-exe`, `store`, `connect`) that match any brief mentioning an app, chrome, the verb "create", or a new anything. Per triggers-must-be-narrow-not-broad.md, replaced with compounds tying ASC + new-app-record creation together.
-->

## Origin

Captured 2026-05-07 ~12:45 AEST during the EOS Mobile iOS-release pipeline setup. Tate hit Ctrl+Shift+R on Corazon, performed the App Store Connect "Create App Record" flow in Chrome (ASC → Apps → New App, internal-group access setup with `tate@ecodia.au` as the access user), stopped the recorder. Captured at 1366x768 Chrome window. Status remains `untested_spec` per `macros-must-be-validated-by-real-run-before-codification.md`; flips to `validated_v1` after a real replay against a fresh app on ASC.

## When to use this

Run this recipe whenever a new EOS Mobile-class app needs its App Store Connect app record created (the ASC-side counterpart to bundle ID + APNs registration). One-time-per-app at the start of an iOS release pipeline; pairs with `apple-dev-bundle-id-register` (Apple Developer portal side) and `xcode-signing-team-select` (Xcode-side).

Inferred destination(s): New tab - Google Chrome, App Store Connect - Google Chrome.


## Pre-flight

<!-- TODO: list kv_store creds, state assumptions, prerequisite tools, foreground requirements (cowork-no-focus-collision check). -->

Program(s) involved:
- New tab - Google Chrome (program: chrome.exe)
- App Store Connect - Google Chrome (program: chrome.exe)


## Verified coordinates table


| Step | Action | X | Y | Target text | UIA selector hint | Window | Captured-at |
|---|---|---|---|---|---|---|---|
| 1 | keypress |  |  | Enter | - | New tab - Google Chrome | 2026-05-07T02:45:21.000Z |
| 2 | keypress |  |  | Ctrl+v | - | New tab - Google Chrome | 2026-05-07T02:45:21.000Z |
| 3 | keypress |  |  | Ctrl+n | - | App Store Connect - Google Chrome | 2026-05-07T02:45:21.000Z |
| 4 | click | 172 | 622 | Create New Internal Group | type=dialog name="Create New Internal Group" automation_id=modal-dialog-0.015785472706518977-1 | App Store Connect - Google Chrome | 2026-05-07T02:45:29.000Z |
| 5 | click | 439 | 367 | Create New Internal Group | type=dialog name="Create New Internal Group" automation_id=modal-dialog-0.015785472706518977-1 | App Store Connect - Google Chrome | 2026-05-07T02:45:31.000Z |
| 6 | click | 946 | 581 | - | type=main | App Store Connect - Google Chrome | 2026-05-07T02:45:34.000Z |
| 7 | click | 364 | 464 | - | type=main | App Store Connect - Google Chrome | 2026-05-07T02:45:37.000Z |
| 8 | click | 324 | 540 | Select tate@ecodia.au | type=check box name="Select tate@ecodia.au" automation_id=react-aria8048389739-39 | App Store Connect - Google Chrome | 2026-05-07T02:45:39.000Z |
| 9 | click | 322 | 436 | - | type=main | App Store Connect - Google Chrome | 2026-05-07T02:45:41.000Z |
| 10 | keypress |  |  | Ctrl+w | - | New tab - Google Chrome | 2026-05-07T02:45:49.000Z |
| 11 | keypress |  |  | Ctrl+n | - | App Store Connect - Google Chrome | 2026-05-07T02:45:49.000Z |

<!-- Coordinates above were captured at recording time. Re-verify against the live UI before codifying as `validated_v1`. -->


## Step-by-step procedure

1. Keyboard input in **New tab - Google Chrome** - typed: `Enter` (`2026-05-07T02:45:21.000Z`)
 - Pixel coords (fallback): `(, )`

2. Keyboard input in **New tab - Google Chrome** - typed: `Ctrl+v` (`2026-05-07T02:45:21.000Z`)
 - Pixel coords (fallback): `(, )`

3. Keyboard input in **App Store Connect - Google Chrome** - typed: `Ctrl+n` (`2026-05-07T02:45:21.000Z`)
 - Pixel coords (fallback): `(, )`

4. Left-click on **Create New Internal Group** in **App Store Connect - Google Chrome** (`2026-05-07T02:45:29.000Z`)
 - UIA: `type=dialog name="Create New Internal Group" automation_id=modal-dialog-0.015785472706518977-1`
 - Pixel coords (fallback): `(172, 622)`

5. Left-click on **Create New Internal Group** in **App Store Connect - Google Chrome** (`2026-05-07T02:45:31.000Z`)
 - UIA: `type=dialog name="Create New Internal Group" automation_id=modal-dialog-0.015785472706518977-1`
 - Pixel coords (fallback): `(439, 367)`

6. Left-click on **(unknown target)** in **App Store Connect - Google Chrome** (`2026-05-07T02:45:34.000Z`)
 - UIA: `type=main`
 - Pixel coords (fallback): `(946, 581)`

7. Left-click on **(unknown target)** in **App Store Connect - Google Chrome** (`2026-05-07T02:45:37.000Z`)
 - UIA: `type=main`
 - Pixel coords (fallback): `(364, 464)`

8. Left-click on **Select tate@ecodia.au** in **App Store Connect - Google Chrome** (`2026-05-07T02:45:39.000Z`)
 - UIA: `type=check box name="Select tate@ecodia.au" automation_id=react-aria8048389739-39`
 - Pixel coords (fallback): `(324, 540)`

9. Left-click on **(unknown target)** in **App Store Connect - Google Chrome** (`2026-05-07T02:45:41.000Z`)
 - UIA: `type=main`
 - Pixel coords (fallback): `(322, 436)`

10. Keyboard input in **New tab - Google Chrome** - typed: `Ctrl+w` (`2026-05-07T02:45:49.000Z`)
 - Pixel coords (fallback): `(, )`

11. Keyboard input in **App Store Connect - Google Chrome** - typed: `Ctrl+n` (`2026-05-07T02:45:49.000Z`)
 - Pixel coords (fallback): `(, )`


## Verification protocol

<!-- TODO: per-step pre/post-verify probes (see ~/ecodiaos/patterns/gui-step-verify-protocol.md). -->

| Step | Pre-verify (must hold before action) | Action | Post-verify (must hold within budget) | Budget |
|---|---|---|---|---|
| 1 | <!-- TODO --> | type in "New tab - Google Chrome" "Enter" | <!-- TODO --> | <!-- TODO --> |
| 2 | <!-- TODO --> | type in "New tab - Google Chrome" "Ctrl+v" | <!-- TODO --> | <!-- TODO --> |
| 3 | <!-- TODO --> | type in "App Store Connect - Google Chrome" "Ctrl+n" | <!-- TODO --> | <!-- TODO --> |
| 4 | <!-- TODO --> | click "Create New Internal Group" in "App Store Connect - Google Chrome" | <!-- TODO --> | <!-- TODO --> |
| 5 | <!-- TODO --> | click "Create New Internal Group" in "App Store Connect - Google Chrome" | <!-- TODO --> | <!-- TODO --> |
| 6 | <!-- TODO --> | click "?" in "App Store Connect - Google Chrome" | <!-- TODO --> | <!-- TODO --> |
| 7 | <!-- TODO --> | click "?" in "App Store Connect - Google Chrome" | <!-- TODO --> | <!-- TODO --> |
| 8 | <!-- TODO --> | click "Select tate@ecodia.au" in "App Store Connect - Google Chrome" | <!-- TODO --> | <!-- TODO --> |
| 9 | <!-- TODO --> | click "?" in "App Store Connect - Google Chrome" | <!-- TODO --> | <!-- TODO --> |
| 10 | <!-- TODO --> | type in "New tab - Google Chrome" "Ctrl+w" | <!-- TODO --> | <!-- TODO --> |
| 11 | <!-- TODO --> | type in "App Store Connect - Google Chrome" "Ctrl+n" | <!-- TODO --> | <!-- TODO --> |


## Fast-path checklist

<!-- TODO: optimised cmd-by-cmd run with verified end-to-end target timing. After validation, replace this stub with the codified fast path. -->

```
# Step 1: type in "New tab - Google Chrome" "Enter"
# Step 2: type in "New tab - Google Chrome" "Ctrl+v"
# Step 3: type in "App Store Connect - Google Chrome" "Ctrl+n"
# Step 4: click "Create New Internal Group" in "App Store Connect - Google Chrome"
# Step 5: click "Create New Internal Group" in "App Store Connect - Google Chrome"
# Step 6: click "?" in "App Store Connect - Google Chrome"
# Step 7: click "?" in "App Store Connect - Google Chrome"
# Step 8: click "Select tate@ecodia.au" in "App Store Connect - Google Chrome"
# Step 9: click "?" in "App Store Connect - Google Chrome"
# Step 10: type in "New tab - Google Chrome" "Ctrl+w"
# Step 11: type in "App Store Connect - Google Chrome" "Ctrl+n"
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
