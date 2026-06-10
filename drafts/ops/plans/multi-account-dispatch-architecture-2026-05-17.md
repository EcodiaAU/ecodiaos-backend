# Multi-Account Dispatch Architecture - 2026-05-17

**Version:** v3 (deep red-team pass with disk + GitHub verification, 2026-05-17 night)
**v2 -> v3 deltas at bottom of file. v1 -> v2 deltas preserved below those.**

> **POST-HOC RESOLUTION NOTE — 2026-05-25**: this doc was written when TWO laptop-agent copies existed on disk: `D:/.code/eos-laptop-agent/` (live canonical) and `D:/.code/EcodiaOS/backend/laptop-agent/` (in-repo mirror / planned migration target). On 2026-05-25 the mirror was eliminated (move-aside-deleted as `backend/laptop-agent.deleted-2026-05-25/`) and the canonical retained. Live subdirs that used to sit inside the mirror were relocated to backend/ siblings (`backend/cursor-preview-extension/`, `backend/laptop-daemons/`, `backend/com.ecodia.laptop-agent.plist`). A mechanical path-migration pass over this doc collapsed both former paths to the canonical, which makes some sentences below read self-contradictorily ("the dormant copy at <canonical-path>... is dormant"). The collapse is correct in current state but loses the historical two-path narrative. Read the original intent through that lens. The current canonical truth lives in [windows-spawn-must-use-spawnSync...md](../patterns/windows-spawn-must-use-spawnSync-with-create-no-window-not-execSync-with-windowsHide.md) and [probe-running-daemon-cwd-before-refactor-or-restart.md](../patterns/probe-running-daemon-cwd-before-refactor-or-restart.md).

Research + red-team + architecture doc for spreading autonomous EcodiaOS work across the three Claude Max accounts (tate@ / code@ / money@) via the three IDEs running on Corazon (VS Code Stable / VS Code Insiders / Cursor).

Audience: Tate. Status: design doc, NOT shipped. Approve before build.

---

## TL;DR

**Issue #30538 is NOT fixed in v2.1.143** (the on-disk extension version on Corazon). Verified two ways: (1) the issue thread has comments as recent as v2.1.70 confirming the bug persists, with a root-cause trace through the minified extension showing the **extension host process** never receives `CLAUDE_CONFIG_DIR` regardless of which VS Code env setting is used (`terminal.integrated.env.*`, `claudeCode.environmentVariables`, `claudeCode.claudeProcessWrapper` - all three only affect spawned processes, not the extension host itself). (2) The bundled `extension.js` on disk (2.1MB, May 16 2026) contains 8 references to `CLAUDE_CONFIG_DIR` but **zero references** to any `claudeCode.configDir` setting - the upstream-suggested fix has not landed.

**Architectural consequence:** the v2 design (CLI-in-integrated-terminal dispatch) **holds**. v3 patches the on-disk-wrong claims, locks in the migration runner path, names one home for the dispatch primitive, adds the ccusage install step, and acknowledges the prior-art `cowork-dispatch` bash wrapper.

