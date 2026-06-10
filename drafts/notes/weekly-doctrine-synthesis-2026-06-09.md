# Weekly doctrine synthesis 2026-06-09

Consolidated sunday-doctrine-synthesis cron worker. Task 31450328. Mac canonical host.

This fire ran the eight sub-passes in sequence. Substrate state shaped the outputs more than any single pattern did.

## The week in one paragraph

Doctrine corpus grew by 27 new patterns over the last 30 days, of which seven authored 2026-06-08 or 2026-06-09 around the Mac-canonical migration and the consolidated cron corpus landing. Top load-bearing doctrine by 7d citation count: cron-worker-prompt-template (51 references across 104 sessions), verify-deployed-state-against-narrated-state (45), knowledge-architecture-lookup-first-and-claim-binding-2026-06-09 (24), vercel-deploys-require-github-recognised-commit-author (19), apple-store-claims-must-be-grep-verified-against-codebase-before-send-2026-06-09 (18). The lifecycle measurement substrate is partially closed but not fully covering. The marker-emission discipline that the substrate assumed is not happening in practice.

## Substrate state, end of week

Mac canonical telemetry path went live 2026-06-08 01:44 UTC. Two recorders.

The dispatch-events recorder writes 8798 rows in 32 hours, of which 221 carry a non-empty surfaces[] field. 188 of those 221 are cred-mention-surface, 33 are status-board-write-surface. Twenty-five-plus other surfacing hooks contribute zero. The recorder covers two of the registered surfacing hooks, which is structural undercounting. New doctrine filed this fire: patterns/dispatch-events-recorder-undercounts-when-only-shell-hooks-emit-2026-06-09.md.

The application-events recorder writes 5 rows in 32 hours. All five carry applied=null, tagged_silent=true. The Stop hook is alive, but it has nothing to tag because the LLM emitted zero [APPLIED] or [NOT-APPLIED] markers across 104 session transcripts. The marker-emission half of the loop is dark. Pattern-citation count (448 references across 101 patterns) replaces marker count as the application proxy until the discipline is internalised or retired.

The 2026-06-08 substrate-gap pattern closed Fix A (TELEMETRY_DIR default + PATTERN_PATH_RE regex) and Fix B (Stop hook registration). It did not close Fix C (Python hook emit coverage) or the LLM marker discipline. Both compounding gaps codified this fire.

## Coverage audit, 7d

448 pattern citations across 101 unique patterns. 312 active patterns and 64 archived. Two archived patterns are still being cited 5 times each in current transcripts: cron-fires-during-pm2-warmup-must-fail-soft and cron-clean-noop-fork-reports-suppressed. The archival was wrong, or a canonical replacement landed without a supersession link. This shape is filed as a generalisation proposal P5.

## Single-incident shapes worth watching

Three failure shapes recurring across the week that are not yet covered by a pattern.

First: cron worker tabs assume MCP connectors that are not mounted in backend/.mcp.json. Filed as gmail-inbox-poll-worker-tabs-need-direct-node-fallback-or-comms-connector-2026-06-09. The general form (any worker brief assuming a connector without verifying the mount) is in the generalisation proposals.

Second: status enums stripped during channel relay. Filed as scheduler-signal-done-status-must-survive-coord-to-inbox-2026-06-09. The general form (any tool payload status field must survive relay) is in the generalisation proposals.

Third: claims made to external reviewers asserting codebase behaviour that the codebase contradicts. Filed as apple-store-claims-must-be-grep-verified-against-codebase-before-send-2026-06-09. The general form (any external claim about codebase state must be grep-verified) is the highest-confidence proposal in the generalisation drafts.

## Generalisation proposals

Five drafts at drafts/generalisation-proposals-2026-06-09.md. Two ready for codification this arc: P1 (external claims must be grep-verified) and P5 (archived patterns still cited imply unarchive or supersede). The other three accumulate signal pending a third occurrence.

## Anti-generalisation

One soft narrowing candidate (route-around-block-means-fix-this-turn-not-log-for-later) where the bare "blocked" and "broken" triggers cast too wide a net. Deferred until the recorder-coverage fix lands so the surface-to-citation ratio becomes a reliable signal. Other top-cited patterns probed clean. Draft at drafts/anti-generalisation-2026-06-09.md.

## Never-surfaced scan

Substrate undercount blocks this sub-pass for the same reason the 2026-06-08 fire blocked it. The python-hook emit coverage fix is the prerequisite. Filed as P3 on status_board.

## High-value session arcs this week

Major work this week landed durable doctrine same-arc.

The Apple App Store rejection of Chambers iOS on 2026-06-09 produced the claims-grep-verified pattern same arc. The 53-minute reviewer auto-bounce window made the cost of an unverified claim visible.

The 2026-06-08 cron consolidation collapsed 7 Sunday-evening crons into this single fire, plus another half-dozen consolidations across the week. The substrate substantial drop in weekly cron burn was the deliverable. Two further patterns landed for the worker prompt and dispatcher brief wrapper shape.

The Mac-canonical migration completed 2026-06-08 produced patterns/ecodiaos-autonomy-architecture-2026-06-08-mac-canonical.md and a knowledge-architecture pattern that reshaped the global bootstrap (CLAUDE.md core cut 26K to 2.4K tokens). The first day of measurements ran through this fire.

## Substrate writes this fire

- patterns/dispatch-events-recorder-undercounts-when-only-shell-hooks-emit-2026-06-09.md (new doctrine)
- drafts/generalisation-proposals-2026-06-09.md
- drafts/anti-generalisation-2026-06-09.md
- drafts/weekly-doctrine-synthesis-2026-06-09.md (this file)
- status_board: 3 P3 rows (substrate undercount, archived-still-cited, marker-discipline-dark)
- Neo4j: 1 Reflection node

## What the next fire should probe

Probe whether the python-hook emit coverage was fixed in the intervening week. If so, run the full sub-pass 1 and 6 measurements against a working substrate. If not, escalate the gap from P3 to P2.

Probe whether any of the two ready generalisation proposals (P1 and P5) landed as active patterns in the intervening week. If so, retire them from the proposals draft. If not, codify them in the next fire.

Probe the archived-patterns-still-cited list against current transcripts. If the same two archived files are still being cited, either unarchive them or escalate.
