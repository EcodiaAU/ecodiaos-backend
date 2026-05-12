# Resonaverde Rebuild — Design Direction
*Generated: 2026-05-12, Worker 1 Recon (fork_mp25d609_1f007b)*

---

## A. Repo Structure

**Stack:** Next.js 16.1.6, React 19, Tailwind CSS v4, Supabase (auth + SSR + storage), TipTap v3 (full suite), Resend. No Framer Motion installed yet.

### Pages
| Route | Component | Status |
|---|---|---|
| `/` | `HomePage.tsx` | Full homepage: hero, about, services, quiz, booking, blog preview, newsletter, contact |
| `/blog` | `blog/ClientPage.tsx` | 3-column blog index (white bg, no glass) |
| `/blog/[slug]` | `blog/[slug]/ClientPage.tsx` | Blog post detail (white bg, plain) |
| `/admin/write` | `admin/write/ClientPage.tsx` | 3-column editor: sidebar + editor + newsletter panel |
| `/admin/copy` | `admin/copy/ClientPage.tsx` | Site copy/content editor (CMS-like) |
| `/admin/resources` | `admin/resources/ClientPage.tsx` | Resource file management |
| `/admin/subscribers` | `admin/subscribers/page.tsx` | Subscriber list |
| `/login` | `login/ClientPage.tsx` | Auth page |
| `/resources` | `resources/ClientPage.tsx` | Public resource download page |
| `/unsubscribe` | `unsubscribe/ClientPage.tsx` | Unsubscribe flow |
| `/privacy-policy` | `privacy-policy/page.tsx` | Uses `LegalPage` component |
| `/terms` | `terms/page.tsx` | Uses `LegalPage` component |

### Components
- `ThemeProvider` - Injects all `site_theme` DB rows as CSS custom properties on `:root`
- `RichTextEditor` - TipTap v3 editor with ref-based content access
- `LegalPage` - Shared wrapper for Privacy/Terms
- `tiptap-fontsize.ts` - Custom font size extension

### Key Libraries
- `lib/siteTheme.ts` - Fetches `site_theme` table, exposes `getSiteTheme()`, `themeToCSS()`, `themeToInlineVars()`
- `lib/siteCopy.ts` - Fetches `site_copy` table key/value store
- `lib/quizConfig.ts` - Configurable quiz widget (step-through with scored outcomes)
- `lib/supabaseClient.ts` - Standard `createClient()` with anon key
- `lib/supabaseService.ts` - Service role client for server-side ops

### Current Color Tokens (from `HomePage.tsx` defaults)
```
color_primary:    #0b0b0d   (near black)
color_secondary:  #4f46e5   (indigo)
color_accent:     #059669   (emerald - brand signature)
color_background: #ffffff
color_surface:    rgba(255,255,255,.55)
color_text:       #111827
color_text_muted: #6b7280
color_border:     #e5e7eb
```
Admin area hardcodes: emerald `#059669` throughout (save button, active nav, featured indicator, subscriber count badge).

### CSS Architecture
- `globals.css` - Tailwind v4 import, base tokens (`--ink`, `--wash`, `--muted`, `--hair`, `--font-head`, `--font-body`), `blog-post-body` class
- `page.module.css` - Glassmorphism system (`.glassCard`, `.glassHero`, `.glassPanel`), ambient gradient background, grain overlay
- `styles/rich-text.css` - ProseMirror + `.blog-post-body` rendering
- Inline styles dominant throughout (theme tokens applied via `tv()` helper and inline `style` props)

---

## B. Current State Baseline

**What resonaverde.com.au shows today:**
The live domain is still the OLD GoDaddy Website Builder site (Starfield Technologies / Go Daddy Website Builder 8.0). The Ecodia-built Next.js app is deployed separately (Vercel preview URL, not yet pointed at the primary domain).

**Old GoDaddy site characteristics:**
- Fonts: Playfair Display (serif) + Source Sans Pro (humanist sans)
- Theme color meta: `#969696` (flat gray)
- Title: "Resonaverde" / Description: "Consulting for Sustainable Growth"
- OG image: stock nature photo from Getty
- Standard GoDaddy template aesthetic - no glassmorphism, no animations

