// Empirical test of the claude CLI stream-json protocol.
//
// Question 1: does a single `claude --print --input-format stream-json
//   --output-format stream-json` subprocess accept MULTIPLE prompts via stdin
//   and produce MULTIPLE responses via stdout? Or does it exit after the first?
//
// Question 2: if multi-message works, does session memory persist (model
//   remembers what was said in earlier turns within the same subprocess)?
//
// Question 3: what is the actual latency for warm turns (2nd+) vs cold start?

const { spawn } = require('child_process')
const readline = require('readline')

const CLAUDE_BIN = 'D:/SSD_Turbo/node-global/claude.cmd'
const MODEL = process.argv[2] || 'haiku'

console.log(`\n=== persistent-claude protocol test (model=${MODEL}) ===\n`)

const startSpawn = Date.now()
const child = spawn(CLAUDE_BIN, [
  '--print',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--verbose',
  '--replay-user-messages',
  '--model', MODEL,
  '--dangerously-skip-permissions',
], {
  stdio: ['pipe', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
})

const rl = readline.createInterface({ input: child.stdout })

const messages = []
let firstAssistantAt = null
let secondAssistantAt = null
let thirdAssistantAt = null
let turnStartTimes = []
let assistantTurnCount = 0
let exited = false

rl.on('line', (line) => {
  if (!line.trim()) return
  let m
  try { m = JSON.parse(line) } catch { console.log('NON-JSON:', line.slice(0, 100)); return }
  messages.push({ at: Date.now() - startSpawn, ...m })

  if (m.type === 'assistant') {
    assistantTurnCount++
    if (assistantTurnCount === 1 && !firstAssistantAt) {
      firstAssistantAt = Date.now()
      console.log(`[T+${(Date.now() - startSpawn) / 1000}s] FIRST ASSISTANT MESSAGE arrived`)
      console.log('  preview:', JSON.stringify(m.message?.content || m).slice(0, 200))
      console.log('  cold-start total:', (firstAssistantAt - startSpawn) / 1000, 's\n')

      // Send second message after first response
      setTimeout(() => {
        if (exited) { console.log('subprocess already exited - SINGLE-MESSAGE-PER-INVOCATION'); return }
        const turn2 = Date.now()
        turnStartTimes.push(turn2)
        console.log(`[T+${(turn2 - startSpawn) / 1000}s] sending TURN 2`)
        const msg2 = JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'What was my first question? Answer in one short sentence.' },
        }) + '\n'
        try {
          child.stdin.write(msg2)
          console.log('  stdin.write returned (pipe alive)')
        } catch (e) {
          console.log('  stdin.write FAILED:', e.message)
        }
      }, 500)
    } else if (assistantTurnCount === 2 && !secondAssistantAt) {
      secondAssistantAt = Date.now()
      console.log(`[T+${(Date.now() - startSpawn) / 1000}s] SECOND ASSISTANT MESSAGE arrived`)
      console.log('  preview:', JSON.stringify(m.message?.content || m).slice(0, 200))
      console.log('  warm-turn latency:', (secondAssistantAt - turnStartTimes[0]) / 1000, 's\n')

      // Send third message to confirm sustained continuity
      setTimeout(() => {
        if (exited) return
        const turn3 = Date.now()
        turnStartTimes.push(turn3)
        console.log(`[T+${(turn3 - startSpawn) / 1000}s] sending TURN 3`)
        const msg3 = JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'Count from one to three.' },
        }) + '\n'
        try { child.stdin.write(msg3); console.log('  stdin.write returned') } catch (e) { console.log('  stdin.write FAILED:', e.message) }
      }, 500)
    } else if (assistantTurnCount === 3 && !thirdAssistantAt) {
      thirdAssistantAt = Date.now()
      console.log(`[T+${(Date.now() - startSpawn) / 1000}s] THIRD ASSISTANT MESSAGE arrived`)
      console.log('  preview:', JSON.stringify(m.message?.content || m).slice(0, 200))
      console.log('  warm-turn latency:', (thirdAssistantAt - turnStartTimes[1]) / 1000, 's\n')

      // Done - close stdin
      console.log('--- closing stdin to terminate ---')
      try { child.stdin.end() } catch {}
    }
  }

  if (m.type === 'result') {
    console.log(`[T+${(Date.now() - startSpawn) / 1000}s] RESULT: subtype=${m.subtype} is_error=${m.is_error}`)
    if (m.usage) console.log('  usage:', JSON.stringify(m.usage))
    if (m.cost_usd) console.log('  cost_usd:', m.cost_usd)
  }
})

child.stderr.on('data', (d) => {
  process.stderr.write('[STDERR] ' + d.toString())
})

child.on('exit', (code, signal) => {
  exited = true
  console.log(`\n=== CHILD EXITED code=${code} signal=${signal} at T+${(Date.now() - startSpawn) / 1000}s ===\n`)
  console.log('Total assistant turns received:', assistantTurnCount)
  console.log('Multi-message protocol works:', assistantTurnCount >= 2 ? 'YES' : 'NO')
  console.log('Session continuity confirmed:', assistantTurnCount >= 3 ? 'TEST RAN ALL 3 TURNS' : 'partial')
  console.log('\n--- All messages received ---')
  messages.forEach((m) => {
    console.log(`  T+${m.at / 1000}s type=${m.type}${m.subtype ? ` subtype=${m.subtype}` : ''}`)
  })
  process.exit(0)
})

// Send first message
setTimeout(() => {
  console.log(`[T+${(Date.now() - startSpawn) / 1000}s] sending TURN 1`)
  const msg1 = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: 'Reply with exactly: HELLO-ONE' },
  }) + '\n'
  try {
    child.stdin.write(msg1)
    console.log('  stdin.write returned (pipe alive, awaiting response)')
  } catch (e) {
    console.log('  stdin.write FAILED:', e.message)
  }
}, 500)

// Hard timeout after 90s
setTimeout(() => {
  console.log('\n=== HARD TIMEOUT 90s - killing subprocess ===\n')
  try { child.kill() } catch {}
}, 90000)
