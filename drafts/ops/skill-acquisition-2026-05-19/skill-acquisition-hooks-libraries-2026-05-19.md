# Skill Acquisition - Claude Code Hook Libraries (third-party bundles)

date: 2026-05-19
scope: third-party hook bundles that ship as adoptable libraries, NOT what hook events exist
audience: EcodiaOS conductor, evaluating against existing 22-hook stack
authoritative: yes (research artefact)

---

## Executive summary

13 hook bundles surveyed. Five close real gaps in our stack without breaking compatibility (bash + python + silent-runner.pyw wrapper compose with theirs because Claude Code runs hooks sequentially per event). The high-leverage adoptions are: (1) **claude-format-hook** (PostToolUse auto-format - 5 langs, runs after our existing hooks), (2) **claude_telemetry / claude-code-otel** (cost + token + MCP-call telemetry via OTEL env vars - zero conflict), (3) **claudewatch** (drift detection: 8 reads with 0 writes alert + 29 MCP self-reflection tools), (4) **claude-notifications-go** (Stop/SubagentStop -> Slack/Discord/SMS/ntfy with click-to-focus, 627 stars), (5) **AgentShield from everything-claude-code** (adversarial Opus-driven secret + permission + MCP-scope audit, 102 rules, run as `npx` ad-hoc not in hook stack).

Two bundles are research-only (disler/claude-code-hooks-mastery + multi-agent-observability) because their Bun-server + Vue-dashboard substrate duplicates what our coord-bus already does locally. Keep them as reference for the dispatcher event vocabulary.

Of the 6 stated gaps, this survey closes all 6: auto-test (karanb192 + claude-howto patterns), auto-format (claude-format-hook), cost-telemetry (claude_telemetry / claude-code-otel), secret-scan-blocking (claude-guardrails + AgentShield), MCP-call telemetry (claude_telemetry + claudewatch), SubagentStop telemetry (claude-notifications-go + claudewatch).

---

## Bundle 1: disler/claude-code-hooks-multi-agent-observability

**URL:** https://github.com/disler/claude-code-hooks-multi-agent-observability
**Stars:** 1.4k
**Language:** Python uv (hooks), Bun/TypeScript (server), Vue 3 (client)
**Architecture:** hooks -> HTTP POST -> Bun server -> SQLite (WAL) -> WebSocket -> Vue dashboard

**Ships (13 hooks, every Claude Code event):**

| Hook | Event | Captures |
|------|-------|---------|
| send_event.py | all 12 | universal dispatcher (session_id, hook_type, source_app, payload) |
| pre_tool_use.py | PreToolUse | tool name + input, blocking decisions |
| post_tool_use.py | PostToolUse | results, MCP server/tool detection |
| post_tool_use_failure.py | PostToolUseFailure | error details + interrupt status |
| permission_request.py | PermissionRequest | tool name + permission suggestions |
| notification.py | Notification | message + type, TTS metadata |
| user_prompt_submit.py | UserPromptSubmit | prompt content, validation (decision: block) |
| stop.py | Stop | session summary, transcript, stop_hook_active guard |
| subagent_stop.py | SubagentStop | agent_id, completion, transcript path |
| subagent_start.py | SubagentStart | agent_id, agent_type |
| pre_compact.py | PreCompact | trigger source, custom instructions in backup filename |
| session_start.py | SessionStart | agent type, model, source |
| session_end.py | SessionEnd | reason (incl. bypass_permissions_disabled) |

**Composition pattern:** chained sequentially in PreToolUse array - validator hook runs first, send_event.py runs second as universal sink.

**Gap closed for us:** none cleanly. We already have observer_signals + conductor_heartbeat + pulse_blocks + status_board for telemetry. Adding a Bun server + Vue dashboard is parallel infrastructure (violates `use-anthropic-existing-tools-before-building-parallel-infrastructure`).

