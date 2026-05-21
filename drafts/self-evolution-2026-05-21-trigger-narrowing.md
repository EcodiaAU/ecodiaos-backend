---
authored: 2026-05-21
authored_via: self-evolution routine (cron, claude code on the web)
branch: claude/blissful-fermat-lvQDj
focus_area: C (trigger narrowing)
prior_focus_marker: kv_store.ceo.last_self_evolution was unreadable from this remote environment (MCP write-scope denied for read of ceo.* and no human-approval channel for the read either) - rotated by default to focus area C
---

# Self-evolution 2026-05-21 - trigger narrowing on 8 high-leverage patterns

## What this fire built

Narrowed `triggers:` frontmatter on 8 pattern files whose bare common-noun triggers were producing `[CONTEXT-SURFACE WARN]` floods per `triggers-must-be-narrow-not-broad.md`. Each file got:

1. Frontmatter `triggers:` line rewritten - bare nouns replaced with narrow compounds, literal identifiers, or specific names per the four tiers in the rule file.
2. HTML comment block inserted at top of body documenting OLD vs NEW triggers and the rationale for each removal/replacement.
3. `patterns/INDEX.md` regenerated via `scripts/regen-patterns-index.js` (the canonical deterministic walk - same script the daily-index-regen cron runs).

## Files edited

| File | Bare triggers removed | New compound triggers added |
|---|---|---|
| `asc-app-record-create-recipe.md` | asc, app, record, create, new, google, chrome, chrome-exe, store, connect | asc-create-app, asc-new-app, app-store-connect-new-app, internal-group-access, asc-internal-testers, ios-release-pipeline-setup, eos-mobile-asc-setup |
| `apple-dev-apns-auth-key-create-recipe.md` | apple, dev, certificates, identifiers, profiles, developer, push-notifications | apple-developer-portal, apple-dev-certificates-identifiers-profiles, AuthKey_.p8, push-notification-key-create, apns-p8-rotation |
| `decide-do-not-ask.md` | decide, ask, defer, disambiguate, escalate | decide-do-not-ask (slug), disambiguate-routine-decision, escalate-to-tate |
| `large-audio-transcription-chunking-strategy.md` | transcription, audio, whisper, ffmpeg, chunk, oom, heap, memory, large-file | large-audio-transcription, audio-chunking, whisper-25mb-limit, deepgram-transcribe, ffmpeg-mp3-downmix, audio-chunk-merge, audio-heap-oom, transcribeWithChunking, transcribeAudio, storage-50mb-limit, MediaRecorder-webm |
| `decision-quality-classifier-must-heartbeat-and-alert-on-backlog.md` | backlog, unclassified, heartbeat, backpressure | dq-classifier-backlog, outcome_event-unclassified, dq-classifier-heartbeat, dq-classifier-backpressure, dq-classifier-starvation, dq-classifier-budget |
| `cred-rotation-must-propagate-to-all-consumers.md` | rotation, propagation, smtp, resend, kv_store, edge-function | credential-rotation, rotation-propagation, smtp-rotation, resend-smtp, kv_store-creds, edge-function-secrets |
| `mcp-tool-param-schema-discipline.md` | mcp, param-name, singular-vs-plural, schema-discipline | mcp-tool-param, mcp-param-name, mcp-singular-vs-plural, mcp-schema-discipline, invalid_type-expected-undefined |
| `mcp-array-param-bypass.md` | mcp, array-param, stringified, bypass-to-http, direct-api | mcp-array-param, mcp-array-param-stringified, stringified-array, bypass-to-http-direct-api |

Total broad triggers removed: 49 across 8 files.
Total narrow compounds added: 47 across 8 files.

## What worked

- The audit Python script (single-pass `triggers:` extraction + bare-common-noun cross-reference) was the cheap way to surface the 8 worst offenders out of 310 patterns. Reusable next fire.
- `scripts/regen-patterns-index.js` regenerated the INDEX deterministically - no manual line edits needed.
- The em-dash check post-edit (grep for U+2014 scoped to my new comment blocks via `awk` extraction) caught nothing because I only inserted ASCII hyphens in my new content. Pre-existing em-dashes in file bodies were left untouched (not in this fire's scope).

## What did not work

- `kv_store.get ceo.last_self_evolution` failed - MCP tool calls in this remote execution environment require human approval and this is a cron fire with no human present. Fell back to default rotation (picked focus area C). Same applies to `neo4j.search` and `status_board.query` - all three orientation primitives were unavailable.
- Could not write the `kv_store.set ceo.last_self_evolution` marker for the same reason. This file at `drafts/self-evolution-2026-05-21-trigger-narrowing.md` is the on-disk substitute - the next self-evolution fire should `ls drafts/self-evolution-*.md` to see prior focus areas.
- Could not write the `neo4j.write_episode` Episode node. Same MCP-approval block. The git commit message carries the equivalent record.

## Next session should consider

- Focus area A (pattern authoring) - mine recent Episodes from the May 18-21 voice-call build arc for a "live-call gotcha cluster" pattern if the same audio/AEC/turn-taking failure modes recur in the EcodiaOS-native or Chambers builds.
- Focus area B (cross-referencing) - the May 18-21 patterns around CDP / voice / away-conductor / native-build form a tight cluster; audit whether each one cross-references the others where relevant (e.g. live-voice-call-architecture-2026-05-21 already links three siblings, but ecodia-native-headless-ship-recipe-2026-05-20 and away-conductor-runs-on-corazon-not-vps-2026-05-20 may have one-way links).
- Focus area C continuation - 37 more patterns still have bare-common-noun triggers per the audit. The remaining list is in this Episode's git commit; next C-fire can pick the next 5-8 by impact.

## Was this fire worth the tokens

Yes. The substrate is measurably more capable - 49 false-positive trigger keywords removed from the hot path of the brief-consistency-check hook. The next fork brief that mentions "app" or "create" or "store" or "audio" or "memory" or "smtp" or "mcp" will get a less polluted `[CONTEXT-SURFACE WARN]` list, which is the entire point of Layer 2 of the surfacing architecture per `context-surfacing-must-be-reliable-and-selective.md`.
