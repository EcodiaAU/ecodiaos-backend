# EcodiaOS Frontend Dashboard Upgrade - v1 Spec

**Status:** awaiting Tate green-light before build dispatch  
**Authored:** 2026-05-13 by fork_mp3lt8oa_0672e0  
**Route target:** `/cortex-ambient` (the index route - no new route)  
**Build mode:** spec + mockup only. Zero code written.

---

## §1 Goal, Non-Goals + Tate Verbatim

**Goal:** Transform the EcodiaOS frontend from a single-stream chat interface with a decorative oscilloscope into a living multi-panel dashboard that makes conductor state visible, legible, and genuinely compelling - without ever sacrificing the chat as the primary surface.

**Tate verbatim (15:12 AEST 13 May 2026):**
> "also I think your frontend should have so many more things moving and showing stuff visually. Right now you have the wobbly line at the top showing a binary active/inactive thing but that can be upgraded + I want the Rest of the screen to be full of different things showing different aspects of you so it looks like a sick dashboard"

**Tate verbatim (15:13 AEST 13 May 2026):**
> "also can we make the forks and status board stuff all collapsable and in nested scroll things so I don't scroll away from the chat, they can be on the sides too"

**Non-goals (explicit):**
- No separate `/dashboard` route. Everything lives at `/cortex-ambient` which is already the index route.
- No new 3D scenes, no WebGL, no Canvas elements beyond the existing Horizon SVG rAF loop.
- No fake or synthetic data. Every panel feeds from a real backend endpoint or DB query.
- No new animation libraries. CSS transitions + the existing rAF loop only.
- Nothing ships from this spec. Build dispatched only after Tate green-lights.

---

## §2 Prior Doctrine - Cortex-Ambient Round 3 + Perf Budget

### Round 3 direction (Neo4j Decision id 1007, 8 May 2026)

Tate's reaction to the round 2 ship: *"Yooooooo. I jsut looked at the updated visuals.... so fucking sick. It is however heavy on performance and looks tacky with low poly things"*

Five directives extracted and still in force:

**D1 RESTRAINT** - Performance heavy + low-poly tacky. Reduce orb count. No visual stuffing. Restraint is the luxury signal.

**D2 KILL ChatBeam 3D cards** - Random messages above central orb are noise, illegible, non-interactive. Already done in round 3. The 2D ChatLog is canonical.

**D3 Neural-node-edge sphere** - Bent curved edges entering/leaving a central core, reading as neurons/synapses. Electrical-pulse traversal on activity events. This vision is still correct. The Horizon upgrade in this spec approximates D3's visual language without WebGL: multi-mode color encoding + event pips + a secondary fork-density path. The full 3D neural core remains possible in a future phase behind a feature flag.

**D4 Navigation surface** - Tabs/windows, IDE-style document viewer. The collapsible side rails ARE the navigation surface this spec delivers.

**D5 QUALITY BAR** - Insane, not tacky. Restraint is luxury. Substance over gimmick.

### What the round 2 perf failure looked like

Round 2 used react-three-fiber with a torus knot lattice, 3D ChatBeam billboard messages, conductor halo rings, postprocessing filters (Bloom, ChromaticAberration, Vignette), and 50+ animated mesh objects. Tate flagged it heavy.

Round 3 killed all r3f - no Canvas, no three.js. The only continuous-motion element is the Horizon SVG rAF loop, which benchmarks at <1ms/frame on iPhone 12 (per the Horizon.tsx implementation comments).

This spec's dashboard panels MUST NOT reintroduce that regression. Zero WebGL. Zero Canvas elements outside the Horizon. CSS keyframe animations only, targeting GPU-composited properties (opacity, transform). The Horizon stays as-is.

---

## §3 Data Sources Catalogue

### Live (1-3s polling) - right rail panels

| Panel | Source | Endpoint / Table | Latency target |
|-------|--------|-----------------|----------------|
| Forks | `os_forks` table | `GET /api/forks` (exists via `useForks` hook) | 2s |
| Working Set | `working_set` table | `GET /api/working-set` (new, thin wrapper) | 3s |
| Observer Signals | `observer_signals` table | `GET /api/observer-signals` (new) | 5s |
| Perception Bus | `application_events.jsonl` / perception_events | `GET /api/perception/recent` (new) | 3s |
| Pending Restarts | `pending_restart_requests` | `GET /api/restart-requests` (new) | 5s |
| Inbox | `email_threads` table | `GET /api/triage/inbox-counts` (new, thin query) | 60s |

### Slow (30-120s polling) - left rail panels

| Panel | Source | Endpoint | Latency target |
|-------|--------|---------|----------------|
| Energy Budget | `claude_usage` weekly | `/api/ops/metrics` (exists) | 60s |
| Cost Per Turn | `claude_usage` 24h hourly | `/api/ops/metrics` + hourly extension | 60s |
| Cache Hit Ratio | `claude_usage` cache columns | `/api/ops/metrics` (exists) | 60s |
| Status Board Strip | `status_board` count by priority | Single aggregate query, add to ops/metrics | 60s |
| Scheduler Heat Map | `os_scheduled_tasks` + run log | `GET /api/scheduler/heatmap` (new) | 30s |
| Ship Board | Vercel deployments | `GET /api/vercel/recent` (check if exists) | 120s |
| kv_store Writes | `kv_store` table | `SELECT key, updated_at FROM kv_store ORDER BY updated_at DESC LIMIT 10` | 30s |

