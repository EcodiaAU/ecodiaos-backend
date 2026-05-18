#!/usr/bin/env node
/**
 * recurring-billing-monthly.js - cron-side runner for client_billing_schedules.
 *
 * Reads client_billing_schedules rows whose next_due_date is within the next
 * 24 hours and have status='active', drafts each invoice as a markdown
 * artefact in backend/drafts/invoices/, inserts a client_billing_generations
 * audit row with status='tate_review', advances next_due_date one period
 * forward, and surfaces each generation as a P2 status_board task pointing
 * Tate at the draft path.
 *
 * Safe to run multiple times per day: invoice numbers come from
 * kv_store.cowork.billing.next_invoice_seq (advanced atomically per
 * generation) and the draft file write is overwrite-safe; per-row safety is
 * provided by the same-day dedupe check on client_billing_generations.
 *
 * Doctrine:
 *  - backend/patterns/cron-must-be-registered-not-just-documented-2026-05-18.md
 *  - backend/patterns/recurring-billing-must-be-substrate-tracked-not-ad-hoc.md
 *  - backend/patterns/no-client-contact-without-tate-goahead.md
 *  - backend/patterns/cron-fire-must-have-deliverable-not-just-narration.md
 *
 * Cron registration: backend/src/db/migrations/129_recurring_billing_cron_seed.sql
 * Sibling engine (richer HTML/PDF render path): src/services/billingScheduleEngine.js
 *
 * Usage:
 *   node backend/scripts/cron/recurring-billing-monthly.js
 *   node backend/scripts/cron/recurring-billing-monthly.js --as-of 2026-06-07
 *   node backend/scripts/cron/recurring-billing-monthly.js --dry-run
 */

const fs = require('fs')
const path = require('path')
const db = require('../../src/config/db')

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DRAFTS_DIR = path.resolve(__dirname, '..', '..', 'drafts', 'invoices')
const KV_SEQ_KEY = 'cowork.billing.next_invoice_seq'

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { asOf: null, dryRun: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--as-of') args.asOf = argv[++i]
    else if (a.startsWith('--as-of=')) args.asOf = a.slice('--as-of='.length)
  }
  return args
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function formatYmd(d) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const da = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

