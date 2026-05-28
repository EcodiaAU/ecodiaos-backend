#!/usr/bin/env node
/* Categorise pending staged_transactions using deepseek directly (bypasses
 * the broken deepseekService wrapper). One-shot script for the 2026-05-28
 * backfill: rule-match first, then deepseek for the remainder, auto-post
 * high-confidence rows, mark DISCARD as ignored.
 */
require('dotenv').config()
const axios = require('axios')
const db = require('../src/config/db')
const bk = require('../src/services/bookkeeperService')

const BATCH_SIZE = 30
const POST_CONFIDENCE = 0.9
const FLAG_CONFIDENCE = 0.7

const CATEGORIZE_PROMPT = `You are a bookkeeper for Ecodia Pty Ltd, an Australian GST-registered software company run by Tate.
Transactions come from FOUR bank accounts. The 'source' tag on each tells you which:
- up_personal_2100: Tate's Up Bank personal Spending account. Most personal, business via Director Loan.
- ba_personal_2100: Tate's Bank Australia personal account (12566110). Most personal.
- ba_ecodia_1000: Ecodia Pty Ltd Bank Australia business account (12579148). All business.
- ba_ecodia_1005: Ecodia Pty Ltd Bank Australia savings account. Business.

═══ OUTGOING MONEY (negative = spent) ═══

DISCARD (account_code = "DISCARD", is_personal = true) - personal transactions that don't belong in the books:
- Food, groceries, restaurants, cafes, takeaway, bakeries, fast food, alcohol, tobacco
- Personal fuel/petrol, personal travel, accommodation, holidays, parking, tolls
- Personal savings transfers ("Africa", "Save Up Challenge", "Quick save", savings pockets)
- "Ecodia Invest" / "Ecodia Savings" - personal investment, NOT company
- Payments to individuals (other people's names)
- Entertainment (cinema, festival, golf, chess, Audible, streaming)
- Health, pharmacy, medical, phone (Felix Mobile)
- Inter-account transfers between same-owner accounts with no business purpose
- Centrelink (refs starting 7D1B), Osko from family/friends, Suncorp Transactional
- "ECODIA PTY LTD" small charges $1-4 (Stripe test charges)
- Anything from a personal account that's clearly personal lifestyle spend

BUSINESS EXPENSES on PERSONAL account = Director Loan path (account_code = GL code, is_personal = true):
- ALL Apple.com/Bill → 5010 Software & SaaS
- ALL Canva, Vercel, GoDaddy, WordPress, Hostinger, Render, MacInCloud, AWS, Hetzner, Google Workspace, Google Cloud → 5010
- OpenAI/ChatGPT, Anthropic/Claude, Replicate, ElevenLabs, Resend, DeepSeek, Cursor, Twilio → 5010
- LinkedIn Premium, FACEBK Ads, Meta Ads → 5005 Advertising & Marketing
- ASIC, Wyoming Secretary of State, Corporate Filings → 5025 Legal & Compliance
- BizCover, QBE Insurance (business) → 5025
- Avery, Officeworks (business) → 5030 Office Supplies
- Note: Google One personal storage = DISCARD (not business)

BUSINESS EXPENSES on BUSINESS account (account_code = GL code, is_personal = false):
- Same vendor logic as above but is_personal=false because they're paid from Ecodia account directly

CAPITAL CONTRIBUTION (account_code = "CAPITAL_CONTRIBUTION", is_personal = false):
- Transfers TO "Ecodia" or "Ecodia Setup" >= $10 from personal account (NOT "Ecodia Invest"/"Ecodia Savings")
- BUT "Quick save transfer" to Ecodia or < $5 = DISCARD

═══ INCOMING MONEY (positive = received) ═══

DISCARD (is_personal = true):
- Centrelink, DEWR ADMIN, Osko from family/friends
- Personal salary, transfers from own savings, refunds for personal items
- "Ecodia Invest" / "Ecodia Savings" returns - personal

BUSINESS INCOME (is_personal = false, account_code = GL code):
- "EcodiaPty" / "ECODIA PTY LTD" / Stripe payouts >$10 → 4100 Ecodia Software Dev income
- "Co-Exist" / "CoExist" / "Coexist Australia" → 4100 (Co-Exist invoice payments)
- "Direct Credit Co-Exist Austral - INV-2026-001" / similar INV refs → 4100 (Co-Exist invoice payment)
- Transfers FROM "Ecodia" to personal (reimbursement) → "REIMBURSEMENT"
- Client payments → 4100
- Government grants, R&D rebates → separate income code if surfaced

═══ RESPONSE FORMAT ═══

Chart: 1000 BA Ecodia | 1005 BA Ecodia Savings | 1010 Up Bank | 1020 BA Personal | 2100 Director Loan | 4000 ECO Local | 4100 Ecodia Software Dev | 5005 Advertising | 5010 Software & SaaS | 5015 Stripe Fees | 5020 Contractor | 5025 Legal & Compliance | 5030 Office | 5035 Motor Vehicle | 5045 Bank Fees

Supplier rules: {rules}

Return a JSON array. One object per input transaction, matched by source_ref:
{ "source_ref": "...", "account_code": "...", "supplier_name": "...", "is_personal": bool, "gst_amount_cents": int, "tags": [], "confidence": 0.0-1.0, "reasoning": "..." }

GST: domestic business expenses GST-inclusive = total/11 (rounded). International SaaS = 0. Personal = 0. Income = 0.
Confidence < 0.5 if unsure.`