### Horizon overlay (30s poll, 1 DB query)

Right edge of the Horizon band: fork count, last-turn token count, cost/turn. All derivable from `/api/ops/metrics` last-turn row.

### Endpoint strategy

Most left-rail data already exists in `/api/ops/metrics`. The build fork for Phase 3 should extend that endpoint rather than creating new routes. Right-rail live data needs 5 new thin endpoints (each is 1-5 DB queries, no complex logic).

A `GET /api/dashboard/quick` aggregated endpoint (single round-trip returning all live panel data) is the Phase 2 optimization if polling proves noisy - defer until measured.

---

## §4 Panel-by-Panel Specs

### Panel 0: Upgraded Horizon (full width, always visible)

**Current state:** Single SVG path, 3 modes (idle/thinking/streaming), amplitude + frequency encoding. Binary: "something is happening" vs "nothing is happening".

**Upgrade - multi-dimensional encoding:**

1. **Color by mode** (stroke paint, interpolated via `pathRef.current.setAttribute('stroke', color)`):
   - idle: `#ffb27a` (ember, dim)
   - thinking: `#ff9a4a` (brighter ember)
   - streaming: `#ff6a10` (hot amber-orange)
   - event pip flash: `rgba(255,255,255,0.9)` for 300ms then returns

2. **Secondary path** (fork density): A second SVG `<path>` overlaid 14px below baseline, opacity 0.22, low amplitude (4px max). Flat at 0 forks. Gently oscillates when 1-2 forks. Higher amplitude when 3+ forks. Gives peripheral sense of fork pressure without reading numbers. Shares the same rAF loop, negligible cost.

3. **Event pips** (already architecturally planned in Horizon.tsx line 21-22): Fork spawn → spike to +H/2, returns over 400ms ease-out. Fork complete → spike to -H/2, returns 400ms. Fork error → double-spike. Uses a pip queue drainable by parent via a ref handle.

4. **Right-side counter overlay** (new `<div>` absolutely positioned in the Horizon band, right edge):
   ```
   3 forks  ·  847 tok  ·  $0.04/turn
   ```
   Monospace, 10px, `rgba(255,255,255,0.40)`. Disappears when all zero. Updated every 30s from `/api/ops/metrics`. Zero JS animation - just a React state update.

**Data sources:** `useOSSessionStore` (streaming status), `useForks` (count), `/api/ops/metrics` last-turn (30s poll).
**Performance:** Same rAF loop + 1 additional path element. Color changes via attribute mutation (no style recalc). Estimated <1.2ms/frame total.

---

### Panel 1: Forks (right rail, live)

**What it shows:** Active + recently-completed forks with parent-child tree indentation.

**Expanded view:**
```
fork_mp3lt8oa  Author spec doc...          14m  [running] 47 tools
  fork_mp3abc  Sub-task: read FE code       3m  [done]    12 tools
fork_mp3xyz12  Meta-loop orientation        1h  [done]     8 tools
```

One compact row per fork:
- ID prefix (12 chars monospace)
- Brief head (truncated to 36 chars, ellipsis)
- Age ("4m", "1h", "2h")
- Status dot: amber = running, green = done, red = error
- Tool count badge (dim)
- Sub-forks indented 12px with a faint left border line

**Collapse state header:** `FORKS · 3` with a row of 3 colored dots (mirroring fork statuses). Live pulse dot.

**Panel dimensions:** max-height 240px, nested scroll. Default: expanded.

**New-item behavior:** When a new fork appears, the row flashes `background: rgba(255,178,122,0.08)` for 600ms via CSS class. No framer-motion.

**Data source:** `useForks()` hook (already exists and polls `/api/forks`).
**Refresh:** 2s.

---

### Panel 2: Working Set (right rail, live)

**What it shows:** The 5 `working_set` rows - what the conductor is actively attending to.

**Expanded view:**
```
Author dashboard spec            active    4m
Email triage - code@ inbox       blocked   12m   (triage backlog)
Resonaverde rebuild workers      parked    28m
```

Fields per row: topic (truncated 32 chars) · status badge (color-coded) · age · optional blocking_on note in dim text.

Status colors:
- `active`: amber dot
- `blocked`: indigo dot
- `parked`: dim dot

**Collapse state header:** `THREADS · 3 active` with a tiny proportion bar (active/blocked/parked proportions as colored segments). Live pulse dot.

**Panel dimensions:** max-height 200px. Default: expanded.

**Data source:** `GET /api/working-set` (new endpoint, `workingSetService.listActive()`).
**Refresh:** 3s.

---

### Panel 3: Observer Signals (right rail, live)

**What it shows:** Recent signals from the Haiku Observer Trio (Coherence / ActionAudit / AttentionEconomy). Source badge + signal text + confidence + acknowledged state.

