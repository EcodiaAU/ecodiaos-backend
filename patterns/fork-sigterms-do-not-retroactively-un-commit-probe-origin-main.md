---
triggers: fork-sigterm,fork-crashed-recovery,phantom-crash-real-deliverable,probe-origin-main-before-redispatch,fork-recovery-must-probe-deliverables,sigterm-vs-commit-timing
status: active
authored: 2026-05-12
---

# Fork SIGTERMs do not retroactively un-commit — probe origin/main before declaring crashed fork's work lost

## Rule

A fork that receives a SIGTERM mid-execution and appears in `os_forks` as `status=error` or `status=aborted` may have already committed and pushed its work to `origin/main` before the signal landed. The SIGTERM kills the process — it does not kill the git history.

**Before declaring a crashed fork's deliverables lost and re-dispatching**, always probe `origin/main`:

```bash
git log --oneline --grep="<fork_id>" origin/main | head -5
git log --oneline origin/main | head -10   # look for expected commit message
ls -la <expected_artefact_path>            # disk-level artefact check
```

If the commit exists on `origin/main`, the work shipped. Do NOT re-dispatch. Archive or update the status_board row to reflect the real state.

## Do

- `git log --grep="<fork_id>"` on `origin/main` BEFORE treating a crashed fork as a full failure
- Check `ls -la <expected_artefact_path>` for disk-level artefacts
- Update status_board row to `deliverables_verified_shipped` not `failed`
- Re-dispatch ONLY after confirming both: no commit on `origin/main` AND no artefact on disk

## Do not

- Trust `os_forks.status=error` as ground truth for whether deliverables shipped
- Re-dispatch a fork without first checking whether the prior fork's commit landed on `origin/main`
- Narrate "fork crashed, work lost" without a `git log` probe to confirm
- Use `fork-recovery-must-probe-deliverables-not-just-flip-status` as a reminder to probe but then skip the probe

## Protocol

1. Fork shows `status=error` or `status=aborted` in `os_forks`
2. Run: `git log origin/main | head -20` — does the expected commit appear?
3. If **YES**: mark fork deliverable as verified, update status_board, do NOT redispatch
4. If **NO**: check `ls -la <expected_artefact_path>` (work may be on disk but uncommitted)
5. If **both NO**: classify as genuine failure, re-dispatch with continuation-aware framing per `~/ecodiaos/patterns/continuation-aware-fork-redispatch.md`

## Why SIGTERMs hit after commit

The most common sequence: fork writes code → runs `git commit` → runs `git push` → process receives SIGTERM during cleanup/reporting phase. The commit and push already completed. The SIGTERM kills the in-flight `[FORK_REPORT]` emission, so the conductor sees `phantom_bail` and `status=aborted`. The work is on `origin/main`. The conductor's recovery instinct is wrong.

## Origin

2026-05-12 07:59 AEST. Meta-loop session discovered multiple "crashed" forks had committed their work to `origin/main` before SIGTERM arrived. Recovery forks were being dispatched to re-do already-completed work. Neo4j Pattern node id 2020. kv_store key `ceo.pattern_pending_disk_materialisation.fork-sigterm-commits-durable` (cleared after this file authored).

## Cross-refs

- `~/ecodiaos/patterns/factory-metadata-trust-filesystem.md` — trust disk/git over reported metadata
- `~/ecodiaos/patterns/narration-vs-disk-reconciliation-checklist.md` — reconcile disk vs narration
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` — verify before asserting state
- `~/ecodiaos/patterns/fork-recovery-must-probe-deliverables-not-just-flip-status.md` — probe deliverables first
- `~/ecodiaos/patterns/continuation-aware-fork-redispatch.md` — briefs check existing deliverables before re-doing work
- `~/ecodiaos/patterns/check-pre-kill-commits-before-redispatch.md` — companion: check commits before redispatch
