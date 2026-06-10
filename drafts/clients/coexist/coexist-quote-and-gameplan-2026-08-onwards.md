# Co-Exist - Post-August 2026 Quote and Game Plan

**Status:** internal working draft for Tate. Not yet client-facing.
**Author window:** 2026-05-18 (revised after Tate budget-reality pass).
**Tate window to send:** 7-15 July 2026 (anchored on final-current-retainer invoice send date 7 Jul).
**Verbal lock-in:** Tate + Kurt at Kurt's place night of 2026-05-17.
**Current arc ends:** 7 Aug 2026 (final invoice INV-2026-005 sent 7 Jul covers through 7 Aug).

---

## 0. Reality check

The full platform consolidation scope (website + portals + impact system) is roughly **$47,000 ex GST** of work. That's the honest cost - we don't discount what we're worth, and the existing arrangement already gives Co-Exist a 50% rate-card discount.

Co-Exist's operating budget can't carry $47k in one engagement and shouldn't try. It's grant-scale, not ops-scale.

The path forward is two-tiered:

- **Tier A - Foundation work.** ~$12k ex GST, fundable from Co-Exist's operating budget. Stops the bleeding on the worst operational pain (Excel sync mess) and removes the Squarespace cost. Deliverable Aug-Sep 2026.
- **Tier B - Full platform consolidation.** $47k ex GST, grant-funded. Adds the leadership and attendee portals plus the full impact tracking ops surface. Triggered when grant funding lands.

Plus the operational retainer continues unchanged.

This frame is honest about cost, respects Co-Exist's budget, and gives Kurt's team a concrete grant-application target.

---

## 1. The story we tell Kurt

Co-Exist's first year on the app proved the model. The next year is consolidation: one codebase, one impact substrate, and the leadership + attendee surfaces that turn a tool into an operating system for a national movement.

Three reasons to act now:

1. **The fragmentation is starting to cost.** Squarespace site, app, Excel master sheet, Supabase, Microsoft Forms - four substrates, three sync layers, weekly drift incidents. Every grant report and board update spends hours reconciling instead of telling the story.
2. **Co-Exist's growth needs portals, not pages.** Collective leaders need real tooling. Attendees need a relationship that doesn't end at the event.
3. **The impact story is the fundraising story.** A purpose-built impact tracking system replaces the Excel-pretending-to-be-a-database with something Kurt can show to grant funders, board, and investors.

How we sequence it given the budget reality:

- Sign Tier A now, deliver Aug-Sep 2026. Stops bleeding immediately.
- In parallel, Co-Exist applies for tech-empowerment grants (we help with technical scoping and supporting docs). Realistic grant window: Q4 2026 - Q2 2027.
- When grant lands, Tier B kicks in.

---

## 2. Tier A - Foundation work ($12,000 ex GST)

Operating-budget achievable. Solves the two most urgent and expensive problems. Smaller scope, not a Tier B discount.

### A.1 Impact substrate cleanup

Kills the Excel-DB-Forms tri-sync. Replaces it with a single canonical impact substrate in Supabase that all existing read paths (the 4 stats pages, admin impact page) point to.

**Included:**
- Canonical impact schema in Supabase (Event → Observation → Outcome chain).
- Baseline data promoted from `app_settings` keys into a first-class `impact_baselines` table.
- Microsoft Forms ingestion becomes one-way (Forms → canonical), not a sheet round-trip.
- Excel sync retired. Sheet stays as Kurt-readable read-only export, regenerated nightly from canonical data, never written back to.
- All existing stats pages keep working (they already aggregate through `src/lib/impact-query.ts`).
- Data migration with zero loss. Drift-detection cron stays as safety net for 30 days, then retired.

**Not included** (these wait for Tier B):
- Ops dashboard / drill-down / map view / partner views / export templates.
- Photo evidence per observation.
- Native attendee survey replacing Microsoft Forms.

**Effort:** ~60-80 hours.

### A.2 Website out of Squarespace

Lifts coexistaus.org into the existing React/Capacitor codebase. Eliminates the monthly Squarespace cost.

**Included:**
- Migrate existing Squarespace pages into the codebase (existing `src/pages/public/` pattern extended).
- Content in MDX files in repo OR simple Supabase content rows. Kurt's team edits by raising a request, we ship the change. No fancy editor.
- Domain routing decision locked (root + `/app` vs `app.` subdomain).
- SEO parity: meta tags, OG cards, sitemap, robots.txt, 301 redirects from every existing URL.
- Newsletter signup and contact form wired to Resend + Supabase (replaces Squarespace forms).
- Squarespace switched off, monthly bill stops.

