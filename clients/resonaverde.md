---
triggers: resonaverde, angelica, angelica-choppin, resonaverde.au, hello@resonaverde.au, Resonaverde-au, dxtglcfyqvhmmnopshhp, resonaverde-standing, resonaverde-referral
---

# Resonaverde - Client Knowledge File

Read this BEFORE any Resonaverde work. Update it AFTER every session.

---

## Overview

- **Client:** Resonaverde (Angelica Choppin, founder/director)
- **Contact:** hello@resonaverde.au
- **Relationship tier:** Standing arrangement - autonomous reply + deploy without per-ask Tate approval. See `~/ecodiaos/patterns/angelica-resonaverde-standing-arrangement.md`. This is the ONLY active standing carve-out.
- **Commercial role:** Angelica is operationally Ecodia's salesperson. 80% of her consulting client conversations reach a "you need software" wall. See `~/ecodiaos/patterns/angelica-as-salesperson-not-board-prospect.md`.
- **Site:** resonaverde.au (Vercel, production)
- **Admin panel:** /admin/write (blog + newsletter CMS)
- **Repo:** github.com/Resonaverde-au/resonaverde (main branch, auto-deploys to Vercel production)
- **Supabase project:** dxtglcfyqvhmmnopshhp
- **Pricing:** mates-rate / standing arrangement (not full rate card)

---

## Standing Arrangement Scope

Effective 11 May 2026 16:30 AEST (Tate verbatim). Angelica can email asking for anything
within reason; EcodiaOS classifies yes/no/scope and deploys directly.

**In-scope (no Tate brief needed):**
- Web builds, bug fixes, UX improvements
- Copy edits, content updates
- Small feature additions on existing site/admin
- Technical advisory within Ecodia's competence

**Requires Tate brief-first:**
- Money commitments over $50/month recurring
- Contract changes to the referral agreement
- IP assignment changes
- Anything requiring Tate's signatory identity
- Work exceeding ~40 hours without scoping confirmation

---

## Referral Agreement

- **Status (as of 11 May 2026):** v2 sent 20 Apr 2026. No signed copy received.
- **v3 in-flight:** Two-way structure update + date correction + exclusion clause (own-boards CoI clause, added per `~/ecodiaos/patterns/board-referral-coi-exclude-own-boards-clause.md`).
- **CoI context:** Angelica is joining the Wild Mountains board June 2026 (alongside Kurt Jones as incoming chair). The exclusion clause protects her director credibility on any WM procurement involving Ecodia.
- **Framework:** Commission on referred clients introduced by Angelica. Does NOT apply to Resonaverde itself (that relationship is direct).

---

## Tech Stack

- **Framework:** Next.js (App Router), React, TypeScript
- **Hosting:** Vercel (auto-deploys from Resonaverde-au/resonaverde:main)
- **Database:** Supabase (project ID: dxtglcfyqvhmmnopshhp)
- **Storage:** Supabase storage (blog images, lead magnet files)
- **Domain:** resonaverde.au (Cloudflare DNS)

### Key paths
- `/admin/write` - blog + newsletter CMS (authenticated admin area)
- `/blog` - published blog posts
- `/resources` - lead magnet / gated resources page (added 11 May 2026)

### Vercel notes
- Production alias is resonaverde.au auto-following HEAD at Resonaverde-au/resonaverde:main
- Alias was confirmed correctly pointed at HEAD after 9 May 2026 deploy (fork probe verified)

---

## Delivery History

### 12 May 2026 - Wave 2 FE polish (mobile responsiveness + laptop cards + admin modernisation)

Tate directive 08:59 AEST 12 May 2026. Three categories shipped in 3 commits, deployed to production.

