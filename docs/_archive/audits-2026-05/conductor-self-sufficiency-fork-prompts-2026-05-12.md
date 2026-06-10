

## BRIEF 1 — Activate the 4-tier prompt cache (the free win)


```
You are shipping the activation of a 4-tier prompt-cache layout that is already
built and running in shadow mode in EcodiaOS. The code exists; the env flag has
never been flipped to live.

CONTEXT (read these first, in order):
1. ~/ecodiaos/backend/docs/PROMPT_ASSEMBLY_SPEC.md — §3 envelope design, §4 cache
   breakpoints, §6 budget math. This is the spec you are implementing.
2. ~/ecodiaos/backend/src/services/promptAssembler.js — the v2 assembler.
   Currently emits contentBlocks[] with cache_control markers. Runs in shadow.
3. ~/ecodiaos/backend/src/services/osSessionService.js around line 2248 — the
   `_v2Out` shadow dispatch. Verify the live path actually exists and that
   contentBlocks are passed to the SDK query() options when mode=live.

DO:

(A) Audit promptAssembler.resolveMode(). Confirm:
    - 'shadow' (current): builds v2, diffs against v1, discards.
    - 'canary': 10% of dbSessionIds use v2 live, 90% v1; both logged.
    - 'live': all turns use v2.
    If 'canary' or 'live' code paths don't exist or are stubbed, IMPLEMENT them
    before flipping. The shadow→live flip must actually wire contentBlocks into
    the SDK request, not just log them.

(B) Drop the compaction threshold from 800K to 120K for non-deepseek paths.
    File: osSessionService.js, function `_compactThreshold()` around line 605.
    Currently:
      if (_currentProvider === 'deepseek') return parseInt(env.OS_SESSION_COMPACT_THRESHOLD_DEEPSEEK || '800000', 10)
      return parseInt(env.OS_SESSION_COMPACT_THRESHOLD || '120000', 10)
    Verify the env default. Set OS_SESSION_COMPACT_THRESHOLD=120000 in
    ~/ecodiaos/.env if not already.

(C) Build the cache-keepalive cron. New file:
    ~/ecodiaos/backend/src/workers/promptCacheKeepalive.js
    Behaviour: every 50 minutes during 21:00–07:00 AEST, send a 1-token no-op
    query() through osSessionService using the current cached prefix. Goal: keep
    BP1 + BP2 warm across the overnight window. Pattern existing keepalive crons
    use, e.g. ~/ecodiaos/backend/src/workers/codebaseIndexWorker.js for the
    interval-loop shape. Wire into server.js boot block.

(D) Flip env. Edit ~/ecodiaos/.env (NOT committed to git):
      PROMPT_ASSEMBLY_V2=canary
    Verify telemetry surfaces /api/telemetry/per-turn-injection-cost shows
    canary turns. Watch 20 turns. If cache_read_input_tokens climbs and no diffs
    in prompt_assembly_audit show divergence:
      PROMPT_ASSEMBLY_V2=live
    pm2 restart ecodia-api between flips.

(E) Add a one-line ops dashboard query:
      anthropic_cache_read_tokens_total — current hit rate %
    Surface via /api/telemetry/cache-hit-rate. Read promo_assembler_bytes_per_breakpoint
    logger.info lines (osSessionService.js line 2282) to verify per-tier byte
    counts look right (BP1: ~3K, BP2: ~15K, BP3: ~5K, BP4: variable).

VERIFY (must hold before [FORK_REPORT]):
- pm2 ecodia-api up after restarts, no error spam.
- Last 10 turns show cache_read_input_tokens > 0 in API responses.
- /api/telemetry/cache-hit-rate returns a number.
- Compact threshold confirmed 120000.
- Keepalive cron registered in os_scheduled_tasks (or however your interval
  workers are tracked) AND firing — check kv_store.health.prompt_cache_keepalive
  after first fire window.

REPORT:
[FORK_REPORT] Cache 4-tier activated. Hit rate climbed from X% to Y%.
Compact threshold 800K→120K. Keepalive cron live. Commits: <sha-list>.
[NEXT_STEP] Watch hit rate for 24h. If <70% on BP1+BP2, investigate
prompt-prefix instability via prompt_assembly_audit diffs.
```

