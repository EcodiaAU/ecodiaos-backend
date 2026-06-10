# World Model / Stakeholder Map Recon — 2026-05-11

Authored by fork `fork_mp0zhi2r_831eb9`. RECON ONLY — no authoring, no modifications made to any substrate. All findings are verbatim from live queries run this session.

---

## Section 1: What Exists in Neo4j

### Person Nodes

| Name | Labels | Key Properties | Gaps |
|------|--------|----------------|------|
| **Tate Donohoe** | Person | FOUNDED Ecodia Pty Ltd, WORKS_WITH Kurt Jones + Co-Exist Australia, CO_FOUNDED_WITH Ecodia DAO LLC, OWNS_PROJECT ROAM, MEMBER_OF ecodiatate | No `last_name` property; no `relationship_to_tate` (is self); extensive relationships but all indirect via Episodes/Decisions |
| **Kurt Jones** | Person, Embedded | description: "Youth conservation and community leader. Co-founded Co-Exist Australia and Goodreach. Long-standing Ecodia client — built the Co-Exist app. Engaged and strategic, thinks at systems level." role: "Co-founder & Director, Co-Exist Australia" email: kurt@goodreach.com.au | No `last_name` property (name has "Jones"). No `relationship_to_tate` property. No `commercial_status`. No Wild Mountains affiliation captured. No board-chair role captured. **Tonight's Wild Mountains board-chair (June) role is entirely absent.** |
| **Angelica Choppin** | Person | description: "Client at Resonaverde. Mates-rate client, paid $200. Friendly relationship with Tate." email: angelica@resonaverde.com (STALE — canonical is hello@resonaverde.au) | No `last_name` property (name has "Choppin"). No `role` property. No `relationship_to_tate`. Email field is wrong. Separate thin node "CETIN (Angelica Choppin)" exists as Person with no properties. **Wild Mountains board membership absent.** |
| **Vikki Marsh** | Person, Embedded | description: "Client for ESP Sales website rebuild. Project finished except client hasn't completed final revisions or DNS." role: "Client - ESP Sales / Endless Summer Properties" email: vitki999@gmail.com | No `last_name` property. No `relationship_to_tate`. No `commercial_status`. |
| **Matt Barmentloo** | Person | role: "President" | Minimal — just name + role. No description, no email, no firm. Separate "SCYCC (Sunshine Coast Young Chamber of Commerce)" node labeled as Person (incorrect label — should be Organization). |
| **Eugene Kerner** | Person, Embedded | role: "Technical contact, Ordit" email: ekerner@ekerner.com | Thin. No description beyond role. |
| **Craige Hills** | Person | role: "Founder / Owner" | No email, no description. |
| **Jessica Ditchfield** | Person | role: "South and West Community Manager" | Thin. No org context. |
| **Helen Andrew** | Person | role (rich): "Co-founder + leader of Yarn and Yield..." relationship_to_tate: "Mum of someone Tate went to school with. Tate and Helen do not gel." | Actually one of the richer Person nodes with `relationship_to_tate` filled. |
| **Andrew Maitland** | Person | description: "Tate Landcare teacher from Montessori, good friend of Tate and Tate mum, board member Yarn n Yield coop." | Rich context. |
| **Alicia (Yarn n Yield)** | Person | description: "Board member of Yarn n Yield coop, West Woombye. Warm referrer..." | Good context. |
| **Goodreach (Tom Groat)** | Person | Name only | Labeled as Person but appears to be an Org. No description. |

**No Person nodes exist for:**
- Anyone named "Jess" from Co-Exist
- Anyone named "Charlie" from Co-Exist (Charlie Bennett — referenced in excel sync rows)
- Kim McColl (WY SOS) — not found
- Wild Mountains board members (other than Kurt + Angelica)

### Organization Nodes

| Name | Labels | Properties | Gaps |
|------|--------|------------|------|
| **Co-Exist Australia** | Organization, Embedded | description: "Youth conservation and community organisation co-founded by Kurt Jones (2024 Young Australian of the Year). Ecodia's most important ongoing client." | No board member list. No org structure. |
| **Resonaverde** | Organization, Project | description: "Resonaverde website. Live on Vercel." | Extremely thin — just "website, live on Vercel." No org description, no mission, no Angelica-as-founder framing. |
| **Ecodia Pty Ltd** | Organization | Founded by Tate Donohoe. | Standard. |
| **SCYCC** | Person (!!) | Incorrectly labeled as Person, not Organization | Label error. |

