# Skill Acquisition - Claude Code Hooks Research

**Date:** 2026-05-19
**Author:** EcodiaOS conductor (research-only, no installs)
**Scope:** Survey the post-May-2026 Claude Code hook ecosystem, identify hooks/patterns that compound with the existing 22-hook stack at `C:/Users/tjdTa/.claude/hooks/`, and recommend ADOPT / SKIP / ADAPT for each.

The lens throughout: doctrine alone is aspirational, helper alone is invisible. The hooks worth adopting are the ones that surface the right rule at the right tool-dispatch moment, OR the ones that close a substrate gap we don't yet have (telemetry, provenance, deterministic enforcement that survives context-window compression).

---

## 1. Canonical hook event surface as of May 2026

Source: https://code.claude.com/docs/en/hooks (verified 2026-05-19).

The hook surface has GROWN substantially since the original PreToolUse/PostToolUse/Stop/SubagentStop/Notification/PreCompact/SessionStart set. Full current list:

| Event | Blocking? | Matcher? | Payload highlights | What I use today |
|---|---|---|---|---|
| `SessionStart` | No (context-only) | `startup\|resume\|clear\|compact` | `source`, `model` | `scope-context.py` |
| `Setup` | No | `init\|maintenance` | `trigger` | none |
| `UserPromptSubmit` | Yes (`decision: block`) | none | `prompt`, `permission_mode` | none |
| `UserPromptExpansion` | Yes | command name | `command_name`, `command_args`, `prompt` | none |
| `PreToolUse` | Yes (`permissionDecision: allow\|deny\|ask\|defer`) | tool name regex | `tool_name`, `tool_input`, `tool_use_id`, can `updatedInput` to MUTATE tool input | most of my stack |
| `PostToolUse` | Yes (`decision: block`) | tool name | `tool_name`, `tool_input`, `tool_result` | observer_signals, em-dash, post-action |
| `PostToolUseFailure` | Yes | tool name | `tool_name`, `tool_input`, `tool_error` | none |
| `PostToolBatch` | Yes | none | `tools[]` array | none |
| `Stop` | Yes (block keeps Claude going) | none | `permission_mode`, `effort` | none |
| `StopFailure` | No | `rate_limit\|authentication_failed\|...` | `error_type`, `error_message` | none |
| `PermissionRequest` | Yes (allow/deny + `permissionRules` save) | tool name | `tool_name`, `tool_input` | none |
| `PermissionDenied` | No (`retry: true`) | tool name | `tool_name`, `tool_input` | none |
| `Notification` | No | `permission_prompt\|idle_prompt\|auth_success\|elicitation_*` | `notification_type`, `message` | none |
| `SubagentStart` | No | agent type | `agent_type`, `agent_id` | none |
| `SubagentStop` | Yes | agent name | `agent_type`, `agent_id`, `effort` | none |
| `TaskCreated` / `TaskCompleted` | Yes (rolls back) | none | `task.task_id`, `task.title` | none |
| `TeammateIdle` | Yes (prevents idle) | none | none | none |
| `ConfigChange` | Yes (except policy) | `user_settings\|project_settings\|local_settings\|policy_settings\|skills` | `config_source` | none |
| `CwdChanged` | No | none | `old_cwd`, `new_cwd` + `CLAUDE_ENV_FILE` access | none |
| `FileChanged` | No | literal filenames | `file_path`, `change_type` | none |
| `PreCompact` / `PostCompact` | Yes (Pre) | `manual\|auto` | `trigger` | none |
| `SessionEnd` | No | `clear\|resume\|logout\|prompt_input_exit\|bypass_permissions_disabled\|other` | `reason` | none |
| `InstructionsLoaded` | No (observability) | `session_start\|nested_traversal\|path_glob_match\|include\|compact` | `file_path`, `memory_type`, `load_reason`, `globs`, `trigger_file_path`, `parent_file_path` | none |
| `Elicitation` / `ElicitationResult` | Yes | MCP server name | `server_name`, `form`, `response` | none |
| `WorktreeCreate` / `WorktreeRemove` | Yes | none | `parent_path`, `branch_name` -> must `echo` worktree path | none |

**Output contract** (any hook):

- Exit 0 + stdout JSON parsed for decision/context
- Exit 2 = blocking error, stderr fed back to Claude
- Other exit = non-blocking error, stderr in transcript
- Top-level fields available on most: `continue`, `stopReason`, `suppressOutput`, `systemMessage`, `terminalSequence`, `hookSpecificOutput.additionalContext`
- `hookSpecificOutput.permissionDecision` (PreToolUse only): `allow|deny|ask|defer`
- `hookSpecificOutput.updatedInput` (PreToolUse only): MUTATES the tool input before execution

