# Visual / GUI / macros 1st-class elevation plan

**Date**: 2026-05-17
**Origin**: Tate 2026-05-17 "Visual testing, gui use + macros need to be 1st class primitives now, otherwise you'll never be able ot relibly do stuff for clients which is a binary switch for me being able to levae you when i travel later in the year."
**Pattern**: [[visual-gui-macros-are-first-class-primitives-2026-05-17]]

This is the elevation plan, not a doctrine doc. It names what to build, in what order, and what the gate criteria are. The doctrine doc explains why this is 1st-class; this draft explains how we get there.

---

## The picture (where we need to be by August)

Tate can be off-grid for 7 consecutive days and:
- Co-Exist deploys ship end-to-end with visual-verify (Vercel deploy fires -> baseline replay against new build -> diff against last green -> pass-or-P2-row).
- Resonaverde same.
- ASC + Apple Developer cert renewal happens via macro replay when expiry approaches.
- Inbound client SMS / email gets read, classified, and either drafted or replied based on standing arrangements.
- Stripe webhook secret rotates on its scheduled date without intervention.
- Anything that regresses a baseline gets a P1 row that an inbound-SMS reflex pulls Tate's attention to.

Today, none of those work reliably without him in the loop.

---

## What exists

**Substrates already in place** (mostly dormant, not running):

| Substrate | State 2026-05-17 | Where |
|---|---|---|
| **eos-laptop-agent** (Express on Corazon, port 7456) | **ALIVE** - verified 2026-05-17 HTTP 200 from localhost + Tailscale, PID 14252, uptime ~20min at probe. Runs without PM2 supervision. | `D:/.code/eos-laptop-agent/` |
| **reflex.fire** + `reflex.fire_if_clear` (AHK macro IDE-tab spawn) | Shipped + verified 2026-05-16 13:26 AEST, ~3.3s end-to-end | `tools/reflex.js` |
| **laptop-hands** (Express service, Playwright + pixelmatch, default port 7800) | NOT running - verified 2026-05-17 port 7800 connection refused. Code present at `D:/.code/EcodiaOS/laptop-hands/`. | `laptop-hands/` |
| **visual-test MCP server** | Listed in `.mcp.json`. Status of binding to ecodia-full proxy unverified. | `D:/.code/EcodiaOS/mcp-servers/visual-test/index.js` |
| **GUI recipes doctrine** | `gui-recipes-authoring-optimisation-and-verification.md` + recipe examples | `backend/patterns/` |
| **AHK macro substrate** | Multiple authored macros under `D:/.code/eos-laptop-agent/macros/` | eos-laptop-agent |
| **Tate-recordings (macro v2)** | Recorder + parser pipeline at `D:/.code/macro-recordings/` | macro-recordings/ |
| **Auto-preview** (.md / .html write -> IDE preview tab) | Shipped 2026-05-16. Live. | extension at `backend/cursor-preview-extension/` |
| **iOS / Android release recipes** | Multiple validated_v1 recipes shipped (sy094-coexist-ios, asc-app-record-create, etc) | `backend/patterns/` |

**Substrate gaps:**
- eos-laptop-agent / laptop-hands not running in PM2. Need start + watchdog registration.
- visual-test MCP binding to ecodia-full proxy unverified.
- Zero per-client baseline visual recipes.
- Zero PostToolUse-on-push or vercel-deploy-handler auto-screenshot integration.
- No macro-replay-as-deploy-verify wiring for client production URLs.

---

## The lift (sequenced)

### Phase A: Get the substrates actually running (~1 day)

A1. **eos-laptop-agent: already alive** (verified 2026-05-17, HTTP 200 from localhost + Tailscale, PID 14252, uptime ~20min at probe). Runs without PM2 supervision. Outstanding: register a watchdog (Task Scheduler entry calling `scripts/reflex-watchdog.ps1`) so the agent survives reboots / crashes. Gate: `reflex.foreground_window` returns from a fresh probe (already passes today).

A2. **Start laptop-hands** (default port 7800, `BIND_PORT` env). NOT running as of 2026-05-17 (port 7800 connection refused). Decide supervisor: PM2, Task Scheduler, node-windows service, or NSSM. Verify `/health` returns OK from both localhost AND Tailscale. Probe the Playwright headless-Chromium boot. Gate: a smoke run against `https://google.com` returns a screenshot via the visual-test MCP surface.

A3. **Verify visual-test MCP is wired into ecodia-full proxy**. Confirm `mcp__ecodia-full__visual_*` tools resolve via ToolSearch. If not, wire them. Gate: `ToolSearch select:visual_run_recipe` returns a schema.

A4. **Confirm AHK macro substrate is live**. Probe with a dry-run `reflex.fire({ prompt: "noop", dry_run: true })`. Gate: macro plan returned, no error.

### Phase B: Per-client baseline recipes (~2-3 days)

