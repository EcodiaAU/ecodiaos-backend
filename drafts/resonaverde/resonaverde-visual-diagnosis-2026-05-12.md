# Resonaverde Visual Diagnosis — 2026-05-12

Authored by fork_mp26mmrh_22f1f5 (Worker A — visual recon).

---

## Preview URLs

- **Public site** (feat/resonaverde-rebuild-public-2026-05-12): https://resonaverde-cyqeybv23-ecodia.vercel.app
- **Admin** (feat/resonaverde-rebuild-admin-2026-05-12): https://resonaverde-kna3a292d-ecodia.vercel.app

**Screenshot status:** Vercel preview deployments are behind Vercel's authentication wall (no bypass secret in kv_store). Screenshots captured showed Vercel's own login UI, not the site. Diagnosis below is 100% code-based — all findings are anchored to specific file/line evidence.

---

## Root Cause Summary (read this first)

Tate's verdict — "fonts rough/not antialiased, nav fragmented across pages, colours inconsistent, doesn't look modern or sleek" — maps directly to five concrete code problems:

1. **The font is Arial.** Not Inter, not Geist, not any premium web font. Literally `Arial, Helvetica, system-ui`. The comment in `HomePage.tsx` says "SYSTEM FONTS (no Google load needed)" — this was an explicit choice that produces the rough, unrefined look.
2. **No shared Nav/Header component exists.** Zero files matching `nav*`, `Nav*`, `header*`, `Header*` in the entire `src/` tree. Every page inlines its own nav.
3. **No tailwind.config.ts.** No custom design tokens. Every colour, every spacing value, every font size is a hardcoded magic number scattered across inline styles.
4. **CSS variable names are inconsistent.** `globals.css` defines `--font-head` but the admin login page references `--font-heading` (undefined — falls back to system-ui). Different pages use different CSS var names for the same concept.
5. **Public and admin branches use visually divergent palettes.** Public branch: indigo-tinted ambient gradients. Admin branch: pure emerald gradient sidebar. They look like two different products.

---

## Per-page diagnosis

### Public: Homepage (`/`)

**File:** `src/app/HomePage.tsx` + `src/app/page.module.css` (feature branch)

**Issues:**

- **Font is Arial.** `page.module.css` line `.section h2` hardcodes `font-family: Arial, Helvetica, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` — not even using the CSS variable, just raw Arial. Same for `.section p`. The hero title, section headings, and body copy all render in Arial at whatever the OS rasterises it as. On most screens this looks noticeably heavier and less refined than Inter.
- **No nav component.** The mobile nav (`mobileNavOpen` state) is inlined directly in `HomePage.tsx`. Blog pages, resources page, admin — each has its own nav inline or none at all. If nav padding or link style differs between homepage and `/blog`, it visibly jumps.
- **Glass treatment is public-site only.** The ambient gradient in `page.module.css` uses indigo: `rgba(99,102,241,0.07)`. The admin branch sidebar is pure emerald `#064e3b`. These are visually disconnected.
- **Framer Motion wired but font still Arial.** The new `motionVariants.ts` adds scroll-triggered fade/slide entrances. Animations on top of Arial = animated Arial. Doesn't solve the typeface problem.
- **`letter-spacing: 0.18em` on heroTitle** (reduced from wave 2 to 0.07em at 560px) — this is very wide tracking for Arial. Inter handles wide tracking cleanly; Arial at 0.18em letter-spacing looks stretched and amateurish.

---

### Public: Blog List (`/blog`)

**File:** `src/app/blog/ClientPage.tsx` (feature branch)

**Issues:**

- **Glassmorphism added to blog cards** but the nav at top of this page is its own inline implementation — may not match the homepage nav spacing/font-weight exactly.
- **Font still Arial** — `globals.css` is unchanged in the public branch, so every text element on `/blog` is Arial.
- **No PageShell.** Blog list has no layout wrapper shared with homepage. If the homepage gets an updated nav in the future, `/blog` won't automatically pick it up.

---

### Public: Individual Blog Post (`/blog/[slug]`)

**File:** `src/app/blog/[slug]/ClientPage.tsx` (feature branch)

**Issues:**

- Gets glass card treatment (same as blog list) — good.
- Body copy renders through `.blog-post-body` class in `globals.css` which is also Arial-stack.
- No shared nav — same fragmentation risk.

---

### Admin: Login (`/login`)

