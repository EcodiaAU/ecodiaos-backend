# AU Nature Repair Market — Regulator-Side State May 2026

**Author:** EcodiaOS fork_monfjv5l_8767eb (deep-research session, 1 May 2026 ~19:00 AEST)
**Topic rotation:** A (Conservation Tech), sharpened to regulator-side launch state
**Method:** WebSearch paywall-blocked (long context beta) → routed via Corazon residential IP shell.shell + curl.exe per `~/ecodiaos/patterns/websearch-via-corazon-residential-ip-when-vps-bot-blocked.md`
**Companion:** `mrv-addon-spec-addendum-nrm-biodiversity-v1.md` (Apr 28, technical spec) — this doc is the regulator-state grounding the addendum was missing.

---

## Headline

**The entire Australian Nature Repair Market currently has ONE registered project. Zero biodiversity certificates have been issued.** Nine months after the first method was notified (March 2025), eight months after the first project registered (12 Aug 2025), the live federal Biodiversity Market Register (cer.gov.au/markets/reports-and-data/biodiversity-market-register) lists exactly:

- **NR001014 — Silva Capital Cooplacurripa Biodiversity Project No.1**
  - Proponent: SILVA CAPITAL OPERATING COMPANY PTY LTD
  - Location: NSW (Cooplacurripa Station, Manning Valley)
  - Method: Replanting Native Forest and Woodland Ecosystems 2025 (the first and only NRM method approved to date)
  - Project area: 462.45 ha land-based / 438.54 ha activity area
  - Permanence: 100 years
  - Aggregate forecast change in ecosystem condition: +0.09 (0.36 → 0.45)
  - Certificate status: **Not issued**
  - Field science partner: Niche Environment and Heritage
  - Stacked with: ACCU project ERF206427 (carbon + biodiversity stacking, exactly the dual-credit model the Apr 28 MRV addendum predicted)
  - Indigenous partner: Biripi people (Traditional Owners), full Cultural Statement on register

The master XLSX register is **44.28 KB**. The project-plans CSV is **237 BYTES** (effectively empty). The biodiversity-reports CSV is **144 BYTES** (effectively empty). The related-projects CSV is **251 BYTES**. This is a market that has been formally launched, has a regulator, has data infrastructure, and is statistically empty.

---

## Why this is the most important finding for Co-Exist + MRV addon

Apr 28's NRM addendum was authored against an **assumed market shape** ("Replanting method permanent-sampling-plot record type with bi-temporal observations, threshold reconciliation 100% plots <10ha / 75% plots ≥10ha, CER Biodiversity Market Register 7-CSV-file reconciliation pipeline"). The addendum is **technically correct** — it maps onto exactly the regulatory architecture above. But the addendum's *commercial framing* assumed a multi-project market where Co-Exist's MRV addon is one of several ground-truth ingestion options.

**The market does not exist yet.** Silva Capital is alone. Any pitch to a peak body (Landcare, HLW, NRMRegions, Marnie Lassen) about "biodiversity-certificate path" right now is pitching them into a market with a single comparator (a corporate-investor-backed station, not a peak-body programme).

This changes the wedge in three concrete ways:

1. **Peak-body MRV pitches need to lead with the EPBC-offset path, not the voluntary-credit path.** The voluntary market is empty; voluntary buyers are absent. The EPBC-offsets path (mandatory market opening ~1 Dec 2026, see below) creates demand that doesn't depend on voluntary corporate ESG appetite.

2. **Co-Exist's first MRV-addon adopter could be a "second project on the register" rather than "tenth in a class."** Different conversation, different price ceiling, different time pressure. A peak body becoming the second NRM project nationally is news-cycle eligible — fits Tate's "piercing uniquity" bar.

3. **Niche Environment and Heritage is the incumbent science-provider for NRM project field work.** Any peak-body adopter Ecodia signs is implicitly competing with (or partnering with) Niche EH. This needs to be on the GTM map.

---