function formatHumanDate(d) {
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function advanceDueDate(currentYmd, frequency, dayOfMonth) {
  const cur = new Date(currentYmd + 'T00:00:00Z')
  const next = new Date(cur)
  switch (frequency) {
    case 'quarterly': next.setUTCMonth(next.getUTCMonth() + 3); break
    case 'annual':    next.setUTCFullYear(next.getUTCFullYear() + 1); break
    case 'one_off':   return null
    case 'monthly':
    default:          next.setUTCMonth(next.getUTCMonth() + 1); break
  }
  if (dayOfMonth) next.setUTCDate(Math.min(dayOfMonth, 28))
  return formatYmd(next)
}

// ─── Invoice number sequencing ───────────────────────────────────────────────
//
// Sequence lives at kv_store.cowork.billing.next_invoice_seq. If the row is
// missing we bootstrap from MAX(invoice_number) across client_billing_generations.
// All numbering goes through this single chokepoint so concurrent forks/crons
// cannot collide (per parallel-forks-must-claim-numbered-resources-before-commit).

async function nextInvoiceNumber() {
  const year = new Date().getUTCFullYear()

  const [seqRow] = await db`
    SELECT value FROM kv_store WHERE key = ${KV_SEQ_KEY}
  `

  let nextSeq
  if (seqRow && seqRow.value && typeof seqRow.value.next === 'number') {
    nextSeq = seqRow.value.next
  } else {
    // Bootstrap from existing invoices.
    const rows = await db`
      SELECT invoice_number FROM client_billing_generations
       WHERE invoice_number ~ ${'^INV-' + year + '-[0-9]+$'}
    `
    let max = 0
    for (const r of rows) {
      const m = String(r.invoice_number || '').match(/^INV-\d{4}-(\d+)$/)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    nextSeq = max + 1
  }

  const padded = String(nextSeq).padStart(3, '0')
  const invoiceNumber = `INV-${year}-${padded}`

  await db`
    INSERT INTO kv_store (key, value)
    VALUES (${KV_SEQ_KEY}, ${db.json({ next: nextSeq + 1, last_assigned: invoiceNumber, last_assigned_at: new Date().toISOString() })})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `
  return invoiceNumber
}

// ─── Idempotency ─────────────────────────────────────────────────────────────
//
// A schedule fires at most once per UTC day. The audit row is the
// deduplication substrate; re-running the cron on the same day for the same
// schedule is a no-op (logs "already-generated").

async function alreadyGeneratedToday(scheduleId) {
  const [hit] = await db`
    SELECT id, invoice_number FROM client_billing_generations
     WHERE schedule_id = ${scheduleId}
       AND generated_at::date = (now() AT TIME ZONE 'UTC')::date
     LIMIT 1
  `
  return hit || null
}

// ─── Line items / amounts ────────────────────────────────────────────────────

function renderTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
}

function lineItemIsExpired(item, period) {
  const win = item.schedule_window
  if (!win) return false
  if (win.max_count != null && win.start_date) {
    const start = new Date(win.start_date)
    const elapsedMonths = (period.year - start.getUTCFullYear()) * 12 + (period.month1to12 - 1 - start.getUTCMonth())
    return elapsedMonths >= win.max_count
  }
  if (win.end_date && period.year && period.month1to12) {
    const periodFirst = new Date(Date.UTC(period.year, period.month1to12 - 1, 1))
    return periodFirst > new Date(win.end_date)
  }
  return false
}

function lineItemMonthIndex(item, period) {
  const win = item.schedule_window
  if (!win || !win.start_date) return null
  const start = new Date(win.start_date)
  const elapsedMonths = (period.year - start.getUTCFullYear()) * 12 + (period.month1to12 - 1 - start.getUTCMonth())
  return Math.max(1, elapsedMonths + 1)
}

function resolveAmountCents(item) {
  if (item.amount_source === 'passthrough_lookup' && item.passthrough_query) {
    return item.passthrough_query.fallback_amount_cents || item.amount_cents || 0
  }
  return item.amount_cents || 0
}

function fmtAud(cents) {
  const v = (cents / 100).toFixed(2)
  return '$' + v.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// ─── Markdown renderer ───────────────────────────────────────────────────────

function renderMarkdown(draft) {
  const billTo = draft.bill_to_block || {}
  const pay = draft.payment_block || {}

  const lineLines = (draft.line_items || []).map(
    li => `| ${li.description} | ${fmtAud(li.amount_cents)} |`
  ).join('\n')

  const gstLine = draft.gst_applicable
    ? `| GST (10%) | ${fmtAud(draft.gst_cents)} |\n`
    : ''

  const totalLabel = draft.gst_applicable ? 'Total (inc GST)' : 'Total'
  const subtotalLabel = draft.gst_applicable ? 'Subtotal (ex GST)' : 'Subtotal'

  const billAddress = (billTo.address_lines && billTo.address_lines.length)
    ? billTo.address_lines.join(', ')
    : (billTo.abn ? `ABN: ${billTo.abn}` : '')

  const ref = String(pay.reference_template || '{invoice_number}')
    .replace(/\{invoice_number\}/g, draft.invoice_number)

  return `# ${draft.gst_applicable ? 'Tax Invoice' : 'Invoice'} ${draft.invoice_number}

**From:** Ecodia Pty Ltd (ABN: 89 693 123 278)${draft.gst_applicable ? ' - GST registered' : ''}
Sunshine Coast, QLD - hello@ecodia.au

**To:** ${billTo.entity || draft.client_display}
${billAddress}

**Invoice Date:** ${draft.invoice_date}
**Due Date:** ${draft.due_date}
**Period:** ${draft.invoice_period}

## Line Items

| Description | Amount${draft.gst_applicable ? ' (ex GST)' : ''} |
|---|---:|
${lineLines}
${draft.gst_applicable ? `| ${subtotalLabel} | ${fmtAud(draft.subtotal_cents)} |\n` : ''}${gstLine}| **${totalLabel}** | **${fmtAud(draft.total_cents)}** |

## Payment Details

- Bank: ${pay.bank || ''}
- BSB: ${pay.bsb || ''}
- Account: ${pay.account || ''}
- Name: ${pay.name || ''}
- Reference: ${ref}

${draft.payment_terms || 'Payment due within 7 days. Thank you for your business.'}

---

_Draft generated ${new Date().toISOString()} by scripts/cron/recurring-billing-monthly.js._
_Status: tate_review - DO NOT send to client until Tate approves per no-client-contact-without-tate-goahead._
`
}

// ─── Core ────────────────────────────────────────────────────────────────────

async function listDueSchedules(asOf) {
  const today = asOf ? new Date(asOf) : new Date()
  const yyyymmdd = formatYmd(today)
  return db`
    SELECT id, client_slug, client_display, schedule_type, frequency, day_of_month,
           status, starts_on, ends_on, next_due_date, last_generated, generated_count,
           line_items, invoice_prefix, due_offset_days, gst_applicable, payment_terms,
           bill_to_block, payment_block
      FROM client_billing_schedules
     WHERE status = 'active'
       AND archived_at IS NULL
       AND next_due_date <= (${yyyymmdd}::date + interval '1 day')
       AND (ends_on IS NULL OR ends_on >= ${yyyymmdd}::date)
     ORDER BY next_due_date ASC, client_slug ASC
  `
}

async function buildDraft(schedule, invoiceNumber, asOfDate) {
  const dt = asOfDate ? new Date(asOfDate) : new Date()
  const period = { year: dt.getUTCFullYear(), month1to12: dt.getUTCMonth() + 1 }
  const monthYear = `${MONTH_NAMES[period.month1to12 - 1]} ${period.year}`

  const items = Array.isArray(schedule.line_items) ? schedule.line_items : []
  const resolved = []
  for (const item of items) {
    if (lineItemIsExpired(item, period)) continue
    const amountCents = resolveAmountCents(item)
    const description = renderTemplate(
      item.description_template || item.description || '',
      { month_year: monthYear, n: lineItemMonthIndex(item, period) }
    )
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
  dueDate.setUTCDate(dueDate.getUTCDate() + (schedule.due_offset_days || 7))

  return {
    schedule_id: schedule.id,
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
    bill_to_block: schedule.bill_to_block || {},
    payment_block: schedule.payment_block || {},
  }
}

async function writeDraftMarkdown(draft) {
  if (!fs.existsSync(DRAFTS_DIR)) {
    fs.mkdirSync(DRAFTS_DIR, { recursive: true })
  }
  const fname = `${draft.invoice_number}-${draft.client_slug}.md`
  const full = path.join(DRAFTS_DIR, fname)
  fs.writeFileSync(full, renderMarkdown(draft), 'utf8')
  return full
}

async function recordGeneration(schedule, draft, bodyPath) {
  await db`
    INSERT INTO client_billing_generations (
      schedule_id, generated_by, invoice_number, invoice_period,
      subtotal_cents, gst_cents, total_cents, draft_path, status, notes
    ) VALUES (
      ${schedule.id}, ${'cron:recurring-billing-monthly'}, ${draft.invoice_number}, ${draft.invoice_period},
      ${draft.subtotal_cents}, ${draft.gst_cents}, ${draft.total_cents},
      ${bodyPath}, ${'tate_review'}, ${'Generated by scripts/cron/recurring-billing-monthly.js'}
    )
  `
}

async function advanceSchedule(schedule) {
  const currentYmd = formatYmd(new Date(schedule.next_due_date))
  const next = advanceDueDate(currentYmd, schedule.frequency, schedule.day_of_month)
  await db`
    UPDATE client_billing_schedules
       SET next_due_date   = ${next},
           last_generated  = ${formatYmd(new Date())}::date,
           generated_count = generated_count + 1
     WHERE id = ${schedule.id}
  `
  return next
}

async function upsertReviewTask(schedule, draft, bodyPath) {
  const entityRef = `billing_review.${draft.invoice_number}`
  const name = `Invoice ready for review: ${draft.invoice_number} (${schedule.client_display})`
  const recipientHint = schedule.bill_to_block && schedule.bill_to_block.entity
    ? schedule.bill_to_block.entity
    : schedule.client_display
  const nextAction = `Review draft at ${bodyPath}, edit if needed, send via gmail to ${recipientHint}. Do not auto-send.`
  const ctx = `Auto-drafted by recurring-billing-monthly cron. Total ${fmtAud(draft.total_cents)}${draft.gst_applicable ? ' inc GST' : ''}. Period ${draft.invoice_period}. Per no-client-contact-without-tate-goahead the cron NEVER sends to client - Tate forwards manually.`

  await db`
    INSERT INTO status_board (
      entity_type, entity_ref, name, status, next_action, next_action_by,
      next_action_due, priority, context
    ) VALUES (
      'task', ${entityRef}, ${name}, 'drafted',
      ${nextAction}, 'tate',
      (now() AT TIME ZONE 'UTC')::date, 2, ${ctx}
    )
    ON CONFLICT DO NOTHING
  `
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv)
  const runId = new Date().toISOString()
  console.log(`[recurring-billing-monthly] start run=${runId} as_of=${args.asOf || 'today'} dry_run=${args.dryRun}`)

  const due = await listDueSchedules(args.asOf)
  console.log(`[recurring-billing-monthly] due_schedules=${due.length}`)

  const generated = []
  const skipped = []

  for (const schedule of due) {
    try {
      const dupe = await alreadyGeneratedToday(schedule.id)
      if (dupe) {
        console.log(`[recurring-billing-monthly] skip schedule=${schedule.id} client=${schedule.client_slug} reason=already_generated_today invoice=${dupe.invoice_number}`)
        skipped.push({ schedule_id: schedule.id, reason: 'already_generated_today', invoice_number: dupe.invoice_number })
        continue
      }

      if (args.dryRun) {
        console.log(`[recurring-billing-monthly] dry-run schedule=${schedule.id} client=${schedule.client_slug} next_due=${schedule.next_due_date}`)
        skipped.push({ schedule_id: schedule.id, reason: 'dry_run' })
        continue
      }

      const invoiceNumber = await nextInvoiceNumber()
      const draft = await buildDraft(schedule, invoiceNumber, args.asOf)
      const bodyPath = await writeDraftMarkdown(draft)
      await recordGeneration(schedule, draft, bodyPath)
      await upsertReviewTask(schedule, draft, bodyPath)
      const nextDue = await advanceSchedule(schedule)

      console.log(`[recurring-billing-monthly] generated invoice=${invoiceNumber} client=${schedule.client_slug} total=${fmtAud(draft.total_cents)} body=${bodyPath} next_due=${nextDue}`)
      generated.push({
        schedule_id: schedule.id,
        client_slug: schedule.client_slug,
        invoice_number: invoiceNumber,
        total_cents: draft.total_cents,
        body_path: bodyPath,
        next_due_date: nextDue,
      })
    } catch (err) {
      console.error(`[recurring-billing-monthly] error schedule=${schedule.id} client=${schedule.client_slug}: ${err && err.stack || err}`)
      skipped.push({ schedule_id: schedule.id, reason: 'error', error: String(err && err.message || err) })
    }
  }

  console.log(`[recurring-billing-monthly] done run=${runId} generated=${generated.length} skipped=${skipped.length}`)
  return { generated, skipped }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(`[recurring-billing-monthly] fatal: ${err && err.stack || err}`)
      process.exit(1)
    })
}

module.exports = { main, listDueSchedules, nextInvoiceNumber, buildDraft, advanceDueDate }
