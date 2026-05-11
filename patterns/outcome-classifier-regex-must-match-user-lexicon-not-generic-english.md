---
triggers: outcome-classifier, correction-oracle, keyword-regex, lexicon, telemetry, dark-class, correction-keywords, outcome_event, inferrer
status: active
authored: 2026-05-11
origin_fork: fork_mp17c0qm_a796a8
---

# Outcome classifier regexes must be calibrated to the user's actual lexicon, not generic English correction vocabulary

## The rule

When building a correction/feedback classifier that infers outcome from natural language, the keyword set MUST be derived from observation of how the actual user (Tate) expresses corrections — not from what a generic English correction vocabulary looks like.

Generic English correction vocabulary ("that's wrong", "incorrect", "mistake", "undo that") produces near-zero hit rates on an Australian co-founder who says "fuck me", "never mind", "still broken", "wrong numbers", "Yo P1 need to fix..." and profanity-prefixed directives. These two vocabularies have near-zero overlap.

## The compounding bug (Phase G audit, 11 May 2026)

The correction oracle was dark since inception due to TWO failures that independently guaranteed zero correction rows:

1. **Wrong signal source.** The inferrer looked for `sms_messages` / `sms_inbound` / `sms_log` tables that never existed in the schema. Tate's SMS messages go through `smsWebhook.js → osSession.sendMessage()` and are stored in `os_conversation` as wrapped user turns (`[SMS from Tate (+...): <body>]`). Chat messages also end up in `os_conversation`. The SMS table detection always returned `smsTable=null`, so `findTateSignal()` always returned null — the correction detection was structurally dark regardless of keyword quality.

2. **Wrong keyword vocabulary.** The 14 original keywords ("that's wrong", "thats wrong", "wrong fork", "wrong direction", "undo that", "redo that", "fix that", "stop", "abort", "cancel that", "incorrect", "mistake", "broke", "broken") were plausible-sounding but did not match Tate's actual correction register at all. 30+ days of messages with zero correction hits confirmed this.

Result: 0 correction rows out of 1946 outcome_events over 30 days. The Phase G self-tuning loop was calibrating against a structurally-vacuous oracle.

## How Tate actually expresses corrections

Observed over 30+ days of interactions:

| Pattern | Example | Category |
|---|---|---|
| Profanity-prefix | "fuck me what is happening to you" | Strong redirect |
| Profanity-prefix | "what the fuck" | Strong redirect |
| Casual directive with problem | "Yo. P1 need to fix the excel and app sync" | Problem report |
| Observation of wrongness | "which is wrong in a few ways" | Point-out error |
| State assessment | "never mind not ready to release" | Redirect |
| State assessment | "still not aligned", "still broken" | Persistence complaint |
| Direct negation | "not right", "not correct", "not quite" | Gentle redirect |
| Miss-flag | "you missed", "missed the point" | Pointing out omission |
| Reframe | "the other way", "instead of", "do it the other" | Course change |

Generic English corrections he rarely or never uses: "that's wrong", "undo that", "redo that", "incorrect", "mistake" (too formal for his register).

## Protocol: calibrating a new outcome classifier keyword set

1. **Sample real user messages first.** Before writing a single keyword, query the actual message store (`os_conversation`, email threads, etc.) for 50+ messages. Read them. Note the actual vocabulary used for negative feedback.

2. **Derive keywords from observations, not intuition.** Write down every correction-shaped phrase you actually observe. Group by pattern class (profanity-prefix, negation, miss-flag, reframe, persistence complaint). THEN write the keyword list.

3. **Apply word-boundary matching for short/common terms.** Words like "wrong", "stop", "abort", "redo" appear in non-correction contexts ("wrongheaded", "stopping by", "abort mission", "redo design"). Require `\bword\b` boundary matching for these. Multi-word phrases and profanity combinations don't need this (they're inherently specific).

4. **Validate against a held-out sample.** After building the keyword set, run it against 50 messages you didn't use to build the set. Check false positives (non-correction messages matched) and false negatives (corrections missed).

5. **Filter system-generated content from the message store.** `os_conversation` contains both Tate's messages AND system-injected content (fork briefs, cron prompts, fork reports). Extract only Tate's actual typed text using `extractTateMessageFromContent()` — or equivalent parsing — before applying keywords. Fork briefs and cron prompts will contain correction-shaped words in non-correction contexts ("still broken" describing the problem the fork is solving, "fix that" in a brief).

## Signal source rule

For EcodiaOS specifically:
- Tate's primary correction channel is **chat** (direct typed messages in the OS session UI)
- Tate's secondary channel is **SMS** (routed through `smsWebhook.js → osSession.sendMessage`)
- Both end up in **`os_conversation` as `role='user'` rows** — the user turn content is the stitched context PLUS Tate's message at the end
- There are NO standalone SMS tables. `sms_messages`, `sms_inbound`, `sms_log` do not exist.
- Always scan `os_conversation` as the primary source. SMS-table scan can be retained as a dead fallback for future schema additions.

## Anti-patterns

- Writing correction keywords by intuition without sampling actual messages
- Using only "safe" formal correction phrases ("incorrect", "that's wrong") that the user never actually says
- Looking for SMS tables without verifying they exist (`tableExists()` check is necessary but the real fix is using the right table)
- Scanning the raw `content` column of `os_conversation` without extracting Tate's message portion (will match correction-shaped words inside fork briefs)
- Setting `findTateSignal(client, dispatch, null)` and returning early — the `smsTable=null` guard was correct for SMS tables but must not prevent the `os_conversation` scan

## Implementation reference

`~/ecodiaos/src/services/telemetry/outcomeInference.js`:
- `CORRECTION_KEYWORDS` — expanded to 35 terms from Tate's actual lexicon (commit d2dc090)
- `CORRECTION_KEYWORDS_WORD_BOUNDARY` — subset requiring `\bword\b` matching (commit d2dc090)
- `keywordMatches(kw, body)` — applies word-boundary check for bounded terms (commit d2dc090)
- `extractTateMessageFromContent(content)` — extracts Tate's typed text from stitched os_conversation content; handles SMS-wrapped and chat formats; filters fork briefs via SYSTEM_TAIL_MARKERS and ALL-CAPS title regex (commits d2dc090, 2ac7c4c)
- `findTateChatSignal(client, dispatch)` — queries os_conversation for corrections/affirmations (commit d2dc090)
- `backfillCorrections(days)` — upgrades unverified→correction for historical dispatches (commit d2dc090)

## Origin

Phase G audit 2026-05-11 (severity=5, 144h+ overdue from 2026-05-05 SLA). Status_board row 58e78871-483f-485a-bfad-9e221726661f. Fork fork_mp17c0qm_a796a8.

Backfill result: 27 correction rows restored across last 30 days. 3 distinct Tate correction messages identified. Correction rate: 1.4% of dispatch_events. Oracle now structurally non-dark — the signal path is wired to os_conversation, keywords match Tate's actual register, and false-positive fork-brief content is filtered.
