# Meeting Transcription Pipeline Spec - v0.1 - 2026-05-12

## Recommendation

**Deepgram Nova-2 with built-in diarisation.**

Single API call returns speaker-labelled utterances with timestamps. Costs ~$0.26/hr meeting. No separate diarisation step, no Python dependencies, no ffmpeg required for standard files. Cheapest of the cloud options at $0.0043/min. API key needs provisioning (none found in kv_store).

---

## Rationale

| Option | $/hr | Diarisation | Verdict |
|--------|------|-------------|---------|
| Deepgram Nova-2 | $0.258 | Built-in | **Recommended** |
| OpenAI Whisper API | $0.36 | No (extra step needed) | More expensive + more steps |
| AssemblyAI | $0.372 | Built-in | More expensive, no existing key |
| Self-hosted whisper.cpp | $0 | No | ~30-60min CPU per 1hr meeting - too slow |
| pyannote.audio | $0 | Yes (CPU) | Same speed problem as above |
| Otter.ai pipe | $0 (if subscribed) | Yes | No evidence Tate uses Otter; skipped |

**Why not Whisper API:** $0.36/hr vs $0.258/hr AND no built-in diarisation - requires a second API call (pyannote or a third-party diarisation service) to identify speakers. Two-step pipeline for a worse price.

**Why not self-hosted:** ffmpeg is not installed on the VPS. Python 3.12.3 + pip are available (could install whisper), but a 60-minute meeting would take 30-60 minutes of CPU transcription time - unacceptable latency for a post-meeting pipeline. VPS has 4 cores and 855MB free RAM; whisper-medium alone needs ~2GB RAM.

**Why Deepgram:** one HTTP POST, one JSON response, done. The response includes `utterances` array: `[{speaker: "0", start: 0.0, end: 2.4, text: "..."}]`. Post-processing is a simple merge. No model downloads, no GPU, no Python environment management.

---

## API keys status

Queried kv_store for all relevant keys as of 2026-05-11:

- **OpenAI**: not found in kv_store
- **Deepgram**: not found in kv_store
- **AssemblyAI**: not found in kv_store
- **Otter.ai**: not found in kv_store

**Action required before Phase 2:** Tate provisions a Deepgram API key at console.deepgram.com and stores it:
```sql
INSERT INTO kv_store (key, value) VALUES ('creds.deepgram_api_key', '"dg_XXXXXXXXXXXX"');
```

---

## Pipeline design

### Input

Audio file path (one of):
- `meetings/YYYY-MM-DD/<slug>/audio.opus` (Corazon ffmpeg capture)
- `meetings/YYYY-MM-DD/<slug>/audio.webm` (phone PWA capture)
- `meetings/YYYY-MM-DD/<slug>/audio.mp3` (converted)

Stored in Supabase Storage bucket `meetings`. Pipeline receives either a Supabase public URL or a local VPS path.

Deepgram accepts: mp3, mp4, mp4a, m4a, m4v, mp2, mpeg, mpg, wav, ogg, opus, webm, mka, wma, aac, flac, amr, 3gp, ts, m2ts.

File size: Deepgram's pre-recorded API handles up to 2GB. A 60-minute Opus file at 32kbps = ~14MB. No chunking required.

---

### Step 1: Transcription + diarisation (single API call)

**Endpoint:** `POST https://api.deepgram.com/v1/listen`

**Headers:**
```
Authorization: Token <DEEPGRAM_API_KEY>
Content-Type: audio/[format]
```

**Query params:**
```
model=nova-2
diarize=true
punctuate=true
utterances=true
language=en-AU
```

**Request body:** raw audio bytes (or pass URL via JSON body with `{"url": "..."}`)

**Response shape (relevant fields):**
```json
{
  "results": {
    "utterances": [
      {
        "speaker": 0,
        "start": 0.0,
        "end": 4.2,
        "confidence": 0.98,
        "text": "Hey, can everyone hear me okay?"
      },
      {
        "speaker": 1,
        "start": 4.5,
        "end": 6.1,
        "confidence": 0.97,
        "text": "Yeah, sounds good."
      }
    ],
    "channels": [
      {
        "alternatives": [
          {
            "transcript": "...",
            "words": [...]
          }
        ]
      }
    ]
  },
  "metadata": {
    "duration": 3600.0,
    "channels": 1,
    "model_info": { "name": "nova-2" }
  }
}
```

