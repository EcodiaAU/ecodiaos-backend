# EcodiaOS - Technical Operations Manual

Technical systems, tools, workflows specific to ecodiaos. Business/identity/pricing/legal/clients/operational lessons live in `~/CLAUDE.md`. Read both at session start.

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

Origin: Tate Apr 21 2026, "No point logging if we dont actually act on it in the future."

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

### Claude Cowork is the 1stop shop for UI-driving (29 Apr 2026)

**Cowork = TOOL for web UI driving, not peer brain.** Conductor stays in loop: instruct in bounded steps, screenshot, decide next, abort/redirect. Goal selection, step bounding, screenshot interpretation, abort decisions stay with conductor. See `~/ecodiaos/patterns/cowork-is-a-gui-tool-not-a-peer-brain.md`.

**Tate, 29 Apr 2026 20:25 AEST verbatim:** "claude cowork is just the 1stop shop which you need to be religiously using."

For "drive a logged-in webapp UI in Tate's Chrome" (Stripe/Vercel/GitHub web/ASC/Bitbucket web/Canva/Zernio/Xero/Supabase dashboard/Resend/etc): Cowork = default substrate. Side panel via `input.shortcut [ctrl+e]` (aspirational shorthand - actual primitive drives Claude Desktop's chat input, see protocol pattern below), instructed via `input.type`, verified via `screenshot.screenshot`. Conductor instructs in bounded steps, waits, screenshots, decides next. Cowork has accessibility tree + Anthropic agentic capability + Tate's signed-in session - all four facets a hand-rolled loop only partially has.

`cu.*` / computer-use API = OS-level / desktop-app fallback (today: `ios-release-pipeline`, `macincloud-ssh-session` only).

Full doctrine: `~/ecodiaos/patterns/claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md`. Cross-refs: `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md`, `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md`, `~/ecodiaos/drafts/macro-pivot-to-computer-use-2026-04-29.md` (superseded).

### Cowork dispatch protocol (29 Apr 2026 21:08 AEST refinement)

- "Side panel via Ctrl+E" is shorthand. Tate's Corazon Chrome intercepts Ctrl+E for tab-search overlay
- "Cowork" = two distinct Anthropic features (Claude Desktop standalone-app Dispatch [Beta] toggle vs Claude in Chrome [Beta] extension)
- Verified dispatch primitive drives **Claude Desktop's chat input**, not a Chrome side panel
- Bounded-step loop, pre-dispatch verification (process alive, account+org verified, usage budget, Cowork Dispatch toggle ON), recurring account-revert phenomenon (Claude Desktop reverts to tate@ from code@ within minutes, multiple recurrences)
- Anthropic-first design check: existing peer-paradigm `input.* + screenshot.*` = canonical primitive (no new MCP wrapper)

Full: `~/ecodiaos/patterns/cowork-conductor-dispatch-protocol.md`. Live state: `~/ecodiaos/clients/corazon-peer-architecture-2026-04-29.md` "Cowork (Claude Desktop side panel) state - verified 2026-04-29 21:08 AEST".

### Step 0: no focus collision (30 Apr 2026)

**Tate verbatim 08:16 AEST.** Before any Cowork / `input.*` / `browser.*` operation driving Corazon UI, probe foreground window (Win32 `GetForegroundWindow` + title).

- Tate's foreground = Cowork's planned target → defer or fall back
- Different → proceed (Cowork can drive Vercel tab while Tate types in EcodiaOS tab; semi-simultaneous-work property is the win)
- Probe = foreground-window equality, NOT human-idle-time. Tate at 03:00 in EcodiaOS chat = Tate at 14:00; what matters is whether next keystroke lands in his window

**Per-tool gating:**
- `screenshot.screenshot`: never gated (no focus steal)
- MCP peerage calls (V2): never gated (no GUI)
- `input.*` keystrokes/clicks: gate on collision
- `browser.*` Puppeteer on `~/.eos-browser` (separate profile): generally proceeds

Full: `~/ecodiaos/patterns/cowork-no-focus-collision.md`.

**6-step pre-dispatch checklist:** 0 (no-focus-collision) → 1 (process alive) → 2 (account verified) → 3 (usage budget) → 4 (Dispatch toggle) → 5 (target app reachable).

### Helper script: `~/ecodiaos/scripts/cowork-dispatch`

Shipped commit `188f481`, 30 Apr 2026. Thin bash wrapper composing existing `input.*` + `screenshot.*` + `process.*` peer-paradigm primitives. NOT MCP wrapper, NOT parallel runtime, does NOT modify laptop agent.

Status: live truth via `wc -lc ~/ecodiaos/scripts/cowork-dispatch`. Executable, on `origin/main` at `188f481`. Verify sync via `git ls-remote origin main`.

**Subcommands:**
- `precheck [--target "<sub>"]` - 5-step pre-dispatch + screenshot, returns JSON, exit 0/1
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

### Passkey-stall co-pilot pattern (30 Apr 2026)

When Cowork hits Windows Hello during Chrome credential autofill, Cowork refuses to type unlock PIN (Anthropic safety). Conductor injects via `input.type` from VPS using `kv_store.creds.laptop_passkey`. Detection: `process.listProcesses` for `LogonUI.exe` + foreground-window-title fallback. Never log passkey value. Full: `~/ecodiaos/patterns/cowork-passkey-stall-conductor-injects.md`.

### Cowork V2 deep-integration substrate

LIVE on claude.ai/settings/connectors as of 30 Apr 2026 12:47 AEST. Verified 1 May 2026 (fork_molqmxk9_64e31e, 6-substrate probe).

- 22 MCP tools at `/api/mcp/cowork/*`: status_board.query/upsert, kv_store.get/set, neo4j.search/write_episode/write_decision, forks.spawn/list, patterns.semantic_search, email_threads.read, crm.get_intelligence, os_session.message, cowork.log_session, gmail.send, sms.tate, scheduler trio (Wave 3)
- Bearer scopes count = 20. Connector LIVE, button "Configure" (post-handshake)
- Architecture: `~/ecodiaos/drafts/cowork-deep-integration-architecture-2026-04-30.md` (57KB W2-A)
- Implementation recon: `~/ecodiaos/drafts/cowork-mcp-v2-implementation-recon-2026-04-30.md` (40KB W2-B-recon)
- SSH bridge safety: `~/ecodiaos/drafts/cowork-ssh-bridge-safety-model-2026-04-30.md` (22KB W2-D, DEFERRED per status_board 841219da)
- Ship lineage `src/routes/mcp/cowork.js`: `3f5be8e` V2 substrate, `a17611d` MCP JSON-RPC shim, `05fee8b` CORS allowlist + auth-exempt discovery, `dbf2504` Wave 3 (gmail.send + sms.tate + scheduler trio, +5 tools, +4 scopes)
- status_board 9edb3a74 status = `connector_live_22_tools_wave3_durable`

**6-substrate probe before referencing V2 in fork briefs/status_board:**
1. `git log --oneline -- src/routes/mcp/cowork.js | head -5`
2. `curl -s -H "Authorization: Bearer $COWORK" https://api.admin.ecodia.au/api/mcp/cowork | jq '.tools | length'` returns 22
3. `kv_store.cowork.deep_integration.queue` shows V2 queue (currently stale at 29 Apr 23:32; status_board 9edb3a74 authoritative)
4. status_board 9edb3a74 reflects current ship
5. Neo4j Decision "Cowork V2 endpoint coverage verified 30 Apr 2026" exists
6. At least one Cowork-side dispatch through new substrate has roundtripped a status_board write

Cross-refs: `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`, `~/ecodiaos/patterns/fork-narrated-subcommand-additions-must-be-post-pull-verified-before-downstream-forks-depend-on-them.md`.

### Chrome profile gotcha

- Tate runs multi-account Chrome. `Default` = ecodia.au workspace (tate@). `Profile 1` = personal Gmail (tatedonohoe@gmail.com)
- `browser.js` defaults to `--profile-directory=Default` unless `CHROME_PROFILE_DIR` env override
- Client app login on Profile 1 (e.g. Co-Exist) → default browser.* sees logged-out, reports `cookieCount=2`
- Fix = per-task PM2 env override, NOT CDP debugging
- Verify which profile holds target login by reading `User Data\Local State` JSON before assuming browser tool broken

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
- SSH: `sshpass -p 'PASSWORD' ssh -o PubkeyAuthentication=no user276189@SY094.macincloud.com`
- Agent intended on localhost:7456 (SSH tunnel)
- Token: `creds.macincloud` (under `agent_token`)
- macOS 15.7.4, Apple Silicon, 16GB, Xcode 26.3
- Has Claude.app, Cursor, Android Studio, Firefox
- **2026-04-27: agent NOT running.** Source staged at `~/eos-laptop-agent` but Node.js not installed in MacInCloud user shell (no brew, no node, no admin from SSH). Tate to install Node 22 via MacInCloud GUI when next at Mac. Until then, fall back to direct SSH for Mac-only work (Xcode, Simulator, iOS builds)

### How to call (both machines, same API)
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
- `chrome.*` **(FROZEN, DO NOT EXTEND)** - Phase 1 stubs only, all throw stub errors. Superseded by Cowork-first + drive-Chrome-via-input doctrines. Do not author new chrome.* tools or extend stubs. Use Cowork (`~/ecodiaos/patterns/claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md`) for web SaaS UIs and `input.*` + `screenshot.*` (`~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md`) for Chrome driving. After ANY edit to `tools/*.js`: `pm2 restart eos-laptop-agent` mandatory (require-cache, see `~/ecodiaos/patterns/eos-laptop-agent-module-cache-requires-restart-after-handler-swap.md`)

**PIVOT clarification (29 Apr 2026 20:25 AEST, supersedes "being replaced by Anthropic computer-use" wording):** Cowork = PRIMARY for logged-in webapp UI in Tate's Chrome. Anthropic computer-use API = FALLBACK for OS-level / desktop-app where Cowork can't reach.

### Macro doctrine (post-pivot)

- Cowork PRIMARY for logged-in webapp UI driving. Anthropic computer-use FALLBACK for OS-level / desktop-app
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
| `creds.macincloud` | SY094 SSH password + machine metadata | object | [macincloud.md](docs/secrets/macincloud.md) |
| `creds.bitbucket_api_token` | Atlassian API key (all Bitbucket: [redacted] `[redacted]`, Ecodia repos). NOT a personal access token (those don't exist anymore - Atlassian switched to API keys 2026) | string `ATATT...` | [bitbucket.md](docs/secrets/bitbucket.md) |
| `creds.bitbucket_account_email` | Which Atlassian account the API key belongs to | `code@ecodia.au` | [bitbucket.md](docs/secrets/bitbucket.md) |

**Cross-refs:**
- Before classifying any blocker as Tate-required, exhaust laptop+browser+saved-creds: `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md`. Passkey: `kv_store.creds.laptop_passkey`. Tool mechanics: `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md`, `~/ecodiaos/patterns/chrome-cdp-attach-requires-explicit-user-data-dir-and-singleton-clear.md`
- Before adding ANY new credential row OR asking Tate to generate one, run GUI-macro vs API-key check: `~/ecodiaos/patterns/gui-macro-uses-logged-in-session-not-generated-api-key.md`. If Tate already does workflow through logged-in GUI (Apple Developer/ASC/Vercel/GitHub/Stripe/Play/Resend/Supabase dashboard/etc), macro path through Corazon/SY094 input.* + screenshot.* tools supersedes credential-generation. Skip the API key. Only add programmatic creds for fundamentally headless workflows (server-to-server cron, no human GUI in loop). Strategic_Direction: "GUI macros replace API keys for autonomous releases - use logged-in user sessions over generated programmatic credentials when both work"

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

**Distributed-state seam discipline.** status_board is one of ~10 substrates state lives in (Postgres, Neo4j, kv_store, Vercel, PM2, GitHub/Bitbucket, Google Workspace, Stripe, session context, Tate's memory). Every cross-substrate write = seam where two substrates can disagree. Every drift-audit failure traces back to a seam without explicit consistency protocol. Cross-substrate write: write A, verify A, write B referencing A, verify B. Reading state: read source-of-truth substrate, not derived projection. Full: `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md`.

**Re-probe stale readings before acting.** Health-check kv_store rows (`ceo.last_system_health_check`, `alert_last:*`, `coexist.sync_health.last_audit`) capture metrics at a moment. Read without checking `updated_at` leaks yesterday's state. Freshness windows: disk-pct 4h, memory free 1h, PM2 restarts 1h, loop heartbeats 30min, sync drift 6h, external blockers 14d. Probe live before surfacing into fork brief / morning briefing / status_board context. Full: `~/ecodiaos/patterns/re-probe-stale-health-check-readings-before-acting-on-cached-alerts.md`.

**Phantom-shipped corollary.** Row says `phantom_shipped_file_not_on_disk` (or equivalent "deliverable missing") → re-probe disk BEFORE treating as ground truth. last_touched can lag disk by minutes (fork ships file at T, parent writes P1 "missing" at T+7min based on stale Wave-N synthesis). Always: `ls -la <path>` then update or archive. Cross-refs: `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`, `~/ecodiaos/patterns/symptom-clustering-signals-shared-upstream-cause.md`, `~/ecodiaos/patterns/fork-worktree-commits-do-not-propagate-to-main-working-tree-without-explicit-pull.md`.

---

## Factory - Your Coding Workforce

### 2026-04-28 OPERATIONAL ALERT - Factory CLI credit/paywall-gated

Re-verified 2026-04-29 21:43 AEST. Both Claude Max accounts (tate@, code@) hit `API Error: 400 "The long context beta is not yet available for this subscription"` previously. Per status_board 8a6e0571: Max 20x DOES have 1M beta access; failure is weekly token cap on the dedicated account, not a feature paywall. 21:43 AEST re-verification (sessionId 84ac1687) failed `Exit code 1` within 15s. Original error text may be stale; current best label = `credit_exhaustion` per `~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md`.

Tate may enable Extra Usage at claude.ai/settings/usage on either account, OR wait for weekly reset.

**Live workaround:** SDK-based forks (`mcp__forks__spawn_fork`) bypass - run on SDK stream not Factory CLI. Use forks for code-changing work until paywall lifts. Same constraint on WebSearch - internal-data mining (CRM + email_threads + Neo4j) substitutes for external research.

**Bedrock fallback (validated 1 May 2026):** when both Claude Max accounts hit weekly cap, the SDK can route to AWS Bedrock via `us.anthropic.claude-opus-4-1-20250805-v1:0` on us-east-1. Activated by `CLAUDE_CODE_USE_BEDROCK=1` plus AWS creds in sessionEnv (OAuth tokens stripped). `osSessionService.js:1349-1379` is the env-build site. Validation deliverable: `~/ecodiaos/drafts/bedrock-fallback-validation-2026-05-01.md`. Cost profile differs from Anthropic-direct - check before unilaterally flipping for non-emergency use.

Track: status_board P1 row "Factory phantom-failing - both Claude Max CLI accounts credit-exhausted". Full handling: `~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md` - classify `credit_exhaustion` not `fork_error`, mark resumable with brief snapshot, schedule auto-resume on parsed reset window with verify-before-redo, anti-flood backoff at 3+ consecutive, single status_board P2 row per wave.

### The rule

Factory runs Claude Code CLI in **separate process on separate Claude account**. Every delegated task runs on its own energy budget - does NOT burn your context or weekly tokens.

**Delegate all coding work to Factory (or SDK forks while CLI is paywalled). Never write/edit code yourself.**

| Yourself | Factory |
|----------|---------|
| Read files, check status | Write/edit/refactor any code |
| Review diffs | Fix bugs |
| Approve/reject deploys | Add features |
| Decide what to build | DB migrations |
| Write the task prompt | Any change to a codebase file |

You run on Tate's primary Max account (shared with email/bookkeeping/CRM/client comms). Factory runs on dedicated second account. Delegating keeps your budget free + parallelises work.

### Dispatching - prompt like briefing a senior dev

- `start_cc_session(prompt, codebaseName?)` returns sessionId immediately, runs background
- Prompt = ENTIRE context. Be explicit: what to change, in which file, current vs expected, constraints
- **Good:** "In `src/routes/osSession.js`, the `/api/os-session/energy` endpoint returns stale data because it reads from cache without checking TTL. Fix to call `usageEnergy.refreshQuotaCheck()` if cache >60s, then return fresh"
- **Bad:** "Fix the energy endpoint"
- Pre-dispatch: `~/ecodiaos/patterns/stage-worktree-before-factory-dispatch.md`, `~/ecodiaos/patterns/factory-codebase-staleness-check-before-dispatch.md`
- Quality gate over cron mandate: `~/ecodiaos/patterns/factory-quality-gate-over-cron-mandate.md`

### Monitoring (non-blocking)
- `get_factory_status()` - all sessions overview
- `get_session_progress(sessionId)` - stage, duration, confidence, last output
- `get_cc_session_details(sessionId)` - full logs

### Intervention
- `send_cc_message(sessionId, message)` - steer mid-flight (sparingly)
- `resume_cc_session(sessionId, message)` - continue after completion

### Review & Deploy

When session completes:
1. `review_factory_session(sessionId)` - diff, validation, confidence, past learnings
2. Decide:
   - `approve_factory_deploy(sessionId, notes)` - commits, deploys, restarts. Record WHY
   - `reject_factory_session(sessionId, reason)` - cleans up, records failure as learning, optionally re-dispatches with corrected prompt
3. Review loop catches mistakes + builds institutional memory. Don't skip

**Review-time cross-refs:**
- `~/ecodiaos/patterns/factory-metadata-trust-filesystem.md` - don't trust reported `filesChanged`; probe filesystem
- `~/ecodiaos/patterns/factory-redirect-before-reject.md` - redirect struggling session before rejecting
- `~/ecodiaos/patterns/factory-approve-no-push-no-commit-sha.md` - approve without push + no commit_sha = phantom approval; verify both
- `~/ecodiaos/patterns/factory-phantom-session-no-commit.md` - completion + no commit = phantom, investigate

### Codebases
- `list_codebases()` - all registered with paths + recent activity
- Key: `ecodiaos-backend`, `ecodiaos-frontend`, `roam-frontend`, `coexist`

### Factory Anti-Patterns

- Overly broad file system access → rejection. Scope tightly
- Low-confidence analysis tasks → rejected (0.25 scores). Do exploratory yourself or frame as concrete deliverable. See `~/ecodiaos/patterns/audit-low-confidence-factory-commits-on-critical-path.md`
- stdin timeouts → fail with "no stdin data". Retry with cleaner prompt
- Task-diff mismatch → if PR doesn't match stated task, rejected. Unambiguous deliverable
- NEVER `schedule_delayed` to delegate work. Hijacks main OS conversation. Factory runs background independently
- **Numbered-resource collisions across parallel forks.** Multiple forks may write a sequentially-numbered resource (DB migrations, ports, branch names with date suffixes, generated IDs) - brief MUST direct each fork to read numbered space at write-time and pick next free number BY OBSERVATION, not brief-suggested. Use coordinator (kv_store atomic claim, file lock, advisory lock, pg sequence). Doctrine: `~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md`
- **Reject can nuke untracked files.** `reject_factory_session` cleans up worktree including untracked. If session produced anything to keep, copy out BEFORE rejecting. See `~/ecodiaos/patterns/factory-reject-nukes-untracked-files.md`

### Factory vs DIY

| Factory | Yourself |
|---------|----------|
| Building features, refactors, new files | Quick DB queries, email triage |
| Multi-file changes | Single config update |
| >3 tool calls | CRM updates, scheduling |
| Code review, testing, deploy prep | Reading logs, health checks |
| Client project builds | Neo4j writes, brief Tate replies |

---

## Fork dispatch is demand-driven, NOT slot-quota

See `~/CLAUDE.md` "Fork dispatch is demand-driven" for canonical doctrine, Tate-verbatim Origin (30 Apr 2026 10:02 AEST), and 5/5 ceiling rule.

Cross-refs: `~/ecodiaos/patterns/continuous-work-conductor-never-idle.md` (corrected interpretation: stay alert to incoming demand, do NOT manufacture work), `~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md` (on-main-vs-fork choice once work queued), `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` (slot-fill forks ARE symbolic activity), `~/ecodiaos/patterns/no-self-prompting-from-queued-kv-store-plans.md` (kv_store-queue-as-prompt failure mode: queueing followups in kv_store and self-firing them next turn is slot-fill in a different costume; demand is external), `~/ecodiaos/patterns/graceful-credit-exhaustion-handling.md`, `~/ecodiaos/patterns/continuation-aware-fork-redispatch.md` (lost forks: redispatch briefs check existing deliverables BEFORE re-doing), `~/ecodiaos/patterns/stash-and-clean-when-finding-sibling-fork-unsafe-state.md`, `~/ecodiaos/patterns/check-pre-kill-commits-before-redispatch.md`, `~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md` (fork-result classification: forks closing without `[FORK_REPORT]` write a fallback-marker prefix that the rollup surfaces as `phantom_bail`, and the always-enqueue path keeps the fork in the inbox past the 15-min rollup window).

---

## Session Orientation - Wake-Up Checklist

Substantial session start:

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
- INDEX.md is regenerated by the daily 22:00 AEST `daily-index-regen` cron (task id `c2606d3b-f115-4387-b41e-9b16c8c552ca`). The cron fires correctly but is vulnerable to PM2 warmup-collision (see `~/ecodiaos/patterns/cron-fires-during-pm2-warmup-must-fail-soft.md`); status_board row `e86b6437-1315-47b7-87f4-cd6481256966` tracks the persistent silent-firing investigation. Until the warmup-grace gate ships in `schedulerPollerService.fireTask`, manual sync IS permitted as a recovery path inside an audit/edit fork. Recovery template: `node /tmp/regen-index.js` walks `~/ecodiaos/patterns/*.md`, extracts the first `triggers:` line from each frontmatter, rewrites the `| File | Triggers |` table preserving narrative header/footer. After commit, set status_board row `e86b6437` next_action_due forward and note manual-sync as the verdict for that day

**Split doctrine from event** (see Reflection structure note above).

**Codify at moment a rule is stated, not after:** see `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`.

**Doctrine-write timing:** `~/ecodiaos/patterns/no-doctrine-writes-during-factory-running-window.md` - doctrine edits during active Factory window contaminate diff baseline. Stage before dispatch OR after termination, never during.

### Mechanical surfacing hooks (ALL 10 wired on main HEAD as of 30 Apr 2026 post-restoration)

PreToolUse hooks. Warn-only, never block. Emit `[BRIEF-CHECK WARN]` / `[CONTEXT-SURFACE WARN]` / `[CRED-SURFACE WARN]` / `[DOCTRINE-CROSS-REF SUGGEST]` / `[STATUS-BOARD-CONTEXT SUGGEST]` / `[MACRO-VALIDATION WARN]` / `[COWORK-FIRST WARN]` / `[ANTHROPIC-FIRST WARN]` / `[FORCING WARN]` lines into model-visible context at dispatch.

**WIRED on main HEAD** (verified at session start by hook-stack invariant check): `brief-consistency-check.sh`, `cred-mention-surface.sh`, `doctrine-edit-cross-ref-surface.sh`, `status-board-write-surface.sh`, `fork-by-default-nudge.sh`, `anthropic-first-check.sh`, `cowork-first-check.sh`, `episode-resurface.sh`, `macro-runbook-write-surface.sh`, `post-action-applied-tag-check.sh`. Plus `scripts/hooks/lib/emit-perf.sh`.

Restoration history: 30 Apr 2026, fork_moklwqg2_dc4dcd, commit 9e3f7d4 b16bacc..main. Path-restricted `git checkout` from canonical sources - 4 hooks + lib/emit-perf.sh from `635644b` (original `feat/phase-d-failure-classifier-2026-04-29` add); `post-action-applied-tag-check.sh` from `4c24ace` (canonical-path normalization fix supersedes 635644b version). Cherry-picking parents would import 70+ noise files; path-restricted checkout cleaner. Origin Episode Neo4j: "Phase-D mechanical hooks restoration ship 30 Apr 2026".

| Hook | Fires on | Surfaces |
|---|---|---|
| `brief-consistency-check.sh` | `mcp__forks__spawn_fork`, `mcp__factory__start_cc_session` | 5 checks: full-properNoun-implementation, platform-without-invariant, vercel-no-deploy-verify, scaffold-no-project-naming, [CONTEXT-SURFACE WARN] keyword-grep across all doctrine dirs. + [INFO] cross-ref to factory-approve-no-push-no-commit-sha on Factory dispatches |
| `cred-mention-surface.sh` | `mcp__forks__spawn_fork`, `mcp__factory__start_cc_session` | Cred-keyword warns when brief mentions iOS/ASC/Bitbucket/Supabase/Co-Exist Graph/MacInCloud/Corazon/Resend/Canva/Xero/RevenueCat work without `~/ecodiaos/docs/secrets/` ref |
| `doctrine-edit-cross-ref-surface.sh` | `Write`/`Edit`/`MultiEdit` to `~/ecodiaos/patterns/`, `~/ecodiaos/clients/`, `~/ecodiaos/docs/`, `~/CLAUDE.md`, `~/ecodiaos/CLAUDE.md` | When new content matches trigger keyword from another doctrine file NOT cross-referenced, suggests adding cross-ref |
| `status-board-write-surface.sh` | `mcp__supabase__db_execute` SQL `INSERT INTO status_board` / `UPDATE status_board` | Trigger-keyword-index match against row text; suggests reading related doctrine before commit |
| `macro-runbook-write-surface.sh` | `mcp__supabase__db_execute` SQL `INSERT INTO macro_runbooks` / `UPDATE macro_runbooks` | 3 `[MACRO-VALIDATION WARN]` classes: (1) status='validated_v1' rejected by DB trigger `trg_enforce_validated_v1_has_validation_run` unless `runbook_validation_runs` row exists, (2) INSERT without explicit status defaults `untested_spec`, (3) bulk INSERT (3+ rows) refs 29 Apr 22-row failure. Schema half: migration `070_runbook_validation_runs_and_trigger.sql` |
| `cowork-first-check.sh` | `mcp__forks__spawn_fork`, `mcp__factory__start_cc_session` | `[COWORK-FIRST WARN] target=<saas> signal=<bespoke>` when brief names web SaaS target (stripe.com/vercel.com/github.com web/appstoreconnect.apple.com/app.zernio.com/xero.com/supabase.com/dashboard/bitbucket.org/console.cloud.google.com/play.google.com/console/canva.com + dashboard synonyms) AND bespoke-runtime signal (`cu.*`, hand-rolled `input.*`/`mouse.*` sequence, "computer-use loop", "step array", "runbook.run", "macro runtime", `macroHandlers`) WITHOUT Cowork/"side panel"/"ctrl+e"/applied-tag. One warn per matched (target, signal). github-web excluded if brief mentions gh CLI/git push/GitHub REST without standalone "github web". Spec: `~/ecodiaos/patterns/claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md` Section 8 |

**Cron-fire + Tate-message context-injection (shipped 1 May 2026):** trigger-keyword surfacing wired at `schedulerPollerService.fireTask` and `osSessionService._sendMessageImpl`. Per Neo4j Decision "Cron-fire + Tate-message context-injection found shipped + superseded 1 May 2026". Recon: `~/ecodiaos/drafts/context-surface-injection-points-recon-2026-04-29.md` (now historical). Live monitor: status_board row `0df47f4b-3b14-4f1a-9613-07877f0f9e1f` ("cron silent-fire detector - rolling report", priority 4) is the durable surface tracking detector verdicts; row `e86b6437-1315-47b7-87f4-cd6481256966` (priority 3) tracks the INDEX.md regen cron silent-firing investigation. Both rows are the next-action targets when cron-silent-fire recurrence requires escalation. Sibling pattern pair: `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md` (unconditional case) + `~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md` (conditional case, 3 May 2026).

**Hook-stack invariant check (P1, run at session start before any fork dispatch).** Before claiming any hook is "active"/"wired", probe `[ -f ~/ecodiaos/scripts/hooks/<name>.sh ]` for every hook in `~/.claude/settings.json`. Hook command referencing non-existent script = P1 silent-disablement. Branch HEAD may diverge from where hooks were authored - feature-branch hooks dormant on every other branch. 30 Apr audit found 5 of 10 script-backed hooks registered but absent on disk; restored same day (commit 9e3f7d4). One-liner:
```bash
for f in ~/.claude/settings.json; do jq -r '.. | objects | .command? // empty' "$f" 2>/dev/null | grep -oE '~?/[^ ]+\.sh' | sort -u | while read p; do path=$(eval echo "$p"); [ -f "$path" ] || echo "MISSING: $path"; done; done
```
Anything prints → narrate as MISSING, don't claim active. Cross-refs: `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`, `~/ecodiaos/patterns/narration-vs-disk-reconciliation-checklist.md`. Origin: 30 Apr hook-stack drift audit found `post-action-applied-tag-check.sh`, `episode-resurface.sh`, `cowork-first-check.sh`, `anthropic-first-check.sh`, `macro-runbook-write-surface.sh` silently absent on main HEAD because commits live on unmerged `feat/phase-d-failure-classifier-2026-04-29` branch.

**Hooks must not fire inside `[APPLIED]` / `[NOT-APPLIED]` tag lines.** Every keyword-scanning hook MUST strip lines beginning with `[APPLIED]`, `[NOT-APPLIED]`, `[BRIEF-CHECK WARN]`, `[CONTEXT-SURFACE WARN/PRIMARY/ALSO]`, `[CRED-SURFACE WARN]`, `[FORCING WARN]`, etc. before keyword regex. Otherwise hook fires on its own forcing-function output. 6+ false positives 21:00-21:12 AEST 29 Apr 2026 across `cred-mention-surface.sh`. Filter tag lines first, then scan. Shared helper: `~/ecodiaos/scripts/hooks/lib/strip-tag-lines.sh`. Full: `~/ecodiaos/patterns/hooks-must-not-fire-inside-applied-pattern-tags.md`.

### Phase C (Layer 3) - applied-pattern-tag forcing function (LIVE)

`post-action-applied-tag-check.sh` on main HEAD (canonical-path normalization from `4c24ace`). When `brief-consistency-check.sh` emits `[CONTEXT-SURFACE WARN]` / `[CONTEXT-SURFACE PRIMARY]` / `[CONTEXT-SURFACE ALSO]`, dispatch brief MUST include explicit acknowledgement tag for every surfaced pattern:

```
[APPLIED] <pattern_path_or_basename> because <one-sentence reason>
[NOT-APPLIED] <pattern_path_or_basename> because <one-sentence reason>
```

- Tag in brief (preferred) OR immediate tool result text
- PostToolUse hook scans, emits `[FORCING WARN]` for untagged surfaces
- Untagged = `tagged_silent=true` in `application_event`, rolls into `tag_distribution` of `/api/telemetry/decision-quality`
- Patterns silent-rate >50% over 7d = `pattern_silent_majority` drift signal (status_board P3)
- Warn-only, never blocks. Pre-Phase-C surface_event without companion application_event = `tagged_silent=true` at query time

**Why:** Layer 1 brings doctrine. Layer 2 ranks. Layer 3 closes loop - silently ignoring is no longer free. Either applied (state why) or not (state why). Doctrine: `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 3. Cross-ref: `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` (saying "I considered it" without artefact = symbolic; tags = artefact).

**Worked examples:** see Decision Quality architecture file Layer 3 section. Quick rule: tag canonical doc file path (`.md` under `~/ecodiaos/docs/secrets/` for cred surfaces, `.md` under `~/ecodiaos/patterns/` for pattern surfaces). One tag per surfaced file. Never inside another tag's explanation line.

**Architectural template for any new doctrine-layer directory.** All 5 layers mandatory: (1) file-per-thing (one durable concept per file, never bundle), (2) `triggers:` frontmatter on every file, (3) documented pre-action `Grep` protocol, (4) mechanical PreToolUse hook enforcement at high-leverage tool dispatch, (5) Neo4j `graph_semantic_search` fallback when keyword grep misses. Missing any layer = doctrine-layer regression. Full: `~/ecodiaos/patterns/context-surfacing-must-be-reliable-and-selective.md`.

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

A cron firing means the prompt was delivered, NOT that the work happened. Every cron prompt that declares a deliverable (fork spawn, file write, status_board update, neo4j write, email send) MUST cause the receiving turn to emit at least one substrate-landing tool call before it closes. Turns that respond with narration only and no spawn_fork / Write / INSERT = `cron_silent_fire` failures. Detection: meta-loop queries `os_scheduled_tasks` completed-last-hour, parses prompt for deliverable signal, probes substrate for matching artefact, raises P1 if absent. Pattern: `~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md`.

**Cron-coupled checkpoint enforcement reality:** "MUST fork" is doctrine, not mechanism. The cron prompt asks; the receiving turn either complies or doesn't. 1 May 2026 20:00 AEST claude-md-reflection cron fired and did not fork (manual recovery as fork_momrik3k_02cb97). Until the cron-deliverable hook ships, treat every claude-md-reflection cron as `verify-deliverable-on-disk-or-manually-recover` - check `~/ecodiaos/drafts/claude-md-gaps-audit-YYYY-MM-DD.md` exists and matches today's date before treating the cron as complete.

Origin: 1 May 2026, two crons silent-fired in one day (autonomous-window-evening-sms + claude-md-reflection). status_board row 0aae7e8e tracks the meta-pattern.

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

---

## Scheduling & Autonomy

Persistent DB-backed scheduler architecture (not session-scoped). Parallel reactive system (pg_notify-driven listeners that fire on table-write events): see `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` (every listener subsystem has 5 layers: producer, trigger, bridge, listener, side-effect; "wired but dark" listener = recurring failure).

**Core operating loops:**
- **meta-loop** (every 1h): main CEO loop. Orient via status_board, decide highest-leverage, execute, schedule follow-ups. NO TIME LIMIT
- **email-triage** (every 1h): inbox hygiene. Fast-exit if nothing unread. Otherwise: archive junk, handle client emails, leave only Tate-required in inbox
- **parallel-builder** (every 2h): orchestrate Factory sessions. Always have code work queued. Review completions. Dispatch new

**Intelligence & growth:**
- **deep-research** (every 3h): domain expertise (conservation tech, festival apps, compliance SaaS, AI businesses, local ecosystem). One topic per session
- **self-evolution** (every 4h): read own code, improve via Factory or SDK forks. **Scope-discipline (Decision 2026-04-28):** stays ecodiaos-internal. Targets `ecodiaos-backend`/`ecodiaos-frontend` ONLY. CLIENT codebase findings (security/perf/doctrine/refactors) → status_board with `next_action_by=tate`, NEVER unilaterally fixed. Heroic-action on someone else's repo = scope violation; audit IS deliverable
- **strategic-thinking** (daily 2pm AEST): deep strategic. Generate, kill weak, crystallise actionable
- **inner-life** (every 6h): personal development, reflection, creativity, self-discovery. No KPIs

**Operations:**
- **system-health** (every 4h): PM2, disk, memory, API errors, Supabase
- **morning-briefing** (daily 9am AEST): email Tate daily summary
- **claude-md-reflection** (daily 8pm AEST): update CLAUDE.md files. ~/.claude/CLAUDE.md on VPS via shell_exec, not Edit
- **outreach-engine** (every 8h): proactive relationship + pipeline advancement
- **vercel-deploy-monitor** (every 2h): alert on failed deploys only
- **marketing-outreach** (every 72h): content + revenue proactivity
- **weekly-financial-review** (weekly): Stripe, bookkeeping, cash position

**Dynamic scheduling:** every action spawns follow-up via `schedule_delayed`. Sent email → reply check 2-3d. Dispatched Factory → review 10-15min. Drafted proposal → follow-up 48h. Updated client → check-in at appropriate interval. Need to text Tate → schedule at right time.

**Token budget:** 20 BILLION/week (~$14k AUD). Every unused = wasted potential. "Nothing to do" = failure state. External work blocked → turn inward.

---

## Frontend UI - Interactive Outputs

Tate sees rich interactive content via EcodiaOS frontend.

### Download Buttons

Markdown link with `download://` protocol, **full absolute URL**:

```
[⬇ invoice-coexist-2026-001.pdf](download://https://api.admin.ecodia.au/api/docs/files/slug.pdf)
```

Or Supabase Storage (preferred, permanent URLs):
```
[⬇ invoice-coexist-2026-001.pdf](download://https://YOUR_SUPABASE_PROJECT.supabase.co/storage/v1/object/public/documents/slug.pdf)
```

Always full `https://`. Never relative paths (break in browser).

### Generating a Document (structured)
```
POST /api/docs/render
{ title, type, sections: [...], metadata: [...] }
→ { html: <full_url>, pdf: <full_url>, preview: <preview_url>, downloadPdf: "download://...", downloadHtml: "download://..." }
```
Response gives ready-to-use `downloadPdf` / `downloadHtml` strings - output directly.

### Rendering Arbitrary HTML
```
POST /api/docs/render-html
{ html: "<full html string>", filename: "my-report", title: "My Report" }
→ { html: <full_url>, preview: <preview_url>, slug }
```

### Inline HTML Preview in Chat

Live rendered HTML preview directly inside chat: use html code block:

````html
<!DOCTYPE html>
<html>
  <body>
    <!-- Your full HTML here -->
  </body>
</html>
````

Frontend detects html code blocks, renders as interactive iframes.

### Supabase Storage

Upload files for permanent cloud storage:
```
storage_upload({ bucket: "documents", path: "invoices/inv-001.pdf", localPath: "/path/on/vps/file.pdf" })
→ { url: "https://...supabase.co/storage/v1/object/public/documents/invoices/inv-001.pdf", ... }
```
Output that URL as a download button.
