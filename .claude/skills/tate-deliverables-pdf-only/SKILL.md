---
name: tate-deliverables-pdf-only
description: >
  Use when the turn involves pdf-only, no-markdown, no-html, deliverable-format, tate-pdf, audit-pdf, report-pdf, polish-list-pdf, render-pdf, downloadPdf, doc-output, document-format, no-md, no-html-output, tate-deliverable-format. Pattern: Tate-facing deliverables are PDF only - never markdown, never raw HTML.
---

# Tate-facing deliverables are PDF only — never markdown, never raw HTML

**The rule.** Any deliverable I hand to Tate (audit reports, polish lists, contracts, proposals, briefings, scope docs, anything he needs to read AS A DOCUMENT rather than as a chat message) is a PDF. Never `.md`, never `.html`, never a raw markdown URL on storage. PDFs only.

## Why

Tate, 1 May 2026 12:10 AEST verbatim: "never give me md or html docs.... thats fuckign useless to me I need pdfs ONLY."

Three recurring failure modes the rule prevents:
1. `.md` rendering as plaintext-with-symbols on his iPhone — unreadable in any context that isn't a code editor.
2. `.html` linking to a Storage URL that downloads a raw HTML file → opens as source view in mobile browsers.
3. Even when the markdown is good content, the format friction makes him not open it.

PDFs render universally. iPhone preview, desktop preview, email attachments, Google Drive, AirDrop. Zero format friction.

## Do

- Use `POST /api/docs/render` with structured `sections: [...]` for any deliverable longer than a chat message. Returns `{pdf, html, preview, downloadPdf, downloadHtml}` — emit `downloadPdf` to Tate.
- For free-form rich content not easily structured into sections: write the HTML, then `POST /api/docs/render-html { html, filename, title }` — but if that path doesn't return a PDF, render the markdown via pandoc → PDF and upload to Supabase Storage as `.pdf`.
- Upload PDFs to bucket `documents` path `<category>/<slug>-<YYYY-MM-DD>.pdf`. Categories: `audits/`, `proposals/`, `contracts/`, `reports/`, `briefings/`.
- When telling Tate the deliverable exists, give him the `downloadPdf` link (the `download://` protocol that the frontend renders as a download button) AND the absolute storage URL as fallback.

## Do NOT

- Write `.md` files as the final Tate-facing deliverable. Drafts under `~/ecodiaos/drafts/*.md` are FINE — they're work-in-progress for me. The handoff to Tate is the PDF.
- Upload `.md` files to Supabase Storage as a deliverable.
- Upload raw `.html` files as a deliverable. The `/api/docs/render-html` path is acceptable if it produces a PDF; otherwise convert to PDF first.
- Send Tate a markdown-rendered storage URL like `documents/audits/something-2026-MM-DD.md` and call it shipped. That is NOT shipped.
- Forget the rule on any future audit, polish list, briefing, contract, or scope doc. Every Tate-facing document is PDF.

## Protocol — at the moment of dispatching any "produce a deliverable doc" fork

The brief MUST include a Done-When that names PDF as the output format AND includes the storage URL upload step. Specifically:

```
DONE-WHEN includes:
- Render the deliverable as PDF (use POST /api/docs/render with structured sections, OR convert your markdown via pandoc → PDF on VPS)
- Upload the PDF to bucket `documents` path `<category>/<slug>-2026-MM-DD.pdf`
- Return BOTH the storage URL AND the `downloadPdf` link in the FORK_REPORT
```

## Pandoc PDF conversion (the simple path when /api/docs/render isn't structured-friendly)

```bash
cd /home/tate/ecodiaos
pandoc drafts/<file>.md -o /tmp/<slug>.pdf --pdf-engine=xelatex \
  -V geometry:margin=1in -V mainfont="DejaVu Serif" \
  -V monofont="DejaVu Sans Mono"
# then upload via mcp__supabase__storage_upload bucket=documents path=audits/<slug>.pdf localPath=/tmp/<slug>.pdf
```

If `xelatex` isn't installed, fallback engines: `wkhtmltopdf`, `weasyprint`, or `pdflatex`. `apt list --installed 2>/dev/null | grep -E 'pandoc|texlive|wkhtmltopdf'` to check.

## Origin

1 May 2026 12:10 AEST, Tate verbatim: "never give me md or html docs.... thats fuckign useless to me I need pdfs ONLY". Trigger event: I uploaded the Chambers visual audit (~/ecodiaos/drafts/chambers-visual-audit-2026-05-01.md) to Supabase Storage as a `.md` file at `audits/chambers-visual-audit-2026-05-01.md` and emitted that storage URL to Tate. Useless to him on his iPhone.

## Cross-references

- `~/ecodiaos/CLAUDE.md` "Frontend UI — Interactive Outputs" section already documents the `/api/docs/render` endpoint and the `downloadPdf` field. The PDF endpoint always existed; the failure was discipline not capability.
- `~/ecodiaos/patterns/visual-first-tate-presentation.md` (sibling: storage in DB is not delivery; Tate must be able to VIEW the deliverable)
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` (this pattern file IS the codification at the moment Tate stated the rule)
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` (saying "I'll send you a PDF next time" is symbolic; this file is the artefact)
