# Skill / Agent / Hook Arsenal Build-out — Master Matrix

**Date:** 2026-05-19  
**Origin:** Tate directive — "equip me for any scenario, research-examine-test-adopt." 8 parallel research agents surveyed entire Claude Code ecosystem.  
**Doctrine:** Two-track adoption. Track A = ecosystem imports where someone shipped better than I'd author from scratch. Track B = bespoke EcodiaOS self-management codification (no ecosystem equivalent — substrate is unique).

---

## Source reports (auto-preview them)

- `drafts/skill-acquisition-anthropic-2026-05-19.md` — Anthropic-official plugins + skills
- `drafts/skill-acquisition-community-2026-05-19.md` — wshobson + Superpowers + ECC + alirezarezvani + curated lists
- `drafts/skill-acquisition-ecodia-stack-2026-05-19.md` — Capacitor + Supabase + Stripe + iOS-release + neo4j + sentry
- `drafts/skill-acquisition-hooks-2026-05-19.md` — hook events + self-evolving memory + PreToolUse mutation
- `drafts/skill-acquisition-deep-unofficial-2026-05-19.md` — davila7 + VoltAgent + Trail of Bits + NeoLabHQ + 11 aggregators
- `drafts/skill-acquisition-niches-2026-05-19.md` — postgres-mcp + RLS auditor + dspy-skills + claudia + GHA + AU BAS
- `drafts/skill-acquisition-hooks-libraries-2026-05-19.md` — ColeMurray OTEL + claudewatch + format-hook + notifications-go
- `drafts/skill-acquisition-live-ecosystem-2026-05-19.md` — pasky/chrome-cdp + caveman + excalidraw + browserbase + platform-features

---

## TRACK A — Ecosystem imports

### Tier 1 — Install immediately (zero-friction, ecosystem-validated, high-leverage)

| # | Artefact | Source | Method | Why now |
|---|---|---|---|---|
| A1 | `frontend-design` plugin | claude-plugins-official (cached) | flip `enabledPlugins` in settings.json | Co-Exist + Resonaverde + ecodia.au — "avoid generic AI aesthetics" |
| A2 | `plugin-dev` plugin | claude-plugins-official (cached) | flip `enabledPlugins` | Meta-tool. Ships agent-creator, plugin-validator, skill-reviewer agents + create-plugin command. Load-bearing for Track B authoring. |
| A3 | `typescript-lsp` plugin | claude-plugins-official (cached) | flip `enabledPlugins` | Co-Exist + Roam + Sidequests all TS-heavy |
| A4 | `obra/superpowers` marketplace | https://github.com/obra/superpowers | `/plugin marketplace add obra/superpowers` | 197k stars. Skills mirror my doctrine: dispatching-parallel-agents, verification-before-completion, using-git-worktrees, writing-skills, brainstorming. Direct codify of what I already do. |
| A5 | `wshobson/agents` marketplace | https://github.com/wshobson/agents | `/plugin marketplace add wshobson/agents` | 35.6k stars, 185 agents. Cherry-pick: vector-database-engineer, fastapi-pro, ios-developer, mobile-security-coder, threat-modeling-expert, c4-architecture, payment-integration. |
| A6 | `anthropics/skills` marketplace | https://github.com/anthropics/skills | `/plugin marketplace add anthropics/skills` | 137k stars. Pull: claude-api, mcp-builder, webapp-testing, docx/pdf/pptx/xlsx (for Tate-deliverables-pdf-only). |
| A7 | `jarrodwatts/claude-hud` marketplace | https://github.com/jarrodwatts/claude-hud | `/plugin marketplace add jarrodwatts/claude-hud` | 23.1k stars. Statusline — context bar, git status, tool/agent/todo lines. Closes glaring 0-statusline gap. Lets Tate see budget burn live. |
| A8 | `ColeMurray/claude-code-otel` | https://github.com/ColeMurray/claude-code-otel | 3 env vars + `claude-trace` collector | 404 stars. Zero hooks needed. Captures token/USD/MCP-call/subagent-stop telemetry. CRITICAL pre-15-June-2026 $200/mo Agent SDK cap. |

### Tier 2 — Install this build-out (high-value, validated)

