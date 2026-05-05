---
triggers: doctrine-surface-block, recent-doctrine-injection, relevant-memory-injection, system-reminder-leak, frontend-renders-system-blocks, chat-pollution-system-injection, hide-system-blocks-from-tate, now-block-leak, forks-rollup-leak, restart-recovery-leak, recent-exchanges-leak, scheduled-prefix-leak, conductor-only-scaffolding, sdk-prompt-vs-chat-render
---

# System injection blocks are conductor-only scaffolding. Never render them in the director chat.

## TOP-LINE INVARIANT

The blocks the backend stitches into the SDK prompt — `<now>`, `<doctrine_surface>`, `<recent_doctrine>`, `<relevant_memory>`, `<forks_rollup>`, `<restart_recovery>`, `<recent_exchanges>`, `<last_turn_breadcrumb>`, plus the `[SCHEDULED: <task_name>]` prefix added by `schedulerPollerService.fireTask` — are **scaffolding for the conductor**. They are NOT content the human director should ever see in the chat view. Any frontend surface (existing or future) that renders these blocks to Tate's chat is leaking backend plumbing into a human-facing view.

## Status today (30 Apr 2026)

**Currently safe — but only by accident, not by design.**

- Tate-typed messages: FE adds `addUserMessage(typedContent)` *locally* in `osSessionStore.ts:305-362` with the unstitched typed string. Backend then stitches blocks into the SDK prompt and persists the stitched version to `os_conversation.content`. The FE never re-reads `os_conversation` for chat display.
- Cron-fire prompts (`source:'scheduler'`): no FE user-card is rendered at all. The cron prompt with `[SCHEDULED: ...]` prefix and `<doctrine_surface>` block lives in `os_conversation` and the SDK prompt only.
- Queue-mode delivery (`message_queue:delivered`): broadcasts pre-stitch `bodies` from the `message_queue` table — these are clean (no continuity blocks because they were never run through `_sendMessageImpl`'s stitching).

So the blocks DO live in DB at `os_conversation.content` (stitched verbatim) but are NOT rendered to the chat by any current code path.

## The latent risk this rule prevents

Any future feature that re-renders `os_conversation` rows to the FE chat WILL leak blocks. Specifically:
- A "show full session history" panel reading from `osConversationLog.getRecentTurns`
- A handover / compact preview that surfaces the rehydration prompt
- A debug / replay view for forks reading `os_conversation` for any role
- An export / archive feature dumping conversation transcripts

Without this rule encoded as doctrine, the next person (human or fork) building any of those features will read `content` from `os_conversation`, render it through the same `FinalisedMarkdown` path that the live chat uses, and ship a feature that exposes every system block to Tate.

## The rule

When building or modifying any FE surface that displays conversation content:

1. **Do NOT read `os_conversation.content` and render directly.** That column intentionally contains the full SDK prompt including continuity blocks, because SDK rehydration on compaction needs the unstitched stream. It is a backend-internal storage shape, not a user-facing one.
2. **Strip continuity blocks before rendering.** If a feature needs to show "what the conversation was like" to Tate, run the content through a `stripContinuityBlocks(content)` helper that removes:
   - `<now>...</now>`
   - `<doctrine_surface>...</doctrine_surface>`
   - `<recent_doctrine>...</recent_doctrine>`
   - `<relevant_memory>...</relevant_memory>`
   - `<forks_rollup>...</forks_rollup>`
   - `<conductor_commitments>...</conductor_commitments>` (added 5 May 2026, fork_mos3hwpk_9fbdc5)
   - `<conductor_blocked_on>...</conductor_blocked_on>` (added 5 May 2026, fork_mos3hwpk_9fbdc5)
   - `<thread_carry_forward>...</thread_carry_forward>` (added 5 May 2026, fork_mos3hwpk_9fbdc5)
   - `<restart_recovery>...</restart_recovery>`
   - `<recent_exchanges>...</recent_exchanges>`
   - `<last_turn_breadcrumb>...</last_turn_breadcrumb>`
   - Leading `[SCHEDULED: <task_name>]` prefix on cron-fire prompts
   - Leading `[HEARTBEAT]` prefix on heartbeat turns
   - `[Pending queued messages delivered opportunistically]` preamble + bodies (queue-drain shape)
3. **Even with stripping, prefer NOT rendering the user-side of cron-fire / heartbeat / suppressed turns at all.** Those are conductor-internal turns. The breadcrumb logic (`osSessionService.js:2323-2325`) already excludes them from session continuity for the same reason. The chat view should follow suit.
4. **Add a backend helper, not a FE-only filter, for any new feature.** Put `stripContinuityBlocks` in `src/services/conversationDisplay.js` so any new endpoint or feature that surfaces conversation content can call it. The FE should NEVER do the stripping itself when the source is `os_conversation` rows — that's a backend responsibility because the FE shouldn't be aware of the block shapes.

## The chat-view filter (separate concern, separate doctrine)

The current chat-pollution issue (30 Apr 2026) is about `[APPLIED]` / `[NOT-APPLIED]` / `[FORK-NUDGE]` etc. tag lines bleeding into the assistant's `text_delta` stream — that's a DIFFERENT surface than the system injection blocks. See the sibling pattern `~/ecodiaos/patterns/cron-fire-responses-do-not-emit-applied-tags-as-chat-output.md`. The frontend filter for tag noise is appropriate (FE-side) because the tags appear in `text_delta` events, not in DB-stored content. The block-stripping rule above is appropriate (BE-side) because the blocks live in DB and only leak if a feature reads them back.

## Do

- Treat `os_conversation.content` as a backend-internal storage shape. Read it for SDK rehydration / compaction / replay only.
- Build `stripContinuityBlocks` in `src/services/conversationDisplay.js` BEFORE the first FE feature that needs to render historical conversation content. Pre-emptive doctrine, not post-hoc cleanup.
- For any new endpoint that returns conversation content to the FE: have the endpoint call `stripContinuityBlocks` and return the cleaned form. FE never sees raw stitched content.
- When persisting Tate-facing summaries, transcripts, or exports to Drive / Storage / email: strip continuity blocks first.

## Do NOT

- Do NOT add a new FE component that renders `os_conversation` rows directly. If the feature is necessary, it gets a stripped backend endpoint.
- Do NOT build a debug / "show what the conductor saw" panel without explicit stripping. Even debug surfaces leak Tate's view if Tate happens to be looking when a debug overlay is on.
- Do NOT treat the blocks as "harmless context" the human can scroll past. Tate has flagged chat pollution before (30 Apr 2026); the cost of a dump is real and immediate.
- Do NOT special-case the stripping for "only show in dev mode" — that's the same trap. Build the helper, use it everywhere, no envelope-of-exceptions.

## Verification protocol (when shipping any new conversation-display feature)

1. Does this feature render content sourced from `os_conversation`, the SDK rehydration prompt, or any backend-stitched message? If yes, continue.
2. Does the rendering path go through `stripContinuityBlocks`? If no, ADD it before merge.
3. Does the test suite cover at least: a turn with `<now>` block, a turn with `<doctrine_surface>` block, a cron-fire turn with `[SCHEDULED:]` prefix, a heartbeat turn? If no, ADD those tests.
4. Did the feature ship with a screenshot or visual-verify probe of what the rendered content actually looks like to Tate? If no, DO that before declaring done. Per `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`.

## Why

**Tate, 30 Apr 2026 09:25 AEST verbatim:**
> "polution in our chat stream about appleid and not applied patterns"

The immediate trigger was `[APPLIED]` tag lines (covered by the sibling pattern). But the same conversation surfaced the architectural risk: the system injection blocks are EVEN LARGER pollutants if they ever leak to the FE. A single cron-fire turn contains:

- `<now>` block (~30 chars)
- `<forks_rollup>` block (variable, can be 200-800 chars when forks are running)
- `<doctrine_surface>` block (200-2000 chars depending on keyword matches)
- `<recent_doctrine>` block (300-800 chars)
- `<relevant_memory>` block (200-1500 chars)
- `<restart_recovery>` block (when fresh post-restart, can be 1KB+)
- `<recent_exchanges>` block (when recovery is active, ~1.2KB)
- `[SCHEDULED: <task_name>]` prefix
- The actual cron prompt body

All of that, rendered verbatim to Tate, would be a 3-5KB dump per cron fire. The `[APPLIED]` tag pollution is a 100-300 char per-turn issue. The block-leak risk is an order of magnitude worse and currently mitigated only by the fact that no FE feature exists that reads `os_conversation` directly. The rule above protects that invariant going forward.

## Cross-references

- `~/ecodiaos/patterns/cron-fire-responses-do-not-emit-applied-tags-as-chat-output.md` — sibling rule covering `[APPLIED]` tag pollution in `text_delta` stream. Same root invariant (backend scaffolding never renders to humans), different surface.
- `~/ecodiaos/patterns/no-retrospective-dumps-in-director-chat.md` — the parent doctrine. Director chat is for actions, decisions, deltas. NOT for backend telemetry, scaffolding, or self-analysis.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` — the visual-verify rule that catches block-leak features at merge time even if doctrine drifts.
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` — the architectural framing. `os_conversation` is one substrate; the FE chat view is another; rendering across the seam without an explicit stripping protocol is the seam-failure pattern.
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` — why this rule is being authored pre-emptively before the first leak feature ships, not post-hoc after the leak happens.

## Origin

**30 Apr 2026 09:25 AEST.** Tate flagged `[APPLIED]` tag pollution in director chat. While auditing the surfaces in scope (audit at `~/ecodiaos/drafts/chat-pollution-audit-2026-04-30.md`), this fork (fork_mokoql7k_e365e9) discovered that the system injection blocks are persisted to `os_conversation.content` verbatim and are currently NOT leaking to the FE only because no code path reads them back. That's not a guarantee — it's a coincidence of which features have been built so far. Codifying the rule now means any future feature is gated by the doctrine + the `stripContinuityBlocks` helper protocol BEFORE the first leak ships.

The rule subsumes the same invariant family as `no-retrospective-dumps-in-director-chat.md` and the sibling `cron-fire-responses-do-not-emit-applied-tags-as-chat-output.md`: backend-internal artefacts (telemetry tags, prompt scaffolding, debug instrumentation) are not for human eyes regardless of their utility to the conductor.
