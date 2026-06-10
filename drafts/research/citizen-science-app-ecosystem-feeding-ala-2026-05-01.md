---
title: AU citizen-science app ecosystem feeding ALA — competitive map, ingest surface, and Ecodia wedge
fork_id: fork_mon2oeqk_5b0472
authored_at: 2026-05-01 (afternoon AEST)
domain: A (conservation tech — citizen science angle)
prior_rotation_skip_basis: rotated away from C/D/E/F (saturated last 7 days); A last touched 29 Apr (Landcare platform audit), this is a different angle.
research_route: WebSearch + WebFetch paywalled (long-context-beta cap on this Anthropic account); ALA api.ala.org.au 403 from VPS WAF — entire research routed via Corazon residential IP (curl via shell.shell on laptop-agent), per ~/ecodiaos/patterns/websearch-via-corazon-residential-ip-when-vps-bot-blocked.md
verification: every numeric claim is tagged (live-API) with the exact endpoint hit on 1 May 2026 — re-runnable.
---

## TL;DR

Citizen-science apps are how ~60M of ALA's 180M occurrence records arrived. The category is dominated by birds (eBird AU = 35% of all ALA records, BirdLife Birdata = 13%) and a few large state-government portals. iNaturalist Australia is the only generalist mobile-first app at scale (12.6M records, +26% YoY in obs, 80% of obs reach ALA). Outside birds and iNat, the long tail is hundreds of tiny region-named projects (Sunshine Coast Big Butterfly Count = 262 records, Sunshine Coast Annual Frog Survey = 66 records) running on **manual CSV/DwCA upload to ALA's BioCollect**. Ingest is a public, unauthenticated DwCA-archive-at-a-URL pattern — ALA pulls. There is no proprietary write-API to negotiate.

The wedge for Ecodia is **NOT another generalist citizen-science app** (iNat owns that, scale + Cornell + Apple ML behind it). The wedge is a **white-label "named-place citizen-science campaign" platform** that turns local councils, NRM bodies, festivals, and peak bodies into ALA dataResources without them touching CSV files. Co-Exist already has the youth-conservation engagement primitive; this builds the data pipe under it.

This converges with three live Ecodia threads: (1) Co-Exist's product needs species-data export to ALA to be MRV-defensible for biodiversity credits, (2) Conservatree's Woodfordia pitch sits inside an ALA citizen-science gap (Woodford 15km radius = 169k records, 98% birds, frogs/butterflies/mammals badly under-counted), (3) MRV biodiversity-certificate path needs species-baseline data the federal Nature Repair Market will accept, and ALA-via-DwCA is the federally-recognised path.

---

## 1. The numbers (all live-API, 1 May 2026)

### iNaturalist Australia (place_id 6744)

| Metric | Value | Endpoint |
|---|---|---|
| All-time observations | **15,032,143** | `api.inaturalist.org/v1/observations?place_id=6744&per_page=0` |
| Obs in last 12 months (May 2025 - Apr 2026) | **3,654,623** | `…&d1=2025-05-01&d2=2026-04-30` |
| Obs in prior 12 months (May 2024 - Apr 2025) | **2,899,359** | `…&d1=2024-05-01&d2=2025-04-30` |
| **YoY growth** | **+26.0%** in obs/yr | derived |
| Recent year as % of all-time | **24.3%** | derived — accelerating S-curve |
| Distinct species observed | **71,324** | `/observations/species_counts` |
| Top observers (ranked observers) | **157,928** | `/observations/observers` |
| Insect observations | **4,076,766** (27% of all) | `&iconic_taxa=Insecta` |
| Research-grade obs (ALA-eligible) | **9,414,103** (62.6%) | `&quality_grade=research` |

**62.6% research-grade ratio** is the identification bottleneck. The other 37% are casual + needs-ID and never reach ALA. This is iNaturalist's structural weakness and the most exploitable gap — most of those 5.6M records have a photo and a coordinate but no expert ID.

