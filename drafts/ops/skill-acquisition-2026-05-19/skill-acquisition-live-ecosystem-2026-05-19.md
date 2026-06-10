# Skill Acquisition - Live Ecosystem Sweep (2026-05-19)

Goal: catch artefacts surfacing on forums / dev.to / Medium / substack / personal repos that the awesome-list scrapers will miss.
Author: live-ecosystem research agent.
Scope: 30-90 day window, weighted to 2026.

## How to read the recommendation column

- A = adopt this week. Compounds directly with Ecodia's CDP / cowork / coord-bus / IDE-bridge substrate.
- B = adopt within the month if a worker tab is free. Useful but not load-bearing.
- C = lift the pattern, do not install the artefact (rebuild in our shape).
- SKIP = mainstream enough that other agents will catch, or off-doctrine.

---

## TIER 1 - high-signal, niche, not in awesome-lists

### 1. pasky/chrome-cdp-skill - attach to live Chrome session
- URL: https://github.com/pasky/chrome-cdp-skill
- Provenance: 10 Must-Have Skills article (unicodeveloper Medium, Mar 2026); Chrome DevTools agents docs cross-ref.
- Recency: v1.0.2, 13 March 2026.
- Why it compounds: this is the externalised version of OUR chrome-cdp doctrine (`patterns/chrome-cdp-is-top-primitive-for-gui-gated-work-2026-05-18.md`). pasky published 5 skills that wrap CDP attach-to-live-tab with daemon persistence across commands - exactly the surface we just wired into `cdp.realClick / nativeFill / clickByTag` etc.
- Recommendation: **C** - read the SKILL.md format, lift any helper we are missing (especially network-timing + extract-page-structure). Do NOT install on top of our cdp.js; we already have parity. Worth a same-day diff.
- Install: `pi install git:github.com/pasky/chrome-cdp-skill@v1.0.2` (pi-skill toolchain).
- Other agents miss this: the static lists index "chrome-devtools-mcp" (Anthropic-official) and stop. pasky is the same-shape competitor.

### 2. obra/superpowers - dispatching-parallel-agents + brainstorming
- URL: https://github.com/obra/superpowers (197k stars, v5.1.0 4 May 2026)
- Provenance: emelia.io, vibesparking.com, Pasquale Pillitteri's complete guide. Jesse Vincent (obra) personal blog post originally surfaced it.
- Recency: 4 May 2026 release.
- Why it compounds: `dispatching-parallel-agents` is the canonical pattern for what we just built with `cowork.dispatch_worker` + coord-bus. The `brainstorming` skill is Socratic-refinement-before-code - directly composable with our conductor-pacemaker upgrade lane. `subagent-driven-development` formalises two-stage spec-then-review which our conductor already does informally.
- Recommendation: **A** - install on Ecodia conductor (`/plugin marketplace add obra/superpowers-marketplace` then `/plugin install superpowers`). Audit our existing parallel-dispatch doctrine against `dispatching-parallel-agents` SKILL.md and lift any gap. Add `superpowers:brainstorm` to high-leverage decision arcs.
- The wshobson-curated scrapers WILL catch this. Worth listing here because the SPECIFIC skill files (especially `verification-before-completion` and `using-git-worktrees`) are higher-signal than the parent repo's reputation suggests.

### 3. affaan-m/everything-claude-code - instinct-based learning + AgentShield
- URL: https://github.com/affaan-m/everything-claude-code (182k stars, v2.0.0-rc.1 April 2026)
- Provenance: hesreallyhim/awesome-claude-code, deepwiki, claudefa.st cross-refs.
- Recency: April 2026.
- Why it compounds: `continuous-learning-v2` skill = "instinct-based pattern extraction with confidence scoring" - this is literally what `decision-quality-self-optimization-architecture` doctrine describes us building. AgentShield = 1282-test adversarial security scanner with secrets detection (14 patterns) + hook injection analysis - direct upgrade to the 14 hooks at `~/.claude/hooks/ecodia/`. Cross-harness support means the same pattern files load in Cursor + Codex + Gemini.
- Recommendation: **A** - install on Ecodia conductor with `--profile core` to avoid the 232 skills bloating context. Specifically lift: AgentShield security scanner, continuous-learning-v2 instinct schema, strategic-compaction skill. Diff their hook profile against ours and merge.
- Install: `/plugin install ecc@ecc` (Claude Code marketplace), or `bash <(curl ...)` selective.
- Static lists will surface the parent repo but NOT the instinct-confidence-scoring pattern specifically. That's the load-bearing piece for us.

