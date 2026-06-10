# Chambers App Store Readiness Audit
**Date:** 2026-05-05 | **Author:** fork_moshyat8_0db997 | **Codebase:** chambers-frontend (commit `90bd201` on main, Vercel production)

---

## Verdict: GO-WITH-CAVEATS

The Chambers app is broadly production-ready and could be submitted to the App Store today. Code quality is consistently high, the multi-tenant architecture is clean, and the visual design system is comprehensive. Three caveats need fixing before submission (one critical, one moderate, one minor).

---

## 1. Multi-Tenant Experience: ✅ STRONG

**Mechanism:** TenantProvider resolves via 5-route fallback chain:
1. `?tenant=X` query param (sticky in localStorage) — used for demos
2. `chambers.tenantOverride` localStorage — from demo param
3. `active_chamber` localStorage — from chamber switcher
4. Subdomain stripping (`.chambers.ecodia.au`, `.chambers.app`, `.ecodia.au`)
5. `VITE_DEFAULT_TENANT` env var — falls back to `scycc`

**Chamber switching (F7, ae0bcbf):** `switchChamber(slug)` writes to `active_chamber` in localStorage and does `window.location.reload()`. The reload is honest — clears React Query caches, re-resolves TenantProvider, reapplies brand tokens. The `kv_user_chambers` view + `idx_tenant_members_active_user` index support the query efficiently. AppShell dropdown renders only when `chambers.length > 1`.

**Gap (moderate):** `scycc.chambers.ecodia.au` has no DNS record. `chambers.ecodia.au` resolves correctly (Vercel CNAME). The subdomain tenant resolution code is correct and ready, but the DNS/Vercel wildcard domain `*.chambers.ecodia.au` is not configured. Until this is set up, per-tenant subdomain routing won't work — only `?tenant=X` and localStorage-based switching are functional in production.

**Hard reload:** Slightly jarring but honest. Acceptable for v1. Can be replaced with React-Query-cache-flush + in-place TenantProvider re-resolve in a future version.

---

## 2. Per-Chamber Customization: ✅ COMPREHENSIVE

BrandingAdmin.tsx covers all declared customization surfaces:

| Surface | Status |
|---------|--------|
| Tagline | Renders in header strip |
| Mission | Renders on Home section |
| 3 brand colors (primary/secondary/accent) | Applied via CSS custom properties, fallback chain intact |
| Logo URL | Renders in Home hero + AppShell header |
| Hero image URL | Renders as background with gradient overlay on Home |
| Hero headline + subheadline | Renders, subheadline dedup check against name |
| Footer tagline | Renders in footer social bar |
| Contact (email/phone/address) | Renders as card-based contact section with mailto/tel |
| 9 social platforms | Renders as icon links in footer |
| Currency / Timezone / Locale | Stored, available for billing/formatting |
| Meta title + description | Stored, rendered via react-helmet or similar |

Validation: hex colors validated via `#RRGGBB` regex, email validated, length limits enforced on all text fields.

---

## 3. Visual Quality / Production Readiness: ✅ HIGH

**Design system (globals.css):** Tailwind v4 + `@tailwindcss/vite` plugin. Full token set:
- **Shadow tokens:** `--shadow-card-soft`, `--shadow-card-hover`, `--shadow-card-elevated` — 144 card borders replaced with shadows (F2)
- **Typography scale:** 7-step tokenized scale (caption 12px → display 36px) with utility classes. All arbitrary `text-[Npx]` removed (F2)
- **Status palette:** `--status-success/warn/danger/neutral-{bg,fg}` tokens. Zero raw status hex remaining in pages/ (F2)
- **Button system:** `.btn-base` with `focus-visible` ring (2px primary + 2px offset), `active:scale-[0.975]` press animation
- **Skeleton loading:** Shimmer animation for loading states
- **Splash screen:** Capacitor config zero-show-duration

**Recent commits (all merged to main):**
| Commit | Feature | Status |
|--------|---------|--------|
| 61c618c | F1: baseline polish (13 gaps) | Merged |
| 69fcf37 | F2: visual polish + design system migration | Merged |
| 14332a2 | F3: events flow + cover + RSVP optimistic + avatar strip | Merged |
| 4130917 | F4: haptics wiring | Merged |
| e47b6a7 | F5: admin config + tenant column expansion | Merged |
| 447ee5d | F6: sign-up flows + onboarding polish | Merged |
| 7e44d79 | F6-payments: subscription tier + email verification gate | Merged |
| ae0bcbf | F7: chamber switching multi-tenant UI | Merged |
| 90bd201 | F8: privacy + terms static screens | Merged (current HEAD) |

---

## 4. Animations: ✅ GOOD (room to grow)

**Route-level:** `PageFrame` wraps every route in `<AnimatePresence mode="wait">` with `motion.div` — opacity 0→1, y 8→0, 0.22s cubic-bezier transition. `useReducedMotion()` respected.

