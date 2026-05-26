---
triggers: hook-registration, hook-matcher, dead-matcher, dispatch-primitive, settings-json, prep-tool-use, post-tool-use, hook-stack-drift, dispatch-worker-substrate, fork-substrate-deprecated, factory-substrate-deprecated, hook-stack-invariant, hook-lifecycle
status: active
---

# Hook matchers must follow the live dispatch primitive, not the substrate they were authored against

**Rule.** Every PreToolUse / PostToolUse hook registration in `settings.json` must target a tool currently in the active MCP surface. When the substrate the hook was authored against dies (SDK forks, Factory CLI, deprecated tool family), the hook must be either retired or re-targeted to the surviving live equivalent in the SAME turn the substrate is declared dead. A hook firing on a dead matcher is dark and worse than no hook: it consumes a registration slot, suggests live coverage, and silently fails to produce its intended forcing function.

**Why.** Doctrine accumulates faster than substrate retires. A hook authored 2026-04-29 on `mcp__forks__spawn_fork|mcp__factory__start_cc_session` keeps existing in `settings.json` long after the SDK fork primitive is killed (Phase 1 of the 2026-05-15 local-first migration). The 2026-05-26 consolidation audit found 7 PreToolUse hooks plus 1 PostToolUse hook plus 3 partially-dead matchers all firing on substrates that had not existed for 12+ days. The single load-bearing telemetry pipeline (`application-events.jsonl` for pattern-application-rate scoring, used by the doctrine-lifecycle thresholds) had collected ONE row in that span because its sole producer was registered on a dead matcher. Self-improvement substrate cannot self-improve when its telemetry is dark.

**How to apply.**

1. When killing a substrate in a deprecation note (CLAUDE.md DEPRECATIONS table, pattern frontmatter `archived_at`, "TOOL NOT YET SHIPPED" doctrine line), grep `settings.json` for hooks targeting the dying tool name in the SAME turn:
   ```
   grep -nE '"matcher":.*<dying-tool-name>' settings.json
   ```
2. For each match, decide one of three:
   - **Retire**: deregister the hook from `settings.json`. Leave the script on disk so its logic is preserved. Note in the deprecation that "hook X retired with this substrate".
   - **Re-target**: identify the live equivalent matcher. Edit the hook script to accept the new stdin shape (e.g. Bash carries `.tool_input.command`; Write carries `.tool_input.content` + `.tool_input.file_path`; Edit carries `.tool_input.new_string` + `.tool_input.file_path`; MultiEdit carries `.tool_input.edits[]`; UserPromptSubmit carries `.prompt` at top level NOT under `.tool_input`). Update the matcher in `settings.json`.
   - **Merge**: fold the check into an existing live hook with overlapping intent.
3. For LLM-firing hooks (one Anthropic / Haiku / OpenAI call per fire), the re-target MUST include a path filter to keep cost bounded. Doctrine-paths-only (`patterns/`, `clients/`, `docs/`, `CLAUDE.md`, `SELF.md`, `.claude/skills/`) is the canonical filter. Unfiltered Write/Edit/MultiEdit firings on every code edit drive non-trivial token cost.
4. Smoke-verify every re-target on synthetic stdin before considering the migration done. The hook MUST exit 0 on each new tool-input shape. Path filters MUST silently exit 0 on off-paths.
5. Update auto-memory + the relevant CLAUDE.md tier so a fresh session reading the doctrine sees the live state, not the stale "matcher" name.

**Substrate invariants.**

- `settings.json` MUST contain zero matcher entries for tools listed in any DEPRECATIONS table.
- Every script in `~/.claude/hooks/ecodia/*.sh` and `*.py` that is registered MUST appear in `settings.json` (orphan scripts that were retired are kept on disk for reference but not registered).
- The hook-stack invariant check protocol from backend/CLAUDE.md (probe every command path in `settings.json` against the filesystem) MUST be extended to also probe every matcher against the live MCP tool list. The current invariant only catches MISSING scripts, not dead matchers.
- When a hook is re-targeted to a matcher with higher fire-frequency (e.g. moving from fork-spawn matcher firing 0-5x per day to Write/Edit/MultiEdit firing 50-200x per day), the hook script MUST be reviewed for performance impact and LLM-call cost. The Stop-event applied-tag telemetry hook is the canonical example: tail-cap at 2000 lines, never block, always exit 0, no LLM call.

**Anti-patterns.**

- Do NOT keep a dead-matcher hook registered "just in case the tool comes back." If it comes back, register it then.
- Do NOT delete the hook script when retiring its registration. The logic may transfer to a future re-target.
- Do NOT bundle a hook re-target into a commit alongside unrelated working-tree changes. The matcher migration is its own reviewable diff.
- Do NOT register an LLM-firing hook on an unfiltered matcher. Path-filter or tool-name-filter at the top of the script (cheap exit) is mandatory.

**Origin.** Doctrine consolidation Phase 1, 2026-05-26. Audit at `D:/.code/EcodiaOS/backend/drafts/doctrine-consolidation-audit-2026-05-26.md` (sections 3 + 5). Phase 1a + 1b + 1c executed the audit's migration map: 5 hooks retired (post-action-applied-tag-check, brief-consistency-check, cowork-first-check, router-skip-check, fork-by-default-nudge); 4 hooks re-targeted to live matchers (cred-mention-surface to Bash+Write+Edit+MultiEdit, anthropic-first-check to Write+Edit+MultiEdit with src/tools/hooks/doctrine path filter, haiku-semantic-review to Write+Edit+MultiEdit with doctrine-only path filter, episode-resurface to UserPromptSubmit); 1 matcher trimmed (gui-macro-discovery dropped fork+factory arms). 1 new hook added on Stop event (applied_tag_telemetry.py) replacing the dark Layer 3 telemetry. Net result: zero dead-matcher references in `settings.json`, pattern-application telemetry alive.

**Cross-refs.**
- [[layer-3-applied-tag-telemetry-rewired-via-stop-event-2026-05-26]] (the Phase 1a sister; this pattern is the meta-rule, that pattern is the worked example)
- [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]] (helper + hook + doctrine triad)
- [[context-surfacing-must-be-reliable-and-selective]] (Layer 1 parent; surface hooks are this rule's main client)
- [[prefer-hooks-over-written-discipline]] (why hooks matter at all)
- [[pattern-lifecycle-active-narrowed-archived]] (the lifecycle this substrate maintains)