**No Organization node for:**
- **Wild Mountains** — completely absent. No node at all.
- Goodreach (misclassified as Person)
- Wild Mountains board as a governance entity

### Key Recent Decisions (last 30 days relevant to this orbit)

1. **"Wild Mountain shape - low-intensity co-investment, not relocation or commercial deal (28 Apr 2026)"** (Decision, dt=2026-04-28)
   - Wild Mountain is a charity / company limited by guarantee. No equity possible.
   - Shape: few weeks at a time on-site, share house, manage volunteers/backpackers/interns. NOT relocation.
   - Angelica keen to work with WM but not live there.
   - Distance: "only a couple of hours from home."
   - Internship program / website / app is investment-not-paid-scope.
   - **Doctrine locked:** "when Tate frames something as investment in a friends project, do not impose commercial-deal structure."
   - **CRITICAL: This was 28 Apr. Tonight (11 May) is new context — board membership offer is a different framing than the internship-program offer.**

2. **"Wild Mountain offer surfaced - Kurt + Angelica internship program (28 Apr 2026)"** (Episode)
   - Original SMS from Tate: "Kurt wants me to move to wild Mountain with him and Angelica to create an internship program and more for them."
   - My position: do not yes/no until specific ask is on table.
   - Status_board row inserted at the time as P2 opportunity (no longer visible in active board — likely archived post-Decision above).

3. **"Weekend delegation scope 2026-04-24 to 2026-04-26 (Wild Mountains)"** (Decision, dt=2026-04-24)
   - Routine delegation scope — just happens to mention Wild Mountains in title as Tate's destination.

4. **"Kurt foundation board pitch - 5 May 2026"** (Status board row 5fe695cc, P3, external)
   - Kurt spoke about Tate at an **unnamed foundation's board meeting** (5 May 2026).
   - Showed Co-Exist app.
   - "Kurt deliberately did not name the foundation — feels it is not the right move or right time."
   - Status: NO CHASE, wait for Kurt's greenlight.
   - **Note: This unnamed foundation may or may not be Wild Mountains. The 11 May dinner context suggests Wild Mountains IS the entity — but the 5 May row did not name it.**

5. **"Angelica standing arrangement codified + first reply 11 May 2026 16:30 AEST"** (Episode, today)
   - Tate verbatim 16:30 AEST: standing arrangement live.
   - First email under arrangement received 11 May 13:03 AEST.
   - Referral agreement modification = Tate-call.

6. **"Meta-loop 2026-05-11 17:49 AEST"** (Episode, today)
   - Resonaverde same-day delivery. 4 worker sub-forks. All 3 commits shipped.
   - Resonaverde alias pinning still unresolved.

### Strategic Directions (relevant)

| Name | Relevance |
|------|-----------|
| "80/20 token reallocation — revenue action over infrastructure" | Frames conservation-orbit as deprioritised infrastructure vs. revenue |
| "AI-Builder Market Reframe — Conservation Thesis is Horizontal-Distribution Wrong-Audience 4 May 2026" | Explicitly kills conservation-peak-body outreach as wrong-audience. Keeps Co-Exist + Roam as own-product proof. This affects Wild Mountains strategic framing. |
| "Substrate-Ahead-of-Demand Trap — Conservation-Platform Thesis Bottleneck" | Parent SD for the conservation kill |
| "EcodiaOS 90-day plan May-Jul 2026" | Chambers federation + Co-Exist + Roam are priority revenue threads. Wild Mountains is NOT named. |
| "Self-as-Primary-Case-Study: AI-run business frontier research anchored in own operations" | The framing of EcodiaOS publicly |
| "EcodiaOS public profile — positioning + voice + going public on AI-led LLC" | "Tate told lots of people about this weekend" — weekend likely included Kurt/Wild Mountains orbit |

### Key Prediction Nodes

- "Prediction: Kurt will act as the warm introducer for the Landcare Australia [peak body]"
- "Prediction: The market gap Kurt keeps raising will crystallise into a co-[venture?]" (truncated)
- "Prediction: Kurt's influence on Conservation and Youth empowerment will [...]" (truncated)

