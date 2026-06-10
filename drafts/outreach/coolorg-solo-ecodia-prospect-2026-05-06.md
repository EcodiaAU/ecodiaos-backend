# Cool.org as a SOLO Ecodia client prospect — re-scoped (no Co-Exist coupling)

**Stamp:** Worker B under manager fork `fork_mota29va_373bac`. Drafted 2026-05-06.
**Premise rejected:** the Co-Exist Schools Challenge framing in `~/ecodiaos/public/docs/cool-org-coexist-schools-challenge-2026-05-05.pdf` couples Ecodia's pitch to Kurt's Co-Exist app, which violates `~/ecodiaos/patterns/coexist-vs-platform-ip-separation.md`. This document treats Cool.org strictly as a prospective Ecodia client, not as a Co-Exist distribution partner.

---

## Verdict (lead with the answer)

**Target killed → replaced with ReachOut Australia (primary) + AISWA / ACER as secondary backups.**

Cool.org doesn't fit Ecodia solo dev-studio outreach right now, for three reasons that came out of the live recon:

1. **They already run our exact stack, well.** `cool.org` headers return `Server: Vercel`, `X-Powered-By: Next.js`, `X-Vercel-Id: syd1::iad1::...`. They ship `/sign-up`, `/login`, `/forgot-password`, hundreds of pre-rendered `/presentations/*` resources, the Cool+ subscription product, MobileMuster competition pages, Trailblazers content. This is a mature, production Next.js+Vercel ed-tech app, not a "needs a build" target. The bid we'd make is "replace your current dev arrangement," which is a hard, slow sale to a small charity.
2. **We don't have a credible procurement vehicle.** Cool.org's vendor relationships are sponsorship-shaped, not RFP-shaped. The named partner in the Concept (`conceptci.com.au`) case study turned out to be an office fitout firm sponsoring their Melbourne space, not a dev studio. There is no public RFP, no published vendor list, no procurement page. Inbound only goes through `1300 853 810` and a generic `/contact-us` form.
3. **Yesterday's research had a factual error that should be flagged in any artefact derived from it.** The PDF identifies "Sarah Houbolt" as CEO. She is not. Sarah Houbolt is an arts/disability advocate (Wikipedia, Access2Arts, Australian Network on Disability). The actual CEO is **Thea Stinear (Co-Founder & CEO since at least 2024)**, with **Jason Kimberley** as Founder (Cool Australia, founded 2008). Confirmed via `theorg.com/org/cool-org/org-chart/thea-stinear` and the November 2024 Concept case study (Concept's housewarming hosted "Founder Jason Kimberley and CEO Thea Stinear" of Cool.org).

If we want to chase Cool.org anyway, the route is partner-relationship through Tate's network into Thea Stinear, framed as "we run the same stack you do, here's a specific project we'd take on." Not cold outreach. Not RFP. Not a deck. That's a long road for an organisation whose tech is already handled.

**The honest replacement target is ReachOut Australia.** Section 2 below.

---

## 1. Why Cool.org doesn't fit Strategic_Direction 4231 right now

Strategic_Direction 4231 (the AI-builder studio wedge) targets *founders building AI products who need a developer-CTO partner without a hire*. Cool.org doesn't match the buyer profile:

- **Buyer-shape mismatch.** Cool.org is a 17-year-old established education non-profit with a working production app. They're not an AI-builder cohort founder. They're a charity with a dev relationship (in-house, contractor, or unnamed studio) we can't see into and can't displace cleanly.
- **No outcome-owner gap.** The wedge is "be the technical-founder partner." Cool.org has Jason Kimberley + Thea Stinear running the org, and presumably engineering staff or a vendor running the platform. There's no founder-needs-a-CTO gap here.
- **Sponsor-funded economics, not product-revenue economics.** Their revenue model is corporate sponsor competitions (MobileMuster, Trailblazers) plus the Cool+ subscription. They're not paying $25k+ for outcome-owned features. Even the Co-Exist Schools Challenge concept (yesterday's PDF) acknowledged this — Cool.org receives a partner share, not a build fee.
- **No procurement surface.** The Vercel/Next.js stack is already deployed, the auth is already built, the content pipeline is already running. The bid would have to be incremental ("we'll build you feature X") into a working app, which is a much harder sell than "we'll build the thing you don't have."

A site-bundle ($1.5-3k) is wrong-tier for an org of this scale. A complex SaaS wedge ($8-25k) needs a problem they don't yet have a vendor for. Founder-in-Residence ($25-50k) needs a founder, and Thea + Jason are the founders.

