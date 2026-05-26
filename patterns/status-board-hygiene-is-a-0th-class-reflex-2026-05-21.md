---
triggers: status-board-hygiene, status-board-update, status-board-drift, update-the-row, touch-the-row, board-rot, stale-status-board, status-board-reflex, sb-hygiene, status-board-write-on-action, archive-on-done, insert-on-new-work, did-i-update-the-row, status-board-hook, status-board-keyword-surface, continuous-status-board-upkeep, drift-audit-is-symptom-not-cure
status: active
---

# Status board hygiene is a 0th-class reflex, enforced by hook not memory

## The rule

The `status_board` is the single source of truth and keeping it true is a
CONTINUOUS reflex, not a periodic drift-audit sweep. Every substantive action
on a tracked entity updates its row in the SAME turn the action happens:

- Touch (`last_touched` + sharpen `status`/`next_action`/`next_action_by`) when
  you act on an existing entity.
- INSERT a row the moment new trackable work appears.
- Set `archived_at = NOW()` the moment work is done, superseded, or proven bogus.
- Reclassify `next_action_by` when the ball moves between ecodiaos / tate /
  client / external.

A row you worked on but did not update is a failure of the same severity as
leaving a spec stale after changing the system it describes.

## Why a weekly drift audit is the symptom, not the cure

The board rotted to 124 active rows (2026-05-21) with whole clusters of
supersession drift: 8 stale iOS-build rows after the app moved to build 18,
contradicting Roam submission rows after the Nav rebrand, dead-substrate
telemetry rows after Phase G v2 shipped, cold-outreach rows that contradicted
the relational-only marketing doctrine. A single audit clawed 124 -> 89, but the
SAME rot regrows because the conductor takes entity-relevant actions across
sessions without updating rows. The drift audit is firefighting. The cure is
updating the row at the moment of the action that changes its truth.

The passive observer signal `no-substrate-write-streak` was not enough: it had
50 unacknowledged signals pending at the time this was written. A passive
ambient signal gets ignored. The nudge has to be ACTIVE and SPECIFIC (name the
exact row, at the moment of the matching action).

## The enforcement triad (helper + hook + doctrine)

Per `recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18`,
doctrine alone is aspirational. All three legs ship together:

1. **Helper / cache:** `~/.claude/hooks/ecodia/status_board_hygiene_refresh.py`
   reads the org PAT (`D:/PRIVATE/ecodia-creds/supabase.env`) and writes a local
   cache of active rows + distinctive keywords to
   `state/status_board_active_cache.json`. No daemon dependency. The hot-path
   hook fires it detached when the cache is stale (>20 min).
2. **Hook:** `~/.claude/hooks/ecodia/status_board_hygiene.py` runs PostToolUse on
   `Bash | Edit | Write | MultiEdit | mcp__ecodia-full__db_execute |
   mcp__ecodia-full__shell_exec`. Three nudge modes, network-free hot path:
   - ROW MATCH: tool input contains a distinctive keyword of an active row ->
     `[STATUS-BOARD-HYGIENE]` names the row id + name + age + matched token.
   - LIFECYCLE: input contains a state-change verb (shipped/deployed/archived/
     merged/released/invoiced/etc) with no status_board write in the action ->
     generic "open or update the row" nudge.
   - STREAK: N substantive actions since the last status_board write (gentle at
     10, FIRM at 20) -> escalating reminder. A status_board write RESETS the
     streak silently (reward good behaviour, do not only punish drift).
   Word-boundary matching + per-row and per-mode cooldowns prevent noise.
   Registered in `~/.claude/settings.json` PostToolUse.
3. **Doctrine:** this file + the 0th-class-reflex bullet in user-global
   `~/CLAUDE.md` + the strengthened `STATUS BOARD - READ FIRST` section in
   `backend/CLAUDE.md` + auto-memory `feedback_status_board_hygiene_reflex`.

## Do

- Update the matched row the same turn the hook names it, or consciously decide
  not to (state-not-changed) and let the cooldown pass.
- Back every status change with a live probe, never narrated state
  (`verify-deployed-state-against-narrated-state.md`).