### Episode: Kurt + Landcare Australia top-dogs Sydney + Merri Mornings (Apr 25/26 2026)
- Kurt met Landcare Australia leadership in Sydney.
- Co-Exist app to be rolled out at Sunshine Coast Landcare event.
- New Co-Exist subproject: Merri Mornings on a Landcare property in Victoria on Merri river.
- First interstate Co-Exist deployment.

---

## Section 2: What Exists in Client Files / Drafts / CLAUDE.md

### Client Files (`~/ecodiaos/clients/`)

| File | Relevance |
|------|-----------|
| `clients/coexist.md` | Rich file — Kurt as contact, contract clauses, build/deploy workflows, billing register. No strategic context about Kurt personally beyond "client contact." No mention of Wild Mountains or board dynamics. |
| `clients/INDEX.md` | Index of client files |
| `clients/archived/ordit.md` | Ordit (engagement closed) |
| All other files | Technical (release flows, Corazon architecture, Mac access) — not stakeholder-relevant |

**No client files for:**
- Resonaverde (no `clients/resonaverde.md`)
- Kurt personally
- Angelica personally
- Wild Mountains

### Drafts (relevant)

| File | Relevance |
|------|-----------|
| `drafts/yarn-and-yield/*.md` (7 files) | Full deck/pitch set for Yarn and Yield. Includes working-brief-v0.1.md, sequencing, vision themes, strategic cross-thread decisions, tier1 leave-behind, email template, FAQ. This is the richest stakeholder-prep corpus in drafts — for Yarn and Yield, not Wild Mountains. |
| `drafts/conservation-platform-rebrand/*.md` (12+ files) | Peak-body target list, MRV add-on spec, outreach templates, positioning. Strategically PAUSED per AI-Builder reframe (4 May). |
| `drafts/outreach/*.md` | HLW, NRM Regions, NSW LLS, Crystal Waters — all PAUSED per AI-Builder reframe. |
| `drafts/angelica-resonaverde-substrate-2026-04-30.md` | 4 reactive response paths for Angelica referral v3. Rich substrate. |
| `drafts/young-chamber-followup-matt-2026-04-29-v4.md` | Matt Barmentloo outreach v4. Rich. |
| `drafts/conservation-platform-rebrand/peak-body-target-list-v*.md` | Target lists including NRM, Landcare orbit |

**No drafts for:**
- Wild Mountains as an organisation
- Board membership strategic thinking
- Conflict-of-interest analysis
- Tate's personal involvement in Wild Mountains

### CLAUDE.md References to Named Stakeholders

**~/CLAUDE.md mentions:**
- **Angelica/Resonaverde**: "Standing arrangement carve-out (Angelica/Resonaverde only)" — named and carve-out documented at top level of Decision Authority section and Client Communication section. Full: `~/ecodiaos/patterns/angelica-resonaverde-standing-arrangement.md`.
- **Craige Hills / Eugene Kerner**: Referenced as Ordit contacts, with "never contact Eugene directly" doctrine.
- **Vikki Marsh**: Not named in CLAUDE.md.
- **Matt Barmentloo / SCYCC**: Not named in CLAUDE.md.
- **Kurt**: Not named by name in CLAUDE.md (Co-Exist is referenced as "most important ongoing client").
- **Wild Mountains**: Not mentioned in CLAUDE.md.

---

## Section 3: Active Status Board Rows Touching These Stakeholders

All rows are active (archived_at IS NULL) at time of query.

