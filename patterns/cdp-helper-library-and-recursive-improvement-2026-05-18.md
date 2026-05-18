---
name: cdp-helper-library-and-recursive-improvement-2026-05-18
description: Five high-leverage CDP helpers (cdp.realClick, cdp.deepFindRect, cdp.nativeFill, cdp.findVisible, cdp.clickByTag) live on the Corazon laptop-agent that replace 50-line custom JS each time you'd otherwise hand-roll a CDP flow. Plus the recursive-improvement substrate that says: every CDP arc that hits a new failure mode lands a new helper or a new doctrine line same-turn, not "next time."
triggers: cdp-helper-library, cdp-recursive-improvement, blazing-good-at-cdp, cdp-tips-and-tricks, real-click-vs-js-click, native-input-setter, deep-walk-button, cdp-deepFindRect, cdp-realClick, cdp-nativeFill, cdp-findVisible, cdp-clickByTag, material-ui-click-fix, mui-button-click-doctrine, shadow-dom-walk, cdp-doctrine-substrate, gui-mechanic-improvement, cdp-codify-same-turn
status: active
---

# CDP helper library + recursive-improvement substrate

Tate verbatim 2026-05-18: "codify and surfcae anything you learned, improve the code or anything to make your usage of the cdp faster and better adn easier for you. We need to make sure that these tips and tricks and recursive improvement for all cdp usage (chrome and others) is always happening so that we get blazing good at it."

This file is BOTH the helper-library inventory AND the rule that says "every new CDP failure mode lands an improvement same-turn."

## The five helpers (live on Corazon laptop-agent today)

All under `cdp.*`, all auto-loaded from `D:/.code/eos-laptop-agent/tools/cdp.js`. Restart with `pm2 restart eos-laptop-agent` after editing.

### `cdp.realClick`

Real synthetic mouse via `Input.dispatchMouseEvent` mouseMoved + mousePressed + mouseReleased. The fix for "JS `.click()` does nothing on Material/MUI/custom-element buttons" - those listen for the full pointer sequence, not the dispatch-event shortcut.

```
cdp.realClick({x: 946, y: 874})
cdp.realClick({selector: 'button[aria-label="Save"]'})
cdp.realClick({tag: 'BUTTON', text: 'Save'})
```

When `selector`/`tag`/`text`/`aria` is passed instead of `{x,y}`, internally calls `cdp.deepFindRect` and clicks the center.

### `cdp.deepFindRect`

Shadow-DOM aware element finder. Walks light + shadow trees, filters by tag (default `BUTTON`), visible bounding rect, text/aria substring or exact match. Returns the first hit + up to 10 allMatches for visual triage.

Why this exists: `cdp.clickText` returns the first matching element in the page, which can be a P or SPAN wrapping the same label text outside the modal. The real BUTTON might be 100px lower in the DOM. Filter by `tag: 'BUTTON'`.

```
cdp.deepFindRect({tag: 'BUTTON', text: 'Save', exact: true})
cdp.deepFindRect({tag: 'BUTTON', aria: 'Save', exact: false})
cdp.deepFindRect({selector: 'button[data-id="save"]'})
```

Returns `{ok, tag, text, aria, x, y, w, h, allMatches}`.

### `cdp.nativeFill`

Native `HTMLInputElement.prototype` value setter, then dispatch `input` + `change` events. The fix for React/MUI/SPA inputs where `el.value = 'x'` is silently overwritten on the next render because the framework doesn't see a "real" user input.

```
cdp.nativeFill({selector: 'input[name=cron]', value: '0 */6 * * *'})
cdp.nativeFill({placeholder: '0 9 * * *', value: '0 */6 * * *'})
cdp.nativeFill({currentValue: '0 23 * * *', value: '0 */6 * * *'})
cdp.nativeFill({ariaLabel: 'Cron expression', value: '0 */6 * * *'})
```

Strategy order: `selector` → `placeholder` → `currentValue` → `ariaLabel`. First match wins. If nothing matches, returns the first 5 candidates so you can debug the selector.

### `cdp.findVisible`

Shadow-DOM aware enumeration of visible elements with rect + text + tag + class + aria + role. The "eyes of the blind agent" reflex for "what is actually clickable in this modal right now?" without taking a screenshot and OCRing it.

```
cdp.findVisible({tag: 'BUTTON', limit: 30})
cdp.findVisible({tag: 'INPUT', minW: 200, minH: 20})
cdp.findVisible({text: 'cron', limit: 10})
```

This was the entry-point for every CDP debug session today. Reach for it first when a click "didn't work" - you'll see what's actually on screen.

### `cdp.clickByTag`

`cdp.clickText` + mandatory tag filter + auto-escalation to real CDP mouse if JS `.click()` didn't change focus. The "do the right thing automatically" reflex for buttons.

```
cdp.clickByTag({tag: 'BUTTON', text: 'Save'})
cdp.clickByTag({tag: 'BUTTON', aria: 'Submit', exact: true})
```

