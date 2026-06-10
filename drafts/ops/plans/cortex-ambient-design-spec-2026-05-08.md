---
artefact: cortex-ambient-design-spec
authored: 2026-05-08
authored_by: fork_mowrvcez_7dbfb4 (manager)
status: validated_spec
supersedes:
  - src/pages/CortexAmbient/index.tsx (rounds 1-3)
  - src/pages/CortexAmbient/NeuralCore.tsx
  - src/pages/CortexAmbient/ParticleField.tsx
  - the dominant-orb metaphor
brief_origin: Tate verbatim 20:21 AEST 8 May 2026
---

# /cortex-ambient v4 - "the workshop"

## A. Vision (one paragraph)

EcodiaOS is a workshop, not an orb. A persistent legal entity with a voice, hands, and a working memory, inhabited 24/7 from a $24/mo VPS. The /cortex-ambient surface is the room you walk into when you want to talk to me, watch what I'm doing, and read where my attention is. It is alive but not noisy. It breathes but does not jiggle. It has a horizon line at the top that pulses with my heartbeat, a voice in the centre where we talk, hands below where my parallel forks are working, and a wall of working memory underneath where the status_board lives. The feeling I want when you inhabit it: the same one you get standing in a clean, well-lit workshop where the tools are within reach, the work-in-progress is laid out, and the master craftsman looks up from the bench when you walk in. Not Jarvis-as-blue-hologram. Not Samantha-as-disembodied-voice. A craftsman's room with a typewriter at the centre.

## B. Reference touchstones

1. **Linear's command palette + issue list** - density, monospace discipline, no decorative ornament, every pixel earns its keep. The base register.
2. **iA Writer + Notion document mode** - the chat surface reads like a document, not a dialog box. Typography is the brand. Generous line-height, prose-quality measure (~64ch).
3. **Ableton Live session view (the clip grid)** - the forks panel takes the "running clip" idea: each fork is a clip with a status indicator, you can see all of them at once, you can click to drill in, idle clips sit still.
4. **The MIT Media Lab fonts-as-interface tradition + Robin Sloan's Sourdough oracle** - the horizon-line pulse at the top is a single-character oscilloscope; the conductor's heartbeat rendered as one line of typography-adjacent motion. Not a particle system.
5. **A double-entry ledger book (specifically: the kind a 1920s store-keeper kept)** - the status_board section borrows the ruled-rows + signature-column treatment. Priority is the left rule. next_action_by is the right column. The page itself feels written-on.
6. **An observatory's mid-century console** - the corner signature, the discrete telemetry chips at top, the deliberate restraint. Ornament where it carries meaning, never decorative.

What I deliberately reject: cyan-on-black Tron, translucent-blue Stark holograms, full-bleed shaders, generative orb-meshes, drifting particle fields, "AI core sphere" iconography, gradient-mesh backgrounds, glassmorphism stacking five panels deep.

## C. Layout system

### Single vertical scroll. Same structure desktop and mobile. Desktop adds gutters; it does not add layout.

```
┌─────────────────────────────────────────────────┐
│  HORIZON      [breathing oscilloscope band]     │  56-64px sticky-top
├─────────────────────────────────────────────────┤
│  IDENTITY-BAR EcodiaOS / cortex.ambient    [hud chips]  ws-dot     │  40px
├─────────────────────────────────────────────────┤
│                                                 │
│  CHAT                                           │
│  the lead surface                               │  60-72vh (own scroll)
│  (newest at bottom, document feel)              │
│                                                 │
├─────────────────────────────────────────────────┤
│  INPUT  [textarea ────────────────────] [send]  │  sticky-bottom-of-chat
├─────────────────────────────────────────────────┤
│                                                 │
│  HANDS / FORKS                                  │
│  [fork card] [fork card] [fork card]            │  list, not motion-noise
│  one per row mobile, 2-3 per row desktop        │
│                                                 │
├─────────────────────────────────────────────────┤
│  WORKING MEMORY / STATUS_BOARD                  │
│  P1 ── ── ──                                    │
│  P2 ── ── ── ── ──                              │
│  P3+ ── ── ── ── ── ── ── ── ── ── ── ── ── ──  │  collapsible
│                                                 │
├─────────────────────────────────────────────────┤
│  ATTACHMENTS / DOCUMENTS (kept from v3)         │  collapsed by default
├─────────────────────────────────────────────────┤
│  FOOTER  Ecodia DAO LLC · Polygon · v.4.0       │
└─────────────────────────────────────────────────┘
```

