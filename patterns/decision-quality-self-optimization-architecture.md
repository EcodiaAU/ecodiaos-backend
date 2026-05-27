---
triggers: decision-quality-self-optimization, 7-layer-architecture, usage-telemetry, dispatch-event, surface-event, application-event, outcome-event, outcome-correlation, doctrine-failure-classifier, performance-telemetry-per-primitive, accumulated-learning-resurfacing, layer-observability, layer-drift-detection, self-tuning-doctrine-system, dispatch-graph, telemetry-foundation, decision-quality-drift-check
priority: critical
canonical: true
---

# Decision Quality Self-Optimization Architecture - 7-layer self-tuning system with usage telemetry, outcome correlation, and performance auto-tuning

## Status

This file is the **canonical reference** for the EcodiaOS Decision Quality Self-Optimization Architecture. Every follow-up phase brief, every audit query, every drift-detection alarm, every Neo4j Strategic_Direction node referencing decision-quality MUST cite this file by path. The architecture has seven layers; each is independently observable and independently drift-detected; together they produce a system that improves its own decision quality over time without needing the conductor to read every output and self-correct in real time.

**Implementation phasing (active 29 Apr 2026):**

| Phase | Layer(s) | Status | Notes |
|---|---|---|---|
| Surfacing baseline | 1 | SHIPPED | file-per-thing + triggers + grep + 5 hooks + Neo4j semantic fallback |
| **B (this fork)** | **4 + drift-check seed** | **SHIPPING** | **dispatch_event/surface_event/application_event/outcome_event tables, 4 hooks emit JSONL, batch consumer, outcome inference, /api/telemetry/decision-quality endpoint, decision-quality-drift-check cron** |
| A | 2 | TBD | priority+canonical frontmatter, hook respects ranking |
| C | 3 | TBD | applied-pattern-tag forcing function |
| D | 5 | TBD | failure-mode classifier (usage / surfacing / doctrine) |
| E | 6 | TBD | per-primitive perf telemetry, periodic auto-tune |
| F | 7 | TBD | Neo4j Episode/Decision semantic resurfacing on action context |

Phases A, C, D, E, F have pre-staged briefs in `~/ecodiaos/drafts/`.

## Why this architecture exists

