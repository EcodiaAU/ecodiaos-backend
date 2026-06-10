# Resonaverde — Items 1, 4, 5, 6 Scope
*Authored: 2026-05-13 by fork_mp36x8i3_829368. Context: Angelica email 11 May 2026 (id 19e14fdad1e67369).*
*Sibling fork_mp36whfs_775897 handled item 2 (file delete bug). Item 3 (email blast preview) shipped commit 25e7bc5.*

---

## Meta: Overlap check against rebuild branches (row 56a22c22)

The rebuild branches (`feat/resonaverde-rebuild-public-2026-05-12`, `feat/resonaverde-rebuild-admin-2026-05-12`) are **stale pre-merge state**. Main is already ahead - Workers 2 and 3 have been merged into main:

- `da50f19` — public glassmorphism + Framer Motion animations (Worker 2)
- `3e7c747` — admin emerald rebrand + mobile tabs + secondary pages theme-aware (Worker 3)
- `f95ee80` / `0b723b5` — design system overhaul (Inter font, CSS tokens, shared Nav/Footer/PageShell)
- `25e7bc5` — email blast preview bug fix (item 3, shipped)

Main HEAD (`a81b716`) is the ground truth. All overlap analysis below is against main.

**Note on row 6b6d676d (5 design decisions for Angelica):** All 5 design decisions have been resolved by the merged work. (1) Blog glass: Worker 2 applied it. (2) Admin brand: Worker 3 applied emerald. (3) Mobile tabs: Worker 3 shipped Library/Write/Newsletter tabs. (4) Hero letter-spacing: resolved in `a81b716` responsive pass. (5) Secondary pages theme-aware: Worker 3 applied CSS vars. Row 6b6d676d can be **archived** - conductor to decide.

---

## Item 1 — Admin UI overhaul (more formatting control)

**Angelica's words:** "Please update the interface for the admin side, it looks really ugly and i dont have enough flexibility and options over making the emails/blog look pretty"

**Restatement:** Two separate sub-problems: (a) the admin visual polish she found ugly - largely resolved already; (b) genuine gaps in what she can do with the TipTap blog editor and the newsletter compose form.

### Existing-overlap check

Worker 3 already shipped to main:
- Admin sidebar: emerald gradient (`#064e3b` to `#022c22`), emerald accent border, green dot branding
- Mobile tab layout: Library / Write / Newsletter tabs, no more 1400px scroll
- Secondary pages: theme-aware CSS vars

The "ugly" complaint is **substantially addressed** by the merged Worker 3 work.

What Worker 3 did NOT touch (still open):

**Blog editor toolbar** (`src/components/RichTextEditor.tsx`, main):
Currently has: font family (5 options), font size (6 levels), 10 text colors, B/I/U/S, H1/H2/H3, bullet/ordered lists, blockquote, align L/C/R, link (URL prompt), image (URL prompt only).

Genuinely missing:
- **Table** support (no TipTap Table extension installed) - very common need for content formatting
- **Horizontal rule** / divider (StarterKit includes it but no toolbar button)
- **Highlight / background color** (no extension)
- **Undo / Redo** buttons visible in toolbar (keyboard shortcuts work but nothing visible)
- **In-editor image upload** (current `window.prompt("Paste image URL:")` is painful; images can only be added via the image gallery section above the editor, not inline in body text)
- **Code block** button (StarterKit has it, no toolbar button)

**Newsletter compose** (`admin/write/ClientPage.tsx`, newsletter panel):
The `intro_md` personal intro field is a plain `<textarea>` - no rich text. Angelica can write a personal intro but can't bold text, add links, or format it. This is likely a meaningful frustration when trying to "make emails look pretty."

### Proposed approach

Two-pass build:
1. **Editor toolbar additions** (2h): Add TipTap Table, HorizontalRule toolbar button, Highlight extension with a color picker, visible Undo/Redo buttons, code block button. All extensions are in `@tiptap/extension-*` family - zero new dependencies except `@tiptap/extension-table` (3 sub-packages) and `@tiptap/extension-highlight`.
2. **Newsletter intro → rich text** (1-2h): Replace the `intro_md` plain textarea with a lightweight second `RichTextEditor` instance (or a minimal TipTap editor with just B/I/U/Link/Color subset). The `buildNewsletterHtml` in `src/lib/newsletter/template.ts` already accepts `intro_md` as markdown - just need to switch to HTML and update the template renderer to treat it as HTML instead of rendering markdown.

No DB schema changes needed. No new API routes.

### Estimated effort

**S (3-5h)** total across both passes.

### Brief-Tate-first verdict

**(a) Routine** - no spend decision, no new infrastructure, no IP/legal weight. Dispatch as a build fork when ready.

### Open questions for Angelica

