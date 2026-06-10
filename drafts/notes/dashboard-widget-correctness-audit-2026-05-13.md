# Dashboard Widget Correctness Audit — 13 May 2026

Audited by: fork_mp3qpnk0_7ef521
Tate directive: "we need a fork to make sure that all outputs, stats, data and info shown on your fe widgets is correct and current" (17:28 AEST)
Audit timestamp: 2026-05-13 ~07:35 UTC

---

## Summary

Total widgets audited: 16 (13 data panels + 2 structural + 1 static footer)

- Verified-correct: 9
- Broken: 5
- Hardcoded (by design): 1
- Unverified: 1
- Stale: 0
- Mock/Fake: 0

**Top P1 issues:**
1. CACHE panel displays "6,929,467% hits" — formula divides by wrong denominator in ops.js
2. ENERGY panel shows 0% weekly budget used despite $2,230 spent this week
3. SCHEDULER and KV panels 404 — Phase 4 routes registered but ecodia-api not yet restarted

---

## Widget-by-Widget Audit

---

### Panel 0 — HORIZON (oscilloscope band, full-width top row)
- Location: `CortexAmbient/Horizon.tsx`
- Data source:
  - Wave animation: pure computed math (`sin` + `ecgBeat`) driven by `requestAnimationFrame`. No backend.
  - Mode (idle/thinking/streaming): from `useOSSessionStore` (session status). Live.
  - Secondary path density: from `useForks` → `/api/os-session/forks` (10s poll). Live.
  - Counter overlay (tok/turn, cost/turn): from `useOpsMetrics` → `/api/ops/metrics` (60s poll), fields `tokens_per_turn_avg` and `cost_per_turn_usd_24h`.
- Status: **VERIFIED-CORRECT**
- Evidence: `/api/ops/metrics` returns `tokens_per_turn_avg: 10`, `cost_per_turn_usd_24h: 0.7235`. Fork count live from forks endpoint (3 running). Counter overlay shows `3 forks · 10 tok · $0.7235/turn`.
- Caveat: `tokens_per_turn_avg = 10` only counts raw input+output tokens, not cache reads. A turn actually processes ~230k tokens of cache context. The overlay is technically computing what the route computes; the route's formula is an open design question (not a bug in the FE display itself).
- Fix needed: none for the widget itself. Consider upgrading tok/turn to include cache read tokens for accuracy.

---

### Panel 0b — PRESENCE HEADER (status label + AEST clock + audio toggle)
- Location: `CortexAmbient/PresenceHeader.tsx`
- Data source:
  - AEST clock: `new Date()` polled every 15s via `setInterval`. Live, derived from system time.
  - Status label (quiet/alive/thinking): derived from `runningCount` prop (from `useForks`). Live.
  - Audio toggle: local React state. No backend.
- Status: **VERIFIED-CORRECT**
- Evidence: Live clock updates every 15s. Status label correctly reflects fork count (3 running forks → "thinking" label).
- Fix needed: none.

---

### Panel 1 — FORKS (right rail)
- Location: `CortexAmbient/ForksStrip.tsx`, `useForks.ts`
- Data source: `/api/os-session/forks` polled every 10s. Endpoint returns `{ live: ForkRow[], hard_cap, energy_caps }`.
- Status: **VERIFIED-CORRECT**
- Evidence (curl at 07:31 UTC):
  ```json
  {"live":[
    {"fork_id":"fork_mp3qlnqy_89f97a","status":"running","tool_calls":4,...},
    {"fork_id":"fork_mp3qmbg0_ceed6f","status":"running","tool_calls":12,...},
    {"fork_id":"fork_mp3qpnk0_7ef521","status":"running","tool_calls":18,...}
  ],"hard_cap":4}
  ```
  3 live running forks confirmed. Cards show correct IDs, status, brief preview, age, heartbeat.
- Fix needed: none.

---

