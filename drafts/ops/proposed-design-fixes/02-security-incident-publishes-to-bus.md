# Fix 02 — securityIncidentResponse publishes to perceptionBus

**Origin:** fork_moslimsp_a72e73 listener audit §3.2
**Leverage:** HIGH
**Files:** `src/services/securityIncidentResponse.js`

## Problem
`fireIncident()` writes to `security_incidents` table + sets emergency_mode + halts forks + SMS Tate. It does NOT call `perceptionBus.publish()`.

The dispatcher matcher `security_incident` (perceptionDispatcher.js:237-276) was wired 5 May to listen for security signals and auto-create P1 status_board rows, but the canonical security signal source — fireIncident itself — never feeds it.

Result: a real incident bypasses the matcher path entirely. The status_board row only appears if some OTHER caller publishes a matching event, which today is none.

## Patch (securityIncidentResponse.js)

Locate the head of `fireIncident()` (after the VALID_CLASSES check, before `_logIncident`) and add:

```diff
   logger.error('SECURITY INCIDENT', { incident_class, trigger_source, session_id, details })

+  // Publish to perceptionBus so the security_incident matcher
+  // (perceptionDispatcher.js) sees it and auto-creates a P1 status_board
+  // row. Without this, fireIncident is the canonical incident source but
+  // the matcher never gets the signal. See drafts/listener-audit-worker3-2026-05-05.md §3.2.
+  try {
+    require('./perceptionBus').publish({
+      source: 'security',
+      kind: incident_class,
+      data: { trigger_source, session_id, details },
+      confidence: 1.0,
+    }).catch(() => {})
+  } catch {}
+
   const incidentRow = await _logIncident({ incident_class, trigger_source, session_id, details })
```

## Verification
1. Trigger a test incident (`fireIncident({ incident_class: 'doctrine_write_burst', ... })` in test scope, NOT prod).
2. Within 5s: `SELECT * FROM os_observations WHERE source = 'security' ORDER BY observed_at DESC LIMIT 1` returns the row.
3. Within 5s after that: `SELECT * FROM status_board WHERE name LIKE 'auto: security/%'` shows a P1 row.
