# Fix 01 — Dedupe `fork_complete` double-publish

**Origin:** fork_moslimsp_a72e73 listener audit §3.1
**Leverage:** MEDIUM (1-line)
**Files:** `src/services/listeners/forkComplete.js`

## Problem
`forkService.spawnFork()` (line 925-946) publishes `source='fork:<id>', kind='fork_complete'` on success.
`forkComplete` listener (line 101) publishes `source='fork', kind='fork_complete'` on the SAME terminal transition (its own db:event observation).
Net: 2 rows in `os_observations` per fork done. perception_summary double-counts.

## Patch (forkComplete.js)

```diff
       if (status === 'done') {
         logger.info('forkComplete: terminal done (silent, no wake)', { forkId })
-        try { require('../perceptionBus').publish({ source: 'fork', kind: 'fork_complete', data: { fork_id: forkId, status: 'done' }, confidence: 1.0 }) } catch {}
+        // Note: forkService.spawnFork already publishes a richer fork_complete
+        // event with tokens/duration/parent_id at terminal-success. Do not
+        // re-publish here from the db:event observation path — it would
+        // duplicate every successful fork in os_observations and double-count
+        // in perception_summary. See drafts/listener-audit-worker3-2026-05-05.md §3.1.
         return
       }
```

The `aborted`/`error` publish is retained — forkService publishes only on success path, so listener is the single emitter for terminal-failure events (which the silent-ears doctrine still wants visible in perception, just not in chat).

## Verification
After patch:
```sql
SELECT source, kind, count(*) FROM os_observations
WHERE observed_at > NOW() - INTERVAL '1 hour'
  AND kind = 'fork_complete'
GROUP BY 1, 2;
```
Should show exactly one row with `source LIKE 'fork:%'` per terminal-done fork.