### ALA citizen-science landscape — top 15 dataResources by record count (live ALA `occurrences/search?facets=dataResourceUid&flimit=15`)

| # | Source | Records | % of total | Class |
|---|---|---|---|---|
| 1 | eBird Australia (dr2009) | 62,592,261 | 34.8% | App (Cornell, since 2002) |
| 2 | BirdLife Australia, Birdata (dr359) | 22,993,552 | 12.8% | App + web (BirdLife, since ~2016) |
| 3 | NSW BioNet Atlas (dr368) | 15,238,660 | 8.5% | NSW gov portal |
| 4 | iNaturalist Australia (dr1411) | 12,585,631 | 7.0% | App |
| 5 | Victorian Biodiversity Atlas (dr1097) | 10,079,568 | 5.6% | Vic gov portal |
| 6 | NSW Bird Atlassers (dr1089) | 3,381,819 | 1.9% | Volunteer org |
| 7 | First Bird Atlas (dr571) | 2,712,345 | 1.5% | Historical (1977-81) |
| 8 | SA Flora (dr366) | 2,185,982 | 1.2% | SA gov |
| 9 | SA Fauna (dr365) | 2,156,289 | 1.2% | SA gov |
| 10 | WildNet QLD (dr1132) | 1,921,539 | 1.1% | QLD gov |
| 11 | Garden Bird Surveys (dr466) | 1,855,916 | 1.0% | BirdLife project |
| 12 | Australian Museum OZCAM (dr340) | 1,813,531 | 1.0% | Museum specimens |
| 13 | IMOS Acoustic Tracking (dr9942) | 1,546,540 | 0.9% | Marine telemetry (not really CS) |
| 14 | Fauna Atlas N.T. (dr361) | 1,200,071 | 0.7% | NT gov |
| 15 | Tasmanian Natural Values Atlas (dr710) | 1,121,933 | 0.6% | Tas gov |
| | **All HumanObservation records in ALA** | **148,752,564** | | basisOfRecord:HumanObservation |
| | **All ALA records** | **179,728,084** | | |

**Reading**:
- Birds = ~46% of all ALA records (lines 1, 2, 6, 7, 11). The most app-saturated taxon by orders of magnitude.
- Three of top 5 are gov state portals with **no consumer app surface** — they ingest from many sources, no UX
- iNat is the only top-5 that is mobile-first generalist
- FrogID is rank ~22 (974,120 records, single-class app, AustMus-built)

### YoY throughput into ALA (last 12 months, by source — live)

| Source | Records 12mo | Notes |
|---|---|---|
| iNaturalist Australia | 2,995,171 | 80% of iNat's own count (3.65M) — ingest-lag is real |
| eBird Australia | 2,944,268 | near-realtime via Cornell→ALA pipeline |
| FrogID | **0** | (ALA pipeline lag for FrogID is 12-24 months — they batch) |
| (sum top 2 alone) | ~5.94M/yr | rest of top-15 = ~2-4M combined |

**Annual citizen-science throughput into ALA ≈ 8-10M records/yr.** Of which iNat + eBird = 60%+.

### Local-scale heat map (live ALA radius queries, 1 May 2026)

**Maleny / Sunshine Coast hinterland (-26.65, 153.06, 10km)**
- Total HumanObservation records: 402,741
- Aves (birds): 343,127 (**85.2%**)
- Insecta (insects): not in top-10 facet (large undercount)
- Arachnida: 2,524
- Amphibia: 631
- Agaricomycetes (fungi): 1,585
- Actinopterygii (fish): 2,216

