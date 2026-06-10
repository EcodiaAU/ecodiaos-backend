# Resonaverde Mobile + Design Audit — 2026-05-11

Audited by: fork_mp0xmrmj_68ae69
Live site: https://resonaverde.au
Codebase: ~/workspaces/resonaverde/

Screenshots: /tmp/resonaverde-audit/{route-slug}-{viewport}.png
Viewports: iphone15 (393x852), pixel7 (412x915), small-android (360x640), desktop (1440x900)

---

## Public Routes

### / (Home)

**Static issues:**

- `src/app/HomePage.tsx:496-499` + `src/app/page.module.css:82` — Hero title `.heroTitle` CSS class sets `font-size: clamp(26px, 3vw, 34px)` but the inline style on the div overrides it with `fontSize: clamp(28px, 8vw, ${fontSizeH1}px)`. Combined with `letter-spacing: 0.18em` and `text-transform: uppercase` from the CSS class, the 11-char word "RESONAVERDE" (no spaces, so no word-break opportunity) overflows the glass card container horizontally on all mobile viewports and is clipped by `overflow-x: hidden` on html/body. The `8vw` scalar is the culprit - at 393px it produces 31.4px but with 0.18em letter-spacing per character, the total rendered width exceeds the card inner width. Visually confirmed: "ESONAVERD" visible on iphone15, chars clipped both sides. Fix: reduce scalar from `8vw` to `5vw` or add explicit letter-spacing override in the mobile CSS breakpoint. — severity **P1**

- `src/app/page.module.css:246-262` — Mobile breakpoint at `max-width: 560px` reduces `.glassCard` padding to `28px 16px` which is correct. However hero section still uses `min-height: 70vh` on mobile. With a small viewport (360x640), the hero card consumes roughly 65% of the fold, leaving excessive blank space before the next section. Not broken, but creates a poor first-scroll experience. — severity **P3**

- `src/app/HomePage.tsx:683-693` — Newsletter subscribe row (`.subscribeRow`) collapses to single column on `max-width: 520px` (page.module.css:333-340). Good. If the theme's `font_size_base` is set below 16px, iOS Safari will auto-zoom on input focus. Default is 16px (safe), but this is theme-dependent risk. — severity **P3**

- `src/app/HomePage.tsx:717-738` — Footer uses `display:flex; justifyContent:space-between; flexWrap:wrap; gap:16`. On 360px the three items (copyright, nav links, "Made by Ecodia") will each wrap to their own line. Functional but layout becomes 3 stacked rows taking significant height. — severity **P3**

**Visual issues:**

- [iphone15, pixel7, small-android] Hero title "RESONAVERDE" overflows glass card and is clipped on both sides — chars clipped: "**R**ESONAVERD" on iphone15, "**R**ESONAVERD" on pixel7, "**R**ESONAVER" on small-android — screenshot: /tmp/resonaverde-audit/home-iphone15.png, home-pixel7.png, home-small-android.png

- [desktop] Renders cleanly at 1440px. Sticky nav, hero, sections all correct — screenshot: /tmp/resonaverde-audit/home-desktop.png

**Design issues:**

- Hero section excessive top whitespace on mobile: the hero card appears mid-viewport rather than near the top fold, creating an impression of a broken/empty page on first load before JS hydrates.
- Typography hierarchy is good. H1 brand name, subtitle body, CTA button all visually distinct.
- Color cohesion: green accent on CTA button, dark header - brand-consistent.
- The hamburger menu (≤768px) opens a dropdown — code confirmed, renders correctly.

---

### /blog

**Static issues:**

- `src/app/blog/ClientPage.tsx:204-215` + `src/app/blog/ClientPage.tsx:123-129` — `useIsMobile` hook is defined in the file but is **never called** in the `BlogIndex` component. The `grid` style object hardcodes `gridTemplateColumns: "repeat(3, minmax(0, 1fr))"` with no conditional logic. At 360px each card column is ~107px wide; at 393px ~122px. Text, dates, titles, and excerpts are all unreadable at that width. Fix: add `const isMobile = useIsMobile();` inside the component (the hook already exists, just not called) and set `gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))"`. — severity **P1**

