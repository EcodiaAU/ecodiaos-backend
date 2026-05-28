---
triggers: play console, android publish, google play developer api, play api, android-publisher, app content, content rating, data safety, target audience, app access, ads declaration, IARC, play console questionnaire, play store listing, signed AAB, gradle bundleRelease, edits insert, edits commit, edits.tracks, edits.bundles, androidpublisher v3, fastlane supply, chambers play, coexist play, roam play, autonomous play upload, play first release draft, play store ship, play send for review, play publishing overview, play 11 changes, play production release, play country selection, en-GB vs en-AU, delete account url, photo permissions declaration, financial features declaration, government apps declaration, health apps declaration, advertising id declaration, play data safety wizard, play app content overview, play release editor, play preview confirm, main store listing
class: canonical-runbook
owner: ecodiaos
---

# Google Play - end-to-end autonomous app submission

The full path that takes a Capacitor app from `app/build/outputs/bundle/release/app-release.aab` to "Production: in review" in Play Console. Validated end-to-end on Chambers 1.0(17) on 2026-05-29: 11 changes sent for review (Data safety wizard, all 5 App content declarations, Main store listing, 177 countries targeted, App category, Contact details, Production release 1.0(17)).

This is the canonical Android-ship runbook. Read top to bottom on the first ship of any new app; thereafter, treat the section table as a checklist.

## The architecture in one paragraph

Two autonomy surfaces:

