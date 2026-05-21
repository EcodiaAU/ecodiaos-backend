# Goodreach - product dossier

Last touched: 2026-05-21 (master-audit ship pushed at goodreach commit `a56c6fa`, mobile-native merged + Supabase migrations applied + 13 edge functions deployed + ARCHITECTURE/BACKLOG split landed; TestFlight build 3 ship in flight on SY094).
Canonical audit: [drafts/goodreach-master-audit-2026-05-21.md](../drafts/goodreach-master-audit-2026-05-21.md).
Repo: `D:/.code/goodreach` + worktree `D:/.code/goodreach-mobile`.
Live web: https://goodreach-ecodia.vercel.app (push to `main` auto-deploys; commit author MUST be `tate@ecodia.au` or Vercel blocks the build).
TestFlight: bundle `au.ecodia.goodreach`, ASC app id `6771579670`, internal link live, external link `https://testflight.apple.com/join/eZPVY8Qm` awaits Apple beta review.
Supabase project: `ngoeairmbigqulhfjqso` (own org). Demo login: `demo@goodreach.com.au` / `GoodreachDemo2026!` (org "Greenline Conservation Area Inc.").

## What Goodreach IS

A productised AI-tool suite for organisations that work with sensitive material. Five tools (governance/ACNC compliance check, board report generator, grant drafter, meeting capture, ask-your-documents). Internal config-manager onboards each tenant. RAG over per-org docs is plumbing. Three channels: NFP (Kurt's network), SMB consultancy (Angelica/Resonaverde referrals), bespoke (Ecodia custom builds on the same base). The product is the TOOLS not the agent and not the "brain". Tate de-inflated the vision on 20 May 2026 - the doctrine sits in [auto-memory project_goodreach.md](../../C:/Users/tjdTa/.claude/projects/d---code-ecodiaos-backend/memory/project_goodreach.md). Do not re-inflate.

Trust posture: AU-data-resident (AWS Bedrock Sydney, Claude Haiku 4.5 AU profile, Titan v2 embeddings), zero retention, hard tenant isolation via RLS. DeepSeek explicitly forbidden for customer data.

## Ship status - 2026-05-21 master-audit pass

Goodreach commit 8a23bcc shipped 11 phases off the master audit. Detail per phase is in the audit doc; the short version:

- ✓ P0 security closed. embed-document and retrieve-rag now require auth + org membership. accept-invite verifies the caller's email. Migration 00008 revokes anon/auth writes on document_chunks / output_block_edits / usage_events, replaces `WITH CHECK (true)` policies with tenant checks, adds CHECK constraints on every enum-like status field, atomic `increment_tool_runs` RPC, monthly counter reset cron.
- ✓ Multi-org membership. Signup unblocks second org; topbar OrgSwitcher with persisted active org.
- ✓ Stripe billing live. Idempotent webhook + create-checkout + create-billing-portal + upgrade cards in Settings (GST-inclusive AU pricing).
- ✓ Streaming chat + thread sidebar via Bedrock InvokeModelWithResponseStream.
- ✓ Audio meetings via Deepgram nova-2-meeting (transcribe-audio edge fn).
- ✓ Anti-fabrication enforcement: chunk_id citation grounding, prompt-injection wrapping in `<user_content>`, run-tool post-validates citations and strips hallucinated chunk_ids with telemetry.
- ✓ Editor depth: clickable CitationDrawer, addBlock, undo/redo with Cmd/Ctrl+Z, time-estimate per tool, Cancel button.
- ✓ Polish: global ErrorBoundary, trial-countdown banner on dashboard, profiles-table-bug fix (list_org_members RPC), admin role-update via server-side update-member-role edge fn, CSP + HSTS + X-Frame-Options headers in vercel.json, CORS allowlist (was wildcard), .env.example rewritten to Vite + Bedrock + Stripe shape, em-dashes purged from 10 pre-existing files.

Migrations added in this pass: `00011_stripe_events_processed.sql` (the 00008/00009 numbers were already taken by the staff-onboarding slice 3 commit; my equivalent content matched theirs exactly so they converged). All migrations 00001 through 00011 apply via `npx supabase db push`.

New edge functions: `create-checkout`, `create-billing-portal`, `transcribe-audio`, `update-member-role`. Touched and need redeploy: `chat-documents`, `run-tool`, `reprompt-block`, `embed-document`, `retrieve-rag`, `accept-invite`, `invite-member`, `stripe-webhook`, `signup`.

## STILL TODO (in priority order)

These are the items the audit flagged as out of scope for the 24-hour ship. Reference the audit's §7 for the full reasoning per item.

### Tier 0 - before any external sees the product

- [ ] **Rotate live keys in `.env.development`**. Hard-stop tripwire per the audit. Multi-consumer rotation: kv_store, Vercel env vars, Supabase Auth SMTP / OAuth settings, Edge Function secrets, repo `.env*`. Audit §0.5.
- [ ] **Merge `feat/mobile-native-2026-05-21` worktree into `main`** + cut TestFlight build 3 from main. The mobile-native UI shipped to build 2 but main is still on the non-mobile shell. Audit §0.3.
- [ ] **Set up the four new Supabase function secrets** before deploy: `GOODREACH_ADMIN_KEY` (random 32-byte hex), `DEEPGRAM_API_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `RESEND_FROM_ADDRESS=Goodreach <hello@goodreach.com.au>`. Verify the Resend sender domain before invites go to real customers.
- [ ] **Deploy the new + touched edge functions**: `supabase functions deploy create-checkout create-billing-portal transcribe-audio update-member-role chat-documents run-tool reprompt-block embed-document retrieve-rag accept-invite invite-member stripe-webhook signup`.
- [ ] **Apply migrations**: `npx supabase db push` (picks up 00008, 00009, 00011 - 00010 was the onboarding slice's).
- [ ] **Configure Stripe products + webhook**: create Monthly $500 AUD inc-GST and Annual $5000 AUD inc-GST recurring prices, set `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` to the IDs, point a webhook at `https://<supabase>.functions.supabase.co/stripe-webhook` for the events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`, `invoice.payment_succeeded`, `customer.subscription.trial_will_end`, `checkout.session.expired`. Copy webhook secret into `STRIPE_WEBHOOK_SECRET`.

### Tier 1 - foundation for credible V1 (40-60h)

- [ ] **Real ACNC corpus v1**: grow from 15 short summaries to ~50 real attributed entries with full source text + `last_verified` within 90 days. Audit §3.4 has the explicit list of categories and authoritative sources: full ACNC Governance Standards text (not summaries), External Conduct Standards, AIS reporting tiers, all 8 state Associations acts, fundraising acts per state, ATO TR 2011/4 / TR 2015/1 / GSTR 2012/2, AASB 1058 / AASB 15 / AASB 1060, OAIC NDB scheme, AHRC AI guidance, NSW Voluntary AI Safety Standard, CSO Standards, Reportable Conduct Scheme NSW/VIC. Content-curation task, NOT model-generated (anti-fabrication rule).
- [ ] **Server-side PDF export** (the `export-document` edge function is still a stub). Headless Chromium on Vercel or a dedicated worker. Audit §3.1.
- [ ] **Grant intake by URL**: paste funder URL, scrape page, extract criteria + word limits + deadline + assessment matrix, pre-fill GrantDrafterForm. Highest-leverage tool upgrade. Audit §7 Tier 2 item 2.1.
- [ ] **Auto-import financials**: Xero (NFP) and Stripe (SMB) connector, pull period income/expenditure into Board Report financial_snapshot block in one click. Audit §7 Tier 2 item 2.2.
- [ ] **Compliance calendar**: AIS deadline (November every year), state-specific reports, fundraising renewals surface as dashboard cards + email nudges 30/14/7/1 days out. Audit §7 Tier 2 item 2.3.
- [ ] **Comment-on-block + review workflow**: right-click a block -> "request review from board member X". They get an email, click through, in-app annotate. Daily NFP board-report workflow. Audit §7 Tier 2 item 2.4.

### Tier 2 - peak features

- [ ] Customer-facing bug-triage portal with 24h fix-ship SLA (the restructure proposal V1 promise).
- [ ] Templates library: save tool runs as templates with placeholder slots.
- [ ] Output version diff + revert (the store now keeps undo history, but inter-session version diff still needs a sidebar UI).
- [ ] "Why did the AI say that?" panel: which RAG chunks contributed to each paragraph, which org doc(s), exact prompt that produced this section.
- [ ] Native Google Doc export + send-to-Slack/Teams.

### Doc surgery owed

- [ ] **Split `GOODREACH_ARCHITECTURE.md`** into `ARCHITECTURE.md` (truth) + `BACKLOG.md` (aspiration). Strip Section 14 self-serve build phases (restructure proposal rejected self-serve). Update Section 1 LLM to "all Haiku 4.5 AU profile". Mark stale entries dated. Audit §1.2 + §6.
- [ ] **Move `docs/PROTOTYPE_BUILD_PLAN_2026-05-20.md`** to `docs/history/`. Historical not current.

## Reference files

- Master audit: [drafts/goodreach-master-audit-2026-05-21.md](../drafts/goodreach-master-audit-2026-05-21.md)
- Functionality-pass design spec (canonical "what shipped 21 May"): `D:/.code/goodreach/docs/superpowers/specs/2026-05-21-goodreach-functionality-pass-design.md`
- Restructure proposal (positioning + 3-channel + equity): `drafts/goodreach-restructure-proposal-2026-05-20.md`
- Project memory (always loaded): `C:/Users/tjdTa/.claude/projects/d---code-ecodiaos-backend/memory/project_goodreach.md` + the two `_2026-05-21.md` companion notes

## Deploy + rotation discipline

- Vercel: commit author MUST be `tate@ecodia.au`. After deploy, alias `goodreach-ecodia.vercel.app` must be set manually (`npx vercel alias set <deploy-url> goodreach-ecodia.vercel.app`).
- Migrations: `npx supabase db push` for the goodreach project. Tables created via Management API need explicit GRANTs - 00008+ all have them.
- Edge functions: `supabase functions deploy <name>` per touched function.
- Supabase secrets: `supabase secrets set KEY=value` not committed in repo.

## Out of scope (Tate's verbatim direction)

The partially-built staff-onboarding module (org_roles, onboarding_modules, `/people`, role-based RLS extensions) and missing env credentials were both explicitly carved out of this audit. The audit and this dossier do not surface improvements to that module; it ships on its own slice cadence.
