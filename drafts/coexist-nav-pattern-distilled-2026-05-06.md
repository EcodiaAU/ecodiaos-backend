# Co-Exist nav pattern — distilled (2026-05-06)

Studied for Chambers port (fork_motc41lm_f3e85d). Source files:
- src/components/bottom-tab-bar.tsx
- src/components/app-shell.tsx
- src/components/admin-layout.tsx
- src/components/leader-layout.tsx
- src/components/unified-sidebar.tsx (the side-sheet host)
- src/hooks/use-menu-sheet.tsx
- src/hooks/use-layout.ts
- src/lib/admin-motion.ts

## Bottom tab bar
- Floating ROUNDED CARD (`mx-4 rounded-[20px] bg-white shadow-sm`), positioned `fixed bottom-0` with `z-50`. Not edge-to-edge — there's a 16px gutter on each side. Pointer-events split: outer wrapper `pointer-events-none`, the nav `pointer-events-auto` so taps outside still flow to content.
- Height `h-[56px]`. Items inside `flex items-center justify-around`.
- 4 tabs (member): Home + 2 context + More. The "More" tab does NOT navigate — it calls `onMorePress` which opens the side sheet. `isMore: true` flag on the tab marks it.
- Active visual: framer-motion `motion.span` with `layoutId="${prefix}-pill"` rendered ONLY for the active tab. Spring `{ stiffness: 400, damping: 30, mass: 0.7 }`. Pill animates between tabs as the active item changes — that's the signature visual.
- Active text colour: `text-primary-800` (or moss accent variant). Inactive `text-neutral-400/70`.
- Reduced-motion respected via `useReducedMotion()`.
- Safe-area bottom: `mb-[var(--safe-bottom,0px)]` + Android margin fallback `max(env(safe-area-inset-bottom, 0px), 16px)`.
- Customisable: `tabs` prop, `layoutPrefix` (so admin / leader / member tab bars don't share layoutId and animate into each other), `accent` ('primary'|'moss').
- `accent` swaps active text/pill colour but preserves the same shape.

## Side sheet (MobileSidebarOverlay in unified-sidebar.tsx)
- Slides in from RIGHT: `fixed top-0 right-0 bottom-0`, motion `initial={{ x: '100%' }} animate={{ x: 0 }}`. Spring `{ stiffness: 380, damping: 34, mass: 0.7 }`.
- Width: `w-[min(84vw,360px)]`. Background `bg-white`, `shadow-xl`, full height.
- Backdrop: separate `motion.div` `fixed inset-0 bg-black/50`, fades 0→1 in 0.22s. Click backdrop = close.
- Mounted via `createPortal(..., document.body)` and wrapped in `<AnimatePresence>` so exit anim runs.
- Dismissal: backdrop click + Escape key (`document.addEventListener('keydown', ...)`) + visible Close button (X icon, 11×11 rounded square top-right). No swipe gesture.
- Focus management: traps Tab inside the sheet, focuses sheet root on open, restores prior focus on close, locks `document.body.style.overflow = 'hidden'` while open.
- Layout inside the sheet, top→bottom:
  1. Brand strip (logo wordmark centered, X close button right)
  2. Profile card (avatar + display name + ChevronRight) → /profile
  3. Scrollable nav list (categories + items, each with icon + label)
  4. Footer with Settings link
- Auto-closes on `location.pathname` change.

## Menu sheet hook
- Tiny context: `{ open, openMenu, closeMenu, toggleMenu }`. Provider wraps app once.
- BottomTabBar's More button calls `openMenu`, side sheet reads `open` and renders accordingly. Single source of truth.

## App shell composition
- `useLayout()` returns `navMode: 'bottom-tabs' | 'sidebar'` from viewport size + Capacitor native flag (mobile<640 or native = bottom-tabs; desktop ≥1024 = sidebar; tablet matches desktop unless native).
- AppShell wraps children in `<MenuSheetProvider>`. On bottom-tabs mode: render `<BottomTabBar onMorePress={openMenu} />` + `<MobileSidebar />` (the overlay). On sidebar mode: render permanent left sidebar.
- Bottom tab bar suppressed on certain routes (admin/leader/chat-detail) AND when keyboard open.
- Admin and Leader layouts have their OWN context-specific bottom tab variants with different items but same shape. They share the BottomTabBar component via `tabs` prop.

## Animation library
- framer-motion (already in chambers-fe).
- Core primitives: `motion.div`, `motion.button`, `motion.span` with `layoutId` for shared element transitions, `AnimatePresence`, `useReducedMotion`.
- Spring constants for drawer: `{ type: 'spring', stiffness: 380-420, damping: 30-36, mass: 0.7-0.8 }`.

## Key transplant for Chambers
- 4 tabs: Home / Events / Groups / More. Members + Resources + Feedback + Profile + Admin all move INSIDE the side sheet. Officer-only items appear conditionally in side sheet, never in bottom dock.
- Same drawer-from-right pattern. Trigger differs by viewport: More tab on mobile, hamburger button on desktop. Side sheet is the SINGLE nav surface for non-primary items at every viewport.
- Use chambers' existing CSS-variable theming (`var(--color-primary)`, `var(--color-foreground)`, etc) instead of Co-Exist's tailwind palette tokens.
- Reuse `useMyMember` officer check that already exists in DesktopTopNav.
- Don't carry over Co-Exist's brand strings, logos, colours, or "leader/admin/main" suite-switcher complexity (chambers doesn't have that hierarchy).