**Error handling:**
- 401: invalid/missing API key - log, fail meeting row with `status: 'transcription_error'`, SMS Tate
- 400: unsupported file format - convert to mp3 using VPS (once ffmpeg is installed) or fail with clear message
- 429: rate limit - retry with exponential backoff (max 3 attempts, 30s/60s/120s)
- 5xx: Deepgram outage - retry 3x, then fail and queue for manual retry

---

### Step 2: Post-processing

**2a. Build readable diarised transcript**

Map speaker integers to labels. If attendees list provided with meeting record, attempt speaker mapping (Phase 3 feature). Default: `Speaker A`, `Speaker B`, etc. (0 → A, 1 → B).

Format each utterance:
```
Speaker A (0:00): Hey, can everyone hear me okay?
Speaker B (0:04): Yeah, sounds good.
```

Timestamp format: `M:SS` for < 1hr, `H:MM:SS` for >= 1hr.

**2b. Storage**

| Artefact | Path in Supabase Storage |
|----------|-------------------------|
| Raw Deepgram JSON | `meetings/<slug>/diarised.json` |
| Readable transcript | `meetings/<slug>/transcript.txt` |

Also update meetings row in Supabase DB:
```sql
UPDATE meetings
SET
  status = 'transcribed',
  transcript_raw_url = '<supabase_url>/diarised.json',
  transcript_text_url = '<supabase_url>/transcript.txt',
  speaker_count = <N>,
  duration_seconds = <metadata.duration>,
  transcribed_at = NOW()
WHERE id = '<meeting_id>';
```

---

### Step 3: Sonnet summary

**Input:** full text of `transcript.txt` (diarised, readable format)

**Prompt structure:**
```
You are summarising a meeting transcript. The transcript uses "Speaker A/B/C..." labels.

Transcript:
---
<full transcript text>
---

Return a JSON object with these fields:
- summary: 2-4 sentence overview of what was discussed and decided
- action_items: array of {owner, action, due} where due is optional ISO date string
- key_decisions: array of strings (decisions made, not discussion points)
- follow_ups: array of strings (things to check on, questions left open)
- topics: array of strings (main topics covered)

Be concrete. Extract actual names/tasks/dates where mentioned. If speakers are named in the transcript, use their names instead of Speaker A/B labels in action_items.
```

**Model:** claude-sonnet-4-6 (or latest Sonnet available)

**Response schema:**
```json
{
  "summary": "string",
  "action_items": [
    {"owner": "string", "action": "string", "due": "YYYY-MM-DD or null"}
  ],
  "key_decisions": ["string"],
  "follow_ups": ["string"],
  "topics": ["string"]
}
```

**Storage:**
- `meetings/<slug>/summary.json` in Supabase Storage
- Key fields denormalised to meetings DB row for quick access (summary text, action_item_count)

---

### Cost estimate per meeting

Deepgram Nova-2 at $0.0043/min. Sonnet input at $3/million tokens, output at $15/million tokens.
Approximate spoken word rate: ~130 words/min. Token ratio: ~1.3 tokens/word.

| Duration | Transcription | Sonnet input | Sonnet output | Total |
|----------|--------------|--------------|---------------|-------|
| 30 min | $0.13 | $0.03 (8k tok) | $0.01 | **~$0.17** |
| 60 min | $0.26 | $0.06 (16k tok) | $0.01 | **~$0.33** |
| 90 min | $0.39 | $0.09 (24k tok) | $0.01 | **~$0.49** |

Storage cost: negligible. A 60-min transcript JSON is ~500KB; Supabase free tier covers this for years.

---

### VPS self-hosting status

