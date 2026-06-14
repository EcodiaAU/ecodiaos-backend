---
triggers: fork-deliverable-durable, worker-output-must-persist, draft-is-not-delivery, re-probe-disk-after-fork, fork-path-claim-untrusted, audit-fork-persistence, sibling-stash-clean-window, worker-wrote-v2-slug, find-newer-than-spawn, deliverable-on-durable-substrate, worker-report-is-input-not-truth
---
# Fork deliverables write to durable substrates, not just drafts

## 1. The rule

A worker or fork's deliverable is not delivered until it lives on a durable substrate that the parent can read independently: a committed file on disk, a `status_board` row, a `kv_store` key, a Neo4j node, or a pushed branch. A draft held only in the worker's context, or a path the worker merely claims to have written, is not a deliverable. After a fork reports done, the parent re-probes the durable substrate directly before treating the work as real and before dispatching any dependent step.

## 2. Why

On 30 Apr 2026 a v2 audit fork narrated a file at a `-v2.md` path that did not exist on disk. The parent trusted the report and dispatched the edit fork against a phantom. Worker reports are input, not ground truth, and the gap between "I wrote it" and "it is on disk" is exactly where the loop breaks silently. Three failure shapes recur: the fork never wrote, the fork wrote under a sibling's stash-and-clean window so the file vanished, or the fork wrote a sibling slug like `-v2` that the parent did not expect. Each is invisible until the parent re-probes the substrate with its own eyes.

## 3. How to apply

1. When a fork reports a deliverable, `ls -la` the exact claimed path before acting on it. Confirm it exists on disk.
2. If the file is missing, treat one of three causes: it was never written (re-dispatch with an explicit Write requirement), it was wiped inside a sibling stash-and-clean window (re-author), or it was written at a sibling slug (`find <dir> -newer <fork-spawn-time>`).
3. For non-file deliverables, read the durable substrate directly: query the `status_board` row, read the `kv_store` key, search the Neo4j node, fetch the pushed branch.
4. Never trust the fork report's path claim. Re-probe disk or substrate.
5. Only after the durable read confirms the artifact, dispatch the dependent step.

## 4. Anti-patterns

- Do not dispatch a dependent fork on the strength of a prior fork's "done" report without a durable re-probe.
- Do not treat a draft that exists only in worker context as delivered.
- Do not assume the file is at the path the worker named; sibling slugs and stash windows move it.
- Do not skip the `find -newer` step when the expected path is empty; the artifact often exists under a near-miss name.

## 5. Origin

30 Apr 2026: a v2 audit fork narrated a `-v2.md` path that did not exist on disk; the parent dispatched the edit fork against a phantom. Cross-refs: [[verify-deployed-state-against-narrated-state]], [[dispatcher-fix-on-disk-does-not-equal-fix-in-running-process]], [[worker-registry-truth-is-on-disk-not-mtime-2026-05-18]].
