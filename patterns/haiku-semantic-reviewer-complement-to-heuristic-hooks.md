---
triggers: haiku-reviewer, semantic-review, framing-miss, assumption-catcher, second-opinion-layer, hook-vs-reviewer, autonomy-assumption, frame-mismatch, scope-inversion-catch, doctrine-contradiction-catch, where-hooks-stop-haiku-starts, semantic-second-pass
---

# Heuristic hooks for keyword catches; Haiku-class semantic reviewer for framing/assumption catches

## The rule (both layers fire on every dispatch)

Every PreToolUse on `mcp__forks__spawn_fork` and `mcp__factory__start_cc_session` runs TWO classes of reviewer in parallel:

1. **Heuristic hooks** (`brief-consistency-check.sh`, `cred-mention-surface.sh`, `anthropic-first-check.sh`, `episode-resurface.sh`, `cowork-first-check.sh`) - fast bash + jq + grep against the brief text. Catch keyword/regex shape misses. Cheap (~ms), high recall on token-level patterns, blind to framing.
2. **Haiku-class semantic reviewer** (`haiku-semantic-review.sh`) - calls `claude-haiku-4-5` against a cached doctrine summary at `~/ecodiaos/scripts/hooks/lib/haiku-doctrine-summary.md`. Catches FRAMING and ASSUMPTION misses the heuristics cannot. Surfaces verdict as `[HAIKU-REVIEW PASS|WARN|BLOCK] <reason>` to stderr; injects `additionalContext` JSON only on WARN/BLOCK so PASS is silent.

Both are warn-only. Neither blocks dispatch. The two layers complement each other - one catches what the other misses.

## Where heuristic hooks suffice

Heuristic hooks are correct first-line defence when the violation is **shape-detectable**:

- Brief mentions `sshpass.*ssh.*macincloud` literal → `cred-mention-surface.sh` flags via regex.
- Brief contains `cu.*` and a web-SaaS URL → `cowork-first-check.sh` flags the bespoke-runtime-vs-web-SaaS mismatch.
- Brief mentions iOS/ASC/Bitbucket/Resend without a `~/ecodiaos/docs/secrets/` cross-ref → `cred-mention-surface.sh` flags.
- Brief mentions Anthropic-shipped capabilities while building parallel infrastructure → `anthropic-first-check.sh` flags.

These are keyword problems. A Haiku call is overkill - heuristics are 1000× cheaper and catch the exact same thing with zero false-negative on the literal pattern.

## Where Haiku catches what heuristic misses

Heuristic hooks fail silently when the violation is **frame-detectable**:

- A brief that **assumes Tate is sending it the work** when the conductor was self-composing in autonomy mode. All the keywords look right. The assumption is wrong. (rule 4 + 5)
- A brief that **structures a 4-stream pipeline as a single worker fork**, missing the manager-fork doctrine. The keyword `MANAGER:` is absent - heuristics have nothing to flag - but the WORK SHAPE is multi-worker. (rule 2)
- A brief that **pre-resolves file paths and pastes them into instructions**, framing the fork as a worker that needs a fully-specified work order rather than a context-identical clone. No keyword tells you "this is pre-probed". The PLAN reveals it. (rule 3)
- A brief that **proposes outbound to a client without naming a Tate go-ahead reference**. The string `"send to <client>"` may not appear; the recipient might be inferred from a CRM lookup the brief instructs the fork to do. Heuristics don't catch the inferred recipient. (rule 6)
- A brief that **reuses Co-Exist as the wedge product to a non-Kurt prospect**. The keyword "Co-Exist" appears; heuristics have nothing to flag because the keyword is not the violation. The CONTEXT (peak body / Landcare / NRM / council) makes Co-Exist-as-wedge wrong. (rule 7)
- A brief that **schedules a `pm2 restart ecodia-api` while a Factory queue is active**. Sequencing is the violation, not the literal command.

Haiku reading the brief against the cached doctrine summary catches these. Heuristics never will.

## Token economics

First call per cache window: ~2764 input tokens × Haiku 4.5 input rate ≈ $0.0022 + ~5-30 output tokens × output rate ≈ $0.0001. Total ~$0.0023.

Cached subsequent calls (5-min Anthropic cache TTL): cache_read at 0.1× the input rate. ~$0.0003 per dispatch.