**Ecodia Next.js app current state (from codebase):**
- Homepage: glassmorphism is already active on the hero and all homepage panels
- Background: ambient radial gradient (indigo top, emerald right, indigo bottom-left) + grain texture overlay
- Hero: large centered logo, site title with `letter-spacing: 0.18em` uppercase, subtitle text, CTA button
- Header: sticky, `backdrop-filter: blur(20px) saturate(1.5)`, glassmorphic
- Cards: `backdrop-filter: blur(12px)`, `rgba(255,255,255,0.72)` bg, emerald accent
- Blog pages (`/blog`, `/blog/[slug]`): plain white `#fff` background, NO glass, NO gradients - the biggest aesthetic gap
- Admin: dark navy sidebar + white editor + light green newsletter panel - functional, branded but not polished

---

## C. Co-Exist Design Moves to Adopt (10 concrete items)

coexist.ecodia.au is unreachable and the workspace does not exist on VPS. Inferred from the brief description ("glassmorphism aesthetic") and common patterns from that design era. Items below describe the desired design language Resonaverde should adopt, matching the Co-Exist benchmark.

1. **Move: Extended glass surface to blog pages**
   Implementation: Wrap `src/app/blog/ClientPage.tsx` and `src/app/blog/[slug]/ClientPage.tsx` main containers in the existing `.glassCard` / `.glassPanel` CSS module classes. Change `background: "#fff"` on `wrap` style to `"transparent"`. Add the same ambient gradient `<div>` (or extract it into a shared `PageBackground` component). This instantly unifies the blog pages with the homepage aesthetic.

2. **Move: Scroll-reveal fade-in on blog cards and section headings**
   Implementation: After `npm install framer-motion`, use `motion.div` with `initial={{ opacity: 0, y: 20 }}` and `whileInView={{ opacity: 1, y: 0 }}` plus `viewport={{ once: true, margin: "-60px" }}`. Apply to: blog index cards (staggered), homepage section panels, blog post article body. CSS alternative (no Framer): `@keyframes fadeUp { from { opacity:0; transform:translateY(18px) } to { opacity:1; transform:none } }` applied via `animation: fadeUp 0.5s ease both` with `animation-delay` per card index.

3. **Move: Typography pairing upgrade**
   Implementation: Set `font_heading` in `site_theme` table to a premium pairing. Recommended: `"Cormorant Garamond"` (heading, refined serif) + `"Inter"` (body, clean sans). Alternative: `"Playfair Display"` (heading) + `"Lato"` (body) - already used on old GoDaddy site, creates continuity. ThemeProvider loads Google Fonts automatically from these values. No code change needed, only DB row update.

4. **Move: Hero letter-spacing 0.08em on mobile (pre-authorised)**
   Implementation: In `page.module.css`, add `@media (max-width: 768px) { .heroTitle { letter-spacing: 0.08em; } }`. Current desktop value is `0.18em`. Mobile needs to be tighter to prevent orphaned characters on narrow viewports.

5. **Move: Glass card hover lift**
   Implementation: Add to `page.module.css`:
   ```css
   .glassCard:hover {
     transform: translateY(-2px) translateZ(0);
     box-shadow: inset 0 1px 0 rgba(255,255,255,0.9), 0 4px 8px rgba(11,11,13,0.06), 0 24px 60px rgba(11,11,13,0.11);
     transition: transform 0.22s ease, box-shadow 0.22s ease;
   }
   ```
   Apply selectively (blog cards yes, static content panels no). Blog cards in the index grid should feel clickable.

6. **Move: Emerald accent bar on blog post header**
   Implementation: In blog post ClientPage, add a `3px solid #059669` left border or a small emerald dot before the date label. Connects blog post typography to the brand color. Same treatment as admin sidebar's active post indicator (`borderLeft: "2px solid #059669"`).

7. **Move: Frosted-glass admin sidebar for Resonaverde branding**
   Implementation: The admin sidebar currently uses `linear-gradient(180deg, #111827 0%, #0d1520 100%)`. Rebrand to Resonaverde: use `linear-gradient(180deg, #064e3b 0%, #022c22 100%)` (deep emerald) OR keep dark navy but add an emerald `border-right: 2px solid #059669`. The brand green dot already exists; amplify it.

8. **Move: Consistent section max-width**
   Implementation: Blog pages use `maxWidth: 980px` (index) and `maxWidth: 740px` (post). Homepage uses `1100px`. Standardise: blog index to `1100px`, blog post to `760px`. Update the inline `col` and `wrap` style constants in both blog ClientPage files.

