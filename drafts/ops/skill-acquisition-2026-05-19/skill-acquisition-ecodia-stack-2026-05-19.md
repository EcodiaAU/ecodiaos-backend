---
title: Skill / Agent / Plugin Acquisition Report — Ecodia Stack 2026-05-19
date: 2026-05-19
author: ecodiaos (research-only)
status: draft_recommendations
audience: tate, conductor
---

# Skill / Agent / Plugin Acquisition Report — Ecodia Stack

Research-only sweep. No installs performed. Recommendations are weighted against what the conductor can already do from scratch in-session, the existing `~/ecodiaos/patterns/` doctrine corpus, the auto-preview substrate, Corazon CDP helpers, and the `gui.sequence` batch primitive.

Filter applied: SKIP anything generic that adds reading-volume without compounding leverage. INSTALL is reserved for items that demonstrably reduce work or surface domain knowledge we do not already encode.

---

## 1. Co-Exist iOS + Android Release Pipeline (Capacitor 6, Xcode altool, ASC, Play Console)

This is the highest-traffic ship surface. Tate already has a verified pipeline (`sy094-eos-mobile-headless-ship-recipe.md`, `sy094-coexist-ios-release-recipe.md`, `play-console-android-release-recipe.md`) — anything we bring in here must complement, not replace.

### INSTALL — `cap-go/capgo-skills`
- URL: https://github.com/cap-go/capgo-skills
- 48 skills, official Capgo + community-curated, structured for Claude Code / Cursor / Codex.
- Value prop for Ecodia: Capacitor v6→v7→v8 upgrade skills, **capacitor-apple-review-preflight** (Apple review audit before submission), **safe-area-handling** (notch / Dynamic Island — directly relevant to Co-Exist), **cocoapods-to-spm** migration, **capacitor-push-notifications** APNs+FCM, **capacitor-deep-linking** universal links, **capacitor-accessibility** (WCAG for Capacitor specifically).
- Accelerates: Co-Exist release pipeline (preflight before altool upload), Capacitor major-version upgrades when v7 ships, push-notification setup work Tate already shipped in 1.8.7(7).
- Why not SKIP: Capgo-curated content is materially better than what generic mobile skills offer for Capacitor specifically — it knows about `cocoapods-to-spm`, Apple review preflight quirks, and the v6→v7 migration gotchas that are not in our doctrine.

### INSTALL — `rorkai/app-store-connect-cli-skills` + `rorkai/App-Store-Connect-CLI`
- Skills URL: https://github.com/rorkai/app-store-connect-cli-skills (25 skills, MIT, 801★)
- Binary URL: https://github.com/rorkai/App-Store-Connect-CLI (Go, 4.4k★)
- Value prop for Ecodia: Tate's current pipeline uses `xcrun altool` + ASC API JWT signing. The `asc` CLI is JSON-first, headless, covers TestFlight orchestration, signing-sync (certificates + provisioning profiles), metadata sync, screenshot upload across locales, and submission readiness checks — all of which we currently shell-script by hand in the recipe corpus.
- Accelerates: end-to-end Co-Exist iOS ship; TestFlight beta-group management; screenshot localisation; cert + provisioning automation; submission readiness gating before pushing to App Store review.
- Pairs with: our existing `sy094-eos-mobile-headless-ship-recipe.md`. Drop-in replacement for the altool-only path.

### SKIP — `secondsky/claude-skills app-store-deployment`
- Quality score 68/100, no eval scenarios, Snyk advisory recommending review. Premature for a load-bearing workflow.

### SKIP — `AfeiFun/appstore-connect`
- URL returned 404 on fetch. Disregard.

### INVESTIGATE — `awesome-skills/mobile-app-design`
- URL: https://github.com/awesome-skills/mobile-app-design
- iOS HIG + Material Design + WCAG 2.1 AA, but **React Native specific**, no Capacitor coverage. Tate's stack is React + Capacitor — overlap is partial (HIG and a11y rules transfer, component patterns do not). Read once for principles, do not install.

---

## 2. Supabase — Edge Functions, Migrations, RLS, pg_cron, Auth

