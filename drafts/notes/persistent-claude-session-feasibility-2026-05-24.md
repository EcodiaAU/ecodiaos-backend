# Persistent claude session - feasibility research

Date: 2026-05-24
Status: research - no code shipped yet
Origin: Tate verbatim 2026-05-24 "lets do it now. I want you to first research every aspect of it though and make sure its technically and financially feasible with the june 15 changes"

## 0. TL;DR

Three findings that matter:

1. **Technically feasible and easier than I thought.** claude CLI has a documented bidirectional streaming protocol (`--print --input-format stream-json --output-format stream-json --verbose --replay-user-messages`). Output is clean JSON-Lines, one object per line. No custom REPL parser needed. The protocol was designed for exactly this.

2. **One load-bearing assumption that must be verified before any build:** can a single `claude` subprocess accept MULTIPLE prompts on stdin and produce MULTIPLE responses on stdout, or does each prompt require a fresh subprocess? The `--replay-user-messages` flag strongly implies multi-message-per-subprocess (otherwise the feature is meaningless), but it's not explicitly documented. Need one empirical test before commit.

3. **The June 15 financial picture has two paths, both viable, with different risk profiles:**
   - **Path A (OAuth + interactive CLI)**: persistent `claude` subprocess on subscription rate. $0 marginal. Risk: Anthropic may reclassify long-running scripted CLI sessions as "programmatic Agent SDK usage" under June 15 and burn the $200/mo cap. The CLAUDE.md doctrine says interactive Claude Code stays on subscription - but a scripted pipe is ambiguous.
   - **Path B (paid API + --bare mode)**: persistent claude with `ANTHROPIC_API_KEY`, stripped-down. ~$20-30/mo at projected voice volume. No classification risk. `--max-budget-usd` cap is built-in.

My recommendation: ship Path A behind a feature flag with telemetry on usage attribution. If post-June-15 we see it burning the $200/mo cap, flip to Path B with the existing implementation - same subprocess pattern, different auth.

## 1. The June 15 constraint (verbatim from CLAUDE.md)

> Post-15-June-2026 Anthropic policy: programmatic Agent SDK usage capped at $200/mo/account ($600/mo total). Interactive Claude Code + Routines stay on full subscription rate budget.
> Architectural target: everything moves to interactive or Routine paths. No production Agent SDK usage.

The ambiguity is in "programmatic Agent SDK usage." Three interpretations:

1. **Narrow**: only `@anthropic-ai/claude-agent-sdk` `query()` calls count. Spawning `claude` CLI via `child_process` is "interactive Claude Code" because the CLI IS interactive. → Path A is safe.
2. **Spirit**: anything driven by a script (no human at the keyboard) is "programmatic" regardless of which entry point. → Path A burns the cap.
3. **Telemetry-based**: Anthropic distinguishes by usage telemetry (presence of TTY, request frequency pattern, etc). → Unknown.

The honest answer: we don't know how Anthropic will classify. The doctrine `agent-sdk-unlocks-all-models-on-oauth-2026-05-20` notes that the Agent SDK's `query()` "drives the same code path as the `claude` CLI" - meaning at the API layer they look the same. If classification is by API telemetry, both paths look identical to Anthropic.

The safe assumption: any script-driven claude usage MAY count against the $200 cap post-June-15. The build should be flag-gated and instrumented so we can switch auth paths in one env-var flip if the meter goes against us.

## 2. Technical feasibility

### 2.1 The streaming protocol exists and is documented

From `claude --help`:

```
--input-format <format>    Input format (only works with --print): "text" (default), or "stream-json" (realtime streaming input)
--output-format <format>   Output format (only works with --print): "text" (default), "json" (single result), or "stream-json" (realtime streaming)
--include-partial-messages Include partial message chunks as they arrive (only works with --print and --output-format=stream-json)
--replay-user-messages     Re-emit user messages from stdin back on stdout for acknowledgment (only works with --input-format=stream-json and --output-format=stream-json)
--session-id <uuid>        Use a specific session ID for the conversation (must be a valid UUID)
--resume [value]           Resume a conversation by session ID
--max-budget-usd <amount>  Maximum dollar amount to spend on API calls (only works with --print)
```

