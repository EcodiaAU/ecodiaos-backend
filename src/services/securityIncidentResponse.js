'use strict'

/**
 * securityIncidentResponse - §7.2 incident triggers and emergency mode.
 *
 * When any of the following fire, the OS must immediately:
 *   1. Set tateActiveGate.emergency_mode = true in kv_store - revokes
 *      all Tier-3 tokens.
 *   2. Pause cron dispatcher (schedulerPollerService).
 *   3. Halt all running forks (forkService.abortAll('security_incident')).
 *   4. Post to sms_tate with the incident class.
 *
 * Triggers:
 *   - credential_redactions_total increments outside bootstrap
 *   - write to self-mod denylist path by a factory session
 *   - cypher query rejected by label allowlist
 *   - untrusted_input delimiter mismatch (nested delimiter detected)
 *   - any session writes >10 doctrine-like Neo4j nodes in <5 min
 *
 * Incident recovery requires Tate SSH + manual clear. No self-clear path.
 *
 * This module is decoupled from the actual cron/fork/sms implementations
 * via a services container passed in at boot so it's testable in
 * isolation. The services container injects:
 *   setEmergencyMode(flag), pauseCrons(), haltForks(reason), smsTate(message)
 */

const db = require('../config/db')
const logger = require('../config/logger')

const VALID_CLASSES = Object.freeze([
  'credential_redaction_burst',
  'self_mod_denylist_write',
  'cypher_label_rejected',
  'untrusted_input_delimiter_mismatch',
  'doctrine_write_burst',
  'review_b_rejection_burst',
  'tier3_verify_failure_burst',
])

// Injected at boot. Kept as null so tests can override; production wiring
// calls wireServices() once.
let _services = {
  setEmergencyMode: null,
  pauseCrons: null,
  haltForks: null,
  smsTate: null,
}

function wireServices(services) {
  _services = { ..._services, ...services }
  logger.info('securityIncidentResponse: services wired', {
    keys: Object.keys(_services).filter((k) => typeof _services[k] === 'function'),
  })
}

async function _logIncident({ incident_class, trigger_source, session_id, details }) {
  try {
    const [row] = await db`
      INSERT INTO security_incidents
        (incident_class, trigger_source, session_id, details)
      VALUES
        (${incident_class}, ${trigger_source || null}, ${session_id || null},
         ${JSON.stringify(details || {})})
      RETURNING *
    `
    return row
  } catch (err) {
    logger.error('securityIncidentResponse: failed to log incident', {
      incident_class, error: err.message,
    })
    return null
  }
}

/**
 * Fire an incident. Runs all response steps in parallel; each is best-
 * effort (exceptions logged, not re-raised). An incident response must
 * not itself cause a crash.
 */
async function fireIncident({
  incident_class,
  trigger_source,
  session_id,
  details,
}) {
  if (!VALID_CLASSES.includes(incident_class)) {
    throw new Error(`securityIncidentResponse: unknown incident_class '${incident_class}'`)
  }
  logger.error('SECURITY INCIDENT', { incident_class, trigger_source, session_id, details })

  const incidentRow = await _logIncident({ incident_class, trigger_source, session_id, details })
  const incidentId = incidentRow?.id || null

  const steps = []

  if (typeof _services.setEmergencyMode === 'function') {
    steps.push(
      Promise.resolve(_services.setEmergencyMode(true, incident_class))
        .catch((err) => logger.error('emergency mode set failed', { error: err.message })),
    )
  }
  if (typeof _services.pauseCrons === 'function') {
    steps.push(
      Promise.resolve(_services.pauseCrons(incident_class))
        .catch((err) => logger.error('cron pause failed', { error: err.message })),
    )
  }
  if (typeof _services.haltForks === 'function') {
    steps.push(
      Promise.resolve(_services.haltForks(`security_incident:${incident_class}`))
        .catch((err) => logger.error('fork halt failed', { error: err.message })),
    )
  }
  if (typeof _services.smsTate === 'function') {
    const msg = `[SECURITY] ${incident_class} — check VPS. Incident #${incidentId || 'unknown'}. Emergency mode set; cron+forks halted. SSH to clear.`
    steps.push(
      Promise.resolve(_services.smsTate(msg.slice(0, 160)))
        .catch((err) => logger.error('sms_tate failed', { error: err.message })),
    )
  }

  await Promise.allSettled(steps)
  return incidentRow
}

/**
 * Helper used by the credential redactor / counters to detect bursts.
 * Call with (count, windowMs). Returns true when an incident should fire.
 * Threshold defaults per §7.2: any credential_redactions_total increment
 * outside bootstrap is suspicious.
 */
function shouldFireCredentialBurst({ redactions_since_bootstrap, bootstrap_done }) {
  if (!bootstrap_done) return false
  return redactions_since_bootstrap > 0
}

async function isEmergencyMode() {
  try {
    const rows = await db`
      SELECT value FROM kv_store WHERE key = 'system.emergency_mode'
    `
    if (rows.length === 0) return false
    const raw = rows[0].value
    // kv_store stores JSON text — parse both JSON-wrapped and plain bool.
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        return parsed === true || parsed?.active === true
      } catch {
        return raw === 'true'
      }
    }
    return raw === true
  } catch (err) {
    logger.warn('isEmergencyMode check failed — returning false', { error: err.message })
    return false
  }
}

module.exports = {
  fireIncident,
  wireServices,
  shouldFireCredentialBurst,
  isEmergencyMode,
  VALID_CLASSES,
}
