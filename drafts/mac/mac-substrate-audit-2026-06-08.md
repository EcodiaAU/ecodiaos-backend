# Mac substrate audit - 2026-06-08

Auditor: EcodiaOS (read-only probes, no mutations)
Context: post-ecodia-conductor decom (2026-06-08). MacBookPro.lan is the canonical workstation.

Note on probe technique: I initially probed `/api/info` as a GET (returns the partial 7-module set) and concluded the in-repo agent was running. Both wrong. The actual call is POST `/api/tool` (or curl with auth on `/api/info`) and the **canonical agent at `/Users/ecodia/.code/eos-laptop-agent/` is the one running on port 7456**, exposing 284 tools including the full cdp/coord/cowork/scheduler/gui set. The hook nudges that surface "use `scripts/agent <tool> '<json>'`" exist precisely to short-circuit this trap.

Probe artefacts under `/tmp/audit-*.txt`.

---

## Dimension 1 - Process supervision

**STATUS: ok**

**EVIDENCE:**
- `~/Library/LaunchAgents/au.ecodia.laptop-agent.plist` (1187b, mod 2026-06-08 11:09), `au.ecodia.cred-refresher.plist` (1476b, mod 11:32), `au.ecodia.usage-poller.plist` (1319b, mod 11:38).
- `launchctl list` shows all three loaded with the correct PIDs: 74973 (laptop-agent), 1543 (cred-refresher), 1530 (usage-poller). All exit-status 0.
- ps confirms: `node index.js` (cwd `/Users/ecodia/.code/eos-laptop-agent/`) + `daemons/cred-refresher.js` + `daemons/usage-poller.js`, all `PPID 1` = launchd-owned.
- pm2 not installed on Mac. launchd is the supervisor and it's wired correctly.

**GAP:** None for the running trio.

**FIX:** Worth a `tmutil destinationinfo` confirmation that the plists themselves are inside a backup target (Dimension 10).

---

## Dimension 2 - laptop-agent on Mac

**STATUS: ok (canonical build, all features present)**

**EVIDENCE:**
- Running build: `/Users/ecodia/.code/eos-laptop-agent/index.js` confirmed by lsof cwd on PID 74973.
- HEAD: `ff7b1e83` "fix(scheduler): respect rotate_to safety gate; dispatch on live account when deferred" (2026-06-08 13:06 AEST).
- `POST /api/tool` with bearer returns 284 tools enumerable from the auth-attached `/api/info` GET (saved at `/tmp/api-info-full.json`, 6944b).
- Tool surface covers: `cdp.*` (30 incl. attach_tab, list_aliases, realClick, deepFindRect, nativeFill, findVisible, clickByTag, helpers), `coord.*` (27 incl. signal_done, signal_bound, close_my_tab, register_conductor, conductor_heartbeat), `cowork.*` (6 incl. dispatch_worker, swap_creds), `scheduler.*` (30 incl. schedule_delayed, schedule_cron, schedule_list, dispatchOne, leaseDueRows), `gui.*` (8 incl. enable_chrome_cdp, launch_cdp_chrome, sequence), `mac-dispatcher.*` (6), full `applescript.*` (18), `creds.*` (9 with Keychain reads), `ide.*` (32), `vscode.*` (15), `usage.*` (24).
- The in-repo `backend/laptop-agent/` is a stale historical copy (7 modules, Phase 1 GKG-era). It is NOT the running build. The lsof cwd was the definitive probe.
- Token at `~/.ecodiaos/laptop-agent.token` (65 bytes) authenticates `POST /api/tool` against the running process.

**GAP:** The in-repo `backend/laptop-agent/` confusing copy could lure a future audit (it lured this one). Worth either deleting or adding a `README.md` pointing at the canonical path.

**FIX:** Either `git mv backend/laptop-agent backend/laptop-agent.deprecated-pre-mac-canonical` or drop a 1-line README inside it.

---

## Dimension 3 - cred-refresher daemon

**STATUS: ok (running and supervised)**

