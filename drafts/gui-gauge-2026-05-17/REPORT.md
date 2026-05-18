# GUI Capability Gauge - Vercel Dashboard Recon

**When:** 2026-05-17 ~15:54-16:01 AEST
**Substrate:** laptop-agent on Corazon (100.114.219.69:7456), PowerShell -> HTTP -> `input.*` / `screenshot.screenshot` against your live Chrome (Default profile, logged in as Work / ecodiatate, Ecodia Pro team).
**Doctrine:** [drive-chrome-via-input-tools-not-browser-tools](D:/.code/EcodiaOS/backend/patterns/drive-chrome-via-input-tools-not-browser-tools.md) - no `browser.*`, no spawned `~/.eos-browser`, used your existing logged-in session.

## What I did

1. Probed `/api/health` (uptime 472s, memory 92% used - high but agent OK) + confirmed token at `~/.ecodiaos/laptop-agent.token`.
2. Step-0 focus-collision probe via Win32 `GetForegroundWindow` -> Cursor IDE was foreground. You authorised focus theft so proceeded.
3. Initial full-screen capture -> taskbar inspection -> found Chrome PID 26236 with "(1) Instagram Messages" as top window. Located icon at taskbar coord (795, 743).
4. `input.click(795, 743)` -> Chrome to foreground (confirmed via post-click `GetForegroundWindow`).
5. `input.shortcut [ctrl, l]` -> `input.type "vercel.com/dashboard"` -> `input.key enter` -> 5s wait -> screenshot. Vercel team page loaded at `vercel.com/ecodia`.
6. Tried `mouse.scroll` to walk project list - **handler hung, 10s timeout x3**. Pivoted to `input.key page_down` after clicking neutral area. PageDown also didn't scroll the page (Vercel's project list is a focus-isolated container).
7. Unintentional click landed on coexist card and drilled in - recovered via `input.shortcut [alt, left]`. Useful byproduct: saw coexist's 9+ active branches.
8. Another unintentional click hit "All Projects" dropdown - **best byproduct**: full 12-project inventory revealed in one shot.
9. Pivoted to `Deployments` sidebar tab via direct click (80, 259) -> `vercel.com/ecodia/~/deployments` loaded fine.
10. Clicked "Status 5/6" filter at top right - misread it as a health metric, but it's actually a filter-selection indicator (5 of 6 status types selected, Cancelled is unchecked). Self-corrected.

## Capability scoring (honest)

| Capability | Verdict |
|---|---|
| Token + agent reachability | Solid |
| Foreground-collision probe | Works (Win32 native via PowerShell) |
| Bring app to foreground via taskbar click | Works (used screenshot to find icon coords) |
| Address-bar nav (Ctrl+L / type / Enter) | Works clean, fast |
| Screenshot + interpret content | Works - can read UI labels, status indicators, hover tooltips, URL bar, even the bottom-left hover-URL preview |
| Recover from misclick (Alt+Left) | Works |
| Use unintended UI surfaces productively | Works (turned dropdown misclick into a full project list) |
| `mouse.scroll` tool | **Broken** - listed in `/api/info` but hangs forever. File a fix. |
| PageDown to scroll SPA content | **Unreliable** - works for native scrolls only, not focus-trapped div scrolls in modern SPAs |
| Filter dropdowns via click + read | Works |
| Read complex tables (deploy list with multiple columns) | Works |

**Headline:** I can drive your Chrome competently for read-only recon and shallow navigation. The fragile bit is scrolling inside SPA-managed scrollable regions - I should switch to URL-based navigation, view-toggle buttons (list/grid), or filter UIs instead of trying to scroll.

## Findings (Vercel state recon)

**Account:** Ecodia Pro, 4 days remaining in cycle, $4.05 of $20 included credit used, $0 on-demand, build minutes $2.28.

**12 projects in team:**
coexist, resonaverde, ecodiaos-frontend, wildmountains, ecodia-site, chambers-frontend, chambers-platform-site, roam-frontend, wattleos, campouts-coexist, nah-frontend, taob.

**Deploy state across visible recent deploys:** all Ready, no Error / Building / Queued / Initializing. The Status filter has Cancelled unchecked - if you want to see cancelled deploys, that filter needs flipping.

