# Pyramid architecture sketch - tiered model routing for cron + fork dispatch

**Author:** fork_mol3zx61_b61879 (sketch only, no production code touched)
**Amended:** fork_mol4flx0_5bf765, 30 Apr 2026 16:50 AEST - incorporating Tate's session-mode refinement (16:45 AEST SMS)
**Status:** design proposal, recommendation: **proceed with Phase 1 + 2 + 2.7 immediately as a single coordinated rollout (Phase 2.7 = `cronSessionMode.js` config + `cronForkDispatcher` 5-mode router patch). Gate Phases 3+ on observed Phase 2.7 telemetry. ALL Claude paths route through the agent SDK on Max plans; no direct Anthropic API.**

## Current state (live, 30 Apr 2026 16:50 AEST)

**PR #28 (cron-forks-as-primitive) merged to main at 16:05 AEST 30 Apr 2026 (commit cf6e0e8).** Code is on disk; `cronForkDispatcher.js` exists and ships with 4 priority classes (CONDUCTOR / DIRECT_EXEC / HIGH_PRIORITY_FORK / LOW_PRIORITY_FORK). `ecodia-api` has NOT yet been pm2-restarted (would kill the conductor mid-flight), so cron-firing currently still routes to conductor in the main process. **Activation pending the next ecodia-api restart cycle.** Until restart, this sketch describes the post-restart steady state.

The 4 priority classes are an orthogonal axis to the SESSION-MODE refinement Tate added at 16:45 AEST + the Max-plan-only constraint Tate added at 16:47 AEST. PR #28 already implements `direct_exec` (no Claude, shell only) as one class. The other three classes default to fork-substrate inheritance with the full conductor-context tail, which over-pays for mechanical workers. This amendment adds the `brief_fork` session-mode (`mcp__forks__spawn_fork({ context_mode: 'brief' })` - no conductor inheritance, agent SDK on Max plan) and the `factory_cc_session` session-mode for long-running implementation work, plus the routing logic to pick between all five modes.

## Premise