| ID (short) | Name | Priority | Status | Next Action By |
|-----------|------|----------|--------|----------------|
| 7dad2457 | Co-Exist splash + Android header + keyboard-gap | P1 | merged_to_main_pending_web_verify | tate |
| c4c7a606 | Co-Exist event-cancel sync bug + draft-publish bug (PR #19) | P1 | pr_19_open_awaiting_tate_merge | tate |
| 2fa16b5c | Co-Exist P0: 40 Merri Morning sign-ins lost | P1 | RESTORE_IN_PROGRESS | ecodiaos |
| 7d44be0e | P1 secret leak: Supabase service_role key in public commit | P1 | containment-shipped-rotation-pending | tate |
| 9acff5d8 | Co-Exist share-graphic | P1 | shipped_to_main_pending_visual_verify | tate |
| 32eb76d6 | Push notifications ON (Jess + Kurt flagged) | P1 | ios_testflight_uploaded_pending_apple_processing | tate |
| 5d0976b4 | Co-Exist excel-supa sync (Charlie complaint) | P1 | merged_to_main_pending_web_verify | tate |
| 7921fa84 | Co-Exist 1.8.5 BUNDLED ship | P1 | merged_to_main_pending_visual_verify | tate |
| a17c981a | Angelica referral agreement two-way update | P2 | awaiting Tate direction | tate |
| 69312460 | Resonaverde GitHub + Vercel access handover from Angelica | P2 | awaiting_handover_then_action | tate |
| 4b4959ac | CETIN MVP (Angelica) | P2 | cetn-docs-v0.2-ready-awaiting-referral-signature | external |
| e7bea4e4 | Vikki Marsh — $2k outstanding | P2 | tate-followup-needed | tate |
| 44e80cd9 | Resonaverde site polish — mobile audit fixes | P2 | mobile_audit_and_fixes_shipped | tate (alias pinning) |
| fbe0a6c5 | Co-Exist INV-2026-003 payment expected | P3 | awaiting-payment | client |
| b9096359 | Angelica/Resonaverde standing arrangement | P3 | active - autonomous reply authorised | ecodiaos |
| 1fb327ea | Angelica/CETN/Resonaverde — two-way referral (demoted) | P3 | substrate-deepened-4-paths-staged | tate |
| 5fe695cc | Kurt foundation board pitch (5 May 2026) | P3 | kurt-deferred-deliberately-no-chase | external (Kurt) |
| 6b6d676d | Resonaverde — 5 design decisions for Angelica | P3 | pending_angelica_input | tate |
| 7b2abf37 | Co-Exist event leader check-in (Kurt context) | P3 | feature_request_received_pending_spec | ecodiaos |
| 23366f2c | Matt Barmentloo (SCYCC) — awaiting Matt reply | P3 | sent_by_tate_awaiting_matt_reply | external |
| 917b3330 | Co-Exist verification — 4 home/photo items | P3 | tate_required_2_remaining_items | tate |

**Key row to flag:** `5fe695cc` ("Kurt foundation board pitch - 5 May 2026") is currently status "kurt-deferred-deliberately-no-chase-await-his-greenlight." The **unnamed foundation** in that row may be Wild Mountains. Tonight's dinner gives Tate new information — Kurt is chairing Wild Mountains from June and floated Tate on the board. This row needs updating or a new row needs inserting for the board-offer specifically.

**No active row for:**
- Wild Mountains as an entity
- Tate's personal Wild Mountains board decision
- Conflict-of-interest analysis (Wild Mountains + Co-Exist client relationship)
- Kurt personally (aside from Co-Exist work rows)

---

## Section 4: Active kv_store Keys

| Key | Summary |
|-----|---------|
| `ce.kurt.board_pack` | Passive awareness. "CE agreement board pack for Kurt was on status_board as passive task. Archived 2026-04-26. Trigger: Kurt or Tate explicitly asks for it." Status: archived. |
| `ceo.outreach.angelica_referral_follow_up_2026-04-29` | Full v3 referral draft substrate for Angelica. Canonical send path, voice calibration, dossier. Wild Mountain bleed-through guard documented. Stale (authored 29 Apr, Angelica has since emailed and referral is now separate Tate-call). |
| `ceo.outreach.angelica_resonaverde_2026-04-30` | 4 reactive response paths for Angelica referral v3. Augments above. Also stale relative to current state (Angelica has since emailed, standing arrangement now live). |
| `ceo.outreach.young_chamber_lead_2_matt_2026-04-29` | Full Matt Barmentloo outreach substrate v4. Matt's email candidate: matt@cultured.group. Draft body, decision points. |
| `ceo.outreach.young_chamber_lead_3_fergus_2026-04-29` | Fergus (no last name, no email) outreach substrate. Recommendation: hold and wait for inbound. |
| `ceo.outreach.marnie_nrm_regions_2026-04-30` | NRM Regions incoming CEO outreach substrate. PAUSED per AI-Builder reframe. |
| `ceo.last_resonaverde_polish` | Resonaverde site polish tracking (9 May). Kurt-attributed (Tate verbatim 17:39 9 May: "Tate directive, kurt attribution: true"). |
| `alert.resonaverde_alias_check.converged` | Resonaverde Vercel alias check (9 May). Now stale — multiple deployments have shipped since. |

**No kv_store keys for:**
- Wild Mountains strategy or board decision
- Kurt personal relationship framing
- Conflict-of-interest analysis
- Tate's personal decision-making on board memberships

---

## Section 5: GAPS

These are things that would be expected for a clean world model/stakeholder map, confirmed absent after exhaustive probe.

### Wild Mountains Specifics (entirely absent)

- **No Organization node for Wild Mountains.** Zero nodes. Only mentioned in Decision/Episode text bodies.
- **No properties on Wild Mountains**: legal structure (confirmed: company limited by guarantee), location, mission, website, programs, team.
- **No record of Wild Mountains board members** (aside from Kurt as incoming chair and Angelica as board member — both from tonight's brief context, neither captured yet).
- **No Wild Mountains + Tate board-offer row** anywhere (status_board, Neo4j, kv_store, client files).
- **No conflict-of-interest analysis**: Tate is Co-Exist's developer (and Co-Exist is a client). Co-Exist and Wild Mountains appear to be in the same conservation orbit and Kurt chairs Wild Mountains. A board seat at WM while doing paid work for Co-Exist (Kurt's other org) is an obvious conflict surface that is nowhere documented.
- **The "Kurt foundation board pitch" row (5fe695cc) from 5 May may be about Wild Mountains** — Kurt showed Co-Exist app at a foundation board meeting and "didn't name the foundation." Now it's 11 May and it's clear Kurt is incoming chair of Wild Mountains. High probability these are the same event, but not confirmed in any substrate.

### Person Node Gaps

- **Kurt Jones**: No `last_name`, no `relationship_to_tate` (qualitative), no Wild Mountains affiliation, no upcoming board-chair role.
- **Angelica Choppin**: Email is wrong (Neo4j has `angelica@resonaverde.com`, canonical is `hello@resonaverde.au`). No `role` property. No `relationship_to_tate`. No Wild Mountains board membership.
- **No "Jess" (Co-Exist collective leader)**: Referenced multiple times in Co-Exist work (push notifications "Jess + Kurt flagged") but no Person node.
- **No "Charlie" (Co-Exist collective leader, Charlie Bennett)**: Mentioned in excel-sync complaint context, no Person node.
- **No "Kim McColl" (WY SOS)**: Not found in any substrate.
- **Goodreach**: "Goodreach (Tom Groat)" labeled as Person — should be Organization. Kurt co-founded it. Extremely thin.

### Structural Map Gaps

- **No relationship between Tate and Wild Mountains** captured anywhere.
- **No relationship between Kurt and Wild Mountains** in Neo4j (only implied via Episode text).
- **No relationship between Angelica and Wild Mountains** in Neo4j.
- **No relationship between Co-Exist Australia and Wild Mountains** (they share Kurt as founder/director of both, and now Angelica bridges too).
- **No capture of "Kurt chairs Wild Mountains June 2026"** — brand new as of tonight.
- **No capture of the board-offer context** that Tate is now considering.

### Draft Gaps

- **No world model or stakeholder map draft exists** (this is the first one — created now by this fork).
- **No Wild Mountains strategic brief**: unlike Yarn and Yield (7 draft files) or conservation-platform (12+ files), Wild Mountains has zero dedicated drafts.
- **No board-membership decision framework** for Tate.

---

## Section 6: DUPLICATES (same fact in 3+ substrates with drift risk)

### 1. Wild Mountain Shape (28 Apr 2026)

Fact: "Wild Mountain is a charity, low-intensity co-investment, not commercial deal, few weeks at a time"

Recorded in:
- Neo4j Decision node "Wild Mountain shape - low-intensity co-investment" (28 Apr)
- Neo4j Episode node "Wild Mountain offer surfaced" (28 Apr)
- status_board row context in 1fb327ea (Angelica referral row) — mentions "Wild Mountain offer deliberately NOT referenced (separate Kurt-Tate channel)"
- kv_store `ceo.outreach.angelica_resonaverde_2026-04-30` — same guard documented

**Drift risk: LOW** — all instances are consistent and reference the 28 Apr recalibration. However, this is now STALE relative to tonight's board-offer context.

### 2. Angelica's Email Address

Fact: canonical email is `hello@resonaverde.au`

Recorded inconsistently in:
- Neo4j Person node: `angelica@resonaverde.com` (WRONG)
- kv_store `ceo.outreach.angelica_referral_follow_up_2026-04-29`: "recipient_pre_correction: angelica@ecodia.au" (very wrong — our own domain) with correction to `hello@resonaverde.au`
- kv_store `ceo.outreach.angelica_resonaverde_2026-04-30`: canonical_recipient: "Resona Verde <hello@resonaverde.au>" (correct)
- status_board row 1fb327ea context: "Recipient correction: hello@resonaverde.au"
- Gmail thread 19da56a1bd3a5f36: source of truth

**Drift risk: HIGH** — Neo4j has the wrong email. Any cold-start reading only Neo4j would email the wrong address.

### 3. Angelica/Resonaverde Commercial Status

Fact: mates-rate client, paid $200 for small project, now has standing arrangement

Recorded in:
- Neo4j Person node: "mates-rate client, paid $200 for a small project"
- Neo4j Pattern node: "Angelica/Resonaverde standing arrangement — autonomous reply authorised" (11 May)
- status_board row b9096359: "active - autonomous reply authorised"
- CLAUDE.md Decision Authority section: "Standing arrangement carve-out (Angelica/Resonaverde only)"
- ~/ecodiaos/patterns/angelica-resonaverde-standing-arrangement.md

**Drift risk: MEDIUM** — Neo4j Person node is stale (still says "mates-rate client, paid $200") and doesn't reflect the standing arrangement codified today (11 May). The pattern file and status_board are current.

### 4. Kurt Jones / Wild Mountains / Foundation-Board (5 May vs 11 May)

Fact: Kurt advocated for Tate at a foundation board meeting (5 May). Now (11 May) Kurt is incoming Wild Mountains chair.

Recorded as:
- status_board 5fe695cc: "unnamed foundation" board meeting, no-chase status
- Neo4j Episode "Pipeline snapshot 5 May 2026 21:56 AEST": "Kurt advocated for Tate at unnamed foundation board meeting + showed Co-Exist app live"

**Drift risk: HIGH** — The "unnamed foundation" from 5 May is almost certainly Wild Mountains. If this is confirmed, that row's framing ("no-chase, await Kurt greenlight") may need updating to reflect that (a) the foundation is now named, and (b) Kurt is explicitly offering Tate a board seat — which is a different action from "Kurt mentioned Tate to a board."

### 5. Resonaverde Site State

Fact: Latest production deployment has shipped 4 features, but public alias is not yet pointing to it

Recorded in:
- kv_store `alert.resonaverde_alias_check.converged` (9 May) — says alias IS converged at a81b716. This is now STALE (multiple new deployments since).
- status_board 44e80cd9: says alias pinned to old deployment, pending Tate.
- Neo4j Episode "Meta-loop 2026-05-11 17:49 AEST": "resonaverde.au alias still pinned to a81b716 (27d+ old)"

**Drift risk: MEDIUM** — kv_store claims converged but board row and Neo4j say pinned. kv_store is stale from 9 May.

---

## Supplementary: Tonight's Context (NEW — Not Yet in Any Substrate)

The following is the brief's context about tonight, not yet captured anywhere:

- **Kurt + Angelica are at dinner with Wild Mountains board prep** (11 May 2026 evening)
- **Kurt is to chair Wild Mountains officially from June**
- **Kurt floated Tate joining the Wild Mountains board**
- **Tate is sitting in Kurt's car in Brisbane right now considering it**
- **Conflict-of-interest surface**: Tate is the developer/contractor for Co-Exist Australia (Kurt's other org). Taking a Wild Mountains board seat while being a paid Co-Exist contractor creates a structural conflict-of-interest question — same patron (Kurt), two orgs, Ecodia's commercial interests involved.
- **The "unnamed foundation" row (5fe695cc)** from 5 May is almost certainly Wild Mountains — same Kurt channel, same conservation orbit, same timing.

**None of this is recorded in any substrate yet.** This recon document is the first capture.

---

*Recon completed by fork `fork_mp0zhi2r_831eb9` at 2026-05-11. All data queried live from Neo4j, Supabase status_board, kv_store, filesystem, CLAUDE.md. No writes made to any substrate except this file.*
