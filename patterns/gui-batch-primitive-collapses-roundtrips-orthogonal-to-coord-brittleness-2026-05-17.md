---
name: gui-batch-primitive-collapses-roundtrips-orthogonal-to-coord-brittleness-2026-05-17
description: gui.sequence on the laptop-agent batches N action steps into 1 HTTP call and returns only the final screenshot. Removes round-trip cost from GUI flows. Does NOT remove pixel-coord brittleness; that's a separate layer.
metadata:
  type: feedback
triggers: gui-batch, gui-sequence, gui.sequence, laptop-agent-batch, batch-primitive, round-trip-collapse, gui-roundtrip-cost, action-array, screenshot-act-repeat, gui-action-chain, gui-flow-batching, gui-brittleness, taskbar-coord-brittleness, pixel-coord-stale, gui-addressing-vs-batching, gui-orthogonal-levers
---

# `gui.sequence` collapses round-trips but is orthogonal to coord brittleness

## Rule

For any GUI flow that is more than one action (click, type, key, wait, screenshot), batch the actions into a single `gui.sequence` call on the laptop-agent. Don't fire them one at a time from the conductor.

When the flow targets pixel coordinates (`input.click {x, y}`), assume the coordinate is stale unless the target was located by a robust addressing method earlier in the same session. Taskbar icons reorder; OS theme changes shift layouts; window positions change with multi-monitor docks. Pixel-only addressing is an unreliable substrate; batching does not make it more reliable.

**Why:** A 7-minute GUI gauge on 2026-05-17 (REPORT.md in drafts/gui-gauge-2026-05-17/) was bottlenecked by per-action round-trips: each step was act -> wait -> screenshot back -> conductor reads PNG by eye -> decides next coord -> next call. ~30-60 seconds per round-trip x 8 actions. Shipping `gui.sequence` (tools/gui.js on the laptop-agent) reduced the same 9-action flow to ONE HTTP call, 10.4 seconds wall-clock. ~40x speedup.

The victory demo of `gui.sequence` clicked Microsoft Teams instead of Chrome because the taskbar had reordered between the gauge run (15:55) and the victory run (16:59) - same pixel coord `(795, 743)` now hit a different app. The batch primitive worked perfectly; the addressing layer is what failed. The two are independent concerns and need independent fixes.

**How to apply:**

1. **Default to `gui.sequence` for any multi-step GUI flow.** Sequential `input.click` / `input.type` calls from the conductor are wrong-shape unless you genuinely need to inspect intermediate state.
2. **`finalScreenshot: true` + `keepIntermediateScreenshots: false`** is the right default. Conductor parses one screenshot at the end, not eight along the way.
3. **`stopOnError: true`** by default. Otherwise a failed click cascades into actions firing into the wrong target.
4. **Per-step durationMs in the response** is your debug surface. If a step takes >2s, that's where to look.
5. **Pixel coords are last-resort addressing.** Prefer (in order): URL navigation > keyboard shortcut > window-class + relative coord > raw pixel coord. When pixel coord is unavoidable, re-locate the target in the same session (e.g. screenshot first, find icon, then click) rather than hardcoding from a past session.
6. **For repeated flows targeting a single SaaS, attach CDP to Chrome** (`browser.enableCDP()` is already in the laptop-agent surface) and use DOM-level addressing (`document.querySelector(...)`) instead of pixel coords. Substrate for this is sketched in REPORT_V2.md "Next levers" section.

## Substrate reference

- **Tool:** `gui.sequence` (POST `/api/tool`)
- **Source:** [D:/.code/eos-laptop-agent/tools/gui.js](D:/.code/eos-laptop-agent/tools/gui.js)
- **Auto-loaded** by `index.js` on agent boot. Survives `pm2 restart`.
- **Restart procedure** documented in REPORT_V2.md (stale PM2 metadata required `Stop-Process -Force` + `pm2 delete` + `pm2 start` ecosystem.config.js).
- **Smoke test artefacts:** drafts/gui-gauge-2026-05-17/{smoke,victory}-{batch,response,final}.{json,png}.

## Related doctrine

- [[drive-chrome-via-input-tools-not-browser-tools]] - still the substrate doctrine for WHEN to use Tate's logged-in Chrome vs a fresh profile. `gui.sequence` is just the call shape; this pattern is the routing.
- [[use-anthropic-existing-tools-before-building-parallel-infrastructure]] - the earlier turn where I almost shipped a programmatic-API computer-use loop because the doctrine called for it. Tate caught it: that doctrine is about choosing existing primitives, not adding a metered-API budget on top of a paid-Max subscription. Final shape stayed inside our paid Max envelope by using fresh CC tabs + `gui.sequence` rather than the metered computer-use API.
- [[eos-laptop-agent-module-cache-requires-restart-after-handler-swap]] - confirmed live: edits to `tools/*.js` require `pm2 restart eos-laptop-agent` to load. Auto-discovery picks them up cleanly on next boot.
- [[mouse-scroll-broken]] - still broken on the laptop-agent. `gui.sequence` works around it by accepting `input.key page_down` in the scroll position, but that's a workaround, not a fix.

## What this pattern does NOT claim

- It does not claim that `gui.sequence` makes the conductor smart about HOW to drive a UI. The conductor still has to author a correct sequence. If the sequence is wrong, the batch fails fast - the failure cost is one bad screenshot, not eight.
- It does not claim that addressing is solved. Pixel coords remain brittle. See "Next levers" in REPORT_V2.md.
- It does not address focus collision. Step 0 (no-focus-collision probe) doctrine still applies before dispatching ANY batch that includes `input.*` actions, since the batch will steal focus from whatever window is foreground when it starts.

## Origin

2026-05-17 ~16:55 AEST. Tate verbatim cold-start on the GUI gauge: "this extremely slow screenshot, review, act, repeat thing is the onlly way to do it... idk this is jsut nowher near where it needs to be." Pivoted from a programmatic computer-use API loop (which would have spent metered Anthropic API budget on top of the paid Max subscription - Tate caught that mistake in the next turn) to `gui.sequence` on the laptop-agent. Smoke + victory tests validated the substrate win in the same session.
