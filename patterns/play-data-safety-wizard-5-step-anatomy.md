---
triggers: data safety wizard, play data safety, play console privacy, data types matrix, data usage and handling, per-type modal, collected shared ephemeral, app functionality account management, delete account url field, data safety step 2 hidden question, data safety preview, 5 step wizard, data safety en-GB en-AU, encrypted in transit, account creation methods, data safety save draft vs save, data safety next disabled, data safety stepper aria-disabled, data safety console-section, data safety expand sections, photos messages other in-app, personal info financial info, modal save trap data safety, weirdly placed question
class: substrate-walkthrough
owner: ecodiaos
---

# Play Console Data safety wizard - the full 5-step anatomy

A complete walkthrough of the Data safety wizard in Play Console, including every input position trick, every "weirdly placed" hidden question, and the per-type modal sequence. First validated on Chambers 1.0(17) on 2026-05-29. Read alongside [[play-console-cdp-driven-app-content-setup]] - this is the deep-dive on the single hardest section.

## Why this file exists

The Data safety wizard is the most layered CDP-driven section of Play Console. Five sub-steps, conditional sub-questions that only appear after upstream answers, per-data-type sub-modals with their own internal scroll, a default-language gotcha that returns to bite at the production-release editor. The five-step skeleton alone is not enough; you need to know where each input sits, when it appears, and which Save button to click.

## The skeleton (5 steps)

The wizard at `/app-content/data-privacy-security` uses a top stepper with five tabs:

```
[1 Overview] -> [2 Data collection and security] -> [3 Data types] -> [4 Data usage and handling] -> [5 Preview]
```

The stepper tabs are `role=tab` divs. They have `aria-disabled="true"` for any step you haven't reached. Clicking an aria-disabled tab does nothing; navigation is strictly via the bottom `Next` / `Back` buttons.

The bottom action bar: `Discard changes | Save draft | Back | Next` (page level). All four sit at `y ~ 543`.

## Step 1: Overview

Auto-passes once you've entered the wizard. No inputs. Click Next.

## Step 2: Data collection and security

THREE questions on this step, and the third one is where most ships stall because it has a **conditional sub-question that only appears after you tick the right account-creation method**.

### Question 1 - Does your app collect or share user data?

Single Yes radio. The "No" radio for this question is **rendered AFTER the rest of the expanded form** (at content y ~ 1009 with default scroll). This means clicking "Yes" expands the form so dramatically that the "No" partner option ends up below all the follow-up content. That is the "weirdly placed" question Tate noticed during the Chambers ship.

Click Yes (the first visible radio at default scroll).

### Question 2 - Encrypted in transit?

Yes / No radios. Click Yes for any modern HTTPS-backed app.

### Question 3 - Account creation methods (multi-checkbox)

`Select all that apply`:
- Username and password
- Username and other authentication
- Username, password and other authentication
- OAuth
- Other
- My app does not allow users to create an account

Tick the methods your app supports. For Chambers: Username and password only.

### Hidden Question 3b - Delete account URL (appears AFTER you tick any user-account checkbox)

The moment any of the first five account-creation checkboxes is ticked (anything OTHER than "My app does not allow users to create an account"), a new text field appears below the checkboxes:

```
Add a link that users can use to request that their account and associated data be deleted
[ Delete account URL ............ ]
```

This is the field that bit Chambers as the "weirdly placed question" - it materialises only after Step-2 Question 3 has a non-skip answer.

The URL must resolve to a real page before Google reviewers fetch it (see [[web-resources-referenced-in-store-declarations-must-resolve-before-review]]). Chambers used `https://chambers.ecodia.au/delete-account`.

Fill the URL via direct React-setter injection:

```js
var ta = document.querySelectorAll("input[type=text]")[2]; // the third text input is the delete URL
var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
setter.call(ta, "https://chambers.ecodia.au/delete-account");
ta.dispatchEvent(new Event("input",{bubbles:true}));
ta.dispatchEvent(new Event("change",{bubbles:true}));
ta.dispatchEvent(new Event("blur",{bubbles:true}));
```

Once filled, the page bottom shows `Your changes have been saved` and the Next button enables. Click Next.

## Step 3: Data types (the matrix)

Top of the page: `Select all of the user data types collected or shared by your app.` A scrolling list of 14 sections, each a collapsed `<console-section>` with a Show / Hide toggle and a count chip (e.g. `0/9 data types selected`).

