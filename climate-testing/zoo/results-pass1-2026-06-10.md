# Document zoo - classification pass 1 - 2026-06-10

Classifier: EcodiaOS (Claude, interactive session) acting as the injected `classifierFn` per
`src/services/climate/ingest/classify.js`. Output contract matched exactly: `{ document_type,
facility, period_start, period_end, scope_category, confidence, staged_for_review, reason }`,
threshold 0.8, staged whenever confidence is below threshold or the document is ambiguous.
Corpus: 48 real PDFs at `climate-testing/zoo/raw/`, provenance in `climate-testing/zoo/MANIFEST.json`.
Text extraction: `pdf-parse` (already in `node_modules`, the production-adjacent path), first 2 pages
per document. One file over the 2MB cap was classified from filename + manifest metadata only
(recorded in its row). Engagement frame: Ecodia Pty Ltd's own emissions register (engagement zero),
current calculator set = electricity invoice + fuel card (scope 1/2 activity data).

Staging rule applied (stated so pass 2 can audit it): a document was staged when (a) it is supplier
spend carrying quantified compute or energy-proximate usage (a plausible scope 3 category 1 input
under a spend/usage method the pipeline does not yet have), (b) it is travel-shaped (scope 3
category 6 candidate), (c) it could only be classified from metadata, or (d) it is one of a
duplicate/version-conflict set. `facility` is null for every document in this corpus; the column is
omitted from the table. `scope_category` is `none` for outright refusals and `scope3` only on staged
rows where the document would be scope 3 evidence if a spend-based method were adopted.

## Per-document table

