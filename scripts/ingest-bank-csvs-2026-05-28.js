#!/usr/bin/env node
/* One-shot bank-CSV ingest script for 2026-05-28 backfill.
 * Bypasses bookkeeperService.parseAnyBankCSV (which hangs on deepseek)
 * with hardcoded parsers for the two known formats: Up Bank + Bank Australia.
 * Idempotent via source_ref dedup.
 */
require('dotenv').config()
const crypto = require('crypto')
const fs = require('fs')
const db = require('../src/config/db')

const FILES = [
  { path: '/tmp/bank-csvs-2026-05-28/2024-07-01.csv',                                 source_account: 'up_personal', format: 'upbank',  label: 'Up Bank FY24-25' },
  { path: '/tmp/bank-csvs-2026-05-28/2025-07-01 2.csv',                               source_account: 'up_personal', format: 'upbank',  label: 'Up Bank FY25-26' },
  { path: '/tmp/bank-csvs-2026-05-28/Personal_Transactions_2025-10-01_2026-05-28.csv', source_account: 'ba_personal', format: 'ba',      label: 'BA Personal (12566110)' },
  { path: '/tmp/bank-csvs-2026-05-28/Transactions_2025-10-01_2026-05-28.csv',          source_account: 'ba_ecodia',   format: 'ba',      label: 'BA Ecodia Everyday (12579148)' },
]

const MONTH = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }

function parseCSVRow(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue }
    current += ch
  }
  result.push(current)
  return result
}

function sourceRef(occurred_at, amount_cents, description) {
  const hash = crypto.createHash('sha256').update(`${occurred_at}${amount_cents}${description}`).digest('hex').slice(0, 16)
  return `csv:${hash}`
}

function parseUpBank(csvText) {
  const lines = csvText.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n').filter(l => l.trim())
  const txns = []
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i])
    if (row.length < 13) continue
    const time = (row[0] || '').trim()
    const payee = (row[4] || '').trim()
    const desc = (row[5] || '').trim()
    const total = parseFloat((row[12] || '').replace(/[$,\s]/g, ''))
    if (!time || isNaN(total) || total === 0) continue
    const occurred_at = time.slice(0, 10)
    const amount_cents = Math.round(total * 100)
    const description = (payee && desc) ? `${payee} - ${desc}` : (payee || desc || 'Unknown')
    const longParts = []
    if (row[3]) longParts.push(`Type: ${row[3].trim()}`)
    if (row[11] && row[11] !== '0.00') longParts.push(`RoundUp: ${row[11]}`)
    if (row[13]) longParts.push(`PayMethod: ${row[13].trim()}`)
    if (row[6]) longParts.push(`Category: ${row[6].trim()}`)
    txns.push({
      source: 'csv',
      source_ref: sourceRef(occurred_at, amount_cents, description),
      occurred_at,
      amount_cents,
      description: description.slice(0, 500),
      long_description: longParts.join(' | ').slice(0, 500) || null,
      transaction_type: (row[3] || '').trim() || null,
    })
  }
  return txns
}

function parseBA(csvText) {
  const lines = csvText.replace(/^﻿/, '').replace(/\r\n/g, '\n').split('\n').filter(l => l.trim())
  const txns = []
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i])
    if (row.length < 10) continue
    const effDate = (row[2] || '').trim()
    const m = effDate.match(/(\d+)\s+(\w+),?\s+(\d{4})/)
    if (!m) continue
    const day = String(m[1]).padStart(2, '0')
    const mon = MONTH[m[2].slice(0, 3).toLowerCase()]
    if (!mon) continue
    const occurred_at = `${m[3]}-${mon}-${day}`
    const debit = parseFloat((row[5] || '').replace(/[$,\s]/g, '')) || 0
    const credit = parseFloat((row[6] || '').replace(/[$,\s]/g, '')) || 0
    const total = credit - debit
    if (total === 0) continue
    const amount_cents = Math.round(total * 100)
    const longDesc = ((row[9] || '').trim() || (row[8] || '').trim() || 'Unknown')
    txns.push({
      source: 'csv',
      source_ref: sourceRef(occurred_at, amount_cents, longDesc),
      occurred_at,
      amount_cents,
      description: longDesc.slice(0, 500),
      long_description: null,
      transaction_type: (row[1] || '').trim() || null,
    })
  }
  return txns
}

async function upsertStaged(tx, source_account) {
  const existing = await db`SELECT id FROM staged_transactions WHERE source_ref = ${tx.source_ref}`
  if (existing.length > 0) return false
  await db`
    INSERT INTO staged_transactions (source, source_ref, occurred_at, amount_cents, description,
      long_description, transaction_type, status, source_account)
    VALUES (${tx.source}, ${tx.source_ref}, ${tx.occurred_at}, ${tx.amount_cents},
      ${tx.description}, ${tx.long_description}, ${tx.transaction_type}, 'pending',
      ${source_account})
  `
  return true
}

;(async () => {
  console.log('START', new Date().toISOString())
  for (const f of FILES) {
    process.stdout.write(`  parsing ${f.label}... `)
    const csvText = fs.readFileSync(f.path, 'utf-8')
    const txns = f.format === 'upbank' ? parseUpBank(csvText) : parseBA(csvText)
    process.stdout.write(`parsed=${txns.length}, upserting...\n`)
    let created = 0, dupes = 0, failed = 0
    for (const tx of txns) {
      try {
        if (await upsertStaged(tx, f.source_account)) created++; else dupes++
      } catch (e) {
        failed++
        if (failed <= 3) console.log(`    upsert fail: ${e.message.slice(0, 120)}`)
      }
    }
    console.log(`  ${f.label} => new=${created} dupe=${dupes} fail=${failed}`)
  }
  console.log('DONE', new Date().toISOString())
  process.exit(0)
})().catch(e => { console.log('FATAL:', e.message, e.stack); process.exit(1) })
