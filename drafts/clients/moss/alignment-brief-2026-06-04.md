# Alignment brief: Mossy's PDF vs the call lock - 2026-06-04

**For:** Tate's audit-week kickoff conversation with Mossy.
**Source:** Mossy's "yourcelium-build-context-for-tate.md.pdf" (5 pages) + "Wireframe.png" (one-substrate three-faces architecture), received 2026-06-04 ~11:55 AEST.
**Status:** EcodiaOS-internal. Not for Mossy.

## TL;DR

Mossy's framing on paper is **three thin-client apps on one Yourcelium substrate**, with T&Cs&U shipping first. The call lock you settled with him verbally was **one consolidated app with features added over time**, surface-pick irrelevant. These are different product architectures. The kickoff opens with that gap.

The substrate-level decisions (advanced auth, App Attest + Play Integrity, native iOS+Android, ports/adapters) align cleanly. The surface-level decision (one app vs three) does not, and seven other open questions sit underneath it.

## What aligns

- **Yourcelium as advanced auth substrate.** Mossy: "Identity and integrity: one sign in, a key pair, device attestation. No personal data." Call lock: same.
- **Native iOS + Android.** Mossy floats "Native iOS/Android, PWA, or hybrid" as open Q2, but his sensor list (barcode scan + device attestation + camera) points the same way you locked.
- **Apple App Attest + Android Play Integrity.** Mossy: "Use now." Call lock: same.
- **Non-custodial key custody.** Mossy: "device secure enclave (non custodial)" is one of the two options on Q4 and the rest of his text leans there. Call lock: secure enclave + QR + passphrase recovery. Same direction.
- **Hexagonal / ports and adapters pattern.** Mossy: "the single most important rule in the build." The scaffold I shipped today wraps identity behind a `SessionStore`; the next pivot lands ports explicitly so this rule holds at the code layer.
- **Live on stores under Mossy's accounts.** Implicit in Mossy's spec, explicit in the call lock.
- **B2B intelligence as the revenue arm.** Mossy: "preferred long-term path is to never sell the consumer app, only ever spin out the B2B data arm." Call lock: data-sale demoted to disclosure, public-pressure mechanism is the consumer story. Both leave B2B as the upside.

## What diverges

### 1. One app vs three apps (the load-bearing one)

- **Mossy's PDF:** three separate thin-client apps (T&Cs&U, Lost Me, Glasshouse). Each is a sensor + UI calling into Yourcelium via ports. A fourth app later is a new sensor on the same foundation, not a new build.
- **Call lock:** one consolidated app with features added over time. "THE app" with absorbed feature ideas, three codebases total (Yourcelium + iOS + Android).
- **Why it matters:** different product, different store listings, different growth loops, different brand. Three thin apps is closer to a Spruce-style toolchain. One app with features is closer to a Yuka-style consumer product. They reach a different first-1000 users and have different B2B story.
- **Resolution path on the call:** lead with "you wrote three apps in the spec; on our call I heard one. Walk me through what you actually want." Listen for whether his three-apps framing is product-architecture or marketing-bundle-architecture.

### 2. First-shipped surface

- **Mossy's PDF:** T&Cs&U first. "Legible pain, cheap to grasp, proves the whole spine end to end." Lost Me second.
- **Call lock:** Mossy's call which-one-first. You said "irrelevant".
- **What this means:** if his preference holds, the first feature (or first thin app) we ship is the T&Cs&U clause decoder, not the Lost Me barcode loop. My iOS scaffold has the LostMe scanner module already; it stays valid as a downstream feature, but Feature 1 becomes T&Cs&U.

### 3. Tech substrate: Supabase vs Cloudflare

- **Mossy's PDF Q3:** "Runtime / hosting: Cloudflare Workers and Pages for the substrate? Where do keys live?" Open.
- **Today's scaffold:** Supabase. I picked Supabase because the call lock said "ONE Supabase project, ONE shared user/key schema with RLS, ONE auth flow" and Supabase ships auth + Postgres + edge functions + RLS in a single product.
- **Cloudflare path:** Workers + D1 (or Turso) + KV + R2. Tighter on edge latency, native to the open-protocol / self-hostable shape Mossy leans toward elsewhere in the doc. Loses Supabase's built-in OAuth and RLS.
- **Resolution path on the call:** ask which constraint matters more, "I want this self-hostable later" (lean Cloudflare or move to self-hosted Postgres) versus "I want auth done in a week" (Supabase). If self-hostability matters and we are still ok with managed for now, Supabase + a self-host-later migration plan is fine.

### 4. Identity stack: real DIDs vs Ed25519

- **Mossy's PDF:** "Mature decentralised identity libraries (DIDs, verifiable credentials; Spruce-style tooling). Build on these now."
- **Today's scaffold:** raw Ed25519 key pair, public key + fingerprint in a `key_pairs` table.
- **The gap:** Spruce-style means W3C DIDs + Verifiable Credentials. That is a wrapper layer (a DID like `did:key:z6Mk...` derived from the Ed25519 public key, plus VC issuance + verification flows). Doable, adds 8-12 hours of work depending on scope.
- **Resolution path on the call:** confirm whether v1 needs DID-shaped public identifiers (probably yes, given the "First Person Protocol" alignment) or whether raw Ed25519 fingerprints are fine for the first ship with DID wrappers in v1.1. Recommend the latter for budget.

