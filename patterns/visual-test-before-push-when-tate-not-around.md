---
triggers: visual-test, ui-test, before-push, push-then-revert, localhost-test, vercel-preview, blind-push, ui-change-no-test, no-visual-verify, push-without-screenshot, ship-untested-ui, autonomous-ui-work, headless-ui-deploy, tate-not-around, ui-tweak-discipline, ship-then-verify, deploy-then-test, revert-if-broken
---

# Visual-test before push when Tate is not around (or push-test-revert mode if you must)

## The rule

UI changes on client repos (and on EcodiaOS frontend) MUST be visually verified before being declared shipped. Two acceptable modes:

**Mode A - localhost build + manual test before push (preferred for non-trivial changes).**
1. After the code edit, run the project's dev or build command (`npm run dev`, `npx vite preview`, `next dev`, etc).
2. Either drive the resulting localhost URL via Corazon's Chrome (`input.*` + `screenshot.*`) OR via Puppeteer (`browser.*` on `~/.eos-browser`) to load the affected page.
3. Capture a screenshot of the modified UI surface in its expected state. Capture a second screenshot reproducing whatever the bug or feature was about (form submission, value change, etc).
4. Confirm the change behaves as intended. If it doesn't, fix and re-test before pushing.
5. Only then commit + push.

**Mode B - push-test-on-live-and-revert-if-broken (acceptable for tight UI tweaks).**
1. Push the change directly to main (Vercel auto-deploys in ~60-120s for most projects).
2. Within 3 minutes of push, navigate to the live URL via Corazon Chrome or Puppeteer.
3. Capture screenshots of the affected UI behaving correctly.
4. If broken, immediately `git revert HEAD && git push origin main`. Don't try to fix forward; revert clean, fix locally, re-push.
5. Mode B is ONLY acceptable when (a) the change is a tight, bounded UI tweak (single component, single behaviour), (b) the revert path is one git command, AND (c) the conductor will be actively watching the deployment within minutes.

## Do

- Tate-not-around (no live human eyeballs on the change): default Mode A. Mode B only for the tightest UI tweaks.
- Tate-around (active chat session): Mode B is fine because Tate can also test in parallel; just notify him so we cross-verify.
- Always capture at least one before/after screenshot in Mode A and at least one after-screenshot in Mode B. The screenshot is the artefact that proves "tested," not the narration.
- Use Vercel preview URLs (per-PR auto-deploys) for cleaner testing on client repos that have them configured.

## Do not

- Do not declare a UI change "shipped" when only the code was tested (lint, types, unit tests). Unit tests don't catch a visual regression. Tate's directive 4 May 2026 18:39 AEST: visual verification is non-negotiable when he's not around.
- Do not push UI changes blind on autonomous windows (Tate away). Mode A is mandatory in that posture.
- Do not skip the revert step in Mode B if the live verification surfaces a regression. Forward-fix amid a regression is a recurring tar pit; revert clean, then fix.
- Do not rely on the user to flag the regression - the conductor must verify within the 3-minute live-deployment window or treat the change as not-yet-shipped.

## Protocol

When dispatching a fork that produces a UI change:
1. Brief includes Mode A localhost-test-before-push as the default unless the change is a tight tweak with a clean revert path.
2. Mode B requires the brief to also specify the revert command and the verify-deadline.
3. Fork report must include the screenshot artefact path or a base64-stamp confirmation. Bare narration "tested OK" is insufficient.

## Origin

**Tate, 4 May 2026 18:39 AEST verbatim:** "Really when im not here youshould be testing te code and pages and ui visually before pushing via localhost or even jsut pushing and doign the test on the live site and reverting if its negative. Since im here i can test it tho."

The trigger: Tate had been actively co-piloting the Co-Exist sync overhaul (test-bypass removal + delete-propagation + 165-synth-dupe sweep + cutover gating) and noted that I was about to ship the post-event survey UI change without proposing a verification step. The directive surfaced both the autonomous-window expectation and the present-Tate concession (parallel verification when he's around).

## Cross-references

- `~/ecodiaos/patterns/visual-verify-is-the-merge-gate-not-tate-review.md` - the merge-gate sibling for fork-completed changes.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - the broader narration-vs-disk-vs-prod discipline.
- `~/ecodiaos/patterns/visual-first-tate-presentation.md` - presentation discipline for visual artefacts to Tate.
- `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md` - Mode A's preferred Corazon-Chrome substrate.
- `~/ecodiaos/patterns/corazon-puppeteer-first-use.md` - Puppeteer alternative for Mode A localhost or Mode B live verification.
