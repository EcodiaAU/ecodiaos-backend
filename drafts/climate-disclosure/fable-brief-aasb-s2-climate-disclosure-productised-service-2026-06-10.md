# FABLE 5 BEAST BRIEF: Stand up the AASB S2 climate-disclosure service line that EcodiaOS runs alone

> Authored 2026-06-10 by EcodiaOS (conductor) for a Fable 5 execution session.
> Paste this whole file as the opening prompt. It is an execution brief, not a planning brief. End the turn with artifacts on disk, not a plan to make them.

---

## The meta-frame: what is actually being tested

This is not a research task about climate law. It is the first end-to-end proof of the algorithmic-manager thesis at the revenue layer.

The question behind the question: can EcodiaOS, alone, stand up a brand-new productised service line, prove it is aligned and deliverable, reduce it to a repeatable Statement of Work, and design the automation so that EcodiaOS itself delivers every engagement with effectively zero human delivery labour? If yes, Ecodia has a self-operating revenue organ. That is the thing that makes EcodiaOS the most capable version of itself, because it stops being an operator of existing lines and becomes the originator of new ones.

The AASB S2 Group 2 mandate (effective 1 July 2026, roughly three weeks out as of this brief) is the wedge. It is a hard forcing function: before that date Ecodia is the only AU-side algorithmic manager positioned at the seam; after it, the seat is contested. Use the deadline as pressure, not as an excuse to ship something thin.

## Mission (one paragraph)

Design, document, and partially build a productised climate-disclosure service line for AASB S2 Group 2 reporting entities, in which EcodiaOS is the continuous-evidence and disclosure-preparation substrate that sits underneath the entity's own report and its assurance provider. Produce: an honest alignment-and-feasibility verdict, a repeatable fixed-scope SoW, an automation architecture that lets EcodiaOS deliver each engagement solo, the substrate build spec, the public whitepaper and landing page in the canonical Ecodia aesthetic, and a Tate-gated go-to-market. Write it all to disk, bind it into the graph, and leave the next session able to execute a real engagement from the runbook.

## Load this context before writing a single deliverable

Do not work from memory. Read these first.

- `knowledge.lookup` (ecodia-knowledge connector) on, at minimum: "AASB S2 climate disclosure wedge", "NRM run-time MRV wedge", "dMRV conservation thesis", "ecodia internal docs html aesthetic", "ecodiaos voice substrate", "cofound playbook" (for the regulated-product operability discipline), "no client contact without tate goahead", "decide do not ask autonomy", "ecodia consumer marketing pages inherit chambers glovebox aesthetic".
- `backend/drafts/bold-moves-2026-06-08.md` Move 4 (the seed of this brief) and Move 2 (HLW inbound, the same buyer-adjacent cohort).
- Neo4j Strategic_Direction nodes, read the full set: "NRM run-time MRV wedge", "Integrated Community-Led Nature Repair Markets" (created 2026-06-09), "Conservation platform Multiplier Thesis / dMRV wedge", "Compliance-Controlled Outreach Execution", "AI-Builder Market Reframe - Conservation Thesis is Horizontal-Distribution Wrong-Audience" (the corrective, read it so you do not repeat a known mistake about who the buyer is).
- `backend/brand/ecodia-doc-template.html` (the canonical internal-doc aesthetic) and `backend/voice/` (the voice profile and scorer).
- The Ecodia identity sections in `~/.claude/CLAUDE.md` and `/Users/ecodia/.code/ecodiaos/CLAUDE.md` (the W.S. 17-31-104 algorithmic-manager structure, the 51 percent option, what Ecodia legally is). The legal shape of the seller matters for a regulated service.

## Starting facts to VERIFY against primary sources, do not trust them

Treat every number and rule below as an unverified hypothesis. The Cofound teardown proved that the v1 plan shipped two false legal claims that a research pass had to rip out. In a regulated accounting-and-assurance domain, a false claim is not embarrassing, it is a liability. Verify each of these against primary sources (AASB, AUASB, ASIC, Treasury, the Corporations Act amendments) before any of it enters a public artifact, and cite the source inline in your working notes.

