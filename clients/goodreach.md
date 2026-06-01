# Goodreach - canonical infra manifest

> The single source of truth for Goodreach's repos, hosting, domains, and substrate.
> Read this BEFORE touching any Goodreach surface. If reality and this doc disagree,
> fix this doc in the same turn. Format is the standard for every project/client
> (see glovebox.md "Manifest format" at the bottom).

**Product:** Goodreach - productised AI-tool suite (5 tools: governance/ACNC compliance,
board reports, grant drafter, meeting capture, ask-your-documents) for organisations that
work with sensitive material. Three channels: NFP (Kurt's network), SMB (Angelica/Resonaverde
referrals), bespoke (Ecodia custom). Tools are the product. RAG is plumbing.
**Co-founders:** Kurt + Tom + Tate.

**Immutable identifiers (never change these):**
- iOS bundle id: `au.ecodia.goodreach`
- Apple Team ID: `86PUY7393S` · ASC app Apple ID: `6771579670`
- TestFlight external link: `https://testflight.apple.com/join/eZPVY8Qm`
- AU data residency: AWS Bedrock Sydney, Claude Haiku 4.5 AU profile, Titan v2 embeddings.
  DeepSeek explicitly forbidden for customer data.

---

## Surfaces - repo + hosting + status

| Surface | Repo | Hosting | Live URL | Status |
|---|---|---|---|---|
| **Web** | `EcodiaTate/goodreach` (Vite + React + TS + Capacitor wrapper) | Vercel project **`goodreach`** (framework `vite`, prod branch `main`, auto-deploy) | **`goodreach.vercel.app`** (canonical) + auto-alias `goodreach-ecodia.vercel.app` | LIVE |
| **iOS** | same repo, `ios/App` Capacitor target | TestFlight (App Store pending) | `au.ecodia.goodreach`, ASC app `6771579670` | TestFlight live (build 3 ship in flight on SY094 as of 2026-05-21) |
| Edge functions | same repo, `supabase/functions/*` | Supabase Edge Runtime | n/a | 13 deployed in 2026-05-21 pass |

**Local Corazon path:** `D:/.code/goodreach/` (main clone, branch `main`).
Linked worktree `D:/.code/goodreach-mobile/` carries mobile-native work
(branch `feat/mobile-native-2026-05-21`, not yet merged into main).

## Substrate

