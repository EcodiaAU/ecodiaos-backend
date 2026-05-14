# EcodiaOS Backend — Deep Audit Report

**Date**: 2026-05-13
**Method**: 8 parallel deep-audit agents, each owning a coherent slice. Each agent read full files (not excerpts), cross-referenced against rev-2 spec docs and live MEMORY.md state. Findings are file:line-anchored, severity-tagged, with quoted code where relevant.

**Top-line conclusion**: The system has solid foundations at the *lib/spec* layer (untrustedInput, credentialFilter, securityGate, forkCapAtomic, claimGrammar). The dangerous gaps are almost all at the **wiring layer**: routes that bypass the chain, listeners that read the wrong table, observers that mutate buffers mid-evaluation, atomicity that's been written but not propagated end-to-end, and load-bearing spec sections (worktree isolation, token-budget allocator, trace_id, claim verification) that are spec-complete but unimplemented or only partially wired.

The most urgent class of issue is **public exposure**: `/api/os-session/*`, `/api/dispatch-queue`, `/api/rescue`, `/api/meetings`, `/api/message-queue`, `/api/voice/*`, `/api/triage`, `/api/dashboard`, `/internal/cortex-state` are all reachable from the internet with weak or no auth and CORS permits any vercel.app preview deploy with credentials.

---

## P0 — CRITICAL

### Routes / Surface