The 14 sections (memorise them):

1. Location (2 types)
2. Personal info (9 types)
3. Financial info (4 types)
4. Health and fitness (2 types)
5. Messages (3 types)
6. Photos and videos (2 types)
7. Audio files (3 types)
8. Files and docs (1 type)
9. Calendar (1 type)
10. Contacts (1 type)
11. App activity (5 types)
12. Web browsing (1 type)
13. App info and performance (3 types)
14. Device or other IDs (1 type)

### Expanding sections

Each section's toggle is a `<button>` with `aria-label="Show content: {Section name}"` (or `Hide content: ...` when expanded). Find them all:

```js
Array.from(document.querySelectorAll("button[aria-label]"))
  .filter(b => /Show content/.test(b.getAttribute("aria-label") || ""))
  .map(b => ({aria: b.getAttribute("aria-label"), y: Math.round(b.getBoundingClientRect().y)}));
```

`Messages` will be missing from the Show-content list **if** it's already expanded; in that case its button reads `Hide content: Messages`. Probe with `/Show content|Hide content/`.

Click the toggle by raw `(x, y)` (typically `x = 1228`). The section expands inline, pushing the rest of the page down.

### Ticking individual data types

Inside an expanded section, the data-type checkboxes are MAT-CHECKBOX wrappers; the underlying `<input type=checkbox>` is hidden. Two reliable strategies:

1. **Direct DOM click on the input**: `Array.from(section.querySelectorAll("input[type=checkbox]"))[i].click()`. Works in Chambers' run for all 5 types.
2. **`cdp.realClick` at the visible checkbox center**: typically `x = 337` for the column-aligned position. Use this if (1) fails.

Chambers verbatim selections:

| Section | Types ticked | Count |
|---|---|---|
| Personal info | Name + Email address + User IDs | 3/9 |
| Photos and videos | Photos | 1/2 |
| Messages | Other in-app messages | 1/3 |
| (others) | (none) | 0 |

5 data types total.

### Saving and advancing

Once the matrix is complete, the bottom `Save draft` and `Next` buttons enable. Click Save draft (commits the matrix), then Next (advances to Step 4 - which will be populated by these 5 types). Alternatively, click Next directly; save is implicit on advance.

**Trap**: if you advance to Step 4 with the matrix incomplete (0 types ticked despite Q1 Yes), Step 4 will show as 0/0 rows with the text `Next to each user data type that your app collects or shares, select Start to answer questions about how the data is used and handled.` - meaning you've passed the gate but with no work to do. This produces a broken release. Always verify the matrix is non-empty before advancing.

## Step 4: Data usage and handling (per-type modals)

The Step 4 page shows the data types grouped by section, each with a status chip (`Not started` / `Completed`) and a right-arrow link. Clicking the arrow opens a modal for that data type.

### Per-type modal structure

Each modal asks 4 questions (plus a 5th sub-question that opens after Q3):

1. **Is this data collected, shared or both?** (checkbox-pair)
   - Collected (tick this if you store it on your server)
   - Shared (tick this if you transfer it to a third party)
2. **Is this data processed ephemerally?** (radio pair)
   - Yes, this collected data is processed ephemerally
   - No, this collected data is not processed ephemerally