async function callDeepSeekDirect(messages, opts = {}) {
  const t0 = Date.now()
  const resp = await axios.post('https://api.deepseek.com/v1/chat/completions', {
    model: 'deepseek-chat',
    messages,
    temperature: opts.temperature ?? 0,
    max_tokens: opts.max_tokens ?? 4000,
  }, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    timeout: 90_000,
  })
  return { text: resp.data.choices[0].message.content, ms: Date.now() - t0 }
}

async function fetchRules() {
  return db`SELECT pattern, supplier_name, account_code, is_personal, gst_treatment, tags FROM supplier_rules`
}

function tryRuleMatch(tx, rules) {
  const desc = `${tx.description || ''} ${tx.transaction_type || ''}`.toLowerCase()
  for (const rule of rules) {
    try {
      if (new RegExp(rule.pattern, 'i').test(desc)) {
        const amountAbs = Math.abs(tx.amount_cents)
        const gst = rule.gst_treatment === 'gst_inclusive' ? Math.round(amountAbs / 11) : 0
        const tags = typeof rule.tags === 'string' ? JSON.parse(rule.tags) : (rule.tags || [])
        return {
          source_ref: tx.source_ref,
          account_code: rule.account_code,
          supplier_name: rule.supplier_name,
          is_personal: rule.is_personal || false,
          gst_amount_cents: gst,
          tags,
          confidence: 0.95,
          reasoning: `Rule: ${rule.pattern}`,
        }
      }
    } catch { /* invalid regex */ }
  }
  return null
}

async function categoriseBatch(batch, rules) {
  const rulesText = rules.map(r => `  ${r.pattern} → ${r.supplier_name} (${r.account_code})`).join('\n')
  const txText = batch.map(tx => {
    const dir = tx.amount_cents > 0 ? 'in' : 'out'
    const longDesc = tx.long_description ? ` | extra: ${tx.long_description.slice(0, 150)}` : ''
    return `- ref:${tx.source_ref} | src:${tx.source_account} | ${tx.occurred_at?.toISOString?.()?.slice(0,10) || tx.occurred_at} | $${(Math.abs(tx.amount_cents) / 100).toFixed(2)} ${dir} | ${tx.description}${longDesc}`
  }).join('\n')

  const { text, ms } = await callDeepSeekDirect([
    { role: 'system', content: CATEGORIZE_PROMPT.replace('{rules}', rulesText) },
    { role: 'user', content: `Categorise these ${batch.length} transactions and return ONLY a JSON array:\n${txText}` },
  ])

  let parsed = text
  if (parsed.includes('```')) {
    parsed = parsed.split('```')[1]
    if (parsed.startsWith('json')) parsed = parsed.slice(4)
    parsed = parsed.trim()
  }

  try { return { results: JSON.parse(parsed), ms } }
  catch (e) { return { results: [], ms, error: e.message + ' raw=' + text.slice(0, 150) } }
}

