# Wild Mountains v1 - TestFlight Scope
**Date:** 2026-05-12
**For:** Worker 2 (implementation) + Worker 3 (build/upload)
**Fork:** fork_mp21c4m4_e5b2aa

---

## Stack

- Next.js 14.2.29 + TypeScript + Tailwind CSS 3 + Capacitor 6
- Static export (`next.config.mjs` has `output: 'export'`, `webDir: 'out'`)
- Supabase SSR already wired (auth middleware present)
- Repo: `EcodiaTate/wildmountains-frontend`
- Deploy target: Vercel (URL referenced in capacitor.config.ts as `https://wildmountains.vercel.app`)

## Bundle ID

- **Target:** `org.wildmountains.app` (confirmed Tate 12:46 AEST 12 May)
- **Current in repo:** `au.wildmountains.ecodia` - MUST be updated in `capacitor.config.ts`
- Apple Team: `86PUY7393S` (Ecodia Pty Ltd)
- App version: `0.1.0` build `(1)`

---

## Existing Scaffold State: OVERHAUL (not rebuild)

The scaffold is structurally sound. Keep all technical infrastructure. Replace all content.

**Keep:**
- `package.json` (all deps correct, no changes needed)
- `next.config.mjs`, `tsconfig.json`, `postcss.config.mjs`
- `src/middleware.ts` (Supabase auth routing is correct)
- `src/app/login/` (auth flow)
- `src/app/app/layout.tsx` (tab nav structure, needs content updates only)
- Tailwind config structure (update color hex values, see below)

**Overhaul (rewrite content, keep file path):**
- `capacitor.config.ts` - bundle ID update + verify server URL
- `tailwind.config.ts` - update color palette hex values
- `src/app/layout.tsx` - update root metadata title/description
- `src/app/(marketing)/layout.tsx` - update nav links
- `src/app/(marketing)/page.tsx` - full content rewrite (currently hiking/trail SaaS - wrong)
- `src/app/(marketing)/about/page.tsx` - full content rewrite
- `src/app/(marketing)/contact/` - repurpose as Get Involved (`/get-involved`)
- `src/app/(marketing)/pricing/` - repurpose as Events (`/events`)
- `src/app/app/page.tsx` - rewrite as Member Portal dashboard

**Add (new routes):**
- `src/app/(marketing)/programs/page.tsx` - Conservation Programs (new)

**Remove/ignore:**
- `/pricing` as pricing (repurpose to `/events`)

---

## Brand Assets Status

**No assets found.** Corazon laptop-agent unreachable during probe (timeout). No WM logo, photos, or brand files staged on D:\.code.

Worker 2 uses code-only fallback: SVG mountain mark inline, gradient hero backgrounds, no external image dependencies. App must be fully functional and presentable without any image files.

---

## Color Palette

Update `tailwind.config.ts` hex values. Keep existing CSS variable names (`wm-green`, `wm-snow`, etc.) so existing classNames continue to work.

```ts
colors: {
  wm: {
    green: {
      DEFAULT: '#2D4A22',   // forest green (was #2D5016)
      light: '#3D6030',     // mid green (was #4A7C2F)
      dark: '#1C2E14',      // deep forest (was #1A2E0D)
    },
    gold: {
      DEFAULT: '#C9A84C',   // ADD - warm gold accent
      light: '#DFC06A',
      dark: '#A88530',
    },
    stone: {
      DEFAULT: '#8B7355',   // keep - used for borders/muted
      light: '#C4A882',
      dark: '#5C4A35',
    },
    snow: '#F5F0E8',         // warm off-white (was #F8F6F2)
    charcoal: '#1C1C1C',    // unchanged
  },
},
```

Typography: Geist Sans (already wired). For marketing headings, add `font-serif` class option - use `'Georgia', 'Cambria', serif` as fallback stack in fontFamily config.

---

## Screens (5 screens)

### 1. Home `/`
**File:** `src/app/(marketing)/page.tsx`

**Hero section:**
- Full-height (min-h-screen) gradient background: `wm-green-dark` to `wm-green`
- SVG mountain silhouette at bottom (keep existing SVG, it works)
- Headline: "Protecting mountain ecosystems. Together."
- Subheadline: "Wild Mountains is a conservation charity restoring and protecting the mountain ranges of South East Queensland - through citizen science, community action, and on-ground programs."
- Two CTAs: "Get involved" -> `/get-involved`, "Our programs" -> `/programs`
- NO fake stats ("4,200 trails mapped" etc. - that was the old wrong content)

**Impact numbers bar (real/plausible for a conservation charity of this scale):**
- `12,000+` ha of habitat protected
- `340+` volunteers active
- `18` conservation programs running
- `6` years of on-ground restoration

