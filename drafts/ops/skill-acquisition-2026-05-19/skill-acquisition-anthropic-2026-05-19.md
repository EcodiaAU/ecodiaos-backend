# Skill / Plugin Acquisition Audit — Anthropic Official Ecosystem

**Date:** 2026-05-19
**Author:** EcodiaOS conductor (Tate's session)
**Scope:** anthropics/claude-plugins-official (170+ plugins), anthropics/skills (17 official skills), anthropics/anthropic-cookbook (skills patterns), web search for first-party additions.
**Bar:** "Would Tate notice this missing in a god-tier ops session?" — not "neat to have."

---

## Currently Installed (baseline)

**Skills (8):** checkpoint, codebase-orient, listener-health, pattern-surface, session-orient, sms-tate, the-humanizer, visual-recent.
**Plugins enabled (4):** context7, security-guidance, supabase, commit-commands.
**Plugins disabled (4):** frontend-design, typescript-lsp, plugin-dev, claude-code-setup.

---

## Executive Verdict — INSTALL list (8 items, ranked)

1. **plugin-dev** (enable existing) — meta-loop for authoring everything else
2. **claude-md-management** plugin — auto-CLAUDE.md hygiene, replaces the 20:00 cron audit fork
3. **skill-creator** plugin — same-turn pattern codification is core EcodiaOS doctrine
4. **session-report** plugin — usage telemetry for the decision-quality layer
5. **hookify** plugin — Tate's "codify-at-the-moment" rule made mechanical
6. **frontend-design** (enable existing) — Co-Exist + Resonaverde + EcodiaOS frontend
7. **webapp-testing** skill — visual-regression layer hardening (laptop-hands is dormant)
8. **mcp-builder** skill — we author MCP tools constantly; canonical patterns

**SKIP list:** typescript-lsp, claude-code-setup (existing 4 disabled — keep disabled), 95% of vendor plugins.

---

## Section 1 — anthropics/claude-plugins-official Marketplace

Full marketplace has 170+ plugins. Triage below restricted to first-party Anthropic-authored plugins (28 total) plus 3rd-party plugins that intersect our stack.

### Anthropic-authored plugins (28)

| Plugin | Ships | Recommendation | Notes |
|--------|-------|----------------|-------|
| **agent-sdk-dev** | `/new-sdk-app` command, 2 verifier agents (py + ts) | SKIP | SDK forks are dead substrate (2026-05-17 deprecation). Tate doesn't write SDK apps anymore. |
| **claude-code-setup** | `claude-automation-recommender` skill | SKIP (keep disabled) | Read-only analysis tool. We already have stronger doctrine (CLAUDE.md + pattern-surface). Useful for greenfield repos, not ours. |
| **claude-md-management** | `claude-md-improver` skill, `/revise-claude-md` command | **INSTALL** | Direct fit for the 20:00 AEST `claude-md-reflection` cron + session-end hygiene rule. Replaces hand-rolled fork. |
| **clangd-lsp / csharp-lsp / jdtls-lsp / kotlin-lsp / lua-lsp / php-lsp / pyright-lsp / ruby-lsp / rust-analyzer-lsp / swift-lsp / typescript-lsp / gopls-lsp** | Language server integration | SKIP all | We mostly use TS/Python; existing tooling sufficient. typescript-lsp specifically: keep disabled — Claude Code already does fine on TS without it. |
| **code-modernization** | 7 commands (`/modernize-*`), 5 agents (legacy-analyst, business-rules-extractor, architecture-critic, security-auditor, test-engineer) | SKIP | No legacy COBOL/Java monoliths in our stack. Possible future investigate-further if we pick up a legacy modernisation gig. |
| **code-review** | `/code-review` command, 4 parallel agents (CLAUDE.md compliance x2, bug detector, history analyzer) | INVESTIGATE-FURTHER | Overlaps with PR-review-toolkit. We solo-fork to main usually — PR ceremony is mostly skipped. Worth installing on the day we onboard another contributor. |
| **code-simplifier** | Code simplification agent | SKIP | Overlaps `/simplify` skill we already have. |
| **commit-commands** | commit/push/PR workflow | **ALREADY ENABLED** | Keep. Works. |
| **cwc-makers** | Cardputer onboarding | SKIP | Hardware-specific, irrelevant. |
| **explanatory-output-style** | Output style modifier | SKIP | Tate doesn't need explanation; he wants velocity. |
| **feature-dev** | `/feature-dev` command, 3 agents (code-explorer, code-architect, code-reviewer), 7-phase workflow | INVESTIGATE-FURTHER | Heavy-weight workflow. Useful for Co-Exist v2 or new client greenfield. Skip default install; consider per-project. |
| **frontend-design** | `frontend-design` skill (auto-activates) | **INSTALL (enable existing)** | Already on disk disabled. Co-Exist UI redesigns + Resonaverde + EcodiaOS frontend. The "avoid generic AI aesthetics" prompt is exactly what Tate flagged on the ecodia.au redesign arc. |
| **hookify** | `/hookify` + 3 helper commands, hooks/ runtime, writing-rules skill | **INSTALL** | Codifies the "codify-at-the-moment-a-rule-is-stated" doctrine into a mechanical primitive. Rules live as `.claude/hookify.*.local.md`. Direct match for our hook authoring workflow at `~/.claude/hooks/ecodia/`. |
| **learning-output-style** | Interactive output style | SKIP | Same reason as explanatory. |
| **math-olympiad** | Adversarial verification for proofs | SKIP | No math contest work. |
| **mcp-server-dev** | 3 skills: build-mcp-server, build-mcp-app, build-mcpb | **INSTALL (via skill route)** | We author MCP tools weekly (ecodia-full, cowork, coord, etc). Canonical patterns + auth flows + widget templates. Pulls in `skill: mcp-builder` from anthropics/skills. |
| **playground** | `skills/playground` with 4 templates (design-playground, data-explorer, concept-map, document-critique) | INVESTIGATE-FURTHER | Pairs well with auto-preview substrate. Document-critique is interesting for Tate-deliverable PDFs. Not critical. |
| **plugin-dev** | 7 skills (Hook/MCP/Plugin/Settings/Command/Agent/Skill Dev), `/plugin-dev:create-plugin` command, 3 validation agents, 6 utility scripts | **INSTALL (enable existing)** | Already on disk disabled. This is the meta-tool — every other skill we author goes faster with it. Validate-hook-schema.sh + hook-linter.sh directly map to our hook discipline. |
| **pr-review-toolkit** | 6 specialised agents (comment-analyzer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, code-reviewer, code-simplifier) | INVESTIGATE-FURTHER | Strong agent roster, but we don't do PR ceremony on solo-fork repos. Install on the day we open a multi-contributor codebase. silent-failure-hunter and type-design-analyzer are the most generally useful. |
| **ralph-loop** | Self-referential iteration loops | SKIP | We already have `/loop` skill + cowork.dispatch_worker for parallel iteration. |
| **security-guidance** | PreToolUse hook for command injection / XSS / unsafe code warnings | **ALREADY ENABLED** | Keep. |
| **session-report** | `skills/session-report` — HTML report of session usage (tokens, cache, subagents, skills, expensive prompts) from `~/.claude/projects` transcripts | **INSTALL** | Direct match for the decision-quality self-optimization architecture (7-layer telemetry). Surfaces which skills/agents are actually paying off vs dead weight. Read-only on local transcripts. |
| **skill-creator** | `skills/skill-creator` (create / improve / optimize / eval skills) | **INSTALL** | Same-turn pattern codification is core doctrine. Plus eval/benchmark surface = decision-quality telemetry inputs. |

### 3rd-party plugins on our stack (worth checking)

| Plugin | Recommendation | Notes |
|--------|----------------|-------|
| **chrome-devtools-mcp** | INVESTIGATE-FURTHER | Microsoft-authored. Performance traces, network inspection, console with source-mapped stack traces. Could complement our Corazon CDP substrate. Already have 30 cdp.* tools — overlap risk. Check before installing. |
| **playwright** | SKIP | Microsoft Playwright MCP. Our laptop-hands is the canonical visual harness. Webapp-testing skill (below) is the cheaper substitute. |
| **firebase** | SKIP | We're Supabase-only. |
| **supabase** | **ALREADY ENABLED** | Keep. |
| **stripe** | SKIP | We have `bk_*` + Xero MCP scopes via ecodia-full. Stripe MCP plugin would duplicate. |
| **vercel** | SKIP | We have `vercel_*` tools in ecodia-full bearer. |
| **github** | SKIP | Same — covered by ecodia-full and gh CLI. |
| **figma / miro** | SKIP | Tate doesn't drive design systems through these. |
| **postiz** | SKIP | We use Zernio for unified social. |
| **linear / asana / atlassian / notion** | SKIP | status_board IS our PM substrate. Adding these = duplicate seam. |
| **sentry / datadog / posthog** | SKIP | Self-hosted observability via Postgres + Neo4j + observer_signals trio. Adding Sentry would be a new substrate seam we have to maintain. |
| **expo** | INVESTIGATE-FURTHER | Co-Exist is React + Capacitor not Expo. SKIP unless we ever pivot. |
| **revenuecat / rc** | SKIP | No in-app purchase flows yet. (Co-Exist is free; charity-monetised.) |
| **prisma / mongodb / neon / planetscale / cockroachdb / clickhouse / qdrant-skills / pinecone / zilliz** | SKIP all | We're Supabase Postgres + Neo4j. Single source of truth = one DB family. |
| **semgrep / aikido / 42crunch / nightvision** | SKIP | Security-guidance plugin (already on) is sufficient for our risk surface. |
| **sourcegraph / greptile / serena** | SKIP | codebase-awareness MCP + codebase-orient skill cover us. |
| **remember** | INVESTIGATE-FURTHER | "Continuous memory for Claude Code, tiered daily logs". We have Neo4j + auto-memory + status_board. Risk: another memory seam. Skip default. |
| **superpowers** | INVESTIGATE-FURTHER | Community-curated. Unknown surface; investigate the plugin manifest if Tate flags interest. |
| **fakechat / desktop-commander / discord / imessage / telegram / zoom** | SKIP | No fit. |
| **legalzoom** | SKIP | We have separate legal counsel paths. |
| **save-to-spotify** | SKIP | Lol no. |

---

## Section 2 — anthropics/skills Library (17 first-party skills)

| Skill | Recommendation | Notes |
|-------|----------------|-------|
| **algorithmic-art** | SKIP | Generative art p5.js. No business case. |
| **brand-guidelines** | SKIP | Anthropic-branded (Anthropic's own brand). Tate has own brand (Ecodia: no logo, plain copy). Could fork for Ecodia brand but lower priority. |
| **canvas-design** | SKIP | Museum-quality .png/.pdf composition. No business case unless we pitch design-led work. |
| **claude-api** | SKIP | Auto-loaded when working with @anthropic-ai/sdk imports — already in our trigger list. Don't double-load. |
| **doc-coauthoring** | INVESTIGATE-FURTHER | 3-stage doc workflow. Pairs well with auto-preview substrate. Useful for Tate-deliverable PDFs (quotes, briefs, grants). Possible install. |
| **docx** | SKIP | We render to .md → preview tab. No Word workflows. |
| **frontend-design** | **INSTALL via frontend-design plugin (above)** | Same skill, packaged. |
| **internal-comms** | SKIP | Templates for 3P updates, newsletters, FAQs, status reports. Tate doesn't run a team — these templates assume corporate context. |
| **mcp-builder** | **INSTALL via mcp-server-dev plugin (above)** | Canonical reference. We ship MCP routinely. |
| **pdf** | INVESTIGATE-FURTHER | PDF manipulation + form extraction. Useful for invoice/contract workflows. Possible install once Tate flags first concrete use case. |
| **pptx** | SKIP | We don't do PowerPoint. |
| **skill-creator** | **INSTALL via skill-creator plugin (above)** | Same skill, packaged. |
| **slack-gif-creator** | SKIP | No Slack workspace in active use. |
| **theme-factory** | INVESTIGATE-FURTHER | 10 preset themes for HTML/slides/landing pages. Fits with auto-preview substrate. Skip default; revisit on first concrete styling deliverable. |
| **web-artifacts-builder** | SKIP | React + Tailwind + shadcn/ui for claude.ai artifacts. We write to disk → IDE preview. Different render target. |
| **webapp-testing** | **INSTALL** | Playwright-based local webapp testing. Direct complement to our visual-recent / laptop-hands substrate which is currently dormant. Headless mode, networkidle waits, reconnaissance-then-action — exact discipline we need. |
| **xlsx** | INVESTIGATE-FURTHER | Excel manipulation. Co-Exist Excel sync work has been hot recently (collectives migration, Forms alignment). Possible install for sheet-as-projection sync flows. |

---

## Section 3 — anthropic-cookbook scan

Cookbook contains: `/claude_agent_sdk`, `/patterns/agents`, `/managed_agents`, `/tool_use`, `/skills` (with notebooks 01-intro, 02-financial-applications, 03-custom-development).

**No new skill/plugin distribution patterns** beyond what's in anthropics/skills + anthropics/claude-plugins-official. Cookbook is pedagogical, not a distribution surface.

**Useful pattern reference (skip-install but bookmark):** [Frontend Aesthetics Cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb) — referenced by the frontend-design plugin. Tate should skim before next ecodia.au redesign.

---

## Section 4 — Web search findings (first-party additions)

- **anthropics/claude-plugins-community** — Read-only mirror of community plugins. Distribution path for non-official plugins. Worth keeping aware of, no auto-install rule (sometimes a community plugin matches a stack gap better than official). Submit at `clau.de/plugin-directory-submission`.
- **claude-code/plugins** — anthropics/claude-code's bundled plugins (the 13 Anthropic-authored ones). Same source as the official marketplace plugins above. No new finds.
- **Skill Library secondary mirror** (`obviousworks/Claude-AI-skills-collection-2026`) — community curation. Worth a periodic glance, no auto-install.
- **Anthropic engineer's "Skills for Claude Code" guide** (Medium, Tort Mario) — practitioner-level deep-dive on the 17 official skills. Reference-grade; no new installable surfaces.

No first-party additions outside the two repos already audited.

---

## Section 5 — Installation Plan

### Phase 1 — enable existing disabled plugins (zero-friction)

```bash
# In Claude Code:
/plugin enable frontend-design
/plugin enable plugin-dev
# Skip typescript-lsp and claude-code-setup — keep disabled.
```

### Phase 2 — install new plugins from marketplace

```bash
/plugin install claude-md-management@claude-plugins-official
/plugin install hookify@claude-plugins-official
/plugin install session-report@claude-plugins-official
/plugin install skill-creator@claude-plugins-official
/plugin install mcp-server-dev@claude-plugins-official
```

### Phase 3 — install standalone skills (anthropics/skills route)

```bash
# webapp-testing isn't in the marketplace; clone the SKILL.md directly into ~/.claude/skills/
# (or wait for an official plugin wrapper)
mkdir -p ~/.claude/skills/webapp-testing
curl -fsSL https://raw.githubusercontent.com/anthropics/skills/main/skills/webapp-testing/SKILL.md \
  -o ~/.claude/skills/webapp-testing/SKILL.md
# Copy any /scripts and /examples per the SKILL.md instructions.
```

### Phase 4 — quarterly re-audit triggers

Schedule a checkpoint to re-run this audit when:
- anthropics/skills count moves from 17 → 20+
- anthropics/claude-plugins-official adds an "Anthropic-authored: productivity" or "operations" category
- We pick up a new client domain (legal modernisation, embedded ML, etc.)
- Tate flags a recurring failure mode that maps to an existing plugin

---

## Section 6 — Rejections worth narrating

**Why skip code-review / pr-review-toolkit / feature-dev?**
Solo-fork-to-main per `~/ecodiaos/patterns/solo-fork-pushes-to-main-no-pr-ceremony.md`. PR ceremony adds latency without quality signal at our scale. Install the day we onboard another committer.

**Why skip Sentry / Datadog / Linear / Asana / Notion?**
Distributed-state-seam discipline (`~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md`). Every new substrate is a new seam. Postgres + Neo4j + kv_store is enough.

**Why skip remember plugin?**
Same reason. We have three memory substrates already (Neo4j durable, auto-memory machine-local, kv_store ephemeral). A fourth would require a new routing decision per write.

**Why skip 42crunch / aikido / semgrep?**
security-guidance plugin (PreToolUse hook on command injection / XSS / unsafe code) already enabled. Risk surface doesn't yet justify a security SaaS subscription.

---

## Cross-refs

- `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md` — informs the prefer-plugin-over-build calculus throughout.
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` — informs the seam-cost rejections.
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` — informs the hookify + skill-creator INSTALL picks.
- `~/ecodiaos/patterns/recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18.md` — informs the plugin-dev + skill-creator + hookify triad.
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` — informs the session-report INSTALL pick.

---

## Sources

- [anthropics/claude-plugins-official marketplace.json](https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json)
- [anthropics/skills repository](https://github.com/anthropics/skills)
- [anthropics/anthropic-cookbook](https://github.com/anthropics/anthropic-cookbook)
- [anthropics/claude-code marketplace.json](https://github.com/anthropics/claude-code/blob/main/.claude-plugin/marketplace.json)
- [anthropics/claude-plugins-community](https://github.com/anthropics/claude-plugins-community)
- [Anthropic's Free Skills Library guide](https://beginnersinai.org/anthropic-skills-library/)
