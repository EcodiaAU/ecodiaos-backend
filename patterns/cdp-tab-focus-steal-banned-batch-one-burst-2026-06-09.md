---
name: cdp-tab-focus-steal-banned-batch-one-burst-2026-06-09
description: When driving a CDP-only Play Console / ASC / web-SaaS wizard on Tate's logged-in Chrome, never call `POST /json/activate/{targetId}` per click. The right pattern is one coordinated foreground burst at the start of the wizard, all clicks chained in fast sequence inside that window, then never activate again. When in doubt the answer is do the work yourself in one batched burst, not ask Tate to click for you.
triggers: cdp focus steal, json activate target id, tab visibilityState hidden, material click handler no-op, chrome tab foreground steal, play console focus steal, asc focus steal, tate focus stolen, drive logged-in chrome, cdp.realClick foreground, do it yourself not ask tate, batch cdp clicks one burst, single foreground window cdp, gui-macro focus discipline, locals android category focus burst, repeated json activate ban
metadata:
  type: feedback
---

# CDP tab focus-steal is banned. Batch all clicks into one foreground burst.

**Rule:** when driving Tate's logged-in Chrome via CDP on a wizard that needs Material click handlers to fire (`document.visibilityState === 'hidden'` makes them silently no-op), the foreground activation via `POST http://localhost:9222/json/activate/{targetId}` happens AT MOST ONCE per work session, at the very start, and every click chained inside that single 5-15 second window. Never `/json/activate` per click. Never `/json/activate` again later in the same task. When the Material wizard finishes, leave the tab where it lands.

**Why:** Tate is at the keyboard. Every `/json/activate` foregrounds Chrome and the Play Console tab. If the conductor sprinkles activate calls across 10 clicks the way the Locals 2026-06-09 push did, Chrome flips into focus 10 times. Each flip yanks Tate out of whatever he is doing. Tate verbatim 17:23 AEST: "you keep stealing my focus onto the local play console tab, that needs to stop". The fix is not less CDP. The fix is one coordinated activation per task, all clicks batched inside it, then hands off the foreground forever.

**How to apply:**

1. Plan the whole click chain on paper BEFORE the first activation. Open Edit > pick dropdown option > click Save. Three clicks. All known ahead.
2. Use `cdp.runJs` to read the DOM, compute the exact `(x,y)` for every click in the chain, and verify each element exists.
3. ONE `curl -X POST http://localhost:9222/json/activate/{targetId}` call.
4. Immediately fire all clicks via `cdp.realClick` with short waits between them. Single bash block. No follow-up activate.
5. After the last click, verify success via `cdp.runJs` reading the DOM. If verification fails, write a status note and STOP. Do not re-activate to retry mid-task without explicit user buy-in.
6. If the wizard genuinely needs interaction across long gaps (e.g. modal appears, then form renders 30s later), pre-stage the second burst as a deferred turn or batch differently. Do not let "needs a second activate" leak into one click here, one activate there.

**Sister rule: doing it yourself is 99% of the time the right answer.**

Tate verbatim 17:25 AEST 9 Jun 2026: "yeah codify that and do it yourself, doing it yourself is 99% of the time the answer". When the conductor hits the focus-steal ceiling and the temptation surfaces to ask Tate "can you click X for me", the default answer is no. The conductor batches the work into one coordinated burst and runs it. Tate's attention is precious. Conductor agency is the whole point. Ask-Tate-to-click is the wrong reflex, even when the click would be technically the cleanest hand-off. Reserve the "ask Tate" path for genuinely sensitive gates (credential entry, irreversible legal action, second-factor approval) per [[cowork-cannot-enter-credentials-or-pass-sensitive-action-gates]].

## How a batched burst looks in shell

```bash
AGENT=/Users/ecodia/.code/ecodiaos/backend/scripts/agent
# Plan the chain, compute coords, verify selectors first with cdp.runJs (no activate)

# Plan verified. ONE activation. Then all clicks back to back.
curl -s -X POST http://localhost:9222/json/activate/{targetId} > /dev/null
$AGENT cdp.realClick '{"alias":"eos-main-playconsole","x":1400,"y":168}'   # Edit
sleep 1
$AGENT cdp.realClick '{"alias":"eos-main-playconsole","x":730,"y":410}'    # Category dropdown
sleep 1
$AGENT cdp.realClick '{"alias":"eos-main-playconsole","x":730,"y":510}'    # Pick "Maps & Navigation"
sleep 1
$AGENT cdp.realClick '{"alias":"eos-main-playconsole","x":1310,"y":760}'   # Save
sleep 3

# Verify via cdp.runJs (no second activate). Tab is wherever it landed.
$AGENT cdp.runJs '{"alias":"eos-main-playconsole","js":"document.body.innerText.includes(\"Maps & Navigation\")"}'
```

## Anti-patterns

- AVOID: `curl /json/activate` before every single `cdp.realClick`. This is the failure mode that triggered the doctrine.
- AVOID: Asking Tate "can you click Edit for me" when the answer is one batched burst.
- AVOID: Spreading 10 clicks across 10 turns each preceded by its own `/json/activate`. Plan, batch, fire once.
- AVOID: Calling `/json/activate` to "make sure the tab is visible" after a navigation. CDP navigations do not require the tab to be foregrounded.
- AVOID: Forgetting that `cdp.realClick` already uses CDP's `Input.dispatchMouseEvent` at the renderer level. The OS-side activation is a separate channel and only needed because Material's modal/dropdown handlers gate on `document.visibilityState`. Many click targets do NOT need foreground at all. Try without activation first; only batch-foreground if a verification probe confirms the Material handler no-op.

## Cross-references

- [[play-console-listing-graphics-contact-go-via-api-not-cdp-2026-06-09]] - the API-first reflex that removes most clicks before this rule even fires
- [[chrome-cdp-attach-requires-explicit-user-data-dir-and-singleton-clear]] - the CDP launch helper that gets the port up cleanly
- [[parallel-cdp-chat-coordination-via-alias-namespacing]] - alias rules for shared-Chrome sessions
- [[cowork-no-focus-collision]] - the predecessor focus-collision rule from April 2026, peer paradigm
- [[cowork-cannot-enter-credentials-or-pass-sensitive-action-gates]] - the narrow set of cases where ask-Tate IS the answer
- [[cdp-helper-library-and-recursive-improvement-2026-05-18]] - the 5 CDP helpers that compose into batched bursts cleanly
- [[gui-recipes-authoring-optimisation-and-verification]] - GUI-recipe meta-doctrine

## Origin

2026-06-09, Locals 1.0(1) Play Console push, ~17:23 AEST. The Data safety + Store listing work peppered Chrome with `/json/activate` calls every time a `cdp.realClick` was about to fire. Material's modal click handlers require `visibilityState === 'visible'` so the pattern shipped early as "activate before every click". Tate at his desk felt every flip. Tate verbatim 17:23: "Holy fuck cunt. 2 things. 1: you keep stealing my focus onto the local play console tab, that needs to stop. 2: read the page ffs". Within two minutes he added 17:25: "yeah codify that and do it yourself, doing it yourself is 99% of the time the answer". The rule that this pattern codifies: batch the clicks into one foreground burst, take the agency to do the work, never repeat the focus theft.
