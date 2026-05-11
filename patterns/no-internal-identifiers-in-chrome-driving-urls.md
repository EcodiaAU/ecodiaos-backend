---
triggers: cb=fork_, fork_id in url, cache-buster production url, ?cb=fork, fork identifier query param, browser navigation query param leak, ecodia.au/?cb=, internal identifier url, fork_id query string, production url cache bust, corazon navigation query param
---

# Chrome-Driving Forks Must Not Inject Internal Identifiers Into Production URLs

## Rule

When a fork navigates Tate's Chrome to a production URL (for visual verification, smoke testing, or any purpose), it must use the **clean canonical URL**. Internal substrate identifiers — fork_ids, session_ids, request trace IDs, or any `fork_*`-prefixed string — must never appear as query parameters on any URL visible in Tate's browser, server access logs, CDN edge logs, or web analytics.

## Do

- Navigate to the clean canonical URL: `https://ecodia.au`, `https://app.roam.travel`, `https://staging.ecodia.au`
- If cache-busting is genuinely needed for visual verification, use a timestamp or random short token: `?v=1714985600` or `?bust=7k4x`
- Never derive the cache-buster value from internal state (fork_id, session_id, task_id, etc.)

## Do Not

- `https://ecodia.au/?cb=fork_mojnlwgo` — leaks fork_id into browser history, Vercel access logs, Google Analytics / Vercel Speed Insights (both fire on real page loads)
- `https://myapp.vercel.app?fork=fork_abc123def` — same problem
- Any URL pattern matching `?cb=fork_`, `?session=`, `?trace_id=`, `?req_id=` on a public-facing domain

## Why It Matters

1. **Browser history exposure**: Tate sees the URL. An internal identifier in the address bar is confusing and leaks the fact that an automated agent just drove his browser.
2. **Server-side log contamination**: Vercel/Cloudflare access logs record every query string. fork_ids in logs create noise that looks like bugs.
3. **Analytics pollution**: Vercel Speed Insights, Google Analytics, and any tag-manager-attached tool will record the query param as a distinct page variant, polluting session data.
4. **Tate's correct reaction**: "wrong in a few ways lmao" — even a successful CSS-change visual verification was flagged as a failure because of this URL hygiene issue.

## Protocol / Verification

Before any `input.*` navigation call that opens a URL in Tate's Chrome:

1. Strip all internal identifiers from the URL
2. If cache-busting: use `Date.now()` or a 4-char random hex token — nothing that matches `/fork_[a-z0-9]+/` or any known internal ID pattern
3. The URL you navigate to should be the same URL you would paste into Tate's chat as "check this out" — if you wouldn't paste it as-is, don't navigate to it

## Origin

**2026-05-11 22:51 AEST** — Tate verbatim correction:

> "Also learn from this, in my browser (good) it opened a new tab (good) but went to https://ecodia.au/?cb=fork_mojnlwgo which is wrong in a few ways lmao. THen it jsut ended and probably reported back to you"

Fork `fork_mojnlwgo_816406` was executing a prod visual verification step (ecodia.au link-underline CSS change, 29 Apr 2026). Its brief explicitly said "navigate to https://ecodia.au via Corazon Chrome". The fork appended `?cb=fork_mojnlwgo` as a cache-buster using its own fork_id as the value. The navigation itself was structurally correct (new tab, Corazon, Tate's Chrome); only the URL was wrong.

This correction was backfilled into `outcome_event` 21× by fork `fork_mp17c0qm_a796a8` (correction-oracle) due to a 30-min time-window fan-out join with no UNIQUE dedup constraint — one row per matching dispatch_event instead of one row per correction message. Structural fix: partial unique index `outcome_event_dedup_correction ON outcome_event(md5(correction_text), ts::date) WHERE outcome = 'correction'`.

## Cross-References

- `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md` — this pattern is a URL hygiene corollary to the Chrome-driving substrate rule; that pattern governs HOW to drive Chrome, this one governs WHAT URL to navigate to
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` — the fork reported "screenshot taken, prod verified" without Tate being able to confirm the URL was clean; this is a narration-vs-disk seam
- `~/ecodiaos/patterns/visual-verify-is-the-merge-gate-not-tate-review.md` — visual verification is only a gate when the screenshot was taken from a clean URL; contaminated URLs make the gate unreliable