async function applyResult(tx, result) {
  const confidence = result.confidence || 0
  const tags = result.tags || []

  if (result.account_code === 'DISCARD') {
    await db`UPDATE staged_transactions SET category='DISCARD', is_personal=true, confidence=${confidence}, categorizer_reasoning=${result.reasoning}, status='ignored', reviewed_at=NOW(), reviewed_by='auto-2026-05-28' WHERE id=${tx.id}`
    return 'discarded'
  }

  if (result.account_code === 'CAPITAL_CONTRIBUTION' || result.account_code === 'REIMBURSEMENT') {
    const status = confidence >= FLAG_CONFIDENCE ? 'categorized' : 'flagged'
    await db`UPDATE staged_transactions SET category=${result.account_code}, is_personal=false, confidence=${confidence}, categorizer_reasoning=${result.reasoning}, status=${status}, reviewed_at=NOW(), reviewed_by='auto-2026-05-28' WHERE id=${tx.id}`
    return status
  }

  const status = confidence >= FLAG_CONFIDENCE ? 'categorized' : 'flagged'
  await db`UPDATE staged_transactions SET category=${result.account_code}, subcategory=${tags[0] || null}, is_personal=${result.is_personal || false}, gst_amount_cents=${result.gst_amount_cents || 0}, confidence=${confidence}, categorizer_reasoning=${result.reasoning}, status=${status}, reviewed_at=NOW(), reviewed_by='auto-2026-05-28' WHERE id=${tx.id}`

  if (confidence >= POST_CONFIDENCE && result.account_code !== 'DISCARD') {
    try {
      await bk.postStagedTransaction(tx.id)
      return 'posted'
    } catch (e) {
      return `post_fail:${e.message.slice(0, 80)}`
    }
  }
  return status
}

;(async () => {
  console.log('START', new Date().toISOString())
  const rules = await fetchRules()
  console.log(`Loaded ${rules.length} supplier rules`)

  const counts = { rule_match: 0, ai_match: 0, posted: 0, discarded: 0, categorized: 0, flagged: 0, post_fail: 0, error: 0 }
  let pendingTotal = 0
  let batchIdx = 0

  while (true) {
    const pending = await db`SELECT id, source_ref, source_account, occurred_at, amount_cents, description, long_description, transaction_type FROM staged_transactions WHERE status='pending' ORDER BY occurred_at DESC LIMIT ${BATCH_SIZE}`
    if (pending.length === 0) break

    if (batchIdx === 0) {
      const [{ count }] = await db`SELECT count(*)::int AS count FROM staged_transactions WHERE status='pending'`
      pendingTotal = count
      console.log(`Total pending: ${pendingTotal}`)
    }

    batchIdx++

    // Rule match first
    const needsAI = []
    for (const tx of pending) {
      const matched = tryRuleMatch(tx, rules)
      if (matched) {
        await applyResult(tx, matched).then(outcome => {
          counts.rule_match++
          if (outcome === 'posted') counts.posted++
          else if (outcome === 'discarded') counts.discarded++
          else if (outcome === 'categorized') counts.categorized++
          else if (outcome === 'flagged') counts.flagged++
          else if (outcome.startsWith('post_fail')) counts.post_fail++
        }).catch(e => { counts.error++ })
      } else {
        needsAI.push(tx)
      }
    }

    if (needsAI.length > 0) {
      const { results, ms, error } = await categoriseBatch(needsAI, rules)
      if (error) {
        console.log(`  batch ${batchIdx} AI error in ${ms}ms: ${error.slice(0, 200)}`)
      } else {
        const byRef = Object.fromEntries(needsAI.map(t => [t.source_ref, t]))
        for (const result of results) {
          const tx = byRef[result.source_ref]
          if (!tx) continue
          try {
            const outcome = await applyResult(tx, result)
            counts.ai_match++
            if (outcome === 'posted') counts.posted++
            else if (outcome === 'discarded') counts.discarded++
            else if (outcome === 'categorized') counts.categorized++
            else if (outcome === 'flagged') counts.flagged++
            else if (outcome.startsWith('post_fail')) counts.post_fail++
          } catch (e) {
            counts.error++
            console.log(`  apply fail: ${e.message.slice(0, 100)}`)
          }
        }
      }
      console.log(`  batch ${batchIdx} done in ${ms}ms rule_match=${counts.rule_match} ai=${counts.ai_match} posted=${counts.posted} discarded=${counts.discarded} flagged=${counts.flagged}`)
    } else {
      console.log(`  batch ${batchIdx} pure rule match, no AI needed`)
    }

    // Stop if we hit a brick wall (error cluster)
    if (counts.error > 50) {
      console.log('FAIL_HARD: error count >50, stopping')
      break
    }
  }

  console.log('DONE', new Date().toISOString())
  console.log('Summary:', JSON.stringify(counts, null, 2))
  process.exit(0)
})().catch(e => { console.log('FATAL:', e.message, e.stack); process.exit(1) })
