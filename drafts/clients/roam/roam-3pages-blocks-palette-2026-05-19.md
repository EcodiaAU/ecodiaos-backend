# Roam - blocks + palette for the 3-page redesign

For Claude Designs. **Functional inventory only - no design or layout prescriptions.** Three pages: /trip, /guide, /sos. Bottom tab bar persists across all three (Guide | Trip-centre | SOS).

App stack: Capacitor 8 + React 19 + Vite static export. Offline-first (full plan + tiles + POI bundles work with zero network). Two themes: `data-theme="day"` (light) and `data-theme="tactical-night"` (dark). Both themes must work for every block listed.

---

## 1. /trip

The /trip page has **two distinct UI states** with different block compositions:
- **Planning mode** - no active navigation. Trip is being built / viewed / shared / edited.
- **Navigation mode (T-b-T)** - turn-by-turn navigation is live. Different blocks foreground.

### Persistent blocks (visible in both modes)

- Trip map (full-bleed) with route polyline + start/end pins + waypoint pins + cluster nodes for nearby POIs.
- Map style switcher menu (street / satellite / topo / terrain options).
- Network status pill (online / offline / syncing / corridor-cached state).
- Terrain chip overlay (surface condition indicator - sealed / unsealed / 4WD / closed).
- Nearby Roamers pill (live peer-proximity indicator; expandable for distance + heading + confidence).
- Map cluster nodes for POIs along route (need to be small - Tate's verbatim note: current sizes cover too much of the route).
- Account button (entry point to /account).
- Enrichment banner (trip-loading progress - setting up / done / error, with assets-loaded count).
- Place detail sheet (any tapped POI: satellite preview, amenities, hours, contact, share, add-to-trip).

### Planning-mode-only blocks

- Trip title (display + edit).
- Stops list (ordered start → waypoints → end; reorder, inline-edit name + arrival time, per-stop quick-action menu).
- Per-stop quick-action menu (rename, set time, set fuel, replace with nearby, remove).
- Route stats display (total distance, total duration, stop count, surface mix).
- Trip suggestions panel (browse/search 40+ POI categories along route; category chip filters + counts + add-to-trip).
- Fuel summary card (compact when healthy / expanded when gaps; tank-range strip with station dots, reserve indicator, critical-gap recommendations).
- Start-navigation CTA (large button that flips the page into T-b-T mode).
- Plans drawer entry button.
- Invite-people CTA.
- Share-trip CTA.
- Upgrade-to-Pro CTA (free-tier gate marker).
- AI-trip-generator entry button (opens AI modal that drafts a trip from a text description).

### Navigation-mode-only blocks (turn-by-turn)

- Top maneuver card (next-turn icon, street name, distance to turn, approaching/imminent color state).
- Bottom progress card (ETA time, remaining distance, remaining duration, current speed, leg switcher if multi-leg, "to next fuel" CTA).
- Off-route warning banner (top - distance from route + reroute CTA if corridor cached).
- Compass HUD (heading degrees + cardinal).
- Elevation strip (elevation profile for current leg).
- Fuel pressure indicator pill (ambient fuel-state + km-to-next-station).
- Fuel last-chance toast (critical low-fuel approaching final station).
- Active alerts banner (next upcoming hazard / traffic warning with distance + severity).
- Quick-report FAB (long-press opens 4×2 grid: hazard, closure, road condition, speed, weather, fuel price, campsite, general; placement step drags marker on map, submit bar).
- Navigation controls cluster: mute audio, map overview, recenter, end navigation, layer toggle, report shortcut. **(Layer menu must open in a placement that does not get covered by these buttons - verbatim Tate note.)**
- End-navigation button.

### Modals + drawers (open on demand, both modes)

- Plans drawer (right-slide): all saved plans, active starred; per-plan card with name (inline-editable), distance, duration, stop count, share / invite / open / delete; header buttons Join + AI + New.
- Invite-code modal (create code OR redeem code).
- Trip-share modal (web: rendered share card with map thumbnail; native: renders off-screen then invokes OS share sheet).
- AI-trip-generator modal (text input → thinking / building / preview-stops-with-reasons → accept / modify / discard → saves seed plan).
- Paywall modal (Pro vs free gating, feature-level messaging).
- Welcome modal (first-launch onboarding, dismissible).
- Vehicle / fuel profile settings (tank range, reserve, fuel type).

### Background state / services (no visual surface but they drive blocks)

- Geolocation tracking (Capacitor native + browser fallback).
- Navigation engine (current step, next maneuver, distance + duration remaining, ETA, speed).
- Hazard + traffic overlay streaming (live or cached).
- Fuel analysis (range, gap warnings, next-fuel lookup).
- Observations queue (user-submitted reports batched for upload).
- Presence beacon (BLE advert for nearby-roamers).
- Offline bundle enrichment (corridor graph + places pack download + rebuild progress).
- Paywall gate state.

---

## 2. /guide

Always-on page (no mode switching). Two content tabs inside: **Found** (discoveries) and **Chat** (AI guide).

### Persistent blocks

- Page header (Tate's note: current header is too crowded - Guide title + tab switcher + network pill + account button all in one row). Header must surface:
  - Page title.
  - Found / Chat tab switcher.
  - Network status pill (online / offline / syncing).
  - Account button.
- Guide map with route + current trip progress visualisation.
- Trip progress bar (visual progress along route, current position, remaining km + time).
- Weather snapshot (temperature, daylight status at user location).
- Fuel status summary (km to next fuel, urgency).
- Enrichment banner (shared with /trip - progress state).

### Found tab blocks

- Discovered place cards (scrollable list - icon, name, distance ahead, AI-generated reason for surfacing, view-map CTA).
- Place detail sheet (shared component with /trip).
- Empty / loading / error states for discovery feed.

### Chat tab blocks

- Message list (scrollable conversation; markdown rendering; AI streaming indicator).
- Extracted action buttons (URLs → "Visit [domain]", phone numbers → "Call", fallback link).
- Message input field.
- Live "AI is typing" indicator.

### Background state / services

- Guide engine init (AI context: vehicle + weather + fuel + fatigue state).
- Trip progress computation (km along route, time remaining, projected arrival).
- Weather + fuel lookups (nearest weather + fuel ahead).
- Message streaming from server.

---

## 3. /sos

Always-on emergency page. No mode switching.

### Persistent blocks

- Current-location display (lat/long, 5-decimal precision).
- Location accuracy indicator (metres).
- Get-Location button (request new GPS fix, timeout handling).
- Map link button (open Google Maps at current coordinates).
- Last-known-position satellite mini-map.
- Network status pill (offline / online).

### Emergency contacts block

- Contact cards (name + phone(s); SMS + call action buttons per contact).
- Add contact CTA.
- Edit contact (inline name + phone input).
- Delete contact (per-card trash with confirm).
- Bulk-SMS composer (fallback when device lacks native SMS - compose message, char/segment count, send to selected contacts).

### Quick-dial controls

- Emergency services speed-dial (e.g. 000 / SES - tap to call OR tap to SMS).
- Custom speed-dials generated from saved contacts.

### Background state / services

- High-accuracy Capacitor geolocation (watchPosition, 120s timeout, coarse + fine permission handling).
- Emergency-contact storage (local IndexedDB + Supabase sync).
- Location history (last-known position cached).
- Permission-state checks (iOS + Android).

---

## 4. Cross-page persistent shell

These blocks live OUTSIDE the page bodies but are part of every screen:

- Bottom tab bar (3 tabs: Guide | Trip-centre | SOS). Centre Trip tab is the elevated CTA.
- Safe-area insets (notch top + home indicator bottom).
- Top status bar overlay (translucent; status bar style switches with theme).
- Splash screen handoff (already handled natively, web doesn't need to render it).

---

## 5. Colour palette

Two themes. Every block must be theme-aware. Tate's open bug: light-mode /trip navigation cards are stuck dark. Design must commit to using token names. Components with hex baked in are what's causing that bug.

### Day (light mode) - `[data-theme="day"]`

**Brand**
- Terra Ochre `#B3541E` - primary accent
- Terra Charcoal `#131313` - primary text
- Terra Ash `#F4FAFF` - page background
- Eucalypt Green `#6D7E4E` - success / brand-secondary
- Eucalypt Green Dark `#556640`
- Brand Sky `#1a6fa6` - info
- Terra Red `#C62828` - danger / emergency
- Terra Amber `#FFB693` - warn
- Brand Shared (purple) `#7a3d99` - shared-plan accent

**Surfaces**
- Background (sand) `#F4FAFF`
- Surface card `#FFFFFF`
- Surface muted `#E8EDF2`
- Surface raised `#FFFFFF`
- Nav card bg `#FFFFFF`

**Text**
- Text main `#131313`
- Text muted `#4A5058` (AAA 7.3:1 on white)

**Borders**
- Border `rgba(19,19,19,0.12)`
- Border strong `rgba(19,19,19,0.25)`

**State backgrounds (paired bg + text)**
- Error bg `#FDECEA` / Error text `#922018`
- Warn bg `#FFF3E0` / Warn text `#8C5A00`
- Danger tint `rgba(198,40,40,0.10)`
- Accent tint `rgba(179,84,30,0.10)`
- Info tint `rgba(44,124,181,0.10)`

**Overlay**
- Overlay bg `rgba(19,19,19,0.50)`

**Tab bar**
- Tab bar bg `#FFFFFF`
- Tab active `#B3541E`
- Tab inactive `#555D68`
- Tab centre bg `#B3541E`
- Tab centre icon `#FFFFFF`

**Semantic categories (POI / map)**
- Emergency `#C62828` (+ tint `rgba(198,40,40,0.12)`)
- Potable water `#6D7E4E` (+ tint `rgba(109,126,78,0.12)`)
- Solar `#D4920A` (+ tint `rgba(212,146,10,0.10)`)

**Severity (hazards)**
- Major `#C62828`
- Moderate `#E65100`
- Minor `#FFB693`

### Tactical Night (dark mode) - `[data-theme="tactical-night"]`

**Brand**
- Terra Ochre `#D4764A` - primary accent
- Terra Red `#EF5350` - danger
- Eucalypt Green `#8FA86A` - success
- Eucalypt Green Dark `#6B8050`
- Brand Sky `#4DB8F0` - info
- Terra Amber `#FFB693` - warn / solar
- Brand Shared `#B087DB` - shared-plan accent

**Surfaces**
- Background `#131313` (deep charcoal)
- Surface card `rgba(26,28,32,0.96)`
- Surface muted `rgba(38,40,46,0.94)`
- Surface raised `rgba(48,50,56,0.97)`
- Nav card bg `rgba(26,28,32,0.96)`

**Text**
- Text main `#F0ECE6` (warm parchment, AAA 15.2:1)
- Text muted `#B0A89F` (dusty amber stone, AAA 7.1:1)

**Borders**
- Border `rgba(255,255,255,0.08)`
- Border strong `rgba(255,255,255,0.16)`

**State backgrounds**
- Error bg `rgba(198,40,40,0.15)` / Error text `#FFAB91`
- Warn bg `rgba(255,182,147,0.12)` / Warn text `#FFB693`
- Danger tint `rgba(239,83,80,0.14)`
- Accent tint `rgba(212,118,74,0.12)`
- Info tint `rgba(77,184,240,0.12)`

**Overlay**
- Overlay bg `rgba(0,0,0,0.65)`

**Tab bar**
- Tab bar bg `rgba(18,18,22,0.97)`
- Tab active `#D4764A`
- Tab inactive `#B0A89F`
- Tab centre bg `#A0522D` (darker ochre for on-color contrast, AAA-lg 5.8:1)
- Tab centre icon `#FFFFFF`

**Semantic categories**
- Emergency `#EF5350`
- Potable water `#8FA86A`
- Solar `#F0B429`

**Severity**
- Major `#EF5350`
- Moderate `#FF8A65`
- Minor `#FFB693`

**Night-mode CTA gradient (signature)**
- `linear-gradient(135deg, #FFB693 0%, #B3541E 100%)` (rest)
- `linear-gradient(135deg, #D4764A 0%, #933D04 100%)` (hover/pressed)

### Typography (both themes)

- Display family: **Space Grotesk**
- Body family: **Public Sans** / Plus Jakarta Sans fallback
- Mono family: SF Mono / Cascadia Mono / system mono

---

## 6. Hard non-negotiables (technical constraints)

- Every block must render correctly in **both themes** using token names not hex (the current light-mode-cards-staying-dark bug is from hex-baked components).
- **48 px minimum tap target** for everything tappable (driving / one-handed / gloves use case).
- **No `backdrop-filter: blur(…)`** - globally killed for perf (mobile compositor cost). Use solid `rgba(...)` surfaces.
- **Safe-area insets** must be respected on every floating block (top notch + bottom home indicator).
- **Map cluster sizes** must be smaller than current - they cover the route.
- **Offline-first** - every block must have an offline state. No "loading" spinner that never resolves when there's no network.
- **Two-handed driving consideration** for /trip nav mode - primary controls reachable without obstructing the map / route.
