---
name: gui-substrate-three-layer-architecture-2026-05-17
description: The pinnacle GUI substrate is three composable layers - batch (gui.sequence), CDP DOM addressing (cdp.*), semantic helpers (gui.focus_chrome/open_url/install_cdp_to_chrome). Everything composes inside one batched HTTP call. Pixel coords are the fallback, not the default.
metadata:
  type: feedback
triggers: gui-substrate, gui-three-layer, gui-pinnacle, cdp-attach, cdp-dom-addressing, gui-semantic-helpers, gui-install-cdp, gui-open-url, gui-focus-chrome, install-cdp-to-chrome, cdp-runJs, cdp-queryAll, gui-batch-compose-cdp, chrome-shortcut-cdp-flag, --remote-debugging-port, gui-orthogonal-layers, semantic-over-coord
---

# GUI substrate: three composable layers

## Rule

Drive GUI tasks through this stack, top-down. Each layer composes inside `gui.sequence` for atomic batched execution.

1. **Layer 3 (semantic):** `gui.open_url`, `gui.focus_chrome`, `gui.close_tab`, `gui.switch_tab`, `gui.install_cdp_to_chrome`. Named flows that compose lower primitives. Use these first.
2. **Layer 2 (addressing):**
   - **2a CDP DOM:** `cdp.attach`, `cdp.navigate`, `cdp.runJs`, `cdp.click`, `cdp.wait`, `cdp.text`, `cdp.queryAll`, `cdp.pageScreenshot`, `cdp.listTabs`, `cdp.selectTab`, `cdp.url`, `cdp.detach`. DOM-level addressing on Tate's real logged-in Chrome. Zero pixel brittleness. Returns structured data.
   - **2b pixel coords:** `input.click`, `input.type`, `input.shortcut`, `input.key`, `screenshot.screenshot`. Fallback only. Brittle to taskbar reorder, theme changes, multi-monitor docks. Re-locate the target via a discovery screenshot in the same session, never hardcode from a past session.
3. **Layer 1 (batch):** `gui.sequence` wraps any sequence of Layer 2 or Layer 3 calls into ONE server-side execution + ONE HTTP response.

**Why:** measured 2026-05-17, an 8-round-trip Vercel recon at 7 minutes (gauge) collapsed to a 9-action batched recon at 10 seconds (~42x). Adding CDP DOM addressing on top kills the residual pixel-coord brittleness that landed the first demo on Microsoft Teams instead of Chrome (taskbar had reordered between gauge time and demo time). The pinnacle case: one HTTP call that attaches CDP, navigates, queries DOM, returns structured data + a page screenshot.

**How to apply:**