- **ffmpeg**: NOT installed. `which ffmpeg` returns nothing. Required for audio conversion and chunking. Install with `apt-get install ffmpeg` when needed.
- **whisper.cpp**: NOT installed. No `~/ecodiaos/scripts/whisper/` directory.
- **Python whisper**: NOT installed. `python3 -c "import whisper"` fails.
- **Python 3.12.3**: Available. pip 24.0 available. Could install whisper-python if needed.
- **VPS resources**: 4 cores, 7.8GB RAM (855MB currently free), 15GB disk free (69% used).

**Self-hosting verdict: not viable.** Speed is the hard constraint - 60-min audio takes 30-60min to transcribe on CPU. Meeting notes arriving an hour after the meeting ends defeats the purpose. Even if RAM were cleared, the latency is unacceptable. Revisit only if cost becomes a hard constraint at high volume (>200 meetings/month = ~$66/mo at Deepgram rates - still cheaper than the VPS upgrade needed for GPU).

---

### Otter.ai pipe option

Otter.ai has a v3 API (otter.ai/developers) but it is gated - requires application approval and is not publicly open. No API key found in kv_store. No evidence Tate has an Otter subscription.

**Trade-off:** if Tate already has Otter transcribing his meetings, the pipeline simplifies to webhook-in + our Sonnet summary on top (zero new transcription cost). But without evidence of existing Otter usage, this path adds a dependency on a third service with a gated API.

**Verdict:** skip unless Tate confirms active Otter subscription. If he does: add a status_board row to build the Otter webhook path instead of Deepgram.

---

## Phase 2 implementation scope (transcription only)

Minimal working endpoint:

```
POST /api/meetings/:id/transcribe
```

1. Fetch meeting row from DB, get audio file path/URL
2. Load `creds.deepgram_api_key` from kv_store
3. POST audio to Deepgram `nova-2` with `diarize=true&utterances=true&punctuate=true`
4. On success:
   - Write `diarised.json` to Supabase Storage
   - Build readable `transcript.txt`, write to storage
   - Update meetings row: `status='transcribed'`, `transcribed_at`, URLs
5. Return `{transcript_url, speaker_count, duration_seconds}`

Error states to handle: no API key, unsupported format, Deepgram rate limit, Deepgram 5xx.

This endpoint can be triggered manually (curl) or chained from the audio-capture upload step.

---

## Phase 3 implementation scope (diarisation + summary)

The `/api/meetings/:id/transcribe` endpoint already returns diarised output (Deepgram handles it). Phase 3 adds:

1. **Automatic summary trigger**: on `status='transcribed'`, chain to `/api/meetings/:id/summarise`
2. **Summary endpoint**: reads `transcript.txt`, calls Sonnet, stores `summary.json`, updates DB row
3. **Speaker name mapping**: optional attendees list on the meeting record; map `Speaker 0/1/2` to actual names based on voice fingerprint (Phase 4 stretch) or manual assignment
4. **Neo4j Episode write**: auto-create an Episode node for each summarised meeting: `{name: "<meeting title> <date>", description: "<summary>", related_to: [person nodes from action_items]}`. Connects meeting outputs to the persistent memory graph.
5. **Action item extraction to status_board/CRM**: if `action_items` has `owner` matching a known contact, create a CRM task. If owner is `ecodia`/`tate`, insert status_board row.

---

## Notes for implementor

- Deepgram speaker indices are 0-based integers, not guaranteed stable across calls. Do not persist `speaker=0` as meaning "Tate" across different meetings.
- `utterances` in Deepgram response require `utterances=true` in query params AND `diarize=true`. Both required.
- Deepgram charges for the full audio duration, not just speech. Silence costs the same.
- Audio files from phone PWA may be webm/opus. Deepgram accepts both natively - no conversion needed.
- For Corazon ffmpeg capture in opus format: Deepgram accepts `.opus` directly.
- ffmpeg install on VPS (`apt-get install ffmpeg`) is a 5-minute task and should be done anyway for audio format normalization. Not required for Phase 2 with Deepgram.
- Keep Deepgram API key in kv_store only. Never in env files or committed config.