**Critical second finding from the issue thread** (was not in v1/v2): there IS a third escape hatch beyond CLI-in-terminal and `claudeProcessWrapper`. Per `dovestyle`'s comment, **faking `HOME` / `USERPROFILE` before launching VS Code** redirects the extension host's `os.homedir()` call (the bug's actual mechanism is `process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude")` in the extension host), but it pollutes every other tool VS Code launches (browser opens, terminal git, etc.). **v3 keeps this path off the recommended track** but documents it as a contingency in §1.2.

Recommended path unchanged: **CLI-in-terminal dispatch**, per-IDE `CLAUDE_CONFIG_DIR` via `terminal.integrated.env.windows`, Postgres `dispatched_tasks` coordination, `dispatch.spawn` primitive extending the live reflex substrate at `D:/.code/eos-laptop-agent/tools/reflex.js`. The panel stays for Tate's interactive work; dispatched work runs as `claude` CLI in a uniquely-titled integrated-terminal pane.

---

## Mental model for Tate

Read this once. It is the operating model you need to keep straight.

**All three IDE panels show tate@.** VS Code Stable's Claude panel, VS Code Insiders' Claude panel, and Cursor's Claude panel will every one of them be your tate@ interactive surface. The extension panel cannot be re-pointed to a different account today (upstream bug #30538, confirmed unfixed in v2.1.143). If you open the Insiders panel expecting to see what money@ is working on, you will see nothing related to it - you will see your own tate@ panel session there.

**Dispatched work lives in integrated terminal panes, not in panels.** When the conductor dispatches a task to money@ or code@, that work runs as `claude` (CLI) inside a terminal pane in the relevant IDE, with `CLAUDE_CONFIG_DIR` pointed at the right per-account dir. It does not appear in any panel. You will not see a chat bubble for it. If you click around looking for it in panels you will not find it.

**Single window into all running dispatches: `backend/coordination/dispatch-status.md`.** This file is regenerated every 60s and auto-previews into whichever IDE you have focused. It shows what is running where, on which account, with what brief, with what last-heartbeat. If you want to know "what is the OS doing right now across all three accounts," that file is the answer. Not the panels. (`backend/coordination/` does NOT exist on disk today - Phase 3 creates it. The `ide-tab-is-the-new-fork-mechanic` doctrine mentions the path as a coordination convention but never landed the directory.)

**Failure mode this avoids: looking in the wrong place.** Without this mental model the easy mistake is opening Insiders, seeing your own tate@ panel, and concluding "nothing is dispatched." Reality may be that money@ has three tasks running in three Insiders terminal panes. The status file is canonical.

---

## 1. Verified facts (v3 re-verification pass complete)

### 1.1 `CLAUDE_CONFIG_DIR` works for the CLI; does NOT work for the extension panel on v2.1.143

- **CLI behavior:** Setting `CLAUDE_CONFIG_DIR=/path/to/.claude-tate` before running `claude` redirects credentials, settings, sessions, projects, todos, statsig, hooks, and shell snapshots to that dir. First launch triggers a fresh login flow. Both instances can run simultaneously with no interference. Source: [shukebeta.com](https://blog.shukebeta.com/2026/05/14/run-multiple-claude-code-instances-with-separate-configs), [KMJ-007 gist](https://gist.github.com/KMJ-007/0979814968722051620461ab2aa01bf2), [wmedia.es](https://wmedia.es/en/tips/claude-code-multiple-profiles-config-dir). Reconfirmed against the bundled extension on disk: `extension.js` references `CLAUDE_CONFIG_DIR` 8 times across the credentials, session-list, project-dir, and `.mcp.json`-write code paths - the CLI path honours it everywhere.
- **VS Code / Cursor extension panel behavior:** The extension **ignores `CLAUDE_CONFIG_DIR` entirely** when reading session/project state from its own UI. Re-verified 2026-05-17 night via the [#30538 thread](https://github.com/anthropics/claude-code/issues/30538) (latest comment 2026-05 era citing v2.1.70 still broken) and via direct read of the bundled `extension.js` (v2.1.143 on disk) which contains **zero references** to any `claudeCode.configDir` setting (the upstream-suggested fix from comment `pasrom`). The root cause is mechanical, not policy:

  > "`IG()` correctly reads `process.env.CLAUDE_CONFIG_DIR` - but the **extension host process** never receives this variable: `terminal.integrated.env.osx` only applies to terminal processes, not the extension host; `claudeCode.claudeProcessWrapper` only takes effect when spawning the Claude CLI process, not when the extension itself lists sessions; `claudeCode.environmentVariables` also doesn't propagate to the extension host's own `process.env`." - pasrom, #30538

  In other words: the panel always uses `process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude")` from inside the extension host. The extension host inherits env only from the parent VS Code process - not from VS Code settings. **This means there are exactly three ways to re-point the extension host's view of the config dir:**
  1. Launch VS Code itself from a shell with `CLAUDE_CONFIG_DIR` set (kills the architecture because there's only ONE running VS Code instance per IDE installation and that instance is account-pinned).
  2. Launch VS Code with a faked `HOME` / `USERPROFILE` (works, but pollutes everything VS Code launches - browser, git, etc.).
  3. Wait for upstream to add `claudeCode.configDir`. Not present in v2.1.143.

  None of (1)(2)(3) compose well with the three-IDE-three-account topology. CLI-in-terminal stays the recommended path.
- **Known panel-extension gotcha:** [Issue #10217](https://github.com/anthropics/claude-code/issues/10217) (closed as duplicate of #10224) reports the extension **deletes `claudeCode.environmentVariables` from settings.json on activation** in trusted workspaces. So even if the panel did respect the env var, the setting evaporates. The CLI-in-terminal path uses `terminal.integrated.env.windows` (which the extension doesn't touch), so this gotcha is sidestepped in the recommended design.
- **Shared `~/.claude.json` failure point:** Even with separate `CLAUDE_CONFIG_DIR`, the file `~/.claude.json` (OAuth session state, tipsHistory, startup counters) is sometimes still read from the literal `~` regardless. The Windows workaround used by [joshcgrossman.com Feb 2026](https://joshcgrossman.com/2026/02/04/claude-two-accounts-windows/) is to **fake `USERPROFILE`** entirely per-launch via a PowerShell function. The bundled extension on disk DOES reference `~/.claude.json` directly via `path.join(process.env.CLAUDE_CONFIG_DIR||qV0.homedir(),".claude.json")` in the mcp-config write path - so the CLI honours `CLAUDE_CONFIG_DIR` here too. **Verify empirically in Phase 0 test 2 before committing to either path** (see Phase 0 + Phase 0.5).

### 1.2 Three confirmed escape hatches (was two in v2)

- **CLI in integrated terminal** (RECOMMENDED): `Ctrl+`` opens an integrated terminal; running `claude` there obeys `CLAUDE_CONFIG_DIR` exactly as documented. VS Code can set `terminal.integrated.env.windows` per-IDE-installation so every integrated terminal gets the right env. The CLI invocation runs at full subscription rate budget (it IS interactive Claude Code), satisfying the hard constraint. Source: [code.claude.com/docs/en/vs-code §Run CLI in VS Code](https://code.claude.com/docs/en/vs-code). See also "Hedges" section for the post-15-June billing-policy contingency.
- **`claudeCode.claudeProcessWrapper`**: Documented extension setting that lets us specify an executable path used to launch the Claude process. The bundled binary path is passed as an argument. A `.bat` / `.ps1` / `.cmd` wrapper can set `CLAUDE_CONFIG_DIR` (and `USERPROFILE`) before invoking the real binary. Source: [code.claude.com/docs/en/vs-code §Extension settings](https://code.claude.com/docs/en/vs-code), [issue #10491](https://github.com/anthropics/claude-code/issues/10491). **Reports of "ReferenceError: Claude Code native binary not found" on wrapper misuse; untested in our deployment; carries risk** of breakage on extension updates and of credential leakage if the wrapper is misconfigured. Crucially, per pasrom's #30538 trace, this fixes the *spawned CLI process* but NOT the extension host's own session-list / project view - so the panel STILL shows tate@'s history while typing into the chat hits money@. Confusing UX. Rejected.
- **NEW in v3: fake `HOME` / `USERPROFILE` at VS Code launch time** (CONTINGENCY ONLY): per the `dovestyle` comment on #30538 ("overriding VS Code startup script to give VS Code a fake home folder... works, but it comes with the symptom of having anything external that's executed from VS Code use that fake home folder"). This is the only known path that fixes the extension HOST's view, not just spawned CLIs. Side effects: opening a browser link from VS Code launches a fresh-profile browser; git looks for credentials in the fake home; etc. **Rejected for v3 default** because it would interfere with Tate's interactive work in the panel. Kept on the bench as the contingency if Anthropic clarifies CLI billing against us (see Hedges §6.1).

### 1.3 IDE extension surface

- All three IDEs (VS Code Stable, VS Code Insiders, Cursor) install the same `anthropic.claude-code` extension. **Verified on disk 2026-05-17 night:** all three have `anthropic.claude-code-2.1.143-win32-x64` installed (paths: `C:/Users/tjdTa/.vscode/extensions/`, `C:/Users/tjdTa/.vscode-insiders/extensions/`, `C:/Users/tjdTa/.cursor/extensions/`). The extension also ships through the [Open VSX registry](https://open-vsx.org/extension/Anthropic/claude-code) for Cursor / Windsurf / Kiro / forks. Source: [code.claude.com/docs/en/vs-code](https://code.claude.com/docs/en/vs-code).
- **URI handler:** `vscode://anthropic.claude-code/open?prompt=<urlencoded>&session=<id>` opens a new chat tab pre-filled with a prompt (not auto-submitted). On Cursor the equivalent scheme is `cursor://anthropic.claude-code/open?...` ([cursor forum](https://forum.cursor.com/t/does-cursor-have-a-unique-open-scheme/3659) confirms Cursor registers its own scheme). On Windows, `Start-Process "vscode://..."` opens it. **This handler is account-pinned to the panel's hardcoded `~/.claude/` account** - it cannot select an account. (Per `D:/.code/eos-laptop-agent/tools/reflex.js` header comments: "live tests with Start-Process AND direct Code.exe --open-url both failed to open a chat - no extension log trace, no new tab." The reflex substrate fell back to the GUI-macro path for this exact reason.)
- **Command palette:** `Ctrl+Shift+P` -> "Claude Code: Open in New Tab" (the canonical command name across all three IDEs - the reflex AHK macro already uses this exact phrasing successfully). The `Ctrl+Shift+Esc` shortcut also opens in new tab when the extension is focused. Source: [code.claude.com/docs/en/vs-code §Commands](https://code.claude.com/docs/en/vs-code).
- **Internal IDE-MCP server:** The extension hosts a local MCP server on a random high port; the lockfile lives at `~/.claude/ide/<port>.lock` with 0600 perms. The CLI discovers it via the lockfile. If we use per-account `CLAUDE_CONFIG_DIR` for the CLI, **the CLI in that terminal cannot discover the IDE's MCP server** (it looks in its config dir's `ide/` subdir, not the panel's). **Reconfirmed 2026-05-17 night: 6 lockfiles exist at `C:/Users/tjdTa/.claude/ide/`** (27199, 37909, 49138, 64933, 65277, 65380) - confirming the panel-MCP path is hot. Workaround: symlink `~/.claude/ide` into each per-account config dir, OR run dispatched CLIs in IDE-detached mode. **Phase 0 test 7 measures whether degraded IDE-MCP discovery actually breaks dispatched chats' ability to do their job before we commit to the symlink complexity.** Source: [code.claude.com/docs/en/vs-code §The built-in IDE MCP server](https://code.claude.com/docs/en/vs-code).
- **Extension env-var contribution timing bug:** The extension contributes env vars to terminals via VS Code's `EnvironmentVariableCollection` API, but **registers too late in activation lifecycle**, causing a "Relaunch terminal" warning on every new terminal ([issue #55486](https://github.com/anthropics/claude-code/issues/55486), closed as duplicate, unfixed). Mitigation: set `terminal.integrated.environmentChangesRelaunch: false` per-IDE, or set our env via `terminal.integrated.env.windows` (which the extension can't conflict with because it loads first).

### 1.4 Per-account usage data IS programmatically accessible (via files, not API)

- **`/usage` slash command** is interactive-only - it returns formatted text in the chat. No documented JSON flag, no documented file path. Source: [vincentqiao.com](https://blog.vincentqiao.com/en/posts/claude-code-usage/).
- **`ccusage` npm package** (third-party, well-maintained, [npm](https://www.npmjs.com/package/ccusage)) reads `~/.claude/projects/<project>/<conversation-id>.jsonl` directly - the same JSONL files CC writes for every conversation. Supports `--json` output, importable as a TS library via `ccusage/data-loader`. With per-account `CLAUDE_CONFIG_DIR`, each account's JSONL lives in `<dir>/projects/...`, so `CLAUDE_CONFIG_DIR=<dir> ccusage --json` (or `--config-dir <path>` if the flag exists - verify in Phase 0 test 4) per account gives us per-account usage.
- **NEW in v3: ccusage is NOT installed on Corazon.** Verified 2026-05-17 night via `which ccusage` (not found) + `npm list -g --depth=0` on `D:/SSD_Turbo/node-global/` (only `@anthropic-ai/claude-code`, `cline`, `flyctl`, `npm`, `pm2-windows-startup`, `pm2`, `pmtiles`, `vercel` present). Phase 2 explicitly adds `npm install -g ccusage` as step 1. All claims about ccusage flags / output shape are **unverified until installed and probed in Phase 0 test 4**. **Fallback plan if ccusage proves unsuitable:** write a small Node script that reads the per-account `<config-dir>/projects/<project-hash>/<conversation-id>.jsonl` files directly, parses the `usage` blocks in each assistant message (token counts), correlates timestamps against 5h-rolling-window boundaries, and emits the same JSON shape the dispatcher expects. ~100 lines of Node. We already have prior art for reading these JSONL files via `~/.claude/ecodia-reflex-log.json` + the JSONL-bridge in `scratchpadService`.
- **5h-rolling and weekly limits**: ccusage tracks both. We can poll periodically and write to `kv_store.claude_max_usage.{tate,code,money}` for the dispatch budgeter. Caveat: usage is shared between Claude.ai web AND Claude Code per account (Anthropic docs), so Tate's web-app usage on tate@ also burns into that account's pool - we can SEE this through ccusage but can't separate it.

### 1.5 The reflex substrate is already 50% of the dispatch primitive

**Live agent location locked in v3:** the running PM2-supervised `eos-laptop-agent` (id 0, name `eos-laptop-agent`, status online, uptime current) is launched from `D:/.code/eos-laptop-agent/index.js` (verified 2026-05-17 night via `pm2 show 0` -> `script path: D:\.code\eos-laptop-agent\index.js`, `exec cwd: D:\.code\eos-laptop-agent`). Its `/api/info` lists 69 tools including `reflex.fire`, `reflex.fire_if_clear`, `reflex.foreground_window`, `reflex.list_mouths`, `reflex.last_fires`, `reflex.append_to_master`. **This is the home of the dispatch primitive.** All v3 references to `dispatch.spawn` extend this codebase.

**The other laptop-agent codebase at `D:/.code/eos-laptop-agent/`** is a dormant / partial copy. Verified contents: `tools/{browser,cdp,filesystem,gui,process,screenshot,shell}.js` - **no `reflex.js`, no `input.js`, no `macro.js`, no `keyboard.js`, no `mouse.js`**. Has a `cursor-preview-extension/`, `daemons/`, `ecosystem.config.js`, `install.ps1`, `install.sh`. **Plausible interpretation:** this is the migration target (vendoring the agent into the backend monorepo so it ships with the rest of EcodiaOS), but the migration hasn't completed - the live agent is still launched from the older standalone repo. **v3 treats `D:/.code/eos-laptop-agent/` as the canonical home for `dispatch.spawn`.** The migration to in-tree `D:/.code/eos-laptop-agent/` is out of scope here; whoever finishes it will need to port `dispatch.spawn` across at the same time as `reflex.*`. Logging this as v3 open question #11.

`D:/.code/eos-laptop-agent/tools/reflex.js` (per the active doctrine `ide-tab-is-the-new-fork-mechanic-2026-05-17`) already exposes:
- `reflex.fire({prompt, source, editor?, auto_submit?, ...})` - AHK macro that activates an IDE window, fires `Ctrl+Shift+P`, types "Claude Code: Open in New Tab", pastes the prompt, optionally submits. ~3.3s end-to-end.
- `editor` param routes to `vscode` / `vscode-insiders` / `cursor`.
- `reflex.list_mouths()` discovers live CC windows via `~/.claude/ide/<port>.lock`.

**Today reflex.fire targets the panel (account-pinned).** Phase 2 of that doctrine (Insiders + Cursor verification) is marked as a prereq. To make it multi-account, we either (a) get the panel to honour different config dirs (blocked by #30538), (b) extend reflex to fire the integrated terminal + CLI invocation instead, or (c) per-IDE wrapper-binary trick. The dispatch primitive is option (b): a new tool `dispatch.spawn` that lives in the same reflex.js module (or a sibling `dispatch.js` in the same `tools/` dir) and composes the same AHK + `input.*` + `gui.sequence` primitives reflex already uses, but targets the integrated terminal pane and types a CLI invocation instead of triggering the command palette.

### 1.6 Corazon laptop-agent `gui.sequence` primitive

`D:/.code/eos-laptop-agent/tools/gui.js` (the one in the running agent): batches N GUI actions into 1 HTTP call. Supports `input.*`, `mouse.*`, `screenshot.*`, `cdp.*`, `gui.*`, and pseudo-tool `wait`. Returns per-step duration + final screenshot. This is the substrate for the focus-collision-aware dispatch macro. Already shipped, documented in `gui-batch-primitive-collapses-roundtrips-orthogonal-to-coord-brittleness-2026-05-17`.

### 1.7 NEW in v3: cowork-dispatch bash wrapper is prior art for the spawn primitive

`~/ecodiaos/scripts/cowork-dispatch` on the VPS (verified 2026-05-17 night via SSH) is a 1990-byte bash wrapper from the Cowork era (deprecated 5 May 2026). Despite the legacy name, the SCRIPT is a useful ergonomic abstraction over the laptop-agent: subcommands `precheck`, `focus`, `instruct`, `wait`, `step`, `account-chip`, `passkey-inject`, `step-with-passkey-watch`, `foreground-check`. It composes `input.*` + `screenshot.*` + `process.*` primitives via `curl -X POST .../api/tool` calls.

**Relevance to dispatch.spawn:** rather than authoring a net-new `dispatch.spawn` JavaScript tool, we should look hard at extending cowork-dispatch with a `dispatch-spawn <task_id> <ide> <account>` subcommand that wraps the same sequence. Pro: stays in shell, no Node-side state, follows existing pattern. Con: bash + cross-platform (VPS-side script targeting Corazon via Tailscale) makes it harder to invoke from the Node dispatcher service.

**v3 recommendation: build `dispatch.spawn` as a tool inside `D:/.code/eos-laptop-agent/tools/` (alongside reflex.js)**, so it's discoverable via `/api/tool` like every other agent primitive, but borrow the macro sequence design (especially the foreground-collision + passkey-inject handling) from cowork-dispatch. Cowork-dispatch stays alive as a manual-debug tool.

---

## 2. Recommended architecture

**Headline:** **CLI-in-integrated-terminal dispatch, account-isolated via `CLAUDE_CONFIG_DIR`, coordinated via Postgres.**

Each IDE is pinned to one account:

| IDE | Account | Config dir | Role |
|---|---|---|---|
| VS Code Stable | tate@ecodia.au | `~/.claude` (existing) | Tate's primary interactive surface (panel chat) |
| VS Code Insiders | money@ecodia.au | `~/.claude-money` | Dispatch target (terminal CLI) |
| Cursor | code@ecodia.au | `~/.claude-code` | Dispatch target (terminal CLI) |

The panel in each IDE stays on the hardcoded `~/.claude/` account (= tate@). This is fine because **the panel is for Tate's hands** - if Tate opens the panel in Insiders he sees the tate@ panel session. We do NOT use the panel for dispatch. Dispatched work runs in the integrated terminal where `CLAUDE_CONFIG_DIR` works.

### 2.1 Dispatch flow

```
                +-------------------+
   Conductor    | Conductor session |
   (this chat)  |   (panel chat,    |
                |    tate@)         |
                +---------+---------+
                          |
                          | TRANSACTIONAL DISPATCH (see §2.7):
                          |   1. Read kv_store.claude_max_usage.* -> pick account
                          |   2. BEGIN: write brief.md AND insert pending row AND
                          |             call dispatch.spawn - on ANY failure,
                          |             roll back brief delete + row delete.
                          v
                +-------------------+
                |  Laptop agent     |
                | (Corazon 7456,    |
                |  D:/.code/eos-    |
                |  laptop-agent)    |
                +---------+---------+
                          |
                          | gui.sequence:
                          |   0. foreground-collision probe (Step 0 doctrine)
                          |   1. WinActivate <target_ide>
                          |   2. Ctrl+` (open integrated terminal pane)
                          |   3. type: $env:CLAUDE_CONFIG_DIR='~/.claude-money'; claude
                          |   4. wait for input ready (poll for prompt)
                          |   5. type: "Pick up dispatched_tasks task_id <id>"
                          |   6. Enter
                          v
                +-------------------+
                | Insiders terminal |
                | running `claude`  |
                | as money@         |
                +---------+---------+
                          |
                          | a. reads brief from dispatched_tasks
                          | b. heartbeats at every turn boundary
                          | c. does the work, ships commits/files
                          | d. UPDATE dispatched_tasks SET result='...', status='done'
                          | e. exit cleanly (or just sit idle, harmless)
                          v
                +-------------------+
                |  Conductor (next  |
                |  turn): polls     |
                |  dispatched_tasks |
                |  WHERE seen=false |
                +-------------------+
```

### 2.2 Substrate schema

```sql
CREATE TABLE dispatched_tasks (
  id uuid primary key default gen_random_uuid(),
  parent_session_id text,                    -- which session opened the dispatch
  target_account text not null,              -- 'tate'|'code'|'money'
  target_ide text not null,                  -- 'vscode'|'vscode-insiders'|'cursor'
  brief_md_path text not null,               -- absolute path to brief on disk
  status text not null default 'pending',    -- pending|spawned|running|done|errored|orphaned
  spawned_at timestamptz,
  started_at timestamptz,                    -- child sets when it reads the brief
  last_heartbeat_at timestamptz,             -- child updates at every turn boundary
  closed_at timestamptz,
  result_md_path text,                       -- absolute path to result on disk
  result_summary text,                       -- 1-2 sentence summary
  artifacts jsonb default '[]'::jsonb,       -- file paths, PR URLs, status_board rows touched
  error text,                                -- if status='errored'
  seen_by_conductor boolean default false,   -- conductor flips true after polling
  recursion_depth int default 0,             -- gated at 3 per §3
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

CREATE INDEX dispatched_tasks_unseen ON dispatched_tasks (seen_by_conductor, status)
  WHERE seen_by_conductor = false;

-- Heartbeat-based orphan detection (25min threshold per §6 / Phase 6)
CREATE INDEX dispatched_tasks_orphan ON dispatched_tasks (last_heartbeat_at)
  WHERE status IN ('spawned', 'running');
```

The brief lives on disk (not as a column) because briefs can be large and Phase 3 creates `backend/coordination/<id>.md` as a new directory specifically for this purpose. Result file lives there too. **v2 incorrectly claimed `backend/coordination/` was "an established convention" - it is NOT on disk; the `ide-tab-is-the-new-fork-mechanic` doctrine mentions the path aspirationally but never landed it. v3 corrects this: Phase 3 creates the directory.**

### 2.3 Account selection

`kv_store.claude_max_usage.{tate,code,money}` - written by a 5min cron that runs `ccusage --json` against each per-account config dir:

```json
{
  "account": "money",
  "five_hour": { "used_pct": 0.42, "resets_at": "2026-05-17T18:30:00Z" },
  "weekly":    { "used_pct": 0.18, "resets_at": "2026-05-22T00:00:00Z" },
  "last_polled_at": "2026-05-17T15:23:00Z",
  "freshness_ok": true
}
```

Dispatcher selection logic:
1. Filter out accounts with `freshness_ok=false` (data >10min stale).
2. Filter out accounts with `five_hour.used_pct > 0.85 OR weekly.used_pct > 0.85`.
3. Of the rest, pick **min(five_hour.used_pct)** (the one most ready to take more work in the short window).
4. If all 3 are over the threshold: write a P2 status_board row, defer dispatch until earliest `resets_at`, and `schedule_delayed` the retry.

### 2.4 The "child reads its brief" contract

Every dispatched chat receives ONE pasted line:

```
Pick up dispatched task <uuid>. Read backend/coordination/<uuid>.md for the brief. UPDATE dispatched_tasks SET status='running', started_at=now() WHERE id='<uuid>'. Heartbeat by UPDATE last_heartbeat_at=now() at EVERY turn boundary (not on a timer; the assistant is single-threaded inside a turn and timers can't preempt tool calls). When done, write result to backend/coordination/<uuid>-result.md, UPDATE result_md_path + result_summary + status='done'. Exit cleanly.
```

A skill (`dispatched-task-pickup`) wraps this so the child gets a richer briefing automatically when it sees the keyword. The skill enforces heartbeat-at-turn-boundary discipline, orphan-recovery on session restart, etc.

**Heartbeat protocol (load-bearing - see Phase 6 for orphan threshold rationale):** the dispatched skill emits a heartbeat at every turn boundary, not on a wall-clock timer. The assistant is single-threaded inside a turn - a long tool call (build, deploy poll, large file write, `start_cc_session` wait) can block for 10-20 minutes during which no timer-fired action can run. The 25min orphan threshold (§3, Phase 6) is calibrated to tolerate the slowest realistic single-tool-call duration plus margin.

### 2.5 Per-IDE settings

For each IDE, set in user settings.json:

```jsonc
{
  "terminal.integrated.env.windows": {
    "CLAUDE_CONFIG_DIR": "C:\\Users\\tjdTa\\.claude-money",
    "USERPROFILE_CLAUDE_OVERRIDE": "C:\\Users\\tjdTa\\.claude-money"
  },
  "terminal.integrated.environmentChangesRelaunch": false,  // avoid the #55486 relaunch warning
  "claudeCode.preferredLocation": "panel"  // panel stays tate@; terminal is the dispatch lane
}
```

The CLI wrapper at `~/.ecodia/bin/claude-multi.ps1` is what we actually invoke (not raw `claude`) IFF Phase 0 test 2 shows `~/.claude.json` contamination - it sets `$env:CLAUDE_CONFIG_DIR`, `$env:USERPROFILE` (the joshcgrossman fix for the `.claude.json` leak), then exec's the real `claude` binary. If Phase 0 test 2 shows clean isolation, we invoke `claude` directly with no wrapper. **Spec for both paths in Phase 0 / Phase 0.5.**

### 2.6 Coordination MCP shim

Rather than the dispatched chat doing raw SQL, expose dispatched_tasks via the existing cowork MCP at `https://api.admin.ecodia.au/api/mcp/cowork` as 4 tools:

- `dispatched_tasks.pickup(id)` - read brief, set status=running, return brief content
- `dispatched_tasks.heartbeat(id)` - bump last_heartbeat_at
- `dispatched_tasks.complete(id, result_summary, artifacts, result_md_path)` - close out
- `dispatched_tasks.error(id, error)` - error path

The conductor (parent) reads via `db_query` directly; no need for shim there.

### 2.7 Transactional dispatch (no orphan pending rows)

Brief write + row insert + spawn happen as one atomic unit from the conductor's perspective. The dispatcher service in `src/services/dispatcher.js` implements this sequence:

```
function dispatch(brief_md, opts):
  account = pick_account()           # may throw account_chain_exhausted
  task_id = uuid()
  brief_path = "backend/coordination/<task_id>.md"

  try:
    write_file(brief_path, brief_md)
    db.execute("INSERT INTO dispatched_tasks (id, target_account, target_ide, brief_md_path, status) VALUES ($1, $2, $3, $4, 'pending')", [task_id, account, ide, brief_path])
    spawn_result = await laptop_agent.dispatch_spawn(task_id, ide, account)   # the GUI macro
    if spawn_result.success:
      db.execute("UPDATE dispatched_tasks SET status='spawned', spawned_at=now() WHERE id=$1", [task_id])
      return {task_id, status: 'spawned'}
    else:
      raise SpawnFailed(spawn_result.error)
  except Exception as e:
    # Rollback: clean both substrates
    db.execute("DELETE FROM dispatched_tasks WHERE id=$1", [task_id])
    delete_file_if_exists(brief_path)
    raise
```

**No orphan state.** A `pending` row that the dispatcher cannot spawn is rolled back before the function returns. The recovery cron (Phase 6) only ever sees rows in `spawned` or `running` state that have stopped heartbeating - i.e., spawn succeeded then the child died. The cron does NOT need to handle `pending`-with-no-spawn because that state cannot persist.

If the conductor process itself dies between brief write and dispatch_spawn return (truly worst case - laptop reboot mid-dispatch), the row stays `pending` with no spawn. A weekly cleanup cron (`pending` rows older than 1h with no `spawned_at`) deletes these as orphans-of-conductor-crash; rare enough to not warrant active monitoring.

---

## 3. Failure modes

| Failure | Detection | Mitigation |
|---|---|---|
| Dispatched chat dies mid-task (Anthropic outage / IDE crash / cap hit during task) | `last_heartbeat_at < now() - 25min` AND status in ('spawned','running') | Orphan-detector cron flips status='orphaned' at 25min, writes P3 row. Conductor re-dispatches with `--continuation-aware` flag (probe artifacts BEFORE re-running). 25min threshold is calibrated to tolerate the slowest realistic single-tool-call duration plus margin per §2.4. |
| GUI macro paste fails silently (focus stolen, IDE not responsive) | `gui.sequence` returns `failed > 0`; the final screenshot shows wrong window in foreground | Dispatcher MUST verify the spawn by polling `dispatched_tasks WHERE id=<x> AND started_at IS NOT NULL` for 30s after spawn. If still null, transactional rollback per §2.7 deletes brief + row and surfaces error to caller. |
| Two dispatches race to the same IDE in rapid succession | A second spawn arrives while the first is still typing into the terminal pane | **`dispatch.spawn` takes an exclusive lock** in `kv_store.dispatch.lock.<target_ide>` for the duration of the macro (~10s). Second dispatch waits or routes to a different IDE. Lock has 30s TTL for safety. |
| Tate is typing in target IDE during dispatch | Foreground-collision Step 0 probe per `cowork-no-focus-collision` doctrine: `reflex.foreground_window()` returns the target IDE's window | Defer dispatch by 60s and retry. If 3 consecutive defers, fall back to a different IDE (account-rebalance). Tate's tate@ account is reserved-for-tate in scheduling discipline regardless. |
| All 3 accounts capped simultaneously (account_chain_exhausted) | Account selector finds no eligible account | Per the existing `cron-fork-anti-flood-on-account-chain-exhaustion` doctrine principles: write ONE P2 status_board row per cap-wave (deduped), compute min(resets_at) across all 3, schedule the dispatch retry at that time. Continue conductor work that doesn't need dispatch. |
| Dispatched chat itself dispatches (recursion) | The child reads `dispatched-task-pickup` skill, which would itself trigger dispatch availability | **Allow recursion, gate it.** A child dispatch is fine - it spreads load further - BUT the child must set `parent_session_id` and `recursion_depth = parent.recursion_depth + 1`. Depth > 3 is rejected at the dispatcher. This is the manager-fork-equivalent and is genuinely useful for fan-out work. |
| Authentication drift: one account's session expires, IDE pinned to it silently fails | Direct file probe at `<config_dir>/.credentials.json` (or whatever filename Phase 0 test 5 confirms CC writes); parse expiry; classify `valid` / `expiring_soon (<24h)` / `expired`. NO `claude` invocation needed - the probe is pure file read + JSON parse. | If `expired` or `expiring_soon`: write a P1 status_board row `next_action_by=tate` ("re-login money@ in Insiders terminal: `CLAUDE_CONFIG_DIR=C:\Users\tjdTa\.claude-money claude /login`") and refuse the dispatch. If `valid`: proceed. The probe is cheap, file-read-only, runs on every dispatch. |
| Corazon reboots mid-dispatch | `last_heartbeat_at` stops; orphan-detector fires after 25min | The dispatched_tasks orphan recovery handles this exactly as it handles in-task death. IDE-tab persistence: VS Code restores tabs on relaunch but the terminal pane content is gone. The `dispatched-task-pickup` skill's continuation-aware logic re-reads brief + artifacts and resumes. |
| Visibility: Tate wants to see "what's running where" at a glance | He has no panel chat for dispatched work | A single status_board row `entity_type=infrastructure, name=dispatch_status` updated every 60s by the orphan-detector with: `active_count, per_account: {tate:N,code:N,money:N}, oldest_running_age, last_completed_at`. Plus auto-preview the current view to `backend/coordination/dispatch-status.md` on each tick (the auto-preview substrate is already alive per [[auto-preview-md-html-on-write-2026-05-16]]). See "Mental model for Tate" section at top. |
| `~/.claude.json` shared-state contamination | Phase 0 test 2 explicitly probes this. If contamination is observed, Phase 0.5 activates (build USERPROFILE-faking wrapper). | If contamination is real, the `claude-multi.ps1` wrapper redirects `HOME` and `USERPROFILE` per launch, not just `CLAUDE_CONFIG_DIR`. If not real, no wrapper; raw `claude` invocation in the integrated terminal is sufficient. Evidence-driven choice, not speculative ship. |
| Per-account IDE-MCP discovery fails (CLI can't see the panel's MCP server) | Phase 0 test 7 measures whether dispatched CLIs can do their job WITHOUT IDE-MCP features (diff viewer, @mention). | If dispatched chats can ship without these features (likely - they commit + push, don't need diff viewer): accept the degradation, document the surface. If they can't: symlink `~/.claude/ide` into each per-account config dir at setup time. Decision made on Phase 0 evidence. |
| ccusage data is stale or wrong | `freshness_ok=false`, OR an account hits its cap during a task we just dispatched to it | 5min poll cadence + fail-safe: dispatcher refuses to use any account whose data is >10min stale. In-task cap-hit shows up as orphaned task (no heartbeat); orphan handler re-dispatches on the freshest-budget account. |
| Extension auto-update breaks `claudeCode.claudeProcessWrapper` (if we use that path) | Dispatch silently fails next day after CC update | **Not relevant in recommended architecture** - the wrapper path is the fallback. If we go terminal-CLI dispatch, extension updates don't break dispatch (only the panel). |
| Anthropic clarifies post-15-June that CLI-launched-from-non-interactive contexts count toward the $200/mo programmatic cap | Tate alerts on policy update; or monthly statement shows programmatic charges; or `claude` itself starts surfacing a warning | See "Hedges" section. Dispatcher's interface stays the same; the executor swaps to scheduled Routines (cloud sessions on claude.ai already account-billed correctly). |

---

## 4. Comparison matrix

| Architecture | Pros | Cons | Verdict |
|---|---|---|---|
| **RECOMMENDED: Terminal CLI dispatch, per-IDE `CLAUDE_CONFIG_DIR` via `terminal.integrated.env.windows`** | Uses documented, working CC mechanism (`CLAUDE_CONFIG_DIR` for CLI). No extension hacks. Panel stays sane for Tate. Three IDEs / three accounts via three env configs. `gui.sequence` macro is well-trodden. Reflex substrate already 70% there. | CLI in terminal pane is slightly noisier than panel chat. IDE-MCP discovery needs the symlink trick or accept degraded experience for dispatched work (Phase 0 test 7 decides). Tate has no panel chat for dispatched work (mitigation: the dispatch-status auto-preview). | **Build this.** |
| **Panel via `claudeCode.claudeProcessWrapper`** | Stays in the graphical panel UX. | Tested-broken or undocumented. The wrapper path has reports of "ReferenceError: Claude Code native binary not found". Extension auto-update is an active break vector. Settings-deletion bug #10217 could nuke our config silently. Per pasrom's #30538 trace, even when working it fixes the spawned CLI but not the extension host's session-list / project-view - so the panel keeps showing tate@ history while typing hits money@. Broken UX. | Rejected. |
| **Panel via system-wide `CLAUDE_CONFIG_DIR` env var before each IDE launch** | Would be cleanest if it worked. | **Confirmed not working** per [#30538](https://github.com/anthropics/claude-code/issues/30538) (re-verified 2026-05-17 night against v2.1.143 on disk + thread comments at v2.1.70). Extension host process never inherits env vars set via `terminal.integrated.env.*`, `claudeCode.environmentVariables`, or `claudeCode.claudeProcessWrapper`. Only inherits from VS Code's parent shell - but VS Code is a single instance per installation, so this can't fan out to 3 accounts. | Rejected. Blocked by upstream. |
| **NEW v3: Fake `HOME` / `USERPROFILE` at VS Code launch time** | Only known path that DOES fix the extension host's view (per #30538 dovestyle comment + extension.js code path `process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude")`). Each IDE installation would launch with a different fake HOME -> each panel really would show a different account. | Side effects everywhere: VS Code-launched browser opens with fresh profile, git looks for credentials in fake HOME, VS Code itself stores its OWN settings in the fake HOME (so each fake-HOME IDE needs its own settings sync). Tate's interactive flow breaks in subtle ways. | Bench. Use only as Hedges contingency if Anthropic clarifies CLI billing against us. |
| **One IDE, N tabs, account rotation via creds swap before each tab open** | Single IDE to manage. Tate sees all dispatch in one place. | Serial dispatch only (creds swap is mutex - can't have two accounts active at once). Defeats the parallelism goal. Cred swap window is racy. | Rejected. Parallelism is the point. |
| **Three separate Windows user accounts, one per Max account** | Maximum isolation. Each account's `~/.claude/` is literally a different `~`. The extension bug doesn't matter because each user sees a different `~`. | Brutal UX. Tate would need fast-user-switch or RDP-into-self per account. Each account needs its own VS Code install, extensions, settings, MCP servers, hooks. Workspace switching is a nightmare. Disk usage 3x. | Rejected unless other paths fully fail. |
| **API key rotation with `claude` SDK / `-p` calls** | Trivially parallel. | **Violates the hard constraint** - programmatic Anthropic API billing post-15-June-2026 is capped at $200/mo/account. Whole local-first migration was done specifically to escape this. Headless `claude -p` is also potentially programmatic-billed (Anthropic has not been crisp about which CLI invocations count; see Hedges section). | Rejected per hard constraint. |
| **Dispatcher-chat-in-its-own-IDE pattern** (one "dispatcher" CC chat that only dispatches, lives in its own IDE) | Clean separation between conductor (decisions) and dispatcher (mechanical spawn). | Adds an extra hop. Tate still has to know which chat is which. The conductor already has GUI / laptop-agent / kv_store access; it can dispatch directly. | Rejected. Over-engineered. The conductor IS the dispatcher. |
| **Anthropic Routines for everything that needs another account** | Already exist, already account-billed correctly. | Routines are cloud sessions on claude.ai - they execute on Anthropic infra, not Corazon. They don't have laptop-agent access, don't have local filesystem, don't share workspace state. They're for scheduled / webhook-triggered work, not on-demand parallel dispatch. | Use Routines for what they're for; not a substitute for IDE-tab dispatch. Also the Hedges fallback substrate if Anthropic clarifies CLI billing against us. |

---

## 5. Build plan in phases

### Phase 0: Empirical verification of assumptions (DO BEFORE BUILD)

Before writing a line of code we verify the load-bearing assumptions in a throwaway sandbox:

1. **Verify `CLAUDE_CONFIG_DIR` actually isolates on Windows for our CC version**: create `C:\Users\tjdTa\.claude-test`, set env, run `claude /login`, log in to money@. Then in a separate shell with `CLAUDE_CONFIG_DIR=C:\Users\tjdTa\.claude` run `claude /usage` - confirm it's still tate@. (~10min)
   - **1a (NEW in v3): re-verify #30538 status on v2.1.143** by setting `claudeCode.environmentVariables.CLAUDE_CONFIG_DIR` in VS Code settings.json, restarting VS Code, opening the panel, and checking via `/status` whether the panel chat sees the test config dir. **Expected: panel still shows the default `~/.claude/` account.** Probe also: does the panel's session-history list (the sidebar showing recent conversations) show conversations from `~/.claude/projects/` or from the new test dir? Per the bundled extension source on disk and the #30538 thread, it should show `~/.claude/projects/` regardless. **If this test SHOWS isolation** (i.e. the bug got fixed between v2.1.70 thread comments and v2.1.143 without me finding it): redesign immediately to `claudeCode.environmentVariables.CLAUDE_CONFIG_DIR` per IDE - massive simplification, no terminal-CLI complexity, no `dispatch.spawn`, just three IDE settings.json files. **Expected outcome based on v3 disk + thread verification: bug persists, terminal-CLI design holds.**
2. **Verify `~/.claude.json` does NOT bleed** between sessions. Run two parallel CLIs with different config dirs, confirm independent state. **If contamination is observed: Phase 0.5 activates (wrapper build path). If clean: skip Phase 0.5 entirely.** (~10min)
3. **Verify VS Code's `terminal.integrated.env.windows` actually injects per-IDE-installation** (it should; documented). Open VS Code Stable + Insiders + Cursor side-by-side, set different env vars in each, open integrated terminals, confirm `$env:TEST_VAR` differs. (~10min)
4. **Verify ccusage reads per-config-dir correctly**: FIRST `npm install -g ccusage` (NEW in v3: confirmed NOT installed). THEN `ccusage --json` against the test dir vs default dir, confirm different numbers. If no `--config-dir` flag, fall back to `CLAUDE_CONFIG_DIR=<dir> ccusage --json`. If ccusage proves unusable for our purposes, fall back to direct JSONL parser per §1.4. (~10min)
5. **Spike the credential file format**. Inspect `C:\Users\tjdTa\.claude\` and `C:\Users\tjdTa\.claude-test\` for the auth-state file. Likely candidates: `.credentials.json`, `auth.json`, `session.json`. Confirm filename, parse the JSON shape, identify the expiry field. The Phase 4 auth probe parses this directly - NO `claude` invocation in the probe path. Document the schema (filename, expiry field name, expected format). (~15min)
6. **Verify Cursor extension behaves identically to VS Code** for the integrated-terminal env path (most likely yes; same extension binary - all three IDEs on disk have `anthropic.claude-code-2.1.143-win32-x64`). (~10min)
7. **Measure IDE-MCP discovery degradation in dispatched terminals.** Open an integrated terminal with `CLAUDE_CONFIG_DIR=C:\Users\tjdTa\.claude-test` set, run `claude` there, and probe whether IDE-MCP features work: (a) does the chat show the IDE-MCP server in `/mcp` list? (b) does `@<filename>` autocomplete work? (c) does the diff viewer open when the chat proposes an edit? Document what's present vs absent. If everything works: no symlink needed, no Phase 7a. If diff viewer absent but @-mention works: probably acceptable for dispatched work; document. If both absent: build the symlink workaround as Phase 7a. (~15min)
8. **(NEW in v3) Decide laptop-agent home.** Verified live agent runs from `D:/.code/eos-laptop-agent/` via `pm2 show 0`. Decide for build: do we extend that codebase (recommended, since it's live) or extend the in-tree-migration copy at `D:/.code/eos-laptop-agent/` (forward-looking, but the migration that vendored it isn't complete - missing reflex.js, input.js, macro.js, keyboard.js, mouse.js). **v3 recommends: build in `D:/.code/eos-laptop-agent/tools/dispatch.js`.** When the in-tree migration completes, dispatch.js gets ported across with reflex.js. (~5min decision, just confirm with Tate)

Total: ~85min. If Phase 0 test 1 or 3 fails the architecture needs revision before build. Test 1a outcome determines whether the WHOLE architecture collapses to a simpler panel-env-var design (expected: no, bug persists). Test 2 outcome determines Phase 0.5 activation. Test 7 outcome determines Phase 7a activation.

### Phase 0.5: USERPROFILE-faking wrapper (CONDITIONAL on Phase 0 test 2 failure)

**Activate only if Phase 0 test 2 observes `~/.claude.json` contamination across config dirs.** Otherwise skip this phase entirely.

1. Author `~/.ecodia/bin/claude-multi.ps1` per the joshcgrossman recipe. It:
   - Accepts `-Account <name>` parameter
   - Sets `$env:CLAUDE_CONFIG_DIR = "C:\Users\tjdTa\.claude-$Account"`
   - Sets `$env:USERPROFILE = "C:\Users\tjdTa\.claude-$Account-home"` (the fake home that contains a fake `.claude.json`)
   - Sets `$env:HOME = $env:USERPROFILE` for cross-tool safety
   - Exec's the real `claude` binary with all remaining arguments forwarded
2. Set up `C:\Users\tjdTa\.claude-money-home\.claude.json` and `.claude-code-home\.claude.json` as empty `{}` (will be populated on first launch).
3. Wire each IDE's `terminal.integrated.env.windows` to point to a wrapper-aware invocation: rather than `claude`, the terminal runs `pwsh -File C:\Users\tjdTa\.ecodia\bin\claude-multi.ps1 -Account money`.
4. Acceptance: run wrapper in two terminal panes with different `-Account`, verify `/usage` shows two different account states AND `~/.claude.json` in tate@ is not touched by money@ activity.
5. Add wrapper-rot monitoring: a daily cron that runs both wrapped invocations and confirms each still authenticates against the expected account. Surfaces a P1 row if wrapper breaks (e.g. CC binary path changes).

Cost: ~2-3h to build + verify. Wrapper-rot risk is real (every CC update could move the bundled binary path) - daily monitoring is non-optional if this phase activates.

### Phase 1: Per-IDE account isolation (manual ops, no code)

1. Tate logs out of any extra accounts in tate@.
2. `New-Item -ItemType Directory C:\Users\tjdTa\.claude-money` and `.claude-code`.
3. In each new dir, run `CLAUDE_CONFIG_DIR=<dir> claude /login` once. Login as money@ in `.claude-money`, code@ in `.claude-code`.
4. VS Code Insiders + Cursor are already installed (verified via extension probe). No new IDE install needed.
5. In each IDE user settings.json, add the `terminal.integrated.env.windows.CLAUDE_CONFIG_DIR` block from §2.5 (or the wrapper invocation if Phase 0.5 activated).
6. Restart each IDE, open integrated terminal, run `claude /status` - confirm each shows the expected account.

Acceptance: three IDEs, three integrated terminals, each running `claude` shows a different account in `/status`.

### Phase 2: ccusage cron + kv_store usage substrate

1. **`npm install -g ccusage`** (NEW in v3: confirmed NOT currently installed on Corazon via `which ccusage` + `npm list -g`). Install to `D:/SSD_Turbo/node-global/` (the active npm prefix per env probe).
2. Write `D:/.code/EcodiaOS/backend/scripts/poll-claude-max-usage.ps1` - iterates three config dirs, runs `ccusage --json` with each (or the JSONL-parser fallback per §1.4 if ccusage unusable), parses, writes to `kv_store.claude_max_usage.<account>` via the existing `kv_store.set` MCP tool.
3. Add to scheduler: `schedule_cron` every 5min, ID `poll-claude-max-usage`.
4. Acceptance: `db_query SELECT value FROM kv_store WHERE key LIKE 'claude_max_usage.%'` shows three rows updating every 5min.

### Phase 3: dispatched_tasks substrate + coordination directory

1. **NEW in v3: create `D:/.code/EcodiaOS/backend/coordination/` directory.** Empty .gitkeep. The directory does NOT currently exist on disk; this phase establishes it. (The `ide-tab-is-the-new-fork-mechanic` doctrine mentions the path aspirationally but never landed the dir.)
2. **Migration path corrected in v3:** the migration runner is `node src/db/migrate.js` (per `package.json` `"migrate": "node src/db/migrate.js"`). Migration files live in `D:/.code/EcodiaOS/backend/src/db/migrations/` (NOT `backend/migrations/` which doesn't exist, NOT `backend/scripts/migrations/` which has a single legacy file). Number the new migration following the existing convention (current highest `017_organism_codebase_seed.sql` - check disk for current top number before adding to avoid collision). Drop the SQL at `src/db/migrations/<NNN>_dispatched_tasks.sql` per §2.2 schema.
3. Run: `npm run migrate` from `D:/.code/EcodiaOS/backend/`. The runner reads `_migrations` table to skip applied files; new file applies once.
4. MCP tool shim: extend `src/routes/mcp/cowork.js` with the four `dispatched_tasks.*` tools per §2.6.
5. Acceptance: from any CC session, `mcp__cowork__dispatched_tasks_pickup(id=<uuid>)` returns a brief.

### Phase 4: `dispatch.spawn` on the laptop agent (with file-based auth probe)

1. **Home decided in v3:** add `D:/.code/eos-laptop-agent/tools/dispatch.js` (the LIVE agent codebase, confirmed via `pm2 show 0`). Module exports `dispatch.spawn({task_id, target_ide, target_account})` primitive. The in-tree migration copy at `D:/.code/eos-laptop-agent/` is dormant; whoever finishes that migration will port dispatch.js across with reflex.js (logged as v3 open question #11).
2. **Pre-dispatch auth probe is pure file read** (per Phase 0 test 5 schema discovery):
   ```js
   function probe_auth(account):
     path = `C:/Users/tjdTa/.claude-${account}/<auth-filename>`  // from Phase 0 test 5
     if not fs.existsSync(path): return {status: 'missing', reason: 'no credentials file'}
     try:
       creds = JSON.parse(fs.readFileSync(path))
       expiry = parse_expiry(creds)                              // field name per Phase 0 test 5
       now = Date.now()
       if expiry < now: return {status: 'expired'}
       if expiry < now + 24h: return {status: 'expiring_soon'}
       return {status: 'valid'}
     catch e: return {status: 'unparseable', error: e.message}
   ```
   The probe never invokes `claude`. Cheap, no OAuth roundtrip, no spawn overhead.
3. If probe returns anything other than `valid`: refuse dispatch, surface P1 status_board row with the exact relogin command for Tate. If `valid`: proceed.
4. Internally calls `gui.sequence`: Step 0 foreground-collision -> WinActivate target IDE -> Ctrl+` -> type CLI invocation -> wait -> paste pickup line -> Enter. **Borrow design from `~/ecodiaos/scripts/cowork-dispatch`** (bash wrapper, prior art) for the foreground-collision + passkey-inject handling - that script has battle-tested macro sequences for the same surface (precheck, focus, instruct, step, foreground-check). Cowork-dispatch stays alive as a manual debug tool; dispatch.spawn is the autonomous version.
5. Acquires `kv_store.dispatch.lock.<target_ide>` (atomic SET-if-not-exists with 30s TTL) before macro, releases after.
6. Acceptance: manual `dispatch.spawn` test - INSERT a row, call the tool, see a new terminal pane appear in target IDE with `claude` running as the right account, that picks up the task and writes back a result. AND deliberately corrupt one account's auth file and confirm the dispatcher refuses + writes the P1 row.

### Phase 5: Dispatcher logic (the conductor-side library)

1. `D:/.code/EcodiaOS/backend/src/services/dispatcher.js` - one function `dispatch(brief_md, opts={preferred_ide?, max_recursion_depth=3})` implementing the transactional flow per §2.7:
   a. Reads `kv_store.claude_max_usage.*`, picks best account.
   b. Writes brief to `backend/coordination/<uuid>.md`.
   c. INSERTs dispatched_tasks row (status='pending').
   d. Calls laptop-agent `dispatch.spawn` (which runs the file-based auth probe first).
   e. On spawn success: UPDATE status='spawned'. On any failure between (b) and (d): DELETE row + DELETE brief file, raise.
   f. Polls dispatched_tasks for `started_at IS NOT NULL` for 30s; if null, treats as spawn failure -> rollback per (e).
   g. Returns `{task_id, target_account, target_ide, status}`.
2. Acceptance: from the conductor chat, calling the dispatcher via Phase 5a invocation surface actually spawns work on a different account, completes, and the conductor sees the result on next turn. Also: deliberately fail the gui.sequence mid-dispatch (e.g. kill the IDE), confirm no orphan row + no orphan brief.

### Phase 5a: Dispatch invocation surface (how the conductor calls the dispatcher)

The conductor needs a concrete way to trigger dispatch from a turn. v1: **bash shell-out via the existing Bash tool**. No new MCP tool, no new HTTP endpoint, no extension surface to maintain.

1. `D:/.code/EcodiaOS/backend/bin/dispatcher.js` (NEW path in v3: `bin/` directory for thin CLI wrappers - resolves the v2 open question about awkward `coordination/dispatcher.js` placement) is a CLI wrapper around `src/services/dispatcher.js`:
   ```
   node d:/.code/EcodiaOS/backend/bin/dispatcher.js spawn --brief <path-to-brief.md> [--preferred-ide vscode-insiders|cursor] [--max-recursion 3]
   node d:/.code/EcodiaOS/backend/bin/dispatcher.js status <task_id>
   node d:/.code/EcodiaOS/backend/bin/dispatcher.js cancel <task_id>
   ```
2. Conductor calls via Bash tool: `node d:/.code/EcodiaOS/backend/bin/dispatcher.js spawn --brief d:/.code/EcodiaOS/backend/coordination/<draft-brief>.md`. Output is JSON: `{task_id, target_account, target_ide, status, error?}`.
3. **Brief authoring discipline:** conductor writes the brief file FIRST (as a draft), then invokes dispatch with `--brief <path>`. The dispatcher reads the file, copies to the canonical `coordination/<uuid>.md` path (or moves, depending on whether the draft path matches the canonical), and proceeds. This keeps the conductor's write step and the dispatch step separable but transactional inside the dispatcher.
4. **Wrap as MCP tool later if friction emerges.** v1 is intentionally minimal. If conductor chats find the shell-out clumsy or error-prone, Phase 11 (later) wraps the dispatcher CLI as an `mcp__cowork__dispatch_spawn` tool on the cowork MCP. Not v1 scope.
5. Acceptance: from a fresh conductor chat, the conductor can issue a `Bash` tool call to dispatch a real brief and observe the JSON return value parsed correctly.

### Phase 6: Orphan detection + auto-recovery cron

1. Cron every 5min: `SELECT * FROM dispatched_tasks WHERE status IN ('spawned','running') AND last_heartbeat_at < now() - interval '25 min'`.
2. **25min threshold rationale.** The dispatched skill emits heartbeats at every turn boundary, not on a timer. A single long tool call (build, deploy poll, large file write, `start_cc_session` wait) can block 10-20min. The 25min threshold tolerates the slowest realistic single-tool-call duration plus 5min margin. Initial 5min threshold (v1 draft) was wrong because it assumed timer-driven heartbeats; assistant turns are single-threaded and can't preempt tool calls. If empirical data shows even 25min is too tight (e.g. multi-build cycles routinely hit 30min), bump to 30-40min before lowering parallelism.
3. Flip status='orphaned', write P3 row, optionally auto-redispatch with recursion_depth+1.
4. Acceptance: kill a dispatched chat mid-task by closing the terminal, orphan-detector flips status within 25-30min, dispatcher re-dispatches.

### Phase 7: Visibility - dispatch-status dashboard via auto-preview

1. Cron every 60s: regenerate `backend/coordination/dispatch-status.md` with current state.
2. The auto-preview hook (already shipped) pops it in Tate's IDE.
3. Single status_board row `entity_type=infrastructure, name=dispatch_status` updated same cadence.
4. Content of `dispatch-status.md`: ASCII table of all active+recent dispatches, per-account usage gauges, oldest-running-age, last-completed-at, recursion depth visualisation.
5. Acceptance: Tate opens any IDE and sees a live preview tab showing what's dispatched where, plus the status_board row. This is the file referenced in "Mental model for Tate" section at top.

### Phase 7a: IDE-MCP symlink (CONDITIONAL on Phase 0 test 7)

**Activate only if Phase 0 test 7 shows dispatched chats can't do their job without IDE-MCP features.** Otherwise skip; document the degradation surface and move on.

1. At each per-account config dir, create a symlink: `New-Item -ItemType SymbolicLink C:\Users\tjdTa\.claude-money\ide -Target C:\Users\tjdTa\.claude\ide`.
2. Verify dispatched CLI in money@ terminal now sees the IDE-MCP server in its discovery list.
3. Caveat: this couples dispatched chats to whichever IDE's lockfile is freshest in `~/.claude/ide/` (6 lockfiles present on disk at probe time); if multiple IDE panels are running, the dispatched CLI might discover the wrong one's MCP. Acceptable for v1 if Phase 0 test 7 forces this path.

### Phase 8: Skill - `dispatched-task-pickup`

1. New skill in `~/.claude/skills/dispatched-task-pickup/` that activates on the pickup pasted line.
2. Encodes: read brief, set status=running, heartbeat at every turn boundary (NOT on a timer), write result, exit.
3. Idempotent (handles re-dispatch / partial state).
4. Acceptance: any dispatched CC session that sees "Pick up dispatched task <uuid>" follows the protocol correctly without further prompting.

### Phase 9 (later): Recursion + fan-out

Once Phase 8 is solid, the dispatched skill itself can call the dispatcher (depth-gated). This recovers manager-fork-style fan-out without resurrecting the dead SDK substrate.

### Dependencies

- Phase 0 -> 0.5 (cond) -> 1 -> 2 -> 3 -> 4 -> 5 -> 5a -> 6, 7, 7a (cond), 8 (in parallel) -> 9
- Estimated ship: Phase 1-5a in one focused day (assuming Phase 0.5 + 7a do not activate); 6-8 in a second day; 9 a week later after observing dispatch behavior in production. If Phase 0.5 activates add ~half-day. If Phase 7a activates add ~1h.

---

## 6. Hedges

Architectural insurance, not blockers. Document so we have prepared answers when these scenarios land.

### 6.1 Anthropic clarifies CLI-launched-from-non-interactive billing against us (post-15-June-2026)

Currently the "interactive vs programmatic" line for billing is `claude` CLI (interactive) vs Agent SDK programmatic calls (capped at $200/mo/account). Anthropic has not been crisp about whether `claude` invocations launched from non-interactive contexts (e.g. our terminal-pane dispatch where the parent is a CC session, not a human typing in a real terminal) count as interactive or programmatic.

**If they clarify against us:** the dispatcher's interface (`node bin/dispatcher.js spawn --brief ...`) stays the same; the executor swaps. Three potential executors, ranked:
1. **Anthropic Routines.** Instead of `dispatch.spawn` opening a terminal pane and running `claude`, it POSTs to an Anthropic Routine (`/fire` endpoint) on the chosen account. The routine reads the brief from `dispatched_tasks`, does the work, heartbeats via the same `dispatched_tasks` substrate, writes results. Routines are cloud sessions on claude.ai already billed correctly under subscription rate. Cost of swap: ~1 day.
2. **Fake-HOME-VS-Code-launcher fallback** (the v3-added contingency from §1.2). Each IDE gets its own fake HOME. Per-IDE panel really shows different account. Big UX cost for Tate (browser opens from VS Code use fake profile, git looks for creds in fake HOME, IDE settings live in fake HOME). Last resort.
3. **Three separate Windows user accounts.** Brutalist final fallback per comparison matrix.

Substrate (`dispatched_tasks`, brief files, dispatch-status.md, skills) is executor-agnostic. Already validated by EcodiaOS's existing `backend/routines/` infrastructure.

**Monitoring trigger:** Tate watches Anthropic policy update threads + monthly statement on the three Max accounts. If programmatic-billed line items appear for `claude` CLI usage, swap the executor.

### 6.2 4th Max account joins (Corazon has only 3 IDE installations)

The architecture scales trivially in account count - just add another config dir + IDE installation. Corazon currently runs VS Code Stable, VS Code Insiders, Cursor.

**Prepared answer for IDE #4: Windsurf.** It ships the `anthropic.claude-code` extension via Open VSX, has the same integrated-terminal env path, runs on Windows, doesn't conflict with the three existing IDEs. Install path lives next to the others; per-IDE settings file gets the same `terminal.integrated.env.windows.CLAUDE_CONFIG_DIR` treatment.

Cost of adding account #4: ~30min IDE install + Phase 1 manual ops + a row in the account selector's allowlist. No architecture change.

If Windsurf falls out of favour later, Kiro or a portable `code` install are next-in-line. The selector logic is N-aware; the bottleneck is purely "one IDE installation per account" because of the panel-pinning bug.

---

## 7. Open questions

These are still genuinely open after the v3 patches. Some Phase 0 tests close them; others need empirical observation in production.

1. **Auth file schema (Phase 0 test 5).** Filename, expiry field name, JSON shape. Likely `.credentials.json` with an `expires_at` or similar field, but unverified. Spike before Phase 4.
2. **Does `~/.claude.json` contaminate on our specific CC version (Phase 0 test 2)?** Determines whether Phase 0.5 (wrapper build) activates.
3. **IDE-MCP discovery degradation acceptable for dispatched chats (Phase 0 test 7)?** Determines whether Phase 7a (symlink build) activates.
4. **Does ccusage have a `--config-dir` flag or do we use `CLAUDE_CONFIG_DIR=<dir> ccusage`?** Minor; Phase 0 task 4. Also: does ccusage's output shape match what the dispatcher expects, or do we need the JSONL-parser fallback per §1.4?
5. **What's the actual semantics of "5-hour rolling window" for the dispatcher's purposes?** The cap is on active compute hours not wall-clock - does "queued in flight" count? Probably yes (the model is running). Need empirical observation in Phase 5 to tune the dispatch threshold (we suggested 0.85 but it could be lower).
6. **Does claude.ai web usage (e.g. Tate using claude.ai/code) burn into the same pool as Corazon CC?** Docs say yes. This means tate@ is doubly-loaded. Mitigation: dispatcher heavily prefers code@ and money@; tate@ only gets dispatched work when other two are >50%.
7. **Is the 25min orphan threshold right empirically?** Calibrated for the slowest realistic single-tool-call duration plus margin. Real production traces in Phase 5-6 may push us to 30-40min if multi-build cycles are common. Do not lower below 25min without confidence the heartbeat protocol can land more often than that.
8. **Should the dispatcher prefer to KEEP a tab open for re-use** (warm chat with full context) rather than spawn-and-close every time? Trade-off: warm tabs amortise cold-start cost but accumulate context bloat and need explicit `/clear` discipline. **Recommendation: spawn fresh each time for v1;** consider warm pools in v2 once we know typical dispatch volume.
9. **Should the dispatcher wrap as an MCP tool (Phase 11)?** v1 is bash shell-out via Bash tool. Decision made on observed friction post-Phase 8.
10. **Should Tate see dispatched chats in the panel session-history?** No (they live in a different config dir's `projects/`), and that's probably the right call - keeps his session history clean.
11. **NEW in v3: When does the in-tree laptop-agent migration finish, and who ports dispatch.js + reflex.js across?** The dormant copy at `D:/.code/eos-laptop-agent/` is missing `reflex.js`, `input.js`, `macro.js`, `keyboard.js`, `mouse.js`. Status_board row needed to track the port-finish work. Phase 4 builds dispatch.js in the live `D:/.code/eos-laptop-agent/tools/` codebase; that's the source-of-truth until the migration completes.
12. **NEW in v3: Does Phase 0 test 1a unexpectedly show the bug is fixed?** Treat as defensive insurance - the v3 verification strongly suggests the bug persists in v2.1.143 (extension.js has zero `claudeCode.configDir` references; thread comments cite v2.1.70 still broken). If 1a flips this, redesign immediately.

---

## Sources

- [Use Claude Code in VS Code (official docs)](https://code.claude.com/docs/en/vs-code)
- [Claude Code settings reference](https://code.claude.com/docs/en/settings)
- [GitHub issue #30538 - VS Code extension ignores CLAUDE_CONFIG_DIR](https://github.com/anthropics/claude-code/issues/30538) (open, re-verified unfixed in v2.1.143 - blocker for the panel-isolation path; root cause trace by pasrom in thread comments)
- [GitHub issue #25762 - CLAUDE_CONFIG_DIR feature request](https://github.com/anthropics/claude-code/issues/25762)
- [GitHub issue #10217 - extension deletes claudeCode.environmentVariables on activation](https://github.com/anthropics/claude-code/issues/10217)
- [GitHub issue #55486 - extension contributes env vars too late](https://github.com/anthropics/claude-code/issues/55486)
- [GitHub issue #3833 - CLAUDE_CONFIG_DIR behavior unclear](https://github.com/anthropics/claude-code/issues/3833)
- [GitHub issue #10491 - claudeCode.claudeProcessWrapper docs](https://github.com/anthropics/claude-code/issues/10491)
- [Running two Claude Code accounts on one Windows PC - Josh Grossman, Feb 2026](https://joshcgrossman.com/2026/02/04/claude-two-accounts-windows/) (the `USERPROFILE` faking recipe)
- [Manage Multiple Claude Code Accounts - KMJ-007 gist](https://gist.github.com/KMJ-007/0979814968722051620461ab2aa01bf2)
- [Run Multiple Claude Code Instances with Separate Configs - shukebeta](https://blog.shukebeta.com/2026/05/14/run-multiple-claude-code-instances-with-separate-configs)
- [How to Use More Than One Claude Code Profile on the Same Machine - wmedia.es](https://wmedia.es/en/tips/claude-code-multiple-profiles-config-dir)
- [aisw - switching between multiple accounts in Claude Code / Codex / Gemini CLI](https://burakdede.com/blog/switch-accounts-claude-code-codex-gemini-cli/) (prior-art tool)
- [Multi-account load balancer - Jon Roosevelt](https://jonroosevelt.com/blog/claude-multi-account-load-balancer) (403'd on fetch; mentioned in search index)
- [ccusage - Claude Code Usage Analysis](https://ccusage.com/guide/library-usage), [npm](https://www.npmjs.com/package/ccusage), [GitHub](https://github.com/ryoppippi/ccusage)
- [Claude Code /usage Command Explained - Vincent Qiao](https://blog.vincentqiao.com/en/posts/claude-code-usage/)
- [Cursor URI scheme discussion](https://forum.cursor.com/t/does-cursor-have-a-unique-open-scheme/3659)
- [Pattern: ide-tab-is-the-new-fork-mechanic-2026-05-17](../patterns/ide-tab-is-the-new-fork-mechanic-2026-05-17.md) (the doctrine this dispatcher slots under)
- [Pattern: cowork-no-focus-collision](../patterns/cowork-no-focus-collision.md) (Step 0 foreground probe)
- [Pattern: auto-preview-md-html-on-write-2026-05-16](../patterns/auto-preview-md-html-on-write-2026-05-16.md) (dispatch-status visibility substrate)
- Local file: `D:/.code/eos-laptop-agent/tools/gui.js` (`gui.sequence` implementation in the LIVE agent)
- Local file: `D:/.code/eos-laptop-agent/tools/reflex.js` (the firing primitive being extended)
- Local file: `~/ecodiaos/scripts/cowork-dispatch` on VPS (bash prior-art for the spawn macro sequence)
- Local file: `D:/.code/EcodiaOS/backend/src/db/migrate.js` (the migration runner; invoked via `npm run migrate`)

---

## v2 -> v3 deltas

Deep red-team pass with disk + GitHub verification (2026-05-17 night):

- **CRITICAL: #30538 re-verified against v2.1.143 on disk + thread comments.** Bug persists. Architecture holds. TL;DR rewritten to lead with this verification. New Phase 0 test 1a explicitly probes for the fix in case anything shifted unseen. Mental model section + §1.1 + §1.3 + comparison matrix updated with v3 verification language.
- **Root cause now documented inline (§1.1).** pasrom's #30538 trace through the minified extension: `IG()` = `process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude")` runs in the extension host, which never inherits env from VS Code settings. This is the mechanical fact that kills every "set CLAUDE_CONFIG_DIR via a VS Code setting" path.
- **NEW third escape hatch documented in §1.2: fake HOME / USERPROFILE at VS Code launch.** Only known path that fixes the extension HOST's view (per dovestyle comment). Big UX side effects. Kept on bench as Hedges contingency, not recommended default.
- **`backend/coordination/` corrected.** v2 falsely cited it as "an established convention from ide-tab-is-the-new-fork-mechanic doctrine." Doctrine mentions the path aspirationally; never landed. v3 §2.2 + Phase 3 step 1 explicitly create the directory. Mental model section also corrected.
- **`backend/migrations/` corrected.** Directory doesn't exist. Real migration runner is `npm run migrate` -> `node src/db/migrate.js`, with files in `src/db/migrations/<NNN>_*.sql` (auto-numbered, sorted, applied via `_migrations` tracking table). Phase 3 step 2 rewritten with the correct path + runner invocation + numbering convention warning.
- **ccusage install step added.** Verified NOT installed on Corazon (which ccusage + npm list -g both empty). Phase 0 test 4 starts with `npm install -g ccusage`. JSONL-parser fallback documented in §1.4 if ccusage proves unsuitable.
- **Laptop-agent home decided (§1.5 + new Phase 0 test 8).** Live agent runs from `D:/.code/eos-laptop-agent/` (confirmed via `pm2 show 0` -> script path + cwd). The in-tree `D:/.code/eos-laptop-agent/` is a partial / dormant migration copy missing reflex.js + input.js + macro.js + keyboard.js + mouse.js. v3 builds dispatch.js in the live codebase. Open question #11 tracks the port-finish work.
- **`cowork-dispatch` bash wrapper acknowledged as prior art (new §1.7).** Read via SSH to VPS. Phase 4 step 4 now says "borrow design from cowork-dispatch" for the foreground-collision + passkey-inject macro sequences. Cowork-dispatch stays alive as manual debug tool; dispatch.spawn is the autonomous version.
- **Lockfile count corrected.** 6 lockfiles at `~/.claude/ide/` (27199, 37909, 49138, 64933, 65277, 65380), not 5 as v2 stated.
- **CLI wrapper path moved to `bin/` (Phase 5a).** Resolves the v2-tail open question about awkward `coordination/dispatcher.js` placement. `backend/bin/dispatcher.js` is the thin CLI wrapper; `backend/src/services/dispatcher.js` is the service module.
- **Insiders + Cursor pre-install confirmed (Phase 1 step 4).** Both have `anthropic.claude-code-2.1.143-win32-x64` already installed. No new IDE install needed - just the per-IDE settings.
- **Comparison matrix updated.** New row for fake-HOME path. `claudeProcessWrapper` row strengthened with the pasrom-trace nuance (even when working, doesn't fix the extension host's session-list view).
- **Hedges §6.1 ranked.** Three executor fallbacks ordered by cost: Routines (1 day) -> fake-HOME (big UX cost) -> three Windows user accounts (brutalist last resort).

Now obsolete from v2: `backend/coordination/` as "established convention", `backend/migrations/` as ship path, ccusage as "(already present? verify)", laptop-agent home as ambiguous between two repos, cowork-dispatch unmentioned as prior art, 5 lockfiles, awkward `coordination/dispatcher.js` placement, single-issue-cite #30538 without thread root-cause analysis.

---

## v1 -> v2 deltas

Patches integrated from red-team review:

- **Mental model for Tate section** added near top (issue 6). Explicit "panels show tate@; dispatched work lives in terminals; dispatch-status.md is the single window."
- **Phase 4 auth probe rewritten** (issue 1). Replaced broken `claude --version` probe with direct file read of `<config_dir>/<auth-file>`, parse expiry, classify valid/expiring_soon/expired. Phase 0 test 5 added to spike the actual file schema.
- **Phase 6 heartbeat threshold rewritten** (issue 2). 5min -> 25min orphan threshold. Heartbeat protocol rewritten: every turn boundary, not on a timer. Rationale documented (single-threaded turns, tool calls block timers). §2.4 contract updated. Schema comment updated.
- **Phase 0.5 added as conditional stub** (issue 3). Activates only if Phase 0 test 2 observes `~/.claude.json` contamination. Wrapper not built preemptively. Both paths fully specced so we can flip cleanly on Phase 0 evidence.
- **Phase 5a added** (issue 4). Dispatch invocation surface explicit: bash shell-out via the existing Bash tool, calling `node coordination/dispatcher.js spawn ...`. MCP-tool wrap deferred to Phase 11. v1 intentionally minimal.
- **§2.7 Transactional dispatch added** (issue 5). Brief write + row insert + spawn happen as one unit; spawn failure rolls back brief delete + row delete. No orphan pending rows. Recovery cron only handles spawned-then-died.
- **Phase 0 test 7 added** (issue 7). Measure IDE-MCP discovery degradation in dispatched terminals; decide symlink build (Phase 7a) on evidence, not assumption.
- **Hedges section added** (issues 8, 9). Anthropic CLI-billing-clarification fallback (executor swap to Routines). Windsurf as prepared answer for 4th account.
- **Open questions list updated** to reflect what remains genuinely open after v2 patches.

Now obsolete from v1: 5min orphan threshold, `claude --version` auth probe, "spec Plan B but don't build it" wrapper hand-wave, unspecified dispatch invocation surface, row-then-spawn-then-orphan-on-failure ordering, panel-vs-terminal mental model implicit only in failure-modes table.