B1. **Co-Exist baseline.** Recipe at `D:/.code/coexist/laptop-hands-recipes/baseline.js`. Drives:
- Public landing page load + screenshot
- Login flow (using `kv_store.creds.coexist.test_user`)
- 3 most-traffic authenticated user flows (per Kurt's actual usage)
- Logout
Captures screenshots at every step. Diffs against `laptop-hands/baselines/coexist/`. Returns one-line verdict.

B2. **Resonaverde baseline.** Same shape. Recipe at `D:/.code/resonaverde/laptop-hands-recipes/baseline.js`. Drives the Angelica-referred client signup + project-view flows.

B3. **Roam baseline.** Same shape. Recipe at `D:/.code/roam/laptop-hands-recipes/baseline.js`. Drives the grey-nomad simple-mode flow.

B4. **Sidequests baseline** (when public). Recipe stub now, fill when public.

### Phase C: Auto-trigger on shipped changes (~1 day)

C1. **PostToolUse-on-push hook** at the Claude Code level. When a `git push` to a client repo lands, fire `reflex.fire` against the per-client baseline recipe. Recipe runs in background, writes pass/fail to `status_board` + posts to perception channel.

C2. **vercel-deploy-handler routine reflex-fire**. When the Vercel webhook fires (deployment Ready), spawn a baseline replay against the production URL. Diff against last green. Pass is silent, regression opens a P1 row + SMS pages Tate.

C3. **Wire the per-client baseline into the SMS-back-to-Tate path** for regressions. Re-use the existing `sms-tate` skill + the new SMS thread continuity substrate.

### Phase D: GUI recipes for unattended-Tate workflows (~5-7 days, parallelisable)

Inventory of workflows Tate does manually that need recipes BEFORE travel. Each is a separate macro recording + replay validation pass.

| Workflow | Current owner | Substrate | Recipe author |
|---|---|---|---|
| App Store Connect upload (per-app, per-build) | Tate manual via SY094 RDP | RDP + macro recorder | Existing pattern `sy094-coexist-ios-release-recipe` validated; replicate for any other iOS app |
| Apple Dev portal cert renewal | Tate manual | Corazon-Chrome macro | Author from Tate recording |
| Apple Dev portal provisioning profile generation | Tate manual | Corazon-Chrome macro | Author from Tate recording |
| ASC app record create (per new app) | Tate manual | Corazon-Chrome macro | Pattern `asc-app-record-create-recipe` is untested_spec; validate next-app |
| Vercel domain DNS configuration | Tate manual | Corazon-Chrome macro | Author from Tate recording |
| Vercel env var rotation (per-project, per-environment) | Tate manual | Corazon-Chrome macro | Author from Tate recording |
| Stripe webhook secret rotation | Tate manual | Corazon-Chrome macro + dashboard | Author from Tate recording |
| Google Workspace user provision (new client) | Tate manual | admin.google.com Corazon-Chrome | Tate-spawn macro recorder |
| Xero report export (quarterly) | Tate manual | xero.com Corazon-Chrome | Author from Tate recording |
| Bitbucket repo create + permissions | Tate manual | bitbucket.org Corazon-Chrome | Author from Tate recording |
| Supabase project creation + Postgres provisioning | Tate manual | supabase.com Corazon-Chrome | Author from Tate recording |

Each recipe lands at `backend/patterns/<workflow-slug>-recipe.md` with `status: validated_v1` after replay.

### Phase E: The continuous visual-verify loop (~2 days)

E1. **Schedule the per-client baseline recipes on a recurring cadence** (every 6h on production URLs). Detect silent regressions that didn't come from a push (e.g. CDN config drift, upstream API change).

E2. **Visual-diff dashboard**. A daily auto-preview-rendered `drafts/visual-diff-dashboard-YYYY-MM-DD.md` summarising every baseline run in the last 24h. Pass / fail / regression-pending-Tate-review.

E3. **Baseline-bump protocol**. When intentional visual changes land, a one-shot `reflex.fire` with `auto_submit: true` prompts a sister tab to "review the diff at <path> and either commit the new baseline or open a regression P1 row." This makes baseline drift a deliberate decision rather than a slow accumulation.

---

## Gate criteria (the "Tate can travel" checklist)

- [ ] eos-laptop-agent + laptop-hands both running in PM2 with watchdog registered
- [ ] reflex.fire verified end-to-end from VPS-over-Tailscale (shipped, but re-verify with a fresh probe)
- [ ] At least 3 active clients have baseline visual recipes that PASS today
- [ ] vercel-deploy-handler is wired to auto-baseline against production URLs
- [ ] At least 5 of the 11 unattended-Tate GUI workflows have validated_v1 recipes
- [ ] A test SMS regression alert from Corazon to Tate's phone fires end-to-end via the SMS thread continuity substrate
- [ ] Multi-account IDE setup (VS Code Insiders + Cursor installed, signed into money@ and code@) so sister-tab fires can saturate 3 accounts in parallel

Until 6+ of these are green: travel-readiness is amber, not green.

---

## What I'm NOT proposing

- Building yet another visual-verify substrate. laptop-hands exists; extend it.
- Routing visual tests through Anthropic Routines. They're not the substrate for sub-minute visual confirmation. Local agent is.
- Letting visual-verify run with degraded confidence. If a baseline replay produces a screenshot the diff engine can't classify, it's a P2 row + Tate-review, not a silent pass.
- Mandating visual-verify on every internal commit. Only on client-facing changes and any merge to main on a client repo.

---

## Status_board rows to open from this draft

Sequence matches Phase A through E above. Each row gets `next_action_by: ecodiaos`, `priority: 2` (P2 because the gate is travel-readiness, not immediate revenue):

1. "Phase A - get eos-laptop-agent + laptop-hands + visual-test MCP live in PM2" (target: 1d)
2. "Phase B - author 3 per-client baseline visual recipes (Co-Exist, Resonaverde, Roam)" (target: 3d)
3. "Phase C - PostToolUse-on-push + vercel-deploy-handler auto-baseline integration" (target: 1d)
4. "Phase D - GUI recipes for 11 unattended-Tate workflows" (target: 7d, parallelisable across sister tabs)
5. "Phase E - continuous visual-verify loop + diff dashboard + baseline-bump protocol" (target: 2d)
6. "Multi-account IDE install (VSCode Insiders + Cursor) on Corazon for 3-mouth parallelism" (target: Tate-action, 30min when he has a moment)

Total elapsed if serialised: ~14 days. Parallelised across 3 sister tabs: ~5-7 days.