1. **Table formatting**: Would you like to be able to create tables inside blog posts (e.g., for comparison charts or data)? Worth confirming before adding the extension as it adds toolbar complexity.
2. **Email intro formatting**: Would it help if the "Personal Intro" field in the newsletter panel allowed basic formatting (bold, links, line breaks)? Currently it's plain text only.

*Note: do not duplicate row 6b6d676d questions - all 5 of those are now resolved.*

---

## Item 4 — Scheduled publishing + draft queue

**Angelica's words:** "I'd also like to be able to choose when the blogs get published to the website, and have a draft section that allows me to schedule posts months in advance, and have them published and sent out each week"

**Restatement:** Posts saved as drafts or scheduled for future dates, auto-published at the right time, with the newsletter email going out automatically on publish.

### Existing-overlap check

**SUBSTANTIALLY BUILT already on main.** Specifically:

- `Post` type in the DB already has `status: 'draft' | 'scheduled' | 'published'` and `scheduled_at: string | null`
- Admin write page already has the **status pill selector** (Draft / Published / Scheduled) and a `datetime-local` input that appears when Scheduled is selected
- Posts in the sidebar already show **DRAFT** and **SCHED** badges
- Vercel cron at `/api/cron/publish-scheduled` fires every hour (`0 * * * *` in `vercel.json`): finds all posts with `status='scheduled'` and `scheduled_at <= now()`, updates them to `status='published'`
- `/api/newsletter/auto-send/route.ts` exists and is fully built: creates campaign, sends to all active subscribers via Resend in batches of 100, has double-send guard

**The one real gap:** The hourly publish cron does NOT call `auto-send`. It publishes the post to the site, but the email blast does NOT go out automatically. Angelica would still need to manually "Prepare Email Blast" and send it. This is the delta between "it's 90% there" and "fully done."

**Secondary gap:** There is no "queue view" - no calendar or ordered list showing "these posts are scheduled for these dates." The sidebar shows SCHED badges but no visual timeline. For "months ahead" planning, she'll want to see at a glance what's queued and when.

### Proposed approach

**Wire the cron to auto-send (2-3h):**
In `/api/cron/publish-scheduled/route.ts`, after updating posts to `published`, loop over the newly-published post IDs and call `POST /api/newsletter/auto-send` for each one. Need to pass the `CRON_SECRET` as Authorization header on internal fetch. Add a guard: only auto-send if the post doesn't already have a `draft` campaign with `status='sent'` (the `auto-send` route already has this double-send guard, but belt-and-braces).

**Scheduled queue sidebar panel (2-4h, optional but Angelica-requested):**
Add a "Scheduled" section at the top of the sidebar library, showing scheduled posts sorted by `scheduled_at` ASC, with their publish date displayed. On mobile, this lives in the Library tab. This is a UI-only change - no DB work.

**Vercel cron frequency:** Currently hourly. For "scheduled months in advance, sent weekly" - hourly is fine. A post scheduled for 9am Tuesday will publish within the hour of 9am. No change needed.

No new infrastructure. Supabase, Resend, and vercel.json cron are all already in place and wired.

### Estimated effort

**S (3-5h)** for the auto-send wiring + scheduled queue sidebar. Genuinely close to done - this is integration work, not new-feature work.

### Brief-Tate-first verdict

**(a) Routine** - no new spend, no new infra, closing a gap in existing functionality. Dispatch as a build fork.

### Open questions for Angelica