**Active iteration (top-of-list):**
- `coexist` -> 8 production deploys in the last ~24h, all Ready in 7-9s. Top of stack: `d2b7c70 fix(auth): skip verify-email screen when Supabase...` (1h ago, currently Production Current).
- `resonaverde` last main deploy 1d ago - `fix(admin) + feat(brand): email blast UX + Resonav...`.
- `ecodiaos-frontend` last main deploy 3d ago - `perf(bundle): remove unused date-fns, replace fra...`. **Has a "Production Checklist" tooltip on the status icon** - incomplete production-readiness checklist worth a look.
- `wildmountains` last May 12 - `chore: fix git identity - route commits through tat...`.
- `ecodia-site` shows the activity-meter icon (not the green double-tick) on the project card - **worth drilling in** to see whether that's a degraded state or just a different UX for a project with no recent deploys.
- `chambers-frontend` last - `chore(buil) remove em-dashes per output formatti...`.

**coexist active branches:** 9+ preview branches listed (fix/event-cancel-sync-and-draft-publish, feat/impact-fe-wiring-fork_mp0ph4u8_084a18, fix/event-dupe-prevention-2026-05-11, feat/impact-baseline-fork_mp0odofn_8f8109, 1.8.5-ship-v3, 1.8.5-ship, feat/collective-focal-point-and-home-reorder-2026-04-29, feat/profile-privacy-tiering, feat/ios-export-options-plist-2026-04-29). Some look stale (Apr 29) and worth a cleanup pass - **but I'm not authorised to delete branches without your go-ahead**.

**Sidebar badge:** Environment Variables shows badge "7" - some kind of env-vars hint/notification, didn't drill in.

## What I noted but did NOT act on

- coexist's Apr-29 dated preview branches (potential staleness).
- ecodiaos-frontend Production Checklist (likely a real "set a production domain / enable analytics" type nudge).
- ecodia-site's non-green project card icon (activity meter).
- Env Vars sidebar badge "7".

Drilling these would be a separate scoped session.

## Substrate bugs found

**`mouse.scroll` hangs.** Listed at `/api/info` (`mouse.scroll`, `mouse.drag`), HTTP POST never returns within 10s timeout (consistent across three retries). Fix needed in [eos-laptop-agent tools/mouse.js](D:/.code/eos-laptop-agent/tools/mouse.js). Worth a P3 status_board row + a fork dispatch to fix - this hits doctrine [eos-laptop-agent-module-cache-requires-restart-after-handler-swap](D:/.code/EcodiaOS/backend/patterns/eos-laptop-agent-module-cache-requires-restart-after-handler-swap.md) (post-fix you'll need `pm2 restart eos-laptop-agent` or the equivalent direct-restart since it's not in PM2).

## Recommendation for what's next

In rough order of leverage:

1. **Fix `mouse.scroll`** - small bug, high frequency-of-use cost. I should not have to fall back to PageDown gymnastics.
2. **Codify the read-only recon recipe** as a reusable pattern (`vercel-dashboard-recon-recipe.md`) since this same flow applies to Stripe / GitHub / Bitbucket / ASC / Zernio dashboards.
3. **Tackle a write-task gauge next** - I demonstrated read+navigate. Logical next test: a low-stakes write (add a label, archive a Gmail thread, post a comment) on a target you nominate. That exercises the harder verification layer (did the write actually land?).
4. **Drill the findings I flagged but didn't act on** (Production Checklist, env-vars badge, stale preview branches) - any of these worth my time?

## Artefacts on disk

All in [drafts/gui-gauge-2026-05-17/](D:/.code/EcodiaOS/backend/drafts/gui-gauge-2026-05-17/):

- 01-initial-desktop.png
- 02-vercel-dashboard.png (post-load)
- 03-vercel-dashboard-scrolled.png (hover-tooltip on ecodiaos-frontend status)
- 04-after-end-key.png (accidental drill into coexist)
- 05-projects-scrolled.png (All Projects dropdown - full 12-project inventory)
- 06-deployments-all.png (Deployments tab, 8 recent coexist deploys)
- 07-deployments-scrolled.png (PageDown attempt - no change)
- 08-status-filter.png (Status filter dropdown showing the 6 status types)