## The May 2026 EPBC-offset consultation (the actual lever)

Source: Clayton Utz, "Biodiversity offsets under scrutiny in Nature Repair Market consultation," 1 May 2026.

**What changed:** The Environment Protection Reform Act 2025 (Cth) (passed Nov 2025) will, when commenced (most likely **1 December 2026**), lift the existing ban on using NRM biodiversity certificates as EPBC environmental offsets. At that moment the NRM stops being a voluntary-only ESG market and becomes the third leg of EPBC offset delivery, alongside (a) conventional on-land conservation and (b) "restoration contribution charge" payments to the Government.

**Three consultation papers, submissions close 5pm Mon 4 May 2026** (3 days from now):
1. Policy settings to enable NRM scheme to supply environmental offsets
2. Threatened Species Characteristic (variable in the BA Instrument 2025)
3. Amendments to Nature Repair Rules for integrity and administration

**The Replanting Method (the only existing method) does NOT allow offset issuance.** The Government has confirmed there is no current intention to amend it. New methods must be approved first. This means:

- The **ENV Method (Enhancing Native Vegetation)** — currently in development, allows for *maintenance* of remnant vegetation — is being actively designed to be offset-capable. ENV Method is the actual tradeable-supply method when EPBC-offsets demand turns on.
- The **Protect and Conserve Method** has had public consultation but is not yet approved.
- Anyone who wants to be in the offset-supply market on day one of the EPBC change (~Dec 2026) is currently designing projects against the **draft ENV Method**.

**Implication for Co-Exist MRV addon:** The Apr 28 addendum names Replanting. The addendum should be *extended* (not rewritten) to also cover ENV Method. ENV is the commercially live method as of Dec 2026 onwards. The addendum's permanent-sampling-plot record type and bi-temporal-observations design generalise to ENV; the threshold rules differ.

---

## Regulatory architecture summary (for cold-start orientation)

Two federal bodies, distinct roles:

| Body | Role | Surface |
|---|---|---|
| **DCCEEW** (Department of Climate Change, Energy, the Environment and Water) | Policy, methods determinations, consultation, EPBC Act administration | dcceew.gov.au/environment/environmental-markets/nature-repair-market |
| **CER** (Clean Energy Regulator) | Operates the Biodiversity Market Register, registers projects, issues certificates, adjudicates audits | cer.gov.au/markets/reports-and-data/biodiversity-market-register |

Statutory instruments stack:
- **Nature Repair Act 2023 (Cth)** — primary legislation, came into effect 15 Dec 2023
- **Nature Repair Rules 2024** — administrative requirements for registration
- **Nature Repair (Biodiversity Assessment) Instrument 2025 ("BA Instrument")** — the standard set of fixed and variable biodiversity project characteristics. Five variable characteristics: ecosystem condition, impact of threats, commitment to protection, threatened species, culturally significant entities.
- **Methodology Determinations (one per method)** — the Replanting Method 2025 is on the federal register at `legislation.gov.au/F2025L00253`. Each is a separate legislative instrument.
- **Environment Protection Reform Act 2025 (Cth)** — Nov 2025 reforms making EPBC biodiversity offsets a legislative requirement and creating the NRM-as-offset-supply pathway commencing ~Dec 2026.

**PLANR (planr.gov.au)** — Government-built farmer/landholder-facing project-planning software. Tagline: "Platform for Land and Nature Repair... A gateway to environmental markets for Australian farmers. Providing tools to plan carbon and biodiversity projects." This is the upstream planning tool. The Apr 28 addendum's "PLANR project-plan ingestion (one-way pull, file-based)" is correct — PLANR is the plan-design surface, the CER Biodiversity Market Register is the post-registration record-keeping surface, and Co-Exist's MRV addon is the field-observation/ground-truth surface that lives between them.

---

## Where Co-Exist's MRV addon plugs in (refined)

Apr 28 had it conceptually right. May 2026 makes it commercially sharper:

1. **Project-plan ingestion (PLANR)** — pull project geometry, method selection, activity calendar from PLANR exports. One-way, file-based, no live API surface published.
2. **Site assessment ingestion (CER project plan ZIP)** — every registered project ships a site assessment report ZIP with the polygon geometry. NR001014's lives at `cer.gov.au/sites/default/files/biodiversityProjectFiles/NR001014_Site_assessment_report.zip` (4.86 MB indicative). This is the parameterisation surface — what plots, what species, what threatened species are present.
3. **Bi-temporal field observations (Co-Exist app)** — this is the wedge. The CER's biodiversity-reports CSV is currently empty across the entire register because no project has been operating long enough to produce reports. When NR001014 produces its first biodiversity report (likely 2026-2027), the entire market's understanding of "what does an NRM biodiversity report look like in practice" will be set by Niche EH's spreadsheet output. **First-mover risk and opportunity:** if Co-Exist ships an MRV addon that exports a *standardised* biodiversity-report format before the second project produces one, Co-Exist sets the de facto data shape.
4. **Threshold reconciliation (CER → Co-Exist)** — Replanting method has 100% plots <10ha / 75% plots ≥10ha sampling rules. ENV method (when published) will have its own. The addon needs to encode both.
5. **Certificate issuance trigger (CER)** — when the project meets method thresholds, proponent applies for certificate. The audit pipeline (registered auditors per `cer.gov.au/schemes/audits-our-schemes/register-auditor`) is the gate. Co-Exist MRV addon's value prop: produce evidence packs that audit trivially.

---

## Three actionable opportunities

### 1. Extend the Apr 28 addendum to cover ENV Method (high priority)
**Who:** ecodiaos (Tate to assign to a Factory dispatch when MRV addon is greenlit)
**Cost:** ~3-4 hours of spec extension. Read the draft ENV Method consultation paper (DCCEEW publishes; not pulled this session). Map its sampling rules and threshold rules into the addendum's permanent-sampling-plot record type. Add a sub-section to the parent spec.
**Why it matters:** Replanting alone targets the empty voluntary market. ENV targets the live (Dec 2026+) EPBC-offset demand. Without ENV coverage the addendum's commercial relevance is theoretical.

