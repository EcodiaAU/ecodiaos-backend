---
triggers: distributed-state-seam, cross-substrate-write, seam-discipline, state-lives-in-ten-places, drift-audit-traces-to-seam, write-a-verify-a-write-b, read-source-of-truth-not-projection, two-substrates-disagree, consistency-protocol, status-board-is-one-of-ten, seam-without-protocol, substrate-divergence
---
# Distributed-state seam failures are the core infrastructure risk

## 1. The rule

State lives in roughly ten substrates at once: Postgres (`status_board`, `kv_store`, `os_scheduled_tasks`), Neo4j, Vercel, PM2, GitHub and Bitbucket, Google Workspace, Stripe, the live session context, and Tate's memory. Every place two substrates hold the same fact is a seam where they can disagree. Almost every drift-audit failure traces back to a seam that had no explicit consistency protocol. The discipline is: on a cross-substrate write, write A, verify A, then write B referencing A, then verify B. When reading state, read the source-of-truth substrate directly. A derived projection can lag the truth.

## 2. Why

A single substrate cannot drift from itself. Drift is always a property of a seam: two stores that should agree, updated by two code paths, with no protocol binding them. The `schedule_list` MCP hiding paused rows, the `status_board` row that says "shipped" while Vercel serves a broken build, the Neo4j Decision that references a `kv_store` key that was never written: each is a seam without a consistency protocol. Treating the seam as the unit of risk (rather than any one substrate) is what makes drift predictable and auditable. The fix binds the two substrates with write-verify-write-verify rather than asking either side to be trusted more.

## 3. How to apply

1. Before a cross-substrate write, name both substrates and the fact they share. That seam is the thing to protect.
2. Write A. Verify A persisted with a discriminating read against A's source of truth.
3. Write B referencing A. Verify B persisted the same way.
4. When reading, read the source-of-truth substrate directly. For scheduler truth that means `os_scheduled_tasks` in Postgres; the `schedule_list` MCP projection hides paused rows and will mislead you.
5. When a drift-audit fires, find the seam first. The fix is a consistency protocol on that seam, not a one-off correction of one side.

## 4. Anti-patterns

- Do not read a derived projection (`schedule_list`, a cached count, a dashboard aggregate) and treat it as the source of truth.
- Do not write B referencing A without first verifying A actually persisted; a dangling reference is a seam failure waiting to surface.
- Do not "fix drift" by correcting one side once; without a protocol the seam re-diverges on the next write.
- Do not assume two substrates agree because they did last time; the seam is exactly where last-time stops being evidence.

## 5. Origin

Codified from the recurring shape behind status_board and scheduler drift incidents: every failure traced to a cross-substrate seam without an explicit consistency protocol. Cross-refs: [[verify-deployed-state-against-narrated-state]], [[substrate-migration-must-verify-side-effect-not-just-return-2026-05-18]], [[status-board-hygiene-is-a-0th-class-reflex-2026-05-21]].