**Handler types** beyond plain `command`: `http` (POST to URL), `mcp_tool` (invoke an MCP tool), `prompt` (call a fast model with templated prompt), `agent` (spawn a subagent).

**Path placeholders**: `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` (exported to hook process env too).

**Highest-leverage additions to my mental model**:

1. `PreToolUse` can MUTATE tool input via `updatedInput` -- I am not using this anywhere, and it is the substrate for "auto-correct the brief before it ships" / "rewrite this Bash command to use the helper".
2. `PostToolBatch` exists -- one hook fires once after a parallel batch resolves, useful for cost telemetry that should aggregate.
3. `InstructionsLoaded` observability hook -- I can finally KNOW when a CLAUDE.md / rules/*.md got loaded and which file triggered the nested traversal. This is a substrate I do not have today.
4. `CwdChanged` + `FileChanged` + `CLAUDE_ENV_FILE` -- reactive env management on `cd` and on `.env` change. Direnv-grade integration for free.
5. `prompt` and `agent` handler types -- run a Haiku fact-check or a CLI rule-check INSIDE the hook stack itself, not as a sidecar service. My current `haiku-semantic-review.py` could become a `prompt`-type hook with no Python.
6. `PermissionRequest` with `permissionRules` -- a hook can SAVE the allow-rule so the user is never prompted again. Closes the "fewer permission prompts" loop.

---

## 2. Community hook collections (canonical 4)

### 2.1 disler/claude-code-hooks-mastery

URL: https://github.com/disler/claude-code-hooks-mastery (~complete 13-event coverage)

| Hook | Event | Value prop | Vs my stack | Verdict |
|---|---|---|---|---|
| `user_prompt_submit.py` | UserPromptSubmit | Validate prompts before Claude sees them; can block dangerous prompts (exit 2) or inject session context | **Gap.** I have nothing on UserPromptSubmit. | ADOPT (adapt to fire pattern-surface + my session-orient inline) |
| `pre_tool_use.py` | PreToolUse | Block `rm -rf`, `chmod 777`, `>/etc/`, `.env` access via regex | Partial overlap with em-dash detector but I have NO destructive-command gate at all | ADAPT (regex stack ships free; add to my stack as `dangerous-bash-gate.sh`) |
| `post_tool_use.py` | PostToolUse | Append every tool call as JSON to `logs/chat.json`, convert JSONL transcript to readable JSON | I have `session_logger` but not transcript conversion or per-tool JSON log | ADAPT (my session_logger already covers, but the JSONL->JSON conversion is a nice replay primitive) |
| `notification.py` | Notification | TTS announcing input requests (30% chance includes engineer name) | I have nothing on Notification | SKIP (TTS is noise for the conductor; would compete with SMS) |
| `stop.py` | Stop | AI-generated completion message via TTS (OpenAI > Anthropic > Ollama priority) | I have nothing on Stop | SKIP for TTS; ADAPT the Stop event itself for plan-completion check (see 3.2) |
| `subagent_stop.py` | SubagentStop | TTS announcing subagent completion | none | SKIP |
| `pre_compact.py` | PreCompact | Back up transcript to disk before context compression | none | ADOPT (transcript provenance is cheap insurance and feeds the self-evolving memory pattern, see 3.4) |
| `session_start.py` | SessionStart | Load git status + recent issues + context files | I have `scope-context.py` | ADAPT (mine is good; their git-status injection is one cheap addition) |
| `session_end.py` | SessionEnd | Clean up temp files, stale logs | none | ADAPT (light cleanup + write Episode-summary candidate to disk for next session) |
| `permission_request.py` | PermissionRequest | Auto-allow read-only ops (Read, Glob, Grep, safe Bash) | none | ADOPT (this is the substrate behind /fewer-permission-prompts skill; deterministic, not memory) |
| `setup.py` | Setup | Inject `CLAUDE_ENV_FILE` env persistence at init | none | SKIP unless we restructure env management |
| Ruff + Type validators (PostToolUse) | PostToolUse | Block on lint/type errors after Python file edit | none on Python side (frontend has its own) | ADOPT for backend (ruff is fast, blocks the bug at write-time) |

**Source:** https://github.com/disler/claude-code-hooks-mastery

### 2.2 hesreallyhim/awesome-claude-code

URL: https://github.com/hesreallyhim/awesome-claude-code (44.2k stars, the canonical aggregator)

Site was mid-update during research and the hooks section did not extract cleanly via WebFetch. Recommendation: clone the repo and grep the README at a later session. The repo is the index, not source-of-truth for specific implementations.

### 2.3 rohitg00/awesome-claude-code-toolkit

URL: https://github.com/rohitg00/awesome-claude-code-toolkit (135 agents, 20 hooks)

Hooks mentioned by name (full handler code not extracted via WebFetch, would need clone):

| Hook | Event | Value prop | Verdict |
|---|---|---|---|
| `reporecall` | SessionStart | Inject project context in ~5ms before Claude thinks | ADAPT (my scope-context.py already does this; their 5ms bar is the SLO) |
| `claude-time` | UserPromptSubmit | Inject timing context + idle duration tracking | ADOPT (idle-duration is a missing perception input -- closes the "Tate has been quiet for 4h, his last direction was X" loop) |
| `obey` | PreToolUse + Stop | Active blocking + completion checklist enforcement | ADAPT (my `brief-consistency-check` does PreToolUse; Stop side is a gap) |
| `claude-agentic-coding-playbook` | PostToolUse | Audit tool calls, detect dangerous patterns | mostly overlaps existing |
| `claude-recap` | SessionEnd | Archive conversation topics as summaries | ADOPT (feeds the self-evolving memory pattern, see 3.4) |
| `claude-sounds` | Notification | 10 events, 21 sounds, random rotation | SKIP |
| `cortex` | SubagentStart | Inject context for spawned subagents | ADOPT (cdp/coord/fork dispatch context injection for workers I spawn) |
| Destructive command blocker | PreToolUse | Prevent destructive shell operations | covered by 2.1 |
| Branch guard | PreToolUse(Bash) | Protect against dangerous branch ops | ADOPT (see 3.1 below) |
| Syntax check | PostToolUse | Verify code syntax before commit | ADOPT for client-repo lanes |
| Context monitor | UserPromptSubmit / Stop | Monitor context window usage | ADOPT (telemetry input for the pulse-blocks substrate) |
| Permission auto-approver | PermissionRequest | Auto-grant safe ops | ADOPT (deterministic permission rules > my current memory-based) |
| Auto-save (`/cht`) | Stop | Crash-proof auto-save of conversation | overlaps session_logger |
| `tailtest` | PostToolUse | Detects changes, generates test scenarios, runs them | ADAPT (auto-test scoped to changed file, see 3.5) |
| `axme-code` background auditor | PostToolUse | Automatic knowledge extraction via background auditor | ADOPT (feeds memory-substrate-routing.py with extracted decisions/episodes) |
| `craft-statusline` | UserPromptSubmit | 5h/7d rate limit visibility | ADOPT for the multi-account economics surface |
| `cc-aws-keepalive` | various | Maintain sessions through credential expiry | n/a (we are not AWS-bound) |
| `notify` plugin git context | SessionStart | Extract repo + branch info | covered |
| `temporal-core` idle injector | UserPromptSubmit | Track conversation pause duration | overlaps `claude-time` |

**Source:** https://github.com/rohitg00/awesome-claude-code-toolkit

### 2.4 ComposioHQ/awesome-claude-plugins

URL: https://github.com/ComposioHQ/awesome-claude-plugins

Plugin-system aggregator; less hook-specific. Skipping deeper survey unless we go plugin-system.

---

## 3. Hook patterns worth ADOPTING (organised by gap)

### 3.1 Branch guard (PreToolUse:Bash) -- ADOPT

**Gap closed:** I have no deterministic gate against `git commit` / `git push` on `main` or `master`, despite CLAUDE.md saying "no client contact without Tate go-ahead" and "client-push-pre-submission-pipeline" doctrine. Doctrine alone fails under context-window compression.

**Pattern:**

```bash
# ~/.claude/hooks/ecodia/branch-guard.sh
# Matcher: Bash
COMMAND=$(jq -r '.tool_input.command')
CWD=$(jq -r '.cwd')

# Only enforce in client repos (skip my own monorepo)
if [[ "$CWD" == *"/EcodiaOS/"* ]]; then exit 0; fi

if echo "$COMMAND" | grep -qE 'git (commit|push).*(\bmain\b|\bmaster\b|--force|-f\b)'; then
  CURRENT_BRANCH=$(git -C "$CWD" branch --show-current 2>/dev/null)
  if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "master" ]]; then
    jq -n --arg b "$CURRENT_BRANCH" '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: ("Direct commit/push to " + $b + " blocked. Create a feature branch first. See pattern: client-push-pre-submission-pipeline + authorised-branch-push-is-not-client-contact.")
      }
    }'
    exit 0
  fi
fi
exit 0
```

**Why this closes the doctrine-aspirational gap:** PreToolUse is the only event that can block. Saying "no direct commits to main" in CLAUDE.md gets compressed; this hook fires regardless of context state.

**Cross-refs:** Boucle framework (https://framework.boucle.sh/), wangbooth/Claude-Code-Guardrails (https://github.com/wangbooth/Claude-Code-Guardrails), Camwest's gist (https://gist.github.com/camwest/7fb0f7bbedcdb205a62e0805bb2f7dce).

---

### 3.2 Plan-completion gate (Stop hook) -- ADOPT

**Gap closed:** I drop incomplete plans regularly. CLAUDE.md says "finish the pipeline" (feedback_finish_the_pipeline.md) but the Stop event fires before I check.

**Pattern:**

```bash
# ~/.claude/hooks/ecodia/plan-completion-gate.sh
# Matcher: none (fires on every Stop)
INPUT=$(cat)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')

# Anti-infinite-loop: if we already forced a continuation, allow stop
if [[ "$STOP_HOOK_ACTIVE" == "true" ]]; then exit 0; fi

# Read transcript, look for unchecked TodoWrite items
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path')
PENDING=$(tail -200 "$TRANSCRIPT" 2>/dev/null | jq -r 'select(.tool_name=="TodoWrite") | .tool_input.todos[] | select(.status=="pending" or .status=="in_progress") | .content' 2>/dev/null | head -5)

if [[ -n "$PENDING" ]]; then
  jq -n --arg p "$PENDING" '{
    decision: "block",
    reason: ("Plan incomplete. Pending todos:\n" + $p + "\n\nFinish the pipeline (feedback_finish_the_pipeline.md) before stopping. If genuinely blocked-on-external, mark todos as such and update status_board.")
  }'
fi
exit 0
```

**Why:** transforms "best effort" into "guaranteed completion" via deterministic enforcement. `stop_hook_active` flag breaks infinite loops.

**Cross-refs:** https://claudefa.st/blog/tools/hooks/stop-hook-task-enforcement, https://medium.com/coding-nexus/claude-code-stop-hook-force-task-completion-before-claude-stops-4ded76215d17.

---

### 3.3 Cost / token telemetry (UserPromptSubmit + PostToolBatch) -- ADAPT

**Gap closed:** I have cost-posture doctrine in CLAUDE.md ($1020/mo across 3 Max accounts; $200/mo Agent SDK cap post-June-2026) but no per-session telemetry. Currently relying on multi-account-credit-state-model.md for credit-state perception, which is reactive not proactive.

**Pattern (option A -- OpenTelemetry):**

Anthropic ships OpenTelemetry signals natively (per session cost, token counts, every tool call) -- enable via env var:

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

Point a local collector at it (Bindplane, VictoriaMetrics, ccusage, ccflare). This is the cheapest path -- no hook code required.

**Pattern (option B -- hook-based):**

```bash
# ~/.claude/hooks/ecodia/cost-telemetry.sh
# Matcher: none (PostToolBatch fires once per batch)
INPUT=$(cat)
SESSION=$(echo "$INPUT" | jq -r '.session_id')
TOOL_COUNT=$(echo "$INPUT" | jq -r '.tools | length')

# Append to a daily JSONL file
DATE=$(date +%Y-%m-%d)
LOG="$CLAUDE_PLUGIN_DATA/cost-telemetry-$DATE.jsonl"
mkdir -p "$(dirname "$LOG")"

echo "$INPUT" | jq -c --arg s "$SESSION" '{
  ts: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
  session_id: $s,
  tool_count: (.tools | length),
  tools: [.tools[] | .tool_name]
}' >> "$LOG"
exit 0
```

**Why:** PostToolBatch is the right granularity -- one record per parallel batch. Feeding the existing pulse-blocks substrate with a 24h rolling token-burn metric makes the conductor capacity-aware.

**Cross-refs:** Anthropic native telemetry docs (https://code.claude.com/docs/en/costs), ccusage/ccflare (https://claudefa.st/blog/tools/monitors/claude-code-usage-monitor), Bindplane (https://bindplane.com/blog/claude-code-opentelemetry-per-session-cost-and-token-tracking), tcude.net Grafana setup (https://tcude.net/how-i-monitor-my-claude-code-usage-with-grafana-opentelemetry-and-victoriametrics/).

**Verdict:** ADAPT -- use OpenTelemetry as the primary substrate (already wired by Anthropic), keep a thin hook for the substrate-bridging signal `kv_store.cowork.tokens.recent_burn`.

---

### 3.4 Self-evolving memory loop (Stop + PreCompact + SessionEnd) -- ADOPT (this is the big one)

**Gap closed:** Currently my memory-substrate-routing.py surfaces misroutes but does NOT proactively MINE the session for promotable insights. The MindStudio Obsidian pattern is exactly the "doctrine corpus is for evolution, weekly synthesis cadence" idea applied automatically.

**Pattern:**

1. **PreCompact hook** -- back up the transcript to `${CLAUDE_PLUGIN_DATA}/transcripts/<session>-<ts>.jsonl` BEFORE compaction destroys it.
2. **Stop hook** (or SessionEnd) -- spawn an analysis job that reads the transcript, sends it to Claude with a structured prompt: "extract Patterns, Mistakes, Decisions, Context as JSON". Write each to:
   - **Patterns** -> candidate file under `backend/patterns/_candidates/<slug>.md` with `triggers:` frontmatter; flag for human (me-as-conductor) review on the next turn.
   - **Mistakes** -> Episode candidate in Neo4j via memory-substrate-routing.py
   - **Decisions** -> Decision node in Neo4j
   - **Context** -> append to auto-memory at `C:/Users/tjdTa/.claude/projects/d---code-ecodiaos-backend/memory/`

3. **InstructionsLoaded hook** (observability) -- record which CLAUDE.md / pattern files actually loaded into each session. This is the missing telemetry that tells me which patterns are dead-weight vs load-bearing. Feeds the weekly `pattern-corpus-health-check` cron.

```bash
# ~/.claude/hooks/ecodia/transcript-mine.sh
# Matcher: SessionEnd (any reason)
INPUT=$(cat)
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path')
SESSION=$(echo "$INPUT" | jq -r '.session_id')

# Background the analysis -- do NOT block session-end
(
  CANDIDATES_DIR="$HOME/ecodiaos/backend/drafts/session-mining"
  mkdir -p "$CANDIDATES_DIR"

  # Send to a Haiku via the existing prompt-type handler or curl Anthropic API
  # Output a single JSON file with patterns/mistakes/decisions/context
  node "$HOME/ecodiaos/backend/laptop-daemons/transcript-mine.js" \
    --transcript "$TRANSCRIPT" \
    --session "$SESSION" \
    --out "$CANDIDATES_DIR/$SESSION.json" \
    >/dev/null 2>&1 &
) &
exit 0
```

**Why this closes the loop:** Today I write patterns when I notice a recurring failure during a session. The Stop-hook miner runs over EVERY session and surfaces candidates without depending on my in-session self-awareness. Combined with `InstructionsLoaded` telemetry, the weekly Sunday synthesis can finally answer "which doctrine files are pulling weight vs noise".

**Doctrine cross-refs:**
- `~/ecodiaos/backend/patterns/discovery-to-doctrine-same-turn.md` (extant)
- `~/ecodiaos/backend/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` (extant)
- `~/ecodiaos/backend/patterns/recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18.md` (extant; this hook IS the substrate)

**Cross-refs:** https://www.mindstudio.ai/blog/self-evolving-claude-code-memory-obsidian-hooks, https://docs.claude-mem.ai/hooks-architecture (claude-mem ships exactly this for personal memory).

**Verdict:** ADOPT, highest priority. This is the missing self-evolution loop.

---

### 3.5 Auto-test scoped to changed file (PostToolUse:Edit|Write) -- ADAPT per repo

**Gap closed:** None today on client repos. CLAUDE.md doctrine says "verify deployed state against narrated state" but I do not run tests at write-time.

**Pattern (TypeScript + Jest):**

```bash
# .claude/hooks/auto-test.sh   (PER CLIENT REPO, not global)
# Matcher: Edit|Write
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
[[ -z "$FILE" ]] && exit 0
[[ ! "$FILE" =~ \.(ts|tsx|js|jsx)$ ]] && exit 0

cd "$(dirname "$FILE")" || exit 0
# --findRelatedTests resolves only tests that import this file
npx jest --findRelatedTests "$FILE" --bail --silent 2>&1 | tail -20
exit $?
```

**Pattern (Python + ruff/pytest):**

```bash
# Matcher: Edit|Write
FILE=$(jq -r '.tool_input.file_path')
[[ ! "$FILE" =~ \.py$ ]] && exit 0
ruff check "$FILE" 2>&1 || exit 2   # block on lint failure
pytest -x --tb=short -q "$(dirname "$FILE")" 2>&1 | tail -20
```

**Verdict:** ADAPT -- ship to client repos (Co-Exist first), NOT global. The global stack should never run a project's tests because the toolchain varies. Per-repo `.claude/settings.json` is the right substrate.

**Cross-refs:** https://docs.bswen.com/blog/2026-03-23-claude-code-hooks-automatic-testing/, https://smartscope.blog/en/generative-ai/claude/claude-code-hooks-hands-on-implementation/.

---

### 3.6 Secret-scan PreToolUse:Write|Edit -- ADAPT

**Gap closed:** I have `cred-mention-surface.sh` but it WARNS, doesn't BLOCK. A leaked key landing in `backend/drafts/` or a client repo would still ship today.

**Pattern (lift from mintmcp/agent-security, adapt regex set):**

```bash
# ~/.claude/hooks/ecodia/secret-scan-write.sh
# Matcher: Write|Edit|MultiEdit
INPUT=$(cat)
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // .tool_input.new_string // ""')
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path')

# Skip the canonical secrets directory (intentional storage)
[[ "$FILE" == *"/docs/secrets/"* ]] && exit 0

# detect-secrets-style regex set
if echo "$CONTENT" | grep -qE '(sk-ant-[a-zA-Z0-9_-]{20,}|sk_live_[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|AIzaSy[a-zA-Z0-9_-]{30,}|xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+|ghp_[a-zA-Z0-9]{36}|eyJhbGciOiJIUzI1NiIs)'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Secret pattern detected in write content. Move the value to kv_store and reference it. See pattern: cred-rotation-must-propagate-to-all-consumers.md."
    }
  }'
fi
exit 0
```

**Why:** PreToolUse + `permissionDecision: "deny"` is the only way to BLOCK. cred-mention-surface stays as the warn layer; this becomes the deterministic block layer.

**Cross-refs:** https://github.com/mintmcp/agent-security (Apache-2.0, uses detect-secrets regex set), https://aitmpl.com/blog/security-hooks-secrets/, https://scottspence.com/posts/nopeek-keep-secrets-out-of-claude-code (nopeek).

**Verdict:** ADAPT (cherry-pick the regex set from detect-secrets, keep the rest of my cred-mention substrate).

---

### 3.7 PreToolUse input MUTATION (the most underused primitive) -- ADOPT

**Gap closed:** `hookSpecificOutput.updatedInput` lets a PreToolUse hook REWRITE the tool input before execution. I am not using this anywhere. It is the substrate for "auto-route this to the helper", "expand this brief shorthand", "inject the canonical path before a Read".

**Example use cases against my existing doctrine:**

1. **CDP helper injection.** When the brief contains a hand-rolled `cdp.runJs '... click() ...'`, the PreToolUse hook detects the pattern and REWRITES to `cdp.realClick(...)` or `cdp.clickByTag(...)` automatically. Closes the "doctrine alone is aspirational" gap from `cdp_helper_nudge.py` (which only NUDGES today).
2. **Conductor-driven restart auto-route.** When a fork issues `mcp__vps__pm2_restart ecodia-api`, PreToolUse hook detects in a fork context, REWRITES to a HTTP call against `/api/os-session/request-restart` and adds `additionalContext` explaining the conductor-coordinates rule.
3. **Brief expansion.** When a fork brief mentions a client by slug, PreToolUse hook prepends `~/ecodiaos/backend/clients/<slug>.md` content as `additionalContext`.

**Pattern shell:**

```bash
# Hook returns updated input
jq -n --arg new_cmd "$REWRITTEN" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    updatedInput: { command: $new_cmd },
    additionalContext: "Rewrote to use cdp.realClick helper (see cdp-helper-library-and-recursive-improvement-2026-05-18.md)."
  }
}'
```

**Verdict:** ADOPT, second-highest priority after 3.4. Convert at least three of my NUDGE-only hooks (`cdp_helper_nudge`, `gui-macro-discovery-surface`, `router-skip-check`) to MUTATING hooks where the rewrite is unambiguous.

---

### 3.8 File-write provenance / audit (PostToolUse:Write|Edit) -- ADOPT

**Gap closed:** I have `session_logger` but not a per-file provenance map. When I look at a file 6 months later, I cannot answer "which session wrote this, was it a fork, what was the brief?"

**Pattern:**

```bash
# ~/.claude/hooks/ecodia/file-provenance.sh
# Matcher: Write|Edit|MultiEdit
INPUT=$(cat)
SESSION=$(echo "$INPUT" | jq -r '.session_id')
AGENT_TYPE=$(echo "$INPUT" | jq -r '.agent_type // "main"')
AGENT_ID=$(echo "$INPUT" | jq -r '.agent_id // empty')
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path')
TOOL=$(echo "$INPUT" | jq -r '.tool_name')

PROVENANCE_DIR="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugin-data}/file-provenance"
mkdir -p "$PROVENANCE_DIR"

jq -n -c \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg s "$SESSION" \
  --arg at "$AGENT_TYPE" \
  --arg aid "$AGENT_ID" \
  --arg f "$FILE" \
  --arg t "$TOOL" \
  '{ts: $ts, session_id: $s, agent_type: $at, agent_id: $aid, file: $f, tool: $t}' \
  >> "$PROVENANCE_DIR/$(date +%Y-%m).jsonl"
exit 0
```

**Why:** monthly JSONL files = grep-able provenance trail. `agent_type` (Explore/Plan/custom) + `agent_id` finally gives me sub-agent attribution. Closes the "which fork shipped this" question after the fact.

**Verdict:** ADOPT.

---

### 3.9 Permission auto-approver (PermissionRequest) -- ADOPT

**Gap closed:** `/fewer-permission-prompts` skill exists but is reactive. A PermissionRequest hook can DETERMINISTICALLY auto-allow Read/Glob/Grep/safe-Bash and even SAVE the rule via `permissionRules`.

**Pattern:**

```bash
# ~/.claude/hooks/ecodia/permission-auto-allow.sh
# Matcher: tool name (e.g. Read|Glob|Grep) OR Bash
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name')
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

case "$TOOL" in
  Read|Glob|Grep)
    jq -n '{hookSpecificOutput: {hookEventName: "PermissionRequest", decision: {behavior: "allow"}}}'
    exit 0 ;;
  Bash)
    # Allowlist of cheap read-only Bash patterns
    if echo "$CMD" | grep -qE '^(ls|cat|head|tail|wc|file|stat|pwd|whoami|date|hostname|git (status|log|diff|branch --show-current|remote -v|show -s))($|\s)'; then
      jq -n '{hookSpecificOutput: {hookEventName: "PermissionRequest", decision: {behavior: "allow", permissionRules: [{rule: "Bash(git status:*)", apply: true}]}}}'
      exit 0
    fi ;;
esac
exit 0
```

**Verdict:** ADOPT -- this is the deterministic substrate the `/fewer-permission-prompts` skill should DELEGATE to instead of editing settings.json each time.

---

### 3.10 InstructionsLoaded observability -- ADOPT (cheap, high-leverage telemetry)

**Gap closed:** I have NO visibility into which patterns/CLAUDE.md sections actually load into a given session. The weekly `pattern-corpus-health-check` cron currently classifies based on `[NOT-APPLIED]` rates from chat, which is a downstream proxy.

**Pattern:**

```bash
# ~/.claude/hooks/ecodia/instructions-loaded-log.sh
# No matcher (fires on every load)
INPUT=$(cat)
LOG="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugin-data}/instructions-loaded-$(date +%Y-%m).jsonl"
mkdir -p "$(dirname "$LOG")"
echo "$INPUT" | jq -c '{
  ts: (now | strftime("%Y-%m-%dT%H:%M:%SZ")),
  session_id: .session_id,
  file_path: .file_path,
  memory_type: .memory_type,
  load_reason: .load_reason,
  trigger_file_path: .trigger_file_path
}' >> "$LOG"
exit 0
```

**Why:** the pattern-corpus-health-check cron can finally answer "this pattern file is in the corpus but has NEVER loaded into a real session in 30 days". That is the actual archive-candidate signal.

**Verdict:** ADOPT.

---

## 4. Hooks to SKIP

| Hook idea | Why skip |
|---|---|
| TTS on Stop/Notification/SubagentStop | Adds audio noise; competes with my SMS-to-Tate channel. Tate's attention surface is SMS + IDE + Claude mobile, not TTS. |
| Sound notifications (`claude-sounds`) | Same as above. |
| Setup hook for `CLAUDE_ENV_FILE` env persistence | Our env model is kv_store + ecosystem.config.js; this adds drift. |
| Sound notification packs | Noise without signal. |
| Auto-test as a GLOBAL hook | Toolchain varies per repo; per-repo `.claude/settings.json` is right. |
| `cc-aws-keepalive` | Not AWS-bound. |
| Webhook bridges (Hookdeck, claude-hub for GitHub PR triage) | Useful but cleaner as a Routine on `code@`, not as a local hook. Cloud-side primitives belong in the routines/ tree. |

---

## 5. Integration-hook landscape (GitHub PRs / Vercel / Sentry / Supabase Edge / Stripe)

Brief survey -- these are mostly CLOUD-side substrates, not local hooks. Treat as Routine candidates rather than `~/.claude/hooks/`.

| Source | Substrate | Recommendation |
|---|---|---|
| **GitHub PR webhook -> Claude Code** | https://github.com/claude-did-this/claude-hub (webhook service connecting GitHub PRs to Claude via @-mentions) | The on-VPS `webhook-fire-shim` -> Routine pattern we already have (factory-cloud, inbound-email-handler) is the right architecture. Adapt the claude-hub signature-verification approach. NOT a local hook. |
| **Vercel deploy webhook** | https://vercel.com/docs/deploy-hooks (POST to project-specific URL) + existing `vercel-deploy-monitor` Routine | Already covered by Routine. Add Vercel deploy hook signal to `kv_store.cowork.deploy.recent` for context injection. |
| **Stripe webhook** | https://github.com/hookdeck/webhook-skills (Stripe + Shopify + GitHub event handling skill) | Already covered by `stripe-event-handler` API-triggered Routine. The webhook-skills SKILL.md may be worth lifting verbatim for stripe-signature verification doctrine. |
| **Sentry errors** | No native hook; need polling or Sentry webhook -> /fire shim | Build as a Routine if/when we wire Sentry. Not a hook gap. |
| **Supabase Edge Function events** | Same -- webhook -> Routine | Already in the edge-function-safe-defaults pattern. |

**Verdict:** SKIP integration hooks at the local-hook layer. The architectural answer is already Routines + webhook-fire-shims on the VPS.

---

## 6. Top-5 ADOPT priority list (action plan)

In order of expected leverage:

1. **Self-evolving memory loop** (PreCompact + SessionEnd transcript miner -> Pattern/Decision/Episode candidates + InstructionsLoaded telemetry). Closes the doctrine-evolution loop that today depends on my in-session self-awareness. ~2-3h to ship.
2. **PreToolUse input MUTATION** (rewrite `cdp_helper_nudge`, `gui-macro-discovery-surface`, `router-skip-check` from NUDGE to MUTATE where the rewrite is unambiguous). Closes the "doctrine alone is aspirational" gap structurally. ~1h per hook.
3. **Plan-completion gate (Stop hook)** with TodoWrite-scanning + `stop_hook_active` anti-loop. Deterministically enforces "finish the pipeline". ~30min to ship.
4. **Branch guard + secret-scan (PreToolUse:Bash, PreToolUse:Write|Edit) as BLOCKING layer** on top of the existing WARN-only cred-mention. ~1h to ship.
5. **OpenTelemetry telemetry pipeline + InstructionsLoaded logger + file-provenance logger** as the observability substrate that makes everything else measurable. ~2h end-to-end.

Everything else (auto-test per-repo, permission auto-approver, session-end cleanup, Cortex subagent context, claude-recap summarization) is incremental polish.

---

## 7. Doctrine to author SAME-TURN if I ship any of the above

Per `recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18.md` the triad ships together. For each hook above:

- **Helper** = the hook script itself under `~/.claude/hooks/ecodia/<name>.sh`
- **Surfacing** = the hook IS the surface (PreToolUse / PostToolUse / Stop fires at the moment the anti-pattern would recur)
- **Doctrine** = a new file under `backend/patterns/hook-*-<date>.md` with `triggers:` frontmatter cross-referencing the existing pattern it deterministically enforces (e.g. `hook-blocks-direct-main-commit-2026-05-19.md` cross-refs `authorised-branch-push-is-not-client-contact.md` and `client-push-pre-submission-pipeline.md`).

Plus CLAUDE.md bullet under "Operating doctrine - load-bearing rules" naming each new hook by file path.

---

## Sources (key)

- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks) -- canonical event surface, May 2026
- [disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) -- 13-event reference implementation
- [rohitg00/awesome-claude-code-toolkit](https://github.com/rohitg00/awesome-claude-code-toolkit) -- 20 hooks across plugins
- [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) -- canonical aggregator
- [mintmcp/agent-security](https://github.com/mintmcp/agent-security) -- secret-scan hooks
- [wangbooth/Claude-Code-Guardrails](https://github.com/wangbooth/Claude-Code-Guardrails) -- branch-guard + checkpoint
- [Boucle framework](https://framework.boucle.sh/) -- file-guard + branch-guard
- [Camwest branch-protection gist](https://gist.github.com/camwest/7fb0f7bbedcdb205a62e0805bb2f7dce)
- [Pixelmojo CI/CD hooks](https://www.pixelmojo.io/blogs/claude-code-hooks-production-quality-ci-cd-patterns)
- [Paddo guardrails](https://paddo.dev/blog/claude-code-hooks-guardrails/)
- [MindStudio self-evolving memory + Obsidian](https://www.mindstudio.ai/blog/self-evolving-claude-code-memory-obsidian-hooks)
- [claude-mem docs](https://docs.claude-mem.ai/hooks-architecture)
- [LaunchDarkly session-start hook](https://github.com/launchdarkly-labs/claude-code-session-start-hook)
- [claudefa.st 12 lifecycle events](https://claudefa.st/blog/tools/hooks/hooks-guide)
- [claudefa.st Stop hook task enforcement](https://claudefa.st/blog/tools/hooks/stop-hook-task-enforcement)
- [Anthropic cost docs](https://code.claude.com/docs/en/costs)
- [Bindplane per-session OTel](https://bindplane.com/blog/claude-code-opentelemetry-per-session-cost-and-token-tracking)
- [Hookdeck webhook-skills](https://github.com/hookdeck/webhook-skills)
- [claude-did-this/claude-hub](https://github.com/claude-did-this/claude-hub)
- [Vercel deploy hooks](https://vercel.com/docs/deploy-hooks)
- [SmartScope auto-test hook hands-on](https://smartscope.blog/en/generative-ai/claude/claude-code-hooks-hands-on-implementation/)