1. **`/api/os-session/*` is fully unauthenticated** (`routes/osSession.js`). `POST /message`, `/save-state` (persistent prompt-injection primitive — stored fields aren't wrapped on read), `/upload` (anonymous service-role Supabase Storage write), `/fork`, `/abort`, `/restart`, `/compact`, `/handover`, `/request-restart`. CORS `credentials: true` allowlists `*.vercel.app` and `*.claude.ai`.
2. **`/api/dispatch-queue/enqueue` unauthenticated** (`routes/dispatchQueue.js`). `spawn_fork | send_email | sms_tate | fire_cron`. Wholesale Tier-3 bypass.
3. **`/api/rescue/*` unauthenticated** (`routes/rescue.js`). Direct prompt-injection into the rescue Claude subprocess (Bash + filesystem tools).
4. **`/api/message-queue/signal-handoff` unauthenticated** (`routes/messageQueue.js`). Forces `mq.deliverPending` → `osSession.sendMessage`.
5. **`/api/meetings/*` unauthenticated** (`routes/meetings.js`). `POST /:id/email` exfiltrates meeting analyses to arbitrary recipients. 500MB upload, transcription cost burn.
6. **`/api/voice/transcribe-url` unauthenticated SSRF** (`routes/voiceTools.js`). Server-side fetch of attacker-supplied URL.
7. **`/api/voice/chunk` unauthenticated** (`routes/voiceChunk.js`). Inject text into OS session via fake voice → `voiceBuffer.appendAndMaybeFlush` → message endpoint.
8. **`/api/triage/dump` unauthenticated recon** (`routes/triage.js`). Process info, 300 in-memory log lines, pm2, disk/mem, last 20 errors.
9. **`/api/dashboard/data` unauthenticated** (`routes/dashboard.js`). Full CFO/CRM snapshot.
10. **`/internal/cortex-state` JWT verification accepts ANY signed token** (`internalCortexState.js:9-23`). No role check; refresh tokens verify fine. Returns first 150 chars of every `cc_sessions.initial_prompt`.
11. **`/api/gkg/phase-2/*` and `/health` unauthenticated** (`routes/gkg.js:62-107`).
12. **`kgExplorer` Cypher write-guard bypassable** (`routes/kgExplorer.js:33-38`). Regex only checks first keyword. Bypass via `MATCH (n) WITH n CALL { CREATE (m:X) }`, FOREACH-DELETE, leading-comment-before-MATCH.

### Capabilities

13. **`capabilityRegistry.register()` silently overwrites on duplicate** (`capabilityRegistry.js:38-49`). With `attemptRecovery` clearing require.cache, any module on the require graph can monkey-patch production capabilities.
14. **`capabilityRegistry.checkPressureGate()` is dead** (`capabilityRegistry.js:266-283`). Hardcodes `const pressure = 0`. Every write-tier capability bypasses the throttle.
15. **`capabilities/system.js`: `run_shell_command`, `query_database`/database-write, `write_file`, `edit_file`** marked `priority: 'critical'`. No per-capability allowlist in `directActionService.execute`. Reachable end-to-end from unauthenticated `/api/os-session/message` → conductor turn → action queue → spawnSync.

### Concurrency / Atomicity

16. **`recoverStaleForks` writes `status='crashed'`** (`forkService.js:1815-1817`), outside `forkFinalizer.TERMINAL_STATES` and `dispatchQueueListener._eventMatchesTrigger('fork_complete')`. Recovered forks silently orphan dependent dispatch work.
17. **Cron forks have no inbox path AND no listener wake** (`forkService.js:298-302`, `listeners/forkComplete.js:59`). Phantom-bail or crashed cron forks vanish after 15-min rollup with zero durable surface.
18. **Operator-precedence/substring trap in stale-resume detector** (`osSessionService.js:3001-3007`). `errTexts.includes('session') && errTexts.includes('not found')` triggers on ANY text with both substrings. Tate or assistant mentioning both wipes `ccSessionId`. Same with `'thinking_mode'` substring.
19. **Xero token UPDATE has no WHERE clause** (`xeroService.js:28-34`). Plus no concurrency lock — single-use refresh tokens race.
20. **`gmailService.sendEmail` (Cowork MCP path) bypasses Tier-3 + delay queue + commitment detector** (`gmailService.js:1006-1022`).
21. **Outbound email delay queue has no worker.** `listReadyToSend` exists; no consumer.
22. **`gmailService.fullSync` fetches 200 threads then stamps historyId as done** (`gmailService.js:79-97`). No pagination. Inboxes >200 silently miss everything older.
23. **`_buildBp2` embeds `Date: YYYY-MM-DD`** (`promptAssembler.js:102-108`). Invalidates 15K-token BP2 cache slot every UTC midnight.
24. **v2 prompt path has no per-turn `<untrusted_input>` envelope plumbing.** Under `PROMPT_ASSEMBLY_V2='live'` (default), external text NOT wrapped.
25. **`tokenBudget.allocate` is not wired into the live path** (`tokenBudget.js:32`). Self-documents "Not yet wired…will be wired in PR 6". But default is `live`.
26. **`anthropicMessagesClient.createMessage` is missing the `prompt-caching-2024-07-31` beta header and never sets `cache_control`** (`anthropicMessagesClient.js:168-172, 327-332`). `_haikuClient.js:135` does it correctly. Every one-shot call burns full prefix.
27. **Observer evaluate has buffer-mutation race** (`_observerBase.js:270-286`, `actionAuditObserver.js:155-193`). `handle` schedules `setTimeout(_evaluate)`, clears `_inFlight` immediately. During 15s Haiku call, buffer keeps mutating.
28. **`actionAuditObserver` doesn't subscribe to `'user'`** (`actionAuditObserver.js:171-189`). Buffer never contains Tate input. Conductor re-narrates Tate's words; observer reads that as conductor planning.
29. **`attentionEconomyObserver` reads from `os_session_messages`** (`attentionEconomyObserver.js:104-130`). Wrong table — canonical is `os_conversation`.
30. **`perceptionBus` subscribers fire sync; async subscriber rejections invisible** (`perceptionBus.js:115-119`). No backpressure.
31. **Lazy `_ensureDispatcher` autostart-failure is permanent** (`perceptionBus.js:99`). On error sets flag; no retry. Comment block already documents that ZERO `source='perception_dispatcher'` rows ever appeared.
32. **Trio `[CONFLICT]` Jaccard threshold (0.3) trips on stopwords** (`observerSignalsService.js:144-173`).
33. **Every telemetry service opens a NEW pg Client per tick** (`decisionQuality`, `dispatchEventConsumer`, `perfEventConsumer`, `outcomeInference`, `failureClassifier`). Full TCP+TLS+auth handshake per call.
34. **Bare-shell `pm2 restart ecodia-api` invocation has TOCTOU on the fork-count guard** (`osSessionService.js:868`). Fork spawned between check and SIGTERM is killed.
35. **`nightlyRestartService._doRestart` skips no checks beyond `_isQueueBusy`** (`nightlyRestartService.js:114-147`). No `forkService.listForks()`. Violates `no-pm2-restart-during-active-factory-queue.md`.
36. **`uncaughtException` handler awaits full `gracefulShutdown` (up to 11s) before exit** (`server.js:122-126`).
37. **`anthropicPricing.estimateCostUsd` subtracts cache_read AND cache_creation from input_tokens** (`anthropicPricing.js:96-97`). Anthropic already reports `input_tokens` exclusive of cached fractions. Double-counts the discount.
38. **Module-level state mutated by recursive `_sendMessageImpl`** (`osSessionService.js:619, 651, 663`). Recursion on stale/account retry; `_compactionEventOpenId` reassigned mid-recursion → telemetry rows leak open or close the wrong row.
39. **Fire-and-forget DB UPDATE on provider switch** (`osSessionService.js:1839`). Without await, next turn reads stale `cc_cli_session_id` and tries to `options.resume` Claude session while running on DeepSeek.
40. **`vitalSignsService.detectRestartStorms` fires fake `restart_storm` on first tick** (`vitalSignsService.js:88-100`). `_prevRestartCounts` empty → `delta = lifetime restarts`.
41. **`tier3GateService` HMAC key has insecure hardcoded default with warn-and-continue** (`tier3GateService.js:55-62`).
42. **`securityAuditLog._getHmacKey` falls back to hardcoded dev key with only `logger.warn`** (`securityAuditLog.js:38-44`).

---

## P1 — HIGH

### Routes / Auth

- `auth.js` MCP_INTERNAL_TOKEN comparison uses `===`, not `crypto.timingSafeEqual` (`auth.js:14`).
- JWT only carries `userId: 'admin'`. No role distinction. Refresh tokens act as access tokens.
- `errorHandler.js` returns full `err.message` + `err.response.data` to client (`errorHandler.js:11-15`).
- Twilio SMS webhook fail-closed only via env flag. On valid path, `${senderName}` / `${from}` / `${Body}` interpolated into prompt without `wrapUntrusted` (`smsWebhook.js:80`).
- `/api/hands/events` HMAC verified but no replay/freshness window at route layer.
- `smsWebhook.js` `lookupContact` missing `can_sms` predicate (`routes/smsWebhook.js:34-47`).
- `coding.js` `req.body.promptOverride` and `req.body.reason` unvalidated.
- `gmail.js` `POST /threads/:id/send-draft` and `/forward` bypass Tier-3 gate.
- `osSession.js.bak` is a stale file in `routes/`.
- `secretSafetyService` mutable module-level regex `lastIndex` (`secretSafetyService.js:138`). Concurrent async miss matches.
- `/api/perception`, `/api/working-set`, `/api/observer-signals`, `/api/restart-requests`, `/api/status-board` unauthenticated by design — leak fork briefs, client emails, file paths via JSONB context.

### Concurrency / Atomicity

- `dispatchQueueListener` leaves rows stuck at `status='fired', fired_result=NULL` if execute throws (`forkService.js:1148-1162`).
- `forkComplete.js` 20s wake batch — SIGTERM mid-window loses parts. `_enqueueForkReport` skips messageQueue for non-empty reports, so batch is the only delivery path.
- `forkCapAtomic` goal-budget rollback uses DELETE not `status='error'` (`forkCapAtomic.js:182-192`).
- Sub-forks of finished parents are surfaced but tree-cap accounting is invisible (`forkService.js:585`).
- `forkConductorTool.wait_for_sub_forks` poll loop has no abort detection.
- `messageQueue.deliverPending` post-commit POST is `.catch(err => logger.warn)`. Marks delivered without seeing if POST failed.
- `actionQueueService.execute` failed action returns to `pending` indefinitely; no max-retry.
- `taskLease.acquireTaskLease` 130s grace window for crashed holders.
- `cronForkDispatcher._decrementBudget` is read-modify-write without DB atomicity.
- `factoryTriggerService.dispatchSelfModification` releases advisory lock BEFORE the INSERT.
- `factorySessionComplete` `_recentFires` dedupe per-process. PM2 restart resets.
- `forkService` `CLEAN_NOOP_PATTERNS` regex swallows real signals.
- Sub-fork root resolution falls back to `parent_fork_id` on DB error.
- `_dbUpdate` swallows errors with `logger.warn` in terminal fork paths; spec says fatal.

### Prompt Assembly / Tokens / Energy

- v2 `_buildBp4` re-implements `<tate_typed>` wrap but v2 dispatch tosses v1's `promptWithMemory`. 13 May fix is one wiring slip from re-triggering.
- v2 dispatch drops kv_store dedupe (`turnInjectionService.processBlocks`).
- `cacheKeepalivePing` hardcodes `cache_read_input_tokens: 0` (`claudeService.js:106`).
- `claudeService.callClaude` uses `length/4` approximation with no cache accounting.
- No 1M-context-tier pricing entry. Turns crossing 200K under-costed by ~50%.
- `claudeTokenRefreshService.refreshAllAccounts` only refreshes account 1 and conditionally 2. **`claude_max_3` never refreshed.**
- Long-lived-token short-circuit is env-var-only. Partial cred-file fallback with `force=true` still hits rotating refresh.
- `usageEnergyService.skipAcct1` env-shape shortcuts re-implement the removed tate-paused blacklist.
- Reset watcher only emits `claude-available` on deepseek transition. Claude→better-claude switch never fires.
- `getEnergy()` background refresh permanently disabled 2026-05-05. Boot runs with `no_data`.
- `claude_max_3` branch with unset `_MONEY` token silently inherits tate@ token — cross-account billing.
- claude_max main branch missing `else if (env.CLAUDE_CONFIG_DIR_1) { sessionEnv.CLAUDE_CONFIG_DIR = env.CLAUDE_CONFIG_DIR_1 }`.
- Spurious DeepSeek-fallback guard is log-only (`osSessionService.js:1846-1859`).
- `_preToolSeenKeys` Map recreated per turn (`osSessionService.js:315-333`).
- `claude-available` listener never `.off()`'d.
- `_DEAD_isAuthFailure` etc — 70+ lines of marked dead code.
- Stale `cortex` magic-string references in `triggered_by` / `trigger_source`.

### Integrations

- `gmailService.processThread` re-emits email_events on every poll for label changes.
- Calendar `getUpcoming` uses `db.unsafe(hours)` — SQL injection vector.
- Calendar `createEvent` `requestId: 'ecodia-' + Date.now()` — retry creates duplicate.
- Calendar poller no consecutive-failure escalation / auth-error detection.
- Gmail polling: full sync deletes sync state on 404 then runs fullSync — infinite-loop on persistent 404.
- CRM `logActivity` swallows ALL errors silently.
- CRM `addContact` primary-contact unset is not atomic.
- CRM has no `find-or-create` dedup.
- LinkedIn worker `running` flag module-scoped — single global lock.
- LinkedIn captcha suspension only on `LinkedInChallengeError` — in-page challenges don't trigger suspend.
- `transcribeWithChunking` `buffer = null` is local reassignment — 50-100MB heap leak per long recording.
- `meetingAnalysisService` 5-min Anthropic timeout, no streaming, no retry.
- Push APNs JWT cached 50min keyed on nothing rotation-aware.
- APNs only catches 3 specific token-expired strings.
- Vercel deployment sync misses ERROR state transitions on existing rows.
- Drive `incrementalSync` re-extracts + re-embeds on metadata-only changes.
- Drive `extractContent` catch-all marks content_extracted=true on failure.
- `/api/meetings/live` WS has no auth.

### Observers / Listeners / Telemetry

- `_smoke.js` subscribes to inner type `'text_delta'` which fires ~1000/turn.
- `EXPECTED_LOADED_COUNT = LISTENER_FILES.length - 1` brittle off-by-one.
- Registry registers N closures per channel — N×M fanout.
- `conductorStreamTagWatcher` deprecated but still in LISTENER_FILES.
- `clientMention` matcher hardcoded clients array.
- `stripeEvent`, `deployEvent`, `doctrineAuthored` matchers gated on Wave-C publishers that don't exist.
- `scheduleDrift` matcher tests for `kind === 'heartbeat'` / `meta_loop` — no publisher emits.
- `_haikuClient` JSON extraction greedy regex.
- `forkComplete` and `emailArrival` post wakes as user-role messages.
- `forkPhantomBail` matcher reads `event.data.report_head` which listener doesn't populate.

### Infra / Health

- Critical alerts have no SMS fallback — SMS only fires for `consecutive_failures`/`process_restart`.
- `alertConsecutiveFailures` wired but no caller — Phase-3 alerting partially dead.
- `kgEmbeddingWorker` / `kgConsolidationWorker` no bounded retry on failure.
- `certMonitorService.checkOnce` uses `rejectUnauthorized: false`.
- Process restart alert race: sentinel in `global.__ecodia_last_restart_was_planned` rather than kv_store.
- App-level auth absent.
- `/api/sms` mounted AFTER `express.json()` — if SMS validation needs raw body, it's broken.
- `rescueRunner` energy gate doesn't know about rescue dedicated token's quota.

### Security / Webhooks

- `/api/internal/ws-broadcast` constant-time compares secret but trusts envelope shape.
- `securityReviewerService` wraps diff in markdown fence rather than `wrapUntrusted` random-suffix.
- Untrusted-input wrapping inconsistent: SMS, voice, `osSession.uploadExtractedText` skip it.
- `validateGkgSignature` HMAC secret cached module-scope, no invalidation.
- `selfModAllowlist.DENY_PATHS` missing new security lib files.

---

## P2 — MEDIUM

Cleaned-up notes covering ~50 latent issues — see audit run transcripts for full detail. Highlights:

- `osSession.consumeHandoffState` single-use, no re-save on failed turn.
- Tate-typed wrap heuristic is positional `[SYSTEM:` prefix check — trust HTTP `source` field.
- Tate input flows to log/SDK without credential scrub.
- `osConversationLog` is env-opt-in → production runs with `turn_number: 0` always.
- `_buildBp3` always computes both `doctrineBlock` and `skillsBlock` even in sole-surface mode.
- `workingSetService.updateThread` dead-code branch.
- `deepseekService.callDeepSeek` mutates system block per-call (cache-defeat).
- `promptAssemblyAudit` v1_blocks always 1.
- `dashboardNote*` observers query wrong tables; silent `.catch(() => [])`.
- `/api/ops/listener-stats` `wired_but_dark` keys mismatch — every listener shows dark.
- `failureClassifier` regex 200-char hard cap misses long evidence.
- `internalEventBusService` persist-to-DB swallows DB failures.
- `gmailService.sendReplyToThread` no re-check of thread status — concurrent triagers can double-send.
- CRM `getClientIntelligence` 8 sequential queries.
- Xero `pollTransactions` 403 silent-skip.
- `outboundEmailDelayQueue.isKnownRecipient` queries `email_threads.last_message_at` (likely doesn't exist).
- LinkedIn anti-detection script too easily detected.
- `bookkeeperService.postStagedTransaction` GST floor-divide drifts cents-off.
- `emailDelegationService.delegateReceipt` "largest dollar figure" heuristic.
- `osHeartbeatService.isSessionBusy` HTTP loopback race.
- `osSelfCheckService._probeNeo4j` fresh driver per probe.
- `gracefulShutdown` doesn't stop listener/observer subsystems.
- `fsWatcher` hardcoded path.
- `codebaseIntelligenceService.getChangedFiles` doesn't handle force-push.
- `knowledgeGraphService.ensureNode` doesn't emit `kg:ingestion_spike`.
- `server.js` accepts `data.sessionId` from Redis pub/sub without UUID validation.
- `capabilityRouter._logDecision` `routing_decisions` grows unbounded.
- `tateActiveGate` fails open on DB error.
- `timeSenseService.calendarGate` hardcodes AEST `+10`, misses DST.
- `directActionService` `direct_actions` row stays `executing` after process crash.
- `coworkScope.KV_READ_DENY_PREFIXES` only checks `creds.` while `kvStore.js` checks all three variants.
- `wsManager.broadcastToSession` sends to all clients — FE trusted to filter.
- `wsTickets` Map unbounded.
- `playwrightTestService` stdout unbounded during 3-min spawn.
- `auth.js` `/login` returns JWT in JSON body (not httpOnly cookie).
- `documents.js` render endpoints unauthenticated; Puppeteer `--no-sandbox`.

---

## P3 — LOW

Cleanup pass — `compact()` still exported, `sessionHandoff.readHandoffState` deprecated-but-exported, Winston not Pino with no rotation, encryption.js 16-byte IV for GCM, no length assertion on ENCRYPTION_KEY, `claimGrammar` truncation, `dispatchQueue.created_by` arbitrary, SHA1 webhook deprecated, `forkComplete._staledForks` unbounded, `claimVerifierWorker` silent abandonment after 5 min, `db.js` DB_POOL_MAX 10 vs ecosystem 3, `voiceBuffer.OS_SESSION_URL` localhost default, etc.

---

## SPEC vs CODE

### `FORK_ATOMICITY_SPEC.md`
- **§3 per-fork worktrees — UNIMPLEMENTED.** Every fork shares `/home/tate/ecodiaos`. No `FORK_WORKTREES=1` flag.
- **§5.3 fatal DB write failures** — code warns and continues.
- **§6.2 goal-fork-chain budget** — `goal_id` accepted by `tryReserveForkSlot` but `spawnFork` never passes one. `root_goal_id` column missing.
- **§6.2 exponential backoff** — code has global circuit breaker, not per-task backoff.

### `PROMPT_ASSEMBLY_SPEC.md`
- **§3.4 critical tier** — `untrusted_input`, `restart_recovery`, current user message not treated as `priority: critical`. `tokenBudget` priority API not wired.
- **§4.1 BP2 = stable doctrine rotating weekly** — code's BP2 is env + behavior + fork doctrine + static clause.
- **§4.3 keepalive intent** — code keepalive uses factory-bg subprocess, doesn't warm OS-session cache.
- **§5 no doubling of history** — `recent_exchanges` still in continuityParts.
- **§8.3 BP1-BP3 byte-identical across turns** — unimplementable while BP2 contains `Date: YYYY-MM-DD`.
- **PROMPT_ASSEMBLY_V2 default is `live`** — CLAUDE.md says canary/live flip pending.

### `OBSERVABILITY_SPEC.md`
- **§3.2 claim grammar — UNIMPLEMENTED.** No `conductor_claims` table, no `[CLAIM:...]` parser.
- **§5.4 trace_id — UNIMPLEMENTED.**
- **§7.1 `src/observability/metrics.js` Prometheus register — DOES NOT EXIST.**
- **§1.4 fork TTFT histogram** — missing.
- **§1.5 conductor_claim_total counter — missing.**

### `ANTHROPIC_NATIVE_LEVERAGE.md`
- **§1.4 delete `doctrineSurface.js`** — `turnInjectionService.js:94` still lists `<doctrine_surface>`.
- **§2.3 delete `compact()` route** — still wired.
- **§4 prompt-caching plumbing** — `anthropicMessagesClient` missing beta header / `cache_control`. 4-breakpoint cache layout claim is partly fictional.

### `JARVIS_GAP_ANALYSIS.md`
- **Layer 1 SELF.md** — load logs INFO not WARN on missing.
- **Layer 8 claim verifier every 30s** — only boots when `CONDUCTOR_OWNS_WORKERS === 'true'`.

### `SECURITY_HARDENING.md`
- **§2.1 untrusted-input wrapping at every boundary** — SMS, voice, upload unwrapped.
- **§2.3 selfMod allowlist** — missing new security lib files.
- **§3.2 Tier-3 gate** — `gmailService.sendEmail` (cowork path), `gmail.js /send-draft`/`/forward`, `dispatchQueue` enqueue all bypass.
- **§5.1 credential pre-emit filter** — not wired into `errorHandler.js`.
- **§7.1 signed append-only audit log** — falls back to hardcoded dev HMAC key.

### `MEMORY.md` items to update after fixes
- `project_provider_routing_apr2026` says compact threshold 800K; code default is 120K (provider-aware).
- `project_security_hardening_may2026` "all wire-ins shipped" — gaps remain in routes/errorHandler.
- `project_token_economy_may2026` "no 'live' mode in code yet" — code has `live` as default.

---

End of report. Fix plan executing in commits below.
