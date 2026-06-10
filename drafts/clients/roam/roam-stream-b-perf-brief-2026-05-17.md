# Stream B brief - Roam performance fixes

**For:** a fresh Claude Code chat tab (Ctrl+Shift+P → "Claude Code: New Chat" in VS Code Stable / Insiders / Cursor). Open at workspace root `D:/.code/roam/frontend/` so the IDE loads Roam's CLAUDE.md.

**Conductor (the other chat) is driving Stream A (App Store + Play Store ship-prep) in parallel. Coordinate via `kv_store.cowork.roam_ship.stream_b_status` writes if you need to flag blocking issues — do NOT touch native iOS or Android files; Stream A owns those.**

---

## Mission

Roam currently cooks user phones during nav. We're shipping v1.0 to App Store + Play Store within ~24 hours. Your job: land the four highest-impact battery/CPU/GPU fixes BEFORE the build that goes to stores, so reviews aren't "this app drains my battery."

Land changes as commits on `D:/.code/roam/frontend/` (existing git repo, remote `EcodiaTate/roam-frontend`). Push to `main` when done. The conductor will pick up your commits and include them in the v1.0 build.

## Four fixes, ranked by drain contribution

### Fix 1 — Adaptive geolocation (50-60% of drain)
**Files:** `src/lib/native/backgroundLocation.ts:61-68`, `src/lib/native/geolocation.ts:95-105`, `src/lib/hooks/useGeolocation.ts` (if it exists; otherwise wherever `watchPosition` is initiated).

**Current behaviour:** `enableHighAccuracy: true` and `maximumAge: 0` always-on. GPS chip never sleeps. Re-requests fresh fix every 1-2s.

**Target behaviour:** State machine with three modes, picked based on context:
- `coarse`: `enableHighAccuracy: false`, `maximumAge: 30000`, 30s interval. Default when no active nav, or steady-state highway >5km from next turn.
- `nav`: `enableHighAccuracy: true`, `maximumAge: 2000`, 2s interval. During active turn-by-turn within 500m of next instruction.
- `hazard-proximity`: `enableHighAccuracy: true`, `maximumAge: 0`, 1s interval. Within 1km of a hazard, fuel station (when fuel is critical), or speed camera.

Implement as a context provider that wraps the existing `useGeolocation` hook. Expose `setMode(mode)` for the nav engine to call.

**Verify**: device should report battery drain dropping ~30-40% on a 1-hour highway nav vs baseline.

### Fix 2 — Network polling intervals (20-30%)
**Files:** `src/app/(app)/trip/ClientPage.tsx` (`OVERLAY_POLL_INTERVAL_MS = 90_000`), `src/lib/offline/presenceBeacon.ts:19-20` (`PING_INTERVAL_MS = 30_000`), and `src/lib/api/nav.ts:72-76` (`trafficPoll`, `hazardsPoll`).

**Current:** Traffic + hazards every 90s. Presence beacon every 15-30s.

**Target:**
- Traffic + hazards: 5 minutes steady-state. When user is within 2km of an active hazard from the last poll, accelerate to 30s. When user has not moved >500m in the last poll cycle (e.g. parked, lunch stop), back off to 15 minutes.
- Presence beacon: 60s default, debounced on location change >100m. Only ping if location-change OR 60s elapsed, whichever comes first. Skip ping when app is backgrounded.

Implement an exponential backoff on network failures (3 strikes → 5-minute backoff, reset on success).

### Fix 3 — MapLibre GL rendering (10-15%)
**File:** `src/components/trip/TripMap.tsx` (and any sibling map components — likely a `useMap` hook setting up the maplibregl.Map instance).

**Current:** 50+ overlay layers rendering at device-native refresh rate (60-120 FPS). No layer culling.

**Target:**
1. **FPS cap**: After the map instance is created, call `map.setMaxBounds(...)` if relevant AND if the maplibre-gl API exposes a frame limiter, use it. If not directly exposed, throttle visible overlay re-renders via `requestAnimationFrame` debouncing — coalesce overlay data updates into one render per 33ms (≈30 FPS).
2. **Layer-visibility gating by zoom**: Layers like `fuel-stations`, `wildlife-zones`, `speed-cameras`, `air-quality` should only render at zoom ≥ 10. Use `map.setLayoutProperty(layerId, 'visibility', 'none')` when zoomed out. Test with `map.getZoom()` listener on `zoomend`.
3. **Cluster point layers** that have >100 features visible. Use maplibre-gl's `cluster: true` source option for fuel-stations and speed-cameras.

**Verify**: device thermal state during 5-minute map interaction should stay nominal (not "fair" or "serious") on an iPhone 12 or later.

### Fix 4 — React 19 compiler (5-10%)
**File:** `vite.config.ts:7-11`.

**Current state**: `babel-plugin-react-compiler` is in `package.json` and referenced in `vite.config.ts`, but the build may not actually be running it. The convention in vite + react 19 is to wire it via `@vitejs/plugin-react`'s `babel.plugins` option, NOT as a top-level vite plugin.

**Steps:**
1. Run `npm run build` and grep stdout/stderr for "react-compiler" mentions. If silent, the compiler is not running.
2. Fix the wiring: in `vite.config.ts`, pass `babel-plugin-react-compiler` to `react()`'s `babel.plugins` array. Example:
   ```ts
   import react from '@vitejs/plugin-react'
   plugins: [react({ babel: { plugins: ['babel-plugin-react-compiler'] } })]
   ```
3. Re-build, confirm the compiler manifest appears in build output OR add `"react-compiler-healthcheck"` package + run it as a one-shot sanity check.

**Verify**: nav HUD components (`NavigationHUD`, `NavigationBar`, `TripView`) should not re-render on parent state changes that don't touch their props. Use React DevTools profiler in browser preview before/after.

## Doctrine to read first

- `D:/.code/EcodiaOS/backend/patterns/verify-deployed-state-against-narrated-state.md` — verify each fix actually shipped, not just "I edited the file"
- `D:/.code/EcodiaOS/backend/patterns/action-over-plans-honesty-redeems-mistakes.md` — bias for action, mistakes are fine if disclosed

## Acceptance criteria

1. Commits land on `EcodiaTate/roam-frontend` `main` with semantic messages (not "Updates").
2. Each fix has a 1-paragraph entry in `D:/.code/roam/frontend/PERF_NOTES.md` describing what changed and a measurable verification step.
3. `npm run build` succeeds and `npm run cap:sync` propagates JS to iOS + Android (do NOT open Xcode or Android Studio — conductor owns native).
4. Push `main` when done. Conductor will pick up.
5. Final commit before push: `git tag perf-v1.0.0-rc1` so the conductor can identify the perf-fixed build cut.

## Coordination

Write status to `kv_store.cowork.roam_ship.stream_b_status` as you go:
- `started_at` (ISO timestamp)
- `fix_1_status` / `fix_2_status` / `fix_3_status` / `fix_4_status` (pending | in_progress | shipped | blocked)
- `last_commit_sha`
- `notes`

Use the `mcp__claude_ai_ecodia-supabase__db_execute` or `mcp__ecodia-full__kv_store_set` tools.

If you hit anything that needs conductor decision (native iOS/Android touch, store metadata, CarPlay scaffolding work) — STOP and write a `blocked:<reason>` row to status, don't proceed unilaterally.
