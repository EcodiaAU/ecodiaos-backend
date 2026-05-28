---
triggers: delete account url, store declaration url, web resource preemptive ship, google fetches review url, app store review fetches urls, privacy policy url, terms url, support url, contact url, store listing url validation, spa fallback returns index html, marketing site vs app site, data safety url resolves, declaration url 200 with wrong content, deeplink resolves but content wrong, /delete-account preemptive deploy, /privacy preemptive deploy
class: preemptive-deploy-discipline
owner: ecodiaos
---

# Any URL referenced in a store declaration must serve real content before reviewers fetch it

Store declarations (Play Data safety, Apple App Privacy, content guidelines) accept URLs syntactically: a URL field validates only on format. Google and Apple reviewers fetch the URL during review. If the URL 200s with the wrong content (because of an SPA fallback to the home page, or a marketing site that has no route for the path), the reviewer flags the declaration and the review queue rejects or holds the submission. Ship the page BEFORE the URL is used in the declaration, or within the review window if the queue is fast enough.

## Why

SPAs commonly serve `index.html` for any unmatched path so client-side routing can handle it. The HTTP status is 200, so a naive validator (the store form's URL check) accepts it. The reviewer sees the home page rendered at `/delete-account` and reports `URL does not lead to the declared content`. The result is a rejected submission, sometimes with a 7-day delay before the next attempt clears.

Marketing sites (`chambers.ecodia.au`) and app sites (`app.chambers.ecodia.au`) are commonly distinct deployments with different routers. A route built into the app router does not appear on the marketing site, and vice versa. The URL you declared must resolve on the EXACT domain you typed into the form.

## How to apply

**For every URL field in a store declaration, build the page on every domain that might serve it, push to main, and verify the deploy lands before the declaration goes to review.**

Step-by-step:

1. **Audit the URL fields in every store declaration before filling them in.** Data safety has at least one (`Delete account URL`). Apple App Privacy has support and privacy policy URLs. Both stores have store-listing-level support URLs.
2. **Pick a URL pattern that exists on a site you control.** Default to your marketing site domain (root domain, not the app subdomain) because that is the public-facing surface users hit.
3. **Build the page on every site that might serve it.** For Chambers: the marketing site at `chambers.ecodia.au` AND the app at `app.chambers.ecodia.au` both gained a `/delete-account` route. The same content, voiced for the host (editorial register on marketing, member-facing register in-app).
4. **Push to main and verify the deploy lands.** Curl the exact URL you typed into the form. Read the response body. Confirm it contains the expected content, not the home-page HTML.
5. **Cross-check inside the review window if you typed the URL before shipping the page.** Reviews typically take 2-7 days; shipping the page within the first 24 hours of submission is usually enough. Do not assume.

## The SPA fallback failure mode

The classic symptom: `curl -s https://chambers.ecodia.au/delete-account` returns 200, the HTML title is `Chambers - The member app for chambers of commerce`, and the body contains the marketing home-page content. The reviewer treats this as `URL does not describe how to delete an account`. Submission is held or rejected.

The fix is to add the actual route in the marketing site's router and a corresponding page component. For React Router:

```tsx
// MarketingSite.tsx
<Route path="/delete-account" element={<DeleteAccountPage />} />
<Route path="*" element={<HomePage />} />  // fallback stays, but the specific route resolves first
```

## What the page should actually contain

For account-deletion URLs (the load-bearing case across both Google Play and Apple):

- Plain explanation of how to delete the account from inside the app.
- Email path for users who cannot sign in (mailto link with a subject line).
- Explicit list of what gets deleted.
- Explicit list of what is retained (financial records for tax, anonymised analytics, operational logs with retention windows).
- Timeframe commitment (Chambers committed to 30 days).
- Contact line for follow-up questions.

A bare placeholder like `Email us to delete your account` is sometimes accepted by reviewers and sometimes flagged. The full version is safer.

## Origin

Chambers 1.0(17) ship-day 2026-05-29. The Data safety wizard's Step 2 hidden delete-URL question was filled with `https://chambers.ecodia.au/delete-account`. The marketing site at that domain had no route for `/delete-account`; the SPA fallback served the home page. Caught BEFORE Google fetched the URL by curling the path during the Publishing-overview audit. Shipped the route to both marketing and app sites (commit 6eeba5b on chambers-frontend main) inside the same hour as the Send for review click. Reviewer fetch happened later that day with the real page live.

## Cross-refs

- [[play-console-cdp-driven-app-content-setup]] - the parent runbook references this in Step 4 Data safety.
- [[play-data-safety-wizard-5-step-anatomy]] - the wizard's Step 2 Q3b is where the Delete URL field appears.
- The shipped components: `D:/.code/chambers-frontend-uxfix/src/pages/DeleteAccount.tsx` (app) and `D:/.code/chambers-frontend-uxfix/src/pages/marketing/DeleteAccountPage.tsx` (marketing).
