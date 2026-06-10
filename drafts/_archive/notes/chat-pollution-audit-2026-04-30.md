# Chat pollution audit — `[APPLIED]` tags + system injection blocks

**Date:** 30 Apr 2026
**Fork:** fork_mokoql7k_e365e9
**Trigger:** Tate, 09:25 AEST 30 Apr 2026 verbatim — "polution in our chat stream about appleid and not applied patterns"
**Goal:** identify exactly what is and is not visible in Tate's director-chat view, and recommend the cleanest end-to-end fix.

---

## TL;DR

There are **two distinct surfaces** in play and only **ONE** of them actually leaks into the chat:

| Surface | Visible in Tate's chat? | Diagnosis |
|---|---|---|
| **`[APPLIED]` / `[NOT-APPLIED]` tag lines emitted in the conductor's text response** | **YES — this is the actual pollution** | Streams via `text_delta` WS events, rendered verbatim by `FinalisedMarkdown` in `CCStream.tsx`. NO filter on tag-shaped lines. |
| **System injection blocks** (`<now>`, `<doctrine_surface>`, `<recent_doctrine>`, `<relevant_memory>`, `<forks_rollup>`, `<restart_recovery>`, `<recent_exchanges>`, `<last_turn_breadcrumb>`) | **NO — backend-only today** | Stitched into the SDK `finalPrompt` (osSessionService.js:1719-1720) and persisted to `os_conversation.content` (osSessionService.js:1755-1762). NEVER broadcast to the FE. The user-card the FE renders for a Tate-typed message comes from local `addUserMessage(content)` with the unstitched content — see `osSessionStore.ts:305`. Cron-fire prompts never produce a user-card at all (no broadcast, no `message_queue:delivered` event for source='scheduler'). |

So the brief's framing is partially accurate: the `[APPLIED]` tag pollution is real and direct. The system-injection-block pollution is a **latent risk** (DB has the polluted content; any future feature that reads `os_conversation` back into the FE will leak it) but is not currently observable.

The fix is **frontend filter + doctrine** (Option C below).

---

## 1. What is leaking, where, why

### 1.1 The `[APPLIED]` tag stream

**Where the tag is emitted:** the conductor (and forks) emit `[APPLIED] <pattern> because <reason>` lines as part of the assistant's text response. This started as deliberate compliance with the Phase C tag protocol (`~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 3) — the protocol was authored to make `[APPLIED]` / `[NOT-APPLIED]` tags scannable by `~/ecodiaos/scripts/hooks/post-action-applied-tag-check.sh` which is a **PostToolUse hook**.

**The protocol's actual intent:** tags scanned at *tool dispatch time*. The hook fires on `mcp__forks__spawn_fork`, `mcp__factory__start_cc_session`, and the Phase C surface-event ingestion pair. The tag belongs in the **brief text** of the dispatched fork (where surfacing hooks scanned it before dispatch) OR in the **immediate tool result text**. NOT in the conversational text reply that streams to Tate.

**Where the breakdown happens:** the conductor reads a `[FORK-NUDGE]` warn in PreToolUse context (typically on a `Bash` / `Edit` / `mcp__supabase__db_execute` call inside a cron-fire response) and emits the `[APPLIED]` acknowledgement *as a leading line of its assistant text response*. That text streams via `text_delta` events and renders verbatim in the FE chat.

**The pipeline:**
1. Cron fires → `schedulerPollerService.fireTask` (line 75-149) POSTs to `/api/os-session/message` with `source:'scheduler'`.
2. `osSessionService._sendMessageImpl` stitches `<now>`/`<doctrine_surface>`/etc. into `finalPrompt` (line 1536-1720).
3. SDK call `queryFn({ prompt: finalPrompt, ... })` (line 1738) → conductor reasons over the prompt.
4. Conductor emits `text_delta` chunks. Some chunks are `[APPLIED] ~/ecodiaos/patterns/... because ...`.
5. Backend `broadcast('os-session:output', { fork_id: 'main', data })` (line 836).
6. FE `useWebSocket.ts` receives `os-session:output`, appends to `streamText` via `appendStreamText` (osSessionStore.ts:369-372).
7. On `os-session:complete`, `finalizeResponse()` snapshots `streamText` into a finalized assistant message (osSessionStore.ts:446-507).
8. `AssistantMessage` component (CCStream.tsx:422-519) renders `displayText = textContent || message.content` via `FinalisedMarkdown` with **NO filter** for tag lines.

**Frequency:** every cron fire, every tool dispatch on main where a `[FORK-NUDGE]` / `[CONTEXT-SURFACE WARN]` / `[CRED-SURFACE WARN]` etc. fires. With ~10-30 forkable Bash/Edit/db_execute calls per hour and many cron fires per hour, this is dozens of `[APPLIED]` lines per day appearing in the chat.

### 1.2 System injection blocks — NOT currently leaking, but persisted

