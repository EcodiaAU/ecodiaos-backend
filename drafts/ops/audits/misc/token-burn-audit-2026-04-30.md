# Token-Burn Audit — 2026-04-30

**Fork:** fork_mokpmz4n_781f14
**Trigger:** Tate 30 Apr 09:42 AEST — "we are using way too many tokens... blazing through both 5hr sessions in under 5hrs"
**Mode:** audit-only, propose specific trims, do NOT ship

---

## Section 1 — Per-turn token cost breakdown

### 1.1 System prompt (CLAUDE.md stack)

Measured via `wc -c`:

| File | Bytes | Est. tokens (chars/3.5) |
|---|---:|---:|
| `~/CLAUDE.md` | 96,071 | **~27,449** |
| `~/ecodiaos/CLAUDE.md` | 85,687 | **~24,482** |
| `~/.claude/CLAUDE.md` | 1,678 | ~480 |
| `~/.claude/projects/-home-tate-ecodiaos/memory/MEMORY.md` | 3,183 | ~910 |
| **TOTAL static prompt** | **186,619** | **~53,320 tokens** |

This is the dominant per-session cost. With prompt-caching enabled it amortises across turns inside a single 5-min cache window, but every cache miss (idle >5min, session restart, scheduler-fire on a cold context) triggers a full re-read.

