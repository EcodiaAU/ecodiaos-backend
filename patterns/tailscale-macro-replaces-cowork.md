---
triggers: tailscale, macro, gui-recipe, ui-driving, laptop-agent, corazon, cowork-replacement, input-dot-star, screenshot-dot-star, shell-dot-shell, canonical-ui-substrate, tailscale-macro, deprecated-cowork, ui-driving-default, drive ui, drive saas ui, drive web app, ui driving substrate, macro substrate, compose input.* and screenshot.*, drive a logged-in webapp, drive logged-in chrome, single substrate, replace cowork, what substrate for ui
priority: critical
canonical: true
---

# Tailscale laptop-agent + macro/GUI recipes is the canonical UI-driving substrate (Cowork is negated)

## 1. The rule

**Tate, 5 May 2026 verbatim:** "Claude Cowork should be removed from documentation or negated, not useful, and tailscale with macro creation on the go is better long term."

The canonical UI-driving substrate is now: **Tailscale laptop-agent (Corazon at `100.114.219.69:7456`)** + **`input.*`** + **`screenshot.*`** + **`shell.shell`** through the laptop-agent HTTP API, composed into **macro/GUI recipes** per `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md`. Claude Cowork (Anthropic Claude Desktop Dispatch / Claude in Chrome) is negated and deprecated.

The MCP REST endpoints at `/api/mcp/cowork/*` remain live infrastructure (status_board.upsert, kv_store.set, neo4j.search, forks.spawn, etc.) - those are REST API endpoints that happen to have a legacy name, NOT a Cowork integration. They are useful headless MCP tools accessible to any caller and will be renamed in a future pass.

## 2. How to drive Chrome (and any webapp) without Cowork

The replacement for Cowork is direct laptop-agent driving of Tate's existing Chrome via `input.*` + `screenshot.*`:

1. **Open Chrome.** Click the taskbar Chrome icon (`input.click` after `screenshot` to locate the icon), OR use `input.shortcut [super]` + type "chrome" + enter. Do NOT spawn a new Chrome process or use CDP.
2. **Navigate.** `input.shortcut [ctrl,l]` to focus the address bar → `input.type` the URL → `input.key enter`.
3. **Interact.** `input.click` buttons and form fields, `input.type` text, `screenshot.screenshot` to read page state. This is the same loop pattern: instruct (click/type), screenshot to verify, decide next step.
4. **Verify.** `screenshot.screenshot` after every interaction step. The screenshot is the ground truth.

This applies to ANY web SaaS: Stripe dashboard, Vercel UI, GitHub web, App Store Connect, Bitbucket web, Canva, Zernio, Xero, Supabase dashboard, Resend dashboard, Co-Exist admin, Apple Developer portal, Google admin console - every webapp Tate has saved credentials for in his Chrome Default profile.

The loop is intentionally the same pattern as what Cowork was supposed to provide, but driven directly by the conductor via the laptop-agent with NO intermediary Anthropic agent.

## 3. How to drive desktop apps (Teams, Cursor, Xcode, etc.)

Desktop apps are driven the same way - `input.*` + `screenshot.*` against the app's window on Corazon (or via RDP into SY094 for Mac apps):

1. **Find the process.** `process.listProcesses` to confirm the app is running, or `process.launchApp` to start it.
2. **Focus the window.** Use PowerShell `(New-Object -ComObject WScript.Shell).AppActivate("<title>")` or UIA `WindowPattern.SetWindowVisualState` to bring the window to foreground.
3. **Drive the GUI.** `input.click` on known coordinates (from a verified recipe coordinates table), `input.type` into text fields, `input.key` for special keys.
4. **Verify.** `screenshot.screenshot` after each step.

Use GUI recipes (`gui-recipes-authoring-optimisation-and-verification.md`) for codified procedures with verified coordinate tables. The recipe library already contains: `sy094-gui-entry-via-desktop-rdp-shortcut.md` (MIC RDP open, 7.9s), `sy094-coexist-ios-release-recipe.md` (full iOS release pipeline, ~10min).

## 4. Pre-dispatch flow (Step 0: no focus collision)

Before any `input.*` operation driving Corazon UI, probe the foreground window via Win32 `GetForegroundWindow` + `GetWindowThreadProcessId` (the `foreground-check` subcommand in what was formerly `cowork-dispatch`, now the laptop-agent dispatch script):

| Tate's foreground window | Planned target | Action |
|---|---|---|
| Different window/app | Go ahead | Proceed with input.* operations |
| Same window/app | Defer or fall back | Wait until Tate moves, or use non-focus-stealing alternative |
| Screenshot only (no input.*) | Go ahead | Screenshot never steals focus |

Full doctrine: `~/ecodiaos/patterns/cowork-no-focus-collision.md` (the no-focus-collision rule is preserved; only the Cowork framing is deprecated).

## 5. What the MCP `/api/mcp/cowork/*` endpoints ARE (and are not)

The REST endpoints at `https://api.admin.ecodia.au/api/mcp/cowork/<endpoint>` are **not** a Cowork-specific integration. They are headless MCP tools exposed as a REST API:

- `status_board.query` / `status_board.upsert` - query and write status_board
- `kv_store.get` / `kv_store.set` - key-value store access
- `neo4j.search` / `neo4j.write_episode` / `neo4j.write_decision` - Neo4j access
- `forks.spawn` / `forks.list` - fork management
- `email_threads.read` / `inbox.read` - email access
- `os_session.message` - post to conductor inbox
- `gmail.send` - send email
- `sms.tate` - send SMS to Tate
- `scheduler` trio - schedule/cancel/list tasks

These endpoints were built as the Cowork V2 substrate but are generic MCP tools. They will be renamed (e.g. from `/api/mcp/cowork/*` to `/api/mcp/tools/*`) in a future pass. For now, they are live, useful infrastructure and all code referencing them continues to work.

## 6. The `cowork-dispatch` helper script

The helper script at `~/ecodiaos/scripts/cowork-dispatch` is a useful abstraction over `input.*` + `screenshot.*` + `process.*` primitives. The name is legacy. The tool itself works and should be used. Subcommands (`step`, `focus`, `precheck`, `foreground-check`, `passkey-inject`, `step-with-passkey-watch`) are all still correct - they compose laptop-agent primitives regardless of the "cowork" name.

## 7. What was negated (summary of the Cowork doctrine)

The following concepts from the Cowork era are negated:

- **Cowork as "the 1stop shop" for UI driving** - replaced by direct laptop-agent driving + recipes
- **Cowork side panel / Ctrl+E invocation** - not useful; use direct Chrome driving or desktop-app focus
- **Cowork as a peer brain in the duo** - negated; the conductor is single-agent with Tailscale as its hands
- **Cowork Dispatch toggle / Claude in Chrome** - not useful; the laptop-agent API is the invocation surface
- **Cowork account-revert monitoring** - moot; no Cowork agent to revert
- **Cowork passkey-stall co-pilot** - moot; no Cowork agent to stall against Hello (the conductor drives directly now, and the conductor CAN type the passkey)
- **Cowork's bounded-step dispatch protocol** - superseded by direct conductor-driven `input.*` loops through the laptop-agent

## 8. Do

- Drive Chrome / any web SaaS via `input.shortcut [ctrl,l]` + `input.type` + `input.click` + `screenshot.screenshot` through the laptop-agent at `100.114.219.69:7456`
- Use GUI recipes (`~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md`) for any codified procedure - author new recipes per that meta-doctrine's 5-step workflow
- Use the `cowork-dispatch` helper script (legacy name) for the convenience subcommands - it wraps the same primitives
- Call the `/api/mcp/cowork/*` REST endpoints as headless MCP tools - they are useful infrastructure
- Run the no-focus-collision probe before any `input.*` operation
- Author macro/GUI recipes per `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` for any repeated UI procedure

## 9. Do NOT

- Refer to Cowork as an active substrate in any new doctrine or brief
- Build new infrastructure around Cowork concepts (account-revert monitoring, Cowork dispatch protocol, Cowork MCP wrappers)
- Delete or disable the `/api/mcp/cowork/*` endpoints - they are useful headless REST tools
- Delete `~/ecodiaos/scripts/cowork-dispatch` - it is a useful abstraction (the name is legacy)
- Recommend Cowork to anyone or frame it as an active part of the architecture

## 10. Origin

**Tate, 5 May 2026 verbatim (exact wording):** "Claude Cowork should be removed from documentation or negated, not useful, and tailscale with macro creation on the go is better long term."

This overrides all prior Cowork doctrine (29 Apr 2026 "1stop shop", 30 Apr 2026 "duo with Cowork", pre-dispatch checklist, account-revert monitoring, bounded-step dispatch protocol, passkey-stall co-pilot). The Cowork experiment ran from 29 Apr to 5 May 2026 (~6 days). Key lessons learned:

- Cowork (Claude Desktop Dispatch) was unreliable - account-revert from code@ to tate@ within minutes
- Cowork could not type credentials (Anthropic safety constraint) - required conductor co-pilot for every web login, defeating the purpose
- Direct `input.*` + `screenshot.*` through the laptop-agent was always available and always worked
- GUI recipes + macro creation beats an autonomous agent for UI driving - deterministic, faster, auditable
- The MCP endpoints built for Cowork V2 are independently useful as headless REST tools

**Codified at the moment the rule was stated per `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`.**

## Cross-references

- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` - the meta-doctrine for recipe authoring/optimisation; this is now the canonical UI-driving paradigm
- `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md` - how to drive Tate's Chrome via input.* + screenshot.* (preserved, nothing changed)
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` - the peer-paradigm tool surface on the laptop-agent (preserved)
- `~/ecodiaos/patterns/cowork-no-focus-collision.md` - the no-focus-collision Step 0 (preserved, only the Cowork framing is deprecated)
- `~/ecodiaos/patterns/cowork-passkey-stall-conductor-injects.md` - the passkey injection pattern (preserved as a general pattern; the "Cowork stalls" framing is historical)
- `~/ecodiaos/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md` - the 5-point check (preserved)
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` - codification cadence
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` - the deliverable is the doctrine files shipping
