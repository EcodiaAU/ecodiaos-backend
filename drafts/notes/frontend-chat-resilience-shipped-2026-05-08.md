# Frontend Chat Resilience — Shipped (2026-05-08)

Fork: `fork_mowlrdzt_79097c`
Status board origin: `148cddc5-57b3-4676-b075-98a7708c7698` (P2)
Spec: `~/ecodiaos/drafts/frontend-chat-resilience-spec-2026-05-08.md`

## Three commits, three layers

### 1. `d668ca5` — backend endpoint (`ecodiaos-backend`, ecodiaos repo)

```
feat(os-session): add GET /messages?since= for extended chat recovery
```

- New route: `GET /api/os-session/messages?since=<iso_ts>&limit=<int>`
- New service helper: `osSessionService.getMessagesSinceTimestamp(since, opts)`
- Reads from `cc_session_logs` (the durable transcript appended on every
  user message and finalised assistant text via `appendLog`).
- Defaults: 24h lookback, 200 message limit, 1000 cap.
- Auth: matches existing `/recover` and `/history` (no new auth, same admin
  CORS posture).
- Files: `src/routes/osSession.js`, `src/services/osSessionService.js`,
  `drafts/frontend-chat-resilience-spec-2026-05-08.md`.

### 2. `2cdee59f` — frontend consumer (`ecodiaos-frontend`)

```
feat(chat): stale-stream watchdog + extended-recovery for chat resilience
```

Three changes wired through `useWebSocket.ts` + `osSessionStore.ts` +
`api/osSession.ts`:

- **Stale-stream watchdog.** While `status='streaming'`, 5s tick checks
  the last-event clock and last-liveness clock. >30s no events AND >15s
  no liveness heartbeat = stale. Fires ring-buffer recover + extended
  recover. If both return zero, sets `status='error'` so the UI retry
  pill renders.
- **Error-status handler.** `os-session:status:error` now finalises any
  partial `streamText`/`streamTools`/`streamThinking` into a message
  before flipping status (otherwise the partial response was silently
  dropped). Carries the reason into `lastErrorReason` for the UI pill.
- **Extended-recovery via `/messages?since=`.** Wired in three places:
  - reconnect onopen after `recoverEventsSince` returns count=0,
  - reconnect onerror when ring fetch failed,
  - watchdog when stale stream detected.
- New API helper: `getMessagesSince(sinceIsoTs, limit)`.
- Store gains `lastErrorAt`, `lastErrorReason`, `recoveredMessageCount`
  plus `setError`, `clearError`, `injectRecoveredMessages` (with role +
  content + 2s-bucket dedup), `clearRecoveredCount` actions.

### 3. `e0fe45cc` — frontend UI (`ecodiaos-frontend`)

```
feat(chat): error retry pill + N-new-messages pill (chat resilience UI)
```

Two additive affordances in `CCStream.tsx` floating above the input row:

- **"Stream errored — tap to recover" coral pill** when status='error'
  or watchdog-forced. Tapping calls `getMessagesSince`, populates missed
  transcript, clears error.
- **"N new messages" green pill** after extended-recovery injects deduped
  messages. Tapping scrolls to first new message (via id `os-msg-{id}`
  added to UserMessage and AssistantMessage). Auto-dismisses 8s.
- `addUserMessage` clears error pill so a fresh send dismisses any stale
  affordance.

Both pills use existing visual patterns (lucide-react icons, framer-motion
AnimatePresence) — no new deps.

## Verification done before ship

- `node -c src/services/osSessionService.js` clean
- `node -c src/routes/osSession.js` clean
- `tsc --noEmit -p tsconfig.json` clean (frontend)
- All 3 commits on `main` of their respective repos

## Verification still needed (POST pm2-restart-and-deploy)

- `pm2 restart ecodia-api` — backend live with new `/messages?since=` route
- Curl probe `https://api.admin.ecodia.au/api/os-session/messages?since=2026-05-07T00:00:00Z` — verify 200 OK + JSON shape
- Vercel deploy `ecodiaos-frontend` — verify build completes, deploy ID returned
- Visual verify on deployed admin URL — induce error condition, screenshot
  pill rendering, confirm tap-to-recover unfreezes chat

## Status board action

Archive row `148cddc5-57b3-4676-b075-98a7708c7698` with status reflecting
all three commits + deploy verification.

## Out-of-scope risks (for follow-up forks if desired)

- Tool calls and thinking blocks aren't persisted to `cc_session_logs`. Extended
  recovery shows the conversational transcript but not the per-tool detail
  during the recovered window. Acceptable for the freeze unfreezing case.
  A separate larger ticket would persist every WS broadcast envelope to
  an `os_session_events` table.
- Push notifications on stream-error are out of scope. The phone could
  buzz when the conductor errors out and Tate is offline.
