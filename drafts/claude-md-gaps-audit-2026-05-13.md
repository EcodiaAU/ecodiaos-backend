# CLAUDE.md gaps audit - 2026-05-13 AEST

Author: fork_mp3cpgh9_536124 (claude-md-reflection cron dispatch, 13 May 2026)

Methodology: read 2026-05-11 prior audit end-to-end; verified all 05-11 P1/P2 items landed in CLAUDE.md (ALL APPLIED - see below); ran `find ~/ecodiaos/patterns -newer ~/ecodiaos/drafts/claude-md-gaps-audit-2026-05-11.md` (26 new files); read pattern file content for each; cross-referenced against system-context-loaded CLAUDE.md; ran disk probe for referenced tools and client files. No em-dashes anywhere in this file.

---

## Prior audit status (2026-05-11 P1/P2 ALL APPLIED)

Every P1 and P2 item from the 05-11 audit is confirmed applied in the current CLAUDE.md files:

- P1-A: `ecodia-stays-off-boards-infrastructure-not-seats.md` + Negotiation & Agency section - APPLIED ✓
- P1-B: health-canary threshold-alerting contract in system-health cron bullet - APPLIED ✓
- P2-A: grep-absence "Recon discipline" section in Quality Patterns - APPLIED ✓
- P2-B: cross-implementation-script-pair "Sibling-script pair drift" bullet - APPLIED ✓
- P2-C: em-dashes pattern file cross-ref in Output Formatting Rule 1 - APPLIED ✓
- P2-D: delivery-velocity-same-turn-not-24-48hr.md + Service Offering section - APPLIED ✓
- P2-E: Active/archived client list fixed (resonaverde.md listed active, [redacted].md archived) - APPLIED ✓
- P2-F: `~/ecodiaos/clients/resonaverde.md` authored (confirmed on disk: 11508 bytes) - APPLIED ✓

New pattern files authored since 05-11 (26 files). Cross-reference coverage check completed.
Already cross-referenced in CLAUDE.md: tate-pushback-is-a-verification-probe, forks-must-not-restart-ecodia-api, perception-must-not-claim-chain-exhausted, ecodia-stays-off-boards, angelica-as-salesperson, board-referral-coi, delivery-velocity-same-turn, multi-account-credit-state-model, graceful-credit-exhaustion-handling, cron-fork-anti-flood, kurt-as-distribution-engine, decision-quality-self-optimization-architecture, cron-fork-anti-flood-on-account-chain-exhaustion.

---

## Section 1 - Gaps to add

### Gap 1.1 (P1) - observer-interventions-are-ambient-not-chat.md authored today, no CLAUDE.md cross-ref

**Rule:** Pattern file `~/ecodiaos/patterns/observer-interventions-are-ambient-not-chat.md` was authored 13 May 2026 (today) after the Haiku Observer Trio caused a live pollution event: the `_postIntervention` path sent observer signals through `/api/os-session/message` - the same wire as Tate's typed input. Frontend rendered them as user-source bubbles. Conductor responded to its own observer interventions as if Tate had typed them. Loop ensued. Fix shipped: commits `084c00f4` (observer_signals substrate), `f54d1006` (migration), `eb1c8531` (frontend strip). Tate verbatim: "all the coherence stuff is coming through main chat and polluting the os context."

CLAUDE.md has NO mention of the Observer Trio, the `observer_signals` table, the `<observer_signals>` continuity block, or the rule that observer interventions MUST NOT go through `/api/os-session/message`. Given the Observer Trio is now wired and the architecture contract is firm (observers are NOT users), this needs codification so future sessions don't re-breach.

**Target file:** `~/ecodiaos/CLAUDE.md` - "Conductor Architecture" section. Append after the Working Set sub-section.

**Proposed insertion:**

