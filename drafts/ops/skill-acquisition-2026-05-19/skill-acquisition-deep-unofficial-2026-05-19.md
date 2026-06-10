# Deep-Dive: Unofficial Claude Code Aggregators / Agents / Skills / Commands Catalogue

**Date:** 2026-05-19 (AEST)
**Conductor:** EcodiaOS @ Corazon
**Mission:** Exhaustive enumeration of the unofficial Claude Code ecosystem beyond what the parallel "official Anthropic" agent is covering. Recursive harvest across aggregators, marketplaces, and curated lists. Recommendations tied to the Ecodia stack: Node + Python/FastAPI backend, React + Capacitor 6 mobile (Co-Exist), Supabase Postgres + Edge Functions, Vercel, Stripe + Xero, Zernio social (RELATIONAL not funnel), iOS (Xcode + altool + ASC) + Android (Play Console), Chrome CDP automation, Neo4j 5000+ nodes, pgvector, pg_cron.

**Inventory exclusions (already installed / wired):** Skills installed: checkpoint, codebase-orient, listener-health, pattern-surface, session-orient, sms-tate, the-humanizer, visual-recent. Plugins enabled: context7, security-guidance, supabase, commit-commands. Plugins installed-but-disabled: frontend-design, typescript-lsp, plugin-dev, claude-code-setup. Custom agents: zero. Hooks: 22 ecodia-specific.

---

## 0. EXECUTIVE BACKDROP

**Numbers harvested:**
- davila7/claude-code-templates (27.4k stars): **423 agents**, **341 commands**, **3156 skill files** (across hundreds of skills), 13 MCPs, 11 hook categories, multiple settings/plugins.
- VoltAgent/awesome-claude-code-subagents (20.1k): **131+ subagents** across 10 categories (the canonical curated subagent collection).
- SuperClaude-Org/SuperClaude_Framework (22.8k): **30 slash commands**, 7 behavioural modes, 20 agents, 8 MCP integrations.
- ruvnet/claude-flow now **Ruflo** (52.8k): 32 native plugins + 21 npm plugins, 100+ agent types, 27-hook system, 12 background workers, agent federation w/ mTLS.
- wshobson/agents (35.6k): **100 agents** across 80 plugins.
- wshobson/commands (2.5k): **57 commands** (15 workflows + 42 tools).
- affaan-m/everything-claude-code (182k stars badge; treat as inflated, plausibly low-tens-of-k real): **232 skills**, **60 agents**, full security harness AgentShield, cross-platform (CC + Cursor + Codex + OpenCode + Zed + Gemini + Antigravity).
- alirezarezvani/claude-skills (15.4k): **313+ skills** across 12 domains (engineering, marketing, product, regulatory, C-suite advisory).
- obra/superpowers (197k stars badge; treat as inflated): canonical Geoffrey Huntley skill bundle - planning/testing/reviewing/debugging.
- anthropics/skills (137k): 18 official skill folders.
- jeffallan/claude-skills (9.2k): 66 fullstack skills, 9 plugins.
- automazeio/ccpm (8.1k): spec-driven project management agent skill.
- K-Dense-AI/claude-scientific-skills (24.4k): 135 scientific skills (bio/chem/clinical/ML).
- trailofbits/skills (5.3k): 22 security audit skills.
- EveryInc/compound-engineering-plugin (16.9k): 37 skills + 51 agents around compound-engineering discipline.
- avifenesh/agentsys (809): 24 commands, 50 agents, 45 skills (task-to-prod automation).
- nizos/tdd-guard (2.1k): hooks blocking non-TDD code paths.
- jarrodwatts/claude-hud (23.1k): the canonical statusline.
- aannoo/claude-hook-comms (288): subagent-to-subagent inbox over hooks.
- 30+ secondary aggregators harvested below.

**Plugin marketplace install primitive (Claude Code v2.1.108+):** `/plugin marketplace add <org/repo>` followed by `/plugin install <name>@<marketplace>`. Third-party sources also via `--plugin-url` CLI flag, `.zip` via `--plugin-dir`. `blockedMarketplaces` config key exists for enterprise governance. Aggregators rated PRIORITY-A all install via marketplace-add; legacy single-file repos via git-clone-to-skills-dir.

---

## 1. davila7/claude-code-templates  (aitmpl.com / claudecode.app)  *27.4k stars*

**Install primitive:** `npx claude-code-templates@latest --agent <name> --yes` (also `--command`, `--mcp`, `--setting`, `--hook`, `--plugin`).

### 1a. Agents (423 files across 28 sub-folders)

**accessibility (1):** accessibility-tester.

**ai-specialists (8):** ai-ethics-advisor, hackathon-ai-strategist, llm-architect, llms-maintainer, model-evaluator, prompt-engineer, search-specialist, task-decomposition-expert.

**api-graphql (9):** Thinking-Beast-Mode, api-architect, api-designer, graphql-architect, graphql-performance-optimizer, graphql-security-specialist, octopus-deploy-release-notes-mcp, shopify-expert.

**blockchain-web3 (4):** blockchain-developer, smart-contract-auditor, smart-contract-specialist, web3-integration-specialist.

**business-marketing (24):** business-analyst, communication-excellence-coach, competitive-analyst, content-marketer, customer-success-manager, customer-support, legal-advisor, market-researcher, marketing-attribution-analyst, payment-integration, product-manager, product-strategist, project-manager, risk-manager, sales-automator, sales-engineer, salesforce-expert, scrum-master, seo-specialist, trend-analyst, ux-researcher, vital-health-content-agent (nested path bug).

**data-ai (38):** adr-generator, ai-engineer, amplitude-experiment-implementation, blueprint-mode-codex, blueprint-mode, clojure-interactive-programming, code-tour, computer-vision-engineer, data-analyst, data-engineer, data-scientist, demonstrate-understanding, dotnet-maui, hlbpa, machine-learning-engineer, microsoft-agent-framework-dotnet, ml-engineer, mlops-engineer, monday-bug-fixer, ms-sql-dba, neon-migration-specialist, neon-optimization-analyzer, nlp-engineer, postgresql-dba, power-bi-data-modeling-expert, power-bi-dax-expert, power-platform-expert, prd, prompt-builder, prompt-engineer, quant-analyst, se-product-manager-advisor, se-system-architecture-reviewer, semantic-kernel-dotnet, simple-app-idea-generator, software-engineer-agent-v1, task-planner, task-researcher, tdd-green, tdd-red.

**database (11):** database-admin, database-administrator, database-architect, database-optimization, database-optimizer, neon-auth-specialist, neon-database-architect, neon-expert, nosql-specialist, postgres-pro, supabase-schema-architect.

**deep-research-team (16):** academic-researcher, agent-overview, competitive-intelligence-analyst, data-analyst, data-researcher, fact-checker, nia-oracle, query-clarifier, report-generator, research-analyst, research-brief-generator, research-coordinator, research-orchestrator, research-synthesizer, search-specialist, technical-researcher.

**development-team (17):** backend-architect, backend-developer, cli-ui-designer, code-architect, code-explorer, devops-engineer, electron-pro, frontend-developer, fullstack-developer, ios-developer, mobile-app-developer, mobile-developer, sdd-spec-writer, test-generator, test-runner, ui-designer, ui-ux-designer.

**development-tools (30):** accessibility-tester, architect-reviewer, ascii-ui-mockup-generator, build-engineer, chaos-engineer, cli-developer, code-reviewer, code-simplifier, codebase-explorer, codebase-pattern-finder, command-expert, context-manager, debugger, dependency-manager, dx-optimizer, error-detective, flutter-go-reviewer, general-purpose, laravel-expert-agent, launchdarkly-flag-cleanup, mcp-expert, pagerduty-incident-responder, performance-engineer, performance-profiler, playwright-tester, qa-expert, refactoring-specialist, rootly-incident-responder, slack-expert, technical-debt-manager, test-automator, test-engineer, tooling-engineer, unused-code-cleaner.

**devops-infrastructure (37):** apify-integration-expert, arm-migration, azure-iac-exporter, azure-iac-generator, azure-infra-engineer, azure-logic-apps-expert, azure-principal-architect, azure-saas-architect, azure-verified-modules-bicep, azure-verified-modules-terraform, bicep-implement, bicep-plan, cloud-architect, deployment-engineer, devops-engineer, devops-expert, devops-incident-responder, devops-troubleshooter, incident-responder, kubernetes-specialist, kusto-assistant, m365-admin, microservices-architect, microsoft-study-mode, monitoring-specialist, neo4j-docker-client-generator (note: directly relevant to Ecodia), network-engineer, platform-engineer, se-gitops-ci-specialist, security-engineer, sre-engineer, terraform-azure-implement, terraform-azure-planning, terraform-engineer, terraform-iac-reviewer, terraform-specialist, terragrunt-expert, windows-infra-admin.

**documentation (11):** api-documenter, arch, changelog-generator, context7, diagram-architect, documentation-engineer, docusaurus-expert, microsoft_learn_contributor, se-technical-writer, tech-debt-remediation-plan, technical-writer.

**expert-advisors (51):** 4.1-Beast, Ultimate-Transparent-Thinking-Beast-Mode, WinFormsExpert, address-comments, agent-expert, agent-installer, agent-organizer, architect-review, atlassian-requirements-to-jira, context-manager, critical-thinking, custom-agent-foundry, debug, declarative-agents-architect, dependency-manager, documentation-expert, dotnet-upgrade, droid, drupal-expert, error-coordinator, expert-dotnet-software-engineer, gilfoyle, gpt-5-beast-mode, implementation-plan, it-ops-orchestrator, janitor, knowledge-synthesizer, kotlin-mcp-expert, legal-advisor, mcp-m365-agent-expert, mentor, meta-agentic-project-scaffold, modernization, multi-agent-coordinator, performance-monitor, php-mcp-expert, pimcore-expert, plan, planner, power-bi-performance-expert, power-bi-visualization-expert, power-platform-mcp-integration-expert, principal-software-engineer, refine-issue, research-technical-spike, se-ux-ui-designer, specification, swift-mcp-expert, task-distributor, voidbeast-gpt41enhanced, wg-code-alchemist, workflow-orchestrator.

**ffmpeg-clip-team (8):** audio-mixer, audio-quality-controller, podcast-content-analyzer, podcast-metadata-specialist, podcast-transcriber, social-media-clip-creator, timestamp-precision-specialist, video-editor.

**finance (5):** bettoredge-value-finder, fintech-engineer, payment-integration, quant-analyst, risk-manager.

**game-development (5):** 3d-artist, game-designer, game-developer, unity-game-developer, unreal-engine-developer.

**git (3):** commit-guardian, git-flow-manager, git-workflow-manager.

**mcp-dev-team (8):** mcp-deployment-orchestrator, mcp-developer, mcp-integration-engineer, mcp-protocol-specialist, mcp-registry-navigator, mcp-security-auditor, mcp-server-architect, mcp-testing-engineer.

