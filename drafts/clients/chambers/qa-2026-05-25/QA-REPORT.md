# Chambers visual QA - 2026-05-25

Multi-tenant React/Vite app at `https://chambers.ecodia.au` (default tenant `scycc`). CDP-driven walk through 22 routes (12 public + 10 admin) at desktop (1440x900) and mobile (390x844 @ dpr 2). Signed in as `scycc-preview@ecodia.au` (President of SCYCC, gated as officer).

Captures and per-route fixtures live at:

- `desktop/01-home.png` ... `desktop/29-admin-billing.png`
- `mobile/01-home.png` ... `mobile/29-admin-billing.png`
- `desktop/_report.json` / `mobile/_report.json`
- Walker script: `walk.js`

## Headline issues

These are the layout and placement issues that consistently broke "everything is placed and looks perfectly":

### 1. Header bar is overweight on every page
Every page repeats the same tall white sticky header: small "SC" avatar tile (28px), two stacked lines (chamber name in 14px bold + 12px subtitle "A Network for Young, Motivated Professionals..."), and a large pale-teal hamburger circle on the right. The header eats ~70px of vertical space on a 900px viewport and feels heavier than the content below it. On mobile the same layout takes nearly 12% of the visible viewport before the user sees anything. The subtitle is decorative and could move into a drawer / off the persistent header.

### 2. "Officer dashboard" floating toggle is unanchored
A circular dark pill with a key icon hangs in the top-left at `x=24, y=110` outside the main content column on every signed-in officer page. It is fixed-position and overlaps the page content on narrow viewports. Anchor it to the sidebar / nav drawer, or move it inside the page header. Anti-pattern: floats on top of the white card on /signin and /signup even though officers are already in.

### 3. Home hero is undersized and missing its headline
[home.png](desktop/01-home.png) shows the hero as a small contained image inside a teal band ~280px tall with only the "Become a member" CTA overlaid. The product spec ([chambers-public-pages-blocks-2026-05-19.md](chambers-public-pages-blocks-2026-05-19.md) §1) calls for `h1` headline + optional subheadline + the CTA, but the rendered hero has no headline at all on this tenant. Image and CTA only. Either (a) the tenant has not filled the headline field (admin/branding UX should make this clear) or (b) the hero block silently swallows an empty headline without falling back. Either way it reads as undefined product.

### 4. Five "What We Stand For" cards share one icon
[home.png](desktop/01-home.png) §3 - all five value cards (Belonging, Unity, Collaboration, Growth, Impact) render the same generic sparkle icon. The spec says `Sparkles icon (or icon mapped by icon_slug)`. The `icon_slug` mapping is either not wired or this tenant has every slug as null. Five identical icons in a row is a visual stutter.

### 5. /admin/members defaults to the empty Pending tab
[admin-members.png](desktop/23-admin-members.png) - opening the route lands on the Pending tab which is empty for this tenant ("No pending members"). The 22 active members are one click away. The default tab should be Active (where the data is); reserve Pending as the alert state when count > 0.

### 6. /admin/events shows every event as Draft
[admin-events.png](desktop/22-admin-events.png) - all 8 events in the admin table have status `Draft`, including the 2 events that ARE rendering on the public `/events` page as Upcoming (Coffee Catch-Up - Cotton Tree 27 May, Winter Member Showcase 3 July). Either the public page is not filtering by status (it should only show Published) or the admin column is mis-mapped from the data. The Draft pill colour also reads dead-grey which is visually right for `Draft` but wrong for the events that are publicly live.

### 7. Inconsistent AI-marker icon on /admin/events rows
[admin-events.png](desktop/22-admin-events.png) - 6 of 8 rows have a teal sparkle/star icon next to the status pill, 2 do not. There is no column header explaining what the icon means. Either label it (column header + tooltip) or remove the inconsistency.

### 8. /groups (public) wastes 50% of the desktop width
[groups.png](desktop/04-groups.png) - each focus category renders a section header and ONE conversation card across the full 1440px width. The cards themselves are ~580px wide so the right ~60% of every row is blank. Should be a 2-col (or 3-col at >=lg) grid of cards under each category header.

### 9. /admin/groups has the same single-column waste
[admin-groups.png](desktop/25-admin-groups.png) - same shape: full-width category strip with one full-width "group" row underneath. Slot one row per ~480px and let categories with multiple groups breathe.

### 10. /signin and /signup waste the lower viewport
[signin.png](desktop/08-signin.png) / [signup.png](desktop/09-signup.png) - both forms sit in the top third with ~500px of empty space below. Either vertically centre the card on the viewport or fill the gap with a chamber-specific welcome panel (mission line + last-3-members teaser + "joined 12 / 22 members this month").

### 11. /onboarding/chamber step header truncates "Skip for now"
[admin-onboarding.png](desktop/21-admin-onboarding.png) - the "Skip for now" link in the top-right wraps over 2 lines because the headline column is wide. The link should be a single-line button or sit on the same line as the step counter.