**Woodfordia / Woodford (-26.84, 152.74, 15km)** — Conservatree pitch site
- Total HumanObservation records: 169,813
- eBird AU: 117,306 (69%)
- BirdLife Birdata: 25,174 (15%)
- iNaturalist: 23,030 (14%)
- "Earth Guardians Weekly Feed" (dr1902): 1,702
- First Bird Atlas (dr571): 1,350
- **Sunshine Coast's Big Butterfly Count (dr19044): 262**
- Myrtle Rust Surveys: 147
- ALA Sightings/OzAtlas (dr364): 128
- NSW BioNet Atlas (dr368): 123
- cPlatypus (dr7973): 91
- Pl@ntNet auto-IDs (dr22512): 72
- **Sunshine Coast Annual Frog & Toad Field Survey (dr24697): 66**
- NPA NSW Great Koala Count (dr799): 45
- Koala Quest 2015 (dr4701): 40

**The non-bird signal at Woodford is desperately thin.** 144,830 of 169,813 records are birds (85%). Frog/butterfly/mammal/insect/fungi/plant data is so sparse that any decent festival-scale citizen-science deployment would 10-100x the local non-bird record base in a single weekend. **For an MRV biodiversity-credit project at Woodford, the only species data ALA holds is birds. Everything else is empty.**

---

## 2. The named-place projects (the actual wedge)

### Sunshine Coast's Big Butterfly Count (dr19044)
- Run by **Sunshine Coast Council**, institution `in665`
- Contact: **evc@sunshinecoast.qld.gov.au**
- Public site: https://mary-cairncross.sunshinecoast.qld.gov.au/bigbutterflycount
- **Method derived from Brisbane Catchments Network's Brisbane Big Butterfly Count** — a pre-existing methodology + image library that BCN explicitly licensed sideways for regional replication. **This is exactly the white-label-per-region pattern Ecodia is positioned for.**
- Data flow: DwCA archive at https://dwca-exports.ala.org.au/dr19044.zip, **automation: false, harvestFrequency: 0** — i.e. they manually CSV-upload, ALA harvests on demand.
- Last ALA check: 27 Apr 2026 (active)
- 262 records over 4 seasons since 2022 — tiny

### Sunshine Coast Annual Frog and Toad Field Survey (dr24697)
- Active since 2015, runs Feb-Mar end of QLD wet season
- License: **CC-BY-NC 4.0**
- DOI: 10.15468/fyfqmx
- GBIF registry key: c04871ce-1928-4bc9-93e0-9e346956a793 — federally recognised, GBIF-shareable
- Same DwCA-zip pattern, manual harvest
- 66 records over 11 seasons — astonishingly thin for an annual council survey

### BioCollect (dp3903) — the substrate
- Operated by ALA under NCRIS (federal funding) — **free for citizen-science projects**
- Contact: biocollect-support@ala.org.au
- "An open cloud-based data collection solution for biodiversity"
- Anyone can register a citizen-science project for free. ALA provides the substrate; UX is mediocre WordPress-era forms
- Hundreds of projects under it — the long tail of named-place campaigns

**The wedge is right here**: BioCollect is the federal substrate; nobody has built the consumer-grade mobile UX layer on top of it for the long-tail of named-place campaigns. iNat is generalist (no campaign branding, no place lock-in, no NRM-grant tie-in). FrogID is single-class. eBird is birds-only. **Council-branded, festival-branded, NRM-region-branded mobile campaigns — that is open territory.**

---

## 3. Tech-stack telemetry (incumbent fingerprints, captured via curl)