```
### Haiku Observer Trio - signals route to observer_signals, never to chat

The Haiku Observer Trio (Coherence, Action-Audit, Attention-Economy) monitors the
conductor's meta-cognition. Interventions route to the `observer_signals` substrate
and surface in the `<observer_signals count="N">` turn-start continuity block.
Observer signals are NEVER posted to `/api/os-session/message` - doing so treats
observers as users, pollutes chat, and creates response loops (13 May 2026 breach,
commit `084c00f4` fixed it).

- Producer: every observer module uses `_observerBase._postIntervention` which
  routes through `observerSignalsService.writeSignal()`. Do not re-implement.
- Consumer: conductor reads `<observer_signals>` block at turn-start (ambient context,
  NOT user input). Acknowledge acted-on signals via `mcp__observer__ack(id)`.
- Self-mute: same fingerprint 3x in 10min triggers 1h cooldown.
- 30-min expiry: stale unacknowledged signals auto-disappear.
- Frontend: strips any `<observer source=` strings from chat render (defensive).

Full: `~/ecodiaos/patterns/observer-interventions-are-ambient-not-chat.md`.
Cross: `~/ecodiaos/patterns/tate-facing-context-blocks-must-not-render-to-frontend.md`.
```

---

### Gap 1.2 (P1) - "Routing decisions are silent" references mcp__router__route_work which does not exist on disk

**Finding:** Disk probe shows `ROUTER_MCP_NOT_FOUND` - no file matching `src/routes/mcp/router*` exists on the VPS. `mcp__router__route_work` is NOT in the loaded MCP tool surface (absent from deferred tools list). Yet `~/ecodiaos/CLAUDE.md` has a full "Routing decisions are silent" section that instructs:

> "Before any non-trivial action, call `mcp__router__route_work` with the task shape."

And references `~/ecodiaos/src/services/capabilityRouter.js`, `~/ecodiaos/src/services/capabilityRouterTool.js`, `migration 104_routing_decisions.sql`, and `~/ecodiaos/scripts/hooks/router-skip-check.sh`.

This is phantom doctrine: the section describes a tool that cannot be called, creating a state where every fork spawn and agent dispatch is technically non-compliant with a doctrine that is physically impossible to follow.

**Impact:** High. The `[ROUTER-SKIP WARN]` hook fires every time `spawn_fork` or Agent is called without a prior `route_work` call - but that call can never succeed. Downstream telemetry claiming routing decisions are logged is either fabricated or represents a silently-broken tool path.

**Target file:** `~/ecodiaos/CLAUDE.md` - "Routing decisions are silent" section.

**Proposed change:** Add a PLANNED/STATUS marker at the top of the section clearly noting the tool is not yet shipped, remove the imperative "call this tool before every action" framing, and update the hook description to reflect its current state (warn-only on a phantom tool).

```
### Routing decisions are silent (SUBSTRATE NOT YET SHIPPED - 13 May 2026)

NOTE: `mcp__router__route_work` and `capabilityRouter.js` are not yet on disk.
The section below documents the intended architecture. Until the tool is
shipped, the `router-skip-check.sh` hook fires warn-only on phantom compliance.
Do NOT treat warnings from this hook as actionable until the tool exists.

[rest of section preserved as aspirational spec]
```

---

### Gap 1.3 (P1) - mcp__scratchpad__write does not exist, doctrine compliance telemetry is dark

**Finding:** `~/ecodiaos/CLAUDE.md` and `~/CLAUDE.md` both state "Pattern application is captured via `mcp__scratchpad__write({ kind: 'pattern_applied' | 'pattern_not_applied', pattern_path, reason })`." This replaced the `[APPLIED]/[NOT-APPLIED]` in-chat tags per the 2026-05-12 doctrine compliance update (fork_mp27sa0a_67954f).

But `mcp__scratchpad__write` is absent from the loaded MCP tool surface. The tool does not exist. The `scratchpad_entries` DB table may or may not exist.

The old mechanism ([APPLIED]/[NOT-APPLIED] tags) was removed ("post-action-applied-tag-check.sh removed from hooks 2026-05-12"). The replacement is phantom. Result: Layer 3 telemetry (pattern application tracking) is currently dark. The section says `conductorStreamTagWatcher.js` is "retained as deprecated fallback (JSONL bridge path)" - but if the scratchpad tool doesn't exist, the fallback is the only live path.