---

## BRIEF 2 — Build the Working Set substrate (typed thread state)

**Paste into a fresh Sonnet chat / fork:**

```
You are shipping the `working_set` table — the single canonical "what is the OS
attending to right now" substrate. This replaces three scattered continuity
blocks AND the conductor's habit of narrating fork/thread status into chat.

CONTEXT (read first):
1. ~/.claude/projects/d---code/memory/MEMORY.md if accessible, or just
   ~/ecodiaos/.claude/drafts/conductor-self-sufficiency-plan-2026-05-12.md
   Section "Piece 1 — The Working Set table" — the schema and rules.
2. ~/ecodiaos/backend/src/services/osSessionService.js lines 1311–1430 — the
   existing `_injectConductorCommitments` and `_injectThreadCarryForward`
   functions you are replacing.
3. ~/ecodiaos/backend/src/services/listeners/forkComplete.js,
   emailArrival.js, factorySessionComplete.js — listeners that must learn to
   write working_set rows.

DO:

(A) Migration. Next free number is 100 (verify with `ls
    src/db/migrations/0*.sql | tail`). Create
    ~/ecodiaos/backend/src/db/migrations/100_working_set.sql:

      CREATE TABLE working_set (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        topic TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active','parked','blocked','resolved')),
        blocking_on TEXT,                              -- 'tate' | 'fork:xxx' | 'external:vendor' | NULL
        intent TEXT NOT NULL,                          -- why this thread exists
        artifacts JSONB DEFAULT '{}'::jsonb,           -- fork_ids, status_board_row, etc.
        parent_id UUID REFERENCES working_set(id) ON DELETE CASCADE,
        opened_at TIMESTAMPTZ DEFAULT NOW(),
        last_touched_at TIMESTAMPTZ DEFAULT NOW(),
        closed_at TIMESTAMPTZ
      );
      CREATE INDEX working_set_status_idx ON working_set(status) WHERE closed_at IS NULL;
      CREATE INDEX working_set_blocking_on_idx ON working_set(blocking_on) WHERE status = 'blocked';
      CREATE INDEX working_set_last_touched_idx ON working_set(last_touched_at) WHERE closed_at IS NULL;

      -- pg_notify trigger so listeners can react to working_set changes
      CREATE TRIGGER trg_working_set_notify
        AFTER INSERT OR UPDATE ON working_set
        FOR EACH ROW EXECUTE FUNCTION notify_listener_event('working_set');

(B) Service. New file: ~/ecodiaos/backend/src/services/workingSetService.js

      API:
        - openThread({ topic, intent, parent_id?, artifacts? }) → { id }
        - updateThread(id, { status?, blocking_on?, artifacts?, touch?: bool })
        - listActive() → rows where status='active' AND closed_at IS NULL
        - listBlocked() → status='blocked'
        - parkOldest() → finds oldest active, sets status='parked'
        - closeThread(id, { resolution }) → sets status='resolved', closed_at=NOW()
        - autoParkStale() → parks any active with last_touched_at > 30min ago

      RULES (enforce in openThread):
        - Count active rows. If >= 5, call parkOldest() first.
        - Always set last_touched_at on touch.
        - Never raise on missing id; log and return.

(C) Continuity block injection. In osSessionService.js,
    REPLACE the three existing functions:
      _injectConductorCommitments → DELETE (or reduce to stub returning null)
      _injectThreadCarryForward   → DELETE
      _injectLastTurnBreadcrumb   → KEEP for now (it's read elsewhere)

    ADD: _injectWorkingSet(). Reads workingSetService.listActive() +
    listBlocked(). Emits:

      <working_set count="N">
        <thread id="…" topic="…" status="active"  blocking="…" age="12m">
        <thread id="…" topic="…" status="blocked" blocking="fork:abc123" age="3m">
        …
      </working_set>

    Hard cap output: 1500 bytes. If more, summarise tail.

    Wire into the continuity-parts assembly (around line 2068 onwards in
    _sendMessageImpl). Add '<working_set>' to the ORDER array at line 2193,
    after '<forks_rollup>'. Remove '<conductor_commitments>' and
    '<thread_carry_forward>' from the candidates and ORDER.

(D) Wire listeners. Each of forkComplete.js, emailArrival.js,
    factorySessionComplete.js, statusBoardDrift.js learns:
      - On fork spawn → openThread({ topic: brief_head, intent, artifacts: { fork_id } })
      - On fork complete → updateThread(thread_id, { status: 'resolved' })
      - On fork error → updateThread(thread_id, { status: 'blocked', blocking_on: 'investigate' })
      - On email arrival from known thread → updateThread or openThread

    Thread linkage: store the working_set.id in os_forks.artifacts JSONB on
    spawn, or in a new column `working_set_thread_id` if cleaner. Pick the
    cleaner option.

(E) Auto-park cron. Either piggy-back on an existing 5min loop or add a small
    setInterval in workingSetService.js boot. Calls autoParkStale() every 5min.

(F) Update CLAUDE.md (~/ecodiaos/CLAUDE.md) Conductor Architecture section. Add
    a "Working Set" subsection explaining: conductor reads <working_set> at
    turn-start. Never narrates thread status. Updates via tool call when it
    opens new lines of work; listeners update for events. Hard cap 5 active.

VERIFY:
- Migration applied: `psql -d ecodiaos -c "\d working_set"`
- workingSetService.openThread/listActive smoke-tested via node REPL.
- A fork spawn creates a working_set row (check after one happens).
- Next conductor turn after deploy shows <working_set> block with real rows.
- <conductor_commitments> and <thread_carry_forward> are GONE from turns.
- /api/telemetry/per-turn-injection-cost shows working_set bytes ~500–1200.

REPORT:
[FORK_REPORT] working_set substrate shipped. Migration 100 applied. Service +
listener wiring complete. <working_set> continuity block live; replaced
conductor_commitments + thread_carry_forward. N rows tracked since deploy.
Conductor reads, doesn't narrate. CLAUDE.md updated.
[NEXT_STEP] Verify 24h that working_set rows mirror real thread state — any
drift = listener wire bug to chase.
```

