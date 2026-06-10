# Chambers vs Wave CRM - Competitive Feature Audit

Date: 2026-05-27
Author: EcodiaOS
Context: SCYCC runs on Wave. Angelica (ex-SCYCC sustainability champion) has live Wave access and is doing a feature-by-feature walkthrough with Tate. This audit is the hypothesis structure her live walkthrough confirms and sharpens. Matt Barmentloo (SCYCC president) is deliberating Wave-vs-alternative right now.

---

## Part 1 - Product identity (HIGH confidence, both research arms agreed independently)

The "Wave" SCYCC uses is **Wave CRM by Wavesuite Pty Ltd** (`wavecrm.com.au`), an Eight Mile Plains / Mons, Queensland company. It is NOT Wave by Glue Up, NOT Wave by Naylor, NOT GrowthZone/ChamberMaster, NOT ChambersOnline.

- Founded 2018 by Nathan, Sandy and Wayne, who met through Brisbane Junior Chamber of Commerce.
- Purpose-built for AU chambers, industry associations, member orgs.
- Multi-tenant on per-org subdomains: SCYCC is at `sunshine-coast-young-chamber.wavecrm.com.au`.
- ~50 AU chamber clients including Sunshine Coast region: Caloundra, Kawana, Nambour, Cooroy, plus Brisbane Inner West, Greater Caboolture, Greater Shepparton, Logan, Kingscliff.
- AWS Sydney, Australian-sovereign data, Privacy Act bound.
- Single flat tier: ~A$278.25/month + GST (~A$3,339/yr), minimum term, unlimited members.
- Near-zero public review footprint (G2/Capterra/Trustpilot/Reddit all empty) because it is a tiny vendor.

**This is the single most important strategic fact: Wave is a 3-founder micro-vendor, not a funded incumbent.** Their roadmap velocity is thin, they carry key-person/continuity risk, and their own published roadmap admitted direct-debit and "enhanced Xero integration" were future items as recently as Q4 2023.

---

## Part 2 - Competitive position (the reframe)

We are not behind. We are ahead on the modern stack and behind on the financial back-office.