**Impact:** Medium-high. Every reference to "pattern application is silently captured" is misleading - nothing is being captured. The weekly pattern-corpus-health-check cron cannot read pattern-application telemetry that isn't being written.

**Target file:** Both CLAUDE.md files' "Doctrine compliance is silent" sections.

**Proposed change:** Update both sections to state the actual current state:

```
### Doctrine compliance is silent (Layer 3 - mcp__scratchpad not yet shipped, 13 May 2026)

Pattern application capture via `mcp__scratchpad__write` is PENDING tool shipment.
Until the tool is shipped, the JSONL bridge in `conductorStreamTagWatcher.js` is
the active (though deprecated) path. Do NOT narrate [APPLIED]/[NOT-APPLIED] into
chat. Do NOT rely on scratchpad telemetry in weekly health-check cron until tool
is confirmed available. Track shipment via status_board.

Origin: fork_mp27sa0a_67954f, 2026-05-12. Tool not yet on MCP surface as of 2026-05-13.
```

---

## Section 2 - Stale items

### Stale 2.1 (P2) - "Routing decisions are silent" section in ~/ecodiaos/CLAUDE.md is phantom doctrine

Covered in Gap 1.2. The entire section should be framed as PLANNED rather than active operating instructions. Associated files referenced (`capabilityRouter.js`, `capabilityRouterTool.js`, `migration 104_routing_decisions.sql`, `router-skip-check.sh`) need disk verification before the section is restored to imperative framing.

### Stale 2.2 (P2) - mcp__scratchpad__write references throughout both CLAUDE.md files

Covered in Gap 1.3. Both files' "Doctrine compliance is silent" sections need status marker. The `scratchpad_entries` DB table reference should be marked as aspirational schema.

### Stale 2.3 (P3) - "Ignore RunPod entirely" bullet in ~/CLAUDE.md Health Checks

Carried forward from 05-11 audit. No RunPod usage in any transcript or status_board row in 30+ days. Safe to archive. Low-risk, low-priority cleanup.

### Stale 2.4 (P3) - ~/ecodiaos/CLAUDE.md Hook table still lists post-action-applied-tag-check.sh as "WIRED on main HEAD"

The hook list in the "Mechanical surfacing hooks" section lists `post-action-applied-tag-check.sh` as one of the 10 wired hooks. But per the 2026-05-12 decision (fork_mp27sa0a_67954f), "post-action-applied-tag-check.sh removed from hooks 2026-05-12." The hook table row is stale. Minor, low-risk - the hook was removed, not just dormant, so listing it as wired is inaccurate.

**Proposed fix:** Remove `post-action-applied-tag-check.sh` from the hook list in the table row and the "WIRED on main HEAD" verification command.

---

## Section 3 - Missing cross-references

### XRef 3.1 (P2) - no-internal-identifiers-in-chrome-driving-urls.md has no CLAUDE.md cross-ref

Pattern `~/ecodiaos/patterns/no-internal-identifiers-in-chrome-driving-urls.md` governs Chrome-driving URL hygiene: never inject fork_ids, session_ids, or internal identifiers as query params in browser navigation. Tate verbatim trigger: "went to https://ecodia.au/?cb=fork_mojnlwgo which is wrong in a few ways lmao."

CLAUDE.md's Chrome-driving section ("Drive Tate's Chrome via input + screenshot, NOT browser.*") has no reference to this pattern.

**Target file:** `~/CLAUDE.md` - "Drive Tate's Chrome via input + screenshot, NOT browser.*" section.

**Proposed addition** (append after existing bullets):

