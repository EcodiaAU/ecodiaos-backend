---
triggers: observer-signals, observer-signal-hook, posttoolusehook-observer, ambient-meta-cognition, no-substrate-write-streak, thin-context-signal, episode-overdue-signal, observer-replacement, lane-c-observer, corazon-observer-hook, observer-propagation, observer-signals-global-rollup, observer-signals-routine-surface, observer-signals-recent, cross-routine-observer, observer-kv_store-schema, observer-rule-set
---

# observer_signals reimplementation via PostToolUse hook + cross-Routine kv_store propagation

## The substrate

Pre-2026-05-15: the VPS `osSessionService.js` had an ambient `observer_signals` layer - a Haiku-driven peer-signal subsystem watching conductor turns for behavioural drift, writing to the `observer_signals` Postgres table, injecting into the next turn's prompt as an `<observer_signals>` XML block. Producers + consumers were in-process subscribers to the SDK turn stream. Origin pattern: `services/observers/_observerBase.js`, `services/observerSignalsService.js`, `services/promptAssembler.js`, route at `routes/observerSignals.js`.

Post-2026-05-15 the interactive conductor is a Claude Code session on Corazon. Claude Code has hooks (PreToolUse, PostToolUse, UserPromptSubmit). The substrate moves but the layer stays.

## The shape

Three surfaces, one entity.

| Surface | Producer | Consumer | Cap |
|---|---|---|---|
| `kv_store.cowork.observer_signals.recent` | Corazon PostToolUse hook (`observer_signal.py`) | `/observer-signals` slash command, meta-loop Routine | 20 LIFO |
| `kv_store.cowork.observer_signals.routine.<name>` | each Routine at end of run | `/observer-signals` slash command, Routine self-tuning | 20 LIFO per routine |
| `kv_store.cowork.observer_signals.global` | Corazon hook AND every Routine | `/observer-signals` slash command, claude-md-reflection Routine for weekly tuning | 50 LIFO |
| Local tail | Corazon hook | `/observer-signals` slash command as MCP-unreachable fallback | 50 LIFO at `~/.claude/hooks/ecodia/state/observer_signals_local.jsonl` |

## The rule set

The hook evaluates three rules on every PostToolUse fire. Routines evaluate the same three plus routine-specific extensions at end of their run.

### Rule 1 - no-substrate-write-streak

If 10 consecutive tool calls produce no write to a substrate-write tool, emit `observer_signal:no-substrate-write-streak`. Substrate-write tools (any MCP server name prefix):

```
status_board_upsert
neo4j_write_decision
neo4j_write_episode
kv_store_set
```

Reset on any of those. Fire ONCE at the threshold (not repeatedly while still above it). Why: 10+ tool calls without a substrate write is the conductor reading without acting - either the work is read-heavy by design (orientation, audit) which is fine, or the conductor is spinning without producing a durable artefact. The signal forces the question.

### Rule 2 - thin-context on status_board.upsert

If a `status_board_upsert` call has `context` shorter than 50 chars, emit `observer_signal:thin-context`. Reason: status_board context is the future-cold-start hook. A row with "todo" as context costs the next reader as much as a missing row. The 50-char threshold is the rough lower bound for a context line that names the WHY, not just the WHAT.

The hook reads `tool_input.context` directly (most MCP tool calls), and falls back to `tool_input.row.context` (for nested-shape calls). Both are common; either or both is fine.

### Rule 3 - episode-overdue

If session age exceeds 2h AND no `neo4j_write_episode` has fired this session, emit `observer_signal:episode-overdue`. Re-fire every 30 min while still overdue (not on every tool call - that floods).

Reason: Sessions over 2h with no Episode are a durability hole. The session ends (compact, cap hit, user closes) and the work disappears from Neo4j retrievals. Episodes are how the conductor talks to its own future cold start.

### Routine-specific rules (per Routine prompt)

Each Routine adds rules tied to its load-bearing failure modes. Examples:

- `factory-cloud`: em-dash-drift (a sweep on shipped files found > 0 em-dashes before substitution), high-blast-radius-edit (touched osSessionService / factoryDispatch / middleware / SELF.md / CLAUDE.md), test-failure-abort.
- `meta-loop`: absence-of-decision (run completed without writing a Decision node when one was warranted).
- `system-health`: anomaly-coverage-gap (a substrate the routine should have checked was unreachable, e.g. Neo4j auth failure - the signal is not the failure itself but the gap in coverage).
- `email-triage`: untrusted-input-wrap-mismatch (processed an external email without the `<untrusted_input>` wrap markers visible upstream).

## The signal shape (canonical)

```json
{
  "ts": "<ISO8601>",
  "source": "<corazon_conductor | routine.<name>>",
  "session_id": "<claude session id>",
  "kind": "<rule-kind>",
  "message": "<one-line human summary>",
  "ref": "<row id | file path | external ref | short context excerpt>"
}
```

Routines additionally include `routine` and `routine_session_id` at the top level.

## The wire-in (Corazon side)

`~/.claude/settings.json` PostToolUse list, no matcher (fires on all tools):

```json
{
  "PostToolUse": [
    {
      "hooks": [
        { "type": "command", "command": "python3 \"C:/Users/tjdTa/.claude/hooks/observer_signal.py\"", "timeout": 5 }
      ]
    }
  ]
}
```

