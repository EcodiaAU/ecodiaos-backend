# MessageDisplay hook pilot spec (deferred build, 2026-05-29)

Status: REAL-NEEDS-MORE. The `MessageDisplay` hook event is confirmed live in installed Claude Code 2.1.154 (settings schema enum line 335, last of 31 events; binary wires `displayContent` 9 times plus carries runtime fallback string `MessageDisplay hook flush failed; displaying original delta`). It is NOT built yet on purpose. This file is the bounded pilot that unblocks the real build.

## Why deferred rather than built blind

Three contract uncertainties that would break a scorer shipped without observation:

1. **Fire cadence.** In interactive mode the event fires once per batch of newly-completed lines carrying `delta` / `index` / `final`, NOT once per full assistant message. A voice scorer that needs whole-message text must accumulate deltas or gate strictly on `final:true`.
2. **Field names unverified.** The official docs describe input keys (turn_id / message_id) in prose, never as a schema table. A Python hook reading them could mis-key and silently no-op.
3. **Perf.** The hook fires in the streaming render path. Spawning `pythonw.exe` per line-batch on Windows is ~100-200ms per spawn. On a long streamed message that is many spawns and could visibly lag output. Must measure before shipping a per-batch process-spawn hook.

Plus the hard ceiling: `MessageDisplay` is display-only. The transcript and what Claude sees keep the ORIGINAL text; verbose mode shows the original. So this hook can flag or reformat visible contamination but can NEVER scrub an em-dash or banned phrase from the stored transcript or from Claude's own context. It does not replace the write-time PostToolUse voice hooks. It only adds a cosmetic catch layer for output that already slipped past write-time gating.

## The pilot (do this in a deliberate, watched session, not autonomous)

Step 1. Write `~/.claude/hooks/ecodia/message-display-probe.py`. It reads stdin JSON, appends one line to `~/.claude/hooks/ecodia/logs/message-display-probe.jsonl` recording every top-level key present plus the values of any `delta`/`index`/`final`/`turn_id`/`message_id` keys it finds, then exits 0 with NO stdout (no `displayContent`, so zero transform, pure observation).

Step 2. Wire it as a `MessageDisplay` hook in `~/.claude/settings.json` under `hooks.MessageDisplay` (the event takes no matcher). Mirror the existing command-hook object shape. Short timeout (3s).

Step 3. Run ONE normal session. Watch for output lag. After the session, read the JSONL and confirm: exact field names, whether `final:true` appears once per message, how many fire events per streamed message, average inter-fire gap.

Step 4. If perf is acceptable and the contract is clear, design the real hook: accumulate deltas keyed by message_id, score only on `final:true` via `voice_check_self.py`, and return `displayContent` ONLY to surface a compact `[VOICE n/100]` marker, never to rewrite the body (rewriting mid-stream mangles partial render). If perf is bad, drop the display-layer scorer entirely; the write-time PostToolUse voice hooks remain the real enforcement.

Step 5. Remove the probe hook once the real hook ships or the idea is dropped.

## Decision provenance

Verified via workflow wf_974e4960-2ed (disk + official-docs probes, high confidence) during the Opus 4.8 / Claude Code feature-adoption arc, 2026-05-29. Sister items shipped same arc: worktree.baseRef=head, reload-skills SessionStart hook, /reload-skills documented. claude-agents classified already-have-it (coord bus covers it).