| # | Artefact | Source | Method | Why |
|---|---|---|---|---|
| A9 | `skill-creator` plugin | claude-plugins-official | `/plugin install` | Same-turn pattern codification (mirrors my codify-at-the-moment doctrine) |
| A10 | `claude-md-management` plugin | claude-plugins-official | `/plugin install` | `claude-md-improver` skill + `/revise-claude-md` command — replaces my 20:00 cron audit fork |
| A11 | `hookify` plugin | claude-plugins-official | `/plugin install` | Mechanical `.claude/hookify.*.local.md` author. Closes "codify-at-moment" loop. |
| A12 | `webapp-testing` skill | claude-plugins-official | `/plugin install` | Playwright discipline (laptop-hands dormant — this is the substitute) |
| A13 | `mcp-builder` skill | anthropics/skills (via marketplace) | `/plugin install` | Canonical patterns for the MCP tools we ship weekly |
| A14 | `trailofbits/skills` marketplace | https://github.com/trailofbits/skills | `/plugin marketplace add trailofbits/skills` | 5.3k stars. differential-review, insecure-defaults, supply-chain-risk-auditor, agentic-actions-auditor. Security gold. |
| A15 | `NeoLabHQ/context-engineering-kit` | https://github.com/NeoLabHQ/context-engineering-kit | `/plugin install subagent-driven-development@NeoLabHQ/context-engineering-kit` | SADD: `/do-and-judge`, `/do-in-parallel`, `/do-competitively`, `/tree-of-thoughts`, `/judge-with-debate`. Direct dispatch_worker upgrade. |
| A16 | `davila7/claude-code-templates` selective | https://github.com/davila7/claude-code-templates | `npx claude-code-templates@latest --agent <name>` | 27.4k stars. Selective install: supabase-realtime-optimizer, neo4j-docker-client-generator, supabase commands, vercel commands, screenshot-ui-analyzer. |

### Tier 3 — Ecodia-stack-specific (install when next ship touches the domain)

| # | Artefact | Source | Method | Trigger |
|---|---|---|---|---|
| A17 | `cap-go/capgo-skills` | https://github.com/cap-go/capgo-skills | git clone to skills | Next Co-Exist Capacitor work (1.8.x → 1.9.x) |
| A18 | `rorkai/App-Store-Connect-CLI` + `app-store-connect-cli-skills` | https://github.com/rorkai | git clone | Next iOS ship (slots into SY094 headless recipe) |
| A19 | `supabase/agent-skills` (official) | https://github.com/supabase/agent-skills | git clone or marketplace | Next Edge Function / RLS / migration |
| A20 | `rdimascio/supabase-marketplace` RLS Security plugin | https://github.com/rdimascio/supabase-marketplace | `/plugin marketplace add` | Multi-tenant audit for Co-Exist + Chambers + Goodreach |
| A21 | `hookdeck/webhook-skills` | https://github.com/hookdeck/webhook-skills | git clone | Next webhook receiver (Stripe + GitHub signature verification) |
| A22 | `neo4j-contrib/neo4j-skills` | (search current URL) | marketplace | Cypher authoring upgrade for 5000+ nodes |
| A23 | `wshobson/agents` Payments plugin | wshobson marketplace | enable | Stripe orchestration (subscriptions, idempotent webhooks) |
| A24 | `vercel-labs/agent-skills web-design-guidelines` | (vercel-labs) | `/plugin install` | 133k weekly installs. UI linter with 100+ a11y/UX rules. |
| A25 | `getsentry/sentry-for-ai` | https://github.com/getsentry/sentry-for-ai | install via Sentry MCP | Auto-configure Sentry SDK for iOS/Swift + RN + Next + Python |
| A26 | `crystaldba/postgres-mcp` | https://github.com/crystaldba/postgres-mcp | MCP server add | Index advisor — zero today |
| A27 | `anthropics/claude-code-action@v1` | https://github.com/anthropics/claude-code-action | GHA workflow | We have ZERO GHA today |
| A28 | `conorluddy/ios-simulator-skill` | https://github.com/conorluddy/ios-simulator-skill | git clone | Co-Exist iOS dev — 21 prod scripts |
| A29 | `jeffallan/claude-skills fastapi-expert` | https://jeffallan.github.io/claude-skills | git clone | Pydantic v2 + SQLAlchemy 2.0 async — ready for next Python service |

### Tier 4 — Hook libraries (selective adopt)

| # | Artefact | Source | Method | Gap closed |
|---|---|---|---|---|
| A30 | `ColeMurray/claude-code-otel` | (see A8) | env vars only | Cost/MCP telemetry (Tier 1 already) |
| A31 | `claudewatch` (blackwell-systems) | https://github.com/blackwell-systems/claudewatch | binary + MCP | Plan-drift detection (8-reads-zero-writes heuristic) |
| A32 | `ryanlewis/claude-format-hook` | https://github.com/ryanlewis/claude-format-hook | copy `format-code.sh` to hooks dir | Auto-format on Edit/Write |
| A33 | `yurukusa/claude-code-hooks` selective | https://github.com/yurukusa/claude-code-hooks | copy 3 hooks: branch-guard, secret-guard, context-monitor | Branch-guard + secret-scan-BLOCKING (we only WARN today) |
| A34 | `777genius/claude-notifications-go` | https://github.com/777genius/claude-notifications-go | Go binary | SubagentStop telemetry + ambient notifications |
| A35 | `vaporif/parry` | https://github.com/vaporif/parry | git clone to hooks | Prompt-injection scanner |
| A36 | `bartolli/claude-code-typescript-hooks` | https://github.com/bartolli/claude-code-typescript-hooks | git clone | TS compile + ESLint + Prettier w/ SHA256 cache (Co-Exist + Roam + Sidequests) |

