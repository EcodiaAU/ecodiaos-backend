---
triggers: voice-stateful, voice-state-loss, voice-no-memory, voice-can-not-remember, voice-cold-start, voice-handoff-lost, voice-call-ended-handoff-gone, away-conductor-stateless, away-conductor-no-history, away-fresh-claude-per-turn, case-file, case-files, case-id, case-resolution, thread-log, unified-thread-log, cross-brain-coordination, voice-away-ide-coord, one-brain-three-channels, no-substrate-write-streak-voice, voice-reconnect-amnesia, handoff-never-came-back, call-back-and-it-knows
---

# One brain stateful across voice + away + IDE - thread_log + case_files

Three brains run on EcodiaOS today (voice front Haiku, away-conductor headless Opus on Corazon, IDE conductor in VS Code/Cursor). Until 2026-05-21, each was independently amnesiac:

- Voice held conversation in a `history` array that died on `ws.on('close')`. Hang up = gone. Next call had no idea what was said before.
- Away spawned a fresh `claude --print` subprocess per HANDOFF, with at most the per-channel mirror passed in. No knowledge that this handoff was "for the voice call from 5 min ago." No record after exit.
- IDE conductor (Claude Code session) saw none of it unless someone explicitly whispered via `chat.conductor.inbox`.

Result: a HANDOFF Tate asked for in call #1 was lost by call #2. The away-conductor never knew about IDE work done in between. The IDE conductor never saw what happened on a call.

## The fix - two postgres tables + read/write protocols every brain follows

**`thread_log`** (migration 133). Unified cross-channel conversation log keyed by `thread_id` (= `tate`). Every brain appends each turn it produces, tagged with `channel` (voice / native / sms / telegram / ide / away / system) and `role` (tate / ecodia / system). Tail-on-connect with a `since` cursor gives any brain "what happened since I was last present" across ALL channels.

**`case_files`** (migration 132). One row per piece of in-flight cross-context work (HANDOFF, escalation, multi-turn investigation). Lifecycle `open -> working -> resolved | blocked | abandoned`. `delivered_via[]` tracks which channels saw the result (prevents double-send). `acknowledged_at` tracks whether Tate has actually seen/heard it (vs just queued). Survives call boundaries.

**Services**: `src/services/threadLog.js` (append + tail + cursor read/write) and `src/services/caseFile.js` (open / markWorking / resolveCase / markBlocked / markDelivered / ackCase / listOpenCases / listResolvedUnacked).

## Wire-up - the cross-brain protocols

**Protocol A: tail-on-connect.** Every brain, when it starts a session/turn:
1. Reads its last-seen cursor from `kv_store.cowork.thread_log.cursor.<consumer>.<thread_id>`
2. `tailThreadLog({since})` -> entries since last connect across all channels
3. `listOpenCases({thread_id})` -> work still in flight
4. `listResolvedUnacked({thread_id})` -> results landed while it was off
5. Injects all three as a continuity block into the system prompt

**Protocol B: surface-on-write.** When a brain produces a result others should know about, it appends to thread_log AND (for substantive events) whispers to `chat.conductor.inbox` so the IDE conductor's heartbeat hook surfaces it on its next turn.

## Per-brain wiring

**Voice (`voiceCallService.js`):**
- Mints `voice_call_id` on WS connect.
- `buildOnConnectContext()` loads tail + open cases + unacked, splices into first turn's system prompt.
- `flushNow` appends Tate's transcript to thread_log (channel=voice, role=tate).
- `speakTurn` appends Ecodia's reply (channel=voice, role=ecodia).
- `fireHandoff(task, originatingUserText)` opens a case_file, passes `case_id` + `voice_call_id` in the away envelope. On reply received, queues it with `case_id` in pending; on speak, marks delivered+acked.
- On `ws.on('close')`: persists `lastSeenCursor`. Open cases survive.

