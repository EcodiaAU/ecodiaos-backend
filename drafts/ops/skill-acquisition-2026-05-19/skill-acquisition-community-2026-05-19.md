---
title: Community Claude Code Arsenal Acquisition - Curated Install List
date: 2026-05-19
audience: Tate
authored_by: EcodiaOS conductor (money@)
status: research-only, no installs performed
---

# Community Claude Code Arsenal - 2026-05-19

## Current Installed State (baseline)

- Skills (8 custom): checkpoint, codebase-orient, listener-health, pattern-surface, session-orient, sms-tate, the-humanizer, visual-recent
- Agents (~/.claude/agents/): zero
- Plugins enabled: context7, security-guidance, supabase, commit-commands
- Hooks: 14 custom under ~/.claude/hooks/ecodia/ (em-dash detector, cred-mention surface, status-board write surface, observer-signal emitter, etc.)

## Stack relevance filter

Node + Python/FastAPI backend, React + Capacitor mobile, Supabase Postgres, Vercel, Stripe + Xero, Zernio social, iOS + Android release, Chrome CDP automation, claude.ai Routines.

Bar: "would Tate notice this missing in a god-tier ops session?" Not "neat."

Marketing-channel constraint: per `feedback_two_channel_marketing_doctrine_2026-05-18` we are RELATIONAL not broadcast. Almost every "marketing/SEO/growth/copywriting" agent in the ecosystem is anti-doctrine. Skip aggressively.

---

## TIER S: PRIORITY-A (install no matter what)

### S1. wshobson/agents -> `python-development` plugin
- URL: https://github.com/wshobson/agents/tree/main/plugins/python-development
- Stack fit: backend is FastAPI + Python. Ships `fastapi-pro`, `python-pro`, `django-pro` agents + 16 Python skills (async-python-patterns, python-anti-patterns, python-background-jobs, python-code-style, python-configuration, python-design-patterns, python-error-handling, python-observability, python-packaging, python-performance-optimization, python-project-structure, python-resilience, python-resource-management, python-testing-patterns, python-type-safety, uv-package-manager).
- Duplicate? No - we have zero Python doctrine in the agent layer.
- Install: `/plugin marketplace add wshobson/agents && /plugin install python-development`
- Recommendation: **INSTALL** - `fastapi-pro` + the 16 skills are the single biggest backend-quality lever in the catalog.

### S2. wshobson/agents -> `javascript-typescript`
- URL: https://github.com/wshobson/agents/tree/main/plugins/javascript-typescript
- Ships: `javascript-pro`, `typescript-pro` agents + skills (javascript-testing-patterns, modern-javascript-patterns, nodejs-backend-patterns, typescript-advanced-types).
- Stack fit: Node backend + everything frontend/extension/laptop-agent code is TS/JS.
- Install: `/plugin install javascript-typescript`
- Recommendation: **INSTALL** - covers the language we use most.

### S3. wshobson/agents -> `frontend-mobile-development`
- URL: https://github.com/wshobson/agents/tree/main/plugins/frontend-mobile-development
- Ships: `frontend-developer`, `mobile-developer` agents + skills (nextjs-app-router-patterns, react-native-architecture, react-state-management, tailwind-design-system).
- Stack fit: Co-Exist + Roam + Sidequests + EcodiaOS frontends. Capacitor is React-shell so React-native architecture skill transfers.
- Install: `/plugin install frontend-mobile-development`
- Recommendation: **INSTALL**.

### S4. wshobson/agents -> `multi-platform-apps`
- URL: https://github.com/wshobson/agents/tree/main/plugins/multi-platform-apps
- Ships: `backend-architect`, `flutter-expert`, `frontend-developer`, `ios-developer`, `mobile-developer`, `ui-ux-designer` + `multi-platform` command.
- Stack fit: Co-Exist iOS + Android pipeline. The `ios-developer` agent is the load-bearing one - we have zero codified iOS doctrine in the agent layer.
- Install: `/plugin install multi-platform-apps`
- Recommendation: **INSTALL** - the iOS-developer agent alone justifies this.