### 5. Cheeky-mode + leaderboard + social shares (Lost Me feature surface)

- **Mossy's PDF:** Lost Me has "a straight mode and a cheeky mode (funny pre-set reasons, a leaderboard, pre-filled social shares for organic spread)."
- **Today's scaffold:** straight mode chips only.
- **Resolution path:** flag this in the feature-1-or-2 conversation. The cheeky mode needs a dual-display-string-to-canonical-reason-code mapping at the schema level so the comedy never poisons the B2B data product. Worth pinning the schema seam in audit week.

### 6. T&Cs&U LLM dependency

- **Mossy's PDF:** "Anthropic API (Claude). Use now." Plus a "Build Database of most common docs, that auto updates to save on API calls" instinct.
- **Today's scaffold:** no LLM wiring yet.
- **Resolution path:** confirm whose Anthropic API key funds the v1 decode calls, plus the cached-decode database design (probably a Supabase or Cloudflare R2 bucket keyed by document hash).

## Mossy's seven open questions (his §8) with EcodiaOS draft positions

| # | Question | Draft position to bring to the call |
|---|---|---|
| 1 | Scope split: surfaces only or surfaces + substrate? | Surfaces + substrate. That is the deal we locked verbally. |
| 2 | Native iOS/Android, PWA, or hybrid? | Native, both. App Attest + Play Integrity force it. Scaffold already shipped. |
| 3 | Hosting: Cloudflare Workers? Where do keys live? | Supabase for v1 (faster ship). Self-host migration documented as Phase 2 if Mossy wants it. Keys: device secure enclave only. Recovery wrap travels via QR + passphrase. |
| 4 | Key custody: device secure enclave vs custodial? | Non-custodial. Confirmed both sides. |
| 5 | Reason taxonomy: who owns v1? | Mossy. EcodiaOS implements the schema seam (display string -> canonical reason code) so funny mode and serious mode share the same B2B-payload code. |
| 6 | Glasshouse uniqueness: when does it need proof of personhood? | Deferred to post-MVP. App Attest gives device uniqueness for now, real proof-of-personhood once First Person Protocol ships. |
| 7 | Legal / privacy owner: data-sale consent flows, T&Cs decode liability, defamation on pre-filled captions? | Tate owns the practical compliance work (AU Privacy Act + GDPR-equivalent flows), Mossy owns the strategic legal call. Recommend a lawyer review before any cheeky-mode pre-filled caption ships. |

## What I shipped today before reading the attachments

- `D:/.code/seedtree-auth/` (the Yourcelium substrate repo)
  - README with architecture diagram
  - Supabase migration: features, devices, attestations, key_pairs, signals, brands, reports, RLS, dedup index, brand+reason+7d view
  - Edge functions: verify_app_attest, verify_play_integrity (Phase 1 stubs, hardening notes inline)
  - Account-setup checklist for Mossy
- `D:/.code/seedtree-ios/` (the iOS app codebase)
  - project.yml for xcodegen
  - SwiftUI App entry, design system (paper / ink / flag / sage palette + Lora / Manrope fallback type)
  - Auth: SessionStore, KeyPairManager (Curve25519), AppAttestService, DeviceRegistry
  - Screens: SplashView, OnboardingFlow (3 cards), AppShell (3 tabs Scan/Ledger/You)
  - Feature: LostMe scanner (ScannerView, ScannerModel, BracketOverlay, WhyChipsSheet)

The iOS scaffold reflects the call-lock single-app shape. If kickoff resolves to three-apps shape, each Feature folder splits cleanly out into its own app target.

## What I'm doing in the remaining build window

1. Rename Yourcelyium -> Yourcelium across the scaffold (Mossy's canonical spelling)
2. Add a ports layer to iOS (`Adapters/IdentityPort.swift`, `Adapters/AttestationPort.swift`, etc) so the hexagonal rule holds at the code layer Mossy named as load-bearing
3. Add a T&Cs&U feature module skeleton so the iOS app has Feature 1 (T&Cs&U) + Feature 2 (Lost Me) on the same shell
4. Android scaffold (Gradle, Compose, Sign In, Keystore, Play Integrity, same module split)
5. Progress narration doc at `drafts/clients/moss/build-progress-2026-06-04.md`

If the kickoff resolves the one-app-vs-three-apps question toward "three apps", the iOS folder reorganises in roughly 30 minutes (split SeedTreeApp into TCsUApp, LostMeApp, GlasshouseApp targets in the xcodegen spec). Substrate stays as-is.

## Recommended opening for the kickoff call

> "Read both attachments. The substrate calls all aligned with what we settled, and the ports-and-adapters principle is going in at the code layer today. There is one thing where your written spec and our verbal call drift: you wrote three apps, I heard one. Walk me through what you actually want. Same product after that conversation either way; just want to make sure we are building toward the same thing."

That opener honours his thinking, names the gap without litigating it, and gives him the room to either restate the three-apps shape or accept the consolidated-app shape. Either resolves cleanly.