**Programs preview (3-column grid):**
- Bushfire Recovery | Koala Habitat | Citizen Science (cards with forest green bg)

**Mission statement section:**
- Quote/pull: "The Sunshine Coast hinterland holds some of Australia's most biodiverse mountain ecosystems. We're here to make sure it stays that way."
- Link to /about

**Get involved strip:**
- Dark green bg, headline "The mountain needs more hands", volunteer / donate / intern CTAs

### 2. Programs `/programs`
**File:** `src/app/(marketing)/programs/page.tsx` (NEW)

Six program cards in 2-column grid. Each card: title, icon (SVG or emoji), 2-sentence description, status badge ("Active" in gold).

| Program | Description |
|---|---|
| Bushfire Recovery | Revegetation and monitoring of fire-affected ridgelines and gullies across the Mary Valley catchment. Planting events monthly. |
| Koala Habitat Restoration | Corridor planting connecting isolated koala populations between Maleny and Kenilworth. 4,200 trees planted to date. |
| Citizen Science Surveys | Trained volunteers run quarterly wildlife transects, vegetation mapping, and water quality monitoring across 14 catchment sites. |
| Youth Conservation Corps | 12-week paid internship for 18-25 year olds. Combines on-ground restoration work with conservation science mentoring. |
| Landcare Partnerships | Working with private landholders on the range to manage weeds, restore riparian zones, and protect remnant vegetation. |
| Mountain Schools Program | Curriculum-linked excursions and in-school education for primary and secondary students in the Sunshine Coast region. |

Bottom CTA: "All programs are volunteer-supported. Join us." -> `/get-involved`

### 3. Get Involved `/get-involved`
**File:** `src/app/(marketing)/contact/page.tsx` (repurposed)

Three-panel layout on white background:

**Panel A - Volunteer:**
- "Become a conservation volunteer"
- Requirements: any fitness level, training provided, minimum 2 days/month
- What you'll do: planting days, monitoring surveys, community events
- CTA button (forest green): "Register as a volunteer" -> links to `/login` (auth gated in v1)

**Panel B - Donate:**
- "Support conservation on the ground"
- "Every dollar funds habitat restoration, citizen science, and youth programs."
- Registered charity - tax deductible donations (DGR status)
- CTA button (gold bg): "Donate now" -> `/login` (in v1, post-login donate flow placeholder)
- Note: "We're a company limited by guarantee, registered charity ABN [placeholder]"

**Panel C - Internships:**
- "Youth Conservation Corps - next intake July 2026"
- 12-week paid placement, 18-25 years
- Based in the Sunshine Coast hinterland
- Applications open now
- CTA: "Apply for an internship" -> `/login`

**Membership section** (below the three panels):
- Headline: "Become a member of Wild Mountains"
- $40/year individual | $65/year family | $200/year corporate supporter
- Members receive: quarterly e-newsletter, early event access, annual report, voting rights at AGM
- CTA: "Join as a member" -> `/login`

### 4. Events `/events`
**File:** `src/app/(marketing)/pricing/page.tsx` (repurposed to events)

**Upcoming Events** (chronological list, 5 synthetic realistic events):

| Date | Event | Location | Type |
|---|---|---|---|
| Sat 17 May 2026 | Community Planting Day - Obi Obi Creek | Kenilworth Showgrounds | Conservation |
| Sat 24 May 2026 | Citizen Science Training Workshop | Maleny Community Centre | Training |
| Sun 1 Jun 2026 | Koala Survey Transect - Lake Baroon | Lake Baroon Catchment | Citizen Science |
| Sat 14 Jun 2026 | Annual General Meeting 2026 | Sunshine Coast Function Centre | Governance |
| Sat 21 Jun 2026 | Youth Conservation Corps Open Day | Mapleton National Park | Internship |

Each event card shows: date (styled calendar chip in gold), event name, location, type badge, "Register" button.

**Past events section** below (collapsed/subtle):
- "View past events" link, 3 past events listed greyed out

**CTA strip**: "Never miss a Wild Mountains event - join as a member to get early access."

### 5. About `/about`
**File:** `src/app/(marketing)/about/page.tsx`

**Mission statement:**
"Wild Mountains exists to protect, restore, and connect the mountain ecosystems of South East Queensland. We are a registered charity, operating since 2020, working at the intersection of community action and conservation science."

**Our story section:**
- Founded by a coalition of landholders, scientists, and community members concerned about fragmentation of mountain habitat between the Sunshine Coast hinterland and the Mary Valley
- Fiscal year 2025: 340 volunteers, 12,000 ha of connected habitat, 18 active programs
- Conservation focus: koala corridors, native vegetation, water quality, fire management

