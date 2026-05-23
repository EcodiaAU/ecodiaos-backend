---
triggers: routine-scope-triage, vps-routine-scope-ceiling, cowork-bearer-scope-eligibility, mcp-bearer-cannot-reach-corazon-fs, status_board-mining-routine, parallel-builder-cron-scope-filter, marketing-outreach-cron-scope-filter, pilot2-reaper-scope-filter, scope-excluded-surface-to-conductor, routine-as-triage-not-executor, post-vps-decoupling-routine-doctrine, anthropic-routines-mcp-ceiling, claude-code-web-mcp-ceiling
---

# Post-VPS-decoupling routines act as a scope-aware triage layer, not an executor

## The rule

When a scheduled routine fires in any runtime that reaches the substrate over HTTP-only MCP (Anthropic Routines cloud, Claude Code on the web, the custom claude.ai connector on tate@/code@/money@), its tool surface is the `ecodia` / `cowork` bearer scope. That scope CANNOT reach:

- Corazon `D:/.code/` filesystem (where most active product code lives post-migration)
- Factory dispatch (deprecated per migration-vps-to-local-corazon-2026-05-15 and vps-anatomy-current-state-2026-05-19)
- VPS shell (different MCP scope; `mcp__vps__*` is not exposed on the cowork bearer)
- Stripe live writes that need the local conductor's session keys
- Any GUI-driving primitive (`input.*`, `screenshot.*`, browser CDP) which only exists on the laptop-agent at localhost:7456 / Tailscale 100.114.219.69:7456

The routine MUST therefore operate as a triage layer over the queue it was scheduled against, NOT as an executor that tries to push every queued item through itself. The pattern is:

1. Mine the queue (status_board, gmail, neo4j, kv_store).
2. Partition candidates by which substrate they require.
3. Execute only the in-scope subset, end-to-end, with a durable artefact per item.
4. For out-of-scope items, verify `status_board.next_action_by` is correctly set so the local conductor pulls them on its next interactive session. If it is not, write the upsert.
5. Emit a single rollup deliverable (a status_board entry, a neo4j Episode, or a `backend/drafts/<routine>-<ISO>.md` file) summarising the partition counts, the in-scope work shipped, and the next-action-by routing for the rest.

Empty in-scope subset is a correct, healthy exit. It means the substrate routing is doing its job and the work belongs elsewhere. The deliverable in that case is the rollup itself, not the absence of one.

## Why

The local-first migration (15 April 2026 Anthropic policy plus 15 May 2026 cutover) split EcodiaOS-the-runtime across two surfaces: (a) interactive Claude Code on Corazon for conductor work, and (b) Anthropic Routines / Claude Code web for cron and webhook work. The two surfaces have different MCP scopes. Treating a routine fire as if it were a Corazon-conductor turn means picking work that the routine cannot finish, then either phantoming the deliverable, calling the wrong substrate (and getting `scope_denied`), or sitting in a planning loop.

This was observed shipping correctly four times in 24-48h:

- `parallel-builder 2026-05-23 08:11 AEST` picked 2 of 33 status_board rows. The other 31 partitioned cleanly: 14 needed Corazon FS, 6 needed Factory/Stripe/VPS shell, 3 blocked on upstream, 5 watch-only with no fork-artefact, 1 future-dated, 1 self-reminder, 1 awaiting-Tate.
- `marketing-outreach 2026-05-23 10:00 AEST` found 0 stale follow-ups: every active opportunity row was `next_action_by=tate` or `=client` by the rotation discipline of feedback-two-channel-marketing-doctrine-2026-05-18. Empty was correct.
- `PILOT2 status_board reaper dry-run 2026-05-22` partitioned 98 active rows by age + ownership, found 0 candidates matching the (archived=false AND next_action_by IN external/client AND last_touched < NOW() - 90 days) criteria. Empty was correct.
- `Archive attentionEconomy observer 2026-05-22` was a signal-zero classification on 100 fires, leading to an archive Decision routed to the conductor, not a self-execute.

The pattern was applied implicitly. Codifying it removes the failure mode where a future routine reads the same queue and tries to brute-force the out-of-scope items.

## How to apply

When authoring a new routine prompt, write the prompt so the routine reads:

```
Step 1 - mine the queue from <substrate>.
Step 2 - partition by substrate-eligibility against the routine's actual MCP scope.
         Tag each candidate: in-scope-shippable | out-of-scope-corazon-fs | out-of-scope-factory |
                            out-of-scope-vps-shell | out-of-scope-gui | blocked-upstream | tate-await | external-await | future-dated.
Step 3 - execute the in-scope-shippable subset; one durable artefact per item.
Step 4 - for each out-of-scope tag, verify the status_board row carries the matching next_action_by.
         Patch via status_board_upsert where wrong.
Step 5 - emit one rollup: counts per tag, links to artefacts shipped, list of newly-routed rows.
         Substrate for the rollup: neo4j Episode preferred; backend/drafts/ if file-render needed by Tate.
Step 6 - kv_store.set ceo.<routine_name>.last_run with timestamp + tag counts + rollup pointer.
```

When firing a routine that already exists, before declaring its empty-output a silent-fire failure, check whether the partition step ran (counts published, status_board next_action_by corrected) and whether the in-scope subset was empty by virtue of correct routing. If so, that fire is healthy. If the partition step is missing entirely, the routine prompt needs the triage steps added.

When extending the routine's scope, do it by giving the routine a richer MCP bearer (server-side scope change), NOT by writing brittle in-prompt workarounds for the missing substrates. The MCP scope is the contract; the routine prompt is downstream of it.

## Sibling patterns

- `cron-deliverables-can-be-conditional-not-all-fires-must-ship.md` - the conditional-deliverable case. A monitoring cron that exits silent on healthy is correct. This pattern is its scope-aware specialisation: an executor cron with a partitionable queue exits silent on the in-scope subset only when partitioning has happened.
- `cron-fire-must-have-deliverable-not-just-narration.md` - the unconditional case. This pattern does NOT exempt the routine from delivering. The triage rollup IS the deliverable.
- `migration-vps-to-local-corazon-2026-05-15.md` - canonical migration architecture; this pattern is one of its post-cutover operational doctrines.
- `vps-anatomy-current-state-2026-05-19.md` - the substrate map this pattern partitions against.
- `cowork-scope-cannot-update-entity_type-infrastructure-2026-05-19.md` - one specific MCP-scope ceiling. This pattern is the general principle of which that is one instance.
- `conductor-coordinates-capacity-is-a-floor.md` - applies to the interactive Corazon conductor, NOT to routines. Routines have a fundamentally different scope and the floor framing does not transfer.
- `away-conductor-runs-on-corazon-not-vps-2026-05-20.md` - the routing rule for away-channel messages. The pattern here is its routine-cron counterpart.

## Do

- Treat the routine as a triage layer first, an executor second.
- Always publish the partition counts in the rollup, even when the in-scope subset is empty. The counts are evidence the triage step ran.
- Patch wrong `next_action_by` values during the triage pass. If the routine notices a row is mis-routed, fix it; do not just skip it.
- Use `backend/drafts/<routine>-<ISO>.md` for rollups that benefit from IDE-preview when the local conductor next opens. The auto-preview substrate (auto-preview-md-html-on-write-2026-05-16) will pop the tab.
- Cite which Episode counts as the triage evidence in the kv_store last-run record. Future audits read the kv_store, not the prompt.

## Do not

- Do not pick a work item the routine's MCP scope cannot finish. Phantom-shipping a status_board update for "deployed" when the deploy never happened is worse than not picking the item.
- Do not call `mcp__vps__shell_exec` or any laptop-agent tool from a routine that does not have them bound. The error surfaces as `scope_denied` or `tool_not_found`, the routine bails, the queue is untouched, and there is no rollup.
- Do not classify a healthy empty-in-scope fire as `cron_silent_fire`. The detector logic for that classification must include the partition-counts check.
- Do not duplicate the local conductor's queue-mining work. If the routine's job is to hand work TO the conductor, the artefact is the routing patch, not a parallel attempt at execution.
- Do not widen the routine's MCP bearer scope as a workaround for one missing capability. Either fix the routing layer (add the substrate cleanly) or accept the scope ceiling and surface the work to the conductor.

## Origin

23 May 2026, self-evolution routine fire 02:00 AEST. Synthesis of four recent Episodes sharing the partition-and-defer shape:

- Episode "parallel-builder 2026-05-23 08:11 AEST" - 2 of 33 actioned.
- Episode "marketing-outreach 2026-05-23T10:00 AEST" - 0 of 13 actioned, rotation discipline locked the rest.
- Episode "PILOT2 status_board reaper dry-run - 22 May 2026" - 0 of 98 candidates.
- Decision "Archive attentionEconomy observer 2026-05-22" - signal-zero classification routed to conductor.

The behaviour was already correct in each case. The codification removes the future failure mode where a routine reads the queue and brute-forces the out-of-scope items.