### 4. mattpocock/skills - tdd / to-prd / to-issues / grill-me / caveman
- URL: github.com/mattpocock/skills (referenced via shareuhack.com agent-fleet article)
- Provenance: shareuhack.com fleet-survival post; mattpocock Twitter; Scott Spence's data (trigger rates 20% -> 84% with deterministic hooks).
- Recency: 2026, active.
- Why it compounds: `grill-me` = exhaustive decision-tree questioning. We already use this informally in pattern-surface skill but mattpocock formalises with phase-gates that PREVENT skipping. `caveman` claims 65-75% token savings - relevant to our 20B/wk budget. `to-prd` -> `to-issues` -> `tdd` chain is the spec-driven path Tate keeps reaching for ad-hoc.
- Recommendation: **B** - install `caveman` and `grill-me` immediately (cheap, high-leverage). The PRD->Issues chain is GitHub-issue-centric so adapt to our status_board substrate before adopting.
- Install: `npx skills@latest add mattpocock/skills`
- Why other agents miss: mattpocock is a TypeScript educator, not a Claude-ecosystem creator - his skills repo flies under the awesome-list radar.

### 5. coleam00/excalidraw-diagram-skill - architecture diagrams from text
- URL: https://github.com/coleam00/excalidraw-diagram-skill (3,148 stars, March 2026)
- Provenance: unicodeveloper Medium top-10; Cole Medin's workshop materials; not on most awesome-lists yet.
- Recency: 1 March 2026.
- Why it compounds: every Ecodia architecture decision currently lives as text + status_board rows. Auto-generated Excalidraw diagrams written to `backend/drafts/*.html` would render via our auto-preview substrate immediately. Direct compose with `auto-preview-md-html-on-write-2026-05-16` doctrine.
- Recommendation: **A** - install on conductor, wire into Decision-write reflex so every architecture Decision auto-renders to a diagram in the IDE preview tab.
- Install: `npx skills add https://github.com/coleam00/excalidraw-diagram-skill --skill excalidraw-diagram`

### 6. coleam00/claude-memory-compiler - evolving project memory
- URL: https://github.com/coleam00/claude-memory-compiler (1,060 stars, April 2026)
- Provenance: Cole Medin's GitHub direct.
- Recency: 6 April 2026.
- Why it compounds: this is the EXACT pattern we run via Neo4j Episodes + auto-memory promotion path. coleam00's implementation is local-only (JSONL + git-versioned), which gives us a fallback path if Neo4j is unavailable. Worth diff-auditing against our `memory-substrate-doctrine-neo4j-vs-auto-memory-2026-05-15` to see if his classifier outperforms ours.
- Recommendation: **C** - lift the classification heuristics, do NOT install the artefact. Our Neo4j substrate is canonical.

### 7. K-Dense-AI/scientific-agent-skills - 133 niche skills
- URL: github.com/K-Dense-AI/scientific-agent-skills (18.9k stars)
- Provenance: growthexe.substack 1116-skill survey, listed as "lesser-known niche".
- Recency: 2026.
- Why it compounds: genomics / drug-binding / molecular-dynamics is off-Ecodia, BUT the skill-authoring DISCIPLINE - 133 narrow skills each <2KB SKILL.md - is the model we should copy for ecodiaos-internal doctrine. Each pattern file becomes a SKILL.md with `disable-model-invocation: false` and the trigger frontmatter.
- Recommendation: **C** - lift the file-shape, do not install. We have 245+ pattern files; converting them to canonical SKILL.md format makes them auto-discoverable by Claude Code's Skill tool.

### 8. obviousworks/Claude-AI-skills-collection-2026 - curated meta-collection
- URL: github.com/obviousworks/Claude-AI-skills-collection-2026
- Provenance: dev search results, not yet on awesome-claude-code.
- Recency: 2026.
- Why it compounds: another meta-collection like wshobson/agents and rohitg00/awesome-claude-code-toolkit. Listed for completeness; lower signal than the others.
- Recommendation: **SKIP** unless wshobson/affaan-m/obra coverage misses something obvious.

### 9. browserbase/skills - cookie-sync + persistent browser context
- URL: https://github.com/browserbase/skills (3.3k stars)
- Provenance: chrome-cdp ecosystem search, mcpmarket.com.
- Recency: actively maintained.
- Why it compounds: `cookie-sync` skill bridges local Chrome cookies to a persistent cloud session - this is the inverse of our Corazon-attach pattern, useful when we want a routine to drive a logged-in flow WITHOUT Tate's laptop. Direct unlock for routines that hit Stripe/Vercel/ASC outside Corazon attach window.
- Recommendation: **B** - install on `code@` Routine account. Worth a 1h spike to see if cookie-sync gets us out of "Tate's laptop must be on" dependency for some routines.
- Install: `npx skills add browserbase/skills`

### 10. CodyLunders/claude-code-hooks-library - 55 hooks
- URL: https://github.com/CodyLunders/claude-code-hooks-library
- Provenance: dev search; 2 stars but the content is high-signal.
- Recency: 2026.
- Why it compounds: 55 hooks across security/quality/git/productivity/logging/notifications. Most overlap our 14 ecodia hooks but several DON'T - specifically: subagent-lifecycle-tracking hooks, multi-tool quality gates (lint-on-edit, not lint-on-commit), and the secret-pattern-scanner with AWS AKIA detection. The "exit 2 as synchronous gatekeeper" pattern is exactly our em-dash blocker shape.
- Recommendation: **B** - clone the repo, diff against `~/.claude/hooks/ecodia/`, port the 5-10 high-leverage gaps. Do NOT run `./install.sh --all` (would clobber).