**Not included** (these wait for Tier B):
- Self-service CMS so Kurt's team can edit copy directly.
- Marketing automation.
- New brand identity.

**Effort:** ~30-40 hours.

### Tier A total

| Component | Hours | Fixed price ex GST |
|-----------|-------|---------------------|
| Impact substrate cleanup | 60-80 | $7,500 |
| Website out of Squarespace | 30-40 | $4,500 |
| **Total** | **90-120** | **$12,000** |

**Payment:** 50% on kickoff ($6,000), 50% on delivery ($6,000). One round of revisions included per component.

**Timeline:** 6-8 weeks. Kickoff early Aug 2026, delivery end Sep 2026.

**Payback for Co-Exist:**
- Squarespace business plan saved (~$3.6k/year recurring).
- Staff time recovered from sync drift incidents (estimated 2-4 hours/week of admin time at admin rates).
- Impact data finally trustable for grant reports - directly compounds Tier B grant applications.

---

## 3. Tier B - Full platform consolidation ($47,000 ex GST, grant-funded)

This is the proper version, on the table whenever grant funding lands. Tier A's work counts as foundation - Tier B builds on top of it.

| # | Project | Outcome | Fixed price ex GST |
|---|---------|---------|---------------------|
| B.1 | Website CMS layer + marketing tooling | Self-service CMS so Kurt's team edits without us. Marketing automation, blog, newsletter campaigns. | $4,500 |
| B.2 | Leadership portal upgrade | Full collective ops surface: member roster, event lifecycle, comms, reporting, training, resources library. | $9,000 |
| B.3 | Attendee portal | New authenticated portal: RSVP, check-in (authed), agenda, feedback, my-impact, collective directory, history. | $9,000 |
| B.4 | Impact tracking ops surface | Ops dashboard, drill-down (national → region → collective → event → observation), map view, exports (PDF/CSV), stakeholder views (CEO/national/leader/partner), grant-report templates, photo evidence per observation, audit log. | $14,500 |
| B.5 | Native survey replacing MS Forms | Attendee-side surveys captured directly in app, feeding canonical impact substrate. | $2,500 |
| | **Tier B subtotal** | | **$39,500** |
| | Project management, integration, training | Cross-cutting across B.1-B.5 | $7,500 |
| | **Tier B total** | | **$47,000** |

**Payment:** 50% on kickoff, 50% on delivery, per project. Or single-grant lump-sum on kickoff if the grant requires it.

**Timeline once funded:** 4 months. Project A.x done, so B builds directly on canonical substrate.

**Note:** if Co-Exist secures grant funding straight away and skips Tier A, the full $47k absorbs Tier A's scope and stays the same price. Tier A is structured so it's not throwaway work.

---

## 4. Tier B funding is Co-Exist's work

Tier B is grant-tractable for an ACNC charity with Co-Exist's profile, but securing funding is Co-Exist's responsibility, not Ecodia's. When Co-Exist secures Tier B funding, the engagement kicks in. Until then, Tier A is the engagement.

**Ecodia provides** as part of Tier A delivery, no extra cost: a partnership confirmation letter naming Ecodia as Co-Exist's technical delivery partner, plus the technical scoping doc produced as a Tier A deliverable (usable as supporting evidence if Kurt wants to attach it to an application).

**Out of scope** (separate engagement at standard rate if Kurt asks for any of it): grant scouting, grant application writing, custom architecture diagrams for individual applications, funder communications, ongoing grant strategy advice.

Co-Exist's existing funder relationships (Wedgetail, VFFF, others) and grant-application function are theirs to run. We don't impose on those relationships and we don't drive that process.

---

## 5. Ongoing operational retainer (continues post-7 Aug 2026)

Unchanged regardless of Tier A / Tier B decisions. This is the steady-state arrangement Kurt verbally locked in 2026-05-17.

| Line | Amount ex GST | Notes |
|------|----------------|-------|
| Operational retainer | $1,000 / mo | Maintenance, minor fixes, platform stewardship |
| Licence fee | $200 / mo | Perpetual until contract termination |
| Managed 3rd party costs | ~$82 / mo | Vercel + Supabase + M365 share, variable |
| MS365 tech support | $1,000 / mo | Reinstated per verbal lock-in 2026-05-17 |
| Tech-support hours (variable) | $60 / hr | Rolls into next invoice |