- `src/app/blog/ClientPage.tsx:56-58` — Blog card images use plain `<img src={hero}>` (not Next.js `Image`) with no `loading="lazy"`, no `width`/`height` attributes (causes layout shift), no `decoding="async"`. All images load eagerly, increasing page load time. — severity **P2**

- `src/app/blog/ClientPage.tsx:84-91` — Page background is `#fff` and layout uses hardcoded `padding: "84px 22px"`. No ambient gradient, no glass cards, no brand theme applied. Visual disconnect from homepage. — severity **P3** (design decision required)

**Visual issues:**

- [iphone15, pixel7, small-android] 3-column grid never collapses — each card is ~107-128px wide, all text is cramped and barely readable — screenshot: /tmp/resonaverde-audit/blog-iphone15.png, blog-small-android.png

- [desktop] 3-column grid looks correct at 1440px — screenshot: /tmp/resonaverde-audit/blog-desktop.png

**Design issues:**

- Plain white background vs homepage glassmorphism. Blog feels like a different site. No nav bar (only a "Home" back-link). P2 brand consistency issue.
- Typography falls back to CSS `--font-head`/`--font-body` vars which default to Arial/system-ui - the themed Google font from admin settings is NOT applied here. P2.

---

### /blog/[slug]

**Note:** Screenshot captured as duplicate of /blog listing (no real slug in test). Code-read audit below.

**Static issues:**

- `src/app/blog/[slug]/ClientPage.tsx:69-74` — Blog post body rendered via `dangerouslySetInnerHTML` with className `blog-post-body`. There are no global CSS rules targeting `.blog-post-body *`. TipTap generates `<p>`, `<h1>`-`<h6>`, `<ul>`, `<ol>`, `<blockquote>`, `<table>`, `<code>` etc — all unstyled. Tables will overflow horizontally with no scroll wrapper. Code blocks have no background. Links are unstyled (no color, no underline). — severity **P2**

- `src/app/blog/[slug]/ClientPage.tsx:143-148` — Post images use `<img>` with `width: "min(740px, 92vw)"` which is responsive-correct, but no `loading="lazy"`. — severity **P3**

- `src/app/blog/[slug]/ClientPage.tsx:84-90` — Plain white background, no header nav (only "← Back" link). — severity **P3**

**Design issues:**

- Same brand disconnect as /blog — plain white page, no header, no themed font. Reading a blog post has no visual continuity with the homepage brand.
- No "back to blog" nav at article bottom — reader must scroll all the way up after finishing.

---

### /resources

**Status: 404 on live site** — code exists in codebase (`src/app/resources/page.tsx` + `ClientPage.tsx`) but is not deployed to production. Screenshots confirm 404 on all viewports.

Screenshot: /tmp/resonaverde-audit/resources-iphone15.png, resources-desktop.png — **both show 404**.

**Static issues (codebase review — not live):**

- `src/app/resources/ClientPage.tsx:257-263` — Nav bar uses `padding: "1rem 2rem"` with no responsive narrowing. On 360px phone, "Resonaverde" brand + "Blog | Resources" nav links in flex row will be tight. No hamburger menu on this page — the nav links could overflow or crowd on very narrow (320px) devices. — severity **P2**

- `src/app/resources/ClientPage.tsx:311-314` — Resource grid uses `gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))"` which auto-collapses to 1-column on phones (280px + 3rem padding = collapses at ~340px). Correct responsive pattern. — good

- `src/app/resources/ClientPage.tsx:396-411` — Email gate modal overlay has `padding: "1rem"` and modal `maxWidth: "420px"`. On 360px the modal becomes 328px wide — works correctly with `width: "100%"`. The modal close button (`×`) is `position: absolute; top: 1rem; right: 1rem` and is `fontSize: "1.5rem"` — tap target is approximately 24×24px, below the 44px recommended touch target. — severity **P2**

- `src/app/resources/ClientPage.tsx:439-448` — Email input in modal has no `inputMode="email"` or `autoComplete="email"`. Mobile keyboard won't switch to email layout by default. — severity **P3**

**Design issues:**

- /resources has its own nav (Resonaverde brand + Blog/Resources links) which is a different nav pattern from the homepage header. Brand-consistent colors (dark bg for nav), but different component entirely. No footer. Intentional pattern? Note for discussion.

---

### /login