---

## BRIEF 3 — Build the Scratchpad substrate + kill the chat-tag pollution

**Paste into a fresh Sonnet chat / fork:**

```
You are shipping the inner-scratchpad substrate. The conductor's reasoning,
pattern applications, and decisions go to a table — NOT into chat as
[APPLIED]/[NOT-APPLIED] text. This kills the single largest source of chat
pollution and replaces the existing post-action-applied-tag forcing function.

CONTEXT (read first):
1. ~/ecodiaos/backend/src/services/listeners/conductorStreamTagWatcher.js —
   this currently parses [APPLIED] tags from assistant_text streams to JSONL.
   You are replacing the source: the conductor writes to scratchpad directly,
   the watcher reads scratchpad rows (or is deprecated).
2. ~/ecodiaos/CLAUDE.md "Phase C (Layer 3) — applied-pattern-tag forcing
   function" section. This is the doctrine you are dismantling.
3. ~/ecodiaos/backend/src/services/osSessionService.js — the in-process MCP
   server pattern (look at forkConductorTool.js for the template). You will
   register a new tool exactly like spawn_fork.

DO:

(A) Migration 101. ~/ecodiaos/backend/src/db/migrations/101_scratchpad.sql:

      CREATE TABLE scratchpad_entries (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        turn_id BIGINT,                      -- nullable for between-turn entries
        kind TEXT NOT NULL CHECK (kind IN ('plan','pattern_applied','pattern_not_applied','decision','observation','retry','blocker')),
        content TEXT NOT NULL,
        thread_id UUID REFERENCES working_set(id) ON DELETE SET NULL,
        pattern_path TEXT,                   -- when kind = pattern_*
        reason TEXT,                         -- short justification
        ts TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX scratchpad_session_ts_idx ON scratchpad_entries (session_id, ts DESC);
      CREATE INDEX scratchpad_thread_idx ON scratchpad_entries (thread_id) WHERE thread_id IS NOT NULL;
      CREATE INDEX scratchpad_kind_idx ON scratchpad_entries (kind, ts DESC);

(B) Service. ~/ecodiaos/backend/src/services/scratchpadService.js

      API:
        - write({ session_id, kind, content, thread_id?, pattern_path?, reason? }) → { id }
        - recentForSession(session_id, limit=10) → [{kind, content, pattern_path?, reason?, ts}, ...]
        - byThread(thread_id) → []
        - byPattern(pattern_path, sinceDays=7) → for telemetry rollup

(C) In-process MCP tool. Pattern after ~/ecodiaos/backend/src/services/forkConductorTool.js.
    New file: ~/ecodiaos/backend/src/services/scratchpadTool.js exposing:

      mcp__scratchpad__write({ kind, content, thread_id?, pattern_path?, reason? })

    Wire it into osSessionService._sendMessageImpl alongside the
    forkConductorMcpServer — same lazy-await-per-turn pattern (per
    `sdk-mcp-server-instances-must-be-per-query-not-singleton.md`).

(D) Continuity block. In osSessionService.js add _injectScratchpadRecent()
    reading scratchpadService.recentForSession(dbSessionId, 10). Emits:

      <scratchpad_recent count="N">
        [plan @ 5m ago] I'll route the meetings upload via Deepgram once key lands
        [pattern_applied @ 4m ago] fork-by-default-stay-thin-on-main — single-tate-directive exemption
        [decision @ 2m ago] restart ecodia-api after both pending requests approved
        ...
      </scratchpad_recent>

    Hard cap output: 1500 bytes. Wire into ORDER array between
    <working_set> and <recent_doctrine>.

(E) System prompt surgery. In buildCustomSystemPrompt() in osSessionService.js:

    DELETE the doctrine that forces [APPLIED]/[NOT-APPLIED] chat emissions.
    The current text lives in ~/ecodiaos/CLAUDE.md under "Phase C (Layer 3) —
    applied-pattern-tag forcing function". Reduce that whole section in
    CLAUDE.md to a brief pointer:

      ### Doctrine compliance is silent
      Pattern application is captured via `mcp__scratchpad__write({ kind:
      'pattern_applied' | 'pattern_not_applied', pattern_path, reason })`.
      NEVER narrate [APPLIED]/[NOT-APPLIED] into chat. The scratchpad tool
      writes the entry; the existing telemetry pipeline reads from
      scratchpad_entries. Three uses: (1) genuinely high-leverage pattern
      that affected the action, (2) deliberately not-applied with a reason,
      (3) override of a forcing-function nudge.

    REMOVE the `post-action-applied-tag-check.sh` hook from
    ~/.claude/settings.json (or its equivalent for the OS Session). Verify with:
      jq '.hooks.PostToolUse[] | select(.command | contains("post-action-applied-tag-check"))' ~/.claude/settings.json
    Should return nothing after.

(F) Bridge for existing telemetry. The current
    `conductorStreamTagWatcher` and `application-events.jsonl` consumers
    need to keep working during transition. Options:
      Option 1 (preferred): the scratchpad service ALSO appends a JSONL line
      to application-events.jsonl on every `pattern_applied`/`pattern_not_applied`
      write, in the same format the existing pipeline expects. The
      conductorStreamTagWatcher becomes a deprecated no-op (filter never
      matches because conductor stops emitting tags). Update the listener
      registry comment to mark it deprecated.
      Option 2: rewrite downstream consumers to read from scratchpad_entries.
      Heavier; skip unless Tate asks.

VERIFY:
- Migration 101 applied.
- mcp__scratchpad__write tool surfaces in the conductor's next session's tool
  list (check via /api/os-session/status or a probe turn).
- One conductor turn after deploy: tool gets called when conductor applies a
  pattern. Zero [APPLIED] tags in the chat output for that turn.
- application-events.jsonl still receives entries from scratchpadService.write
  on pattern_applied kind.
- <scratchpad_recent> block appears on next turn.
- CLAUDE.md doctrine updated.
- post-action-applied-tag-check.sh hook removed from settings.

REPORT:
[FORK_REPORT] Scratchpad substrate shipped. Migration 101. mcp__scratchpad__write
tool wired (per-query rebuild pattern). <scratchpad_recent> continuity block
live. Phase C doctrine replaced with silent-compliance rule. Telemetry bridge
maintains application-events.jsonl. [APPLIED] chat pollution eliminated as of
this commit.
[NEXT_STEP] Watch 50 conductor turns. Confirm zero [APPLIED]/[NOT-APPLIED] tag
lines in assistant_text. If any leak through, investigate residual doctrine.
```

