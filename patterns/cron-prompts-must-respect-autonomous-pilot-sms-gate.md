---
triggers: cron-prompt-sms, autonomous-pilot-sms-suppression, communication_mode-no_sms_unless_critical, sleep-window-sms-bleed, scheduled-task-prompt-authoring, sms-tate-during-pilot, dao-amendment-cron-near-miss-2026-05-08, cron-prompt-pilot-check-required, batch-cron-prompt-patch
---

# Cron prompts that may SMS Tate must check autonomous_pilot.active first

Every scheduled-task prompt that includes a routine SMS or iMessage path to Tate MUST prepend an autonomous-pilot suppression header at the top of the prompt. The header instructs the firing turn to read `kv_store.ceo.autonomous_pilot.active`, and when present and unexpired with `communication_mode='no_sms_unless_critical'`, divert routine status messages into a P3 status_board row tagged for morning surfacing instead of waking Tate.

Genuine critical-breakage SMS paths (P0/P1 system outage, restart loop detection, broken pipeline after N consecutive failures) are exempt and SHOULD continue to fire even during autonomous-pilot windows. The exemption MUST be explicit in the prompt body so the firing turn knows the path it sits on is a critical-breakage path, not a routine path.

The autonomous-pilot flag is the single source of truth on whether Tate is asleep / unavailable / has explicitly declared a no-sms window. Routine SMS during that window costs trust, sleep, and segment fees while delivering content that morning briefing will surface anyway. Critical-breakage SMS during that window is correct behaviour: silence on a real outage costs more than a dropped sleep cycle.

## Rule

A cron prompt is in scope for the suppression header when it contains an instruction shaped like "send SMS to Tate when X" / "SMS Tate via mcp__sms__send_sms" / "send via Skill sms-tate" / "iMessage Tate" AND the trigger condition X is a routine state, status update, summary, nudge, or non-emergency alert.

A cron prompt is OUT of scope (no header needed) when:
- It contains no SMS / iMessage instruction.
- The SMS path is gated to a P0 / P1 condition explicitly named in the prompt (restart-loop > 2/min, broken pipeline after 3 consecutive failures, API authentication failure that blocks all dispatches, security incident).
- The prompt explicitly says "do NOT text Tate from here" or routes alerts to a different cron.

## The header (canonical)

```
## CRITICAL FIRST STEP - Autonomous-pilot SMS suppression check
Before any SMS / iMessage to Tate, check `kv_store.ceo.autonomous_pilot.active`. If present and unexpired, set `communication_mode='no_sms_unless_critical'`:
- DO NOT send SMS or iMessage for routine status updates
- INSTEAD: write a P3 status_board row tagged for morning surfacing with the same content the SMS would carry
- Tate will see it in his morning briefing
- Reset the iMessage/SMS gate to fire normally only for genuine critical breakage
```

Prepend at the very top of the prompt, BEFORE any other content (including any "you are EcodiaOS in fork form, no prior context" preamble - the suppression check is the very first thing the firing turn reads).

## Do

- Prepend the canonical header verbatim - do not paraphrase, do not abbreviate, do not summarise. The firing turn matches against the literal text.
- Treat ambiguous cases as in-scope and patch them. The cost of an extra header on a critical-breakage cron is zero. The cost of a sleep-disturbing SMS is real.
- For genuine critical-breakage paths (system-health restart-loop, kg-consolidation 3-strike pipeline failure), explicitly state the exemption in the prompt body so the firing turn does not also read the header and suppress the breakage SMS. The header text is permissive of breakage SMS by design ("Reset the iMessage/SMS gate to fire normally only for genuine critical breakage").
- Verify after patching with: `SELECT id, name, (prompt LIKE '%autonomous_pilot%' OR prompt LIKE '%no_sms_unless_critical%') AS has_pilot_check FROM os_scheduled_tasks WHERE id IN (...)`. Confirm has_pilot_check=true on every patched cron.
- When AUTHORING any new cron with an SMS path, include the header at the top from the start. Do not author it bare and patch later.

## Do not

- Patch crons that have NO SMS path. The header is dead weight on a cron that will never SMS.
- Patch crons whose SMS path is already gated to a P0/P1 condition. The exemption already governs.
- Modify the suppression-header text mid-flight. The dao-amendment cron's patch is the canonical template. Drift in header wording across crons makes future audit harder.
- Strip the existing prompt content when prepending. Concatenate, do not replace.
- Treat the autonomous_pilot flag as a global mute. Critical-breakage SMS still fires; the header makes that explicit.
- Author the cron with the SMS instruction but no header and rely on the firing turn's "common sense" to suppress. Common sense in cold-start fork form is unreliable. The header is the load-bearing piece.