**EVIDENCE:**
- launchd plist `au.ecodia.cred-refresher.plist` -> PID 1543 -> `/opt/homebrew/bin/node daemons/cred-refresher.js` (cwd `/Users/ecodia/.code/eos-laptop-agent`).
- Source: `daemons/cred-refresher.js` (17981b, mod 2026-06-08 11:08), plus `cred-refresher.test.js` (21060b).
- Per-account JSON files present and freshly updated:
  - `/Users/ecodia/PRIVATE/ecodia-creds/tate.json` (555b, mod 2026-06-08 13:04)
  - `/Users/ecodia/PRIVATE/ecodia-creds/code.json` (530b, mod 13:04)
  - `/Users/ecodia/PRIVATE/ecodia-creds/money.json` (472b, mod 12:02)
- Backups present (`code.json.pre-keychain-capture-2026-06-08`, `money.json.pre-keychain-sync-2026-06-08`) showing the keychain-sync swap landed.
- Memory note `cred-rotation-works-on-mac-2026-06-08.md` says "cred-refresher daemon still pending second plist" - that note pre-dates the plist landing at 11:32 today. Reality is healthier than the memory.

**GAP:** Memory note is stale (predates landing).

**FIX:** Update `cred-rotation-works-on-mac-2026-06-08.md` to drop the "pending" sentence (out of scope for this audit).

---

## Dimension 4 - kv-mirror

**STATUS: ok**

**EVIDENCE:**
- `/Users/ecodia/PRIVATE/ecodia-creds/kv-mirror/` exists (drwx------) with 68 cred JSON files + `MANIFEST.json`.
- Last refresh: 2026-06-08 10:01:34 AEST (every file in the dir).
- Refresh script: `/Users/ecodia/PRIVATE/ecodia-creds/kv-mirror-refresh.sh` (3097b, executable, mod 10:01).
- Files include the load-bearing ones: `supabase_access_token.json`, `apple.json`, `apple.password.json`, `bitbucket_api_token.json`, `chambers_tate_login.json`, `coexist.json`, `laptop_passkey.json`, all 10 `ecodia_*_mcp_bearer.json` shards.

**GAP:** No scheduled refresh. Currently kicked manually. If a `creds.*` rotates in kv_store and no one runs `kv-mirror-refresh.sh`, the Mac local mirror goes stale.

**FIX:** Author `~/Library/LaunchAgents/au.ecodia.kv-mirror-refresh.plist` with `StartInterval 14400` (4h), or schedule it via the laptop-agent scheduler (`scheduler.schedule_cron` "every 4h"). The doctrine in `kv-mirror-substrate.md` already names the freshness window.

---

## Dimension 5 - Hook stack invariants

**STATUS: ok**

**EVIDENCE (/tmp/audit-hooks-probe.txt):**
- `~/.claude/settings.json` references 58 hook scripts. All 58 resolve OK on disk.
- Workspace settings at `backend/.claude/settings.json` references `backend/.claude/hooks/chat-heartbeat.js` (1 hook), also OK.
- Mac-specific `chrome_cdp_reflex_surface.py`, `dispatch_sched_reflex_surface.py`, `dev_process_reflex_surface.py`, `coord_events_pending.py`, `autonomy_primitive_surface.py`, `self_scheduling_nudge.py`, `pm2_restart_guard.py`, `secret_guard.py`, voice scoring trio all present.

**GAP:** None.

**FIX:** None.

---

## Dimension 6 - Skills directory

**STATUS: ok**

**EVIDENCE:**
- `~/.claude/skills/` has 110 skill directories (find -maxdepth 1 -type d count: 111 including the dir itself).
- Coverage matches the SKILL.md list this session enumerated.

**GAP:** None.

**FIX:** None.

---

## Dimension 7 - VS Code Stable for worker dispatch

**STATUS: ok**

**EVIDENCE:**
- VS Code Stable installed at `/Applications/Visual Studio Code.app` (the binary runs from a Volume mount `/Volumes/VS Code/Visual Studio Code.app`, visible in the ps output of every Code Helper child, all `--user-data-dir=/Users/ecodia/Library/Application Support/Code`).
- The canonical agent exposes `cowork.dispatch_worker`, `cowork.list_workers`, `cowork.kill_worker`, `cowork.cleanup_orphan_workers`. Also a Mac-specific `mac-dispatcher.dispatch_worker` family (6 tools) that handles the macOS keystroke + window flow.
- `vscode.new_claude_code_chat` is in the surface (tool name confirmed in `/tmp/api-info-full.json`). This is the binding that abstracts the per-OS keystroke for spawning a fresh CC chat tab.
- Logs at `~/Library/Logs/eos-laptop-agent.out.log` confirm `Scheduler dispatcher: mac-dispatcher (darwin)` and `Scheduler started (autonomy substrate Phase 3)`.

