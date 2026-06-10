---
triggers: maestro canonical, app testing canonical, mobile e2e testing, how do we test the apps, coexist testing, glovebox testing, locals testing, goodreach testing, capacitor testing maestro, devtools webview hierarchy, maestro flow authoring, stably web testing, admin page testing, ship gate verdict producer, app test runner, release verification canonical
priority: critical
canonical: true
binding: hook=release-walker-ship-gate.py + script=backend/scripts/app-tests/run-app-tests.sh
---

# Maestro (mobile) + Stably (web) are the canonical app-testing substrate; the bespoke walker is deleted

## 1. The rule

App testing is BOUGHT, not built (per [[buy-before-build-market-sweep-gates-infrastructure-builds-2026-06-10]]). Canon as of 2026-06-10:
- **Mobile (all four apps, native + Capacitor): Maestro.** Flows live in `<app-repo>/.maestro/flows/*.yaml`. Runner: `backend/scripts/app-tests/run-app-tests.sh <app>` (thin glue: runs every flow, emits the verdict.json the ship gate reads). Hosted devices when travelling: DeviceCloud ($25/mo tier) or Maestro Cloud.
- **Web (React admin SPAs, the /admin/email class): Stably** (AI Playwright, cron + autofix in their cloud). Trial pending signup; Octomind is the fallback.
- The 2026-06-10 bespoke walker (matrix engine, detectors, explore) is DELETED from the tree. Git history keeps it; nothing maintains it.

## 2. Why

A full day of bespoke walker build was redirected by Tate the same day it went green: "Someone has already perfected it and we should just be using that." Market sweep (research agent, live-verified June 2026) ranked Maestro #1 mobile: the only verified Capacitor/WebView path at SMB cost, already installed, already production-proven against Coexist. Proof on adoption day: run 1 reproduced our codified floating-label bug; the documented one-line fix (`androidWebViewHierarchy: devtools`) cleared every input issue that took the walker a custom editfield primitive to solve; run 2-3 found a REAL shipped bug (Coexist cold-clear first paint blocks on network: blank screen 60s+, row 1b1e718d) within fifteen minutes.

## 3. How to apply

- **Flow authoring:** YAML per flow, env-injected creds (`${MAESTRO_CX_EMAIL}` style, values from the kv-mirror; never literals in the file). Capacitor apps REQUIRE `androidWebViewHierarchy: devtools` in the flow config. Late WebView text settles via `extendedWaitUntil`, not sleeps.
- **State dimensions still matter** (the analysis held up even though the engine did not): permission/appearance/font/network/data states ride as adb/simctl pre-steps around `maestro test`, or as flow variants. The four `.release-walker/spec.yml` files are REQUIREMENTS DOCS for flow authoring, not runnable specs.
- **Ship gate unchanged in spirit:** `release-walker-ship-gate.py` blocks ships without a green verdict under 24h; the verdict producer is now the Maestro runner. Bypass stays `walker-ok`.
- **Authoring assistance:** Maestro Studio to record, Maestro MCP for agent-driven authoring; EcodiaOS maintains flows (we are the AI-maintenance layer the vendors sell).
- **Red flows are allowed to stay red** when they track a real app bug (the coexist cold-clear flow reds until 1b1e718d is fixed); that is the gate working.
- **Flow lifecycle:** flows update in the SAME change as the feature that moves the UI (a feature PR that breaks a flow without touching .maestro/ is incomplete); nightly reds from drift are triaged and fixed same-day by the conductor; every newly found bug gets a strict canary flow BEFORE its fix lands. Anchors always come from observed screenshots or hierarchy dumps, and text matchers are full-string regex (dynamic-prefix text needs the .* form: bitten twice on day one). Select/combobox VALUES render as pixels but are NOT text in the devtools hierarchy (admin-home All Time, day one): anchor on adjacent stable text, never on a dropdown's current value.

## 3b. The dual activity (Tate, 2026-06-10, the operating shape)

Testing is a DUAL ACTIVITY between Maestro and EcodiaOS; neither alone is
the gate. Tate verbatim: "the math absolutely needs to be correct, text
needs to contrast against backgrounds, formatting needs to actually look
aesthetic, and it needs to handle react capacitor apps like co-exist, or
dual native apps like locals and glovebox."

- **Maestro drives** (all app shapes: Capacitor WebView via devtools
  hierarchy, Compose and SwiftUI natively): journeys, forms, persistence
  kill+relaunch, and METRIC READS: copyTextFrom the on-screen number,
  fetch the DB truth over REST in runScript, assertTrue equality. A
  stats surface without an invariance check is untested math.
- **EcodiaOS judges** what structure cannot: every run (green included)
  produces a screenshot gallery and the nightly worker vision-judges
  contrast (text against backgrounds), aesthetic formatting, broken
  images, washed tints, clipped layouts. A structural pass with ugly or
  unreadable pixels is a FINDING.
- **Flow design split:** journey flows may self-heal known-bug
  preconditions (commented, with the row id, removed when fixed); each
  known bug keeps ONE strict unhealed canary flow so detection never
  degrades into accommodation.
- Production-ready for a public push = structural green x metrics
  invariance green x vision pass, per app, per platform.

## 4. Anti-patterns

- Adding detectors, matrix engines, or walkers next to Maestro: that is the deleted build growing back. Glue must stay thin (runner emits verdict.json, nothing more).
- Hand-rolled uiautomator/idb driving for anything Maestro covers.
- Literal credentials inside flow YAML (env-inject from the kv-mirror).
- Skipping the devtools hierarchy on a Capacitor app and concluding the inputs are untappable.

## 5. Cross-references

- [[buy-before-build-market-sweep-gates-infrastructure-builds-2026-06-10]]
- [[maestro-tapon-by-text-misses-capacitor-webview-input-use-coord-tap]] (the devtools hierarchy supersedes most coord-tap needs)
- [[release-walker-state-matrix-2026-06-10]] (ARCHIVED: engine deleted, state-dimension analysis lives on here)
- Market report: status_board row e99717fd (pivot) carries the research summary pointer.

## 6. Origin

2026-06-10 pivot. Walker built, went green, retired same day; Maestro adopted and found a real production bug in its first three runs.