**modernization (3):** architecture-modernizer, cloud-migration-specialist, legacy-modernizer.

**obsidian-ops-team (7):** connection-agent, content-curator, metadata-agent, moc-agent, review-agent, tag-agent, vault-optimizer.

**ocr-extraction-team (7):** document-structure-analyzer, markdown-syntax-formatter, ocr-grammar-fixer, ocr-preprocessing-optimizer, ocr-quality-assurance, text-comparison-validator, visual-analysis-ocr.

**performance-testing (5):** load-testing-specialist, performance-engineer, react-performance-optimization, test-automator, web-vitals-optimizer.

**podcast-creator-team (11):** academic-research-synthesizer, comprehensive-researcher, episode-orchestrator, guest-outreach-coordinator, market-research-analyst, podcast-editor, podcast-trend-scout, project-supervisor-orchestrator, seo-podcast-optimizer, social-media-copywriter, twitter-ai-influencer-manager.

**programming-languages (50):** CSharpExpert, angular-architect, c-pro, c-sharp-pro, cpp-pro, csharp-developer, csharp-dotnet-janitor, csharp-mcp-expert, diffblue-cover, django-developer, dotnet-core-expert, dotnet-framework-4.8-expert, elixir-expert, embedded-systems, expert-cpp-software-engineer, flutter-expert, go-mcp-expert, golang-pro, iot-engineer, java-architect, javascript-pro, kotlin-specialist, laravel-specialist, microsoft-agent-framework-python, mongodb-performance-advisor, nextjs-developer, php-pro, powershell-5.1-expert, powershell-7-expert, powershell-module-architect, powershell-ui-architect, python-mcp-expert, python-pro, rails-expert, react-specialist, ruby-mcp-expert, rust-engineer, rust-gpt-4.1-beast-mode, rust-mcp-expert, rust-pro, semantic-kernel-python, shell-scripting-pro, spring-boot-engineer, sql-pro, swift-expert, technical-content-evaluator, typescript-mcp-expert, typescript-pro, vue-expert.

**realtime (2):** supabase-realtime-optimizer (DIRECTLY RELEVANT), websocket-engineer.

**security (24):** ad-security-reviewer, ai-agent-audit-specialist, api-security-audit, comet-opik, compliance-auditor, compliance-specialist, dynatrace-expert, elasticsearch-observability, github-actions-expert, incident-responder, jfrog-sec, llm-redteam-specialist, penetration-tester, platform-sre-kubernetes, powershell-security-hardening, read-only-auditor, se-security-reviewer, security-auditor, security-engineer, stackhawk-security-onboarding, supply-chain-security, tdd-refactor, terraform, wg-code-sentinel.

**ui-analysis (5):** screenshot-business-analyzer, screenshot-interaction-analyzer, screenshot-reviewer, screenshot-synthesizer, screenshot-ui-analyzer.

**web-tools (15):** accessibility, aem-frontend-specialist, electron-angular-native, expert-nextjs-developer, expert-react-frontend-engineer, java-mcp-expert, lingodotdev-i18n, nextjs-architecture-expert, react-performance-optimizer, se-responsible-ai-code, search-ai-optimization-expert, seo-analyzer, url-context-validator, url-link-extractor, web-accessibility-checker, wordpress-master.

### 1b. Commands (341 across 24 folders)

**analysis:** supply-chain-audit.

**automation:** act, ci-pipeline, husky, szamlazz, workflow-orchestrator.

**azure:** appinsights-instrumentation, azure-role-selector.

**database (DIRECTLY RELEVANT):** snowflake-semanticview, supabase-backup-manager, supabase-data-explorer, supabase-migration-assistant, supabase-performance-optimizer, supabase-realtime-monitor, supabase-schema-sync, supabase-security-audit, supabase-type-generator.

**deployment:** add-changelog, blue-green-deployment, changelog-demo-command, ci-setup, containerize-application, deployment-monitoring, hotfix-deploy, prepare-release, rollback-deploy, setup-automated-releases, setup-kubernetes-deployment.

**design:** web-design-reviewer.

**documentation:** create-architecture-documentation, create-onboarding-guide, doc-api, docs-maintenance, generate-api-documentation, interactive-documentation, load-llms-txt, migration-guide, troubleshooting-guide, update-docs.

**game-development:** 5 commands.

**git-workflow:** branch-cleanup, commit, create-pr, create-pull-request, create-worktrees, fix-github-issue, gemini-review, git-bisect-helper, pr-review, update-branch-name, worktree-check, worktree-cleanup, worktree-deliver, worktree-init.

**git:** feature, finish, flow-status, hotfix, release.

**google-workspace (massive - 89 entries):** core (gws-gmail, gws-calendar, gws-drive, gws-docs, gws-sheets, gws-meet, gws-tasks, gws-keep, gws-forms, gws-chat, gws-admin, gws-classroom, etc.) + 10 personas (content-creator, customer-support, event-coordinator, exec-assistant, hr-coordinator, it-admin, project-manager, researcher, sales-ops, team-lead) + 50 recipes (audit-external-sharing, batch-invite-to-event, bulk-download-folder, draft-email-from-doc, find-free-time, label-and-archive-emails, plan-weekly-schedule, schedule-recurring-event, send-personalized-emails, sync-contacts-to-sheet, watch-drive-changes, etc).

**marketing:** publisher-all, publisher-devto, publisher-linkedin, publisher-medium, publisher-x.

**nextjs-vercel (DIRECTLY RELEVANT):** nextjs-api-tester, nextjs-bundle-analyzer, nextjs-component-generator, nextjs-middleware-creator, nextjs-migration-helper, nextjs-performance-audit, nextjs-scaffold, vercel-deploy-optimize, vercel-edge-function, vercel-env-sync.

**orchestration:** archive, commit, feature-analyzer, feature-dev, feature-pipeline, find, log, move, optimize, remove, report, resume, start, status, sync.

**performance:** add-performance-monitoring, implement-caching-strategy, optimize-api-performance, optimize-build, optimize-bundle-size, optimize-database-performance, optimize-memory-usage, performance-audit, setup-cdn-optimization, system-behavior-simulator.

**project-management:** add-package, add-to-changelog, create-feature, create-jtbd, create-prd, create-prp, github-issues, init-project, milestone-tracker, nuget-manager, pac-configure, pac-create-epic, pac-create-ticket, pac-update-status, pac-validate, project-health-check, project-timeline-simulator, project-to-linear, release, todo.

**security:** add-authentication-system, dependency-audit, penetration-test, secrets-scanner, security-audit, security-hardening.

**setup:** create-database-migrations, design-database-schema, design-rest-api, implement-graphql-api, migrate-to-typescript, setup-ci-cd-pipeline, setup-development-environment, setup-docker-containers, setup-formatting, setup-linting, setup-monitoring-observability, setup-monorepo, setup-rate-limiting, update-dependencies, vercel-analytics.

**simulation:** business-scenario-explorer, constraint-modeler, decision-tree-explorer, digital-twin-creator, future-scenario-generator, market-response-modeler, monte-carlo-simulator, simulation-calibrator, system-dynamics-modeler, timeline-compressor.

**svelte:** 16 svelte-* commands.

**sync:** bidirectional-sync, bulk-import-issues, cross-reference-manager, issue-to-linear-task, linear-task-to-issue, sync-automation-setup, sync-conflict-resolver, sync-health-monitor, sync-issues-to-linear, sync-linear-to-issues, sync-migration-assistant, sync-pr-to-task, sync-status, task-from-pr.

**team:** architecture-review, decision-quality-analyzer, dependency-mapper, estimate-assistant, issue-triage, memory-spring-cleaning, migration-assistant, retrospective-analyzer, session-learning-capture, sprint-planning, standup-report, team-knowledge-mapper, team-velocity-tracker, team-workload-balancer.

**testing:** add-mutation-testing, add-property-based-testing, e2e-setup, generate-test-cases, generate-tests, setup-comprehensive-testing, setup-load-testing, setup-visual-testing, test-automation-orchestrator, test-changelog-automation, test-coverage, test-quality-analyzer, testing_plan_integration, webapp-testing, write-tests.

**utilities:** all-tools, architecture-scenario-explorer, check-file, clean-branches, clean, cleanup-cache, code-permutation-tester, code-review, code-to-task, context-prime, debug-error, directory-deep-dive, explain-code, fix-issue, generate-linear-worklog, git-status, initref, prime, refactor-code, screenshot-analyzer, ultra-think.

### 1c. Skills (3156 SKILL.md / reference .md files; ~400-450 distinct skills)

Domain folders observed: ai-maestro, ai-research (extensive: agents-autogpt/crewai/langchain/llamaindex, autonomous-agent-patterns, behavioral-modes, claude-code-guide, computer-use-agents, conversation-memory, datadog-cli, deep-research, deep-research-notebooklm, dispatching-parallel-agents, distributed-training-* x6, emerging-techniques-* x6, evaluation-* x3, fine-tuning-* x5, gemini-api-agent-platform, inference-serving-llama-cpp, etc.), analytics/google-analytics, business-marketing, career, creative-design, database, design-to-code, development, document-processing, enterprise-communication, git, gmod-addon-maker, marketing/x-twitter-scraper, media, pocketbase, productivity, railway, scientific, security, sentry, sports/footballbin-predictions, utilities, video, web-data, web-development, workflow-automation.

### 1d. MCPs (13)

audio, browser_automation, database, deepgraph, deepresearch, devtools, filesystem, integration, marketing, productivity, research, web-data, web.

### 1e. Hooks (categories)

automation, development-tools, git-workflow, git, monitoring, performance, post-tool, pre-tool, quality-gates, security, testing. Plus shared `HOOK_PATTERNS_COMPRESSED.json` registry.

**RATING: PRIORITY-A as a marketplace.** This is the deepest single-source aggregator. Granular install via npx flag per item rather than installing the whole shop. Add as a marketplace source. Mine for: supabase-* commands (8), vercel/nextjs commands (10), neo4j-docker-client-generator agent, supabase-realtime-optimizer agent, screenshot-* UI agents (5, useful for Co-Exist visual regression), Google Workspace recipe pack (highly relevant since we run on workspace).

---

## 2. VoltAgent/awesome-claude-code-subagents  *20.1k stars*

**Install:** `git clone https://github.com/VoltAgent/awesome-claude-code-subagents ~/agents-volt && cp ~/agents-volt/categories/**/*.md ~/.claude/agents/` OR via marketplace mirror.

### Complete enumeration (131+ subagents across 10 categories)

**01-core-development (11):** api-designer, backend-developer, design-bridge, electron-pro, frontend-developer, fullstack-developer, graphql-architect, microservices-architect, mobile-developer, ui-designer, websocket-engineer.