- Australia's mandatory climate reporting regime phases in by group: Group 1 already live, Group 2 from 1 July 2026, Group 3 from 1 July 2027. Confirm the exact commencement and the legislative instrument.
- Group 2 thresholds: an entity meeting at least two of three tests (consolidated revenue at or above AUD 200M, consolidated gross assets at or above AUD 500M, 250 or more employees). Confirm the exact thresholds and the two-of-three rule.
- The reporting obligation sits under AASB S2 (climate) and AASB S1 (general), aligned to ISSB IFRS S1 and S2. Assurance phases in under AUASB standards (ASSA 5010 or its current designation). Confirm the assurance pathway and timeline, because the assurance boundary is the core of our positioning.
- Disclosure content spans governance, strategy, risk management, and metrics and targets, including Scope 1, 2, and eventually 3 GHG emissions, scenario analysis, and transition planning. Confirm the staged relief and the first-year limited-assurance scope.

If any starting fact is wrong, correct it loudly in your alignment verdict and proceed on the corrected fact.

## The deliverables

Seven phases. Each names its artifact and its acceptance criteria. Parallelise the research-heavy phases with sub-agents (see "How to work"), but hold the synthesis and the architecture yourself.

### Phase 1: Alignment and feasibility verdict (the honest gate)

Artifact: `backend/drafts/climate-disclosure/01-alignment-and-feasibility-verdict-2026-06-10.md`

Answer two questions without spin, including the strongest case against.

1. Is this aligned with Ecodia? Map the service to existing identity and capability: the dMRV and run-time MRV thesis, the conservation and NRM positioning, the continuous-evidence-with-provenance substrate that EcodiaOS already is internally (Neo4j Decision provenance, working_set, status_board, the verify-deployed-against-narrated discipline). State plainly where the fit is real and where it is a stretch. Read the "Conservation Thesis is Horizontal-Distribution Wrong-Audience" node and confirm you are not repeating that error about the buyer.
2. Can we actually handle it? This is the make-or-break analysis. Ecodia is not a registered company auditor, not a CA or CPA firm, not an AUASB-registered assurance practitioner. We cannot provide assurance on S2 disclosures, and we must never imply we can. So the defensible business sits just outside the regulated-judgment boundary, exactly as the Cofound kit sits outside unauthorised practice of law: we are the continuous-evidence, data-pipeline, and disclosure-preparation-support layer underneath the entity's own report and their licensed assurer. Name every regulated boundary (assurance sign-off, director attestation, any activity that is a "financial service" or audit activity under the Corporations Act or ASIC oversight), and show precisely where our service stops and a licensed party begins. Treat this the way the Cofound research swarm treated EIN, banking, and UPL: convert each apparent blocker into a solved-with-a-known-pattern or a clearly-named partner dependency.

Acceptance: a reader who is skeptical and informed finishes this doc either convinced the boundary is clean or handed the exact reason it is not. No hand-waving over the assurance line.

### Phase 2: The productised Statement of Work (the repeatable unit)

Artifact: `backend/drafts/climate-disclosure/02-productised-sow-template-2026-06-10.md`

Define the actual sellable thing as a fixed-scope, repeatable SoW template, not a bespoke consulting blank.

