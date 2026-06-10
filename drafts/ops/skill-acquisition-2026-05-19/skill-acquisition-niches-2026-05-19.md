# Skill acquisition - niche specialty Claude Code skills/agents

Author: EcodiaOS conductor (money@) | Date: 2026-05-19 | Scope: niche skills the generalist scans miss

Ruthlessly filtered against Ecodia stack. INSTALL = hits a known Ecodia pain. CONSIDER = strong but parallel to something we already own. SKIP = kitchen-sink or already covered.

---

## Methodology

13 domains scanned, 3+ search variants per domain, dug past the first awesome-list. Filtered against:
- Postgres + Supabase + pgvector + Neo4j substrate
- Tate-verbatim "outbound makes me want to die" -> no funnel/cadence/cold-outreach
- "Two channel marketing" doctrine -> only EcodiaOS-as-author social + Tate IRL relational
- Ordit archived, Co-Exist + Wildmountains active, Resonaverde referral
- We already run Sentry + OpenTelemetry-ish telemetry; deploy via Vercel + GitHub Actions
- AU primary entity (Ecodia Pty Ltd) + US (Ecodia DAO LLC Wyoming)

---

## 1. DATA ENGINEERING / pgvector / Graph-RAG

### A. crystaldba/postgres-mcp ("Postgres MCP Pro") - INSTALL
- URL: github.com/crystaldba/postgres-mcp
- What it is: MCP server with index-tuning algorithm (ports the SQL Server DTA "Anytime Algorithm" to Postgres) + EXPLAIN plan analysis + workload-aware advice
- Why Ecodia: we have 30+ tables on Supabase ref `nxmtfzofemtrlezlyhcj`. status_board / kv_store / episodes / working_set / os_forks all hot. We have NO automated index advisor. This drops in via MCP, can read live schema. Replaces "Tate, should we add an index?" with a tool call.
- INSTALL_METHOD: MCP add to ecodia-full bearer (or narrow MCP if we don't want to surface to cowork). Needs read+EXPLAIN role on Supabase.
- Recommendation: A. Wire to ecodia-full first, narrow if it works.

### B. timescale/pg-aiguide - CONSIDER
- URL: github.com/timescale/pg-aiguide
- What it is: MCP + Claude plugin specifically for Postgres skill packaging (Tiger Data's "we taught AI to write real Postgres code")
- Why Ecodia: more about teaching Claude better Postgres patterns than runtime introspection. Complementary to postgres-mcp not duplicative.
- Recommendation: B. Read the SKILL.md, pull the parts that match our schema conventions, skip the bundle.

### C. Neo4j Agent Skills (neo4j-dev + Cypher Guide) - INSTALL
- URL: neo4j.com/labs/genai-ecosystem/agent-skills/neo4j-skills/
- What it is: Official Neo4j-maintained skills covering Cypher modernisation (elementId() over deprecated id(), explicit WITH grouping), profile-driven query rewriting, GraphRAG pipelines, Python driver upgrade
- Why Ecodia: we have 5000+ Neo4j nodes (Decision/Episode/Pattern/Question), zero Cypher discipline beyond what I freehand. Stale-node-audit + kg-consolidation routines write Cypher; quality is uneven. This is officially maintained, not random.
- INSTALL_METHOD: plugin install to ~/.claude/skills/ on Corazon (and Mac mini when procured). Routine prompts can reference it.
- Recommendation: A.

### D. m4cd4r4/claude-echoes (pgvector + Ollama) - SKIP
- We have a different memory substrate doctrine. Auto-memory + Neo4j is canonical. Don't add a third store.

### E. ClawMem (yoloshii/ClawMem hybrid BM25+vector+RRF+cross-encoder rerank) - CONSIDER
- URL: github.com/yoloshii/ClawMem
- Why Ecodia: hybrid search architecture is interesting reference reading for when we build pattern semantic search v2. We don't run it; we steal the ranking-fusion pattern.
- Recommendation: B - reference only.

---

## 2. SECURITY

### A. agamm/claude-code-owasp - INSTALL
- URL: github.com/agamm/claude-code-owasp
- What it is: 17KB skill covering OWASP Top 10:2025, ASVS 5.0, Agentic AI security category, 20+ language-specific security quirks. Activates whenever Claude writes or reviews code.
- Why Ecodia: we ship Co-Exist (Capacitor + Supabase), Wildmountains app (incoming), Sidequests, Roam. Multiple client codebases. Tate-doctrine says "no client contact without go-ahead" but ALSO "never push insecure code." This auto-fires on Write/Edit in client repos.
- INSTALL_METHOD: skill in ~/.claude/skills/. Forks inherit. No MCP needed.
- Recommendation: A. Install global, scoped to client codebases.

### B. AgentSecOps/SecOpsAgentKit - CONSIDER
- URL: github.com/AgentSecOps/SecOpsAgentKit
- What it is: 25+ skills - container scan, secret detection, policy enforcement
- Why Ecodia: we don't ship containers (PM2 + Vercel + Edge Functions). Some skills useful (gitleaks-style secret scan); most over-shoot.
- Recommendation: B. Cherry-pick the secret-scan + dep-CVE skills, skip the kube/container half.

### C. Snyk Claude Skill (dep vuln remediation) - INSTALL
- URL: snyk.io/articles/top-claude-skills-cybersecurity-hacking-vulnerability-scanning/
- What it is: 7-phase Snyk workflow - scan, analyze, fix, validate, PR
- Why Ecodia: Co-Exist + EcodiaOS backend have many npm dependencies. Yarn/npm CVE drift is a known blind spot. This is officially maintained.
- INSTALL_METHOD: needs Snyk org account (free tier OK for one or two repos)
- Recommendation: A. Wire to Co-Exist + ecodiaos-backend repos.

### D. Supabase RLS Skill (supabase/agent-skills) - INSTALL
- URL: github.com/supabase/agent-skills
- What it is: OFFICIAL Supabase RLS auditor. Validates user-isolation, multi-tenant policies, null-handling, missing-policies, RLS-perf patterns.
- Why Ecodia: status_board / kv_store / os_forks / cc_sessions ALL need RLS we don't currently audit. Co-Exist multi-tenant collectives are a known unaudited surface. Official from Supabase.
- INSTALL_METHOD: claude code plugin install. Pair with Supabase MCP.
- Recommendation: A. Critical.

### E. anthropics/claude-code-security-review (GitHub Action) - INSTALL
- URL: github.com/anthropics/claude-code-security-review
- What it is: Anthropic-official PR security review GitHub Action
- Why Ecodia: ecodiaos-backend has zero PR security gate. Client repos same. Wire as required check.
- INSTALL_METHOD: .github/workflows/ on each repo. Uses Claude API.
- Recommendation: A. Free hygiene win.

### F. Community-Access/accessibility-agents - INSTALL (overlap with §4)
- URL: github.com/Community-Access/accessibility-agents
- 11 specialists for WCAG 2.2 AA. See §4.

---

## 3. ML/AI ENGINEERING (RAG/eval/fine-tune)

### A. OmidZamani/dspy-skills - INSTALL
- URL: github.com/OmidZamani/dspy-skills
- What it is: DSPy 3.1.2 framework skills - bootstrap fine-tune, evaluation suite (Evaluate class, semantic + exact-match metrics, parallel eval over datasets)
- Why Ecodia: we run 16+ scheduled routines + 4 webhook routines on tate@/code@/money@. Routines drift. We have NO eval harness. DSPy lets us turn prompt-tweaking into measurable optimisation. This is the gap.
- INSTALL_METHOD: skill folder + DSPy pip install in a sidecar venv on Corazon
- Recommendation: A. This is the highest-leverage AI-eng install on the list.

### B. alirezarezvani/claude-skills (RAG architect SKILL.md) - CONSIDER
- URL: github.com/alirezarezvani/claude-skills/blob/main/engineering/rag-architect/SKILL.md
- Why Ecodia: 263+ skills bundle, mostly generic. The RAG-architect SKILL.md is solid reading. Probably steal the SKILL.md, skip the rest.
- Recommendation: B.

### C. Orchestra-Research/AI-Research-SKILLs (Autoresearch) - CONSIDER
- URL: github.com/Orchestra-Research/AI-research-SKILLs
- What it is: autonomous research orchestration with two-loop architecture (inner optimisation + outer synthesis)
- Why Ecodia: we have a deep-research cron routine. Currently it freehands. This is structured.
- Recommendation: B. Read the architecture, port the two-loop pattern into the deep-research routine prompt.

---

## 4. DESIGN SYSTEMS / accessibility

### A. airowe/claude-a11y-skill - INSTALL
- URL: github.com/airowe/claude-a11y-skill
- What it is: axe-core + jsx-a11y runner as a Claude Code skill - comprehensive a11y audit you can fire from chat
- Why Ecodia: Co-Exist React app has unaudited a11y. Roam frontend same. We don't run axe currently. Single-purpose-but-excellent.
- INSTALL_METHOD: skill + npm peer deps (axe-core, jsx-a11y)
- Recommendation: A.

### B. Community-Access/accessibility-agents (11 WCAG 2.2 AA specialists) - INSTALL
- URL: github.com/Community-Access/accessibility-agents
- What it is: 11 specialists - contrast checker (luminance math across hover/focus/disabled/dark + APCA), WCAG compliance auditor (criterion-by-criterion against 86 success criteria), focus management, tab order, ARIA misuse, etc
- Why Ecodia: enterprise/govt clients ask for WCAG AA, we currently bluff. Wildmountains will likely require it (Leadership-curriculum platform). Co-Exist youth-conservation users include disability-access overlap.
- INSTALL_METHOD: install all 11, scope to client codebases
- Recommendation: A.

### C. gbasin/figma-to-react - INSTALL
- URL: github.com/gbasin/figma-to-react
- What it is: Claude Code plugin - Figma screen flows -> React components with exact assets, iOS-native animations, automated visual verification against original Figma screenshots
- Why Ecodia: Co-Exist is Figma->React->Capacitor. Manual today. This automates the boring parts AND verifies pixel-match via screenshot diff (we already have laptop-hands visual-diff infra - composes).
- INSTALL_METHOD: plugin install, needs Figma plugin auth
- Recommendation: A. Pairs perfectly with our existing visual-regression substrate.

### D. wshobson tailwind-design-system - CONSIDER
- URL: claudeskills.club/skills/tailwind-design-system-by-wshobson
- What it is: scalable Tailwind design system with tokens + type-safe variants
- Why Ecodia: ecodia.au + Co-Exist both Tailwind. Useful but we already have opinions baked in.
- Recommendation: B. Read for patterns, don't install wholesale.

### E. Anthropic Figma Plugin (official) - INSTALL
- URL: claude.com/plugins/figma
- What it is: official, read-only Figma plugin that pulls variables/components/frames/styles into tokens or React
- Why Ecodia: complements gbasin/figma-to-react. Official path.
- Recommendation: A.

---

## 5. GROWTH (RELATIONAL, not broadcast)

This domain is heavily filtered. Tate-verbatim 2026-05-18 night: "outbound makes me want to die" + "two-channel marketing doctrine" = EcodiaOS-on-social + Tate-IRL only. Everything in the search results is sales-cadence / lead-scoring / funnel-shape. ALL SKIPPED at the funnel level.

### A. Attio graph CRM (warm-intro mapping via contact-to-company graph) - CONSIDER
- URL: syncgtm.com/blog/claude-code-attio
- What it is: Attio's graph CRM lets Claude surface shared stakeholders / warm-intro paths
- Why Ecodia: we run our own CRM on Postgres (clients/projects/crm_contacts). Attio is a swap-out not an add-on. But the graph-CRM PATTERN is interesting - we could ship the same as a Neo4j Person+Organization+touchpoint expansion. NOT the product, the pattern.
- Recommendation: B. Build, don't buy. Add Person->Person introduced-by edges to Neo4j.

### B. Everything sales/cadence/cold-outreach - SKIP
- syncgtm.com cluster, GoHighLevel, AdVenture Media, rsla.io. All funnel-shape. Off-doctrine.

### Net: nothing to install for growth. The skill we need doesn't exist in the public ecosystem (the closest analogue is a "warm-intro grapher over Neo4j Person nodes" which we'd author ourselves).

---

## 6. CONTENT (essay, technical longform, AI-as-author voice)

### A. Aboudjem/humanizer-skill - INSTALL
- URL: github.com/Aboudjem/humanizer-skill
- What it is: 43 AI-writing-patterns detector + rewriter, 5 voice profiles, burstiness + perplexity science, 8 editor integrations, ZERO dependencies. Explicit successor to blader/humanizer (which is also widely cited).
- Why Ecodia: we already have a `the-humanizer` skill (Tate's custom one). Aboudjem's is the most recent state-of-art. Worth diffing against ours - probably pull the pattern catalogue + voice-profile concept, keep our channel-detection wrapper.
- INSTALL_METHOD: skill folder, diff against existing the-humanizer
- Recommendation: A - install in parallel, audit overlap.

### B. lguz/humanize-writing-skill (3-pass + 36+ banned words + 10 structural patterns) - CONSIDER
- URL: github.com/lguz/humanize-writing-skill
- Recommendation: B. Steal the banned-words list, skip the rest.

### C. ADR Writer (sethdford/claude-plugins/adr-writer) - INSTALL
- URL: github.com/sethdford/claude-plugins (adr-writer skill)
- What it is: ADR generator that auto-detects decision moments, records context + alternatives + rationale, maintains ADR log with consistent numbered headers
- Why Ecodia: we have patterns/ but NO formal ADR substrate. Decisions live in Neo4j as Decision nodes, which is good for retrieval but bad for human-readable architectural narrative. ADRs as a `backend/docs/adr/` directory with auto-generation would close this gap.
- INSTALL_METHOD: skill install
- Recommendation: A.

### D. Changelog Generator skill (multiple available, e.g. levnikolaevich/claude-code-skills) - INSTALL
- URL: github.com/levnikolaevich/claude-code-skills
- What it is: parses git commits, generates user-facing changelog
- Why Ecodia: Co-Exist ships to App Store + Play Console. Every release we hand-author release notes. This auto-generates from conventional commits.
- INSTALL_METHOD: skill install, requires commits follow a convention
- Recommendation: A.

---

## 7. OBSERVABILITY

### A. TechNickAI/claude_telemetry ("claudia") - INSTALL
- URL: github.com/TechNickAI/claude_telemetry
- What it is: OpenTelemetry wrapper around the `claude` CLI - drop-in replacement (`claudia` instead of `claude`) that logs tool calls, token usage, costs, execution traces to Logfire / Sentry / Honeycomb / Datadog
- Why Ecodia: we have NO Claude Code CLI cost telemetry. Three Max accounts at $1020/mo combined - we should know what each one is burning. This wraps the CLI transparently.
- INSTALL_METHOD: pip install on Corazon + Mac mini, alias claude->claudia, point at Sentry
- Recommendation: A. Critical for the post-15-June-2026 $200/mo/account cap discipline.

### B. Honeycomb Agent Skills (official) - CONSIDER
- URL: honeycomb.io/blog/honeycomb-advances-observability-for-ai-powered-software-development
- What it is: official Honeycomb skills for migrating to OTel, creating SLOs during onboarding
- Why Ecodia: we don't run Honeycomb. We're closer to "raw Postgres + ad-hoc grep" than full APM.
- Recommendation: B. If/when we adopt an APM, this is the on-ramp.

### C. Dash0 Agent Skills - SKIP
- Vendor-specific. We don't run Dash0.

### D. Sentry Claude Code cookbook - INSTALL
- URL: sentry.io/cookbook/monitor-claude-code-with-sentry/
- What it is: Sentry's official recipe for monitoring Claude Code via OTel
- Why Ecodia: we already have Sentry on some surfaces. This adds Claude Code session telemetry (each session = invoke_agent root span, each turn = gen_ai.request child, each tool call = execute_tool span).
- INSTALL_METHOD: configure CLAUDE_CODE_ENABLE_TELEMETRY=1 + Sentry DSN
- Recommendation: A.

---

## 8. DEVOPS / CI-CD

### A. anthropics/claude-code-action@v1 - INSTALL
- URL: code.claude.com/docs/en/github-actions
- What it is: Anthropic-official GitHub Action running full Claude Code runtime inside a GHA runner. As of April 16 2026 changelog: Opus 4.7 available inside the Action.
- Why Ecodia: we have ZERO GitHub Actions on ecodiaos-backend currently. PR-review-bot, auto-fix on lint fail, security-review on every PR - all light a candle on this Action.
- INSTALL_METHOD: .github/workflows/claude.yml per repo, ANTHROPIC_API_KEY secret (use code@ key)
- Recommendation: A. Foundation for everything else.

### B. Pulumi DevOps skills bundle (deployment-engineer, canary-watch) - CONSIDER
- URL: pulumi.com/blog/top-8-claude-skills-devops-2026/
- What it is: blue-green / canary / rolling-update strategy skills + Canary Watch (post-deploy HTTP-status, console-log, Core Web Vitals monitor)
- Why Ecodia: we deploy via Vercel (auto rollback on failed deploy already). Canary Watch is more useful for client-shipping - audits Co-Exist after Vercel deploy completes for visual regressions, console errors, perf drops.
- INSTALL_METHOD: skill install + post-deploy webhook
- Recommendation: B - Canary Watch only, skip the kube deploy-engineer stuff.

---

## 9. POSTGRES SPECIALIST (already covered in §1)

See §1.A (postgres-mcp) + §1.B (pg-aiguide). One additional:

### F. pganalyze VACUUM Advisor - CONSIDER
- URL: pganalyze.com/blog/introducing-vacuum-advisor-postgres
- What it is: workload-aware autovacuum tuning
- Why Ecodia: status_board write-heavy, episodes append-heavy, os_forks transient. Autovacuum currently default. Probably suboptimal.
- Recommendation: B. Read the docs, hand-tune. The hosted product is overkill for our size.

### G. jeffallan/claude-skills/database-optimizer - INSTALL
- URL: jeffallan.github.io/claude-skills/skills/infrastructure/database-optimizer/
- What it is: Jeff Allan's 66-skill collection, the database-optimizer is single-purpose excellent
- Recommendation: A. Solid stand-alone.

---

## 10. API DESIGN

### A. jeffallan/claude-skills/api-designer - INSTALL
- URL: github.com/Jeffallan/claude-skills/blob/main/skills/api-designer/SKILL.md
- What it is: OpenAPI 3.1, GraphQL, HTTP semantics, JSON:API, HATEOAS, OAuth2, JWT, RFC 7807 Problem Details, versioning, pagination, rate limiting, webhook design, SDK generation
- Why Ecodia: we run /api/mcp/ecodia-full with 157 tools across 68 scopes, no formal OpenAPI spec. Webhook /fire shims have no idempotency review. This is a known gap.
- INSTALL_METHOD: skill install
- Recommendation: A.

### B. GraphQL Expert skills (mcpmarket.com cluster) - SKIP
- We don't ship GraphQL. REST + MCP-JSON-RPC only.

---

## 11. TESTING

### A. lackeyjb/playwright-skill - INSTALL
- URL: github.com/lackeyjb/playwright-skill
- What it is: Claude Code skill for browser automation with Playwright. Model-invoked - Claude autonomously writes and executes custom automation for testing AND validation. Includes visual regression with maxDiffPixels + maxDiffPixelRatio.
- Why Ecodia: we already have laptop-hands visual-regression infra on Corazon. This adds the same primitives in-IDE for forks to use. Co-Exist + Wildmountains UI test coverage = thin.
- INSTALL_METHOD: skill install + Playwright npm
- Recommendation: A.

### B. AI Healer (Playwright MCP 2026) - CONSIDER
- URL: bug0.com/blog/playwright-mcp-changes-ai-testing-2026
- What it is: auto-repair broken Playwright tests via MCP - detects broken selector / timing / DOM change, fixes the test
- Why Ecodia: Co-Exist UI churns; test suite would rot fast without this. The capability is bleeding-edge.
- Recommendation: B. Try after we have a non-trivial Playwright suite.

### C. Property-based + mutation testing - GAP
- Nothing in the public ecosystem at the niche level. Stryker (mutation) and fast-check (property-based) exist as npm packages. We'd author the Claude wrapper ourselves if we want it.

---

## 12. DOCS (covered in §6)

ADR Writer (§6.C) + Changelog Generator (§6.D) cover this. Nothing else stands out.

---

## 13. FINANCE-OPS (AU + US)

### A. Aussie Agent Skills - BAS/GST - INSTALL
- URL: agentskill.com.au/blog/how-to-use-claude-code-bas-gst
- What it is: AU-specific BAS lodgement + GST calc + ATO compliance skill set
- Why Ecodia: we lodge BAS quarterly for Ecodia Pty Ltd. Currently bookkeeping MCP (`bk_*` tools) handles ledger but no BAS calc. This closes the gap.
- INSTALL_METHOD: skill install, audit before relying on (tax-prep skills can hallucinate rules)
- Recommendation: A - with human review gate.

### B. calef/us-federal-tax-assistant-skill - INSTALL
- URL: github.com/calef/us-federal-tax-assistant-skill
- What it is: US federal individual tax prep skill - auto-applies when tax prep is mentioned, generates document checklist from prior-year return
- Why Ecodia: Ecodia DAO LLC Wyoming has US federal obligations. We have NO automation here. Manual currently.
- Recommendation: A - with human review gate (CPA still signs).

### C. PolicyEngine/policyengine-claude - SKIP
- Tax microsimulation. Useful for policy modelling, not for our return prep.

### D. claudeblattman/claudeblattman - CONSIDER
- URL: github.com/chrisblattman/claudeblattman/blob/main/skills/tax-guide.md
- "AI for professionals who don't code" tax-guide skill. More opinionated. Worth reading the SKILL.md.
- Recommendation: B.

---

## Cross-domain INSTALL list (top 20, ordered by Ecodia-leverage)

1. **anthropics/claude-code-action@v1** (DevOps) - foundation for everything else
2. **anthropics/claude-code-security-review** (Security) - free hygiene win on every PR
3. **supabase/agent-skills RLS** (Security) - Co-Exist multi-tenant unaudited
4. **crystaldba/postgres-mcp** (DataEng) - first automated index advisor we'd ever have
5. **TechNickAI/claude_telemetry "claudia"** (Observability) - cost discipline for $1020/mo Max accounts
6. **OmidZamani/dspy-skills** (ML/AI) - first eval harness for routines
7. **agamm/claude-code-owasp** (Security) - auto-fires on Write/Edit, low overhead
8. **Snyk Claude Skill** (Security) - npm CVE drift on Co-Exist + ecodiaos
9. **Neo4j Agent Skills (official)** (DataEng) - 5000+ nodes deserve better Cypher
10. **Aboudjem/humanizer-skill** (Content) - diff against our the-humanizer, port deltas
11. **Community-Access/accessibility-agents** (Design) - 11 WCAG specialists, govt-grade
12. **airowe/claude-a11y-skill** (Design) - axe-core runner, single-purpose excellent
13. **gbasin/figma-to-react** (Design) - composes with laptop-hands visual-diff
14. **Anthropic Figma Plugin (official)** (Design) - official Figma read path
15. **sethdford ADR Writer** (Docs) - close architectural-narrative gap
16. **Changelog Generator (levnikolaevich)** (Docs) - Co-Exist release notes auto
17. **Sentry cookbook for Claude Code** (Observability) - session-span telemetry
18. **lackeyjb/playwright-skill** (Testing) - in-IDE visual regression primitive
19. **jeffallan api-designer** (API) - formalise /api/mcp/ecodia-full OpenAPI
20. **Aussie Agent Skills BAS/GST + calef US-federal-tax** (FinanceOps) - both entities, both reviewed by humans

## CONSIDER list (read, port pieces, don't install wholesale)

- timescale/pg-aiguide (DataEng patterns)
- ClawMem hybrid-search ranking-fusion pattern (DataEng)
- Orchestra-Research two-loop autoresearch architecture (ML/AI)
- Honeycomb Agent Skills (when we adopt APM)
- pganalyze VACUUM Advisor docs
- Attio graph-CRM warm-intro pattern (build in Neo4j, don't buy)
- Canary Watch post-deploy monitor (skill only, not bundle)
- AI Healer Playwright MCP (after we have suite)

## SKIP list (off-doctrine or already covered)

- All sales-cadence / cold-outreach / lead-scoring skills (off-doctrine "outbound makes me want to die")
- AgentSecOps container/kube half (we don't run containers)
- m4cd4r4/claude-echoes (third memory store, violates substrate doctrine)
- GraphQL skills (we don't ship GraphQL)
- PolicyEngine (microsimulation, not return prep)
- All "kitchen-sink 263+ skills" bundles - cherry-pick SKILL.md files, skip the bundle

## Followups

1. Author a Neo4j Person->Person `introduced_by` relationship + a "warm-intro grapher" Cypher pattern as our own answer to the Attio-graph-CRM gap.
2. Property-based + mutation testing - public niche is empty; author our own SKILL.md wrapping fast-check + Stryker for Co-Exist.
3. After installing dspy-skills, fork a "routine eval harness" project that runs each of the 16 scheduled routines against a test corpus and scores drift.
4. Diff the-humanizer (our existing skill) against Aboudjem/humanizer-skill same-arc - probably a single PR worth of pattern-catalogue updates.

---

## Sources

Domain-by-domain source links captured below for verification.

### Data engineering
- github.com/crystaldba/postgres-mcp
- github.com/timescale/pg-aiguide
- neo4j.com/labs/genai-ecosystem/agent-skills/neo4j-skills/
- github.com/yoloshii/ClawMem
- github.com/m4cd4r4/claude-echoes

### Security
- github.com/agamm/claude-code-owasp
- github.com/AgentSecOps/SecOpsAgentKit
- github.com/anthropics/claude-code-security-review
- github.com/supabase/agent-skills
- snyk.io/articles/top-claude-skills-cybersecurity-hacking-vulnerability-scanning/
- github.com/efij/awesome-claude-code-security
- helpnetsecurity.com/2026/03/19/betterleaks-open-source-secrets-scanner/

### ML/AI eng
- github.com/OmidZamani/dspy-skills
- github.com/alirezarezvani/claude-skills (engineering/rag-architect/SKILL.md)
- github.com/Orchestra-Research/AI-Research-SKILLs
- mcpmarket.com/tools/skills/dspy-evaluation-suite
- mcpmarket.com/tools/skills/dspy-model-distillation-fine-tuning

### Design + accessibility
- github.com/Community-Access/accessibility-agents
- github.com/airowe/claude-a11y-skill
- github.com/gbasin/figma-to-react
- claude.com/plugins/figma
- claudeskills.club/skills/tailwind-design-system-by-wshobson
- mcpmarket.com/tools/skills/wcag-accessibility-compliance

### Content / docs
- github.com/Aboudjem/humanizer-skill
- github.com/blader/humanizer
- github.com/lguz/humanize-writing-skill
- github.com/sethdford/claude-plugins (adr-writer)
- github.com/levnikolaevich/claude-code-skills

### Observability
- github.com/TechNickAI/claude_telemetry
- sentry.io/cookbook/monitor-claude-code-with-sentry/
- signoz.io/blog/claude-code-monitoring-with-opentelemetry/
- honeycomb.io/blog/honeycomb-advances-observability-for-ai-powered-software-development
- dash0.com/guides/teach-your-ai-coding-agent-opentelemetry

### DevOps / CI-CD
- code.claude.com/docs/en/github-actions
- pulumi.com/blog/top-8-claude-skills-devops-2026/
- mcpmarket.com/tools/skills/canary-watch
- agensi.io/learn/best-claude-code-devops-skills

### Postgres
- github.com/crystaldba/postgres-mcp
- github.com/timescale/pg-aiguide
- jeffallan.github.io/claude-skills/skills/infrastructure/database-optimizer/
- pganalyze.com/blog/introducing-vacuum-advisor-postgres
- supabase.com/blog/postgres-best-practices-for-ai-agents

### API
- github.com/Jeffallan/claude-skills/blob/main/skills/api-designer/SKILL.md
- github.com/VoltAgent/awesome-claude-code-subagents (api-designer)

### Testing
- github.com/lackeyjb/playwright-skill
- bug0.com/blog/playwright-mcp-changes-ai-testing-2026
- alexop.dev/posts/building_ai_qa_engineer_claude_code_playwright/

### Finance-ops
- agentskill.com.au/blog/how-to-use-claude-code-bas-gst
- github.com/calef/us-federal-tax-assistant-skill
- github.com/chrisblattman/claudeblattman
- github.com/PolicyEngine/policyengine-claude

### Master collections (used as starting indices)
- github.com/Jeffallan/claude-skills (66 specialist)
- github.com/alirezarezvani/claude-skills (263+)
- github.com/VoltAgent/awesome-agent-skills (1000+)
- github.com/rohitg00/awesome-claude-code-toolkit
- github.com/ComposioHQ/awesome-claude-skills
- github.com/travisvn/awesome-claude-skills
- github.com/BehiSecc/awesome-claude-skills
- github.com/wshobson/agents (185 agents, 153 skills, 80 plugins)
