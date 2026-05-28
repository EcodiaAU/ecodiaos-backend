---
triggers: cdp clickbytag save, modal save button, save draft button, dual save button trap, play console save, gcp console save, material modal save, button text substring match, dom order button match, modal save vs page save, save draft vs save, clickbytag returns wrong button, modal closes without saving, status stays not started after save, modal save x 1270, save draft x 1101, action bar position, button bottom right y 543, modal commits not page
class: cdp-helper-failure-mode
owner: ecodiaos
---

# cdp.clickByTag text:"Save" grabs the outer page Save draft, not the modal Save

Play Console (and other GCP / Material apps) place a page-level bottom action bar at `y ~ 543` with buttons like `Discard | Save draft | Back | Next`. When a modal opens on top, the modal renders its own action bar at the same y, with its own `Save` button at a different x. Both buttons remain visible. `cdp.clickByTag {tag:"BUTTON", text:"Save"}` returns the first match by DOM order, which is usually the OUTER page Save draft (because "Save" is a substring of "Save draft"). The click closes the modal without committing the modal form and instead saves an empty page draft.

## Why

`cdp.clickByTag` uses a substring text match across the document. The DOM order in Material apps puts the page action bar BEFORE the modal action bar (the modal is appended later in the body). The matcher walks document order and clicks the first hit. `Save draft` matches `text:"Save"` because it contains the substring; the matcher does not prefer exact matches.

This is not a Play-Console-specific bug. Any Material-style app with a persistent page action bar plus a modal that has its own Save will exhibit it.

## How to apply

**Before clicking any modal Save button, find it explicitly via cdp.findVisible and click by exact coordinates.**

```bash
D:/.code/EcodiaOS/backend/scripts/agent cdp.findVisible \
  '{"alias":"eos-cowork-{slug}-play","tag":"BUTTON","text":"Save"}' \
  | jq -c '.result.items[] | select(.text=="Save") | {x:.x,y:.y}'
```

This returns ALL buttons whose text starts with "Save". You will see two entries on a modal-open Play Console page:

```
{"text":"Save draft","x":1101,"y":543}
{"text":"Save","x":1270,"y":543}
```

The modal Save is the one with exact text `Save` (no `draft` suffix), at the larger x. Click that one with cdp.realClick:

```bash
D:/.code/EcodiaOS/backend/scripts/agent cdp.realClick '{"alias":"eos-cowork-{slug}-play","x":1270,"y":543}'
```

## Verification

The right click flips the row's status from `Not started` to `Completed` (or the equivalent for the section). The wrong click closes the modal and shows the page-level `Your changes have been saved` toast, but the row stays `Not started`. Always re-probe the row state after clicking; do not trust the toast as confirmation that the modal committed.

## The same trap on Cancel / Discard

Modals on Play Console also have `Discard` at `x ~ 1129, y ~ 543` while the page has `Discard changes` at `x ~ 959, y ~ 543`. The same substring-match risk applies to text:"Discard". Use exact-match filter and explicit coordinates.

## Origin

First diagnosed on the Chambers 1.0(17) Data safety wizard 2026-05-29. Hit the trap twice: once on the Name data type modal (modal closed without saving Collected + Required + App functionality + Account management), once on the Email modal before noticing the pattern. The third modal (User IDs) used the explicit `(1270, 543)` and committed correctly. All five per-type modals (Name, Email, User IDs, Photos, Other in-app messages) shipped via the explicit-coords path.

## Cross-refs

- [[play-data-safety-wizard-5-step-anatomy]] - where this trap first showed up at scale.
- [[play-console-cdp-driven-app-content-setup]] - the parent runbook.
- [[cdp-helper-library-and-recursive-improvement-2026-05-18]] - the cdp.* helper inventory the recursive-improvement protocol points to.

## Closing the loop

A future enhancement to `cdp.clickByTag`: accept an `exact: true` flag that requires `innerText.trim() === text` instead of substring match. Until that ships, the explicit findVisible + realClick path is the reliable substrate.
