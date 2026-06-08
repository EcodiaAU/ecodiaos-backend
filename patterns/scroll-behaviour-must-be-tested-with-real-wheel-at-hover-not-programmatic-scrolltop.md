---
triggers: scroll test, scroll freeze, cant scroll, overflow-y-auto, wheel event, scrolltop, window.scrollto, hover scroll, admin scroll, cdp scroll test, dispatchMouseEvent mouseWheel, scroll regression
status: active
---

# Scroll behaviour is tested with a real wheel AT a hover point, never with programmatic scrollTop

Origin: 2026-06-09, Co-Exist web admin. Tate reported "cant scroll when hovering
the page content, but I can scroll if hovering the sidebar or footer." I spent
several cycles chasing it with CDP and nearly "fixed" something that was already
fine, because every measurement instrument I reached for was the WRONG instrument
for a scroll bug. This is why it was hard, and how to do it in one shot next time.

## Why scroll testing fooled me (the four traps)

1. **The bug is hover-position-dependent.** A collapsed `overflow-y-auto`
   container intercepts the wheel over its own area but cannot scroll (no bounded
   height), while the document scrolls fine everywhere else. So "can you scroll?"
   has DIFFERENT answers depending on what the cursor is over. A single global
   check cannot capture it.
2. **Programmatic scroll does NOT reproduce a wheel-interception bug.**
   `el.scrollTop = 500` and `window.scrollTo(0, 500)` target an element directly
   and bypass the wheel -> hover-target -> nearest-scroll-container routing that
   the bug lives in. They "work" (or not) for reasons unrelated to the symptom.
   My `window.scrollTo` scrolled the document while real wheel-over-content was
   frozen - opposite conclusions from the same page.
3. **A synthetic `mouseWheel` with no prior `mouseMoved` and a blind
   `document.scrollingElement` read is inconclusive.** `Input.dispatchMouseEvent`
   `{type:'mouseWheel'}` needs the hover target set first (`mouseMoved` to the
   same x,y), and you must read the scrollTop of the element ACTUALLY under that
   point, not `document.scrollingElement` (which may not be the intended scroller).
4. **The CDP-driven tab diverged from the human's real browser** (different
   content height, cookie banner / splash shifting layout). When the instrument
   contradicts the human's direct observation, the instrument is suspect - not
   the human.

## How to test scroll in one shot

- **Trust the human's real-browser report as ground truth.** If Tate says it
  scrolls now, it scrolls - stop iterating. If he says it freezes over content,
  reproduce THAT exact gesture, do not invent a global check. (Inverse of
  [[stop-rationalising-when-symptom-persists-re-probe-reality]]: here the symptom
  was already gone and my probe was the liar.)
- **To reproduce a wheel freeze via CDP, do the real gesture:**
  1. `Input.dispatchMouseEvent {type:'mouseMoved', x, y}` over the target region.
  2. `Input.dispatchMouseEvent {type:'mouseWheel', x, y, deltaY:600}`.
  3. Read the scroll position of the nearest scroll container under that point:
     `let e=document.elementFromPoint(x,y); while(e){const o=getComputedStyle(e).overflowY; if((o==='auto'||o==='scroll') && e.scrollHeight>e.clientHeight) break; e=e.parentElement;}`
     then check `e.scrollTop` moved. Test BOTH a content point and a sidebar point.
- **Diagnose the freeze cause structurally:** an `overflow-y-auto`/`scroll`
  container whose `clientHeight` is 0 or unbounded is intercepting the wheel
  without a height to scroll. Either bound its height (the whole flex chain to
  `h-dvh`/`overflow-hidden`) so IT scrolls, or remove the overflow so the wheel
  bubbles to the real document scroller. Match the app's existing scroll model
  (mobile pin-and-inner-scroll vs desktop document-scroll) rather than guessing.
- **Cheapest of all: open it in the real browser and scroll.** A CDP probe is a
  model of scrolling; a trackpad over the content is scrolling. For a
  hover-dependent input bug, prefer the real input.

## Anti-patterns

- Concluding "frozen" / "fixed" from `scrollTop=` or `window.scrollTo` alone.
- Dispatching `mouseWheel` without `mouseMoved` first, or reading
  `document.scrollingElement` instead of the element under the cursor.
- Continuing to "fix" a scroll bug after the human has confirmed it works -
  re-deploying churn while the real browser is already healthy.

Cross-refs: [[verify-empirically-not-by-log-tail]],
[[tate-pushback-is-a-verification-probe-not-a-complaint]],
[[cdp-dedicated-tab-and-mac-chrome-driving-2026-06-08]].
