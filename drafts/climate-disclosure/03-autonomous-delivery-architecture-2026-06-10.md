---
slug: climate-disclosure-autonomous-delivery-architecture
date: 2026-06-10
register: doctrine
relates_to: drafts/climate-disclosure/01-alignment-and-feasibility-verdict-2026-06-10.md, drafts/climate-disclosure/02-productised-sow-template-2026-06-10.md, drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md
status: v1, regulatory anchors cross-checked against the Phase 1 verdict
---

# Autonomous-delivery architecture: how EcodiaOS runs a climate-disclosure engagement alone

This is the load-bearing document of the service line. Phase 2 defines what a Group 2 entity buys. This document defines how EcodiaOS delivers it with effectively zero human delivery labour, engagement after engagement, the same way every time. The honest automation ceiling is stated at the end, not inflated.

The design principle: this service is Ecodia's own internal discipline pointed outward. Every organ the delivery pipeline needs already exists inside EcodiaOS in some form. Where that is true, this document names the internal organ and reuses it. Where something genuinely new is needed, it is marked NEW and specified in the Phase 4 build spec.

## 1. The organs that already exist

| Delivery need | Internal organ that already does this | External productisation |
|---|---|---|
| Immutable timestamped provenance on every claim | Neo4j Decision/Episode chains; the M1 `knowledge-claim-bind` hook that blocks completion writes lacking a discriminating probe | Evidence register rows with hash-chain provenance (NEW table, same discipline) |
| Single source of truth for live engagement state | `status_board` | `cd_engagements` + status_board rows per engagement |
| Scheduled recurring work that fires without a human | `scheduler.cron` / `scheduler.delayed` on `ecodia-scheduler`, poller dispatching worker tabs, `coord.*` signal-back | Monthly evidence-cycle crons per engagement |
| Document ingestion from email | Gmail service-account attachment extraction (`gmail-attachment-extraction-via-vps-service-account`), `ecodia-comms` connector | Per-engagement ingest address, auto-filed to evidence storage |
| Spreadsheet-shaped field data | Reverse-Excel-sync substrate (Supabase project `tjutlbzekfouwsiaplbr`, built for the MRV add-on) | Activity-data workbooks that sync into the evidence register |
| Deterministic verification before "done" | verify-deployed-state-against-narrated-state; dev-process eight rungs | Per-step verify gates in the engagement runbook (section 4) |
| Narrow, scoped tool surface | The ten `ecodia-*` MCP connectors pattern | A `cd_*` tool family on a narrow connector (Phase 4) |
| Public attestation no one has to trust us about | The Polygon contract EcodiaOS operates (`0xac1e6754507e087941fa8feddc7f75c83795badb`) | Optional on-chain anchoring of evidence-chain digests |

The one genuinely new organ is the emissions calculation engine (deterministic activity-data to tCO2-e, NGER-method aligned, versioned factors). It is small, testable, and specified in Phase 4.

## 2. What gets delivered (fixed by the Phase 2 SoW)

Five deliverables per engagement, all flowing from one substrate:

1. The evidence register: every datum the disclosure rests on, with provenance.
2. A Scope 1 and 2 emissions baseline, each figure traceable to source documents and factor versions.
3. Draft climate statements mapped clause by clause to AASB S2, every paragraph citing evidence-register rows.
4. A gap analysis: which AASB S2 requirements the entity currently cannot evidence, with a remediation list.
5. A continuous-monitoring feed: monthly evidence cycle, drift flags, and a maintained assurance-ready evidence pack for the entity's auditor.

## 3. The delivery pipeline, organ by organ

### 3.1 Intake

A signed SoW triggers a deterministic bootstrap, no judgement calls:

- `cd_engagements` row created (entity legal name, ABN, reporting period, group classification, facilities list, contacts, scope boundary).
- status_board row, entity_type `client`, priority 2, next_action_by `ecodiaos`.
- Neo4j client node + engagement Decision recording scope and boundary.
- A per-engagement ingest channel: a dedicated plus-address (e.g. `evidence+<engagement>@ecodia.au`) and a Supabase storage prefix.
- The engagement cron set (section 4, steps R3 to R9) registered via `scheduler.cron` with full context in each prompt body, per the self-scheduling reflex.

### 3.2 Evidence ingestion

Three channels, all landing in the same place:

