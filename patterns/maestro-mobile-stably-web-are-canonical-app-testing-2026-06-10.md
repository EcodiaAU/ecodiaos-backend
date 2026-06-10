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
