---
name: play-console-data-safety-cdp-driving-refined-2026-06-09
description: Refined end-to-end recipe for driving the Play Console Data safety + App content wizards via CDP after the Locals 2026-06-09 production push. Covers the new failure modes (hidden visibilityState, dynamic Save coords across window resizes, modal X close routes through to next Not-started row, Stage-2 input-index map per data-type class) and bakes them into a five-stage protocol that ships any new Android app's Data safety in under 10 minutes of CDP work.
triggers: play console data safety, play console cdp, data safety wizard cdp, play console hidden tab, visibilityState hidden cdp, data safety per type modal, modal save coordinate drift, modal x button next row, stage 2 input index map, app content cdp playbook, locals android play console 2026-06-09, chambers data safety refinement, android play console end-to-end recipe, ship-android-app-content, data safety completion zero attention, location optional precise approximate, email required account management, app interactions in-app search history, account-delete url required field, privacy policy url field, target audience 18 plus, content ratings iarc questionnaire, sign-in details merchant credential, ads declaration no, target audience over 18, financial health government no
metadata:
  type: feedback
---

# Refined Play Console CDP driving playbook (June 2026)

**General form:** The Play Console App content wizards (10 declarations) and the Data safety wizard (5 steps + per-type modals) are completely automatable via CDP on Tate's logged-in Chrome. The first version of this doctrine landed during Chambers 1.0(17) in May 2026. The second run during Locals (June 2026) surfaced four new failure modes worth baking in. Read this BEFORE starting any new Android app's Play Console push.

## Why

Without this playbook, the Data safety wizard alone takes 60-90 minutes of CDP fumbling per app. With it, the full App content surface (10 declarations) ships in 20-30 minutes from a cold start. The doctrine is the difference between Tate doing the wizard manually and one fresh chat completing it autonomously.

## How to apply

The five-stage protocol:

### Stage 1: Pre-flight (3 min)

1. **Probe the public site for /privacy and /account-delete BEFORE drafting anything.** See [[probe-public-site-for-existing-legal-pages-before-drafting]]. The Locals `/privacy` already existed; `/account-delete` did not and had to be authored, committed, and Vercel-deployed before Data safety would accept the URL.
2. **CDP-Chrome up.** `POST localhost:7456/api/tool {tool:"gui.enable_chrome_cdp",port:9222}`. Verify port 9222 binds.
3. **Activate the Play Console tab with `curl -X POST http://localhost:9222/json/activate/{targetId}` before every action burst.** Tate's other Chrome usage flips the Play Console tab to `visibilityState=hidden`; Material's modal handlers silently no-op clicks when the tab is hidden. The standard `cdp.attach_tab` does not re-foreground. The `/json/activate/{targetId}` endpoint does. Run it every 30-60 seconds of CDP work, AND immediately before opening any modal.

### Stage 2: The 9 App content declarations (5 min)

`/app-content/overview` lists every gated declaration. The 9 cheap ones (everything except Data safety) follow the same recipe:

1. `cdp.clickByTag` on `Start <name> declaration` (aria-label).
2. Fill via the right radio / checkbox combo (Locals defaults: Ads No, Ad ID No, Govt No, Financial None, Health None, Target audience "18 and older", Content ratings IARC questionnaire all "No" with category "All other app types", Privacy policy `https://<brand>.ecodia.au/privacy`).
3. Click Save.
4. Dismiss "Go to Publishing overview?" modal with "Not now".
5. Re-navigate to `/app-content/overview` and verify the "Need attention" count dropped by 1.

The Sign-in details declaration is the only quirk: it wants a merchant-admin credential row (Type=Email, Username=`code@ecodia.au`, Password=any working merchant-admin password). Tick "Yes, I will provide sign-in details" + the affirmation checkbox + add the row + Save.

### Stage 3: Data safety steps 1-3 (5 min)

Per [[play-data-safety-wizard-5-step-anatomy]] which still holds. Step 2's "Delete account URL" field only materialises after ticking an account-creation method. Step 3 needs each section expanded (Personal info, Location, App activity for Locals) and the relevant types ticked.

### Stage 4: Data safety step 4 - the per-type modal storm (10 min for 5 types)

This is the section that ate 2 hours on the Locals run before the refinements below were captured. Each data type opens a side-drawer modal with 4 questions. The reliable recipe per modal:

```python
# Stage 1: tick Collected
cdp.runJs: "(function(){const inp=Array.from(document.querySelectorAll('input')).filter(c=>c.offsetParent)[0];if(inp&&!inp.checked)inp.click();return inp?.type;})()"

# Wait 2s for the rest of the form to render

# Stage 2: tick indices by data-type class (the 13-input map)
cdp.runJs: "(function(){const inputs=Array.from(document.querySelectorAll('input')).filter(c=>c.offsetParent);[3,5,6].forEach(i=>{if(inputs[i]&&!inputs[i].checked)inputs[i].click();});})()"

# Wait 2s

# Find and click modal Save (re-probe coords every time, do NOT cache)
cdp.findVisible {tag:"BUTTON",text:"Save"} -> filter exact "Save" -> realClick at center
```