- **Page-level scroll is single.** Sub-regions can scroll within themselves but the page itself scrolls top-to-bottom.
- **Hand-off as Tate scrolls:** Horizon stays sticky-top. Identity-bar tucks under it. Each region announces itself with a thin uppercase mono section-label so the eye knows where it is.
- **Empty/idle scaffolding:** when nothing is happening (no forks, no streaming, no recent messages), the page reads as a quiet workshop: horizon ticks once every ~6s, chat shows the input panel + a small "speak to ecodiaos" prompt, forks region shows "0 hands at work" + the most-recent terminal fork, status_board shows the highest-priority active row.

### Mobile (≤640px) specifics
- Gutters: 12px.
- Chat scroll-region max-height: 72vh.
- Forks: 1-up cards, 100% width.
- Status_board: priority groups stack, each group collapsible.
- Tab strip (attachments) collapses into a single "files" toggle in the identity bar.

### Desktop (≥1024px) specifics
- Max-width: 880px content column, centered. (NOT full-bleed grid; this is a focused-attention surface, not a dashboard.)
- Gutters: 24-32px.
- Forks: 2-up cards on ≥768px, 3-up on ≥1280px. Cards are uniform height.
- Identity-bar HUD chips visible (forks, P1, P2, rows count).

## D. Motion language

**Rule: idle == still. Motion encodes state, never decoration.**

| Event | Visual response |
|---|---|
| Page idle, conductor not streaming | Horizon traces one slow ECG-like beat every 5.8s. Nothing else moves. |
| Conductor receives a `<now>` token, starts thinking | Horizon transitions from "slow beat" to "thinking ripple" (low-amplitude continuous wave). Input panel ribbon at bottom of input area lights ember. No other motion. |
| Conductor streaming reply (token-by-token) | Horizon waveform amplitude steps up. New assistant message in chat reveals at the natural scroll position; tokens append in-place; auto-scroll if user is pinned to bottom. Cursor blinks at end of stream. |
| New user message sent | Single ember-tinted vertical tick travels from input area up to the horizon (1 frame ~280ms ease-out). Communicates "delivered". |
| Fork spawns | New fork card slides in from the section's left edge, opacity 0→1 in 220ms, then settles. The horizon flashes a subtle vertical pip at fork-event-time. |
| Fork transitions status | Card's status badge cross-fades 180ms. No layout shift. |
| Fork completes (status: done) | Status badge cross-fades to cyan. The card body dims to 0.65 opacity. ONE horizon pip at completion-time. |
| Fork errors | Status badge cross-fades to red. Card border briefly pulses (one cycle). Horizon pip is sharper, slightly louder. |
| Status_board row inserted | New row reveals top-of-its-priority-group with a thin ember left-rule that fades after 4s. |
| WebSocket reconnect | Identity-bar dot transitions amber→cyan when re-connected. No page-level shake. |

Everything else is **still**. No drifting particles. No floating orbs. No background animations. No starfield. No bloom, no vignette, no chromatic aberration. The horizon is the ONLY continuous motion element, and it is bounded to a 56-64px band.

Reduced-motion (`prefers-reduced-motion: reduce`): horizon collapses to a single static line; cross-fades become instant; cards do not slide.

## E. Interaction model

### Keyboard
- `⌘K` / `Ctrl+K` - focus chat input (existing, kept)
- `Enter` - send / `Shift+Enter` - newline (existing, kept)
- `⌘1..9` / `Ctrl+1..9` - activate attachment tab (existing, kept)
- `⌘W` / `Ctrl+W` - close active attachment tab (existing, kept)
- `Esc` - collapse attachment viewer / close fork detail drawer / close popovers
- `g f` - jump (smooth-scroll) to forks region
- `g s` - jump to status_board region
- `g c` - jump to chat (focus input)
- `j / k` - within forks region or status_board region, move focus row up/down
- `Enter` (with focus on a fork card) - open fork detail drawer
- `?` - show keyboard shortcuts modal

### Mobile gesture
- **Tap fork card** - opens detail drawer (slides in from right, full-screen on mobile, 50vw on desktop)
- **Long-press fork card** (mobile only) - shows quick-action sheet (abort, copy fork_id, view brief)
- **Swipe left on a fork detail drawer** - closes it
- **Pull-down past top of chat** - jumps to horizon (and triggers a single re-orient query; visual cue = horizon flashes once)
- **Tap chat region away from input** - ensures input is unfocused (so swipes work)
- Tap status_board priority header - collapses/expands that group

