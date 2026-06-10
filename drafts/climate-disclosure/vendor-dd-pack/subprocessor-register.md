---
slug: climate-vendor-dd-subprocessor-register
date: 2026-06-11
register: doctrine
relates_to: docs/reference/climate-disclosure-line-canonical-map-2026-06-10.md
audience: the risk team at a firm or reporting entity, pre-signature; APES 305 disclosure shape
---

verified-from:
- https://www.anthropic.com/legal/commercial-terms (fetched 2026-06-11; quoted clause below)
- docs/reference/climate-disclosure-line-canonical-map-2026-06-10.md (which system holds what)
- drafts/climate-disclosure/02-productised-sow-template-2026-06-10.md (disclosed-platform amendment)

# Subprocessor register

Firms engaging Ecodia as the platform under their letterhead disclose their outsourced service providers under APES 305; this register is written so it can be handed on as that disclosure. Direct clients receive the same register in the engagement pack.

**Supabase** (database and document storage). Hosts each engagement's dedicated project in Sydney, ap-southeast-2: the evidence register, source document files, calculation runs and drafts. Holds all client evidence at rest. Optionally provisioned inside the client's own Supabase organisation.

**Anthropic** (language model provider). Receives source-document text for classification and register-grounded drafting, the two model steps in the data-flow document. Under Anthropic's commercial terms, fetched and checked on 2026-06-11: "Anthropic may not train models on Customer Content from Services." No client evidence is stored with Anthropic beyond request processing.

**Google Workspace** (ingest mailboxes). The engagement's ingest email address receives source documents in transit before they are fingerprinted and filed to the engagement project.

**Vercel** (public web hosting). Serves ecodia.au, including the public sample pack. Holds no client data; nothing from any engagement is published.

**GitHub** (code hosting). Holds the platform's source code and its tests. Holds no client data; the evidence schema enforces that engagement data lives only in the engagement project.

No other party receives client data. Any addition to this register is disclosed to affected clients before it takes effect, with the updated register reissued.