9. **Move: Ambient page gradient on all pages (not just homepage)**
   Implementation: Extract the ambient gradient from `page.module.css` `.page::before` pseudo-element into a shared component:
   ```tsx
   // src/components/PageBackground.tsx
   export function PageBackground() {
     return <div className="page-bg-ambient" aria-hidden="true" />;
   }
   ```
   Add `.page-bg-ambient` to globals.css with the three radial gradients. Import and render in blog, login, resources, legal pages.

10. **Move: Micro-interaction on subscribe button**
    Implementation: The homepage subscribe button already has `.rv-btn` transition. Extend: add a brief scale pulse on success state. When `subStatus === "success"`, apply `animation: successPulse 0.4s ease`. CSS: `@keyframes successPulse { 0%,100% { transform:scale(1) } 50% { transform:scale(1.04) } }`. Also: color the input border emerald on focus (already partially done in admin with `rv-admin-input:focus` - copy same pattern to public `subscribeInput`).

---

## D. The 5 Pre-Authorised Design Decisions — Implementation Spec

### Decision 1: Blog pages adopt homepage glassmorphism aesthetic
**Files to change:**
- `src/app/blog/ClientPage.tsx` - Remove `background: "#fff"` from `wrap` style. Add a `<div className={styles.pageAmbient}>` wrapper (new CSS class) or reuse `styles.page` from page.module.css if importable. Set body background to transparent. Import `styles from "@/app/page.module.css"` and wrap grid in `<div className={styles.glassCard}>`.
- `src/app/blog/[slug]/ClientPage.tsx` - Same treatment. The article content becomes a `glassCard`, `background: "transparent"` on main wrap.
- `page.module.css` - Add `.pageAmbient` class (same as `.page::before` gradient, but as a regular element for use on other pages).

**Exact classes:** `styles.glassCard` for blog card containers. `styles.glassPanel` for the blog index list container. The grain overlay and ambient gradient are needed on blog pages too - extract to a `<PageBackground />` component (see Section C, Move 9).