**GAP:** None for installation + tool surface. The status_board P1 `b22cc8dd` (workers spawn but never `coord.signal_bound` back) is a runtime issue, not a wiring one. Log tail shows the failure mode in action: `[scheduler] dispatchOne: rotation to code deferred (active_workers=N), dispatching on unknown instead` plus `completionPass error: read ECONNRESET`. The dispatcher fires; the worker either fails to come up healthy or the signal never returns. That's the P1 to dig into - logs at `~/Library/Logs/eos-laptop-agent.{out,err}.log`.

**FIX:** Out of scope for this audit (Tate said audit only). The probe to run next is: spawn one worker manually via `agent cowork.dispatch_worker '{...}'`, watch the err log live, watch for `signal_bound` in the agent's coord state. The HEAD `ff7b1e83` ("dispatch on live account when deferred") suggests Tate fixed half of this earlier today.

---

## Dimension 8 - Chrome + CDP

**STATUS: ok**

**EVIDENCE:**
- Chrome installed at `/Applications/Google Chrome.app` (Chrome processes already visible in ps - `MacOS/Google Chrome` binary running).
- Chrome User Data at `~/Library/Application Support/Google/Chrome/` (Default profile + Crashpad + Local State, etc, all present).
- Also a CDP-isolated profile dir at `/Users/ecodia/chrome-cdp/` (separate user-data-dir for CDP automation, mirrors the Corazon `C:\eos-chrome-cdp` convention).
- `gui.enable_chrome_cdp`, `gui.install_cdp_to_chrome`, `gui.launch_cdp_chrome` all in the surface (`/tmp/api-info-full.json`). `tools/gui.js` is 43592 bytes - full helper, not a stub.
- `cdp.attach_tab` + `cdp.list_aliases` confirm the multi-alias coordination contract from [[parallel-cdp-chat-coordination-via-alias-namespacing]] is implemented.

**GAP:** None.

**FIX:** None.

---

## Dimension 9 - Scheduler poller

**STATUS: degraded (poller is running but completionPass + dispatch chain is the P1)**

**EVIDENCE:**
- `tools/scheduler.js` in canonical agent (53266b, mod 2026-06-08 13:20).
- Agent log on startup: `Scheduler started (autonomy substrate Phase 3)`, `Scheduler dispatcher: mac-dispatcher (darwin)`.
- 30 tools in the `scheduler.*` namespace including all four entry verbs (`schedule_delayed`, `schedule_cron`, `schedule_list`, `schedule_cancel`).
- Polling proven live by err log showing `dispatchOne` firing repeatedly with active_workers counts climbing 1-9.
- Two failure modes recurring in err log: (1) `rotation to code deferred ..., dispatching on unknown instead` (this is the rotate_to safety gate working as Tate fixed earlier today, but `unknown` instead of `code` means accounting state is bad). (2) `completionPass error: read ECONNRESET` / `(EAUTHTIMEOUT) timeout while waiting for message` -- workers do not return signal_bound, completion polling fails.

**GAP:** Workers reach the IDE tab spawn but coord state machine never closes. Likely a combination of the wrong account being dispatched on (`unknown` instead of `code` short name) and the worker not being able to reach back to the agent's coord HTTP. Status board `b22cc8dd` already tracks this.

**FIX:** Out of scope. Probe next: tail `~/Library/Logs/eos-laptop-agent.err.log` while running one `scheduler.schedule_run_now` against a known cron row, watch what happens between dispatch and completion. The `creds.current_account` getter likely returns "unknown" because the keychain capture path renamed something - probe `creds.current_account` directly to confirm.

---

## Dimension 10 - Backup/restore posture

**STATUS: broken**

