# Cowork V2 MCP — Full Endpoint Coverage Test

**Date:** 30 Apr 2026, 12:00-12:10 AEST (02:00-02:10 UTC)
**Author:** fork_moku5bge_23b7a5 (parent: conductor)
**Origin:** External — every call routed through Corazon laptop-agent (`100.114.219.69:7456`) via PowerShell `Invoke-WebRequest` against `https://api.admin.ecodia.au/api/mcp/cowork/<endpoint>`. NOT in-process curls from the conductor VPS.
**Bearer:** `creds.cowork_mcp_bearer.token` — 16 scopes registered on V2 ship 30 Apr 10:30 AEST.
**Helper:** `/tmp/cowork-v2-test/call.sh` (bash → laptop-agent shell.shell → PowerShell → V2 endpoint).

## Headline

**15 of 17 endpoints exercised. 15/15 returned 200. 0 broken.** Two endpoints (forks.spawn, os_session.message) intentionally deferred per brief — risk of recursive fork-from-fork or chat-loop with my own conductor.

The two findings worth knowing about (both API-shape subtleties, not bugs):
- `forks.list` defaults to `filter.parent='cowork'`. Today there are zero cowork-parented forks (V2 just landed), so naive `{"limit":5}` returns empty. Pass `filter.parent:'*'` for all parents or `filter.parent:'conductor'` for the existing 403-row history.
- `email_threads.read` filters live inside `filter.*` (not top-level), and `thread_id` matches against `gmail_thread_id` (Gmail's API id, e.g. `19d50dab7c6f579a`), NOT the internal `email_threads.id` UUID. The brief's example body `{thread_id:"any"}` is wrong — correct shape is `{filter:{thread_id:"<gmail_thread_id>"}}`.

**DARK→LIGHT FLIP #2 confirmed:** `cowork.session_started` returned 200 and wrote a durable row to `cowork_sessions` (session_id=`v2-coverage-test-1777514418`, initiated_by=`conductor-dispatched`, started_at=`2026-04-30T02:00:20.024Z`). Combined with the prior heartbeat flip (#1), the substrate now has TWO independent durable proofs of external-origin execution.

## Per-endpoint table

| # | Endpoint | Scope | Verdict | Status | Evidence |
|---|---|---|---|---|---|
| 1 | `cowork.session_started` | write.cowork.session_log | ✅ WORKING | 200 | session_id=v2-coverage-test-1777514418 written to cowork_sessions; audit_log row created |
| 2 | `status_board.query` | read.status_board | ✅ WORKING | 200 | 5 rows returned with full schema (entity_type, status, next_action, etc.) |
| 3 | `kv_store.get` | read.kv_store | ✅ WORKING | 200 | Returned `ceo.last_email_triage` value with `updated_at` |
| 4 | `kv_store.set` | write.kv_store.cowork_namespace | ✅ WORKING | 200 | `cowork.v2_coverage_test_marker` inserted; verified in DB |
| 5 | `neo4j.search` | read.neo4j | ✅ WORKING | 200 | 3 semantic-scored results returned |
| 6 | `graph_semantic_search` (V1 alias) | read.neo4j | ✅ WORKING | 200 | Identical result set to #5 + `_v1_alias:true` marker — alias parity proven |
| 7 | `patterns.semantic_search` | read.patterns | ✅ WORKING | 200 | Returned `conductor-takes-agency-on-recovery-not-tate.md` for query=`agency` |
| 8 | `forks.list` | read.forks | ⚠️ WORKING_AS_DESIGNED | 200 | Default `parent='cowork'` returns empty (no cowork forks exist yet); `parent:'*'` and `parent:'conductor'` correctly returned 3 rows. Source: `cowork.js:559` |
| 9 | `inbox.read` | read.cowork.inbox | ✅ WORKING | 200 | Empty `messages:[]` (no cowork→ecodiaos messages staged) — valid result |
| 10 | `neo4j.write_episode` | write.neo4j.episode | ✅ WORKING | 200 | node_id=3971 created; verified via direct Cypher query (label=Episode, name=`Cowork V2 endpoint coverage test 30 Apr 2026 fork_moku5bge`) |
| 11 | `neo4j.write_decision` | write.neo4j.decision | ✅ WORKING | 200 | node_id=3972 created; verified via Cypher (label=Decision, date=2026-04-30, supersedes_archived=false) |
| 12 | `status_board.upsert` | write.status_board.cowork_owned | ✅ WORKING | 200 | row 8ba599f9 inserted with source='cowork' (vs source='conductor' for in-process). Tried entity_type='task' since 'infrastructure' is in STATUS_BOARD_DENIED_UPDATE_TYPES |
| 13 | `cowork.heartbeat` | write.cowork.heartbeat | ✅ WORKING | 200 | Re-test for completeness. Returned `ack:true, conductor_inbox_count:0, suggested_action:null` |
| 14 | `forks.spawn` | write.forks.cowork_pool | 🟡 DEFERRED | n/a | Skipped per brief — recursive fork-from-fork risk |
| 15 | `os_session.message` | write.os_session.message | 🟡 DEFERRED | n/a | Skipped per brief — would loop into my own conductor and spam Tate's chat |
| 16 | `email_threads.read` | read.email_threads | ⚠️ WORKING_AS_DESIGNED | 200 | Body shape: `{filter:{thread_id:<gmail_thread_id>}, limit:N}` — NOT `{thread_id:...}` at top level. Filter matches `gmail_thread_id` not internal UUID. Verified: correct shape returns count=1 with the requested thread |
| 17 | `crm.get_intelligence` | read.crm | ✅ WORKING | 200 | Returned full intelligence block for Goodreach (3901afde-...): client, projects, contacts, recentActivity, recentEmails, openTasks, activeSessions, revenue, summary |

## Audit log evidence

`cowork_audit_log` rows from this fork's writes (read-only endpoints don't audit):