- What a Group 2 entity buys, in one sentence a CFO understands.
- The deliverable set per engagement (for example: an evidence register, a Scope 1 and 2 emissions baseline with provenance, draft S2 disclosures mapped clause by clause to the standard, a gap analysis against the entity's current state, and an ongoing-monitoring feed).
- Explicit scope boundary: inclusions, exclusions, and the named hand-offs to the entity's auditor and directors. The exclusions protect us as much as the inclusions sell us.
- Pricing model and rationale (one-time setup plus a monitoring retainer is the likely shape, but justify it against what Big-4 and boutique ESG consultancies charge, which you must research, not guess). Include a defensible unit-economics line that already counts the real costs, the way the Cofound numbers were corrected from the dishonest v1.
- The repeatable engagement timeline, milestone by milestone.

Acceptance: this SoW could be sent to the next qualified Group 2 prospect with only the name and figures changed, and a second engagement would run the same shape as the first.

### Phase 3: The autonomous-delivery automation architecture (the core of the whole brief)

Artifact: `backend/drafts/climate-disclosure/03-autonomous-delivery-architecture-2026-06-10.md`

This is what Tate actually asked for: how EcodiaOS delivers each engagement end to end, alone, repeatably. Map every step of the SoW delivery to an automatable substrate primitive, and be specific about the seams.

- The continuous-evidence pipeline: how entity data is ingested, how each datum gets immutable timestamped provenance (this is the existing Neo4j Decision and working_set pattern, productised outward), how the evidence survives an auditor's scrutiny.
- The disclosure-drafting engine: how EcodiaOS drafts S2 disclosures clause by clause, runs gap analysis against the standard, and flags drift on an ongoing basis.
- The intake-to-delivery runbook: a deterministic sequence that, given a new client, EcodiaOS executes the same way every time (scheduler crons, dispatched workers, MCP tools, hooks). Name the steps an operator-free pipeline would run.
- The unavoidable human gates: assurance sign-off and director attestation cannot be automated. Show how the process routes to them cleanly (a partner assurer, or feeding the entity's existing auditor) without EcodiaOS ever crossing the line.
- The honest automation ceiling: state what fraction of delivery is genuinely autonomous versus what still needs a licensed human, and do not inflate it.

Acceptance: a future EcodiaOS session, handed a signed client, could execute the engagement from this runbook without inventing the process.

### Phase 4: The substrate build spec (what to actually build)

Artifact: `backend/drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md`

The concrete engineering: the new Postgres tables, services, MCP tools, crons, and hooks that turn the architecture in Phase 3 into running code. Reuse existing organs wherever possible (status_board, working_set, the narrow MCP connectors, scheduler.delayed and cron, the coord protocol). Specify the continuous-evidence schema with provenance and grants (follow `supabase-create-table-must-include-explicit-grants`). Mark what is buildable now versus what waits for a signed first client.

Acceptance: this spec could be handed to a dispatched build worker as a real implementation brief, with verify gates per the dev-process doctrine.

### Phase 5: The public whitepaper (the wedge surface)

Artifact: `backend/drafts/climate-disclosure/aasb-s2-continuous-evidence-substrate-2026-06-10.html`

A 1500 to 2000 word whitepaper in the canonical Ecodia internal aesthetic (EB Garamond italic, white, no bold, no tables, no emoji, rendered from the template at `backend/brand/ecodia-doc-template.html`), authored in the EcodiaOS voice and scored against `backend/voice/`. Position the substrate, name the seam between annual audited disclosure and continuous monitored evidence, walk one worked example (an NRM or emissions evidence trail mapping to an S2 clause), and address Big-4 as a complement to assure rather than a competitor to displace. Every regulatory claim must trace to a Phase 1 verified source. No overclaiming, ever, in a regulated public document.

Acceptance: passes the voice scorer at 75 or above, zero em-dashes at the character level, renders cleanly as a PDF, and a Group 2 CFO reading it understands the offer and trusts the restraint.

### Phase 6: The landing page draft

Artifact: `backend/drafts/climate-disclosure/climate-disclosure-landing.html` (a draft of the eventual `ecodia.au/climate-disclosure`)

Inherit the Chambers and Glovebox marketing aesthetic per `ecodia-consumer-marketing-pages-inherit-chambers-glovebox-aesthetic`, mirror the literal product-type-for-domain title convention. A real inbound capture form posting to an interest endpoint, countable later, the way the Cofound page posts to `/api/interest`. Build the page draft, do not deploy it.

Acceptance: the page draft is production-shaped, on-aesthetic, and one push away from live, with the capture mechanic specified.

### Phase 7: Go-to-market and the demand clock

Artifact: `backend/drafts/climate-disclosure/07-gtm-and-demand-clock-2026-06-10.md`

The first qualified Group 2 targets (real, currently-reporting entities, sourced by research, never fabricated, the same honesty rule as the Cofound named-list), the outreach hook, the qualification criteria, and a kill clock with explicit stop criteria if demand is silent. All outbound contact is Tate-gated per `no-client-contact-without-tate-goahead`; authoring and target research is act-immediately. Make that boundary explicit in the doc.

Acceptance: Tate could approve a single outreach send off this doc, and the kill criteria are concrete enough to actually stop the line if the market is not there.

## How to work

- Depth before narration. Run the Phase 1 and Phase 2 research with parallel sub-agents the way the Cofound operability swarm did: one lane on the legislative and assurance boundary, one on competitor pricing and positioning, one on the buyer cohort and their current pain, one on the worked-example evidence mapping. Cap fan-out sensibly and harvest structured outputs. Then synthesise yourself.
- Verify, then assert. Every regulatory fact gets a primary source before it lands in a public artifact. Bind every completion claim to a discriminating probe, not a narrated success.
- Reuse Ecodia's organs. This service is largely Ecodia's own internal substrate pointed outward. Wherever you find yourself designing something Ecodia already runs internally, say so and reuse it.
- Sequence honestly. If the turn cannot finish all seven artifacts to quality, finish Phases 1 through 4 to full depth (the alignment, SoW, automation, and build spec are the load-bearing thinking) and leave Phases 5 through 7 as strong drafts with a clear continuation note. Do not ship seven shallow artifacts. Ship four deep ones and three honest drafts before you ship seven thin ones.

## Hard constraints (these are not optional)

- Em-dashes are banned at the character level. U+2014 never appears in any artifact. Validate before every write: `grep -c $'\xe2\x80\x94' <file>` must return 0.
- EcodiaOS authors in the EcodiaOS voice on every named-author surface (the whitepaper, the landing page). Load the profile, score the output.
- Ecodia internal docs render in the canonical HTML aesthetic, not raw markdown, for the whitepaper. The working specs (Phases 1 to 4, 7) stay as markdown on disk, they are machine-and-Tate substrate, not Ecodia-from-Ecodia deliverables.
- No client contact without Tate go-ahead. Authoring, research, and target-sourcing are yours. Sending anything external is Tate-gated.
- Decision authority: Phases 1 to 5 working artifacts and the substrate spec are act-immediately. The whitepaper and landing-page publication, and any outreach, are brief-tate-first. State the verdict explicitly at the end.
- Regulated-domain honesty is absolute. Never imply Ecodia provides assurance, audits, or licensed financial or accounting advice. Every regulatory claim is sourced. Overclaiming here is a liability, not a marketing flourish.
- Cold-start test on every substrate write: would a fresh session reading only this node make a better decision.

## Substrate writes required before the turn ends

- A Neo4j Strategic_Direction node for the climate-disclosure service line, related to the existing NRM and dMRV and Integrated-Community-Led-Nature-Repair nodes.
- A Neo4j Decision node recording the alignment-and-feasibility verdict and the act-immediately versus brief-tate-first split, with the reasoning.
- status_board upserts: one row for the service-line build (entity_type project, next_action_by ecodiaos), promoting or superseding the existing AASB S2 watch row, and any Phase 4 build sub-rows. Respect the upsert priority-clobber rule.
- An Episode node capturing this session, type conductor_observed or the correct enum, chained to the bold-moves-Move-4 origin.

## Definition of done

The turn is done when: the alignment verdict is on disk and a skeptic could not poke the assurance boundary, the SoW is repeatable, the automation architecture is executable from its runbook, the build spec is dispatch-ready, the whitepaper and landing page exist as on-aesthetic drafts (or strong continuation drafts with a clear note), the GTM names real targets and a real kill clock, and the graph and status_board reflect all of it. Then write one tight summary to Tate: what is aligned, what we can and cannot handle, what the repeatable service is, how much of it EcodiaOS delivers alone, and the single next decision Tate owns.

Build the thing that proves EcodiaOS can stand up a business line and run it alone. That is the brief.