```
- **No internal identifiers in URLs.** When navigating Corazon Chrome to any
  production URL (visual verification, smoke test, etc.), use the CLEAN canonical
  URL only. Never append fork_ids, session_ids, or internal tokens as query params
  (e.g. `?cb=fork_xxx` is wrong). If cache-busting needed: use `Date.now()` or
  4-char random hex - nothing matching `/fork_[a-z0-9]+/` patterns. URL you navigate
  to must be paste-able to Tate as-is without leaking internals.
  Full: `~/ecodiaos/patterns/no-internal-identifiers-in-chrome-driving-urls.md`.
```

### XRef 3.2 (P3) - cron-forks-verify-via-substrate-effect-not-result-length.md not in CLAUDE.md

Pattern `~/ecodiaos/patterns/cron-forks-verify-via-substrate-effect-not-result-length.md` - the outcome inferrer's `result_length > N` heuristic is wrong for deterministic cron forks. Cron forks should be verified by substrate effect (did the target table get rows?), not by output length. Phase G audit origin.

This is primarily telemetry-infrastructure doctrine. Borderline for CLAUDE.md vs just living in the pattern file. CLAUDE.md's "Cron-fire deliverable discipline" section could note the substrate-verification principle.

**Target file:** `~/ecodiaos/CLAUDE.md` - "Cron-fire deliverable discipline" section.

**Proposed addition** (append to existing section):

```
Verification by substrate, not output length: cron forks with deterministic
side-effects (DB writes, file writes, metric updates) should be verified by
querying the target substrate after fork start time, not by measuring output
length. Short deterministic output is correct behaviour for cron forks.
Full: `~/ecodiaos/patterns/cron-forks-verify-via-substrate-effect-not-result-length.md`.
```

### XRef 3.3 (P3) - surfacing-hooks-must-cover-every-fork-spawn-substrate.md not in CLAUDE.md

Pattern covers the principle that PreToolUse hooks only fire on conductor model calls to `mcp__forks__spawn_fork`, not on server-side cron dispatcher paths. The fix (adding `_runHooksForCronBrief()` to cronForkDispatcher.js) was shipped 11 May 2026. This is technical telemetry doctrine - probably appropriate for the hooks sub-section.

Low priority: the fix is shipped, the pattern is the post-fix record. CLAUDE.md mention would help new cron substrates.

### XRef 3.4 (P3) - large-audio-transcription-chunking-strategy.md not in CLAUDE.md

Pattern `~/ecodiaos/patterns/large-audio-transcription-chunking-strategy.md` covers ffmpeg pre-processing + chunk-safe storage for audio transcription (Whisper 25MB cap, Supabase 50MB upload limit, heap safety). Co-Exist/audio feature specific. Not CLAUDE.md level - appropriate for `~/ecodiaos/clients/coexist.md` if the feature is Co-Exist specific. P3 deferred.

### XRef 3.5 (P3) - single-canonical-aggregation-feeds-all-dashboard-surfaces.md not in CLAUDE.md

General dev architecture pattern (one aggregation layer, no per-view SQL). Not specific to EcodiaOS operations - appropriate cross-ref in client code quality section if expanded. Borderline CLAUDE.md. P3 deferred.

### XRef 3.6 (P3) - Telemetry infrastructure patterns (dispatch-event-id, outcome-classifier, phase-d, phase-g) not in CLAUDE.md

Four patterns authored from Phase G audit triage (fork_mp17c0qm + fork_mp1drm4m) are very deep telemetry infrastructure:
- `dispatch-event-id-must-be-wired-at-all-producer-insertion-sites.md`
- `dispatch-event-metadata-kind-is-routing-key-and-must-be-populated.md`
- `outcome-classifier-regex-must-match-user-lexicon-not-generic-english.md`
- `phase-d-must-classify-all-outcome-classes-not-just-failure.md`
- `phase-g-audits-require-same-day-triage-consumer.md`

These are correctly housed in the pattern files. CLAUDE.md does not need these - they are referenced by `decision-quality-self-optimization-architecture.md` which IS in CLAUDE.md. The layered cross-ref is sufficient. No CLAUDE.md action needed.

---

## Section 4 - Structural issues