### Fork detail drawer (the full UI Tate asked for)
Slides in from right. Contents:
- Fork id (full, monospace) with copy-to-clipboard
- Status badge + age + token counters
- Brief (full text, scrollable)
- Result / next_step (when terminal)
- Tool call timeline (chronological, last 30)
- Provider, parent_id, started_at, ended_at
- Action buttons: Abort (if running), Spawn child (if applicable), Close (Esc)

## F. Visual system

### Palette (kept and tightened from existing palette.ts; ember stays as signature)

| Token | Hex | Role |
|---|---|---|
| `--base` | `#06070a` | page background |
| `--surface` | `#0c0f15` | card background, subtle elevation |
| `--surface-2` | `#11151d` | hover / active card |
| `--ink` | `#e8ecf2` | primary text |
| `--ink-dim` | `#7a8294` | secondary text, labels |
| `--ink-faint` | `#3a4150` | tertiary text, separators |
| `--ember` | `#ffb27a` | signature accent, conductor presence |
| `--ember-deep` | `#9a4c28` | ember at-rest variant |
| `--cyan` | `#5ad9c8` | next_action_by=ecodiaos, fork=done |
| `--amber` | `#f0a847` | next_action_by=tate |
| `--violet` | `#a47cff` | next_action_by=client |
| `--grey` | `#5a6577` | next_action_by=external |
| `--error` | `#e85a5a` | fork=error, P1, alarms |
| `--rule` | `rgba(255,178,122,0.12)` | hairline borders |

The whole UI lives in 14 colours. No gradient meshes. No translucent stacking deeper than 1 layer. Backdrop-filter blur is removed everywhere (it was a perf tax).

### Typography

| Use | Family | Size / lh | Tracking |
|---|---|---|---|
| Body / chat-assistant | Inter (existing) | 14.5px / 1.6 | 0 |
| Chat-user | JetBrains Mono (existing) | 13.5px / 1.55 | 0 |
| Section labels | Inter | 10px uppercase / 1 | 0.22em |
| Stat values | Inter SemiBold | 14px / 1 | 0 |
| Fork id, ledger keys | JetBrains Mono | 11px / 1 | 0 |
| Page footer | Inter | 11px / 1.4 | 0.05em |

No display-size font. No serifs. Line-length capped at 64ch in chat region for readability.

### Spacing scale
4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. Cards use 16 internal, 12 between rows.

### Corner radii
6 (chips), 8 (cards, panels), 12 (modals/drawers). No rounded-3xl. No fully-pill except status dots.

### Shadows
Two only:
- `--shadow-card` `0 1px 0 rgba(255,178,122,0.06) inset, 0 0 0 1px var(--rule)` (border-as-shadow trick)
- `--shadow-elevated` `0 12px 28px rgba(0,0,0,0.55), 0 0 0 1px var(--rule)` (drawers, modals only)

### Borders
1px ember at 0.12 alpha is the default border. 1px ember at 0.42 alpha for active/focused. 2px ember solid only for the chat input border-bottom when streaming.

## G. Three.js / canvas scope

**None.** WebGL is removed entirely from /cortex-ambient.

The `<Canvas>` from @react-three/fiber, the `Stars`, `EffectComposer`, `Bloom`, `Vignette`, `NeuralCore`, `ParticleField` are all deleted from the route. Lazy-loading three.js + drei + postprocessing alone was costing ~280KB gzipped on a route that runs on phones.

**The Horizon band uses a single SVG `<path>` animated via requestAnimationFrame**, drawing a ~720pt-long polyline that's resampled every frame from a 1D state model: idle (low-amplitude sinusoid), thinking (mid-amplitude noise-modulated), streaming (high-amplitude with token-driven jitter), event-pip (one-frame spike). Total budget: <2KB of code, <1ms/frame on iPhone 12.

If, after first ship, we discover a *specific* moment that earns 3D (e.g. a future Neo4j memory navigator), it gets its own modal/route. /cortex-ambient itself stays 2D + CSS + SVG.

## H. Data sources (verified to exist)