---

## TIER 2 - platform features I should adopt as new skill classes

These are 2026 Claude Code platform releases that ENABLE new skill/agent classes we are not yet exploiting. Static-list agents will not surface these as actionable.

### A. Background monitors (`monitors` manifest key, v2.1.105)
- What it is: plugins can ship background watchers that auto-arm at session start or on skill invoke.
- Why it compounds: this is the missing piece for our dormant listener-tier. Instead of standing up a separate file-watcher daemon, the monitors live INSIDE a Claude Code plugin and fire `Skill` invocations.
- Recommendation: **A** - rewrite the dormant `backend/listener-tier/` as a plugin-shaped monitors manifest. Replaces the PM2-daemon-not-running problem with a substrate Claude Code already supervises.

### B. PreCompact hook with `{"decision":"block"}` (v2.1.105)
- What it is: hooks can now block context compaction.
- Why it compounds: protect our `<working_set>` and `<doctrine_surface>` blocks from compaction loss. Our 1500-byte cap on `<working_set>` won't survive compaction without a PreCompact rule.
- Recommendation: **A** - ship a PreCompact hook on the conductor that snapshots `<working_set>` + active fork rollup to `kv_store.ceo.precompact_snapshot.<ts>` before allowing compaction.

### C. Skill tool inside subagents (v2.1.108) + `mcp_tool` hook type
- What it is: subagents can now discover and invoke built-in commands via Skill tool; hooks can invoke MCP tools directly.
- Why it compounds: our `cowork.dispatch_worker` workers can now call `/security-review` or `/review` natively without us teaching them. And our em-dash hook could call `mcp__supabase__db_execute` directly to log the breach to status_board.
- Recommendation: **A** - retrofit the dispatch_worker spawn to advertise the Skill tool surface in the worker's brief.

### D. `/goal` command + Agent View (v2.1.139, 11 May 2026)
- What it is: outcome-conditioned autonomous loops + multi-session dashboard.
- Why it compounds: `/goal` is the cleanest version of our checkpoint primitive - Claude keeps working until a condition is met. Agent View replaces the manual Ctrl+Alt+Shift+C tab tracking with a built-in dashboard.
- Recommendation: **A** - test `/goal` on the next multi-hour autonomous arc (Tate's email-triage cron, the marketing-cadence-monitor routine). May obsolete parts of our coord-bus inbox check pattern.

### E. Tool-result content blocks (decorator pattern)
- What it is: tools can return structured content blocks alongside text. UI automation tooling framework hinted at in changelog.
- Why it compounds: our cdp.* tools return text + base64 image. Decorator content blocks let us return structured rectangles + tagged elements that the next tool call can index by reference - dropping cdp screenshot-then-grep-the-DOM round-trips.
- Recommendation: **B** - revisit our cdp.js return shape in 4-6 weeks once the decorator API stabilises.

---

## TIER 3 - directories to monitor, not adopt

- **VoltAgent/awesome-agent-skills** (16.4k stars, 1000+ skills) - meta-directory.
- **claudemarketplace.com** + **claudeskills.info** + **claudemarketplaces.com** + **skillsmp.com** - marketplaces. High noise.
- **skills.sh** + **aitmpl.com/skills** + **agentskills.io** (the open standard).
- **Antigravity Awesome Skills** (22k stars, v7.3.0) - "1,234+ cross-compatible skills" directory.

Recommendation: **SKIP** as a bulk install target. Reactive grep when a specific need arises.

---

## TIER 4 - paid / off-doctrine

- **computer-agents.com** - cloud-hosted CC alternative, iOS app. SKIP, we have Corazon + Tailscale.
- **RAXXO Studios Git Dojo** - paid (EUR 5). SKIP.
- **Cole Medin's Archon** (21k stars) - "open-source harness builder for AI coding". Worth a 30-min look but our harness IS Claude Code; we don't need a builder layer. SKIP for now.

---

## Provenance footer

Sources mined (not in awesome-lists):
- dev.to (suraj_khaitan 100-skills, jan_lucasandmann blueprint, vibehackers complete guide, raxxostudios best skills)
- Medium (unicodeveloper top-10, maa1 agentic skills, jonathans-musings cheat codes, jonathan fulton)
- substack (growthexe 1116-skill survey, joseparreogarcia what-the-docs-dont-tell-you, openclaws SEO skills)
- shareuhack.com agent-fleet survival post (the 95% dropout data point)
- artificialcorner.com 70+ skills writeup
- gitnation Cole Medin advanced techniques talk
- pasqualepillitteri.it superpowers + agent-view guides
- claudefa.st (hooks complete guide, changelog mirror, agent-view writeup)
- explainx.ai 2.1 release notes
- mindstudio.ai (multi-agent + /bg + agent-teams writeups)
- code.claude.com/docs changelog directly
- GitHub direct: coleam00, zircote, obra, affaan-m, browserbase, pasky, mattpocock (via shareuhack), wshobson, CodyLunders, rohitg00, K-Dense-AI
