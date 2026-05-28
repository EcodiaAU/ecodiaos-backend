#!/usr/bin/env node
/* Daily FX rate import. Source: RBA F11 daily exchange rates (free, no auth).
 * Fetches AUD reference rates for USD, EUR, GBP, NZD, CAD, JPY and inserts
 * one row per (rate_date, foreign_currency). Idempotent.
 * RBA publishes around 16:00 AEST each business day. Cron runs at 17:30 AEST.
 */
require('dotenv').config()
const db = require('../src/config/db')
const axios = require('axios')

const CURRENCIES = ['USD', 'EUR', 'GBP', 'NZD', 'CAD', 'JPY']
const RBA_URL = 'https://www.rba.gov.au/rss/rss-cb-exchange-rates.xml'

async function fetchRates() {
  // RBA RSS gives latest single day. Parse with regex (no XML lib needed for this shape).
  const resp = await axios.get(RBA_URL, { timeout: 30_000, headers: { 'User-Agent': 'EcodiaOS bookkeeper/1.0' } })
  const xml = resp.data
  const rates = {}
  let rateDate = null
  for (const c of CURRENCIES) {
    const re = new RegExp(`<cb:targetCurrency>${c}</cb:targetCurrency>[\\s\\S]*?<cb:value[^>]*>([0-9.]+)</cb:value>[\\s\\S]*?<cb:observationPeriod[^>]*>(\\d{4}-\\d{2}-\\d{2})</cb:observationPeriod>`, 'i')
    const m = xml.match(re)
    if (m) {
      rates[c] = parseFloat(m[1])
      rateDate = m[2]
    }
  }
  return { rateDate, rates }
}

;(async () => {
  const { rateDate, rates } = await fetchRates()
  if (!rateDate || Object.keys(rates).length === 0) {
    console.log('No rates parsed from RBA feed. Silent exit.')
    process.exit(0)
  }
  console.log('RBA rates for', rateDate, JSON.stringify(rates))
  let inserted = 0
  for (const [currency, rate] of Object.entries(rates)) {
    const result = await db`
      INSERT INTO fx_rates (rate_date, base_currency, foreign_currency, rate, source)
      VALUES (${rateDate}, 'AUD', ${currency}, ${rate}, 'rba')
      ON CONFLICT (rate_date, base_currency, foreign_currency) DO NOTHING
      RETURNING id`
    if (result.length) inserted++
  }
  console.log('Inserted', inserted, 'new rates for', rateDate)
  process.exit(0)
})().catch(e => { console.log('FATAL:', e.message); process.exit(1) })