**Cost math at Sonnet rates (assuming Tate's "blazing through" = cache misses are frequent):**
- Without cache: 53,320 × $0.003/1K = **$0.16 per turn just for system prompt**
- With cache hit (after first write): 53,320 × $0.0003/1K = **$0.016 per turn**
- Cache write: 53,320 × $0.00375/1K = **$0.20 one-time per cache window**

If the conductor is averaging 1 turn per 5-10 min during active work, EVERY turn pays the cache write penalty because the `<now>` block changes per turn — but the static system prompt itself stays cached. So the 53K is a one-time-per-session cost in practice.

The bigger leak is per-turn variable blocks (Section 1.2) that compound across hundreds of turns.

### 1.2 Per-turn continuity blocks (sent EVERY turn, no cache benefit)

Source: `src/services/osSessionService.js` lines 1540-1717 (`_sendMessageImpl`). Each turn prepends to the user message:

| Block | Source | Typical size | Per-turn tokens |
|---|---|---:|---:|
| `<now>` | line 1550 | ~30 chars | ~10 |
| `<doctrine_surface>` | `doctrineSurface.surfaceDoctrineBlock` (360-line module) | 500-3000 chars | **~150-850** |
| `<forks_rollup>` | `forkService.forksRollup` lines 720-726 | 200-1500 chars (60-char brief × 5 forks + position lines) | **~60-430** |
| `<recent_doctrine>` | line 949-975 (Neo4j top-3 high-priority, 200-char desc each) | 600-900 chars | ~170-260 |
| `<relevant_memory>` | line 873-939 (Neo4j semantic top-3 + neighbours) | 600-1500 chars | ~170-430 |
| `<restart_recovery>` | `sessionHandoff.js` (only on restart, <6h old) | 1-3 KB | 280-860 (rare) |
| `<recent_exchanges>` | line 1617 (rare; restart only) | 2-5 KB | 570-1430 (rare) |

**Steady-state per-turn variable overhead: ~600-2000 tokens.** Across 200 turns in a 5h session, that's **120K-400K tokens of overhead alone**.

The **doctrine_surface** block is the biggest variable cost and the one most worth scrutinising — it's a keyword-grep over `~/ecodiaos/{patterns,clients,docs/secrets}` that returns matched file extracts. With 100+ pattern files and chatty matches, this can balloon.

### 1.3 Tool result echo — the spawn_fork waste leak

**File: `src/services/forkConductorTool.js` line 45-49.**

```js
return {
  content: [{
    type: 'text',
    text: `Fork spawned: ${snap.fork_id}\nstatus: ${snap.status}\nbrief: ${snap.brief}\n\nThe fork is running...`,
  }],
}
```

The spawn_fork tool result echoes `snap.brief` **VERBATIM, NO TRUNCATION**. A typical fork brief in this codebase is 2-5 KB (the brief I'm running on is ~3.5 KB). At 5 forks per wave × 5 waves per hour:

- Per fork: ~3,500 chars = ~1,000 tokens echoed back as duplicate of what the conductor just typed
- Per wave (5 forks): **~5,000 tokens of pure echo waste**
- Per hour (5 waves): **~25,000 tokens of pure echo waste**
- Per 5-hour session: **~125,000 tokens of pure echo waste**

Compare to `list_forks` line 82 which correctly truncates with `.slice(0, 200)`. The spawn_fork tool was authored without the same hygiene. **This is the highest-leverage, lowest-effort fix in the audit.**

### 1.4 MEMORY.md — stale content, 6 days old

The auto-memory file (3,183 bytes, ~910 tokens) is included on every turn and was last updated Apr 24 per the system reminder ("This memory is 6 days old"). 24 entries; many reference completed work (DAO formation, project_dao_formation, project_dedicated_laptop), point to other markdown files Claude can re-read on demand, or are obsolete (Roam IAP blocker is in status_board now).

Token cost is small (~900/turn) but compounds. More importantly: stale memory pollutes context with dead pointers.

### 1.5 Tool description bloat in MCP tool registration

`forkConductorTool.js` line 37 — the `spawn_fork` description is 600 chars of natural-language. Multiplied across ~150 registered tools (8 MCP servers, ~15-30 tools each), tool descriptions add **~10,000-20,000 tokens to the static system prompt**. Cached, so amortises, but contributes to the cold-start cost.

---

## Section 2 — Top 5 trim recommendations, ranked by token-saving × ease

### Rank 1 — Truncate spawn_fork brief echo
**Saving:** ~125,000 tokens per 5h session (the headline number)
**Ease:** trivial (1-line edit)
**Risk:** none — the brief is already in the conductor's context as the tool input

### Rank 2 — Trim doctrine_surface block size cap
**Saving:** ~50,000-100,000 tokens per 5h session (200 turns × 250-500 token reduction)
**Ease:** moderate (one slice call in `doctrineSurface.js`)
**Risk:** low — surfacing more than ~3 matches per turn is already noise

### Rank 3 — Refresh + prune MEMORY.md
**Saving:** ~100,000 tokens per 5h session (200 turns × 500 token reduction by halving the file)
**Ease:** moderate (manual review + rewrite)
**Risk:** low — entries are pointers, not durable doctrine

### Rank 4 — Compress forks_rollup brief preview
**Saving:** ~10,000-30,000 tokens per 5h session
**Ease:** trivial (already truncated to 60 chars at line 716/724, but position lines are 100 chars and can drop to 60)
**Risk:** none

### Rank 5 — Trim ~/CLAUDE.md and ~/ecodiaos/CLAUDE.md by 25%
**Saving:** ~13,000 tokens off the static prompt (one-time per cache window, but every cache miss)
**Ease:** hard (requires careful selection, doctrine cross-refs at risk)
**Risk:** medium — out of scope for this audit per Tate's "do NOT ship" instruction

---

## Section 3 — Specific edits

### Trim 1 (Rank 1): `forkConductorTool.js`
**File:** `/home/tate/ecodiaos/src/services/forkConductorTool.js`
**Line:** 47-48
**Current:**
```js
text: `Fork spawned: ${snap.fork_id}\nstatus: ${snap.status}\nbrief: ${snap.brief}\n\nThe fork is running in parallel. Continue your own work — its [FORK_REPORT] will arrive in your inbox on a future turn. Do not wait for it.`,
```
**Proposed:**
```js
text: `Fork spawned: ${snap.fork_id}\nstatus: ${snap.status}\nbrief: ${(snap.brief || '').slice(0, 200)}${snap.brief && snap.brief.length > 200 ? '…' : ''}\n\nThe fork is running in parallel. Its [FORK_REPORT] arrives on a future turn.`,
```
**Expected saving:** ~1,000 tokens per spawn_fork call → ~125K tokens per 5h session.
**Note:** also drops "Continue your own work" filler (-25 tokens × N spawns).

### Trim 2 (Rank 2): `doctrineSurface.js`
**File:** `/home/tate/ecodiaos/src/services/doctrineSurface.js`
**Function:** `surfaceDoctrineBlock` line 305
**Action:** add a hard char cap of 1500 on the returned block (currently uncapped). At top of return path:
```js
if (block && block.length > 1500) {
  block = block.slice(0, 1500) + '\n[...truncated, more matches in patterns/]'
}
```
**Expected saving:** ~250-500 tokens per turn × 200 turns = ~50-100K tokens per session.

### Trim 3 (Rank 3): MEMORY.md prune
**File:** `/home/tate/.claude/projects/-home-tate-ecodiaos/memory/MEMORY.md`
**Action:** drop entries 1, 6, 7, 13, 15, 16, 18, 19, 20 (completed work / obsolete pointers / now in status_board or Neo4j). Keep entries that are actual operational pointers (writing voice, comms channel, no-signup, app credentials, testing pipeline).
**Expected saving:** halves file → ~450 tokens × 200 turns = ~90K per session.
**Risk note:** this file appears auto-managed by Claude harness — manual prune may get overwritten. Verify whether Claude actively rewrites this file before editing.

### Trim 4 (Rank 4): forks_rollup tightening
**File:** `/home/tate/ecodiaos/src/services/forkService.js`
**Lines:** 716, 724
**Action:** drop `position` line entirely from the rollup (the conductor cares about which forks are running and their briefs, not bouncing position strings). Line 724 currently:
```js
return `- ${f.fork_id} [${f.status}] (${ageSec}s, ${f.tool_calls} tools) brief="${(f.brief || '').slice(0, 60)}"\n    position: ${(f.position || '').slice(0, 100)}`
```
Drop the `\n    position: ...` segment.
**Expected saving:** ~100 tokens per turn × 200 turns = ~20K per session.

### Trim 5 (out of scope, noted): CLAUDE.md slimming
Specific candidate paragraphs (NOT proposing edits per fork brief constraints):
- `~/ecodiaos/CLAUDE.md` "Restoration history (30 Apr 2026, fork_moklwqg2_dc4dcd...)" — 600 chars of historical narration that belongs in Neo4j Episode, not durable doctrine.
- `~/ecodiaos/CLAUDE.md` "Phase C (Layer 3) — applied-pattern-tag forcing function (LIVE)" subsection has the rule stated 3 times across nested paragraphs; collapse to single statement.
- `~/CLAUDE.md` "Tate, 29 Apr 2026 17:03 AEST verbatim (third strike on continuous-work today...)" — verbatim quote block can move to the pattern file's Origin section.
**Estimated total:** ~10-15K char reduction on the static prompt = 3-4K tokens off the cached system prompt.

---

## Section 4 — Quick-win for THIS hour

**Apply Trim 1 (spawn_fork brief echo truncation) immediately via a single Edit tool call:**

- File: `/home/tate/ecodiaos/src/services/forkConductorTool.js`
- Line 48: replace `brief: ${snap.brief}` with `brief: ${(snap.brief || '').slice(0, 200)}${snap.brief && snap.brief.length > 200 ? '…' : ''}`
- Then `pm2 restart ecodia-api` to pick up the change.
- Saving validates immediately on the next spawn_fork call.

This is a 1-edit, 1-restart, ~30s ship that removes ~125K tokens of waste per 5h session.

The conductor can apply this trim itself without a Factory dispatch (single-file change, well-scoped, directly on ecodiaos-backend per self-evolution scope discipline).

---

## Caveats

1. The 53K-token CLAUDE.md baseline is the single largest cost but also the most consequential to trim — out of scope for this audit per Tate's "do NOT propose architectural rewrites" constraint. A separate fork should audit CLAUDE.md for genuine deduplication.
2. Token estimates use chars/3.5 — actual Sonnet tokens may run ±20%. Numbers are directional.
3. Cache-hit rate matters more than raw token count for actual cost. If the conductor restarts often (PM2 cycle, idle >5min), the 53K static prompt is paid repeatedly.
4. The biggest invisible cost not measured here: **conductor output tokens** (the assistant's own responses + tool-use blocks). If the conductor is verbose in chat replies (status dumps, retrospective summaries), output tokens dominate input. The "no retrospective dumps in director chat" rule already targets this — verify compliance over the next 5h session.
