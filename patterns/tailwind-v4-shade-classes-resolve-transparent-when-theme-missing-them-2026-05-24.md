---
triggers: tailwind-v4-shade-missing, bg-primary-800-invisible, button-invisible, white-on-white, primary-shade-scale, color-mix-shade-scale, invisible-cta, no-background-on-button, tailwind-theme-contract, design-tokens-missing-scale, theme-contract-violation, sign-in-button-missing, primary-50-100-200-300-400-500-600-700-800-900-950
---

# Tailwind v4 shade classes resolve to transparent when the @theme block does not define them

## The rule

Tailwind v4's `@theme { --color-X: ... }` block is the SINGLE source for which utility classes work. The rule is mechanical:

- `--color-primary` defined -> `bg-primary` / `text-primary` work.
- `--color-primary-800` NOT defined -> `bg-primary-800` resolves to `var(--color-primary-800)` which is undefined which renders as `rgba(0,0,0,0)` (transparent), NOT a fallback to `--color-primary` or any sane default.

There is NO automatic shade generation in Tailwind v4. A bare `--color-primary` token does NOT auto-expand into `--color-primary-{50..950}`. Every shade utility class your code uses must have a matching `--color-X-N` token in the @theme block.

Symptom: white text on white background, transparent button, missing CTA. Component looks gone. Click target may still work (the button is there in DOM with correct dimensions), but the user cannot see it.

## Detection (run before claiming a UI ships)

```js
// In a puppeteer / Playwright session
const probe = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('button')).map(b => {
    const cs = getComputedStyle(b)
    return { text: b.innerText, bg: cs.backgroundColor, color: cs.color, classes: b.className }
  })
})
// Any button with bg = "rgba(0, 0, 0, 0)" AND color = "rgb(255, 255, 255)" is invisible.
```

Grep audit:

```bash
grep -rh "primary-\(50\|100\|200\|300\|400\|500\|600\|700\|800\|900\|950\)" src --include="*.tsx" -o | sort -u
# Cross-check each result against @theme block in globals.css.
# Any shade in the grep but missing in @theme = broken class.
```

## The fix (one shot, cascades to every consumer)

Derive the shade scale from the base primary via `color-mix`. Tenant brand overrides (run-time `--color-primary` swap) keep cascading automatically.

```css
@theme {
  --color-primary: #3d8f99;
  /* ... */
  --color-primary-50:  color-mix(in srgb, var(--color-primary) 8%,  white);
  --color-primary-100: color-mix(in srgb, var(--color-primary) 15%, white);
  --color-primary-200: color-mix(in srgb, var(--color-primary) 28%, white);
  --color-primary-300: color-mix(in srgb, var(--color-primary) 45%, white);
  --color-primary-400: color-mix(in srgb, var(--color-primary) 70%, white);
  --color-primary-500: var(--color-primary);
  --color-primary-600: color-mix(in srgb, var(--color-primary) 88%, black);
  --color-primary-700: color-mix(in srgb, var(--color-primary) 74%, black);
  --color-primary-800: color-mix(in srgb, var(--color-primary) 60%, black);
  --color-primary-900: color-mix(in srgb, var(--color-primary) 42%, black);
  --color-primary-950: color-mix(in srgb, var(--color-primary) 28%, black);
}
```

Apply the same pattern to any other named-base color that components reference as shades (secondary, accent, neutral).

## Worked example (2026-05-24, chambers-frontend)

Chambers Sign In button rendered invisible. Form was Email + Password + Forgot password + nothing else visible. Users couldn't sign in. Tate flagged "looks horrific."

Puppeteer probe at https://chambers.ecodia.au/signin showed:
```json
{
  "text": "Sign in",
  "classes": "... bg-primary-800 text-white ...",
  "bgColor": "rgba(0, 0, 0, 0)",
  "color": "rgb(255, 255, 255)",
  "width": 624,
  "height": 48,
  "visible": true
}
```

Button was IN the DOM with full dimensions. Class list correct. Background was undefined-var transparent.

Cause: `globals.css` @theme block defined `--color-primary` + `--color-primary-strong` + 8 named tokens, but none of the `--color-primary-50..950` shades. The Button component (`src/components/button.tsx`) was migrated to use `bg-primary-800 hover:bg-primary-950 text-white` Tailwind utilities. All such filled-primary buttons across the app became invisible: Sign in, Save draft, Buy ticket, RSVP, Sign in to RSVP, Apply for membership, all officer dashboard CTAs.

Fix: added the 50..950 shade scale (commit `90c27db`). One file change. Cascades to every consumer. Verified post-deploy: button visible.

## Anti-patterns

- Trusting "I added the new Button component, it must work" without rendering one of its variants in a real browser.
- Assuming Tailwind v4 generates shades from a base color the way Tailwind v3 + plugins sometimes did. It does not.
- Patching individual call sites to use inline `style={{backgroundColor: 'var(--color-primary)'}}` when the root cause is one missing block of design tokens.
- Running typecheck + visual baseline against an unauthed shell only - `feedback_visually_verify_post_auth_not_just_unauth_shell.md` covers the post-auth case, but THIS pattern shows even the unauthed sign-in flow needs visual verification.

## Cross-refs

- `verify-deployed-state-against-narrated-state.md` (parent rule: tsc clean is not visual-clean)
- `feedback_visually_verify_post_auth_not_just_unauth_shell.md` (the post-auth sibling rule)
- `visual-verify-is-the-merge-gate-not-tate-review.md` (canonical: visual audit before any UI ships)
- `visual-first-tate-presentation.md` (sibling: present visually, audit visually)

## Origin

2026-05-24, chambers-frontend visual audit. Sibling-agent commits `a664620 feat(signin): migrate to ui primitives` and `0470323 feat(signup): migrate to ui primitives` rewrote the auth pages to use the new Button component. The Button component depends on Tailwind shade classes that the @theme block never defined. Typecheck passed. Vercel deploy showed READY. Site looked broken. Tate flagged it. Puppeteer probe diagnosed in 30 seconds. One-file fix cascaded.