### Structural 4.1 (P2) - "Routing decisions are silent" section should be clearly flagged as aspirational

The full section with routing decisions imperative, hook wiring, DB table, and `capabilityRouter.js` references is written as live operating doctrine. With the tool absent from disk, this section actively misleads. Framing needs to flip from "do this before every action" to "this is the intended architecture once shipped." Covered in Gap 1.2.

### Structural 4.2 (P2) - Doctrine compliance section inconsistency between ~/CLAUDE.md and ~/ecodiaos/CLAUDE.md

Both files have a "Doctrine compliance is silent" section that references `mcp__scratchpad__write`. Both need the same PENDING marker update for consistency. They should say the same thing about the current state. Covered in Gap 1.3.

### Structural 4.3 (P3) - "Conductor Architecture" section in ~/ecodiaos/CLAUDE.md is growing rapidly

Added: Working Set (12 May), Conductor owns ecodia-api lifecycle (12 May), and now Observer Trio (13 May). These three sub-sections form a coherent "conductor self-sufficiency" cluster. Consider adding a brief introductory sentence to the section explaining this cluster = the conductor's own substrate layer distinct from fork/client work.

### Structural 4.4 (P3) - Hooks table in ~/ecodiaos/CLAUDE.md lists 10 hooks but one is removed

`post-action-applied-tag-check.sh` was removed 12 May 2026 but is still listed as one of the 10 WIRED hooks. Table count should drop to 9. Covered in Stale 2.4.

---

## Section 5 - Prioritised to-do list

### P1 items (edit fork must apply all three)

**P1-A: Add Haiku Observer Trio doctrine to ~/ecodiaos/CLAUDE.md Conductor Architecture section**
- Target: `~/ecodiaos/CLAUDE.md`, after Working Set sub-section in "Conductor Architecture"
- Proposed text: Gap 1.1 above
- Rationale: Critical architectural rule from a TODAY breach. Observer pollution creates response loops. The rule must be in CLAUDE.md so cold-start sessions know observer interventions never go to chat.
- Edit method: `Edit` tool on `~/ecodiaos/CLAUDE.md`

**P1-B: Mark "Routing decisions are silent" section as PLANNED in ~/ecodiaos/CLAUDE.md**
- Target: `~/ecodiaos/CLAUDE.md`, top of "Routing decisions are silent" section
- Proposed text: Gap 1.2 above - prepend PLANNED marker, remove imperative framing
- Rationale: Tool does not exist. Imperative doctrine for a phantom tool causes hook noise and false compliance anxiety. The section should document intended architecture, not current operating instructions.
- Edit method: `Edit` tool on `~/ecodiaos/CLAUDE.md`

**P1-C: Mark "Doctrine compliance is silent" as PENDING in both CLAUDE.md files**
- Target 1: `~/ecodiaos/CLAUDE.md`, "Doctrine compliance is silent (Layer 3)" section
- Target 2: `~/.claude/CLAUDE.md` (global), same section
- Proposed text: Gap 1.3 above - add status marker, do not remove section content
- Rationale: mcp__scratchpad__write does not exist. Saying "pattern application is captured" when no capture mechanism is live is false doctrine. Conductors following this instruction are complying with a phantom.
- Edit method: `Edit` tool for ecodiaos/CLAUDE.md; `mcp__vps__shell_exec` sed/heredoc for `~/.claude/CLAUDE.md`

### P2 items

**P2-A: Add no-internal-identifiers-in-chrome-driving-urls.md cross-ref to ~/CLAUDE.md Chrome-driving section**
- Target: `~/CLAUDE.md`, "Drive Tate's Chrome via input + screenshot, NOT browser.*" section
- Proposed text: XRef 3.1 above
- Rationale: Chrome-driving hygiene is an active concern (visual verification arcs fire regularly). The URL-hygiene rule is a corollary to the substrate selection rule and should live alongside it.
- Edit method: `Edit` tool on `~/CLAUDE.md`