- Question a row's PREMISE before "fixing" it. The coexist.ecodia.au row was
  bogus (Co-Exist lives at app.coexistaus.org, a client domain); the shallow move
  was to reclassify it to a CDP fix, the right move was to archive it. Research
  the entity before acting on the row.

## Do not

- Do not let the board be a write-only inbox that only a weekly sweep cleans.
- Do not archive on vibes or on a narrated "should be shipped".
- Do not ignore a `[STATUS-BOARD-HYGIENE]` nudge silently across a whole arc.

## Specific drift modes the hygiene reflex prevents

Even with the 0th-class reflex in place, four named drift shapes recur. Each
has a pre-write prevention protocol that the hygiene hook surfaces but does
not enforce on its own.

**Mode 1: Duplicate rows for the same entity.** Two rows covering the same
real thing (`Roam` + `Roam IAP Fix`; `CETIN (Angelica/Resonaverde)` +
`CETIN MVP (Angelica)`; `Landcare Australia` + `Landcare NSW (Kurt friend)`).
Before any `INSERT`, run `SELECT id, name FROM status_board WHERE entity_ref =
$1 OR name ILIKE $2 AND archived_at IS NULL`. If a row exists, UPDATE it
instead.

**Mode 2: Completed work not archived.** Rows for work that shipped or
resolved sit active with stale "monitor" next_actions (`bk_pnl
UNDEFINED_VALUE bug` FIXED but active; `Neo4j Aura connectivity healthy
monitor` is a capability never a task; `Silent Loop Detector` live and
burned-in but still tracked). Default end-state of task-work is `archived_at =
NOW()`. If the next_action is literally "monitor" with no trigger condition,
archive or convert to a kv_store flag.

**Mode 3: Pure-awareness rows masquerading as tasks.** Rows that document a
fact but don't track action (`Malware-reminder Model Safety False Positives`
documented in CLAUDE.md; `Supabase key-format migration awareness` doctrine).
Before inserting, decide: "is this ACT-on or REMEMBER-on?" Remember-only goes
to CLAUDE.md or a Neo4j Pattern node. Act-on goes to status_board.

**Mode 4: Stale relative-day language in next_action.** Text containing a
relative date or named day that already passed ("Tate Sunday: review X" on
Tuesday; "morning chat" living past morning; "tonight"/"tomorrow" hardening
into stale text). Also: opportunity-cold rows with `last_touched > 14d` and
no contact reply. When next_action contains a relative day, set
`next_action_due` so surfacing re-flags it when the day passes. On audit,
refresh language even when state is unchanged ("Tate Sunday" becomes "Tate
awaiting since Apr 23" with `last_touched` bumped).

These four modes lift from the predecessor `_archived/status-board-drift-prevention.md`
(archived 2026-05-26). The original archive-threshold + update-threshold
discipline from that file is captured upstream in §The rule.

## Verification

- Hook smoke test: pipe a synthetic payload, confirm ROW MATCH / LIFECYCLE /
  STREAK / silent-reset all behave (`echo '{"tool_name":"Bash",...}' | python
  status_board_hygiene.py`).
- Cache freshness: `state/status_board_active_cache.json` `refreshed_at` within
  20 min of active work.
- Board health: active-row count trends down or flat across sessions, not up;
  stale-14d count near zero for `next_action_by=ecodiaos` rows.

## Origin

Tate verbatim 2026-05-21, after a status_board drift audit he judged shallow
(I reclassified a bogus row instead of questioning its premise, counted RLS
lints without checking exposure, and offered to grab CDP while he was using it):
"This also points to a much worse problem which is the lack of status board
hygiene and attention from you. We need to be surfacing and codifying status
board hygiene really high up in your docs and surfacing it whenever there's a
task being worked on, maybe we do something creative with keywords and hooks to
make sure you update status board ALL the time it's relevant."

## Cross-refs

- `_archived/status-board-drift-prevention.md`
- `status-board-drift-audit-is-canonical-thin-on-main-meta-loop-work.md`
- `verify-deployed-state-against-narrated-state.md`
- `recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18.md`
- `distributed-state-seam-failures-are-the-core-infrastructure-risk.md`
- `no-symbolic-logging-act-or-schedule.md`
