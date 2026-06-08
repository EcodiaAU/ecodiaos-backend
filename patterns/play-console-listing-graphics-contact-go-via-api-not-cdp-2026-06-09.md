---
name: play-console-listing-graphics-contact-go-via-api-not-cdp-2026-06-09
description: Store listing text + icon + feature graphic + phone screenshots + contact details + default language for any Android app go via Android Publisher v3 API (one short Python script per app, ~30s end-to-end). CDP is the right tool only for the wizards that have no API (Data safety per-type modals, App content questionnaires, Category dropdown). Stop driving CDP for the listing surface.
triggers: play console listing, store listing upload, play console icon upload, play console feature graphic, play console phone screenshots, play console contact details, android publisher api listing, edits.listings.update, edits.images.upload, edits.images.deleteall, edits.details.patch, android publisher v3 store listing, play api listing not cdp, file picker for icon upload, dom.setfileinputfiles, applescript keystroke open dialog, play console store listing cdp, save draft store listing, ship-android-app-listing, locals android store listing, chambers android store listing
metadata:
  type: feedback
---

# Play Console listing and graphics and contact go via the Android Publisher v3 API

**Rule:** for any Android app being shipped to Play Store, store listing text + app icon + feature graphic + phone screenshots + contact details + default language are set via the Android Publisher v3 REST API in a short Python script. Reserve CDP for the surfaces with no API: Data safety per-type modals, App content questionnaires (Ads, Target audience, Content rating, Sign-in details), the Category dropdown, and the Target audience age-band selection.

**Why:** the API path is ~30 seconds end-to-end per app. It never breaks on tab visibility, modal coordinate drift, OS file picker dialogs, AppleScript param shapes, or DOM nodeId staleness. The CDP path for the listing surface burned over an hour on the Locals 2026-06-09 push. The chat tried to drive an OS file picker through `applescript.run` to upload a 512x512 PNG that `edits.images.upload` accepts as a one-line `MediaFileUpload`. The general doctrine [[management-api-over-cdp-when-vendor-offers-both-2026-05-21]] already states this rule abstractly. This pattern names the concrete endpoints for Play Console so the next chat reaches for them on turn one.

**How to apply:** before opening Chrome or attaching a CDP alias for any Play Console asset upload or contact-detail write, run the API path first. The script template:

```python
from pathlib import Path
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2 import service_account

KEY = Path("/Users/ecodia/PRIVATE/ecodia-creds/play/play-uploader-key.json")
SCOPES = ["https://www.googleapis.com/auth/androidpublisher"]
PKG = "au.ecodia.<app>"
LANG = "en-GB"  # always en-GB per play-store-default-listing-language-is-en-gb-not-en-au

creds = service_account.Credentials.from_service_account_file(str(KEY), scopes=SCOPES)
service = build("androidpublisher", "v3", credentials=creds, cache_discovery=False)
edits = service.edits()

eid = edits.insert(packageName=PKG, body={}).execute()["id"]

# Text
edits.listings().update(packageName=PKG, editId=eid, language=LANG, body={
    "language": LANG, "title": "<name>",
    "shortDescription": "<<= 80 chars>", "fullDescription": "<<= 4000 chars>",
}).execute()

# Wipe existing then upload icon + feature graphic + screenshots
for img_type in ("icon", "featureGraphic", "phoneScreenshots"):
    edits.images().deleteall(packageName=PKG, editId=eid, language=LANG, imageType=img_type).execute()

def up(img_type, path):
    edits.images().upload(packageName=PKG, editId=eid, language=LANG, imageType=img_type,
        media_body=MediaFileUpload(str(path), mimetype="image/png", resumable=False)).execute()

up("icon", Path("icon-512.png"))           # 512x512 PNG
up("featureGraphic", Path("feature.png"))  # 1024x500 PNG
for shot in sorted(Path("screenshots").glob("*.png")):
    up("phoneScreenshots", shot)           # 1080x1920 each, 2-8 total

# Contact details + default language (separate edits.insert)
eid2 = edits.insert(packageName=PKG, body={}).execute()["id"]
edits.details().patch(packageName=PKG, editId=eid2, body={
    "defaultLanguage": LANG,
    "contactWebsite": "https://<app>.ecodia.au",
    "contactEmail": "code@ecodia.au",
}).execute()
edits.commit(packageName=PKG, editId=eid2).execute()

edits.commit(packageName=PKG, editId=eid).execute()
```

Working exemplar saved at `/Users/ecodia/Desktop/locals-listing/push-listing.py` + `push-details.py` (Locals 2026-06-09).

## Endpoint map per surface