### 12. /admin/branding is a single 3000px-tall scroll
[admin-branding.png](desktop/26-admin-branding.png) - Identity (5 fields including a textarea), Colours (3 swatches), Live preview, Contact (3 fields), Social (9 fields), Locale (2 dropdowns), SEO (2 fields). The page is 3447 px tall on desktop. Either fold the lower groups behind tabs (Identity / Visual / Social / SEO) or use a left-rail nav with anchored scroll. As-is, the user has to scroll past everything to find the "Save changes" they want.

### 13. /admin/billing redirects rather than rendering its own page
Probed `cdp.navigate -> /admin/billing` lands at `/admin/billing` momentarily then resolves to `/signup` (during the mobile pass) or renders the Profile card (during the desktop pass). The Settings page has a "Billing" tab but `/admin/billing` is not a stable deep-link to it. Either make `/admin/billing` a real entry that activates the Billing tab on Settings, or remove it from the route inventory.

### 14. Header subtitle and avatar are vertically off-axis
On every page the "SC" avatar tile sits with its top edge ~2px lower than the title row, so the avatar bottom dips into the subtitle. This is a flexbox `align-items` ask - the avatar should centre-align against the 2-line stack.

### 15. Hamburger menu button is disproportionately large
[every page] - the circular hamburger button on the right is ~52px diameter at desktop, taller than the chamber name typography. On mobile it competes with the chamber name for visual weight. Shrink to ~40px or unify with the size of the SC avatar tile on the left.

## Mobile-specific issues (390x844)

### M1. Bottom tab nav overlaps scroll content
Across [mobile/02-events](mobile/02-events.png), [mobile/03-members](mobile/03-members.png), [mobile/20-admin](mobile/20-admin.png), [mobile/22-admin-events](mobile/22-admin-events.png) the fixed bottom tab bar (Home / Events / Groups / More) sits on top of the last scroll content. Needs a bottom safe-area padding equal to the tab bar height (around 64px) on every scrollable surface. Right now the second event card on /events is half-occluded by the tab bar at first paint.

### M2. /admin/events renders the desktop table on mobile
[mobile/22-admin-events](mobile/22-admin-events.png) - the 4-column TITLE / START / LOCATION / STATUS table from desktop is forced into 390px width. Every cell text-wraps over 5+ lines, the STATUS column is clipped off the right edge, and the tab bar covers the bottom rows. Mobile admin needs a card-per-event list (title + date pill + status pill + edit/delete icons in a row).

### M3. Officer-dashboard floating toggle collides with hero banner
[mobile/20-admin](mobile/20-admin.png) - the dark circular toggle at top-left overlaps the "Today's pulse" banner heading. Either tuck it inside the page header beside the title, or shift it to the right of the hamburger menu so it does not collide with content.

### M4. "What We Stand For" card grid leaves an orphan
[mobile/01-home](mobile/01-home.png) - five value cards lay out as 2x2 + 1 orphan card below. Either use a 3-up grid (clean 3+2) or shorten the value list to 4 on tenants that only need 4.

### M5. Members A-Z letter row crops at narrow width
[mobile/03-members](mobile/03-members.png) - the letter filter row truncates to a couple of letters with the rest hidden. Should horizontally scroll with a visible scroll indicator, or collapse into a single "All / A / B / ..." dropdown.

### M6. Two routes captured at the wrong viewport width
The walker re-asserts the viewport on every navigate, but `mobile/10-privacy.png` came out at 1351 px and `mobile/26-admin-branding.png` at 1012 px (the other 20 routes are at the correct 780 px / dpr 2). Both pages run `useEffect` JS during mount that re-reads document width and likely triggers a CSS-in-JS rebuild before the override takes hold. Treat as a re-walk follow-up, not a layout bug per se.

## Per-route notes

### Public

| Route | Desktop | Mobile | Notes |
|-------|---------|--------|-------|
| `/` | [01-home](desktop/01-home.png) | [01-home](mobile/01-home.png) | Hero undersized + no headline; value cards share icon; Get-in-touch is sparse. |
| `/events` | [02-events](desktop/02-events.png) | [02-events](mobile/02-events.png) | 2 upcoming cards render; Past (6) collapse below; calendar-icon buttons cropped at narrow widths. Walker reported `[slow]` (>15s tenant fetch). |
| `/members` | [03-members](desktop/03-members.png) | [03-members](mobile/03-members.png) | "Find someone" gradient header + A-Z chips + 18 listed members + 3-tier membership pricing cards below. Most member avatars are initials fallback - real photos missing. |
| `/groups` | [04-groups](desktop/04-groups.png) | [04-groups](mobile/04-groups.png) | 4 categories, 1 card per row -> 50% empty. |
| `/resources` | [05-resources](desktop/05-resources.png) | [05-resources](mobile/05-resources.png) | 5 link rows + "Stay connected" 4-up socials. Clean. Could combine into 2-col on desktop. |
| `/profile` | [06-profile](desktop/06-profile.png) | [06-profile](mobile/06-profile.png) | Real avatar + name + "President" + "Active" pill + form fields. Footer shows "Chambers v0.1.0". |
| `/feedback` | [07-feedback](desktop/07-feedback.png) | [07-feedback](mobile/07-feedback.png) | Subject + Message + Send (greyed until message); "We read every message" reassurance card. Send button disabled state is hard to read (light-grey on white). |
| `/signin` | [08-signin](desktop/08-signin.png) | [08-signin](mobile/08-signin.png) | Bottom 60% of viewport empty. |
| `/signup` | [09-signup](desktop/09-signup.png) | [09-signup](mobile/09-signup.png) | Same. |
| `/privacy` | [10-privacy](desktop/10-privacy.png) | [10-privacy](mobile/10-privacy.png) | Long legal text. The page text is left-aligned at ~16px - readable but a 60ch max-width would help on desktop. |
| `/terms` | [11-terms](desktop/11-terms.png) | [11-terms](mobile/11-terms.png) | Same. |
| `/onboarding/chamber` | [12-onboarding-chamber](desktop/12-onboarding-chamber.png) | [12-onboarding-chamber](mobile/12-onboarding-chamber.png) | 3-step new-chamber creation. |

