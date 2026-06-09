---
name: play-console-first-app-submission-has-three-gates-2026-06-09
description: Submitting the FIRST production release of a brand-new Android app passes through three distinct UI gates - the release editor (Save as draft / Next), the publishing overview (Save staged change), and the submission queue (Send N changes for review + modal confirm). Skipping any one of them looks like success on the page that was the gate but the release stays in `Inactive Draft` and never reaches Google. The reliable evidence of actual submission is the `Remove changes` button on `/publishing` plus a pre-check countdown, NOT the disappearance of a `Send app for review` button. Burned the Locals 2026-06-09 push three times before this was true.
triggers: play console first submission, play console three gates, send app for review premature claim, inactive draft release stuck, remove changes button verify submission, publishing overview pre-check countdown, locals first-app submission flow, play console draft release not bound to production, edit release next save confirm modal, multi-step submission flow false-success, play first production release flow, locals android send 10 changes for review
metadata:
  type: feedback
---

# Play Console first-app submission has three distinct gates

**General form:** any multi-step submission flow on a SaaS console (Play Console, App Store Connect, Vercel, Stripe, ASC, GitHub Releases) has intermediate gates whose Save buttons commit the change to the NEXT page's staging area, not to the final destination. The reliable proof of final submission is the post-commit button-state change on the final page (here: the `Send N changes for review` button replaced by `Remove changes`), never the disappearance of an earlier gate's button or the appearance of a pre-check countdown. Identical UI text (`Up to N minutes remaining`) can appear at two different gates and mean different things. Doctrine-wide trigger: any `staged-changes pre-check`, `multi-gate save`, `inactive draft after save`, `submission false success` symptom in any vendor console.

**Rule:** the FIRST production release of a brand-new Android app passes through three sequential UI gates before it reaches Google. Each gate has its own page, its own Save button, and its own success signal. Stopping at the first gate (which says "saved, ready to send") and calling it submitted is the failure mode that ate hours on the Locals 2026-06-09 push. Do not declare the release submitted until the third gate's success signal lands.

**Why:** Play Console UX for first-app production submission is multi-step on purpose. Each gate confirms a different commitment. Gate 1 commits the release editor changes to a staged draft. Gate 2 commits the staged draft to the publishing overview's change list. Gate 3 commits the change list to Google's review queue. A page that says "Your change has been saved. To send it to Google for review, go to Publishing overview." is gate 1 completion, NOT gate 3. The Save button on the release editor and the Send-for-review button on the publishing overview are different buttons with different effects. The "Up to N minutes remaining" pre-check countdown can appear at TWO different points (after gate 2 saves into publishing overview, and after gate 3 commits to the review queue) and only the second one means submission landed.

**How to apply:**

### Gate 1 - the release editor

URL: `/tracks/{trackId}/releases/{releaseId}/prepare` (then `/review`)
Page text cue: `Discard draft release` button top-right, `Save as draft` + `Next` buttons bottom-right.

1. From the dashboard `Test and release` -> `Production` -> `Releases` tab, find the Inactive Draft row, click `Edit release`.
2. Page shows the release form. Click `Next` (1418, 805) NOT `Save as draft` - Save as draft keeps it in Inactive Draft.
3. Page changes to the `Preview and confirm` view. Bottom shows `Back` + `Save`.
4. Click `Save` (1456, 825). A modal appears: `Go to Publishing overview? Your change has been saved. To send it to Google for review, go to Publishing overview.` with `Not now` / `Go to overview` buttons.
5. Click `Go to overview`. **Gate 1 done.** Do NOT believe this is submission. The release is now staged in the publishing overview but not yet sent.

### Gate 2 - the publishing overview, send-for-review trigger

URL: `/publishing`
Page text cue: a list of `What you've told us` items, plus an unelevated blue `Send N changes for review` button at the top right.

1. The page now shows `Send N changes for review` where N is the count of pending changes (10 for the Locals first-release case: listing text + icon + feature graphic + screenshots + contact + category + country targeting + production release + content declarations + AAB).
2. Click that button. A confirmation modal opens: `Send N changes for review? These changes will be sent to Google for review. Reviews are typically completed within seven days but may take longer.` with `Cancel` / `Send changes for review` buttons.
3. The pre-check countdown banner `Up to N minutes remaining` may already be visible on this page at this point - this is staged-changes pre-check, NOT the post-submission pre-check. Same UI, different meaning. Do not be misled by it appearing before you click the confirmation.

### Gate 3 - the modal confirmation, real submission

The modal from Gate 2. Page text cue: an unelevated blue `Send changes for review` button inside the dialog.