1. **Android Publisher API** at `androidpublisher.googleapis.com/v3` handles **artifacts + listings + release** (signed AAB upload, store listing copy + assets, internal/production track releases).
2. **Play Console web UI** at `play.google.com/console` handles the **policy attestation questionnaires** (Data safety, Advertising ID, Government apps, Financial features, Health apps, Photo and video permissions, Content rating, Target audience, App access, Ads). Google deliberately keeps these behind the web UI; Data safety has a CSV path that requires per-app machine-ID codes only obtainable from a Console-downloaded template (so it's effectively GUI-only).

Both surfaces share the same service-account JSON for auth. Autonomous shape: **API for artifacts + listings + production release draft; CDP-driven web UI for the questionnaires + countries + final "Send for review" gesture**. The web-UI side runs via the laptop-agent's `cdp.*` toolset against Tate's logged-in Chrome.

## Substrate prerequisites (one-time per Google account)

1. `gcloud` CLI authenticated as a project owner: `gcloud auth login`.
2. Android Publisher API enabled: `gcloud services enable androidpublisher.googleapis.com --project=ecodia-code`.
3. Service account created: `gcloud iam service-accounts create play-uploader --display-name="Play Console Uploader" --project=ecodia-code`.
4. JSON key generated: `gcloud iam service-accounts keys create D:/PRIVATE/ecodia-creds/play/play-uploader-key.json --iam-account=play-uploader@ecodia-code.iam.gserviceaccount.com --project=ecodia-code`.
5. Inside Play Console: `Users and permissions` -> `Invite new user` -> paste `play-uploader@ecodia-code.iam.gserviceaccount.com` -> grant **Admin (all permissions)** -> Save. This is the only Play-side gesture; the API cannot grant Play Console permissions to itself.

After that ONE setup, every future Ecodia Android app reuses the same JSON. No drag-drop, ever.

## Per-app prerequisites

1. **Listing created** in Play Console: `Create app` -> name, default language, App or game, Free or paid. Five minutes in the Console, no API path.
2. **Package name** matches the Capacitor `android` namespace (e.g. `au.ecodia.chambers`).
3. **Upload keystore** generated and committed to the repo. Doctrine: `.jks` IS committed to git; password is NOT.

```powershell
$pwd = "<random 32-char password>"
& keytool -genkey -v `
  -keystore android/app/{slug}-release.jks `
  -alias {slug} -keyalg RSA -keysize 4096 -validity 10000 `
  -storepass $pwd -keypass $pwd `
  -dname "CN=Ecodia, OU={Slug}, O=Ecodia Pty Ltd, L=Brisbane, ST=QLD, C=AU"
```

Mirror `.jks` to `D:/PRIVATE/ecodia-creds/{slug}/` and save the password to `D:/PRIVATE/ecodia-creds/{slug}/keystore-password.txt`. Wire `android/app/build.gradle` `signingConfigs.release` to read `{SLUG}_KEYSTORE_PASSWORD` and `{SLUG}_KEY_PASSWORD` env vars.

## Section table (the ship checklist)

| # | Section | Surface | Reusable script |
|---|---------|---------|-----------------|
| 1 | Build signed AAB | local gradle | (none - see commands below) |
| 2 | Upload AAB | API | [scripts/play-upload.py](../scripts/play-upload.py) |
| 3 | Main store listing copy + assets | API | [scripts/chambers-play-listing-push.py](../scripts/chambers-play-listing-push.py) |
| 4 | Data safety wizard (5 steps) | CDP | this file - "Data safety wizard" section |
| 5 | App content declarations (5 single-page gates) | CDP | this file - "Single-radio declarations" section |
| 6 | Countries/regions (worldwide or targeted) | CDP | this file - "Countries/regions" section |
| 7 | App category + Contact details | CDP | this file - "Store settings" section |
| 8 | Production release editor (Step 1 -> Step 2 -> Save) | CDP | this file - "Production release editor" section |
| 9 | Publishing overview -> Send N changes for review | CDP | this file - "Send for review" section |

The order matters only in the dependency sense: API steps (1, 2, 3) can run before or after CDP steps; the **only hard ordering** is that the production release editor (step 8) must come after Data safety + Main store listing + App category are saved, and the Send for review (step 9) is always last.

## Step 1: Build the signed AAB

```powershell
$env:CHAMBERS_KEYSTORE_PASSWORD = (Get-Content D:/PRIVATE/ecodia-creds/chambers/keystore-password.txt -Raw).Trim()
$env:CHAMBERS_KEY_PASSWORD = $env:CHAMBERS_KEYSTORE_PASSWORD
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.10.7-hotspot\'

Set-Location D:/.code/{repo}
npx cap sync android   # copies dist/ into android/app/src/main/assets/public

Set-Location D:/.code/{repo}/android
& '.\gradlew.bat' ':app:bundleRelease' '--no-daemon' '--warning-mode' 'none'
# AAB lands at android/app/build/outputs/bundle/release/app-release.aab
```

Pitfalls:
- `gradlew.bat is not recognized` -> run from inside `android/`, or use the full path; `cmd /c gradlew.bat` does not inherit PowerShell cwd reliably.
- `npx cap sync android` MUST run before `bundleRelease` or the AAB ships the previous web bundle.
- Verify signature post-build: `& jarsigner -verify -verbose path/to/app-release.aab` should print `jar verified`.

## Step 2: Upload the AAB via API

```powershell
python D:/.code/EcodiaOS/backend/scripts/play-upload.py au.ecodia.chambers `
  D:/.code/{repo}/android/app/build/outputs/bundle/release/app-release.aab `
  --track production --release-name "1.0 (17)"
```

Flow: `edits.insert` -> `edits.bundles.upload` -> `edits.tracks.update` -> `edits.commit`.

**Critical gotcha for first-time production release**: a Play app starts in "draft app" state. The API responds `Only releases with status draft may be created on draft app` if you try `status:completed` on the production track for the first release. Fix: set `status:draft` for the first production release. Subsequent releases can be `status:completed`. The Console "Send for review" gesture on the production draft is the one human action that opens Google's review queue; no API replaces it.

**Re-upload error**: once an AAB has been uploaded, the API rejects re-upload of the same `versionCode` with `Version code 17 has already been used`. Fix: do NOT re-upload, just call `edits.tracks.update` with the existing `versionCode`.

## Step 3: Push the store listing via API

Reusable script at [scripts/chambers-play-listing-push.py](../scripts/chambers-play-listing-push.py) - copy and swap constants per app.

API surface used:
- `edits.listings.update` for the listing copy (title, shortDescription, fullDescription).
- `edits.images.deleteall` + `edits.images.upload` for icon, feature graphic, phone screenshots (idempotent re-runs).
- Feature graphic generated via PIL when none exists (1024x500 brand-gradient + wordmark).

Constraints:
- `shortDescription` LIMIT is **80 chars**, not 170 like Apple. Voice the listing accordingly. Chambers ship-day shortDescription: `Run members, events, dues and comms for your chamber of commerce.` (65 chars).
- `fullDescription` LIMIT is 4000 chars.
- Phone screenshots accept iPhone 6.7" (1290x2796) even though the aspect ratio (9:19.5) is outside Play's documented 9:16-to-16:9 range. The API accepts them; documented enforcement is lenient on dimension but firm on file count (min 2, max 8).

**Language gotcha that bit Chambers**: see [play-store-default-listing-language-is-en-gb-not-en-au.md](./play-store-default-listing-language-is-en-gb-not-en-au.md). Even when the Play app was created with default language `en-AU`, the Console treats `en-GB` as the required default. If your script pushes only `en-AU`, the release editor's Preview step shows error `Add a full description to save` because the `en-GB` listing has empty fields. Fix: flip `LANG = "en-GB"` in the script and re-run. Even simpler: push to BOTH languages on every run.

## Step 4: Data safety wizard (5 steps, fully CDP-able)

The Data safety wizard is the most complex CDP-driven section, with 5 sub-steps and per-data-type modals. See [play-data-safety-wizard-5-step-anatomy.md](./play-data-safety-wizard-5-step-anatomy.md) for the full walkthrough including every input position trick.

Quick summary (Chambers verbatim):

| Step | What | Chambers answer |
|---|---|---|
| 1 Overview | (auto-passes once you've entered the wizard) | (none) |
| 2 Data collection and security | `Does your app collect or share any of the required user data types?` Yes. `Encrypted in transit?` Yes. `Account creation methods?` Username and password. `Delete account URL?` `https://chambers.ecodia.au/delete-account` (must resolve, see [web-resources-referenced-in-store-declarations-must-resolve-before-review.md](./web-resources-referenced-in-store-declarations-must-resolve-before-review.md)). | (as left) |
| 3 Data types | Personal info: Name + Email address + User IDs (3/9). Photos and videos: Photos (1/2). Messages: Other in-app messages (1/3). Other 11 sections: 0. | 5 types total. |
| 4 Data usage per type | Per-type modal: Collected + NOT Shared + No (not ephemeral) + Required + App functionality (+ Account management for identity data only). | 5 modals, ~30 sec each via DOM click. |
| 5 Preview | Review + Save | (click Save, then "Not now" on the Go-to-Publishing-overview modal) |

## Step 5: Single-radio declarations (4 of them on first ship)

Once Data safety is saved, the App content overview at `/app-content/overview` shows the remaining declarations under "Need attention". For a non-ads non-finance non-health non-government app, all four are trivial single-radio Yes/No flows:

| Declaration | Path slug | Chambers answer |
|---|---|---|
| Advertising ID | `app-content/advertising-id` (auto-loaded by Start declaration) | No, app does not use AAID |
| Government apps | `app-content/government-apps` | No |
| Financial features | `app-content/financial-features` | No financial features (last checkbox at bottom of long list) |
| Health apps | `app-content/health-apps` | No health features (last checkbox at bottom of long list) |
| Photo and video permissions | `app-content/photos-and-videos-permissions` | Description: "Members upload profile photos, post images in chamber feeds and events, and share photos in chat. Frequent access supports core member sharing and admin event documentation across chambers." (~189/250 chars) |

CDP recipe for each:
1. Navigate to `/app-content/overview`.
2. `cdp.findVisible {tag:"BUTTON", text:"Start declaration"}` returns N entries top-to-bottom matching the visible list.
3. Click the first one. Page loads the declaration form.
4. Tick the right radio / checkbox / fill the description.
5. `cdp.realClick` the Save button (see "Modal Save vs page Save draft trap" below).
6. Dismiss the "Go to Publishing overview?" modal with "Not now".
7. Navigate back to `/app-content/overview`. The count drops by 1.
8. Repeat for the next entry.

## Step 6: Countries/regions

The Countries/regions tab on the Production track has THREE gotchas worth memorising:

1. **The dropdown count is a filter view, not a total.** "All countries/regions (177)" means the dropdown is showing all 177; "Targeted (0)" is misleading because it shows the count matching the "Targeted" filter, not how many are actually targeted. The authoritative state is the **Track summary** line at the top of the Production page: `Inactive ... Draft release: 1.0 (17) ... 177 countries/regions ... 0 installs`. Read that line, not the dropdown.

2. **The master checkbox + page Save does NOT target countries on first attempt.** Clicking the master checkbox at the top of the country table selects all 177 visually, and the page Save says "Your change has been saved" - but the country count in the Track summary stays at 0. The actual targeting happens through the **"Edit countries/regions"** side panel button at the top-right of the country table. Click that button (visible coords around `1142, 227`), tick the master checkbox in the side panel, click Save in the side panel. THIS commits the targeting; verify via Track summary update.

3. **Worldwide is fine for first ship.** Chambers shipped with all 177; doctrine: bias to worldwide unless there's a compliance reason to restrict (financial / health / dating / news apps may need country-by-country review). Restriction can be expanded post-launch.

## Step 7: Store settings (App category + Contact details)

Path: `Grow users` -> `Store presence` -> `Store settings` (sidebar), or direct URL `/main-store-listing` then scroll to the right widget.

### App category

Click `Edit` on the App category section. Dialog appears with two dropdowns:
- `App or game` -> App (default for a non-game app).
- `Category` -> click the dropdown, scroll list, pick the right category.

**Dropdown-list-item click trap**: clicking by raw `(x, y)` based on visual position can hit the WRONG item because Material list items are not 28px each; they're 28-30px with variable padding. The reliable path is `cdp.findVisible {text:"Business"}` then click the first MATERIAL-SELECT-DROPDOWN-ITEM result by exact (x, y). The tag-name "Business" repeats throughout the page so filter to the dropdown-item ancestor.

Chambers verbatim: Category = **Business**.

Save. The "Go to Publishing overview?" modal pops; dismiss with "Not now".

### Contact details

Section title: "Store Listing contact details". Click `Edit`. Dialog with 3 inputs:
- Email address* (required)
- Phone number (optional)
- Website

**Input fill via direct React setter**: `cdp.nativeFill` returns `no input matched any strategy` because Material wraps the bare `<input type=text>` in a custom element that hides the placeholder + aria-label. Use direct DOM injection instead:

```js
var inputs = Array.prototype.slice.call(document.querySelectorAll("input")).filter(function(c){return c.offsetParent && c.type==="text";});
var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
setter.call(inputs[0], "code@ecodia.au");
inputs[0].dispatchEvent(new Event("input",{bubbles:true}));
inputs[0].dispatchEvent(new Event("change",{bubbles:true}));
inputs[0].dispatchEvent(new Event("blur",{bubbles:true}));
// repeat for inputs[2] (Website) - skip inputs[1] for Phone (optional)
```

Click `Save and publish`. A confirmation modal asks "Publish change on Google Play?" -> click `Save and publish` again to confirm.

Chambers verbatim: Email = `code@ecodia.au`, Website = `https://chambers.ecodia.au`. Phone left blank.

## Step 8: Production release editor (Step 1 -> Step 2 -> Save)

Path: `Test and release` -> `Production` -> `Releases` tab -> `Edit release`. The editor has two sub-steps:

### Step 1: Create release

Mostly auto-populated by the API upload from Step 2. Verify App integrity is green. Scroll to the bottom: **Release notes** textarea uses a hand-crafted XML-tag format:

```
<en-GB>
Initial Chambers release.
</en-GB>
<en-AU>
Initial Chambers release.
</en-AU>
```

If only one language has notes filled, you see `Release notes provided for 1 of 2 languages` and Next stays enabled but the Step 2 preview shows a warning. Fill BOTH `<en-GB>` and `<en-AU>` blocks with the same text (or the appropriate translation if you have one).

Click Next.

### Step 2: Preview and confirm

Shows `Errors, warnings and messages`. Possible blocking errors and their fixes:

| Error text | Root cause | Fix |
|---|---|---|
| `Your app cannot be published yet. Complete the steps listed on the dashboard.` | One or more setup tasks at `/app-dashboard` are incomplete. | Navigate to dashboard, scroll through `Set up your app` section, find the un-ticked item (often `Select an app category and provide contact details`), complete it. |
| `Add a full description to save` | The default-language `en-GB` listing has no fullDescription (probably because your API script pushed `en-AU` only). | See Step 3 language gotcha. Re-run the listing-push script with `LANG = "en-GB"`. |

Warnings are non-blocking. Save remains enabled. Click `Save`.

A "Go to Publishing overview?" modal pops. THIS time, click `Go to overview` (we want to send for review).

## Step 9: Send for review

On the Publishing overview page, the `Changes not yet sent for review` section shows the queued changes. The button at the right reads `Send N changes for review` (N counts every queued change: Data safety + each declaration + listing + category + contact + release = ~11 for a first ship).

If the button is disabled and the page shows `Running quick checks for commonly found issues - Up to 13 minutes remaining`, wait. Google runs a pre-review sanity check; the button enables when it finishes.

Click `Send N changes for review`. Confirmation modal: "These changes will be sent to Google for review. Reviews are typically completed within seven days but may take longer." Click `Send changes for review`.

The Publishing overview page now shows `Changes in review` with a `Remove changes` link. You're done.

Typical review window: 2-7 days for first ship. Subsequent updates usually clear in hours.

---

## CDP infrastructure notes (read this if any cdp.* call surprises you)

### Alias coordination

Per [parallel-cdp-chat-coordination-via-alias-namespacing.md](./parallel-cdp-chat-coordination-via-alias-namespacing.md): pick your alias prefix. For Chambers I used `eos-cowork-chambers-play` (Tate held `eos-main-*` on the Glovebox IAP fix). Always pass `alias:"..."` flat on every `cdp.*` call. The hook `[PARALLEL-CDP REFLEX]` fires false-positives on jq-built payloads where alias IS present in the JSON; it's safe to ignore but worth verifying once.

### Tab attach gotcha

Re-attach via `cdp.attach_tab` with the explicit `targetId`. Aliases drop on session resume. The Play Console tab's `targetId` is durable across navigation - capture once via `cdp.listTabs`, re-attach as needed:

```bash
D:/.code/EcodiaOS/backend/scripts/agent cdp.listTabs '{}' \
  | jq -c '.result.tabs[] | select(.url|test("play.google.com.*app/{APP_ID}")) | {targetId,url:.url[0:120],title}'
D:/.code/EcodiaOS/backend/scripts/agent cdp.attach_tab '{"alias":"eos-cowork-{slug}-play","targetId":"{TID}"}'
```

### Modal Save vs page Save draft trap

This bit me twice on Chambers. Play Console pages have a **bottom action bar** with `Discard | Save draft | Back | Next` (page-level). When a modal opens, that modal's `Save` button is **also at the bottom right** at approximately `(1270, 543)` while the page's `Save draft` stays at `(1101, 543)`. Both are visible at the same y. 

`cdp.clickByTag {tag:"BUTTON", text:"Save"}` returns the first matching button by DOM order, which is often the OUTER page `Save draft` (because "Save" is a substring of "Save draft"). The click closes the modal without committing the modal's form, and instead saves the underlying page draft. Symptom: modal closes but the row still shows "Not started".

Fix:
- Use `cdp.findVisible {tag:"BUTTON", text:"Save"}` and look at the bounding boxes; the modal Save is typically at `x:1270, y:543` and the page Save draft at `x:1101, y:543`.
- Use `cdp.realClick` with the explicit `(1270, 543)` to hit the modal Save exclusively.

See [cdp-clickbytag-save-grabs-outer-page-save-draft-not-modal-save.md](./cdp-clickbytag-save-grabs-outer-page-save-draft-not-modal-save.md) for the full doctrine.

### Material checkbox vs raw input

Material wraps native inputs in custom elements. The `<input type=checkbox>` exists but has `display:none` style; the visible checkbox is a separate Material element. Strategies (in order of preference):

1. **Direct DOM `.click()` on the input**: `document.querySelectorAll("input")[i].click()` - works reliably for the Data safety modal's sub-question checkboxes. Returns immediately; verify checked-state on next probe.
2. **`cdp.realClick` on the visible checkbox center**: use `cdp.findVisible` to locate the wrapping `MAT-CHECKBOX` or label, click its computed center. Needed when the bare `.click()` doesn't fire the Material listener (rare; mostly happens on the IARC questionnaire's radio component).
3. **React-native setter for text inputs**: the value setter dispatch sequence shown in Step 7.

### "Go to Publishing overview?" modal after every save

Almost every Save-and-commit gesture in Play Console pops a "Go to Publishing overview? - Your change has been saved." modal with two buttons: `Not now` (left, at `~(679, 345)`) and `Go to overview` (right, at `~(802, 345)`, blue).

Click "Not now" until you've completed every section, then click "Go to overview" on the very last save to land on the Publishing overview page where you send for review.

### Page-level scroll container

The main scroll container is `div.main-content`, NOT the window. `window.scrollTo` does nothing. Use:

```js
var sc = document.querySelector(".main-content");
sc.scrollTop = 600;
```

Modal scroll containers vary; the Data safety per-type modal uses a class like `body _ngcontent-bjh-45` (the suffix changes per Angular build). Find it dynamically:

```js
var sc = Array.prototype.slice.call(document.querySelectorAll("*")).find(function(e){
  var s = getComputedStyle(e);
  return (s.overflowY==="auto" || s.overflowY==="scroll") && e.scrollHeight > 1100 && e.clientHeight < 400;
});
sc.scrollTop = 600;
```

---

## Reusable scripts

- [scripts/play-upload.py](../scripts/play-upload.py) - autonomous Play API AAB upload. Reads SA JSON from `D:/PRIVATE/ecodia-creds/play/play-uploader-key.json`. Handles draft-app first-release gotcha.
- [scripts/chambers-play-listing-push.py](../scripts/chambers-play-listing-push.py) - listing copy + assets via API. Copy + swap constants per app. Default `LANG = "en-GB"`; if you have an `en-AU`-only flow, push both languages.

---

## Cross-refs

- [play-data-safety-wizard-5-step-anatomy.md](./play-data-safety-wizard-5-step-anatomy.md) - the 5-step wizard walkthrough with every input position.
- [cdp-clickbytag-save-grabs-outer-page-save-draft-not-modal-save.md](./cdp-clickbytag-save-grabs-outer-page-save-draft-not-modal-save.md) - the modal-save trap.
- [play-store-default-listing-language-is-en-gb-not-en-au.md](./play-store-default-listing-language-is-en-gb-not-en-au.md) - the en-GB default trap.
- [web-resources-referenced-in-store-declarations-must-resolve-before-review.md](./web-resources-referenced-in-store-declarations-must-resolve-before-review.md) - the /delete-account preemptive ship.
- [parallel-cdp-chat-coordination-via-alias-namespacing.md](./parallel-cdp-chat-coordination-via-alias-namespacing.md) - alias prefix rules.
- [chrome-cdp-attach-requires-explicit-user-data-dir-and-singleton-clear.md](./chrome-cdp-attach-requires-explicit-user-data-dir-and-singleton-clear.md) - CDP launch substrate.
- [cdp-helper-library-and-recursive-improvement-2026-05-18.md](./cdp-helper-library-and-recursive-improvement-2026-05-18.md) - cdp.* helper inventory.
- [docs/secrets/_pending-google-play-service-account.md](../docs/secrets/_pending-google-play-service-account.md) - cred doc (PROVISIONED status, supersedes the pending entry).

## Origin + chain of validation

- First spike 2026-05-28: shipped 4 simple gates via CDP (Ads, App access, Content rating, Target audience); Content rating questionnaire blocked at the time by a Material radio reactivity hypothesis that turned out to be wrong (the cdp.realClick approach used in this canonical version DOES work for the IARC radios; the earlier session's wall was tooling, not Material).
- Full end-to-end ship 2026-05-29: 11 changes sent for review. This pattern rewritten as the canonical post-ship runbook, replacing the mid-flow version that incorrectly diagnosed the Material reactivity wall.
- ~6 hours total wall-clock for the full ship including the Data safety wizard (5 steps), all 5 App content declarations, Main store listing en-GB push, countries setup, app category + contact details, production release editor, /delete-account preemptive ship to both marketing + app sites, then Send for review.
