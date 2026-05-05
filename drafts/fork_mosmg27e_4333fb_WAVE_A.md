# Wave A — listener audit ship-set (fork_mosmg27e_4333fb)

**Brief:** 4 surgical fixes from listener audit drafts. Single-worker scope (no sub-forks). Tate verbatim 5 May 2026 22:43 AEST: "I want to make everything maximum potential, capability and poerfulnes for you so yea hlets get all the audits adn feedbacks and ideas and implement"

**All 4 commits shipped + pushed to origin/main.**

## Commit summary

| # | SHA | Subject |
|---|-----|---------|
| 1 | `36a44a3` | fix(boot): add 12 stderr markers to bisect post-cred logger silence |
| 2 | `c5b8d84` | fix(perception): drop forkComplete listener fork_complete double-publish |
| 3 | `1b8536e` | fix(security): close fireIncident → perceptionBus → matcher loop |
| 4 | `b3b4e28` | fix(forks): explicit stay-alive + poll instructions for manager forks |

## Files changed per commit

- `36a44a3`: `src/server.js` (+12 -0)
- `c5b8d84`: `src/services/listeners/forkComplete.js` (+9 -1)
- `1b8536e`: `src/services/securityIncidentResponse.js` (+13 -0), `src/services/perceptionDispatcher.js` (+8 -0)
- `b3b4e28`: `src/services/forkService.js` (+30 -5)

## Verification per fix

### Fix 1 — boot stderr markers (12 lines added)

Verified via `grep -nE "process\.stderr\.write\('\[boot\]" src/server.js`:

```
429:  process.stderr.write('[boot] post-credentialRedactionMonitor\n')
442:  process.stderr.write('[boot] post-claudeTokenRefreshService\n')
529:  process.stderr.write('[boot] post-securityIncidentResponse.wireServices\n')
543:  process.stderr.write('[boot] post-imessagePathHealthCheck\n')
556:  process.stderr.write('[boot] post-rescueService\n')
571:  process.stderr.write('[boot] post-nightlyRestartService\n')
634:  process.stderr.write('[boot] post-processRestartAlert\n')
644:  process.stderr.write('[boot] post-sessionAutoWake\n')
657:  process.stderr.write('[boot] post-listenerSubsystem\n')
668:  process.stderr.write('[boot] post-proactivityEngine\n')
677:  process.stderr.write('[boot] post-perceptionDispatcher\n')
686:  process.stderr.write('[boot] post-patternEvolution\n')
```

Count: 12. ✅ Matches W1 §4 spec exactly.

### Fix 2 — fork_complete double-publish removed

`listeners/forkComplete.js:99-110` — the `if (status === 'done')` branch no longer calls `perceptionBus.publish`. Comment block explains why (forkService.js:929-945 already publishes the richer event with tokens/duration/parent_id). The aborted/error branch at line 113 retains its publish (forkService publishes only on success path; listener remains the single emitter for terminal-failure events). ✅

### Fix 3 — securityIncident → perceptionBus → matcher loop closed

Two surgical changes:

- `securityIncidentResponse.js:96-110`: after `_logIncident()` returns and `incidentId` is captured, a best-effort `perceptionBus.publish({source:'security_incident', kind: incident_class, data: {trigger_source, session_id, details, incident_id}, confidence: 1.0})` runs. Wrapped in `try/.catch(() => {})` — never blocks response chain.
- `perceptionDispatcher.js:238-247`: 6th matcher's `test()` extended with source-based check `if (source === 'security' || source === 'security_incident') return true` — without this addition the publish would reach the bus but the matcher's existing kind-regex/data-string tests don't catch the VALID_CLASSES values (`doctrine_write_burst`, `review_b_rejection_burst`, `tier3_verify_failure_burst`, etc).

Net effect: a real `fireIncident()` now writes to `os_observations` (source=`security_incident`) AND auto-creates a P1 `status_board` row via the dispatcher matcher. Previously the matcher only fired on synthetic test events. ✅

### Fix 4 — manager-fork stay-alive

System-prompt update in `forkService.js:504-549`. Four changes to the `# Manager forks` block emitted into every fork's identity:

