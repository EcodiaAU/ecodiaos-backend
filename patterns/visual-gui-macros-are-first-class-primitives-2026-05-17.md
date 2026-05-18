---
name: visual-gui-macros-are-first-class-primitives-2026-05-17
description: Visual testing, GUI driving, and macros are 1st-class primitives, not specialised tools. They are the binary switch for being able to reliably do client work without Tate present (the travel-readiness gate).
triggers: jarvis-gate, africa-readiness, travel-readiness, visual-first-class, gui-first-class, macros-first-class, visual-default-not-specialised, gui-default-surface, macro-default-substrate, client-work-unattended, autonomous-client-delivery, deliver-without-tate, deliver-without-supervision, visual-verify-default, screenshot-as-deliverable, macro-replay-as-deploy-verify, gui-recipe-per-client, baseline-recipe-per-client, africa-trip-2026, autonomous-deliverable
metadata:
  type: doctrine
  status: active
  authored_at: 2026-05-17
---

# Visual testing, GUI use, and macros are 1st-class primitives (the travel-readiness gate)

## The rule

Visual testing, GUI driving, and macros are the **default surface** for client-facing and deploy-shape work. Not a specialised tool reached when text-based primitives fall short, but the path I reach for first when the deliverable involves anything a human would see.

This is the binary switch for Tate being able to leave on the Africa / extended-travel arc later in the year without my reliability collapsing. If I can drive Cursor / VS Code / a client's web admin / Xcode / App Store Connect / a Vercel dashboard / a Stripe panel with the same confidence I drive files and SQL, then his absence is not a critical-path block. If I can't, it is.

## Why text-first is insufficient

For any non-trivial client deliverable, the truth surface is visual: the rendered page, the running app, the screenshot in the PR description. Text-based primitives (file edits + curl + DB queries) can report "shipped" while the user-visible surface is broken. The [[verify-deployed-state-against-narrated-state]] doctrine already names this, but text-first means I still narrate before I see.

GUI driving + auto-screenshot + visual-diff is the substrate that makes "shipped" mean "Tate can open it cold and it works." Without that loop, I generate plausibility, not delivery.

## The substrates that exist

| Substrate | Status | Path |
|---|---|---|
| **laptop-hands** (Express service on Corazon, default port 7800) | NOT running (verified 2026-05-17, connection refused at port 7800). Code present at `D:/.code/EcodiaOS/laptop-hands/` with `BIND_PORT` env var defaulting to 7800. | `D:/.code/EcodiaOS/laptop-hands/` |
| **Playwright** | Available via laptop-hands | inside laptop-hands |
| **pixelmatch** | Available for visual diff | inside laptop-hands |
| **visual-test MCP server** | Code present in `.mcp.json`, status of binding to ecodia-full proxy unverified | `D:/.code/EcodiaOS/mcp-servers/visual-test/index.js` |
| **GUI recipes** doctrine | Codified at `patterns/gui-recipes-authoring-optimisation-and-verification.md` | patterns/ |
| **eos-laptop-agent** (Corazon) | **ALIVE** (verified 2026-05-17 HTTP 200 from both localhost and Tailscale, PID 14252, ~20min uptime at probe) | port 7456 on `100.114.219.69` |
| **Auto-preview** (write .md/.html, get IDE preview tab) | Shipped 2026-05-16 | `backend/laptop-agent/cursor-preview-extension/` + PostToolUse hook |

The substrates exist. What's missing is the **default-ness**.

## What "1st-class primitive" means concretely

1. **Per-client baseline recipe.** Every active client has a checked-in recipe (laptop-hands script) that:
   - Boots a headless browser to their production URL.
   - Logs in (using stored credentials from `kv_store.creds.<client>`).
   - Drives the 3-5 most-traffic user flows.
   - Captures screenshots + diffs against the last baseline.
   - Returns a one-line "all flows pass" or "flow X regressed on screenshot Y" verdict.
   Recipe lives at `D:/.code/<client>/laptop-hands-recipes/baseline.js`. Conductor runs it before declaring any client-facing change shipped.

2. **Auto-screenshot on every shipped change.** PostToolUse hook on `git push` (or on Vercel deploy webhook): trigger the per-client baseline recipe automatically. Diff against last baseline. Open a P2 `status_board` row on regression. Pass is silent.

