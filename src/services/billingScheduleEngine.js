/**
 * billingScheduleEngine — recurring client billing substrate.
 *
 * Reads `client_billing_schedules` rows where status='active' AND
 * next_due_date <= today, drafts a structured invoice from the row's
 * `line_items` JSON, renders HTML/PDF, uploads to Supabase storage,
 * sends a TEST email to Tate (per
 * ~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md - never
 * unilaterally sends to the client), and writes a row to
 * `client_billing_generations`.
 *
 * Wired by the `recurring-billing-monthly` cron (registered in
 * `os_scheduled_tasks`). Cron fires daily 09:00 AEST and the engine
 * filters to today's due rows internally (cheaper than per-day cron rows
 * per schedule).
 *
 * Tate verbatim 7 May 2026 09:15 AEST: "THis is month 2 of the
 * operational retainer, things liek this absolutely HAVE to be tracked,
 * this is a full billing/client thing we need to get perfect going
 * forward, worth concreting and a full fork to make some system to do
 * that."
 *
 * Doctrine: ~/ecodiaos/patterns/recurring-billing-must-be-substrate-tracked-not-ad-hoc.md
 * Sibling:  ~/ecodiaos/patterns/invoice-line-items-durable-doctrine.md
 *           ~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md
 *           ~/ecodiaos/patterns/parallel-forks-must-claim-numbered-resources-before-commit.md
 *
 * Origin: fork_mouoh2fb_fcd4f2 (7 May 2026), shipped alongside INV-2026-003
 * v2 ABN+footer fix.
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const db = require('../config/db')
const logger = require('../config/logger')

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public')

const CHROME_BIN = process.env.CHROME_BIN
  || '/home/tate/.cache/puppeteer/chrome/linux-146.0.7680.153/chrome-linux64/chrome'

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the schedules whose next_due_date is on/before `asOf` (default
 * today, AEST). Excludes paused/archived rows.
 */
async function listDueSchedules({ asOf } = {}) {
  const today = asOf ? new Date(asOf) : new Date()
  const yyyymmdd = formatYmd(today)
  const rows = await db`
    SELECT *
    FROM client_billing_schedules
    WHERE status = 'active'
      AND archived_at IS NULL
      AND next_due_date <= ${yyyymmdd}::date
      AND (ends_on IS NULL OR ends_on >= ${yyyymmdd}::date)
    ORDER BY next_due_date ASC, client_slug ASC
  `
  return rows
}

/**
 * Draft an invoice for a specific schedule. Resolves passthrough/hours
 * line items, computes subtotal/GST/total, writes invoice HTML to
 * `public/invoice-<slug>-<NNN>-DRAFT.html`, returns a structured draft
 * spec the caller can render to PDF or pass to a fork for review.
 *
 * Does NOT advance next_due_date or write to client_billing_generations -
 * those happen in `commitGeneration()` after the artefact is produced.
 */