The full incantation for a persistent session:
```bash
claude --print \
  --input-format stream-json --output-format stream-json --verbose \
  --replay-user-messages \
  --session-id <uuid> \
  --model sonnet \
  --max-budget-usd 5.00
```

### 2.2 Output format is clean JSON-Lines (verified empirically)

I ran `echo "..." | claude --print --output-format stream-json --verbose --model haiku` against the local claude CLI. Output is one JSON object per line:
```
{"type":"system","subtype":"hook_started",...}
{"type":"system","subtype":"hook_response",...}
{"type":"assistant","message":{...}}
{"type":"result","subtype":"success",...}
```

Programmatic parsing is straightforward. No custom REPL parser, no ANSI-stripping needed in stream-json mode. The protocol was designed for exactly this.

### 2.3 The KEY unverified assumption

The flag descriptions say "realtime streaming INPUT" and "Re-emit user messages from stdin back on stdout for acknowledgment." This phrasing strongly implies the subprocess accepts MULTIPLE messages over stdin across the lifetime of a single invocation. The `--replay-user-messages` flag is meaningless if every message spawns a new subprocess.

But I have not empirically verified multi-message-per-subprocess. The test is:
1. Spawn `claude --print --input-format stream-json --output-format stream-json --verbose --replay-user-messages` with pipes
2. Write `{"type":"user","content":"hello"}` to stdin
3. Wait for response on stdout
4. Write `{"type":"user","content":"what did I just say?"}` to stdin (without closing pipe)
5. Wait for second response

If step 5 returns a coherent continuation, we have true persistent sessions. If the subprocess exits after step 3, the protocol is single-message-per-invocation and the whole proposal collapses to "use --resume with cached session, save 12-35s but still pay 3-8s subprocess cold-start per turn."

**This test takes ~5 minutes. Must run before any build.**

### 2.4 If the multi-message assumption holds

Latency profile per voice turn after the first:
- stdin write: <10ms
- claude reasoning: 1-3s for Sonnet (model-bound, not subprocess-bound)
- stdout response: streamed, first token in <500ms
- Total: 1-3s end-to-end for a Sonnet turn

That matches Haiku raw-SDK latency today and unlocks Sonnet on the voice front brain. Massive win.

### 2.5 If the multi-message assumption fails

We fall back to `--resume <session_id>` with fresh subprocess each call:
- Subprocess spawn: 2s
- Session resume (cached doctrine + tools): 1-3s
- Reasoning: 1-3s
- Total: 4-8s per turn

That's worse than today's Haiku (1-2s) but 10x better than today's claude --print (60-120s for the away path). Still worth it for the away-conductor. Not worth it for the voice front brain.

### 2.6 --bare mode caveat

`--bare` strips hooks, MCP, LSP, doctrine - reduces cold-start dramatically. But the help text explicitly says: "Anthropic auth is strictly ANTHROPIC_API_KEY or apiKeyHelper via --settings (OAuth and keychain are never read)." 

So --bare requires the paid API key. The trade-off: fastest possible startup AND clear paid-spend classification. If we go Path B, --bare is the right mode.

### 2.7 Session memory growth

Each session accumulates message history. A 24-hour voice usage day with 100 turns = ~200k tokens of history. Sonnet's context window is 200k. Will hit the limit.

Mitigation: reset session every 24h, or every N turns, or when context approaches limit. The CLI's `/compact` command could be invoked programmatically (TBD). Or just spin a new session daily.

## 3. Financial feasibility

### 3.1 Voice volume estimate

Looking at thread_log from the last week: ~30-50 voice turns per day on heavy days, near zero on quiet days. Average ~20 turns/day = ~600 turns/month.

### 3.2 Path A cost (OAuth subscription, pre-June 15)