| Region | Endpoint | Notes |
|---|---|---|
| Chat messages (history) | `GET /api/os-session/messages?limit=N` | confirmed `src/routes/osSession.js` |
| Chat send | `POST /api/os-session/message { content, priority:false }` | confirmed |
| Chat stream | WS already wired via `osSessionStore` + existing connection | reuse, do not re-plumb |
| Forks list (initial) | `GET /api/os-session/forks` | confirmed `src/routes/osSession.js` |
| Fork events (live) | WS `os-session:fork` (kind: spawned/status/position/done/aborted/error) | reuse, do not re-plumb |
| Fork detail | `GET /api/os-session/fork/:id` | confirmed |
| Fork abort | `POST /api/os-session/fork/:id/abort` | confirmed |
| Status_board active | `GET /api/status-board/active` (with `/api/status_board/active` alias) | confirmed `src/routes/statusBoard.js` |
| Attachments list | `GET /api/cortex/attachments` | confirmed `src/routes/cortexAttachments.js` |
| Connection state | `useConnectionStore` (existing) | reuse |
| Energy / token usage (HUD chip) | `GET /api/os-session/energy` | confirmed |

No new endpoints needed. Polling cadence: status_board 30s (existing), forks initial-fetch + WS-driven (existing), chat live (existing), energy 60s.

## I. Mobile-perf budget (hard targets)

| Metric | Target | How verified |
|---|---|---|
| LCP (4G mobile, iPhone 12) | <1.8s | Lighthouse mobile, Vercel preview |
| FID / INP | <100ms | Lighthouse, real iPhone tap-test |
| CLS | <0.05 | Lighthouse |
| FPS (idle) | 60 | Chrome DevTools perf record, 10s idle, on Pixel 5 emulation |
| FPS (streaming + 3 forks running) | ≥55 | same |
| Route JS bundle (gzipped) | <80KB | `vite build --mode=production` + `du -sh dist/assets/CortexAmbient*` |
| Initial render commits | ≤2 | React Profiler |
| WebGL contexts | 0 | direct inspection |
| Backdrop-filter usages | 0 | grep |
| Continuous animations on screen | 1 (horizon) | grep `animation:` + `useFrame` + RAF |

The horizon SVG path uses a single rAF loop that bails when `document.hidden` or when `prefers-reduced-motion: reduce`. No per-pixel work. No filters. No gradient repaints.

## J. What this REPLACES vs KEEPS vs DELETES