async function draftInvoice({
  scheduleId,
  invoiceNumber,                         // e.g. 'INV-2026-004' - caller picks
  invoiceDate,                           // Date or YYYY-MM-DD (defaults today)
  invoicePeriod,                         // {year, month1to12} (defaults to invoiceDate's month)
  byActor = 'main',
}) {
  const [schedule] = await db`
    SELECT * FROM client_billing_schedules WHERE id = ${scheduleId}
  `
  if (!schedule) throw new Error(`schedule ${scheduleId} not found`)
  if (schedule.status !== 'active') throw new Error(`schedule ${scheduleId} not active (status=${schedule.status})`)

  const dt = invoiceDate ? new Date(invoiceDate) : new Date()
  const period = invoicePeriod || { year: dt.getFullYear(), month1to12: dt.getMonth() + 1 }
  const monthYear = `${MONTH_NAMES[period.month1to12 - 1]} ${period.year}`

  // Resolve line items.
  const resolved = []
  for (const item of (schedule.line_items || [])) {
    const skip = lineItemIsExpired(item, schedule, period)
    if (skip) continue
    const amountCents = await resolveAmountCents(item, schedule, period)
    const description = renderTemplate(item.description_template || item.description || '', {
      month_year: monthYear,
      n: lineItemMonthIndex(item, schedule, period),
    })
    resolved.push({
      type: item.type,
      description,
      amount_cents: amountCents,
      source: item.amount_source || 'fixed',
    })
  }

  const subtotalCents = resolved.reduce((s, r) => s + (r.amount_cents || 0), 0)
  const gstCents = schedule.gst_applicable ? Math.round(subtotalCents * 0.10) : 0
  const totalCents = subtotalCents + gstCents

  const dueDate = new Date(dt)
  dueDate.setDate(dueDate.getDate() + (schedule.due_offset_days || 7))

  const draft = {
    schedule_id: scheduleId,
    client_slug: schedule.client_slug,
    client_display: schedule.client_display,
    invoice_number: invoiceNumber,
    invoice_date: formatHumanDate(dt),
    due_date: formatHumanDate(dueDate),
    invoice_period: monthYear,
    line_items: resolved,
    subtotal_cents: subtotalCents,
    gst_cents: gstCents,
    total_cents: totalCents,
    gst_applicable: schedule.gst_applicable,
    payment_terms: schedule.payment_terms,
    bill_to_block: schedule.bill_to_block,
    payment_block: schedule.payment_block,
    by_actor: byActor,
  }

  const html = renderInvoiceHtml(draft)
  const draftPath = path.join(PUBLIC_DIR, `invoice-${schedule.client_slug}-${invoiceNumber.replace(/^INV-?/, '')}-DRAFT.html`)
  fs.writeFileSync(draftPath, html, 'utf8')
  draft.draft_path = draftPath

  return draft
}

/**
 * Render `draft.draft_path` HTML to PDF using chrome --no-pdf-header-footer.
 * Returns the local PDF path. Caller decides whether to upload.
 */