**Leadership:**
- "Kurt Jones - incoming Chair from June 2026. Kurt brings deep roots in the Sunshine Coast conservation community and a decade of experience in natural resource management."
- (Note: no other leadership named in v1 - don't fabricate names)

**Charity structure:**
- Company limited by guarantee (no share capital)
- Registered with ACNC
- DGR Item 1 (donations tax deductible)
- Annual report available on request

**Conservation footprint map placeholder:**
- SVG or simple box showing the geographic range: "Sunshine Coast hinterland to Mary Valley, covering approx. 12,000 ha"

---

## Authenticated App - Member Portal `/app`

**File:** `src/app/app/page.tsx` (rewrite)

Post-login dashboard. Heading: "Your Wild Mountains"

**Dashboard cards (2x2 grid):**
- Upcoming events you're registered for (shows "No registrations yet - browse events" if empty)
- Volunteer hours this year (shows 0 with "Log a volunteering day" link)
- Programs you're following (shows 0 with "Explore programs" link)
- Membership status (shows "Guest - join as a member" if not yet member)

**Quick actions:**
- Find upcoming events -> `/events`
- Browse conservation programs -> `/programs`
- Update my profile -> `/app/profile` (stub - just links for v1)
- Contact the team -> `/get-involved`

**Navigation tabs (update `src/app/app/layout.tsx`):**
Replace current nav items (trails/plan/community) with: Home, Events, Programs, Profile

---

## Navigation (Marketing Layout)

Update `src/app/(marketing)/layout.tsx` nav links:

| Label | Route |
|---|---|
| Home | `/` |
| Programs | `/programs` |
| Events | `/events` |
| Get Involved | `/get-involved` |
| About | `/about` |
| Login / Member Portal | `/login` or `/app` |

---

## capacitor.config.ts - Required Change

```ts
const config: CapacitorConfig = {
  appId: 'org.wildmountains.app',   // CHANGED from au.wildmountains.ecodia
  appName: 'Wild Mountains',
  webDir: 'out',
  server: {
    url: 'https://wildmountains.vercel.app',  // Worker 3 verifies Vercel deploy exists
    cleartext: false,
  },
}
```

---

## Worker 2 Execution Checklist

Work in this order to avoid dependency issues:

1. `tailwind.config.ts` - update color palette (add wm.gold, update wm.green hex values, update wm.snow)
2. `capacitor.config.ts` - update appId to `org.wildmountains.app`
3. `src/app/layout.tsx` - update root title to "Wild Mountains - Conservation Charity"
4. `src/app/(marketing)/layout.tsx` - update nav links
5. `src/app/(marketing)/page.tsx` - full rewrite per Screen 1 spec above
6. `src/app/(marketing)/programs/page.tsx` - create new file per Screen 2
7. `src/app/(marketing)/contact/page.tsx` - rewrite as Get Involved per Screen 3
8. `src/app/(marketing)/pricing/page.tsx` - rewrite as Events per Screen 4
9. `src/app/(marketing)/about/page.tsx` - rewrite per Screen 5
10. `src/app/app/page.tsx` - rewrite as Member Portal per spec above
11. `src/app/app/layout.tsx` - update nav tabs (Events, Programs, Profile)
12. Run `next build` locally and verify 0 TypeScript errors before commit
13. Commit all changes, push to main

**Constraints:**
- No placeholder text, no "Coming Soon", no lorem ipsum anywhere
- No em-dashes in any content strings
- All CTAs that require auth link to `/login` in v1 - that is fine, the auth gating is already wired
- Keep the existing `src/app/globals.css` structure, just add any new CSS variables needed
- The Supabase client is already wired in `src/lib/` - do not remove or alter auth infrastructure
- Do NOT add image files - all visuals via SVG, gradients, Tailwind utility classes only
- Worker 3 needs: clean `npm run build` (0 errors), then they handle `npx cap sync ios` and Xcode/upload

---

## Worker 3 Handoff Note

After Worker 2 commits:
1. Pull latest `main` from `EcodiaTate/wildmountains-frontend`
2. Verify bundle ID in `capacitor.config.ts` reads `org.wildmountains.app`
3. `npm ci && npm run build` - must exit 0
4. `npx cap sync ios` - syncs to ios/ directory
5. Open in Xcode / use `xcrun altool` upload path per `~/ecodiaos/patterns/sy094-eos-mobile-headless-ship-recipe.md`
6. Target TestFlight - the ASC app record for `org.wildmountains.app` already exists
7. Version: 0.1.0 build (1)

---

*Scope authored by fork_mp21c4m4_e5b2aa, 2026-05-12*
