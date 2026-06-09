# Approval-Queue Producer Conventions

Read before any code path that previously hit Stripe MCP, wrote a load-bearing pattern file, or called `gmailService.sendReply` for a client.

The approval queue catches items needing Tate Y/N/edit while he is away (Africa Oct-Dec 2026). Routine ops still act immediately per the autonomy doctrine. The queue is for items crossing each producer's bright line.

## When to call which producer

| Situation | Producer | Path |
|---|---|---|
| Drafted client-facing email reply (any external recipient) | `gmailDraftForReview.draftForReview` | In-process (gmailService autoAct already wired) |
| iOS / Android release for a client app | `releaseService.proposeShip` (in-process) OR `POST /api/ops/approval-queue/enqueue-release` (external) | `ship-ios.py --propose` |
| Stripe payment / invoice / commitment over $200 AUD OR new vendor OR contractual term | `spendService.proposeSpend` (in-process) OR `POST /api/ops/approval-queue/enqueue-spend` (external) | Conductor calls before invoking Stripe MCP |
| Pattern file with `load_bearing: true` frontmatter OR path in CLAUDE.md / 100-percent-autonomy-doctrine / superpowers/ neighbourhood | `doctrineService.proposePattern` (in-process) OR `POST /api/ops/approval-queue/enqueue-doctrine` (external) | Conductor calls before `Write` |
| Observer signal that needs Tate-only-callable judgement (tonal drift, scope creep, voice misalignment, P1 severity) | Automatic - `_observerBase._postIntervention` fans out via `observerQueueExtension.flagForTateReview` on every written signal; `_shouldEscalate` gates internally | Already wired |
| status_board row transition to `next_action_by='tate'` | Automatic - Postgres trigger `trg_status_board_to_approval_queue` | Already wired |

## Producer return contract

All producers return one of:

- `{ ok: true, queued: false, reason }` - bright-line not crossed; caller proceeds with the direct action (send the email, ship the release, execute the payment, write the pattern)
- `{ ok: true, queued: true, id, urgency, reason, deduped }` - enqueued; caller MUST stop and let the queue handle it
- `{ ok: false, error }` - producer-side failure (input validation, DB unreachable); caller decides whether to fall through to direct action or surface the error

## Caller pattern

```js
const proposal = await producer.propose(...)
if (proposal?.ok && proposal.queued) {
  // Stop. The action handler will execute on Tate Y.
  return
}
if (!proposal?.ok) {
  // Soft-fail: producer threw or returned !ok. Log and decide.
  logger.warn('producer failed', { error: proposal?.error })
  // For autonomy-doctrine-safe paths, fall through to direct action.
  // For action-safety-critical paths, abort.
}
// Direct action path (producer returned queued:false OR fell through)
await originalAction(...)
```

## HTTP wrapper authentication

The `/api/ops/approval-queue/enqueue-*` routes require the wide `ecodia_full` bearer (the narrow `cowork` bearer does not have the scope). Pull from `kv_store.creds.ecodia_full_mcp_bearer` or the local `D:/PRIVATE/ecodia-creds/` store.

## Surfacing fanout

Every successful INSERT fires (best-effort, fire-and-forget):

- APNs push to Tate's iPhone via `approvalQueueSurfacing.notifyOnInsert` (always when device registered)
- SMS via `osAlertingService.sendSmsToTate` (only when `urgency='critical'`)

The decay daemon (`approvalQueueDecay.warningTick`, every 5min) fires a second APNs + SMS at `decay_at - 30min` for any still-unresolved critical item.

## What NOT to do

- Do NOT call `db` `INSERT INTO approval_queue` from ad-hoc code paths. Use a producer.
- Do NOT resolve queue items from the conductor (`approvalQueueResolutionService.resolve` is for Tate's iOS app + SMS short-circuit + the decay daemon only). The `<approval_queue>` continuity block is READ-ONLY.
- Do NOT bypass producer bright-line gates by passing `force_queue: true` casually. The gates exist so routine ops do not pile up in Tate's queue.