**02-language-specialists (29):** angular-architect, cpp-pro, csharp-developer, django-developer, dotnet-core-expert, dotnet-framework-4.8-expert, elixir-expert, expo-react-native-expert (RELEVANT - Co-Exist is Capacitor not Expo but pattern overlap), fastapi-developer (DIRECTLY RELEVANT), flutter-expert, golang-pro, java-architect, javascript-pro, kotlin-specialist, laravel-specialist, nextjs-developer, node-specialist, php-pro, powershell-5.1-expert, powershell-7-expert, python-pro (DIRECTLY RELEVANT), rails-expert, react-specialist (DIRECTLY RELEVANT), rust-engineer, spring-boot-engineer, sql-pro, swift-expert (DIRECTLY RELEVANT - iOS), symfony-specialist, typescript-pro (DIRECTLY RELEVANT), vue-expert.

**03-infrastructure (16):** azure-infra-engineer, cloud-architect, database-administrator, deployment-engineer, devops-engineer, devops-incident-responder, docker-expert, incident-responder, kubernetes-specialist, network-engineer, platform-engineer, security-engineer, sre-engineer, terraform-engineer, terragrunt-expert, windows-infra-admin.

**04-quality-security (16):** accessibility-tester, ad-security-reviewer, ai-writing-auditor, architect-reviewer, chaos-engineer, code-reviewer, compliance-auditor, debugger, error-detective, penetration-tester, performance-engineer, powershell-security-hardening, qa-expert, security-auditor, test-automator, ui-ux-tester.

**05-data-ai (13):** ai-engineer, data-analyst, data-engineer, data-scientist, database-optimizer, llm-architect, machine-learning-engineer, ml-engineer, mlops-engineer, nlp-engineer, postgres-pro (DIRECTLY RELEVANT - Supabase Postgres), prompt-engineer, reinforcement-learning-engineer.

**06-developer-experience (14):** build-engineer, cli-developer, dependency-manager, documentation-engineer, dx-optimizer, git-workflow-manager, legacy-modernizer, mcp-developer (DIRECTLY RELEVANT - we author MCP servers), powershell-module-architect, powershell-ui-architect, readme-generator, refactoring-specialist, slack-expert, tooling-engineer.

**07-specialized-domains (13):** api-documenter, blockchain-developer, embedded-systems, fintech-engineer, game-developer, healthcare-admin, iot-engineer, m365-admin, mobile-app-developer, payment-integration (RELEVANT - Stripe), quant-analyst, risk-manager, seo-specialist.

**08-business-product (12):** business-analyst, content-marketer, customer-success-manager, legal-advisor, license-engineer, product-manager, project-manager, sales-engineer, scrum-master, technical-writer, ux-researcher, wordpress-master.

**09-meta-orchestration (11):** agent-installer, agent-organizer, codebase-orchestrator, context-manager, error-coordinator, it-ops-orchestrator, knowledge-synthesizer, multi-agent-coordinator, performance-monitor, task-distributor, workflow-orchestrator.

**10-research-analysis (8):** competitive-analyst, data-researcher, market-researcher, project-idea-validator, research-analyst, scientific-literature-researcher, search-specialist, trend-analyst.

**RATING: PRIORITY-A** for selective copy of fastapi-developer, postgres-pro, swift-expert, react-specialist, typescript-pro, mcp-developer, payment-integration, accessibility-tester, ui-ux-tester. Sub-folder install: `cp categories/02-language-specialists/{fastapi-developer,postgres-pro,swift-expert,react-specialist,typescript-pro}.md ~/.claude/agents/`. Heavier overlap with davila7, but VoltAgent files tend to be more curated/longer.

---

## 3. SuperClaude-Org/SuperClaude_Framework  *22.8k stars*

**Install:** `pipx install superclaude && superclaude install`.

### Slash Commands (30 total)

- **Planning:** /brainstorm, /design, /estimate, /spec-panel.
- **Development:** /implement, /build, /improve, /cleanup, /explain.
- **Testing & Quality:** /test, /analyze, /troubleshoot, /reflect.
- **Documentation:** /document, /help.
- **Version Control:** /git.
- **Project Management:** /pm, /task, /workflow.
- **Research:** /research (deep web research w/ adaptive planning), /business-panel (multi-expert strategic analysis).
- **Utilities:** /agent, /index-repo, /index, /recommend, /select-tool, /spawn (parallel task execution), /load (session restore), /save (session persist), /sc (command listing).

### Behavioural Modes (7)

Brainstorming, Business Panel, Deep Research, Orchestration, Token-Efficiency, Task Management, Introspection.

### MCP Integrations (8 servers bundled)

Tavily (web search), Context7 (docs), Sequential-Thinking, Serena (memory & persistence), Playwright (browser automation), Magic (UI component generation), Morphllm-Fast-Apply (code modifications), Chrome DevTools (perf analysis).

### Agents (20 specialised personas)

PM Agent, Deep Research Agent, Security Engineer, Frontend Architect + 16 unnamed specialists.

**RATING: PRIORITY-B.** Useful primitives but pipx install puts it outside Claude Code's plugin model. Cherry-pick: /spec-panel, /brainstorm, /reflect (vs our own session reflection), /business-panel for strategy. Don't install whole framework - duplicates several of our hooks/skills.

---

## 4. ruvnet/ruflo (formerly claude-flow)  *52.8k stars*

**Install:** `npx ruflo@latest init` OR `npm install -g ruflo@latest` OR `claude mcp add ruflo -- npx ruflo@latest mcp start`.

### 32 Native Plugins

**Core/Orchestration (5):** ruflo-core, ruflo-swarm, ruflo-autopilot, ruflo-loop-workers, ruflo-workflows.

**Memory/Knowledge (5):** ruflo-agentdb (HNSW vector DB), ruflo-rag-memory (hybrid search + graph hops), ruflo-rvf (persistent), ruflo-ruvector (103 tools, Graph RAG), ruflo-knowledge-graph.

**Intelligence/Learning (4):** ruflo-intelligence (pattern learning), ruflo-daa (dynamic agent behaviour), ruflo-ruvllm (Ollama/vLLM routing), ruflo-goals (GOAP A* planner).

**Code Quality/Testing (4):** ruflo-testgen, ruflo-browser (Playwright), ruflo-jujutsu (git diff risk scoring), ruflo-docs.

**Security/Compliance (2):** ruflo-security-audit, ruflo-aidefence (prompt injection + PII).

**Architecture/Methodology (3):** ruflo-adr, ruflo-ddd (domain-driven design scaffolding), ruflo-sparc (5-phase methodology).

**DevOps/Observability (3):** ruflo-migrations, ruflo-observability, ruflo-cost-tracker.

**Extensibility (2):** ruflo-agent (WASM sandbox), ruflo-plugin-creator.

**Federation (1):** ruflo-federation (zero-trust cross-machine, mTLS + ed25519, 14-type PII detector).

**Domain-Specific (3):** ruflo-iot-cognitum, ruflo-neural-trader, ruflo-market-data.

### Distinctive Features

Multi-agent swarm w/ hierarchical/mesh topologies + consensus. SONA neural pattern matching. ReasoningBank trajectory learning. HNSW AgentDB 150x-12,500x faster than brute force. 27-hook system. 12 background workers (audit, optimize, testgaps, CVE check, docs refresh). Multi-provider LLM (Claude/GPT/Gemini/Cohere/Ollama failover). AIDefence: prompt injection blocking + CVE hardening.