**Where they live:** `_sendMessageImpl` builds `continuityParts` array (line 1536-1718) including:
- `<now>${_nowAEST} AEST</now>` (line 1550)
- `<recent_doctrine>...</recent_doctrine>` (line 1701-1703)
- `<relevant_memory>...</relevant_memory>` (line 1698-1700)
- `<doctrine_surface>...</doctrine_surface>` (line 1715-1717)
- `<forks_rollup>...</forks_rollup>` (line 1707-1709)
- `<restart_recovery>...</restart_recovery>` (line 1610-1612)
- `<recent_exchanges>...</recent_exchanges>` (line 1616-1617)
- `<last_turn_breadcrumb>...</last_turn_breadcrumb>` (line 1618-1620)

`finalPrompt = ${continuityParts.join('\n\n')}\n\n${promptWithMemory}` (line 1720). Cron-fire path also adds `[SCHEDULED: ${task.name}]\n\n${surfaceBlock}\n\n${task.prompt}` (schedulerPollerService.js:95-97) BEFORE this stitching runs.

**Where they DO go:**
- SDK prompt — required for the conductor to function. Correct.
- DB row in `os_conversation.content` (osConversationLog.js:13-17, called from osSessionService.js:1755-1762). Used for SDK rehydration on compaction. Correct.

**Where they DO NOT go (today):**
- FE chat. No WS broadcast carries `finalPrompt`. The only user-card surfaces are:
  - Tate types in chatbox → FE `addUserMessage(content)` adds the *unstitched* typed string locally (osSessionStore.ts:305-362).
  - Queue-mode messages → backend `messageQueue.deliverPending` broadcasts `message_queue:delivered` with `bodies` (un-stitched body strings, messageQueue.js:197-201). FE `useWebSocket.ts:933-947` calls `addDeliveredQueueMessage(body)` for each.
  - Cron-fire prompts → **no broadcast at all**. The cron-fire user-message goes straight from `schedulerPollerService.fireTask` → POST `/api/os-session/message` → `osSession.sendMessage(finalMessage, ...)` → stitched into SDK prompt and DB. The FE never sees the user-side of a cron-fire turn; it only sees the assistant's response streaming in.

**Why this is still worth doctrine:**
1. **Latent risk.** Any future feature that re-renders `os_conversation` rows (e.g. a "show full session history" panel reading from the new `getRecentTurns`) will leak the entire stitched block stack into the chat.
2. **Pattern shape.** The architectural rule "system injection blocks belong in SDK prompt + backend persistence only, never in human-rendered surfaces" is a durable invariant that should be encoded as doctrine before any new feature breaks it.
3. **Compaction artefacts.** `os_conversation` is read back on compact / handover via `getRecentTurns`. If we ever surface that to Tate as a "what your last session looked like" view, the blocks leak.

---

## 2. Cleanest fix path

**Option A — Frontend filter (RECOMMENDED structural backstop).**
Add a single helper in `CCStream.tsx` (or a `stripStreamNoise` util in `fe/src/utils/`) that strips lines beginning with the following prefixes from `displayText` before passing to `FinalisedMarkdown`:

```
[APPLIED]
[NOT-APPLIED]
[FORK-NUDGE]
[BRIEF-CHECK WARN]
[CONTEXT-SURFACE WARN]
[CONTEXT-SURFACE PRIMARY]
[CONTEXT-SURFACE ALSO]
[CRED-SURFACE WARN]
[FORCING WARN]
[MACRO-VALIDATION WARN]
[COWORK-FIRST WARN]
[ANTHROPIC-FIRST WARN]
[STATUS-BOARD-CONTEXT SUGGEST]
[DOCTRINE-CROSS-REF SUGGEST]
[INFO]  (only when on the brief-consistency-check format)
```

Tag lines are deterministic in shape (start of line, square-bracket prefix). A regex filter before render is ~15 lines. Apply to `AssistantMessage` (line 443) and `UserMessage` (line 416) for symmetry — prevents any future leak.

**Risk:** none meaningful. Backend telemetry already records tags via the surface_event/application_event ingestion pair; tag-distribution telemetry is read from those tables, not from chat content. Stripping from FE display is purely cosmetic.

**Implementation seam:** wrap `displayText` derivation:
```ts
const displayText = stripDoctrineNoise(textContent || message.content)
```
where `stripDoctrineNoise` removes any line matching `/^\[(APPLIED|NOT-APPLIED|FORK-NUDGE|BRIEF-CHECK WARN|CONTEXT-SURFACE [A-Z]+|CRED-SURFACE WARN|FORCING WARN|MACRO-VALIDATION WARN|COWORK-FIRST WARN|ANTHROPIC-FIRST WARN|STATUS-BOARD-CONTEXT SUGGEST|DOCTRINE-CROSS-REF SUGGEST)\]/` and collapses any resulting double-blank-line runs.

**Where to put the helper:** new file `fe/src/utils/stripDoctrineNoise.ts` (single export, single test). Keep the regex in one place so the next surface added by Phase D / E telemetry can be added in one line.