**Static issues:**

- `src/app/login/ClientPage.tsx:22-49` — Clean, centered form. `maxWidth: 520` with `padding: "84px 22px"`. Input fields are full-width. No responsive issues. — good

- `src/app/login/ClientPage.tsx:29-42` — Placeholder text is lowercase: `"email"`, `"password"`. Minor UX: conventional practice is sentence-case. — severity **P3**

- No `autoComplete="email"` on the email input or `autoComplete="current-password"` on password input — password managers/browsers won't autofill reliably. — severity **P3**

**Visual:** Clean and functional on all mobile viewports — screenshot: /tmp/resonaverde-audit/login-iphone15.png

**Design issues:**

- Plain white page with no branding other than the "Login" H1. No logo, no Resonaverde name, no hint of what site this is for. P3.

---

### /unsubscribe

**Static issues:**

- `src/app/unsubscribe/ClientPage.tsx:52-64` — Very minimal: `padding: 40`, centered `<h1>Newsletter</h1>`. Functional. When viewed without a token (direct URL), shows the "Missing token" error as expected. No layout issues. — good

- Heading says "Newsletter" with no Resonaverde branding. Inbound link from emails — first thing a subscriber sees after clicking unsubscribe. Very low-effort page for what is a trust-sensitive action. — severity **P3**

**Visual:** Shows expected error state cleanly — screenshot: /tmp/resonaverde-audit/unsubscribe-iphone15.png

---

### /privacy-policy

**Static issues:**

- `src/components/LegalPage.tsx:78` + `LegalPage.tsx:157-159` — The mobile CSS rule `.lp-card { padding: 32px 24px 40px !important; }` targets a class that is never applied to the card div. The card uses hardcoded `padding: "52px 56px 60px"` inline. On 360px: card width = 360 - 32px (margin) = 328px, minus 112px horizontal padding = 216px inner content width. Narrow but functional. The dead CSS class should have `className="lp-card"` applied to fix it. — severity **P2**

- `src/components/LegalPage.tsx:117-123` — Section body text has `paddingLeft: 36` inside an already narrow card on mobile. At 360px: 216px - 36px = 180px effective text column. Readable but tight. — severity **P2**

**Visual:** Renders well and readably on iPhone15 — screenshot: /tmp/resonaverde-audit/privacy-policy-iphone15.png

**Design issues:**

- Legal pages match the homepage glassmorphism aesthetic (ambient gradient, glass card). Good brand consistency here.
- Typography hierarchy is clear.

---

### /terms

Same LegalPage component — same findings as /privacy-policy.

**Visual:** Clean, readable on mobile — screenshot: /tmp/resonaverde-audit/terms-iphone15.png

---

## Admin Routes

**Note:** Admin routes require auth. Login via Puppeteer not attempted (no stored credentials on VPS). All findings below are static code-read only.

---

### /admin/write

**Static issues:**

- `src/app/admin/write/ClientPage.tsx:294` — `gridTemplateColumns: isMobile ? "1fr" : "250px 1fr 300px"` where `isMobile = window.innerWidth < 1024`. At tablet (768px-1023px) the layout collapses to single column — this is correct behaviour. The layout IS mobile-aware. — good

- `src/app/admin/write/ClientPage.tsx:296` — Mobile sidebar has fixed `height: "400px"`. On iPhone15 (852px tall screen), 400px sidebar consumes 47% of the viewport just for the post list. After loading a post, `window.scrollTo({ top: 400 })` is called to scroll past it. This manual scroll is brittle if content above changes height. P2 UX issue. — severity **P2**

- `src/app/admin/write/ClientPage.tsx:322-329` — In mobile mode (`isMobile === true`), the sidebar footer containing logout and subscribers link is hidden (`{!isMobile && (...)}` block). There is no alternative logout button rendered in mobile view. Admin cannot log out on mobile without manually navigating to the login page. — severity **P2**

- `src/app/admin/write/ClientPage.tsx:378-386` — `datetime-local` input for scheduled posts has no explicit width or responsive handling. On some mobile browsers (especially older Android), `datetime-local` inputs render unpredictably in small containers. — severity **P3**