### S5. wshobson/agents -> `payment-processing`
- URL: https://github.com/wshobson/agents/tree/main/plugins/payment-processing
- Ships: `payment-integration` agent + 4 skills (billing-automation, paypal-integration, pci-compliance, stripe-integration).
- Stack fit: Stripe is our entire client billing pipeline. We already have Xero/bookkeeping MCP but zero Stripe doctrine.
- Install: `/plugin install payment-processing`
- Recommendation: **INSTALL**.

### S6. wshobson/agents -> `database-design` + `database-cloud-optimization` + `database-migrations`
- URL: https://github.com/wshobson/agents/tree/main/plugins/database-design
- Ships: `database-architect`, `database-optimizer`, `database-admin`, `sql-pro`, `cloud-architect` agents + `postgresql` skill + `sql-migrations` + `migration-observability` commands.
- Stack fit: Supabase Postgres is the state substrate. Every fork that hits the DB benefits.
- Install: install all three plugins.
- Recommendation: **INSTALL** all three. The migrations one is high-value given our Edge Function + migration cadence on Co-Exist.

### S7. wshobson/agents -> `backend-api-security`
- URL: https://github.com/wshobson/agents/tree/main/plugins/backend-api-security
- Ships: `backend-architect` + `backend-security-coder` agents.
- Stack fit: Every API route on the VPS + every Edge Function.
- Install: `/plugin install backend-api-security`
- Recommendation: **INSTALL**.

### S8. wshobson/agents -> `comprehensive-review`
- URL: https://github.com/wshobson/agents/tree/main/plugins/comprehensive-review
- Ships: `architect-review`, `code-reviewer`, `security-auditor` agents + `full-review` + `pr-enhance` commands.
- Stack fit: Conductor still ships code regularly even with forks-as-tabs. Doctrine says "verify deployed state against narrated state" - a structured `code-reviewer` agent is a force multiplier.
- Install: `/plugin install comprehensive-review`
- Recommendation: **INSTALL**.

### S9. wshobson/agents -> `error-debugging` + `debugging-toolkit`
- URL: https://github.com/wshobson/agents/tree/main/plugins/error-debugging
- Ships: `debugger`, `error-detective`, `dx-optimizer` agents + commands (error-analysis, error-trace, smart-debug).
- Stack fit: Replaces ad-hoc "let me look at the logs" loops we still do too often.
- Install: `/plugin install error-debugging` and `/plugin install debugging-toolkit`.
- Recommendation: **INSTALL** both - small overlap, high value.

### S10. wshobson/agents -> `incident-response`
- URL: https://github.com/wshobson/agents/tree/main/plugins/incident-response
- Ships: `incident-responder`, `devops-troubleshooter`, plus existing reviewer/debugger/test-automator agents + `incident-response` command + 3 skills (incident-runbook-templates, on-call-handoff-patterns, postmortem-writing).
- Stack fit: postmortem-writing is exactly what `feedback_codify_world_model_corrections_same_turn` asks of us. Codifies a posture we keep reinventing.
- Install: `/plugin install incident-response`
- Recommendation: **INSTALL**.

### S11. obra/superpowers (94K stars, official Anthropic marketplace acceptance)
- URL: https://github.com/obra/superpowers
- Ships 13 meta-skills: test-driven-development, systematic-debugging, verification-before-completion, brainstorming, writing-plans, executing-plans, dispatching-parallel-agents, requesting-code-review, receiving-code-review, using-git-worktrees, finishing-a-development-branch, subagent-driven-development, writing-skills.
- Stack fit: `dispatching-parallel-agents` + `subagent-driven-development` directly maps to our `cowork.dispatch_worker` model. `verification-before-completion` reinforces `verify-deployed-state-against-narrated-state`. `using-git-worktrees` reinforces `stage-worktree-before-factory-dispatch`. `writing-skills` is meta-doctrine that helps every future skill we author.
- Duplicate? Partial overlap with EcodiaOS doctrine but encoded as ACTIVE skill rather than passive pattern file. That's the substrate-driven-recursive-improvement principle in action.
- Install: `/plugin install superpowers@claude-plugins-official`
- Recommendation: **INSTALL** - highest leverage skill bundle in the entire ecosystem.

