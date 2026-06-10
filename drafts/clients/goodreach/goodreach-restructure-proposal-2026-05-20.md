# Goodreach: A Restructure Proposal

**For:** Tom, Kurt, Angelica.
**From:** Tate.
**Date:** 20 May 2026.

This is a starting structure for conversation. Not finalised terms. The percentages and rates are placeholders for the direct conversations between each of us.

---

## Where Goodreach is

Goodreach was scoped as an AI tools platform for Australian NFPs. The architecture is sound. Multi-tenant React on Supabase, RLS-isolated tenants, RAG via pgvector, the Context Engine as the defensible centre. The product spec is thorough. The UI prototype is done. The codebase is scaffolded.

The build has stalled for about six weeks. The reason sits in GTM rather than in the product itself. The original framing leaned toward product-led growth. The NFP market is too high-touch and budget-constrained for a self-serve funnel to convert at any meaningful rate. Context Engine is real defensibility. It needed a sales-led channel to plug into.

## What changed

A second channel has surfaced. Angelica at Resonaverde consults to for-profit Australian SMBs on systemisation, efficiency, and AI. Her clients ask for two specific tools repeatedly. Meeting capture and analysis. An onboarding-document AI agent. Both are what the Context Engine architecture already builds.

This is the same product. A second buyer segment. A working referral pipeline attached.

## What the platform becomes

One product. One Context Engine. Three channels.

1. **NFP channel.** Governance health checks, board report generation, grant drafting, compliance. The original Goodreach scope. Kurt's network is the GTM motion.
2. **SMB consultancy channel.** Meeting capture, onboarding agent, ops documentation, internal knowledge surfacing. Resona's referral pipeline is the GTM motion.
3. **Bespoke channel.** Custom builds on top of the platform for clients whose needs exceed the standard tools. Ecodia delivers. Goodreach refers in.

The same multi-tenant infrastructure serves all three. The Context Engine compounds across both verticals. A platform that serves both NFP governance and SMB operations is acquirable by a wider buyer set than either alone. NFP-focused (Blackbaud, Bloomerang) and SMB tooling (Atlassian, Notion, HubSpot, Intercom).

## Proposed structure

**Goodreach Pty Ltd.** New entity. Three founders. Equal equity split. Standard four-year vesting with a one-year cliff. IP assignment from all three. Roles as follows.

| Founder | Role |
|---|---|
| Kurt | Sector authority and NFP GTM |
| Tom | Product and design |
| Tate | Tech, autonomous operator, SMB channel |

Founder equity is the compensation. No internal referral kickbacks between founders.

**Ecodia Pty Ltd to Goodreach.** Operator services contract. Ecodia runs the platform infrastructure. AI operations, the bug-triage portal, infrastructure, customer support tech, and the autonomous fix-ship pipeline. Recurring fee as a percentage of Goodreach gross revenue. The fee covers Ecodia's operating cost and absorbs the ongoing engineering load.

**Resona Pty Ltd to Goodreach.** Channel partner agreement. Resona refers SMB consultancy clients to the Goodreach platform. Standard channel partner economics with a declining tier over time. Resona retains its existing Ecodia relationship for bespoke work that does not fit the platform.

## What V1 ships

Two modules first. The rest follows demand.

1. **Meeting Capture and Analysis.** Transcription, search, action extraction, decision tracking. Integration with Google Workspace, Microsoft 365, Slack, Notion, HubSpot. Most of this is already built on the EcodiaOS substrate.
2. **Onboarding-Document Agent.** Organisations upload identity documents. Constitution, strategic plan, financials, SOPs, employee handbook. The documents are chunked, embedded, and surfaced through an AI agent that answers operational questions grounded in the organisation's own context. This is the Context Engine in its primary commercial form.

A customer-facing bug-triage portal ships alongside V1. Customers submit issues. Haiku triages, deduplicates, and severity-scores. Critical bugs route to the autonomous conductor for fix-and-ship inside 24 hours. Standard bugs land in a weekly batch. The 24-hour fix-ship SLA is a customer-visible feature. Human-staffed competitors quote five to ten days.

The NFP-specific tools from the original spec (governance check, board report, grant drafter) ship as the NFP channel ramps. SMB-specific tools (client status reports, internal SOPs) ship as the Resona channel ramps. The Context Engine underneath is shared.

## Conservative target trajectory

| Year | Tenants | Blended ARPU | Platform ARR |
|---|---|---|---|
| 1 | 30 | $400/mo | $144k |
| 2 | 150 | $500/mo | $900k |
| 3 | 400 | $520/mo | $2.5M |

Year 3 also has the Ecodia bespoke layer on top. Unit economics work because autonomous operation keeps the cost of delivery close to zero. Acquisition range $20-100M over a three to five year horizon depending on growth shape and acquirer interest.

## Why now

- The architecture is specified and the scaffolding is built.
- Two V1 modules largely exist in adjacent codebases.
- Kurt's NFP network is warm and underused.
- Angelica's SMB referral pipeline is active and asking for product.
- EcodiaOS as an autonomous operator is shipping native apps already. Running a multi-tenant SaaS is well inside scope.
- The piece not yet in place is the formal team structure.

## Next steps

1. Three-way founder alignment on structure and equity. This document is the starting point.
2. Entity incorporation. Founder agreements. IP assignment.
3. Ecodia operator services contract drafted in parallel.
4. Resona partner agreement drafted in parallel.
5. V1 build, four to six weeks from green light.
6. First paying tenant per channel inside eight weeks.

---

*Specific percentages, fees, and rates to be agreed in direct conversations. Nothing in this document is a finalised term.*