| What | Value |
|---|---|
| **Supabase project** | **`ngoeairmbigqulhfjqso`** (name `goodreach`, region `ap-southeast-2`, own Supabase org - NOT mmbkisodkrikuqhppoov/Ecodia). |
| Web env (Vercel) | Vite env: `VITE_SUPABASE_URL=https://ngoeairmbigqulhfjqso.supabase.co`, anon key, AWS Bedrock + Deepgram + Stripe keys via Supabase secrets (not in repo). |
| **Apple / ASC** | code@ecodia.au Apple ID, Ecodia Code team `86PUY7393S`. ASC app id `6771579670`. |
| **Stripe** | AU pricing GST-inclusive. Monthly $500 AUD + Annual $5000 AUD. Webhook target `https://<supabase>.functions.supabase.co/stripe-webhook` (events: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_*`). Secrets: `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `STRIPE_WEBHOOK_SECRET`. |
| LLM | AWS Bedrock InvokeModelWithResponseStream, Claude Haiku 4.5 AU profile, Titan v2 embeddings. |
| Audio | Deepgram nova-2-meeting via `transcribe-audio` edge fn. `DEEPGRAM_API_KEY` in Supabase secrets. |
| Email | Resend, `RESEND_FROM_ADDRESS=Goodreach <hello@goodreach.com.au>`. Verify sender domain before customer invites. |
| Test login | `demo@goodreach.com.au` / `GoodreachDemo2026!` (org "Greenline Conservation Area Inc."). |

## Gotchas / dead ends (paid for in time - do not relearn)

- **Commit author must be GitHub-recognised.** Vercel silently BLOCKS goodreach team-project deploys when the git commit author doesn't map to a GitHub identity. Global git config now uses `219926280+EcodiaTate@users.noreply.github.com`. Per `patterns/vercel-deploys-need-github-recognised-commit-author-2026-05-25.md`.
- **Vercel alias semantics.** After deploy, the production alias auto-promotes; you do NOT need `npx vercel alias set` unless re-aliasing to a non-prod deploy. The earlier dossier line "After deploy, alias `goodreach-ecodia.vercel.app` must be set manually" is stale - the auto-alias works.
- **`au.ecodia.goodreach` is the bundle id** - not `com.goodreach.app` or any variant. Matches the rest of the ecodia-namespace wedge.
- **DeepSeek is forbidden for customer data.** AU data residency posture requires AWS Bedrock Sydney. Configurable temptation: don't.
- **Mobile-native UI shipped to TestFlight build 2** off `feat/mobile-native-2026-05-21`, but main is still on the non-mobile shell. Merge + cut build 3 from main before any further mobile work.
- **Migrations 00008/00009 number collisions.** The staff-onboarding slice 3 commit took 00008/00009 before the master-audit content landed. Content converged exactly; `00011_stripe_events_processed.sql` is the master-audit add. Apply with `npx supabase db push` over all of 00001-00011.
- **Anti-fabrication chunk_id grounding.** `run-tool` post-validates citation chunk_ids and strips hallucinated ones with telemetry. Do NOT relax this on UI polish passes.
- **Supabase tables created via Management API need explicit GRANTs** - 00008+ all have them; if you author a new migration via raw SQL through the Management API, include the GRANTs.

## Build / ship

- **Web:** `git push origin main` -> Vercel auto-deploys (`goodreach` project). Commit author must be GitHub-recognised (see Gotchas).
- **Migrations:** `npx supabase db push` against project `ngoeairmbigqulhfjqso`.
- **Edge functions:** `supabase functions deploy <name>` per touched function. After the 2026-05-21 master-audit pass, the deploy set was: `create-checkout`, `create-billing-portal`, `transcribe-audio`, `update-member-role`, `chat-documents`, `run-tool`, `reprompt-block`, `embed-document`, `retrieve-rag`, `accept-invite`, `invite-member`, `stripe-webhook`, `signup`.
- **Supabase secrets:** `supabase secrets set KEY=value` - never committed in repo. New required: `GOODREACH_ADMIN_KEY` (random 32-byte hex), `DEEPGRAM_API_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `STRIPE_WEBHOOK_SECRET`, `RESEND_FROM_ADDRESS`.
- **iOS:** SY094 headless per `patterns/goodreach-ios-headless-ship-recipe.md`.
- **Master audit (canonical "what shipped 21 May"):** `drafts/goodreach-master-audit-2026-05-21.md`, functionality-pass spec at `D:/.code/goodreach/docs/superpowers/specs/2026-05-21-goodreach-functionality-pass-design.md`.

---

## STILL TODO (Tier 0 before any external sees the product)

- [ ] Rotate live keys in `.env.development`. Multi-consumer rotation: kv_store, Vercel env vars, Supabase Auth SMTP/OAuth, Edge Function secrets, repo `.env*`.
- [ ] Merge `feat/mobile-native-2026-05-21` worktree into `main` + cut TestFlight build 3 from main.
- [ ] Set up four new Supabase function secrets before deploy (see Build/ship above).
- [ ] Deploy the new + touched edge functions.
- [ ] Apply migrations (`npx supabase db push`).
- [ ] Configure Stripe products + webhook.

## STILL TODO (Tier 1 foundation for credible V1, 40-60h)

- Real ACNC corpus v1: 50+ real attributed entries with full source text + `last_verified` within 90 days. Content-curation task, NOT model-generated. Categories per audit §3.4 (ACNC Governance Standards, External Conduct, AIS reporting, state Associations acts, fundraising acts per state, ATO TR 2011/4 / TR 2015/1 / GSTR 2012/2, AASB 1058/15/1060, OAIC NDB, AHRC AI guidance, NSW Voluntary AI Safety Standard, CSO Standards, Reportable Conduct Scheme).
- Server-side PDF export (`export-document` edge fn is still a stub).
- Grant intake by URL (paste funder URL -> extract criteria + deadline -> pre-fill GrantDrafterForm).
- Auto-import financials: Xero (NFP) + Stripe (SMB).
- Compliance calendar (AIS, state reports, fundraising renewals).
- Comment-on-block + review workflow.

## Reference files
- Master audit: `D:/.code/EcodiaOS/backend/drafts/goodreach-master-audit-2026-05-21.md`
- Functionality-pass design spec: `D:/.code/goodreach/docs/superpowers/specs/2026-05-21-goodreach-functionality-pass-design.md`
- Restructure proposal: `drafts/goodreach-restructure-proposal-2026-05-20.md`
- Auto-memory: `project_goodreach.md` + the two `_2026-05-21.md` companion notes
