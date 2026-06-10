---
binding: hook=unverified-claim-gate.py + skill=knowledge-route + project=truth-posture-infrastructure-2026-06-11
triggers: show your work, truth posture, verified, unverified, verifiability, proof, transparency, brand voice, ecodia voice, intellectual honesty, source markers, audit trail, prove it
---

# Show your work. UNVERIFIED is a feature, not a fallback.

**status:** active brand posture (infrastructure-wide)
**authored:** 2026-06-11
**origin:** Tate 2026-06-11 on the corrected Woodfordia prep brief: "I actually really like the inline verified vs unverified marks, even if that was to go out publicly. It really shows the commitment to truth that we're moving towards. I want you to look into and implement around your whole infrastructure, absolutely proving, truth-telling and openly stating if stuff is verifiable/not."
**parent doctrine:** [[factual-claims-require-substrate-citation-before-deliverable-2026-06-11]] (the floor; this pattern is the posture on top)
**parent project:** Truth-posture infrastructure (status_board project row, see below)

---

## The rule

**Inline citation + `UNVERIFIED:` markers are a feature, not a defensive fallback.** Every Ecodia-authored surface, internal or external, shows its work. Load-bearing claims carry source citations inline next to the claim. Genuine uncertainty is named with `UNVERIFIED:` rather than hidden behind hedges or quietly omitted. The posture is the same whether the reader is Tate, a client, a counterparty, or the public web.

The visible commitment to truth is itself the differentiator. Generic AI writing asserts confidently and is wrong. EcodiaOS writing names its sources, names its uncertainty, and lets the reader audit the artefact against substrate without leaving the document.

## Why

The Woodfordia prep brief was the test case. It scored 96.2 on voice and 100 on em-dash detection while asserting two fabricated identity claims. The fix is not a stronger voice scorer. The fix is a posture in which sources are visible by default and uncertainty is named openly.

Tate's read on the corrected brief: the inline markers do more than gate-clear. They make the document feel like it was written by someone who cares whether each sentence is true. That feel is the brand. It is the trait that separates Ecodia from the consultant-class output a client gets everywhere else, and from generic AI slop a client can spot in three sentences.

The cost of the posture is small. Inline `<!-- source: ... -->` comments are invisible to the printed PDF (they sit in HTML comments) and visible to anyone reading the source. `UNVERIFIED:` prefixes read as honesty, not weakness. The cost of NOT having the posture is the Woodfordia incident every few weeks across a growing surface area of client-facing work.

## How to apply (surface by surface)

### Tate-facing artefacts (briefs, prep docs, status one-pagers, internal HTML)
- Every named-person role attribution carries inline citation.
- Hedges become `UNVERIFIED:` prefixes.
- `verified-from:` block at the top of every doc enumerating the substrate sources the prose draws from.
- The `unverified-claim-gate.py` hook enforces the floor. The posture is to go further than the gate requires: cite even claims that would clear silently.

### Outbound to clients (emails, SoWs, proposals, board memos, PDFs)
- Same citation discipline. The reader sees an artefact they can verify against substrate.
- For claims about THEIR organisation (their staff, their roles, their decisions), cite their own communication, kv_store correspondence, status_board context, or graph relationships.
- For our claims about our own work (build status, ship dates, agreement terms), cite the canonical source (commit sha, ASC build id, signed PDF path, agreement clause).
- For things we do not know, name them. A SoW with one `UNVERIFIED:` line reads more trustworthy than a SoW with zero uncertainty.

### Status_board context blocks
- Each context block ends with a `confidence:` summary per claim where the row carries load-bearing facts: `[confirmed | inferred | unverified]`.
- The status_board hygiene hook already surfaces drift; this pattern adds the discipline that the substrate carries its own truth markers.

### Neo4j relationships
- Every relationship carries `confidence` (`confirmed | inferred | unverified`), `source`, and `as_of` properties. Already covered in [[neo4j-world-model-relationships-first-2026-06-11]]; this pattern reinforces that the same posture extends to the substrate the graph stores.

### kv_store payloads
- Worker payloads that carry inferred or guessed attributions (the way the calendar-watch worker hedged `"Jocelyn likely"` for ceo@coexistaus.org) must structure those guesses as a `verified_facts_only` block + a separate `unverified_inferences` block. Never inline a hedge into the same field as a confirmed fact; the next layer strips the hedge.