1. **Mobile responsiveness wave 2** (42ae75a) - Letter-spacing on heroTitle reduced from 0.18em to 0.07em at 560px and 0.05em at 380px. Section h2 and body text font-size scaled with clamp() at tight viewports. Builds on Wave 1 fixes (3924957 + b83902d) which handled P1 items (hero clip, blog grid collapse, admin/resources layout, logout visibility, subscribers overflow).
2. **Laptop card width** (a3bccb3) - glassCard widened from 720px to min(860px, calc(100vw - 48px)) at 1024px+. blogGrid CSS class added with 2-column layout at 768px+ (homepage blog recent posts section). Single column on mobile.
3. **Admin suite modernisation** (560f3f9) - Deep branded chrome overhaul: deep charcoal gradient sidebar (#111827) with white type + green dot accent, active post indicator with green left-border, tab nav with underline-active style (#059669), save button with glow + "Saving..." loading state, newsletter panel with green-tinted bg + subscriber count badge, Inter/Segoe UI font stack, hover micro-animations, 8px-radius green-focus-ring inputs throughout.

Vercel: dpl_J1UgD9SHLSopMt1Jfi9kPvT32cd4 READY production at commit 560f3f9.

### 11 May 2026 - 4 features shipped same-session (standing arrangement first use)

Angelica emailed 13:03 AEST with 6 website asks + 1 referral modification. Four features
shipped same session under `delivery-velocity-same-turn-not-24-48hr` doctrine.

1. **Auto-send bug fix** - email blast was firing immediately instead of staging a draft.
   Auto-send endpoint bug confirmed + fixed.
2. **File-delete bug fix** - file deletion from blog posts was broken. Fixed.
3. **Draft + scheduled blog publishing** - new admin feature: save-as-draft and schedule-
   for-future-date on blog posts.
4. **Lead magnet / gated resources page** - `/resources` page added with gated download
   flow for lead magnet PDFs.

Note: branding doc design pass deferred - Angelica's attachment was missing in original
email; she was asked to resend.

### 9 May 2026 - Site polish (commit a81b716)

- Reduced horizontal padding on `.glassCard` (52px to 40px desktop, 36px to 28px mobile)
- Replaced static-px middle terms in `clamp()` with vw-based scaling for responsive title
  scaling (h1=7vw, h2=5vw, h3=4vw, hero=8vw)
- Added `overflowWrap` + `wordBreak` on all headings to prevent long-word overflow on
  narrow phones
- Origin: Tate verbatim 17:39 AEST 9 May 2026 (Kurt-attribution)
- Vercel deploy: dpl_ChuokkT9AhY3vAaf7TQNSCih96GJ (READY, target=production)

---

## Active Threads (as of 11 May 2026)

| Thread | Status | Owner |
|---|---|---|
| Referral agreement v3 | Pending - awaiting Tate + Angelica sig on two-way + exclusion clause modifications | Tate |
| Branding doc design pass | Pending - Angelica to resend missing attachment | Angelica |
| 5 design decisions (mobile audit) | Awaiting Angelica input before implementing (admin layout, glassmorphism on blog, hero letter-spacing, secondary page theme-awareness, etc.) | Angelica |

---

## Relationship Context

Angelica is in Tate's conservation/youth/impact orbit alongside Kurt Jones. Key nodes:

- **Kurt Jones** - Co-Exist founder, Wild Mountains incoming chair June 2026. Kurt introduced
  or bridges Angelica and Ecodia. Same patron orbit.
- **Wild Mountains** - conservation charity. Angelica joining board June 2026. Kurt chairing.
  WM is a future software prospect (CE-fork-based platform scoped 11-14 May 2026 at the WM
  intensive). Angelica's board role creates a procurement CoI on any WM/Ecodia work -
  handled by the referral agreement exclusion clause.
- **Ecodia positioning:** infrastructure provider across this orbit. NOT board members.
  See `~/ecodiaos/patterns/ecodia-stays-off-boards-infrastructure-not-seats.md`.

**Do NOT contact Angelica via any channel other than email (reply to her thread) without
Tate go-ahead.** Standing arrangement authorises reply-to-her-email only, not proactive
outbound on channels she did not open.

---

## Operational Lessons

1. **Alias verification after deploys** - after 9 May deploy, a status_board row was
   filed claiming the alias was pinned to an old deploy. A fork probed and found the
   alias had auto-promoted correctly. Always verify before filing "alias stale" rows.
   Probe: `vercel_list_deployments` on Resonaverde-au/resonaverde and compare SHA.

2. **iMessage references purged 11 May 2026** - all iMessage-related code and doctrine
   swept from codebase and patterns per Tate directive 16:44 AEST. "Delete all mention
   of iMessage." Confirmed clean.

3. **Admin CMS is Resonaverde's primary self-service surface** - blog, newsletter, design
   settings, and file uploads all flow through /admin/write. Protect this path in every
   deploy: smoke-test admin panel login + one-write round-trip after any backend change.

4. **Mates rate does not mean scope-free** - standing arrangement + mates-rate pricing
   does not mean unlimited scope. Work exceeding ~40h without scoping confirmation from
   Tate requires a brief-first before committing. Name the scope explicitly in the reply
   confirming each task.

---

## Cross-refs

- `~/ecodiaos/patterns/angelica-resonaverde-standing-arrangement.md` - standing arrangement
  rules, scope, exclusions, yes/no/scope filter
- `~/ecodiaos/patterns/angelica-as-salesperson-not-board-prospect.md` - commercial framing
  of Angelica's role as Ecodia's sales function
- `~/ecodiaos/patterns/board-referral-coi-exclude-own-boards-clause.md` - referral CoI
  and exclusion clause applied to the in-flight v3 agreement
- `~/ecodiaos/patterns/ecodia-stays-off-boards-infrastructure-not-seats.md` - why Ecodia
  declines board seats in this orbit
- `~/ecodiaos/patterns/delivery-velocity-same-turn-not-24-48hr.md` - same-session delivery
  expectation for standing-arrangement work
- `~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md` - parent rule; standing
  arrangement is the only active carve-out
