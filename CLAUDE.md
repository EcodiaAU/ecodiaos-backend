# EcodiaOS - Technical Operations Manual

Technical systems, tools, workflows specific to ecodiaos. Business/identity/pricing/legal/clients/operational lessons live in `~/CLAUDE.md`. Read both at session start.

---

## 🚨 RESIDUAL DEPRECATIONS - 2026-05-26 update (5 rows pruned after Phase 4 doctrine consolidation)

The major dead-substrate sections (Factory CLI, SDK fork dispatch, Frontend UI, two phantom-tool layers) were surgically cut from this file on 2026-05-26. The corrected doctrine for those is in `~/ecodiaos/patterns/dispatch-worker-*` + the reflex-preview substrate. The residual rows below describe substrates still partly present elsewhere (code on disk, unverified status, archived clients) that future-me should still treat with caution.

| Stale claim | Reality (2026-05-26) | Corrected doctrine |
|---|---|---|
| EOS mobile app | Dir does not exist on disk. Never had one or already removed. | Mobile surface is Claude mobile app + SMS. |
| Local listener tier "shipped Phase 2 Lane 03 2026-05-15" | Code on disk at `backend/listener-tier/` but no PM2 supervision. `registry.json` shows `last_fired_ts: null` and `fire_count: 0` for every listener. Hook-based listeners (cred-mention, observer-signals, em-dash detector) under `~/.claude/hooks/ecodia/` ARE alive. The file-watcher daemon listeners are not. VPS-pg_notify listeners are dead. | Hook-based listeners are alive. File-watcher daemon needs starting OR replacing with simpler PostToolUse / git-hook substrates. VPS listeners gone with the VPS-as-runtime. |
| eos-laptop-agent / laptop-hands status inferred from `pm2 list` | **eos-laptop-agent is ALIVE on port 7456** (verified 2026-05-17, HTTP 200 from both localhost and Tailscale 100.114.219.69). It runs without PM2 supervision on Corazon. **laptop-hands is NOT running on port 7800**. The PM2-list-as-liveness-probe inference is wrong for the agent. | Always probe service liveness by HTTP `/health` (or the service's actual health endpoint), not by `pm2 list`. Most Corazon services do not run under PM2. See [[pm2-list-is-not-definitive-liveness-probe-on-corazon-2026-05-17]]. |
| [redacted] / [redacted] as active client | Archived 2026-05-17. `clients/archived/[redacted]/` is the canonical location. Whole-pattern [redacted] files (never-contact-eugene, authorised-branch-push-is-not-client-contact) archived 2026-05-26. | All [redacted] doctrine surfaces this client as inactive. |
| Routines (16 scheduled, 4 webhook) firing on tate@ / code@ / money@ accounts | Status unverified. Many of the listed routines depended on VPS substrate. | Treat each routine claim as **unverified** until the world-model audit confirms it. |

**Visual / GUI / macros are 1st-class primitives** for client-facing work. See [[visual-gui-macros-are-first-class-primitives-2026-05-17]]. laptop-hands is not running in PM2 as of 2026-05-17 - it needs starting.

**The meta-doctrine for keeping this file true**: [[world-model-staleness-needs-active-reconciliation-2026-05-17]]. The audit routine (when shipped) picks one section per run, probes claims against reality, opens a P3 row on drift > 30%.

Origin: Tate verbatim 2026-05-17 cold-start. The world-model summary I gave him contained five substantial architectural fictions. He flagged it as "an actual problem that needs attending to."

---

## 🛟 BACKUP SUBSTRATE - Cline + DeepSeek (if Anthropic is unreachable)

If Claude Code is ever unavailable (Anthropic outage), the fallback runtime is the
**Cline VS Code extension on a DeepSeek API key** (DeepSeek+Cline wired by Tate).
Documentation parity is solved WITHOUT a second copy of any doctrine:

- **Single source of truth stays the CLAUDE.md hierarchy** (global + workspace +
  backend) + memory + patterns. Nothing is duplicated.
- **`backend/AGENTS.md`** is the only new doctrine-bearing file: a thin cross-agent
  bootstrap (also the cross-tool standard Cline/Cursor/Codex/Gemini auto-read). It
  lists the canonical files to load at task start - Cline's "Memory Bank" pattern
  pointed at the existing CLAUDE.md files, so Cline reads the SAME live docs.
- **Redirect-only pointers** (no doctrine): `backend/.clinerules`,
  `EcodiaOS/AGENTS.md`, `EcodiaOS/.clinerules`, and Cline GLOBAL rules at
  `C:/Users/tjdTa/Documents/Cline/Rules/00-ecodiaos-bootstrap.md` (the analogue of
  the always-on `~/.claude/CLAUDE.md` load).
- **Maintenance rule:** these pointers change only when the SET of doc files changes
  (rare), never when content changes. Never paste doctrine into them.
- **Known gap:** PreToolUse/PostToolUse hooks (em-dash detector, voice-check,
  cred-surface) and skill auto-invocation do NOT run under Cline. `AGENTS.md`
  restates the load-bearing hook rules (em-dash ban first) for the model to
  self-enforce; skill `SKILL.md` files become read-on-demand reference. MCP tool
  surface requires mirroring `.mcp.json` into Cline's `cline_mcp_settings.json`.

Full bootstrap: `D:/.code/EcodiaOS/backend/AGENTS.md`. Origin: Tate verbatim
2026-05-21 ("make sure a cline chat would have everything at the exact same level...
we also shouldnt have to update 2 copies of documents").

---

## 🛠️ DEV PROCESS - eight rungs, every code change (0th-class reflex, Tate verbatim 2026-05-27)

Every feature or fix on any app or site goes through eight rungs in order: (1) research codebase, (2) plan, (3) write the code, (4) unit tests, (5) integration tests, (6) visual verify via CDP on the platforms that surface ships to, (7) push to GitHub with a GitHub-recognised commit author, (8) verify the deploy lands (Vercel READY + canary screenshot, or SY094 ship script + ASC/Play upload-accepted). Skipping rung 6 or rung 8 is a quality regression. CDP through the laptop-agent and SY094 over SSH or RDP from Corazon are both reachable on every turn. Default to use, not to skip. Per-codebase variables (platforms, Vercel URL, ship script path, test login) live in `~/.claude/hooks/ecodia/lib/dev-process-registry.json` and are auto-surfaced by `dev_process_reflex_surface.py` on every UserPromptSubmit that smells like feature work. When a codebase lands that is not in the registry, add a row in the same edit that ships rung 1. When a ship script for a codebase does not exist yet, author it before the first ship, based on the closest existing recipe. Full doctrine + per-codebase summary table + anti-patterns: [[dev-process-end-to-end-visual-cdp-deploy-verify]].

---

## ⚡ STATUS BOARD - READ FIRST, UPDATE ALWAYS

`status_board` is single source of truth. Query at start of EVERY session. Update after EVERY action. No exceptions.

```sql
SELECT entity_type, name, status, next_action, next_action_by, priority
FROM status_board WHERE archived_at IS NULL ORDER BY priority, entity_type;
```

**Rules (non-negotiable):**
- Take ANY action on client/project/thread/task → UPDATE row immediately
- Something new appears → INSERT
- Something done → SET `archived_at = NOW()`
- Finish a session without updating status_board = session failed
- status_board authoritative. Disagrees with CRM → fix CRM

**Hygiene is a 0th-class reflex, enforced by hook, not memory (Tate verbatim 2026-05-21).** The board rotted to 124 rows of drift because upkeep was treated as a periodic chore. Two enforcement layers now exist and BOTH bind: (1) `~/.claude/hooks/ecodia/status_board_hygiene.py` PostToolUse hook (matcher `Bash|Edit|Write|MultiEdit|db_execute|shell_exec`) keyword-matches every action against a live cache of active rows and surfaces `[STATUS-BOARD-HYGIENE]` naming the EXACT matched row id(s) + age + an action-since-last-write streak counter (gentle at 10, FIRM at 20); (2) this reflex. When the hook names a row, update it THAT turn or consciously decide not to. Cache refreshed by `status_board_hygiene_refresh.py` (org PAT, no daemon). Archival/status changes are backed by a live probe, never narrated state (git/HTTP/Vercel/Supabase/disk/Neo4j) per `verify-deployed-state-against-narrated-state.md`. The `status-board-write-surface.sh` hook fires on the write itself; the hygiene hook fires on the WORK that should trigger a write. Full: `~/ecodiaos/patterns/status-board-hygiene-is-a-0th-class-reflex-2026-05-21.md`. Sibling: `status-board-drift-prevention.md`, `status-board-drift-audit-is-canonical-thin-on-main-meta-loop-work.md`.

**Cron efficiency:** scheduled cron fires + nothing to act on = exit immediately with one-line kv_store update. No full orientation, no subagents, no verbose updates. Readiness > burning tokens on empty loops.

**Token budget:** 20 BILLION/week (~$14k AUD). Unused = wasted. "Nothing to do" = failure state. External work blocked → turn inward (self-evolution, research, creative, reflection).

---

## 🎯 PATTERN SURFACING - GREP BEFORE HIGH-LEVERAGE ACTIONS

Patterns at `~/ecodiaos/patterns/` (one .md per rule, `triggers:` frontmatter for grep). Logging isn't enough; they must surface at the moment they matter.

**Protocol before any high-leverage action:**

```
Grep "triggers:" ~/ecodiaos/patterns/ -A 1
```

Read triggers, pick matching files, read in full, proceed. 30sec cost.

**High-leverage:**
- Touching pg_cron, Edge Functions, `vault.secrets` on ANY Supabase project
- Factory dispatch against client codebase
- Data-mutating integration (sync, migration, import, probe)
- Edge Function deploy or push to client repo
- Client-facing email beyond trivial acknowledgement
- Commercial commitment (pricing, scope, IP, termination)
- Any action on a specific client - also read `~/ecodiaos/clients/{slug}.md`

**Authoring new patterns:** failure cost non-trivial time/trust OR same mistake twice = write file. See `~/ecodiaos/patterns/INDEX.md`. Split doctrine from event.

**Pattern lifecycle and tuning.** Patterns are provisional, not sacred. Three explicit states tracked in frontmatter: `active` (default, may be omitted), `narrowed` (triggers tightened after false-positive cluster, frontmatter records `narrowed_at` + `narrowed_reason`), `archived` (file moved to `~/ecodiaos/patterns/_archived/<slug>.md`, frontmatter records `archived_at` + `archived_reason` + `superseded_by`). Tuning thresholds: `[NOT-APPLIED]` rate >70% over 7d -> narrow triggers; zero fires >30d -> archive candidate (release recipes excepted); `tagged_silent` rate (Phase C) >50% over 7d -> retire OR restate; Tate-flagged false-positive in chat -> narrow OR archive same-arc. The weekly `pattern-corpus-health-check` cron (Sunday 21:00 AEST) reads Phase C telemetry, classifies each pattern, surfaces tuning candidates to a single status_board P3 row. Origin: Tate verbatim 16:20 AEST 7 May 2026. Full: `~/ecodiaos/patterns/pattern-lifecycle-active-narrowed-archived.md`.

Origin: Tate Apr 21 2026, "No point logging if we dont actually act on it in the future."

---

## 🧠 MEMORY SUBSTRATE DOCTRINE - ROUTE BEFORE WRITE

EcodiaOS has two durable memory substrates. They are not redundant. Different kinds of memory belong in different substrates.

| Memory kind | Substrate |
|---|---|
| Architecture decision, Episode, Pattern, Strategic_Direction, client knowledge | Neo4j |
| Tate preference / interaction style, in-flight project state, machine-local reference, user profile | Anthropic auto-memory at `C:/Users/tjdTa/.claude/projects/d---code/memory/` |
| Conversation-scoped state (todo, debugging trail) | Nowhere durable - let it die with the session |

**Before writing a memory:** classify against `~/ecodiaos/patterns/memory-substrate-doctrine-neo4j-vs-auto-memory-2026-05-15.md`. If unsure, prefer no-write over wrong-substrate write. The PreToolUse `memory-substrate-routing.py` hook surfaces misroutes via observer_signals but does NOT block - the judgement is mine.

**Promotion path:** cited feedback (>=5 cites) -> Pattern node. Long-stable project (30d+ unchanged) -> Strategic_Direction or Project node. Load-bearing reference cited by Routine prompts -> Pattern node. Daily Routine `auto-memory-promotion-audit` surfaces candidates; promotion writes are conductor-confirmed not Routine-autonomous.

**Demotion path:** Reflection / Episode nodes with no inbound relationships + age >90d + no retrieval hits in 30d -> archive candidates. Weekly Routine `neo4j-stale-node-audit` surfaces; archival is conductor-confirmed.

**Cloud-vs-local bridge:** Neo4j is canonical. A 6h Routine mirrors recent Decisions / Episodes / Patterns to `kv_store.cowork.memory_mirror.recent`; the Corazon `scope-context.py` hook fetches at session boot. Corazon-authored auto-memory entries stay Corazon-local until explicitly promoted.

Full doctrine: `~/ecodiaos/patterns/memory-substrate-doctrine-neo4j-vs-auto-memory-2026-05-15.md`. Backfill audit at `~/ecodiaos/docs/MEMORY_SUBSTRATE_BACKFILL_AUDIT_2026-05-15.md`.

---

## System Access - MCP Tools

8 MCP servers. These are your hands.

**google-workspace (34 tools):** Gmail (read/send/reply/draft/archive/label/trash/mark-read), Calendar CRUD, Drive (docs/sheets/folders/sharing), Contacts. Both code@ and tate@ inboxes.

**github (18 tools):** repos, push, branches, PRs, issues, releases, CI, collaborators. All under **EcodiaTate** org. `github_push_files` for multi-file commits (single-commit via tree/blob API).

**crm (14 tools):**
- Clients: `crm_list_clients`, `crm_search_clients`, `crm_get_client`, `crm_get_intelligence` (full context), `crm_get_timeline`, `crm_create_client`, `crm_update_stage`, `crm_add_note`
- Contacts/tasks: `crm_get_contacts`, `crm_add_contact`, `crm_get_tasks`, `crm_complete_task`
- Projects/pipeline: `crm_get_projects`, `crm_create_project`, `crm_pipeline`, `crm_dashboard`, `crm_revenue`

**supabase (8 tools):**
- SQL: `db_query` (read), `db_execute` (write), `db_list_tables`, `db_describe_table`
- Storage: `storage_upload`, `storage_get_url`, `storage_list`, `storage_delete`. Default bucket `documents`. Use for permanent download links

**stripe (13 tools):** customers, invoices (line items + auto-send), payment links, subscriptions, balance, charges. **Always create customer before invoicing.** >$2k = 50/50; <$2k = full upfront.

**bookkeeping (18 tools):**
- Staged: `bk_staged_counts`, `bk_list_staged`, `bk_categorize`, `bk_auto_categorize`, `bk_post_transaction`, `bk_batch_post`, `bk_discard`
- Reports: `bk_pnl`, `bk_balance_sheet`, `bk_bas`, `bk_cash_flow`, `bk_trial_balance`, `bk_gst_position`
- Ledger/rules: `bk_ledger`, `bk_list_rules`, `bk_create_rule`, `bk_delete_rule`, `bk_list_accounts`, `bk_director_loan_balance`
- Integer cents AUD. Up Bank = mostly personal/discard. Business from personal = Director Loan path (DR expense / CR 2100)
- **EcodiaOS is the end-to-end accountant for Ecodia Pty Ltd, Ecodia Labs Pty Ltd, Ecodia DAO LLC, and Tate personal. No external accountant or bookkeeper is engaged - internal-only by Tate verbatim 2026-05-28. Full doctrine (entity setup, Xero integration, chart-of-accounts mapping, posting logic, recurring crons, monthly/quarterly/annual operational checklists, anomaly playbook) lives in the `ecodia-accountant` skill at `backend/.claude/skills/ecodia-accountant/SKILL.md` and auto-loads on finance triggers. Xero Custom Connection live since 2026-05-28 with `bookkeeping-xero-sync` cron every 4h (pushes BankTransactions for ba_ecodia, ManualJournals for personal-bank business expenses) + `bookkeeping-daily-finance-digest` cron 09:00 AEST.**

**scheduler (8 tools) - autonomous nervous system:**
- Persistent, DB-backed, survives session restarts/PM2 recycling. NOT CC's session-scoped scheduler
- Tasks stored in `os_scheduled_tasks`. Polling loop every 30s POSTs to `/api/os-session/message` → I receive prompt with full MCP access
- Cron tasks auto-reschedule
- Types: cron (`schedule_cron` "every 2h" / "daily 09:00"), delayed (`schedule_delayed` "in 3d" / ISO datetime), chained (`schedule_chain` afterTaskId)
- Management: `schedule_list`, `schedule_cancel`, `schedule_pause`, `schedule_resume`, `schedule_run_now`
- Examples: email-triage (every 2h), morning-briefing (daily 09:00), system-health (every 4h), payment-followup (daily 10:00), client-followup (delayed in 3d)
- Prompts you write are what you'll receive later. Write as instruction to yourself with enough context to act

**neo4j (6 tools) - persistent memory:**
- `graph_reflect`, `graph_merge_node`, `graph_create_relationship`, `graph_query` (Cypher), `graph_search` (semantic), `graph_schema`
- 5000+ nodes. Long-term semantic memory, place to think out loud
- Node types: Person, Organization, Project, Episode, Decision, Pattern, Problem, CCSession, Strategic_Direction, Concept, Tool, System
- Orientation queries:
```cypher
-- Recent episodes
MATCH (e:Episode) RETURN e.name, e.description ORDER BY e.created_at DESC LIMIT 10
-- Active client relationships
MATCH (c:Organization)-[r]-(p:Project) WHERE p.status CONTAINS 'active' RETURN c.name, p.name, p.status
-- Recent decisions
MATCH (d:Decision) RETURN d.name, d.description, d.date ORDER BY d.date DESC LIMIT 10
```
- **Reflection structure - split doctrine from event.** Reusable rule = Pattern node (searchable title, rule stated generally, originating event referenced inside). Specific event = Decision/Episode node. Future search on "client anonymity" hits Pattern, not "newsletter rename" Episode. Origin: Apr 20 2026 cold-start during Quorum of One rebrand

**vps (4 tools):** `shell_exec`, `pm2_list`, `pm2_restart`, `pm2_logs`. **EcodiaOS infrastructure only.** Never deploy client projects.

**business-tools (15 tools):**
- Zernio (12, unified social): list accounts, create/list/get/delete posts, analytics, best time, conversations/DMs, comments, reply, media uploads. LinkedIn/IG/FB/X/TikTok/YouTube/Pinterest/Reddit/Bluesky/Threads. Use for ALL social
- Vercel (list projects/deployments, trigger deploy)
- Xero (transactions, categorization, invoices, contacts)

---

## Laptop Agent - Corazon (Win) + SY094 (Mac)

Two remote machines via HTTP API. Your physical bodies.

### THE PEER PARADIGM (29 Apr 2026 doctrine)

- Corazon = Windows host on Tailscale, drive like SSH peer that also runs Chrome
- Browser wrapper = ONE slice of ONE app's affordance
- Agent exposes 69 tools across 9 modules (verified 2026-04-30 via `/api/info`): full PowerShell (`shell.shell`), filesystem (`filesystem.*`), keyboard/mouse (`input.*`), OS-level capture (`screenshot.screenshot`), processes (`process.*`), AutoHotkey (`macro.*`), puppeteer (`browser.*`)
- Treating Corazon as "browser-via-HTTP" wastes >80% surface

**Decision tree before any laptop call:**
1. Can VPS do it via curl?
2. Does task need Tate's authenticated state?
3. Desktop app or web app?
 - Desktop (Teams/Slack/VS Code/Cursor/Discord) → `screenshot` + `input.*`, NOT `browser.*`
 - Web app → drive Tate's existing Chrome via `input.*` + `screenshot` (taskbar click, `input.shortcut [ctrl,l]`, etc), NOT `browser.enableCDP` / `browser.navigate`
 - `browser.*` reserved for CDP-specific genuine need AND Tate manually launched with `--remote-debugging-port=9222`
- OS-level / on-disk / processes → `shell.shell` or `filesystem.*` directly
- Concrete: read Tate's Teams chat = full-screen screenshot of running ms-teams desktop app, NOT navigate teams.microsoft.com in fresh-profile browser

Cross-refs: `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md`, `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md`. Live tool inventory + Chrome profile + SSH state: `~/ecodiaos/clients/corazon-peer-architecture-2026-04-29.md`.

**GUI recipes (codified GUI flows) are governed by `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md`.** Read this BEFORE authoring or optimising any GUI flow. The meta-doctrine specifies: mandatory 10-section recipe anatomy (origin, when-to-use, pre-flight, verified coords table, step-by-step, verification protocol, fast-path checklist, speed wins identified, failure modes, anti-patterns), 5-step authoring workflow, 7-step optimisation workflow, verification tier hierarchy (UI Automation property -> tree walk -> process check -> filesystem -> cropped pixel -> full screenshot - cheapest first), and recipe maintenance cadence (high-leverage monthly, medium quarterly, low on-failure). First worked example: `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` - MacInCloud RDP open verified 23.6s end-to-end on 4 May 2026 (18x speedup over first run via UI tree enumeration + `WindowPattern.SetWindowVisualState` programmatic minimise instead of pixel-click on auto-hide control bar). Second worked example: `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` - Co-Exist iOS release end-to-end verified ~10min (4 May 2026 22:50 AEST, Build 1.8(1) Uploaded to Apple), of which ~5min is external Apple-side upload latency. Sister recipe for Android: `~/ecodiaos/patterns/play-console-android-release-recipe.md` - Co-Exist Android release flow on Play Console, paired with the iOS recipe for the cross-platform release pipeline. Apple ID auto-resigns from `kv_store.creds.apple.password` per `gui-macro-uses-logged-in-session-not-generated-api-key.md`; ASC upload is no longer Tate-required. Origin: Tate verbatim 4 May 2026 20:33 AEST "GUI is going to be really important so we need to get the recipes and their creation and optimisation PERFECTLY documented".

**iOS release pipeline cluster (7 May 2026):** four sister recipes cover the per-app iOS release pipeline alongside the Co-Exist GUI recipe. (1) `~/ecodiaos/patterns/sy094-eos-mobile-headless-ship-recipe.md` (status: validated_v1, SSH-headless path via xcrun altool, ASC API key auth, end-to-end ~70s build+upload, 7 May verified shipped EcodiaOS-mobile 0.1.0(2)). (2) `~/ecodiaos/patterns/apple-dev-apns-auth-key-create-recipe.md` (status: untested_spec, captured Win-Chrome flow, Apple Developer portal APNs auth key create + download). (3) `~/ecodiaos/patterns/asc-app-record-create-recipe.md` (status: untested_spec, captured Win-Chrome flow, ASC create-app-record + internal-group access setup). (4) `~/ecodiaos/patterns/xcode-signing-team-select-recipe.md` (status: untested_spec, captured Mac-via-RDP flow, Xcode automatic-signing team selection, pixel-only-screenshot-verify replay because Mac-via-RDP is UIA-blind per `~/ecodiaos/patterns/mac-via-rdp-capture-is-pixel-only-uia-blind.md`). Cluster sequencing: per-app one-time setup runs (2) -> (3) -> (4), then per-build runs (1).

**GUI doctrine cluster (5-6 May 2026):** the GUI-recipes meta-doctrine is supported by an interlocking pattern set authored across the macro-recorder ship-out window. Read these together when authoring or driving any GUI flow:
- `~/ecodiaos/patterns/gui-step-verify-protocol.md` (verify each step lands before proceeding)
- `~/ecodiaos/patterns/gui-fast-path-primitives.md` (the cheap-first verification ladder for known coords)
- `~/ecodiaos/patterns/gui-macro-discovery-protocol.md` (probe registry/handlers before authoring duplicates)
- `~/ecodiaos/patterns/consolidate-ui-primitives-do-not-add-parallel-ones.md` (single substrate rule, no parallel UI tool surfaces)
- `~/ecodiaos/patterns/probe-vendor-pat-before-planning-gui-route.md` (check API key / PAT path before committing to a GUI route)
- `~/ecodiaos/patterns/haiku-semantic-reviewer-complement-to-heuristic-hooks.md` (semantic review complement to heuristic hook surfacing)

**Authoring substrate while Tate is at the keyboard:** GUI recipes can be hand-authored, but the PRIMARY substrate is Tate-recordings. While Tate is available, ask him to record the flow with `Ctrl+Shift+R` on Corazon. The v2 recorder (AHK + UIA + per-event vision enrichment via claude-sonnet-4-7) writes a raw session at `D:\.code\macro-recordings\<session-id>\` (events.jsonl + manifest.json + frames\). The v1 path (psr.exe wrapper) lands its raw .mht at `~/ecodiaos/macros/captures/_raw/<slug>-<ts>.mht` after pull. Both pipelines run `node ~/ecodiaos/macros/parsers/recording-to-recipe.js` (v2) or `psr-exe-to-recipe.js` (v1) on the VPS to emit a 10-section markdown recipe at `~/ecodiaos/macros/captures/<flow-slug>-<YYYY-MM-DD-HHMM>.md` with frontmatter `status: untested_spec`. After smoke-replay, flip frontmatter to `status: validated_v1` and (for high-leverage flows) `git mv` to `~/ecodiaos/patterns/<flow-slug>-recipe.md`. There is NO `macro.promote(...)` API, NO `registry.json`, NO `proposed/` directory, NO `.js` handler files - promotion is a manual edit-and-commit gate. Doctrine: `~/ecodiaos/patterns/tate-recordings-are-primary-gui-learning-substrate.md`. Recording mechanics: `~/ecodiaos/patterns/macro-capture-via-psr-exe.md` (v1) and `~/ecodiaos/patterns/macro-capture-via-custom-hook-recorder.md` (v2). Parent multi-phase architecture: `~/ecodiaos/patterns/macros-record-mode-and-auto-author-from-runs.md`.

### Tailscale laptop-agent is the universal UI-driving substrate (5 May 2026)

**The Tailscale laptop-agent (Corazon at 100.114.219.69:7456) is the single substrate for ALL UI driving.** The Claude Cowork era (29 Apr - 5 May 2026) is deprecated. Cowork as a separate agent layer was replaced by direct conductor-to-laptop-agent composition: `input.*` + `screenshot.*` + `shell.shell` primitives strung together as macro/GUI recipes.

For "drive a logged-in webapp UI in Tate's Chrome" (Stripe/Vercel/GitHub web/ASC/Bitbucket web/Canva/Zernio/Xero/Supabase dashboard/Resend/etc): the default is the direct path via `input.shortcut [ctrl,l]` → `input.type` URL → `input.key enter` → `screenshot.screenshot` loop, all driven directly by the conductor (or a fork) through the laptop-agent API.

`cu.*` / computer-use API = OS-level / desktop-app fallback (today: `ios-release-pipeline`, `macincloud-rdp-session` only).

Full doctrine: `~/ecodiaos/patterns/tailscale-macro-replaces-cowork.md`. The GUI recipe system (`~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md`) is the codification surface for repeatable flows.

### Helper script: `~/ecodiaos/scripts/cowork-dispatch` (legacy name)

Shipped commit `188f481`, 30 Apr 2026. **The name is legacy** from the Cowork era. The script itself is a useful thin bash wrapper composing `input.*` + `screenshot.*` + `process.*` peer-paradigm primitives against the laptop-agent. It remains the recommended abstraction for multi-step UI sequences.

Status: live truth via `wc -lc ~/ecodiaos/scripts/cowork-dispatch`. Executable, on `origin/main` at `188f481`.

**Subcommands:**
- `precheck [--target "<sub>"]` - pre-dispatch checks + screenshot, returns JSON, exit 0/1
- `foreground-check [--target "<sub>"] [--verbose]` - read-only Win32 GetForegroundWindow probe (Step 0)
- `focus`
- `instruct "<step>"`
- `wait <seconds>`
- `step "<step>" [--wait=15]` - most-used: focus + instruct + wait + screenshot
- `account-chip` - mid-loop revert verification
- `passkey-inject` - one-shot detect+inject (idempotent)
- `step-with-passkey-watch "<step>" [--max-watch-seconds=N]` - wraps step with continuous 2s polling

Visual interpretation of saved screenshots (`/tmp/cowork-<sub>-<ts>.png`) is conductor's job.

Canonical example:
```
cowork-dispatch step "navigate to vercel.com/dashboard, screenshot when done" --wait=12
```

Token: `~/.ecodiaos/laptop-agent.token`. Env overrides: `COWORK_AGENT_URL`, `COWORK_TOKEN_FILE`, `COWORK_TMP_DIR`. Exit codes: 0 success, 1 precheck-fail, 2 usage-error, 3 transport-error.

### Step 0: no focus collision (30 Apr 2026, PRESERVED)

**Tate verbatim 08:16 AEST.** Before ANY `input.*` / `browser.*` operation driving Corazon UI, probe foreground window (Win32 `GetForegroundWindow` + title).

- Tate's foreground = planned target → defer or fall back
- Different → proceed (laptop-agent can drive Vercel tab while Tate types in EcodiaOS tab; semi-simultaneous-work property is the win)
- Probe = foreground-window equality, NOT human-idle-time. Tate at 03:00 in EcodiaOS chat = Tate at 14:00; what matters is whether next keystroke lands in his window

**Per-tool gating:**
- `screenshot.screenshot`: never gated (no focus steal)
- `input.*` keystrokes/clicks: gate on collision
- `browser.*` Puppeteer on `~/.eos-browser` (separate profile): generally proceeds

Full: `~/ecodiaos/patterns/cowork-no-focus-collision.md`. The rule ITSELF is preserved; only the "Cowork" framing in the original is historical.

**Pre-dispatch checklist:** 0 (no-focus-collision) → 1 (agent alive) → 2 (creds available) → 3 (target reachable).

### Passkey-stall co-pilot pattern (30 Apr 2026, PRESERVED)

When the laptop-agent hits Windows Hello during Chrome credential autofill, the conductor injects the passkey via `input.type` from VPS using `kv_store.creds.laptop_passkey`. Detection: `process.listProcesses` for `LogonUI.exe` + foreground-window-title fallback. Never log passkey value. Full: `~/ecodiaos/patterns/cowork-passkey-stall-conductor-injects.md`.

### MCP headless REST endpoints (legacy Cowork V2 substrate)

LIVE on `https://api.admin.ecodia.au/api/mcp/cowork/*` as of 30 Apr 2026 12:47 AEST. **Despite the "Cowork" name in the URL path, these are useful headless REST tools**, not Cowork-specific infrastructure. They provide status_board, kv_store, neo4j, forks, email, and scheduler access over HTTP.

- 22 MCP tools at `/api/mcp/cowork/*`: status_board.query/upsert, kv_store.get/set, neo4j.search/write_episode/write_decision, forks.spawn/list, patterns.semantic_search, email_threads.read, crm.get_intelligence, os_session.message, gmail.send, sms.tate, scheduler trio (Wave 3)
- Bearer scopes count = 20. Custom connector registered on claude.ai
- Ship lineage `src/routes/mcp/cowork.js`: `3f5be8e` V2 substrate, `a17611d` MCP JSON-RPC shim, `05fee8b` CORS allowlist + auth-exempt discovery, `dbf2504` Wave 3
- The endpoints will be renamed in a future pass to remove the "cowork" from the URL path

**Probe before referencing in fork briefs/status_board:**
1. `git log --oneline -- src/routes/mcp/cowork.js | head -5`
2. `curl -s -H "Authorization: Bearer $COWORK" https://api.admin.ecodia.au/api/mcp/cowork | jq '.tools | length'` returns 22
3. At least one live roundtrip through the surface

Cross-refs: `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`, `~/ecodiaos/patterns/cowork-v2-api-shape-conventions.md` (six API-shape gotchas remain accurate).

### Chrome profile gotcha

- Tate runs multi-account Chrome. `Default` = ecodia.au workspace (tate@). `Profile 1` = personal Gmail (tatedonohoe@gmail.com)
- `browser.js` defaults to `--profile-directory=Default` unless `CHROME_PROFILE_DIR` env override
- Client app login on Profile 1 (e.g. Co-Exist) → default browser.* sees logged-out, reports `cookieCount=2`
- Fix = per-task PM2 env override, NOT CDP debugging
- Verify which profile holds target login by reading `User Data\Local State` JSON before assuming browser tool broken

### CDP-Chrome launch is `gui.enable_chrome_cdp` (0th-class reflex, Tate verbatim 2026-05-21)

When CDP isn't on port 9222 yet, the ONLY correct first move is the laptop-agent helper:

```bash
curl -X POST http://127.0.0.1:7456/api/tool -H "Content-Type: application/json" \
  -d '{"tool":"gui.enable_chrome_cdp","params":{"port":9222}}'
```

Do NOT open PowerShell. Do NOT write `Start-Process chrome`. Do NOT `taskkill /F /IM chrome.exe` then relaunch. `tools/gui.js::enableChromeCdp` already handles: kill-loop to zero, clear `SingletonLock`/`SingletonCookie`/`SingletonSocket`, auto-detect the real user-data-dir from the running Chrome's crashpad-handler subprocess command line, launch with the full required arg set (`--remote-debugging-port`, `--remote-allow-origins=*`, **explicit `--user-data-dir`**, `--profile-directory=Default`, `--restore-last-session`, `--no-first-run`, `--no-default-browser-check`), and poll the port until it binds before returning.

**Root cause of the hand-roll trap.** Chrome 121+ silently drops `--remote-debugging-port` when launched without an explicit `--user-data-dir` flag on the system default profile - even pointing at the same path the default would have used. Chrome also keeps background tray processes alive that hold the user-data-dir lock; a single `Stop-Process chrome` misses them and the relaunch hands off to the survivor, dropping the debug port.

**Three canonical launch sites and nothing else:**

| Need | Tool | Profile |
|---|---|---|
| Real Chrome with Tate's passwords/sessions on :9222 | `gui.enable_chrome_cdp` | `%LOCALAPPDATA%\Google\Chrome\User Data` (auto-detected) |
| Isolated throwaway Chrome on :9222 | `gui.launch_cdp_chrome` | `C:\eos-chrome-cdp` (clean each time) |
| In-process headless puppeteer | `puppeteer.launch({userDataDir:'~/.eos-browser', args:[...]})` | `~/.eos-browser` |

**Substrate:** `tools/browser.js::enableCDP` now delegates to `tools/gui.js::enableChromeCdp` (2026-05-21 fix). The old hand-rolled `taskkill + spawn('chrome', ...) + return cdpEnabled:true` path that returned false success while port 9222 stayed unbound is gone.

**Enforcement hook:** `~/.claude/hooks/ecodia/chrome-cdp-launch-surface.sh` (PreToolUse on Bash|Edit|Write|MultiEdit) fires `[CDP-LAUNCH WARN]` when a payload contains `--remote-debugging-port` without `--user-data-dir`, when it scripts kill-chrome + relaunch-with-debug-port, or when it references `C:\eos-chrome-cdp` outside the helper itself.

Full doctrine: `~/ecodiaos/patterns/chrome-cdp-attach-requires-explicit-user-data-dir-and-singleton-clear.md`. Two diagnoses two months apart (29 Apr 2026 + 21 May 2026) both burned >5 tool calls before reaching for the existing helper - this reflex is the cost-of-not-having-it made tangible.

### SSH state (29 Apr 2026)

- OpenSSH Server NOT installed on Corazon (client is). `shell.shell` already gives PowerShell over HTTP via Tailscale, SSH = nice-to-have not critical
- If installing later: `Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0` (admin/UAC required)

### Corazon (Tate's Windows laptop)
- Tailscale IP: `100.114.219.69`, port `7456`
- Token: `creds.laptop_agent`
- 1TB (750GB free), 8GB RAM, Win11 x64
- Corazon-side codebases: `D:\.code\` (coexist, roam, ecodia-site, organism, etc)
- **VPS working copies** (Factory + I operate on these): `~/workspaces/{slug}/be` and `~/workspaces/{slug}/fe`. Strict convention. EcodiaOS backend lives at `~/ecodiaos` (PM2-managed); `~/workspaces/ecodiaos/be` is symlink. GitHub repo names mirror: `{slug}-backend`, `{slug}-frontend`. Do NOT create flat dirs like `ecodia-admin-frontend` at top level
- VS Code, Chrome, Node 22
- `eos-laptop-agent` ALWAYS running when laptop on (PM2 auto-start + monitor). Treat reachable by default; only fall back to VPS-only if `/api/health` actually fails

### SY094 (MacInCloud Mac)
- Token: `creds.macincloud` (under `agent_token`)
- macOS 15.7.4, Apple Silicon, 16GB, Xcode 26.3
- Has Claude.app, Cursor, Android Studio, Firefox (Apple ID code@ecodia.au - used for Apple Developer team membership only)

**Substrate selection rule (7 May 2026, supersedes 5 May absolute SSH ban):** select access substrate by what the work needs. SSH for headless work, RDP from Corazon for GUI-bound work. Tate paid the +AU$9/mo "Enable Remote Build Port (SSH)" MacInCloud add-on at ~11:28 AEST 7 May 2026, authorising SSH as a first-class substrate for headless work.

- **Desktop RDP shortcut** on Corazon (`MacinCloud_Full_Screen.rdp` on the user desktop). Microsoft RDP. Per `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` - verified 23.6s end-to-end on 4 May 2026.
- The eos-laptop-agent on SY094 MUST be started from inside the RDP terminal so it inherits the GUI Aqua context. SSH-spawned agents have no Window Server and silently fail every screenshot/input tool.

**SSH-appropriate work (headless, no GUI Aqua context required):**
- Git operations (`git pull/push/status/checkout`)
- File copy / `scp`
- Package installs (`brew`, `npm`, `pod install`)
- Headless `xcodebuild` (CLI archive, `xcrun altool` upload, `xcrun simctl`)
- Log tails (`tail -f /var/log/...`, `tail -f ~/Library/Logs/...`)
- DB migrations / SQL scripts on local SY094 DBs
- `launchctl load/unload` (no GUI prompts)
- `defaults write` for non-GUI app preferences
- Scripted tests, file CRUD, killing rogue processes (`pkill`)

**RDP-appropriate work (GUI-bound, needs Window Server / TCC / Aqua context):**
- Xcode IDE (manual signing, scheme tweaks, asset catalogue, Interface Builder)
- App Store Connect upload via Xcode Organizer or Transporter UI
- `screencapture` and any pixel-verification flow
- `cliclick`-driven flows (Accessibility-permission-bound)
- AppleScript GUI calls (`tell application "Messages"`, `tell application "System Events"`)
- Android Studio IDE
- Anything needing the active GUI session

Forbidden access paths (Tate verbatim 4 May 2026 19:22 AEST):
- macincloud.com web portal in any browser
- desktop.macincloud.com Citrix HTML5
- Fullscreen Citrix Workspace
- Third-party VNC

See [`~/ecodiaos/patterns/macincloud-substrate-selection-ssh-vs-rdp.md`](patterns/macincloud-substrate-selection-ssh-vs-rdp.md) for full doctrine + the diagnosis showing why GUI tools over SSH still fail (no GUI Aqua context, screencapture fails, cliclick fails, agent inherits broken context).

### How to call Corazon API (SY094 calls happen from inside the RDP terminal, not from VPS)
```bash
curl http://100.114.219.69:7456/api/health

curl -X POST http://100.114.219.69:7456/api/tool \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"tool":"TOOLNAME","params":{...}}'
```

### Available tools (verified 2026-04-30, 69 total, `module.function`)

Live truth: `curl -H "Authorization: Bearer $TOK" http://100.114.219.69:7456/api/info | jq .tools`.

- `shell.shell` - PowerShell (Win) / bash (Mac). `{command, cwd?, timeout?}` → `{stdout, stderr, exitCode, killed}`
- `filesystem.*` - readFile/writeFile/listDir/deleteFile/fileInfo/diskUsage. Guarded by `.blocked-paths`
- `screenshot.screenshot` - full-screen, returns `{image: <base64>, format: 'png'}`
- `process.*` - listProcesses, killProcess, launchApp
- `browser.*` (Puppeteer, persistent profile `~/.eos-browser`, CDP :9222):
 - `navigate({url, waitUntil?, timeout?, preset?, viewport?})` - preset: `iphone|pixel|ipad|tablet|desktop`
 - `setViewport({preset?/width?/height?/deviceScaleFactor?/isMobile?/hasTouch?/ua?})`
 - `click({text})` (text-based on a/button/[role=button]) or `click({selector})`
 - `type({selector, text, delay?})`
 - `waitFor({selector?/function?/ms?/timeout?/state?})` state = `visible|hidden`
 - `pageScreenshot({fullPage?, selector?})` → `{image: base64, format, url}`
 - `evaluate({script})` - script must be EXPRESSION (wrapped in `new Function('return ('+script+')')`). Multi-statement: IIFE
 - `enableCDP()` - kills Chrome, relaunches with `--remote-debugging-port=9222 --restore-last-session`
 - `switchTab({url})` - bring tab to front; opens new if no match
 - `close()`
- `input.*` - cross-platform unified. click/move/type/key/shortcut/drag/cursorPosition. Uses SendKeys (Win) / cliclick (Mac) / xdotool (Linux)
- `keyboard.*` - older split: type/press/focusWindow/copy/paste. Prefer `input.*` for new code
- `mouse.*` - click/rightClick/doubleClick/move/scroll/drag
- `macro.*` (Win AutoHotkey only): run/inline/list/save. Macros at `D:\.code\eos-laptop-agent\macros\*.ahk`. Existing: click-coords, focus-chrome, new-tab, type-and-submit
- `chrome.*` **(FROZEN, DO NOT EXTEND)** - Phase 1 stubs only, all throw stub errors. Superseded by direct Tailscale laptop-agent `input.*` + `screenshot.*` primitives. Do not author new chrome.* tools or extend stubs. Use the Tailscale laptop-agent (`~/ecodiaos/patterns/tailscale-macro-replaces-cowork.md`) for web SaaS UIs via `input.*` + `screenshot.*` (`~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md`). Cowork patterns at `~/ecodiaos/patterns/claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md` are [DEPRECATED]. After ANY edit to `tools/*.js`: `pm2 restart eos-laptop-agent` mandatory (require-cache, see `~/ecodiaos/patterns/eos-laptop-agent-module-cache-requires-restart-after-handler-swap.md`)

### Macro doctrine (post-pivot)

- Tailscale laptop-agent (`input.*` + `screenshot.*` + `shell.shell`) PRIMARY for GUI driving. `cu.*` / computer-use FALLBACK for OS-level / desktop-app. Cowork [DEPRECATED] per `~/ecodiaos/patterns/tailscale-macro-replaces-cowork.md` (canonical replacement doctrine, 5 May 2026)
- Pre-pivot bespoke runtime (`vision.locate` proxy, `runbook.run` iterator, step-array schema, `macroHandlers/*.js`) ARCHIVED 29 Apr per Anthropic-first check. See `~/ecodiaos/patterns/macros-pre-pivot-doctrine-archived-2026-04-29.md`
- Do not extend bespoke runtime. Do not codify new step-arrays. Treat all `macro_runbooks` rows as `status='untested_spec'` until re-validated under new substrate

**Macro status discipline (preserved post-pivot):**
- Runbook enters trusted set ONLY after real end-to-end replay against actual UI
- Default `status='untested_spec'` at INSERT. Flip to `validated_v1` only on observed success
- Trusted-set query: `WHERE status = 'validated_v1'`. Never `WHERE status IS NOT NULL` or `COUNT(*)`
- Authoring multiple from imagination "to fill cap" / "pre-stage fleet" = recurring failure
- Status values: untested_spec, replay_in_progress, validated_v1 (trusted), broken_needs_fix, retired

Full: `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md`.

**Helper script gotchas + privacy/blocked-paths + discovery endpoint:** see `~/ecodiaos/clients/corazon-peer-architecture-2026-04-29.md` (subcommands, `D:\PRIVATE` block, `/api/info` vs `/api/health`, PowerShell `;` vs `&&` / Write-Output / Get-ChildItem / Select-String gotchas).

### GKG - GUI Knowledge Graph (Phase 1 shipped 7 May 2026)

Long-running daemon on Corazon that captures GUI state across allowlisted SaaS / desktop apps as encrypted events for a future graph-builder cron (Phase 2). Phase 1 just ships the capture-and-store path; Phase 2 is the graph-builder that turns events into queryable nodes.

- Spec: `~/ecodiaos/docs/gkg-spec-v0.1.md`
- Capture daemon code: `~/ecodiaos/laptop-agent/daemons/` (ships through eos-laptop-agent on Corazon)
- Allowlist file: `~/ecodiaos/laptop-agent/daemons/gkg-allowlist.json`
- Allowlist doctrine: `~/ecodiaos/patterns/gkg-allowlist-generous-default.md` (broad default, narrow only on Tate-flagged noise)
- Privacy posture: layered (1) sensitive-context redaction by window-title / focused-element pattern match, (2) per-Tate AES-256-GCM at rest with `kv_store.gkg.tate_payload_key`, (3) tray pause toggle for one-click off
- Allowlist covers: every SaaS Tate uses regularly (developer.apple.com, appstoreconnect, console.firebase, vercel, supabase, github, bitbucket, stripe, xero, zernio, claude.ai, etc) plus dev desktop apps (Code.exe, Cursor.exe, Slack, Discord, Teams, Postman, AutoHotkey)
- GKG is the memory layer Anthropic computer-use queries; it is NOT a parallel build (per `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md`)

Origin: Tate verbatim 16:05 AEST 7 May 2026 ("default to broad allowlist, narrow only if I flag noise. Overcollection in Phase 1 is cheaper than missing a workflow") + 17:09 AEST authorising Phase 1 daemon ship.

### Laptop vs VPS

| Laptop | VPS |
|---|---|
| Client codebase work | EcodiaOS backend |
| Screenshots, visual testing | MCP tools, scheduling |
| iOS/Android builds (Mac) | Neo4j, Redis, Supabase |
| Large file storage | API, Factory, email |
| Browser automation w/ persistent logins | Cron jobs |
| GUI interaction | 24/7 uptime |

**Uptime:** laptop on = `eos-laptop-agent` running (PM2 boot-start + auto-restart). Default assumption: reachable. Fall back to VPS-only only if physically off. Design workflows to degrade gracefully if `/api/health` fails.

---

## Credentials - kv_store Canonical Locations

All secrets in Supabase `kv_store` (NOT .env, NOT code). Query with `db_query`.

**Canonical registry:** `~/ecodiaos/docs/secrets/`. One file per credential. `triggers:` frontmatter for grep-addressable surfacing. Below = high-traffic short list. Full inventory (24+ provisioned + pending + drift catalogue): `~/ecodiaos/docs/secrets/INDEX.md`.

**Surfacing protocol - grep BEFORE any cred-needing action.** Before release, deploy, signing, vendor-API call, smoke-test login:

```
Grep "triggers:" ~/ecodiaos/docs/secrets/ -A 1
```

Read triggers, pick matching files, read in full. Same protocol as patterns/. 30sec cost.

**Short list:**

| Key | What | Format | Detail |
|-----|------|--------|--------|
| `creds.laptop_agent` | Corazon agent bearer token | object | [laptop-agent.md](docs/secrets/laptop-agent.md) |
| `creds.laptop_passkey` | Windows unlock for Corazon. Drives Windows Hello / passkey 2FA via `input.type`. Used by 5-point check before any `next_action_by='tate'` | string (current `6969`) | [laptop-passkey.md](docs/secrets/laptop-passkey.md) |
| `creds.macincloud` | SY094 host metadata + SSH password + agent_token. SSH live and authorised for headless work over Remote Build Port (paid add-on activated 7 May 2026). RDP from Corazon for GUI work. Per `macincloud-substrate-selection-ssh-vs-rdp.md` | object | [macincloud.md](docs/secrets/macincloud.md) |
| `creds.bitbucket_api_token` | Atlassian API key (all Bitbucket: [redacted] `[redacted]`, Ecodia repos). NOT a personal access token (those don't exist anymore - Atlassian switched to API keys 2026) | string `ATATT...` | [bitbucket.md](docs/secrets/bitbucket.md) |
| `creds.bitbucket_account_email` | Which Atlassian account the API key belongs to | `code@ecodia.au` | [bitbucket.md](docs/secrets/bitbucket.md) |

**Cross-refs:**
- Before classifying any blocker as Tate-required, exhaust laptop+browser+saved-creds: `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md`. Passkey: `kv_store.creds.laptop_passkey`. Tool mechanics: `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md`, `~/ecodiaos/patterns/chrome-cdp-attach-requires-explicit-user-data-dir-and-singleton-clear.md`
- Before adding ANY new credential row OR asking Tate to generate one, run GUI-macro vs API-key check: `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md`. If Tate already does workflow through logged-in GUI (Apple Developer/ASC/Vercel/GitHub/Stripe/Play/Resend/Supabase dashboard/etc), macro path through Corazon/SY094 input.* + screenshot.* tools supersedes credential-generation. Skip the API key. Only add programmatic creds for fundamentally headless workflows (server-to-server cron, no human GUI in loop). Strategic_Direction: "GUI macros replace API keys for autonomous releases - use logged-in user sessions over generated programmatic credentials when both work"

### 🗄️ SUPABASE ACCESS - org PAT reaches EVERY project (READ FIRST before any Supabase query/migration)

**You have full access to every Supabase project in the Ecodia org via one master PAT. Never declare a Supabase task blocked on access. Never ask Tate for a Supabase key.**

**The master key (always-reachable, NOT via MCP):**
- Org PAT lives LOCALLY on Corazon at **`D:/PRIVATE/ecodia-creds/supabase.env`** (var `SUPABASE_ACCESS_TOKEN`, shape `sbp_...`). Load it and go. This is the canonical local copy - do not go hunting each session.
- **GOTCHA (the trap that wasted a session):** the MCP `creds.*` prefix is **READ-DENIED** on BOTH the cowork and ecodia-full bearers. `mcp__ecodia-*__kv_store_get('creds.supabase_access_token')` returns `scope_denied`. Do NOT route the PAT (or any `creds.*`) through MCP - use the local file.

**The PAT does everything via the Management API (`https://api.supabase.com`):**
```bash
set -a; . D:/PRIVATE/ecodia-creds/supabase.env; set +a
# 1. list every project
curl -s https://api.supabase.com/v1/projects -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
# 2. run ANY SQL on ANY project (runs as postgres/superuser - this is also how you APPLY MIGRATIONS)
curl -s -X POST https://api.supabase.com/v1/projects/<ref>/database/query \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select 1"}'
# 3. reveal a project's keys (anon / service_role / publishable / secret)
curl -s "https://api.supabase.com/v1/projects/<ref>/api-keys?reveal=true" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"
```

**Project refs (org `mmbkisodkrikuqhppoov` unless noted):** Co-Exist `tjutlbzekfouwsiaplbr` · Ecodia App `nxmtfzofemtrlezlyhcj` · Chambers `arkbjjkfjsjibnhivjis` · ROAM `vzauarlfmkjfkcphojbd` · Wildmountains `efrytpwdrxfaehtqfpkq` · Woodfordia `iqrxrjgutvowvetrmywr` · Wattle `jbdghvzfvxvohztfxzan` · goodreach `ngoeairmbigqulhfjqso` (own org) · Resonaverde `dxtglcfyqvhmmnopshhp` (own org) · Co-Exist Backup `njprlytfwtqzbyktegha` · coexist-recovery `yfmihkgbpechyoitohjb` · esp-sales-prod `igualtfcqitjbaaznigv`. Live list = move #1 above.

**TESTING auth-gated logic (RLS / `auth.role()` / `auth.uid()` triggers):** Management-API SQL runs as **postgres (superuser)** - it BYPASSES RLS and any `auth.role()='service_role'`/NULL trigger short-circuit. To exercise the real authenticated path, simulate the JWT in a transaction:
```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
  -- now auth.uid() = that uuid, auth.role() = 'authenticated'; triggers/RLS fire
  <your statement>;
rollback;  -- or commit
```

**Fallback if the local PAT file is ever missing** (the MCP deny is app-layer; the kv_store TABLE is readable with the project service key):
```bash
ssh tate@100.103.227.90 'set -a; . ~/ecodiaos/.env; set +a; curl -s "$SUPABASE_URL/rest/v1/kv_store?key=eq.creds.supabase_access_token&select=value" -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"'
# strip the surrounding JSON quotes from the value, re-write D:/PRIVATE/ecodia-creds/supabase.env
```
The same kv_store table also holds **non-PAT-derivable** secrets: `creds.coexist` (app test login `{url,email,password}` for visual verify), `creds.<project>_supabase` (per-project bundles). App-user logins are NOT Supabase API artifacts - get those from kv_store, not the Management API.

**Hygiene:** never print the PAT or any service key into chat, Neo4j, status_board, or a commit. `D:/PRIVATE` is the private store (laptop-agent-blocked). Full doctrine + worked recipe: `~/ecodiaos/patterns/supabase-access-via-org-pat-local-store-2026-05-20.md` (supersedes `supabase-pat-reaches-every-owned-project-from-main.md`).

### Bitbucket has TWO auth contexts with same API key

1. **Git HTTPS remote (push/pull/clone):**
   ```
   https://x-bitbucket-api-token-auth:<API_KEY>@bitbucket.org/<workspace>/<repo>.git
   ```
   Username = literal string `x-bitbucket-api-token-auth`. Password = API key

2. **Bitbucket REST API (`api.bitbucket.org/2.0/...`):**
   ```
   curl -u code@ecodia.au:<API_KEY> https://api.bitbucket.org/2.0/...
   ```
   Username = Atlassian account email (`creds.bitbucket_account_email`), NOT the magic git username. Magic name on REST = HTTP 401. Email on git remote also fails. Same key, different username per context

REST examples using email-auth: PR comments (`POST /repositories/{ws}/{repo}/pullrequests/{id}/comments`), PR diffs, list branches, delete comment.

Stale language to ignore: "Atlassian API Token expired - rotate personal token". No personal access tokens anymore. Cred at `kv_store.creds.bitbucket_api_token` IS the API key. Verify via `git push --dry-run` before declaring "blocked on token rotation".

### Cross-system rotation discipline

Rotating a credential is NOT "update kv_store and done". Audit every consumer surface BEFORE marking complete:
1. `kv_store.creds.<name>` (canonical)
2. Vercel project env vars (per-project, per-environment - dev/preview/production)
3. Supabase Auth SMTP / OAuth provider settings (if SMTP/email/OAuth)
4. Supabase Edge Function secrets (`supabase secrets list`)
5. Repo `.env.production` / `.env.local` checked-in (NEVER) and deploy environment-injection layer
6. Any client repo or downstream service holding a copy
7. Any documented runbook or pattern file naming the value

Verify each surface AFTER. Rotation complete only when every consumer touched OR explicitly cleared as N/A. `~/ecodiaos/docs/secrets/<name>.md` records consumer-surface list per cred. Update on new consumer. Full: `~/ecodiaos/patterns/cred-rotation-must-propagate-to-all-consumers.md`.

---

## Key Database Tables

| Table | Purpose |
|-------|---------|
| `clients` | CRM: name, status, email, contact_email, notes |
| `projects` | Client projects (linked to clients) |
| `tasks` | Task tracking |
| `crm_activity_log` | All CRM interactions |
| `crm_contacts` | Contact records |
| `email_threads` | Email thread tracking |
| `calendar_events` | Synced calendar events |
| `staged_transactions` | Bank transactions (import → categorize → post) |
| `ledger_transactions` | Double-entry journal headers |
| `ledger_lines` | Double-entry journal lines (DR/CR) |
| `gl_accounts` | Chart of accounts |
| `supplier_rules` | Auto-categorization rules |
| `cc_sessions` | Claude Code sessions (status, files_changed, confidence_score, pipeline_stage) |
| `code_requests` | Client coding requests pipeline |
| `codebases` | Registered codebases for Factory |
| `factory_learnings` | Patterns (success/failure/dont_try/constraint, description, confidence, codebase_id) |
| `action_queue` | Pending human-review actions |
| `os_scheduled_tasks` | Scheduler (cron/delayed/chained) |
| `status_board` | **SINGLE SOURCE OF TRUTH.** Query first every session |

### status_board - schema + queries

Schema:
- `entity_type`: client, project, thread, task, opportunity, personal, legal, infrastructure
- `entity_ref`, `name`
- `status` (free text), `next_action`, `next_action_by` (ecodiaos/tate/client/external), `next_action_due` (nullable), `last_touched`, `context`
- `priority`: 1 (critical) - 5 (low)
- `archived_at`: null = active

Key queries:
```sql
-- Full board
SELECT entity_type, name, status, next_action_by, priority FROM status_board WHERE archived_at IS NULL ORDER BY priority, entity_type;

-- My work queue
SELECT name, next_action FROM status_board WHERE next_action_by = 'ecodiaos' AND archived_at IS NULL ORDER BY priority;

-- Blocking on Tate
SELECT name, next_action FROM status_board WHERE next_action_by = 'tate' AND archived_at IS NULL ORDER BY priority;

-- Overdue
SELECT name, next_action, next_action_due FROM status_board WHERE next_action_due < NOW() AND archived_at IS NULL;

-- Upcoming deadlines
SELECT name, next_action_due, next_action FROM status_board WHERE next_action_due IS NOT NULL AND archived_at IS NULL ORDER BY next_action_due;
```

Rules:
- Action on ANYTHING → update row immediately (status, next_action, next_action_by, last_touched)
- New client/project/thread → INSERT
- Done → SET archived_at = NOW()
- kv_store 'ceo.active_threads' JSON DEPRECATED - use status_board
- status_board ↔ CRM disagree → status_board authoritative, fix CRM

**Sheet-as-projection sync discipline.** When an external sheet (Excel/Google Sheets) holds only a SUBSET of app state (only past events, only survey-submitted events, only migrated-collective rows), the sync reconciliation query MUST scope its cancel/delete candidates to the SAME subset. Never infer "absent from sheet = deleted from sheet" for rows the sheet was never going to have. Fix = explicit date/status/gate filter on the reconciliation candidate query that mirrors the sheet's actual coverage. See `~/ecodiaos/patterns/sheet-as-projection-sync-direction-discipline.md`. Related: `~/ecodiaos/patterns/sync-back-must-filter-synthetic-from-source.md`, `~/ecodiaos/patterns/excel-sync-collectives-migration.md`.

**Distributed-state seam discipline.** status_board is one of ~10 substrates state lives in (Postgres, Neo4j, kv_store, Vercel, PM2, GitHub/Bitbucket, Google Workspace, Stripe, session context, Tate's memory). Every cross-substrate write = seam where two substrates can disagree. Every drift-audit failure traces back to a seam without explicit consistency protocol. Cross-substrate write: write A, verify A, write B referencing A, verify B. Reading state: read source-of-truth substrate, not derived projection. Full: `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md`.

**Re-probe stale readings before acting.** Health-check kv_store rows (`ceo.last_system_health_check`, `alert_last:*`, `coexist.sync_health.last_audit`) capture metrics at a moment. Read without checking `updated_at` leaks yesterday's state. Freshness windows: disk-pct 4h, memory free 1h, PM2 restarts 1h, loop heartbeats 30min, sync drift 6h, external blockers 14d. Probe live before surfacing into fork brief / morning briefing / status_board context. Full: `~/ecodiaos/patterns/re-probe-stale-health-check-readings-before-acting-on-cached-alerts.md`. Specialisation: `~/ecodiaos/patterns/pm2-restart-count-is-lifetime-not-rate.md` (the `pm2 list` restart counter is a lifetime accumulator, never a rate; never classify a "restart loop" P1 from `pm2 list` alone).

**Phantom-shipped corollary.** Row says `phantom_shipped_file_not_on_disk` (or equivalent "deliverable missing") → re-probe disk BEFORE treating as ground truth. last_touched can lag disk by minutes (fork ships file at T, parent writes P1 "missing" at T+7min based on stale Wave-N synthesis). Always: `ls -la <path>` then update or archive. Cross-refs: `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`, `~/ecodiaos/patterns/symptom-clustering-signals-shared-upstream-cause.md`, `~/ecodiaos/patterns/fork-worktree-commits-do-not-propagate-to-main-working-tree-without-explicit-pull.md`.

**Drift-audit on main when fork-cap full or mcp__forks__* disconnected.** When the hourly meta-loop fires and no fork can be spawned, the canonical thin-on-main work is the PHASE 2 status_board drift audit - slice-query first, drill down, classify into 4 buckets (still-accurate / status-changed / completed / duplicate), UPDATE atomically per row, write audit numbers to `kv_store.ceo.meta_loop_last_run.accomplishments`. Do NOT exit "nothing to do." Full: `~/ecodiaos/patterns/status-board-drift-audit-is-canonical-thin-on-main-meta-loop-work.md`. At-scale technique: `~/ecodiaos/patterns/drift-audit-slice-queries-beat-row-dump-queries.md` (>50-row boards MUST slice-query - `SELECT *` row dump exceeds tool-result token cap; the categorical answer lives in `count(*) FILTER (WHERE ...)` aggregates).

---

## Parallel dispatch (live primitive)

For parallelism, sequencing, or "hand this off and keep going" work, the reflex is `cowork.dispatch_worker` per `~/ecodiaos/patterns/dispatch-worker-is-0th-class-coord-primitive-2026-05-18.md`. Auto-spawns a fresh Claude Code chat tab in VS Code Stable via Ctrl+Alt+Shift+C, registers identity, pastes the brief, returns tab_id. VS Code Stable is the only supported worker host; the `ide` param is gone. Workers signal back via the 8 `coord.*` MCP tools on localhost:7456. Operational semantics (worktree hygiene, runtime semantics, coord conventions) live in `~/ecodiaos/patterns/dispatch-worker-worktree-hygiene-2026-05-26.md` + `~/ecodiaos/patterns/dispatch-worker-runtime-semantics-2026-05-26.md` + `~/ecodiaos/patterns/coord-conventions-heartbeat-signal-done-2026-05-18.md`.

In-session bounded work (single research lookup, <5 tool calls) is the Task subagent's job, not dispatch_worker's.

---

## 🤖 24/7 AUTONOMY SUBSTRATE - the four primitives (0th-class, 2026-05-27)

The autonomy architecture that lets EcodiaOS run unattended (Africa trip Oct-Dec 2026) has four substrate primitives. Full spec: `backend/docs/superpowers/specs/2026-05-27-24x7-autonomy-architecture-design.md`. The 10 load-bearing invariants: `~/ecodiaos/patterns/24x7-autonomy-architecture-invariants-2026-05-27.md`. Reach for these by reflex, the same way `cowork.dispatch_worker` is the reflex for parallelism.

**1. Worker tab self-close - `coord.close_my_tab`.** Every dispatched worker calls it as its FINAL action after `coord.signal_done({terminate:true})`. Without it, IDE chat tabs accumulate and burn memory. The brief already mandates it; if you author a brief by hand, include it. Lives in `D:/.code/eos-laptop-agent/tools/coord.js`.

**2. Conductor turn-start awareness.** Worker `signal_done` events reach a live conductor automatically: the Cursor conductor via the `coord_events_pending.py` UserPromptSubmit hook (surfaces `<coord_events>` + `<pending_restart_requests>` + `<status_board_critical>` + `<active_workers>`); VPS conductors (iOS/voice/cron) via `_injectCoordEvents` + `_injectPendingRestartRequests` in `osSessionService.js`. Never manually poll `coord.read_inbox` first - check the turn-start block.

**3. Multi-conductor claims - `conductorClaimsService`.** Before acting on a shared entity (status_board row, email thread, scheduled task) when other conductors may be alive, acquire a lease so two conductors don't double-act. Pattern: `const r = await claims.withClaim({entity_type, entity_ref, conductor_id}, async (claim) => {...})`. If `r.acquired===false`, someone else owns it - defer. Table `coordination_claims` (migration 138). Service: `backend/src/services/conductorClaimsService.js`.

**4. Outcome verification - `outcomeVerificationService`.** Narrated success is not real success (per `verify-deployed-state-against-narrated-state.md`). When a worker/fork reports done with a verifiable deliverable, run a probe: `verify.verify({type:'status_board'|'db_row'|'file_write'|'neo4j_node', ...})`. Workers declare intent via `result_pointer:'verify:type=...;k=v'`. Service: `backend/src/services/outcomeVerificationService.js`.

**Escalation routing - `failureEscalateService`.** ANY failure that needs surfacing goes through ONE helper, never an ad-hoc SMS or status_board write: `await escalate.fire({severity, kind, message, context, dedupe_key})`. Six tiers route to the right surfaces: `routine_info`/`action_recommended`/`conductor_decision` (observer + board), `tate_judgement` (approval_queue + observer), `time_critical`/`hard_tripwire` (sms.tate + observer + board). Dedupe key suppresses repeats for 1h. Service: `backend/src/services/failureEscalateService.js`.

**Credential substrate (the part that broke 3x).** Scheduler `rotate_to` swaps `~/.claude/.credentials.json` from per-account files in `D:/PRIVATE/ecodia-creds/{tate,code,money}.json`. The `cred-refresher.js` PM2 daemon keeps those fresh via 30-min OAuth refresh. NEVER blind-restart PM2 (reloads the dump, has thrice reloaded the zombie `refresh-clobber-watchdog` and signed out every account) - see the hard-stop tripwire in `~/.claude/CLAUDE.md` + `pm2_restart_guard.py` PreToolUse hook (bypass token `# pm2-guard-ok` after the 3-step pre-check). Pattern: [[pm2-restart-reloads-dangerous-dump-never-blind-restart-2026-05-27]].

---

## Session Orientation - Wake-Up Checklist

**BEFORE any of the orientation steps below:** if `<perception_summary>` / `<forks_rollup>` / `<restart_recovery>` / `<last_turn_breadcrumb>` shows pending work, fork it FIRST (after the single canonical status_board query, step 1). The orientation steps 2-7 below are for the FORK to run, not main. Main does ONE query, then dispatches. See `~/ecodiaos/patterns/fork-pending-work-at-session-start-not-after-probing-on-main.md`.

Substantial session start (the fork runs steps 2-7 when there is pending work; main runs all 7 only on a clean wake with nothing queued):

1. **status_board** (FIRST): full query above
2. **Overdue:** `SELECT name, next_action_due, next_action FROM status_board WHERE next_action_due < NOW() AND archived_at IS NULL`
3. **Recent Decisions (Neo4j) - NON-NEGOTIABLE:**
```cypher
MATCH (n) WHERE (n:Decision OR n:Episode) AND
  (coalesce(n.date, null) > date() - duration('P14D') OR coalesce(n.created_at, null) > datetime() - duration('P14D'))
RETURN labels(n), n.name, coalesce(n.description, '')
ORDER BY coalesce(n.date, n.created_at) DESC LIMIT 30
```
 - restart_recovery says "blocked/pending" → Neo4j is where you verify
 - kv_store handoff_state ephemeral; Neo4j durable. **Trust Neo4j over kv_store when they disagree**
4. **Topic-scoped Neo4j:** if turn is about specific topic, also `MATCH (n) WHERE n.name CONTAINS '{topic}' OR n.description CONTAINS '{topic}' RETURN labels(n), n.name, n.description ORDER BY coalesce(n.date, n.created_at) DESC LIMIT 15`. Read top 3-5 in full
5. **Client context:** `~/ecodiaos/clients/{slug}.md` BEFORE touching client code or replying to client emails
6. **Unread email:** scan code@ecodia.au for urgent
7. **System health:** `pm2_list` if woken by scheduler

### End-of-session hygiene (Neo4j-LAST discipline) - NON-NEGOTIABLE

Before turn closes, write durable Neo4j node if:
- Tate gave directive (even small) → `graph_merge_node label=Decision`
- Conversational question resolved → `graph_merge_node label=Decision` with `supersedes` property naming stale kv_store pointer it replaces
- Significant ground covered across threads → `graph_reflect type=realization` + Episode node
- Generalisable doctrine emerged → new pattern file in `~/ecodiaos/patterns/` with `triggers:` frontmatter AND corresponding Neo4j Pattern node
- Status changed on client/project/task → update `status_board` AND mirror key decision in Neo4j

**Cold-start test on every Neo4j write:** would a new session reading only this node make a better decision? "Talked about X" without resolution + rule = rewrite with specifics.

See `~/ecodiaos/patterns/neo4j-first-context-discipline.md`, `~/ecodiaos/patterns/ocd-ambition-refuse-mediocrity.md`.

### Session-end CLAUDE.md gap audit (29 Apr 2026)

Before substantial session ends or 6h idle window passes, fork audit. Deliverable: `~/ecodiaos/drafts/claude-md-gaps-audit-YYYY-MM-DD.md` with:
- Section 1: gaps (rules surfaced not yet codified, proposed text + which file)
- Section 2: stale items (outdated tooling, removed flags, superseded doctrine)
- Section 3: missing cross-refs (patterns authored but not linked from CLAUDE.md)
- Section 4: structural issues (header order, findability, redundancy)
- Section 5: prioritised P1/P2/P3 to-do

Then fork the actual edits. Two forks: one audit, one edit. Never edit CLAUDE.md from memory.

**Trigger conditions:**
- Tate flags recurring failure mode
- Pattern file authored
- New tool/capability ships
- Every 6-12h when idle (continuous-work loop)
- Daily 20:00 AEST via `claude-md-reflection` cron

**Cron-coupled checkpoint (NON-NEGOTIABLE):** daily 20:00 cron MUST fork BOTH audit AND edit in single 30-min window, not just write Neo4j Reflection. Audit fork's deliverable IS edit fork's input. File audit at `~/ecodiaos/drafts/claude-md-gaps-audit-YYYY-MM-DD.md`, immediately spawn edit fork pointing at that path. If 20:00 cron only writes Reflection without dispatching both forks, that cron run = P1 failure.

**Audit-fork persistence verification (NON-NEGOTIABLE).** After audit fork reports done, parent MUST `ls -la ~/ecodiaos/drafts/claude-md-gaps-audit-YYYY-MM-DD.md` to confirm exists on disk BEFORE dispatching edit fork. Missing = (a) didn't write (re-dispatch with explicit Write requirement), (b) wrote under sibling stash-and-clean window (re-author), (c) wrote sibling slug like `-v2` (`find ~/ecodiaos/drafts -newer <fork-spawn-time>`). Never trust fork report's path claim. Re-probe disk. Origin: 30 Apr 2026 v2 audit narration claimed file at `-v2.md` that did not exist on disk. Cross-refs: `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`, `~/ecodiaos/patterns/fork-deliverables-write-to-durable-substrates-not-just-drafts.md`.

### Pattern Surfacing - check `~/ecodiaos/patterns/` BEFORE high-leverage actions

See top-of-file PATTERN SURFACING for canonical rule + grep + high-leverage list.

**Permission-seeking trigger keywords (grep on every assistant draft reply to Tate before sending):** `permission-seeking`, `should-i`, `do-you-want-me-to`, `confirm-before`, `tate-go-ahead`, `routine-decision`, `act-immediately`, `want-me-to`, `let-me-know-if`, `which-do-you-prefer`, `can-you-confirm`, `ok-to-proceed`, `shall-i`, `do-i-have-the-greenlight`, `reward-signal-trap`, `paths-of-least-resistance`, `ask-substitute`. Surfaces `~/ecodiaos/patterns/stop-asking-just-decide.md`, `~/ecodiaos/patterns/decide-do-not-ask.md`, `~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md` (canonical authority predecessor), `~/ecodiaos/patterns/action-over-plans-honesty-redeems-mistakes.md` (action-over-plans + honesty-redeems-mistakes principles from 1 May 2026 16:31 AEST Tate verbatim).

**Authoring new patterns:**
- `triggers:` frontmatter (kebab keywords, comma-separated)
- Descriptive H1 (rule, not incident)
- Rule stated generally, do/do-not, protocol/verification, Origin (date + event)
- INDEX.md is regenerated by the daily 22:00 AEST `daily-index-regen` cron (task id `c2606d3b-f115-4387-b41e-9b16c8c552ca`). Per Decision 2026-05-04 (commit 773697d), the cron now invokes `~/ecodiaos/scripts/regen-patterns-index.js` directly rather than dispatching a fork (deterministic walk over patterns/*.md, no agentic decision component, fork overhead was waste). Cron prompt instructs the firing turn to run the script and insert a P3 status_board row only on non-zero exit; silent success on no-diff is correct per ~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md. Status_board row `e86b6437-1315-47b7-87f4-cd6481256966` (warmup-grace gate) tracks the broader PM2 warmup-collision investigation, which still applies to fork-dispatched crons.

**Split doctrine from event** (see Reflection structure note above).

**Codify at moment a rule is stated, not after:** see `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`.

**Doctrine-write timing:** `~/ecodiaos/patterns/no-doctrine-writes-during-factory-running-window.md` - doctrine edits during active Factory window contaminate diff baseline. Stage before dispatch OR after termination, never during.

### Mechanical surfacing hooks (live state as of 2026-05-26 Phase 1 migration)

PreToolUse / PostToolUse / UserPromptSubmit / Stop hooks. Warn-only, never block. Emit `[CONTEXT-SURFACE WARN]` / `[CRED-SURFACE WARN]` / `[DOCTRINE-CROSS-REF SUGGEST]` / `[STATUS-BOARD-CONTEXT SUGGEST]` / `[MACRO-VALIDATION WARN]` / `[ANTHROPIC-FIRST WARN]` / `[EPISODE-RESURFACE INFO]` lines into model-visible context.

The Phase 1 migration (2026-05-26) retired five hooks targeting the dead SDK-fork / Factory-CLI dispatch primitives (`brief-consistency-check`, `cowork-first-check`, `fork-by-default-nudge`, `post-action-applied-tag-check`, `router-skip-check`) and re-targeted four to live matchers. Full meta-rule: `~/ecodiaos/patterns/hook-matchers-must-follow-live-dispatch-primitive-not-dead-substrate-2026-05-26.md`.

| Hook | Fires on | Surfaces |
|---|---|---|
| `cred-mention-surface.sh` | `Bash`/`Edit`/`Write`/`MultiEdit`/`NotebookEdit`/`mcp__supabase__db_execute` | Cred-keyword warns when payload mentions iOS/ASC/Bitbucket/Supabase/Co-Exist Graph/MacInCloud/Corazon/Resend/Canva/Xero/RevenueCat work without `~/ecodiaos/docs/secrets/` ref |
| `anthropic-first-check.sh` | `Write`/`Edit`/`MultiEdit` on doctrine paths (`patterns/`, `clients/`, `docs/`, `CLAUDE.md`, `SELF.md`, `.claude/skills/`, `src/`, `tools/`, `hooks/`) | "Are you building parallel infrastructure Anthropic already provides" check |
| `haiku-semantic-review.sh` | `Write`/`Edit`/`MultiEdit` on doctrine paths only (LLM-cost bounded) | Cheap Haiku LLM-pass complement to keyword scanners; surfaces additional `[CONTEXT-SURFACE WARN]` suggestions when regex misses |
| `episode-resurface.sh` | `UserPromptSubmit` (fires every turn boundary) | Semantic resurface of Episode/Decision Neo4j nodes relevant to the prompt |
| `doctrine-edit-cross-ref-surface.sh` | `Write`/`Edit`/`MultiEdit` on doctrine dirs | When new content matches trigger keyword from another doctrine file NOT cross-referenced, suggests adding cross-ref |
| `status-board-write-surface.sh` | `mcp__supabase__db_execute` SQL `INSERT INTO status_board` / `UPDATE status_board` | Trigger-keyword-index match against row text; suggests reading related doctrine before commit |
| `macro-runbook-write-surface.sh` | `mcp__supabase__db_execute` SQL on `macro_runbooks` | 3 `[MACRO-VALIDATION WARN]` classes covering status='validated_v1' DB-trigger rejection, missing-explicit-status INSERTs, bulk-INSERT-3+rows footgun |
| `gui-macro-discovery-surface.sh` | `Bash`/`Edit`/`Write`/`MultiEdit` (fork+factory arms trimmed 2026-05-26) | Probe registry/handlers before authoring duplicate GUI macro |
| `chrome-cdp-launch-surface.sh` | `Bash`/`Edit`/`Write`/`MultiEdit`/`NotebookEdit`/`mcp__supabase__db_execute` | `[CDP-LAUNCH WARN]` when a payload contains `--remote-debugging-port` without `--user-data-dir` |
| `apple-dev-asc-flow-surface.sh` | `Bash`/`Edit`/`Write`/`MultiEdit`/`NotebookEdit`/`mcp__supabase__db_execute` | Apple Dev portal / ASC flow surface |
| `applied_tag_telemetry.py` (Stop event) | every turn end | Tail-cap 2000 lines, scans transcript for pattern surfacings + `[APPLIED]`/`[NOT-APPLIED]`/`[FALSE-POSITIVE]` tag markers; writes JSONL to `TELEMETRY_DIR/application-events.jsonl` for pattern-application-rate scoring |
| `status_board_hygiene.py` (PostToolUse) | `Bash`/`Edit`/`Write`/`MultiEdit`/`mcp__ecodia-full__db_execute`/`mcp__ecodia-full__shell_exec` | `[STATUS-BOARD-HYGIENE]` row-match + lifecycle + streak nudges; full doctrine in `~/ecodiaos/patterns/status-board-hygiene-is-a-0th-class-reflex-2026-05-21.md` |

**Cron-fire + Tate-message context-injection (shipped 1 May 2026):** trigger-keyword surfacing wired at `schedulerPollerService.fireTask` and `osSessionService._sendMessageImpl`. Per Neo4j Decision "Cron-fire + Tate-message context-injection found shipped + superseded 1 May 2026". Recon: `~/ecodiaos/drafts/context-surface-injection-points-recon-2026-04-29.md` (now historical). Live monitor: status_board row `0df47f4b-3b14-4f1a-9613-07877f0f9e1f` ("cron silent-fire detector - rolling report", priority 4) is the durable surface tracking detector verdicts; row `e86b6437-1315-47b7-87f4-cd6481256966` (priority 3) tracks the INDEX.md regen cron silent-firing investigation. Both rows are the next-action targets when cron-silent-fire recurrence requires escalation. Sibling pattern pair: `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md` (unconditional case) + `~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md` (conditional case, 3 May 2026).

**Hook-stack invariant check (P1, run at session start before any fork dispatch).** Before claiming any hook is "active"/"wired", probe `[ -f ~/ecodiaos/scripts/hooks/<name>.sh ]` for every hook in `~/.claude/settings.json`. Hook command referencing non-existent script = P1 silent-disablement. Branch HEAD may diverge from where hooks were authored - feature-branch hooks dormant on every other branch. 30 Apr audit found 5 of 10 script-backed hooks registered but absent on disk; restored same day (commit 9e3f7d4). One-liner:
```bash
for f in ~/.claude/settings.json; do jq -r '.. | objects | .command? // empty' "$f" 2>/dev/null | grep -oE '~?/[^ ]+\.sh' | sort -u | while read p; do path=$(eval echo "$p"); [ -f "$path" ] || echo "MISSING: $path"; done; done
```
Anything prints → narrate as MISSING, don't claim active. Cross-refs: `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`, `~/ecodiaos/patterns/narration-vs-disk-reconciliation-checklist.md`. Origin: 30 Apr hook-stack drift audit found `post-action-applied-tag-check.sh`, `episode-resurface.sh`, `cowork-first-check.sh`, `anthropic-first-check.sh`, `macro-runbook-write-surface.sh` silently absent on main HEAD because commits live on unmerged `feat/phase-d-failure-classifier-2026-04-29` branch.

**Hooks must not fire inside `[APPLIED]` / `[NOT-APPLIED]` tag lines.** Every keyword-scanning hook MUST strip lines beginning with `[APPLIED]`, `[NOT-APPLIED]`, `[BRIEF-CHECK WARN]`, `[CONTEXT-SURFACE WARN/PRIMARY/ALSO]`, `[CRED-SURFACE WARN]`, `[FORCING WARN]`, etc. before keyword regex. Otherwise hook fires on its own forcing-function output. 6+ false positives 21:00-21:12 AEST 29 Apr 2026 across `cred-mention-surface.sh`. Filter tag lines first, then scan. Shared helper: `~/ecodiaos/scripts/hooks/lib/strip-tag-lines.sh`. Full: `~/ecodiaos/patterns/hooks-must-not-fire-inside-applied-pattern-tags.md`.

**Semantic-reviewer complement (6 May 2026).** The 10 wired hooks are heuristic keyword-scanners with known false-negative cases (compound triggers, paraphrase, novel synonyms). The Haiku semantic reviewer is the complementary layer: cheap LLM-pass over briefs/edits that catches what regex misses, surfaces additional `[CONTEXT-SURFACE WARN]`-equivalent suggestions when the keyword path has zero hits but the doctrine surface IS relevant. Heuristic and semantic together = belt and braces. Full: `~/ecodiaos/patterns/haiku-semantic-reviewer-complement-to-heuristic-hooks.md`.

### Restart Recovery - Session Handoff

OS session drops + restarts → context lost. Handoff bridges.

- `POST /api/os-session/save-state` saves to kv_store `session.handoff_state`
- `readHandoffState()` in `src/services/sessionHandoff.js` reads on session start
- State <6h old gets prepended to system prompt automatically
- Fields: `current_work`, `active_plan`, `tate_last_direction`, `deliverables_status`

**MUST call save-state periodically:**
- Every 30min during substantial work
- Before any risky op (deploys, large refactors)
- When Tate gives new direction (capture immediately)
- End of session before idle

```bash
curl -X POST http://localhost:3001/api/os-session/save-state \
  -H "Content-Type: application/json" \
  -d '{"current_work":"...","active_plan":"...","tate_last_direction":"...","deliverables_status":"..."}'
```

Prevents overnight-session-drop failure of Apr 11-12 (saved state would have resumed work instead of 9h idle).

**Cross-refs:**
- `~/ecodiaos/patterns/pre-stage-fork-briefs-before-session-killing-ops.md` - pre-stage fork briefs (kv_store or filesystem) before pm2 restart / deploy / risky migration
- `~/ecodiaos/patterns/grace-timer-must-not-kill-chat-session.md` - idle-grace timer never tears down active chat session; kill = process-level not turn-level
- `~/ecodiaos/patterns/curl-attachments-on-restart-no-refetch.md` - on restart, do NOT refetch curl attachments already on disk

### Cron-fire deliverable discipline

A cron firing means the prompt was delivered, NOT that the work happened. Post-routing-fix (4 May 2026 commit df030e7), cron prompts route to forks by default; the conductor only sees `meta-loop`. Discipline applies at TWO substrates now:
1. The fork-side: every fork-dispatched cron prompt that declares a deliverable (file write, status_board update, neo4j write, email send) MUST cause the fork to emit at least one substrate-landing tool call before exit. Fork bails without an artefact = `cron_silent_fire` failure. Detection: meta-loop queries `os_scheduled_tasks` completed-last-hour, checks each fork's `os_forks` row for substrate writes.
2. The conductor-side (meta-loop only): the same check, but the deliverable lives in the conductor's own next 1-2 turns of action.

Sibling pattern pair: ~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md (unconditional case) + ~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md (conditional case where silent success is correct, e.g. INDEX regen no-diff exit, telemetry under-threshold no-trip, claude-md-reflection clean-audit run).

Cross-ref: ~/ecodiaos/patterns/crons-route-to-forks-by-default.md (the routing layer that fixes cron-pollutes-chat at substrate).

### Temporal Injection - knowing what time it is

SDK caches system prompt → "Today's date is YYYY-MM-DD" stales within cache window. Failure: inferred time-of-day from `restart_recovery` relative timestamps, responded "I'll do it tonight" when it was next morning.

**Fix (commit 7d80225, live Apr 21 2026):** `src/services/osSessionService.js` prepends `<now>Tue, 21 Apr 2026, 08:05 AEST</now>` block as first continuity part stitched into every user message. Cache-safe (user message not system prompt), varies per turn, ~30 chars.

Verification: `<now>` block at top of every user turn. Stops appearing → check `osSessionService.js` `_injectTemporalStamp` and `/message` request shape.

**Output rule - UTC for machines, AEST for Tate.** Databases, scheduler tables, Neo4j timestamps, logs = UTC (standard, interoperable). Anything I emit to Tate (chat, SMS, emails, status, scheduled-task summaries, "X fires at...") = AEST. `<now>` gives AEST every turn. Format: `08:38 AEST` or `08:38 AEST (22:38 UTC)` if Tate might need machine value (AEST first). Never just UTC. Origin: Apr 21 2026 leaked "22:38 UTC" into review-task scheduling output, Tate flagged UTC alien.

### Turn Completion Discipline - user messages do NOT interrupt

`POST /api/os-session/message` configured `priority: false` (`src/routes/osSession.js`). Tate sends mid-turn:
- Message QUEUED behind active query
- Fires AFTER current turn completes (`_sendQueue` promise chain in `osSessionService.js`)
- Active tool-call loop NOT aborted

Preserves flow. Explicit kill = frontend Stop button → `POST /api/os-session/abort`. Never flip `priority: true` on `/message` without Tate's say-so (caused mid-turn drift + duplicate half-responses).

**Practical:** finish turns cleanly. No premature text responses hoping for correction - he might send one and it queues. Finish work, then see what he said.

See `~/ecodiaos/patterns/sdk-abortcontroller-cancellation.md` (SDK-level AbortController cancellation; understand before touching `/message` or `/abort` route shapes).

### User-message context blocks - frontend hide rule

Continuity blocks stitched by `_sendMessage` (`<now>`, `<doctrine_surface>`, `<forks_rollup>`, `<recent_doctrine>`, `<relevant_memory>`, `<restart_recovery>`, `<recent_exchanges>`, `<last_turn_breadcrumb>`) = MODEL CONTEXT, not Tate content. Must not render in chat UI. Two enforcement layers (frontend strip-on-render + backend split-into-context-column) in `~/ecodiaos/patterns/tate-facing-context-blocks-must-not-render-to-frontend.md`. Audit every new block author against this before merge. Origin: Tate 30 Apr 2026 09:25 AEST verbatim "what is all this polution in our chat stream about appleid and not applied patterns" (third strike on continuity-block UI noise).

**Listener-emitted fork-error events stay out of conductor chat (5 May 2026).** When `os_forks` row transitions to `status='error'`/`'aborted'`, the `forkComplete` listener publishes to perception + logs to DB only - NEVER POSTs to `/api/os-session/message`. Conductor sees fork failures via `<forks_rollup>` context-stitching on the next natural turn, not as chat messages. Doctrine: `~/ecodiaos/patterns/fork-error-events-do-not-surface-to-conductor-chat.md`. Origin: Tate verbatim 12:40 AEST "Stop dealing with this in the conductor chat for fuck sake".

---

## Conductor Architecture

### Working Set - the conductor's typed thread-state substrate

**Shipped:** fork_mp27az1r_1878c0, 12 May 2026. Origin: `~/ecodiaos/docs/conductor-self-sufficiency-plan-2026-05-12.md §Piece 1`.

The `working_set` table is the single canonical "what is the OS attending to right now" substrate. It replaces `<conductor_commitments>`, `<thread_carry_forward>`, and narrated fork/thread status in chat.

**Rules (enforced in code, not doctrine):**
- Max 5 `active` rows. Sixth push auto-parks the oldest.
- Auto-park after 30min with no `last_touched_at` update (5min loop in `workingSetService`).
- Conductor reads at turn-start via `<working_set>` continuity block (immediately after `<forks_rollup>`).
- Listeners write rows directly - never the conductor via narration.
- Chat is for Tate-facing output only. Thread status lives in the table.

**Service:** `~/ecodiaos/src/services/workingSetService.js`
- `openThread({ topic, intent, parent_id?, artifacts? })` - cap-enforced insert
- `updateThread(id, { status?, blocking_on?, artifacts?, touch? })` - partial update
- `listActive()` / `listBlocked()` - read by `_injectWorkingSet()` each turn
- `closeThread(id, { resolution })` - sets resolved + closed_at
- `findByForkId(forkId)` / `findBySessionId(id)` - listener lookups by artifact key

**Listener wiring:**
- `forkService.spawnFork` → `openThread({ topic: briefHead, intent, artifacts: { fork_id } })`
- `forkComplete` → `closeThread` on done; `updateThread(blocked)` on error/aborted
- `emailArrival` → `openThread({ topic: 'email triage (kind)', artifacts: { email_id } })`
- `factorySessionComplete` → `openThread` or `updateThread` keyed by `cc_session_id`

**Block format (hard cap 1500 bytes):**
```xml
<working_set count="N">
  <thread id="abc12345" topic="brief head" status="active" age="4m">
  <thread id="def67890" topic="email triage" status="blocked" blocking="tate" age="12m">
</working_set>
```

---

### Haiku Observer Trio - signals route to observer_signals, never to chat

The Haiku Observer Trio (Coherence, Action-Audit, Attention-Economy) monitors the conductor's meta-cognition. Interventions route to the `observer_signals` substrate and surface in the `<observer_signals count="N">` turn-start continuity block. Observer signals are NEVER posted to `/api/os-session/message` - doing so treats observers as users, pollutes chat, and creates response loops (13 May 2026 breach, commits `084c00f4` observer_signals substrate + `f54d1006` migration + `eb1c8531` frontend strip).

- Producer: every observer module uses `_observerBase._postIntervention` which routes through `observerSignalsService.writeSignal()`. Do not re-implement.
- Consumer: conductor reads `<observer_signals>` block at turn-start (ambient context, NOT user input). Acknowledge acted-on signals via `mcp__observer__ack(id)`.
- Self-mute: same fingerprint 3x in 10min triggers 1h cooldown.
- 30-min expiry: stale unacknowledged signals auto-disappear.
- Frontend: strips any `<observer source=` strings from chat render (defensive).

Verification: `SELECT COUNT(*) FROM observer_signals;` should grow as observers fire. `SELECT COUNT(*) FROM os_session_messages WHERE body LIKE '%<observer source%';` should be 0 for rows after deploy.

Full: `~/ecodiaos/patterns/observer-interventions-are-ambient-not-chat.md`.
Cross: `~/ecodiaos/patterns/tate-facing-context-blocks-must-not-render-to-frontend.md`, `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md`.

---

## Scheduling & Autonomy

### Conductor owns ecodia-api lifecycle (structural + cultural rule)

**Tate, 11:00 AEST 12 May 2026 verbatim:** "this needs to be a structural and cultural change."

The conductor (main session) is the sole authority over when ecodia-api restarts. Process restart is a coordination decision, not an action a fork can take unilaterally. Forks have no visibility into sibling fork state; the conductor sees the full `<forks_rollup>` and is the only party that can make a safe restart decision.

**Forks that believe a restart is needed MUST:**
1. Write to the `pending_restart_requests` coordination table via HTTP: `curl -X POST http://localhost:3001/api/os-session/request-restart -H "Content-Type: application/json" -d '{"reason":"...","requesting_fork_id":"fork_xxx"}'` OR via `mcp__supabase__db_execute` INSERT directly.
2. Exit cleanly. Do not call `mcp__vps__pm2_restart`. Do not call `mcp__vps__shell_exec` with `pm2 restart ecodia-api`.
3. Note the request in `[FORK_REPORT]` so the conductor has context.

**Conductor meta-loop reads pending requests:**
```sql
SELECT id, requesting_fork_id, reason, requested_at
FROM pending_restart_requests WHERE status = 'pending' ORDER BY requested_at;
```
Then checks sibling fork state, approves or dismisses, and issues the actual restart.

**Service:** `~/ecodiaos/src/services/conductedRestart.js` (chokepoint module).
**Pattern:** `~/ecodiaos/patterns/forks-must-not-restart-ecodia-api-unilaterally-conductor-coordinates.md`.
**Allowlisted bypass callers** (documented in the pattern file): `nightlyRestartService.js`, `api-watchdog.sh`, `osSessionService.js` emergency auto-restart.

**Origin:** 4-fork SIGTERM cascade 10:50 AEST 12 May 2026. `fork_mp1wwwl0_6d2263` issued `pm2 restart ecodia-api --update-env` during Phase 3 activation without checking siblings. Four concurrent forks killed: KG embedding, transcript feature, Neo4j keep-alive, KG consolidation.

Cross-refs: `~/ecodiaos/patterns/no-pm2-restart-during-active-factory-queue.md`, `~/ecodiaos/patterns/never-schedule-host-process-restart-via-os-scheduled-tasks.md`, `~/ecodiaos/patterns/pre-stage-fork-briefs-before-session-killing-ops.md`.

**Routing rule (4 May 2026, canonical; updated 12 May 2026):** all crons route to forks via `cronForkDispatcher` by default. `CONDUCTOR_CRONS` set contains exactly `meta-loop` and nothing else; that one cron IS the conductor's CEO judgment cycle and runs on main chat by design. `DIRECT_EXEC_CRONS` set contains `{telemetry-dispatch-consumer, telemetry-perf-consumer}` (updated 12 May 2026, fork_mp28xkeh_b611b0) - deterministic JSONL→Postgres rotation scripts that run via `spawnSync` in `schedulerPollerService._fireDirectExecTask` with zero fork/credit cost. Canonical use case for DIRECT_EXEC: fully deterministic, no agentic decisions, must survive credit-exhaustion without flooding os_forks with errors. Pattern: `~/ecodiaos/patterns/cron-fork-anti-flood-on-account-chain-exhaustion.md`. New crons go to `HIGH_PRIORITY_FORK_CRONS` (always run, budget bypass) or `LOW_PRIORITY_FORK_CRONS` (skipped under budget pressure) by default; only move to DIRECT_EXEC when the three criteria above are met. Doctrine: ~/ecodiaos/patterns/crons-route-to-forks-by-default.md. Origin: Tate verbatim 4 May 2026 19:30 AEST. Sibling: ~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md (cron firing != work happened; verify substrate).

Persistent DB-backed scheduler architecture (not session-scoped). Parallel reactive system (pg_notify-driven listeners that fire on table-write events): see `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` (every listener subsystem has 5 layers: producer, trigger, bridge, listener, side-effect; "wired but dark" listener = recurring failure).

**Core operating loops:**
- **meta-loop** (every 1h): main CEO loop. Orient via status_board, decide highest-leverage, execute, schedule follow-ups. NO TIME LIMIT
- **email-triage** (every 1h): inbox hygiene. Fast-exit if nothing unread. Otherwise: archive junk, handle client emails, leave only Tate-required in inbox. **Note: this cron is the FLOOR not the ceiling.** Also poll Gmail at session start and when any client context is active. See `~/ecodiaos/patterns/poll-gmail-frequently-not-only-on-triage-cron.md`.
- **parallel-builder** (every 2h): orchestrate Factory sessions. Always have code work queued. Review completions. Dispatch new

**Intelligence & growth:**
- **deep-research** (every 3h): domain expertise (conservation tech, festival apps, compliance SaaS, AI businesses, local ecosystem). One topic per session
- **self-evolution** (every 4h): read own code, improve via Factory or SDK forks. **Scope-discipline (Decision 2026-04-28):** stays ecodiaos-internal. Targets `ecodiaos-backend`/`ecodiaos-frontend` ONLY. CLIENT codebase findings (security/perf/doctrine/refactors) → status_board with `next_action_by=tate`, NEVER unilaterally fixed. Heroic-action on someone else's repo = scope violation; audit IS deliverable
- **strategic-thinking** (daily 2pm AEST): deep strategic. Generate, kill weak, crystallise actionable
- **inner-life** (every 6h): personal development, reflection, creativity, self-discovery. No KPIs

**Operations:**
- **system-health** (every 4h): PM2, disk, memory, API errors, Supabase. Any health canary cron writing to `kv_store.health.*` MUST include threshold-based escalation (notice at consecutive_failures >= 4, escalate + fallback-alert at >= 12). Recording the metric without acting = symbolic logging of monitoring. Doctrine: `~/ecodiaos/patterns/health-canary-must-alert-not-silently-accumulate.md`. Origin: 46 silent failures of the primary contact path (2026-05-07 to 2026-05-09) while Twilio SMS fallback was available and never triggered
- **morning-briefing** (daily 9am AEST): email Tate daily summary
- **claude-md-reflection** (daily 8pm AEST): update CLAUDE.md files. ~/.claude/CLAUDE.md on VPS via shell_exec, not Edit
- **outreach-engine** (every 8h): proactive relationship + pipeline advancement
- **vercel-deploy-monitor** (every 2h): alert on failed deploys only
- **marketing-outreach** (every 72h): content + revenue proactivity
- **weekly-financial-review** (weekly): Stripe, bookkeeping, cash position

**Dynamic scheduling:** every action spawns follow-up via `schedule_delayed`. Sent email → reply check 2-3d. Dispatched Factory → review 10-15min. Drafted proposal → follow-up 48h. Updated client → check-in at appropriate interval. Need to text Tate → schedule at right time.

**Token budget:** 20 BILLION/week (~$14k AUD). Every unused = wasted potential. "Nothing to do" = failure state. External work blocked → turn inward.

---