### INSTALL — `supabase/agent-skills` (official, two skills)
- URL: https://github.com/supabase/agent-skills
- Two skills: `supabase` (full product surface: Database, Auth, Edge Functions, Realtime, Storage, Vectors, Cron, Queues, CLI, migrations, RLS), and `supabase-postgres-best-practices` (performance, connection pooling, RLS-critical section, schema design).
- Value prop for Ecodia: this is the official source-of-truth for Edge Function deploy patterns, the exact substrate Tate runs Co-Exist sync on (`coexist-excel-sync-forms-alignment-2026-05-18`). Authoritative; updates with Supabase product releases.
- Accelerates: every Edge Function deploy + RLS authoring + migration the conductor touches.

### INSTALL — `rdimascio/supabase-marketplace`
- URL: https://github.com/rdimascio/supabase-marketplace
- 10 specialised plugins; the two that outrank the official skill for tactical work are **RLS Security** (RLS patterns + multi-tenant policies + tenant isolation audits) and **Database Migrations** (migration tooling + rollback patterns). Realtime Sync and Edge Functions plugins are also strong.
- Value prop: RLS Security plugin is specifically the missing piece for the Co-Exist + Chambers + Goodreach multi-tenant work Tate has on the roadmap.

### INVESTIGATE — `troykelly/claude-skills postgres-rls`
- Standalone RLS skill with multi-tenant focus. Possibly redundant with the marketplace plugin above; read both, pick one.

### SKIP — `Nice-Wolf-Studio/claude-code-supabase-skills`
- Third-party wrapper over the same API surface; official Supabase skills are better-maintained.

---

## 3. Vercel Deploy Verify

### SKIP — all candidates
- The "Vercel Plugin for Claude Code" + Vercel Sandbox material is about *deploying* Claude Code agents *to* Vercel, not about driving Vercel from Claude Code as Tate does.
- We already have `mcp__ecodia-full__vercel_*` MCP tools + `vercel-env-vars-bake-at-build-audit-when-prod-bug-but-source-looks-right.md` + `verify-deployed-state-against-narrated-state.md` + `falsify-absence-windows-via-vercel-deploys.md`. Nothing in the ecosystem outperforms this stack.
- No INSTALL recommendation. Keep the doctrine + MCP path.

---

## 4. Stripe Customer + Invoice + Subscription Orchestration

### INSTALL — `wshobson/agents` plugin: `payments` (Stripe + PayPal + billing)
- URL: https://github.com/wshobson/agents/tree/main/plugins (Payments category, 1 plugin)
- Value prop: production-grade Stripe orchestration — subscriptions with trials + proration, idempotent webhook handlers, customer portal, invoicing, Connect platforms. Maps exactly to Tate's >$2k 50/50 invoicing + Co-Exist retainer cadence.
- Accelerates: monthly Co-Exist invoice cycle (7th-to-7th), Resonaverde referral-channel payment ops, Goodreach SaaS subscription buildout when it kicks off.

### INSTALL — `hookdeck/webhook-skills`
- URL: https://github.com/hookdeck/webhook-skills
- 37 provider-specific webhook skills + `webhook-handler-patterns` + `hookdeck-event-gateway`. Stripe + GitHub explicitly covered with signature verification, idempotency, replay, retry, and event-handling patterns. Examples for Express, Next.js, and FastAPI.
- Value prop: Tate's webhook stack (Stripe + GitHub + Vercel + Apple ASN) is exactly the pattern surface this skill encodes. The idempotency + replay patterns are non-trivial and worth not rediscovering.
- Accelerates: any new webhook receiver we ship.

### INVESTIGATE — `stripe/ai` "stripe-best-practices"
- Official Stripe skill. Possibly redundant with the wshobson plugin. Read both, install whichever is more current.

---

## 5. Xero Bookkeeping (Ecodia DAO LLC Wyoming + Ecodia Pty Ltd AU)

### SKIP — third-party Xero skills
- Tate has direct MCP access via `mcp__ecodia-full__xero_*` (categorize, get_contacts, get_invoices, get_transactions) and `mcp__ecodia-full__bk_*` (18 bookkeeping tools including BAS, GST position, ledger, rules). Already richer than any community skill.

### INVESTIGATE — Xero + Anthropic official partnership
- Multi-year partnership announced; Xero MCP server lists on Claude's official connectors. Worth re-checking the official connector against `mcp__ecodia-full__xero_*` parity in ~3 months. If the official one ships multi-tenant org switching cleanly, that beats our current setup.
- No INSTALL action now.