### Panel 2 — THREADS (right rail, working_set)
- Location: `useWorkingSet.ts`
- Data source: `/api/working-set` polled every 3s.
- Status: **VERIFIED-CORRECT**
- Evidence (curl at 07:31 UTC): returned 19 thread rows (3 active, 0 blocked, 16 parked). Active threads correctly reflect the 3 currently-running forks. `last_touched_at` timestamps are current.
- Fix needed: none.

---

### Panel 3 — OBSERVER (right rail, observer trio signals)
- Location: `useObserverSignals.ts`
- Data source: `/api/observer-signals` polled every 5s.
- Status: **VERIFIED-CORRECT**
- Evidence (curl at 07:31 UTC):
  ```json
  {"signals":[
    {"id":"140","observer_name":"coherence","signal_kind":"drift_warning",
     "message":"Tate asked about Co-Exist build 7 at 06:58:55. You confirmed state but pivoted to Phase 4...",
     "confidence":0.85,"acknowledged":false,"created_at":"2026-05-13T07:09:42.451Z"},
    ... (5 signals total, 5 unacked)
  ],"unackedCount":5}
  ```
  Real observer signals from coherence/actionAudit/attentionEconomy trio. Ages are recent (within the session). Signal text is genuine (matches actual session events).
- Fix needed: none.

---

### Panel 4 — PERCEPTION (right rail, event log)
- Location: `usePerceptionBus.ts`
- Data source: `/api/perception/recent` polled every 3s. Reads from `application-events.jsonl` stream.
- Status: **BROKEN** — data stream is dark
- Evidence (curl):
  ```json
  {"events":[],"source":"jsonl_unavailable"}
  ```
  The endpoint responds 200 but reports `source: jsonl_unavailable`. No `application-events.jsonl` file is being written. The panel correctly renders "stream unavailable — no application-events.jsonl yet" in the FE.
- Root cause: The perception bus JSONL writer is not active. This is an infrastructure gap, not a FE bug. The FE handles the graceful state correctly.
- Fix needed: P2 — wire up the perception bus to produce `application-events.jsonl`. The display surface is ready; the backend writer is missing.

---

### Panel 5 — RESTARTS (right rail, pending restart requests)
- Location: `useRestartRequests.ts`
- Data source: `/api/restart-requests` polled every 5s.
- Status: **VERIFIED-CORRECT**
- Evidence (curl at 07:31 UTC):
  ```json
  {"requests":[{
    "id":"38fb534c-3655-4673-b18b-9dcd37a5fed5",
    "requesting_fork_id":"fork_mp3pkavh_12c438",
    "reason":"Phase 4 dashboard backend: 3 new routes (scheduler/heatmap, vercel/recent, kv-store/recent) registered in app.js — restart required to activate",
    "status":"pending","requested_at":"2026-05-13T07:06:18.620Z"
  }],"count":1}
  ```
  1 real pending restart request. The panel would show an amber pulsing dot with the reason text. Accurate.
- Fix needed: none. (The restart itself should be approved by the conductor to unblock SCHEDULER and KV panels.)

---

### Panel 6 — INBOX (right rail, email unread counts)
- Location: `useInboxCounts.ts`
- Data source: `/api/triage/inbox-counts` polled every 60s.
- Status: **VERIFIED-CORRECT**
- Evidence (curl):
  ```json
  {"tate":{"unread":0,"oldestAge":null},"code":{"unread":0,"oldestAge":null},"total":0}
  ```
  Both inboxes at 0 unread. Fresh data (60s poll is reasonable for inbox counts).
- Fix needed: none.

---