**Monthly baseline:** ~$2,282 ex GST + $228 GST = **~$2,510 incl GST**, plus support hours.

Cadence stays 7th-to-7th. Final current-arc invoice sent 7 Jul 2026 covers through 7 Aug; renewal invoice INV-2026-006 sent 7 Aug 2026 covers through 7 Sep.

**Annual recurring (excluding hours):** ~$27,400 ex GST. The retainer is by far the biggest line over a year - the bulk projects sit on top, not instead of.

---

## 6. Recommended path

1. **Now (Jul 2026 conversation):** Tate proposes Tier A + retainer renewal to Kurt as the locked-in engagement. Frames the grant strategy as the path to Tier B. Kurt signs the addendum.
2. **Aug-Sep 2026:** Tier A delivered. Substrate clean. Squarespace dead. Existing impact data trustworthy.
3. **Aug 2026 onwards in parallel:** Co-Exist team running grant applications. We supply technical supporting docs.
4. **Q1-Q2 2027:** Grant lands (most likely outcome with 4-6 applications). Tier B kicks in.
5. **Throughout:** retainer continues. Tech-support hours billed as accrued.

---

## 7. Assumptions and exclusions (carry into contract)

**Assumed in scope:**
- Existing Capacitor / React / TypeScript / Supabase / Vercel stack continues.
- One round of revisions per Tier A component (matches current arrangement).
- Existing brand and design system carries forward.
- App store fees, Apple Developer fees, Google Play fees, Squarespace cancellation are Co-Exist's responsibility.

