---
triggers: kv-store-mirror-stale, substrate-mirror-vs-disk-drift, codebase-manifest-refresh-cron, scope-expansion-stranded-on-branch, sibling-worker-wrote-mirror-without-merging, substrate-claim-vs-disk-reality, verify-canonical-surface-not-the-mirror
priority: high
canonical: true
binding: reference-only
---

# A substrate mirror of canonical state is a CLAIM not a probe

## 1. The rule

When a kv_store key, Neo4j node, status_board row, or any other substrate write CLAIMS to reflect the current state of a canonical surface (git main, sqlite index, filesystem, deployed build), that write is a CLAIM, not a PROBE. To verify, re-read the canonical surface directly. The mirror is useful as a hint pointing where to look; it is not evidence the surface matches.

**General form:** a write made by author A at time t1 asserting "surface S is in state X" remains true only as long as no other author B writes to surface S after t1. If author A never reads S back after t1, the mirror diverges silently. Any decision that reads only the mirror is wrong by construction once divergence happens.

## 2. Why

2026-06-09 22:13 AEST: codebase-manifest-refresh cron fire on tab_1781007119632_847ba027 found that `kv_store.cowork.codebase_manifest.last_refresh` (last written 07:44 AEST by a sibling worker) claimed `run_id=13`, `manifest_commit=86ab5808a80bdc6c11f45cda56939280f26ce3a6`, and 12 codebases totalling 3368 files. Direct probes of the canonical surfaces showed: `sqlite3 index.sqlite` returned 4 rows (2381 files), `git log -1 codebase-manifest/manifest.json` returned `945ebd91` (4-codebase Mac-port). `git cat-file -t 86ab5808` confirmed the claimed commit exists, but `git for-each-ref --contains 86ab5808` revealed it only lives on `origin/chore/restore-local-doctrine-commits-2026-06-09`, never merged to main. The kv_store mirror had been lying about disk truth for 14h33m.

The lie was harmless until something needed to act on the claim. The cron fire was that thing. Had the cron read only the mirror and declared "nothing to do, scope already expanded", the disk would have stayed 4-codebase forever and every codebase-orient call would have missed 8 active client surfaces.

The root cause: sibling worker wrote the mirror BEFORE the git ship reached main. The ship landed on a branch, the mirror landed on the canonical kv_store. Substrate ordering matters.

## 3. How to apply

- For every kv_store/Neo4j write that claims to reflect a canonical surface, include the canonical-surface identifier in the value (manifest_commit, run_id, git_sha, deployed_url, sqlite path). The identifier is what lets a future reader probe the surface.
- For every read of a substrate mirror used for a decision, pair the read with a probe of the canonical surface and reconcile. If they disagree, the disk wins.
- For codebase-manifest specifically: `sqlite3 index.sqlite "SELECT codebase_id, COUNT(*) FROM files GROUP BY codebase_id;"` is the canonical probe of index state; `git log -1 codebase-manifest/manifest.json` is the canonical probe of manifest state.
- When you discover a mirror lies, fix the canonical surface first (cherry-pick the missing commit, run the missing job), then update the mirror. Never update the mirror to match a fictional disk state.
- When a sibling worker pattern is suspected (the mirror references a commit you can't find on the canonical branch), run `git for-each-ref --contains <sha>` to locate the stranded branch and decide whether to cherry-pick.

## 4. Anti patterns

- Reading `kv_store.cowork.X.last_refresh` and deciding "nothing to do" without probing the underlying sqlite/git/filesystem.
- Writing a "scope expanded" / "build shipped" / "deployment landed" mirror BEFORE the canonical surface actually accepts the change. The mirror should land AFTER the canonical ship verifies.
- Updating the mirror to silence a discrepancy without first reconciling the canonical surface. This buries the drift instead of resolving it.
- Cherry-picking a commit referenced by a mirror without checking the rest of the branch first; if the branch was abandoned for a reason, the commit may carry unwanted siblings.

## 5. Cross references

- [[coord-signal-bound-is-advisory-git-ship-is-terminal-2026-06-09]] (adjacent pattern: coord ack vs git ship, same shape different channel).
- [[verify-deployed-state-against-narrated-state]] (the master pattern).
- [[mac-organisation-and-branch-thrash-2026-06-09]] (the sibling-worker-branch-thrash pattern that enables this drift).
- [[substrate-path-coupling-survives-host-swap-as-silent-no-op]] (silent substrate failure mode).
- [[verify-before-asserting-in-durable-memory]] (the general durable-memory verification rule).

## 6. Origin

2026-06-09 22:13 AEST. codebase-manifest-refresh cron fire on tab_1781007119632_847ba027. Discovered 14h33m of drift between `kv_store.cowork.codebase_manifest.last_refresh` (claimed 12 codebases since 07:44 AEST) and `git log main codebase-manifest/manifest.json` (4-codebase Mac-port until reconciled at 22:13 by cherry-pick of 648c5ccc onto main as 9f9a3e14 then re-index commit 288b05e1). Resolution proved by direct sqlite + git probes before and after.

## 7. Future work

A live enforcement hook would scan kv_store keys with names matching `*.last_*` / `*.snapshot` / `*.state` and warn when a read precedes a decision without a paired canonical-surface probe in the same turn. Out of scope for the discovery fire. Listed here so the binding-required hook treats this pattern as `reference-only` consciously, not by default.
