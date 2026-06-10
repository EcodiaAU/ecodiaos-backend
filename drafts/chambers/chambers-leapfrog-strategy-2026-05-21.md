# Chambers strategy: leapfrog + outpace WaveCRM

**Date:** 2026-05-21
**Decision:** Compete directly with WaveCRM via catch-up + leapfrog. No partnership, no integration, no morphing with SafeCo. Greenfield-only positioning (Path 1) and Kill option (Path 3) held in reserve as fallbacks.

## Strategic position

WaveCRM (Wave by SafeCo, QLD) is the dominant local incumbent. 50+ chamber customers across QLD including Brisbane Junior, Gold Coast, Kawana, Caloundra, Logan, Nambour, Tourism Noosa. $278.25 + GST per month flat. Web-only, no native app. Marketing roadmap silent since Q3 2023. LinkedIn posts use ChatGPT-style writing with em-dashes (signal: AI-aware but not AI-native). Posting cadence sparse. Visual brand dated.

**Our edges:**

1. Native iOS + Android via Capacitor (Wave is web-only)
2. AI-native dev velocity, plausibly 10-20x SafeCo's
3. Multi-tenant federation from line 1
4. Modern UX, fast iteration cycles

**Our gaps vs Wave:**

1. EDM with segmentation + drip campaigns
2. 2-way Xero integration
3. Paid event ticketing with dietary + voucher options
4. Direct debit facility

## Build plan (4-8 weeks part-time)

| Gap | Effort | Build approach |
|---|---|---|
| EDM + drip | ~2 weeks | Resend or SendGrid base, segmentation on Supabase queries, Loops-style campaign editor |
| 2-way Xero | ~1-2 weeks | Existing Xero MCP tooling + chambers-tenant context layer |
| Paid ticketing | ~1 week | Extend existing Stripe BillingAdmin with dietary/voucher field set |
| Direct debit | ~1 week | Stripe BECS direct debit, already on platform |

Plus polish, testing, and a Wave-comparison marketing page.

## GTM plan

**Phase 1 (now, 4-8 weeks). Build, no outreach.** Close the feature gaps (EDM, Xero, paid ticketing, direct debit). Polish existing surfaces. Register a real member account on an actual Wave customer chamber portal (Caloundra or Kawana) and document the real feature depth gap, not the marketing-site one. No chamber approached until the product can stand against Wave on its own merits.

Tate directive 2026-05-21: "we need to be focusing on the actual app before we approach them with a halfbaked product that is supposed to overtake an existing competitor."

**Phase 2 (post catch-up).** 4556 Chamber approach. Greenfield, no switching cost. Tate drafts the outreach himself when product is ready. Native mobile + feature parity + modern UX is the pitch.

**Phase 3 (4556 live, +4 weeks).** Switch-pitch one Wave customer. Target criteria: on Wave, members want mobile, EO is tech-curious. Likely candidates: Kawana (already using AI Compass voice agent), Maroochydore (modern site, Brendan Bathersby reachable as President).

**Phase 4 (8+ weeks post first switch).** Two more switch-wins on Wave customers. Build the case study. Wave incumbency erosion begins.

## Path 4 (integration / partnership): killed

Tate directive 2026-05-21: "we can just exceed them." No morph with WaveCRM, no partnership outreach to SafeCo. Their public API is non-existent anyway (probe confirmed). Compete head-on.

## Risks

1. SafeCo accelerates mobile build if they see us coming. Mitigation: ship + win first reference customer before they notice.
2. Wave customers have stickiness from Xero integration (data migration is real). Mitigation: build migration tool as part of catch-up.
3. We underestimate Wave's actual feature depth (marketing site may not show everything). Mitigation: live member login + customer interview as catch-up sanity check.
4. Sales-cycle assumption optimistic. Mitigation: 4556 sale either validates or corrects the cycle.

## Sequencing this week

1. Wave API probe (done, killed).
2. Catch-up build kick-off. EDM first (highest WaveCRM parity value, members care about it day-to-day).
3. Register a member account on an actual Wave customer chamber portal. Document real feature depth vs marketing-site claims.
4. Status_board row + Neo4j Decision node for the play. Weekly cadence on review.
5. No outreach to chambers until Phase 2. Tate drafts when ready.