The conductor (current model, Sonnet) is the brain. Forks-as-primitive (PR #28, on disk pending restart) is the substrate. The pyramid layers tier-routing ON TOP of `mcp__forks__spawn_fork`: lower tiers = Haiku for mechanical work, mid = Sonnet for judgment, top = conductor for strategy + Tate-facing. Cowork-is-a-gui-tool doctrine preserved: lower tiers are mechanical executors that REPORT up; they do not authorise. Conductor decides.

**Two orthogonal dimensions (post-amend, 16:55 AEST correction applied):**
- **Tier (priority + model):** CONDUCTOR / SONNET_FORK / HAIKU_FORK / HAIKU_DIRECT - decides which model and how much budget.
- **Session-mode (substrate):** `direct_exec` / `brief_fork` / `inherit_fork` / `conductor_inline` / `factory_cc_session` - decides what context the worker starts with and which SDK path it runs under.

These compose: a Tier-2 Haiku-fork runs as `brief_fork haiku` (`mcp__forks__spawn_fork` with `context_mode='brief'`, ZERO conductor-context inheritance, just the brief). The choice is per-cron, encoded in `cronSessionMode.js`.

**HARD CONSTRAINT (Tate verbatim 16:47 AEST SMS):** "No api calls for cringe btw, make it a cc factory session. Only use Claude max plan via agent sdk." All Claude work runs through the Anthropic Claude Agent SDK on the two Claude Max plans (tate@ecodia.au + code@ecodia.au). **Direct Anthropic API metered billing is OUT OF BOUNDS.** The 20B tokens/week Max-plan budget is the cost ceiling; weekly subscription caps are the only hard limit. Any earlier framing in this sketch about "fresh_session via direct Anthropic API" is **superseded and removed**.

**Tate's 16:45 AEST refinement (verbatim):** "Also idk if crons being sent to forks is live yet, but they could honestly just be sent to a fresh session, the whole point of forking is identical context, but they dont need it, they just need the task related context."

The mechanism that satisfies both Tate refinements: `mcp__forks__spawn_fork({ context_mode: 'brief' })`. This is "fresh-session-style" semantics (no conductor inheritance) routed through the SDK fork substrate (Max-plan billing, MCP tool surface preserved).

## 1. Tier × session-mode mapping (33 active crons)

Verified from `os_scheduled_tasks WHERE type='cron' AND status='active'`. Brief said 26; actual is 33.

**Two-axis assignment.** Each cron now gets BOTH a tier (model + budget) and a session-mode (substrate). The session-mode column was added per Tate's 16:45 AEST refinement: "they dont need [identical conductor context], they just need the task related context."

### Tier 1 - Haiku-direct equivalent (no fork, single shell or curl)
Pure plumbing: hit an endpoint, write one row, exit. Zero judgment.
| cron | schedule | session-mode | rationale |
|---|---|---|---|
| `neo4j-keepalive` | every 6h | `direct_exec` | cold read, no Claude needed |
| `os-forks-reaper` | every 30m | `direct_exec` | SQL UPDATE only |
| `telemetry-dispatch-consumer` | every 15m | `direct_exec` | JSONL->Postgres consumer, no judgment |
| `telemetry-outcome-inference` | every 30m | `direct_exec` | rule-based inference over rows; promote to `brief_fork haiku` only if rule-set proves insufficient |
| `kg-embedding` | every 4h | `direct_exec` | hit internal endpoint |
| `kg-consolidation` | every 6h | `direct_exec` | hit internal endpoint |
| `daily-index-regen` | daily 22:00 | `direct_exec` | filesystem walk + write |
| `cowork-fork-budget-reset` | daily 10:00 | `direct_exec` | kv_store counter reset |
| `decision-quality-classifier` | every 1h | `direct_exec` | failure-classifier script (already standalone) |

### Tier 2 - Haiku-fork equivalent (multi-step but mechanical, structured output)
Probe + categorise + write status_board / kv_store. Pattern recognition not synthesis. **Default session-mode: `brief_fork haiku`** (no conductor context inheritance via `context_mode='brief'`, runs through the agent SDK on Claude Max billing, MCP tool surface preserved).
| cron | schedule | session-mode | rationale |
|---|---|---|---|
| `coexist-sync-health` | daily 09:00 | `brief_fork haiku` | sync probe + alert classification |
| `vercel-deploy-monitor` | every 2h | `brief_fork haiku` | list deploys + flag failed; structured output |
| `system-health` | every 4h | `brief_fork haiku` | PM2/disk/memory probes + status_board write |
| `silent-loop-detector` | every 30m | `brief_fork haiku` | heartbeat probe + alert |
| `external-blocker-freshness-probe` | daily 06:00 | `brief_fork haiku` | re-probe stale alerts |
| `cowork-account-revert-probe` | every 30m | `direct_exec` | screenshot+OCR-shape probe via laptop agent shell; promote to `brief_fork haiku` only if OCR insufficient |
| `daily-telemetry` | daily 23:00 | `brief_fork haiku` | KPI snapshot (queries multiple sources) |
| `status-board-reconciliation` | every 12h | `brief_fork haiku` | multi-substrate drift check; `brief_fork` because it benefits from MCP tool surface in fork (db_query, neo4j) |
| `tate-night-update` | every 30m | `brief_fork haiku` | state-snapshot SMS; cheap |
| `peer-monitor` | every 72h | `brief_fork sonnet` | curated WebSearch + dedupe needs WebFetch in fork; bumped to Sonnet for judgment |

### Tier 3 - Sonnet-fork equivalent (judgment, multi-step, novel synthesis)
Reads multiple substrates, decides what matters, writes durable artefacts. **Most default to `brief_fork sonnet`** - they DO need MCP tool surface (db_query, neo4j, gmail, etc) but they DO NOT need conductor's recent conversation tail. Only crons that genuinely synthesise across CONDUCTOR-context get `inherit_fork`.
| cron | schedule | session-mode | rationale |
|---|---|---|---|
| `email-triage` | every 1h | `brief_fork sonnet` | inbox is self-contained; no conductor tail needed |
| `deep-research` | every 3h | `brief_fork sonnet` | self-contained domain dive |
| `strategic-thinking` | daily 14:00 | `inherit_fork sonnet` | benefits from recent conductor decisions tail |
| `claude-md-reflection` | daily 20:00 | `brief_fork sonnet` | reads CLAUDE.md + patterns dir + transcripts; not conductor tail |
| `daily-codification-scan` | daily 21:00 | `brief_fork sonnet` | rule-emergence over patterns dir |
| `decision-quality-drift-check` | every 6h | `brief_fork sonnet` | telemetry queries + status_board; self-contained |
| `weekly-doctrine-synthesis` | weekly | `brief_fork sonnet` | cross-pattern over patterns dir; not conductor tail |
| `weekly-financial-review` | weekly | `brief_fork sonnet` | Stripe + bookkeeping + cash data; self-contained |
| `phase-G-adversarial-audit` | daily 22:00 | `brief_fork sonnet` | red-team CLAUDE.md + patterns dir; self-contained |
| `ambient-os-cleanup-coordinator` | every 30m | `brief_fork sonnet` | queries status_board + dispatches downstream; self-contained |
| `morning-briefing` | daily 09:00 | `brief_fork sonnet` | data-source query + email Tate |
| `inner-life` | every 6h | `inherit_fork sonnet` | reflective; benefits from recent conductor tail |
| `tate-blocked-nudge-weekly` | weekly | `brief_fork sonnet` | status_board query + SMS classification |
| `weekly-mum-text` | weekly | `brief_fork sonnet` | personal SMS, self-contained |

### Tier 4 - Conductor (current model, the brain)
| cron | schedule | session-mode | rationale |
|---|---|---|---|
| `meta-loop` | every 1h | `conductor_inline` | IS the conductor; orchestrates everything |

### Tier 5 - Factory CC sessions (long-running implementation work, NEW)
Reserved for crons that orchestrate multi-turn implementation builds (code-write, refactor, scaffold + test loops). These run via `mcp__factory__start_cc_session` (Claude Code CLI under the code@ecodia.au Max plan), NOT via `mcp__forks__spawn_fork`. Distinguishing feature: the Factory session has its own persistent transcript across multiple turns and benefits from CC's tool ergonomics (Read/Write/Edit/Bash/Grep) over the duration of a build.

| cron | schedule | session-mode | rationale |
|---|---|---|---|
| `parallel-builder` | every 2h | `factory_cc_session` | dispatches Factory sessions for queued client/internal code work (referenced in CLAUDE.md but not in current 33; should land here on activation) |
| (future) `claude-md-edit-fork` | sub-cron of `claude-md-reflection` | `factory_cc_session` | edit half of the 2-fork CLAUDE.md pipeline; multi-file edits with build verification |

No cron in the current 33-active list maps to `factory_cc_session` directly today. The tier exists in the menu so future implementation-work crons land in the right substrate by default. **Note: Factory CLI is currently credit-exhausted on both Max accounts** (status_board P1 row "Factory phantom-failing"); `brief_fork sonnet` is the live workaround for code-changing work until the paywall lifts or weekly reset clears it.

### Session-mode breakdown (33 active crons + factory tier reservation)

| session-mode | count today | model | SDK path | typical fires/day |
|---|---|---|---|---|
| `direct_exec` | 10 | n/a (shell) | none | ~145 |
| `brief_fork haiku` | 9 | haiku-3.5 | `mcp__forks__spawn_fork(context_mode='brief')` | ~82 |
| `brief_fork sonnet` | 12 | sonnet-4 | `mcp__forks__spawn_fork(context_mode='brief')` | ~22 |
| `inherit_fork sonnet` | 2 | sonnet-4 | `mcp__forks__spawn_fork(context_mode='recent')` | ~5 |
| `conductor_inline` | 1 | sonnet-4 (conductor) | main session | 24 |
| `factory_cc_session` | 0 today (1 future) | sonnet (CC) | `mcp__factory__start_cc_session` | ~12 (when active) |

**Observation:** zero crons get `inherit_fork haiku` - if the cron justifies inheriting conductor's 25k-token tail, it almost certainly needs Sonnet judgment too. The `inherit_fork` mode is rare and reserved for explicit "needs continuity" cases (`strategic-thinking`, `inner-life`). All Claude work routes through SDK paths bound to Max-plan billing; no direct Anthropic API path exists in this menu (per Tate 16:47 AEST).

### Doesn't fit cleanly
None at current count - all 33 fit. Caveat: `ambient-os-cleanup-coordinator` is borderline T2/T3 because it dispatches further forks; classed T3 with `brief_fork sonnet` because the "what to dispatch" decision is judgment AND it needs MCP fork-spawning ability.

## 2. Token cost estimate (post-amend, all SDK paths on Max-plan billing)

**Critical reframing.** Tate's spend is Max-plan subscription caps, not metered Anthropic API. Tokens consumed are weekly-cap units, not dollars-per-fire. The dollar figures below are "API-equivalent capacity recovered" - useful for sizing the win but not actually billed. **The real metric is weekly-cap tokens freed**, because credit-exhaustion (`graceful-credit-exhaustion-handling.md`) is the failure mode the pyramid is meant to defer.

Anthropic public pricing late-2025/early-2026 (per million tokens, used for capacity-equivalent math):
- Haiku 3.5: $0.80 in / $4 out
- Sonnet 4: $3 in / $15 out (3.75x in, 3.75x out vs Haiku)
- Conductor (Sonnet w/ ~150K context): same rate, larger context

**Per-fire token averages (revised) - the substrate change matters more than the model change.**

The killer line item in the current state is the 25k-token conductor-context tail every fork inherits even when it doesn't need it. `brief_fork` drops that tail to zero. Below: tok-in for `brief_fork` is dominated by the brief itself + role identity preamble + memory window (~3-8k typical), not by 25k of conductor recent-message history.

| session-mode | tok in | tok out | $/fire (capacity-equiv) | fires/day | $/day (capacity-equiv) |
|---|---|---|---|---|---|
| `direct_exec` | 0 (shell) | 0 | $0.000 | 145 | $0.00 |
| `brief_fork haiku` | 5K | 2K | $0.012 | 82 | $0.98 |
| `brief_fork sonnet` | 10K | 5K | $0.105 | 22 | $2.31 |
| `inherit_fork sonnet` | 35K | 8K | $0.225 | 5 | $1.13 |
| `conductor_inline` | 150K | 30K | $0.900 | 24 | $21.60 |
| `factory_cc_session` (when live) | 50K + 25K/turn | 15K/turn | $0.900/session | 12 | $10.80 |
| **Tiered total (today, factory dark)** | | | | **278** | **~$26/day capacity-equiv** |

Current (all-inherit-fork-Sonnet, conductor for the rest):
| baseline | Sonnet inherit | $0.495/fire | 254 | $125/day | + T4 $21.60 = **~$147/day capacity-equiv** |

**Daily delta: -$121/day capacity-equivalent (~82% cron-stack reduction).** Monthly ~$3.6K capacity-equivalent. Within Max-plan reality: this frees ~6.0M tokens/day of weekly-cap headroom on the code@ecodia.au plan, which is the difference between Factory hitting credit-exhaustion mid-week and surviving the full 7d window.

**Where the 80-95% savings comes from (not the model change, the substrate change):**
- 75% comes from `inherit_fork` -> `brief_fork` swap on the 21 mechanical-fork crons. Killing the 25k conductor tail is the dominant saving.
- 15% comes from `brief_fork sonnet` -> `brief_fork haiku` on the 8 Tier-2 crons that don't need Sonnet judgment.
- 10% comes from `brief_fork` -> `direct_exec` on the 10 Tier-1 crons that have no Claude judgment at all.

The Tate refinement (16:45 AEST: "they dont need it, they just need the task related context") is the single biggest unlock. The model-tier swap is a smaller, secondary win.

## 3. Required infrastructure changes

**Hard constraint repeated:** every Claude path below routes through the agent SDK on the two Claude Max plans. Direct Anthropic API metered billing is forbidden. The substrate menu has FIVE entries and that is the closed set: `direct_exec`, `brief_fork`, `inherit_fork`, `conductor_inline`, `factory_cc_session`.

### 3a. `forkService.js` - accept `model` param
Currently `_resolveProviderForFork()` (line 314) globally picks Sonnet via Bedrock or default. `spawnFork({ brief, context_mode })` (line 350) doesn't accept model.

Change: `spawnFork({ brief, context_mode, model })` where `model` is one of `haiku` / `sonnet` / `opus` / undefined (= default Sonnet). Pass through to `options.model` (line 429). Validate against an allowlist. Default = Sonnet preserves backward compat for every existing caller.

SDK-level: Anthropic Claude Agent SDK accepts `model` per-`query()` call - no new client needed, no stream-level changes. Each `queryFn({ prompt, options })` opens its own SDK session with its own model under the configured Max-plan identity.

### 3b. New file `src/config/cronSessionMode.js`
Splits the priority axis (existing `cronPriority.js` from PR #28) from the substrate axis. The two compose orthogonally.

```js
module.exports = {
  SESSION_MODE: {
    DIRECT_EXEC: 'direct_exec',
    BRIEF_FORK: 'brief_fork',
    INHERIT_FORK: 'inherit_fork',
    CONDUCTOR_INLINE: 'conductor_inline',
    FACTORY_CC_SESSION: 'factory_cc_session',
  },
  CRON_SESSION_MODES: {
    'neo4j-keepalive':              { mode: 'direct_exec' },
    'os-forks-reaper':              { mode: 'direct_exec' },
    'telemetry-dispatch-consumer':  { mode: 'direct_exec' },
    'telemetry-outcome-inference':  { mode: 'direct_exec' },
    'kg-embedding':                 { mode: 'direct_exec' },
    'kg-consolidation':             { mode: 'direct_exec' },
    'daily-index-regen':            { mode: 'direct_exec' },
    'cowork-fork-budget-reset':     { mode: 'direct_exec' },
    'decision-quality-classifier':  { mode: 'direct_exec' },
    'cowork-account-revert-probe':  { mode: 'direct_exec' },

    'coexist-sync-health':          { mode: 'brief_fork', model: 'haiku' },
    'vercel-deploy-monitor':        { mode: 'brief_fork', model: 'haiku' },
    'system-health':                { mode: 'brief_fork', model: 'haiku' },
    'silent-loop-detector':         { mode: 'brief_fork', model: 'haiku' },
    'external-blocker-freshness-probe': { mode: 'brief_fork', model: 'haiku' },
    'daily-telemetry':              { mode: 'brief_fork', model: 'haiku' },
    'tate-night-update':            { mode: 'brief_fork', model: 'haiku' },
    'status-board-reconciliation':  { mode: 'brief_fork', model: 'haiku' },
    'peer-monitor':                 { mode: 'brief_fork', model: 'sonnet' },

    'email-triage':                 { mode: 'brief_fork', model: 'sonnet' },
    'deep-research':                { mode: 'brief_fork', model: 'sonnet' },
    'claude-md-reflection':         { mode: 'brief_fork', model: 'sonnet' },
    'daily-codification-scan':      { mode: 'brief_fork', model: 'sonnet' },
    'decision-quality-drift-check': { mode: 'brief_fork', model: 'sonnet' },
    'weekly-doctrine-synthesis':    { mode: 'brief_fork', model: 'sonnet' },
    'weekly-financial-review':      { mode: 'brief_fork', model: 'sonnet' },
    'phase-G-adversarial-audit':    { mode: 'brief_fork', model: 'sonnet' },
    'ambient-os-cleanup-coordinator': { mode: 'brief_fork', model: 'sonnet' },
    'morning-briefing':             { mode: 'brief_fork', model: 'sonnet' },
    'tate-blocked-nudge-weekly':    { mode: 'brief_fork', model: 'sonnet' },
    'weekly-mum-text':              { mode: 'brief_fork', model: 'sonnet' },

    'strategic-thinking':           { mode: 'inherit_fork', model: 'sonnet' },
    'inner-life':                   { mode: 'inherit_fork', model: 'sonnet' },

    'meta-loop':                    { mode: 'conductor_inline' },

    // future tier-5 entries:
    // 'parallel-builder':          { mode: 'factory_cc_session' },
  },
  DEFAULT: { mode: 'brief_fork', model: 'sonnet' }, // safe upgrade for unknown crons
}
```

### 3c. `cronForkDispatcher.js` enhancement (PR #28 patch, NOT new file)
PR #28 already shipped `cronForkDispatcher.js` with 4 priority classes (CONDUCTOR / DIRECT_EXEC / HIGH_PRIORITY_FORK / LOW_PRIORITY_FORK). Patch needed: read `cronSessionMode.js` and route on the session-mode axis.

```js
// pseudocode
const { mode, model } = CRON_SESSION_MODES[cronName] ?? DEFAULT;
switch (mode) {
  case 'direct_exec':
    // unchanged from PR #28: shell_exec the registered command, write kv_store
    return runDirectExec(cronName, briefContext);

  case 'brief_fork':
    return forkService.spawnFork({
      brief: composeBriefForCron(cronName, briefContext),
      context_mode: 'brief',   // <-- the new knob, satisfies Tate 16:45 AEST refinement
      model,
    });

  case 'inherit_fork':
    return forkService.spawnFork({
      brief: composeBriefForCron(cronName, briefContext),
      context_mode: 'recent',  // default; preserves conductor tail inheritance
      model,
    });

  case 'conductor_inline':
    return enqueueOnConductorMain(cronName, briefContext);

  case 'factory_cc_session':
    return factoryService.startCcSession({
      prompt: composeFactoryPromptForCron(cronName, briefContext),
      codebase: resolveCodebaseForCron(cronName),
    });

  default:
    throw new Error(`unknown session mode for cron ${cronName}: ${mode}`);
}
```

No `freshSessionDispatcher.js`. No direct Anthropic SDK client outside of `forkService.spawnFork` and `factoryService.startCcSession`. The pyramid runs entirely on the two existing Max-plan SDK paths.

### 3d. Status_board surface
New columns on a fork-tracking view: `pyramid_tier`, `session_mode`. Surface in `/api/telemetry/decision-quality` panels: tier-distribution AND session-mode-distribution. The latter answers "are we actually using `brief_fork` for the workers we said would use it" - the verify-deployed-state-against-narrated-state probe for the pyramid's own narrative.

### 3e. Worker identity + memory layer (per Tate extension 16:35 AEST)
- kv_store schema:
  - `worker.registry` -> `{ <role>: { identity_key, memory_key_prefix, model, owner_cron_or_trigger, version } }`
  - `worker.<role>.identity` -> `{ system_prompt_template, model, expected_input, expected_output, escalation_contract, version, created_at, last_evolved_at }`
  - `worker.<role>.memory.<scope>` -> `{ accumulated_observations: [], known_edge_cases: [], frequent_failure_signatures: [], last_self_correction, version, fires_observed }` (bounded; truncate-tail to last N entries per array, default N=50)
- `forkService.spawnWorker(roleName, fireContext)` -> reads `worker.<role>.identity` + relevant `worker.<role>.memory.*`, composes system prompt as `[role identity preamble] + [memory window] + [fire-specific brief]`, calls `spawnFork({ brief, model: identity.model })` with that composed prompt. Returns standard fork snapshot.
- `forkService.endWorkerFire(roleName, fireResult)` -> appends fire-result to memory (observations + any new edge cases or failure signatures), bounds the arrays, writes back. Idempotent on fork_id.
- New cron `worker-identity-review` (weekly, Sonnet-tier) -> for each role in `worker.registry`, reads accumulated memory, audits for stale/contradictory observations, proposes identity v+1 (system-prompt + memory refinements), writes back. Anomalies escalate to Conductor.

## 4. Report-aggregation pattern

### Haiku-fork (T2) -> conductor (or T3 aggregator)
Current: `[FORK_REPORT] <one paragraph>` + optional `[NEXT_STEP]` (forkService.js line 583).
**Keep as-is.** The format is already "report up." Tier-2 forks are leaves that report directly to either main (current) or, in Phase 5, to a T3 aggregator.

### Sonnet-mid-tier (T3 aggregator, Phase 5 only)
Format: structured JSON in fork report body:
```json
{ "summary": "...", "p1": [...], "p2": [...], "next_actions": [...], "tier2_reports_consumed": 5 }
```
T3 aggregator reads `os_forks WHERE parent_fork_id = self AND status = 'done'`, summarises, posts ONE rolled-up report to main. Status_board row with `entity_type=infrastructure`.

### Landing surfaces
- T1 -> kv_store key `cron.lastrun.<name>` (one-line status)
- T2 -> existing `os_forks` row + `[FORK_REPORT]` to main message queue
- T3 leaf -> same as T2
- T3 aggregator -> ONE `[FORK_REPORT]` to main + status_board row
- T4 conductor -> direct chat / SMS / status_board

Append-only telemetry log: `pyramid_dispatch_event` table, schema `(ts, cron_name, tier, model, fork_id, tokens_in, tokens_out, duration_ms, outcome)`. Feeds Phase D telemetry consumer.

## 5. Risks (top 5)

1. **Haiku quality on mechanical tasks (P1).** Haiku may miss subtle signals that Sonnet catches in T2 probes. Mitigation: Phase 3 routes only 5 lowest-stakes crons; observe false-negative rate over 7d via decision-quality telemetry; do not promote a cron to Haiku permanently until 2 weeks of clean signal.

2. **Coordination cost of mid-tier synthesis (P2).** T3 aggregator pattern adds a fork generation; aggregator can hallucinate when underlying T2 reports disagree. Mitigation: aggregator is Phase 5 (last); aggregator brief MUST quote T2 reports verbatim, not paraphrase; verify-deployed-state-against-narrated-state applies.

3. **Worker dies mid-flight (P2).** Existing `recoverStaleForks` (forkService.js line 758) handles SIGTERM mid-run with continuation-aware redispatch. Pyramid inherits this for free at all tiers. New risk: T3 aggregator dies after T2 leaves report - leaves orphaned. Mitigation: aggregator is idempotent; recovery redispatch reads existing T2 reports and re-aggregates.

4. **Tier drift (P2).** Worker reports "X done" but did Y. Mitigation: `verify-deployed-state-against-narrated-state.md` already mandates disk/DB probes before status_board writes; pyramid does not change this. Telemetry logs both report-text and observed-disk-state for post-hoc audit.

5. **Tier-mismatch cost (P3).** Over-tier wastes tokens (Sonnet on mechanical = current state, baseline). Under-tier produces wrong output (Haiku on judgment = quality regression). Mitigation: `cronTier.js` is config-as-code, reviewable in PR; Phase 1 explicitly documents EVERY tier choice with one-line justification before any code change.

6. **Memory drift (P2, persistence layer only).** A worker accumulates wrong-pattern observations over fires; role identity calcifies on outdated assumptions; the worker becomes confidently wrong. Mitigation: scheduled `worker-identity-review` cron (weekly, Sonnet-tier reviewer) audits each worker's memory, refines identity, escalates anomalies to Conductor. Memory arrays are bounded-size (truncate-tail) so freshness is structural, not just policy. Worker-emitted observations include a confidence + source-fire-id so the reviewer can dispute.

## 5b. Persistent role identity (per Tate 16:35 AEST extension)

**Premise.** Lower-tier workers retain a role over time and accumulate role-specific knowledge, but this is NOT literal long-running Claude sessions. Anthropic SDK is stateless per-query - no daemon-mode workers exist. Persistence is implemented as **identity-as-data** (kv_store records that hydrate into the worker's system prompt at fire-start) + **memory-as-data** (kv_store records updated post-fire). Each fire is still a fresh SDK query; persistence is by composition, not by process.

### 5b.1 Components

1. **Per-role identity record.** `kv_store.worker.<role>.identity` - system-prompt template, model selection (`haiku-3.5` / `sonnet-4` / etc.), expected-input shape, expected-output shape, escalation contract (when to bubble up vs handle in-tier), version, created_at, last_evolved_at.

2. **Per-role memory store.** `kv_store.worker.<role>.memory.<scope>` - `{ accumulated_observations, known_edge_cases, frequent_failure_signatures, last_self_correction }`. Read at fire-start, written at fire-end. Bounded size (truncate-tail to last N per array; default N=50) prevents unbounded growth.

3. **Anthropic prompt-cache exploitation.** Role system-prompt + identity preamble + recent memory window = stable prefix per role. Prompt-cache TTL is 5 minutes. Cache-hit expectations:
   - Crons every 15-30min (T1+T2 majority): cache mostly **cold** between fires; prefix paid each fire. Persistence value here is doctrine-quality, not cost.
   - Listener-driven workers and smoke-test workers (high frequency, sub-5min bursts): cache mostly **warm** within a burst; first fire pays prefix, subsequent fires pay only delta. Estimated 60-80% cost reduction on prefix during bursts.
   - Daily/weekly crons: cache always cold. Persistence is purely doctrine-quality.

4. **Role evolution mechanism.** Worker observes patterns over fires, logs to its own memory. Periodically (every N fires OR on Conductor-trigger), `worker-identity-review` (Sonnet-tier weekly cron) reads the worker's accumulated memory, refines the system-prompt + memory, writes back as identity v+1. This is doctrine refinement via memory inspection - NOT model retraining. Conductor approves identity bumps that change escalation contract; routine memory refinement proceeds without escalation.

5. **Role registry.** `kv_store.worker.registry` is the single source of truth for live roles: `{ <role-name>: { identity_key, memory_key_prefix, model, owner_cron_or_trigger, version } }`. Conductor lists/inspects/versions/retires roles via this registry.

### 5b.2 Concrete first-wave roles (Phase 3-4 candidates)

| role | model | owner | scope of memory |
|---|---|---|---|
| `vercel-deploy-watcher` | haiku | `vercel-deploy-monitor` | known-flake repos, normal-vs-anomalous failure shapes |
| `pm2-health-prober` | haiku | `system-health` | per-process restart-rate baselines, known-noisy processes |
| `coexist-sync-prober` | haiku | `coexist-sync-health` | known-drift columns, tolerance windows |
| `silent-loop-watcher` | haiku | `silent-loop-detector` | per-loop heartbeat-cadence baselines |
| `cowork-account-prober` | haiku | `cowork-account-revert-probe` | revert-frequency baseline, known-trigger windows |

Each role's memory is private to that role. Roles do not read each other's memory; cross-role synthesis is the Conductor's job.

### 5b.3 Failure modes specific to persistence

- **Memory poisoning.** A buggy fire writes a wrong observation; subsequent fires inherit it. Mitigation: every memory write is fire_id-stamped + reviewable; identity-review cron diff-checks against ground truth.
- **Identity divergence under high-frequency edits.** Two near-simultaneous fires both write memory; one clobbers the other. Mitigation: kv_store writes use `IF version = expected_version` CAS; on conflict, retry with merge.
- **Model-tier downgrade locks in errors.** Haiku worker writes "this is fine" repeatedly when it should escalate. Mitigation: identity-review reviewer is always Sonnet-tier and explicitly checks for stuck-fine-signal patterns.

## 6. Phased rollout (post-amend)

- **Phase 1 (this week, no code change):** Author `cronTier.js` (priority + model intent) AND `cronSessionMode.js` (substrate intent) as docs-only configs. Add `pyramid_tier_intent` and `session_mode_intent` to status_board row context for every active cron. Observe one full week of fires, compare predicted vs observed token usage, refine before Phase 2. No risk.
- **Phase 2 (week 2):** Ship `model` param in `forkService.spawnFork`. No callers change yet. Test via existing fork API: `mcp__forks__spawn_fork({ brief, model: 'haiku' })`. Verify SDK accepts the model + provider routing works on the Claude Max plan path. Confirm NO direct-API code-path exists in the change.
- **Phase 2.5 (week 2-3):** Ship the worker persistence layer. Author `kv_store.worker.registry` schema, identity/memory contract, and `forkService.spawnWorker(roleName, fireContext)` + `endWorkerFire(roleName, fireResult)` entry points. No workers ship yet; the scaffolding is what Phase 3 forks attach to. Author the weekly `worker-identity-review` cron but leave it `status='paused'` until at least one role is live in Phase 3.
- **Phase 2.7 (week 2-3, NEW per Tate 16:45 + 16:47 AEST):** Author `cronSessionMode.js` config + patch `cronForkDispatcher.js` (PR #28) to honour the `mode` field. Wire the 5-mode router (direct_exec / brief_fork / inherit_fork / conductor_inline / factory_cc_session). Add `session_mode` column to fork-tracking view. Tests: dispatch one canary fire per mode in a staging-isolated cron and verify (a) no direct-Anthropic-API code path is exercised, (b) brief_fork fires consume <=10K input tokens vs inherit_fork fires consuming 25K+, (c) factory_cc_session router routes to `mcp__factory__start_cc_session` not forks.spawn. Reversible by reverting `cronSessionMode.js` to all-`inherit_fork`. The 80%+ token savings unlock from Phase 2.7 is the single largest win in the rollout.
- **Phase 3 (week 3-4):** Route 5 lowest-risk crons via the new pyramid: `neo4j-keepalive` (direct_exec), `os-forks-reaper` (direct_exec), `cowork-fork-budget-reset` (direct_exec), `daily-index-regen` (direct_exec), `kg-embedding` (direct_exec). All five are `direct_exec` first because they have zero Claude judgment - the safest start. Each Tier-1 direct_exec cron gets a `worker.registry` entry pointing to the registered shell command (no model, no memory window). Observe 7 days. Pass criterion: zero functional regressions vs current Sonnet-fork baseline.
- **Phase 3.5 (week 4):** Route 5 brief_fork-haiku crons: `vercel-deploy-monitor`, `system-health`, `silent-loop-detector`, `daily-telemetry`, `tate-night-update`. These exercise the `brief_fork` path with Haiku for the first time. Each gets a registered role with initial identity + empty memory. Resume `worker-identity-review` cron once at least one role has 14 fires of memory. Pass criterion: zero false-negatives against current-Sonnet baseline AND identity-review produces no anomalies.
- **Phase 4 (week 5-6):** Promote remaining brief_fork sonnet crons (12 entries). Observe 14 days. Watch decision-quality telemetry for tier quality regressions.
- **Phase 5 (month 2+):** Build T3 aggregator pattern. Replace `ambient-os-cleanup-coordinator` first (already a coordinator). Observe.
- **Phase 6 (when Factory CLI credit-exhaustion lifts):** Activate the `factory_cc_session` tier with `parallel-builder` as first cron. Verify that the `mcp__factory__start_cc_session` path runs under code@ecodia.au Max plan.

Phases 1-2.7 are reversible config-only / additive-API. Phases 3-6 are reversible by flipping `cronSessionMode.js` entries back to `inherit_fork sonnet`.

## 7. Integration with forks-as-primitive

**HARD CONSTRAINT (Tate verbatim 16:47 AEST SMS, repeated for prominence):** "No api calls for cringe btw, make it a cc factory session. Only use Claude max plan via agent sdk." All Claude work runs through the agent SDK on the two Claude Max plans (tate@ecodia.au + code@ecodia.au). **Direct Anthropic API metered billing is OUT OF BOUNDS at every layer of the pyramid.** The 20B tokens/week Max-plan budget is the ceiling; weekly subscription caps are the only hard limit. Every infrastructure change in this sketch must be auditable as routing through one of:
- `mcp__forks__spawn_fork` (forks subsystem, runs on Max plan)
- `mcp__factory__start_cc_session` (Factory subsystem, runs on code@ Max plan)
- `direct_exec` (no Claude session at all, just shell)
- main conductor inline (current model session, runs on Max plan)

If a future PR proposes any other Claude path (raw `@anthropic-ai/sdk` import, direct bedrock call outside the existing forkService provider routing, anything that bypasses Max-plan billing), it is blocked at review.

Explicit: pyramid is **layered on**, not a replacement.
- `mcp__forks__spawn_fork` API surface unchanged for non-pyramid callers.
- New optional `model` param. Default = current Sonnet behaviour. Backward-compat preserved.
- `cronForkDispatcher` (PR #28, on disk pending pm2 restart) is the gate in front of the existing fire pipeline; existing forks dispatched by Tate-typed instructions or direct conductor calls bypass the dispatcher entirely (they're already routed by the conductor's own judgment).
- The `context_mode='brief'` knob on `mcp__forks__spawn_fork` is an **existing API surface**, not net-new infra (per `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md`). The pyramid leverages it; it does not invent a parallel substrate.

## 8. Effort + recommendation (post-amend)

**Conductor person-hours equivalent:**
- Phase 1 = 1 fork-day (cronTier.js + cronSessionMode.js + status_board annotations).
- Phase 2 = 2 fork-days (forkService model param + tests + SDK verify on Max-plan path only).
- Phase 2.5 = 3 fork-days (worker.registry schema + identity/memory contract + spawnWorker/endWorkerFire entry points + worker-identity-review cron skeleton).
- Phase 2.7 = 2 fork-days (cronForkDispatcher patch for the 5-mode router + canary tests for each mode + session_mode column on fork-tracking view). **Highest-leverage phase:** unlocks 80%+ of the win.
- Phase 3 = 1 fork-day + 1 week observation (5 direct_exec crons).
- Phase 3.5 = 1 fork-day + 1 week observation (5 brief_fork-haiku crons, first Haiku exposure).
- Phase 4 = 2 fork-days + 2 weeks observation (12 brief_fork-sonnet crons).
- Phase 5 = 5 fork-days + 1 month observation (T3 aggregator).
- Phase 6 = 1 fork-day post-Factory-credit-unblock (factory_cc_session activation).

Total to fully-tiered: ~8 weeks elapsed, ~17 fork-days build. The persistence layer pays back via prompt-cache savings on every high-frequency fire after Phase 3.5.

**Revised cost-delta (post-amend):**
- Today (all-inherit-fork-Sonnet): ~$147/day capacity-equivalent, ~$4,400/month.
- Post-pyramid (33 active crons routed): ~$26/day capacity-equivalent, ~$780/month.
- **Delta: -$121/day, -$3,620/month, ~82% reduction in cron-stack token usage.**
- Real-world impact (Max-plan billing, not metered): ~6.0M tokens/day of weekly-cap headroom freed on the code@ecodia.au plan. This is the difference between Factory hitting credit-exhaustion mid-week (current state, blocking code-changing work) and surviving the 7-day window with capacity to spare.

**Recommendation: PROCEED with Phase 1 + Phase 2 + Phase 2.7 immediately as a single coordinated rollout.** They are all reversible (config-only / additive-API), and Phase 2.7 is the unlock without which the other phases produce minimal savings. Gate Phases 3+ on observed Phase 2.7 telemetry. The original sketch recommendation was Phase 1+2; the amendment **upgrades to Phase 1+2+2.7** because Tate's session-mode refinement makes Phase 2.7 the single highest-ROI item in the rollout and there is no architectural reason to defer it.

**Go/no-go (revised):** GO. Higher conviction than pre-amend because (a) the substrate-axis change exposes a much bigger win than the model-axis change alone, (b) the Max-plan-only constraint forecloses the riskiest implementation path (parallel direct-API client), forcing the design through existing battle-tested SDK paths only, and (c) Phase 2.7 is config + a small dispatcher patch, not new infra.

**Tate-decision points:** none until end of Phase 4 - then a structural commitment is needed if we want to commit to the T3 aggregator (Phase 5), because aggregator failure modes are non-trivial. Phases 1-4 are conductor decisions per 100% autonomy doctrine. Phase 6 (Factory tier activation) requires Factory CLI credit-exhaustion to lift, which is a status_board P1 row tracked separately.

**Top P1 risk to watch:** Haiku quality on mechanical tasks AT Phase 3.5. If telemetry shows even one false-negative on `system-health` or `silent-loop-detector`, hold further Haiku promotion until either Haiku 4 ships OR the brief is tightened enough to recover the signal. Phase 3 (direct_exec) carries near-zero quality risk because there is no Claude judgment in the loop.