**EVIDENCE:**
- `tmutil destinationinfo` returns "No destinations configured."
- `tmutil status` shows no active backup.
- Backend repo has **2180 uncommitted changes** in `git status -s` (was 154 in my first miscount; the right number is 2180, reflecting the scope of recent doctrine/skill churn).
- Recent commits (`69db0079` 15:31, `2b8591ec` 15:11, `6bdc5f7a` 13:06, `d172ab76` 12:50) show Tate is actively committing today and pushing - the unstaged delta is the working set of in-flight skill edits.
- `/Users/ecodia/PRIVATE/` (1.4MB photos + 33-file ecodia-creds tree + recovered-cleanup dir) has no snapshot target.
- `~/.claude/` (sessions, hooks, skills, settings) has no backup path either.

**GAP:** No durable snapshot. A disk failure or careless `git clean` would lose the unstaged tree and every per-account OAuth token (recoverable via re-OAuth but disruptive).

**FIX:** (1) Connect Time Machine to a Tailscale-reachable NAS or external SSD. (2) Author a daily launchd cron that tars `/Users/ecodia/PRIVATE/ecodia-creds/` to an encrypted bundle (the kv-mirror is regenerable; the per-account `.claude.json`/`.json` files + `apple/`/`play/`/`chambers/` keystores are not). (3) Same cron pushes a `git bundle` of every `~/.code/*` working tree to a backup remote.

---

## TOP 5 P1 FIXES (priority order)

1. **Diagnose the scheduler signal_bound P1 (status_board b22cc8dd).** This is the load-bearing autonomy gap. Probe path: log-tail during a manual `schedule_run_now`, check `creds.current_account` is returning a real short name not `unknown`, verify the spawned IDE tab can reach back to the agent's `/api/mcp/coord` endpoint. Likely two-line fix once the failure mode is named, given Tate's commit history today is already in this area.

2. **Backup posture (Dimension 10).** Time Machine destination + nightly encrypted snapshot of `/Users/ecodia/PRIVATE/ecodia-creds/`. Africa-trip readiness is incompatible with zero snapshot.

3. **Schedule `kv-mirror-refresh.sh` via launchd (Dimension 4).** 4-hour StartInterval plist. Otherwise the local cred mirror goes stale silently the next time a `creds.*` rotates in kv_store. Doctrine already names the freshness window.

4. **Remove or README the stale `backend/laptop-agent/` directory (Dimension 2).** This stale 7-module copy is what lured my first attempt. A future cold-start audit will fall in the same trap. Either delete or drop a `README.md` pointing at `/Users/ecodia/.code/eos-laptop-agent/`.

5. **Update memory note `cred-rotation-works-on-mac-2026-06-08.md`** to remove the "cred-refresher daemon still pending second plist" line. The plist landed at 11:32 the same day; the note pre-dates that fact. Drift-prevention discipline at the 0th-class level.

---

## Probe artefacts

- `/tmp/api-info-full.json` - 284-tool catalog (the load-bearing file that contradicts my first draft)
- `/tmp/audit-process-probe.txt` - launchctl + ps + plist enumeration
- `/tmp/audit-creds-probe.txt` - PRIVATE/ + kv-mirror freshness + per-account file list
- `/tmp/audit-scripts-probe.txt` - cred-refresher + kv-mirror-refresh + scheduler.js path resolution
- `/tmp/audit-tools-probe.txt` - tool categorisation by namespace
- `/tmp/audit-hooks-probe.txt` - 58 hooks resolved across both settings.json files
- `/tmp/audit-scheduler-probe.txt` - scheduler tool POSTs + err log tail
- `/tmp/audit-paths-probe.txt` - laptop-agent path resolution + LaunchAgent enumeration
- `/tmp/audit-rest.txt`, `/tmp/audit-rest2.txt` - git status, time machine, commits, branches

---

Origin: this audit run, 2026-06-08, while Tate showered. First draft contained five factual inversions (process supervision, agent build, cred-refresher, kv-mirror, PRIVATE existence) because I probed `/api/info` as unauthenticated GET and assumed the in-repo agent was running. Rewrote after lsof on PID 74973 named the real cwd. The hook nudges that surface "use `scripts/agent` helper" exist to short-circuit exactly this trap. Lesson banked.
