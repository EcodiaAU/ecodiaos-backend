---
name: cdp-compound-flow-design-2026-05-17
description: Designing multi-step cdp.* + gui.sequence chains that survive contact with reality. Verify URLs before chaining, prefer substrate-agnostic selectors (href patterns) over framework-specific testid attrs, pass state via window.__var, embed decision logic in cdp.runJs, default stopOnError true.
metadata:
  type: feedback
triggers: cdp-compound-flow, cdp-chain-design, gui-sequence-multi-step, cdp-state-passing, window-__var, cdp-decision-logic, dom-selector-robustness, anchor-href-selector, testid-fragility, cdp-url-verification, stopOnError-default-true, cdp-runJs-batch-decisions, multi-page-recon, drilldown-batch
---

# Designing CDP compound flows that survive contact with reality

## Rule

When chaining multiple `cdp.*` actions inside one `gui.sequence` to do multi-page recon or drill-down:

1. **Verify URL paths before chaining.** Don't assume `/orgs/{name}/repositories` vs `/{name}?tab=repositories` etc. - they 404 silently for the wrong account type. Probe with a tiny first batch (or a known-working path), then build the chain.
2. **Prefer substrate-agnostic selectors over framework-specific ones.** `a[href*="/commit/"]` survives a React rewrite; `div[data-testid="commit-row-item"]` does not. Anchor `href` patterns are stable across years of UI churn; testid attrs change every quarter.
3. **Pass state across steps via `window.__var`.** Inside the page, set `window.__repos = [...]` in one `cdp.runJs`, read it in the next. The browser is the shared scratchpad. Don't try to round-trip state through the conductor.
4. **Embed decision logic inside `cdp.runJs`.** Filtering, ranking, picking-the-best - do it in the page's JS where the data already lives. The conductor sees only the final pick.
5. **Default `stopOnError: true`.** A failed selector should abort the chain immediately - don't waste a 25-second page screenshot on a 404 page.
6. **Always set `includeStepResults: true` while iterating.** Per-step `result` payloads are essential for debugging which step's selector / URL was wrong. Once the chain is golden, you can drop intermediate results.
7. **For the "find element + walk up to its container" pattern**, use `.closest('li, article, div[data-testid], tr')` not a single tag. Anchors live in unpredictable parents across SPA frameworks; multi-tag closest is forgiving.
8. **Always declare the wait selector explicitly after a navigate.** `waitUntil: networkidle2` returns when network quiets, but React hydration finishes later. A `cdp.wait` on a known DOM marker is the real readiness gate.

**Why:** measured 2026-05-17. First compound-flow demo (multi-page GitHub recon with `/orgs/...` URL + `data-testid=commit-row-item` selector) wasted 56 seconds with 2 failures: wrong URL 404'd, GitHub-specific testid didn't match the current UI. Retry with correct URL + anchor-based commit selector landed the same chain in 8 seconds with 9/9 success.

**How to apply:** treat any new compound flow as a two-phase ship:
- **Phase 1 (recon, ~2 steps):** navigate + queryAll/runJs returning structure of the live page. Probe selectors, verify URLs, see what the SPA actually renders. Cheap.
- **Phase 2 (compound, N steps):** chain navigations + extractions with state passing. Confident now because phase 1 proved the surface.

Don't skip phase 1 just because you "know" the URL. SPAs and account-type quirks bite.

## Anti-patterns observed in the failed run

- Used `/orgs/EcodiaTate/repositories?type=all&sort=updated` for a USER account (silent 404)
- Used `div[data-testid="commit-row-item"]` which is a Vercel-style framework guess, not GitHub's actual selector
- Set `stopOnError: false` so the chain wasted ~25s rendering a chrome-error://chromewebdata/ screenshot at the end

## Substrate-agnostic selector recipes

| Target | Stable selector |
|---|---|
| All commits on a GitHub commits page | `a[href*="/commit/"]` (dedup by SHA from href regex) |
| All repos on a user/org repo listing | `#user-repositories-list ul li` (this one IS testid-stable) OR `a[itemprop*="codeRepository"]` |
| Last-updated time on any GitHub item | `relative-time` (custom element, stable for years) |
| Author/user link on a commit/issue | `a[data-hovercard-type="user"]` (stable) OR `a[href^="/"][href$="${username}"]` |
| Generic clickable card container | `closest('li, article, div[data-testid], tr')` |
| Deployment / PR / issue title | First `a[href*="/<type>/"]` within the card |

## Origin

2026-05-17 evening. First "more complicated" demo Tate requested - multi-page drill-down of EcodiaTate org repos + commits. v1 wasted 56s on wrong URL + testid selector. v2 with correct URL + `#user-repositories-list ul li` landed in 8s with 9/9 success. Commits-page sub-step still failed selector match, prompting this codification before v3 retry.

Cross-refs:
- [[gui-substrate-three-layer-architecture-2026-05-17]] - parent doctrine on the 3-layer GUI substrate
- [[gui-batch-primitive-collapses-roundtrips-orthogonal-to-coord-brittleness-2026-05-17]] - the batch substrate this rides on
- [[drive-chrome-via-input-tools-not-browser-tools]] - why CDP > pixel coord for Chrome targets