**File:** `src/app/login/ClientPage.tsx` (admin branch)

**Issues:**

- Glass card with ambient gradient — visually the best page in the admin branch. Looks modern.
- **CSS variable name bug:** Heading uses `var(--font-heading, system-ui, sans-serif)`. The variable `--font-heading` does NOT exist in `globals.css` — only `--font-head` exists. So the login heading falls back to `system-ui` (actually looks better than Arial, but is accidental).
- **Body text** uses `var(--font-body, system-ui, sans-serif)` which resolves to Arial via globals.css. So heading and body text come from different typefaces on this single page.
- **Colour:** ambient gradient uses indigo `rgba(99,102,241,0.07)` — matches public site. Good. But the button is `#059669` emerald, the sidebar (next page after login) is `#064e3b`. The login page is the one consistent bridge.

---

### Admin: Write Panel (`/admin/write`)

**File:** `src/app/admin/write/ClientPage.tsx` (admin branch)

**Issues:**

- **appShell font:** `fontFamily: "'Inter', 'Segoe UI', system-ui, Arial, sans-serif"` — Inter is listed first but **not loaded**. On any machine without Inter installed locally (most machines), this falls through to Segoe UI (Windows), system-ui (Mac), or Arial (older). So the panel looks different on every OS.
- **Sidebar font** inherits from appShell — same fallback problem.
- **Mobile tab bar** (`Library` / `Write` / `Newsletter`) uses `borderBottom: "2px solid #e5e7eb"` with `background: "#fff"` — flat white, no glass treatment. Inconsistent with the glass login page immediately before it.
- **Inline `<style>` tag** injected with `.rv-admin-*` classes for hover states — this is a code smell that signals the styling wasn't planned upfront.
- **Sidebar `brand` text:** `fontSize: "0.72rem"`, `fontWeight: 800`, `letterSpacing: "0.14em"`, `textTransform: "uppercase"` — these are different values from the public site's nav brand treatment.
- **Post list hover:** `rgba(5,150,105,0.08)` on hover — works but the hover background is the same colour as the active-post border. Low contrast differentiation.

---

## Design Token Gaps

### 1. Font stack — the core problem

**Currently:** `Arial, Helvetica, system-ui` set in `globals.css` and hardcoded again in `page.module.css` `.section h2` and `.section p`. The admin branch lists `'Inter', 'Segoe UI', system-ui, Arial` but Inter isn't loaded.

**What should exist:**
```css
/* globals.css — after loading Inter via next/font/google */
:root {
  --font-head: 'Inter', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-heading: var(--font-head); /* alias to fix admin login bug */
}
```
And `layout.tsx` needs an actual font import — the Google Fonts preconnect links are there but no `<link rel="stylesheet" href="...">` or `next/font/google` call follows.

### 2. Font smoothing — present but overridden

**Currently:** `globals.css` correctly sets `-webkit-font-smoothing: antialiased` on `html, body`. This should work. But if individual components set `font-family` inline (which they do, repeatedly), those elements may not inherit the body's rendering properties consistently across browsers.

**What should exist:** Remove all inline `font-family` declarations from TSX files. Let `--font-body` and `--font-head` on `:root` cascade everywhere. Only override in CSS modules, never inline.

### 3. Brand colours — no single source of truth

**Currently (scattered hardcoded values):**
- Brand green: `#059669` (emerald-600) — used in globals.css blog body links, admin hover states, save button glow, mobile tab active
- Deep admin sidebar: `#064e3b` / `#022c22` — only in admin branch
- Public ambient: `rgba(99,102,241,0.07)` indigo + `rgba(16,185,129,0.05)` emerald
- Background: `#fafafa` (page.module.css wash) vs `#fff` (globals.css `--wash`) vs `#fffaf5` (globals.css `--background`) — THREE different background values

**What should exist in globals.css `:root`:**
```css
:root {
  --color-brand: #059669;        /* emerald-600, primary accent */
  --color-brand-dark: #064e3b;   /* deep emerald, sidebar/headers */
  --color-bg: #fafafa;           /* single background value */
  --color-surface: rgba(255,255,255,0.72); /* glass card surface */
  --color-ink: #0b0b0d;
  --color-muted: rgba(11,11,13,0.52);
  --color-hair: rgba(11,11,13,0.12);
}
```

### 4. Shared Nav — does not exist