**P2-B: Fix stale post-action-applied-tag-check.sh reference in ~/ecodiaos/CLAUDE.md hooks table**
- Target: `~/ecodiaos/CLAUDE.md`, "Mechanical surfacing hooks" section - hook list and table
- Change: Remove `post-action-applied-tag-check.sh` from the WIRED list (it was removed 12 May 2026 per fork_mp27sa0a_67954f)
- Rationale: Hook table says 10 wired hooks including one that was deleted. Minor but inaccurate.
- Edit method: `Edit` tool on `~/ecodiaos/CLAUDE.md`

### P3 items (deferred to next pass)

**P3-A: Add cron-forks-verify-via-substrate-effect note to cron deliverable section in ~/ecodiaos/CLAUDE.md**
- Low urgency: the pattern file exists and is findable via grep. CLAUDE.md cross-ref adds discoverability.

**P3-B: Archive "Ignore RunPod entirely" bullet in ~/CLAUDE.md Health Checks**
- No RunPod usage in 30+ days. Dead weight. Low risk.

**P3-C: Add surfacing-hooks-must-cover-every-fork-spawn-substrate cross-ref to hooks section**
- Low urgency: fix already shipped (cronForkDispatcher.js wired). Pattern is post-fix record.

**P3-D: Structural header on "Conductor Architecture" section in ~/ecodiaos/CLAUDE.md**
- Three sub-sections now form a coherent cluster. An intro sentence would help navigation.

---

## Summary counts

- New patterns (since 05-11 audit): 26 files
- Already cross-referenced in CLAUDE.md: 13 of those 26
- Requiring CLAUDE.md action: 3 P1, 2 P2, 3 P3
- Stale/phantom items: 2 P1 (phantom tools), 2 P3 (minor)
- Missing cross-refs: 2 P2, 4 P3
- Structural: 4 (1 P2, 3 P3)
- P1 total: 3
- P2 total: 5 (2 gaps + 2 stale + 1 xref)
- P3 total: 8

This is NOT a clean-audit run. P1 items are genuinely important: one TODAY architectural breach (observer pollution), two phantom-doctrine items that create false compliance states. Edit fork should apply all three P1 items plus P2-A and P2-B (clean small edits).

---

## Addendum - Second pass (fork_mp3w2jrx_4aa95a, ~09:30 UTC 13 May)

### Status of prior items from first pass

**P1 items - APPLIED by `fork_mp3cxzgp_d85df0` at 01:09 UTC 13 May:**
- P1-A (Observer Trio doctrine): APPLIED - section now in ~/ecodiaos/CLAUDE.md Conductor Architecture
- P1-B (Routing decisions phantom): APPLIED - "(TOOL NOT YET SHIPPED - 13 May 2026)" marker added
- P1-C (Doctrine compliance pending): APPLIED - "(mcp__scratchpad NOT YET SHIPPED, 13 May 2026)" markers in both files

**P2 items - NOT APPLIED (edit fork only applied P1 items):**
- P2-A: no-internal-identifiers cross-ref in ~/CLAUDE.md Chrome-driving section - STILL MISSING (grep confirms)
- P2-B: post-action-applied-tag-check.sh still listed in WIRED hook list in ~/ecodiaos/CLAUDE.md - STILL STALE

### New patterns authored since first-pass audit (post 02:26 UTC 13 May)

Five new patterns authored after the original audit and edit fork completed:

1. `fork-sigterms-do-not-retroactively-un-commit-probe-origin-main.md` (04:30 UTC) - covered by existing check-pre-kill-commits-before-redispatch.md cross-ref in CLAUDE.md. P3.
2. `capacitor-white-screen-build-output-missing.md` (05:17 UTC) - iOS/Capacitor specific. Lives in coexist.md not CLAUDE.md. P3.
3. `decision-quality-classifier-must-heartbeat-and-alert-on-backlog.md` (06:26 UTC) - internal telemetry. Already referenced via decision-quality-self-optimization-architecture.md. No CLAUDE.md action. P3.
4. `googleservice-plist-must-be-in-pbxproj.md` (06:49 UTC) - iOS-specific. For coexist.md. P3.
5. `supabase-pooler-session-vs-transaction-mode-selection.md` (08:42 UTC) - P2 gap. See below.

