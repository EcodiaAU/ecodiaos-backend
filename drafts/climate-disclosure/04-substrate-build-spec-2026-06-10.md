---
slug: climate-disclosure-substrate-build-spec
date: 2026-06-10
register: doctrine
relates_to: drafts/climate-disclosure/03-autonomous-delivery-architecture-2026-06-10.md
status: dispatch-ready for the build-now items; client-gated items marked
---

# Substrate build spec: the climate-disclosure delivery organs

Implementation brief for the architecture in `03-autonomous-delivery-architecture-2026-06-10.md`. A dispatched build worker can take any numbered work item below as a self-contained brief; each carries its verify gate per the eight-rung dev process. Items are split build-now (costless, no client data involved) versus client-gated (waits for a signed first engagement).

## Placement decisions

- Code home: `backend/src/services/climate/` in the EcodiaOS backend repo, Node, matching the existing service substrate (stripeAgentService, factoryBridge live in `src/services/`). Golden-test fixtures live at `backend/src/services/climate/calculators/__tests__/fixtures/` as .js modules (not JSON; each fixture carries a source-citation comment, which JSON cannot) (as-built correction 2026-06-10).
- Data home: a DEDICATED Supabase project (`ecodia-climate`, Sydney region), never the EcodiaOS substrate project `nxmtfzofemtrlezlyhcj`. Client evidence does not share a database with our own organs. Provisioning is client-gated (small recurring cost, and there is nothing to hold until an engagement signs). Migrations are authored now in `backend/climate-migrations/` and apply on provisioning day.
- Access: service-role only in v1. No client portal, no anon or authenticated grants. Every table carries the explicit REVOKE form per [[supabase-create-table-must-include-explicit-grants-2026-06-02]].
- MCP: a new narrow connector `ecodia-climate` exposing the `cd_*` tool family, scoped bearer at `kv_store.creds.ecodia_climate_mcp_bearer`, per the narrow-connector doctrine.

## W1. Schema (build now)

One migration file per table, REVOKE block + reason comment on each. Tables:

`cd_engagements`: id uuid pk default gen_random_uuid(), entity_name text, abn text, reporting_period_start date, reporting_period_end date, group_classification text, contacts jsonb, scope_boundary jsonb, status text check (status in ('setup','retainer','paused','closed')), created_at timestamptz default now().

`cd_evidence_items`: id uuid pk, engagement_id uuid fk, seq bigint, doc_sha256 text, storage_path text, source_channel text check (source_channel in ('email','workbook','api','manual')), document_type text, facility text, period_start date, period_end date, scope_category text, classifier_version text, classification_confidence numeric, payload jsonb, supersedes_id uuid references cd_evidence_items(id), prev_hash text, row_hash text, captured_at timestamptz, committed_at timestamptz default now(), unique (engagement_id, seq). Append-only: a trigger rejects UPDATE and DELETE; corrections append a superseding row. row_hash = sha256 over the canonical JSON of the content columns plus prev_hash.

`cd_anchors`: id uuid pk, engagement_id uuid fk, chain_head_hash text, seq_from bigint, seq_to bigint, anchored_to text check (anchored_to in ('neo4j','polygon')), anchor_ref text, anchored_at timestamptz default now().

`cd_factors`: id uuid pk, factor_set text, vintage text, category text, unit text, value numeric, effective_from date, effective_to date, source_url text. Loaded per published National Greenhouse Accounts vintage; never edited in place, new vintage = new rows.

`cd_calc_runs`: id uuid pk, engagement_id uuid fk, calculator text, code_sha text, factor_vintage text, inputs_hash text, evidence_ids uuid[], output_tco2e numeric, output_breakdown jsonb, run_at timestamptz default now(), superseded_by uuid.

`cd_clause_register`: id uuid pk, standard text default 'AASB_S2', standard_version text, clause_ref text, requirement_summary text, evidence_types text[], applicability_notes text, unique (standard, standard_version, clause_ref).

`cd_disclosure_drafts`: id uuid pk, engagement_id uuid fk, clause_ref text, draft_text text, evidence_citations uuid[], status text check (status in ('drafted','gap','entity_review','final')), version int, created_at timestamptz default now(). Grounding enforced at the schema layer, not by reviewer discipline: `check (status = 'gap' or coalesce(array_length(evidence_citations, 1), 0) > 0)`. The coalesce is load-bearing: array_length returns NULL for both NULL and empty arrays, and a NULL CHECK admits the row, so the un-coalesced form silently accepts citation-less drafts (caught empirically by the W1 build agent against postgres 16, 2026-06-10).