The hook is non-blocking, exit-0-always. It catches and swallows every exception. A broken hook never wedges a tool call.

State is persisted across hook invocations at `~/.claude/hooks/ecodia/state/observer_signals_state.json`. Per-session counters: `no_substrate_streak`, `last_episode_ts`, `session_started_ts`. The state file is keyed on `session_id`; a new session resets cleanly.

## The wire-in (Routine side)

Every Routine prompt MUST include the "Step N+1 - observer_signal emit" step in `D:/.code/EcodiaOS/backend/routines/README.md`. The Routine emits its signals to `routine.<name>` AND `global` before exit. The factory-cloud prompt is the reference implementation.

## The consumer

`/observer-signals` slash command at `~/.claude/commands/observer-signals.md`. Reads the local tail + the kv_store surfaces, summarises terse, recommends action per signal kind. The slash command is the conductor-facing surface; the kv_store keys are the substrate.

Phase 2 deferred: a VS Code panel that subscribes to the kv_store keys via polling and surfaces signals as ambient sidebar items. Tracked as status_board P3.

## Why this is correct architecturally

The VPS osSession observer fed signals back into the conductor's turn prompt as ambient context. Claude Code does not natively support "inject this XML into the next turn's prompt" - hooks fire async after the tool call, before the model sees the result. So the substitute is to:

1. Fire signals to a known kv_store key.
2. Have the conductor's orientation pass read that key as part of its standard `status_board.query + neo4j.search + kv_store.get` triple.
3. Surface explicitly via `/observer-signals` when the conductor wants the full tail.

That is *pull-based* meta-cognition versus the old *push-based* turn-injection. The cost is one extra orientation read per turn the conductor wants to be aware. The benefit is the conductor decides when to integrate signals, instead of having them forced into every prompt.

Trade-off receipts:
- We lose the automatic mid-turn injection. The conductor must remember to check.
- We gain a substrate observers (Routines AND the interactive conductor) write to with the same shape.
- We gain durability: kv_store survives Routine death; the old osSession injector lived in memory.

## Failure modes (do not let any of these recur)

- **Hook fails silently and we never know.** Mitigation: a `local_signals.jsonl` always-on-disk tail at `~/.claude/hooks/ecodia/state/observer_signals_local.jsonl`. The slash command reads this even when MCP is unreachable. If the file is missing AND tool calls are happening, the hook is broken - investigate.
- **MCP unreachable, signals lost.** Mitigation: `_push_to_kv_store` is best-effort; the local file is the canonical write. The hook treats MCP push as opportunistic.
- **Rule fires on every call, floods the surfaces.** Mitigation: rule 1 fires once at the threshold; rule 3 has a 30-min cooldown; rule 2 only fires on its target tool. Routine rules MUST follow the same fire-once-or-cooldown discipline.
- **Routine writes only to `routine.<name>`, never to `global`.** The roll-up is the cross-routine view. Skipping it means `/observer-signals` returns a partial picture. Routine prompts enforce the double-write.
- **Bearer scopes missing for kv_store_set.** The cowork bearer has `write.kv_store.cowork_namespace` - the `cowork.*` prefix is required on every key the hook writes. We honour that with `cowork.observer_signals.*` naming.
- **Hook environment lacks the MCP bearer.** Mitigation: the hook reads `ECODIA_MCP_BEARER` from env. If the env is not set in `~/.claude/settings.json env` block, the hook degrades to local-tail-only. Acceptable failure mode (the slash command still works).
- **Self-loop**: the hook ignores `tool_name == "observer_signal"` to prevent infinite recursion if a future MCP tool by that name lands.

## Cross-references

- `D:/.code/EcodiaOS/backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md` Â§7 - the architectural slot this fills.
- `~/.claude/hooks/observer_signal.py` - the hook implementation.
- `~/.claude/commands/observer-signals.md` - the consumer slash command.
- `D:/.code/EcodiaOS/backend/routines/README.md` - the cross-Routine contract spec.
- `~/ecodiaos/src/services/observerSignalsService.js` - the legacy VPS implementation (Phase 0-3 still live).
- `~/ecodiaos/src/services/observers/_observerBase.js` - legacy Haiku observer producers (slated for Phase 4 deletion once Corazon hook proves over a week).
- `D:/.code/EcodiaOS/backend/patterns/prefer-hooks-over-written-discipline.md` - meta-pattern this implements (mechanical enforcement over written reminder).
- `D:/.code/EcodiaOS/backend/patterns/_archived/decide-do-not-ask.md` - applied to the rule-threshold tuning (10 calls / 50 chars / 2h are MY calls).

## Origin

Lane C of the 2026-05-15 VPS-to-local migration. The Corazon chat's `MIGRATION_FULL_ARCHITECTURE_2026-05-15.md` Â§7 named the replacement shape ("PostToolUse hook + sidebar surface"); Lane C closed it as: PostToolUse hook + 3-rule set + 3-surface kv_store schema + slash command consumer + Routine universal contract.

Deferred: the VS Code sidebar panel (Phase 2). Tracked as status_board P3 row "observer_signals sidebar panel".