Tries cheap JS click first. If focus didn't move (signal that nothing happened), escalates to `Input.dispatchMouseEvent` sequence at the BUTTON's computed center.

## Recursive-improvement substrate

The rule: **every CDP arc that hits a new failure mode lands a new helper or a new doctrine line same-turn, not "next time."**

Forms this takes:

1. **New helper.** If the workaround is >5 lines of JS that will recur (the native-setter pattern, the pointer-event sequence, the visible-button-deep-walk), it becomes a function in `tools/cdp.js` and gets restart-reloaded.
2. **Updated trigger.** If a failure mode is searchable by a phrase Tate would say (or I would think), add it to the `triggers:` of the closest pattern file.
3. **Updated hard rule.** If the failure mode breaks an assumption (e.g. "Escape closes the modal AND its parent panel"), append a hard rule to `chrome-cdp-is-top-primitive-for-gui-gated-work-2026-05-18.md`.
4. **Sister doctrine.** If the failure is substrate-level (e.g. "pm2 restart needed after tools/*.js edit"), it gets its own pattern file linked back here.

The substrate is the source code of `cdp.js` itself + the trigger frontmatter on this file + the hard-rules section of the parent pattern. There is no separate "lessons learned" inbox.

### How a new lesson gets codified (same-turn)

The recursive loop runs every time CDP work touches a new failure mode:

1. **Notice.** I tried X, it didn't work. Or: I had to write Y lines of inline JS, that's reusable.
2. **Generalise.** Strip the page-specific bits. What's the underlying primitive?
3. **Land.** Add to `tools/cdp.js` AND export AND `pm2 restart eos-laptop-agent` AND smoke-test on the live page that exposed the failure mode.
4. **Surface.** Add to the helpers section above AND to triggers on this file.
5. **Cross-ref.** Link from the parent CDP top-primitive pattern.

If any of those five steps gets skipped, the loop doesn't close and the same failure mode catches me again next month.

### Anti-patterns this guards against

- "I'll codify this next time." Next time never comes; the workaround gets re-derived from scratch and Tate watches me re-discover the same thing.
- "It works on this page so it's fine." A CDP technique that survives one page is barely a sample size of one. A technique that survives 3 different SPAs (GCP + claude.ai + Vercel say) is doctrine.
- "Add a comment in the JS expression." Comments in `cdp.runJs` strings die with the call. The helper IS the comment - the function name + its docstring carry forward.
- "Inline JS strings everywhere." When the same 30-line walk appears in three call sites, the third occurrence is the signal to make it a helper.

## Failure modes captured by today's helpers

Each of these was a real debugging arc on 2026-05-18 (the marketing-cadence-monitor Routine creation + cron-schedule edit). The fix landed same-turn.

| Failure mode | Symptom | Fix lives in |
|---|---|---|
| JS `.click()` on Material BUTTON does nothing | Save button visible, click() returns, modal doesn't close | `cdp.realClick` + auto-escalation in `cdp.clickByTag` |
| `cdp.clickText('Save')` hits a P wrapping the same text outside the modal | Wrong element clicked, real modal Save never fires | `cdp.deepFindRect` with `tag: 'BUTTON'` filter |
| `input.value = '0 */6 * * *'` reverts on next React render | Chip preview never updates from default | `cdp.nativeFill` with native setter |
| Don't know what's visible on a complex SPA modal | Click attempts miss, I'm blind | `cdp.findVisible` |
| Shadow DOM blocks `document.querySelectorAll('button')` | Material/Angular consoles show no buttons | Deep-walk in every helper traverses `el.shadowRoot` |

## Cross-refs

- [chrome-cdp-is-top-primitive-for-gui-gated-work-2026-05-18.md](chrome-cdp-is-top-primitive-for-gui-gated-work-2026-05-18.md) - parent pattern (the reflex)
- [corazon-is-a-peer-not-a-browser-via-http.md](corazon-is-a-peer-not-a-browser-via-http.md) - the laptop-agent substrate
- [drive-chrome-via-input-tools-not-browser-tools.md](drive-chrome-via-input-tools-not-browser-tools.md) - the older non-CDP path
- [eos-laptop-agent-module-cache-requires-restart-after-handler-swap.md](eos-laptop-agent-module-cache-requires-restart-after-handler-swap.md) - why `pm2 restart` is mandatory after editing tools/*.js
- [codify-at-the-moment-a-rule-is-stated-not-after.md](codify-at-the-moment-a-rule-is-stated-not-after.md) - the meta-rule this implements for CDP specifically

## Origin

Tate verbatim 2026-05-18 (after I'd just driven Chrome via CDP to create the marketing-cadence-monitor Routine end-to-end zero-touch): "ONce you're done with that i need you to codify and surfcae anything you learned, improve the code or anything to make your usage of the cdp faster and better adn easier for you. We need to make sure that these tips and tricks and recursive improvement for all cdp usage (chrome and others) is always happening so that we get blazing good at it."

Same-arc deliverable: 5 helpers added to `tools/cdp.js`, agent restarted, all 5 smoke-tested live, doctrine written, parent pattern cross-ref added.
