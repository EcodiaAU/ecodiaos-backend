---
triggers: hook-fires-on-own-output, applied-tag-false-positive, not-applied-tag, strip-tag-lines, keyword-hook-self-trigger, forcing-function-output-loop, context-surface-warn, cred-surface-warn, brief-check-warn, forcing-warn, hook-recursion, surfacing-hook-noise, tag-line-filter, hook-matcher-self-match, applied-pattern-tags
binding: helper=backend/scripts/hooks/lib/strip-tag-lines.sh
---
# Hooks must not fire inside [APPLIED] / [NOT-APPLIED] tag lines

## 1. The rule

Every keyword-scanning hook must strip lines that begin with a forcing-function tag before it runs its keyword regex. The tag families to strip include `[APPLIED]`, `[NOT-APPLIED]`, `[BRIEF-CHECK WARN]`, `[CONTEXT-SURFACE WARN/PRIMARY/ALSO]`, `[CRED-SURFACE WARN]`, `[FORCING WARN]`, and any sibling surfacing-output prefix. A hook that scans its own surfaced output (or another hook's surfaced output) fires on the very text the forcing function emitted, producing a false positive that looks like a real signal. Filter tag lines first, then scan the remainder.

## 2. Why

On 29 Apr 2026 between 21:00 and 21:12 AEST, `cred-mention-surface.sh` produced 6+ false positives in twelve minutes because it scanned lines that earlier hooks had already emitted as `[CRED-SURFACE WARN]` output. The hook matched the word it had just printed, re-surfaced, and the loop compounded. A surfacing hook that fires on its own output is worse than no hook: it trains the reader to ignore the channel, which defeats every other hook that shares it. The shared remedy is a single helper, `backend/scripts/hooks/lib/strip-tag-lines.sh`, that every keyword hook sources before scanning.

## 3. How to apply

1. Before any keyword regex in a hook, pipe the candidate text through `strip-tag-lines.sh` (or inline the same `grep -v` of the tag-prefix set).
2. Treat the tag-prefix set as a deny-list that grows: when a new surfacing prefix is added anywhere in the hook stack, add it to the shared helper in the same edit.
3. When authoring a new keyword-scanning hook, source the helper as the first step of the body, never as an afterthought.
4. When a hook starts firing in bursts within a single turn, suspect self-trigger on surfaced output before suspecting a genuine signal.
5. Keep the filter centralised in one helper so a new tag family is added once, not per hook.

## 4. Anti-patterns

- Do not run a keyword regex over raw turn text that may contain surfaced hook output.
- Do not copy the tag-prefix list into each hook by hand; they drift and a missed prefix re-opens the false-positive class.
- Do not treat a burst of identical hook fires inside one turn as N real signals; it is almost always one self-trigger loop.
- Do not add a new surfacing prefix without adding it to `strip-tag-lines.sh` in the same commit.

## 5. Origin

29 Apr 2026: `cred-mention-surface.sh` self-triggered 6+ times in twelve minutes by scanning `[CRED-SURFACE WARN]` lines it had emitted. Shared helper `backend/scripts/hooks/lib/strip-tag-lines.sh`. Cross-refs: [[surfacing-hook-silent-death-walk-perf-and-path-filter]], [[hook-matchers-must-discriminate-by-call-site-not-keyword-2026-06-09]], [[prefer-hooks-over-written-discipline]].