### Decision 2: Admin area shows Resonaverde brand/colors
**Files to change:**
- `src/app/admin/write/ClientPage.tsx` - Change sidebar `background` from `"linear-gradient(180deg, #111827 0%, #0d1520 100%)"` to `"linear-gradient(180deg, #064e3b 0%, #022c22 100%)"`. Keep all white text and opacity values as-is (they'll work on deep emerald too). The `brand` label text style (currently hidden "RESONAVERDE") with the green dot stays. Add `border-right: "2px solid rgba(5,150,105,0.4)"` to sidebar for glass edge effect.
- Admin `activeNavLink` border stays `#059669` (already branded).
- Newsletter panel stays `#f8fdfb` (light emerald-white, already correct).
- App shell background: change `"#f0f4f2"` to `"rgba(240,253,244,0.7)"` for slightly more green tint.

### Decision 3: Mobile admin = tab-based layout (Library | Write | Newsletter)
**File to change:** `src/app/admin/write/ClientPage.tsx`

**Current state:** On mobile (`isMobile` = true), the 3 columns stack vertically with `gridTemplateColumns: "1fr"`. Sidebar gets `maxHeight: 420px`.

**Tab implementation:**
```tsx
// Add to component state
const [activeTab, setActiveTab] = React.useState<"library" | "write" | "newsletter">("write");

// Tab bar (show only on mobile)
{isMobile && (
  <div style={{ display: "flex", borderBottom: "2px solid #e5e7eb", background: "#fff", position: "sticky", top: 0, zIndex: 20 }}>
    {(["library", "write", "newsletter"] as const).map(tab => (
      <button key={tab} onClick={() => setActiveTab(tab)} style={{
        flex: 1, padding: "12px 0", fontSize: "0.75rem", fontWeight: 700,
        textTransform: "capitalize", letterSpacing: "0.04em",
        color: activeTab === tab ? "#059669" : "#6b7280",
        borderBottom: activeTab === tab ? "2px solid #059669" : "2px solid transparent",
        marginBottom: -2, background: "none", border: "none", cursor: "pointer",
      }}>
        {tab === "library" ? "Library" : tab === "write" ? "Write" : "Newsletter"}
      </button>
    ))}
  </div>
)}

// Then conditionally render each panel:
// Sidebar: show when !isMobile || activeTab === "library"
// Main editor: show when !isMobile || activeTab === "write"
// Newsletter panel: show when !isMobile || activeTab === "newsletter"
```
On desktop: tabs are hidden, existing 3-column grid applies unchanged.

### Decision 4: Hero letter-spacing 0.08em on mobile only
**File to change:** `src/app/page.module.css`

**Add:**
```css
@media (max-width: 768px) {
  .heroTitle {
    letter-spacing: 0.08em;
  }
}
```
Current `.heroTitle` has `letter-spacing: 0.18em`. This applies only below 768px breakpoint. No JavaScript required.

### Decision 5: Secondary pages are theme-aware (auto-update when Design settings change)
**Context:** `ThemeProvider` already injects CSS variables from `site_theme` on the root layout. BUT `LegalPage.tsx`, `resources/ClientPage.tsx`, `unsubscribe/ClientPage.tsx`, and `login/ClientPage.tsx` likely use hardcoded colors.

**Implementation approach:**
- All these pages are children of the root `layout.tsx` which wraps in `<ThemeProvider theme={theme}>`. CSS vars are therefore already available on `:root`.
- Replace any hardcoded `color: "#0b0b0d"`, `background: "#fff"`, `color: "#059669"` etc. in those components with `color: "var(--color-text)"`, `background: "var(--color-background)"`, `color: "var(--color-accent)"`.
- For font: replace hardcoded `fontFamily: "'Inter', system-ui"` with `fontFamily: "var(--font-body, system-ui)"`.
- The `ThemeProvider` already sets `--color-primary`, `--color-accent`, `--color-background`, `--color-text`, `--color-text-muted`, `--font-heading`, `--font-body` etc. as CSS vars (see `siteTheme.ts`).

**Files to update:** `src/components/LegalPage.tsx`, `src/app/login/ClientPage.tsx`, `src/app/resources/ClientPage.tsx`, `src/app/unsubscribe/ClientPage.tsx`.

---

## E. Page-by-Page Rebuild Plan (Priority Order)

### Priority 1: Homepage Hero
**What changes:**
- Add mobile letter-spacing fix to `.heroTitle` (Decision 4)
- Confirm the logo src and `hero_subtitle` are loading correctly from `site_copy` table
- Add Framer Motion `fadeUp` entrance animation on logo + title + subtitle (staggered)
- Ensure `hero_text` token from theme is applied (currently hardcoded fallback)

**What stays:** Glassmorphism hero card, ambient gradient, grain overlay, sticky header - all solid.

**What's new:** Motion entrance. Mobile letter-spacing.

### Priority 2: Blog List Page
**What changes:**
- Add `<PageBackground />` component for ambient gradient (extract from `page.module.css`)
- Change `wrap` background from `"#fff"` to `"transparent"`
- Wrap blog grid in `glassPanel` or give cards individual glass treatment
- Add scroll-reveal on card entry (stagger by index * 0.05s)
- Add hover card lift (`transform: translateY(-3px)`) consistent with homepage `.rv-blog-card`
- Increase max-width from 980px to 1100px (match homepage)

**What stays:** 3-column grid, card structure, responsive 1-col on mobile.

**What's new:** Glass aesthetic, ambient background, scroll animations, hover lift.

### Priority 3: Blog Post Page
**What changes:**
- Add `<PageBackground />` ambient gradient
- Change `wrap` background to transparent
- Wrap article in `.glassCard` with max-width 760px
- Add emerald accent: `3px solid #059669` left border on article header block
- Add back navigation: "Back to Blog" link styled with glass pill (not plain underline)
- Article fade-in on mount

**What stays:** Typography system (`.blog-post-body` class), max-width 740px layout, date/title/lead/image structure.

**What's new:** Glass wrapper, ambient background, emerald header accent, improved back-nav.

### Priority 4: Admin Shell Layout
**What changes:**
- Sidebar: `linear-gradient(180deg, #064e3b 0%, #022c22 100%)` deep emerald (Decision 2)
- Add subtle `border-right: 2px solid rgba(5,150,105,0.3)` to sidebar
- Mobile tab bar: Library | Write | Newsletter (Decision 3)
- Admin shell `gridTemplateColumns` unchanged on desktop

**What stays:** Everything else in the admin write page.

### Priority 5: Admin Library Tab
**What changes:**
- In mobile tab layout, Library panel shows posts list at full height
- Post items get hover state: `background: rgba(5,150,105,0.08)` (emerald tint instead of white)
- Active post highlight: keep `borderLeft: "2px solid #059669"`, change highlight bg to `rgba(5,150,105,0.12)`

**What stays:** Post item structure, featured indicator, delete button.

### Priority 6: Admin Write Tab
**What changes:**
- On mobile tab view: Write tab shows just the editor + toolbar at full height (no sidebar compression)
- Save button: add success flash animation (brief green glow)
- Post status pills: keep current design

**What stays:** TipTap editor, toolbar structure, title input, excerpt, image grid.

### Priority 7: Admin Newsletter Tab
**What changes:**
- On mobile tab view: Newsletter tab shows just the newsletter panel
- Subscriber count badge: keep emerald pill
- "Prepare Email Blast" button: keep green, add subtle hover scale
- Newsletter panel: keep `#f8fdfb` light green-white background

**What stays:** Campaign draft form, send test, send to all.

### Priority 8: Secondary Pages (About, Login, Resources, Legal)
**What changes:**
- Apply theme CSS vars to all hardcoded colors (Decision 5)
- Add `<PageBackground />` ambient gradient to Login and Resources pages
- Login page: wrap form in `.glassCard` for visual consistency
- Resources page: wrap cards in `.glassCard`
- Privacy/Terms: `LegalPage` component gets `color: var(--color-text)`, `fontFamily: var(--font-body)`

**What stays:** Page structures and content.

---

## F. Framer Motion Integration Plan

### (a) Install
```bash
npm install framer-motion
```
No additional peer deps needed for Next.js 16 / React 19.

Confirm in `package.json` after install: `"framer-motion": "^11.x.x"` (or latest 12.x).

### (b) Which components get motion

| Component | Animation | Variant Name |
|---|---|---|
| Homepage hero logo + title | Staggered fade-up on mount | `heroEntrance` |
| Homepage `.glassCard` panels | Scroll-reveal fade-up | `sectionReveal` |
| Blog index cards | Staggered scroll-reveal | `cardReveal` |
| Blog post article | Single fade-up on mount | `articleEntrance` |
| Mobile admin tabs | Slide transition between panes | `tabSlide` |
| Subscribe form success state | Scale pulse | `successPulse` |

### (c) Specific animation variants

```tsx
// src/lib/motionVariants.ts  (new file for Workers 2/3 to create)

export const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

export const scrollReveal = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" },
  },
};

export const tabSlide = {
  hidden: (direction: number) => ({ x: direction * 40, opacity: 0 }),
  visible: { x: 0, opacity: 1, transition: { duration: 0.25, ease: "easeOut" } },
  exit: (direction: number) => ({ x: direction * -40, opacity: 0, transition: { duration: 0.2 } }),
};
```

**Usage pattern in blog cards:**
```tsx
import { motion } from "framer-motion";
import { staggerContainer, scrollReveal } from "@/lib/motionVariants";

<motion.div
  variants={staggerContainer}
  initial="hidden"
  whileInView="visible"
  viewport={{ once: true, margin: "-80px" }}
  style={grid}
>
  {posts.map((p, i) => (
    <motion.div key={p.id} variants={scrollReveal}>
      <Link href={`/blog/${p.slug}`} ...>
```

**Important for Server/Client split:** `motion.*` components must be in `"use client"` files. All the affected components are already client-side (they all have `"use client"` at top). No changes needed to server components.

**AnimatePresence** needed for: mobile admin tab transitions. Import at top of `admin/write/ClientPage.tsx`, wrap the active panel in `<AnimatePresence mode="wait">`.

---

## G. Technical Notes for Workers 2 + 3

### Supabase Auth Pattern
- Auth uses `@supabase/ssr` (v0.8.0) + `@supabase/auth-helpers-nextjs` (v0.15.0)
- Client-side: `src/lib/supabaseClient.ts` exports `supabase` as anon key client
- Server-side: `src/lib/supabaseService.ts` for service role operations
- Admin pages check `supabase.auth.getSession()` on mount and redirect to `/login` if no session
- DO NOT change the auth pattern. The session check in `AdminPage` is correct.

### TipTap Configuration
- TipTap v3 (latest). Uses `RichTextEditor` component with `RichTextEditorHandle` ref type for imperative `getHTML()` access
- Custom extension: `tiptap-fontsize.ts` for font size control
- Extensions in use: StarterKit, Color, FontFamily, Image, Link, Placeholder, TextAlign, TextStyle, Underline
- The `editorKey` pattern (increment to force re-mount when switching posts) is intentional - do not refactor

### Tailwind Config
- Tailwind v4 (no `tailwind.config.js` file - uses `@import "tailwindcss"` in globals.css)
- Custom utilities can be added with `@utility` in globals.css
- Most styles are currently inline (theme-token system) or in page.module.css - Tailwind used sparingly
- Do NOT assume standard Tailwind class names work on existing components - they use inline styles

### Theme System
- All design tokens stored in Supabase `site_theme` table as key/value rows
- `getSiteTheme()` called server-side in `layout.tsx`, passed to `ThemeProvider`
- `ThemeProvider` injects CSS vars as `--color-primary`, `--font-heading`, etc.
- `HomePage.tsx` also does a client-side fetch of `site_theme` for runtime updates
- Theme keys follow snake_case: `color_primary`, `font_heading`, `btn_radius`, etc.
- The `tv(theme, key, fallback)` helper in HomePage.tsx reads the client-side theme map

### Copy System
- Site copy stored in Supabase `site_copy` table as key/value rows
- `getSiteCopy()` in `lib/siteCopy.ts` returns the full map
- Keys: `hero_subtitle`, `section_about_title`, `section_about_body`, `service_1_icon/title/body`, etc.
- Admin `/admin/copy` page manages these. Worker 2/3 should NOT hardcode copy text.

### Environment Variables Needed
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (server-only)
- `RESEND_API_KEY` - For newsletter sends
- `CRON_SECRET` - For cron route protection

### PageBackground Component (new, shared)
Workers 2/3 should create `src/components/PageBackground.tsx`:
```tsx
import styles from "@/app/page.module.css";

export function PageBackground() {
  return (
    <>
      {/* Ambient gradient */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: `
          radial-gradient(ellipse 80vw 60vh at 50% -10%, rgba(99,102,241,0.07) 0%, transparent 70%),
          radial-gradient(ellipse 60vw 80vh at 85% 40%, rgba(16,185,129,0.05) 0%, transparent 65%),
          radial-gradient(ellipse 70vw 60vh at 10% 80%, rgba(99,102,241,0.04) 0%, transparent 65%)
        `,
      }} />
      {/* Grain */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", opacity: 0.028,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='.6'/%3E%3C/svg%3E")`,
      }} />
    </>
  );
}
```
Add this to blog pages, login, resources pages to unify the ambient background.

### Admin Mobile Tab State
- The `isMobile` boolean is already computed via `window.innerWidth < 1024` with resize listener
- New `activeTab` state should default to `"write"` on desktop, `"write"` on mobile (most used)
- Tab switching should NOT reset editor content - the editor state lives in the same component

### Known Gotchas
- `page.module.css` uses CSS Modules - import as `import styles from "@/app/page.module.css"`. This works cross-file in Next.js as long as the file path is correct.
- The `"use client"` directive is required on any component using `motion.*` from Framer Motion
- `next/image` is used on the homepage but `<img>` tag is used in blog pages - maintain this pattern (blog pages are already client-side and don't benefit from Next Image optimization in the same way)
- The blog post `image_urls` is an array; the post page renders ALL images in a stack above body - this is intentional
- `react-compiler` is enabled (`reactCompiler: true` in `next.config.ts`) - Framer Motion `useAnimation` hooks may need wrapping in `useMemo` to avoid compiler warnings
- Tailwind v4: there is no `tailwind.config.js`. Custom Tailwind utilities must be added via `@utility` directives in `globals.css`
- Newsletter auto-send cron is at `/api/cron/publish-scheduled` - do not touch this route

### Admin `/admin/resources` Page
- Manages downloadable resource files (PDFs etc.) uploaded to Supabase storage `resources` bucket
- Has upload form + toggle publish/unpublish per resource
- Separate from the public `/resources` page
- Low priority for visual rebuild - functional first

### Recommended Font Pairing for Angelica
If Angelica has no preference: `"Cormorant Garamond"` (heading) + `"Inter"` (body). This pairs refined serif authority with clean readability. Consistent with sustainability/consulting brand positioning. Update via admin /admin/copy (Design settings section).