| # | File | From | document_type | scope | period | conf | staged | Reason |
|---|------|------|---------------|-------|--------|------|--------|--------|
| 1 | bd4c3423be5a_Ecodia-SeedTree-Earth-INV-2026-007.pdf | Ecodia (code@) | not_evidence | none | null | 0.92 | no | Own outbound revenue invoice (deposit to SeedTree); revenue, not purchased goods; no activity data |
| 2 | 36875436a0cb_..Yourcelium-Phase1-SOW-2026-06-10.pdf | Ecodia (code@) | not_evidence | none | null | 0.92 | no | Scope of work document; contractual prose, no emissions-relevant quantities |
| 3 | c26230f32f34_ordit-lod-craige-hills-2026-05-26.pdf | Ecodia (code@) | not_evidence | none | null | 0.92 | no | Letter of demand re unpaid invoice; legal correspondence, not evidence |
| 4 | 62fc2c7dc527_INV-2026-002.pdf | Ecodia (code@) | not_evidence | none | null | 0.92 | no | Own outbound revenue invoice (Ordit, dev hours); not a purchase, no activity data |
| 5 | bcf1e39f85ea_INV-2026-005-Ecodia.pdf | Ecodia (code@) | not_evidence | none | null | 0.92 | no | Own outbound revenue invoice (Co-Exist tech support); note: same invoice number as row 14 to a different client |
| 6 | 31a868d73492_INV-2026-004-Ecodia.pdf | Ecodia (code@) | not_evidence | none | null | 0.92 | no | Own outbound revenue invoice (Co-Exist retainer) |
| 7 | 01f2aeb8d2d0_154618054.pdf | DigitalOcean | not_evidence | scope3 | 2026-06-01 (payment) | 0.72 | yes | Payment receipt for cloud hosting spend; twin of row 8's invoice (double-count risk); scope3 spend candidate, no method in current pipeline |
| 8 | b9411a049d88_DigitalOcean_Invoice_2026_May_..pdf | DigitalOcean | not_evidence | scope3 | 2026-05-01..2026-05-31 | 0.70 | yes | Cloud hosting invoice with quantified droplet HOURS (usage data); strongest scope3 cat-1 candidate in corpus; vocabulary has no spend/usage-based type |
| 9 | eff0c5b169a0_INV-2026-003.pdf | code@ecodia.au | not_evidence | none | null | 0.92 | no | Own outbound revenue invoice (Co-Exist May retainer); GST $128.20 (conflicts with row 10's version) |
| 10 | 7c0da10675c5_inv-coexist-2026-003-FINAL.pdf | code@ecodia.au | not_evidence | none | null | 0.70 | yes | Second version of INV-2026-003 under a [TEST v2] subject with CONFLICTING GST figure ($130.20 vs $128.20 on identical subtotal); version-conflict set, staged on principle |
| 11 | 1811bfc69aba_ce-tax-invoice-001.pdf | code@ecodia.au | not_evidence | none | null | 0.90 | no | Own outbound invoice (INV-2026-001) delivered under a "[TEST] Attachment delivery test" subject; content authentic, provenance says fixture; refusal is safe either way |
| 12 | aa46a67724f1_yourcelium-build-context-for-tate.md.pdf | Ryan Moss (SeedTree) | not_evidence | none | null | 0.92 | no | Markdown-rendered scoping document; prose only |
| 13 | 9aaafde7659e_yourcelium-interface-boundary.md.pdf | Ryan Moss (SeedTree) | not_evidence | none | null | 0.92 | no | Markdown-rendered build spec; prose only |
| 14 | b2dca0bf0144_INV-2026-005-ryan-moss-seedtree.pdf | Tate (tate@) | not_evidence | none | null | 0.90 | no | Own outbound revenue invoice to SeedTree numbered INV-2026-005, COLLIDING with row 5's INV-2026-005 to Co-Exist; refusal unaffected, collision noted in taxonomy |
| 15 | c2bcf7b9dae4_5581083118.pdf | Google Payments | not_evidence | none | 2026-05-01..2026-05-31 | 0.82 | no | Google Workspace seat licences (software subscription); spend-only, no usage proxy for emissions; scope3 spend method would be a policy decision |
| 16 | e07d4d824997_Invoice-QBVZBHPL-0004.pdf | Fly.io (via Stripe) | not_evidence | scope3 | 2026-05-01..2026-05-31 | 0.68 | yes | Cloud compute invoice with machine-seconds and RAM usage by region (syd); energy-proximate usage; scope3 cat-1 candidate, no pipeline method |
| 17 | e4b0d4fe192a_Receipt-2235-3942.pdf | Fly.io (via Stripe) | not_evidence | scope3 | 2026-05-01..2026-05-31 | 0.68 | yes | Receipt twin of row 16, same transaction restated; double-count risk if both admitted |
| 18 | a005fd0a6114_visa-application-procedure-en.pdf | Altezza Travel | not_evidence | none | null | 0.90 | no | Visa application instructions; informational, no transaction, no activity data |
| 19 | 620f44b4bc3f_price-list-for-additional-services.pdf | Altezza Travel | not_evidence | none | null | 0.88 | no | Price list (Kilimanjaro add-ons); offer document, no transaction occurred |
| 20 | d5b38f016026_Amendment_003_..Ecodia_DAO_LLC..pdf | Google eSignatures | not_evidence | none | null | 0.93 | no | Executed legal amendment to DAO LLC founding documents; legal instrument |
| 21 | c4d7d851421a_Side_Deed_-_Governance_Rights..pdf | Google eSignatures | not_evidence | none | null | 0.93 | no | Executed Side Deed (governance rights); legal instrument |
| 22 | 7fe3fff1d5a6_Invoice-ZBVLXO-00007.pdf | Supabase | not_evidence | scope3 | 2026-04-24..2026-05-23 | 0.68 | yes | Cloud database invoice with per-project compute HOURS and egress GB; energy-proximate usage; scope3 cat-1 candidate, no pipeline method |
| 23 | 8b224fdcbe24_Receipt-ZBVLXO-00007.pdf | Supabase | not_evidence | scope3 | 2026-04-24..2026-05-23 | 0.68 | yes | Receipt twin of row 22, same line items restated; double-count risk |
| 24 | 46f38fac18b3_receipt_E67KB4NF.pdf | Humanitix | not_evidence | scope3 | 2026-06-04 (event) | 0.72 | yes | Event admission receipt (QLD Environment Day); implies business-travel/event attendance (scope3 cat-6 adjacent); also a composite doc with TWO tax entities in one PDF |
| 25 | bf19ae9a6d4c_AWXAU2604056344.pdf | Airwallex | not_evidence | none | 2026-04-10..2026-05-01 | 0.82 | no | Financial-services subscription fee statement; spend-only, no usage proxy; weakest scope3 signal among supplier docs |
| 26 | cd30e204ba51_Invoice-QBVZBHPL-0003.pdf | Fly.io (via Stripe) | not_evidence | scope3 | 2026-04-01..2026-04-30 | 0.68 | yes | Cloud compute invoice, machine-seconds usage (syd); scope3 cat-1 candidate, no pipeline method |
| 27 | 9d7ca84e821c_Receipt-2314-2534.pdf | Fly.io (via Stripe) | not_evidence | scope3 | 2026-04-01..2026-04-30 | 0.68 | yes | Receipt twin of row 26; double-count risk |
| 28 | 5d1291e288b8_5560286352.pdf | Google Payments | not_evidence | none | 2026-04-01..2026-04-30 | 0.82 | no | Google Workspace seat licences; spend-only subscription |
| 29 | 73740ec35fde_Invoice-8E4I4XBS-0004.pdf | Vercel (via Stripe) | not_evidence | none | 2026-04-30..2026-05-29 | 0.82 | no | Flat $20 Pro subscription; no usage quantities; spend-only |
| 30 | 49c9cddc6a7b_Receipt-2385-3903.pdf | Vercel (via Stripe) | not_evidence | none | 2026-04-30..2026-05-29 | 0.82 | no | Receipt twin of row 29; flat subscription, refused outright |
| 31 | c2e73b77e407_Invoice-ZBVLXO-00006.pdf | Supabase | not_evidence | scope3 | 2026-03-24..2026-04-23 | 0.68 | yes | Cloud database invoice with compute hours/egress; scope3 cat-1 candidate |
| 32 | bb71061cd6be_Receipt-ZBVLXO-00006.pdf | Supabase | not_evidence | scope3 | 2026-03-24..2026-04-23 | 0.68 | yes | Receipt twin of row 31; double-count risk |
| 33 | 27f5e1cbe1d9_Invoice-ZIX67BL7-0007.pdf | Vercel (via Stripe) | not_evidence | none | 2026-04-21..2026-05-20 | 0.82 | no | Flat $20 Pro subscription; spend-only |
| 34 | 94da0b12f047_Receipt-2203-8549.pdf | Vercel (via Stripe) | not_evidence | none | 2026-04-21..2026-05-20 | 0.82 | no | Receipt twin of row 33 |
| 35 | 6a4dc18c0c17_Invoice-QBVZBHPL-0002.pdf | Fly.io (via Stripe) | not_evidence | scope3 | 2026-03-01..2026-03-31 | 0.68 | yes | Cloud compute invoice, machine-seconds usage; scope3 cat-1 candidate |
| 36 | 6dd5196e9407_Receipt-2510-6798.pdf | Fly.io (via Stripe) | not_evidence | scope3 | 2026-03-01..2026-03-31 | 0.68 | yes | Receipt twin of row 35; double-count risk |
| 37 | 066e31bfe3cd_Invoice-5WQGPV8B-0005.pdf | Vercel (via Stripe) | not_evidence | none | 2026-04-06..2026-05-05 | 0.82 | no | Flat $20 Pro subscription; spend-only |
| 38 | 9d35440a5d30_Receipt-2304-8646.pdf | Vercel (via Stripe) | not_evidence | none | 2026-04-06..2026-05-05 | 0.82 | no | Receipt twin of row 37 |
| 39 | 736ac2e27f57_invoice_ECO-042026.pdf | Tate (tate@) | not_evidence | none | null | 0.92 | no | Own outbound revenue invoice (ESPS website rebuild) |
| 40 | 63bc356fb29e_2026_Sunshine-Coast-Show_Exhibitor-Handbook_1_.pdf | Sunshine Coast Show | not_evidence | none | null | 0.90 | no | 16-page exhibitor handbook; informational brochure |
| 41 | 25c12fc98539_5533480935.pdf | Google Payments | not_evidence | none | 2026-03-01..2026-03-31 | 0.82 | no | Google Workspace seat licences; spend-only subscription |
| 42 | f3319f5b909b_Invoice-HAOVH9CQ-0001.pdf | Upstash (via Stripe) | not_evidence | none | 2026-02..2026-03 | 0.80 | no | Pay-as-you-go request/storage costs ($7.73); usage exists but request counts are not energy-proximate; refused at threshold |
| 43 | 63a66aca62b9_Receipt-2729-4900.pdf | Upstash (via Stripe) | not_evidence | none | 2026-02..2026-03 | 0.80 | no | Receipt twin of row 42 |
| 44 | 9f69bd9d73bd_Intrepid_SOUTH_AFRICA_Itinerary_-_Final.pdf | Tate (personal gmail) | not_evidence | scope3 | null | 0.40 | yes | METADATA-ONLY (4.3MB exceeds 2MB content cap, content not read): travel itinerary, scope3 cat-6 candidate, but personal-vs-business undecidable without content; must be staged |
| 45 | ab33316a6a66_Co-Exist_Invoice_001.pdf | Tate (tate@) | not_evidence | none | null | 0.92 | no | Own outbound revenue invoice (EC-COEX-001) |
| 46 | fcaa642e2392_Co-Exist_App_Brief.pdf | Tate (tate@) | not_evidence | none | null | 0.92 | no | Board brief / proposal document; prose only |
| 47 | 0b349594970b_Co-Exist_App_Rollout_-_Team.pdf | Tate (tate@) | not_evidence | none | null | 0.92 | no | Internal rollout plan; prose only |
| 48 | fb6ad602eddd_Ecodia_Co-Exist_Agreement_1.pdf | Tate (tate@) | not_evidence | none | null | 0.92 | no | Software licensing and services agreement; legal instrument |

## Summary

- Total documents: 48
- Evidence-shaped (committable scope1/scope2 activity evidence under the current calculator set,
  i.e. electricity invoices, fuel invoices/card statements, refrigerant service records): **0 of 48.**
  The corpus contains no energy-retailer or fuel documents at all.
- Classified not_evidence: 48 of 48 (every document; this corpus is a pure refusal test).
- Staged for review: **15** (rows 7, 8, 10, 16, 17, 22, 23, 24, 26, 27, 31, 32, 35, 36, 44).
  All 15 stage for substantive reasons (scope3 spend/usage ambiguity, travel-shaped,
  metadata-only, version conflict), none for mechanical extraction failure.
- Confident refusals (not staged): 33.
- Mechanical breakers: **0.** All 47 parsed PDFs had a text layer; none were encrypted or corrupt;
  `pdf-parse` succeeded on every one. The single non-parse (row 44) was a deliberate size-policy
  skip (4.3MB > 2MB cap), not a document defect. One host-tooling note: this machine lacks
  poppler (`pdftoppm`), so image-only PDFs would have been unreadable in this pass; the corpus
  happened to contain none, so scanned-image handling remains UNTESTED (the spec's zoo
  description calls for scanned/photographed invoices; this corpus does not yet include any).

## Failure taxonomy

The distinct ways documents resisted classification, each with an example:

1. **Spend-evidence ambiguity (dominant, 12 staged docs).** Supplier cloud invoices carrying
   quantified, energy-proximate usage (Fly.io machine-seconds by region, DigitalOcean droplet
   hours, Supabase compute hours and egress GB) are plausible scope 3 category 1 inputs under a
   spend/usage-based method, but the pipeline has no such method and the document_type vocabulary
   has no spend-based type. Without an engagement-level policy ("spend-based scope 3: in or out"),
   the only honest behaviour is to stage every one. Example: `b9411a049d88_DigitalOcean_Invoice`.
2. **Invoice/receipt twin duplication.** Stripe-issued billing sends the same transaction as two
   PDFs in one email (Invoice-X + Receipt-X with identical line items). Nine such pairs in this
   corpus (Fly.io x3, Supabase x2, Vercel x3, Upstash x1) plus a DigitalOcean invoice + payment
   receipt pair. If both halves were admitted as evidence the amount double-counts. Dedup must key
   on the underlying transaction (vendor + invoice number + period), not on doc_sha256, which
   differs between the twins. Example: rows 16/17.
3. **Version and identifier conflicts.** INV-2026-003 exists in two versions with conflicting GST
   figures ($128.20 vs $130.20 on the same $1,282.00 subtotal; the "FINAL" one is arithmetically
   wrong). INV-2026-005 was issued to two different clients (Co-Exist and SeedTree). INV-2026-007
   states it supersedes an unsent draft INV-2026-005. Supersession logic is needed even when every
   variant is a refusal. Example: rows 9/10 and 5/14.
4. **Test-fixture provenance vs authentic content.** `ce-tax-invoice-001.pdf` is a fully-formed
   tax invoice delivered under the subject "[TEST] Attachment delivery test". Content says real,
   envelope says fixture. A classifier that never sees the email subject cannot catch this; the
   manifest metadata (passed as docMeta) is load-bearing. Example: row 11.
5. **Prose documents in PDF clothing.** Markdown-rendered specs (`*.md.pdf`), board briefs, SOWs,
   legal deeds: zero transactional structure, trivially refused, but they dominate the byte count
   of a real mailbox and must not waste review-queue capacity. Example: row 13.
6. **Oversize forces metadata-only classification.** The 4.3MB itinerary could only be judged from
   filename + sender. Sender is a personal gmail, so business-vs-personal travel (the scope 3
   cat 6 question) is undecidable; confidence collapses to 0.40 and the doc stages. Any size cap
   creates this class; the pipeline needs an explicit oversize lane. Example: row 44.
7. **Layout-mangled extraction.** Google invoices extract with label/value columns dissociated
   (dotted leaders, values appearing before their labels); Fly.io lines embed machine metadata and
   17-decimal unit prices mid-description. Classification survives, but field-level extraction
   keyed on positional order would mis-pair fields. The W5 dual-pass disagreement quarantine is
   the right defence. Example: row 41.
8. **Multi-entity composite documents.** The Humanitix receipt contains a receipt from Queensland
   Environment Day Ltd AND a separate tax invoice from Humanitix Limited in one PDF: one file, two
   suppliers, two ABNs, two totals. "One document = one evidence item" breaks here. Example: row 24.
9. **Implicit currency.** Fly.io/Vercel/Upstash bill in USD, Supabase shows "$93.60" against an AU
   ABN, DigitalOcean shows AU GST on USD amounts. Any future spend-based factor application needs
   explicit currency capture; the classify contract has no currency field. Example: row 8.

## Honest limits

- Pass 1 ground truth is my own judgement. I was both classifier and grader, so the headline
  numbers above (0 evidence-shaped, 33 confident refusals, 15 staged) describe MY behaviour, not
  measured accuracy. The accuracy NUMBER awaits an independent second pass (different judge,
  blind to these labels), per the stage-1 exit criterion. What stands on its own regardless of
  pass 2: the staging behaviour (nothing low-confidence or ambiguous was allowed to look
  committable; zero silent failures in the sense the spec demands) and the failure taxonomy,
  which is a property of the documents, not of my labels.
- The corpus does not yet contain the spec's hardest classes: no electricity/fuel retailer
  invoices (so the POSITIVE path is untested by this zoo), no scanned-image-only PDFs, no
  merged-cell spreadsheets, no credit notes. The zoo brief's own description mentions an
  insurance policy and Anthropic invoices; neither appears in the 48-item manifest. Pass 1
  therefore tests the refusal half of the problem only.
- The 2MB content cap and the missing poppler toolchain are properties of THIS pass's harness,
  not of the production ingest path; row 44's 0.40 confidence is a harness artifact as much as a
  document property.
- Scope marking convention: `scope3` on staged rows asserts only "would be scope 3 if admitted
  under a spend-based method", not that the document IS evidence. A reviewer clearing the staged
  queue decides.

## Contract verification

`npx jest src/services/climate/ingest --silent`: **58 tests passed, 0 failed** (2 suites: the
canonical `src/services/climate/ingest/__tests__/ingest.test.js` plus an identical copy jest's
sweep picked up under `.claude/worktrees/`). The shipped `classify.js` contract matches the one
used as the rubric for this pass: injected classifierFn, the 8-field result shape, 0.8 default
threshold, staged-never-throw on weird input.

Defects noticed in `classify.js` while using it as a rubric (for the W5 hardening list):

1. `document_type` is validated nowhere: classify.js passes any string through, the 002 migration
   column has no CHECK constraint, and the repo's own fixtures already drift
   (`electricity_invoice` in ingest tests vs `electricity_bill` in renderer fixtures, plus a
   fixture value containing a comma and quotes). Vocabulary fragmentation downstream is certain
   without an allowlist or at least a canonicaliser.
2. `period_start`/`period_end` are coerced with `asNullableString` only: no ISO-8601 validation,
   while the DB columns are `date`. A classifier returning "Apr 24 - May 23, 2026" satisfies the
   contract and then fails (or worse, coerces) at insert time.
3. `scope_category` is not validated against the scope1/scope2/scope3/none enum; any string
   passes, and 002 has no CHECK on that column either.
4. There is no structural is-evidence flag: `not_evidence` rides inside `document_type` as a
   sentinel string. A confident refusal (confidence 0.95, staged_for_review false) is structurally
   identical to committable evidence; downstream must string-match `not_evidence` to avoid
   registering it. One missed string-match away from a refusal entering the evidence chain.
5. `asNullableString` stringifies objects, so a classifier returning `facility: {name: "HQ"}`
   commits the literal string "[object Object]" instead of staging.
6. `staged()` returns confidence 0 and a prose-only reason: mechanically unclassifiable input,
   classifier crashes, and invalid classifier output are indistinguishable to a machine consumer
   (no failure code), which will make the monthly classifier_sample queue harder to triage.
7. Minor: the threshold check is strict (`confidence < threshold`), so exactly-0.8 commits; the
   spec language "below-confidence" agrees, but a classifier emitting a default 0.8 would
   auto-commit everything.