- `src/app/admin/write/ClientPage.tsx:493-495` — `editorToolbar` nav links row: `display:flex; gap:1rem` with 4-5 links at `fontSize: 0.85rem`. On 360px: "Blog | Edit Site | Subscribers | Resources | View Site↗" — total renders ~290px for links at 0.85rem. "View Site↗" is conditionally hidden on mobile (`{!isMobile && <Link...>View Site</Link>}`). With it hidden, ~220px for 4 links in 360px viewport. Fits without overflow. — good

**Expected visual issues (based on code — not screenshot-verified):**

- Mobile: vertical stack (sidebar 400px → main editor → newsletter panel). Total scroll distance to see all 3 panels on iPhone15 is approximately 1400px. Heavy scrolling required. No tab UI to navigate panels.
- Newsletter panel on mobile has `borderTop: isMobile ? "1px solid #e5e7eb" : "none"` — visible separator, correct.

**Design issues:**

- Entire admin area uses `fontFamily: "Arial, sans-serif"` hardcoded — no Resonaverde brand. Purely utilitarian. Functional but completely disconnected from the public site's visual identity.
- No Resonaverde logo in admin sidebar. Just "Resonaverde" plain text.

---

### /admin/copy

**Note:** File read partially (first 230 lines of what is a large file). Full layout structure not confirmed. Code-read analysis based on what was read:

**Expected static issues:**

- The copy editor has a 3-tab sidebar (`Copy | Design | Quiz`) plus main content panel. No `isMobile` state was visible in the first 230 lines. Unknown if the layout collapses on mobile. Risk: similar to /admin/resources - may have a fixed sidebar grid. — severity **Unverified, likely P2**

- The Design tab contains color pickers, font selectors, sliders — these controls are inherently complex on mobile. Small tap targets on sliders. — severity **P2** (likely)

---

### /admin/subscribers

**Static issues:**

- `src/app/admin/subscribers/page.tsx:182-254` — Subscriber table `<table className="w-full text-left text-sm">` is inside `div className="overflow-hidden"` — the parent has `overflow: hidden` (Tailwind) but NOT `overflow-x: auto`. Long email addresses will cause horizontal overflow on mobile. Fix: change the wrapper div from `overflow-hidden` to `overflow-x-auto` (or wrap the table in a separate `div style={{overflowX:'auto'}}`). — severity **P2**

- `src/app/admin/subscribers/page.tsx:109-136` — Sticky top toolbar with nav links uses `flex items-center gap-4`. "View Site ↗" is hidden on mobile (`hidden md:inline`). The remaining 3 links ("Blog", "Edit Site", "Subscribers") at small text fit within 360px. — good

- Filter buttons (`all | active | unsubscribed`) at `px-4 py-1.5 text-sm` — tap targets are approximately 36px height, slightly below 44px recommendation. — severity **P3**

---

### /admin/resources

**Static issues:**

- `src/app/admin/resources/ClientPage.tsx:383-390` — Shell layout: `gridTemplateColumns: "220px 1fr"` hardcoded with no `isMobile` state and no responsive override anywhere in the file. On 360px phone: 220px sidebar + main content would overflow viewport. The sidebar nav links, logout button, and content all become inaccessible without horizontal scroll. — severity **P1**

- `src/app/admin/resources/ClientPage.tsx:451-455` — Main content area has `padding: "2rem"` regardless of viewport. No mobile adjustment. — severity **P2**

- `src/app/admin/resources/ClientPage.tsx:341-364` — Download log table (`s.table`) has no `overflow-x: auto` wrapper. Email addresses in the download log can be long — will overflow on mobile. — severity **P3**

- `src/app/admin/resources/ClientPage.tsx:193-212` — Sidebar never collapses on mobile due to fixed grid. Additionally, there is no mobile nav at all — the sidebar contains the only navigation between admin pages. — severity **P1**

---

## Cross-Cutting Issues

### Admin mobile nav

- `/admin/write`: Mobile-aware (`isMobile` state + collapse to `1fr`). Adequate though no tab navigation. Logout missing on mobile. **P2**
- `/admin/subscribers`: Toolbar responsive (hides "View Site" link). Functional on mobile. **OK**
- `/admin/copy`: Unknown — not fully read. Likely has issues. **Unverified**
- `/admin/resources`: Fixed `220px 1fr` grid, NO mobile collapse, sidebar contains ALL navigation. Admin cannot use this page on mobile at all. **P1**

