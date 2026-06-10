# W9 Exemplar run report, 2026-06-10

SYNTHETIC DATA: Exemplar Pty Ltd is a fictional company. Every fixture, row and figure below is invented and labelled as such; quantities deliberately mirror the published NGA Factors 2025 worked examples so every disclosed figure is externally checkable against the government's own workbook.

Run by the conductor via `scripts/climate-exemplar-run.js` on the LIVE dedicated project (ecodia-climate-zero, ref cxaaaomqjszlpobcfkmg), beside and never touching engagement zero. Wall time 3.7 seconds. The script proved idempotent in anger: two earlier partial attempts (killed by account-cap auth errors and one contract mismatch) left rows behind, and the final run resumed cleanly with zero duplicates.

## Identity

- Engagement: 417950e9-25cf-4518-9ecc-29949048ff02 (Exemplar Pty Ltd, period 2026-07-01 to 2027-06-30, two sites + diesel fleet)
- Evidence chain: 7 rows, seq 1 to 7, head hash `da86823725b10d39d97b363c8aa0fba6798737e6840d58527bf53327583184fc`
- verifyChain over live-fetched normalised rows: valid true, brokenAtSeq null
- Confirmation path exercised: the pending waste invoice confirmed by an appended superseding row (append-as-supersede, never UPDATE)

## Calculations (live cd_calc_runs, NGA-2025 vintage, golden cross-check)

Every figure recomputed on the live substrate matches the calculator golden suite, which itself recomputes the published NGA 2025 worked examples:

- electricityS2Location (QLD office): 18620.000000 t CO2-e, matches golden expected exactly
- electricityS2Market (NSW warehouse with synthetic PPA): 6839.611650 t CO2-e, matches exactly
- fuelCombustionS1 (diesel fleet, transport): 27139.660000 t CO2-e, matches exactly
- refrigerantsS1 (R410A leakage basis): 0.202020 t CO2-e, matches exactly

## The byte-identical gate (the W9 headline)

The full auditor pack (register CSV + JSON, methodology memo, draft statements HTML, coverage report, manifest) was rendered twice from two independent fresh database fetches:

- pack_sha256 run 1: `14bf4aa75b88d613e314ff6b0533cedb7bbdfc737cd9b570594f507ee0154d02`
- pack_sha256 run 2: `14bf4aa75b88d613e314ff6b0533cedb7bbdfc737cd9b570594f507ee0154d02`

Identical, artifact by artifact and as a whole. Pack on disk at `climate-testing/exemplar/pack/`.

## Adversarial pass (attempt, expected, observed)

1. Tamper UPDATE on a historical row: expected trigger rejection; observed rejected, "cd_evidence_items is append-only: UPDATE rejected. Corrections append a superseding row".
2. Duplicate seq insert: expected unique violation; observed rejected, `cd_evidence_items_engagement_id_seq_key`.
3. not_evidence document through commitEvidence: expected refusal; observed refused, "is_evidence:false (not_evidence) classifications never enter the evidence register".
4. Ambiguous duplicate factor row: expected factorLoader throw; observed thrown, "ambiguous selection (2 rows share effective_from 2025-07-01)".

Zero attacks silently absorbed. A `cd_monitoring_events` integrity_ok row records the run with the chain head and pack hash.

## Simplifications and follow-ups

- Source documents are labelled text fixtures, not PDFs; the MIME/PDF ingest path is exercised by engagement zero with real invoices. The publication step (public sample-pack page + Polygon anchor of pack_sha256) is the next W9 part and the launch gate for any public post.
- Earlier defect found by this run and fixed in the script pattern: `source_channel` is CHECK-constrained to email/workbook/api/manual ('manual' is the fixture path), and `packManifest` returns `{manifest, json}`, not a string. Both are script-consumer lessons, no library defects.

## Stage-1 exit criteria position after this run

1. Document zoo: pass 1 complete, 0 silent failures, classifier hardened (W5.1). Positive-path retailer formats remain for pass 2.
2. Engagement zero: live, verified chain over real invoices, idempotent. One full clean monthly cycle still to elapse (cron registered territory).
3. Exemplar end-to-end + adversarial: PASSED as above.