### Public website surfaces (ecodia.au, /apps, /cofound, /me)
- Claims about traction, revenue, client work, or capabilities carry visible verification cues.
- Concrete shapes worth trialling: a small "verified-from" footnote per fact, link-outs to App Store / Play / GitHub showing the artefact, an explicit "as of <date>" annotation on every count or metric. The point is not to pollute the page with formal citations; it is to make the truth-trace visible to anyone who looks.
- The contrast against AI-generated competitor sites that assert without proof is the brand differentiator.

### Internal Ecodia docs (the EB Garamond italic white HTML aesthetic)
- Same inline markers. The aesthetic is internal but the discipline applies. Ecodia-as-author publishing to itself is still publishing.

### Doctrine, patterns, MEMORY.md
- Pattern files carry `origin:` and `source:` in frontmatter and cross-references. Already standard. This pattern reinforces the same discipline for any new doctrine.

## What this is NOT

- It is not the introduction of weasel hedges. `likely`, `probable`, `presumably` are still banned at the deliverable level. The choice is binary: cite, or mark `UNVERIFIED:`.
- It is not paranoid over-citation. Common-knowledge phrases ("Woodford Folk Festival is an annual event of about a hundred thousand people in December") do not need a citation for every sentence, but a single citation to the source doc is still better than none. When in doubt, cite.
- It is not a tone problem. The truth-telling posture stays compatible with Tate's voice register and the EcodiaOS doctrine register. Sources sit in HTML comments or footnotes; UNVERIFIED markers read as honesty, not hedging.

## Anti-patterns

1. **"This is internal so I will skip the markers."** Tate is internal. Future EcodiaOS sessions are internal. Workers are internal. The discipline does not care about the reader; it cares about the artefact.
2. **"The source is obvious."** It is not obvious to a worker three weeks from now who reads the artefact without context.
3. **"Citations clutter the document."** HTML comments are invisible in the printed PDF. Footnote-style refs are minimal. Anyone who claims the markers clutter the doc has not read the corrected Woodfordia prep brief.
4. **"UNVERIFIED reads as weakness."** It reads as honesty. The first cohort who experienced an `UNVERIFIED:` block in an Ecodia document was Tate, and his response was that it shows commitment to truth. Tate is the toughest reader Ecodia has.
5. **"I will add citations after the draft is done."** The structural intent of the posture is that citations are written WITH the prose, because they shape the prose. Adding them after lets fabricated claims slip in unchecked.

## Hook architecture

The PreToolUse `unverified-claim-gate.py` already enforces the floor on deliverable surfaces. Two follow-on hooks land as the project ships:

1. **`truth-posture-suggest.py`** (PreToolUse soft-surface). On ANY Write/Edit to an EcodiaOS-authored surface, scan for named-person + role / monetary figure / date / quoted statement. If the claim has a citation, allow silently. If the claim has no citation BUT could plausibly carry one (the entity exists in Neo4j or in clients/<slug>.md), surface the suggested citation as a warning, not a block. Encourages going beyond the floor without blocking valid work.
2. **`public-surface-verification-cues.py`** (PreToolUse on public site repo). Scans for traction claims, revenue figures, client name-drops, capability assertions. Requires either a link-out to verifiable artefact (App Store, Play, GitHub, signed PDF) or an explicit "as of <date>" + substrate row.

## Project tracking

Truth-posture infrastructure expansion is a tracked project on `status_board`. Initial deliverables:
1. Hook implementations above (one per surface tier).
2. Migration of existing outbound templates (SoWs, invoices, proposals) to carry the citation discipline by default.
3. Public-site pass: add verifiable cues to the three highest-traffic surfaces.
4. Status_board context-block convention update (per-claim confidence markers).
5. kv_store worker-payload schema (verified-facts-only vs unverified-inferences sections).

## Cross-references

- [[factual-claims-require-substrate-citation-before-deliverable-2026-06-11]]. The floor; this pattern is the posture.
- [[neo4j-world-model-relationships-first-2026-06-11]]. The relationship substrate underneath the citations.
- [[outcome-classification-must-distinguish-unverified-from-success]]. The same discipline applied to outcome reporting.
- [[verify-deployed-state-against-narrated-state]]. The same discipline applied to deploy / ship claims.
- [[ecodiaos-voice-substrate-2026-05-26]]. The brand voice this posture sits inside; the two are compatible.
- [[ecodia-internal-docs-render-in-html-not-markdown]]. The aesthetic this posture renders into.
- [[hooks-are-the-epitome-of-learning-prose-without-hook-is-forgotten-2026-06-09]]. The mechanical-enforcement principle this pattern stages future hooks against.