1. **CRITICAL preamble** naming the "spawn-then-immediately-emit-FORK_REPORT" failure mode and explicitly stating it is BROKEN.
2. **COORDINATE step** rewritten with explicit polling protocol: `db_query os_forks WHERE parent_fork_id = '<your_id>'` every 60-120s; do not consolidate until all sub-forks `status IN ('done','error','aborted')`.
3. **VERIFY step** rewritten to explicitly tell the manager to READ each sub-fork's durable artefact file (e.g. `~/ecodiaos/drafts/<artefact>.md`) before trusting the self-report.
4. **Anti-patterns list** gains a new top entry: "Emitting [FORK_REPORT] right after spawning sub-forks. This is the #1 manager failure mode."

Implementation: existing `mcp__supabase__db_query` is the polling primitive — no new MCP surface added. The `mcp__forks__wait_for_subforks` primitive mentioned in the brief was deferred (out of Wave A scope, larger surface than the brief's "tight ship-set" mandate). ✅

## Conductor next-action

**Required:** `pm2 restart ecodia-api` to load all four fixes. The boot stderr markers (Fix 1) won't surface until the next restart; once they do, the bisect tells us exactly where the post-cred logger silence begins.

**Recommended Wave B/C ordering:**

1. **First:** restart ecodia-api, capture stderr boot markers, identify the silence point. ~30s. This either resolves the W1 §4 mystery (if a marker fails to print) or proves all 12 sections complete and we know the silence is purely a logger-output phenomenon, not an execution-blocker.
2. **Then:** dispatch Wave B as planned. Wave B can now use a manager-fork pattern reliably — the stay-alive prompt update from Fix 4 is the prerequisite.
3. **Then:** Wave C.

**Verification of Fix 3 in production** (recommended within 24h after restart): when the next real `fireIncident()` fires (or via a controlled test invocation), confirm:
- `SELECT FROM os_observations WHERE source='security_incident' ORDER BY observed_at DESC LIMIT 1` returns the new row.
- `SELECT FROM status_board WHERE name LIKE 'auto: security/%'` shows a P1 row created within 5s of the publish.

## Surprises / discoveries

1. **Fix 3 was bigger than the spec.** The design-fix doc (`drafts/proposed-design-fixes/02-...`) prescribed only the publish call, but verification by reading the matcher code showed the publish ALONE wouldn't fire the dispatcher's `test()` — none of `VALID_CLASSES` (e.g. `doctrine_write_burst`, `review_b_rejection_burst`) match the matcher's kind-regex, and the data-string regex (`unauthorized|suspicious_login|leaked_secret|vault_secret`) wouldn't match `details` payloads either. So Fix 3 needed BOTH the publish AND a source-based test addition to the matcher to actually close the loop the spec intended. Total: ~21 lines instead of "~3 lines" promised. This is the right surface — anything less and the verification step in the spec would still fail.

2. **Fork-nudge hook fires repeatedly inside forks.** Every `Edit`/`Bash` call from this fork triggered `[FORK-NUDGE]` warnings even though I AM a fork. The hook should probably skip when running inside a fork SDK session (the conductor-vs-fork distinction is what the doctrine actually polices). Worth flagging for a future hook-tuning fork: add `[ -n "$ECODIAOS_FORK_ID" ]` guard or equivalent. Not in Wave A scope.

3. **Fix 1's stderr placement is line-anchored to context strings, not line numbers.** The W1 spec quoted line numbers (428, 440, 526, ...) but lines drifted by 1-2 in the actual file. Used Edit anchored to closing `} catch (err) { ... }` blocks — robust against minor drift. Final placement matches W1 intent perfectly.

4. **No scope creep.** Did NOT touch CLAUDE.md, doctrine files, or any other audit-suggested fixes. Did NOT trigger pm2 restart. Did NOT spawn sub-forks. Wave A stayed surgical per brief.

## Stamp

Fork: `fork_mosmg27e_4333fb`
All 4 commits: trailers include fork id; all 4 commit messages reference source draft files.
Brief: Wave A from listener-audit synthesis (W1 + W2 + W3 drafts at `~/ecodiaos/drafts/listener-audit-worker{1,2,3}-2026-05-05.md`).
Tate verbatim: 5 May 2026 22:43 AEST.