---

## BRIEF 4 — Haiku Observer Trio (cheap parallel meta-cognition)

**Paste into a fresh Sonnet chat / fork:**

```
You are shipping three parallel Haiku-powered observer listeners that watch
the conductor's stream silently, hold rolling buffers, and post interventions
to the conductor's queue ONLY when warranted. Each is meta-cognition for the
conductor; none is a domain expert.

CONTEXT (read first):
1. ~/ecodiaos/backend/src/services/listeners/conductorStreamTagWatcher.js —
   the exemplar passive observer subscribed to 'assistant_text'. Pattern your
   listeners after this exactly (subscribesTo, relevanceFilter, handle).
2. ~/ecodiaos/backend/src/services/listeners/registry.js — the LISTENER_FILES
   allow-list. You will add three new entries.
3. ~/ecodiaos/backend/src/services/claudeService.js (or its equivalent — find
   where Anthropic SDK calls live) — for the Haiku call shape. Model id:
   `claude-haiku-4-5-20251001`.
4. ~/ecodiaos/backend/src/services/messageQueue.js — how listeners enqueue
   messages to the conductor's inbox. Mode 'queue' = arrives on next turn.
5. ~/ecodiaos/backend/src/services/listeners/emailArrival.js for the
   POST-to-/api/os-session/message pattern with rate limiting + dedupe.

DO (build all three; they share infrastructure):

SHARED INFRA (build once, reuse across all three observers):

  File: ~/ecodiaos/backend/src/services/observers/_observerBase.js
  Exports:
    - createObserver({ name, model, systemPrompt, bufferSize, interveneThreshold,
                       buildPromptFromBuffer, parseIntervention })
        Returns a listener-shaped module:
          { name, subscribesTo: ['assistant_text'], relevanceFilter, handle,
            ownsWriteSurface }
    - The handler:
        1. Pushes the new event to a rolling buffer (Array, cap at bufferSize)
        2. Debounces 2s (collapse rapid bursts)
        3. Calls Haiku with systemPrompt + buildPromptFromBuffer(buffer)
        4. Parses output via parseIntervention → { intervene: bool, reason, message_for_conductor? }
        5. If intervene === true AND not dedup-blocked, POST to
           http://localhost:3001/api/os-session/message with
             { content: `<observer source="${name}">${message}</observer>`,
               mode: 'queue', untrusted: true }
        6. Always write heartbeat to kv_store.health.observer_<name>:
             { last_run, last_decision, intervene_rate_24h }
        7. Per-observer dedupe: same intervention text within 10min → skip
        8. Per-observer rate cap: max 4 interventions per hour. Beyond that,
           log and drop.

  File: ~/ecodiaos/backend/src/services/observers/_haikuClient.js
  Thin wrapper around Anthropic SDK that:
    - Uses model claude-haiku-4-5-20251001
    - max_tokens 400
    - Sets `cache_control: { type: 'ephemeral' }` on the systemPrompt (BP1)
      so observer systemPrompts stay cached across calls
    - Returns parsed JSON object from the model's response (force JSON output
      via "Reply only with a JSON object" in system prompt)
    - On any error: log warn, return { intervene: false, reason: 'haiku_error' }
    - Cost telemetry: increment kv_store.observers.cost_<name>_24h by
      (input_tokens * 1.0 + output_tokens * 5.0) / 1_000_000 (USD).

OBSERVER A — Coherence
  File: ~/ecodiaos/backend/src/services/observers/coherenceObserver.js
  bufferSize: 50 turns
  Buffer content: each entry = { ts, role: 'tate'|'conductor', text }
    - Reads tate messages from working_set/os_session_messages tables
    - Reads conductor text from assistant_text events
  systemPrompt: |
    You are the Coherence Observer for EcodiaOS, a multi-task agentic system.
    Your one job: detect when the conductor has lost the thread of what the
    user is actually trying to accomplish. You watch the last 50 turns of
    conversation. You DO NOT instruct the conductor on tasks. You ONLY flag
    cases where:
      (a) the conductor is pursuing something the user already dismissed,
      (b) the conductor has interpreted a user message in a way inconsistent
          with earlier messages in the same conversation,
      (c) the user's most recent ask has not been addressed for 3+ conductor
          turns.
    Always return JSON only:
      { "intervene": bool, "reason": "<one line>", "message_for_conductor": "<= 200 chars or null" }
    Default: { "intervene": false, "reason": "no drift detected" }.
    Threshold: intervene only when drift confidence > 0.75. False positives are
    much worse than false negatives.
  interveneThreshold: 0.75 (parse from Haiku output's reason if it mentions
    confidence, otherwise trust intervene field).

OBSERVER B — Action Audit
  File: ~/ecodiaos/backend/src/services/observers/actionAuditObserver.js
  bufferSize: 30 turns
  Buffer content: { ts, conductor_text, tool_calls: [...] }
    - Subscribes to BOTH 'assistant_text' AND 'tool_call' events
    - Pairs assistant_text with the tool_calls that fired in the same turn
  systemPrompt: |
    You are the Action Audit Observer for EcodiaOS. Your one job: detect when
    the conductor narrates planned actions ("I'll do X", "let me do Y", "next
    I'll check Z") but does NOT actually execute them via tool calls in the
    same turn or the next turn. This is the "narrated planning instead of
    acting" failure mode.
    Always return JSON only:
      { "intervene": bool, "reason": "<one line>",
        "skipped_action": "<the action narrated but not done> or null",
        "message_for_conductor": "<= 150 chars or null" }
    Threshold: only intervene when you see a clear "I'll do X" without a
    corresponding tool call for X within 2 turns. Don't catch hypothetical
    framing ("we could", "one option is").

OBSERVER C — Attention Economy
  File: ~/ecodiaos/backend/src/services/observers/attentionEconomyObserver.js
  bufferSize: 20 turns (lighter than the others)
  Buffer content reads from MULTIPLE substrates each fire:
    - working_set.listActive() and .listBlocked()
    - status_board where next_action_by='ecodiaos' AND priority <= 2
    - last 20 tate messages with timestamps
  Fires NOT on assistant_text but on a 5min setInterval (this one is a poller,
  not a stream listener — adjust the createObserver shape if needed, or build
  it as a worker directly).
  systemPrompt: |
    You are the Attention Economy Observer for EcodiaOS. Your one job: at each
    fire, compute whether the conductor is currently working on the
    highest-leverage thing available. Consider: active working_set rows,
    P1/P2 status_board items assigned to ecodiaos, any user-blocking items
    ageing > 1h, and any user message in the last 4h that hasn't been
    addressed.
    Always return JSON only:
      { "intervene": bool, "reason": "<one line>",
        "highest_leverage_now": "<task name>",
        "message_for_conductor": "<= 200 chars or null" }
    Threshold: intervene only when the conductor is clearly off-priority AND
    a higher-priority task is actionable now. Don't intervene if the current
    work is reasonable even if not optimal.

REGISTRATION:
  Add to LISTENER_FILES in ~/ecodiaos/backend/src/services/listeners/registry.js:
    'observers/coherenceObserver.js',
    'observers/actionAuditObserver.js',
    'observers/attentionEconomyObserver.js',
  (Adjust paths — observers may sit under src/services/observers/ not
  src/services/listeners/. If so, update the registry's directory walk or
  add an explicit secondary directory. Match the existing pattern.)

  Update EXPECTED_LOADED_COUNT in registry.js by +3.

VERIFY:
- Three new files exist.
- pm2 restart ecodia-api. Boot logs show:
    [listener-registry] load: loaded coherenceObserver (...)
    [listener-registry] load: loaded actionAuditObserver (...)
    [listener-registry] load: loaded attentionEconomyObserver (...)
- After 30min of normal traffic, kv_store.health.observer_coherence,
  observer_action_audit, observer_attention_economy all have recent heartbeats.
- /api/ops/listener-stats shows all three with > 0 fires.
- Trigger a deliberate drift test: send the conductor a message that
  contradicts a recent one, watch coherenceObserver fire within 1 turn.
- Cost check: kv_store.observers.cost_*_24h all < $1/day each after 24h.

REPORT:
[FORK_REPORT] Haiku Observer Trio shipped. Three observers: Coherence,
Action Audit, Attention Economy. Shared base + haiku client wired with
Haiku 4.5 + ephemeral cache_control. All three loaded by registry, heartbeats
healthy. First N hours of telemetry: <fires per observer>.
[NEXT_STEP] Watch intervention quality over 7 days. Tune thresholds in each
observer's systemPrompt if false-positive rate > 20%.
```