### Typography consistency

The site has TWO typography systems running in parallel:

1. **Themed system** (homepage): Theme font loaded from `site_theme` Supabase table, applied via inline `fontFamily` styles dynamically. The themed Google Font IS applied on the homepage.

2. **CSS var system** (blog, legal, unsubscribe, login): Uses `--font-head`/`--font-body` CSS variables defined in `globals.css` which default to `Arial, Helvetica, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. These CSS variables are never programmatically updated with the theme font. Blog pages use `var(--font-head)` but get Arial regardless of what Angelica set in the Design admin.

**Practical result**: Angelica sets "Playfair Display" as her heading font in the Design tab. Homepage shows Playfair Display correctly. But the /blog listing, /blog/[slug] post pages, /login, /privacy-policy, /terms all still show Arial. The brand font does NOT propagate to secondary pages. — **P2**

### Spacing rhythm

- Homepage sections: Consistent via `sectionPadY`/`sectionPadX` theme tokens. Well-structured.
- Blog pages: Hardcoded `padding: "84px 22px"` — not theme-aware.
- Legal pages: Fixed `padding: "52px 56px 60px"` — not theme-aware.
- Admin: Mix of `1.25rem`, `1.5rem`, `2rem` — consistent within admin context.
- Overall: The homepage is the only page with systematic spacing. Other pages are ad-hoc.

### Color cohesion

- Homepage: Full theme color system, dynamic.
- /blog, /blog/[slug]: Plain white `#fff`. Not theme-aware.
- /resources (when deployed): Own off-white `#fafaf8`. Also not theme-aware.
- Legal pages: Uses theme `color_background` — correct.
- Admin: Neutral `#f3f4f6` throughout. Separate visual language.

**Practical result**: If Angelica changes her site background color from white to a soft sage green in the Design tab, the homepage updates but /blog and /resources stay white. — **P2**

### Brand consistency (public vs admin)

- Homepage glassmorphism/gradient aesthetic does not extend to /blog, /resources, /login, /unsubscribe.
- This could be intentional (blog = readable, minimal) but currently feels inconsistent.
- Admin has zero brand identity: no logo, no green, no typography alignment.

---

## Punch List

### P1 — Broken / Visible bugs

1. **[Hero title overflow]** `src/app/HomePage.tsx:496-499` — "RESONAVERDE" hero title clips horizontally on all mobile viewports. Fix: in the inline style, change `8vw` to `5vw` or `clamp(20px, 5vw, ${fontSizeH1}px)`. Alternatively add `letterSpacing: "0.08em"` mobile override. Confirmed via 3 viewport screenshots.

2. **[Blog grid never collapses]** `src/app/blog/ClientPage.tsx:123-129` + lines 204-215 — `useIsMobile` hook defined but never called. Grid is hardcoded 3-col. One-line fix: add `const isMobile = useIsMobile();` to the component and conditionalise `gridTemplateColumns`.

3. **[/resources 404 on live site]** Route exists in codebase but not deployed. Needs Vercel deploy triggered for latest commits (a3d8624, 9548c0e, 73bd735 from 11 May).

4. **[/admin/resources no mobile layout]** `src/app/admin/resources/ClientPage.tsx:383-390` — Fixed `220px 1fr` grid, no mobile collapse, sidebar contains only nav. Admin cannot use this page on mobile. Add `isMobile` state (same pattern as /admin/write lines 78-85) and collapse sidebar.

### P2 — Substantial UX issues

5. **[Blog post rich-text unstyled]** `src/app/blog/[slug]/ClientPage.tsx:69-74` — `.blog-post-body` rendered HTML has no CSS. Tables overflow horizontally, code blocks are unstyled, links are unstyled. Add global CSS for `.blog-post-body` with table overflow, link colour, code background, heading margins.

6. **[Admin write: logout missing on mobile]** `src/app/admin/write/ClientPage.tsx:322-329` — `{!isMobile && <sidebarFooter>}` hides the only logout button on mobile. Add a logout button visible in mobile view (e.g., in the toolbar or at bottom of newsletter panel).

