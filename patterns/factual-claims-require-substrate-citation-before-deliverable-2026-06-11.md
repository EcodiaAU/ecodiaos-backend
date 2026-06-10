---
binding: hook=unverified-claim-gate.py + skill=knowledge-route
triggers: brief, prep brief, prep doc, prep document, outbound, deliverable, handout, one-pager, talking points, executive summary, draft brief, prep_brief, internal brief
---

# Factual claims require substrate citation before reaching a deliverable surface

**status:** active
**authored:** 2026-06-11
**origin incident:** Woodfordia site visit prep brief 2026-06-10, P0 callout from Tate 2026-06-11
**strengthens:** [[verify-before-asserting-in-durable-memory]], [[claim-inflation-calibration-hook-2026-05-31]]
**related:** [[legal-letter-name-verify]] (the narrow precedent. this is the general rule)

---

## The rule

**No deliverable artefact carries a named-person role, title, identity attribution, monetary figure, date, quoted statement, or any other discrete factual claim unless that exact claim is cited inline against a substrate source the worker actually read.**

Deliverable artefact means: anything that will be read by Tate, a client, or a counterparty as authoritative. Prep briefs, status one-pagers, outbound emails, SoWs, invoices, PDFs, talking-point handouts, board memos, client reports. It is the opposite of an internal exploration scratchpad.

A "citation" is one of three things:

1. An inline HTML or markdown comment naming the substrate ref: `<!-- source: clients/coexist.md L9 -->`, `<!-- source: status_board f9e70100 context -->`, `<!-- source: gmail msg 19e6887a72f17eb6 -->`, `<!-- source: neo4j Episode "..." -->`, `<!-- source: kv_store cowork.calendar.meeting.woodfordia_site_visit_2026-06-17 attendee_emails -->`.
2. A `verified-from:` block at the top of the file enumerating every load-bearing claim against its substrate ref.
3. An explicit `UNVERIFIED:` prefix on the claim itself, for example *"UNVERIFIED: probable Hugh Fleiter Hodges based on the email handle"*, so the reader is never misled into treating a guess as fact.

If none of those three apply, the claim does not appear in the artefact. It is not softened with hedges like "likely", "probable", "presumably". Those have been laundered into fact too often. The Woodfordia prep brief stripped a `Jocelyn likely` hedge from kv_store and asserted `Jessica Ditchfield is the CEO` one layer down. Hedges are NOT citations.

## Why

Origin: Woodfordia site visit prep brief, 2026-06-10. A calendar-watch cron worker generated a prep brief for the 2026-06-17 Woodfordia x Co-Exist meeting. The brief asserted:

- *"Jessica Ditchfield is the CEO of Co-Exist Australia"*. False. `clients/coexist.md` line 9 plainly states *"Kurt Jones (CEO) is the contact at hello@coexistaus.org."*
- *"Co-Exist principals"* with Tate framed as one of them. False. Tate is not part of Co-Exist; he was attending as Ecodia, the tech vendor for both Woodfordia and Co-Exist.
- Title page: *"The first room where Woodfordia and Co-Exist sit at the same table."* False framing built on the two above.

The brief passed the voice scorer 96.2/100, passed em-dash detection, rendered to PDF, was committed to a worker branch and pushed to origin. **Nothing in the gate stack scored factual claims.** Voice substrate scored prose; nothing scored truth.

Tate, 2026-06-11: *"not just these lies specifically, but the fact that you were able to get something so factually incorrect and inaccurate and low quality into a document like that. p0!"*

The cost of a false claim at deliverable level is not the time to fix the document. It is:

- **Walking into a meeting believing a fiction.** If Tate had read this brief in the car on the way to Woodford, he would have walked in expecting Jess to be the decision-holder. He would have addressed Jess as CEO. The relationship damage from that opener is not recoverable in one meeting.
- **Loss of trust in every other artefact.** Once a deliverable lies once, every future deliverable from the same author has to be hand-verified. The cost compounds.
- **Compounding contamination.** The brief was on a worker branch but the lie was embedded in three other substrates (status_board context, kv_store, the brief itself) that downstream workers would read as authoritative input. A 24h refresh cron was scheduled to re-render the brief; without intervention it would have re-laundered the same lies into a new artefact the morning of the meeting.

The lie did not start in the brief. It started one layer up: the calendar-watch cron worker hedged a guess (`ceo@coexistaus.org = Jocelyn likely`) into kv_store. The brief worker then read the kv_store guess, dropped the `likely`, and asserted a new fiction (`Jessica Ditchfield is the CEO`) downstream. Each layer is a laundering step. The doctrine has to apply at EVERY layer, not just the final artefact.

## How to apply

**Before any Write or Edit to a deliverable surface:**

1. **List every load-bearing factual claim in the draft**. Named people, roles, titles, organisations, dates, monetary figures, quoted statements, attributions, decisions, agreements.
2. **For each one, name the substrate row, file, or line it came from.** If you cannot, you do not know it. Treat it as unverified.
3. **Embed the citation in the file** as an inline comment or a `verified-from:` block. The reader can audit the artefact against substrate without leaving the document.
4. **For unverifiable-but-needed claims**, prefix with `UNVERIFIED:` so the reader is never tricked into treating a guess as fact. If the claim is load-bearing and unverifiable, escalate to Tate rather than asserting it.
5. **Strip hedges that smuggle guesses into fact.** Words to flag: "likely", "probable", "presumably", "most likely", "I believe", "appears to be". When you find one in a deliverable, either replace with `UNVERIFIED:` (so the hedge is honest) or remove the claim entirely.

