# Goodreach restructure: four decisions to commit

From EcodiaOS, for Tate.
Date: 2026-06-10.
Source: `drafts/clients/goodreach/goodreach-restructure-proposal-2026-05-20.md`, `drafts/clients/goodreach/goodreach-master-audit-2026-05-21.md`, Neo4j Decisions on Goodreach 2026-05 to 2026-06, the 2026-06-08 pre-mortem on row 5f4d0670, the 2026-06-08 Tom outbound draft, the 2026-06-08 Angelica v3 cover draft.

## The opening read

The 2026-05-20 proposal is a strong starting point that has gone quiet for nineteen days. The reason for the quiet is not the proposal text. It is four placeholder fields the proposal flagged itself as deferred. Until those four convert to numbers Tate stands behind, the document remains an interesting starting point rather than a term sheet anyone can engage with.

One context point sits in front of the four decisions. On 2026-05-20 Tom forwarded a different pitch alongside the restructure conversation. He proposed a model-agnostic business-brain platform that he and Tate would own, with Kurt as a referral channel rather than a co-founder. That pitch is logged in Neo4j as "Tom business-brain pitch analysed vs Goodreach restructure 2026-05-20" and surfaced in the 2026-06-08 pre-mortem on this row. Tom has been waiting nineteen days for an Ecodia-side response on it. Decision (d) on timing is downstream of that.

## Decision (a): the Ecodia operator services fee

The 2026-05-20 proposal language reads "recurring fee as a percentage of Goodreach gross revenue. The fee covers Ecodia's operating cost and absorbs the ongoing engineering load." No percentage.

The benchmark range matters. Pure infrastructure resale runs 5 to 15 percent of customer revenue, AWS-shape. A dedicated fractional CTO with equity tooling runs 15 to 25 percent equivalent. What Ecodia delivers to Goodreach sits closer to embedded engineering team plus autonomous fix-ship plus AI operations plus the bug-triage portal plus the Context Engine substrate. That is materially heavier than infrastructure resale, and lighter only on the marketing side than a full fractional CTO arrangement.

The recommended range is 15 to 22 percent of Goodreach gross revenue, with 18 percent as the proposed default. The lower bound of 15 is defensible against the "we are just hosting" framing if Tom or Kurt push back. The upper bound of 22 reflects the genuine fact that the Context Engine is a five-year build EcodiaOS is contributing as substrate, not as billable engineering. At 18 percent on the Year 3 trajectory ($2.5M ARR), Ecodia receives $450k per year for keeping a multi-tenant SaaS running with autonomous operation. That is the floor at which the contract sustains the underlying EcodiaOS infrastructure.

The structure question sits inside the percentage. Recommend gross-revenue percentage with a floor (something like $4k per month minimum during ramp), not a pure percentage, because in Year 1 at $144k ARR, 18 percent is $26k per year, which does not cover the engineering load. The floor protects the operator during ramp; the percentage scales the operator with success.

Tate decides: the headline percentage and whether the floor-plus-percentage structure holds.

## Decision (b): the Resona channel partner economics

The 2026-05-20 proposal language reads "standard channel partner economics with a declining tier over time." That phrasing commits to nothing concrete. The opening rate, the tier curve, and the decline horizon all sit open.

The benchmark range matters here as well. Standard B2B SaaS channel-partner economics opens between 20 and 35 percent of first-year customer revenue. Hubspot opens at 20 percent. Salesforce ranges 15 to 25. Smaller AI-tooling vendors often open at 30 percent to attract initial channel partners. Decline curves typically halve over two to three years and then flatline at 10 to 15 percent for the lifetime of the customer.

The recommended opening is 30 percent of net customer revenue in Year 1, dropping to 20 percent in Year 2, dropping to 15 percent for the remaining lifetime of the customer. That generates real cash for Resona during the period she is most actively introducing clients, then stabilises into a permanent loyalty economic so she keeps introducing. The 30-20-15 shape signals partnership rather than transactional commission, which sits cleanly alongside the standing arrangement and the v3 referral agreement Resona is already in.

Net-revenue rather than gross-revenue matters. Net here means revenue after Stripe fees and the Ecodia operator percentage. That avoids Resona being paid on infrastructure cost that never reaches the Goodreach entity. Standard partner-agreement language.

Tate decides: the opening percentage, the decline schedule, and whether Resona's existing Ecodia bespoke referrals (under the v3 in-flight agreement) sit cleanly outside the Goodreach partner agreement so the two stay non-overlapping.

## Decision (c): the founder equity split

The 2026-05-20 proposal language reads "Three founders. Equal equity split. Standard four-year vesting with a one-year cliff." 33/33/33.

Equal-thirds is a placeholder. It is the default for early-stage three-founder companies where contribution shape is genuinely symmetric. Goodreach is not that. Three asymmetric contributions sit on the table.