The Stage-2 index map per data-type class:

| Class                   | Indices       | Reasoning                                           |
|-------------------------|---------------|-----------------------------------------------------|
| Location (Optional)     | [3, 5, 6]     | No-ephemeral + Optional + App functionality         |
| App activity (Optional) | [3, 5, 6]     | No-ephemeral + Optional + App functionality         |
| App activity (Required) | [3, 4, 6]     | No-ephemeral + Required + App functionality         |
| Identity (Email/Name)   | [3, 4, 6, 12] | + Account management for auth credentials           |
| Photos / Messages       | [3, 4, 6]     | No-ephemeral + Required + App functionality         |

### Stage 5: Step 5 Preview + outer Save (2 min)

Click Next from Step 4. Step 5 shows the Store-Listing-style preview. The page-level Save is now blue. Click it. Dismiss "Go to Publishing overview?" with "Not now". Re-navigate to `/app-content/overview`. Should read **"You've caught up with everything."**

## The four refinements baked into Stage 1-4

**1. Hidden visibilityState breaks Material click handlers (new 2026-06-09).** `document.visibilityState=='hidden'` is the universal symptom. Even though CDP can send mouse events, Angular's modal-open handlers silently ignore them when the tab is in the background. The fix is `POST http://localhost:9222/json/activate/{targetId}` directly (NOT via any cdp.* helper - none of them call activateTarget). Run before each click burst.

**2. Modal Save coordinates drift across window resizes.** First Locals run had modal Save at (1455, 825); after Tate resized Chrome it was at (1144, 687). Hard-coded modal-Save coords from a previous app's run will miss. Always re-probe with `cdp.findVisible {text:"Save"}` filtered to exact `text==="Save"` (NOT the substring trap from [[cdp-clickbytag-save-grabs-outer-page-save-draft-not-modal-save]]). Pick the entry whose x is LARGER (modal Save is rightmost).

**3. Modal X (close) close routes through to the next Not-started row (new 2026-06-09).** Unexpected but reproducible: clicking the modal's top-right X close button on a half-filled modal closes that modal AND auto-opens the next row's modal. This is great when you want to chain rows, terrible when you only meant to bail. Use Discard changes (modal-level, at the rightmost Discard) when you actually want to bail.

**4. arrow_right_alt buttons remain in the DOM after a row is Completed.** A 4-row section starts with 4 arrows. After the first Save, the section still has 4 arrows; the completed row's arrow is now an "edit" button rather than a "start" button. Re-probing arrow positions by index alone is unreliable. Better: find the row by its text label and click its arrow. Best for batch automation: after each save, dump the section text and verify which rows are still "Not started" before picking the next.

## Anti-patterns

- AVOID: Starting the Data safety wizard before `/privacy` and `/account-delete` resolve as 200 with substantive content. Google reviewers fetch them at submission time; a 404 or a JS-SPA homepage fallback flags the submission.
- AVOID: Hard-coding modal Save coords across runs. Probe every time.
- AVOID: Caching the arrow-position list across saves. The DOM re-renders.
- AVOID: Driving any wizard without activating the tab first when Tate is on the same machine.
- AVOID: Letting the modal X close button "succeed" without verifying which row's modal opened next. Always probe `H2` after the close click.

## Cross-references

- [[play-data-safety-wizard-5-step-anatomy]] - the May 2026 baseline this refines
- [[play-console-cdp-driven-app-content-setup]] - the parent runbook
- [[cdp-clickbytag-save-grabs-outer-page-save-draft-not-modal-save]] - the dual-Save substring trap
- [[probe-public-site-for-existing-legal-pages-before-drafting]] - the pre-flight rule (also authored this turn)
- [[chrome-cdp-attach-requires-explicit-user-data-dir-and-singleton-clear]] - the CDP-launch reflex
- [[parallel-cdp-chat-coordination-via-alias-namespacing]] - alias prefix rules for shared-Chrome sessions
- [[gui-recipes-authoring-optimisation-and-verification]] - the meta-doctrine for GUI recipes

## Origin

2026-06-09, Locals 1.0(1) Play Console production-track push. Started the day with 7 of 10 declarations done (Apr 21 prior session). Hit four new failure modes during the final 3-declaration push that the Chambers-2026-05-29 doctrine did not warn about. Captured the refinements before they faded. Next time any new Android app's Data safety wizard fires, the same chat that opens it should finish it in under 10 minutes.