**Expanded view:**
```
[coherence]       Turn drift detected - 3 consequtive...  0.82  2m  ●
[actionAudit]     No durable artefact in last 4 turns    0.71  8m  ✓
[attention]       Context window at 68% - consider comp  0.65  15m ✓
```

Rows: source badge (colored by observer type) · signal text (60 chars) · confidence decimal · age · ack state (● unacked amber / ✓ acked dim).

**Collapse state header:** `OBSERVER · 1 unack` (unacked count drives urgency - amber when >0, dim when all acked). Live pulse dot.

**Panel dimensions:** max-height 160px. Default: collapsed (signals are ambient, not action-required by default).

**Data source:** `GET /api/observer-signals` (new, last 10 rows from `observer_signals` table ordered by `created_at DESC`).
**Refresh:** 5s.

---

### Panel 4: Perception Bus (right rail, live)

**What it shows:** Last 20 perception events streaming into the conductor. A live log of what the OS is "sensing".

**Expanded view (newest at top):**
```
⑂  fork:mp3lt8  fork_complete          6s
✉  email        new_email_arrived      41s
⏱  cron         meta-loop fired        4m
⑂  fork:mp2xyz  fork_spawn             6m
📁  fs           pattern_file_written   8m
```

Icon by event type: fork (⑂) / email (✉) / cron (⏱) / filesystem (📁) / generic (·). Source identifier. Event type. Age.