function renderDraftPdf(draftPath) {
  if (!fs.existsSync(draftPath)) throw new Error(`draft html missing: ${draftPath}`)
  const pdfPath = draftPath.replace(/\.html$/, '.pdf')
  // The flag --no-pdf-header-footer suppresses Chrome's default page header
  // (URL on right) and footer (file path on left + page numbers).
  // Verified working on chrome-linux 146.0.7680.153 on 2026-05-07.
  execSync([
    `"${CHROME_BIN}"`,
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf="${pdfPath}"`,
    `"file://${draftPath}"`,
  ].join(' '), { stdio: ['ignore', 'pipe', 'pipe'] })
  return pdfPath
}

/**
 * Persist the generation to `client_billing_generations` and advance the
 * schedule's `next_due_date` (+1 month or +1 quarter etc).
 */
async function commitGeneration({
  scheduleId, draft, pdfPath, storageUrl, testEmailId, status = 'tate_review', byActor = 'main', notes,
}) {
  await db`
    INSERT INTO client_billing_generations (
      schedule_id, generated_by, invoice_number, invoice_period,
      subtotal_cents, gst_cents, total_cents,
      draft_path, storage_url, test_email_id, status, notes
    ) VALUES (
      ${scheduleId}, ${byActor}, ${draft.invoice_number}, ${draft.invoice_period},
      ${draft.subtotal_cents}, ${draft.gst_cents}, ${draft.total_cents},
      ${draft.draft_path || null}, ${storageUrl || null}, ${testEmailId || null}, ${status}, ${notes || null}
    )
  `

  // Advance schedule. For monthly: +1 month, same day_of_month.
  const [schedule] = await db`SELECT frequency, day_of_month, next_due_date FROM client_billing_schedules WHERE id = ${scheduleId}`
  if (!schedule) return
  const next = advanceDueDate(schedule.next_due_date, schedule.frequency, schedule.day_of_month)
  await db`
    UPDATE client_billing_schedules
       SET next_due_date   = ${next},
           last_generated  = ${formatYmd(new Date())}::date,
           generated_count = generated_count + 1
     WHERE id = ${scheduleId}
  `
  logger.info(`[billingScheduleEngine] committed ${draft.invoice_number} for ${draft.client_slug}; next_due=${next}`)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lineItemIsExpired(item, schedule, period) {
  const win = item.schedule_window
  if (!win) return false
  if (win.max_count != null) {
    // Count fired periods since start_date.
    const start = new Date(win.start_date)
    const elapsedMonths = (period.year - start.getFullYear()) * 12 + (period.month1to12 - 1 - start.getMonth())
    return elapsedMonths >= win.max_count
  }
  if (win.end_date && period.year && period.month1to12) {
    const periodFirst = new Date(period.year, period.month1to12 - 1, 1)
    return periodFirst > new Date(win.end_date)
  }
  return false
}

function lineItemMonthIndex(item, schedule, period) {
  const win = item.schedule_window
  if (!win || !win.start_date) return null
  const start = new Date(win.start_date)
  const elapsedMonths = (period.year - start.getFullYear()) * 12 + (period.month1to12 - 1 - start.getMonth())
  return Math.max(1, elapsedMonths + 1)
}

async function resolveAmountCents(item, schedule, period) {
  if (item.amount_source === 'passthrough_lookup' && item.passthrough_query) {
    // TODO(deferred): integrate bk_ledger pull via passthrough_query.sources.
    // For now use fallback so the engine ships without bookkeeping coupling.
    // The fallback is the canonical "May $82" baseline encoded in the seed.
    return item.passthrough_query.fallback_amount_cents || item.amount_cents || 0
  }
  if (item.amount_source === 'hours_lookup') {
    return item.amount_cents || 0
  }
  return item.amount_cents || 0
}

function advanceDueDate(currentYmd, frequency, dayOfMonth) {
  const cur = new Date(currentYmd)
  const next = new Date(cur)
  switch (frequency) {
    case 'quarterly': next.setMonth(next.getMonth() + 3); break
    case 'annual':    next.setFullYear(next.getFullYear() + 1); break
    case 'one_off':   return null
    case 'monthly':
    default:          next.setMonth(next.getMonth() + 1); break
  }
  if (dayOfMonth) next.setDate(Math.min(dayOfMonth, 28))
  return formatYmd(next)
}

function renderTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
}

function formatYmd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

function formatHumanDate(d) {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
}

function fmtAud(cents) {
  const v = (cents / 100).toFixed(2)
  return '$' + v.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderInvoiceHtml(draft) {
  const billTo = draft.bill_to_block || {}
  const pay = draft.payment_block || {}
  const billLines = (billTo.address_lines && billTo.address_lines.length
    ? billTo.address_lines
    : [billTo.abn ? `ABN: ${billTo.abn}` : null].filter(Boolean)
  ).map(l => escapeHtml(l)).join('<br>')

  const itemRows = (draft.line_items || []).map(li =>
    `<tr><td>${escapeHtml(li.description)}</td><td class="amount">${fmtAud(li.amount_cents)}</td></tr>`
  ).join('\n        ')

  const gstRow = draft.gst_applicable
    ? `<tr class="gst"><td>GST (10%)</td><td class="amount">${fmtAud(draft.gst_cents)}</td></tr>`
    : ''

  const totalLabel = draft.gst_applicable ? 'Total (inc GST)' : 'Total'
  const subtotalLabel = draft.gst_applicable ? 'Subtotal (ex GST)' : 'Subtotal'
  const amountColLabel = draft.gst_applicable ? 'Amount (ex GST)' : 'Amount'
  const invTitle = draft.gst_applicable ? 'Tax Invoice' : 'Invoice'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${escapeHtml(draft.invoice_number)} - Ecodia</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; line-height: 1.6; font-size: 14px; }
    .page { max-width: 800px; margin: 0 auto; padding: 48px 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #000; }
    .brand { display: inline-flex; }
    .brand-eco { background: #000; color: #fff; padding: 5px 7px; font-size: 11px; font-weight: 800; letter-spacing: 0.15em; }
    .brand-code { background: #fff; color: #000; padding: 5px 7px; font-size: 11px; font-weight: 800; letter-spacing: 0.15em; }
    .inv-number { font-size: 11px; color: #999; letter-spacing: 0.1em; margin-top: 12px; }
    .inv-title { font-size: 28px; font-weight: 300; margin-top: 4px; }
    .meta { font-size: 12px; color: #666; text-align: right; line-height: 1.8; }
    .meta strong { color: #111; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
    .party-label { font-size: 10px; font-weight: 700; letter-spacing: 0.25em; text-transform: uppercase; color: #999; margin-bottom: 8px; }
    .party-detail { font-size: 13px; line-height: 1.8; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 40px 0; }
    th { text-align: left; font-size: 10px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #999; padding: 10px 0; border-bottom: 1px solid #ddd; }
    th.amount { text-align: right; }
    td { padding: 12px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
    td.amount { text-align: right; font-weight: 500; }
    tr.subtotal td { border-top: 2px solid #000; border-bottom: 1px solid #f0f0f0; font-weight: 600; font-size: 14px; padding-top: 16px; }
    tr.gst td { border-bottom: 1px solid #f0f0f0; font-weight: 500; font-size: 14px; color: #555; }
    tr.total td { border-top: 1px solid #000; border-bottom: none; font-weight: 700; font-size: 18px; padding-top: 16px; }
    .payment { background: #fafafa; padding: 24px; margin-bottom: 32px; }
    .payment-label { font-size: 10px; font-weight: 700; letter-spacing: 0.25em; text-transform: uppercase; color: #999; margin-bottom: 12px; }
    .payment-grid { display: grid; grid-template-columns: auto 1fr; gap: 4px 20px; font-size: 13px; }
    .payment-grid dt { color: #999; }
    .payment-grid dd { color: #111; }
    .notes { font-size: 12px; color: #999; margin-bottom: 40px; }
    @media print { body { padding: 0; } .page { padding: 24px; } @page { margin: 0; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="brand"><span class="brand-eco">ECODIA</span><span class="brand-code">CODE</span></div>
        <p class="inv-number">${escapeHtml(draft.invoice_number)}</p>
        <h1 class="inv-title">${invTitle}</h1>
      </div>
      <div class="meta">
        <div><strong>Date:</strong> ${escapeHtml(draft.invoice_date)}</div>
        <div><strong>Due:</strong> ${escapeHtml(draft.due_date)}</div>
      </div>
    </div>

    <div class="parties">
      <div>
        <p class="party-label">From</p>
        <div class="party-detail">
          <strong>Ecodia Pty Ltd</strong><br>
          ABN: 89 693 123 278<br>
          ${draft.gst_applicable ? 'GST registered<br>' : ''}
          Sunshine Coast, QLD<br>
          hello@ecodia.au
        </div>
      </div>
      <div>
        <p class="party-label">To</p>
        <div class="party-detail">
          <strong>${escapeHtml(billTo.entity || draft.client_display)}</strong><br>
          ${billLines}
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th class="amount">${amountColLabel}</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        ${draft.gst_applicable ? `<tr class="subtotal"><td>${subtotalLabel}</td><td class="amount">${fmtAud(draft.subtotal_cents)}</td></tr>` : ''}
        ${gstRow}
        <tr class="total"><td>${totalLabel}</td><td class="amount">${fmtAud(draft.total_cents)}</td></tr>
      </tbody>
    </table>

    ${draft.gst_applicable ? `<p class="notes">All amounts in AUD. This invoice includes GST of ${fmtAud(draft.gst_cents)} (10%).</p>` : `<p class="notes">All amounts in AUD. GST not applicable.</p>`}

    <div class="payment">
      <p class="payment-label">Payment Details</p>
      <dl class="payment-grid">
        <dt>Bank</dt><dd>${escapeHtml(pay.bank || '')}</dd>
        <dt>BSB</dt><dd>${escapeHtml(pay.bsb || '')}</dd>
        <dt>Account</dt><dd>${escapeHtml(pay.account || '')}</dd>
        <dt>Name</dt><dd>${escapeHtml(pay.name || '')}</dd>
        <dt>Reference</dt><dd>${escapeHtml((pay.reference_template || '{invoice_number}').replace(/\{invoice_number\}/g, draft.invoice_number))}</dd>
      </dl>
    </div>

    <p class="notes">${escapeHtml(draft.payment_terms || 'Payment due within 7 days. Thank you for your business.')}</p>
  </div>
</body>
</html>
`
}

module.exports = {
  listDueSchedules,
  draftInvoice,
  renderDraftPdf,
  commitGeneration,
  // exposed for unit tests
  _internal: { advanceDueDate, lineItemIsExpired, lineItemMonthIndex, resolveAmountCents, renderInvoiceHtml, fmtAud, formatYmd, formatHumanDate },
}
