# Fix 09 — Shadow mode for new matchers

**Origin:** fork_moslimsp_a72e73 listener audit, design Q2
**Leverage:** HIGH (cheap insurance, every new matcher)
**Depends on:** Fix 08 (matcher table) for full elegance, but workable standalone.

## Problem
A new matcher with bad regex creates spurious P1 status_board rows. A new `security_incident` matcher with leaky regex fires emergency_mode on benign events. Today: matchers go from "writing the code" directly to "live in production." No proving ground.

## Patch (standalone, hardcoded matchers — works without Fix 08)

In `perceptionDispatcher.js`:

```diff
 const MATCHERS = [
   {
     domain: 'finance',
+    shadow: process.env.PERCEPTION_SHADOW_FINANCE === '1',
     test(event) { ... },
     async dispatch(event) { ... }
   },
   ...
 ]
```

In `_onEvent`, gate dispatch:

```diff
       if (!matcher.test(event)) continue
       _bump(_stats.matcher_test_passes, matcher.domain)
       const dedupeKey = `${matcher.domain}:${event.source}:${event.kind}`
       if (!_shouldDispatch(dedupeKey)) {
         _bump(_stats.matcher_dedupes, matcher.domain)
         continue
       }
       _bump(_stats.matcher_fires, matcher.domain)
+      if (matcher.shadow) {
+        logger.info('perceptionDispatcher: SHADOW (would dispatch)', {
+          domain: matcher.domain, source: event.source, kind: event.kind,
+        })
+        _bump(_stats.matcher_shadow_fires || (_stats.matcher_shadow_fires = new Map()), matcher.domain)
+        continue
+      }
       matcher.dispatch(event).catch(err => { ... })
```

Add `_stats.matcher_shadow_fires` to module exports (Fix 04 surfaces it via /api/observability/listener-stats).

## Operating procedure
1. New matcher gets added with `shadow: process.env.PERCEPTION_SHADOW_<DOMAIN> === '1'`.
2. `.env`: `PERCEPTION_SHADOW_<DOMAIN>=1`. PM2 restart.
3. For 24h: `curl /api/observability/listener-stats | jq .matcher.shadow_fires.<DOMAIN>` shows what the matcher WOULD have done.
4. Inspect logs (`grep 'SHADOW' ecodia-api-out.log`) — confirm dispatch decisions match intent.
5. Flip `.env` to `PERCEPTION_SHADOW_<DOMAIN>=0`. PM2 restart. Live.

## Pairing with Fix 08 (matcher table)
With matcher table, `shadow_mode` is a BOOLEAN column. Flip via SQL — no PM2 restart, no env-var dance. New matcher rows DEFAULT to `shadow_mode = true`, requires explicit unflip.

## Verification
- Add a deliberately-broken matcher (regex matches everything: `kind: /.*/i`).
- Set shadow=true.
- Watch /api/observability/listener-stats: `matcher.shadow_fires.<broken_domain>` increments rapidly; `matcher.fires.<broken_domain>` stays 0; status_board has no `auto: <broken_domain>/...` rows.
- Confirms the gate works.