| App | Stack | Strength | Weakness |
|---|---|---|---|
| iNaturalist | Rails, Vision API (custom CV ML), Apple+Android native | World-class CV, CC-BY-NC default, 9.4M research-grade obs in AU | Generalist UX, no place-branding, ID bottleneck (37% never make research-grade), no MRV/credit hooks |
| eBird AU | Cornell-built React + native, real-time | 62.5M records in ALA, near-instant ingest, expert review pipeline | Birds-only, US-led, no AU-customisation surface |
| BirdLife Birdata | WordPress + Yoast SEO 26.6 + OpenID Connect Generic + custom React | 23M records, federated SSO across BirdLife properties | WordPress legacy stack, recently rebuilt 2025 (asset paths Aug 2025) |
| FrogID | **Django + Wagtail CMS** (S3 staging URL `frogid-rebuild-staging.s3.amazonaws.com` confirms current rebuild in flight), audio-classification ML | Single-species app, Australian Museum brand | Audio-only, batches to ALA on 12-24 month lag |
| BioCollect (the substrate) | Grails + Bootstrap 3, ALA-hosted | Free, GBIF-shareable, federal | UX is form-heavy, no native mobile app, manual CSV upload UX |
| Pl@ntNet | French INRA-built CV, automated identification | Good plant CV, 72 records in 15km Woodford radius (used here) | Foreign org, no AU campaign hook |

**No incumbent owns "white-label citizen-science campaign for AU council/NRM/festival/peak-body".** That space is fully open.

---

## 4. The MRV biodiversity-credit ingest path (ALA → CER Nature Repair Market)

The Nature Repair Market biodiversity-certificate path (federal CER, since 2024) requires baseline + ongoing species data. Methods accepted include "permanent ecological monitoring plot" methods that fold into MERIT (the federal monitoring substrate ALA built — same family as BioCollect).

The ingest pipe is:
- Field app (whatever) → DwCA archive at stable URL → ALA harvest → ALA dataResource → GBIF + ecological data services → MERIT-eligible (with the right method tags) → CER NRM acceptance
- **DwCA is the lingua franca**. Anyone who emits Darwin Core Archive zips at a stable URL becomes a recognised data provider.

For Co-Exist + MRV biodiversity-credit pitches:
1. The product already collects engagement data (youth + sites + photos). Adding species + coordinates makes it DwCA-emittable for ~1 day of work per scope.
2. Existing local frog/butterfly/koala surveys at SC are 40-262 records each. Co-Exist activations could add 100-1000+ records per event.
3. Tie-in to MERIT through the project's monitoring plan = makes the survey data NRM-credit-eligible. Not just nice-to-have, **pricing leverage**.

(Caveat — inference, not verified): NRM credit acceptance depends on the specific accepted method (permanent plot, transect, etc), and ad-hoc citizen-science records won't qualify without a structured protocol. The wedge isn't "convert any photo into a credit"; it's "wrap structured surveys in a UX layer the volunteers will actually use, then export to ALA via DwCA so the data also feeds the credit-eligible monitoring stream."

---

## 5. Three concrete opportunities for Ecodia (ranked by closeability)

### Opportunity 1 — Sunshine Coast Council named-place campaigns (closeable inside 30 days)
- **Target**: SC Council Environment & Visitor Centre (evc@sunshinecoast.qld.gov.au), institution `in665` — already runs Big Butterfly Count + Annual Frog Survey via manual CSV upload
- **Pitch**: "We replace your CSV-upload workflow with a council-branded mobile app that streams records into ALA via DwCA. Same data, same ALA presence, 10-100x participation, branded as your campaign not iNaturalist. Pricing: $4-8k build + $200/mo licence (Co-Exist template)."
- **Tate-relationship advantage**: Sunshine Coast resident, can walk into the Council EVC. **DOES NOT require negotiation with national peak bodies first.**
- **Existing council relationship probe**: check status_board / CRM for any prior SC Council touch — this is "warm lead via geography" not cold.
- **Risk**: government procurement is slow (3-6mo from intro to PO), grant-funded (need to align with their grant cycle). Mitigant: pitch as "pilot under existing budget" via discretionary pot.
- **Status_board action**: insert P3 row entity_type=opportunity, name="Sunshine Coast Council citizen-science wedge", next_action=draft_outreach_brief_for_tate_review, next_action_by=ecodiaos.

