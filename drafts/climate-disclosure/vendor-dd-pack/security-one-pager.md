---
slug: climate-vendor-dd-security-one-pager
date: 2026-06-11
register: doctrine
relates_to: docs/reference/climate-disclosure-line-canonical-map-2026-06-10.md
audience: the risk team at a firm or reporting entity, pre-signature
---

verified-from:
- docs/reference/climate-disclosure-line-canonical-map-2026-06-10.md (substrate facts: dedicated project, region, grants posture, exit terms)
- climate-testing/exemplar/exemplar-run-report-2026-06-10.md (adversarial results, byte-identical proof)
- https://ecodia.au/climate-disclosure/sample-pack (live hashes, curl-verified 2026-06-10)
- drafts/climate-disclosure/02-productised-sow-template-2026-06-10.md (termination and client-owned-org terms)

# Security one-pager: the climate-disclosure evidence substrate

**Isolation.** Every engagement runs on its own dedicated Supabase project in the Sydney region (ap-southeast-2). Client evidence never shares a database with another client or with Ecodia's own operating systems. On request the project is provisioned inside the client's own Supabase organisation, owned by the client and operated by Ecodia under scoped credentials, so vendor continuity is answered by ownership.

**The register cannot be quietly rewritten.** Evidence rows are hash-chained: each row's hash covers its content plus the hash of the row before it, and a database-level trigger rejects UPDATE on the evidence table for every role, including Ecodia's own service role. Corrections append a superseding row, so every correction is itself a permanent, auditable event. The claim was tested adversarially on the live substrate on 2026-06-10: a direct tamper UPDATE was rejected by the trigger, and a forged duplicate sequence number was rejected by a uniqueness constraint. The run is reproducible from `scripts/climate-exemplar-run.js` and its report is in the engagement record.

**The deliverable is reproducible.** The auditor-facing pack regenerates byte-for-byte identical from the register. The public demonstration is at https://ecodia.au/climate-disclosure/sample-pack: a complete pack for a fictional company, every artifact carrying its sha256, the whole pack hashing to `14bf4aa75b88d613e314ff6b0533cedb7bbdfc737cd9b570594f507ee0154d02` across two independent renders. Anyone can download the artifacts and recompute the hashes.

**Access.** No human holds a password to client data in normal operation. The pipeline authenticates with per-engagement scoped service credentials stored outside the codebase, and the public API surface of every evidence table is revoked, verified per table at provisioning. Tate Donohoe, the accountable principal, can be granted read access at the client's request.

**Data residency.** Database and document storage stay in Sydney. Classification and drafting calls to the model provider are the only data that leaves the engagement project; the data-flow document and the subprocessor register cover exactly what is sent and under what terms.

**Exit.** On termination (either party, 60 days), the client receives the full register export and the current pack. The evidence is the client's, always, and the pack regenerates from the export without Ecodia.
