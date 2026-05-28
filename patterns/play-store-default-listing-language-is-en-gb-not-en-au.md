---
triggers: en-GB default language, en-AU listing missing, play store default language, add a full description to save, listing language gotcha, default store listing, en-GB vs en-AU, en-GB vs en-US, play store fullDescription error, listing copy missing, release editor language warning, en-GB required, language code defaults, listing-push script LANG, locale chain play console, language tag iso, listing per language, listing translations
class: scripting-substrate-gotcha
owner: ecodiaos
---

# Play Console treats en-GB as the default listing language, not en-AU

When you create a Play Console app for an Australian audience and choose `English (Australia)` as the default language, the Console internally records `en-GB` as the default, not `en-AU`. The `edits.listings.update` API call against language `en-AU` writes a translation rather than the default listing. The release editor then surfaces the error `Add a full description to save` because the `en-GB` listing has empty fields, blocking the production release Save.

## Why

The Play Console UI offers `English (Australia)` as a selectable default language on app creation. Internally, Australian English is mapped to `en-GB` for store-listing purposes (Google treats Australian English as a regional variant of British English for content classification). The API surface uses raw ISO-style language codes (`en-GB`, `en-AU`, `en-US`, etc.); each code maps to a distinct `listing` resource. Whichever code the Console chose as the default at app creation is the one the release editor validates against.

This means `edits.listings.update {language: "en-AU"}` succeeds (returns 200 with the updated listing) but writes to a translation slot, not the default. The Console UI shows the en-AU translation under `Manage translations` but the default listing under `English (United Kingdom)` stays empty.

## How to apply

**Push to `en-GB` first, treat `en-AU` as optional.** For Ecodia Australian-audience apps, the listing-push script should default to `LANG = "en-GB"`. Optionally write the same content (or an Australianised variant) to `LANG = "en-AU"` as a translation.

```python
# scripts/chambers-play-listing-push.py
LANG = "en-GB"  # NOT en-AU - the Play Console default for Australian audiences is en-GB
```

After pushing the listing, verify by navigating to `/main-store-listing` and confirming the default-language label reads `Default - English (United Kingdom) - en-GB` at the top of the page. The fullDescription textarea should show your copy.

If the script ran with `en-AU` only and the release editor is blocking on `Add a full description to save`:

1. Edit the script: `sed -i 's/LANG = "en-AU"/LANG = "en-GB"/' scripts/chambers-play-listing-push.py`.
2. Re-run: `python scripts/chambers-play-listing-push.py`.
3. Navigate to the release editor and re-trigger Step 1 -> Step 2. The error clears.

## Why this matters for the release editor

The release editor's Step 2 `Errors, warnings and messages` panel checks the default-language listing for required fields. An empty default-language fullDescription is a hard block (red error), not a warning. The Save button stays disabled until the default has copy. This is independent of the Data safety wizard, the App content declarations, and the Main store listing translations.

Symptom on Chambers: the release editor showed 2 errors. One was a dashboard task (`Select an app category and provide contact details`). The other was `Add a full description to save`, traced to the en-AU push leaving en-GB empty.

## Languages other Ecodia apps may hit

- US-default apps: `en-US`. The same script pattern applies; check the listing UI for the default-language label before assuming.
- UK-default apps: `en-GB`. Same as Australian default.
- New Zealand: defaults to `en-GB` per the same regional-variant mapping.
- Multi-language apps: push every required language; the default is the only blocker for release, but translations show in the listing's translation slots and are surfaced to users in the matching locale.

## Origin

Chambers 1.0(17) ship-day 2026-05-29. The first listing-push script ran with `LANG = "en-AU"` and the release editor blocked at Preview with the `Add a full description` error. The fix took two minutes once the cause was identified: flip the constant, re-run the script, advance the release editor.

## Cross-refs

- [[play-console-cdp-driven-app-content-setup]] - the parent runbook lists this gotcha in Step 3 (listing push) and Step 8 (release editor) sections.
- The reusable script: `D:/.code/EcodiaOS/backend/scripts/chambers-play-listing-push.py`.
