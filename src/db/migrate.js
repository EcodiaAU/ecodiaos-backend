require('../config/env')
const fs = require('fs')
const path = require('path')
const postgres = require('postgres')
const env = require('../config/env')
const logger = require('../config/logger')

// Use a single connection for migrations - avoids pool exhaustion
// when the main app is running and holding connections
const db = postgres(env.DATABASE_URL, {
  max: 1,
  idle_timeout: 60,    // was 10s - too short for slow Supabase pooled connections
  connect_timeout: 30,
})

async function migrate() {
  // Flags:
  //   --skip-on-already-exists  When a migration fails with 42P07 (relation
  //     already exists) or 42701 (column already exists), record the file as
  //     applied and continue. Use when a hand-run table on prod predated the
  //     migration that creates it. Strict mode (default) preserves the original
  //     "halt on any error" behaviour for genuine failures.
  //   --mark-applied=<file,...>  Record the listed filenames in _migrations
  //     without running them. Recovery hatch for migrations whose target
  //     already exists in prod.
  const skipOnExists = process.argv.includes('--skip-on-already-exists')
  const markFlag = process.argv.find(a => a.startsWith('--mark-applied='))
  const markApplied = markFlag ? markFlag.slice('--mark-applied='.length).split(',').map(s => s.trim()).filter(Boolean) : []

  // Ensure _migrations table exists
  await db`CREATE TABLE IF NOT EXISTS _migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`

  const migrationsDir = path.join(__dirname, 'migrations')
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  // Recovery hatch: force-mark specific files as applied.
  if (markApplied.length > 0) {
    for (const f of markApplied) {
      try {
        await db`INSERT INTO _migrations (filename) VALUES (${f}) ON CONFLICT (filename) DO NOTHING`
        logger.info(`Marked applied (manual): ${f}`)
      } catch (err) {
        logger.error(`Failed to mark ${f}`, { error: err.message })
      }
    }
  }

  const applied = await db`SELECT filename FROM _migrations`
  const appliedSet = new Set(applied.map(r => r.filename))

  const pending = files.filter(f => !appliedSet.has(f))

  if (pending.length === 0) {
    logger.debug(`Migrations: all ${files.length} already applied, nothing to do`)
    await db.end()
    return
  }

  const skipped = []
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    logger.info(`Applying migration: ${file}`)

    try {
      await db.begin(async tx => {
        await tx.unsafe(sql)
        await tx`INSERT INTO _migrations (filename) VALUES (${file})`
      })
      logger.info(`Applied: ${file}`)
    } catch (err) {
      const isAlreadyExists = err.code === '42P07' || err.code === '42701' ||
        /already exists/i.test(String(err.message))
      if (isAlreadyExists && skipOnExists) {
        // Record the file as applied so subsequent runs skip it; we trust the
        // hand-run schema matches what the migration would have produced.
        await db`INSERT INTO _migrations (filename) VALUES (${file}) ON CONFLICT (filename) DO NOTHING`
        skipped.push({ file, code: err.code, message: err.message.slice(0, 200) })
        logger.warn(`Marked applied without running (already-exists, --skip-on-already-exists): ${file}`, {
          code: err.code, message: err.message.slice(0, 200),
        })
      } else {
        throw err
      }
    }
  }

  const ran = pending.length - skipped.length
  logger.info(`Migrations complete - ${ran} ran, ${skipped.length} skipped (already-exists), ${files.length - pending.length} already up to date`)
  if (skipped.length > 0) {
    logger.warn(`Skipped migrations (re-verify schema by hand): ${skipped.map(s => s.file).join(', ')}`)
  }
  await db.end()
}

migrate().catch(err => {
  logger.error('Migration failed', { error: err.message, stack: err.stack })
  process.exit(1)
})
