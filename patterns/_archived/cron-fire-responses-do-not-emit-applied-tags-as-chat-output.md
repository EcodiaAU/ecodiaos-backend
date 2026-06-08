---
triggers: cron-fire, applied-tag, chat-pollution, director-chat-noise, telemetry-tag-not-chat-output, scheduled-task-response, no-tag-on-cron-response, applied-tag-belongs-in-telemetry-not-chat, fork-nudge-acknowledgement, scheduled-task-tag-leak, post-action-tag-discipline, tag-as-chat-noise
---

# `[APPLIED]` / `[NOT-APPLIED]` tags belong in tool dispatch text, NEVER in chat reply text the human director sees

## TOP-LINE INVARIANT

**The Phase C tag protocol exists to make pattern application observable to surfacing hooks. It does NOT exist to make pattern application observable to Tate.** Tags are telemetry artefacts. They belong:

- in the **brief text of a fork dispatch** (where `brief-consistency-check.sh` and friends scan them at PreToolUse time)
- in the **immediate tool result text** scanned by `post-action-applied-tag-check.sh` at PostToolUse time
- as a **structured comment inline with the action** (SQL `-- [APPLIED] ...`, kv_store row note field, commit message footer)

They do NOT belong as a leading or trailing line of the assistant's natural-language chat reply that streams via `text_delta` events to the FE chat view. The frontend renders the assistant's text verbatim through `FinalisedMarkdown` in `CCStream.tsx` â€” every tag line emitted in chat reply text is pollution Tate has to scroll past.

## The rule

When a `[FORK-NUDGE]` / `[CONTEXT-SURFACE WARN]` / `[CRED-SURFACE WARN]` / `[BRIEF-CHECK WARN]` / equivalent fires during cron-fire response work or any tool-call sequence the conductor is doing on its own behalf (not via fork dispatch):

1. **The acknowledgement IS still required** â€” Phase C telemetry rolls untagged surfaces into `tagged_silent=true` and surfaces them as drift signals.
2. **But the acknowledgement does NOT go in the chat reply.** It goes inline with the action:
   - `mcp__supabase__db_execute` SQL: prepend `-- [APPLIED] <pattern> because <reason>` as a SQL comment line
   - `mcp__supabase__storage_upload` / `storage_delete`: include a note in the row's `meta` field if applicable, or a `kv_store.applied_tag.<fork_id>.<ts>` write if the storage call has no metadata field
   - `Bash` / `mcp__vps__shell_exec`: include the tag as a comment in the command (`# [APPLIED] ...`) when the shell context tolerates it; otherwise write a single `kv_store.applied_tag.*` row before the call
   - `Edit` / `Write` / `MultiEdit`: include the tag in the file content if it's a doctrine file; otherwise write a `kv_store.applied_tag.*` row
   - **OR omit the tag entirely** when the warned action is read-only and the warn is obviously inapplicable (`Read`, `Grep`, `db_query`, `crm_*`, `gmail_*` reads, neo4j search). The hook is warn-only; silent surface on a read-only call is acceptable and won't roll into drift signals because the action_event correlation is loose for read-only PostToolUse fires.
3. **Chat reply text stays signal.** Action taken, fork dispatched, blocker for Tate, deltas. Per `~/ecodiaos/patterns/no-retrospective-dumps-in-director-chat.md`.

For **fork-spawn dispatches** (`mcp__forks__spawn_fork`) and **factory-session dispatches** (`mcp__factory__start_cc_session`), the existing protocol stands: pre-tag the brief text itself with `[APPLIED] / [NOT-APPLIED]` lines so the surfacing hook scans them at PreToolUse time. Those tags are inside the brief, not inside Tate's chat view.

## Do

- Pre-tag fork dispatch briefs with `[APPLIED]` / `[NOT-APPLIED]` lines (Phase C protocol unchanged).
- Use SQL comments / kv_store rows / commit footers / file content inlining to record tags for cron-fire actions and on-main tool calls.
- For read-only on-main calls warned by `[FORK-NUDGE]`, omit the tag entirely. The on-main exception clauses (a/b/c) speak for themselves; the warn is the prompt to RE-EVALUATE, not a debt that must be repaid in tag form.
- Keep chat reply text terse: action taken, deltas, blockers. Tag noise is the opposite of signal.

## Do NOT

