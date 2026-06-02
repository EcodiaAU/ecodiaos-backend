---
triggers: chambers-copy, chambers-marketing, chambers-positioning, chambers-faq, chambers-asc-listing, chambers-play-listing, chambers-pitch, chambers-tenant, multi-tenant-chambers, white-label-chambers, chambers-per-chamber, one-app-per-chamber, multi-tenant-product-positioning, saas-deployment-topology-marketing, per-tenant-vs-shared-app-copy, product-copy-deployment-truth, positioning-lie-recurring-leak
status: validated_v1
validated_at: 2026-06-02
flow_slug: chambers-is-one-app-for-all-chambers-not-one-per-chamber
---

# Chambers is one shared app for all chambers, not one app per chamber

**General form:** product-positioning copy must describe the actual deployment topology. A multi-tenant SaaS must not be marketed as per-customer-deployed; a per-customer-deployed product must not be marketed as multi-tenant. The wrong framing leaks past human review because it sounds plausible in both directions, so once an instance is caught it earns a same-turn write-time hook (PreToolUse on Write/Edit/MultiEdit) that names the specific lie phrasings and the specific copy surfaces those phrasings can appear in. This file is the Chambers-specific instance of that rule. The next instance (Goodreach, Glovebox, Locals., or anything else multi-tenant) authors its own sibling pattern + sibling hook using this one as the template.

The Chambers product is a single multi-tenant app. One App Store listing, one Google Play listing, one web app (`chambers.ecodia.au`), one bundle id `au.ecodia.chambers`, one Supabase project `arkbjjkfjsjibnhivjis`. Every chamber of commerce that uses Chambers lives inside the same shared app as a themed tenant, picked at sign-in via `?tenant=<slug>` on the web or via the chamber-picker on mobile.

The lie that keeps leaking is "one app per chamber" or "each chamber gets its own app." Both imply per-chamber white-label binaries. Neither is true. Tate flagged this as a recurring leak on 2026-06-02 after spotting it in the chambers.business marketing landing.

## What is true

- One Chambers app exists on each store, branded "Chambers."
- The app contains a chamber picker. A member opens the app, picks their chamber, and the app themes the room around that chamber's colours, logo, member directory, events, and comms.
- Data is isolated per chamber by Postgres RLS on `tenant_id`. The shared infrastructure is invisible to members.
- Per-chamber theming is real (colours, logo, member tiers), but it is theming inside the same binary, not a separate binary.
- The web app exposes a tenant URL like `chambers.ecodia.au/?tenant=coastal-business-network` for direct deep links, but it is the same app behind that URL.

## What is false (do not write these)

- "one app per chamber"
- "per-chamber app"
- "each chamber gets its own app"
- "chamber-specific app"
- "individual chamber apps"
- "white-labelled per chamber" implying separate binaries (the answer to that FAQ is "no, themed inside the same app")
- "own Chambers app for your chamber"

## How to say it instead

- "One shared app, every chamber inside it, themed per chamber."
- "The member app for chambers of commerce. Every chamber lives inside as a themed tenant."
- "One Chambers app on the App Store and Google Play. Members pick their chamber after signing in."
- For the white-label question: "No. Chambers is one shared app, and every chamber lives inside it as a themed tenant."

## Where it has leaked

Live audit 2026-06-02 found two leaks in `D:/.code/chambers-frontend/`:

- `src/pages/marketing/HomePage.tsx` line 54 - "One app per chamber. Members, events, comms, themed to your brand." Fixed in commit on 2026-06-02 to "One app, every chamber inside it. Each one themed in its own colours."
- `index.html` line 104 (FAQ Q1 acceptedAnswer) - "One app for every chamber, themed per chamber" - "for every" was ambiguous, tightened to "One shared app, every chamber inside it, themed per chamber" in the same commit.
- `index.html` line 109 (FAQ Q2) - question phrased as "Is Chambers white-labelled per chamber?" with an answer that quietly clarified the multi-tenant truth. Rephrased to "Does each chamber get its own app?" with explicit "No" answer.

## Enforcement

Same recursive-improvement triad as `vercel-deploys-require-github-recognised-commit-author`:

- Pattern doctrine: this file.
- PreToolUse hook: `~/.claude/hooks/ecodia/chambers-multi-tenant-surface.sh` fires `[CHAMBERS-MULTI-TENANT WARN]` when a Write/Edit/MultiEdit payload anywhere under `D:/.code/chambers-frontend/`, `chambers-platform-site`, ASC metadata files, Play Store listing files, social posts, briefs, or `backend/clients/chambers.md` contains any of the false phrasings above.
- Recovery: when the hook fires, revisit the payload, rewrite using one of the correct phrasings, then proceed.

## Origin

Tate verbatim 2026-06-02: "THe chambers marketing has a lie, its not one app per chamber.... its just one app for all chambers, idk why that idea keeps leaking into the copy and marketing.... can we kill that for good." The phrasing leak first appeared in the 2026-05-28 marketing copy revision and has resurfaced in two subsequent rewrites despite no one consciously deciding it. The hook closes the loop so the model cannot type the lie again without being told off in the same turn.

## Cross-references

- [[multi-tenant-brief-must-enumerate-customisation-surface]] - the prior multi-tenant doctrine that defines what theming surface a tenant actually gets. Chambers is the canonical tenant model.
- [[codify-at-the-moment-a-rule-is-stated-not-after]] - the meta-rule under which this pattern was authored.
- [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]] - the helper + hook + doctrine triad pattern.
- [[client-anonymity-substring-scan]] - sibling write-time copy-check hook for client-anonymity. Same shape, different surface.
