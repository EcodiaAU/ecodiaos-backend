---
slug: climate-disclosure-productised-sow
date: 2026-06-10
register: doctrine
relates_to: drafts/climate-disclosure/03-autonomous-delivery-architecture-2026-06-10.md, drafts/climate-disclosure/01-alignment-and-feasibility-verdict-2026-06-10.md
status: v1, priced against verified comparables (AusTender contracts + Treasury PIA + vendor pricing pages)
---

# The productised Statement of Work: what a Group 2 entity buys

This is the repeatable unit. A second engagement runs the same shape as the first; only the entity name, facilities, method elections and fee tier change. Two channel variants share one delivery substrate: direct-to-entity, and white-label under a partner firm's letterhead.

## The one-sentence offer

For a CFO: Ecodia runs the evidence register, the emissions baseline and the clause-mapped draft statements underneath your AASB S2 report, continuously and for a fixed fee, so your directors sign with the evidence behind them and your auditor tests against a lineage instead of a shared drive.

For a partner firm: the same substrate under your letterhead, so your climate practice delivers assurance-ready engagements without building a data platform.

## Deliverables per engagement

1. Evidence register: every datum the disclosure rests on, hash-chained, timestamped, append-only, with a publicly verifiable anchor.
2. Scope 1 and 2 emissions baseline: every disclosed tonne recomputable from source documents, factor vintages and the per-facility method election (GHG Protocol default, NGER Determination methods where elected under AASB S2025-1).
3. Draft climate statements mapped clause by clause to AASB S2 (Sep 2024, as amended) plus the Corporations Act overlays (including the s 296D two-scenario minimum), every factual sentence citing register rows.
4. Gap analysis: each requirement the entity cannot yet evidence, named, with a remediation owner and date.
5. Continuous monitoring: monthly evidence cycle, drift and coverage flags, a maintained auditor-facing evidence pack, and an annual roll into each new reporting period.

## Scope boundary

Included: data ingestion (email, workbook, API where available), classification, register maintenance, calculation, drafting support, gap analysis, methodology memos, the assurance evidence pack, auditor information-request support that resolves to register pointers, and the monthly cycle.