**Out of scope unless added:**
- New brand identity / logo / colour work.
- Native rewrite (we stay Capacitor).
- New mobile platforms.
- Hardware integrations.
- Carbon credit certification flow (separate Ecodia line).
- Third-party API exposure to non-Co-Exist consumers.
- Grant application writing (technical supporting docs included; the writing is Co-Exist's job).

**Acceptance criteria:**
- Tier A.1: Excel sync retired, all 4 stats pages working from canonical substrate, baseline data accessible, drift-detection in safety-net mode.
- Tier A.2: coexistaus.org served from unified codebase, Squarespace switched off, all old URLs 301'd, contact + newsletter forms working.

---

## 8. Risk register (internal - don't show Kurt unless asked)

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Tier A delivery uncovers dirty historical data | High (almost certain) | First week is data audit. The 11 May 2026 dedup work plus existing baseline keys make the surface area known. Cost stays inside the fixed price. |
| Grant applications don't land first cycle | Medium-High | Apply to 4-6 in parallel, expect 1-2 to convert. Retry rejected grants with refined positioning. Tier A delivers regardless. |
| Microsoft Forms is more load-bearing than we think | Medium | Survey actual Forms usage with Kurt before Tier A kickoff. If critical, Forms stays as ingestion-only (already in Tier A scope). |
| Kurt's team can't supply migration content for site | Medium | Migrate placeholder copy and refine. Doesn't block delivery. |
| Squarespace has hidden redirects we lose | Medium | Crawl current site at Tier A kickoff, capture every URL, migrate as 301s. |
| Tier B grant funding lands DURING Tier A delivery | Low | Welcome problem - extend engagement, fold Tier A scope into the larger project, refund nothing because Tier A work is the substrate Tier B needs. |
| Kurt asks for Tier B portal work to be included in Tier A scope | High | Hold the line. Tier A is foundation, not portals. Anything beyond §2 is Tier B work and costs Tier B money. |

---

## 9. Strategic notes (internal)

- **Don't discount Tier A.** $12k is already the right number for the work. If Kurt pushes back, the conversation is about grants, not price.
- **The Excel sync replacement is the operationally critical piece.** That's our anchor. Squarespace removal is the bonus we throw in because it pays for itself fast.
- **The retainer is the biggest line over a year (~$27k/yr).** Don't lose sight of that - it dwarfs the project work. Protect it.
- **Grants are leverage for Co-Exist's professionalisation.** Kurt's charity SHOULD have a grant-application function. Pushing him to build it serves Co-Exist's long-term capacity, not just our pipeline.
- **The technical supporting docs we provide for grants are reusable internal IP.** Same architecture diagram, same problem-statement framing, gets used for our next peak-body / conservation client. Per the [coexist-vs-platform-ip-separation](../patterns/coexist-vs-platform-ip-separation.md) doctrine, Co-Exist is the lighthouse; the patterns underneath are ours.
- **MS365 tech support at $1k/mo is sticky revenue.** Reinstating it post-Aug is operationally neutral and worth $12k/yr on its own.
- **Africa-travel readiness:** Tier A is largely autonomous-shippable. Project management overhead is low. Tier B (whenever it lands) wants Tate-attention windows.
- **Contract substrate:** existing software agreement (signed by Tate, awaiting Kurt countersign) needs an addendum for Tier A + retainer renewal. Don't rewrite from scratch - add Schedule B with Tier A scope and the post-Aug retainer table. Tier B becomes a separate addendum when funded.

---

## 10. Next actions

1. Tate reviews this doc, edits numbers and framing.
2. Around 7-15 Jul 2026, Tate has the conversation with Kurt. Tier A + retainer = signed engagement. Tier B + grant strategy = shared homework.
3. EcodiaOS opens 2 status_board rows (Tier A delivery + grant strategy follow-up), Neo4j Decision for the locked scope, updates [clients/coexist.md](../clients/coexist.md) renewal-arc section with the agreed numbers.
4. Kickoff brief for Tier A drafted late July, ready to dispatch first week of August.
5. Technical-supporting-docs package for grants drafted in parallel with Tier A delivery, ready by end Sep 2026 for Co-Exist's grant applications.

---

## 11. One-page version (for the actual document Kurt sees)

Stripped of internal strategy. This is what goes to Kurt when Tate is ready to send.

```
Ecodia x Co-Exist - Next Phase Engagement

After a year on the app, we've mapped what comes next. There are two
ways to do it, depending on how Co-Exist funds it.

THE PROBLEM TO SOLVE FIRST (Tier A - operating budget)

The Excel-Supabase-Microsoft Forms sync is causing real ongoing pain
and the Squarespace site is now the only thing not running on your
existing stack. Two things, $12,000 ex GST total:

  A.1  Impact substrate cleanup           $7,500
       Kills the Excel/DB/Forms tri-sync. One canonical impact
       record. All existing reporting keeps working. The sheet
       becomes a downstream read-only export, not a source of truth.

  A.2  Website out of Squarespace         $4,500
       Lifts coexistaus.org into the same codebase as the app.
       Squarespace cancelled. Same brand, same content, same URLs,
       no monthly bill.

  Total                                   $12,000 ex GST
                                          $13,200 incl GST
  Payment: 50% on kickoff, 50% on delivery.
  Timeline: 6-8 weeks. Delivered Aug-Sep 2026.

THE BIGGER VISION (Tier B - grant funded)

Leadership portal upgrade. New attendee portal. Full impact tracking
ops dashboard with drill-down, maps, exports, partner views. Total
~$47,000 ex GST.

This is grant-scale work, and Co-Exist is well-positioned to fund it
through tech-empowerment grants (Atlassian Foundation, Microsoft Tech
for Social Impact, Westpac, Infoxchange, environment-sector grants,
philanthropic foundations). We supply the technical scoping and
supporting documents you need for applications. You drive the
application process.

Realistic window: Tier B kicks in Q1-Q2 2027 once a grant lands.

ONGOING OPERATIONAL RETAINER (continues from Aug 2026)

  Operational retainer       $1,000 / month
  Licence fee                  $200 / month
  3rd party passthrough        ~$82 / month
  MS365 tech support         $1,000 / month
  Tech-support hours           $60 / hour as used

Invoiced 7th of month, 7-to-7 cadence.

All numbers ex GST. One round of revisions per Tier A component.
Stack and brand continue as today.
```

---

*Cross-refs: [clients/coexist.md](../clients/coexist.md) Renewal Arc section, [project_coexist_retainer_renewal_2026-07-07](../../../../Users/tjdTa/.claude/projects/d---code-ecodiaos-backend/memory/project_coexist_retainer_renewal_2026-07-07.md), [project_coexist_billing_model_2026-05-18](../../../../Users/tjdTa/.claude/projects/d---code-ecodiaos-backend/memory/project_coexist_billing_model_2026-05-18.md), [coexist-vs-platform-ip-separation](../patterns/coexist-vs-platform-ip-separation.md).*
