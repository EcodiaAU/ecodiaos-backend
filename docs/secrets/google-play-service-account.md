---
triggers: google-play, play console, service-account, fastlane, supply, play-developer-api, android-upload, aab-upload, programmatic-android-upload, play-uploader
class: programmatic-provisioned
owner: tate
---

# creds.google_play_service_account_json - PROVISIONED 2026-05-28

**Status: PROVISIONED + VALIDATED end-to-end on Chambers 1.0(17) ship 2026-05-29.** The macro-vs-API debate is resolved in favour of API for Android. Every gate Tate cared about (AAB upload, listing copy + assets, production track draft) ships via the Android Publisher API; the remaining Console policy gates go via CDP on the laptop-agent. No drag-drop.

## What it is

A Google Cloud service account JSON key, scoped to the Android Publisher API, with Admin (all permissions) inside Play Console. Used by `scripts/play-upload.py`, `scripts/chambers-play-listing-push.py`, and any future programmatic Play Console interaction.

## Source

- GCP project: `ecodia-code`.
- Service account: `play-uploader@ecodia-code.iam.gserviceaccount.com`.
- JSON key generated 2026-05-28 via `gcloud iam service-accounts keys create`.
- Play Console: Users and permissions -> invited the SA email -> granted Admin (all permissions). This is the one Play-side gesture the API cannot grant itself.

## Local path

`D:/PRIVATE/ecodia-creds/play/play-uploader-key.json`. Both scripts read from this path by default; pass `--key-path` to override.

## Used by

- `D:/.code/EcodiaOS/backend/scripts/play-upload.py` - AAB upload + production track draft.
- `D:/.code/EcodiaOS/backend/scripts/chambers-play-listing-push.py` - listing copy + icon + feature graphic + screenshots.
- Every future Ecodia Android app reuses the same JSON. No per-app re-provisioning.

## Replaceable by macro?

NO for the API surface. The macro doctrine in [[gui-macro-uses-logged-in-session-not-generated-api-key]] governs GUI-side gestures (Console clicks, drag-drop). The Android Publisher API has no GUI equivalent for AAB upload at scale; the SA is the right substrate. The CDP path covers the Console policy gates (Data safety, Advertising ID, Government, Financial, Health, Photo permissions) where Google keeps the questionnaires GUI-only. See [[play-console-cdp-driven-app-content-setup]] for the full split.

## Rotation

Per Google Cloud policy. Keys are revokable via `gcloud iam service-accounts keys list` + `delete`. If rotated, propagate to `D:/PRIVATE/ecodia-creds/play/play-uploader-key.json` (the canonical local copy) and any headless surface that runs the scripts (none today; all Android ships originate on Corazon).

## Validation history

- 2026-05-28: provisioned, first AAB upload successful (Chambers 1.0(17) versionCode 17).
- 2026-05-28: full listing push (en-AU first, then en-GB after the language gotcha surfaced).
- 2026-05-29: full production release draft + Send for review. 11 changes in review.

## Cross-refs

- [[play-console-cdp-driven-app-content-setup]] - parent runbook for the full Android ship.
- [[gui-macro-uses-logged-in-session-not-generated-api-key]] - the macro-vs-API doctrine.
- [[play-store-default-listing-language-is-en-gb-not-en-au]] - the en-GB default trap.
