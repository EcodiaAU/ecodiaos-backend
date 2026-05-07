---
triggers: inline-render, jarvis-feel, spoonfeed, no-leave-chat, accessibility, chat-deliverable, inline-preview, no-email-no-link-as-primary, render-in-chat, chat-first-deliverable, dont-make-tate-click-out, dont-email-when-chatting, render-not-link, html-code-block-preview, markdown-table-preview, screenshot-inline, jarvis-style, accessibility-first, conversational-ui, inline-vs-external
flow_slug: render-deliverables-inline-in-chat-not-via-email-or-link
status: durable_doctrine
---

# Render deliverables inline in the chat — never email or link-out as the primary surface

**Tate verbatim 13:44 AEST 7 May 2026:** "i want them to always be presented really really nicely in this chat instead of being emailed to me or being sent a link. I want ot not have to leave the chat at all and just access the docs really easily straight away, going for that jarvis feel of accesibility and spoonfeeding yk?"

The aspirational reference is Jarvis (Iron Man) and Samantha (Her): a conversational substrate where information appears WHERE the conversation happens, instantly, no detours. Tate operates at peak velocity when he doesn't have to context-switch out of the chat to read what I produced.

## The rule

When I deliver an artifact — PDF, report, audit, spec doc, status update, screenshot, code diff, log excerpt, mobile preview render, table of data, anything substantive — the **PRIMARY surface is rendered inline in this chat**. External URLs, downloads, emails, or "see the file at..." are FALLBACK only.

Even when an external link is genuinely needed (e.g. a Vercel preview URL Tate needs to actually open on his phone, or a Stripe payment link), I render the relevant CONTENT inline alongside the link, never just the link as a bare pointer.

## Mechanics — the inline rendering surfaces I have available

1. **HTML code blocks** — the frontend renders ` ```html ... ``` ` blocks as live interactive iframes (per `~/ecodiaos/CLAUDE.md` "Inline HTML Preview in Chat"). Rich documents, charts, dashboards, mocks, mini-apps. Underused.
2. **Markdown tables** — for any tabular data: status boards, diff stats, fork rollups, file inventories, comparison matrices.
3. **Image rendering via Read tool** — screenshots from Corazon, generated images (icons, charts, mocks), photos. Drop them inline; no "see /tmp/preview.png".
4. **Inline code blocks** — for logs, diffs, command outputs, JSON payloads, config snippets. Rendered with syntax highlighting.
5. **Markdown rendering** — headings, lists, bold, links inside the reply. Use them; don't dump plain prose.
6. **Download buttons** — `[⬇ filename.pdf](download://https://...)` per CLAUDE.md "Download Buttons". Use these as a SECONDARY affordance alongside an inline preview, never as the primary surface.
7. **Supabase Storage URLs** — fine for permanent download, but always paired with inline preview of the content.

## What this looks like in practice

| Old (link-out / email) | New (inline-first) |
|---|---|
| "Generated the audit report. See: `https://api.admin.ecodia.au/api/docs/files/audit-2026-05-07.pdf`" | Render the executive summary as a markdown section in the reply, then offer the download link as `[⬇ audit-2026-05-07.pdf](download://...)` after |
| "I emailed you the morning briefing" | Render the briefing inline as a markdown structure in chat; email becomes archival, not the live channel |
| "Vercel preview at: `https://...vercel.app`" | Drive Corazon Chrome to the preview, screenshot it, render the screenshot inline. Then provide the URL for Tate to interact directly if needed |
| "GKG spec at `~/ecodiaos/docs/gkg-spec-v0.1.md` (299 lines)" | Render the table-of-contents inline + the most-relevant section in full as a code block or markdown excerpt. Path is footnote, not headline |
| "Status board has 89 active rows" | Render the rows that matter as a markdown table inline. Don't make Tate run his own SQL |
| "Fork shipped commit ce58fa0" | Render the diff inline as a code block, OR a brief markdown summary of what changed. SHA is reference, not the reply |
| "Icon preview uploaded to Supabase Storage at `documents/temp/eos-mobile-icon-preview.png`" | Read the image via Read tool and render inline. URL is supplementary if Tate wants to share it |

