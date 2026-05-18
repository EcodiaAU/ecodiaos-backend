---
triggers: visual-testing, visual-regression, visual-test, visual-recipe, regression-on-deploy, visual-merge-gate, recipe-authoring, baseline-management, pixelmatch, screenshot-diff, visual.run_recipe, visual.regression_check, visual.baseline, visual.update_baseline, vercel-deploy-visual-verify, post-deploy-eyes-on, deploy-auto-verify, regression-recipe, per-app-recipe, coexist-recipe, resonaverde-recipe, ecodia-frontend-recipe, visual-test-mcp, phase-2-08
---

# Visual testing substrate via laptop-hands - 2026-05-15

## Rule

EcodiaOS now has eyes on every production deploy. The Phase 2 / 08 lane shipped a Playwright-backed visual-test substrate inside laptop-hands plus a stdio MCP wrapper plus a vercel-deploy-handler integration. Use it whenever the answer to "did the deploy actually work" matters.

## When to write a visual test

- **UX critical-path** that a customer hits in the first 30 seconds (homepage, sign-in, primary CTA).
- **Mobile rendering** for any FE that ships responsive (use the `iphone-13`, `pixel-7`, or `ipad-air` preset).
- **Multi-step flow** the unit tests cannot prove (form submit, modal open, drawer toggle, login).
- **Public-facing deploy** of a client site we host (Co-Exist, Resonaverde, anything new under the agency umbrella).

## When to NOT write one

- Internal admin tooling that only EcodiaOS sees.
- One-off scripts and migrations.
- Anything that depends on real-account state (login flows requiring a live test user). Use `visual.test_flow` ad-hoc for those; do not bake them as recipe-and-baseline since they fail on cleanup-state drift.
- Routes that change content daily (news feeds, dashboards with live counts). Diff threshold will always trip. Use snapshot-of-shape, not snapshot-of-content; or write a `visual.test_flow` that asserts selector presence and returns a 0-step screenshot.

## Recipe authoring discipline

Recipes live at `D:/.code/EcodiaOS/laptop-hands/recipes/<app>.json` and follow this contract:

```
{
  "name": "<recipe_name>",
  "baseline_set_at": "<ISO timestamp>" | null,
  "viewport_default": "desktop-1440",
  "context": "<one-paragraph why this recipe exists + what NOT to baseline>",
  "steps": [ { "action": "...", "args": {...} }, ... ]
}
```

Step actions: `navigate`, `click`, `type`, `wait_for`, `scroll`, `set_viewport`, `screenshot`, `sleep_ms`.

Discipline:
- **Small.** Five to seven steps per recipe is the target. A recipe with 20 steps is two recipes.
- **Deterministic.** No `Math.random`, no live-clock-based content. If a route shows live data, use a stable surrogate route or scope the screenshot to a stable container with `selector:`.
- **No shared state across recipes.** Each recipe opens with `set_viewport` + `navigate {{deploy_url}}` so any earlier recipe's leftover context is irrelevant.
- **Use `{{deploy_url}}`** template in any URL. The recipe runner substitutes the actual deploy URL per run.
- **`sleep_ms` is fine** for animation settling, but max 1500ms per call. If you need more than 1500ms, the page has a real load-completion issue and screenshot timing is hiding it.

## The auto-regression-on-deploy contract

`vercel-deploy-handler.md` (Anthropic Routine) is wired so that:

1. Vercel webhook fires `deployment.ready` for a production target.
2. Routine maps `project.name` -> recipe via `kv_store.cowork.visual_regression.recipe_map` (or lowercase project name fallback).
3. Routine calls `visual.regression_check { recipe_name, deploy_url, threshold: 0.02 }` over the visual-test MCP.
4. Pass: write Episode `visual regression pass`. Done.
5. Fail: upsert status_board task `visual-regression-<project>-<sha>` priority=2 plus SMS to Tate.
6. Either way: append to `kv_store.cowork.visual_regression.recent` (ring of 10).