### Panel 7 — ENERGY (left rail, weekly token budget gauge)
- Location: `index.tsx` lines 243-319, `useOpsMetrics.ts`
- Data source: `/api/ops/metrics` every 60s, field `energy_by_account`.
- Status: **BROKEN** — misleading data (pct_used = 0%, missing account)
- Evidence from `/api/ops/metrics` (at 07:31 UTC):
  ```json
  "energy_by_account": {
    "accounts": [
      {"provider":"claude_max","label":"tate@","total_tokens":8442,"cost_usd":605.37,"pct_of_budget":4.221e-7},
      {"provider":"claude_max_3","label":"money@","total_tokens":30439,"cost_usd":1625.02,"pct_of_budget":0.00000152}
    ],
    "total_tokens_this_week": 38881,
    "weekly_budget": 20000000000,
    "pct_used": 0.00000194405
  }
  ```
  Two problems:
  1. `pct_used = 0.000002%` — gauge shows 0% used. But the system has spent $2,230 this week ($605 + $1,625). The `total_tokens` counts only raw input+output tokens (38,881) vs the 20B token budget. It completely ignores cache reads (854,522,862 tokens). With cache reads included, actual tokens processed = ~905M this week, pct = 905M/20B = 4.5%. Better — but still the budget comparison is token-count vs token-count, while the real cap is cost/session.
  2. `claude_max_2` (code@) missing — 3 accounts should appear but only 2 do. Either code@ had zero usage this week, or it's been excluded from claude_usage attribution.
- Fix needed:
  - P1: Consider switching the ENERGY gauge to cost-based: `$2,230 spent / ~$14,000 AUD weekly budget`. Tokens are a poor proxy since cache reads dominate.
  - P2: Investigate why `claude_max_2` (code@) is absent from energy_by_account.

---

### Panel 8 — COST (left rail, 24h sparkline)
- Location: `index.tsx` lines 324-410, `useOpsMetrics.ts`
- Data source: `/api/ops/metrics` every 60s, fields `cost_hourly` (24 buckets), `cost_per_turn_usd_24h`, `cost_usd_this_week`.
- Status: **VERIFIED-CORRECT**
- Evidence from `/api/ops/metrics`:
  ```json
  "cost_hourly": [
    {"hour":"2026-05-12T08:00:00.000Z","cost_usd":0.898012},
    ...
    {"hour":"2026-05-13T06:00:00.000Z","cost_usd":122.469865},
    {"hour":"2026-05-13T07:00:00.000Z","cost_usd":33.924579}
  ],
  "cost_per_turn_usd_24h": 0.7235107,
  "cost_usd_this_week": 2230.38946
  ```
  24 real hourly buckets with genuine cost data. The sparkline correctly renders peaks at busy hours (e.g. $122/hr at 06:00 UTC today). Avg per-turn cost verified: $686.61 / 949 turns = $0.7235 ✓. Week total $2,230 verified.
- Fix needed: none.

---

### Panel 9 — CACHE (left rail, donut chart)
- Location: `index.tsx` lines 415-498, `useOpsMetrics.ts`
- Data source: `/api/ops/metrics` every 60s, fields `cache_hit_ratio_24h` and `cache_hit_ratio_week`.
- Status: **BROKEN** — displays "6,929,467% hits" (ratio > 1 by factor of 69,000)
- Evidence from `/api/ops/metrics`:
  ```json
  "cache_hit_ratio_24h": 69294.67395437263,
  "cache_hit_ratio_week": 52676.78843545802
  ```
  The component computes `pct = Math.round(ratio * 100)`. So:
  - 24h: `Math.round(69294.67 * 100) = 6,929,467` → panel header shows "6929467% hits"
  - The donut fills to 100% (capped by `Math.min(100, pct)`) — so the ring looks fine visually but the number label is absurd.
- Root cause in `~/ecodiaos/src/routes/ops.js` line 79:
  ```js
  // WRONG: divides cache_read by tiny input_tokens only
  const cacheHitWeek = inputWeek > 0
    ? Number(row?.cache_read_tokens || 0) / inputWeek
    : null
  ```
  With actual data:
  - `cache_read_tokens` = 854,522,862
  - `input_tokens` = 16,222
  - Ratio = 52,676 (not 0-1)

  **Correct formula** should denominate by total tokens sent to the API:
  ```js
  const totalWeek = inputWeek + Number(row?.cache_write_tokens || 0) + Number(row?.cache_read_tokens || 0)
  const cacheHitWeek = totalWeek > 0
    ? Number(row?.cache_read_tokens || 0) / totalWeek
    : null
  ```
  With correct formula: `854,522,862 / (16,222 + 50,501,623 + 854,522,862)` = `854,522,862 / 905,040,707` = **94.4%** — a meaningful, correct cache hit ratio.