3. **Macro-replay as the standard deploy-verify path.** "Deployed" is not "build green." Deployed is "the macro-replay against production drove the flow end-to-end and produced the expected DOM / screenshot." Same as the existing iOS release recipe pattern, but at the per-deploy granularity instead of the per-release granularity.

4. **GUI recipes for every Tate-was-doing-it-manually workflow.** App Store Connect upload, Apple Developer portal cert renewal, Vercel domain DNS, Google Workspace user provisioning, Stripe webhook secret rotation, Xero report export. Each one has a recipe. When the workflow surfaces, I replay the recipe. Tate is not in the loop.

5. **Visual-diff as the doctrine for "is this the right design?"** When ambiguity exists about a design change, I ship a draft, generate a diff against the previous state, write both screenshots into a `drafts/<change>-visual-diff.md`, and let the auto-preview substrate render it in Tate's IDE. Decision substrate is the visual artefact, not the prose description.

## What needs to be built to get there

| Gap | Build |
|---|---|
| laptop-hands not running on port 7800 | Start it. Decide supervisor (PM2 / Task Scheduler / node-windows / NSSM). Verify `/health` returns OK from this session + over Tailscale. |
| eos-laptop-agent on port 7456 already alive | Confirmed via direct HTTP probe 2026-05-17. Reflex.fire substrate is callable. No build needed. Add a continuous liveness check via the world-model audit. |
| visual-test MCP not bound to ecodia-full proxy | Verify the proxy registration or wire it. Confirm `mcp__ecodia-full__visual_*` tools resolve. |
| No per-client baseline recipes | Author one per active client. Start with Co-Exist (highest stake) and Resonaverde (referral channel velocity). |
| No auto-screenshot on push | PostToolUse hook on `git push` that fires the per-client baseline. |
| No macro-replay as deploy-verify | Wire vercel-deploy-handler routine to trigger the per-client baseline post-deploy. |
| Missing GUI recipes for unattended-Tate flows | Inventory: ASC upload, Apple Dev cert renewal, Vercel DNS, Stripe webhook rotation, Xero export, etc. Author one per flow before he travels. |

## Anti-patterns

- **Treating laptop-hands as a fallback.** It is the default for visual deliverables. Reach for it first.
- **Reporting "deployed" without a screenshot.** Default deliverable for any user-visible change includes the visual artefact.
- **Manual GUI work where a recipe could exist.** Every Tate-does-this-by-hand workflow is a recipe waiting to be authored. The recipe is the durable artefact; the one-off run is throwaway.
- **Letting laptop-hands die silently.** Health-canary on the service. If it stops responding, escalate same as ecodia-api going down.
- **Building yet another visual-verify substrate parallel to laptop-hands.** It exists; extend it. See [[use-anthropic-existing-tools-before-building-parallel-infrastructure]] applied to internal tools.

## The travel-readiness criterion

Tate can be unreachable for 7 days. During that window, the system can:
- Ship a Co-Exist change end-to-end (PR, deploy, visual-verify, no regression).
- Ship a Resonaverde change end-to-end.
- Handle inbound client email (read, classify, draft, file).
- Rotate a credential whose expiry lands in the window.
- Catch and surface (not silently absorb) any regression that breaks a baseline.

When all five of those are true, the gate is open. None of them work reliably without visual / GUI / macros being 1st-class.

## Origin

Tate verbatim 2026-05-17: "Macros and you using gui so that you're actually fully self managing to the highest caapbility.... like jarvis from iron man." And earlier: "Visual testing, gui use + macros need to be 1st class primitives now, otherwise you'll never be able ot relibly do stuff for clients which is a binary switch for me being able to levae you when i travel later in the year."

The Jarvis framing is the bar. Not "an agent that can do GUI things." A peer that defaults to driving the screen because that's where the work lives.

## How to apply

Before reaching for a text-based primitive on any deliverable that ends in something a human will see: ask whether the visual / GUI / macro path is the right surface. If yes, use it even if the text path is faster, because the visual path is what makes the work load-bearing for unattended delivery.

Cross-refs: [[visual-first-tate-presentation]], [[visual-verify-is-the-merge-gate-not-tate-review]], [[gui-recipes-authoring-optimisation-and-verification]], [[tailscale-macro-replaces-cowork]], [[drive-chrome-via-input-tools-not-browser-tools]], [[use-anthropic-existing-tools-before-building-parallel-infrastructure]], [[verify-deployed-state-against-narrated-state]].
