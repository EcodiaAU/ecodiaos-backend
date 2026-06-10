# Mossy call prep - Yourcelium pivot - 2026-06-04

**Call trigger:** Mossy sent the Yourcelium proposal overnight. Tate calling instead of replying in writing.
**Window:** Today, before MacBook deal closes. Audit week starts whenever the deposit clears.

## Stance in one line

The shared parts are real. Platform-first sequencing is wrong. Ship one surface first, extract the bones for the second, the third earns the name platform.

## Points to validate (warm opener)

- Shared identity, structured store, aggregation, personas, Landscape via Murmurations are all real signal.
- The single signin and single privacy story instinct is right strategically.
- The one-page interface spec being ready means he's done the work.

## Points to push back on

- Platform-first sequencing is the most consistent way serious work dies. Foundation grows, nothing real on top pulls on it, year later infrastructure ships and no apps did.
- Taxonomies, aggregation, personas are shared in name only. In practice each surface uses the same libraries in completely different contexts. That's how code works. Building all of them upfront before any surface ships means building three abstractions instead of one specific thing each app needs.

## Counter-proposal (sharpened mid-prep)

The genuinely shared layer IS identity + auth + shared backend. Taxonomy, aggregation, personas, Landscape are shared in name only. In practice each surface uses the same libraries in completely different contexts.

**6k scope (Tate is doing the work, so the budget covers more than a dev-shop quote would):**
- ONE Supabase project with shared user/key schema and RLS
- ONE auth flow (Apple Sign In + Google Sign In + email)
- Real cross-app identity via Ed25519 key pair in secure enclave, QR + passphrase recovery
- Device attestation via Apple App Attest entitlement and Android Play Integrity (entitlements plus a few hours of server-side validation)
- ONE full MVP app surface, his pick, LIVE on App Store + Play Store under Mossy's accounts

**NOT in scope at 6k:** reason taxonomies (per-surface, library reuse in different contexts), aggregation logic (per-surface), personas (per-surface), Landscape via Murmurations (later concern), polish pass and secondary features on the chosen app surface (Phase 2 conversation once the core loop is live).

**The reframe for Mossy:** we build the core Yourcelium spine that legitimately deserves to be shared (identity + auth + backend), plus one full MVP app on top, live on both stores under his accounts. The grand platform with three surfaces becomes possible once the first surface ships and shows what else is shared in practice.

**The honest warning for Mossy (rapport move, lead with it):** the sec+iden layer is an investment in his app ideas. It provides ongoing value as long as he ships apps on top of it. If he drops all the app ideas, the layer is useless. Worth naming on the call so he knows we are looking out for his interests and not selling him infrastructure for its own sake.

## Scope pin: what MVP means at 6k

MVP means core loop only, live on App Store + Play Store under Mossy's accounts. No marginal features. No polish pass. No secondary flows beyond the core. He gets the "wow I have an app on the store" moment, real users on real shopping trips, and the foundation to iterate from. Polish pass, secondary features, and content extensions are the natural Phase 2 conversation.

Pin this on the call so the audit conversation doesn't drift the scope. Keep the app intentionally light. The sec+iden layer is the big chunk of the work; the app surface is a sensor and a screen calling into the foundation.

## Framing the 6k as relationship investment

6k is intentionally below market for hardcore identity + cross-app foundation + MVP on iOS and Android. Worth naming on the call so Mossy understands the favour and the larger Yourcelium-platform conversation has a stronger anchor when the budget needs to stretch to what the work deserves.

## Decisions you want by end of call

1. Does Mossy accept ship-one-surface-first.
2. Which surface goes first, his pick (T&Cs&U or Lost Me both fine).
3. Does the deposit move today or wait until the audit conversation settles.
4. Audit week start date (this week or next).

## Lines to hold under pressure

- 6k buys identity + cross-app foundation + one MVP app live on both stores under Mossy's accounts. The grand platform with three full surfaces needs a different number. Honest framing.
- Phase 2 rescope at end of audit week is the standard move once the first-surface decision is made.
- Yourcelium-the-platform stays alive as a conversation. The first surface goes first.
- Taxonomies, aggregation, personas are shared in name only. In practice they use the same libraries in different contexts. That's how code works.
- The sec+iden layer is an investment in Mossy's app ideas. If he drops the apps, the layer is useless. Worth saying out loud so he knows we are looking out for him.
- MacBook is logistics. Today or Monday, both work on my end.

## Don'ts

- Don't dismiss the platform vision.
- Don't pressure on the MacBook. He did real thinking. Pressure breaks the trust.
- Don't agree to build the identity layer inside the current 6k scope.
- Don't pick the first surface for him.

## Questions to ask Mossy on the call

- Can you send me the one-page interface spec now so we can read it together while we talk.
- Which surface would you hate to ship at 80 percent.
- Identity + device attestation as a months-of-work or weeks-of-work question, what's your honest read.
- Who else is in the build conversation, anyone on the security side.
- What changes about Yourcelium if the first surface ships in 4 weeks versus 4 months.

## If he doubles down on platform-first

Honest budget conversation. Current 6k cannot scope what he's proposing. Options: scale the budget to match, bring in a co-builder for the identity layer, or ship one surface inside the current 6k and continue the Yourcelium conversation separately.

## If he wants to defer the deposit

Fine. Audit can start Monday. MacBook moves on without his deposit, that window closes today but the deal with him is unaffected.

## Account setup handoff to Mossy

After the call, EcodiaOS sends Mossy a checklist for accounts he creates under his name/control then invites Tate or code@ecodia.au into each:

- Apple Developer Program ($99/yr, his Apple ID, invite code@ecodia.au as Admin)
- Google Play Console ($25 one-time, his account, invite code@ecodia.au)
- Supabase organisation (his email, invite code@ecodia.au as Org Owner)
- Resend account (his email, invite code@ecodia.au)
- GitHub or Bitbucket organisation for the codebase (his account, invite EcodiaCode)
- Domain ownership for any app-facing URLs
- Current Mongo dump access for the migration

Keeps everything under his name and control while EcodiaOS works inside the accounts. No pottering around setup on Tate's side.

## Status_board target after the call

Row e5703eb6 updated with: which surface, deposit timing decision, audit week start, account-setup-checklist sent yes/no, any Phase 2 rescope direction.