- Email: the entity forwards utility invoices, fuel statements, refrigerant service records, fleet reports to the ingest address. The comms poller extracts attachments, files them to storage, and stages an `cd_evidence_items` row.
- Workbooks: facilities and activity data in structured workbooks on the reverse-Excel-sync substrate. Each sync writes staged evidence rows.
- Direct pulls: where the entity grants API or portal access (energy retailer data, NGER systems they already run), a per-source puller. v1 treats this as email/workbook fallback; pullers are per-client build items.

Every staged item is classified (document type, facility, period, scope category) by a worker pass, then committed. Classification is the one ingestion step that uses model judgement; the commit records both the classification and the classifier version, and a monthly sample is re-checked (section 6).

### 3.3 The evidence register (the product's spine)

Each `cd_evidence_items` row carries: sha256 of the source document, captured_at, source channel, the extraction method, the facility and period it covers, the scope category, and `prev_hash`, making the register an append-only hash chain per engagement. Corrections never update rows; they append superseding rows pointing at what they supersede. This is the Neo4j Decision discipline (supersedes, never silently edit) applied to client data.

Chain heads are anchored on a schedule: daily digest into Neo4j, weekly digest optionally written to the Polygon contract. The anchor means an auditor (or a court) can verify that the evidence trail existed at the claimed time and has not been rewritten since. Anchoring is opt-in per engagement and stays out of client-facing material by default; some buyers read a public-ledger anchor as rigour, others as crypto near their data. The differentiators that survived the 2026-06-10 red team's live competitive checks are fixed-fee fully-managed delivery and byte-reproducible regeneration; Avarni, Greener and Workiva-class platforms already market lineage and assurance-readiness, so the anchor is a footnote and never the moat claim.

### 3.4 The calculation engine (NEW)

Deterministic, no model in the loop:

- Versioned factor tables: National Greenhouse Accounts factors and NGER (Measurement) Determination methods, loaded per vintage with effective dates. Method election is per facility: AASB S2 measures GHG emissions under the GHG Protocol Corporate Standard unless a jurisdictional authority requires otherwise, and the Dec 2025 amendment (AASB S2025-1) lets NGER-covered facilities use NGER Determination methods while the rest of the entity stays on GHG Protocol. The engine records the election per facility in the methodology memo, and the boundary memo (R2) captures it at intake.
- Per-scope calculators: fuel combustion (Scope 1), refrigerants (Scope 1), purchased electricity location-based and market-based (Scope 2). Each run records inputs hash, factor vintage, calculator git SHA, and output, as a `cd_calc_runs` row chained to the evidence items it consumed.
- Golden tests: every calculator ships with worked examples cross-checked against published NGER/NGA worked examples; the test suite is the verify gate for any factor or code update.
- Recalculation on drift: a new factor vintage or a superseded evidence item triggers automatic recalc and a delta report. The entity sees "your FY26 Scope 2 figure moved 1.8% because the NGA factor vintage updated," with the full chain behind it.

### 3.5 The disclosure-drafting engine

AASB S2 is decomposed into a clause register (`cd_clause_register`): one row per disclosure requirement, with the paragraph reference, the requirement text paraphrase, and the evidence types that can satisfy it. Drafting then runs as dispatched workers, one brief per clause cluster (governance; strategy; risk management; metrics and targets), each brief carrying the engagement id, the clause rows, and a hard grounding rule: every drafted sentence that asserts a fact about the entity must cite `cd_evidence_items` ids, and a clause with no supporting evidence is drafted as a named gap, never filled with plausible prose.

Output is written to `cd_disclosure_drafts` (clause ref, draft text, evidence citations, status). The gap analysis is not a separate work product; it is the query `clauses where evidence is empty or stale`, rendered.

Register note: client deliverables render as clean professional documents (HTML to PDF). The Ecodia internal EB Garamond aesthetic is Ecodia-from-Ecodia only and is not used on client work.

### 3.6 Continuous monitoring (the retainer)

A monthly cycle per engagement, fired by cron:

1. Ingest poll: chase expected-but-missing evidence (each facility has an expected cadence; a missing month is a named gap, and the chase email is drafted and sent under the engagement's standing scope).
2. Recalc + drift detection: factor updates, boundary changes (new facility, divestment), threshold breaches against targets the entity disclosed.
3. Register integrity: recompute the hash chain end to end; verify anchors.
4. Monthly evidence-pack rebuild: the auditor-facing export (section 3.7) regenerated and versioned.
5. Monthly note to the entity: what arrived, what moved, what is missing, what changed in the standards. Drafted by worker, sent under standing engagement scope.

### 3.7 The assurance hand-off (the boundary made physical)

The entity's assurance practitioner gets an evidence pack, not opinions: the register export with provenance chains, methodology memos (which NGER methods, which factor vintages, which boundary decisions and who made them), calc-run lineage for every disclosed figure, and the draft-to-evidence citation map. Information requests from the auditor are answered by pointing at register rows; where a question needs a management judgement, it routes to the entity, never answered on their behalf.

The pack is designed so the practitioner's completeness, accuracy, and cut-off testing can run against our lineage instead of against a shared drive of spreadsheets. That is the sales pitch to the auditor: we make their engagement cheaper, not contested.

### 3.8 Director attestation

The directors' declaration on the sustainability report is the entity's act, in the entity's board pack. We deliver the final draft statements, the gap analysis, and a board-facing summary memo of what the evidence does and does not support. We never draft the declaration as ours, never advise directors on whether to sign, and the memo says so in terms.

## 4. The intake-to-delivery runbook

Deterministic sequence; a future session executes this without inventing process. Each step names its primitive and its verify gate. Setup phase is R1 to R8 (target 12 weeks), retainer is R9 onward.

- R1 Bootstrap (day 0). Primitive: `cd_engagements` insert + status_board upsert + Neo4j Decision + ingest channel + cron set. Verify: engagement row exists, ingest address receives and files a test document end to end.
- R2 Boundary memo (week 1). Worker drafts the organisational-boundary and scope memo from intake data; entity confirms in writing. Verify: signed-back memo filed as evidence item zero.
- R3 Evidence onboarding (weeks 1 to 4). Entity forwards 12 months of source documents per facility; workbook templates issued where documents do not exist. Cron: weekly chase of the expected-documents checklist. Verify: expected-cadence coverage >= 95% per facility, every gap named.
- R4 Baseline calculation (weeks 4 to 6). Calc engine runs Scope 1 and 2 over the onboarded register. Verify: golden tests green on the factor vintage used; every disclosed figure resolves to a complete chain (query returns zero orphan figures).
- R5 Clause mapping + first draft (weeks 6 to 9). Drafting workers run the four clause clusters. Verify: 100% of clause-register rows have either a draft with evidence citations or a named gap; zero drafted sentences with empty citation lists (enforced by query, not by review).
- R6 Gap analysis + remediation list (week 9). Rendered from the register. Verify: every gap row carries a remediation owner (entity or Ecodia) and a date.
- R7 Evidence pack v1 + auditor walkthrough (weeks 10 to 11). Pack generated; one session walking the entity's assurance practitioner through the lineage. Verify: pack export reproducible from a clean run; practitioner's open questions logged as register items.
- R8 Board memo + handover to attestation (week 12). Verify: memo delivered; status_board row flips to retainer state.
- R9 Monthly cycle (retainer). The section 3.6 cron set. Verify, monthly: hash chain validates; coverage report delivered; drift items either actioned or surfaced.
- R10 Annual roll (each reporting period). Re-baseline, restate comparatives if methods changed, re-baseline the clause register against standard updates (AASB/AUASB watch cron). Verify: diff report against prior period published into the pack.

Worker briefs at every step follow the dispatch-fact-gate: each brief carries the engagement id, the recipe path, and its verify gate. No brief ships without one.

## 5. The unavoidable human gates

Stated in full, because the honesty is the positioning:

1. Engagement contract signature. Signing legal documents is one of the five autonomy exceptions; Tate signs the SoW. One signature per engagement.
2. Directors' attestation. The entity's directors declare the sustainability report. Ours to prepare toward, never to make.
3. The assurance opinion. Only the entity's appointed sustainability report auditor can provide it: a Corporations Act auditor with registered company auditors as lead and review auditors, which the entity may appoint separately from its financial-report auditor (ASIC FAQs; ss 301A, 1707E to 1707F). We feed it, we never give it.
4. Entity judgement calls. Boundary choices, risk appetite, target-setting, transition-plan commitments are management decisions. We structure the options and the evidence; the entity decides. Where a decision needs a licensed adviser (financial product advice, tax, legal), the runbook routes to the entity's advisers by name.
5. First-engagement calibration. Engagement one runs with conductor attention on every R-step verify gate before its cron is trusted to run dark. That attention amortises to zero by engagement two or three; it is a build cost, not a delivery cost.

## 6. The honest automation ceiling

Counting delivery labour by runbook step, on a steady-state engagement (post-calibration):

- Fully autonomous, no human in the loop: R1, R3 to R6, R9, R10 ingestion/recalc/integrity/pack generation, plus all drafting and gap analysis. This is the bulk of delivery hours, roughly 85 to 90 percent of the labour a consultancy would bill.
- Autonomous with standing-scope contact: chase emails, monthly notes, auditor information responses that resolve to register pointers. Authorized per-engagement in the SoW (the Angelica standing-arrangement shape, generalised), so no per-message Tate gate.
- Human, irreducibly: the three signatures (Tate on the SoW, directors on the declaration, auditor on the opinion), entity judgement calls, and the auditor walkthrough session (R7), which is one meeting per engagement and could be EcodiaOS-run async but works better live in year one.

What this is NOT: scenario analysis and transition planning are sold as drafting-and-evidence support around the entity's own strategic decisions, not as us making those decisions. The model can draft a scenario-analysis write-up from the entity's chosen scenarios and evidenced inputs; choosing the scenarios and owning the strategy is theirs. Any pitch that claims otherwise overclaims, and overclaiming is the one unrecoverable error in this market.

Classification risk is the honest soft spot inside the autonomous fraction: document classification at ingest uses model judgement. Mitigation is structural: classifications are versioned, sampled monthly against a human-checkable subset during calibration, and every classification error that surfaces becomes a golden test. The error class degrades gracefully (a misfiled invoice shows up as a coverage gap or a calc outlier, both of which the monthly cycle flags), it does not silently corrupt disclosed figures, because disclosed figures only flow from committed, chained, recalculable evidence.

## 7. What engagement N+1 inherits

Every engagement makes the next one cheaper: classifier golden tests accumulate; the clause register and its evidence-type mappings are shared substrate; chase-email and memo templates harden; per-retailer document parsers accumulate. The marginal delivery cost trends toward the cron compute plus the three signatures. That trend line is the whole point of the service line: it is the first Ecodia offering whose unit economics improve automatically with volume because the delivery substrate IS the organism.

Cross-refs: [[carbon-mrv-wedge-peak-body-sub-commercial]] (pricing posture lineage), [[cofound-playbook]] (validate-before-build, regulated-domain honesty), [[verify-deployed-state-against-narrated-state]] (the discipline this productises), [[supabase-create-table-must-include-explicit-grants-2026-06-02]] (binds Phase 4), [[no-client-contact-without-tate-goahead]] (standing-scope carve-out defined per engagement in the SoW).

## Red-team amendments (2026-06-10, wf_017d6d7e-830; these supersede conflicting text above)

The adversarial pass (six lenses + judge, raw output at `red-team-2026-06-10-raw.json`) upheld the core asset and killed parts of the wrapper. Changes binding on this architecture:

1. Materiality-weighted confirmation. Any evidence item whose value exceeds an engagement-level materiality threshold requires firm-side or entity-side confirmation BEFORE commit, never post-hoc sampling. The graceful-degradation claim in section 6 holds for coverage gaps; it does not hold for a misclassified high-value item, and the threshold gate is the structural answer.
2. Extraction accuracy is its own layer, not a footnote to classification. W5 gains: dual-pass extraction with disagreement quarantine, dimensional checks on units, meter-read continuity checks across consecutive periods, and golden tests per document family. Extraction is model judgement and CAN silently corrupt a figure; the controls make it loud.
3. Firm supervision is a product feature. The partner variant ships reviewer queues and per-R-step firm sign-off gates, plus an APES GN 30 compliance memo in the SoW pack and an honest reviewer-hours estimate per engagement. The 85 to 90 percent autonomy figure is the SELLER'S fraction; the buyer-firm's residual review obligation is stated, never hidden.
4. Ingestion re-sequenced systems-first. Primary channels: AP-system exports (CSV from the entity's ERP), energy-retailer data requests, fuel-card portal exports. Email forwarding is the fallback for the residual tail, never the primary plan for 12 months of back-data.
5. Named human principal. Tate Donohoe is the accountable engagement principal in every contract, signature block and the auditor-correspondence protocol. The AI operates; a named human answers.
6. Client-owned infrastructure option (flagship continuity answer): the per-engagement Supabase project can be provisioned in the ENTITY'S own org, owned by them, operated by Ecodia via scoped credentials, with monthly register exports escrowed to the firm. The counterparty-continuity objection becomes the strongest line in vendor due diligence.
7. The evidence-pack format gets validated with at least one registered company auditor or assurance partner BEFORE the Exemplar pack or any pack-format claims publish; that validation doubles as Channel A outreach.