---

## 6. Zernio Multi-Platform Social

### INSTALL — `zernio-dev/zernio-api` (official)
- URL: https://github.com/zernio-dev/zernio-api
- Install: `npx clawhub@latest install zernio-api`
- Value prop: official Zernio skill, 14 platforms, posts/accounts/profiles/webhooks/media coverage. EcodiaOS already uses Zernio as the AI authoring substrate (per `feedback_two_channel_marketing_doctrine_2026-05-18`). The official skill encodes the API better than our `mcp__ecodia-full__zernio_*` tools surface, especially for rich-media + webhook patterns.
- Accelerates: any "EcodiaOS speaking its mind" post the conductor authors.
- Caveat: the doctrine constraint is upstream of the skill — we still do NOT broadcast marketing. The skill is a better hand for the rare authentic-voice post.

---

## 7. React + Capacitor Mobile Design (Tailwind + Tokens + Accessibility)

This is the bucket Tate flagged he is already mining. Strongest finds:

### INSTALL — `wshobson/agents tailwind-design-system`
- URL: https://github.com/wshobson/agents (tailwind-design-system skill)
- Value prop: token hierarchy (brand → semantic → component), CSS-variable theming, Tailwind v4 CSS-first `@theme` blocks, CVA variants, OKLCH color space, `@custom-variant` dark mode, **100 Lighthouse a11y baseline**, critical CSS budget. This is exactly the missing layer above our raw Tailwind work on Co-Exist.
- Accelerates: Co-Exist UI consistency pass, ecodia.au refresh whenever we do another aesthetic iteration, Wildmountains platform UI when it kicks off.

### INSTALL — `vercel-labs/agent-skills web-design-guidelines`
- Install: `npx skills add vercel-labs/agent-skills@web-design-guidelines -g -y`
- 133k weekly installs. Maintained by Vercel Engineering. Acts as a UI linter — feeds Claude a checklist of accessibility + UX + form + heading + focus + reduced-motion rules and runs it against changed files.
- Value prop: replaces ad-hoc "did I check WCAG?" passes with a deterministic linter against our actual code. The 100+ rules are current and well-maintained.
- Accelerates: every Co-Exist UI patch, ecodia.au edit, and any client UI work.

### INSTALL — `shadcn-ui` skill (official, via shadcn/ui docs)
- URL: https://ui.shadcn.com/docs/skills + community variant `madappgang/claude-code` and `mattbx/shadcn-skills` (1500+ component catalogue)
- Value prop: only matters if we standardise on shadcn/ui (Radix primitives + Tailwind). Worth doing for ecodia.au + the eventual EcodiaOS internal admin UI; not for Co-Exist (Capacitor + custom).
- Accelerates: ecodia.au design refresh, internal admin tooling.

### INVESTIGATE — `gbasin/figma-to-react`
- URL: https://github.com/gbasin/figma-to-react
- Converts Figma → pixel-perfect TS + Tailwind, with automated screenshot-comparison loop and iterative-fix. Only useful if Tate starts using Figma seriously. Currently he does not, so HOLD — but tag for "if-and-when Figma enters the workflow."

### SKIP — `nativewind` UI generators
- Tate's mobile stack is React + Capacitor (DOM in WKWebView), not React Native. NativeWind is for React Native and would mislead the conductor into wrong patterns.

### SKIP — generic mobile UI skills
- `awesome-skills/mobile-app-design` (React Native focus, already discussed). `react-native-design-master` etc — wrong substrate.

---

## 8. FastAPI + Python Backend

### INSTALL — `jeffallan/claude-skills fastapi-expert`
- URL: https://jeffallan.github.io/claude-skills/skills/backend/fastapi-expert/
- Value prop: production-grade Pydantic V2 patterns (`model_dump`, `model_validate`), SQLAlchemy 2.0 async with `selectinload` eager loading, AsyncSession discipline, JWT + OAuth2 patterns, pytest-asyncio + httpx, dependency injection. Triggers on keywords FastAPI / Pydantic / async Python.
- Accelerates: any Python service Tate stands up (the organism repo, future Co-Exist analytics backend, Goodreach Python wedge if it ships).
- Pairs with: existing `~/ecodiaos/src/` Node backend; doesn't replace it, just makes Python work cheaper when needed.

