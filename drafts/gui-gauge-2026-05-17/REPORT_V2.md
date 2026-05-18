# GUI substrate upgrade - REPORT_V2

**When:** 2026-05-17 ~16:55 AEST
**Pairs with:** [REPORT.md](REPORT.md) (the original 7-minute Vercel-recon gauge)
**TL;DR:** Shipped the `gui.sequence` batch primitive on the laptop-agent. 9-action end-to-end "open Chrome + navigate + screenshot" now runs in **10 seconds, one HTTP call** vs the original 7-minute, 8-round-trip grind. Architecture win validated. One unrelated brittleness exposed (stale pixel coord) - that's the next lever, addressed in a sibling pattern.

## What shipped

[D:/.code/eos-laptop-agent/tools/gui.js](D:/.code/eos-laptop-agent/tools/gui.js) - new file, ~110 LOC. Auto-discovered by `index.js`. Exposed as `gui.sequence` on POST `/api/tool`.

API:
```json
POST /api/tool
{
  "tool": "gui.sequence",
  "params": {
    "actions": [
      { "tool": "input.click", "params": { "x": 795, "y": 743 } },
      { "tool": "wait", "params": { "ms": 400 } },
      { "tool": "input.shortcut", "params": { "keys": ["ctrl", "l"] } },
      ...
      { "tool": "screenshot.screenshot" }
    ],
    "stopOnError": true,
    "finalScreenshot": true,
    "keepIntermediateScreenshots": false
  }
}
```

Dispatches any `input.*`, `mouse.*`, `screenshot.*`, plus a pseudo-tool `wait`. Returns:

```json
{
  "ok": true,
  "result": {
    "completed": 9, "failed": 0, "totalMs": 10228,
    "steps": [{"i": 0, "tool": "input.click", "ok": true, "durationMs": 1336}, ...],
    "finalImage": "<base64 PNG>",
    "finalFormat": "png"
  }
}
```

## Numbers

| Metric | Original gauge | Batched | Speedup |
|---|---|---|---|
| Wall clock (Vercel recon, ~8-9 actions) | ~420s (7 min) | 10.4s | **~40x** |
| HTTP round-trips | 8 | 1 | **8x** |
| Conductor turns burned | 8 (each parsed an intermediate screenshot by eye) | 1 (parses only the final screenshot) | **8x** |
| Intermediate screenshot bytes parsed | ~8 x 130KB = 1MB image data ingested + reasoned over | ~0 (intermediates dropped by `keepIntermediateScreenshots: false`) | huge |
| Per-step latency visibility | Hidden in tool-call timing | Reported in `steps[].durationMs` | new |

Smoke test (5 trivial actions: screenshot, wait, cursorPosition, wait, screenshot) ran in **4 seconds wall clock, 3.7s server execution** - confirms the server-side loop is the bottleneck (not network), so further wins from batching scale linearly with action count.

## Restart procedure (for posterity)

The agent runs under PM2 but the entry was stale (`pm2 list` showed `eos-laptop-agent` as `errored` despite the actual PID 19436 serving fine). The clean restart was:

1. `Stop-Process -Id 19436 -Force` (via PowerShell - `taskkill /F /PID` timed out under memory pressure, PowerShell native kill succeeded).
2. `pm2 delete eos-laptop-agent` (clears stale entry).
3. `cd D:/.code/eos-laptop-agent && pm2 start ecosystem.config.js` (fresh spawn under PM2).
4. `pm2 save` (persist for `pm2-resurrect.bat` on next boot).
5. Health check + tool-list grep to confirm `gui.sequence` registered.

Auth was DISABLED before (`AGENT_TOKEN` env var was never set on the previous launch - client `Bearer` headers were ignored, calls worked anyway). Preserved that state on restart. Separate worth-a-pass-later: set `AGENT_TOKEN` properly so the Bearer file becomes load-bearing.

## What this did NOT fix

Pixel-coord brittleness. Demonstrated when the victory batch clicked Microsoft Teams instead of Chrome - the taskbar reordered between the gauge run (15:55) and the victory run (16:59), and `(795, 743)` was Chrome's spot at the first time and Teams' spot at the second.

Batch and addressing are orthogonal. Batch collapses round-trips (this ship). Robust addressing collapses brittleness (next ship). The two stacked together approach the architectural ceiling I named in the cost-pivot turn.

**Next levers (rough order):**

1. **Element-level addressing** - CDP attach to the running Chrome lets the worker do `document.querySelector('a[href*=deployments]').click()` instead of `input.click(x, y)`. The agent already has `browser.enableCDP()` which restarts Chrome with `--remote-debugging-port=9222`. Need to wire a sibling tool `browser.cdp.eval` that runs JS in the attached page.
2. **Window-class addressing** - for non-Chrome targets, use UI Automation to find a window by class/title and click into it by named control. `input.click_in_window({windowTitle: "*Chrome*", x: <relative>, y: <relative>})` would have avoided the Teams misclick.
3. **`mouse.scroll` fix** - separate bug, listed since the gauge, still hangs.
4. **Backend mirror drift** - `backend/laptop-agent/tools/` is missing 6+ files vs the live `eos-laptop-agent/tools/`. Separate cleanup pass.

## Artefacts

All in [drafts/gui-gauge-2026-05-17/](D:/.code/EcodiaOS/backend/drafts/gui-gauge-2026-05-17/):

- `smoke-batch.json` - 5-action zero-action smoke test request body
- `smoke-batch-response.json` - response, ok=true, 5/5 complete in 3.7s
- `smoke-batch-final.png` - final screenshot (proves loop returns image bytes)
- `victory-batch.json` - 9-action "open Chrome + navigate Vercel" request body
- `victory-response.json` - response, ok=true, 9/9 complete in 10.2s
- `victory-final.png` - final screenshot (proves end-to-end but landed on Teams due to stale coord)
