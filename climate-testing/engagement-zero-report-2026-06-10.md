# Engagement zero bootstrap report, 2026-06-10

Stage-1 exit criterion 2 (drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md):
Ecodia Pty Ltd itself, running on the production substrate. First live exercise of the
W1 schema, W2 hash chain, W5 ingest/classify/commit contracts and the W5 binding design
note (confirmation is append-as-supersede, never UPDATE) against the dedicated
ecodia-climate-zero Supabase project (ref cxaaaomqjszlpobcfkmg).

Script: `scripts/climate-engagement-zero-bootstrap.js` (re-runnable, idempotent; second
run created nothing, exited 0). Library code unchanged; jest `src/services/climate`
green after the run: 79 suites, 1462 tests.

## What was created (live ids)

Engagement: `091efa78-46ce-4ad3-8af4-92dc4453d06a`
Ecodia Pty Ltd (ACN 693 123 278, recorded in the `abn` column as 'ACN 693 123 278'; the
Upstash invoice carries the derived ABN 89 693 123 278), reporting period 2025-07-01 to
2026-06-30, status `retainer`, group_classification `voluntary_engagement_zero`,
materiality_threshold 0 (everything requires confirmation; engagement zero runs strict).

Expected documents (5 rows, monthly `supplier_invoice`, grace 14 days): facilities
`cloud/anthropic`, `cloud/supabase`, `cloud/upstash`, `cloud/fly`, `cloud/digitalocean`.
Anthropic, Supabase and Upstash were the brief's floor; Fly.io and DigitalOcean are also
recurring monthly cloud spend in our real mailboxes (zoo provenance), so they are
expected too. Note: no Anthropic invoice PDF exists in the zoo corpus yet, so
`cloud/anthropic` is a standing coverage gap by design; the chase machinery should find it.

Evidence chain (7 rows, all REAL documents from `climate-testing/zoo/raw`, provenance in
`climate-testing/zoo/MANIFEST.json`, sha256 recomputed from bytes and cross-checked at
ingest):

| seq | id | document | facility | period | status |
|-----|----|----------|----------|--------|--------|
| 1 | f4e909dc-17f9-40b8-a79d-0e46cb1cff4a | DigitalOcean invoice 546123278 (743 droplet hours) | cloud/digitalocean | 2026-05-01 to 2026-05-31 | pending_confirmation (superseded by seq 7) |
| 2 | 24508e78-c9a1-437f-9572-a5c139569cef | Upstash HAOVH9CQ-0001 (PAYG request + storage cost) | cloud/upstash | 2026-02-01 to 2026-03-31 | pending_confirmation |
| 3 | 48df6aca-1642-4ce1-9143-6836547c927d | Supabase ZBVLXO-00007 (compute hrs, storage GB-hrs, egress) | cloud/supabase | 2026-04-24 to 2026-05-23 | pending_confirmation |
| 4 | 40aad313-a08a-4caa-9231-be0bccc37f72 | Supabase ZBVLXO-00006 | cloud/supabase | 2026-03-24 to 2026-04-23 | pending_confirmation |
| 5 | a2e56d55-da88-49dc-beaa-c134fff6c7c5 | Fly.io QBVZBHPL-0004 (machine-seconds, bandwidth by region) | cloud/fly | 2026-05-01 to 2026-05-31 | pending_confirmation |
| 6 | 9ea92a9b-bc06-4165-b20e-c6d4a94dd9e6 | Fly.io QBVZBHPL-0003 | cloud/fly | 2026-04-01 to 2026-04-30 | pending_confirmation |
| 7 | 4e35e71c-a683-4d73-b0b7-de14e9d57b4f | confirmation of seq 1 (append-as-supersede) | cloud/digitalocean | 2026-05-01 to 2026-05-31 | confirmed |

Receipt twins of these invoices exist in the zoo and were deliberately NOT ingested
(double-count risk, per the zoo pass-1 taxonomy). All six classified honestly as
`supplier_invoice` / `scope3` with confidence 0.68 to 0.72, below the 0.8 threshold:
document type and period are unambiguous, but the pipeline has no spend/usage-based
scope-3 method yet, so every one staged for review and committed as
`pending_confirmation`, exactly as the zoo findings predicted. Zero auto-commits.

## Confirmation path (W5 binding design note, exercised live)

seq 7 was produced by `evidenceChain.confirmEvidence(pendingRow, fullChain)`: a NEW row
at the chain head carrying the same content, `confirmation_status = 'confirmed'`,
`supersedes_id = f4e909dc-...`. No UPDATE was attempted by the service; a deliberate
tamper probe (`update cd_evidence_items set facility='tamper-test' where seq=1`) was
rejected live by the 002 trigger even on the postgres role:
`cd_evidence_items is append-only: UPDATE rejected`.

## Chain verification (the headline probe)