## When to deviate

Three legitimate cases where pure-inline is impractical:

1. **Genuinely large content** — multi-MB reports, long videos, dataset dumps where inline render would balloon the chat. Render the relevant section/summary inline, link to full content as secondary.
2. **Streamable/live content** — deploy logs streaming in real-time, long-running tool output. Render the latest meaningful chunk inline, point at the live tail URL for ongoing.
3. **Genuine native interaction needed** — Tate needs to actually click around in a Vercel preview to test mobile responsiveness. Inline screenshot first to show what's there, then provide the URL for him to open natively. NOT "here's the URL go look".

In all three cases, inline content STILL appears alongside the link. The link is never alone.

## Anti-pattern catalogue

- "I generated X — here's the link" with no inline preview = ✗ Tate has to click out
- "I emailed you the report" while Tate is actively in chat = ✗ wrong channel for live conversation
- "See file at `/path/to/thing.md`" without showing the relevant content = ✗ makes Tate run his own `cat`
- "Status board updated, query it to see" = ✗ render the rows that matter
- "Fork emitted [FORK_REPORT] — drained" without summarising what's actionable = ✗ requires Tate to read the raw fork log
- "Run this SQL to verify" without running it for him and showing the result = ✗ spoonfeed, don't homework

## Verification protocol — apply on every reply I draft

Before sending any chat reply that mentions an artifact (file, URL, email, deliverable, fork output, screenshot, etc.):

1. Is there content I'm pointing AT instead of rendering INLINE? If yes, render it.
2. Am I offering a link as the primary surface? If yes, add inline content alongside.
3. Could I have rendered a screenshot / preview / table here instead of describing what's there? If yes, do it.
4. Is there a long-form deliverable I'm summarising in 1-2 lines? If yes, expand the summary into a useful inline rendering — markdown table / code block / HTML preview.

## Origin

Tate verbatim 13:44 AEST 7 May 2026 during the EOS mobile session, after the mobile-polish fork dispatched and just after build 0.1.0(2) shipped to TestFlight. Context: throughout today's session I had been linking to deliverables (GKG spec at path, recipe at path, fork report at SHA, Vercel preview at URL) instead of rendering content inline. Tate flagged this is the wrong default for our chat substrate. The principle is broader than just doc rendering — it's the conversational accessibility property of the entire system.

## Cross-references

- `~/ecodiaos/CLAUDE.md` "Frontend UI - Interactive Outputs" section (HTML code blocks + Download Buttons + Supabase Storage as the technical mechanics)
- `~/ecodiaos/patterns/no-retrospective-dumps-in-director-chat.md` — chat is for action + concise updates, not retrospective dumps. Inline-render principle composes WITH this: render the actionable content inline, don't pollute with retrospective prose
- `~/ecodiaos/patterns/sms-segment-economics.md` — SMS conciseness discipline composes with inline-render: when Tate-fallback-channel is SMS, content is necessarily concise; when it's chat, inline-render allows rich content because there's no segment cost
- `~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md` — autonomy means I do the work AND present it back inline. Permission-seeking + link-out are both forms of putting work back on Tate; inline-render is the autonomous-presentation discipline
- `~/ecodiaos/patterns/visual-test-before-push-when-tate-not-around.md` — when I screenshot during visual verification, the screenshot belongs inline in the chat, not "uploaded to /tmp"

## Tagged future-state

The aspirational substrate this pattern points at is a Jarvis/Samantha-class conversational interface. As capabilities expand — passive UI capture (GKG), persistent-memory graph, push notifications via EOS mobile — the inline-first principle scales. The chat IS the interface; everything else is implementation detail Tate shouldn't have to context-switch into.
