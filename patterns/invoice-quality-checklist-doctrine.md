---
triggers: invoice-render, invoice-pdf, invoice-quality, client-invoice, ecodia-invoice, invoice-template, gst-line, abn-line, single-page-invoice, invoice-attachment, invoice-sender-email, invoice-recipient, tax-invoice, invoice-checklist
---

# Invoice quality checklist - mandatory before any client invoice ships

Every Ecodia client invoice (Pty Ltd or DAO) MUST pass the 8-point checklist below before the conductor sends to the client. The list is consolidated from three defect waves on INV-2026-003 (v1 -> v3, 6-7 May 2026), each of which surfaced a regression Tate had to flag manually. Codifying so future invoices don't regress.

## The checklist (run in order)

### 1. Single-page (mandatory verification, no exceptions)

A4 invoices MUST render to exactly one page. Multi-page invoices look unprofessional and create signing/scanning friction.

- CSS compaction baseline:
  - `@page { size: A4; margin: 12mm; }`
  - `body { font-size: 11px; line-height: 1.3; }`
  - `.page { padding: 0; }` (let `@page` margin own the whitespace)
  - Header: `margin-bottom: 18px; padding-bottom: 12px;` (NOT 40/24)
  - Parties block: `gap: 24px; margin-bottom: 18px;` (NOT 40/40)
  - Table cell padding: `7px 0` (NOT 12px 0)
  - Payment box: `padding: 14px 18px; margin-bottom: 14px;` (NOT 24/32)
  - Notes: condense to single sentence, font-size 10px
- Parties block stays 2-column side-by-side (`grid-template-columns: 1fr 1fr;`), never stacked.
- Trim verbose footer prose. One-line "All amounts in AUD. Includes GST of $X (10%). Payment due within N days." is sufficient.
- Verification gate (NON-NEGOTIABLE): `pdfinfo <path> | grep Pages` MUST show `Pages: 1` before declaring done. Narration "looks like one page" is insufficient per `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`.

### 2. Sender block (us, Ecodia)

The "From" / sender contact block on every invoice MUST contain:

- `Ecodia Pty Ltd` (legal entity — NOT "Ecodia", NOT "Ecodia Code")
- `ABN: 89 693 123 278`
- `GST registered` (for invoices dated after the GST registration effective date — May 2026)
- `Sunshine Coast, QLD`
- `code@ecodia.au` — NOT `tate@ecodia.au`, NOT `hello@ecodia.au`. Per `~/CLAUDE.md` Email Sender doctrine, all client-facing comms originate from `code@`. `hello@` is the inbound public address but is NEVER the sender on an invoice.

If the entity issuing the invoice is Ecodia DAO LLC instead of Pty Ltd, swap the legal entity + ABN line for the WY DAO equivalents and use `code@ecodia.au` still (DAO ops use the same address).

### 3. Bill-to block (client)

Look up client legal entity + ABN from prior invoices in `/home/tate/ecodiaos/public/invoice-<slug>-NNNN.html` OR from `~/ecodiaos/clients/<slug>.md` billing section. For Co-Exist (canonical reference):

- `Co-Exist Australia Ltd`
- `ABN: 39 660 776 983`
- `Australian Public Company`
- `QLD 4551`

Client's own contact email (e.g. `hello@coexistaus.org`) belongs in the email send-to field, NOT the invoice bill-to block. The block is legal entity + ABN + region, not contact details.

### 4. GST line - math must reconcile

Australian GST is 10%. The invoice math MUST be internally consistent:

- `Subtotal (ex GST) = sum of line items`
- `GST (10%) = Subtotal * 0.10` (round per line if any line is non-trivial decimal, otherwise round once at end to 2dp)
- `Total (inc GST) = Subtotal + GST`

Verification gate: before declaring done, manually compute `Subtotal * 1.10` and confirm it equals `Total`. Any mismatch is a defect to fix BEFORE upload — don't ship inconsistent numbers and apologise later.

Origin defect: INV-2026-003 v1/v2 listed GST $130.20 on a $1,282 subtotal (correct value $128.20). Total was $1,410.20 (matches $128.20 GST). Fixed at v3.

### 5. No file path footer

Browser default header/footer prints `file:///path/to/source.html` at the bottom of every page. NEVER ship an invoice with this. Render flag MUST be:

- chrome / chromium: `--no-pdf-header-footer`
- puppeteer (`scripts/html-to-pdf.js`): `await page.pdf({ ..., displayHeaderFooter: false })` (default; do not flip on)
- Verification gate: open the PDF and confirm no `file:///...` text appears at the bottom of the rendered page.

### 6. Attached PDF, not a download link

Send via `gmail_send` with `attachments` param holding the absolute path to the rendered PDF. NEVER paste a Supabase Storage URL into the email body as the "invoice" — clients should be able to forward the email to their accountant without that accountant chasing a download link. The Supabase Storage URL is for our records and is also valid as a backup link, but the PDF attachment is the primary delivery.

### 7. Tate-test-first (no exceptions)

Per `~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md`, EVERY client-bound invoice email MUST first go to `tate@ecodia.au` with subject prefix `[TEST]` (or `[TEST v2]` / `[TEST v3]` on revisions) and body explaining the changes. The conductor then waits for an explicit `send it` reply (or equivalent verbatim greenlight) before forwarding to the client. A forward of a previous invoice email from Tate is NOT authorisation to send the new one — every invoice gets its own per-message Tate go-ahead.

### 8. Line items durably captured

Per `~/ecodiaos/patterns/invoice-line-items-durable-doctrine.md`, every line item amount + description MUST be resolved at agreement-time and captured in the client's billing register (`~/ecodiaos/clients/<slug>.md` billing section, plus optionally `recurring_billing_schedules` substrate per `~/ecodiaos/patterns/recurring-billing-must-be-substrate-tracked-not-ad-hoc.md`). Invoice rendering reads from the durable register; the renderer never invents amounts. If an amount is unclear at render-time, STOP and ask Tate, do not guess.

## Failure modes the checklist exists to prevent

- INV-2026-003 v1: missing ABN line in sender block. Tate flagged.
- INV-2026-003 v1: file path footer printed (`file:///...`). Tate flagged.
- INV-2026-003 v1: invoice was a Supabase Storage download link in body, not a PDF attachment. Tate flagged.
- INV-2026-003 v2: sender email field showed `hello@ecodia.au` (inbound public address) instead of `code@ecodia.au` (canonical sender). Tate flagged.
- INV-2026-003 v2: invoice spilled to 2 pages. Tate flagged.
- INV-2026-003 v1/v2: GST line math wrong ($130.20 listed, correct $128.20).

Six defects across two test cycles. The 8-point checklist is the artefact that prevents wave-7 happening on the next invoice.

## Origin

Tate verbatim 7 May 2026 09:29 AEST:

> v3 of coexist invoice, all improvements should be noted for future reference btw. Our email should be code@ not hello@ and the invoic should be on 1 page, right now its jsut spilling over into a 2nd page.

Authored same arc as the fix (per `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`), not deferred to a later doctrine sweep.

## Cross-references

- `~/ecodiaos/patterns/invoice-line-items-durable-doctrine.md` — line-items-at-agreement-time discipline
- `~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md` — Tate-test-first hard rule
- `~/ecodiaos/patterns/recurring-billing-must-be-substrate-tracked-not-ad-hoc.md` — recurring billing substrate
- `~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md` — invoice numbering across parallel forks
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` — pdfinfo Pages=1 is the gate, not narration
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` — why this file exists at v3 not at v4