3. **Is data collection required or optional?** (radio pair)
   - Data collection is required (users can't turn off this data collection)
   - Users can choose whether this data is collected
4. **Why is this data collected?** (7 checkboxes, multi-select)
   - App functionality
   - Analytics
   - Developer communications
   - Advertising or marketing
   - Fraud prevention, security and compliance
   - Personalisation
   - Account management

### Driving each modal via direct DOM

The modal renders 13 input elements once Q1 Collected is ticked. Indices map deterministically:

| Index | Input | Notes |
|---|---|---|
| 0 | Collected (checkbox) | tick to expand the rest |
| 1 | Shared (checkbox) | leave unticked unless you actually share |
| 2 | Yes, ephemeral (radio) | leave unticked |
| 3 | No, not ephemeral (radio) | **tick this** |
| 4 | Required (radio) | **tick this** for identity / Photos / messages |
| 5 | Optional (radio) | tick for genuinely optional collection |
| 6 | App functionality (checkbox) | **always tick** |
| 7-11 | Analytics, Dev comms, Advertising, Fraud prevention, Personalisation | leave unticked unless they apply |
| 12 | Account management (checkbox) | **tick for identity data** (Name, Email, User IDs) |

Two-stage flow per modal:

```js
// Stage 1: tick Collected
var inputs = Array.from(document.querySelectorAll("input")).filter(c => c.offsetParent && c.type === "checkbox");
inputs[0].click();
// wait 1-2s for the rest of the inputs to render
```

```js
// Stage 2: tick the rest by index
var inputs = Array.from(document.querySelectorAll("input")).filter(c => c.offsetParent);
[3, 4, 6, 12].forEach(i => { if (inputs[i] && !inputs[i].checked) inputs[i].click(); });
// for Photos and Other in-app messages, omit index 12 (Account management) - just [3, 4, 6]
```

Then click the modal's Save button (see "Modal Save vs page Save draft" below).

### Modal Save vs page Save draft

This is the trap that bit Chambers twice. At the bottom of the screen there are TWO buttons with text starting with `Save`:

- `Save draft` (page-level, at `x ~ 1101, y ~ 543`)
- `Save` (modal-level, at `x ~ 1270, y ~ 543`)

`cdp.clickByTag {tag:"BUTTON", text:"Save"}` returns the first match by DOM order, which is often `Save draft`. The click closes the modal **without committing** the modal's form, and instead saves an empty page draft. Symptom: modal closes but the row's status stays `Not started`.

Fix: use `cdp.realClick` with the explicit `(1270, 543)` to hit the modal Save exclusively.

After Save: modal closes, the row's status flips to `Completed`. Click the next row's arrow and repeat.

### Modal scroll container

The modal body is its own scroll container. `window.scrollTo` does nothing on it. Find it dynamically:

```js
var sc = Array.from(document.querySelectorAll("*")).find(e => {
  var s = getComputedStyle(e);
  return (s.overflowY === "auto" || s.overflowY === "scroll") && e.scrollHeight > 1100 && e.clientHeight < 400;
});
sc.scrollTop = 600;
```

The Q4 checkboxes sit below the visible viewport on first render. Scroll to `~600` to see App functionality through Account management.

### Chambers verbatim modal flow

5 modals total:

| Data type | Required | Why (checkboxes) | Stage 2 indices |
|---|---|---|---|
| Name | Yes | App functionality + Account management | [3, 4, 6, 12] |
| Email address | Yes | App functionality + Account management | [3, 4, 6, 12] |
| User IDs | Yes | App functionality + Account management | [3, 4, 6, 12] |
| Photos | Yes | App functionality | [3, 4, 6] |
| Other in-app messages | Yes | App functionality | [3, 4, 6] |

Each modal: ~30-60 seconds of CDP work including the wait for inputs to render.

## Step 5: Preview

Renders the Store-Listing-style preview of your Data safety card: `Data shared` ("No data shared with third parties"), `Data collected` (lists your 5 types). Save button is enabled (blue).

Click Save. The "Go to Publishing overview?" modal pops. Click `Not now` if you have more App content gates to finish, or `Go to overview` if Data safety is the last thing.

## The conditional-cascade pattern

The wizard's most surprising property is how many inputs are conditional:

- Step 2 Q3b (Delete URL) only appears after Q3 ticks a user-account method.
- Step 4 rows only exist for types ticked in Step 3.
- Step 4 modal Q2-Q4 only render after Q1 Collected is ticked.
- The "No" radio for Step 2 Q1 reorders BELOW the expanded form when you tick Yes.

This means any "list all inputs" probe must be re-run AFTER every state-changing click. Stale probes drive coordinate-based clicks into the wrong elements (the cause of multiple "click didn't register" symptoms on Chambers' first attempt).

Reflex: `click -> 1-2s wait -> re-probe -> next click`. Never batch coordinate clicks across state changes.

## Origin

First end-to-end run 2026-05-29 on Chambers 1.0(17). The Step 2 hidden delete-URL question was the first stall. The modal-Save trap was the second. The per-type modal scroll container and the 13-input index map are the durable artefacts; every future Android ship reuses them verbatim.

## Cross-refs

- [[play-console-cdp-driven-app-content-setup]] - the parent end-to-end runbook.
- [[cdp-clickbytag-save-grabs-outer-page-save-draft-not-modal-save]] - the modal-Save trap.
- [[web-resources-referenced-in-store-declarations-must-resolve-before-review]] - the /delete-account preemptive ship requirement.
- [[parallel-cdp-chat-coordination-via-alias-namespacing]] - alias prefix rules for shared-Chrome sessions.