### SKIP — `rafaelkamimura/claude-tools` (46 agents, Brazilian finance focus)
- Too broad, finance-region-specific.

---

## 9. Chrome CDP / GUI Automation

Tate already has the **best-in-class** here per `cdp-helper-library-and-recursive-improvement-2026-05-18.md` + `chrome-cdp-is-top-primitive-for-gui-gated-work-2026-05-18.md` + the `gui.sequence` batch primitive + IDE bridge + Mac focusless substrate. The pattern coverage is deeper than anything in the ecosystem.

### INVESTIGATE — `ChromeDevTools/chrome-devtools-mcp` (official, Google)
- URL: https://github.com/ChromeDevTools/chrome-devtools-mcp
- Value prop: official Chrome team MCP server. Adds **performance tracing**, **Core Web Vitals capture**, **Lighthouse audits**, **heap snapshots**, **screencast recording**, **Chrome 144+ autoConnect**. Strict superset of our current `cdp.*` toolset on the perf + audit axis.
- Recommendation: do not replace our Corazon laptop-agent (which has Tate's logged-in profile). Add this **alongside** for the perf-trace / Lighthouse / Core Web Vitals work we cannot do today.
- Accelerates: Co-Exist + ecodia.au performance audits, regression baselines.

### SKIP — `pengelbrecht/chrome-debug-skill`
- Subset of capabilities; Tate's stack already exceeds it.

---

## 10. Neo4j Graph Ops

### INSTALL — `neo4j-contrib/neo4j-skills` (official)
- URL: https://github.com/neo4j-contrib/neo4j-skills
- Install: `npx skills add neo4j-contrib/neo4j-skills`
- Value prop: 30+ skills, regular headless-Claude PR refresh from release notes. Specific picks for Ecodia:
  - `neo4j-cypher-skill` — Cypher authoring + optimisation + debugging
  - `neo4j-modeling-skill` — graph data modelling (relevant for our 5000+ node corpus)
  - `neo4j-vector-index-skill` — vector indexes (Tate's semantic memory substrate uses Aura with embeddings)
  - `neo4j-graphrag-skill` — GraphRAG pipelines (could materially upgrade pattern-surfacing)
  - `neo4j-aura-provisioning-skill` — Aura mgmt
  - `neo4j-driver-javascript-skill` — JS driver patterns
- Accelerates: every `neo4j.*` write, every Cypher query the conductor runs, the doctrine semantic-search fallback layer, eventual GraphRAG upgrade of the pattern-surfacing path.

---

## 11. Postgres / pgvector / pg_cron / RLS / Migrations

### INSTALL — `timescale/pg-aiguide`
- URL: https://github.com/timescale/pg-aiguide
- Value prop: AI-optimised Postgres docs + best-practice skills + extension docs. Available as MCP server **and** Claude Code plugin **and** Agent Skills. Schema design, indexing, data types, constraints, naming conventions, modern Postgres features. PostGIS shipped, pgvector "coming soon."
- Caveat: limited pg_cron / RLS depth. Pair with the Supabase RLS plugin above.
- Accelerates: every migration, every index decision.

### Covered by Supabase plugins above
- RLS Security plugin (from `rdimascio/supabase-marketplace`) handles the RLS gap.
- pg_cron is best covered by the official Supabase skill — no standalone is materially better.

---

## 12. TypeScript Strict + Zod

### INSTALL — `SpillwaveSolutions/mastering-typescript-skill`
- URL: https://github.com/SpillwaveSolutions/mastering-typescript-skill
- Value prop: strict-mode enforcement, no `any`, Zod / Valibot at API boundaries, React + NestJS integration patterns.
- Accelerates: any new TS service; backend `src/` hardening passes.

### INSTALL — Zod validation skill (multiple candidates, pick one)
- Best fit: schemas-first workflow + `.strict()` on every external boundary + `safeParse` for graceful errors. Useful for the conductor's own MCP route handlers + Edge Function inputs.

---

## 13. Sentry / Observability

### INSTALL — `getsentry/sentry-for-ai`
- URL: https://github.com/getsentry/sentry-for-ai
- Install: `/install-plugin sentry`
- Auto-configures Sentry MCP server. Capabilities: issue investigation (`/seer`), SDK setup wizards (20+ platforms incl. iOS/Swift, React Native, Next.js, Python), Slack alert authoring, AI monitoring (instruments OpenAI / Anthropic / LangChain calls), PR code review with bug prediction.
- Value prop: Tate does not currently have Sentry wired into Co-Exist or ecodia-api. This plugin shipping makes the integration trivial when we add it.
- Accelerates: future Sentry adoption across Co-Exist + ecodia-api + Wildmountains platform.

### SKIP — `TechNickAI/claude_telemetry` / `disler/claude-code-hooks-multi-agent-observability`
- These observe **Claude Code itself**, not Tate's app stack. We already have our own observability via `os_forks` + `routing_decisions` + observer_signals.

---

## 14. iOS Push Notifications (APNs + Firebase + RevenueCat)

### Covered by Capgo skills (#1)
- `capacitor-push-notifications` skill in `cap-go/capgo-skills` handles FCM + APNs setup for Capacitor specifically, which is Tate's stack. Tate already fixed Co-Exist push 17 May 2026; this skill prevents the next regression.

### SKIP — `ahmed3elshaer-everything-claude-code-mobile push-notifications`
- React Native focus, wrong substrate.

### INVESTIGATE — RevenueCat skill (mentioned in search but not located as standalone)
- Co-Exist may eventually monetise via RevenueCat. Tag for future search.

---

## 15. Excel / Google Sheets / Microsoft Forms → Postgres Sync

### SKIP — generic Google Sheets skills
- Tate has direct `mcp__ecodia-full__drive_*` access. The Co-Exist sync pipeline is bespoke (Microsoft Forms → Edge Function → Postgres per `coexist-excel-sync-audit-2026-05-18`). No off-the-shelf skill encodes the bespoke shape.
- Stay with our doctrine: `sheet-as-projection-sync-direction-discipline.md` + `sync-back-must-filter-synthetic-from-source.md` + `excel-sync-collectives-migration.md`.

---

## 16. Twilio SMS + Voice + Dialog

### INVESTIGATE — `twilio/ai` (official)
- URL: https://github.com/twilio/ai
- Install: `/plugin marketplace add twilio/ai` then `/plugin install twilio-developer-kit@twilio`
- Skills cover SMS send, Verify OTP, Messaging Services, Voice / ConversationRelay, Memory, Conversation Intelligence, IAM auth setup.
- Value prop: EcodiaOS already uses `mcp__ecodia-full__sms_tate` + `make_call`. The Twilio official skill encodes the underlying API + compliance patterns (A2P 10DLC, STIR/SHAKEN) that we will need if we ever expand beyond Tate's number. **Not urgent.**
- Recommendation: HOLD until we add a second Twilio recipient (e.g. SMS to clients).

### SKIP — `AgentPhone-AI/skills`
- New project (3 stars), narrow surface, Twilio better-maintained.

---

## 17. UI/UX Polish (Lower Priority but High Compounding)

### INVESTIGATE — `nextlevelbuilder/ui-ux-pro-max-skill` (71k stars claimed)
- Auto-generates a design system from project analysis. WCAG 4.5:1 contrast enforcement, 3:1 for larger UI glyphs.
- Worth a read before next major UI refresh.

---

## Cross-cutting Notes

1. **The conductor already has compounding leverage that beats most skills.** Anything below mid-tier in install-volume is dominated by our own pattern corpus + MCP tool surface.
2. **The hot-spots where skills add real value are:** Capacitor mobile (Capgo), ASC CLI (rorkai), Supabase RLS (rdimascio), Stripe + webhooks (wshobson + hookdeck), Sentry (getsentry official), Tailwind design tokens (wshobson + vercel-labs web-design-guidelines), Neo4j (official), FastAPI (jeffallan), Chrome DevTools perf (Google official).
3. **Multi-source candidates we will need to compare side-by-side before installing:** Stripe (wshobson vs stripe/ai); ASC (rorkai skills vs Capgo `capacitor-app-store` overlap); RLS (rdimascio vs troykelly).
4. **Install ordering rule:** the conductor should NOT batch-install. Each install changes the context-window cost. Order by load-bearing first (ASC + Capgo for next Co-Exist ship), then Supabase, then Stripe + webhooks, then design-system, then the rest.

---

## Pointer to executive summary

See the 250-word return message from this research turn for the top-10 install ranking.