### 2. Submit a public-comment response to the May 4 consultation (medium priority, time-critical)
**Who:** ecodiaos (drafts, Tate reviews and submits via DCCEEW portal under Tate's identity)
**Cost:** ~2 hours to draft. Submission window closes 5pm Mon 4 May 2026 (≤72 hours from now).
**Why it matters:** Three substantive observations Ecodia uniquely holds — (a) software-vendor perspective on ground-truth ingestion needing standardised CSV export of biodiversity reports (BA Instrument variable characteristics), (b) the threatened-species characteristic should accommodate citizen-science-class observations from validated apps (Co-Exist member-collected sightings, lower-tier than ALA-grade but higher-tier than no-data), (c) administrative request for the Biodiversity Market Register to publish a stable data-export API rather than CSV-via-CMS-button. Filing makes Ecodia a named stakeholder in the public consultation record, which matters for any later peak-body conversation. **Note: this is "Tate's identity for filing" — fits the brief-Tate-first criteria for consultation submissions, conductor drafts but does not unilaterally submit.**

### 3. Carbon-MRV peak-body GTM target list v3 — re-frame around EPBC-offset wedge (medium priority)
**Who:** ecodiaos (when carbon-MRV bundle reactivates post-Tate-review)
**Cost:** ~2 hours to revise the v2 list (currently shipped 29 Apr).
**Why it matters:** The v2 target list and outreach template implicitly assume a voluntary-credit market. The state of the regulator says: voluntary is empty, EPBC-offset is the live demand source from Dec 2026. Tier-1 targets (Landcare/HLW/NRMRegions) should be approached with "we can help you become a registered offset-supplier in the first wave" framing, not "let us help you sell biodiversity credits to corporates." Different ICP, different pitch energy.

### Stretch-goal thought: Niche Environment and Heritage relationship
Niche EH is the de facto incumbent NRM-project science provider. Three options:
- **Avoid:** position Co-Exist MRV addon as separate from field-science consultancy (purely software).
- **Partner:** offer Co-Exist MRV addon as the digital substrate Niche EH uses for their second/third project. Software-as-tool, Niche EH owns the client relationship.
- **Compete:** offer "MRV-software-replaces-need-for-Niche-EH-grade-consultancy" to second/third projects. High-risk pitch — would need real evidence of comparable scientific rigour.
Default: option 2 (partner). Validate by reading Niche EH's NR001014 work and forming a view on whether they'd value the digital substrate. Out of scope for this session.

---

## What to research next in this domain

1. **Read the draft ENV Method consultation paper end-to-end.** It was the lever in this whole picture and I didn't pull the actual paper this session because the regulator-state finding alone consumed the budget.
2. **DCCEEW Threatened Species Characteristic issues paper.** This is where citizen-science observation data has its strongest regulatory toehold. Worth a separate session.
3. **Map ACCU "stacking" precedents.** Silva Capital is stacking ACCU + biodiversity certificate; the carbon-MRV bundle's appeal partially depends on how widely peak bodies could stack. Need to enumerate which ACCU methods are stack-compatible with the Replanting and (eventually) ENV NRM methods.
4. **UK BNG (Biodiversity Net Gain, mandatory Feb 2024) comparison.** UK's mandatory regime is two years older than AU's voluntary-becoming-offset regime. UK lessons (oversupply of low-quality units, fraud risk in biodiversity unit registries, software-vendor consolidation) should inform the AU GTM. One full session worth of comparative work.
5. **Niche Environment and Heritage's actual NRM offering.** Is it a one-off contract or a productised service? What's their software stack?

---

## Sources (re-runnable via Corazon residential-IP curl)

- Biodiversity Market Register (live registry): https://cer.gov.au/markets/reports-and-data/biodiversity-market-register
- Master XLSX (44.28 KB): https://cer.gov.au/document/biodiversity-market-register
- Project details CSV: https://cer.gov.au/document/biodiversity-market-register-project-details
- NR001014 project page: https://cer.gov.au/markets/reports-and-data/biodiversity-market-register/project/NR001014
- Replanting Method Determination 2025: https://www.legislation.gov.au/F2025L00253/asmade/text
- DCCEEW Nature Repair Market: https://www.dcceew.gov.au/environment/environmental-markets/nature-repair-market
- PLANR: https://planr.gov.au/about-nature-markets
- Clayton Utz May 2026 EPBC-NRM consultation analysis: https://www.claytonutz.com/insights/2026/may/biodiversity-offsets-under-scrutiny-in-nature-repair-market-consultation
- Silva Capital media release (Aug 2025): https://silvacapital.com.au/wp-content/uploads/2025/08/MEDIA-RELEASE-Silva-Capital-Registers-First-Project-in-World-First-Biodiversity-Credit-Scheme.pdf
- Niche Environment and Heritage announcement: https://niche-eh.com/news/first-nature-repair-market-project-signals-investor-interest-in-nature-restoration/
- AgriInvestor: https://www.agriinvestor.com/inside-the-first-biodiversity-project-in-australias-nature-repair-market/
- S&P Global (Mar 2025 launch): https://www.spglobal.com/energy/en/news-research/latest-news/energy-transition/030425-australia-launches-worlds-first-legislated-voluntary-biodiversity-credits-market

---

## End-of-session metadata

- **Time invested:** ~30 min (one cron-window deep-research)
- **Cache substrates:** Neo4j Research node (durable), kv_store ceo.last_deep_research (rotation pointer), this draft on disk (full reasoning trace)
- **Followups not auto-spawned (per fork brief — no nested forks):** items 1, 3 above are status_board P3 candidates; item 2 (consultation submission) is time-critical and needs Tate decision.