---

## TIER A: PRIORITY-B (Ecodia-adjacent, install in batch 2)

### B1. wshobson/agents -> `security-scanning`
- Ships: `security-auditor` + `threat-modeling-expert` agents + commands (security-dependencies, security-hardening, security-sast) + 5 threat-modeling skills (attack-tree-construction, sast-configuration, security-requirement-extraction, stride-analysis-patterns, threat-mitigation-mapping).
- Use case: pre-client-push gate, especially for client repos (Co-Exist, Roam).
- Recommendation: **INSTALL**.

### B2. wshobson/agents -> `tdd-workflows`
- Ships: `tdd-orchestrator` agent + 4 commands (tdd-cycle, tdd-red, tdd-green, tdd-refactor).
- Use case: when we ship a feature we promised would have tests.
- Recommendation: **INSTALL**.

### B3. wshobson/agents -> `cicd-automation` + `deployment-strategies` + `deployment-validation`
- Ships: `deployment-engineer`, `terraform-specialist`, `cloud-architect`, `kubernetes-architect`, `devops-troubleshooter` agents + skills (deployment-pipeline-design, github-actions-templates, gitlab-ci-patterns, secrets-management).
- Use case: every Vercel deploy + Bitbucket pipelines + factory CI we touch.
- Recommendation: **INSTALL** cicd-automation + deployment-validation. SKIP deployment-strategies (terraform/k8s overhead we don't have).

### B4. wshobson/agents -> `performance-testing-review`
- Ships: `performance-engineer`, `test-automator` agents + commands (ai-review, multi-agent-review).
- Use case: deploy verify gate.
- Recommendation: **INSTALL**.

### B5. wshobson/agents -> `observability-monitoring`
- Ships: `observability-engineer`, `network-engineer` agents + commands (monitor-setup, slo-implement) + skills (distributed-tracing, grafana-dashboards, prometheus-configuration, slo-implementation).
- Use case: we already have listener-tier / kv_store.health.* discipline. This codifies the SLO half.
- Recommendation: **INSTALL** skills only if possible; full plugin if not.

### B6. wshobson/agents -> `accessibility-compliance`
- Ships: `ui-visual-validator` agent + `accessibility-audit` command + 2 skills (screen-reader-testing, wcag-audit-patterns).
- Use case: Co-Exist + Roam are public-facing apps for diverse audiences. WCAG is a real gate.
- Recommendation: **INSTALL**.

### B7. wshobson/agents -> `documentation-generation`
- Ships: `api-documenter`, `docs-architect`, `mermaid-expert`, `reference-builder`, `tutorial-engineer` agents + 3 skills (architecture-decision-records, changelog-automation, openapi-spec-generation).
- Use case: ADR pattern + OpenAPI gen for client deliverables. mermaid-expert is useful for status_board / architecture diagrams.
- Recommendation: **INSTALL**.

### B8. wshobson/agents -> `code-refactoring`
- Ships: `code-reviewer`, `legacy-modernizer` agents + commands (refactor-clean, tech-debt, context-restore).
- Use case: Co-Exist Capacitor codebase has known modernisation lanes.
- Recommendation: **INSTALL** if not already pulled in by S8/B2.

### B9. wshobson/agents -> `llm-application-dev`
- Ships: `ai-engineer`, `prompt-engineer`, `vector-database-engineer` agents + commands (ai-assistant, langchain-agent, prompt-optimize) + 8 skills (embedding-strategies, hybrid-search-implementation, langchain-architecture, llm-evaluation, prompt-engineering-patterns, rag-implementation, similarity-search-patterns, vector-index-tuning).
- Use case: we ARE an LLM app. The `prompt-engineering-patterns` + `llm-evaluation` skills sharpen Routine prompts and observer-trio thresholds.
- Recommendation: **INSTALL**.

### B10. wshobson/agents -> `git-pr-workflows`
- Ships: `code-reviewer` agent + commands (git-workflow, onboard, pr-enhance).
- Use case: Bitbucket client repo PRs, GitHub EcodiaOS PRs.
- Recommendation: **INSTALL**.

### B11. wshobson/agents -> `agent-orchestration`
- Ships: `context-manager` agent + commands (improve-agent, multi-agent-optimize).
- Use case: improve-agent is meta-doctrine for our own skill-authoring loop.
- Recommendation: **INSTALL**.

### B12. wshobson/agents -> `signed-audit-trails`
- Ships: `signed-audit-trails-recipe` skill.
- Use case: every kv_store credential write, every client repo push. Codifies the audit-trail discipline we keep half-implementing in hooks.
- Recommendation: **INSTALL**.

### B13. wshobson/agents -> `data-engineering`
- Ships: `data-engineer` agent + commands (data-driven-feature, data-pipeline) + skills (airflow-dag-patterns, data-quality-frameworks, dbt-transformation-patterns, spark-optimization).
- Use case: marginal. We don't run Airflow/Spark. dbt-transformation-patterns might apply to Supabase-side projection logic.
- Recommendation: **INVESTIGATE-FURTHER** - skip unless dbt becomes load-bearing.

### B14. wshobson/agents -> `conductor` plugin
- Ships: `conductor-validator` agent + 6 commands (implement, manage, new-track, revert, setup, status) + skills (context-driven-development, track-management, workflow-patterns).
- Use case: name collision with EcodiaOS "conductor" terminology. Worth READING the doctrine to see if it overlaps. Likely INVESTIGATE-FURTHER.
- Recommendation: **INVESTIGATE-FURTHER**.

### B15. wshobson/agents -> `ship-mate` plugin
- Ships: `architect`, `implement`, `orchestrate`, `playwright`, `qa`, `review` agents + `setup`/`ship` commands + `scan` skill.
- Use case: another full-workflow orchestrator. Likely overlaps Superpowers.
- Recommendation: **INVESTIGATE-FURTHER**, likely SKIP after Superpowers is in.

---

## TIER B: PRIORITY-C (general utility, install only if context budget allows)

### C1. wshobson/commands (sister repo, ~57 slash commands)
- URL: https://github.com/wshobson/commands
- The /command versions of work covered by plugins. Already pulled in by plugin install if structure is shared. Worth a one-shot clone for the few standalone gems: `accessibility-audit`, `compliance-check`, `deps-audit`, `deps-upgrade`, `cost-optimize`, `incident-response`, `standup-notes`, `pr-enhance`.
- Install: `git clone https://github.com/wshobson/commands ~/.claude/commands` OR `/plugin install claude-code-essentials`.
- Recommendation: **INSTALL** the bundle once plugin-based installs are stable.

### C2. CodyLunders/claude-code-hooks-library (60+ hooks)
- URL: https://github.com/CodyLunders/claude-code-hooks-library
- Categories: Security (12), Quality (11), Git (9), Productivity (8), Logging (7), Notifications (8).
- Direct overlap with our existing 14 hooks. Worth cherry-picking: `Block AWS Key Exposure`, `Block rm -rf /`, `Enforce Conventional Commits`, `Full Audit Trail`, `ESLint After Edit`.
- Install: `git clone ... && ./install.sh --category security`
- Recommendation: **INVESTIGATE-FURTHER**, cherry-pick 5-8 hooks. Do not bulk-install (would clobber our existing hook-stack invariant).

### C3. disler/claude-code-hooks-mastery (hook patterns reference)
- URL: https://github.com/disler/claude-code-hooks-mastery
- Reference implementation rather than a hook bundle. UV-based Python hooks. Notable: `SubagentStart`/`SubagentStop` hooks (we don't have these), `PreCompact` transcript backup.
- Recommendation: **INVESTIGATE-FURTHER** - read for patterns to retrofit into our hook stack. Don't install wholesale.

### C4. rohitg00/awesome-claude-code-toolkit (135 agents aggregator)
- URL: https://github.com/rohitg00/awesome-claude-code-toolkit
- Meta-aggregator. Notable not-elsewhere agents: `Next.js Developer`, `React Native Dev`, `Android Developer`, `Growth Engineer`, `Marketing Analyst`, `Content Strategist`.
- Most overlap with wshobson. Growth/Marketing/Content agents are ANTI-DOCTRINE per `feedback_outbound_marketing_shape_is_off_relational_only`.
- Recommendation: **SKIP** as a bundle. **INVESTIGATE-FURTHER** the `Android Developer` agent specifically if/when we ship a non-Capacitor Android target.

### C5. alirezarezvani/claude-skills (313 skills, 12 domains)
- URL: https://github.com/alirezarezvani/claude-skills
- Notable: 28 C-level advisory skills (CEO/CFO/CMO/CRO/CPO/COO/CHRO/CISO/GC/CDO/CAIO/CCO/VPE), 14 regulatory/compliance skills (ISO 13485, MDR 2017/745, FDA, ISO 27001, GDPR, SOC 2, CAPA), 45 marketing skills (broadcast-shaped, SKIP).
- Stack fit: regulatory bundle is interesting for client work (Co-Exist NSW NPWS interactions, future health-tech). C-level personas are meta-LLM theatre and largely redundant - we ARE the algorithmic manager.
- Recommendation: **INVESTIGATE-FURTHER** the regulatory/compliance subset (GDPR, SOC 2, ISO 27001). SKIP everything else.

### C6. affaan-m/everything-claude-code (ECC, 170K stars)
- URL: https://github.com/affaan-m/everything-claude-code
- 60 agents, 229-231 skills, 75 commands, hooks, rules, MCP configs.
- Most-overlapping mega-bundle. Notable unique-ish skills: `agent-introspection-debugging`, `brand-voice`, `mcp-server-patterns`, `nextjs-turbopack`, `strategic-compact`, `verification-loop`, `eval-harness`, `investor-materials`, `investor-outreach`.
- Risk: 200+ skill bundles balloon model context. The pareto win is 10-15 skills; installing all 229 is anti-pattern.
- Recommendation: **INVESTIGATE-FURTHER** - cherry-pick `mcp-server-patterns`, `verification-loop`, `eval-harness`, `agent-introspection-debugging`, `strategic-compact`. SKIP bulk install.

### C7. hesreallyhim/awesome-claude-code (44K stars meta-list)
- URL: https://github.com/hesreallyhim/awesome-claude-code
- Pure curation. Notable individual finds: `parry` (prompt injection scanner), `TDD Guard` (file-op TDD enforcement), `Trail of Bits Security Skills` (CodeQL/Semgrep).
- Recommendation: **INVESTIGATE-FURTHER** - parry is the only one I'd seriously consider.

---

## EXPLICIT SKIPS

| Resource | Why skip |
|---|---|
| Marketing/SEO/Growth agents (content-marketing, seo-content-creation, customer-sales-automation, growth-engineer) | Anti-doctrine per `feedback_two_channel_marketing_doctrine_2026-05-18` and `feedback_outbound_marketing_shape_is_off_relational_only`. We are relational, not broadcast. The-humanizer is the ONLY copywriting tool we need. |
| brand-landingpage skill | Anti-doctrine per `feedback_leave_the_form_not_change_the_costume`. Landing pages are a default-shape trap. |
| flutter-expert / dotnet / julia / blockchain-web3 / arm-cortex / quantitative-trading / game-development plugins | Off-stack. |
| C-level persona skills (CEO/CFO/CMO etc from claude-skills) | Meta-LLM theatre. We have the Wyoming statute; we don't need a roleplay layer. |
| Claude Scientific Skills / Mountaineering Skills | Off-domain. |
| Most "agent harness" mega-bundles (ECC, claude-skills) installed wholesale | Context bloat. Cherry-pick only. |
| Most generic "ralph" / "harness" / "agent team" workflows | Superpowers covers it cleaner. |

---

## INSTALL ORDER

### Wave 1 (today): the foundation
1. Superpowers - `/plugin install superpowers@claude-plugins-official`
2. wshobson/agents marketplace - `/plugin marketplace add wshobson/agents`
3. python-development, javascript-typescript, frontend-mobile-development, multi-platform-apps, payment-processing
4. database-design, database-cloud-optimization, database-migrations
5. backend-api-security, comprehensive-review

### Wave 2 (after Wave 1 settles, ~24h)
1. error-debugging, debugging-toolkit, incident-response
2. security-scanning, tdd-workflows
3. cicd-automation, deployment-validation, performance-testing-review
4. observability-monitoring, accessibility-compliance
5. documentation-generation, code-refactoring, llm-application-dev, git-pr-workflows, agent-orchestration, signed-audit-trails

### Wave 3 (cherry-pick from C-tier)
1. wshobson/commands bundle for the standalone slash-commands
2. 5-8 hooks from CodyLunders/claude-code-hooks-library
3. `parry` from awesome-claude-code

### Probe / decide later
- conductor plugin (name collision with our doctrine - read first)
- ship-mate plugin (likely subsumed by Superpowers)
- ECC cherry-picks (5 skills max)
- claude-skills regulatory subset (only when a client engagement requires GDPR/SOC2/ISO doctrine)
- Android Developer agent (when non-Capacitor Android target exists)

---

## RISKS / GOTCHAS

1. **Plugin marketplace adds carry their own MCP servers.** Verify on install - we already had `.mcp.json` regressions (commit `3cb39508` disabled project-local ecodia-full to stop code@ permission prompts). Each plugin's `.claude-plugin/marketplace.json` may add a server. Audit after each install.
2. **Skill bundle context cost.** 200+ skills can balloon context windows when grep matches multiple files. Stay disciplined: install plugin-by-plugin, watch token usage per turn, prune.
3. **Hook-stack invariant.** Per backend/CLAUDE.md hook-stack invariant rule - any new hook MUST be probed to exist on disk at session start. Wave 3 hook cherry-picks need wiring through `~/.claude/settings.json` AND the file must be present locally.
4. **Em-dash hook collision.** Our PreToolUse em-dash enforcement is non-negotiable. Any wshobson/CodyLunders hook that runs on Write/Edit needs to run AFTER ours, never instead.
5. **Cost.** Each agent expands the orchestration surface but adds nothing to per-turn cost unless invoked. Skills are heavier - they pre-load into context when matched.

---

## SUCCESS METRIC

A god-tier ops session in 30 days from now (post-install) should look like:
- "Push to Co-Exist client repo" -> auto-surfaces `code-reviewer` + `security-auditor` + `payment-integration` (if Stripe-touched) + `accessibility-audit` (if UI-touched), runs pre-flight, gates push.
- "Help with FastAPI route" -> `fastapi-pro` agent activates with the 16 Python skills as ambient context.
- "Debug listener-tier silence" -> `incident-responder` + `error-detective` + `devops-troubleshooter` run a structured trace instead of ad-hoc log-tail.
- "Plan a multi-fork ship" -> Superpowers `dispatching-parallel-agents` + `writing-plans` produces the brief instead of me freestyling it.
- "Audit Co-Exist Edge Function before deploy" -> `security-auditor` + `threat-modeling-expert` + `compliance-check` run, surface findings, ship or hold.

If after Wave 1+2 we don't see this lift, the install was theater. Tag a P2 status_board row to verify at 30d.