| Layer | Verdict |
|---|---|
| AI (newsletter compose, event recaps, welcome drips, member-match, officer-pulse) | **Chambers wins decisively.** Wave has nothing like it; their EDM is described category-wide as "dated and clunky". |
| Native mobile app + push | **Chambers wins structurally** - we have a Capacitor native app, Wave is web-only with no app and no push. Caveat: our push is configured but unwired (inert today). |
| Modern mobile-first UX, focus-group realtime chat | **Chambers wins.** Wave UI is dated; no group chat. |
| Multi-tenant theming | Tie (both do brand tokens; both subdomain-locked, neither does custom domains). |
| Member directory + filtering | Tie (Wave's is mature; ours exists). |
| Member dues lifecycle (invoicing, renewal, expiry, direct debit) | **Wave wins.** Ours is cosmetic (tiers are display-only, no per-member dues). This is the financial core of a chamber CRM and we do not have it. |
| Xero two-way sync + GST tax invoices | **Wave wins.** We have zero accounting integration and no GST handling. |
| Reporting / analytics | Tie-ish (both thin; Wave slightly ahead on email stats). |

Bottom line: a chamber cannot switch off Wave onto Chambers today, because Chambers cannot collect or track membership dues. Close that gap and we are strictly better.

---

## Part 3 - Wave strengths we must match (the AU layer)

These are exactly where the US incumbents (Glue Up, ChamberMaster) are weakest, and exactly what we must match to be a credible replacement:

1. **Australian data sovereignty** - AWS Sydney, Privacy Act bound. (We are on Supabase; confirm region.)
2. **Two-way Xero sync** - the bookkeeping integration AU treasurers actually want.
3. **Direct debit for recurring dues** - BECS direct debit, not just card.
4. **GST-correct tax invoices** - line-item, GST-inclusive.
5. **Flat predictable pricing** - no per-member creep.
6. **Member-vs-non-member event pricing + vouchers** - we have paid ticketing; add member/non-member tiers + vouchers.
7. **Founder credibility in the vertical** - we counter this through Angelica + Matt's eventual ownership of the idea.

---

## Part 4 - Wave weaknesses we exploit

From Wave's own roadmap admissions plus the heavily-reviewed incumbents AU chambers benchmark against:

1. **Locked front-end** - "ask the vendor's dev to change a date" pain. We give self-serve editing.
2. **Dated, clunky EDM composer** - the single most-cited weakness category-wide. We already have AI compose; extend to a modern branded builder.
3. **No native app / no push** - we have the app; wire push and the gap is decisive.
4. **No per-member AR / account-balance reporting** - named, repeated gap.
5. **No bulk merge / dedup** - "contact exists in multiple places".
6. **Locked Stripe (blocks automation)** - we expose our own automation layer.
7. **Slow UI / session timeouts** - "form went blank, log in again".
8. **Migration-fidelity failures** - botched imports burn day-one trust; we do done-for-you verified migration.
9. **No waitlists / recurring / virtual events / post-event surveys** - we add events depth (we already have AI post-event recap).
10. **Thin committee / working-group model** - we have committees + focus groups; deepen group-scoped comms.

---

## Part 5 - Tiered build roadmap

### Tier 1 - Back-office parity (build regardless of Angelica's audit; needed to replace Wave at all)
- **Member dues lifecycle**: per-member dues schema, invoicing, renewal automation, expiry + grace, payment status, dunning/failed-payment retries.
- **Direct debit / recurring dues**: Stripe BECS Direct Debit (AU) + card subscriptions.
- **Two-way Xero sync**: reconciliation-grade, line-item, GST-correct.
- **GST tax-invoice generation**.
- **Push notifications wired end-to-end**: client registration + token storage + real send path (turns our biggest structural advantage from inert to real).

### Tier 2 - Decisive wins (prioritise AFTER Angelica's audit reveals Matt's specific daily pain)
- Modern AI-assisted branded EDM builder (beat the "dated clunky" composer decisively).
- Per-member AR / account-balance / aged-receivables reporting + overdue automation.
- Real reporting/analytics dashboard (engagement, retention/churn, revenue).
- Bulk ops + dedup engine (bulk merge, edit, renew, tag).
- Events depth: waitlist, recurring, virtual, multi-tier tickets, QR check-in (use the native app for check-in - Wave literally cannot do this).

### Tier 3 - Reach extension
- Open API + Zapier/webhooks layer.
- Document/file library (member-gated storage + versioning).
- Custom fields / flexible member schema.
- Committee roster admin UI + group-scoped comms.
- Custom domains + per-tenant SEO.

---

## Part 6 - Strategic sequencing note (SUPERSEDED 2026-05-29)

The original 2026-05-27 plan assumed no competing builder. Tate received word from Angelica on 2026-05-29 that Dev Battra (adversarial party) is trying to pitch SCYCC an app of his own. Speed becomes a strategic moat: Chambers has more chamber-CRM experience than Dev, but only if that experience cashes into shipped features before Dev ships anything. Stealth is a luxury under competitive pressure.

Revised plan: all three tiers ship tonight 2026-05-29 via parallel worker dispatch across chambers-frontend. Angelica's audit becomes a sharpening pass on a finished product, not a gating step before build. Matt reintroduction by Angelica still routes via the Wave-gap framing - she points at MORE features when she does it. White House (Front 3) gate is still SCYCC-live-as-anchor; that is structural, not timing.

Dependency graph for tonight's dispatch: Tier 1 dues schema lands first so downstream tracks (Stripe BECS, Xero sync, AR reporting) can attach. Push-notifications track is fully independent and can run in parallel from minute zero. EDM builder, events depth, bulk ops, and all of Tier 3 also run independently of the dues schema. See [[feedback_chambers_wave_killer_all_tiers_tonight_2026-05-29]].

---

## Sources

Wave CRM (AU): wavecrm.com.au, sunshine-coast-young-chamber.wavecrm.com.au, biwcc.wavecrm.com.au, gsbn.wavecrm.com.au, cooroy.wavecrm.com.au, scyoungcommerce.org.
Benchmark incumbents: Capterra/SoftwareAdvice/Trustpilot reviews for Glue Up + ChamberMaster + GrowthZone; smartthoughts Glue Up review; MembershipWorks GrowthZone-alternative analysis.
Chambers repo: D:/.code/chambers-frontend (migrations 0001-0014, src/lib/feature-gates.tsx, src/lib/db/hooks.ts, supabase/functions/).