### Admin (officer, scycc-preview/Matt as president)

| Route | Desktop | Mobile | Notes |
|-------|---------|--------|-------|
| `/admin` | [20-admin](desktop/20-admin.png) | [20-admin](mobile/20-admin.png) | Today's pulse hero + 4 KPI stat cards (22 / 0 / 2 / 4) + Recent admin activity empty. Dashboard reads thin - 4 KPIs + empty activity is a lot of whitespace for a landing surface. |
| `/admin/onboarding` | [21-admin-onboarding](desktop/21-admin-onboarding.png) | [21-admin-onboarding](mobile/21-admin-onboarding.png) | 4-step setup, "Skip for now" wraps. |
| `/admin/events` | [22-admin-events](desktop/22-admin-events.png) | [22-admin-events](mobile/22-admin-events.png) | Status all Draft; sparkle icon inconsistency. |
| `/admin/members` | [23-admin-members](desktop/23-admin-members.png) | [23-admin-members](mobile/23-admin-members.png) | Defaults to empty Pending. |
| `/admin/committees` | [24-admin-committees](desktop/24-admin-committees.png) | [24-admin-committees](mobile/24-admin-committees.png) | 4 committees listed (Events / Membership / Marketing / Partnerships). Clean. |
| `/admin/groups` | [25-admin-groups](desktop/25-admin-groups.png) | [25-admin-groups](mobile/25-admin-groups.png) | Same 1-up waste as /groups. |
| `/admin/branding` | [26-admin-branding](desktop/26-admin-branding.png) | [26-admin-branding](mobile/26-admin-branding.png) | 3447px single scroll. Needs tabs / left-rail. |
| `/admin/notifications` | [27-admin-notifications](desktop/27-admin-notifications.png) | [27-admin-notifications](mobile/27-admin-notifications.png) | Lives inside Settings tab strip with Branding/Billing/Notifications/Privacy. Clean. |
| `/admin/privacy` | [28-admin-privacy](desktop/28-admin-privacy.png) | [28-admin-privacy](mobile/28-admin-privacy.png) | Settings tab. Clean. |
| `/admin/billing` | [29-admin-billing](desktop/29-admin-billing.png) | [29-admin-billing](mobile/29-admin-billing.png) | Route does not stably land - see headline #13. |

## What's working well

- **Privacy / Terms** (`/privacy`, `/terms`) - render cleanly with all sections (re-confirms the 2026-05-20 fix held).
- **Members directory** - "Find someone" gradient banner, search box, A-Z letter chips, 18 listed members with role tags, plus 3-tier pricing cards below. Strong page.
- **Profile** - real Matt avatar + "Active" pill + tidy form + sign-out CTA.
- **Admin onboarding wizard** - 4-step bar, brand-colour picker, clean per-step framing.
- **Settings tab strip** (`/admin/notifications`, `/admin/privacy`) - tabs with icons, active state in teal, toggle cards. Most polished admin surface in the app.
- **Tab transitions and navigate latency** are quick enough on the warm tenant that all 22 routes loaded inside 60s on each pass.

## QA harness leftovers

- The `cdp.viewport` device-metrics override does NOT persist across `cdp.navigate`. The walker now re-asserts the viewport on every route - see `walk.js` lines 67-72. Worth codifying as a CDP-helper note ("re-assert viewport per navigate or it silently reverts to the tab's previous override").
- Tenant bootstrap fetch is heavy enough on a cold tab that the spinner stays visible >10s. Walker waits up to 20s on `.animate-spin` + tenant-name visible. If this hits real users on first load, consider an SSR pre-bake of `tenant.name` / `tenant.values` so the spinner is replaced by skeleton content.

## How to reproduce

```
node D:/.code/EcodiaOS/backend/drafts/chambers-qa-2026-05-25/walk.js desktop
node D:/.code/EcodiaOS/backend/drafts/chambers-qa-2026-05-25/walk.js mobile
```

Requires Chrome CDP attached on port 9222 with alias `eos-cowork-chambers` pinned to a chambers.ecodia.au tab, signed in as an officer.