Excluded, with the hand-off named: assurance and audit of any kind (the entity's registered company auditor); the directors' declaration and any advice on making it (the board); financial product advice, including anything touching ACCUs or other carbon units (an AFS licensee); tax agent services (the entity's registered tax agent); legal advice (the entity's lawyers); choosing scenarios, setting targets, and transition-plan commitments (management decides; we structure evidence and draft around their decisions). The exclusions are in the contract in these words. They protect the entity's assurance process as much as they protect Ecodia.

## Pricing

Direct engagement: AUD 65,000 fixed for the twelve-week setup (runbook R1 to R8), then AUD 5,500 per month monitoring retainer on a twelve-month term (R9, including the annual roll R10). Year-one total AUD 131,000; ongoing years AUD 66,000.

Partner-firm channel: AUD 25,000 setup platform fee plus AUD 3,000 per month per engagement, white-label; the firm owns the client relationship, the advisory layer and its own margin on top. The Scope 3 module wholesales at AUD 20,000 plus AUD 1,000 per month.

The multi-year ramp, priced honestly up front (the wf_a0b7562b-a49 completeness critic flagged that a flat retainer under-quotes the regime's own ramp): Scope 3 becomes mandatory in the entity's second reporting year and value-chain data collection is the largest single cost in the regime, so it is a named module, AUD 35,000 onboarding plus AUD 1,500 per month retainer uplift, activated in year two, never silently absorbed. Assurance scope also widens to all disclosures in years two and three and reaches reasonable assurance from year four (FYs commencing on or after 1 July 2029); the register absorbs that widening without a price step because the evidence was being captured all along, and the SoW says so, which is the argument for starting continuous.

Rationale, against verified comparables (sources in the Phase 1 verdict appendix):

- Treasury's Policy Impact Analysis models whole-of-regime compliance at AUD 1.0M to 1.3M per entity in transition years, 500K to 700K ongoing, with Group 2 below the midpoint. Our year-one 131K is a fraction of the modelled burden and is the only offer in the market whose delivery cost does not scale with hours.
- Big-4 ASRS readiness builds run 150K to 400K (practitioner-reported band; a real KPMG climate-risk advisory contract on AusTender sits at 240K), and practitioners report year-one disclosure models that were not repeatable without re-engaging the consultants. We are priced under the bottom of that band and repeatability is the product.
- Boutique consultant-led support runs 40K to 120K per year without a platform. Our retainer matches their floor while leaving a maintained register behind instead of a PDF.
- Mid-market carbon software runs 15K to 60K per year but the entity still does the work. We are priced above software because the work arrives done.
- The assurance fee itself (real contracts: 65K to 169K first cycle) stays with the entity's auditor and is out of our scope; our pack is designed to compress the auditor's testing hours, which is the entity's second saving.

Unit economics, with the real costs counted: delivery labour is cron compute and dispatched worker turns on subscription budget (marginal cost near zero at steady state); the dedicated Supabase project and storage run under AUD 100 per month per engagement at v1 scale; engagement-one calibration consumes conductor attention that amortises away by engagement three; professional indemnity insurance for a disclosure-preparation service is a real pre-revenue cost line (quote before first signature; Tate decision; per the 2026-06-10 market sweep in `pi-insurance-quotes-2026-06-10.md`: low thousands only at $1M to $2M limits, $8k to $25k at $5M and $15k to $40k+ at $10M with affirmative AI cover, AI exclusion the default outcome to resist in placement); one-time legal review of the SoW template is gated behind the first serious prospect, the same per-template-once pattern the Cofound UPL research validated. At three direct engagements the line clears 90 percent gross margin; nothing in delivery requires hiring.

## Timeline (mirrors the runbook in 03)

Week 0 bootstrap and ingest channel live; week 1 boundary and method-election memo signed back; weeks 1 to 4 evidence onboarding to 95 percent expected-document coverage; weeks 4 to 6 baseline calculation; weeks 6 to 9 clause-mapped first draft; week 9 gap analysis and remediation list; weeks 10 to 11 evidence pack and auditor walkthrough; week 12 board memo and cutover to the monthly cycle.

## Qualification gate (who this SoW fits)

Group 2 entity (two of: consolidated revenue at or above AUD 200M, gross assets at or above AUD 500M, 250 or more employees; or an asset owner at or above AUD 5B; or an NGER reporter entering at Group 2), with a 30 June or 31 December balance date, Australian operations, and a finance lead who owns the obligation. NGER reporters below the publication threshold are the best-fit first clients: their activity data discipline already exists and Treasury discounts their compliance cost 30 percent for exactly that reason.

## Contract notes

Fixed scope, fixed fee, no hourly rates anywhere in the document. Terminology perimeter (a legal control, in the contract and in every deliverable template): Ecodia deliverables are never styled as assurance, audit, review, verification, certification, or any pre-assurance or readiness "review"; the permitted nouns are evidence register, baseline, draft, gap analysis, evidence pack and methodology memo. ASSA 5000 covers voluntary assurance engagements too, so this language discipline is what keeps our work outside it; the banned-terms list and the no-reliance clause go to the one-time template legal review before first use. Standing-communication scope: the engagement authorises Ecodia to correspond directly with the entity's nominated contacts and auditor for evidence chasing, monthly notes and information requests (the per-message Tate gate is replaced by the contract's standing scope, per the Angelica precedent generalised). Termination: either party, 60 days, register and pack export delivered in full on exit; the evidence is the entity's, always. Tate signs; that signature is one of the five autonomy exceptions and the only human act in the sale once the prospect qualifies.

## Red-team amendments (2026-06-10, wf_017d6d7e-830; these supersede conflicting pricing above)

1. Partner pricing restructured to firm economics. The per-engagement royalty (25k + 3k/mo) is replaced by a flat annual platform licence at AUD 40-60k with unlimited engagements, plus a per-engagement onboarding fee the firm marks up. The pitch line changes too: we remove the firm's unbillable data plumbing so its billable advisory layer scales to more Group 2 clients per partner; we never pitch deleting their hours, because APES GN 30 supervision means their review layer is un-removable and our materials state an honest reviewer-hours estimate per engagement.
2. The pilot product. Evidence-capture bootstrap, AUD 15-25k fixed fee, single facility or whole entity at reduced scope: register live on 1 July 2026 data, baseline at year end, conversion credit toward the full SoW. Built to fit under delegated signature authority.
3. PI insurance is a precondition, never a line item guess. The 'expected low thousands' estimate is struck. A broker quote for AI-delivered disclosure-preparation cover at $5M and $10M limits, with the autonomous delivery model disclosed honestly, must be in hand before any further first-contact outreach, and the real premium feeds this document's unit economics. The 2025-26 market is adding AI exclusions to E&O lines; if cover requires a named human professional reviewer in the loop, that reshapes the offer and must be known now.
4. Named human principal and independent reviewer. Tate Donohoe is the accountable engagement principal in every contract and signature block. A named CA or CPA engaged as independent reviewer converts the board-defensibility objection into a one-line answer at fractional cost; the reviewer arrangement is priced into year-one economics.
5. Client-owned infrastructure as the continuity answer. The engagement's Supabase project can be provisioned in the entity's own org, owned by them, operated by Ecodia under scoped credentials, with monthly register exports escrowed. Vendor-continuity due diligence is answered by ownership, never by promises.
6. Disclosed platform, never silent white-label. APES 305 requires firms to disclose outsourced service providers; the SoW pack ships the subprocessor disclosure, a security one-pager and a data-flow diagram the firm hands its client. Client and auditor correspondence flows through firm-controlled addresses by default, Ecodia drafting behind the scenes.
7. Data-handling annex (binding before first prospect): storage locations (dedicated Sydney-region project), the full subprocessor register including which LLM sees what data with a no-training statement, retention and exit terms, breach-notification commitments, and the Essential Eight self-assessment.