Chain head hash: `1e187479143c71d12ef39cbe1896324b828e8877af779e2f3a31e1ca9b48ef3e`
(seq 1 to 7, row_count 7, via `buildAnchorDigest`).

verifyChain over the live fetched rows:

- RAW postgres.js rows: `{ valid: false, brokenAtSeq: 1 }`
- after caller-side type normalisation: `{ valid: true, brokenAtSeq: null }`

Both results are the truth and both matter; see the defects section.

## Coverage (cd_coverage v2, live)

60 period slots (5 facilities x 12 monthly periods over the reporting year).

- `covered` (strict: confirmed/auto, non-superseded): 1 slot. cloud/digitalocean 2026-05,
  covered by the seq-7 confirmed row. The superseded seq-1 row correctly does NOT count.
- `covered_including_pending`: 8 slots. The six pending invoices light up
  digitalocean 2026-05, fly 2026-04 and 2026-05, supabase 2026-03 through 2026-05,
  upstash 2026-02 and 2026-03 (the Upstash invoice spans two monthly slots, which the
  view's overlap join handled correctly).
- The covered/pending split behaves exactly as the 011 view intends: "arrived but
  unconfirmed" is visibly distinct from "nothing arrived".

Monitoring: `cd_monitoring_events` integrity_ok row written per run with
`detail = { kind: 'engagement_zero_bootstrap', chain_length: 7, verified: true,
chain_head_hash: '1e187479...', seq_to: 7 }`. Two integrity_ok events exist (one per
run); events are a time-series feed, so per-run rows are correct, not duplication.

## What the live run taught: library vs live database

The W7 agent predicted seq/numeric/Date normalisation issues. The prediction is
CONFIRMED, with exact shapes (probed directly against the live pooler, postgres.js
3.4.x, session mode, prepare:false):

1. `seq` (bigint) comes back as a STRING ('1', not 1). `verifyChain` orders rows fine
   because it wraps seq in Number(), but `canonicalise` hashes seq as content, so
   '"1"' vs '1' in the canonical JSON breaks every row hash. brokenAtSeq: 1 on raw rows
   is this defect.
2. `classification_confidence` (numeric) comes back as a STRING ('0.68'). Same class of
   break.
3. `period_start` / `period_end` (date) come back as Date objects pinned to UTC midnight
   (`2026-05-01T00:00:00.000Z`). `normaliseValue` renders Date as full toISOString(),
   which does not equal the 'YYYY-MM-DD' string hashed at build time. Third break.
   Coercion via `.toISOString().slice(0, 10)` is safe BECAUSE postgres.js pins date to
   UTC midnight; a driver that parsed date in local time would shift the day under
   AEST. Worth a regression probe if the driver is ever swapped.
4. `captured_at` (timestamptz) round-trips CLEANLY with no coercion: postgres.js returns
   a Date, and `normaliseValue` renders any Date as toISOString(), which matches what was
   hashed when the caller supplied a Date at build time. Millisecond precision survived.
5. `payload` (jsonb) round-trips cleanly given the bootstrap convention of strings and
   integers only. Float values inside jsonb would round-trip through Postgres numeric
   text rendering (e.g. 2e-11 serialises to '0.00000000002' and re-parses to the same
   double), which is probably safe but was deliberately not relied on. Convention worth
   keeping: jsonb payload values as strings/integers.

No library change was needed or made. The evidenceChain contract is explicitly pure
(caller fetches rows and owns fetch semantics), and the caller-side fix is small:
`normaliseFetchedRow()` in the bootstrap script (seq -> Number, confidence -> Number,
date columns -> 'YYYY-MM-DD'). RECOMMENDATION for the W7 connector and every future live
caller: lift `normaliseFetchedRow` into the climate service (e.g.
`src/services/climate/ingest/fetchNormalise.js`) so each caller does not rediscover
defects 1 to 3; any caller that runs verifyChain on raw driver rows will read a healthy
chain as corrupt.

Other live findings:

- The insert path must hand `payload` through `sql.json()`; postgres.js does not
  reliably infer jsonb from a plain object on dynamic inserts.
- `cd_expected_documents` has no vendor column; facility is the vendor slot. Coverage
  joins evidence to expectation on `facility is not distinct from`, so the classifier
  MUST emit the same facility slug the expectation rows use (`cloud/<vendor>`). The zoo
  pass-1 left facility null on every document; engagement zero establishes the slug
  convention, and it needs to be written into the classifier brief or coverage silently
  never matches.
- pdf-parse in node_modules is v2: `new PDFParse({ data }).getText()`, not the v1
  callable-module API.

## Idempotency proof

Second run output: engagement reused, 0 expected documents created, 0 evidence ingested
(all 6 sha256s already in chain), confirmation skipped (superseding row exists),
verify re-ran green, exit 0. Keying: engagement on entity_name + period, expected docs
on engagement + facility + document_type, evidence on doc_sha256 within the engagement,
confirmation on existence of a superseding row.
