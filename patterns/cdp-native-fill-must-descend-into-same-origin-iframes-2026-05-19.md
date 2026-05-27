---
triggers: cdp-native-fill, cdp-iframe-fill, idmsa-apple, apple-signin-widget, iframe-form-fill, same-origin-iframe, recursive-improvement
---

# cdp.nativeFill must descend into same-origin iframes

## Rule

`cdp.nativeFill` (and any future fill helper) MUST walk the DOM tree including same-origin `<iframe>` `contentDocument` trees, not just the top-level document and shadow roots.

Cross-origin iframes throw `SecurityError` on `contentDocument` access; swallow the throw and skip those iframes silently.

## Why

Apple's `idmsa.apple.com/appleauth/auth/signin` widget renders the email + password fields inside a same-origin `<iframe>` injected into the top-level `idmsa.apple.com/IDMSWebAuth/signin.html` page. A flat `document.querySelectorAll('input,textarea')` from the top frame does not find `#account_name_text_field` or `#password_text_field`. Without iframe descent, `cdp.nativeFill({selector: '#password_text_field', value: 'x'})` returns `no input matched any strategy`.

Origin: 2026-05-19 CarPlay-entitlement submission flow. The headless Apple-Dev sign-in on the apple.com/contact/request/carplay/ page required filling the IDMSA iframe; the helper missed it and the fix had to be hand-rolled inline in `cdp.runJs`. Per [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]] the helper extension lands SAME-TURN.

## How to apply

- The `nativeFill` walker now descends into iframes (commit on `D:\.code\eos-laptop-agent\tools\cdp.js` line ~668). Restart the agent via `D:\.code\eos-laptop-agent\restart-detached.ps1` after any tools/*.js edit per `eos-laptop-agent-module-cache-requires-restart-after-handler-swap`.
- Same descent pattern should land on `cdp.findVisible`, `cdp.clickByTag`, `cdp.deepFindRect`, `cdp.realClick` next time any of them misses an iframe-scoped element. Don't pre-emptively patch - wait for the next failure, follow the same recursive-improvement triad (helper + doctrine + hook nudge if regression-likely).
- For cross-origin iframes (e.g. third-party embeds), the CDP-native path is to enumerate frames via `Page.getFrameTree` and dispatch `Runtime.evaluate` against each frame's execution context. Not implemented in the helper yet; add when first needed.

## Verification recipe

```js
// In Chrome devtools console on a page with a same-origin iframe form:
const ifr = document.querySelector('iframe')
// Confirm same-origin:
try { ifr.contentDocument; console.log('same-origin') } catch (e) { console.log('cross-origin') }
// Run cdp.nativeFill via curl against the agent, expect ok:true now.
```

## Pre-this-fix workaround (still works as fallback)

```js
const d = document.querySelector('iframe').contentDocument
const e = d.getElementById('password_text_field')
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
setter.call(e, 'value')
e.dispatchEvent(new Event('input', {bubbles: true}))
e.dispatchEvent(new Event('change', {bubbles: true}))
```

Use this in `cdp.runJs` when `cdp.nativeFill` reports `no input matched any strategy` AND the page has iframes that the helper hasn't yet been patched to traverse.

## Cross-refs

- [[cdp-helper-library-and-recursive-improvement-2026-05-18]] - parent helper library doctrine
- [[chrome-cdp-is-top-primitive-for-gui-gated-work-2026-05-18]] - why CDP is the substrate
- [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]] - the same-turn helper+doctrine+hook triad
- [[eos-laptop-agent-module-cache-requires-restart-after-handler-swap]] - restart after tools/*.js edit