**Page-level:**
- Home: upcoming events grid has staggered children (0.06s delay, spring physics: stiffness 320, damping 26)
- Events: card grid has the same stagger pattern
- Admin modals (EventsAdmin, CommitteesAdmin): slide+fade spring animations on open/close
- All CTAs: `active:scale-[0.975]` on press
- Profile StatusBadge: animates on status change
- Skeleton shimmer: CSS keyframe animation

**Gap (minor):** Component-level animations are good but conservative. There's room for more micro-interactions: card entrance animations on Members/Resources pages, list item mount transitions, header scroll effects. The existing base is solid and won't embarrass the app at review time.

---

## 5. H2 Feedback Page: ⚠️ NOT MERGED

**Branch:** `feat/h2-feedback` at `956aba7` (10 files changed, +176 lines)
**File:** `src/pages/Feedback.tsx` — in-app feedback form that sends via `send-email` Supabase Edge Function

The feedback page is NOT on main. App.tsx on main does NOT import or route to Feedback.tsx (no broken build). The branch is well-written and should be merged after verifying:
1. The `send-email` Edge Function exists and is deployed in the chambers Supabase project
2. The Edge Function's access token / anon key flow works as expected

**Recommendation:** Merge to main after Edge Function verification. The feedback feature is lightweight and provides real value (in-app user feedback channel), but is not a v1 App Store blocker.

---

## 6. iOS-Specific Issues

| Item | Status | Details |
|------|--------|---------|
| Bundle identifier | ✅ Correct | `au.ecodia.chambers` |
| Marketing version | ✅ Set | `1.5` |
| Build number | ✅ Set | `2` |
| App name in Info.plist | ❌ **WRONG** | Says **"Co-Exist"** in `CFBundleDisplayName` — leftover from template. Must change to "Chambers" |
| Capacitor config | ✅ Correct | appId, appName, server allowNavigation, plugin config all correct |
| Google Sign-In | ✅ Configured | GIDClientID present in Info.plist |
| iOS deploy target | Needs check | Need to verify minimum iOS version in Xcode project |
| Screenshots | Needs check | App Store Connect requires screenshots for submission |
| Privacy policy | ✅ Exists | `/privacy` route served, privacy_admin page in admin |
| Terms of service | ✅ Exists | `/terms` route served |

**Critical pre-submission fix:** Change `CFBundleDisplayName` from "Co-Exist" to "Chambers" in `ios/App/App/Info.plist`. This would cause the app to show the wrong name on the App Store and on users' home screens.

---

## 7. Gap Log (Prioritized)

| # | Severity | Gap | Fix |
|---|----------|-----|-----|
| 1 | 🔴 Critical | `CFBundleDisplayName` = "Co-Exist" not "Chambers" | Edit `ios/App/App/Info.plist` |
| 2 | 🟡 Moderate | `*.chambers.ecodia.au` wildcard DNS not configured | Add wildcard CNAME to Vercel or configure per-tenant subdomain in Vercel project settings |
| 3 | 🟢 Minor | Chamber switch hard-reloads page | Future: in-place tenant re-resolve without full reload |
| 4 | 🟢 Minor | H2 Feedback page not merged | Merge `feat/h2-feedback` after Edge Function verification |
| 5 | 🟢 Minor | Marketing version 1.5 may need updating for initial release | Set to 1.0 if this is the first App Store submission |
| 6 | 🟢 Info | No iOS screenshots captured for App Store listing | Need iPhone + iPad screenshots for App Store Connect |

---

## 8. Admin Access: ✅ ALREADY DONE

Tate Donohoe (auth user `625b60ca-a01a-4643-a0d4-e169865f9a4e`, email `tate@ecodia.au`) is already `president` (highest role) on both tenants:

| Tenant | Role | Status |
|--------|------|--------|
| SCYCC (`22097453-...`) | president | active |
| Sample Chamber (`91eb0dc1-...`) | president | active |

The `president` role passes the `is_officer()` check (role IN ('officer', 'admin', 'president') AND status = 'active') and can access all admin surfaces.

---

## 9. Overall App Store Readiness by Category

| Category | Score | Notes |
|----------|-------|-------|
| Functionality | 9/10 | Multi-tenant, events, members, RSVP, profile, admin, privacy/terms |
| Visual Design | 8/10 | Strong design system, consistent tokens, some pages simpler than others |
| Performance | 8/10 | Code splitting, lazy loading, vendor chunk splitting, no obvious perf issues |
| iOS Integration | 6/10 | Capacitor config correct, but bundle display name wrong, no screenshots |
| Accessibility | 8/10 | Focus-visible rings, prefers-reduced-motion, semantic aria labels in modals |
| Completeness | 8/10 | Core flows all present, H2 feedback missing, no show-stoppers |

**Bottom line:** Fix the "Co-Exist" display name (5-minute edit), configure the wildcard DNS for subdomain routing (30-minute Vercel config), and the app is ready for App Store submission. The codebase is production-quality across all assessed dimensions.
