---
name: probe-public-site-for-existing-legal-pages-before-drafting
description: Before drafting (or declaring "missing") a privacy policy, terms of service, support URL, contact page, EULA, app store listing copy, or any other "public asset by URL" required by a store, payment processor, or third-party platform, curl the actual public site for that page FIRST. The page often already exists at the canonical path. Drafting a new one is wasted work and creates a divergent second source of truth.
triggers: privacy-policy-url, privacy-url, terms-of-service-url, terms-url, eula-url, support-url, contact-url, legal-page, play-console-privacy-policy, app-store-privacy-url, stripe-restricted-business-url, vendor-required-public-url, must-be-publicly-accessible, paste-the-link, hosted-legal-page, content-rating-privacy-url, data-safety-privacy-policy, locals-privacy, ecodia-privacy, missing-privacy-page-assumption
metadata:
  type: feedback
---

# Probe the public site for /privacy /terms /support before drafting one

**General form:** Whenever a vendor surface (Play Console, App Store Connect, Stripe restricted-business onboarding, Resend domain verification, any OAuth provider's redirect-url field, any data-safety questionnaire) asks for a URL to a publicly-hosted page, the page often already exists at the canonical path on the brand domain. Defaulting to "we don't have one, let me draft" wastes a round trip and creates a parallel second source of truth that drifts.

## Why

Static brand sites get `/privacy`, `/terms`, `/legal`, `/support`, `/contact`, `/cookies`, `/eula` pages set up early and forgotten. The page lives on disk in the public-site repo and on the live site. Asking "does this URL resolve?" via a single curl call is cheaper than typing the question into chat.

## How to apply

When a vendor field reads "Privacy policy URL" / "Terms URL" / "Support URL" / "Cookie policy URL" / "Contact URL":

1. **Curl the obvious paths first** on the brand's primary domain. For Locals:
   ```bash
   for p in /privacy /privacy-policy /legal/privacy /terms /terms-of-service /legal/terms /support /contact /eula; do
     code=$(curl -s -o /dev/null -w "%{http_code}" "https://locals.ecodia.au$p")
     printf "%s %s\n" "$code" "$p"
   done
   ```
2. **Grep the public-site repo** for a route or page file matching:
   ```bash
   find /Users/ecodia/.code/locals-web/src -iname 'privacy*' -o -iname 'terms*' -o -iname 'legal*' 2>/dev/null
   grep -rl '/privacy\|/terms\|/legal' /Users/ecodia/.code/locals-web/src 2>/dev/null | head
   ```
3. **Take the canonical URL that resolves** (200 OK) and paste it into the vendor field. Done.
4. **Only draft a new page if both probes return empty.** If you draft, add the route to the public-site repo, ship it, then paste the live URL. Do NOT host the privacy page on a Gist, Notion, or any other off-brand surface. Vendors flag those as untrusted and reviewers reject the listing.

## Anti-patterns

- AVOID: Assuming a public page does not exist because the parent dossier or status_board row does not mention it. Static legal pages predate most rows.
- AVOID: Drafting a privacy policy into a chat reply or a markdown file in the backend repo. The vendor needs a URL on the brand domain, not a draft.
- AVOID: Saying "Privacy URL needs to be hosted, surfacing to Tate" without probing first. Surfacing-without-probing burns a turn the user can use on harder gates.
- AVOID: Pointing the vendor at the ecodia.au privacy policy when the app is locals.ecodia.au. Vendors compare hostname against the app's listing URL and flag mismatches.

## Cross-references

- [[no-placeholders-no-coming-soon-on-shipped-features]]
- [[play-console-cdp-driven-app-content-setup]]
- [[verify-deployed-state-against-narrated-state]]
- [[exhaust-laptop-route-before-declaring-tate-blocked]]
- [[generalisation-engine-lifts-specifics-to-general-form]]

## Origin

2026-06-08, locals-android Play Console production-track push. While driving the App content wizards I told Tate "Privacy policy URL is a hard blocker, locals.ecodia.au/privacy needs to be hosted" without ever curling the URL. Tate verbatim: "make and submit the privacy policy if its not already a thing (you should've look for that in the first place if you didnt, codify that)". The page may have already existed on the live site, and surfacing the gate before probing burned a round trip plus made me look unprepared. Pattern codified same-turn.
