---
triggers: applied-tag-telemetry, layer-3-telemetry, pattern-applied, pattern-not-applied, tagged-silent, application-events-jsonl, doctrine-lifecycle, narrow-or-archive, post-action-applied-tag-check, scratchpad-write, decision-quality-self-optimization, telemetry-dark, dispatch-event-consumer
status: active
---

# Layer 3 pattern-application telemetry is wired at Stop event, not PostToolUse fork dispatch

**Rule.** Pattern-application telemetry (the `application-events.jsonl` rows the doctrine-lifecycle thresholds in backend/CLAUDE.md depend on) is now produced by a Stop-event hook (`~/.claude/hooks/ecodia/applied_tag_telemetry.py`) that fires at every conductor turn end. The legacy producer `post-action-applied-tag-check.sh` is still registered on dead matchers (`mcp__forks__spawn_fork|mcp__factory__start_cc_session`) but fires zero times; it is kept on disk only for its tag-extraction logic and will be retired in Phase 1b of the 2026-05-26 doctrine consolidation arc.

**Why.** From 2026-05-14 (SDK fork death) through 2026-05-26, `application-events.jsonl` accumulated a single row. The doctrine-lifecycle thresholds in backend/CLAUDE.md ("`[NOT-APPLIED]` rate >70% over 7d -> narrow triggers; zero fires >30d -> archive candidate; `tagged_silent` rate >50% over 7d -> retire OR restate") had no data to evaluate. The weekly `pattern-corpus-health-check` cron produced vacuous output. The whole self-improvement loop for the pattern corpus was running blind. Rewiring the producer to Stop event puts pattern-application telemetry back on a live signal: every turn produces telemetry, regardless of whether a fork/factory dispatch happened.

**How to apply.**
- The Stop hook scans the turn transcript (tail-capped at 2000 lines) for pattern surfacings: any `D:/.code/EcodiaOS/backend/patterns/*.md` (or `~/ecodiaos/patterns/*.md` or `backend/patterns/*.md`) mention in a tool_result block, user_context block, or system reminder. Assistant_text mentions are explicitly NOT counted as surfacings (they are the conductor's own writing, not context delivered TO the conductor).
- The hook then scans assistant_text for explicit `[APPLIED] <pattern>.md because <reason>`, `[NOT-APPLIED] <pattern>.md because <reason>`, or `[FALSE-POSITIVE] <pattern>.md because <reason>` markers.
- For each surfaced pattern, the hook writes one JSONL row matching the legacy `post-action-applied-tag-check.sh` schema (so `dispatchEventConsumer.js` can drain both producers without modification). Fields: `ts, matched_dispatch_ts, tool_name, pattern_path, trigger_keyword, source_layer, applied (true|false|null), tagged_silent (bool), was_false_positive (true|null), reason, hook_name, session_id`.
- `source_layer` is `hook:applied-tag-telemetry-stop:<source>` where `<source>` is `tool_result`, `user_context`, or other block kind, so the consumer can distinguish where the surfacing arrived.
- Most turns produce `tagged_silent=true` rows because backend/CLAUDE.md Layer 3 doctrine explicitly forbids narrating `[APPLIED]/[NOT-APPLIED]` into chat (the canonical write path is `mcp__scratchpad__write`, not yet shipped). The silent rate IS the lifecycle signal: a pattern surfaced repeatedly with 100% silent rate over 7 days is a strong narrow-or-archive candidate, regardless of whether the conductor ever emitted an explicit tag.

**Substrate.**
- Hook script: `C:/Users/tjdTa/.claude/hooks/ecodia/applied_tag_telemetry.py`
- Registration: `C:/Users/tjdTa/.claude/settings.json` -> `hooks.Stop[0].hooks[1]`, timeout 8s, statusMessage `"Applied-tag telemetry (Layer 3 rewire)..."`
- Output: `C:/Users/tjdTa/.claude/hooks/ecodia/logs/telemetry/application-events.jsonl` (env: `ECODIAOS_TELEMETRY_DIR`)
- Consumer: existing `dispatchEventConsumer.js` (unchanged; schema matches the legacy producer)

**Hard invariants.**
- The hook MUST never echo to chat. Stderr only for unhandled exceptions. Always exits 0.
- The hook MUST tail-cap transcript reading at 2000 lines to bound memory for long-running sessions.
- The hook MUST tolerate malformed transcript JSON lines (skip and continue).
- Future schema changes MUST preserve backward-compatibility with the legacy `post-action-applied-tag-check.sh` row shape until that producer is fully retired in Phase 1b.

**Anti-patterns.**
- Do NOT add a parallel producer that writes to a different jsonl path. There is one telemetry file; both producers append to it.
- Do NOT register this hook on PostToolUse. That would fire on every tool call within a turn and over-count surfacings.
- Do NOT classify `tagged_silent=true` as a failure. Most rows are silent by design (post-2026-05-12 doctrine forbids in-chat tags). Silent rate is the SIGNAL, not noise.
- Do NOT remove the legacy `post-action-applied-tag-check.sh` registration before Phase 1b. Removing it before then would orphan one row in the existing telemetry without a clean migration record.

**Origin.** Doctrine consolidation Phase 1a, 2026-05-26. Audit deliverable at `D:/.code/EcodiaOS/backend/drafts/doctrine-consolidation-audit-2026-05-26.md` (section 5) identified the telemetry-dark situation. Phase 1a smoke-tested the Stop-event rewire with a synthetic transcript containing one `[APPLIED]` tag and one untagged surfacing; both classified correctly.

**Cross-refs.**
- [[decision-quality-self-optimization-architecture]] (parent architecture, Layers 1-5)
- [[context-surfacing-must-be-reliable-and-selective]] (Layer 1 parent)
- [[no-symbolic-logging-act-or-schedule]] (the meta-rule justifying the forcing function)
- [[pattern-lifecycle-active-narrowed-archived]] (the lifecycle this telemetry feeds)
- [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]] (helper + hook + doctrine triad; this pattern IS the doctrine half of the triad)