7. **[Subscribers table overflow]** `src/app/admin/subscribers/page.tsx:182` — Table wrapper has `overflow: hidden` but no `overflow-x: auto`. Long emails overflow on mobile. Change wrapper to `overflow-x: auto`.

8. **[Themed font doesn't propagate to blog/legal/secondary pages]** Blog and other secondary pages rely on CSS vars `--font-head`/`--font-body` which default to Arial and are never updated from the theme. Theme font only applies on homepage. Either fetch and apply theme font on secondary pages, or set the CSS vars via a global ThemeProvider.

9. **[Legal page lp-card class not applied]** `src/components/LegalPage.tsx:78` — Card div missing `className="lp-card"`. Mobile padding-reduction CSS rule is dead selector. Desktop padding (52px 56px) persists on mobile, narrowing inner content to ~180px on 360px viewport. Add `className="lp-card"` to the card div.

10. **[Resources modal close button small tap target]** `src/app/resources/ClientPage.tsx:415-426` — Close button is approximately 24×24px. Should be minimum 44×44px for touch. Add `padding: "12px"` or increase hitbox.

### P3 — Polish

11. **[/unsubscribe page under-branded]** Plain "Newsletter" heading, no Resonaverde logo, no styling. Real users land here from email unsubscribe links. Should at minimum show the brand name and a "You've been unsubscribed" confirmation message with a link back to the site.

12. **[Blog images missing lazy loading]** `src/app/blog/ClientPage.tsx:56-58` and `blog/[slug]/ClientPage.tsx:144-148` — Plain `<img>` without `loading="lazy"`. Migrate to Next.js `<Image>` or add `loading="lazy" decoding="async" width={...} height={...}`.

13. **[Login: no autoComplete attributes]** `src/app/login/ClientPage.tsx:29-42` — Missing `autoComplete="email"` and `autoComplete="current-password"`. Password managers won't autofill.

14. **[Resources email input missing inputMode]** `src/app/resources/ClientPage.tsx:216-222` — Modal email input missing `inputMode="email"` and `autoComplete="email"`. Mobile keyboard won't auto-switch to email layout.

15. **[Footer 3-item wrap on small-android]** `src/app/HomePage.tsx:717-738` — On 360px, three footer flex items wrap to separate lines. Minor but creates a tall footer. Could condense the footer links and "Made by" into one row or reduce "Made by" to icon-only on mobile.

16. **[Admin write: datetime-local on mobile]** `src/app/admin/write/ClientPage.tsx:378-386` — `datetime-local` input for scheduled posts may render oddly on some Android browsers. Add `min-width: 0` and ensure sufficient width.

17. **[Admin copy: not fully audited]** First 230 lines only read. Suspect 3-tab sidebar layout may have mobile issues similar to /admin/resources. Recommend separate targeted audit of /admin/copy.

18. **[Blog images in card: img not Next Image]** `src/app/blog/ClientPage.tsx:56-58` — `<img>` not `<Image>` — no blur placeholder, no format optimisation, no srcset. Not a layout bug but affects perceived performance.

---

## Needs-Design-Decision (do NOT fix in automated pass)

1. **Blog page aesthetic**: Should /blog and /blog/[slug] adopt the homepage glassmorphism treatment (ambient gradient, glass cards)? Currently plain white which is very readable but disconnected. Angelica should confirm intended direction before code changes.

2. **Admin brand identity**: Should admin pages show the Resonaverde logo/colors? Admin is private but it affects Angelica's experience daily.

3. **Mobile admin write UX**: The 3-panel (sidebar + editor + newsletter) stacked vertically on mobile requires scrolling ~1400px to see all panels. A tab-based mobile layout (3 tabs at top: "Library | Write | Newsletter") would be far more usable. This is a redesign, not a quick fix.

4. **Hero title letter-spacing on mobile**: The 0.18em letter-spacing is a deliberate design choice for the uppercase hero text. Reducing it to fix overflow changes the brand feel. Angelica should decide: keep spacing (requires font-size reduction on mobile) or reduce spacing on mobile only.

5. **Secondary pages theme-awareness**: Making /blog, /resources, /privacy-policy etc. fully theme-aware (background color, font family) would require a global ThemeProvider that fetches theme on every page. Currently only homepage does this. Worth discussing with Angelica whether she expects these pages to update when she changes the Design settings.