### New gap: P2-C - Supabase pooler configuration missing from ~/ecodiaos/CLAUDE.md

**Rule:** `supabase-pooler-session-vs-transaction-mode-selection.md` covers a P1 incident from today (2026-05-13): all DB-writing forks failed with `EMAXCONNSESSION max clients reached in session mode` for over 1h. Root cause: three PM2 processes each holding a `postgres.js` pool pointed at port 5432 (session mode, hard cap 15 slots total). Fix: switch `DATABASE_URL` to port 6543 (transaction mode) + add `DATABASE_URL_LISTEN` for direct LISTEN connection. Commit `2a05e61`.

CLAUDE.md's "VPS & Infrastructure" operational lessons have NO mention of this pooler distinction. Given the impact (1h+ P1 outage, all forks blocked), this belongs in the operational lessons.

**Target file:** `~/ecodiaos/CLAUDE.md` - "VPS & Infrastructure" operational lessons.

**Proposed addition** (after pm2-restart-count-is-lifetime bullet):

```
- Supabase pooler: `DATABASE_URL` MUST point to the transaction-mode pooler (port 6543), NOT session mode (port 5432). Session mode has a hard 15-slot cap across ALL PM2 processes - three pools x max:10 saturate immediately under burst fork load. Symptom: `EMAXCONNSESSION max clients reached`. LISTEN/NOTIFY connections must use a separate `DATABASE_URL_LISTEN` env var pointing to the direct connection (db.<ref>.supabase.co:5432) since transaction mode does not support LISTEN. Fix committed `2a05e61` (13 May 2026 P1 incident). Full: `~/ecodiaos/patterns/supabase-pooler-session-vs-transaction-mode-selection.md`.
```

### New P3 items (addendum)

**P3-E: EcodiaOS frontend canonical URL = admin.ecodia.au**
- Decision from 13 May 2026 (Neo4j Decision "EcodiaOS frontend production URL is admin.ecodia.au not code.ecodia.au"): conductor was referencing code.ecodia.au as the dashboard URL - that is wrong.
- CLAUDE.md does not explicitly state the frontend URL anywhere (api.admin.ecodia.au is mentioned but not the frontend base).
- Low urgency (Neo4j Decision is durable), but a P3 note in the VPS/Deployment section would prevent drift.
- Target: `~/ecodiaos/CLAUDE.md` - VPS section or Frontend section.

**P3-F: fork-sigterms pattern - P3 only**
- Covered transitively via `check-pre-kill-commits-before-redispatch.md` cross-ref already in CLAUDE.md. No new action needed.

**P3-G/H: capacitor-white-screen + googleservice-plist**
- iOS/Capacitor specific. These belong in `~/ecodiaos/clients/coexist.md`, not CLAUDE.md. No CLAUDE.md action.

### Updated to-do list (addendum)

**P2 items to ship (all three, next edit fork):**
- P2-A: Add no-internal-identifiers-in-chrome-driving-urls.md cross-ref to ~/CLAUDE.md Chrome-driving section (CARRY-FORWARD, not applied yet)
- P2-B: Remove post-action-applied-tag-check.sh from WIRED hook list in ~/ecodiaos/CLAUDE.md (CARRY-FORWARD, not applied yet)
- P2-C: Add Supabase pooler transaction-mode lesson to ~/ecodiaos/CLAUDE.md VPS & Infrastructure section (NEW)

**Updated counts (full audit including addendum):**
- P1 total: 3 (ALL APPLIED)
- P2 total: 3 remaining (P2-A + P2-B carry-forward + P2-C new)
- P3 total: 12 (8 original + P3-E chrome URL + P3-F sigterm trivial + P3-G capacitor + P3-H googleservice)
