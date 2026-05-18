---
name: recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18
description: A new technique that "I'll use next time" is a technique I will NOT use next time. Recursive improvement only works when the rule has a mechanical surfacing substrate that fires at the moment of the failure mode. Doctrine alone is aspirational. Helper + hook + cross-ref is substrate.
triggers: recursive-improvement, substrate-driven-improvement, lessons-must-have-surfacing, codify-at-the-moment, doctrine-alone-is-aspirational, helper-hook-cross-ref-triad, fix-then-doctrine-same-turn, anti-i-will-next-time, recursive-loop-must-close, surfacing-at-the-moment, mechanical-enforcement-over-discipline
status: active
---

# Recursive improvement is substrate-driven, not aspirational

Tate verbatim 2026-05-18 (after the CDP helper library shipped): "can you also make sure that the recursive learning results are actually being used in future consistently and are codified and surfaced in exactly the right moments so they're always perfectly effective AND that in future you will always recursively improve if possible."

The failure mode this prevents: shipping a doctrine file, marking the lesson "learned," and then watching the same anti-pattern recur three weeks later because nothing surfaces the rule at the moment it matters.

## The triad

Every recursive-improvement loop closes only when all three layers exist:

1. **Helper** - the reusable primitive that makes the right thing easy. For CDP that is `cdp.realClick` / `cdp.nativeFill` / etc on the Corazon laptop-agent. For status_board it is the `status_board.upsert` MCP tool. For Neo4j it is `neo4j.write_decision`. The helper is the form the rule takes in code.
2. **Surfacing hook** - the PreToolUse / PostToolUse / UserPromptSubmit hook that fires at the moment the rule applies and pushes the helper name into model-visible context. For CDP that is `cdp_helper_nudge.py`. For credentials it is `cred-mention-surface.sh`. The hook is the rule made mechanical.
3. **Doctrine + cross-ref** - the pattern file with `triggers:` frontmatter, cross-refs from parent patterns, mention in `CLAUDE.md` operating doctrine, and (when relevant) auto-memory entry. The doctrine is the rule made searchable.

A lesson with only doctrine = aspirational. A lesson with only a helper = invisible. A lesson with only a hook = noise. All three together = the loop closes.

## The same-turn rule

When a new failure mode is hit:

1. **Generalise** - strip the page/file/task-specific parts. What is the underlying primitive?
2. **Land the helper** - add the function to the right `tools/<x>.js` (or the right service), `pm2 restart` the affected substrate, smoke-test live.
3. **Wire the hook** - add the anti-pattern detector to (or create) the matching PreToolUse hook. Smoke-test that it fires on the antipattern and stays silent on unrelated calls.
4. **Author the doctrine** - new pattern file with `triggers:` frontmatter that includes the symptom phrases I would search for next time. Cross-ref from the parent pattern.
5. **Surface to CLAUDE.md** - if the helper is high-leverage enough to be reflexive, add a one-line operating-doctrine bullet that points at the pattern.
6. **Auto-memory entry** - if the surface lives outside the repo (laptop-agent, IDE bridge, hook substrate), write a `reference_*.md` entry so future sessions find it in MEMORY.md.

If any step gets skipped, the loop does not close and the same failure catches me next month.

## When does this apply

Whenever I write more than ~5 lines of inline code to work around a pattern that will recur. Specifically:

- A `cdp.runJs` JS string that hand-rolls a primitive (native setter, deep walk, real click).
- A `mcp__supabase__db_execute` SQL that hand-rolls a query pattern (slice query, drift audit, retention sweep) that will be needed again.
- A bash one-liner that wires the same three CLI tools together to do a recurring task (Tailscale + curl + jq, ssh + git + pm2, etc).
- A subtle gotcha discovered in a substrate (pm2 sticky env, SDK musl/glibc trap, MCP doubly-wrapped response, PowerShell `$pid` shadow).
- An anti-pattern hit twice in the same week.

If any of those criteria match, the triad gets shipped same-turn before the arc closes.

## What this does NOT mean

- This is not "abstract early." Premature abstraction is its own anti-pattern. Three similar lines is still better than a premature helper. The trigger is "this will recur AND the workaround is non-trivial," not "this could theoretically be abstracted."
- This is not "ship a hook for every rule." Hooks are expensive context noise when they fire on false positives. The detector regexes are tuned to fire only on the exact anti-pattern, not the general topic.
- This is not "doctrine before action." The fix lands first. The doctrine captures what was just shipped.

## The first three loops that closed under this rule

| Loop | Helper | Hook | Doctrine |
|---|---|---|---|
| CDP click/fill primitives | `cdp.realClick`, `cdp.deepFindRect`, `cdp.nativeFill`, `cdp.findVisible`, `cdp.clickByTag` on Corazon laptop-agent | `cdp_helper_nudge.py` PreToolUse on Bash, scans for antipatterns in `cdp.runJs` JS | [cdp-helper-library-and-recursive-improvement-2026-05-18.md](cdp-helper-library-and-recursive-improvement-2026-05-18.md) + [chrome-cdp-is-top-primitive-for-gui-gated-work-2026-05-18.md](chrome-cdp-is-top-primitive-for-gui-gated-work-2026-05-18.md) |
| CDP self-discoverability | `cdp.helpers` tool returns inventory + when-to-use + examples | (n/a - this IS the surfacing layer for in-session self-query) | Listed in `cdp.helpers` output + doctrine cross-ref |
| (placeholder) Next failure mode | TBD | TBD | TBD |

The third row will get filled by the next CDP arc that hits a new gap. Same-turn.

## Anti-patterns this guards against

- "I'll codify this next time." Next time the workaround gets re-derived from scratch.
- "It's a one-off, no need for a helper." Almost nothing is a one-off; the question is whether the next occurrence is recognisable to future-me.
- "Add a comment in the inline JS." Comments in `cdp.runJs` strings die with the call. The helper function name IS the comment.
- "Doctrine without surface." A `.md` file with no `triggers:` frontmatter and no hook is invisible to future searches.
- "Hook without doctrine." A hook that fires `[X WARN]` with no link to the pattern just adds noise.
- "Helper without doctrine." A helper with no doctrine entry is a tool nobody knows exists.

## Cross-refs

- [cdp-helper-library-and-recursive-improvement-2026-05-18.md](cdp-helper-library-and-recursive-improvement-2026-05-18.md) - the CDP-specific instance of this rule
- [codify-at-the-moment-a-rule-is-stated-not-after.md](codify-at-the-moment-a-rule-is-stated-not-after.md) - the same-turn discipline this implements
- [context-surfacing-must-be-reliable-and-selective.md](context-surfacing-must-be-reliable-and-selective.md) - the 5-layer doctrine substrate template (triggers + grep + hook + cross-ref + Neo4j fallback)
- [verify-deployed-state-against-narrated-state.md](verify-deployed-state-against-narrated-state.md) - sister discipline: don't claim shipped without verifying every layer landed
- Auto-memory: `reference_cdp_helper_library_2026-05-18.md`

## Origin

Tate verbatim 2026-05-18 ~15:30 AEST, immediately after the CDP helper library shipped: "can you also make sure that the recursive learning results are actually being used in future consistently and are codified and surfaced in exactly the right moments so they're always perfectly effective AND that in future you will always recursively improve if possible."

The same arc that produced this rule produced its first instance (the CDP helper library + nudge hook + doctrine). The triad pattern was already implicit in the CDP arc; this file generalises it so future loops follow the same protocol on any substrate.