`cd_expected_documents`: id uuid pk, engagement_id uuid fk, facility text, document_type text, cadence text check (cadence in ('monthly','quarterly','annual')), grace_days int default 14. A `cd_coverage` view joins expected against committed evidence per period; the chase cron reads the view, never recomputes coverage in prompt.

`cd_monitoring_events`: id uuid pk, engagement_id uuid fk, event_type text check (event_type in ('factor_update','coverage_gap','drift','threshold_breach','integrity_ok','integrity_fail','classifier_sample')), detail jsonb, detected_at timestamptz default now(), resolved_at timestamptz.

Verify gate: migrations apply clean to a scratch project; the grants-detection SQL from the grants pattern returns NULL api_grants for every cd_* table (intentionally invisible to PostgREST); the append-only trigger rejects an UPDATE in a test; the grounding CHECK rejects a citation-less draft.

## W2. Hash-chain library + integrity checker (build now)

`backend/src/services/climate/evidenceChain.js`: canonicalise(row) -> stable JSON, hashRow(row, prevHash), verifyChain(rows) walking seq order and recomputing every link, buildAnchorDigest(rows). Pure functions over caller-fetched rows; the caller owns the DB read (as-built correction 2026-06-10; the original engagementId-taking signatures contradicted the pure-function stance). Property tests: tampering any historical row breaks verification at exactly that seq; out-of-order seq detected; supersession does not break the chain.

Verify gate: tamper test red-then-green in CI; verifyChain over a 10k-row synthetic register completes under 30s.

## W3. Calculation engine (build now)

`backend/src/services/climate/calculators/`: fuelCombustionS1, refrigerantsS1, electricityS2Location, electricityS2Market. Pure functions: (activityRows, factorVintage, methodElection) -> {tco2e, breakdown, evidenceIds, inputsHash}, where factorVintage is {vintage, factors} carrying caller-fetched cd_factors rows (as-built correction 2026-06-10: the original "pure functions" plus "factor loader reads cd_factors" was contradictory; the caller owns the DB read and factorLoader selects by vintage with effective-date logic over the passed rows, throwing on ambiguous selection). Method election is per facility (GHG Protocol default; NGER Determination methods allowed for NGER-covered facilities per AASB S2025-1, Dec 2025) and is recorded on every calc run. Open schema item for a later migration: cd_factors lacks a uniqueness constraint on (factor_set, vintage, category, effective_from), so effective-date ambiguity is representable at the DB level; the loader's throw-on-ambiguity is the compensating control until then. Each public NGA/NGER worked example we can find becomes a golden fixture; the fixture file cites its source URL.

Verify gate: golden suite green; a factor-vintage bump changes outputs ONLY via new cd_calc_runs rows (old runs immutable, superseded_by set); decimal handling uses integer micro-units or a decimal lib, never floats on the disclosed figure.

## W4. Clause register content (build now)

Transcribe AASB S2 (September 2024 standard plus the AASB S2025-1 December 2025 amendment) into cd_clause_register rows: one row per disclosure requirement across governance, strategy, risk management, metrics and targets, with evidence_types mapped per the Phase 1 research (lane: evidence mapping). Include the Corporations Act overlays that bind drafting even though they sit outside the standard, s 296D's minimum two scenario analyses (one consistent with 1.5 degrees C, one well exceeding 2 degrees C) first among them. Authored as a seed SQL file + a source-anchored markdown sibling for review. This is reading-and-structuring work, dispatchable to a worker with the standard text.

Verify gate: row count reconciles against a section-by-section checklist of the published standard; every row carries at least one evidence_type; spot-check of 10 random rows against the standard text by a second worker.

## W5. Ingest + classification (build now, parsers accrete per client)

Email path reuses the Gmail service-account extraction recipe; ingest address is a plus-address per engagement; attachments file to the private `evidence` bucket under `<engagement_id>/raw/`. Classifier worker brief: given a document, emit document_type, facility, period, scope_category, confidence; below-threshold confidence stages for the monthly classifier_sample queue instead of auto-commit. Workbook path reuses the reverse-Excel-sync substrate (project `tjutlbzekfouwsiaplbr` pattern, ported).

Verify gate: end-to-end test, send a fixture invoice to the ingest address, evidence row committed with correct sha256 and chain link, under 10 minutes.

## W6. Renderers (build now)

Pack exporter: register export (CSV + JSON), methodology memo (templated markdown -> PDF), draft statements (HTML -> PDF, clean professional client register, NOT the Ecodia internal aesthetic), coverage and gap reports from cd_coverage and cd_disclosure_drafts. Reuse the existing render-pdf wrapper mechanics.

Verify gate: pack export is byte-reproducible from the same register state (same input hash -> same output hash, timestamps externalised).

