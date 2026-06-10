# "Yeah" Tail Bug RCA - Meeting Transcription
**Fork:** fork_mp1y5cmf_fd9629 | **Date:** 2026-05-12

## Observed symptoms

Recording `1e8712f9` (534s, 8MB): transcript ends with "Yeah. Yeah. Yeah." repeated ~50 times.
Recordings `f1266d14`, `4e6605b3`: transcript ends with "Transcribe verbatim, including filler words" repeated many times (prompt echo-loop).

## Root causes

### Bug 1: "Yeah" tail hallucination (PRIMARY — Tate's chunk-error hypothesis)

**Leading theory (Tate, 11:24 AEST):** When a chunk upload errors mid-recording, the UI shows an error toast but recording continues. The backend then receives chunks N, FAIL(N+1), N+2... On stop, `downloadChunks()` reassembles present chunks. The missing chunk creates a silence/gap in the merged audio. Whisper receives audio with silence in the gap and trailing silence at stop, and hallucinates filler words ("Yeah.") on the silent region, repeating them until it fills the remaining time budget.

**Secondary contributor:** Even without chunk gaps, Whisper is known to hallucinate on trailing silence (user said "Yeah" at the end then paused before hitting stop). The silence is ambient, Whisper fills it.

**Evidence:** The affected recording is 534s at 8MB with `chunk_statuses` logging not yet implemented, so exact chunk loss is unconfirmed. However the symptom (50+ identical "Yeah." repetitions starting precisely where transcript content becomes sparse) is consistent with Whisper hallucinating on a 30-60s silent tail.

### Bug 2: Prompt echo-loop (FIXED prior to this fork)

**Root cause:** Previous `PROMPT_HINT` was instruction-shaped ("Transcribe verbatim, including filler words..."). Whisper echoes instruction-shaped prompts on longer audio (>~5min) instead of transcribing. Commit `0e3c643` already neutralised the prompt to a proper-noun context hint.

## Fixes shipped (this fork)

1. **`stripRepetitiveTail()`** in `transcriptionService.js`: post-processes any transcript, detects a phrase/word repeating 4+ times consecutively at the end of the text, strips the repetitions. Handles both "Yeah." loops and prompt echo-loop artifacts on old recordings that need retranscription.

2. **Chunk retry + health dots** in frontend recorder: each chunk auto-retries once on failure (2s delay). Failed chunks surface as amber dots (recording continues non-blocking). This reduces the probability of chunk gaps that cause silent regions.

3. **Idempotent stop**: backend now checks `transcription_status` before re-running transcription on duplicate stop calls.

## Remaining uncertainty

Exact reproduction path for chunk-gap → Yeah-tail not yet confirmed empirically. The chunk health dot logging in the new recorder UI will generate evidence on next use. If a chunk errors and the tail reappears, the gap-to-hallucination path is confirmed. Next step: add backend chunk manifest logging to `stop` endpoint.

## Future-proofing

When Deepgram Nova-2 is provisioned, diarisation produces word-level timestamps which eliminates the silence-padding issue entirely (Deepgram uses VAD to detect and skip silence).