---

## BRIEF 5 — Capability Router (deterministic routing tool)

**Paste into a fresh Sonnet chat / fork:**

```
You are shipping a deterministic routing tool the conductor calls before any
non-trivial action. The tool returns the cheapest correct execution route.
This replaces the conductor's habit of narrating routing decisions
("I'll fork this", "let me do it on main").

CONTEXT (read first):
1. ~/ecodiaos/backend/src/services/forkConductorTool.js — the exemplar
   in-process MCP server pattern (per-query rebuild per
   `sdk-mcp-server-instances-must-be-per-query-not-singleton.md`). You will
   build a sibling tool exactly like this.
2. ~/ecodiaos/backend/src/services/forkService.js — fork energy caps,
   per-tree caps, manager pattern. Your router needs to know these.
3. ~/ecodiaos/CLAUDE.md "Conductor Architecture" section — the four subagent
   domains (comms, finance, ops, social).

DO:

(A) Migration 102. ~/ecodiaos/backend/src/db/migrations/102_routing_decisions.sql:

      CREATE TABLE routing_decisions (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT,
        task_description TEXT NOT NULL,
        intent TEXT NOT NULL,
        estimated_steps INT NOT NULL,
        parallelisable BOOLEAN NOT NULL,
        tate_visible BOOLEAN NOT NULL,
        chosen_route TEXT NOT NULL,
        rationale TEXT NOT NULL,
        conductor_overrode BOOLEAN DEFAULT FALSE,
        actual_outcome TEXT,                       -- 'success'|'partial'|'failed' (filled later)
        ts TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX routing_decisions_session_idx ON routing_decisions(session_id, ts DESC);
      CREATE INDEX routing_decisions_route_idx ON routing_decisions(chosen_route);

(B) Router service. ~/ecodiaos/backend/src/services/capabilityRouter.js

      Pure JS scoring function. NO LLM call. Inputs:
        {
          task_description: string,
          intent: 'info_lookup'|'state_mutation'|'orchestration'|'creative'|'tate_response',
          estimated_steps: number,
          parallelisable: boolean,
          tate_visible: boolean
        }

      Output:
        {
          route: 'main'|'subagent:comms'|'subagent:finance'|'subagent:ops'|'subagent:social'|'fork'|'fork_manager',
          rationale: string,
          alternates: [{ route, why_not }]  // up to 2 alternates
        }

      Rules (codify these — extend as needed):
        - intent=info_lookup AND estimated_steps <= 2 → main
        - intent=info_lookup AND estimated_steps <= 6 AND parallelisable → subagent best-match-by-keyword OR main
        - intent=tate_response AND tate_visible → main (don't outsource voice work)
        - intent=state_mutation + domain keywords (gmail/calendar/crm/sms → comms;
          bookkeeping/stripe/xero → finance; pm2/deploy/vps → ops; zernio/social → social) → that subagent
        - intent=state_mutation no clear domain → main
        - intent=orchestration AND estimated_steps >= 3 AND parallelisable → fork_manager
        - intent=orchestration AND estimated_steps >= 3 AND NOT parallelisable → fork
        - intent=creative AND tate_visible → main (creative voice is the conductor's job)
        - intent=creative AND NOT tate_visible → fork (offline drafting)

      LOG every call to routing_decisions BEFORE returning. Fire-and-forget INSERT.

      Helper: keywordDomainMatch(task_description) → 'comms'|'finance'|'ops'|'social'|null
      based on a simple keyword set per domain. Keep simple; tune later from logs.

(C) In-process MCP tool. ~/ecodiaos/backend/src/services/capabilityRouterTool.js

      Mirror ~/ecodiaos/backend/src/services/forkConductorTool.js exactly:
      per-query rebuild (NOT singleton — that bug is documented in the patterns).
      Exposes one tool:

        mcp__router__route_work({
          task_description: string,
          intent: 'info_lookup'|'state_mutation'|'orchestration'|'creative'|'tate_response',
          estimated_steps?: number (default 1),
          parallelisable?: boolean (default false),
          tate_visible?: boolean (default true)
        })
        → returns { route, rationale, alternates }

      Wire into osSessionService._sendMessageImpl alongside the forks tool
      (same lazy-await-per-turn shape).

(D) Doctrine update. In CLAUDE.md, add a new "Routing decisions" section in
    Conductor Architecture:

      ### Routing decisions are silent
      Before any non-trivial action, call mcp__router__route_work with the
      task shape. Trust its answer unless you have specific reason to
      override (note the reason in scratchpad). NEVER narrate routing
      ("I'll fork this", "let me do it on main") — just call the tool and
      proceed.

(E) Hook (optional but useful): add a PreToolUse warn-only hook that flags
    when the conductor uses mcp__forks__spawn_fork or Agent (subagent
    delegation) WITHOUT having called mcp__router__route_work in the same
    turn. Surfaces "[ROUTER-SKIP WARN]" via additionalContext. Warn-only;
    never blocks. After the conductor adapts, can be removed.

    File: ~/ecodiaos/scripts/hooks/router-skip-check.sh (mirror the existing
    brief-consistency-check.sh shape). Wire into ~/.claude/settings.json
    PreToolUse matchers.

VERIFY:
- Migration 102 applied.
- mcp__router__route_work tool surfaces in the next session's tool list.
- Sample call: route_work({task_description:'send invoice to coexist',
  intent:'state_mutation', estimated_steps:2, parallelisable:false,
  tate_visible:true}) → expect 'subagent:finance' or 'main' (since invoicing
  is finance-domain).
- After 50 conductor turns, routing_decisions has rows with chosen_route
  diversity (some main, some subagent, some fork).
- /api/telemetry/routing-distribution endpoint (build a thin one) shows
  route breakdown — should NOT be 100% one route.

REPORT:
[FORK_REPORT] Capability Router shipped. Migration 102 +
capabilityRouter.js + capabilityRouterTool.js + doctrine. mcp__router__route_work
live, per-query rebuild. First N routes recorded — distribution:
main:X, subagents:Y, forks:Z.
[NEXT_STEP] After 7 days of logs, analyse routing_decisions for conductor
override patterns. Tune rules from observed corrections.
```

---

## How to dispatch

**As the conductor (via fork tool):** open Brief 1's text in one fork call,
Briefs 2–5 in four more (all five `mcp__forks__spawn_fork` calls in the same
turn). Each one is self-contained — won't poll for anything from the others.

**As Tate manually:** paste each into a fresh Claude.ai or Claude Code session.
Brief 1 first (free win, low risk, prove the env works), then 2–5 in parallel
chats.

**Order matters slightly:**
- Brief 1 should ship first because it's pure config + low-risk and reveals
  whether the deploy pipeline is healthy.
- Briefs 2 + 3 should ideally land before Brief 4 (the observers reference
  working_set/scratchpad — they degrade gracefully if absent but work better
  with them present).
- Brief 5 is fully independent.

After all five FORK_REPORTs land, the conductor (or Tate) does a single
deploy round, restarts ecodia-api, and confirms:
- Cache hit rate climbing
- working_set and scratchpad continuity blocks present in turn payloads
- Observers heartbeating
- Routing decisions logging
- Chat text shorter, decisions denser