## W7. MCP connector `ecodia-climate` (build now)

Tools: cd_engagement_create, cd_engagement_query, cd_evidence_stage, cd_evidence_commit, cd_register_query, cd_coverage_query, cd_calc_run, cd_draft_upsert, cd_drafts_query, cd_pack_export, cd_integrity_check, cd_event_log. Mounted on the VPS API beside the existing narrow connectors; explicit zod schemas per [[mcp-tool-param-schema-discipline]]; passthrough ctx args declared explicitly.

Verify gate: each tool exercised against a scratch project from a worker tab using the scoped bearer; deny-by-default confirmed for every other bearer.

## W8. Cron set + prompt templates (build now)

Global crons (register on `ecodia-scheduler` at ship time, not at first client): standards-watch (monthly, AASB + AUASB pages diffed, emits cd-relevant deltas to status_board), factors-watch (monthly check for new NGA vintage; on hit, load + recalc-all + drift events). Per-engagement cron templates (instantiated at R1): monthly-cycle, weekly-chase (setup phase only), daily-anchor. Prompt bodies carry full context per the cron-worker-prompt-template pattern, each with a deliverable and a verify gate; fires that find nothing still write the integrity_ok event, so silence is detectable per [[health-canary-must-alert-not-silently-accumulate]].

Verify gate: each template dry-run fired once against the scratch engagement; coord signal-done observed; monitoring_events rows present.

## W9. The public worked example (build now; the demo IS the marketing)

A complete sample engagement on a synthetic mid-size company ("Exemplar Pty Ltd", a fictional 30 June balancer with two sites, a vehicle fleet, and grid electricity in two states; all data invented but realistic and labelled as such on every page). Run the full pipeline over it: evidence register with a real hash chain, calc runs against the current NGA vintage, clause-mapped draft statements, gap analysis, the auditor-facing pack, and a Polygon-anchored chain head anyone can verify. Published as a public artifact the way the Cofound page publishes the live contract and the signed deeds: the strongest section of that page is the thing you can read without trusting us. A Group 2 CFO, or the partner at a mid-tier firm, opens the sample pack and sees exactly what their auditor would receive. No consultancy publishes this because no consultancy's delivery is reproducible enough to publish.

Verify gate: the sample pack regenerates byte-identical from the fixture data; the anchor transaction is live and the chain head recomputes to it; every page carries the synthetic-data label.

## W10. Client-gated items (do NOT build before a signed engagement)

Supabase project provisioning + storage bucket + bearer minting; ingest address creation; Polygon anchor wiring (the contract exists, the writer needs gas wallet hygiene review); per-retailer document parsers; the entity-facing monthly note template tuned to the first client's house style.

## Sequencing for dispatch

W1 + W2 first (the spine), then W3 and W4 in parallel (independent), then W5 to W8 in any order, then W9 once W1 to W6 stand (it exercises all of them end to end and doubles as the integration test). W4 needs the AASB S2 text on hand. Total estimate: 5 to 7 worker-days of dispatched build, all within subscription budget, zero external spend before a client signs (the W9 Polygon anchor costs cents in gas on the existing wallet).

Every brief dispatched from this spec carries: this file path, the architecture file path, the W-item verify gate verbatim, and the reminder that client evidence never touches the EcodiaOS substrate project. Worker's final act: `coord.close_my_tab`.

## Red-team amendments (2026-06-10, wf_017d6d7e-830)

W9 is re-cut to a minimal vertical slice shipped within two weeks: one site, two evidence types (fuel card + electricity invoice), one calculator, ten clauses, a real hash chain, a real anchor. The full Exemplar pack follows. The slice is the trust artifact every send links to, and it ships only after the pack format is sanity-checked with at least one assurance practitioner.

W5 gains the extraction-accuracy layer as a gated sub-item: dual-pass extraction with disagreement quarantine, unit dimensional checks, meter-read continuity checks, golden tests per document family. Verify gate: a seeded corruption (wrong unit, transposed digits) is caught by the checks, never silently committed.

New W11, vendor-DD pack (build now, blocking Gate 2 outreach): security architecture one-pager, subprocessor register including the LLM with a no-training and data-residency statement, Essential Eight self-assessment, PI certificate slot, the client-owned-Supabase-org provisioning recipe, and the APES GN 30 compliance memo for firm partners. This pack is what survives a risk partner's first twenty minutes.

New W12, partner reviewer surface: reviewer queue + per-R-step firm sign-off gates on cd_disclosure_drafts and high-materiality cd_evidence_items (the materiality threshold lives on cd_engagements). Small UI or structured-email surface; spec'd with the first boutique pilot.