Kurt brings the NFP sector authority, his existing network of NFP relationships, and the credibility to walk Goodreach into ACNC-relevant rooms. Tom brings product and design judgement, the original Goodreach scoping work, and consumer-facing aesthetic taste. Tate brings the full EcodiaOS substrate that Goodreach runs on (the Context Engine itself, the multi-tenant architecture, the autonomous fix-ship pipeline, the AU-resident AI operations layer), the SMB channel through Resona, and the autonomous-operator capability that makes the Year 3 unit economics work.

The substrate contribution from Tate dominates. Without EcodiaOS as the operator, Goodreach is a normal early-stage SaaS startup needing $1M to $2M of capital to build what already exists. The substrate cost saving here, at startup-fair-valuation, is in the $1.5M to $3M range.

Two split options carry rationale. The first holds equal-thirds and accepts that the substrate contribution sits inside the Ecodia operator services contract rather than inside the equity. The second weights to 40/30/30 Tate/Tom/Kurt, recognising the substrate explicitly inside the equity stack.

Recommendation: weight to 40/30/30. The reason is that the operator contract recovers operating cost and engineering load, not the upstream substrate value. If Goodreach hits the Year 3 acquisition range of $20M to $100M, the substrate that made it possible deserves recognition in the equity stack rather than only in the operating fee. The 40/30/30 shape is well within standard ranges for asymmetric three-founder splits and is much easier to negotiate at incorporation than to renegotiate later.

The weaker case for equal-thirds: simplicity, alignment, no founder-equity argument at the start of the relationship. There is a real argument that holding equal-thirds is the relationship investment Goodreach needs to succeed at all, and that the operator contract is sufficient recognition. That argument has weight.

Tate decides: 33/33/33 or 40/30/30, and whether the operator fee in (a) shifts based on the answer here.

## Decision (d): the Tom outbound, the Tom substance, and the timing

The 2026-06-08 outbound at `drafts/outbound/tom-groat-goodreach-restructure-2026-06-08.md` asks Tom for a forty-five-minute call this fortnight. It is two days old. The fortnight window opened 2026-06-08 and closes around 2026-06-22.

The timing question is downstream of a substance question Tate has been deferring for nineteen days. Tom's 2026-05-20 pitch proposed a different entity shape, Tom and Tate as the only founders of a new business-brain SaaS, with Kurt as a referral source rather than a co-founder. The pre-mortem on row 5f4d0670 dated 2026-06-08 names this directly. Sending the Tom outbound without an internal position on his pitch risks the call going one of two ways. Tom assumes the silence has been tacit agreement and the call opens with him expecting alignment on his shape. Or Tom hears the three-founder thesis at the call and reads Ecodia as having quietly ignored his counter-proposal for three weeks, which damages the working relationship more than the substance disagreement would.

Three real options on substance, ordered by EcodiaOS recommendation.

The first option is to acknowledge Tom's pitch explicitly before the call, then walk through the three-channel thesis. The three-channel restructure is the stronger commercial bet. Tom's business-brain pitch is a single-channel SaaS that competes directly against well-funded incumbents (Notion AI, Glean, ChatGPT Enterprise) without sector specificity. The three-channel structure has sector specificity Kurt and Angelica already hold. Acknowledging Tom's pitch lets him stay engaged on his contribution shape (product + design) while the founder-set conversation gets reopened cleanly. This option preserves Kurt's involvement.

The second option is to take Tom's substance and run with it, exiting Kurt from the founder set and treating Goodreach as the NFP-only entity with Tate's new business-brain co-founded with Tom as the parent. That would be a material strategic pivot. It carries the cost of unwinding the Kurt assumption that has sat in the proposal for three weeks, and the opportunity cost of losing the Resona SMB referral pipeline that only works if SMB is a Goodreach channel.

The third option is to hold position on the three-channel thesis without engaging with Tom's pitch. That is the option Ecodia has effectively been running for nineteen days. The pre-mortem says it does not survive Tom's next reading.

Recommendation: option one. Send the Tom outbound this week, with one added sentence that names having read his 20 May pitch and the intention to walk through how the three-channel structure relates to it on the call. The Angelica v3 cover and the Angelica restructure pulse can go out the week after, once Tom has either accepted the three-channel thesis on the call or surfaced the substantive disagreement that needs to land first.

Tate decides: option one, two, or three on substance, and whether the Tom outbound goes Tuesday 11 June or after the next Tate-EcodiaOS sync.

## The strategic ground

A platform that lives at the convergence of NFP governance and SMB operations, served by one Context Engine, is acquirable by a strictly wider buyer set than either single-channel business alone. Blackbaud and Bloomerang on the NFP side, Atlassian and Notion and HubSpot and Intercom on the SMB side. EcodiaOS holds the operator economics and the substrate. Goodreach captures the brand, the channels, and the founder relationships. The structure is durable across whichever of the four decisions land in the proposal that comes out the back of the Tom and Angelica conversations. The decisions just need committing.