**Currently:** Zero nav/header components in `src/components/`. Mobile nav is implemented inline in `HomePage.tsx` with its own `mobileNavOpen` state. Other pages either have no nav or their own inline version.

**What should exist:** `src/components/Nav.tsx` — logo, links, mobile hamburger. Used on every public page. Consistent padding, font-weight, link colour.

### 5. Shared Footer — likely does not exist

Not confirmed from grep, but given there's no Nav component, a shared footer is also improbable.

**What should exist:** `src/components/Footer.tsx` — subscribe form, links, "Made by Ecodia Code" pill. Currently each page with a footer inlines it.

### 6. PageShell — does not exist

**Currently:** Each public page (`/`, `/blog`, `/blog/[slug]`, `/resources`) is a standalone full-page component with its own ambient gradient, nav (or lack of one), and footer. Changing the nav layout requires editing every page.

**What should exist:** `src/components/PageShell.tsx` — wraps children with: ambient gradient background, `<Nav />`, `<main>`, `<Footer />`. One place to update.

### 7. Spacing scale — magic numbers everywhere

**Currently:** `padding: "40px 22px"`, `padding: "1.4rem 1.1rem 1.1rem"`, `maxWidth: "400px"`, `borderRadius: "18px"` — all magic numbers. No shared spacing tokens.

**What should exist:** At minimum a spacing constants file or tailwind.config.ts with a custom spacing/radius scale.

### 8. No tailwind.config.ts

**Currently:** The project uses `@import "tailwindcss"` (Tailwind v4 syntax) but has NO `tailwind.config.ts`. Any Tailwind utility classes used in JSX pull from the default Tailwind scale — no custom brand colours, no custom font, no custom radius tokens.

**What should exist:** A `tailwind.config.ts` (even minimal) with at least custom `colors.brand`, `fontFamily.sans`, and `borderRadius` values so components that use utility classes stay on-brand.

---

## Codebase Structure (for Worker B)

- **Single codebase:** Both feature branches are on the same repo (`github.com/Resonaverde-au/resonaverde`, VPS at `~/workspaces/resonaverde/`). Public site and admin panel are in the same Next.js app.
- **Public codebase path:** `~/workspaces/resonaverde/src/app/` (homepage, blog, resources)
- **Admin codebase path:** `~/workspaces/resonaverde/src/app/admin/write/` + `src/app/login/`
- **Both feature branches touch non-overlapping files** — they can be fixed independently

**Current font:** No web font is actually loaded. `layout.tsx` has Google Fonts preconnect but no `<link rel="stylesheet">`. The CSS variables `--font-geist-sans` and `--font-geist-mono` are referenced in `@theme inline` block but Geist is never imported. Everything falls to Arial.

**Current colour palette:** No central definition. `globals.css` has `--ink`, `--wash`, `--muted`, `--hair`. Everything else is hardcoded inline.

**Current nav:** No component. Inline in `HomePage.tsx` only. `/blog`, `/blog/[slug]`, `/resources` either have their own or none.

**Existing UI library:** None. Raw inline styles + CSS modules + one injected `<style>` tag. No shadcn/ui, NextUI, Mantine.

**Key files to change (priority order for Worker B):**
1. `src/app/layout.tsx` — import Inter via `next/font/google`, apply to `<body>` className
2. `src/app/globals.css` — update `--font-head`/`--font-body`/`--font-heading` to Inter, consolidate colour tokens to single source of truth, remove duplicate `--background` / `--wash` confusion
3. Create `src/components/Nav.tsx` — extract from `HomePage.tsx`, use on all public pages
4. Create `src/components/PageShell.tsx` — wrap Nav + ambient gradient + Footer
5. `src/app/page.module.css` — remove hardcoded `font-family: Arial...` on `.section h2` and `.section p`, use `var(--font-head)` instead
6. `src/app/admin/write/ClientPage.tsx` — fix `appShell.fontFamily` to use CSS variable not `'Inter', 'Segoe UI'...` fallback chain that never loads Inter
7. `src/app/login/ClientPage.tsx` — fix `--font-heading` → `--font-head` (or add `--font-heading` alias in globals.css)
8. `tailwind.config.ts` — create minimal file with brand colour + font tokens if any Tailwind utilities are in use

**Branch that needs most work:** `feat/resonaverde-rebuild-public-2026-05-12` — it's the public face and has the most pages with fragmented nav. Admin branch is more contained; the login page actually looks good, the write panel just needs the font loaded properly.