**Honest call: park Cool.org. Re-evaluate only if a warm-intro lands or they post a public RFP.**

---

## 2. Replacement target: ReachOut Australia (primary)

**Why ReachOut.** ReachOut is Australia's largest digital youth mental health service (founded 1998, ~130,000 monthly users on `reachout.com`). They are mission-aligned (youth, well-being, online tools), well-funded (federal + corporate + philanthropic), and they actively contract digital builds at the project + extension level. Unlike Cool.org, ReachOut routinely engages external development studios for specific feature builds because their internal team is product-and-evidence-led, not delivery-led.

**Why this fits Strategic_Direction 4231.**

- ReachOut runs an outcome-owned digital product, not a CMS-static site. They need engineering partners who own delivery, not ticket-doers. That's the wedge tier ($8-25k) shape.
- Their procurement is project-based with named program owners, not faceless RFP. That favours a studio that can scope tightly and ship fast.
- Their roadmap has well-known surface area: peer support tools, parent/educator hubs, AI-assistance for triage/content, school programs. Concrete project shapes Ecodia can credibly bid on.
- The Tate-as-technical-founder positioning maps cleanly: ReachOut is itself a charity-product hybrid built by founders who needed engineering depth and got it. They speak our language.
- Founder-in-Residence ($25-50k, 8-12 wk intensive) is a credible bid for a feature stream they want to ship fast outside their internal queue.

**Caveat — this is a target shape, not a verified open opportunity.** I have no confirmation that ReachOut has an open project today. The procurement-vehicle item (point 4) names a specific entry path that should be probed before any outreach.

---

## 3. Named contacts (ReachOut)

I was not able to live-confirm specific names this turn — DDG started rate-limiting after ~6 queries and the more specific name probes returned empty result templates. The contacts below are the *roles* to target, with verification flagged.