**Option B — Backend response template / behavioural fix (REQUIRED complement).**
The `[APPLIED]` tags belong in **tool dispatch briefs** (where surfacing hooks scan them before dispatch) OR in **immediate tool result text** scanned by PostToolUse hooks. They do NOT belong in the assistant's chat reply text. The two pattern files this fork ships codify this rule. Behavioural pressure (doctrine + grep-before-action protocol) is the only way to stop tag emission at the source.

**Cron-fire-specific protocol:** when a cron fires and the conductor takes a `[FORK-NUDGE]`-warned action (db_execute, shell_exec, Bash) on its own behalf, the `[APPLIED]` acknowledgement should land:
- Inline with the SQL as a comment: `-- [APPLIED] ~/ecodiaos/patterns/fork-by-default-stay-thin-on-main.md because <reason>`
- OR in the kv_store row's note field if the action is a kv_store write
- OR omitted entirely when the action is read-only and the warn is obviously inapplicable (`Read`, `Grep`, `db_query`)
- NEVER as a one-liner in the chat reply text

**Option C — Hybrid (RECOMMENDED).**
Ship A and B together. A is the structural backstop (catches stray tags from any source, including future telemetry surfaces). B is the behavioural shift (reduces emission frequency to near-zero, preserves conductor's ability to acknowledge surfacing hooks where Phase C telemetry needs them).

---

## 3. Concrete implementation hand-off (for the follow-up fix fork)

### 3.1 Frontend filter (Option A)

**Files to touch:**
- `fe/src/utils/stripDoctrineNoise.ts` — NEW file, single export `stripDoctrineNoise(text: string): string`.
- `fe/src/pages/Cortex/CCStream.tsx` — line 416 (`UserMessage`) and line 443 (`AssistantMessage` `displayText`). Wrap the rendered text with the helper.
- `fe/src/utils/__tests__/stripDoctrineNoise.test.ts` — NEW, 5-10 unit tests covering: no-tag passthrough, `[APPLIED]` line removal, `[FORK-NUDGE]` removal, multi-tag removal, tag-only message becoming empty string, tag mid-paragraph (should NOT remove — only strip leading-line matches).

**Edge cases:**
- A user might legitimately want to write the literal text `[APPLIED]` in a message (rare, but possible). The filter is FE-only; backend storage is unaffected. Acceptable trade-off — the strict line-shape regex (start-of-line `[ALL_CAPS_OR_DASH]`) makes false positives unlikely.
- Tags inside markdown code fences should NOT be stripped (preserve `[APPLIED] some-pattern.md` if it's quoted as an example in a doctrine discussion). Implement: skip stripping inside ```...``` fences.
- Tags as part of a longer line ("the `[APPLIED]` tag protocol works by...") should NOT be stripped. The regex is anchored to start-of-line + immediate `]` close + space + content.

**Test plan:**
1. Pollute a test message with `[APPLIED] ~/ecodiaos/patterns/foo.md because bar`, verify it's stripped.
2. `[FORK-NUDGE]` line stripped.
3. Markdown code fence content preserved.
4. Inline `[APPLIED]` mention preserved.
5. Tag-only message renders as empty (no markdown render at all — guard against rendering an empty container with margin).

### 3.2 Backend behavioural reinforcement (Option B)

Both pattern files this fork ships:
- `~/ecodiaos/patterns/cron-fire-responses-do-not-emit-applied-tags-as-chat-output.md`
- `~/ecodiaos/patterns/system-injection-blocks-must-not-render-in-director-chat.md`

These are doctrine layer. The mechanical surfacing layer (PreToolUse hooks scanning chat draft text for `[APPLIED]` patterns and warning) is a Phase E-class addition to the decision-quality architecture. Not in scope for the immediate fix fork — track in status_board P3.

---

## 4. What this fork did NOT do (per brief constraints)

- Did NOT edit the frontend filter code. The fix fork is follow-up work tracked in status_board P2.
- Did NOT edit `osSessionService.js` or `schedulerPollerService.js` to suppress block injection. The blocks ARE needed in the SDK prompt — the fix is at the rendering layer (FE) and the behavioural layer (doctrine), not at the injection layer (backend prompt builder).
- Did NOT manually update `~/ecodiaos/patterns/INDEX.md` — daily 22:00 AEST cron rebuilds it from `triggers:` frontmatter on disk.
- Did NOT spawn sub-forks.

---

## 5. Status_board + Neo4j tracking

- **status_board row** inserted with `priority=2`, `entity_type='infrastructure'`, name "Chat pollution from APPLIED tags + doctrine_surface blocks", next_action_by='ecodiaos', next_action='Read this audit, dispatch fix fork to ship the frontend filter'.
- **Neo4j Episode** node "Chat pollution doctrine ship 30 Apr 2026 09:25 AEST" with the Tate-verbatim quote, the two pattern file paths, and a reference to this audit.

---

## 6. One-line summary

**Cleanest fix path: hybrid — frontend filter in `CCStream.tsx` + `stripDoctrineNoise` util (~30 LOC, 1 small test file) for the structural backstop, plus the two pattern files this fork shipped for the behavioural shift.** Frontend filter is the unblocking work; the pattern files keep the rule from drifting back.