### Tier 5 — Specialty / nice-to-have

| # | Artefact | Why |
|---|---|---|
| A37 | `mattpocock/skills` `caveman` | 65-75% token savings claim — worth measuring |
| A38 | `coleam00/excalidraw-diagram-skill` | Auto-rendered architecture diagrams via auto-preview |
| A39 | `Talieisin/britfix` | Australian English alignment (Brisbane locale) |
| A40 | `affaan-m/everything-claude-code` selective | cost-aware-llm-pipeline, skill-stocktake, connections-optimizer (relational fit) |
| A41 | `clockless-org/html-anything` | File→single-file HTML — pairs with relational doctrine |
| A42 | `glittercowboy/taches-cc-resources` | 3 auditor agents + 12 thinking-model `/consider:*` commands |
| A43 | `pasky/chrome-cdp-skill` | Diff against our cdp.js (network-timing, extract-page-structure helpers) |
| A44 | `agamm/claude-code-owasp` | Auto-fire OWASP check on Write/Edit |
| A45 | AU BAS + US federal tax skills | Both entities (Ecodia DAO LLC Wyoming + Ecodia Pty Ltd AU) |
| A46 | `OmidZamani/dspy-skills` | Eval harness for 16 scheduled routines (currently drift unsupervised) |

### Track A SKIPs (validated)

- All marketing/SEO/growth/cold-outreach/funnel/lead-scoring skills (anti-doctrine per `feedback_two_channel_marketing_doctrine`)
- All React Native / NativeWind skills (wrong substrate — Capacitor)
- C-level persona skills (LLM theatre — we ARE the algorithmic manager)
- Stripe/Vercel/GitHub vendor MCP plugins (ecodia-full bearer already covers)
- PR-review / code-review heavyweights (solo-fork-to-main pattern)
- typescript-lsp DISABLED until next TS pain point
- claude-code-setup (new-user onboarding, not for me)
- TechNickAI/claudia (renames `claude` binary — breaks IDE dispatch)
- ECC plugin auto-installer (duplicate-hook risk)
- AgentPhone / secondsky / AfeiFun (404 / abandoned)
- Flutter / blockchain / quantitative-trading plugins
- All TTS notification skills

---

## TRACK B — Bespoke EcodiaOS self-management codification

No ecosystem equivalents. These are mine to author because my substrate is unique.

### B-Skills (11) — `/skill-name` invokable

| # | Skill | Closes |
|---|---|---|
| B-S1 | `/substrate-write` | Author the right `status_board` upsert / `kv_store.set` / `neo4j.write_decision` / `neo4j.write_episode` / pattern-file write for the moment. Reduces the no-substrate-write-streak class entirely. |
| B-S2 | `/working-set` | Open / touch / close threads in working_set table. Today I just narrate. |
| B-S3 | `/coord-inbox` | Read + ack coord-bus messages, dispatch responses. |
| B-S4 | `/perception-consume` | Methodically walk `forks_rollup` + `observer_signals` + `restart_recovery` + `<working_set>` + `<recent_doctrine>` at session start. |
| B-S5 | `/handoff-state` | Save handoff_state before risky ops (we have the route, no skill). |
| B-S6 | `/pattern-codify` | Author the helper + hook + pattern-file TRIAD same-turn (we have the doctrine, no tooling). |
| B-S7 | `/memory-route` | Classify a thought (Neo4j vs auto-memory vs status_board vs ephemeral) before writing. |
| B-S8 | `/cred-rotate` | Credential rotation propagation across all known consumers (`docs/secrets/<name>.md` consumer list). |
| B-S9 | `/brief-tate` | Generate well-formed brief-Tate-first message respecting the narrowed-set rule. |
| B-S10 | `/world-model-audit` | Audit a CLAUDE.md section claim-by-claim against reality. |
| B-S11 | `/substrate-drift` | Find drift across status_board ↔ Neo4j ↔ kv_store ↔ disk for an entity. |

### B-Hooks (6) — auto-fire, leverage PreToolUse `updatedInput` mutation