- Do NOT emit `[APPLIED] <pattern> because <reason>` as a leading line of the assistant's chat reply. The FE has no filter (verified `CCStream.tsx:443` â€” `displayText` flows straight to `FinalisedMarkdown` with no tag-line filter).
- Do NOT emit a `[APPLIED]` line at the end of a chat reply as "tagging for telemetry". The Phase C ingestion picks up tags from tool-call payloads (briefs, SQL, results), not from `os-session:output` text deltas.
- Do NOT chain multiple `[APPLIED]` lines in chat reply text (Tate has been reading 4-6 such lines per cron fire). One per dispatch was the intent of Phase C; chaining them in chat is the failure mode this rule exists to stop.
- Do NOT confuse "the warn fired" with "I owe Tate an explanation in chat". The warn is a private nudge from the hook surface to the conductor. Acknowledgement goes back to the hook surface (via tool-call payload), not via chat output.

## Verification protocol (apply on every conductor turn that includes a tool call where a `[FORK-NUDGE]` or surfacing-hook warn fired)

1. Did I take the warned action? If yes, where did the `[APPLIED]` tag land?
2. Is the tag in the tool-call payload (brief / SQL comment / kv_store / file content)? If yes, the chat reply does not need the tag. Drop it from the reply text before sending.
3. Is the tag ONLY in the chat reply text? If yes, that's pollution. Move it to the payload.
4. Is the action read-only and the warn obviously inapplicable? Omit the tag entirely.

## Why

**Tate, 30 Apr 2026 09:25 AEST verbatim:**
> "polution in our chat stream about appleid and not applied patterns"

He is reading dozens of `[APPLIED] ~/ecodiaos/patterns/...` lines per day in the chat. The lines are correct as Phase C telemetry contributions but they were never meant to be human-rendered. The protocol was authored assuming hooks would scan tool dispatch text; emission in chat reply text is a category error that emerged because the conductor (a) over-applied the protocol to every surfacing-hook warn including read-only on-main calls, and (b) rendered the tag in the same `text_delta` stream as the substantive answer.

The fix is two-layered:
- **Behavioural** (this pattern): emit tags in tool-call payloads or omit on read-only calls. Never in chat reply text.
- **Structural** (the follow-up fix fork): frontend filter strips `[APPLIED]` / `[NOT-APPLIED]` / `[FORK-NUDGE]` / `[CONTEXT-SURFACE WARN]` / etc. lines from rendered assistant text in `CCStream.tsx`. Backstop in case the behavioural shift drifts.

## Cross-references

- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 3 â€” the Phase C tag protocol the conductor was over-applying. The protocol is correct; the application surface (chat reply text) is the failure mode.
- `~/ecodiaos/patterns/_archived/fork-by-default-stay-thin-on-main.md` â€” `[FORK-NUDGE]` is the most-frequent surfacing hook. The on-main exception clauses (a/b/c) describe when an on-main action is acceptable; emitting a chat-line `[APPLIED]` in addition to acting on the exception is decoration, not protocol.
- `~/ecodiaos/patterns/no-retrospective-dumps-in-director-chat.md` â€” the parent doctrine this rule is a special case of. Director chat is for actions and decisions; doctrine tagging goes to telemetry, not chat.
- `~/ecodiaos/patterns/system-injection-blocks-must-not-render-in-director-chat.md` â€” the sibling rule covering `<doctrine_surface>`, `<recent_doctrine>`, `<relevant_memory>`, etc. injection blocks. Same architectural invariant: scaffolding for the conductor, never rendered to the human.
- `~/ecodiaos/patterns/decide-do-not-ask.md` â€” the decision-quality / output-discipline parent.
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` â€” the meta-rule. Tagging in chat is symbolic; tagging in payload is real. If the only place the tag exists is the chat reply, the protocol failed.

## Origin

**30 Apr 2026 09:25 AEST.** Tate flagged: "polution in our chat stream about appleid and not applied patterns". This had been building over multiple days as the Phase C tag protocol shipped (29 Apr 2026) and the conductor over-applied it: every cron fire, every warned tool call, every read-only `[FORK-NUDGE]`-triggered Bash call ended up with one or more `[APPLIED]` lines in the assistant's chat-streamed text. By 30 Apr the noise rate exceeded signal in director chat for some hours of the day.

Three-strike pattern context: the on-main idle-state operating discipline ("5 forks always", "continuous work conductor never idle", "fork-by-default") all depend on the chat reply staying tight and signal-rich. Tag-pollution is the same failure-mode-class as retrospective dumps and self-flagellation paragraphs â€” content that is correct as internal artefact but wrong as human-rendered output.

This pattern file was authored by fork_mokoql7k_e365e9, dispatched as a context-isolated fork to write the doctrine + audit without polluting the conductor's main turn with the codification work.