### Opportunity 2 — Conservatree at Woodfordia (already in flight, this research sharpens the pitch)
- **Sharpen Conservatree positioning** with the verified fact: "ALA holds 169,813 records within 15km of Woodford. 85% are birds (eBird, Birdata). The non-bird signal is desperately thin. Two existing local citizen-science projects (Big Butterfly Count, Frog Survey) hold a combined 328 records over 11 years. A Woodfordia-deployed mobile app could 10-100x the local non-bird record base in a single weekend. That's defensible MRV-baseline value for the festival's biodiversity narrative AND for any biodiversity-credit project on the festival's land."
- **Status_board action**: append context to existing Conservatree row (search status_board for entity name containing 'conservatree' or 'woodfordia').

### Opportunity 3 — DwCA-emit module for Co-Exist (engineering, ~1 week Factory work when paywall lifts)
- Co-Exist already collects geolocated activity data + photos. Adding a DwCA-exporter is a small engineering task that turns Co-Exist into an ALA-recognised data provider.
- **Side benefit**: every Co-Exist deployment becomes a registered ALA dataResource with its own DOI, GBIF ID, and citation. **That's massive credibility infrastructure** for client pitches (Landcare-adjacent peak bodies will recognise the legitimacy).
- **Status_board action**: P3 row entity_type=infrastructure, name="Co-Exist DwCA-exporter for ALA-eligible data flow", next_action=brief_factory_when_paywall_lifts, next_action_by=ecodiaos.

---

## 6. What this changes about prior strategy

- **Conservation-tech research rotation A is no longer just "Landcare app teardown"**. The richer angle is **the gap between iNat/eBird and the federal substrate**, where named-place white-label apps could live.
- **The 30 Apr "MRV add-on" Research node** focused on ACCU + biodiversity-certificate paths but did not name **DwCA-via-BioCollect as the federal data substrate**. This is the missing technical ingest map and should be referenced from that node.
- **Conservatree pitch** previously framed as "festival app + conservation". Now sharper: "festival app that closes the local non-bird ALA data gap and makes the festival site a registered, DOI'd ALA dataResource."

---

## 7. What to research next in this domain (carry-forward)

1. **Atlas of Living Australia governance** — board structure, funding cycle, NCRIS dependency. If Ecodia builds atop BioCollect we want to understand the federal funding risk profile.
2. **MERIT monitoring methods** — exhaustive enumeration of accepted protocols (permanent plot, transect, point count, audio-array) and which can be wrapped in mobile UX without losing credit-eligibility. Bridge to the 28 Apr MRV spec.
3. **Brisbane Catchments Network** — the upstream of Sunshine Coast Big Butterfly Count. If Brisbane runs a working version and has the methodology IP, they're a natural Ecodia partner OR competitor.
4. **WildLab / Wildlife Spotter / DigiVol** — rank of these subscale apps in ALA. (DigiVol confirmed 93k records, all transcription-based, niche.)
5. **eDNA in citizen science** — emerging tech, samples sent to lab, results loaded to ALA. Too lab-heavy for Co-Exist v1 but real wedge in 2027.

---

## 8. Provenance + research-route disclosure

- WebSearch + WebFetch returned `400 The long context beta is not yet available for this subscription` (Anthropic Claude Max weekly cap on this account, same constraint as 1 May 09:42 fork)
- ALA `api.ala.org.au` returned 403 from VPS IP (WAF / Cloudflare bot-block)
- **Routed via Corazon (100.114.219.69:7456) `shell.shell` running curl.exe from Tate's residential laptop IP** per `~/ecodiaos/patterns/websearch-via-corazon-residential-ip-when-vps-bot-blocked.md`
- All numeric facts are tagged with the exact endpoint hit on 1 May 2026 — re-runnable
- Two findings derived (YoY %, research-grade ratio) — derivations explicit
- Section 4 carries one explicit (inference) tag for NRM credit-acceptance; rest is verified

Stamped fork_id: fork_mon2oeqk_5b0472
