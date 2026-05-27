---
name: chrome-cdp-network-enable-times-out-under-tab-memory-pressure
description: When Corazon Chrome runs hot (>~85% memory, ~25+ tabs), every cdp.* wrapper call returns "Network.enable timed out" because puppeteer.connect auto-enumerates every tab and serially enables Network/Page/Runtime on each. The fix is not to retry - it's to route around the block.
triggers: chrome-cdp, cdp-timeout, network-enable-timeout, puppeteer-connect, protocoltimeout, cdp-helper-broken, chrome-memory-pressure, cdp-attach-fails, gui-cdp-blocked, corazon-chrome-hot, network-enable, cdp-runJs-times-out, cdp-attach-tab-times-out, listTabs-times-out, cdp-helpers-unavailable, gui-substrate-degraded
metadata:
  type: pattern
---

# Chrome CDP wrapper times out under tab/memory pressure

## The failure

Every `cdp.*` call returns:

```
{"error":"Network.enable timed out. Increase the 'protocolTimeout' setting in launch/connect calls for a higher timeout if needed.","tool":"cdp.runJs"}
```

Happens to `cdp.attach`, `cdp.attach_tab`, `cdp.listTabs`, `cdp.url`, `cdp.runJs`, `cdp.findVisible`, `cdp.deepFindRect` - the whole helper surface goes dark.

The trap: agent `/api/health` reports OK. Chrome `/json/version` responds.
Chrome `/json/list` lists targets. Everything LOOKS healthy. Only the
puppeteer-backed wrapper times out.

## Why it happens

`tools/cdp.js`'s `ensureConnected` does `puppeteer.connect({ browserURL })`
followed by `browser.pages()`. Puppeteer enumerates EVERY target on the
browser, opening a CDP session per page and serially enabling Network +
Page + Runtime domains. With 25+ tabs and Chromium at 85%+ host memory,
each Network.enable can take 5-15s. Puppeteer's default protocolTimeout
fires first.

Observed twice in one session: 94% mem during impact-stats verification,
86% mem during Play Console release management. Both times reproducible
within seconds of opening the agent endpoint - this is not flakiness.

## What to do (in order)

1. **Probe agent + chrome separately**:
   - `curl /api/health` → confirms agent alive
   - `cdp.runJs target=alias` → confirms wrapper works
   - If wrapper times out but agent answers, you are in this state.

2. **Check memory pressure**: `/api/health` returns `memory.usedPercent`.
   At >80% with many tabs, assume CDP will keep failing. Memory has to
   come down before retries help.

3. **Route around the block** ([[route-around-block-means-fix-this-turn-not-log-for-later]]):
   - Many Play Console / GitHub / Stripe / SaaS flows have HTTP APIs.
     Drive via direct REST (apikey + bearer JWT pattern) instead of CDP.
   - Read DB state via `mcp__ecodia-full__db_query` or `mcp__ecodia-full__kv_store_get`
     instead of scraping the UI.
   - For Supabase RLS-authenticated probes: extract the JWT from
     `localStorage` via `cdp.runJs` ONCE when CDP is alive, then use
     raw curl + that JWT for the rest of the session (the JWT survives
     CDP timeouts).
   - If the action truly needs DOM interaction, hand off to Tate with a
     concrete playbook (numbered steps + paste-ready strings).

4. **Don't retry the same CDP call**. It will keep timing out until
   Chrome memory frees. Loops of `cdp.url → wait → cdp.url` burn the
   session for no progress. Each retry just blocks for the puppeteer
   timeout.

5. **DO NOT close Tate's tabs** to free memory unless he asks. Auto-closing
   the DigitalOcean / Stripe / ASC tabs to fix YOUR tooling is wrong
   shape - that's his working session.

## What NOT to do

- Don't claim "the agent is broken" - it isn't.
- Don't restart `eos-laptop-agent` to fix - the restart wipes ALL
  active CDP aliases, breaks any sibling fork's GUI work, and the same
  Network.enable timeout fires immediately on next connect when memory
  is still high. Restart only fixes this when memory has already
  dropped, in which case retry would also work.
- Don't try `cdp.helpers` / `cdp.findVisible` / `cdp.runJs` repeatedly
  hoping one will succeed. They share the same puppeteer.connect path.

## Future improvement (when ready)

The real fix is in `laptop-agent/tools/cdp.js`:
- Pass `protocolTimeout: 120000` to `puppeteer.connect`
- Pass `targetFilter: t => t.type === 'page' && !t.url.startsWith('chrome-')`
  so puppeteer doesn't enumerate iframes / extensions / devtools pages
- Cache the connection more aggressively so attach-time enumerate
  happens once per agent lifetime, not per call

This is a non-trivial change because the connection state is shared
across all `cdp.*` aliases. Worth doing same-arc as the next CDP refactor,
not as an isolated patch.

## Origin

Tate verbatim 19:00 AEST 2026-05-19 after watching me give up CDP twice
in one session (impact-stats verification at 94% mem; Play Console
release flow at 86% mem): "memory is tight right now so all good. That
was very entertaining to watch and we'll need to codify any lessons you
learnt."

## Cross-refs

- [[cdp-helper-library-and-recursive-improvement-2026-05-18]] - the
  helper surface that goes dark under this failure mode
- [[route-around-block-means-fix-this-turn-not-log-for-later]] -
  general doctrine; this pattern is its CDP-specific application
- [[chrome-cdp-attach-requires-explicit-user-data-dir-and-singleton-clear]] -
  bootstrap-side gotcha; different failure mode (no Chrome listening at all)