## Worked example - dao-amendment-cron near-miss 8 May 2026 22:03 AEST

The `dao-amendment-deadline-checkpoint-may-8` delayed task was authored to fire at 22:30 AEST on 8 May 2026, the W.S. 17-31-105/106 30-day-window statutory deadline. The original prompt had three branches (state-approval-returned, deadline-reached-still-pending, deadline-reached-no-agent-reply). All three branches sent an SMS to Tate to inform him of the state.

At 22:00 AEST the meta-loop fired and the conductor noticed `kv_store.ceo.autonomous_pilot.active` was set with `communication_mode='no_sms_unless_critical'`. Tate was asleep. The dao-amendment cron was 26 minutes from firing an unconditional SMS that would have woken him for a routine compliance status update.

22:03 AEST the conductor patched the dao-amendment cron's prompt with the suppression header. Branches (a) (b) (c) were rewritten to fork on autonomous_pilot.active: if set, write a P3 status_board row tagged morning_surface=true; if not, send the SMS as before.

22:05 AEST a sweep of all active crons revealed 8 more candidates with routine SMS paths and no header. The conductor was at energy_cap and deferred to a fork.

22:07 AEST this fork (fork_mowvg7ak_6f2485) was dispatched with the explicit brief: probe each of the 9, classify into A (patch) / B (critical-breakage exempt) / C (no SMS path), patch the bucket A crons, ship the doctrine, archive the deferred status_board row.

Outcome:
- Bucket A (patched): coexist-sync-health, external-blocker-freshness-probe, tate-blocked-nudge-weekly.
- Bucket B (critical-breakage, no patch): kg-consolidation, system-health, zernio-voice-queue-refresh-may-8.
- Bucket C (no SMS path or explicitly says do-not-SMS): meta-loop, neo4j-keepalive, telemetry-outcome-inference.

## Origin

Chain (8 May 2026):
1. 22:00 AEST - meta-loop fire surfaced the dao-amendment cron's pending SMS.
2. 22:03 AEST - conductor probed kv_store.ceo.autonomous_pilot.active, confirmed no_sms_unless_critical mode, patched dao-amendment header.
3. 22:05 AEST - sweep of all active crons identified 8 more candidates.
4. 22:07 AEST - this fork (fork_mowvg7ak_6f2485) dispatched.
5. Pattern, patches, cross-refs, Neo4j node, commit shipped within the fork's window.

The near-miss was bounded only by the meta-loop firing 27 minutes before the dao-amendment cron. Without that meta-loop fire, the dao-amendment SMS would have fired at 22:30 AEST and woken Tate. The near-miss is the artefact that made this pattern necessary - the next autonomous-pilot window with an unpatched cron will not have a meta-loop adjacent enough to catch it.

## Verification protocol

To verify all SMS-path crons in the os_scheduled_tasks table respect the autonomous-pilot gate:

```sql
SELECT id, name,
       (prompt LIKE '%autonomous_pilot%' OR prompt LIKE '%no_sms_unless_critical%') AS has_pilot_check,
       (prompt LIKE '%mcp__sms__send_sms%' OR prompt LIKE '%sms-tate%' OR prompt ILIKE '%SMS Tate%' OR prompt ILIKE '%iMessage Tate%') AS has_sms_path
FROM os_scheduled_tasks
WHERE status = 'active'
ORDER BY name;
```

Any row with `has_sms_path=true AND has_pilot_check=false` is either (a) a bucket A cron that needs the header, or (b) a bucket B critical-breakage cron whose exemption needs to be explicit in the prompt body. Probe the prompt and classify before deciding.

## Cross-references

- `~/ecodiaos/patterns/silent-alerts-defer-when-tate-is-live.md` - the inverse rule: when Tate IS live in the OS session, silent-loop-detector SMS defers. The autonomous-pilot gate is a stronger form of the same principle: don't burn a segment on Tate when the segment will not produce useful action.
- `~/ecodiaos/patterns/sms-segment-economics.md` - the cost framing. Every routine SMS during sleep is a segment paid for content morning briefing surfaces for free.
- `~/ecodiaos/patterns/imessage-is-primary-contact-channel-to-tate.md` - the channel canon. iMessage primary, SMS fallback. Both share the suppression gate.