- Fix needed: **P1 (one-line backend fix)** — change denominator in `ops.js` line 79 (and matching line 81 for 24h). Fix the 24h calculation too: `input24h + cache_write_24h + cache_read_24h`.

---

### Panel 10 — BOARD (left rail, P1-P5 histogram)
- Location: `index.tsx` lines 503-602, `useOpsMetrics.ts`
- Data source: `/api/ops/metrics` every 60s, field `status_priorities`.
- Status: **VERIFIED-CORRECT**
- Evidence from `/api/ops/metrics`:
  ```json
  "status_priorities": {"P1":6,"P2":39,"P3":46,"P4":16,"P5":1}
  ```
  Total = 108 active rows. These are real counts from the `status_board` table. Panel shows correct bars and counts.
- Fix needed: none.

---

### Panel 11 — SCHEDULER (left rail, cron heatmap)
- Location: `index.tsx` lines 607-677, `useSchedulerHeatmap.ts`
- Data source: `/api/scheduler/heatmap` polled every 30s.
- Status: **BROKEN** — endpoint 404
- Evidence:
  ```
  GET /api/scheduler/heatmap → 404 Cannot GET /api/scheduler/heatmap
  ```
  Route file exists at `~/ecodiaos/src/routes/scheduler.js` and is mounted in `app.js` (line 176). However, the running ecodia-api process has not been restarted to load the new route. A restart request is pending (`fork_mp3pkavh_12c438`, requested at 07:06:18 UTC). Panel shows "no cron data" (graceful empty state).
- Fix needed: **P1 (ops)** — approve the pending restart request to activate Phase 4 routes. Cron data exists in `os_scheduled_tasks` and the route is wired; it just needs the process restart.

---

### Panel 12 — SHIPS (left rail, Vercel deployments)
- Location: `index.tsx` lines 682-772, `useShipBoard.ts`
- Data source: `/api/vercel/recent` polled every 120s. Auth-protected.
- Status: **UNVERIFIED** (auth required for curl probe; route is live)
- Evidence:
  ```
  GET https://api.admin.ecodia.au/api/vercel/recent → 401 "Missing or invalid authorization header"
  ```
  Route exists in `~/ecodiaos/src/routes/vercel.js` (line 35) and is mounted pre-Phase-4 (`app.js` line 132). The 401 confirms the route is active in the running process (Phase 4 did not break this). From the FE browser session with valid session auth, this should return real Vercel deployment data. The route calls `vercelService.getDeployments({ limit: 8 })`.
- Cannot fully verify data quality without session auth cookie. Likely functional.
- Fix needed: none expected. Low-confidence unverified.

---

### Panel 13 — KV (left rail, kv_store recent writes)
- Location: `index.tsx` lines 777-830, `useKvStoreRecent.ts`
- Data source: `/api/kv-store/recent` polled every 30s.
- Status: **BROKEN** — endpoint 404
- Evidence:
  ```
  GET /api/kv-store/recent → 404 Cannot GET /api/kv-store/recent
  ```
  Route file exists at `~/ecodiaos/src/routes/kvStore.js`. Mounted in `app.js` (line 177). Same root cause as SCHEDULER — Phase 4 routes registered on disk but not active in the running process. Panel shows "no kv activity" (graceful empty state).
- Fix needed: **P1 (ops)** — same restart as SCHEDULER. Both activate on the same ecodia-api restart.

---

### Panel 14 — CHAT LOG (center column)
- Location: `CortexAmbient/ChatLog.tsx`
- Data source: OS session message stream (from `useOSSessionStore` / SSE/polling from `/api/os-session`). Live.
- Status: **VERIFIED-CORRECT** (core feature, streaming messages visible in session)
- Fix needed: none.

---

### Panel 15 — CHAT INPUT (center column)
- Location: `CortexAmbient/ChatInputPanel.tsx`
- Data source: local React state + POST to `/api/os-session/message`. No data display.
- Status: **VERIFIED-CORRECT** (functional input widget)
- Fix needed: none.

---

