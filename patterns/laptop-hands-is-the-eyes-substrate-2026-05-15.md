---
triggers: laptop-hands, laptop-hands-eyes, eyes-substrate, visual-substrate, laptop-hands-role, peer-substrate-evolution, peer-machine-eyes, corazon-eyes, hands-not-just-fingers, who-is-the-eyes, visual-verify-substrate, deploy-eyes-on, eyes-on-deploy, eyes-on-ui, phase-2-08-role-update
---

# laptop-hands is the eyes substrate, not just hands - 2026-05-15

## Rule

`laptop-hands/` on Corazon (Tailscale 100.114.219.69:7800, HMAC-gated) is now the eyes substrate as well as the hands substrate. Before Phase 2 / 08 it ran shell, files, and report-to-os tools. From 2026-05-15 it also runs Playwright (with the full Chromium binary), an Android adb driver, an iOS Simulator contract (stubs until Mac mini), and a pixelmatch-backed visual regression engine. When the question is "did the deploy actually render correctly", the answer comes from laptop-hands.

## Why the role-update matters

Hands without eyes is half a peer. The original laptop-hands could click in Tate's Chrome via `input.*` macros (per [[drive-chrome-via-input-tools-not-browser-tools]]) but had no built-in way to:
- Capture a deterministic screenshot of a deployed page on a known viewport.
- Diff against a known-good baseline.
- Drive multi-step user flows on a deploy preview as a tireless first reviewer.

The Phase 2 / 08 surface adds those. The "eyes" framing makes the role explicit so future doctrine decisions route work to the right substrate by default.

## Substrate map

| Role | Substrate | Reach |
|------|-----------|-------|
| State (rows, kv, sessions) | Postgres on VPS | MCP at `/api/mcp/ecodia-full` |
| Memory (Decisions, Episodes) | Neo4j Aura | MCP `neo4j.*` |
| Hands (shell, files, native UI) | laptop-hands on Corazon | HTTP at `100.114.219.69:7800` |
| Eyes (browser, mobile, visual regression) | laptop-hands on Corazon (Phase 2 / 08) | Same HTTP service, new tools |
| Voice (live audio in/out) | ecodia-meetings on VPS | Twilio Media Streams |
| Streaming events (channels) | streaming substrate, Phase 2 / 06 | SSE at `/api/stream` |

`laptop-hands` is the only substrate that physically sees the rendered pixel.

## Why Corazon, not the VPS

Three reasons:
1. **Latency to Tate's eyes.** Diff images need to be openable from VS Code on Corazon in one click. Living on the same machine is the simplest path.
2. **Chromium binary size.** Playwright Chromium is ~180MB. Living it on Corazon (1TB) instead of the VPS (10GB free) keeps the VPS lean per the Phase 2 / 05 substrate-only redesign.
3. **Future iOS Simulator.** Mac mini will mirror this service so iOS tests live alongside the existing browser tests. Single eyes substrate, two machines.

## What stays out of laptop-hands

- Authentication-required pages that need Tate's logged-in Chrome. Those still use `input.*` macros on Tate's actual Chrome per the existing patterns. Playwright spins a clean Chromium with no shared cookie store.
- Anything that needs to coexist with Tate's open browser session. The Playwright instance is headless by default; `HEADFUL=1` flips it but cohabiting with Tate's Chrome session is still the `input.*` route.
- Real-money flows (Stripe checkout completion) when the test would create real charges. Use Stripe test-mode keys via `visual.test_flow` with explicit test-mode hints.

## Concrete capabilities now reachable

- `visual.run_recipe { recipe_name, deploy_url }` - drive a per-app recipe.
- `visual.regression_check { recipe_name, deploy_url, threshold }` - drive recipe and diff vs baselines.
- `visual.baseline_recipe { recipe_name, deploy_url }` - capture or recapture all baselines for a recipe.
- `visual.update_baseline { test_name, new_path }` - replace one baseline after an intentional UI change.
- `browser.navigate`, `browser.screenshot`, `browser.click`, `browser.type`, `browser.wait_for`, `browser.exec_js`, `browser.console_logs`, `browser.network_log`, `browser.scroll`, `browser.set_viewport`, `browser.close`.
- `android.list_avds`, `android.boot`, `android.install`, `android.screenshot`, `android.adb_shell` (allowlist-gated).
- `ios.list_simulators`, `ios.boot`, `ios.install`, `ios.launch`, `ios.screenshot`, `ios.tap`, `ios.type` (`NOT_IMPLEMENTED_PENDING_MAC_MINI`, contract stable).

All also exposed via the visual-test MCP server at `D:/.code/EcodiaOS/mcp-servers/visual-test/index.js` so any Claude Code session can drive them without raw HTTP.

## Cross-references

- [[visual-testing-substrate-via-laptop-hands-2026-05-15]] - the sibling pattern covering recipe authoring + auto-regression-on-deploy.
- [[corazon-is-a-peer-not-a-browser-via-http]] - the parent identity claim; this pattern extends the peer to include eyes.
- [[corazon-puppeteer-first-use]] - the older "use the laptop more" pattern; the new substrate is how that becomes structural rather than aspirational.
- [[visual-verify-is-the-merge-gate-not-tate-review]] - the doctrine. This pattern is the substrate that lets the doctrine run autonomously.
- [[em-dashes-banned-character-level-no-exceptions]] - applies to all new files.

## Origin

Phase 2 / 08 lane. The dossier was explicit that laptop-hands "partially exists" as the hands substrate and needed extension into eyes. Codifying the role-name distinction at the moment the extension shipped, per [[codify-at-the-moment-a-rule-is-stated-not-after]], so future decisions that involve "where does the screenshot come from" route to laptop-hands by default rather than re-deriving every time.
