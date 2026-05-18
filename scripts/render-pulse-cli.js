#!/usr/bin/env node
'use strict'

// render-pulse-cli.js
//
// Stdout: concatenated turn-start continuity blocks for the LOCAL Corazon
// conductor. Invoked by a UserPromptSubmit hook (or any prelude assembler)
// when a fresh pulse is required.
//
// Blocks rendered:
//   <finance_pulse>...</finance_pulse>
//   <client_pulse client="<slug>">...</client_pulse>  (only when conductor
//                                                       context_client is set)
//
// Output discipline:
//   - Each block written via financePulseService.renderBlock /
//     clientPulseService.renderActiveBlock - both already 1500-byte capped.
//   - Combined output capped at 3000 bytes.
//   - Exit 0 on success, exit 0 with empty stdout on any error (hook never
//     pollutes the prelude with stack traces).
//
// Caller is expected to load env from .env or supply DATABASE_URL via env.
//
// Doctrine: continuity-blocks-are-the-os-pulse-2026-05-18.md.

const COMBINED_CAP = 3000

async function main() {
  try {
    require('../src/config/env')
  } catch (err) {
    process.stderr.write('[render-pulse-cli] env load failed: ' + err.message + '\n')
    process.exit(0)
  }

  let finance = require('../src/services/financePulseService')
  let clientPulse = require('../src/services/clientPulseService')

  const parts = []

  try {
    const financeBlock = await finance.renderBlock()
    if (financeBlock && typeof financeBlock === 'string') parts.push(financeBlock)
  } catch (err) {
    process.stderr.write('[render-pulse-cli] finance render failed: ' + err.message + '\n')
  }

  try {
    const clientBlock = await clientPulse.renderActiveBlock()
    if (clientBlock && typeof clientBlock === 'string' && clientBlock.length > 0) {
      parts.push(clientBlock)
    }
  } catch (err) {
    process.stderr.write('[render-pulse-cli] client render failed: ' + err.message + '\n')
  }

  let combined = parts.join('\n')
  if (combined.length > COMBINED_CAP) combined = combined.slice(0, COMBINED_CAP)

  process.stdout.write(combined)
  process.exit(0)
}

main().catch(err => {
  process.stderr.write('[render-pulse-cli] unhandled: ' + (err && err.message || err) + '\n')
  process.exit(0)
})