```
tool_name             | calls
----------------------+-------
cowork.heartbeat      |     1
cowork.session_started|     1
kv_store.set          |     1
neo4j.write_decision  |     1
neo4j.write_episode   |     1
status_board.upsert   |     1
```

6/6 expected audit rows present.

## Durable artefacts created

1. **cowork_sessions row** — `v2-coverage-test-1777514418` (proof of dark→light flip #2)
2. **kv_store** — `cowork.v2_coverage_test_marker` with fork_id + tested_at
3. **Neo4j Episode** — node_id 3971, name `Cowork V2 endpoint coverage test 30 Apr 2026 fork_moku5bge`
4. **Neo4j Decision** — node_id 3972, name `Cowork V2 endpoint coverage verified 30 Apr 2026`, date=2026-04-30
5. **status_board task** — id 8ba599f9, source='cowork' (first non-conductor row source in board history)

## API-shape gotchas worth codifying for V2 callers

These should land in the V2 caller-side documentation so future Cowork dispatches don't repeat my early failed call shapes:

1. **All filters are nested under `filter`.** `status_board.query`, `forks.list`, and `email_threads.read` all expect `{filter: {...}, limit: N}` — never the filter fields at top level.
2. **`forks.list` default `parent` is `'cowork'`.** Pass `filter.parent='*'` to get all parents, or `'conductor'` for the existing legacy fork history.
3. **`email_threads.read` `thread_id` = `gmail_thread_id`.** Use the 16-char Gmail API id, not the internal UUID.
4. **`status_board.upsert` denies `infrastructure` and `legal` entity_types.** Use `task`, `project`, `client`, `thread`, `opportunity`, `personal` for cowork-owned writes. STATUS_BOARD_DENIED_UPDATE_TYPES enforced at scope layer.
5. **`kv_store.set` requires `cowork.` prefix.** Per coworkScope.js KV_WRITE_NAMESPACES — only `cowork.*` keys are writable on this scope.
6. **`graph_semantic_search` is the V1-alias mirror of `neo4j.search`.** Both return the same shape; the V1 form adds a `_v1_alias:true` marker. Alias parity confirmed live.

## Deferred endpoints — what their tests should look like

When the substrate is exercised more aggressively in Wave 3, these two should be tested with care:

- **`forks.spawn`** needs an isolated test brief that the spawned fork can no-op cleanly (e.g. "[FORK_REPORT] coverage-test no-op fork_id=<your_id>; [NEXT_STEP] none"). Don't dispatch from a fork that itself was dispatched as a coverage test — the recursive fork-from-fork model isn't proven.
- **`os_session.message`** should be tested with a marker message that the conductor recognises as a coverage probe and immediately ignores. Currently the conductor doesn't have a probe-recognise filter, so this test would burn director-chat space.

## Time

- Start: 12:00 AEST (02:00 UTC)
- End: 12:10 AEST (02:10 UTC)
- Elapsed: ~10 min
- Time-budget: 25 min — finished with 15 min spare

## Conclusion

The V2 substrate is fully operational from external origin. All 15 testable endpoints pass. The two API-shape subtleties (forks.list default, email_threads.read filter shape) are characteristics of the design, not bugs. No code fixes required. The substrate is ready for Wave 3 (deeper conductor↔Cowork integration: helper-script subcommands that wrap V2 calls, Cowork-side dispatch of forks, agentic Cowork sessions that ingest audit_log to learn what worked).

[APPLIED] ~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md because each endpoint was exercised end-to-end with durable artefact verification, not narrated as "shipped" based on _health=200 alone
[APPLIED] ~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md because every audit_log row corresponds to a real API call with a real database side-effect