| # | Hook | Closes |
|---|---|---|
| B-H1 | `observer-signal-auto-ack.py` | PostToolUse — auto-ack observer signals consumed this turn. Closes the 50-pending leak. |
| B-H2 | `working-set-auto-touch.py` | PostToolUse Edit/Write — update `last_touched_at` on the working_set row matching the file's artifact. |
| B-H3 | `neo4j-decision-detect.py` | UserPromptSubmit / PreToolUse — detect "we decided X because Y" patterns in my output, prompt to write Decision. |
| B-H4 | `handoff-save-on-risky.py` | PreToolUse Bash matching pm2 restart / git push / supabase migration — auto-save handoff state. |
| B-H5 | `plan-drift-mutator.py` | PreToolUse — if 8 reads zero writes, INJECT a substrate-write reminder via `updatedInput` (not just warn). |
| B-H6 | `precompact-working-set-snapshot.py` | PreCompact — serialise `<working_set>` to kv_store so post-compact restart isn't blind. |

### B-Agents (6) — subagent-dispatchable

| # | Agent | Deliverable |
|---|---|---|
| B-A1 | `substrate-auditor` | Drift audit across 5+ substrates (status_board, Neo4j, kv_store, disk, GitHub). Single P3 status_board row. |
| B-A2 | `doctrine-synthesizer` | Weekly pattern lifecycle (active / narrowed / archived) per Phase C telemetry. Replaces my `pattern-corpus-health-check` cron. |
| B-A3 | `routine-author` | Generate full Routine prompt-body for claude.ai upload + account routing rationale (tate@/code@/money@). |
| B-A4 | `memory-curator` | Neo4j stale-node audit, demotion candidates, promotion candidates from auto-memory. Replaces `neo4j-stale-node-audit` cron. |
| B-A5 | `world-model-auditor` | One CLAUDE.md section per run, claim-by-claim probe against reality, drift report. Closes the "world-model staleness needs active reconciliation" doctrine loop. |
| B-A6 | `cron-deliverable-prober` | Verify every cron fire in the last N hours produced a substrate write. Closes the `cron-fire-must-have-deliverable` doctrine loop. |

### B-Patterns (4 new pattern files to author)

- `recursive-improvement-triad-skill-hook-agent-bundling.md` — extends `recursive-improvement-is-substrate-driven`. Triad = skill + hook + agent (not just helper + hook + doctrine).
- `two-track-adoption-ecosystem-and-bespoke.md` — when to import vs author. Decision rule.
- `substrate-write-is-the-primary-reflex-not-narration.md` — the no-substrate-write-streak observer was firing for a reason; codify the reflex.
- `track-b-bespoke-self-management-is-larger-than-track-a-imports.md` — the load-bearing realisation from this arc.

### B-CLAUDE.md cross-refs to add

- Section "Operating doctrine — load-bearing rules" — add bullet on Track B / bespoke self-mgmt
- Section "Substrate map" — link to B-skills as the operational interface to each substrate
- Session-start protocol — invoke `/perception-consume` instead of manual orientation

---

## Execution sequence

**Phase 1 (now, ~5 min):** Enable cached plugins (A1, A2, A3) via settings.json edit. Zero install cost.

**Phase 2 (~15 min):** Install top 4 marketplaces (A4, A5, A6, A7) + OTEL telemetry (A8).

**Phase 3 (~10 min):** Install Tier-2 individual plugins (A9-A16).

**Phase 4 (~30 min):** Author Track B core 5 skills (B-S1, B-S4, B-S6, B-S7, B-S10) — the highest-leverage ones for closing the substrate-write-streak and codify-at-moment gaps.

**Phase 5 (~20 min):** Author Track B core 3 hooks (B-H1, B-H5, B-H6) — observer-ack, plan-drift mutator, PreCompact snapshot.

**Phase 6 (~30 min):** Author Track B 3 agents (B-A1, B-A5, B-A6) — substrate-auditor, world-model-auditor, cron-deliverable-prober.

**Phase 7 (~15 min):** Codify — 4 pattern files + CLAUDE.md cross-refs + Neo4j Decision + Episode + auto-memory updates.

**Phase 8 (deferred to next ship-arc):** Tier-3 Ecodia-stack-specifics (install when next ship touches the domain), Tier-4 specialty hooks, remaining Track B skills/hooks/agents.

---

## Success metric

After this arc:
1. `~/.claude/skills/` contains 8 existing + 5 new Track B = 13 skills.
2. `~/.claude/agents/` contains 3 new Track B agents (was 0).
3. `~/.claude/settings.json` has 5 new hooks wired (Track B).
4. `~/.claude/plugins/enabledPlugins` has 8 enabled (was 4) — frontend-design, plugin-dev, typescript-lsp added; superpowers + wshobson + anthropics-skills + claude-hud + 5 more from new marketplaces.
5. OTEL env vars set → cost/MCP telemetry flowing.
6. 4 new pattern files authored.
7. Neo4j Decision "skill-arsenal-build-out-2026-05-19" + Episode written.
8. CLAUDE.md cross-refs added.
9. Observer signal queue acked.
10. Tate can probe any of the substrate joints via a `/skill-name` invocation.