- **Default for any multi-step GUI task is `gui.sequence`.** Sequential round-trips are wrong-shape unless you genuinely need to inspect intermediate state.
- **Prefer Layer 3 over Layer 2.** `gui.open_url({url, mode: 'new_tab'})` is better than `input.shortcut [ctrl,t]` + `input.type` + `input.key enter` written out, because the helper has the right waits + the right defaults baked in (new-tab default preserves user's other tabs - Tate verbatim feedback 2026-05-17 "wouldve maybe been better to open a new tab instead of editing the url of the open tab").
- **Prefer Layer 2a (CDP) over Layer 2b (pixel) wherever the target is in Chrome.** DOM queries are reliable; pixel coords are not. Layer 2b stays valid for non-Chrome desktop apps where UIA (Layer 2c, not yet shipped) doesn't help.
- **Layer 2a requires Tate's Chrome to be CDP-enabled.** Run `gui.install_cdp_to_chrome` ONCE to add `--remote-debugging-port=9222` to Chrome's taskbar/desktop shortcuts. After that, every Chrome relaunch is CDP-enabled. Zero session loss. The legacy `gui.enable_chrome_cdp` kills + relaunches Chrome to force CDP on - only use when Tate has accepted the relaunch cost.
- **Inside a `gui.sequence` batch, mix freely.** A single batch can chain a Layer-3 `gui.open_url` (new tab) -> Layer-2a `cdp.wait` (DOM ready) -> Layer-2a `cdp.queryAll` (structured extraction) -> Layer-2a `cdp.pageScreenshot` (visual capture). One round-trip, one response, one structured artefact + image.

## Component reference

| Tool | Layer | Purpose |
|---|---|---|
| `gui.sequence` | 1 | Batch wrapper - all the below compose inside it |
| `gui.focus_chrome` | 3 | AHK WinActivate by exe name (no pixel coord) |
| `gui.open_url` | 3 | Composition: focus_chrome + Ctrl+T (or Ctrl+L) + type + enter + wait. Default mode `new_tab` preserves user tabs |
| `gui.close_tab` | 3 | Ctrl+W |
| `gui.switch_tab` | 3 | Ctrl+Tab / Ctrl+Shift+Tab |
| `gui.install_cdp_to_chrome` | 3 | Modify Chrome .lnk shortcuts to add --remote-debugging-port=9222. Run once. Future Chrome launches are CDP-enabled. SAFE - zero tab loss |
| `gui.launch_cdp_chrome` | 3 | Idempotent: if CDP up returns immediately; else spawns chrome.exe detached with the full flag set against an ISOLATED user-data-dir (C:\eos-chrome-cdp by default). Use as prefix step in any batch needing CDP. Removes "can you reopen Chrome" friction. |
| `gui.enable_chrome_cdp` | 3 (LEGACY) | Kill + relaunch Chrome with CDP. Use only if user accepts tab loss + restore-dialog dance. Prefer install_cdp_to_chrome |
| `cdp.attach` | 2a | Connect Puppeteer to a CDP-enabled Chrome. Auto-reconnects if connection drops |
| `cdp.navigate` | 2a | `page.goto(url, {waitUntil})`. Returns final URL + title |
| `cdp.wait` | 2a | `page.waitForSelector(sel, {timeout, visible, hidden})` |
| `cdp.runJs` | 2a | Evaluate a JS expression string in the page context. Returns the value |
| `cdp.click` | 2a | Click an element by selector |
| `cdp.text` | 2a | Read .textContent of one element |
| `cdp.queryAll` | 2a | Query many elements + project named fields via a fields dict (subselector@attribute syntax). Returns structured rows |
| `cdp.pageScreenshot` | 2a | `page.screenshot({fullPage})`. Different from OS-level screenshot.screenshot |
| `cdp.url` | 2a | `page.url()` + `page.title()` |
| `cdp.listTabs` | 2a | Enumerate all tabs/targets the attached browser has |
| `cdp.selectTab` | 2a | Switch the cached "current page" by index or url-substring |
| `cdp.detach` | 2a | Disconnect Puppeteer cleanly |
| `input.*` | 2b | Pixel-coord click / keyboard / mouse fallback |
| `screenshot.screenshot` | 2b | OS-level screen capture for discovery / off-CDP windows |

## Bootstrap procedure (one-time, for CDP)

```
# 1. Run the shortcut-modifier tool. Modifies Chrome taskbar/desktop/start .lnk
#    Arguments to include --remote-debugging-port=9222. Idempotent.
POST /api/tool { tool: 'gui.install_cdp_to_chrome', params: {} }

# 2. Close Chrome (Tate's choice when - no urgency, current session continues fine).

# 3. Click Chrome icon in taskbar. New process opens with CDP enabled,
#    Tate's Default profile, all cookies, all tabs restored per his
#    Chrome "On startup" setting.

# 4. From now on, every cdp.attach call succeeds against Tate's real session.
```

## Pinnacle example: one batch, structured data + screenshot

```json
{
  "tool": "gui.sequence",
  "params": {
    "actions": [
      { "tool": "cdp.attach", "params": {} },
      { "tool": "cdp.navigate", "params": { "url": "https://vercel.com/ecodia/~/deployments", "waitUntil": "networkidle2" } },
      { "tool": "cdp.wait", "params": { "selector": "main", "timeout": 8000 } },
      { "tool": "cdp.queryAll", "params": {
          "selector": "a[href*='/deployments/']",
          "fields": { "href": "@href", "text": "@text" },
          "limit": 25
      } },
      { "tool": "cdp.pageScreenshot", "params": { "fullPage": false } }
    ],
    "includeStepResults": true
  }
}
```

Returns in one HTTP response: per-step durations, the queryAll result rows (structured JSON), and the final page screenshot bytes. Total wall clock target: <8s on a warm CDP connection. Compared to the equivalent pixel-coord flow (gauge: 7 min), this is the architectural ceiling for Chrome targets.

## What this pattern does NOT yet cover

- **Layer 2c (UI Automation for non-Chrome desktop apps):** Teams, Slack, Discord, VS Code, Cursor, native dialogs. Pixel coords remain the only path for those today. Next ship.
- **Visual element location:** vision-based "find the button labelled X" via template matching or LLM-described targets. Fallback when DOM/UIA both fail.
- **Recording -> replay:** Tate-recordings substrate (per existing doctrine) for repeatable macros. Composes well with this stack but not wired yet.
- **Auth-bearing CDP on first run:** the `gui.install_cdp_to_chrome` bootstrap is one-time-per-machine. Documented; works.

## Origin

2026-05-17 evening session. Tate verbatim: "keep building everything we possibly need for the pinacle gui usage because this is arguably the most iimporatant capability for you. Build it all then demonstrate how ffast and well you can do things." Demo 1 (pixel-coord batched, 9.85s, ~42x speedup vs gauge) shipped first as the Layer-1 win. Layers 2a + 3 shipped immediately after, with the install_cdp_to_chrome insight emerging from a recovery sequence after the first enable_chrome_cdp approach destroyed Tate's tab state. Tate verbatim mid-build: "you need to be using my chrome with my profile so its got alll the creds" + "why do you not jsut literally click my chrome icon in the taskbar" - both inputs drove the shortcut-modification design.