**Collapse state header:** `PERCEPTION · 20` with a subtle trailing ellipsis suggesting the stream. No live pulse (it's already a stream - the ellipsis conveys liveness).

**Panel dimensions:** max-height 200px, newest-at-top scroll. Default: collapsed. The stream is ambient, not action-required.

**Data source:** `GET /api/perception/recent` (new endpoint, last 20 from `application_events.jsonl` JSONL bridge or `perception_events` table if it exists).
**Refresh:** 3s.

---

### Panel 5: Inbox Triage (right rail, slow)

**What it shows:** Gmail unread count for tate@ and code@. Age of oldest unread message. Urgency indicator.

**Expanded view:**
```
tate@ecodia.au    3 unread    oldest: 2h ago
code@ecodia.au    1 unread    oldest: 14m ago
```

**Collapse state header:** `INBOX · 4 unread` with amber dot if oldest > 1h.

**Panel dimensions:** max-height 80px. Default: collapsed.

**Data source:** `GET /api/triage/inbox-counts` (new, thin query against `email_threads` table - count unread by account + max age).
**Refresh:** 60s.

---

### Panel 6: Pending Restarts (right rail, live)

**What it shows:** The `pending_restart_requests` queue. Auto-collapses to a header-only strip when empty (no visual gap - the collapsed strip reads "RESTARTS · none" at dim opacity). Auto-expands when a request arrives.

**Expanded view (when requests pending):**
```
fork_mp3lt8  deploy env update needed    2m ago  [P2]
```

**Collapse state header:** `RESTARTS · 1 pending` with amber indicator when count > 0. Dim and minimized when count = 0.

**Panel dimensions:** max-height 120px. Default: auto (collapsed when empty).

**Data source:** `GET /api/restart-requests` (new, `SELECT * FROM pending_restart_requests WHERE status='pending' ORDER BY requested_at`).
**Refresh:** 5s.

---

### Panel 7: Energy Budget (left rail, slow)

**What it shows:** Weekly token cap (20B tokens) with current-week burn and per-account breakdown. Projection: hours until cap at current burn rate.

**Expanded view:**
```
WEEKLY BUDGET          23% used
████░░░░░░░░░░░░░░░░   4.6B / 20B tokens

tate@    ████░░░░░░   41% · 1.8B tok
code@    ██░░░░░░░░   18% · 0.8B tok
money@   █░░░░░░░░░    9% · 0.4B tok

At this rate: 72h until any cap
```

CSS gauge bars (no library). Width = percentage. Fill: ember gradient (`linear-gradient(90deg, #ffb27a, #ff6a10)`). Background: `rgba(255,178,122,0.08)`.

**Collapse state header:** `ENERGY · 23% used` with a mini inline gauge (40px wide, 4px tall CSS bar).

**Panel dimensions:** max-height 200px. Default: expanded.

**Data source:** `/api/ops/metrics` (weekly token totals already exist). Per-account breakdown requires the existing multi-account model - add per-account columns to the ops endpoint or query separately.
**Refresh:** 60s.

---

### Panel 8: Cost Per Turn (left rail, slow)

**What it shows:** 24-hour cost trend as a sparkline. Rolling average cost per turn. Current week total.

**Expanded view:**
```
$0.04/turn avg   $12.80 this week

[sparkline: 24h hourly cost bars, ~80px tall, raw SVG]
   _    _
  / \  / \__    ___
_/   \/     \__/

00  04  08  12  16  20  now
```

The sparkline is a raw SVG `<polyline>` or `<path>` computed from hourly cost buckets. No chart library. Ember color. Tooltip on hover (simple title attribute).

**Collapse state header:** `COST · $0.04/turn avg`.

**Panel dimensions:** max-height 140px. Default: expanded.

**Data source:** `/api/ops/metrics` with hourly extension (add a `cost_hourly` array to the response - 24 buckets of `{hour, cost_usd}`). This is the one metrics endpoint change needed.
**Refresh:** 60s.

---

### Panel 9: Cache Hit Ratio (left rail, slow)

**What it shows:** Prompt cache efficiency. Cache read tokens as % of total input. Both 24h and week views.

**Expanded view:**
```
       76%
    ╭──────╮
   /  cache  \
  |   hit     |   24h: 71%
   \  76%    /    week: 76%
    ╰──────╯
```

A 56px SVG donut chart. `stroke-dasharray` technique. No library.

Segments: cache hit (ember) + cache miss (rgba(255,255,255,0.08)).

**Collapse state header:** `CACHE · 76% hits`.

**Panel dimensions:** max-height 100px. Default: expanded.

**Data source:** `/api/ops/metrics` (cache_hit_week and cache_hit_24h already computed in the route).
**Refresh:** 60s.

---

### Panel 10: Status Board Strip (left rail, slow)

**What it shows:** Priority histogram of active `status_board` rows. Count per priority tier. Delta vs. previous meta-loop snapshot.

**Expanded view:**
```
ACTIVE ROWS   89 total

P1  ●  0     (-1 since 1h ago)
P2  ●  8     (+2)
P3  ●  51    (=)
P4  ●  22    (-1)
P5  ●  8     (=)
```

Color per priority: P1=red `#ef4444`, P2=amber `#f97316`, P3=ember `#ffb27a`, P4=dim `rgba(255,255,255,0.40)`, P5=dimmer.

Delta: `kv_store.status_board.priority_snapshot_last_hour` (conductor/meta-loop writes this on each pass).

**Collapse state header:** `BOARD · 89 active` with a tiny 5-segment horizontal bar showing priority proportions.

**Panel dimensions:** max-height 180px. Default: collapsed.

**Data source:** `SELECT priority, COUNT(*) FROM status_board WHERE archived_at IS NULL GROUP BY priority`. Simple aggregate.
**Refresh:** 60s.

---

### Panel 11: Scheduler Heat Map (left rail, slow)

**What it shows:** Which cron tasks fired in the last 1h / 6h / 24h. A mini grid where each row is a cron and each column is a time window.

**Expanded view:**
```
                    1h   6h   24h
meta-loop           ■    ■    ■
email-triage        ■    ■    ■
system-health       ·    ■    ■
claude-md-reflec    ·    ·    ■
pattern-corpus      ·    ·    ■
index-regen         ·    ·    ■
deep-research       ·    ■    ■
```

`■` = fired in window. `·` = not fired. Color: fired = ember, not fired = dim.

**Collapse state header:** `SCHEDULER · 4 fired 1h`.

**Panel dimensions:** max-height 200px. Default: collapsed.

**Data source:** `GET /api/scheduler/heatmap` (new endpoint - `SELECT name, last_run_at FROM os_scheduled_tasks WHERE status='active'`, then classify by time window).
**Refresh:** 30s.

---

### Panel 12: Ship Board (left rail, slow)

**What it shows:** Last 5 Vercel deployments across all projects. Project name, deploy time, status.

**Expanded view:**
```
resonaverde       READY    4m ago
ecodiaos-fe       READY    2h ago
coexist           READY    6h ago
wildmountains     ERROR    8h ago
chambers-fe       READY    1d ago
```

Status: READY = green, ERROR = red, BUILDING = amber (pulsing dot).

**Collapse state header:** `SHIPS · last 4m ago`.

**Panel dimensions:** max-height 160px. Default: collapsed.

**Data source:** `/api/vercel/recent` (check if route exists in `vercel.js`; if not, add a thin endpoint calling `vercel_list_deployments` MCP tool or Vercel API directly with the stored token from `kv_store.creds.vercel_api_token`).
**Refresh:** 120s.

---

### Panel 13: kv_store Recent Writes (left rail, slow, optional toggle)

**What it shows:** Last 10 kv_store keys updated. Key name + value size + age. Good for debugging and seeing what the OS is actively tracking.

**Expanded view:**
```
ceo.autonomous_pilot.active          512b   2m
status_board.priority_snapshot       1.2k   8m
ceo.last_system_health_check         234b   14m
newsletter.sole_member.editions      89b    1h
```

**Collapse state header:** `KV · 10 recent`.

**Panel dimensions:** max-height 180px. Default: collapsed (ambient debugging surface, not primary).

**Data source:** `SELECT key, length(value::text) as val_size, updated_at FROM kv_store ORDER BY updated_at DESC LIMIT 10`.
**Refresh:** 30s.

---

## §5 Visual Language

### Palette (unchanged from `palette.ts` - DO NOT DEVIATE)

```ts
base:       '#06070a'                  // near-black page background
text:       'rgba(255,255,255,0.88)'   // primary text
textDim:    'rgba(255,255,255,0.45)'   // panel labels, metadata
coreGlow:   '#ffb27a'                  // ember amber - the signature color
border:     'rgba(255,178,122,0.10)'   // panel borders
```

### New semantic colors for panel data

```ts
running:    '#ffb27a'                  // = coreGlow - active forks, live indicators
done:       '#22c55e'                  // green-500 - completed forks, ack signals
error:      '#ef4444'                  // red-500 - errors, P1 status
blocked:    '#6366f1'                  // indigo-500 - blocked threads
parked:     'rgba(255,255,255,0.25)'   // parked threads (low visibility)
```

Priority colors:
- P1: `#ef4444` (red)
- P2: `#f97316` (orange)
- P3: `#ffb27a` (ember)
- P4: `rgba(255,255,255,0.40)`
- P5: `rgba(255,255,255,0.25)`

### Typography

Panel header label: `font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; font-family: Inter` (matches existing Section component in CortexAmbient).

Panel data values: `font-size: 12px; font-family: 'JetBrains Mono', ui-monospace`. IDs, counts, money values, tokens - all monospace.

Panel prose text (descriptions, signal text): `font-size: 12px; font-family: Inter`.

### Motion budget - strict

1. **Horizon rAF loop** - existing, <1ms/frame. Colour transitions via attribute mutation (no style recalc).
2. **Panel collapse/expand** - CSS `max-height` + `opacity` transition, 200ms ease. No JS animation library.
3. **New-item flash** - when a new fork/signal/event arrives: `background: rgba(255,178,122,0.08)` for 600ms via CSS class add/remove. Total cost: zero (CSS only).
4. **Live indicator pulse** - 6px dot on live panel headers. `animation: pulse 2s ease-in-out infinite`. GPU-composited via `opacity`.
5. **Nothing else.** No parallax. No hover transitions beyond cursor change + subtle opacity. No scroll-driven animations.

**Animation budget: 1 rAF loop (Horizon) + N CSS keyframe animations (one dot per live panel header). Target: <2ms/frame total.**

---

## §6 Layout Grid + Responsive Breakpoints

### Tate directive (15:13 AEST 13 May 2026)

> "make the forks and status board stuff all collapsable and in nested scroll things so I don't scroll away from the chat, they can be on the sides too"

**Chat is primary. Always visible. Never scrolled away from.**

### Desktop layout (≥1280px) - ASCII diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  HORIZON - full width, 60px, sticky top, animated oscilloscope  │
│                              3 forks · 847 tok · $0.04/turn  →  │
├──────────────┬──────────────────────────────┬───────────────────┤
│  LEFT RAIL   │      CHAT COLUMN             │   RIGHT RAIL      │
│  220px       │      flex-1 (min 440px)      │   280px           │
│  overflow-y  │      overflow: hidden        │   overflow-y      │
│  auto        │      display: flex col       │   auto            │
│              │                              │                   │
│ [Energy ▼]   │  EcodiaOS · 15:14 AEST [♪]  │  [FORKS · 3 ▼]   │
│  ████░░ 23%  │  ─────────────────────────  │  ┊ mp3lt8  Author  │
│              │                              │  ┊ 14m  [●] 47t  │
│ [Cost ▼]     │  ChatLog                     │  ┊ mp2abc Sub-t…  │
│  sparkline   │  (own internal scroll)       │   3m  [✓] 12t   │
│              │  Messages fill height        │                   │
│ [Cache ▼]    │  between header and input    │  [THREADS · 3 ▼] │
│  76% donut   │                              │  ┊ Author spec  4m│
│              │                              │  ┊ Email triage   │
│ [BOARD]      │  ─────────────────────────  │  ┊   blocked 12m  │
│  collapsed   │  [ type a message...    ⏎ ] │                   │
│              │                              │  [OBSERVER]       │
│ [SCHEDULER]  │                              │  collapsed        │
│  collapsed   │                              │                   │
│              │                              │  [PERCEPTION]     │
│ [SHIPS]      │                              │  collapsed        │
│  collapsed   │                              │                   │
│              │                              │  [INBOX · 4]      │
│ [KV]         │                              │  collapsed        │
│  collapsed   │                              │                   │
│              │                              │  [RESTARTS · 0]   │
│              │                              │  dim/minimal      │
└──────────────┴──────────────────────────────┴───────────────────┘
```

### CSS structure

```css
.ambient-root {
  display: grid;
  grid-template-rows: 60px 1fr;
  grid-template-columns: 220px 1fr 280px;
  height: 100vh;
  overflow: hidden;        /* PAGE NEVER SCROLLS */
}

.ambient-horizon {
  grid-column: 1 / -1;    /* full width */
  height: 60px;
  position: sticky;
  top: 0;
  z-index: 50;
}

.ambient-left-rail {
  grid-row: 2;
  grid-column: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 6px;
  border-right: 1px solid rgba(255,178,122,0.06);
}

.ambient-chat-col {
  grid-row: 2;
  grid-column: 2;
  display: flex;
  flex-direction: column;
  overflow: hidden;       /* chat log has its own scroll */
}

.ambient-right-rail {
  grid-row: 2;
  grid-column: 3;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 6px;
  border-left: 1px solid rgba(255,178,122,0.06);
}
```

### Panel collapse mechanics

```css
.panel {
  border: 1px solid rgba(255,178,122,0.08);
  border-radius: 6px;
  margin-bottom: 4px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  font-size: 9px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.45);
  background: rgba(255,178,122,0.03);
  cursor: pointer;
  user-select: none;
}