| Play Console surface                          | Substrate | API call                                      |
|-----------------------------------------------|-----------|-----------------------------------------------|
| Store listing > App name                      | API       | `edits.listings.update body.title`            |
| Store listing > Short description             | API       | `edits.listings.update body.shortDescription` |
| Store listing > Full description              | API       | `edits.listings.update body.fullDescription`  |
| Store listing > App icon (512x512)            | API       | `edits.images.upload imageType=icon`          |
| Store listing > Feature graphic (1024x500)    | API       | `edits.images.upload imageType=featureGraphic`|
| Store listing > Phone screenshots             | API       | `edits.images.upload imageType=phoneScreenshots` |
| Store listing > Tablet/TV/Wear screenshots    | API       | `edits.images.upload imageType=<sevenInch\|tenInch\|tv\|wear>Screenshots` |
| Store settings > Contact website              | API       | `edits.details.patch body.contactWebsite`     |
| Store settings > Contact email                | API       | `edits.details.patch body.contactEmail`       |
| Store settings > Contact phone                | API       | `edits.details.patch body.contactPhone`       |
| Store settings > Default language             | API       | `edits.details.patch body.defaultLanguage`    |
| Production / internal / beta track release    | API       | `edits.tracks.update` (already used by `play-upload.py`) |
| Release notes                                 | API       | `edits.tracks.update body.releases[].releaseNotes[]` |
| App content > Data safety per-type modals     | **CDP**   | no API - drive via [[play-console-data-safety-cdp-driving-refined-2026-06-09]] |
| App content > Privacy policy URL              | **CDP**   | no public API endpoint - drive via wizard     |
| App content > Ads declaration                 | **CDP**   | no public API endpoint                        |
| App content > Sign-in details                 | **CDP**   | no public API endpoint                        |
| App content > Target audience                 | **CDP**   | no public API endpoint                        |
| App content > Content ratings (IARC)          | **CDP**   | no public API endpoint                        |
| App content > Government / Financial / Health | **CDP**   | no public API endpoint                        |
| Store settings > Category                     | **CDP**   | no public API endpoint                        |

## Substrate-selection protocol for any new Android app

1. Open this file's endpoint map first.
2. For every surface in the map flagged API, draft one Python script using the template above. Run it. Verify via either a follow-up `edits.listings.get` or the Play Console UI.
3. For every surface flagged CDP, drive the wizard via the matched recipe ([[play-console-data-safety-cdp-driving-refined-2026-06-09]], [[play-console-cdp-driven-app-content-setup]]).
4. Never start with CDP for a surface the API covers. The reflex is API-first.

## Anti-patterns

- AVOID: Opening Chrome to drag-and-drop an icon when `edits.images.upload imageType=icon` takes a `MediaFileUpload`.
- AVOID: Driving an OS file picker through `applescript.run` keystrokes. Even when it works it is slow and brittle across MacInCloud vs local Mac.
- AVOID: Using CDP to type into the contact-email field when `edits.details.patch body.contactEmail` is a one-line PATCH.
- AVOID: Calling `edits.commit` separately for every image. One edit transaction can hold the listing text + all images; commit once at the end.
- AVOID: Skipping `edits.images.deleteall` before re-upload. Without it, old icons or stale screenshots remain attached and new ones append rather than replace.
- AVOID: Forgetting `defaultLanguage: "en-GB"` per [[play-store-default-listing-language-is-en-gb-not-en-au]]. en-AU alone wedges the release editor.

## Cross-references

- [[management-api-over-cdp-when-vendor-offers-both-2026-05-21]] - the abstract rule this is the concrete Play Console form of
- [[play-console-data-safety-cdp-driving-refined-2026-06-09]] - the CDP recipe for the surfaces that have no API
- [[play-console-cdp-driven-app-content-setup]] - the parent runbook covering the whole release pipeline
- [[play-console-android-release-recipe]] - the end-to-end release flow this slots into
- [[play-store-default-listing-language-is-en-gb-not-en-au]] - the en-GB default rule
- [[probe-vendor-pat-before-planning-gui-route]] - the meta-doctrine: check the API path before committing to a GUI route

## Origin

2026-06-09, Locals 1.0(1) Play Console production-track push. After completing the 5 Data safety per-type modals via CDP (correctly, since there is no API for them), I drifted into CDP-mode for the Store listing surface too. Spent over an hour fighting OS file pickers, AppleScript `script` vs `body` param shapes, stale DOM nodeIds across `cdp.send` calls, and tab visibilityState issues to upload one 512x512 icon. Tate verbatim 16:42 AEST: "why are you doing this via cdp if you could be doing this by api". Pivoted to a 40-line Python script that pushed listing text + icon + feature graphic + 6 screenshots + contact details + default language in 30 seconds total. Codifying so the next chat reaches for the API path first.