Compare: a single Sonnet/Opus parent call burning through retries on a brief Haiku would have caught early ≈ $0.10-$1+. Haiku at $0.0003 per dispatch beats burning Sonnet on hook false positives 300× over. The reviewer pays for itself the first time it catches one framing-miss.

Daily upper bound: even 200 dispatches/day × $0.0023 (no caching) = $0.46/day. With caching across the workday, more like $0.05/day. Negligible against the ~$14k/week token budget.

## Worked example - the gap that motivated this layer (6 May 2026 09:50 AEST)

Earlier today, a fork brief on the GUI-macro discovery surface was framed as a **Tate-message-arrival problem**: it scoped the discovery hook to fire when Tate types a message that mentions a GUI target. The brief read coherently, all keywords were correct, every heuristic hook passed.

It missed the **autonomy-mode case**: the conductor frequently self-composes plans containing GUI-target keywords (e.g. "schedule a Vercel verify, then drive Stripe dashboard for the chargeback"). The hook the brief authored would silent-skip those self-composed cases entirely. Tate caught it conversationally; the heuristics never could.

That's the shape of failure this reviewer exists to catch. Haiku reading the brief against rule 1 (fork-by-default semantics) and rule 4 (autonomy doctrine) would have flagged: `WARN: brief assumes user-input arrival but conductor self-composes plans in autonomy mode (rule 4)`.

Tate, 6 May 2026 09:56 AEST verbatim: "haiku chat could be really good for picking up those semantic things that arent heuristic based".

## Architecture

- **Hook script:** `~/ecodiaos/scripts/hooks/haiku-semantic-review.sh` (PreToolUse, fires only on `mcp__forks__spawn_fork` and `mcp__factory__start_cc_session`, silent-exit on any non-200 / timeout / missing-cred so dispatch is never blocked by Anthropic outage).
- **Cached system prompt:** `~/ecodiaos/scripts/hooks/lib/haiku-doctrine-summary.md` (~1900 tokens, distils 14 doctrine rules into one-line each plus violation shapes; `cache_control: { type: "ephemeral" }` for 5-min TTL).
- **Token log:** `~/ecodiaos/logs/haiku-review-tokens.jsonl` (one line per call: timestamp, tool_name, input_tokens, output_tokens, cache_read, cache_creation, verdict, reason, cred_source). Lets future-me audit drift between heuristic-hook coverage and Haiku-flagged misses.
- **Wiring:** `~/.claude/settings.json` PreToolUse matcher block alongside the five existing heuristic hooks. 8-second timeout (5-second curl + buffer). Always exits 0.
- **Cred:** prefers `ANTHROPIC_API_KEY` env var; falls back to `CLAUDE_CODE_OAUTH_TOKEN_CODE` from `~/ecodiaos/.env` (the OAuth token authenticates against the Messages API via Bearer auth; verified live 6 May 2026 by `claude-haiku-4-5` returning the expected one-word verdict).

## Doctrine cross-refs

- `~/ecodiaos/CLAUDE.md` "Mechanical surfacing hooks" section - the heuristic-hook stack this reviewer joins.
- `~/ecodiaos/patterns/context-surfacing-must-be-reliable-and-selective.md` - the meta-doctrine on doctrine layering. This reviewer is layer 6 (semantic second-pass) on top of layers 1-5 (file-per-thing, triggers frontmatter, grep protocol, mechanical PreToolUse hooks, Neo4j fallback).
- `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md` - Haiku as the right Anthropic primitive (not building a parallel reviewer agent).
- `~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md` Layer 3 - applied-pattern-tag forcing function. This reviewer's verdict log feeds the same telemetry surface (catches that heuristics missed are a high-leverage signal of where the heuristic layer needs new hooks).

## Origin

6 May 2026 09:56 AEST. Tate verbatim, in conversation about the GUI-macro discovery surface fork brief that framed itself around user-message-arrival when autonomy mode also produces those plans:

> "haiku chat could be really good for picking up those semantic things that arent heuristic based"

Authored same-day per `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md`. Implementation by fork `fork_motaz0yr_a06a3a` ship: hook script + cached doctrine summary + settings.json wire + this pattern file + commit, single working session.