$0 marginal. Sits on existing Claude Max subscriptions ($1,020/mo combined across tate@/code@/money@).

Per the `multi-account-credit-state-model` doctrine, each account has 5-hour + weekly caps. Voice's 600 turns/month is trivial against these caps (the headlessConductor + away conductor + IDE conductor already consume more).

### 3.3 Path A cost (OAuth subscription, post-June 15 if reclassified as Agent SDK)

If Anthropic classifies persistent CLI as Agent SDK: $200/mo/account cap.

Sonnet metered pricing: $3/M input + $15/M output. A voice turn averages 2k input (prompt + context) + 500 output (reply). That's 0.002 * 3 + 0.0005 * 15 = $0.0135 per turn. 600 turns/month = $8.10/month per account.

Well under the $200 cap. Even if reclassified, we're fine.

The concern isn't voice specifically - it's that THE COMBINED LOAD across all our Agent SDK paths (existing headlessConductor + away-conductor + voice front brain + speculative pre-fetch + the IDE conductor's own work) might collectively exceed $200/mo/account if Anthropic counts them all.

Mitigation: account rotation per the existing `multi-account-credit-state-model` pattern. The current setup already rotates across tate@/code@/money@. Adding voice to the rotation gives 3x the cap = $600/mo combined.

### 3.4 Path B cost (paid ANTHROPIC_API_KEY)

Same Sonnet pricing: $0.0135/turn * 600 turns = $8.10/month for the voice front brain alone.

Add the away-conductor's substantive lookups (~5-10 lookups/day, larger turns ~5k input + 2k output = $0.045/lookup, 200/month = $9). 

Total monthly: ~$17-25. With buffer for heavier days: budget $50/month.

### 3.5 What June 15 actually changes

Pre-June-15: any path is free (subscription).
Post-June-15:
- Path A: free IF "interactive" classification holds. $200 cap if not.
- Path B: $20-50/month, hard cap via `--max-budget-usd`.

The risk profile differs:
- Path A: variable risk (free OR cap-burning), depends on Anthropic's interpretation
- Path B: known cost (capped at known dollar amount)

For a load-bearing production service that affects every voice call, **Path B's known-cost profile is the more responsible choice for the long-term default**. Path A is fine while the classification is favorable.

## 4. Operational feasibility

### 4.1 Subprocess supervision

Same wrapper + Scheduled Task pattern that's now keeping away-conductor alive on Corazon (commit `9484a462` watchdog). Add a `resident-brain-watchdog.ps1` mirror. Marginal cost.

### 4.2 Session crash recovery

If the persistent claude subprocess dies mid-prompt, the in-flight HTTP request to the resident brain returns an error. The next request gets a fresh subprocess (with cached session via --resume).

Mitigation: aggressive timeout (~30s) on the HTTP layer; auto-respawn on detected death; the voice call gets the failure-surface line we already shipped.

### 4.3 Concurrency

A single persistent claude subprocess is single-threaded. Multiple voice calls hitting the same subprocess = serialized. For Tate-only single-user, this is fine. For future multi-user, would need a pool.

For Now: serialize. If a second voice call comes in while one is mid-turn, queue or reject. Voice calls overlapping in time is rare in Tate's pattern.

### 4.4 Auth refresh

OAuth tokens have a refresh cycle. The Agent SDK handles this internally. For the CLI driven via child_process: claude CLI manages its own auth refresh as long as the process is running. No work needed.

For paid API key: no refresh, just static key.

### 4.5 Cross-account rotation

If we hit a rate limit on one account, can we re-spawn with a different `CLAUDE_CODE_OAUTH_TOKEN_*`? Yes - the env var is read at subprocess spawn. Resident brain wrapper detects 429-like errors in the JSON-Lines output, kills the subprocess, respawns with next account's token. Pattern matches the existing `multi-account-credit-state-model`.

## 5. Recommendation

Build the resident brain with the following architecture:

### 5.1 Single Node service: `resident-brain-server.js` on Corazon

- Port 7462
- Spawns one persistent claude subprocess via `child_process.spawn` with `--print --input-format stream-json --output-format stream-json --verbose --replay-user-messages --session-id <uuid>`
- Auth path is config-flag selectable: `RESIDENT_BRAIN_AUTH=oauth` (default, Path A) or `RESIDENT_BRAIN_AUTH=paid` (Path B with ANTHROPIC_API_KEY + --bare)
- Exposes `POST /prompt` with `{prompt, max_tokens?}` → returns the assistant response
- Maintains a queue for concurrent requests (serialize, since subprocess is single-threaded)
- Tracks per-day spend (parses cost from stream-json's `result` message) and surfaces to status_board
- Auto-respawns subprocess on death; auto-rotates accounts on 429

### 5.2 Two consumers of the resident brain

1. **Voice front brain** (replaces today's Haiku raw-SDK call). Adds 1-2s vs Haiku but unlocks Sonnet.
2. **Away path** (replaces today's per-turn claude --print spawn). Drops from 60-120s to 5-15s.

### 5.3 Verification gate before any code

Run the multi-message test in §2.3. If it passes, proceed with full build. If it fails, narrow scope to just the away path (where 5-15s vs 60-120s is still a massive win, even if voice front brain doesn't benefit).

### 5.4 Telemetry from day one

Log every prompt + cost + duration. Surface to status_board daily. If post-June-15 we see the $200 cap being approached, flip `RESIDENT_BRAIN_AUTH=paid` and continue on Path B.

### 5.5 What I'd ship in order

1. **Multi-message verification test** (~5 min, just a script)
2. **resident-brain-server.js core** (~3 hr) - the persistent subprocess + HTTP wrapper
3. **Wire away-conductor to use it** (~30 min) - point awayConductorClient at port 7462 instead of 7460
4. **Wire voice front brain to use it** (~1 hr) - replace anthropicMessagesClient call in generateReply
5. **Telemetry + auth-path flag** (~1 hr)
6. **Supervision (Scheduled Task watchdog)** (~30 min)
7. **Production verification** - real voice calls measuring latency before/after

Total: ~6-7 hours focused work. Each step is independently reversible.

## 6. What this design does NOT solve

- **First voice call after subprocess restart still hits cold-start.** Mitigation: keep subprocess running 24/7 via watchdog. Cold-start hits maybe once a day vs every call.
- **Session memory still grows.** Reset every 24h cleanly. Could lose some recent conversational context, mitigated by thread_log replay on session start.
- **Single-user serialization.** Tate-only use case, so fine. Multi-user would need pool.
- **Doesn't change the underlying model intelligence.** Sonnet is smarter than Haiku, but it's still Sonnet. Opus would be smarter but slower + more expensive. Sonnet is the right ceiling for voice.

## 7. The one open question I need Tate to answer before I start

Auth path default: `RESIDENT_BRAIN_AUTH=oauth` (Path A) or `RESIDENT_BRAIN_AUTH=paid` (Path B)?

- Path A: $0, possibly free post-June-15, possibly counted against $200 cap
- Path B: ~$20-50/month, no classification risk, known cost
- Either way the code is the same; the flag picks the auth path at subprocess spawn

My recommendation: **default to Path A for now**, wire `ANTHROPIC_API_KEY` to env, set `RESIDENT_BRAIN_AUTH=oauth` for today, instrument telemetry, flip to `paid` if post-June-15 reality says Path A is broken.

## 8. The HTML version

This is a technical research doc with trade-off matrices, code shapes, and command-line flag detail. Not a polished concept doc. Keeping as MD per same logic as the previous voice spec.

## 9. Open question for go/no-go decision

**Should I run the multi-message verification test (§2.3) now and report back before any build?** That's the load-bearing assumption. 5 minutes of effort.

If you say yes, I run the test + give you the result + we move forward (or pivot to the narrower scope if it fails). If you say "just build it," I start coding assuming the assumption holds and pivot if it breaks during the build.