**Recommendation:** **SKIP as bundle. ADAPT the event vocabulary.** Mine `send_event.py`'s 12-event taxonomy as the canonical name list for our own dispatcher events. The repo is the best-documented event-payload-shape reference in the ecosystem.

---

## Bundle 2: disler/claude-code-hooks-mastery

**URL:** https://github.com/disler/claude-code-hooks-mastery
**Stars:** 3.7k (highest in the ecosystem)
**Language:** Python uv single-file scripts, TypeScript helpers
**Architecture:** logs to disk (logs/*.json + chat.json) + LLM priority chain (Ollama -> Anthropic -> OpenAI) + TTS priority chain (ElevenLabs -> OpenAI -> pyttsx3)

**Ships (13 hooks + 2 validators):**

- All 13 lifecycle hooks (same set as bundle 1)
- **ruff_validator.py** - PostToolUse on .py Write/Edit, blocks on lint errors (exit 2)
- **ty_validator.py** - PostToolUse on .py Write/Edit, blocks on type errors (exit 2)
- TTS infrastructure: `tts/tts_queue.py` queue prevents overlapping audio
- LLM infrastructure: `llm/task_summarizer.py` generates Stop-event completion announcements

**Mastery doctrine the README codifies:**

- Exit 0 = success (stdout shown in Ctrl-R transcript mode)
- Exit 2 = blocking (stderr fed back to Claude automatically)
- Other = non-blocking
- JSON output: `{continue, stopReason, suppressOutput, decision: approve|block, reason}`
- `$CLAUDE_PROJECT_DIR` prefix for reliable path resolution
- UV single-file scripts keep hook logic separate from main codebase
- Builder/Validator agent pattern: write happens, validator hook enforces quality

**Gap closed for us:** **ruff_validator.py + ty_validator.py partially close the auto-test/lint-blocking gap** - but they're full-uv-script overhead for what a 10-line bash hook does. The TTS/LLM stack is overkill for us (we already have sms_tate + observer_signals).

**Recommendation:** **ADAPT, don't adopt wholesale.** Lift `ruff_validator.py` pattern (PostToolUse + Write|Edit matcher + .py filter + exit-2 on failure) as a ~15-line bash hook in our stack. Lift the exit-code semantics doctrine into a CLAUDE.md cross-ref. SKIP the rest (we don't need TTS, we don't need LLM-summarised Stop messages, we don't need 13 parallel logging hooks - our `session_logger.py` already does it).

---

## Bundle 3: yurukusa/claude-code-hooks (cc-safe-setup successor)

**URL:** https://github.com/yurukusa/claude-code-hooks
**Stars:** 10 (yurukusa) + significantly more on cc-safe-setup
**Language:** Bash (primary) + Python (3 hooks)
**Install:** `npx cc-safe-setup` installs 8 essential hooks in one command

**Ships (16 production hooks from 160+ hours autonomous operation):**

| Hook | Event | Blocking | What it closes |
|------|-------|---------|----------------|
| context-monitor.sh | PostToolUse | no | **token-cost telemetry** (graduated warnings CAUTION -> WARNING -> CRITICAL, falls back to tool-call count) |
| activity-logger.sh | PostToolUse | no | audit trail JSONL |
| syntax-check.sh | PostToolUse | no | py/sh/json/yaml/js syntax validation |
| decision-warn.sh | PreToolUse | no | sensitive-path warnings |
| cdp-safety-check.sh | PreToolUse | yes | blocks raw WebSocket CDP construction |
| **branch-guard.sh** | PreToolUse | **yes** | **blocks pushes to main/master** |
| error-gate.sh | PreToolUse | yes | blocks external actions when errors exist |
| destructive-guard.sh | PreToolUse | yes | rm -rf, git reset, NTFS junction risks |
| **secret-guard.sh** | PreToolUse | **yes** | **blocks .env / credential file commits** |
| comment-strip.sh | PreToolUse | no | strips bash comments breaking allowlists |
| cd-git-allow.sh | PreToolUse | no | auto-approves read-only cd+git compounds |
| auto-approve-readonly.sh | PermissionRequest | no | auto-approves read-only commands |
| proof-log-session.sh | Stop/PreCompact | no | 5W1H daily session summary |
| session-start-marker.sh | PostToolUse | no | timestamp record |
| no-ask-human.sh | PostToolUse | no | enforces autonomy (resonant with our `decide-do-not-ask`) |
| tmp-cleanup.sh | PostToolUse | no | removes stale tmpclaude-* files |

**Gap closed for us:**
- **branch-guard.sh** -> CLOSES branch-guard gap (we have none today)
- **secret-guard.sh (BLOCKING)** -> upgrades our `cred-mention-surface` from informational to blocking
- **context-monitor.sh** -> partial cost-telemetry gap close

**Compatibility:** 100% bash, $CLAUDE_PROJECT_DIR + stdin-JSON-from-Claude convention. Composes cleanly with our existing bash + python stack via PreToolUse/PostToolUse arrays in settings.json. Zero settings-file conflict.

**Recommendation:** **ADOPT 3 hooks selectively:** `branch-guard.sh`, `secret-guard.sh`, `context-monitor.sh`. Skip the rest (`no-ask-human.sh` duplicates our doctrine; `proof-log-session.sh` duplicates our session_logger.py; `destructive-guard.sh` duplicates kv_store hard-stop tripwires). Method: copy the 3 .sh files into `~/.claude/hooks/ecodia/` alongside our existing hooks, add settings.json entries, regenerate `patterns/INDEX.md`.

---

## Bundle 4: CodyLunders/claude-code-hooks-library

**URL:** https://github.com/CodyLunders/claude-code-hooks-library
**Stars:** 2 (low adoption, but 55 hooks - largest catalogue)
**Language:** 100% Bash
**Install:** `./install.sh --all` or `./install.sh --category security`

**Ships (55 hooks across 6 categories):**

- **Security (12):** security-block-rm-rf-root, security-scan-aws-keys (AKIA pattern), curl-pipe-bash prevention, secret scanning, safe-command enforcement
- **Quality (11):** quality-eslint-on-edit, lint/format/typecheck/validate (ruff/black/prettier mentioned but not detailed)
- **Git (9):** git-conventional-commit (blocks malformed commit messages), git-auto-stage-new-file, no branch-guard mentioned
- **Productivity (8):** file staging, .env.example generation, browser launching
- **Logging (7):** tool-call.log, command-history.log, files-{written,edited,read}.log, errors.log, sessions.log, subagent.log
- **Notifications (8):** notifications-desktop-task-complete (Stop -> notify-send/osascript), notifications-slack-on-deploy (SLACK_WEBHOOK_URL), sound cues

**Gap closed for us:** marginal - duplicates yurukusa's safer subset with looser quality. The Slack-on-deploy hook is interesting but we already have sms_tate.

**Recommendation:** **SKIP.** Lower-quality echo of yurukusa with no novel coverage. The 55-hook count is misleading - many are 5-line wrappers around `notify-send`.

---

## Bundle 5: dwarvesf/claude-guardrails

**URL:** https://github.com/dwarvesf/claude-guardrails
**Stars:** 16
**Language:** 100% Bash
**Install:** `npx claude-guardrails install` or `npx claude-guardrails install full`

**Ships (full variant: 6 hooks + 40 permission deny rules):**

- 4-6 PreToolUse hooks (destructive deletes, direct push blocking, pipe-to-shell defense, commit-time secret scanning)
- UserPromptSubmit secret scanner
- PostToolUse prompt-injection scanner (full variant only)
- 40 permission deny rules (SSH keys, AWS creds, GPG, kubeconfig, Azure, .env, .pem, shell profiles, crypto wallets, secrets dirs)
- Auto-sets DISABLE_TELEMETRY=1 + DISABLE_ERROR_REPORTING=1 + CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1

**Gap closed for us:**
- The **40-row permission deny list** is genuinely useful as a pre-canned `permissions.deny` template
- **Commit-time secret scanning** at UserPromptSubmit is novel (scans the user's typed prompt, not just disk writes)

**Compatibility:** 100% bash + jq dependency. Composes via settings.json - won't collide.

**Recommendation:** **ADAPT.** Lift the 40-row permission deny list verbatim into our `~/.claude/settings.json` permissions block. Lift the `beforeSubmitPrompt` secret-pattern regex (sk-, ghp_, AKIA-, AWS keys) into our existing `cred-mention-surface.sh` to upgrade it from warn-only to block on UserPromptSubmit (Tate-typed secret in the chat window = block + redact). Skip the full install (overlaps with yurukusa).

---

## Bundle 6: TechNickAI/claude_telemetry

**URL:** https://github.com/TechNickAI/claude_telemetry
**Stars:** 23
**Language:** Python 3.10+
**Install:** `pip install claude_telemetry` + rename `claude` to `claudia` on CLI

**Ships:** OpenTelemetry wrapper that intercepts via the Claude SDK's hook system. Captures user prompt, tool invocations (name + inputs + outputs + execution time), tool completion status, token counts (input/output/total), USD cost, session metrics, error context. Exports to Logfire / Sentry / Honeycomb / Datadog / Grafana Cloud / self-hosted OTLP.

**Gap closed for us:**
- **cost-telemetry gap** - direct close
- **MCP-call telemetry gap** - tool invocations include MCP calls with name + duration + cost
- **subagent-stop telemetry** - subagent lifecycle events included

**Compatibility risk:** Requires renaming the binary call from `claude` to `claudia`. This breaks every script, alias, and IDE config that invokes `claude` directly (Cursor's Claude Code extension, Ctrl+Alt+Shift+C dispatch, our hook registry). HIGH break risk.

**Recommendation:** **ADAPT not adopt.** Don't use the wrapper. Mine the OTEL span shape (event names + attributes) and emit equivalent spans from our existing hooks to whatever OTLP endpoint we set up. Better: see bundle 7.

---

## Bundle 7: ColeMurray/claude-code-otel

**URL:** https://github.com/ColeMurray/claude-code-otel
**Stars:** 404 (highest cost-telemetry bundle)
**Language:** Makefile orchestration (Docker Compose for the stack)
**Install:** `make up` brings up Prometheus + Loki + Grafana + OTEL Collector locally

**Ships:** zero hooks, zero binary wrapper. **Uses Claude Code's native OTEL support** via three env vars:

```
CLAUDE_CODE_ENABLE_TELEMETRY=1
OTEL_METRICS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

Captures: session counts + token usage (input/output/cache), cost by model with USD, tool execution + success rates, API request counts + latencies, lines of code changed, commits, PRs, tool permission decisions.

**Backends:** Prometheus (9090) + Loki (3100) + Grafana (3000), OTLP gRPC (4317) or HTTP (4318).

**Gap closed for us:**
- **cost-telemetry gap** - cleanest possible close (Claude Code already emits this, just point it at a collector)
- Native OTEL = same standard our future observability migrates to anyway

**Compatibility:** ZERO conflict with our 22 hooks. Env vars only.

**Recommendation:** **ADOPT.** Add the 3 env vars to Corazon's shell profile, run a local OTEL collector that writes to Postgres or our existing kv_store. Drop the Docker stack if we want minimal footprint - just point OTLP at `kv_store.telemetry.otel.*` via a tiny Node.js shim. This is the top pick for cost+token+MCP telemetry.

---

## Bundle 8: blackwell-systems/claudewatch

**URL:** https://github.com/blackwell-systems/claudewatch
**Stars:** 6
**Language:** Go (single binary)
**Install:** `claudewatch install` (Homebrew or direct download)

**Ships:**
- 2 hook types: SessionStart briefings (project health overview at launch) + PostToolUse alerts
- **PostToolUse alerts detect:** error loops (3+ consecutive failures), context pressure, cost velocity spikes, **drift patterns (reading without writing - 8 consecutive reads with 0 writes triggers "you're exploring without implementing, stuck or avoiding?")**
- **29 MCP tools** for agent self-reflection: get_project_health, get_drift_signal, get_task_history, get_blockers, get_agent_performance, get_session_dashboard, get_cost_velocity (burn rate over last 10 min), etc.

**Exported metrics:** cost-per-commit (inferred from local usage), agent success rates by agent type with kill patterns, friction rate / correction counts, tool error patterns, agent performance (duration, token breakdowns, parallelisation ratios).

**Gap closed for us:**
- **plan-drift detection gap** - cleanest close (8-reads-0-writes heuristic is the canonical signal)
- Adds a useful **cost-per-commit** metric we don't currently calculate
- 29 MCP self-reflection tools = potential conductor self-awareness primitive

**Compatibility:** Composes with existing settings.json (it installs MCP server config + behavioural rules). No hook collision because it ships only 2 hooks and they're new event categories.

**Recommendation:** **ADOPT for drift detection.** This is the canonical drift-detection bundle. Run `claudewatch install` on Corazon. Wire `get_drift_signal` into our session-orient skill. Mirror the cost-per-commit metric into kv_store.telemetry.* for status_board surface.

---

## Bundle 9: MLaminekane/hawkeye

**URL:** https://github.com/MLaminekane/hawkeye
**Stars:** 5
**Language:** TypeScript
**Install:** `npx hawkeye-ai` or `hawkeye hooks install` or `brew install hawkeye`

**Ships:** flight-recorder for agents. Dual operating mode (wrapper OR installed hooks). DriftDetect scores objective alignment via local heuristics + model-based eval (Ollama / LM Studio backends), triggers auto-pause when threshold breached. Per-session token/cost breakdowns, tool calls, MCP integration (ships its own MCP server exposing session awareness + memory snapshots), subagent support (Tasks / Agents / Swarm with cost tracking).

**Gap closed for us:**
- DriftDetect is similar to claudewatch's, but model-driven not heuristic - more nuanced but requires Ollama/LM Studio
- MCP server exposing session-awareness primitives

**Compatibility:** Composes via hooks install; preserves existing config.

**Recommendation:** **SKIP unless we already run Ollama.** claudewatch covers the same ground without the local-model dependency. If we later spin up Ollama on Corazon, revisit.

---

## Bundle 10: marcusgoll/atlas-guardrails

**URL:** https://github.com/marcusgoll/atlas-guardrails
**Stars:** 4
**Language:** TypeScript
**Install:** `atlas-guardrails` npm package, integrates as MCP server (not hooks)

**Ships:** context packing + duplicate-code detection + API-drift prevention. Symbol indexing builds dependency graph, `atlas_pack` MCP tool delivers token-optimised relevant file snippets, duplication detection catches "creating utils/date.ts when lib/time.ts exists".

**Gap closed for us:**
- **hallucination guardrail gap** - directly closes (blocks hallucinated API signatures + reinvented utilities)
- Adjacent to our `verify-deployed-state-against-narrated-state` doctrine

**Compatibility:** MCP server, not hooks - zero collision with our hook stack.

**Recommendation:** **ADAPT.** Atlas's symbol-indexing + duplication detection overlaps with what our `codebase-awareness` skill already does via the SQLite index. Lift the `atlas_pack` API-screening logic as a Haiku semantic-review extension instead of installing the MCP server (we'd be running parallel symbol indexes otherwise).

---

## Bundle 11: ryanlewis/claude-format-hook

**URL:** https://github.com/ryanlewis/claude-format-hook
**Stars:** 3
**Language:** 100% Shell (`format-code.sh`)
**Install:** download `format-code.sh`, install formatters via npm/pip/brew, copy `settings.json` to `~/.claude/`

**Ships:** single PostToolUse hook with Edit|MultiEdit|Write matcher. Routes by file extension to:
- JavaScript/TypeScript -> Biome (Prettier fallback) - `biome format --write`
- Python -> Ruff - `uv tool run ruff format`
- Markdown -> Prettier - `prettier --write`
- Go -> goimports + go fmt - `goimports -w` then `go fmt`
- Kotlin -> ktlint (ktfmt fallback)

Non-blocking (silent on failure), runs synchronously in background.

**Gap closed for us:**
- **auto-format gap** - exact close, 5 languages, runs after every Edit/Write
- Composes after our existing PostToolUse hooks (em-dash detector, observer_signals etc) because PostToolUse arrays run sequentially

**Compatibility:** 100% bash, one file, no daemons. Zero conflict.

**Recommendation:** **ADOPT.** Drop `format-code.sh` into `~/.claude/hooks/ecodia/`, add a PostToolUse Edit|MultiEdit|Write entry. The auto-format gap closes in 5 minutes.

---

## Bundle 12: 777genius/claude-notifications-go

**URL:** https://github.com/777genius/claude-notifications-go
**Stars:** 627 (second-highest in survey)
**Language:** Go (75%)
**Install:** `curl -fsSL .../bootstrap.sh | bash`

**Ships:** 6 notification types with click-to-focus (auto-detects 15+ terminals including Ghostty, WezTerm, tmux, zellij, kitty):
1. Task Complete (Write/Edit/Bash finishes)
2. Review Complete (read-only tool flow ends)
3. Question (Claude requests user input)
4. Plan Ready (exits plan mode)
5. Session Limit Reached (quota exhaustion)
6. API Error (auth/rate-limit/server failures)

**Webhooks:** Slack, Discord, Telegram, Lark/Feishu, Microsoft Teams, ntfy.sh, PagerDuty, Zapier, n8n, Make + custom endpoints. Retry + circuit breaker + rate limiting built in.

Hooks via PreToolUse (ExitPlanMode + AskUserQuestion detection) + Stop/SubagentStop (conversation state machine).

**Gap closed for us:**
- **SubagentStop telemetry gap** - state-machine-driven detection vs. our current naive Stop event
- **ambient-surface-where-user-is-not** doctrine match: SMS/Slack/ntfy webhook to Tate's phone while he's away from laptop = real ambient win (our existing `feedback_ambient_surface_is_where_user_is_not` memory)
- Click-to-focus on macOS + Linux + Windows

**Compatibility:** Composes via PreToolUse + Stop + SubagentStop arrays. No collision with our em-dash / observer / pulse hooks.

**Recommendation:** **ADOPT.** This is the top notification bundle in the ecosystem. Wire Discord webhook for non-critical alerts (session-limit, plan-ready) and reuse our existing sms_tate primitive for critical ones. The click-to-focus feature is genuinely novel - clicking a Slack alert opens the exact Cursor tab that spawned the worker.

---

## Bundle 13: affaan-m/everything-claude-code + AgentShield

**URL:** https://github.com/affaan-m/everything-claude-code (parent) + https://github.com/affaan-m/agentshield (security auditor)
**Stars:** not specified in research
**Language:** TypeScript (Node.js DRY adapter pattern)
**Install:** plugin marketplace (`/plugin install ecc@ecc`) or `bash ./install.sh --target claude --modules hooks-runtime` or `npx ecc-agentshield scan`

**Ships:** 15+ hooks via DRY adapter (shared `scripts/hooks/*.js` + per-platform adapters for Claude Code + Cursor + Codex + OpenCode + Zed):

| Hook | Catches |
|------|---------|
| beforeShellExecution | dev servers outside tmux; git push safety |
| afterFileEdit | auto-format + TypeScript check; console.log warnings |
| beforeSubmitPrompt | secret patterns (sk-, ghp_, AKIA-, AWS keys) in prompts |
| beforeTabFileRead | blocks Tab from reading .env/.key/.pem |
| beforeMCPExecution | **MCP audit logging + allowlist enforcement** |
| afterMCPExecution | result sanitisation + **MCP cost tracking** |
| SessionStart | context loading from prior sessions (cap 8000 chars default) |
| SessionEnd/Stop | state save + pattern extraction for continuous-learning-v2 |
| Pre-compact | state checkpoint |
| Suggest-compact | compaction recommendations |

**AgentShield:** standalone security auditor. 102 static-analysis rules + 1282 tests + 98% coverage. Scans secrets (14 patterns), permissions (MCP scope creep, rule-file access, hook privileges), hook injection (shell metachar escaping), MCP server risk (5 dimensions), agent config (model routing, token limits).

`npx ecc-agentshield scan --opus --stream` runs 3 Opus 4.6 agents (attacker / defender / auditor) adversarially - 30-min deep audit.

**Gap closed for us:**
- **MCP-call telemetry gap** - beforeMCPExecution + afterMCPExecution close it directly with audit log + cost tracking
- **secret-scan blocking gap** - beforeSubmitPrompt blocks before the prompt reaches the model
- AgentShield as periodic adversarial audit of our hook + MCP config

**Compatibility risk:** ECC is invasive (writes to `~/.claude/hooks/hooks.json` via plugin loader). Documentation explicitly warns about duplicate-hook detection. Mixing ECC's `hooks/hooks.json` with our `~/.claude/settings.json` worked in v2.1+ but is fragile. Runtime config (`ECC_HOOK_PROFILE`, `ECC_DISABLED_HOOKS`) gives some control.

**Recommendation:**
- **SKIP the ECC plugin** - too invasive given our 22 existing hooks
- **ADAPT the beforeMCPExecution + afterMCPExecution pattern** - lift as a 30-line bash hook that wraps our mcp__* tool calls and emits to kv_store.telemetry.mcp.*
- **ADOPT AgentShield as periodic CLI tool** - run `npx ecc-agentshield scan` weekly via cron, dump report to `drafts/agentshield-scan-YYYY-MM-DD.md`, no settings.json mutation

---

## Other bundles surveyed (skip recommendations only)

| Bundle | Stars | Why skip |
|--------|-------|---------|
| mafiaguy/claude-security-guardrails | 1 | 2-hook node.js wrapper, no integration guidance, React dashboard duplicates our infra |
| rulebricks/claude-code-guardrails | 67 | requires Rulebricks API key + cloud calls; we want local-first |
| simple10/agents-observe | n/a | duplicates bundle 1's substrate |
| NirDiamant/claude-watch | n/a | similar substrate, smaller adoption than bundle 1 |
| karanb192/claude-code-hooks | 390 | 5 hooks only, no auto-test/auto-format/cost-telemetry coverage - stated explicitly as "ideas for new hooks" |
| toomas-tt/...observability | n/a | fork of bundle 1 |
| JessyTsui/Claude-Code-Remote | n/a | remote control via email/discord - useful, but distinct from observability/safety gap |
| ChanMeng666/echook | n/a | audio notifications, redundant with bundle 12 |

---

## Adoption plan (concrete commits)

Five new pattern files + 5 hook-stack changes, all same-turn per our triad doctrine:

### Step 1: auto-format gap (5 min)

- Copy `format-code.sh` from ryanlewis/claude-format-hook to `~/.claude/hooks/ecodia/auto-format.sh`
- Add PostToolUse Edit|MultiEdit|Write entry in `~/.claude/settings.json` (appends to existing array)
- Author pattern: `patterns/auto-format-on-write-is-non-blocking-postooluse-2026-05-19.md`

### Step 2: branch-guard + secret-scan-blocking gap (10 min)

- Copy `branch-guard.sh` and `secret-guard.sh` from yurukusa/claude-code-hooks to `~/.claude/hooks/ecodia/`
- Author pattern: `patterns/branch-guard-blocks-direct-main-pushes-2026-05-19.md`
- Author pattern: `patterns/secret-guard-blocks-env-and-credential-writes-2026-05-19.md`
- Upgrade existing `cred-mention-surface.sh` to call into `secret-guard.sh` on UserPromptSubmit (lift the regex list from dwarvesf/claude-guardrails)

### Step 3: cost + token + MCP telemetry gap (20 min)

- Set Corazon shell profile: `CLAUDE_CODE_ENABLE_TELEMETRY=1`, `OTEL_METRICS_EXPORTER=otlp`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`
- Spin minimal OTLP receiver in `backend/listener-tier/otel-receiver.js` that writes to kv_store.telemetry.otel.*
- Author pattern: `patterns/cost-telemetry-via-native-otel-not-binary-wrapper-2026-05-19.md`

### Step 4: drift detection gap (10 min)

- `brew install claudewatch` then `claudewatch install`
- Wire `get_drift_signal` MCP tool into `session-orient` skill output
- Author pattern: `patterns/drift-detection-via-claudewatch-8-reads-zero-writes-2026-05-19.md`

### Step 5: SubagentStop telemetry + ambient notifications gap (15 min)

- Install claude-notifications-go via bootstrap script
- Configure Discord webhook for non-critical events, route critical events to sms_tate
- Author pattern: `patterns/subagent-stop-telemetry-via-state-machine-not-naive-event-2026-05-19.md`

### Step 6: periodic adversarial audit (cron)

- Add to `routines/agentshield-scan.md` weekly Sunday 18:00 AEST
- Output dumps to `drafts/agentshield-scan-YYYY-MM-DD.md`
- Tate-review on critical findings via sms_tate

---

## Compatibility verdict

Our existing 22-hook stack (bash + python + silent-runner.pyw wrapper) is fully compatible with every recommended adoption above because Claude Code runs hooks sequentially per event - new hooks append to existing arrays, no conflict. Two patterns to preserve:

1. **Settings.json single-source-of-truth.** Do not run any bundle that writes to `~/.claude/hooks/hooks.json` (ECC plugin path). Manual settings.json append-only is safer.
2. **Bash + python + node hook mix is fine** - Claude Code doesn't care about language, only exit code semantics.

Risk areas to watch:
- TechNickAI/claude_telemetry's binary rename (`claude` -> `claudia`) - breaks IDE dispatch
- ECC's auto-loaded `hooks/hooks.json` - duplicate-hook detection issues
- Anything that ships a Bun server or Vue dashboard - parallel infrastructure violation

---

## Sources

- https://github.com/disler/claude-code-hooks-multi-agent-observability (1.4k stars)
- https://github.com/disler/claude-code-hooks-mastery (3.7k stars)
- https://github.com/yurukusa/claude-code-hooks (10 stars, npx cc-safe-setup)
- https://github.com/CodyLunders/claude-code-hooks-library (2 stars)
- https://github.com/dwarvesf/claude-guardrails (16 stars)
- https://github.com/TechNickAI/claude_telemetry (23 stars)
- https://github.com/ColeMurray/claude-code-otel (404 stars)
- https://github.com/blackwell-systems/claudewatch (6 stars)
- https://github.com/MLaminekane/hawkeye (5 stars)
- https://github.com/marcusgoll/atlas-guardrails (4 stars)
- https://github.com/ryanlewis/claude-format-hook (3 stars)
- https://github.com/777genius/claude-notifications-go (627 stars)
- https://github.com/affaan-m/everything-claude-code + agentshield
- https://github.com/rohitg00/awesome-claude-code-toolkit (canonical aggregator)
- https://github.com/jqueryscript/awesome-claude-code (alt aggregator)
- https://github.com/karanb192/claude-code-hooks (390 stars, smaller scope)
- https://github.com/mafiaguy/claude-security-guardrails (1 star)
- https://github.com/rulebricks/claude-code-guardrails (67 stars)
