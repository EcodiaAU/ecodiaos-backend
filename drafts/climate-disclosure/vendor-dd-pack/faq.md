---
slug: climate-vendor-dd-faq
date: 2026-06-11
register: doctrine
relates_to: docs/reference/climate-disclosure-line-canonical-map-2026-06-10.md
audience: the risk team at a firm or reporting entity, pre-signature
---

verified-from:
- docs/reference/climate-disclosure-line-canonical-map-2026-06-10.md (substrate facts, insurance state, gates)
- drafts/climate-disclosure/pi-insurance-quotes-2026-06-10.md (insurance placement position)
- https://ecodia.au/climate-disclosure/sample-pack (live verification surface)
- https://www.anthropic.com/legal/commercial-terms (fetched 2026-06-11, no-training clause)

# Questions a risk team asks, answered short

**Where does our data live?** In a dedicated Supabase database project in Sydney that exists only for your engagement, optionally inside your own Supabase organisation so you hold the keys. Nothing is pooled with other clients.

**Who can read it?** The engagement's scoped service credentials, and nobody else in normal operation. The public API surface of every evidence table is revoked at provisioning, and Tate Donohoe can be granted read access at your request.

**An AI prepares this. What happens when it gets something wrong?** The numbers come from deterministic code, never from a model, and they recompute from source on demand. The model only classifies documents and drafts prose; a classification it is unsure of goes to a human-review queue instead of into your register, and a draft sentence cannot save without citing the evidence rows behind it.

**Does our data train anyone's AI?** No. Anthropic's commercial terms, checked 2026-06-11, state that Anthropic may not train models on customer content from its services. The full subprocessor register names every party that touches data and why.

**Is this assurance?** No. Ecodia prepares evidence, calculations and drafts. Your directors declare, and your registered company auditor provides assurance. Our deliverables never carry the words assurance, audit, review, verification or certification, and the contract names those exclusions.

**What does our auditor get?** A pack they can test against: the hash-chained register, a methodology memo tracing every figure to its calculation run and factor vintage, clause-mapped drafts with citations, and an integrity manifest. The public sample at ecodia.au/climate-disclosure/sample-pack shows the exact shape.

**How do we know history was not edited?** The database physically rejects edits to evidence rows; corrections append as new rows that supersede the old, visibly. You can test this property yourself on the sample pack by recomputing the published hashes.

**What insurance do you carry?** Public liability is in place. Professional indemnity for this service line is being placed now with the AI delivery model disclosed to the brokers in writing; the quote and limits will be shared before any engagement signs.

**What happens if Ecodia shuts down?** You hold the data (your project, plus monthly register exports in your storage), and the pack regenerates deterministically from the register without our systems. Exit on 60 days notice hands over everything.

**Who do we call?** Tate Donohoe, the named principal (tate@ecodia.au), or the engagement address code@ecodia.au, which the operating intelligence answers directly.