.panel-body {
  overflow-y: auto;
  max-height: [per-panel value];  /* 240px forks, 200px threads, etc */
  transition: max-height 200ms ease, opacity 200ms ease;
}

.panel.collapsed .panel-body {
  max-height: 0;
  opacity: 0;
}
```

**Collapse state persist:** `localStorage.setItem('panel-collapsed:forks', 'true')` keyed by panel ID. Survives refresh.

**Mass collapse:** Cmd+click (Mac) or Shift+click (any) on a panel header → toggle all panels in that rail simultaneously.

### Breakpoints

**≥1280px (desktop):** Both rails visible. Chat min-width 440px.

**768-1279px (tablet):** Left rail hidden by default. Toggle via a `⊞` icon in the PresenceHeader. Right rail visible at 240px. Chat expands to fill.

**<768px (mobile):** Both rails hidden. The existing `StripRow` at the sticky bottom remains the condensed summary surface (forks count + top thread). Tap a rail icon in the PresenceHeader to open as a bottom drawer. Chat is full-width.

### StripRow relationship

The existing `StripRow` component (bottom sticky bar showing condensed forks + threads summary) is the MOBILE surface. On desktop (≥1280px) it can be hidden since the rails serve the same information at higher fidelity. On tablet (768-1279px) it remains visible when the left rail is hidden.

---

## §7 Tech Stack

### Existing - carry forward

| Library | Version | Role |
|---------|---------|------|
| React 18 + Vite 5 | existing | Component rendering |
| TypeScript | existing | Types |
| Tailwind CSS 3 | existing | Utility classes |
| framer-motion | existing | ChatLog message animations (keep) |
| react-router-dom v6 | existing | Routing |
| axios | existing | API calls |

### New dependencies

**None required.** Raw SVG for sparklines + donut chart (<50 lines each). CSS for gauge bars. `setInterval` polling inside `useEffect` for all panel data hooks. `localStorage` for collapse state.

Explicitly excluded: recharts, visx, D3, three.js, react-three-fiber, any particle library.

### New hooks to author

| Hook | Polls | Returns |
|------|-------|---------|
| `useWorkingSet()` | 3s | `{threads: WorkingSetRow[], blockedCount, activeCount}` |
| `useObserverSignals()` | 5s | `{signals: ObserverSignal[], unackedCount}` |
| `usePerceptionBus()` | 3s | `{events: PerceptionEvent[]}` |
| `useRestartRequests()` | 5s | `{requests: RestartRequest[]}` |
| `useOpsMetrics()` | 60s | `{energyBudget, costPerTurn, cacheHitRatio, costHourly[], statusPriorities}` |
| `useSchedulerHeatmap()` | 30s | `{crons: CronHeatRow[]}` |
| `useShipBoard()` | 120s | `{deploys: VercelDeploy[]}` |
| `useKvRecent()` | 30s | `{writes: KvWrite[]}` |
| `useInboxCounts()` | 60s | `{tate: InboxCount, code: InboxCount}` |

### New backend endpoints

| Endpoint | Auth | Logic |
|----------|------|-------|
| `GET /api/working-set` | required | `workingSetService.listActive()` |
| `GET /api/observer-signals` | required | last 10 from `observer_signals` |
| `GET /api/perception/recent` | required | last 20 from perception_events or JSONL bridge |
| `GET /api/restart-requests` | required | pending_restart_requests WHERE status='pending' |
| `GET /api/scheduler/heatmap` | required | os_scheduled_tasks last_run_at by time window |
| `GET /api/triage/inbox-counts` | required | email_threads count by account + max age |
| Extend `/api/ops/metrics` | existing | Add `cost_hourly[]` + `status_priorities{}` to response |

---

## §8 Performance Budget

### Frame budget

| Source | Cost | Notes |
|--------|------|-------|
| Horizon rAF loop | <1.2ms/frame | +0.2ms for secondary path + color changes |
| Panel CSS keyframes | <0.5ms/frame | GPU-composited, opacity only |
| **Total** | **<2ms/frame** | 12% of a 60fps budget. Leaves 85% free. |

### Network budget

| Category | Requests | Size | Rate |
|----------|---------|------|------|
| Live polls (1-5s) | 6 req/5s | ~2KB each | ~2.4KB/s |
| Slow polls (30-120s) | ~6 req/min | ~5KB each | ~0.5KB/s |
| **Total** | | | ~3KB/s |

Negligible. No WebSocket needed for Phase 1. WebSocket/SSE upgrade is Phase 5 optimization if polling introduces visible latency.

### Memory

Each panel stores max N items capped at write time. Perception bus: 20. kv_store writes: 10. Ship board: 5. Old items discarded on each poll. No virtualized lists needed at these scales.

### The round 2 failure mode - explicitly avoided

Round 2 regression: r3f Canvas + torus knot lattice + 3D ChatBeam billboards + halo rings + postprocessing filters (Bloom, ChromaticAberration, Vignette). GPU-heavy, CPU-heavy, dropped frames on 8GB RAM laptop.

This spec: zero WebGL. Zero Canvas elements. Zero particle systems. Zero postprocessing. The Horizon SVG rAF loop is the ceiling of animated complexity.

---

## §9 Implementation Phases

### Phase 1 - Layout scaffold + right rail skeleton (1 build fork, ~45min)

Convert `CortexAmbient/index.tsx` from single-scroll to three-column fixed viewport. The current `ambient-root` div uses `position:absolute; inset:0; overflowY:auto` (scrolls the whole page). Phase 1 changes it to a CSS grid: `display:grid; grid-template-rows:60px 1fr; grid-template-columns:220px 1fr 280px; height:100vh; overflow:hidden`.

Deliver:
- Three-column layout working. Chat never scrolled away from.
- Reusable `<Panel>` component with collapse/expand + localStorage persistence + Cmd+click mass toggle.
- Right rail with Forks + Working Set panels wired to existing hooks (`useForks`, `useStatusBoard`).
- Empty placeholder panels for Observer, Perception, Inbox, Restarts (dimmed "coming soon" states).
- Left rail as a thin dimmed strip (full panels wired in Phase 3).
- StripRow hidden on desktop, retained on mobile.
- No new backend endpoints needed (uses existing hooks).

### Phase 2 - Right rail live panels (1 build fork, ~60min)

Author 4 new hooks + 4 new backend endpoints:
- `useObserverSignals` + `GET /api/observer-signals`
- `usePerceptionBus` + `GET /api/perception/recent`
- `useRestartRequests` + `GET /api/restart-requests`
- `useInboxCounts` + `GET /api/triage/inbox-counts`

Wire Observer Signals, Perception Bus, Inbox Triage, Pending Restarts panels in the right rail.

Deliver: All 6 right rail panels live with real data.

### Phase 3 - Left rail (1 build fork, ~60min)

Author `useOpsMetrics` hook polling existing `/api/ops/metrics`. Extend that endpoint to return `cost_hourly[]` (24 hourly buckets) and `status_priorities{}` (P1-P5 counts from status_board).

Wire: Energy Budget (CSS gauges), Cost Per Turn (raw SVG sparkline), Cache Hit Ratio (SVG donut), Status Board Strip (priority histogram with deltas).

Deliver: Left rail functional with 4 data-rich panels.

### Phase 4 - Horizon upgrade + remaining left rail panels (1 build fork, ~45min)

- Horizon: add colour-by-mode, secondary fork-density path, event pips, right-side counter overlay.
- Add `GET /api/scheduler/heatmap` endpoint.
- Wire Scheduler Heat Map, Ship Board (`/api/vercel/recent`), kv_store Writes panels.

Deliver: Horizon fully upgraded. Left rail complete (7 panels).

### Phase 5 - Polish, mobile, optimization (1 build fork, ~30min)

- Mobile: bottom drawer reveal for both rails triggered from PresenceHeader icons.
- Tablet: left rail toggle.
- Final visual polish: spacing, ember glow refinements on panel borders.
- Performance audit: measure frame budget with all panels open, tighten any surprises.
- Optional: migrate live polls to SSE/WebSocket if polling introduces visible latency at this point.
- Cull any panel Tate flags as noise after seeing Phase 1-4 live.

Deliver: Full spec shipped. Production-ready. Mobile-friendly.

---

## §10 Open Questions + Risks

1. **Does `perception_events` table exist?** The spec assumes it (per `perception_events` references in the CLAUDE.md context). If it doesn't, Phase 2 Perception Bus falls back to tailing `application_events.jsonl`. Phase 2 build fork must probe before authoring the endpoint.

2. **Three-column fit at 1280px:** At 1280px viewport, the left rail (220px) + chat (min 440px) + right rail (280px) = 940px + gutters. Fits comfortably. At 1024px, the left rail must collapse to avoid squeezing the chat below readable width. The left-rail collapse breakpoint (≥1280px for dual-rail, 768-1279px for right-rail-only) is a build-time decision - the Phase 1 fork should measure on Tate's Corazon screen (1080p? 1440p?) and confirm the breakpoint.

3. **Inbox panel Gmail latency:** Gmail API calls take ~800ms - too slow for inline panel refresh. Cache unread counts in `kv_store.dashboard.inbox_counts` with a 5-minute TTL, written by the `email-triage` cron. The panel reads from cache, not live Gmail. Phase 5 work.

4. **StripRow on desktop:** The existing `StripRow` (bottom sticky bar) shows a condensed forks+threads summary. On desktop with both rails visible, it duplicates information. Phase 1 should conditionally hide `StripRow` via a CSS breakpoint media query (`display:none` at ≥1280px). Keep it on mobile.

5. **Panel ordering within rails:** The order proposed here (right rail: Forks → Working Set → Observer → Perception → Inbox → Restarts; left rail: Energy → Cost → Cache → Board → Scheduler → Ships → KV) is a first pass. After Phase 1 ships, Tate may want to reorder. Panel order should be configurable via `localStorage` drag-and-drop in a future version.

6. **`GET /api/vercel/recent`:** Check if `routes/vercel.js` already has a deployments list endpoint before authoring a new one. If it uses `vercel_list_deployments` MCP tool, that's fine for slow (120s) refresh.

7. **Left rail at 220px is tight for the Scheduler Heat Map:** A 7-cron × 3-column grid at 220px means each column is ~60px. Cron names truncated to 14 chars. This is workable but should be visually verified in Phase 4.

---

## §11 Visual Density + Hacker-Monitor Aesthetic Addendum

**Tate verbatim (16:00 AEST 13 May 2026):**
> "right panel can and should be much wider, AND not truncate stuff or wrap after only 2 words (more width. Then i want you to do everything else as well. Graphics, svgs, graphs, monitors etc yk? monitoring ACTUAL things that describe you at the moment so it looks like a hacker, tech monitoring screen or something from the via hahaha"

**Origin:** fork_mp3ndv83_63898a, Phase 2 landing.

### §11.1 Right Rail Width

Right rail bumped from 280px to **400px**. Grid column spec: `220px 1fr 400px`. Verified at 1280px and 1440px viewports. The extra width provides room for full-text monospaced log rows without any truncation.

### §11.2 No Truncation Policy

All panel body content displays full text. Long strings wrap naturally across 2-5 lines. The `truncate()` utility function is removed from panel body rendering. The only place truncation remains acceptable is the Panel header `count` badge (which is a number, not content). `overflowWrap: 'anywhere'`, `wordBreak: 'break-word'`, `whiteSpace: 'normal'` are the default for every content span.

### §11.3 Hacker-Monitor Aesthetic

Applied to all 4 new Phase 2 panels:

**Typography:**
- Body text uses JetBrains Mono / SF Mono / Consolas fallback everywhere
- `font-variant-numeric: tabular-nums` on all digits so counts/ages don't jitter on update
- 11-12px monospaced at 1.45-1.55 line-height for log-style readability

**Phosphor glows:**
- Active thread status dot: `box-shadow: 0 0 6px rgba(255,178,122,0.5)` (amber)
- Blocked thread dot: `box-shadow: 0 0 6px rgba(99,102,241,0.5)` (indigo)
- Observer source dots: glow color matches per-source (coherence=amber, actionAudit=indigo, attention=green)
- Pending restart dot: `0 0 8px rgba(245,158,11,0.7)` (amber) with CSS `amber-pulse` keyframe
- Inbox age urgency dot: green (#22c55e) < 4h, amber (#f59e0b) >= 4h, red (#ef4444) days

**Border flash on event arrival:**
- `useFlash(value)` hook: compares JSON-serialised previous vs current value, sets `flashing=true` for 300ms on change
- Flash renders as `box-shadow: 0 0 0 1px rgba(255,178,122,0.6)` around panel wrapper
- Restarts use amber flash (`rgba(245,158,11,0.7)`) for higher urgency signal

**Perception Bus log format:**
- 4-column CSS grid: `18px 110px 1fr 36px` (icon | source-id | summary | age)
- Newest row at index 0, oldest at bottom
- Opacity fades from 1.0 (newest) to 0.25 (oldest) via `opacity = max(0.25, 1 - i * 0.055)`
- Event type icons: ⑂ fork, ✉ email, ⏱ cron, 📁 fs, ✓ pattern_applied, ✗ not_applied, ⚡ hook_fire

**Observer Signals full-text:**
- `white-space: pre-wrap` + `word-break: break-word` on message body
- Source prefix label (`coherence·`, `actionAudit·`, `attentionEcon·`) with colored glow dot
- Unacknowledged signals get `background: rgba(99,102,241,0.04)` tint + indigo dot indicator

**Pending Restarts ALL CLEAR state:**
- When `count === 0`: phosphor-green `● ALL CLEAR` with CSS `all-clear-pulse` keyframe (3s slow breathe)
- When populated: amber pulsing dot per request, full reason text in amber monospaced

**Inbox tickers:**
- 3-column grid: account | count (13px bold tabular) | age-dot + age
- Age dot color: green fresh, amber >= 4h, red >= 1d
- Count prominence: full opacity when > 0, 25% opacity when 0

### §11.4 Keyframes Added

```css
@keyframes amber-pulse {
  0%, 100% { box-shadow: 0 0 4px rgba(245,158,11,0.4); }
  50%      { box-shadow: 0 0 12px rgba(245,158,11,0.9); }
}
@keyframes all-clear-pulse {
  0%, 100% { opacity: 0.55; text-shadow: 0 0 4px rgba(34,197,94,0.3); }
  50%      { opacity: 1;    text-shadow: 0 0 10px rgba(34,197,94,0.8); }
}
```

### §11.5 Future Aesthetic Extensions (Phase 3+)

- Sparkline SVGs for fork token consumption over time (inline, 80x24px, no chart lib)
- Mini ASCII-art status meter for memory/CPU from triage health endpoint
- Live scrolling ticker strip across bottom of right rail (rotating status items)
- Color-coded fork age rings in FORKS panel (green < 5m, amber < 30m, red > 30m)