1. **Auto-send on publish**: When a scheduled post goes live, should the newsletter email go out automatically to all subscribers at that moment? Or does she want to still review and manually trigger the email blast even for scheduled posts? (Assuming yes - but worth confirming before we wire it, since it's a blast to her full list.)
2. **Scheduling frequency clarification**: When you say "published and sent out each week" - do you mean you'll manually set each post to go out on a specific date/time, OR do you want a queue where you load posts up and they auto-send on a fixed weekly cadence (e.g., every Monday at 9am, next post in queue goes out)? Current approach handles specific dates - a queue-based cadence is different and would take longer.

---

## Item 5 — Lead-capture resource download page

**Angelica's words:** "add a page on the website (not visible to all website viewers yet) with a series of digital resources that people can download in exchange for me providing them with their email, and give them a really small preview of the resource. I need a section where it records the name and email address of the person who downloaded the resource"

**Restatement:** Gated PDF downloads behind an email (+ name) capture modal, with a small content preview per resource, page hidden from nav but accessible directly.

### Existing-overlap check

**MOSTLY BUILT already on main.** This is the biggest overlap of the four items:

- `/resources` page exists (`src/app/resources/ClientPage.tsx`) with a grid of resource cards
- Email-gate modal already implemented: clicking Download shows a modal asking for email, submits to `/api/resources/[id]/access`
- The access API: upserts the email into `subscribers` table, logs the download in `resource_downloads` table, generates a signed Supabase Storage URL valid 1 hour, sets a `subscriber_token` cookie so returning visitors skip the gate
- Admin `/admin/resources` page: file upload + publish/unpublish toggle per resource
- Card shows: title, description, file size

**What's genuinely missing after the existing implementation:**

1. **Name capture**: The modal asks for email only. `resource_downloads` table records `email` and `subscriber_id` but no `name` column. `subscribers` table likely has no `name` column either (need to verify, but the schema only upserts `email`, `status`, `token`, `source`).
2. **Resource preview**: Cards show text description and file size. Angelica asked for "a really small preview of the resource." The current implementation has no PDF thumbnail or first-page preview. Options: (a) manually-uploaded preview image per resource (easiest, admin uploads a thumbnail), (b) PDF.js first-page render in-browser (complex, heavy), (c) embedded `<iframe>` snippet of the PDF (works but clunky on mobile).
3. **Page visibility**: Angelica said "not visible to all website viewers yet." The page is currently live at `/resources` and presumably reachable from the nav. Need an admin toggle to hide it from the nav while keeping it accessible via direct URL - or simply don't add it to the nav until Angelica is ready to go live.

### Proposed approach

**Name capture (1-2h):** Add `name` field to the email-gate modal. DB: `ALTER TABLE resource_downloads ADD COLUMN name TEXT;` plus `ALTER TABLE subscribers ADD COLUMN name TEXT;` (nullable, soft add - existing rows unaffected). Access API: accept `name` from request body, pass through to both tables.

**Preview (2-4h - recommend option a):** Add a `preview_image_url` column to `resources` table (nullable). Admin resources page: optional thumbnail upload alongside the PDF. Public card: if `preview_image_url` present, show a small thumbnail (80px height, `object-fit: cover`) above the title. Graceful fallback to the PDF icon if no preview uploaded. This keeps Angelica in control of what "preview" means per resource without requiring automated PDF rendering.

**Page visibility (0.5h):** Remove `/resources` from the Nav component (it's likely listed in `src/components/Nav.tsx`). The page stays live at the URL - just not in the menu. When Angelica is ready to launch, one line change to re-add it. Alternatively, add an `is_visible` toggle to `site_copy` or `kv_store` that the Nav reads - slightly more elegant but overkill for now.

**Email privacy posture (see Brief-Tate-first below).**

### Estimated effort

**S-M (4-7h)**: name capture S (1-2h), preview image S-M (2-4h), nav visibility XS (0.5h). Straightforward DB additions + UI additions on top of solid existing infrastructure.

### Brief-Tate-first verdict

**(b) Tate-blocking decision needed on one sub-point:**

**AU Privacy/Spam Act - opt-in posture.** The current implementation does a single-opt-in: visitor provides email, they're immediately added to `subscribers` with `status='active'` and `source='resources'`. Under the AU Spam Act 2003, commercial electronic messages require consent. Single-opt-in is technically sufficient for consent evidence if the signup form clearly states what they're signing up for (the modal currently says "We'll send occasional updates you can unsubscribe from anytime" - borderline adequate). Double-opt-in (confirmation email before adding to active list) is safer legally and also improves list quality.

Decision: **single-opt-in (current, simpler) vs double-opt-in (safer, requires confirmation email flow)**. This is a legal posture decision that sits above routine - Tate should call it. Recommendation: double-opt-in, add `status='pending_confirmation'` path and a confirmation email via Resend (~2h additional work).

Everything else is routine.

### Open questions for Angelica

1. **Name capture**: Should we capture first name only, or full name? (Full name preferred for "records the name and email" admin view.)
2. **Preview format**: For the "small preview" of each resource - would you prefer to upload a thumbnail image per resource (you control what it shows), or would you like us to auto-generate a preview from the PDF's first page? (Thumbnail upload is simpler and more flexible.)
3. **Page launch timing**: Is the resources page ready to go live now, or do you want it hidden from the nav until you have content uploaded and ready? (We can launch it either way - just need to know whether to add it to the menu now.)

---

## Item 6 — Branding/design refresh

**Angelica's words:** "I'd also like to change the website's design slightly to better align with my business branding. have attached a branding doc for your reference"

**Restatement:** Visual identity update to the public site (and possibly admin) to match Angelica's brand guidelines doc.

### Existing-overlap check

Workers 2 and 3 already shipped significant design work to main. The design direction doc (`~/ecodiaos/drafts/resonaverde-rebuild-design-direction-2026-05-12.md`) by Worker 1 informed their implementations:

**Already on main:**
- Glassmorphism panels throughout public site (homepage, blog list, blog post, login, resources)
- Framer Motion animations (fade-up scroll reveals, stagger on blog cards, hero entrance)
- Ambient radial gradient background (indigo + emerald radials + grain overlay) across all pages via `PageBackground` component
- Emerald color system (`#059669`) as primary accent throughout
- Deep emerald admin sidebar (`#064e3b` to `#022c22`)
- Inter font as body type
- Mobile-responsive tab layout in admin
- Secondary pages (login, resources, legal, unsubscribe) are now theme-aware via CSS vars

**The critical gap: branding doc not yet retrieved.**

The Gmail message (id `19e14fdad1e67369`) confirms Angelica attached a branding doc. The `gmail_get_message` MCP tool returned the text body only - binary attachments are not downloadable via the current MCP surface. The attachment was not retrieved.

**This means:** We cannot verify whether Workers 2+3's glassmorphism/emerald direction aligns with Angelica's actual brand doc. Key unknowns:
- Does her brand doc specify different primary colors than the current `#059669` emerald?
- Does she have a specific font pairing (different from Inter)?
- Does she have a logo specification or specific imagery direction?
- Does "slightly" in "change the website's design slightly" mean small tweaks, or does her doc show a substantially different aesthetic?

**Likely scenario (educated guess):** The current glassmorphism + emerald direction is probably close given it was designed to match her sustainability/consulting brand. But the branding doc could specify exact hex values, typography, or visual treatment that differs from what's shipped.

**High overlap vs net-new depends entirely on the branding doc.** If her doc says "use these 3 colors and this font", the delta from main is 2-3 theme token DB updates and potentially one font change. If her doc shows a different layout direction, it's more.

### Proposed approach

1. **Retrieve attachment (blocker - conductor action needed):** The `gmail_get_message` MCP tool does not support binary attachment download. Route: Tate forwards the attachment from hello@resonaverde.au email to a Drive folder, OR Tate downloads it from Gmail and drops it at `~/ecodiaos/drafts/resonaverde-branding-doc-2026-05-13.pdf` on the VPS. Once on disk, can read/screenshot and assess delta.

2. **Once branding doc retrieved:** Run a comparison pass - check Workers 2+3 output against the doc's color palette, typography, logo, and imagery specs. Produce a diff list: "X is already matching, Y needs adjustment."

3. **Implementation (after diff):** Theme token changes are DB-row updates to the `site_theme` Supabase table - zero code changes needed for color/font adjustments (the `ThemeProvider` injects everything as CSS vars). Any structural changes (new sections, layout changes) would be code work.

### Estimated effort

**Cannot estimate until branding doc is reviewed.** Likely S-M (2-8h) based on the assumption that Workers 2+3 direction is approximately correct and only token/font tweaks are needed. Could be L (11-20h) if the doc specifies a substantially different visual direction.

### Brief-Tate-first verdict

**(b) Tate-blocking decision needed:**

1. **Attachment retrieval**: The branding doc can't be read from the Gmail MCP surface. Tate needs to either forward it to Drive or download to VPS. No build work can proceed on item 6 until this is done.

2. **Direction validation**: Once the doc is retrieved, confirm Workers 2+3's glassmorphism + emerald direction IS the right interpretation - or whether Angelica's doc shows something different that would require revisiting the rebuild work. This is a one-look decision, but it needs the doc.

### Open questions for Angelica

1. **Branding doc delivery**: The attachment to your 11 May email hasn't come through our end - could you re-send it, or let us know if it was a PDF, image, or Google Doc? (Tate to relay this in next contact.)
2. **Existing direction check**: We've already applied a glassmorphism aesthetic with your emerald green (`#059669`) as the primary accent color across the site and admin. Does this broadly match your branding doc, or does your doc specify different colors / fonts / visual style?

---

## Delivery summary

| Item | Already built? | Net-new effort | Brief-Tate-first? |
|---|---|---|---|
| 1 — Admin editor + newsletter formatting | ~60% (visual done; editor gaps remain) | S (3-5h) | No - routine |
| 4 — Scheduled publishing + draft queue | ~85% (publish cron + UI done; auto-send wiring missing) | S (3-5h) | No - routine |
| 5 — Lead-capture resources page | ~75% (email gate done; name + preview + nav missing) | S-M (4-7h) | Yes - opt-in posture (Tate decides single vs double opt-in) |
| 6 — Branding refresh | ~60% (Workers 2+3 shipped glass + emerald; doc not retrieved) | Unknown until doc reviewed | Yes - need branding doc + direction validation |

**Row 6b6d676d (5 design decisions):** Recommend archive. All 5 resolved by Workers 2+3 work now on main.

**Combined realistic build estimate (items 1+4+5 minus opt-in decision):** M-L (10-17h) across 3 focused Factory sessions.

*Authored by fork_mp36x8i3_829368 | 2026-05-13 | No code changes made*