1. Click `Send changes for review` (the modal button, NOT the page button - the modal one has class `yes-button`).
2. After ~5 seconds the page reloads. The change list is now hidden. The visible button next to the pre-check countdown changes from `Send N changes for review` to **`Remove changes`**.
3. **The `Remove changes` button + the pre-check countdown together are the only reliable proof of submission.** The previous countdown was identical in text but the button was different.

## The three success signals, side by side

| Gate | Page | Button you click | Button visible after | Means |
|------|------|------------------|----------------------|-------|
| 1    | release editor `/.../review` | `Save` (bottom right) | `Go to Publishing overview?` modal | release staged in publishing overview |
| 2    | `/publishing` | `Send N changes for review` (page-level) | `Send N changes for review?` modal | confirmation requested |
| 3    | `/publishing` (modal) | `Send changes for review` (modal blue) | `Remove changes` button on `/publishing` | **submitted to Google** |

## What I got wrong (recorded for the next time)

1. **Misread the gate-1 pre-check countdown as gate-3 success.** The page said `Up to 14 minutes remaining` and I called the release submitted. The actual signal is the `Remove changes` button (only appears after gate 3). The `Send app for review` button being visible AT ALL means submission has not happened.
2. **Believed the `/tracks/production` empty-state UI when the API said a draft existed.** The empty-state `Once you've released your app to production...` text is shown on the Release dashboard sub-tab. The draft was on the Releases sub-tab. Sub-tabs matter; the parent page can mislead.
3. **Tried to flip status='draft' to status='completed' via API and got `Only releases with status draft may be created on draft app`.** First-app submission's app-state transition is NOT API-driven. The Play Developer API can create a draft release but cannot promote that release out of draft when the APP itself is in draft state. Only the publishing-overview UI (Gate 3) can do that. After the first release reaches `Available on Google Play` the app leaves draft state and the API CAN promote subsequent releases via `tracks.update status=completed` per [[play-console-listing-graphics-contact-go-via-api-not-cdp-2026-06-09]].
4. **Conflated `Save as draft` with `Next` in the release editor.** Save as draft leaves the release in the editor. Next moves to the Preview-and-confirm view. Both buttons live at the same bottom-right cluster of the same page and look almost identical.
5. **Activated the tab per click instead of batching.** Per [[cdp-tab-focus-steal-banned-batch-one-burst-2026-06-09]] - relevant here because the three-gate flow is multi-burst by nature, but each burst should be one continuous activation. The fix is to plan all three bursts on paper before activating the first time, so subsequent activations are unavoidable not exploratory.

## Anti-patterns

- AVOID: Calling the release submitted as soon as you see a pre-check countdown. Look for the `Remove changes` button specifically.
- AVOID: Clicking `Save as draft` in the release editor when you want to send for review. That leaves it in editor state.
- AVOID: Trusting the `/tracks/production` Release dashboard sub-tab's empty state when an API check confirms a draft exists. Switch to the Releases sub-tab.
- AVOID: Trying to push a first-app release straight to status=`completed` via API. The app must first transition out of draft state via the UI.
- AVOID: Re-running the API insert-edit + tracks.update sequence after the draft was already created. Each new edit transaction creates a new draft release entry that may shadow the one in the editor.

## Cross-references

- [[play-console-listing-graphics-contact-go-via-api-not-cdp-2026-06-09]] - the parent API-first rule; this pattern names the four UI gates where the API path does NOT cover
- [[cdp-tab-focus-steal-banned-batch-one-burst-2026-06-09]] - focus-steal hygiene for the gate 2 + gate 3 click bursts
- [[play-console-data-safety-cdp-driving-refined-2026-06-09]] - the Data safety wizard recipe that runs upstream of these gates
- [[play-console-cdp-driven-app-content-setup]] - parent runbook
- [[play-console-android-release-recipe]] - the end-to-end release flow
- [[verify-deployed-state-against-narrated-state]] - the meta-rule: do not trust narrated success without a substrate probe
- [[stop-rationalising-when-symptom-persists-re-probe-reality]] - the rule that should have fired when Tate said "its not sent for review" but I had narrated otherwise

## Origin

2026-06-09, Locals 1.0(1) Play Console first-app push. After Tate's "Send the release to Google for review" prompt from the dashboard chevron item I clicked what appeared to be the gate-3 button, saw `Up to 14 minutes remaining`, and called the release submitted in chat. Tate verbatim 17:43 AEST: "What.... its not sent for review. Ive got the tab open in cdp. Pin, alias and actually do it". The submission was actually at gate 1 (release editor pending), which I then walked through to gate 2 (publishing overview) and gate 3 (confirmation modal), each with its own Save / Send button. The fix is this doctrine: name the three gates, name the success signal of each, name `Remove changes` as the only reliable proof. Next time any new Android app's first production release runs through Play Console, the chat starts at this pattern.