The `/visual-recent` skill renders the ring with diff-image paths for triage. Update a baseline by calling `visual.update_baseline { test_name, new_path }` over the MCP. Do not auto-update baselines from the routine; intentional UI changes get explicit blessing.

## Threshold and dimensions

- Default pixel diff threshold: 2% of pixels. Bump per-recipe via `threshold` arg if a recipe is consistently noisy (anti-aliasing, web-font fallback flicker).
- Dimensions must match. If the baseline was captured at 1440x900 and the current run is at 1920x1080, diff returns `match: false` with reason `dimensions differ`. Set `viewport_default` and stick to it.
- Cross-browser baselines are not in scope. Chromium is the canonical engine; WebKit/Firefox can be added later.

## iOS Simulator: deferred to Mac mini

`src/tools/ios.ts` exposes the contract (`ios.list_simulators`, `ios.boot`, `ios.install`, `ios.launch`, `ios.screenshot`, `ios.tap`, `ios.type`) as stubs returning `NOT_IMPLEMENTED_PENDING_MAC_MINI`. The MCP wrapper exposes them too, so callers can wire flows now. Phase 2 / 07 fills in the bodies once the Mac mini arrives.

## Android: live on Corazon today

`adb`-driven. `android.list_avds`, `android.boot`, `android.install`, `android.screenshot`, `android.adb_shell` (allowlist-gated). Set `ADB_PATH` and `EMULATOR_PATH` env vars if the Android SDK is not on default PATH.

## Substrates touched

- Filesystem on Corazon: `D:/.code/EcodiaOS/laptop-hands/.shots/` (PNGs, gitignored), `.baselines/` (PNGs, committed via LFS once over 100MB), `.diffs/` (gitignored), `recipes/*.json` (committed).
- kv_store: `cowork.visual_regression.recent` (ring) + optional `cowork.visual_regression.recipe_map` (project->recipe).
- Status_board: `visual-regression-<project>-<sha>` entity_ref for fails.
- Neo4j: Decision node "Visual testing substrate shipped" plus per-fail Episode under the vercel-deploy-handler trace.

## How to bootstrap a new recipe

1. Add `<app>.json` to `laptop-hands/recipes/`.
2. Run `node laptop-hands/scripts/baseline-<app>.mjs <production_url>` (or call `visual.baseline_recipe` over the MCP) against the current-good production deploy.
3. Verify pass: `visual.regression_check { recipe_name, deploy_url }` should return `overall_match: true`.
4. Set `baseline_set_at` in the recipe JSON to today's ISO.
5. Add the project-name -> recipe-name entry to `kv_store.cowork.visual_regression.recipe_map` if the project name differs from the recipe name.

## Cross-references

- [[laptop-hands-is-the-eyes-substrate-2026-05-15]] - the role-update pattern that codifies laptop-hands as the eyes substrate, not just hands.
- [[corazon-puppeteer-first-use]] - parent doctrine. The new visual-test stack is the proper substrate for the use cases that pattern flagged.
- [[visual-verify-is-the-merge-gate-not-tate-review]] - states the principle. This pattern is the substrate that makes the principle automated.
- [[verify-deployed-state-against-narrated-state]] - the regression check IS the verification step.
- [[em-dashes-banned-character-level-no-exceptions]] - applies to recipe JSON, MCP server descriptions, and routine prompt text.

## Origin

Phase 2 / 08 dossier, fired 2026-05-15 as part of the post-Phase-1 architecture redesign. Tate verbatim from the dossier: "Without this, 'shipped' is a narrated state, not a verified one. Every client deliverable carries hidden risk because the last step (did Tate's eyes see it work) is unautomated."

End-to-end smoke + regression-check executed against `https://resonaverde.au` in 46.5s + 33s. 5 baselines captured, 0% diff on second run. Pattern codified same-turn per [[codify-at-the-moment-a-rule-is-stated-not-after]].