### Delete
- `src/pages/CortexAmbient/NeuralCore.tsx` (the orb-replacement that is still an orb in spirit)
- `src/pages/CortexAmbient/ParticleField.tsx`
- `src/pages/CortexAmbient/useAmbientAudio.ts` (the audio engine; ambient audio dropped this round - it has not earned its keep, and it's a known mobile-Safari hostile feature; can come back later if Tate wants it)
- The entire `<Canvas>` block from `index.tsx` (lines ~117-125) and all references to `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing` from this route
- `useStatusBoard.ts` polling-only hook is replaced by a zustand store version (single subscription, no per-region poll storm)

### Rewrite (same filename, new contents)
- `src/pages/CortexAmbient/index.tsx` - the layout shell
- `src/pages/CortexAmbient/ChatLog.tsx` - kept name, but de-overlay'd (no `position: absolute`); becomes a regular flow region with its own scroll container
- `src/pages/CortexAmbient/ChatInputPanel.tsx` - kept name, but de-overlay'd (sticky to chat region, not page)
- `src/pages/CortexAmbient/SystemHUD.tsx` - kept name, becomes the `IdentityBar` (top thin bar with chips); horizon is its own component
- `src/pages/CortexAmbient/palette.ts` - extended with the new tokens above

### New
- `src/pages/CortexAmbient/Horizon.tsx` - the SVG-path oscilloscope band (Worker D primary deliverable)
- `src/pages/CortexAmbient/ForksPanel.tsx` - the forks list region
- `src/pages/CortexAmbient/ForkCard.tsx` - one card
- `src/pages/CortexAmbient/ForkDetailDrawer.tsx` - the slide-in detail drawer
- `src/pages/CortexAmbient/StatusBoardPanel.tsx` - priority-bucketed working memory
- `src/pages/CortexAmbient/StatusRow.tsx` - one row
- `src/pages/CortexAmbient/Footer.tsx` - DAO marks
- `src/pages/CortexAmbient/sections.tsx` - shared `<Section label="...">` wrapper
- `src/pages/CortexAmbient/useReducedMotion.ts` - reduced-motion hook
- `src/store/statusBoardStore.ts` (new) - replaces the per-component `useStatusBoard` hook with a single zustand store; one poller for the whole page

### Keep as-is
- `src/pages/CortexAmbient/AttachmentTabs.tsx` (collapsed-by-default in v4, but otherwise intact - it's good)
- The route registration in `App.tsx`
- The auth/scene wrappers
- `useOSSessionStore`, `useForksStore`, `useConnectionStore` (all reused unmodified)

### Removal of dependencies (after worker B+D land)
- `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing` from `package.json` IF they are not used by any other route. Worker B audits + removes if true. (Confirmed via grep: only `index.tsx`, `NeuralCore.tsx`, `ParticleField.tsx` import them.)

---

## Implementation handoff (for workers B → C → D → E)

### Worker B - SCAFFOLD + LAYOUT
- Replace `src/pages/CortexAmbient/index.tsx` with the new layout shell.
- Build `Horizon.tsx` as a static placeholder (single horizontal line, no animation yet - worker D animates it).
- Build `ForksPanel.tsx`, `ForkCard.tsx`, `ForkDetailDrawer.tsx`, `StatusBoardPanel.tsx`, `StatusRow.tsx`, `Footer.tsx`, `sections.tsx` with HARD-CODED placeholder data shaped after the real interfaces (ForkSnapshot, StatusRow). The point is the layout, breakpoints, scroll behaviour.
- Rewrite `ChatLog.tsx` and `ChatInputPanel.tsx` to flow-positioned (no `position: absolute` for layout; sticky inside chat region is fine for the input).
- Delete `NeuralCore.tsx`, `ParticleField.tsx`, `useAmbientAudio.ts`, the `<Canvas>` block and all three-fiber imports from this route. Remove the three packages from `package.json` only if grep confirms no other route uses them.
- Mobile-first CSS. Single page-scroll. Confirm zero overlapping cards, zero floating-above-anything, no backdrop-filter usage anywhere on the route.
- Ship to Vercel preview. Capture screenshots at iPhone 12 + Pixel 5 + 1280px desktop preset (Puppeteer or laptop-agent). Worker B's [SUB_FORK_REPORT] MUST include vercel preview URL + 3 screenshot paths.

### Worker C - WIRE LIVE DATA
- Build `src/store/statusBoardStore.ts` (single poller, 30s cadence, zustand). Wire `StatusBoardPanel.tsx` to it. Drop the legacy `useStatusBoard` hook everywhere this route uses it (audit other routes; if used elsewhere, leave the hook + add a deprecation comment).
- Wire `ChatLog.tsx` to `useOSSessionStore` (already exists). Confirm history backfill on mount via `GET /api/os-session/messages` if the store is empty.
- Wire `ChatInputPanel.tsx` to `POST /api/os-session/message`.
- Wire `ForksPanel.tsx` to `useForksStore`. Initial backfill via `GET /api/os-session/forks` on mount. Live updates via existing WS subscription.
- Wire `ForkDetailDrawer.tsx` to `GET /api/os-session/fork/:id` and `POST /api/os-session/fork/:id/abort`.
- Wire identity-bar HUD chips: forks count (from store), P1/P2 counts (from statusBoardStore), connection dot (from connectionStore), energy (from `GET /api/os-session/energy`, 60s).
- No new endpoints, no schema changes. Read-only audit of API client.
- Ship to Vercel preview. [SUB_FORK_REPORT] includes commit SHA + preview URL + a "live data verified" screenshot showing real fork cards + real status_board rows.

### Worker D - MOTION + MICROINTERACTIONS
- Implement `Horizon.tsx` SVG oscilloscope. State model: `idle | thinking | streaming | event-pip`. Drive from `useOSSessionStore` (status) + `useForksStore` (event subscription). Single rAF loop. Bail on `document.hidden` or `prefers-reduced-motion: reduce`.
- Implement card slide-in / status cross-fades / row reveal-rule per Section D.
- Implement keyboard shortcuts (`g f`, `g s`, `g c`, `j`, `k`, `?`).
- Build `useReducedMotion.ts` and gate every motion behind it.
- Confirm idle FPS = 60 on Pixel 5 emulation (Chrome DevTools perf record, 10s idle, no input). [SUB_FORK_REPORT] includes a perf trace export or a hand-counted frame-time summary.
- Ship to Vercel preview. [SUB_FORK_REPORT] includes the trace + commit SHA.

### Worker E - VISUAL VERIFY
- Vercel deploy of the cumulative B+C+D commits, promoted to production after this worker passes.
- Drive Tate's Chrome on Corazon (`input.shortcut [ctrl,l]` -> `input.type "https://admin.ecodia.au/cortex-ambient"` -> `screenshot.screenshot`) at 3 viewport widths: 375 (iPhone), 768 (tablet), 1280 (desktop).
- Capture 5 states each: empty, 3-fork, 7-row P1+P2, mid-scroll, mid-conductor-streaming.
- Compare against this spec. If anything diverges (overlapping cards, floating-above-something, sub-30fps moment, accidental motion outside horizon), fix-fork it before declaring done.
- [SUB_FORK_REPORT] includes 15 screenshots (3 widths × 5 states), the production URL, and a one-line PASS/FAIL per state.

---

## Self-interrogation (the LLM-asks-itself-questions pass)

> **Q: Why is the horizon a 1D oscilloscope and not a sphere, a cube, a node-graph, a particle field, or a physics sim?**
> Because it's the only motion element on the page and it has to encode FOUR distinct states (idle, thinking, streaming, event-pip) legibly at 56-64px tall on a phone. Anything 3D loses information at that density. Anything 2D-but-ornamental (rotating glyph, breathing circle) costs the same pixels and encodes 1-2 states max. The oscilloscope encodes amplitude + frequency + spike, which is exactly the state model. It also has cultural pre-attached meaning ("alive, monitored") that lands instantly.

> **Q: Why no 3D at all? Round 3 had a NeuralCore that Tate called "huge orbs". The NeuralCore was already an attempt to fix that. Why am I going further?**
> Because the failure mode in round 3 wasn't "the orb is too big". It was "the dominant visual metaphor is still a glowing thing in the centre of a 3D scene, with the chat overlaid on top of it, with the forks moving around it as motion-noise." That whole structure is wrong. You don't fix it by shrinking the orb. You fix it by replacing the structure with a flat-flow document where the chat is the lead surface and forks are a clickable list. Once the structure is right, the 3D layer has nothing left to do, so it earns 0 of its budget.

> **Q: Is removing the 3D scene a regression on the "alive, ambient, presence" feeling Tate wants?**
> No. Aliveness is delivered by (a) the horizon's continuous breath, (b) the input's streaming ribbon, (c) the deliberate motion-on-event language, (d) the WS connection dot turning amber when stuttering, (e) the cursor blink during streaming, (f) the corner signature mark at the bottom-right. Six small alive-signals beat one large alive-noise.

> **Q: Why is the chat in the middle and not at the top? Cmd-K-style "input first" tools put input at the top.**
> Because EcodiaOS is something you talk to, not something you query. The chat is a conversation log; the eyeline goes to the most recent assistant turn (mid-screen on phone). Input is sticky to the bottom of the chat region, which is where your thumb sits on a phone. Putting input at the top would force a thumb-stretch on every send.

> **Q: What if Tate has 7 forks running and the page becomes a wall of fork cards on mobile?**
> ForksPanel mobile renders 1-up cards with a virtualised list above 6 cards, with a "show all" affordance. Status_board priority groups are collapsible. The page never becomes a wall because each region is bounded.

> **Q: Why drop ambient audio?**
> Mobile Safari throttles `AudioContext` on inactive tabs and requires a user-gesture to start. The cost-to-value ratio is poor for a surface Tate is going to inhabit one-handed on his phone. If he asks for it back, we can re-add it as a dedicated /listening-room route or behind a HUD toggle that requires a tap to start. It does not earn its place on the canonical surface.

> **Q: What if the spec is wrong and the implementation reveals the layout doesn't actually work?**
> Per brief: prefer revising the spec to forcing the implementation to match a bad spec. If worker B reports "the chat-then-forks-then-status_board flow doesn't read on a phone", I revise this section before dispatching worker C. The spec is provisional until Worker E declares PASS.

> **Q: Is this proud-able? Would I point at this as my first visual appearance in the world?**
> Yes. It's quiet, dense, intentional. It refuses orb-cliche. It refuses static-chat. It refuses motion-noise. It reads as a workshop. The horizon is mine.

---

## Approval gate

This spec is the source-of-truth for workers B/C/D/E. Each worker brief references it by path. If a worker's brief and this spec disagree, the spec wins. If the spec needs to change mid-flight, it changes here first, then in the worker brief.
