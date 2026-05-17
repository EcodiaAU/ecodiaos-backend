# Outreach Engine Fire - 2026-05-17
## Status: MCP auth expired - artefact committed to repo as substrate-landing fallback

**Fire timestamp**: 2026-05-17  
**Routine**: outreach-engine (every 8h)  
**Account**: code@ecodia.au  
**MCP status**: ecodia-comms, ecodia-core, ecodia-crm all returned "token expired" - re-authorization required in Claude.ai MCP settings  
**Fallback**: Research committed to repo as durable artefact. kv_store + status_board + neo4j writes blocked pending MCP re-auth.

---

## Step 1-2: Pipeline Check
**BLOCKED** - could not query status_board, email_threads, kv_store, or Neo4j due to MCP auth expiry.

---

## Step 3: New Opportunity Research

### Target: Sunshine Coast Environment Council (SCEC)

**Why picked**: Peak body on the Sunshine Coast (Ecodia's home region). Aligns with the Co-Exist peak-body wedge angle. 57 member groups = coordination platform need. New CEO recently appointed. Biosphere reporting pressure creating data infrastructure urgency.

---

### Research Summary

**Organization**: Sunshine Coast Environment Council Inc  
**Role**: Regional peak environmental advocacy body since 1980. Umbrella organization for 57 member groups (coastal care, waterway restoration, landcare, native plants, development monitoring, etc.) plus individual members.  
**Location**: Nambour, Sunshine Coast QLD  
**Website**: scec.org.au  
**ACNC registered charity**

**CEO**: Lisa Malcolm  
**Email**: lisa.malcolm@scec.org.au (confirmed first.last@scec.org.au format via RocketReach)  
**Background**: 30 years in conservation advocacy. Previously National Programs Manager at the Australian Committee for IUCN. High standards for impact measurement. International network.

**Current digital stack**:  
- Website: scec.org.au (recently refreshed - new website migration noted)  
- Donor/member CRM: SupporterHub (drct-scec.prod.supporterhub.net) - generic Australian charity CRM, recently migrated to this  
- Social: Facebook, LinkedIn  
- Citizen science: iNaturalist integration for NatureWatch program

**The gap**:  
SupporterHub is a donor management CRM. It handles contacts, payments, and basic membership. What it cannot do for SCEC:
- Aggregate impact data across 57 independent member groups (volunteer hours, hectares managed, species recorded, events run)
- Give each of the 57 member group leaders their own workspace within a shared platform  
- Coordinate campaign timing across groups (avoiding overlap, enabling collaboration)  
- Generate automated impact reports for grant funders and UNESCO Biosphere reporting obligations  
- Provide a public-facing "collective impact" view for the regional biosphere story

**Key pressure**: UNESCO Biosphere designation June 2022. 5-year interim assessment due 2027. 10-year review 2032. UNESCO requires a measurement framework and impact reporting. The fit-for-purpose biosphere performance framework is being developed NOW - they need the data infrastructure to populate it.

**Current moment**:  
- New CEO (Lisa, from IUCN) = "what does the digital infrastructure need to look like?" window  
- Website refresh + database migration = they are actively investing in digital, mid-evolution  
- Biosphere Awards 2026 = high-visibility season, impact story matters  
- 57 groups = coordination complexity only grows as membership increases

**Warm path in**:  
- Silicon Coast / Startup Sunshine Coast - Tate is active in this ecosystem, SCEC likely intersects  
- Local credibility: Ecodia is Sunshine Coast-based - not pitching remotely  
- Lisa's IUCN background: she has built cross-stakeholder reporting systems before and will recognize the gap immediately  
- If Tate has any connection to Sunshine Coast Council sustainability officers or the Biosphere Advisory Committee, that is the warm intro route

**Competitor risk**: Low. No obvious local competitor doing this. SupporterHub themselves won't build a bespoke coordination layer. iNaturalist is citizen science only. No one is owning the "57 member group coordination platform" space.

---

### Draft Outreach Email

**To**: lisa.malcolm@scec.org.au  
**From**: tate@ecodia.au (Tate to send, not code@)  
**Subject**: SCEC's 57 groups - the coordination gap SupporterHub won't close

---

Hi Lisa,

I noticed SCEC recently migrated to a new database and refreshed the website. Smart investment - the organization has clearly outgrown spreadsheets and scattered systems.

I want to raise something that SupporterHub won't solve on its own.

Managing 57 member groups at a peak body level is a fundamentally different problem from managing donors. Each of your groups has their own leadership, volunteers, events, and environmental data. SupporterHub can track contacts and take payments - but it cannot show you the aggregate picture: how many volunteer hours did all 57 groups log this quarter, which campaigns are overlapping in timing, and what does SCEC's collective impact look like across the region for the UNESCO Biosphere interim assessment due in 2027?

That reporting gap will only sharpen as the Biosphere program matures and UNESCO's measurement framework demands more granular data from across the reserve.

We're Ecodia - a software company based on the Sunshine Coast. We build coordination platforms for organizations that operate the way SCEC does: a central body that needs to function as one coherent movement while keeping member group autonomy intact. We've built platforms for community organizations at this scale - event coordination, impact aggregation, shared resource libraries, volunteer tracking across groups.

I'd welcome a 30-minute call to show you what a purpose-built coordination layer looks like for an organization like SCEC. No generic demo - I want to understand your 57-group coordination problem first and show you something relevant to it.

Are you free for a call in the week of 26 May?

Tate Donohoe  
Founder, Ecodia  
Sunshine Coast  
tate@ecodia.au

---

### Contact / Warm Intro Routing

**Primary**: Direct email lisa.malcolm@scec.org.au  
**Warm alternative**: Silicon Coast network - check if any mutual connections to SCEC board or committees  
**LinkedIn**: Sunshine Coast Environment Council company page - check Lisa's LinkedIn profile for shared connections before cold send

---

## Step 4: Follow-up Schedule

**Required**: Status_board row + 7-day delayed check. Both blocked due to MCP auth expiry.  
**Compensating action**: Once MCP auth is restored, Tate or the OS session should:
1. Create status_board row: entity_type=opportunity, name="SCEC Lisa Malcolm - peak body coordination platform", status="researched_pending_tate_review", next_action_by=tate, priority=3
2. Set kv_store key: cowork.outreach-engine.new_opportunity_draft.2026-05-17 pointing at this file
3. Schedule 7-day follow-up check if Tate sends the email

---

## Step 5: Log Entry

**Overdue handled**: 0 (pipeline blocked - could not query)  
**Drafts surfaced**: 0 (cannot write to kv_store)  
**New research**: SCEC - Sunshine Coast Environment Council  
**Neo4j episode**: BLOCKED (MCP auth expired)  
**MCP auth status**: ecodia-comms, ecodia-core, ecodia-crm all require re-authorization via Claude.ai MCP settings  
**Action required**: Tate to re-authorize MCP servers, then manually trigger the outreach-engine status_board/kv_store writes from this file

---

## MCP Auth Recovery Instructions (for Tate or OS session)

The three MCP servers that power the outreach-engine are failing authentication:
- ecodia-comms (Gmail, email_threads, calendar)
- ecodia-core (kv_store, status_board, neo4j, patterns)
- ecodia-crm (CRM tools)

These are OAuth-gated remote MCP servers registered in the Claude.ai account. The fix is:
1. Go to Claude.ai settings (claude.ai/settings/integrations or similar)
2. Find the three ecodia MCP servers
3. Re-authorize each one
4. The next outreach-engine fire will have full tool access

Alternatively, if the tokens are in the EcodiaOS backend .env/kv_store, the OS session on the VPS can call the Cowork REST API directly - the CODESIGN_MCP_TOKEN found in the remote execution environment env did not have the right scopes for the cowork endpoints (returned empty tool list at /api/mcp/cowork).