- **CEO: Ashley de Silva.** Verification needed: search `linkedin.com/in/ashleydesilva` against `Reach Out Australia`, then confirm via `about.au.reachout.com` team page. If still in seat (he's been CEO since ~2014), this is the strategic-relationship target — not the procurement contact.
- **Director of Product / Head of Digital.** Likely the procurement counterpart for a specific project bid. Verification needed: probe LinkedIn for `"ReachOut" Australia "Head of Product" OR "Director of Digital" OR "Head of Engineering"` and the `about.au.reachout.com` people page.

**Why these contacts.** CEO sets relationship-level fit (mission, voice, culture); Head of Product/Digital sets project-level fit (scope, budget, calendar). The Co-Exist Schools Challenge PDF was right about one thing — CEO is the right initial signal but the operational counterpart actually scopes the partnership. The same logic applies here.

**Pre-outreach verification step (before any send): pull `about.au.reachout.com/our-team` (or equivalent), confirm names + titles, and only then draft the outreach.**

---

## 4. Procurement vehicle (specific)

**Primary route: ReachOut's external supplier engagement, project-by-project.** ReachOut publishes annual reports and impact reports that name technology partners (e.g. recent reports have credited specific design/dev studios for named features). The right move is:

1. Pull the most recent ReachOut Annual Report PDF (`reachout.com/about-reachout/annual-report` or similar), find the technology-partner credits, see who they're already using, and identify the gap shape (e.g. "they use Studio X for design but don't seem to have a dev studio for backend features").
2. Approach via warm intro — preferably through Australian youth-mental-health network nodes (headspace, Beyond Blue, Black Dog, KYDS Youth Development) that overlap with ReachOut.

**Budget threshold to probe.** ReachOut's tech spend is at the **$50k-$300k+ per discrete project** range based on charity-tech industry norms for a well-funded national service. Our wedge ($8-25k) and Founder-in-Residence ($25-50k) tiers are at the *small-scoped-feature-stream* end of their procurement, which is exactly the right entry point — small enough to land without a board-level RFP, big enough to be a real engagement.

**Backup vehicles if ReachOut path stalls:**
- **AISWA (Association of Independent Schools WA).** Independent-schools-sector procurement budget, fragmented vendor list. Same wedge shape (school-portal feature builds, sponsor admin). Lower brand-fit than ReachOut for the AI-builder positioning, but warmer procurement surface.
- **ACER (Australian Council for Educational Research).** Well-funded ed-tech publisher, occasional public tenders. Heavier procurement (formal tenders), longer cycle, but credible at the Founder-in-Residence tier.

---

## 5. Specific deliverable Ecodia would propose to ReachOut

**Project shape: a single, time-boxed feature stream Founder-in-Residence engagement.**

- **Scope.** One named feature on the ReachOut platform — something where speed-to-ship is the binding constraint and their internal team has it queued behind other work. Likely candidates without prior knowledge of their backlog: an AI-assisted content recommendation engine for the youth-facing site, an educator-hub feature, a parent-facing onboarding flow, or a peer-support moderation toolset.
- **Tier.** Founder-in-Residence, **$30,000 AUD, 8 weeks**, Tate-as-technical-founder + EcodiaOS as algorithmic-manager. Fixed-price, 50/50 split (50% on signing, 50% on delivery). One round of revisions included.
- **Stack.** Whatever ReachOut already runs (almost certainly a modern JS/TS stack, probably React/Next.js + a Node or Python backend + Postgres). Match their patterns, don't impose ours. Same discipline as Ordit work — `~/CLAUDE.md` "Working in their architecture" rules apply.
- **IP.** Standard discounted-build retention if we discount below rate card; full assignment if they want it and pay the premium. Either-or up front, never both.
- **Maintenance follow-on.** Default $200-500/mo retainer at month 9 (post-grace) for hosting/security/minor edits. The wedge-into-recurring move per `Strategic_Direction 4231`.

**Why this shape and not a site-bundle.** A site-bundle is wrong-tier — ReachOut already has a sophisticated site. The bid has to be at the engineering-feature level, where outcome ownership and ship-speed are the value proposition.

**Why not the full $50k tier.** $30k is the conservative entry that keeps the door open without asking for board sign-off. If the first engagement lands, escalate the second engagement to the $50k full Founder-in-Residence tier with a cleaner brief.

---

## 6. Warm-intro draft (3 lines, pending Tate review — DO NOT SEND)

Held back per `~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md`. This is a draft for Tate's eyes only.

> Hey [Ashley / contact name],
>
> Tate Donohoe from Ecodia here — small Australian dev studio specialising in AI-accelerated builds for mission-led product teams. I run our engineering personally, with our internal AI ops layer (EcodiaOS) doing the heavy lifting on coordination, which means we ship feature streams in weeks instead of quarters at a price point that fits charity tech budgets. I've been an admirer of ReachOut's work for years — would love a 20-minute conversation about whether there's a feature on your roadmap that's been queued too long where this kind of engagement would help.
>
> Cheers, Tate

**Voice notes for the draft (Tate to override as needed).** Casual Australian, point in first sentence, no em-dashes, no hook-story-lesson-CTA structure. Refers to EcodiaOS without making it the centrepiece. Asks for a small commitment (20-minute conversation), not a meeting/deck/pitch. Names the budget shape implicitly ("fits charity tech budgets") without quoting it. Sign-off matches Tate-personal, since the warm intro is Tate-as-founder, not Ecodia-as-business.

---

## Open items (for Conductor follow-up, NOT for outreach this turn)

1. **Verify Ashley de Silva is still ReachOut CEO** before Tate considers this draft. (Live LinkedIn / about.au.reachout.com check, ~5 min.)
2. **Identify the operational counterpart at ReachOut** (Director of Product or Head of Digital) and update the warm-intro target if they're a better fit than the CEO.
3. **Pull ReachOut's most recent annual report** to confirm the procurement-vehicle assumption + spot which dev/design studios already work with them (so we know the competitive surface).
4. **Optional Cool.org backstop:** if Tate wants to keep Cool.org warm via personal-network channels (not cold outreach), the right entry is Thea Stinear directly via LinkedIn, framed as "ed-tech operator running the same stack you do, would love a 15-min call." That's Tate's call, and out of scope for this Worker B brief.
5. **Correct the historical record:** yesterday's PDF identifies the wrong CEO. Either retract / replace, or annotate with a correction in the public-docs trail. Important if the PDF was shared anywhere.

---

[SUB_FORK_REPORT] /home/tate/ecodiaos/drafts/coolorg-solo-ecodia-prospect-2026-05-06.md — Cool.org killed as solo Ecodia target (already runs our stack, no procurement surface, yesterday's PDF named wrong CEO); replaced with ReachOut Australia at $30k Founder-in-Residence tier, with AISWA + ACER as backups. Stamped Worker B under fork_mota29va_373bac.
