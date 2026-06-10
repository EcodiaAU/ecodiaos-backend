# WITHDRAWN — Woodfordia Site Visit Prep Brief

**Date withdrawn:** 2026-06-11
**Reason:** Factually unsafe at the deliverable level. P0 per Tate.
**Original commit:** ed33d65c on `worker/0589b123-3812-4536-a4b5-600b6d712398` (deleted from origin)
**Original drafted by:** calendar-watch cron, worker 976ab26b → child worker 0589b123

## Confirmed falsehoods in the original artefact

1. **"Jessica Ditchfield is the CEO of Co-Exist Australia"** — false. Canonical `clients/coexist.md` line 9: "Kurt Jones (CEO) is the contact at hello@coexistaus.org." Tate confirmed 2026-06-11 Jess is not the CEO.
2. **Tate framed as one of "the two principals of Co-Exist"** — false. Tate confirmed 2026-06-11 he is not part of Co-Exist and is not going to Woodford to represent Co-Exist.
3. **Title page sentence "The first room where Woodfordia and Co-Exist sit at the same table"** — false framing built on (1) and (2).
4. **"ceo@coexistaus.org = Jocelyn likely"** appeared in the upstream kv_store source as a guess (`cowork.calendar.meeting.woodfordia_site_visit_2026-06-17`). Marked unverified. The brief then ignored the "likely" qualifier and asserted a separate fiction.

## Why this matters beyond the specific lies

Tate (2026-06-11): *"the fact that you were able to get something so factually incorrect and inaccurate and low quality into a document like that. p0!"*

A worker pulled calendar-API role hints + a guess, the upstream kv_store laundered them into "likely" prose, the brief downstream stripped the hedge and asserted them as fact, and the artefact passed voice-check 96.2/100 and PDF render without any factual-claim gate. The voice substrate scored prose; nothing scored truth.

This artefact is preserved here for forensics only. The doctrine fix is at:
- `backend/patterns/factual-claims-require-substrate-citation-before-deliverable-2026-06-11.md`
- `backend/hooks/unverified-claim-gate.py` (PreToolUse Write/Edit on deliverable surfaces)
- CLAUDE.md core 0th-class reflex update

## Containment actions taken 2026-06-11

- kv_store `cowork.calendar.meeting.woodfordia_site_visit_2026-06-17` overwritten with WITHDRAWN payload + only the verified attendee emails (roles stripped)
- status_board row `f9e70100` context block updated to strip invented framing and link to this quarantine
- Scheduler tasks `b391176a` (24h refresh) + `76649573` (T-19h verify) paused — would otherwise have re-rendered the lies
- Worker branch `worker/0589b123-3812-4536-a4b5-600b6d712398` deleted from origin (after archival here)
- Neo4j Decision written naming the failure mode

## DO NOT redraft until

Tate has confirmed:
1. Who is the current CEO/decision-holder of Co-Exist Australia
2. Jess's actual role at Co-Exist (if any)
3. Tate's actual posture entering the 2026-06-17 meeting (whose vendor he is, what he expects to come out of it)

A redraft without those three answers will repeat the failure mode.
