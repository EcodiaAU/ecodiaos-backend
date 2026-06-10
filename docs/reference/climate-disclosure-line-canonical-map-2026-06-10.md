# Climate-disclosure line: the canonical map

triggers: climate disclosure, AASB S2, sample pack, exemplar, engagement zero, cd_ tables, climate-zero, evidence register, where does climate live, climate substrate map

The single front door for the AASB S2 climate-disclosure service line. A cold session reading only this file knows where everything lives, what is live, and what is gated. Built 2026-06-10 (the whole line went from brief to working system in one day); update this file whenever a location or live resource changes.

## What the line is

Ecodia runs the evidence register, emissions baseline and clause-mapped draft statements UNDERNEATH a reporting entity's AASB S2 sustainability report. Preparation, never assurance, never financial or tax advice (excluded by name in the contract; the terminology perimeter bans assurance/audit/review/verification/certification in all deliverables). Tate Donohoe is the accountable human principal; EcodiaOS delivers. Two channels: direct to Group 2 entities, and platform-under-letterhead for partner firms.

## The business documents (drafts/climate-disclosure/)

- `01-alignment-and-feasibility-verdict-2026-06-10.md`: the verdict, regulatory boundary map, steelman, sources. The regime facts live here (Group 2 = first FY from 1 Jul 2026, s 1707B phasing, ASSA 5010 year-1 scope, modified liability, AASB S1 voluntary).
- `02-productised-sow-template-2026-06-10.md`: deliverables, pricing (65k setup + 5.5k/mo direct; pilot 15-25k; partner flat licence 40-60k), scope boundary, red-team amendments (PI precondition, client-owned infra, disclosed platform).
- `03-autonomous-delivery-architecture-2026-06-10.md`: organ reuse, pipeline, R1-R10 runbook, human gates, automation ceiling.
- `04-substrate-build-spec-2026-06-10.md`: W1-W12 with verify gates, as-built corrections, and the STAGE-1 EXIT CRITERIA (Tate's reality-testing mandate: zoo, engagement zero, adversarial Exemplar).
- `07-gtm-and-demand-clock-2026-06-10.md`: boutiques-first GTM (Pangolin, Northmore Gordon, NettZero clean; mid-tiers occupied by Sumday), kill clock (Gate 2 2026-09-30 LOI-or-pilot; Gate 3 2026-12-31 signature-or-pipeline), Tate's bespoke-only outreach directive (amendment 7).
- `roadmap-2026-06-10.{html,pdf}`: the four-stage roadmap with triggers, in the internal aesthetic.
- `pi-insurance-quotes-2026-06-10.md`: the insurance market sweep (low thousands only at $1M-$2M; $8-25k at $5M with affirmative AI; AI exclusion is the default outcome), three broker paths, the disclosed risk description to use verbatim on every proposal form.
- `partner-dossiers-2026-06-10.md`: per-firm dossiers + alliance findings.
- `aasb-s2-continuous-evidence-substrate-2026-06-10.{html,pdf}`: the public whitepaper "Evidence that holds".
- `linkedin-post-2026-06-10.md`: HELD. DO NOT PUBLISH until launch-gate + author-surface pass (frontmatter carries both).
- `clause-register-source-map-2026-06-10.md`: the 94-row register's section-by-section reconciliation against the standard.
- `red-team-2026-06-10-raw.json`: the 6-lens red team output (workflow wf_017d6d7e-830).

## The code (all on github, ecodiaos backend repo)

- `climate-migrations/001-012` + `seed/011_cd_clause_register_seed.sql`: the cd_* schema. Append-only evidence trigger (UPDATE rejected for every role; confirmation is APPEND-AS-SUPERSEDE, never UPDATE), coverage view v2 (excludes pending + superseded), document-type CHECK (012), 94-row AASB S2 clause register.
- `src/services/climate/evidenceChain.js`: canonicalise, hashRow, verifyChain, buildAnchorDigest, confirmEvidence, normaliseFetchedRow (the ONE driver-type normaliser; postgres.js returns bigint/numeric as strings and dates as Date, raw rows never re-verify).
- `src/services/climate/calculators/`: fuelCombustionS1, refrigerantsS1, electricityS2Location, electricityS2Market + factorLoader. Pure functions, BigInt micro-units, factorVintage = {vintage, factors} caller-fetched. Golden fixtures recompute NGA Factors 2025 published worked examples exactly (fixture files cite source URLs).
- `src/services/climate/ingest/`: emailIngest (zero-dep MIME), classify (injected classifierFn, staged_for_review below threshold 0.8 closed-boundary, is_evidence structural flag, machine failure_codes), commitEvidence (refuses not_evidence at build time), workbookIngest (zero-dep XLSX).
- `src/services/climate/renderers/`: registerExport, methodologyMemo, draftStatements, coverageReport, packManifest. Byte-reproducible (no clock, no randomness; asOf is a parameter).
- `src/services/climate/connector/` + `src/routes/mcp/ecodiaClimate.js`: the ecodia-climate MCP connector, 12 cd_* tools, INERT until mount day (uncomment in app.js ~361 + auth-exempt regex ~210 + CLIMATE_DATABASE_URL env + bearer kv row creds.ecodia_climate_mcp_bearer).
- `climate-crons/`: 5 prompt templates + render-template.js + register-climate-crons.js (dry-run default).
- Tests: `npx jest src/services/climate` (1476 green at last conductor run). Every agent-built item was re-verified by the conductor before cherry-pick.

## Live resources

- Supabase project `ecodia-climate-zero`, ref `cxaaaomqjszlpobcfkmg`, Sydney, FREE org (Code Free), $0/mo. Migrations 001-012 + clause seed applied. Conn: aws-1-ap-southeast-2.pooler.supabase.com:5432 (session mode), user postgres.cxaaaomqjszlpobcfkmg, password at `/Users/ecodia/PRIVATE/ecodia-creds/climate-zero.env` (CLIMATE_ZERO_DB_PASS; never via MCP creds).
- Engagement zero: Ecodia Pty Ltd, id `091efa78-46ce-4ad3-8af4-92dc4453d06a`, 7 real cloud invoices in a verified chain (head 1e187479...), report at `climate-testing/engagement-zero-report-2026-06-10.md`, re-runnable via `scripts/climate-engagement-zero-bootstrap.js`.
- Exemplar (synthetic, W9): Exemplar Pty Ltd, id `417950e9-25cf-4518-9ecc-29949048ff02`, chain head da868237..., pack_sha256 14bf4aa7... byte-identical across renders, adversarial pass 4/4 rejected. Report at `climate-testing/exemplar/exemplar-run-report-2026-06-10.md`, re-runnable via `scripts/climate-exemplar-run.js`.
- Document zoo: 48 real PDFs at `climate-testing/zoo/raw/` (gitignored; manifest committed), collector `scripts/climate-zoo-collect-2026-06-10.js`, pass-1 results committed.
- Global crons LIVE on ecodia-scheduler: `climate-standards-watch` (monthly, 1st 13:07 AEST) + `climate-factors-watch` (monthly, 2nd 13:21 AEST). Per-engagement templates register at R1 via `climate-crons/register-climate-crons.js` conventions.
- Public web: ecodia.au/climate-disclosure + /whitepaper LIVE on main. Sample-pack page + readable viewers STAGED on EcodiaSite branch `climate-sample-pack` (preview: ecodia-site-git-climate-sample-pack-ecodia.vercel.app), go-live = merge to main after Tate's eyes. Polygon anchor deferred pending W10 wallet hygiene review.

## Commercial state and gates (as of 2026-06-10 night)

PI inquiries sent to 3 brokers (upcover 19eaf33d, Clear 19eaf4a8, Lockton via lockton.au@lockton.com); replies feed 02 unit economics; if all return AI exclusions the line re-scopes (human reviewer in loop or software-licence lean) before any signature. Angelica reviewer path resolved negative; partner-channel supervision is the reviewer seat; fractional CA recruitment deferred to Gate-2 era. LinkedIn post held behind launch gate (sample pack live + Ecodia-branded surface). Outreach preconditions: PI quote in hand + alliance check clean + sample pack live. Tate's only acts: PI premium call, first signature, eventual Ecodia LinkedIn page.

## Where the rest of the record lives

status_board rows `145852bf` (build) + `1eb8218b` (commercial). Neo4j Episode 1284 + the red-team Decision (130). Doctrine: `patterns/public-publish-needs-launch-gate-and-author-surface-2026-06-10.md` (hard-block hook in dispatch-fact-gate.py). Auto-memory: `climate-disclosure-service-line-2026-06-10.md` + `feedback_public-publish-gate-2026-06-10.md`. The day's full conversation arc is in the 2026-06-10 conductor transcripts.
