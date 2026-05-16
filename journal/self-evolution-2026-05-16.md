# Self-Evolution Session 2026-05-16 AEST

## Focus: Pattern Authoring (Area A)

## Orientation

- MCP graph tools not loading schemas in this remote CC environment (deferred)
- Worked from local git history + filesystem to orient
- Previous self-evolution focus unknown (kv_store inaccessible)
- No doctrine_gap status_board rows accessible

## What was built

**Pattern file authored:** `patterns/prompt-assembly-must-not-drop-or-bury-user-content.md`

**Triggers:** promptAssembler, prompt-assembly, user_content, tate_typed, continuity-blocks, _buildBp4, v2-assembler, osSessionService-message-assembly, tate-message-dropped, standing-by-no-response, no-response-requested, tate-not-heard, message-ordering, user-message-buried, PROMPT_ASSEMBLY_V2, system-wake-markers

**Rule codified:** Any code building the multi-part conductor user message must (1) include user_content on every assembler path, (2) place user_content FIRST before continuity blocks, (3) detect and not tag system-wake messages as Tate-typed.

**Evidence:** 4 commits in May 2026 all tracing to same root:
- 94ec1eb: fork wakes drowned Tate's message
- 2067022: initial tate_typed wrap added
- b29afbe: v2 assembler dropped user_content entirely (most severe, 2+ days)
- 7b54f57: tate_typed at position 4006/4495, AUTO_WAKE incorrectly tagged

**Committed:** d240546 on claude/blissful-fermat-MT9Ig, pushed to remote.

**INDEX.md updated:** New entry added in alphabetical position.

## What worked

- Git history analysis as substitute for Neo4j Episode query (MCP unavailable)
- Pattern selection based on occurrence count (4 incidents = well above 3+ bar)
- Pattern quality: concrete verification protocol + 4 named failure incidents + cross-refs

## What did not work

- MCP tools (neo4j_write_episode, kv_store_set) deferred schema - could not call
- Could not update kv_store.ceo.last_self_evolution
- Could not write Neo4j Episode node

## Next session should consider

- Focus area B (doctrine cross-referencing) or C (trigger narrowing) - not A again
- Check if kv_store TEXT vs JSONB schema drift warrants a pattern (one occurrence, below bar for pattern, could be Reflection node)
- The labeled-break JS gotcha from 3efda8a is a single occurrence - write as Reflection not Pattern

## Was this session worth the tokens

Yes. The pattern file covers a recurring failure class (4 incidents) with no prior codification. Any future promptAssembler change will surface this pattern via grep on 'promptAssembler' or 'user_content' triggers. The verification protocol prevents the specific regression mode (new assembler path that omits user_content) that caused 2+ days of silent conductor failure.