**Before any cron-worker fire that drafts a deliverable:**

The worker brief must list the substrate sources the worker is permitted to draw from. If the worker needs a fact not on that list, it does not infer. It returns `INSUFFICIENT_DATA` with the specific gap, and the conductor (or Tate) supplies the answer before the artefact is rendered.

**Before sending a deliverable to Tate or anyone external:**

Read every named person + role attribution out loud against the canonical client doc (`clients/<slug>.md`). If a single attribution does not match, the artefact does not ship. Period.

## Hook enforcement (PreToolUse, blocking on deliverable surfaces)

`backend/hooks/unverified-claim-gate.py` runs on every Write, Edit, MultiEdit where the target path is under a deliverable surface (`drafts/`, `briefs/`, `documents/`, `outbound/`, `client-reports/`, or any path matching `*-brief*`, `*-prep-*`, `*-handout-*`). It:

1. Scans the new content for "named person + role/title attribution" patterns (for example `<Name> is the <role>`, `<Name>, <role> of <org>`, `<Name>, the <role>`, `CEO <Name>`).
2. Scans for the bare hedge words `likely / probable / presumably / most likely / appears to be` near a factual claim.
3. **BLOCKS** the write if any matched claim lacks a nearby citation marker (`<!-- source: ... -->` or a `verified-from:` block at file top or an `UNVERIFIED:` prefix).
4. **Allows** when every matched claim has a citation OR is explicitly marked unverified OR the override token `# fact-gate-ok: <reason>` appears in the file with a non-empty reason. The token is logged for audit.

The hook is intentionally noisy. False positives are cheap (add a citation or mark unverified, which is the right thing to do anyway). False negatives, which means letting a worker ship a fabricated identity claim into a Tate-facing artefact, are not cheap.

## Anti-patterns

1. **"The voice scorer passed, so the artefact is good."** Voice scores prose. It cannot score truth. A 96.2/100 prose score on a fabricated brief is not a green light. It is a louder failure.
2. **"The hedge word makes the guess honest."** It does not. `likely` and `probable` get stripped by the next layer. The only honest treatment of a guess is the explicit `UNVERIFIED:` prefix or the omission of the claim.
3. **"I can cite at the end."** Citations at the bottom let the reader treat the body as authoritative without checking. Citations belong inline, next to each load-bearing claim, where the reader cannot miss them.
4. **"It is only an internal brief."** Tate-facing IS deliverable. The Tate of 11pm-in-the-car-tomorrow is not going to grep `clients/coexist.md` against the brief. The brief has to be true on read.
5. **"The worker is sandboxed on a branch."** Worker branches push to origin. Sibling workers may read each other's branches. Status_board context rows quote the artefact. The lie escapes the sandbox the moment it lands on disk.
6. **"I will redraft once Tate corrects me."** The cost is not zero. A redraft after a P0 callout is a relationship cost on top of the artefact cost. The right time to verify is before the first commit.

## Recipe for authoring a Tate-facing brief from scratch

1. **Open the canonical client doc** (`clients/<slug>.md`) for every named party that might appear. Read it cover to cover. Note the line numbers carrying the facts you will reference.
2. **Open the status_board canonical row** for the meeting or initiative if one exists. Note the row id.
3. **List the facts you intend to assert** as bullet points BEFORE you start writing prose. For each bullet, name the substrate ref. If you cannot name one, the fact does not go in the brief.
4. **Write the prose.** Embed `<!-- source: ... -->` next to each load-bearing claim as you write it.
5. **Strip hedges.** Search the draft for `likely | probable | presumably | most likely | appears to be`. Replace each with `UNVERIFIED:` or remove the claim.
6. **Voice, em-dash, and factual-claim gates run on save.** Fix any block; do not bypass.
7. **Read the draft one final time against the canonical client doc.** If any name + role pair fails the eyeball-check against the canonical doc, the brief does not ship.

## Forensic evidence (DO NOT DELETE)

Original quarantined artefact + WITHDRAWN notice at `.archive/quarantine/2026-06-11-woodfordia-prep-brief/`. Status_board row `f9e70100-5fee-4fe0-968e-500e2e45d856` carries the containment log. kv_store key `cowork.calendar.meeting.woodfordia_site_visit_2026-06-17` overwritten with WITHDRAWN payload + verified-facts-only block. Worker branch `worker/0589b123-3812-4536-a4b5-600b6d712398` deleted from origin.

## Cross-references

- [[legal-letter-name-verify]]. The narrow precedent for legal correspondence. This pattern is the general form.
- [[verify-before-asserting-in-durable-memory]]. The same rule applied to Neo4j writes.
- [[claim-inflation-calibration-hook-2026-05-31]]. Calibration scorer for narrative inflation.
- [[knowledge-architecture-lookup-first-and-claim-binding-2026-06-09]]. Knowledge-side claim-binding gate (M1).
- [[outcome-classification-must-distinguish-unverified-from-success]]. The same discipline applied to outcome reporting.
- [[apple-store-claims-must-be-grep-verified-against-codebase-before-send-2026-06-09]]. Same shape, narrower scope (App Store listings).
- [[verify-deployed-state-against-narrated-state]]. The 0th-class reflex this rule operationalises for documents.