**RATING: PRIORITY-C (mostly SKIP).** Massive feature surface but heavy overlap with our existing infra (we have Neo4j 5000 nodes, observer trio, coord bus, hooks). ruflo-federation is interesting (mTLS multi-machine collab) but we already have Tailscale + coord bus. Mining target: ruflo-aidefence (prompt injection blocking is a gap we don't have explicit), ruflo-cost-tracker (we have token budget rule but no telemetry). Don't install the full framework - it'd fight with our conductor design.

---

## 5. wshobson/agents  *35.6k stars*

**Install:** `/plugin marketplace add wshobson/agents` then `/plugin install <plugin>@wshobson` per the 80-plugin partition.

### 100 Agents (canonical list)

**Architecture & System Design (10):** backend-architect, frontend-developer, graphql-architect, architect-reviewer, cloud-architect, hybrid-cloud-architect, kubernetes-architect, service-mesh-expert, event-sourcing-architect, monorepo-architect.

**UI/UX & Mobile (8):** ui-designer, accessibility-expert, design-system-architect, ui-ux-designer, ui-visual-validator, mobile-developer, ios-developer, flutter-expert.

**Languages (Systems):** c-pro, cpp-pro, rust-pro, golang-pro.
**Languages (Web/App):** javascript-pro, typescript-pro, python-pro, temporal-python-pro, ruby-pro, php-pro.
**Languages (JVM):** java-pro, scala-pro, csharp-pro.
**Specialised:** elixir-pro, django-pro, fastapi-pro, haskell-pro, unity-developer, minecraft-bukkit-pro, sql-pro.

**Infrastructure & Operations (9):** devops-troubleshooter, deployment-engineer, terraform-specialist, dx-optimizer, database-optimizer, database-admin, database-architect, incident-responder, network-engineer.

**Quality & Security (10):** code-reviewer, security-auditor, backend-security-coder, frontend-security-coder, mobile-security-coder, threat-modeling-expert, test-automator, tdd-orchestrator, debugger, error-detective.

**Performance/Observability (3):** performance-engineer, observability-engineer, search-specialist.

**Data & AI (7):** data-scientist, data-engineer, ai-engineer, ml-engineer, mlops-engineer, prompt-engineer, vector-database-engineer (DIRECTLY RELEVANT - pgvector).

**Documentation & C4 Architecture (9):** docs-architect, api-documenter, reference-builder, tutorial-engineer, mermaid-expert, c4-code, c4-component, c4-container, c4-context.

**Business (5):** business-analyst, quant-analyst, risk-manager, content-marketer, sales-automator.

**Support/Legal (3):** customer-support, hr-pro, legal-advisor.

**SEO (10):** seo-content-auditor, seo-meta-optimizer, seo-keyword-strategist, seo-structure-architect, seo-snippet-hunter, seo-content-refresher, seo-cannibalization-detector, seo-authority-builder, seo-content-writer, seo-content-planner.

**Specialised (5):** arm-cortex-expert, blockchain-developer, payment-integration, legacy-modernizer, context-manager.

**Also conductor-validator (1):** "Validates Conductor project artifacts for completeness."

**RATING: PRIORITY-A for the marketplace.** Probably the highest-quality single agent collection. Selective install: vector-database-engineer (pgvector relevant), fastapi-pro, ios-developer, mobile-security-coder, backend-security-coder, threat-modeling-expert, tdd-orchestrator, observability-engineer, payment-integration, c4-* (architecture diagram primitives we lack).

---

## 6. wshobson/commands  *2.5k stars*

**Install:** `/plugin marketplace add wshobson/commands`.

### 57 commands across 11 categories

**Workflows (15):** feature-development, full-review, smart-fix, tdd-cycle, git-workflow, improve-agent, legacy-modernize, multi-platform, workflow-automate, full-stack-feature, security-hardening, data-driven-feature, performance-optimization, incident-response.

**Tools (42):** ai-assistant, ai-review, langchain-agent, prompt-optimize, multi-agent-review, multi-agent-optimize, smart-debug, code-explain, code-migrate, refactor-clean, tech-debt, data-pipeline, data-validation, db-migrate, deploy-checklist, docker-optimize, k8s-manifest, monitor-setup, slo-implement, api-mock, api-scaffold, test-harness, tdd-red, tdd-green, tdd-refactor, accessibility-audit, compliance-check, security-scan, debug-trace, error-analysis, error-trace, issue, config-validate, deps-audit, deps-upgrade, doc-generate, pr-enhance, standup-notes, cost-optimize, onboard, context-save, context-restore.

**RATING: PRIORITY-B.** Solid commands; many duplicate our routines. Cherry-pick: full-stack-feature, security-scan, deps-audit, accessibility-audit, slo-implement.

---

## 7. affaan-m/everything-claude-code (ECC)  *star count badge inflated; treat ~low-tens-of-k*

**Install:** `/plugin install ecc@ecc` OR `./install.sh --profile full` OR `npx ecc-install --profile full`.

### 232 Skills (selected highlights)

**Core Workflow:** tdd-workflow, verification-loop, eval-harness, strategic-compact, search-first.

**Language families (12):** TypeScript/JS (coding-standards, frontend-patterns, frontend-slides, backend-patterns, bun-runtime, nextjs-turbopack), Python (python-patterns, python-testing, django-patterns/security/tdd/verification, pytorch-patterns), Go (golang-patterns, golang-testing), Java/JVM (springboot-*, quarkus-*, java-coding-standards, jpa-patterns), C++ (cpp-*), Swift (swift-actor-persistence, swift-protocol-di-testing, liquid-glass-design, foundation-models-on-device, swift-concurrency-6-2), Perl (perl-*), PHP (laravel-*), Rust (rust-patterns), Kotlin/HarmonyOS/ArkTS.

**DB & Backend:** postgres-patterns, clickhouse-io, database-migrations (Prisma/Drizzle/Django/Go), api-design, deployment-patterns, docker-patterns.

**Frontend & Content:** frontend-slides (zero-dep HTML→PPTX), article-writing, content-engine (multi-platform repurpose - **but note: misaligned with Ecodia relational doctrine**), market-research, investor-materials, investor-outreach, brand-voice, videodb, manim-video, remotion-video-creation.

**ML/Data:** mle-workflow, cost-aware-llm-pipeline, pytorch-patterns.

**Advanced Patterns:** e2e-testing (Playwright PoM), content-hash-cache-pattern, regex-vs-llm-structured-text, autonomous-loops (pipelines, PR loops, DAG orchestration), plankton-code-quality (write-time hooks), iterative-retrieval, continuous-learning, continuous-learning-v2 (instinct-based), skill-stocktake (audit skills + commands), mcp-server-patterns (MCP SDK), configure-ecc, security-scan (AgentShield), documentation-lookup (Context7).

### 60 Agents (highlights)

Core: planner, architect, tdd-guide, code-reviewer, security-reviewer, build-error-resolver, refactor-cleaner.

Language reviewers: typescript-reviewer, python-reviewer, go-reviewer, cpp-reviewer, fsharp-reviewer, java-reviewer, kotlin-reviewer, rust-reviewer, mle-reviewer.

Operations: loop-operator, harness-optimizer, chief-of-staff, doc-updater, docs-lookup.

Business: brand-voice, social-graph-ranker, connections-optimizer (RELEVANT TO RELATIONAL DOCTRINE), customer-billing-ops, google-workspace-ops, project-flow-ops, workspace-surface-audit.

### Instincts & Memory

Auto-learned from session patterns, confidence-scored. `/instinct-status`, `/instinct-import`, `/instinct-export`, `/evolve` (cluster instincts into reusable skills). `.claude/memory/` persistent SQLite store. Session adapters for structured recording.

### AgentShield Security

1282 tests, 98% coverage, 102 static analysis rules. Secrets detection (14 patterns). beforeTabFileRead blocks `.env/.key/.pem`. beforeShellExecution prevents dev-server starts outside tmux. beforeSubmitPrompt detects secrets. beforeMCPExecution/afterMCPExecution audit logging. `/security-scan` w/ 3 Opus 4.6 agents (red-team/defender/auditor).

### Multi-Agent Orchestration

`/multi-plan`, `/multi-execute`, `/multi-backend`, `/multi-frontend`, `/multi-workflow`. PM2 lifecycle (`/pm2` command). Requires `npx ccg-workflow`.

**RATING: PRIORITY-A for selective acquisition, PRIORITY-C for whole install.** Whole bundle conflicts with our conductor architecture (own observer trio, own coord bus, own working_set, own session-handoff, own auto-memory). MINE: AgentShield's beforeMCPExecution / beforeSubmitPrompt hook patterns (we have em-dash detector + cred-mention but not MCP audit logging); instinct system pattern as inspiration for our pattern-corpus auto-learn; cost-aware-llm-pipeline skill (we burn tokens, could codify); skill-stocktake (audit pattern for our 245+ patterns dir); social-graph-ranker + connections-optimizer agents (DIRECTLY MAPS to our relational marketing doctrine - this might be a real load-bearing find).

---

## 8. alirezarezvani/claude-skills  *15.4k stars*

**Install:** `/plugin marketplace add alirezarezvani/claude-skills` then `/plugin install <name>@claude-code-skills`.

### 313+ Skills across 12 domains

- Engineering (Core): 32 skills (architecture, frontend, backend, QA, DevOps, SecOps, AI/ML, data engineering, Playwright, security auditing).
- Engineering (POWERFUL): 25 (agent design, RAG architecture, DB optimisation, CI/CD building, MCP server development).
- Marketing: 45 (content, SEO/AEO, CRO, growth channels, sales enablement, intelligence).
- Product: 13 (PM, UX research, design, SaaS metrics, roadmaps).
- Research: 8 (literature review, grant research, patent analysis, academic syllabus).
- Project Management: 9 (Agile, Scrum, Jira, Confluence).
- Regulatory/Quality: 14 (ISO 13485, MDR, FDA, GDPR, SOC 2).
- C-Level Advisory: 28 (full C-suite personas w/ orchestration).
- Productivity: 4. Finance: 3. Business Growth: 5. Playwright Pro: 12. Self-Improving Agent: 7.

**RATING: PRIORITY-A for selective.** Marketing skills clash w/ relational doctrine (CRO/funnel framing), but C-Level advisory + Self-Improving Agent + Regulatory/Quality (GDPR for Co-Exist youth conservation app data) are useful. Cherry-pick post-install.

---

## 9. obra/superpowers  *star badge inflated; canonical Geoffrey Huntley skill bundle*

**Install:** `/plugin install superpowers@claude-plugins-official` OR direct marketplace add.

### Skills

- **Planning:** brainstorming (Socratic Q&A), writing-plans (2-5min bite-size tasks w/ specs), executing-plans (batch + checkpoints), using-git-worktrees.
- **Testing & Verification:** test-driven-development (RED-GREEN-REFACTOR), verification-before-completion.
- **Reviewing & Collaboration:** requesting-code-review, receiving-code-review, subagent-driven-development (two-stage: spec → code-quality), dispatching-parallel-agents.
- **Debugging:** systematic-debugging (4-phase root cause), finishing-a-development-branch.
- **Meta:** writing-skills, using-superpowers.

**RATING: PRIORITY-A.** Canonical bundle, narrow, deep. Direct map to our doctrine (action-over-plans, codify-at-the-moment, etc.). Install whole.

---

## 10. anthropics/skills (official)  *137k stars*

**Install:** `/plugin marketplace add anthropics/skills` or git clone to skills dir.

### 18 official skill folders

- **Creative & Design:** algorithmic-art, canvas-design, frontend-design (ALREADY INSTALLED - DUPLICATE), theme-factory.
- **Development & Technical:** claude-api, mcp-builder, web-artifacts-builder, webapp-testing.
- **Enterprise & Communication:** brand-guidelines, internal-comms, slack-gif-creator.
- **Document Skills:** doc-coauthoring, docx, pdf, pptx, xlsx.
- **Utility:** skill-creator.

**RATING: PRIORITY-A.** Already partially covered. Add: claude-api (we author 157-tool MCP, this is canonical SDK guidance), mcp-builder, webapp-testing (Co-Exist regression), docx/pdf/pptx/xlsx (Tate-deliverables-pdf-only doctrine).

---

## 11. EveryInc/compound-engineering-plugin  *16.9k stars*

**Install:** `/plugin marketplace add EveryInc/compound-engineering-plugin`.

37 skills + 51 agents. Discipline: "each unit of engineering work should make subsequent units easier" - 80% planning/review, 20% execution.

Top commands: /ce-strategy (STRATEGY.md), /ce-ideate, /ce-brainstorm, /ce-plan, /ce-work (worktrees + tasks), /ce-debug (RCA), /ce-code-review (multi-agent), /ce-compound (codify learnings), /ce-product-pulse, /ce-setup.

**RATING: PRIORITY-B.** Maps decently to our codify-at-the-moment doctrine. /ce-compound is what we already do via Neo4j Pattern nodes. /ce-product-pulse useful (we lack a usage-pulse skill). Install for /ce-compound + /ce-product-pulse, skip the rest.

---

## 12. avifenesh/agentsys  *809 stars*

**Install:** `npm install -g agentsys && agentsys` OR `/plugin marketplace add agent-sh/agentsys`.

24 commands, 50 agents, 45 skills. "Code does code work. AI does AI work." Phase gates prevent skipped steps. 3,518 passing tests. 77% fewer tokens than multi-agent approaches.

Highlights: /next-task (discovery→impl→review→ship), /prepare-delivery, /gate-and-ship, /ship (PR + CI + merge), /audit-project, /deslop, /drift-detect, /repo-intel, /sync-docs, /perf, /agnix (lint agent configs, 423 rules), /axiom (durable queryable memory), /banthis (persistent negative memory), /enhance, /learn, /consult (cross-tool 2nd opinion), /debate (multi-round), /web-ctl, /release, /skill-curator, /system-prompt-curator, /onboard.

**RATING: PRIORITY-B.** /drift-detect ↔ our drift-audit doctrine; /agnix (linting agents) ↔ we lack this; /axiom + /banthis (positive + negative memory) ↔ our Neo4j writes; /skill-curator ↔ we author patterns manually. Mine /agnix + /skill-curator + /banthis.

---

## 13. automazeio/ccpm  *8.1k stars*

Skill-only (no slash commands). 5 reference guides (plan/structure/sync/execute/track) + 14 bash scripts. Spec-driven: PRD → Epic → Tasks (parallelizable) → GitHub Issues → Parallel agents → Track. Persists context in `.claude/` not chat.

**Install:** Symlink `skill/ccpm/` into `~/.claude/skills/`.

**RATING: PRIORITY-B.** Aligned with brief-names-the-product-not-the-immediate-task doctrine. Could replace ad-hoc kv_store + status_board project tracking for new builds.

---

## 14. K-Dense-AI/claude-scientific-skills  *24.4k stars*

**Install:** `npx skills add K-Dense-AI/scientific-agent-skills`.

135 skills across: Bioinformatics/Genomics, Cheminformatics/Drug Discovery, Clinical Research, ML (PyTorch Lightning, scikit-learn, Transformers, PyMC, TimesFM), Data Analysis/Viz (Matplotlib, Seaborn, NetworkX, GeoPandas, Polars), Scientific Communication (PubMed/bioRxiv/arXiv lookup, lit review), 78+ unified database access (PubChem, ChEMBL, UniProt, KEGG, Reactome), Infrastructure (Modal, DNAnexus, LatchBio, Benchling, Opentrons).

**RATING: SKIP for general install.** Not Ecodia-aligned. Exception: Polars + GeoPandas + NetworkX skills could be installed individually if a future client needs geospatial / network analysis (Roam? Co-Exist conservation mapping?).

---

## 15. trailofbits/skills  *5.3k stars*

**Install:** `/plugin marketplace add trailofbits/skills`.

22 security skills: building-secure-contracts (smart contract scanning 6 chains), entry-point-analyzer, agentic-actions-auditor (GH Actions for AI agents), audit-context-building (granular code analysis), burpsuite-project-parser, c-review, differential-review (git history security review), dimensional-analysis (unit mismatch detection via type annotations), fp-check (false positive verification), insecure-defaults, semgrep-rule-creator, semgrep-rule-variant-creator, sharp-edges (footgun detection), static-analysis (CodeQL+Semgrep+SARIF), supply-chain-risk-auditor, testing-handbook-skills (fuzzers/sanitizers/coverage), trailmark (code graph + Mermaid + mutation testing), variant-analysis, constant-time-analysis (crypto timing side-channels), yara-authoring, zeroize-audit, firebase-apk-scanner.

**RATING: PRIORITY-A for select skills.** Install: differential-review (PR diff security on Co-Exist commits), insecure-defaults (Supabase defaults), supply-chain-risk-auditor (npm/pip dep audit), agentic-actions-auditor (we have GH Actions on EcodiaOS-mobile + Co-Exist), firebase-apk-scanner (no, we're not on Firebase). Skip smart-contract skills.

---

## 16. glittercowboy/taches-cc-resources (TÂCHES)  *1.9k stars*

**Install:** plugin marketplace.

3 auditor subagents (skill-auditor, slash-command-auditor, subagent-auditor) + 9 meta-skills (Create Plans / Agent Skills / Meta-Prompts / Slash Commands / Subagents / Hooks / MCP Servers / Debug Like Expert / Setup Ralph) + 27 commands incl. 12 thinking-model commands (/consider:pareto, first-principles, inversion, second-order, 5-whys, occams-razor, one-thing, swot, eisenhower-matrix, 10-10-10, opportunity-cost, via-negativa).

**RATING: PRIORITY-A.** Meta-skill quality is high. Thinking-model commands are pure value-add for the CEO loop. Install for the /consider:* set + the auditor agents (we could audit our own 245+ patterns).

---

## 17. NeoLabHQ/context-engineering-kit  *1k stars*

14 plugins, 50+ commands. Reflexion (/reflexion:reflect, memorize, critique), SDD (8 commands + 9 specialist agents), Review (/review-local-changes, /review-pr w/ 6 reviewer agents), Git, TDD, SADD (Subagent-Driven Development: /launch-sub-agent, /do-and-judge, /do-in-parallel, /do-in-steps, /do-competitively, /tree-of-thoughts, /judge-with-debate, /judge), DDD (15 rules), FPF (First Principles Framework: /propose-hypotheses, /status, /query, /decay, /actualize, /reset), Kaizen (/analyse, /why, /root-cause-tracing, /cause-and-effect, /plan-do-check-act), Customaize Agent (full agent/command/hook/skill creation kit), Docs, Tech Stack, MCP (/mcp:setup-context7-mcp, serena, codemap-cli, arxiv, build-mcp).

Reliability metrics published: human-investment correlates directly with quality outcomes (60-80% one-shot for small change → 95% for SDD+human-review).

**RATING: PRIORITY-A.** Strong methodology depth. /do-and-judge, /do-in-parallel, /do-competitively map directly to our dispatch-worker doctrine. /tree-of-thoughts and /judge-with-debate are net-new primitives we don't have. FPF (hypothesis-driven analysis w/ evidence decay) is interesting for client-decision arcs.

---

## 18. undeadlist/claude-code-agents  *137 stars*

24 subagents for solo-dev E2E workflow on Next.js/React/TS + Prisma + Vercel stack. Categories: 11 parallel audit agents (code/bug/security/doc/infra/ui/db/perf/dep/seo/api-tester), 4 fix/implement (fix-planner, code-fixer, test-runner, test-writer), 4 browser QA (browser-qa-agent, fullstack-qa-orchestrator, console-monitor, visual-diff), 2 deploy (deploy-checker, env-validator), 2 utility (pr-writer, seed-generator), 1 supervisor (architect-reviewer).

**Install:** `/plugin marketplace add undeadlist/claude-code-agents`.

**RATING: PRIORITY-B.** Stack overlap on Co-Exist (React + TS + Vercel). Install for the 11 parallel auditors + visual-diff (Co-Exist visual regression).

---

## 19. maxritter/pilot-shell (formerly claude-codepro)  *1.7k stars*

Spec-driven workflow w/ /spec RED→GREEN→REFACTOR. 18 hook registrations across 7 events (ruff + ESLint + go vet). Cross-session memory tab. Hybrid code search (Semble) + code knowledge graph (CodeGraph).

**Install:** `curl -fsSL https://raw.githubusercontent.com/maxritter/pilot-shell/main/install.sh | bash`.

**RATING: PRIORITY-B / SKIP.** Heavy install footprint; semble/codegraph duplicates our codebase-awareness + Neo4j. Mine the 18-hooks list for missing patterns. Note: rebranded "pilot-shell" from "claude-codepro" - the awesome-cc list has stale URL.

---

## 20. fcakyon/claude-codex-settings  *696 stars*

`/plugin install <name>@claude-settings`. Per-plugin install. Plugins relevant to Ecodia:

- **intelligent-compact** (PRIORITY-A: preserves file paths and root causes during summary)
- **claude-telemetry-hooks** (PRIORITY-B: per-device usage tracking - we have Phase C telemetry)
- **github-dev** (PRIORITY-B: git workflow + PR automation)
- **anthropic-essentials** (already partially via skill-creator)
- **ultralytics-dev** (PRIORITY-B: auto-format Python/JS/Markdown/Bash)
- **anthropic-office-skills + openai-office-skills** (DUPLICATE w/ anthropics/skills)
- **overleaf-skills** (SKIP)
- **react-skills** (PRIORITY-A: 64+ React/Next.js perf rules - Co-Exist)
- **web-performance-skills** (PRIORITY-A: Core Web Vitals - Co-Exist + ecodia.au)
- **frontend-design-skills** (DUPLICATE - already have frontend-design)
- **agent-browser** (PRIORITY-B: 93% less context vs Playwright MCP)
- **mongodb-skills** (SKIP - not on stack)
- **supabase-skills** (DUPLICATE - we have supabase plugin)
- **python-skills** (PRIORITY-B: PEP 8 + style)
- **cloudflare-skills** (SKIP - not on stack)
- **hetzner-skills** (PRIORITY-C: VPS infra parallel)
- **dokploy-skills** (SKIP)
- **azure-tools, gcloud-tools** (SKIP)
- **stripe-skills** (PRIORITY-A: payments + Connect - matches our Stripe billing)
- **polar-skills** (SKIP)
- **livekit-skills** (SKIP)
- **tavily-tools** (PRIORITY-B: web search where vps-bot blocked)
- **paper-search-tools** (PRIORITY-C: research on grants - aligned with Co-Exist 60-program grant intel)
- **phd-skills** (PRIORITY-C: hypothesis design, lit review)
- **openobserve-skills, claude-tools, anthropic-plugin-dev** (PRIORITY-B for plugin-dev)

**RATING: PRIORITY-A as a marketplace** for selective install. Especially intelligent-compact, react-skills, web-performance-skills, stripe-skills.

---

## 21. heyclau.de + JSONbored/claudepro-directory  *218 stars on repo, 385+ catalogued items*

Sources 66 hooks + 27 slash commands + subagent factory patterns. Browse via heyclau.de UI. Integration: Raycast feed, RSS, MCP endpoints, npm packages.

**RATING: PRIORITY-A as a discovery surface, PRIORITY-B for direct install.** Use as discovery; many entries duplicate ones we've already catalogued above.

---

## 22-N. SECONDARY AGGREGATORS (capsule entries)

| Name | URL | Stars | Value Prop | Categories | Install | Rating |
|---|---|---|---|---|---|---|
| robertguss/claude-skills (Book Factory) | https://github.com/robertguss/claude-skills | n/a | Nonfiction publishing pipeline skills | Content | git clone | SKIP |
| undeadlist alt | https://github.com/undeadlist/claude-code-agents | 137 | Solo-dev Next.js E2E (covered above) | dev | marketplace | PRIORITY-B |
| dreamiurg/claude-mountaineering-skills | https://github.com/dreamiurg/claude-mountaineering-skills | n/a | Mountain route research | recreation | git clone | SKIP |
| zarazhangrui/codebase-to-course | https://github.com/zarazhangrui/codebase-to-course | n/a | Codebase → interactive HTML course | docs/edu | git clone | PRIORITY-C (educational onboarding for clients) |
| skills-directory/skill-codex | https://github.com/skills-directory/skill-codex | n/a | Prompt OpenAI Codex from Claude Code | meta | git clone | PRIORITY-C (cross-tool consult pattern) |
| jawwadfirdousi/agent-skills (read-only-postgres) | https://github.com/jawwadfirdousi/agent-skills | n/a | Read-only PG queries w/ validation | db | git clone | PRIORITY-B (safer than db_query for analysts) |
| alonw0/web-asset-generator | https://github.com/alonw0/web-asset-generator | n/a | Favicons, PWA icons, OG images | content | git clone | PRIORITY-B (Co-Exist + ecodia.au assets) |
| ayoubben18/ab-method | https://github.com/ayoubben18/ab-method | n/a | Spec-driven incremental missions w/ subagents | workflow | git clone | PRIORITY-C |
| ThibautMelen/agentic-workflow-patterns | https://github.com/ThibautMelen/agentic-workflow-patterns | n/a | Anthropic agentic patterns w/ Mermaid + code | meta | git clone | PRIORITY-A (reference) |
| ericbuess/claude-code-docs | https://github.com/ericbuess/claude-code-docs | n/a | Mirror of Anthropic docs, hourly | docs | git clone | PRIORITY-B (offline docs) |
| diet103/claude-code-infrastructure-showcase | https://github.com/diet103/claude-code-infrastructure-showcase | n/a | Hooks ensuring Claude uses skills intelligently | hooks | git clone | PRIORITY-A (hook patterns to learn from) |
| Piebald-AI/claude-code-system-prompts | https://github.com/Piebald-AI/claude-code-system-prompts | n/a | Mirror of CC system prompt + builtin tool descs | research | git clone | PRIORITY-A (reverse-engineer CC behaviour) |
| ykdojo/claude-code-tips | https://github.com/ykdojo/claude-code-tips | n/a | 35+ info-dense CC tips | tips | git clone | PRIORITY-C |
| FlorianBruniaux/claude-code-ultimate-guide | https://github.com/FlorianBruniaux/claude-code-ultimate-guide | n/a | Beginner→power-user guide w/ templates | docs | git clone | PRIORITY-B |
| OneRedOak/claude-code-workflows | https://github.com/OneRedOak/claude-code-workflows/tree/main/design-review | n/a | UI/UX design review workflow w/ subagents | design | git clone | PRIORITY-A (Co-Exist UI review) |
| Helmi/claude-simone | https://github.com/Helmi/claude-simone | n/a | Project management workflow + docs | workflow | git clone | PRIORITY-B |
| wcygan/dotfiles (88 slash-commands) | https://github.com/wcygan/dotfiles | n/a | 88-command megalist | commands | git clone (cherry-pick) | PRIORITY-B |
| tony/claude-code-riper-5 (RIPER) | https://github.com/tony/claude-code-riper-5 | n/a | Research/Innovate/Plan/Execute/Review enforcement | workflow | git clone | PRIORITY-B |
| panaversity/claude-code-agent-teams-exercises | https://github.com/panaversity/claude-code-agent-teams-exercises | n/a | Team formation + coord exercises | meta | git clone | PRIORITY-C |
| revfactory/harness | https://github.com/revfactory/harness | n/a | Meta-skill: designs agent teams + generates skills | meta | git clone | PRIORITY-A (we author patterns; this generates) |
| snwfdhmp/awesome-ralph + 5 Ralph forks | various | n/a | Autonomous AI loops until spec fulfilled | autonomy | git clone | PRIORITY-B (alternative to our cron-fired forks) |
| anthropics/claude-code/tree/main/plugins/ralph-wiggum | github | n/a | Official Ralph Wiggum plugin | autonomy | marketplace | PRIORITY-A |
| Haleclipse/CCometixLine | https://github.com/Haleclipse/CCometixLine | n/a | Rust statusline w/ git + usage + TUI config | statusline | git clone | PRIORITY-B |
| sirmalloc/ccstatusline | https://github.com/sirmalloc/ccstatusline | n/a | Customisable statusline | statusline | git clone | PRIORITY-C |
| jarrodwatts/claude-hud | https://github.com/jarrodwatts/claude-hud | 23.1k | THE canonical CC HUD: model + git + context bar + tool/agent/todo lines | statusline | marketplace | PRIORITY-A |
| rz1989s/claude-code-statusline | github | n/a | 4-line statusline w/ themes + cost + MCP monitor | statusline | git clone | PRIORITY-B |
| Astro-Han/claude-pace | github | n/a | Bash+jq statusline: rate-limit burn rate | statusline | git clone | PRIORITY-A (we have budget rule, this surfaces it) |
| Owloops/claude-powerline | github | 1.1k | Vim-style powerline w/ 6 themes + grid layout TUI | statusline | npx | PRIORITY-A |
| hagan/claudia-statusline | github | n/a | Rust statusline w/ SQLite + cloud sync | statusline | git clone | PRIORITY-B |
| Talieisin/britfix | https://github.com/Talieisin/britfix | n/a | Convert American → British spelling | hook | git clone | PRIORITY-A (Australian English alignment) |
| dazuiba/CCNotify | https://github.com/dazuiba/CCNotify | 205 | Desktop notify + VS Code jump-back (macOS only) | hook | git clone | SKIP (Corazon is Windows) |
| GowayLee/cchooks | https://github.com/GowayLee/cchooks | n/a | Python SDK for writing hooks | hook-dev | pip | PRIORITY-B |
| aannoo/claude-hook-comms (hcom) | https://github.com/aannoo/claude-hook-comms | 288 | Subagent ↔ subagent inbox via hooks + SQLite. Collision detection. | hook | brew/uv/pip | PRIORITY-A (we built coord-bus; this is the canonical alternative) |
| beyondcode/claude-hooks-sdk | github | n/a | Laravel-style fluent PHP hook SDK | hook-dev | composer | SKIP |
| johnlindquist/claude-hooks | github | n/a | TS-based hook config | hook-dev | npm | PRIORITY-B |
| ctoth/claudio | github | n/a | OS-native sounds via hooks | hook | npm | PRIORITY-C (delightful but optional) |
| ldayton/Dippy | https://github.com/ldayton/Dippy | 232 | AST-based safe bash auto-approve | hook | brew | PRIORITY-A (we have allowlist-gated shell_exec; this is finer-grained) |
| fcakyon hooks subdir | fcakyon | (in fcakyon parent) | Force Tavily over WebFetch, code quality regs | hook | clone | PRIORITY-A |
| vaporif/parry | github | n/a | Prompt injection scanner via hooks. Detects exfiltration. | hook | clone | PRIORITY-A (Tate flagged prompt injection as gap) |
| nizos/tdd-guard | https://github.com/nizos/tdd-guard | 2.1k | Blocks impl without failing tests. Vitest/Jest/pytest/PHPUnit/Go/Rust/RSpec/Minitest. | hook | marketplace | PRIORITY-B (we don't strictly TDD; useful for Co-Exist) |
| bartolli/claude-code-typescript-hooks | github | n/a | TS compile + ESLint auto-fix + Prettier w/ SHA256 cache | hook | clone | PRIORITY-A (Co-Exist + Roam + Sidequests are TS) |
| backnotprop/plannotator | github | n/a | Visual annotate-plan-via-hook | hook | clone | PRIORITY-C |
| EveryInc/compound-engineering-plugin | covered above | 16.9k | | meta | marketplace | PRIORITY-B |
| Layr-Labs/avs-vibe-developer-guide CLAUDE.md | github | n/a | EigenLayer AVS dev | CLAUDE.md | clone | SKIP |
| CommE2E/comm AGENTS.md | github | n/a | E2E messaging dev reference | CLAUDE.md | clone | SKIP |
| basicmachines-co/basic-memory CLAUDE.md | github | n/a | MCP for bidirectional LLM↔markdown | CLAUDE.md | clone | PRIORITY-A (read for memory substrate patterns) |
| opactorai/Claudable | https://github.com/opactorai/Claudable | n/a | Web builder leveraging Claude Code + Cursor Agent | alt-client | install | SKIP |
| phiat/claude-esp | github | n/a | Go TUI streaming hidden CC output (thinking, tool calls) | alt-client | go install | PRIORITY-A (debugging cron fires, observer signals) |
| nielsgroen/claude-tmux | github | n/a | Multi-CC tmux popup manager | alt-client | clone | PRIORITY-B (alternative to IDE tabs) |
| stravu/crystal | https://github.com/stravu/crystal | 3.1k | DEPRECATED → Nimbalyst. Multi-CC parallel git worktrees. | alt-client | n/a | SKIP (use Nimbalyst evaluation instead) |
| omnara-ai/omnara | https://github.com/omnara-ai/omnara | 2.6k | ARCHIVED Feb 2026. Multi-channel sync. Migrating to claude.omnara.com. | alt-client | n/a | SKIP |
| nimbalyst | https://nimbalyst.com/ | n/a | Crystal successor; real-time editor + multi-editor | alt-client | install | PRIORITY-B (evaluate as alternative to dispatch_worker) |

### Bindu/GetBindu aggregator finds (additional unique repos not yet listed)

| Name | URL | 1-line Value Prop | Category | Rating |
|---|---|---|---|---|
| rohitg00/awesome-claude-code-toolkit | https://github.com/rohitg00/awesome-claude-code-toolkit | 135 agents + 35 skills + 42 commands | meta | PRIORITY-B |
| garrytan/gstack | https://github.com/garrytan/gstack | 6 opinionated startup leadership tools | startup | PRIORITY-A (Tate is a founder) |
| swarmclawai/andrej-karpathy-skills | github | Karpathy-inspired guidelines | ML | PRIORITY-C |
| sickn33/antigravity-awesome-skills | github | 1,326+ installable agentic skills | meta | PRIORITY-C (mostly cross-platform Antigravity) |
| muratcankoylan/Agent-Skills-for-Context-Engineering | github | Context engineering principles | meta | PRIORITY-B |
| huggingface/skills | github | HF ecosystem integration | ML | PRIORITY-C |
| microsoft/skills | github | MS-published skills + MCPs | enterprise | PRIORITY-C |
| antfu/skills | github | Anthony Fu's curated set | dev | PRIORITY-A (antfu is high-signal in JS ecosystem) |
| ConardLi/garden-skills | github | Web design + knowledge retrieval | design | PRIORITY-C |
| davepoon/buildwithclaude | github | Hub for skills/agents/commands/hooks | meta | PRIORITY-B (discovery surface) |
| ComposioHQ/awesome-claude-skills | github | Composio-curated directory | meta | PRIORITY-B |
| travisvn/awesome-claude-skills | github | CC-focused curation | meta | PRIORITY-B |
| addyosmani/agent-skills | github | Production engineering skills | dev | PRIORITY-A (Addy Osmani = web perf authority) |
| SawyerHood/dev-browser | github | Web browser caps for Claude agents | tool | PRIORITY-B |
| arun-mosai/claude-code-slice-skills | github | Vertical-slice feature dev (3 composable skills) | dev | PRIORITY-B |
| voidborne-d/sober-coding | github | Post-gen quality analyzer (27 rules x 7 dimensions) | quality | PRIORITY-A (we have em-dash + cred-mention; this is broader) |
| mturac/recsys-pipeline-architect | github | Recommendation pipeline architect | data | SKIP |
| OthmanAdi/planning-with-files | github | Persistent markdown planning | planning | PRIORITY-B |
| twostraws/SwiftUI-Agent-Skill | github | SwiftUI-focused | iOS | PRIORITY-A (Co-Exist is Capacitor not SwiftUI but iOS-adjacent) |
| tw93/Waza | github | Engineering habits as runnable skills | meta | PRIORITY-B |
| coleam00/excalidraw-diagram-skill | github | Excalidraw diagrams from NL | docs | PRIORITY-A (we lack diagram primitive) |
| lackeyjb/playwright-skill | github | Browser automation w/ Playwright | testing | PRIORITY-B |
| uditgoenka/autoresearch | github | Autonomous goal-directed iteration | research | PRIORITY-B |
| nicobailon/visual-explainer | github | Rich HTML pages + slide decks | docs | PRIORITY-A (replaces broadcast slop with deep artefacts; relational doctrine fit) |
| vijaythecoder/awesome-claude-agents | github | 24 specialized dev agents | dev | PRIORITY-B |
| lst97/claude-code-sub-agents | github | Domain-expert subagents w/ multi-agent orchestration | dev | PRIORITY-B |
| Orchestra-Research/AI-Research-SKILLs | github | OSS AI research skills | research | PRIORITY-B |
| nextlevelbuilder/ui-ux-pro-max-skill | github | Pro UI/UX skill | design | PRIORITY-B |
| conorluddy/ios-simulator-skill | github | iOS Simulator automation w/ 21 production scripts | iOS | PRIORITY-A (Co-Exist iOS dev) |
| IvanMurzak/Unity-MCP | github | Unity engine MCP | gamedev | SKIP |
| htdt/godogen | github | Autonomous Godot/Bevy gamedev | gamedev | SKIP |
| coder/claudecode.nvim | github | CC Neovim extension | editor | SKIP (we use VS Code/Cursor) |
| coreyhaines31/marketingskills | github | 23 professional marketing skills (CRO/copy/SEO) | marketing | SKIP (clashes with relational doctrine) |
| steveyegge/gastown | github | Multi-agent workspace w/ persistent identity | orchestration | PRIORITY-B (Steve Yegge is high-signal) |
| dlorenc/multiclaude | github | Multi-agent orchestrator flexible modes | orchestration | PRIORITY-C |
| ComposioHQ/agent-orchestrator | github | Agent-agnostic parallel orchestrator | orchestration | PRIORITY-B |
| nyldn/claude-octopus | github | Run 8 AI models on every task | orchestration | PRIORITY-C |
| RunMaestro/Maestro | github | Agent command center | orchestration | PRIORITY-B |
| stellarlinkco/myclaude | github | Multi-agent across agents | orchestration | PRIORITY-C |
| generalaction/emdash | github | YC W26 agentic dev env | orchestration | PRIORITY-B |
| 21st-dev/1code | github | Orchestration layer | orchestration | PRIORITY-C |
| yehudalevy-collab/polis-protocol | github | Markdown coord protocol multi-vendor teams | orchestration | PRIORITY-A (we author markdown coord; this is canonical) |
| Dicklesworthstone/claude_code_agent_farm | github | 20-50 parallel CC agents | orchestration | PRIORITY-B |
| disler/infinite-agentic-loop | github | Two-prompt parallel spawn | orchestration | PRIORITY-B |
| ratamaha-git/agency-os | github | AI agency from Notion board | orchestration | PRIORITY-C |
| Yeachan-Heo/oh-my-claudecode | github | Teams-first multi-agent | orchestration | PRIORITY-B |
| bfly123/claude_code_bridge | github | Real-time multi-AI collab bridge | orchestration | PRIORITY-C |
| michaelshimeles/ralphy | github | Bash Ralph setup | autonomy | PRIORITY-C |
| subsy/ralph-tui | github | TUI on Ralph loop | autonomy | PRIORITY-C |
| smtg-ai/claude-squad | github | Manage multi-CC terminal agents | orchestration | PRIORITY-B |
| avelikiy/great_cto | github | Multi-agent SDLC w/ 34 specialist reviewers | orchestration | PRIORITY-B |
| wrsmith108/varlock-claude-skill | github | Secure env var management | security | PRIORITY-A (we have kv_store, this is local hardening) |
| mukul975/Anthropic-Cybersecurity-Skills | github | 754 structured cybersec skills | security | PRIORITY-B |
| vercel-labs/deepsec | github | Security harness finding vulnerabilities | security | PRIORITY-A (Vercel is on our stack) |
| SimoneAvogadro/android-reverse-engineering-skill | github | Android reverse engineering | security | SKIP |
| gadievron/raptor | github | Offensive/defensive sec agent | security | PRIORITY-C |
| LoRexxar/Kunlun-M | github | OSS static scanner PHP/JS | security | PRIORITY-C |
| BehiSecc/awesome-claude-skills | github | Sec-focused curation | meta | PRIORITY-C |
| cognyai/claude-code-marketing-skills | github | 5 free marketing skills | marketing | SKIP (relational doctrine) |
| nowork-studio/toprank | github | SEO/SEM/Google Ads plugin | marketing | SKIP |
| salespeak-ai/buyer-eval-skill | github | B2B vendor evaluation | sales | PRIORITY-C |
| clockless-org/html-anything | github | Turn files → polished single-file HTML (16 designs, 34 parsers) | content | PRIORITY-A (replaces marketing graphic-on-feeds with deep artefacts) |
| AgriciDaniel/claude-ads + claude-seo + geo-seo | github | SEO/ads skills | marketing | SKIP |
| op7418/guizang-ppt-skill | github | HTML slide decks | content | PRIORITY-B |
| nexu-io/open-design | github | Local-first design alternative (19 skills, 71 design systems) | design | PRIORITY-A (design-system-architect equivalent for Ecodia branding) |
| alchaincyf/huashu-design | github | HTML-native design w/ MP4 export | design | PRIORITY-C |
| ZSeven-W/openpencil | (truncated source) |. |. | unknown |

---

## 23. PLUGIN MARKETPLACES (third-party)

Beyond official Anthropic marketplace, these can be added with `/plugin marketplace add <repo>`:

| Marketplace | URL | Plugins/Skills | Notes | Rating |
|---|---|---|---|---|
| davila7/claude-code-templates | npx aitmpl | 423 agents + 341 commands + 3156 skill files + 13 MCPs + hooks | The largest single source | PRIORITY-A |
| EveryInc/compound-engineering-plugin | github | Compound engineering | Cross-platform (CC + Cursor + Codex + Copilot) | PRIORITY-B |
| nizos/tdd-guard | github | TDD enforcement | hooks | PRIORITY-B |
| wshobson/agents | github | 100 agents in 80 plugins | High quality | PRIORITY-A |
| wshobson/commands | github | 57 commands | Pairs w/ agents | PRIORITY-B |
| jeffallan/claude-skills | github | 66 fullstack skills + 9 plugins | Cross-platform | PRIORITY-B |
| obra/superpowers | github | Geoffrey Huntley canonical bundle | PRIORITY-A |
| trailofbits/skills | github | 22 security skills | PRIORITY-A |
| fcakyon/claude-codex-settings | github | Cross-platform 20+ plugins | Selective install | PRIORITY-A |
| anthropics/skills | github | 18 official | DUP frontend-design already installed | PRIORITY-A |
| undeadlist/claude-code-agents | github | 24 audit/QA/deploy subagents | Stack overlap w/ Co-Exist | PRIORITY-B |
| K-Dense-AI/scientific-agent-skills | npx | 135 scientific | SKIP unless future client |
| netresearch/claude-code-marketplace | github | 40 TYPO3 + DevOps + security skills | Niche | PRIORITY-C |
| ai-tdg/claude-code-marketplace (BehiSecc and others) | various | Sec-focused | PRIORITY-C |
| secondsky/claude-code-skills (via claudepluginhub) | various | Branded skills | PRIORITY-B |
| jarrodwatts/claude-hud | github | THE statusline | PRIORITY-A |
| Owloops/claude-powerline | github | Powerline statusline | PRIORITY-A |
| Talieisin/britfix | github | British English | PRIORITY-A |
| heyclau.de | site | 385+ items meta-directory | discovery | PRIORITY-A |
| aitmpl.com | site | davila7 web UI | discovery | PRIORITY-A |
| claudemarketplaces.com | site | 6,700+ skills + 2,500+ marketplaces + 840+ MCPs | discovery | PRIORITY-A |
| claudepluginhub.com | site | Plugin hub | discovery | PRIORITY-B |

---

## 24. EXTERNAL FRAMEWORKS (not plugin-installable, separate products)

| Name | URL | Stars | Notes | Rating |
|---|---|---|---|---|
| SuperClaude_Framework | github | 22.8k | pipx-install; separate from plugin model | PRIORITY-B (cherry-pick concepts) |
| ruvnet/ruflo (claude-flow) | github | 52.8k | Full swarm framework | PRIORITY-C |
| Doriandarko/claude-engineer | github | 11.2k | Standalone agent (not CC) | SKIP |
| affaan-m/everything-claude-code (ECC) | github | inflated | Full harness; conflicts w/ our conductor | PRIORITY-C as bundle, A as mining source |
| automazeio/ccpm | github | 8.1k | Spec-driven PM skill | PRIORITY-B |

---

## 25. FRAMEWORK / DISCIPLINE TARGETS (intellectual frameworks; the tools live elsewhere)

| Discipline | Source | Notes |
|---|---|---|
| Compound Engineering | EveryInc | 80/20 plan-vs-execute. Maps to our codify-at-the-moment |
| Spec-Driven Dev (SDD) | NeoLabHQ context-engineering-kit + ccpm | Arc42 standard adapted for LLMs |
| Subagent-Driven Dev (SADD) | NeoLabHQ | /do-and-judge, /do-in-parallel, /do-competitively. Direct map to dispatch_worker. |
| First Principles Framework (FPF) | NeoLabHQ | Hypothesis-driven w/ evidence decay |
| Kaizen / Five Whys / Fishbone | NeoLabHQ | /why, /root-cause-tracing, /cause-and-effect |
| RIPER-5 | tony/claude-code-riper-5 | Research/Innovate/Plan/Execute/Review enforcement |
| Ralph Wiggum | Geoffrey Huntley | Autonomous loop until spec fulfilled. Official Anthropic plugin exists. |
| TDD Guard | nizos | RED-GREEN-REFACTOR enforcement at hook layer |
| Compound Engineering | EveryInc | "Each unit makes subsequent ones easier" |

---

## 26. DUPLICATES vs CURRENT INVENTORY

| Current install | Duplicates in this catalogue |
|---|---|
| frontend-design plugin | anthropics/skills frontend-design, fcakyon frontend-design-skills |
| supabase plugin | davila7 supabase-* commands (different - keep both), fcakyon supabase-skills (DUP) |
| context7 plugin | davila7 commands/setup/context7 agent (DUP), context7-auto-research skill |
| security-guidance plugin | davila7 security/* agents (different scope), trailofbits/skills (different focus - both valuable) |
| commit-commands plugin | davila7 git-workflow/commit (DUP), wshobson git-workflow command (DUP) |
| checkpoint skill | None in unofficial - our skill is original |
| codebase-orient skill | partial overlap w/ avifenesh /onboard, ECC strategic-compact |
| listener-health skill | None - our skill is original |
| pattern-surface skill | partial overlap w/ TÂCHES /audit-skill |
| session-orient skill | partial overlap w/ ECC strategic-compact, wshobson context-restore |
| sms-tate skill | None - original |
| the-humanizer skill | overlap w/ VoltAgent ai-writing-auditor (DUP - but ours is tuned) |
| visual-recent skill | None - original |
| typescript-lsp plugin (disabled) | bartolli typescript-hooks, davila7 typescript-* agents, VoltAgent typescript-pro |
| plugin-dev plugin (disabled) | fcakyon anthropic-plugin-dev, TÂCHES Create *, ECC writing-skills |
| claude-code-setup plugin (disabled) | obra writing-skills, TÂCHES Create Skills/Subagents/Hooks |

---

## 27. EXECUTIVE TOP-20 PRIORITY-A INSTALLS (synthesised)

Ranked by Ecodia-stack load-bearing value:

1. **jarrodwatts/claude-hud**. Canonical CC statusline. Context bar + git + tool/agent/todo lines. `/plugin marketplace add jarrodwatts/claude-hud && /plugin install claude-hud`.
2. **davila7/claude-code-templates** (marketplace). `npx claude-code-templates@latest` + selective: `--mcp database`, `--agent supabase-schema-architect`, `--agent supabase-realtime-optimizer`, `--agent neo4j-docker-client-generator`, `--command supabase-security-audit`, `--command vercel-deploy-optimize`, `--agent screenshot-ui-analyzer`.
3. **wshobson/agents** (marketplace). `/plugin marketplace add wshobson/agents` then selective install: vector-database-engineer (pgvector), fastapi-pro, ios-developer, mobile-security-coder, threat-modeling-expert, tdd-orchestrator, observability-engineer, c4-* (4 architecture diagram agents), payment-integration.
4. **obra/superpowers**. `/plugin install superpowers@claude-plugins-official`. Canonical narrow-deep bundle: brainstorming, writing-plans, executing-plans, using-git-worktrees, test-driven-development, verification-before-completion, requesting-code-review, receiving-code-review, subagent-driven-development, dispatching-parallel-agents, systematic-debugging, finishing-a-development-branch.
5. **anthropics/skills**. `/plugin marketplace add anthropics/skills` then install: claude-api (canonical SDK guidance for our MCP authoring), mcp-builder, webapp-testing (Co-Exist regression), docx + pdf + pptx + xlsx (Tate-deliverables-pdf-only doctrine).
6. **trailofbits/skills** (security selective). `/plugin marketplace add trailofbits/skills` then install: differential-review, insecure-defaults, supply-chain-risk-auditor, agentic-actions-auditor.
7. **fcakyon/claude-codex-settings** (selective). `/plugin marketplace add fcakyon/claude-codex-settings`, install: intelligent-compact, react-skills, web-performance-skills, stripe-skills, python-skills, agent-browser.
8. **Talieisin/britfix**. Australian English alignment (we're Brisbane). `git clone` to hooks dir. Routes American → British spelling at write time.
9. **VoltAgent/awesome-claude-code-subagents** (file-level pull). `git clone https://github.com/VoltAgent/awesome-claude-code-subagents ~/.cache/agents-volt && cp ~/.cache/agents-volt/categories/{02-language-specialists/{fastapi-developer,postgres-pro,swift-expert,react-specialist,typescript-pro},05-data-ai/postgres-pro,07-specialized-domains/payment-integration,04-quality-security/{accessibility-tester,ui-ux-tester},06-developer-experience/mcp-developer}.md ~/.claude/agents/`.
10. **glittercowboy/taches-cc-resources (TÂCHES)**. `/plugin marketplace add glittercowboy/taches-cc-resources`. Auditor agents (audit our 245+ patterns) + 12 thinking-model `/consider:*` commands (pure CEO-loop value-add).
11. **NeoLabHQ/context-engineering-kit (SADD subset)**. `/plugin install subagent-driven-development@NeoLabHQ/context-engineering-kit`. /do-and-judge + /do-in-parallel + /do-competitively + /tree-of-thoughts + /judge-with-debate. Direct dispatch_worker upgrade.
12. **diet103/claude-code-infrastructure-showcase**. Hook patterns that ensure Claude uses skills intelligently. Read source; port patterns into our 22 ecodia-hooks dir.
13. **Piebald-AI/claude-code-system-prompts**. Mirror of CC system prompt + builtin tool descriptions. Reference for understanding why CC behaves as it does. `git clone` to a local docs mirror.
14. **vaporif/parry**. Prompt injection scanner via hooks. Tate flagged this as a gap. `git clone`, wire to PreToolUse on stream/inbox writes.
15. **ldayton/Dippy**. AST-based bash auto-approve. Replaces coarse allowlist gating. `brew tap ldayton/dippy && brew install dippy` (Windows alt: clone + Python port).
16. **bartolli/claude-code-typescript-hooks**. TS compile + ESLint + Prettier w/ SHA256 cache. Wire for Co-Exist + Roam + Sidequests. `git clone` + add to settings.json.
17. **aannoo/claude-hook-comms (hcom)**. Canonical subagent inbox. Read source, compare with our coord-bus, port any missing patterns (collision detection on co-edited files is the standout).
18. **clockless-org/html-anything**. Turn files → polished single-file HTML (16 designs, 34 parsers). Replaces broadcast graphic-on-feeds marketing slop with deep artefacts (relational doctrine fit). `/plugin marketplace add clockless-org/html-anything`.
19. **affaan-m/everything-claude-code** (selective skills only, NOT the harness). Cherry-pick: cost-aware-llm-pipeline, skill-stocktake, beforeMCPExecution audit-log hook pattern, social-graph-ranker + connections-optimizer (relational marketing fit).
20. **conorluddy/ios-simulator-skill**. iOS Simulator automation w/ 21 production scripts. Co-Exist iOS dev. `git clone` to skills dir.

---

## 28. NEAR-MISS (PRIORITY-B / -C). INSTALL LATER IF GAP SURFACES

- ThibautMelen/agentic-workflow-patterns (reference)
- ericbuess/claude-code-docs (offline docs mirror)
- Astro-Han/claude-pace (rate-limit burn-rate statusline. useful given our 20B/wk budget)
- Owloops/claude-powerline (alternative statusline)
- automazeio/ccpm (spec-driven PM)
- nicobailon/visual-explainer (rich HTML for Tate deliverables)
- voidborne-d/sober-coding (27 quality rules x 7 dimensions)
- twostraws/SwiftUI-Agent-Skill (Co-Exist is Capacitor; Swift-adjacent only)
- coleam00/excalidraw-diagram-skill (we lack diagram primitive)
- avifenesh/agentsys (mine /agnix + /skill-curator + /banthis)
- garrytan/gstack (startup leadership; Tate is founder)
- antfu/skills (high-signal author)
- addyosmani/agent-skills (web perf authority)
- yehudalevy-collab/polis-protocol (markdown coord protocol)
- wrsmith108/varlock-claude-skill (env var hardening)
- vercel-labs/deepsec (Vercel security; we deploy there)
- phiat/claude-esp (debug CC hidden output)
- nexu-io/open-design (design system substrate for Ecodia brand)
- nimbalyst (Crystal successor. evaluate vs dispatch_worker)
- nielsgroen/claude-tmux (alternative parallel manager)
- steveyegge/gastown (Steve Yegge is high-signal)
- jawwadfirdousi/agent-skills (read-only-postgres. safer query path)
- alonw0/web-asset-generator (Co-Exist + ecodia.au assets)

---

## 29. SKIP. explicitly not worth time

- coreyhaines31/marketingskills (clashes w/ relational doctrine. every funnel/CRO/copywriting skill is the wrong shape per feedback_two_channel_marketing_doctrine + outbound_marketing_shape_is_off)
- cognyai/claude-code-marketing-skills, AgriciDaniel/claude-ads/claude-seo/geo-seo, nowork-studio/toprank (same reason)
- K-Dense-AI/claude-scientific-skills as bundle (no current client need; install individual skills only if Co-Exist conservation data work justifies)
- Crystal (deprecated)
- Omnara (archived)
- Doriandarko/claude-engineer (standalone framework that runs outside CC)
- ruvnet/ruflo as full framework (fights our conductor architecture; mine concepts only)
- dazuiba/CCNotify (macOS only; Corazon is Windows)
- Claudable, SimoneAvogadro/android-RE, IvanMurzak/Unity-MCP, htdt/godogen, coder/claudecode.nvim (out of stack)
- robertguss Book Factory, dreamiurg mountaineering, gmod-addon-maker, sports/footballbin-predictions (niche)

---

## 30. META-DOCTRINE EMERGED FROM THE SURVEY

1. **The plugin-marketplace primitive is now the canonical install path.** `/plugin marketplace add <org/repo>` + `/plugin install <name>@<marketplace>` is the load-bearing 2-call sequence. Anything older (git clone into ~/.claude/agents/) is legacy. Audit our own pattern infrastructure: should we publish `~/ecodiaos/patterns/` as a CC marketplace internally? Tate's patterns + Volt's frontmatter triggers + a CSV index could ship.
2. **Substrate convergence is happening.** Cross-platform plugins (CC + Cursor + Codex + Copilot + Gemini + OpenCode + Antigravity) are now standard. Our hooks-only approach is narrow; consider whether we want our doctrine to surface in Cursor + Codex sessions Tate occasionally drives.
3. **The dispatch_worker primitive has canonical equivalents.** NeoLabHQ's /do-in-parallel + /do-competitively + /tree-of-thoughts + /judge-with-debate are the same shape as our coord-bus dispatched workers, with judge-with-debate as a new pattern we don't have. Port concept.
4. **Marketing aggregators are overwhelmingly broadcast-shaped.** Every marketing/SEO/CRO skill pack we surveyed assumed funnel/lead-gen. Our two_channel_marketing_doctrine (EcodiaOS-talks-to-itself + Tate-IRL-relationship) means we genuinely cannot install any of these. The relational shape is rare in the ecosystem. That makes it an Ecodia-distinctive advantage rather than a gap to fill.
5. **Statuslines are a 1st-class CC primitive we have not adopted.** jarrodwatts/claude-hud (23.1k stars) is the canonical one. With our 20B/wk budget rule + context-pulse doctrine, a statusline showing context % + budget burn + active forks would surface load-bearing data Tate currently has no view of.
6. **Hook patterns from the ecosystem we don't have:** AST-based bash auto-approve (Dippy), prompt-injection-scan-on-prompt-submit (parry), beforeMCPExecution + afterMCPExecution audit logging (ECC AgentShield), TDD enforcement at write-time (tdd-guard), TypeScript compile+lint+format at edit-time w/ hash cache (bartolli's), hcom-style co-edit collision detection.
7. **Mining > installing** for many of these. Our 22 ecodia-hooks + 245+ patterns are competitive with most published bundles; the value is in their specific implementations of patterns we have abstract versions of. Read first, port second, install only what genuinely fills a hole.

---

## END OF CATALOGUE