**Away-conductor (`scripts/away-conductor-server.js` + `src/services/awayConductorClient.js`):**
- Client passes `case_id` + `voice_call_id` + unified `thread_context` (now sourced from `tailThreadLog`, not the per-channel mirror).
- Server includes "CASE X: you are resolving this in-flight case" in the prompt when case_id is present.
- After `<REPLY>` extract: `resolveCase(case_id, {result: reply})` + `appendThreadLog({channel: 'away', role: 'ecodia', body: reply, case_id})`.
- If no `<REPLY>` extracted: `markBlocked(case_id, {reason: 'no_reply_extracted'})`. Surfaces on next voice connect for retry.
- `extractReply` no longer falls back to the last paragraph (was the source of phantom resolutions per spec §7.3).

**IDE conductor:**
- `~/.claude/hooks/ecodia/thread_tail.py` UserPromptSubmit hook queries Supabase Management API + emits `<thread_tail>`, `<open_cases>`, `<unacked_results>` blocks.
- IDE-side cursor persists at `kv_store.cowork.thread_log.cursor.ide.tate`.
- Direct appends are conductor-judgment (no auto-PostToolUse hook in v1; substantive only).

## Hard-won gotchas

1. **Supabase Management API blocks the default Python urllib User-Agent with 403.** The hook must send `User-Agent: ecodia-thread-tail-hook/1.0` (any non-default string). Curl works because curl sets a UA by default; raw urllib does not. Cost: ~10 min during ship.
2. **Same-timestamp entries from one INSERT lose deterministic order** under DESC sort. In production this doesn't bite (voice turns are seconds apart), but seeded smoke data with concurrent NOW() calls will appear ordered by an unstable tiebreak.
3. **`extractReply` fallback was wider than safe.** "Last short non-empty paragraph" caught partial-output Opus runs and produced phantom case resolutions. Now strictly requires `<REPLY>...</REPLY>` tags. Reply-missing = blocked = retry next call.
4. **Cases must not be auto-abandoned on call close.** Voice hanging up before the away result lands is normal. Open/working cases survive and surface as "btw, X is still pending - want me to retry?" on the next call.

## When this fires

- Designing any cross-brain coordination feature (a new channel, a new background process, a new "talk while it works" pattern).
- Any HANDOFF / escalation that today returns one-shot without record. The default is now: open a case, write the case_id into the envelope, resolve on result.
- Any "voice doesn't remember X from earlier" report from Tate.

## What this does NOT solve

- Voice brain is still Haiku. Sonnet-via-Agent-SDK in voice was attempted and rejected: the Agent SDK is subprocess-based (~3-5s overhead), breaks the voice latency budget (~3s to first audio).
- IDE conductor can't interrupt an active voice call. If I figure something out mid-call, best I can do is append to thread_log + whisper to coord-inbox + notifyTate APNs. The call won't speak my finding mid-conversation.
- Real bi-directional clarifying questions (away asks voice mid-turn) still need server-pushed updates to voice WS. Not shipped in v1.

## Cross-refs

Origin: Tate verbatim 2026-05-21 "neither the headless corazon opus or the call haiku were stateful, if i ended the call, whatever the handoff was from the first call was completely lost..."

Spec: `backend/drafts/one-brain-stateful-coordination-2026-05-21.md` (full 5200-word design with adversarial pass).

Migrations: `backend/src/db/migrations/132_case_files.sql`, `133_thread_log.sql`. Applied to prod Supabase project `nxmtfzofemtrlezlyhcj` 2026-05-21.

Related doctrine: [[away-conductor-runs-on-corazon-not-vps-2026-05-20]], [[live-voice-call-architecture-2026-05-21]], [[one-conductor-many-channels-2026-05-19]], [[coord-inbox-filter-must-be-deny-list-not-allow-list-2026-05-20]], [[verify-deployed-state-against-narrated-state]].

Tate-flagged false positives or regressions: tighten triggers + restate.
