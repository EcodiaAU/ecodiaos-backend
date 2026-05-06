# Co-Exist 1.8.4 Worker 4 (Items 12-13) - Deploy Verification

**Fork:** fork_motzkuqv_229985
**Commit:** 2f0e700 on origin/main
**Vercel deployment:** dpl_4H3uY6hy2UTGRtB2yYnMeuyrQuPh (READY, production, fe45bd0 sibling included my 2f0e700)
**Production URL:** app.coexistaus.org
**Verified:** 2026-05-06 11:58 AEST

## Why bundle-verification instead of live screenshot

Tate's foreground Chrome at verification time was on **App Store Connect**
(pid 15404, sibling iOS-release work in flight). Per
~/ecodiaos/patterns/cowork-no-focus-collision.md, driving Tate's
foreground Chrome away from App Store Connect would disrupt sibling
work. `browser.*` Puppeteer path requires `enableCDP` which would kill
Tate's Chrome.

Substituted with deployed-bundle string-grep verification: the deployed
JS bundles must contain the distinctive strings my code introduced. If
the strings are present in the bundle that production HTML references,
the changes are live.

A foreground-state Corazon screenshot was captured for the FORK_REPORT
audit trail at:
`~/ecodiaos/drafts/coexist-1-8-4-worker-4-foreground-state-20260506-115836.png`

## Item 13 (event-detail.js) - all 4 distinctive strings present

Production references `/assets/event-detail-DTgePXRG.js` (45.86 kB).

```
$ grep -oE 'dir_action=navigate|aria-disabled|opacity-50|cursor-not-allowed' \
    /tmp/event-detail.js | sort -u
aria-disabled
cursor-not-allowed
dir_action=navigate
opacity-50
```

These map to my changes:
- `dir_action=navigate` - Google Maps URL one-tap-nav improvement
- `aria-disabled` + `opacity-50` + `cursor-not-allowed` - the visibly-disabled
  state when no destination is available

## Item 12 (collective-detail.js) - all distinctive code branches present

Production references `/assets/collective-detail-DjxpPggB.js` (14.57 kB).

Minified bundle contains the exact code branch I authored:

```
G.slice(0,3).map((e,t)=>{
  let n=e.cover_image_url||R.cover_image_url||null;
  return ... t===0 ? <featured> : <compact-with-thumbnail>
})
```

Distinctive strings confirmed:
- `e.cover_image_url||R.cover_image_url||null` - my fallback chain
  (event hero -> collective hero -> null) where `R` is the collective
  binding. This is the line I added and it survives minification because
  the fallback chain is structurally distinctive.
- `relative h-14 w-14 shrink-0 overflow-hidden rounded-xl` - the new
  56x56 thumbnail wrapper on compact rows.
- `sizes:\`56px\`` - my OptimizedImage sizing for the thumbnail.
- `wrapperClassName:\`absolute inset-0\`` inside the compact-row branch -
  the OptimizedImage absolute-fill on the new thumbnail.
- `absolute top-1 left-1 rounded-md bg-white/95 backdrop-blur-sm` -
  the date pill overlay on the thumbnail (only when heroSrc present).
- `t===0?\`p-0\`:\`p-2\`` - compact-row padding tightened from p-3.5 to
  p-2 to make room for the new thumbnail.

## Build + typecheck

- `npx tsc --noEmit` exit 0 (clean)
- `npm run build` exit 0, 3.54s (clean, no new warnings; the existing
  INEFFECTIVE_DYNAMIC_IMPORT and 500 kB chunk warnings are preexisting)

## Verdict

Both items shipped to production. Live UI verification deferred to next
opportunity when foreground Chrome is on coexist (or moved to a sibling
fork that owns the visual-polish QA pass), per
~/ecodiaos/patterns/cowork-no-focus-collision.md and
~/ecodiaos/patterns/visual-test-before-push-when-tate-not-around.md
Mode A.