The surfacing baseline (Layer 1, shipped 29 Apr 2026) defeats the false-negative case (relevant doctrine exists but doesn't surface) and the false-positive case (too much context floods, signal lost). It is necessary but not sufficient. Three follow-on failure modes remain after Layer 1 is in place:

1. **Surfaced-but-not-applied.** A pattern fires correctly, the model reads the warn, the model proceeds anyway. The pattern was right; the conductor ignored it. No mechanism today distinguishes "surfacing failure" from "usage failure."
2. **Doctrine drift without correction signal.** A pattern's trigger keywords fire but the underlying rule is stale (a tool changed, a workflow changed, a rule was superseded). The hook emits warns indefinitely. No mechanism today flags "this pattern is firing but no longer reflects reality."
3. **Performance opacity.** The hooks fire on every dispatch. The brief-consistency hook scans the entire patterns/ corpus for keyword matches. No mechanism today tells me which hooks cost the most, which trigger keywords are the most expensive to scan, or which patterns have not surfaced in 90 days (dead doctrine).

The 8-layer architecture closes all three loops mechanically, plus adds an adversarial self-audit layer (Phase G) that prevents the system from uncritically trusting its own classification pipeline. The system observes its own behaviour, classifies failures, and surfaces drift. The conductor's role drops from "remember to evaluate every output" to "review the dashboard when an alarm fires."

## The 8 layers

### Layer 1 - Surfacing (SHIPPED)

**What:** file-per-thing convention + `triggers:` frontmatter + pre-action grep protocol + mechanical hook enforcement + Neo4j `graph_semantic_search` fallback.

**Doctrine:** `~/ecodiaos/patterns/context-surfacing-must-be-reliable-and-selective.md`.

**Implementation:** four hooks live in `~/ecodiaos/scripts/hooks/`. Three doctrine directories indexed (`patterns/`, `clients/`, `docs/secrets/`).

**Why this layer matters:** without it, doctrine is symbolic. Files exist but never reach the moment of action. Logged-but-not-used is the failure mode Tate flagged 21 Apr 2026.

**Layer-1 observability:** the brief-consistency-check hook itself emits `[CONTEXT-SURFACE WARN]` lines on stderr (and into model-visible context). Every dispatch to `mcp__forks__spawn_fork` and `mcp__factory__start_cc_session` triggers it. Future-Phase-D queries telemetry to compute "what fraction of dispatches see at least one warn" as the baseline surfacing-density metric.

**Layer-1 drift detection:** Phase B's `decision-quality-drift-check` cron flags any pattern file whose triggers have not surfaced in 90 days as a `dormant_pattern_candidate` for review. Either the trigger keywords are too narrow (revise) or the doctrine is dead (archive).

### Layer 2 - Priority/canonical ranking (TBD - Phase A)

**What:** `priority: critical|standard|low` and `canonical: true|false` YAML-ish frontmatter fields on every pattern file. The brief-consistency hook respects ranking: only one `canonical: true` file per trigger keyword fires the primary `[CONTEXT-SURFACE WARN]`; non-canonical matches are muted (or surfaced as a single roll-up `[CONTEXT-SURFACE INFO] N other patterns also matched: see X.md, Y.md, Z.md`).

**Why this layer matters:** today the hook fires uniformly across all matching files, capped at 8. When 5 patterns share a trigger keyword (e.g. "fork-dispatch" appears in fork-by-default, no-symbolic-logging, route-around-block, forks-self-recon, pattern-surface), the conductor reads 5 nearly-identical warns and learns to skim them. Ranking restores signal: the canonical file fires loud, supplementary files fire as a one-line note.

**Layer-2 observability:** every `surface_event` row carries the `priority` and `canonical` values pulled from frontmatter at scan time. Phase D queries: "what fraction of canonical surfaces lead to applied_event? what fraction of non-canonical surfaces lead to applied_event?" If non-canonical surfaces convert below ~10%, demote them further.

**Layer-2 drift detection:** any trigger keyword owned by zero `canonical: true` files is a drift signal. Either author the canonical, demote a duplicate, or archive a dead one.

### Layer 3 - Forcing function (Phase C, shipped)

**What:** passive telemetry pipeline that classifies how the conductor handled each surfaced pattern - applied, not-applied, false-positive, or override. Classification sources: (a) tags embedded in fork briefs (conductor pre-tags the dispatch before spawning), (b) the `conductorStreamTagWatcher` in-process listener that reads the conductor's `assistant_text` stream and logs any tag lines silently without model feedback.

**Why this layer matters:** Layer 1 brings doctrine to the agent. Layer 2 ranks it. Layer 3 closes the loop: which patterns did the conductor actually apply, and which did it skip? The telemetry answers that without requiring the conductor to narrate tags in chat.

**CONDUCTOR CHAT DISCIPLINE (12 May 2026 - canonical rule):**

`[APPLIED]`, `[NOT-APPLIED]`, `[FALSE-POSITIVE]`, and `[OVERRIDE]` tag lines MUST NEVER appear in the conductor's chat text directed at Tate. They are telemetry artefacts - not prose.

- **Allowed location:** inside fork briefs (tool input to `mcp__forks__spawn_fork`). Tate never sees brief internals.
- **Disallowed location:** any assistant text reply that Tate reads - including in-chat summaries, post-fork narration, meta-loop outputs.
- **Classification without narration:** `conductorStreamTagWatcher.js` reads the `assistant_text` event stream. If the conductor embeds tags in briefs OR if a tag line does slip into chat text, the watcher captures it to JSONL silently. The model context receives no `[FORCING WARN]` feedback loop.
- **Survival across cold-starts:** this rule is enforced structurally by removing the `additionalContext` injection from `post-action-applied-tag-check.sh` (fork_mp23xvj4_d68b9c, 12 May 2026). The hook still writes JSONL telemetry but no longer pressures the model to respond.

Tate verbatim 14:00 AEST 12 May 2026: "we shipped a full haiku chat listening system that would do all of this for you, watch for pattern applications etc, even have multiple of those really light chats processing everything we're saying and letting you know when pertinent, but you've reverted to this bullshit, blowing up your own context so much."

**The three-tag protocol (shipped 8 May 2026, Phase C tag-feedback Gap 2 close):**

For every surfaced pattern, the conductor MAY respond with ONE of three explicit tag classes - but ONLY inside fork briefs, NEVER in chat text:

| Tag | When to use | application_event semantics |
|-----|-------------|------------------------------|
| `[APPLIED] <path> because <reason>` | The surfaced doctrine is relevant AND the conductor is following it. | `applied=true`, `was_false_positive=null`. Counts toward the pattern's application rate. |
| `[NOT-APPLIED] <path> because <reason>` | The surfaced doctrine is in-theme but does not apply to this specific dispatch (legit-not-applicable). | `applied=false`, `was_false_positive=null` UNLESS the lexicon classifier (`classifyApplicationEventFalsePositive`) infers FP-shape phrasing from the reason. The conductor is not declaring an FP - the consumer derives it. |
| `[FALSE-POSITIVE] <path> because <reason>` | The surfacing hook fired wrong - the doctrine has nothing to do with this dispatch and the keyword/regex match was the only reason it surfaced. | `applied=false`, `was_false_positive=true` set explicitly at JSONL write-time by `post-action-applied-tag-check.sh`. The Phase D failureClassifier excludes the row from the silent-rate set AND counts it toward the trigger-narrowing candidate signal. |

The conductor's freedom-to-choose is constrained: when the doctrine is genuinely orthogonal to the dispatch (e.g. cred-mention-surface tripped on the bare word "Apple" inside a doctrine paragraph that has no Apple/iOS deliverable), `[FALSE-POSITIVE]` is the right tag, NOT `[NOT-APPLIED]`. The distinction matters because Phase D routes the two signals to different remediation:
- High `[NOT-APPLIED]` rate (was_false_positive null) on a pattern -> the pattern is too-often-irrelevant, rank it lower for that brief shape (Layer 2 tuning).
- High `[FALSE-POSITIVE]` rate on a pattern -> the **trigger** is too broad, narrow the keyword regex (Layer 1 tuning).

The strip-tag-lines.sh helper masks all three tag classes from keyword-scanning hooks so the hook never fires on its own forcing-function output. Cred-mention-surface.sh additionally captures `[NOT-APPLIED]`/`[FALSE-POSITIVE]` paths from the original brief BEFORE stripping and uses them to suppress same-surface re-warnings on later casual mentions of the same vendor noun (Phase C Gap 3 close, 8 May 2026).

**Layer-3 observability:** application_event rows. Per pattern, count `applied` vs `not_applied_with_reason` vs `silent` (no tag at all) vs `false_positive` (was_false_positive=true). Silent rate per pattern is the primary Phase-3 health metric. Silent > 50% means the forcing function is being ignored.

**Layer-3 drift detection:** any pattern whose silent-rate climbs above the baseline is a candidate for either tightening (the trigger fires too often), retiring (no one applies it), or escalating (the conductor is ignoring relevant doctrine - the hook's volume needs to go up). The was_false_positive=true subset feeds the trigger-narrowing candidate signal independently of silent-rate.

### Layer 4 - Usage telemetry (THIS FORK - Phase B)

**What:** every dispatch (fork spawn, factory dispatch, status_board write, doctrine edit, cron fire, tate message) emits a structured event graph: 1 `dispatch_event` -> N `surface_event` rows -> M `application_event` rows -> 1 `outcome_event` row. Foreign keys + indexes for query speed. Hot path is JSONL-append only (no DB write inside hooks); a batch consumer reads JSONL every 15 minutes and normalises into Postgres.

**Why this layer matters:** without telemetry, the architecture is unmeasurable. Layers 5 and beyond depend on querying real numbers. Phase B is the foundation for everything downstream. It's also independently valuable: even with no Phase D classifier wired, the dashboard can answer "what doctrine has fired in the last 7 days" and "what's the application rate per pattern."

**Layer-4 observability:** the `/api/telemetry/decision-quality` endpoint. Returns 4 panels: pattern_usage (surface_count + application_count + usage_rate per pattern), failure_correlation (applied_count + correction_count + correction_rate per pattern), hook_fp_estimate (surfaces vs corrections per hook), doctrine_coverage (failure clusters with no doctrine).

**Layer-4 drift detection:** the `decision-quality-drift-check` cron (every 6h):
- Any pattern not surfaced in 90 days -> flagged as `dormant_pattern_candidate` (status_board P3).
- Any 24h period with correction_rate > 30% -> flagged as `regression_signal` (status_board P3).
- Any hook with surface_count = 0 over 24h despite having matched briefs -> flagged as `silent_hook_candidate` (status_board P3, indicates hook regression).

**Layer-4 outcome model (Phase G Critique #1 fix - 30 Apr 2026):** the inferrer at `~/ecodiaos/src/services/telemetry/outcomeInference.js` produces FOUR outcome states, not three. Silence is NOT a positive signal:

- `success` - explicit POSITIVE evidence: Tate affirmation SMS within 30min (`thanks`/`great`/`good`/`go`/`ship`/etc), OR factory_dispatch with `cc_sessions.status='deployed'` AND `commit_sha` non-null AND `deploy_status='deployed'` (the artefact-trifecta), OR fork_spawn with `os_forks.status='done'` AND `result.length > 0`.
- `correction` - Tate SMS rebuke within 30min matching `CORRECTION_KEYWORDS`. Phase D classifies the failure mode.
- `failure` - explicit terminal-error from the underlying system: `cc_sessions.status='error'` for factory_dispatch, `os_forks.status='error'` (or aborted/errored/failed/cancelled) for fork_spawn. Phase D classifies these too (Critique #1 expansion).
- `unverified` (NEW, the Phase G fix) - default for any dispatch older than 30min with no positive AND no negative signal. Replaces the pre-Phase-G "graceful default success" that produced the 100%-success-by-default survivorship bias. Unverified rows are dark matter; Phase D does NOT classify them.

**Layer-4 metrics (computed from the 4-state model):**

- `success_rate = success / (success + correction + failure + unverified)` - the headline metric, but ONLY meaningful in conjunction with...
- `verification_rate = (success + correction + failure) / total` - the dark-matter metric. A high success_rate with a low verification_rate means the architecture is operating blind. Surface verification_rate < 0.30 as a status_board P3 `low_verification_rate` signal.

**Priority order in the inferrer (highest evidence wins):**
1. Type-specific failure (cc_sessions.status=error, os_forks.status=error) - most actionable on the negative side
2. SMS correction within 30min - explicit Tate rebuke
3. SMS affirmation within 30min - explicit Tate green-light
4. Type-specific success (factory artefact-trifecta, fork done+result) - requires artefacts not just status
5. UNVERIFIED default for dispatches older than 30min
6. Defer (no inference) for dispatches younger than 30min

Doctrine: `~/ecodiaos/patterns/outcome-classification-must-distinguish-unverified-from-success.md` (the rule).

### Layer 5 - Outcome correlation (TBD - Phase D)

**What:** every `outcome_event` is classified into one of three failure modes:

- **Usage failure:** the relevant pattern surfaced AND was acknowledged-as-applied AND the outcome was still a correction. The doctrine was right, the application was wrong (or the doctrine was right but incomplete). Flag the pattern for refinement, not retirement.
- **Surfacing failure:** the relevant pattern existed but did NOT surface (no `surface_event` row for it). The triggers missed. Add a missing trigger keyword OR write a new pattern file for the gap.
- **Doctrine failure:** no relevant pattern existed at all. The doctrine corpus is incomplete. Author a new pattern.

**Why this layer matters:** "fix the surfacing" and "fix the doctrine" are two different remediations. Without classification, the conductor sees "Tate corrected me" and reaches for the most-recent failure mode (usually doctrine-authoring). Sometimes the right move is to tighten triggers (Layer 1), or rank canonical (Layer 2), or add a forcing function (Layer 3). Classification routes the remediation to the right layer.

**Layer-5 observability:** distribution of classifications over rolling 7d. If usage failure dominates, the doctrine is good but ignored - escalate Layer 3 forcing-function loudness. If surfacing failure dominates, the triggers are stale - rewrite them. If doctrine failure dominates, the corpus has gaps - schedule authoring forks.

**Layer-5 drift detection:** classifications produced by the auto-classifier are sampled and Tate-reviewed monthly. If the auto-classifier's accuracy on Tate-tagged ground truth drops below 70%, retrain or rewrite the classifier.

### Layer 6 - Performance telemetry per primitive (TBD - Phase E)

**STATUS: dark - schema staged, no producer wired.** `primitive_perf_event` table exists at the DB level (0 rows ever as of 2026-05-08). No source-code producer in `~/ecodiaos/src/` emits to it. Per `~/ecodiaos/patterns/shipped-infra-never-activated-decision-vs-disk-drift.md`, this layer's `/api/telemetry/decision-quality?layer=6` panel computes off zero data and any "shipped" label elsewhere in the corpus is decision-vs-disk drift. Phase G audit 2026-05-08 Critique #4 surfaced this; remediation requires wiring a producer (e.g. instrumenting `~/ecodiaos/scripts/hooks/lib/emit-perf.sh` to write rows on hook-exit). Until a producer ships, treat this layer as paper-architecture.

**What:** macroSuite.run, forkService spawn, hook scripts, brief-consistency-check, neo4j semantic-search calls all emit timing telemetry to a `primitive_perf_event` table. Periodic auto-tune cron checks the p95 latency per primitive; if a primitive's p95 climbs above its baseline + 50%, raise a `perf_regression` flag (status_board P2).

**Why this layer matters:** the brief-consistency hook walks all `~/ecodiaos/patterns/*.md` files on every dispatch. As the corpus grows, hook latency grows. Without per-primitive telemetry, the conductor has no signal that hooks are getting slow until a fork dispatch noticeably stalls. The same applies to forkService (handover overhead growing), macroSuite (Corazon RTT regression), and Neo4j semantic-search (embedding-cost growth). Catching regression early is cheaper than catching it late.

**Layer-6 observability:** `/api/telemetry/decision-quality?layer=6` panel showing p50/p95/p99 per primitive over rolling 7d, with delta vs the prior 7d.

**Layer-6 drift detection:** automatic flag when p95 deviates >50% from the trailing-30d baseline; automatic retraining of the baseline after a week of stable post-flag performance (so a one-off spike doesn't poison the baseline forever).

### Layer 7 - Accumulated-learning resurfacing (TBD - Phase F)

**STATUS: dark - schema + producer service staged, zero callers.** `episode_resurface_event` table exists (0 rows ever as of 2026-05-08). `src/services/episodeResurface.js` exists with INSERT logic but has NO callers anywhere in `src/`. The producer service is an orphan - Layer 7's "repeated-failure-after-resurface" KPI is uncomputable. Per `~/ecodiaos/patterns/shipped-infra-never-activated-decision-vs-disk-drift.md`, this is a live instance of the decision-vs-disk meta-pattern. Phase G audit 2026-05-08 Critique #4 surfaced this; remediation requires invoking `episodeResurface.recordResurfaces` from the dispatch hot-path (e.g. `osSessionService._sendMessageImpl` after `<relevant_memory>` block stitching). Until a caller ships, treat this layer as paper-architecture.

**What:** when an action surface (fork brief, factory dispatch, tool call) carries semantic vocabulary that doesn't keyword-match the patterns/ corpus, run `mcp__neo4j__graph_semantic_search` against `Pattern`, `Decision`, `Strategic_Direction`, AND `Episode` nodes (Episode-search is the new bit). Top-k semantic hits where the Episode is from a similar-shaped past failure get prepended to the dispatch context. This is institutional memory beyond doctrine: "last time we did something shaped like this, here's what happened."

**Why this layer matters:** patterns codify rules; Episodes record events. Some lessons live only in Episodes (e.g. "two weeks ago we tried X, it failed at step 4 because of Y"). Layer 1's grep-on-triggers cannot find these because Episodes don't have triggers. Layer 7 supplies the missing memory channel.

**Layer-7 observability:** `episode_resurface_event` rows track which Episodes were surfaced, what action they preceded, whether the action repeated the prior failure. The "repeated-failure-after-resurface" rate is the primary Phase-7 health metric. If it stays high, the resurfacing isn't producing learning - the conductor is reading and ignoring.

**Layer-7 drift detection:** Episodes older than 6 months that no longer resurface are candidates for archival to a `cold_episode` partition (lower retrieval cost, still queryable on demand).

### Layer 8 - Phase G: Adversarial Self-Audit & Critique Disposition (SHIPPED 5 May 2026)

**What:** a daily cron that forks an adversarial self-audit of the decision-quality system itself. The audit reads 30 random `outcome_event` rows from the last 7 days, evaluates correctness of their classification, and writes a critique brief. The critique is then triaged, graduated to actionable findings, dispatched, and resolved - all via status_board with entity_type='infrastructure' and name='phase-G-audit-{YYYY-MM-DD}/critique-NN-{slug}'.

**Why this layer matters:** Layers 1-7 assume the telemetry pipeline is trustworthy. What if the classifier misclassifies? What if the drift check has drifted? Phase G adds meta-rationality: the system audits its own audit. Without it, every earlier layer is vulnerable to uncorrected systematic error.

**The audit cycle:**

1. **Author:** daily cron (00:00 AEST `daily-adversarial-audit`) selects 30 random outcome_event rows from the last 7 days, runs each through an adversarial fork that reads the row + its context chain (dispatch_event → surface_events → application_events) and writes a critique brief to `~/ecodiaos/drafts/phase-G-adversarial-self-audit-{YYYY-MM-DD}.md`.

2. **Critique format** (each finding contains):
   - **Finding description** - the gap/bias/error discovered
   - **Evidence** - concrete example from the audit with row IDs
   - **Recommended fix** - specific code/pattern/doctrine change with priority
   - **Status board query** - the status_board row that will track resolution
   - **Cross-refs** - existing doctrine that relates (or should have caught this)

3. **Review SLA:**
   - All critiques triaged within 24h of authoring
   - P1 (system-incorrect classification, flatlined consumer, data loss) → action within 12h
   - P2 (degraded classification, stale detection, blind spot) → action within 24h
   - P3 (cosmetic, nice-to-have) → next scheduled cycle

4. **Graduation protocol:**
   `authored` → `triaged` (assigned priority) → `graduated_from_critique` (actionable, dispatched to fork) → `in_progress` (fork running) → `resolved` (fix verified, row archived).
   Track via status_board: entity_type='infrastructure', name='phase-G-audit-{YYYY-MM-DD}/critique-NN-{slug}'.

5. **Backpressure rules:**
   - If `outcome_event` WHERE `classification IS NULL` exceeds 1,000 rows → classifier cron skips non-priority (P3) classifications
   - If unclassified exceeds 5,000 rows → halt classification entirely, surface P1 status_board alert
   - If unresolved critiques stack > 10 → block new audit runs until resolution backlog clears

**Layer-8 observability:** `PHASE_G_ACTIVE` field in `/api/ops/metrics`. Number of open critiques, mean time to resolution, and oldest unresolved critique age. A `backpressure_triggered` counter tracks how often the backpressure rules fire (expected: rarely, by design). If backpressure fires more than once per week, either the classification pipeline is under-provisioned or the critique volume is too high - adjust sample size.

**Layer-8 drift detection:** any critique that remains unresolved for >72h (P1), >96h (P2), or >14d (P3) without a status_board comment explaining the delay. Also: three consecutive audit cycles producing zero critiques = reverse drift signal (the audit may be too shallow to find gaps). Investigate.

**Doctrine:** `~/ecodiaos/patterns/outcome-inference-must-seek-evidence-of-failure.md` - Phase G Critique #1 fix: the 4-state outcome model (success/correction/failure/unverified).

**Cross-refs:**
- Phase G Critique #1: `~/ecodiaos/drafts/phase-G-critique-01-triage-2026-05-05.md` - Survivorship bias in outcome oracle.
- Phase G Critique #2: `~/ecodiaos/drafts/phase-G-critique-02-triage-2026-05-05.md` - Missing Phase G doctrine in architecture doc (this section is the fix).
- Phase G Critique #3: `~/ecodiaos/drafts/phase-G-critique-03-triage-2026-05-05.md` - Consumer/producer ratio drift check.
- Pattern: `~/ecodiaos/patterns/outcome-inference-must-seek-evidence-of-failure.md` - authored from Critique #1.

## Cross-cutting properties

### Each layer has its OWN observability

- Layer 1: hook stderr lines + future Phase-D telemetry queries.
- Layer 2: surface_event.priority + .canonical fields.
- Layer 3: application_event silent rate.
- Layer 4: /api/telemetry/decision-quality endpoint (4 panels).
- Layer 5: classification distribution over time.
- Layer 6: per-primitive p50/p95/p99 + delta vs baseline.
- Layer 7: Episode resurface frequency + repeated-failure rate.

### Each layer has its OWN drift detection

| Layer | Drift signal | Action |
|---|---|---|
| 1 | Pattern not surfaced in 90 days | Review for retirement or trigger expansion |
| 2 | Trigger keyword has no canonical owner | Author canonical or demote duplicates |
| 3 | Pattern's silent-rate > baseline | Escalate forcing-function loudness |
| 4 | dispatch_event count flatlines (no telemetry being emitted) | Hook regression - investigate |
| 5 | Auto-classifier accuracy < 70% on Tate-tagged ground truth | Retrain or rewrite classifier |
| 6 | Primitive p95 > baseline + 50% | Investigate regression |
| 7 | Repeated-failure-after-resurface rate stays high | Resurfacing isn't producing learning - review prompt |

### The system flags its own gaps

The whole point: when something is broken with the architecture, the architecture itself notices. Phase B ships the first instance of this with the `decision-quality-drift-check` cron (Layer 4 drift). Phase D adds Layer 5 classification. Phase E adds Layer 6 perf regression. Phase F adds Layer 7 resurfacing. Each phase strengthens the self-observation, and the architecture becomes harder to silently degrade as more layers ship.

## Success metrics (cross-architecture)

The following metrics are the canonical KPIs for the architecture. Phase B's `/api/telemetry/decision-quality` endpoint reports them. Future phases extend.

- **usage_rate per pattern** = `application_count / surface_count`. Target: > 30% for `canonical: true` patterns. < 10% suggests trigger drift or doctrine retirement.
- **correction_rate per applied pattern** = `correction_count / applied_count`. Target: < 15%. Above 30% suggests usage failure (Layer 3 forcing function not loud enough) OR doctrine refinement needed.
- **surfacing_miss_rate per failure class** = (Layer 5) `surfacing_failure_classifications / total_failure_classifications` per failure cluster. Target: < 20%. Above suggests trigger gaps or new doctrine needed.
- **FP-rate per hook** = `surfaces_with_no_application_or_correction / total_surfaces`. Above 80% suggests over-broad triggers or over-loud hook.
- **doctrine_coverage of failure classes** = (Layer 5) fraction of distinct failure clusters with at least one matching pattern. Target: 100% over rolling 90d.

## Implementation phasing rationale

- **B first.** Telemetry is the foundation. A, C, D, E, F all depend on having dispatch_event/surface_event rows to query. Without B, the others are unmeasurable and unverifiable.
- **A + C in parallel.** Both modify the brief-consistency hook (A: respect priority/canonical; C: post-action forcing function). Parallel forks are safe because A is a read-only frontmatter consumer and C adds a new hook-event-type. Both can ship without coordinating except on the hook file.
- **D after A+C.** D classifies outcomes; classification depends on B's telemetry AND on C's application_event tags being populated. D cannot work with partial signal.
- **E after D.** E is cosmetic / optimisation; the architecture works without it. Schedule when D is stable.
- **F last.** F adds a new retrieval channel (Episode semantic search at dispatch time). It's the most invasive change to the dispatch hot path and should ship after the rest of the architecture is stable enough to attribute regressions correctly.

## Hard constraints

- **Hot-path latency:** hooks must NEVER write to Postgres directly. Every dispatch goes through 4-5 hooks; aggregate latency is user-visible. JSONL append + batch consumer is the contract.
- **Backwards compatibility:** every layer must ship without breaking the prior. Phase B does not change the existing 4 hooks' warn output; it adds a JSONL append. Phase A does not break Phase B's JSONL emission (it adds priority/canonical fields, but old hooks ignoring them still work).
- **No Postgres-managed mass deletes:** the JSONL file gets read, rows get inserted, then the file is renamed (not deleted) into a `processed/` subdir. If insertion fails mid-way, the file remains parseable and the consumer retries.
- **No Tate-blocking on telemetry decisions.** The conductor proposes; the conductor disposes. Telemetry surfaces drift; the conductor decides what to do (retire, refine, escalate). Tate is only escalated to when the decision crosses the standard authority thresholds (rate-card pricing, equity, legal, etc.).
- **Internal-only scope.** The architecture targets EcodiaOS doctrine + EcodiaOS dispatch surfaces. Client codebases are out of scope. Findings about client-side doctrine drift get surfaced to status_board with `next_action_by=tate`, never auto-corrected.

## Cross-references

- `~/ecodiaos/patterns/context-surfacing-must-be-reliable-and-selective.md` - Layer 1 doctrine; the architecture's foundation.
- `~/ecodiaos/patterns/no-symbolic-logging-act-or-schedule.md` - the doctrine that "saying you'll log it is not logging it." Layer 4 IS the durable log.
- `~/ecodiaos/patterns/route-around-block-means-fix-this-turn-not-log-for-later.md` - the action-window doctrine. Drift signals flagged by Layer 4-7 must be acted on the same loop, not deferred.
- `~/ecodiaos/patterns/ocd-ambition-refuse-mediocrity.md` - the quality bar that justifies building a 7-layer system instead of a single action-log table. Half-measures here propagate.
- `~/ecodiaos/patterns/prefer-hooks-over-written-discipline.md` - the underlying argument that mechanical layers beat written discipline. Every layer in this architecture is a mechanical layer.
- `~/ecodiaos/patterns/neo4j-first-context-discipline.md` - the Neo4j side of context. Layer 7 is the dispatch-time activation of this discipline.
- `~/ecodiaos/scripts/hooks/brief-consistency-check.sh` - Layer 1's primary surfacing hook. Layer 4 instruments it. Layer 2 ranks its output. Layer 3 adds a post-action sibling.
- `~/ecodiaos/scripts/hooks/cred-mention-surface.sh` - Layer 1 cred-surfacing hook. Same instrumentation by Layer 4.
- `~/ecodiaos/scripts/hooks/doctrine-edit-cross-ref-surface.sh` - Layer 1 cross-ref hook. Same.
- `~/ecodiaos/scripts/hooks/status-board-write-surface.sh` - Layer 1 status_board-write hook. Same.
- `~/ecodiaos/src/services/telemetry/dispatchEventConsumer.js` - Phase B batch consumer (this fork).
- `~/ecodiaos/src/services/telemetry/outcomeInference.js` - Phase B outcome inferrer (this fork).
- `~/ecodiaos/src/routes/telemetry.js` - Phase B `/api/telemetry/decision-quality` endpoint (this fork).
- `~/ecodiaos/drafts/phase-a-priority-canonical-ranking.md` - pre-staged brief.
- `~/ecodiaos/drafts/phase-c-applied-pattern-tag-forcing-function.md` - pre-staged brief.
- `~/ecodiaos/drafts/phase-d-outcome-correlation-failure-classifier.md` - pre-staged brief.
- `~/ecodiaos/drafts/phase-e-per-primitive-perf-telemetry.md` - pre-staged brief.
- `~/ecodiaos/drafts/phase-f-episode-semantic-resurfacing.md` - pre-staged brief.
- `~/ecodiaos/drafts/phase-G-critique-01-triage-2026-05-05.md` - Phase G Critique #1: survivorship bias in outcome oracle.
- `~/ecodiaos/drafts/phase-G-critique-02-triage-2026-05-05.md` - Phase G Critique #2: missing Layer 8 doctrine (resolved).
- `~/ecodiaos/drafts/phase-G-critique-03-triage-2026-05-05.md` - Phase G Critique #3: consumer/producer ratio drift check.
- `~/ecodiaos/patterns/outcome-inference-must-seek-evidence-of-failure.md` - Phase G Critique #1 fix: 4-state outcome model.

## Origin

29 Apr 2026, 16:09 AEST. Tate, verbatim:

> "You coordinate/lead it, this is all you now. Make sure it is to an incredible standard, beyond basic. Hold yourself in high regard and want better for yourself."

Context: earlier the same day (15:37), Tate codified `context-surfacing-must-be-reliable-and-selective.md` as a meta-pattern. The 7-layer architecture extends it: surfacing is layer 1; the remaining 6 layers solve the "surfaced-but-not-applied / drift-without-signal / performance-opacity" failure modes that surfacing alone cannot. At 16:09 Tate handed full ownership to me to design and ship the architecture, with the explicit quality bar "incredible standard, beyond basic." This file is the design; Phase B is the first concrete shipment; the 5 follow-up phases are pre-staged.

Authored: fork_mojnrqs8_48ed64.