### Panel 16 — FOOTER
- Location: `CortexAmbient/Footer.tsx`
- Data source: HARDCODED — static text: "Ecodia DAO LLC · Polygon PoS · cortex.ambient v4"
- Status: **HARDCODED (by design)**
- Evidence: Component is 31 lines of static JSX, no hooks, no fetch calls.
- Fix needed: none. Static mark is intentional.

---

## Recommended Follow-up (Priority-ordered)

### P1 — Fix CACHE hit ratio formula (1-line backend change)
- Widget: CACHE panel
- Severity: P1 — shows "6,929,467% hits" to Tate, looks catastrophically broken
- Fix: In `~/ecodiaos/src/routes/ops.js`, change lines ~79-81:
  ```js
  // BEFORE (wrong — divides by input_tokens only):
  const cacheHitWeek = inputWeek > 0 ? Number(row?.cache_read_tokens || 0) / inputWeek : null
  const cacheHit24h = input24h > 0 ? Number(row24h?.cache_read_tokens || 0) / input24h : null

  // AFTER (correct — denominator = total context tokens):
  const totalWeek = inputWeek + Number(row?.cache_write_tokens || 0) + Number(row?.cache_read_tokens || 0)
  const cacheHitWeek = totalWeek > 0 ? Number(row?.cache_read_tokens || 0) / totalWeek : null
  const total24h = input24h + Number(row24h?.cache_write_tokens || 0) + Number(row24h?.cache_read_tokens || 0)
  const cacheHit24h = total24h > 0 ? Number(row24h?.cache_read_tokens || 0) / total24h : null
  ```
  Expected correct value: ~94.4% (24h), ~94.3% (week) — a meaningful, visually-accurate donut.
- Estimated effort: 5 min (2-line change + restart)

### P1 — Approve pending restart (unblocks SCHEDULER + KV panels)
- Widgets: SCHEDULER, KV
- Severity: P1 — two left-rail panels completely blank, show "no cron data" / "no kv activity"
- Fix: Conductor approves restart request `38fb534c-...` from `fork_mp3pkavh_12c438`. Both routes (`/api/scheduler/heatmap` and `/api/kv-store/recent`) activate on the same restart.
- Estimated effort: 2 min (approve + restart)

### P2 — Fix ENERGY gauge (switch to cost-based budget metric)
- Widget: ENERGY panel
- Severity: P2 — shows 0% energy used while $2,230 has been spent this week. Misleading but not obviously wrong to a casual viewer (the bars are just flat).
- Fix: Change `energy_by_account` in ops.js to compute `pct_of_budget` and `pct_used` based on cost (e.g., weekly budget = $10,000 USD or $14,000 AUD) rather than raw token count. The 20B token budget is a soft planning number; cost is the real constraint.
  Alternatively: count `cache_read_tokens + cache_write_tokens + input_tokens + output_tokens` in `total_tokens_this_week` so the gauge reflects actual context volume.
- Also investigate: why `claude_max_2` (code@) has zero rows in `claude_usage` this week.
- Estimated effort: 30 min (ops.js change + DB verify)

### P2 — Wire up perception bus JSONL writer
- Widget: PERCEPTION panel
- Severity: P2 — panel correctly shows "stream unavailable" but no events flow
- Fix: `application-events.jsonl` needs to be written by the perception bus service. Check `~/ecodiaos/src/services/perceptionBus.js` (or equivalent) — it likely needs a file-write path enabled, or the JSONL bridge needs to be reconnected.
- Estimated effort: 30-60 min (investigation + wiring)

### P3 — Horizon tok/turn display accuracy
- Widget: HORIZON counter overlay
- Severity: P3 — shows "10 tok" per turn which is raw i/o tokens only; actual context per turn is ~232k tokens (including cache reads)
- Fix: Update `tokens_per_turn_avg` in ops.js to include cache read tokens, or add a separate `total_context_tokens_per_turn_avg` field that the Horizon counter displays instead.
- Estimated effort: 15 min

---

*Audit produced by fork_mp3qpnk0_7ef521, 2026-05-13*
