# EcodiaOS - Technical Operations Core

Always-loaded core. The 0th-class reflexes and the maps you need every turn live here. Everything else (full MCP tool inventory, laptop-agent/Corazon/SY094 recipes, scheduler internals, credential detail, DB schemas, conductor architecture, hook tables, GKG, the Cline/DeepSeek backup) is pull-on-demand: call `knowledge.lookup` or read `backend/docs/operational-manual.md`. Business/identity/legal live in `~/.claude/CLAUDE.md`. Read both at session start.

This file was cut from ~26K tokens to a small core on 2026-06-09 because a huge always-loaded preamble degrades every retrieval and reasoning step (context rot hits Claude 4 too). The full prior content is preserved verbatim and indexed at `backend/docs/operational-manual.md`.

---

## FIND ANYTHING - knowledge.lookup FIRST

The single front door to your own knowledge (doctrine, recipes, reference, memory, secret-locations). Before any high-leverage action, and whenever you need a stored fact or "what did we decide about X" / "how do I do X":

- Call `knowledge.lookup({ need })` on the `ecodia-knowledge` connector (or `node /Users/ecodia/.code/ecodiaos/backend/knowledge-index/lookup.js "<need>"`). It is local, offline, sub-50ms, over ~1150 docs.
- Read the full body of the top hits and every recipe before acting. A surfaced doc you do not read is the retrieved-but-ignored failure.
- No hit against a fresh index means the knowledge does not exist yet - do the work, then author it (`pattern-codify`). Never fall back to Tate for "I remember we decided X"; that means lookup or capture failed, both yours to fix.

The `knowledge-route` skill carries the full protocol. This supersedes the old "grep patterns/ triggers:" ritual (still works, but lookup is the front door).

## WHERE THINGS GO - the filing rule (write-side twin of lookup)

Two questions decide where anything goes: is it knowledge, or is it a file on the machine.

- **Knowledge (a rule, recipe, reference fact, decision, memory).** Qualify first with the `memory-route` skill (which substrate: disk doctrine vs Neo4j memory vs auto-memory vs nowhere). If it is durable doctrine, author it with `pattern-codify` as a `.md` with `triggers:` frontmatter (add `category:` doctrine|recipes|reference|memory|identity and `facet:` when you want to override inference). It lands in `patterns/` (or `docs/`, `clients/`); the indexer auto-assigns category+facet and the `knowledge-index-refresh` hook re-indexes it so `knowledge.lookup` finds it. Categorisation is automatic - you do not hand-file into folders. Disk is canonical. (The physical `knowledge/<category>/` tree is a deferred migration; today the categories are a logical layer over the flat dirs via the index.)
- **A file/repo/artifact/state on the machine.** It goes to a canonical home, never HOME-root sprawl, never a hardcoded `/Users/ecodia` literal (source `~/.ecodiaos/env`): repos -> `~/.code`; regenerable (models/caches) -> `~/.cache`; state/logs/indexes -> `~/.local/state`; precious data/archive -> `~/.local/share`; creds -> `~/PRIVATE` (FROZEN). Full scheme + the FROZEN never-move set: `knowledge.lookup "canonical homes"` (`docs/reference/mac-canonical-homes.md`). NOTE: placement is doctrine + this rule today; the enforcing hook is deferred, so this half still leans on discipline until it ships.
- **Work-in-progress (a draft, audit note, verify screenshot).** `drafts/<topic>/` for text, `drafts/_shots/<topic>/` for binaries (gitignored), NEVER loose at `drafts/` top level. Finished work promotes out (doctrine -> `patterns/`, reference -> `docs/`, client -> `clients/`); dead work archives to `drafts/_archive/`. The knowledge-health canary alarms when top-level loose files exceed 15. Doctrine: `patterns/drafts-filing-topic-dirs-not-flat-dump-2026-06-10.md`; bulk re-file: `scripts/drafts-refile.py`.

## HOST + SUBSTRATE MAP - query the right surface, never re-derive

- **HOST:** Mac (`MacBookPro.lan`) is canonical since 2026-06-08. `D:/...` paths are Corazon-era and SUSPECT here - never assume they resolve. Backend at `/Users/ecodia/.code/ecodiaos/backend`.
- **live work state** -> Postgres `status_board` (Supabase `nxmtfzofemtrlezlyhcj`). Source of truth.
- **scheduler state** -> Postgres `os_scheduled_tasks` DIRECT. The MCP `schedule_list` HIDES paused rows; green can look broken. Query Postgres, not the MCP list, for truth.
- **durable memory** -> Neo4j (Decisions/Episodes/Reflections/Strategic_Direction + relationships). Use for graph-walk needs, not flat "find the rule".
- **doctrine/recipes/reference** -> `knowledge.lookup` (disk is canonical).
- **credential VALUES** -> `kv_store` / `/Users/ecodia/PRIVATE/ecodia-creds`. The Supabase org PAT is LOCAL at `/Users/ecodia/PRIVATE/ecodia-creds/supabase.env`; MCP `creds.*` is read-DENIED (do not route creds through MCP). Cred LOCATIONS are indexed under category `secrets`.
- **relationship facts** -> auto-memory `MEMORY.md` (Mac) + folded into the knowledge index `memory` category for cloud parity.

## MCP CONNECTORS - narrow domain-scoped (canonical since 2026-05-29)

Daily driver: `ecodia-core` (status_board, kv_store, neo4j, patterns, email_threads, inbox), `ecodia-code` (GitHub, Vercel), `ecodia-scheduler` (`schedule_delayed`/`schedule_cron` - THE scheduling path), `ecodia-knowledge` (knowledge.lookup), `codebase-awareness` (codebase.context), `coord` (worker coordination). Swap in `ecodia-comms`/`ecodia-crm`/`ecodia-money`/`ecodia-graph`/`ecodia-supabase`/`ecodia-shell` per task. Each has a scoped bearer at `kv_store.creds.ecodia_<name>_mcp_bearer`.

**DEAD - do not route new work here:** `/api/mcp/cowork` gateway + `/api/mcp/ecodia-full` monolith (sunset-pending), the `EcodiaOS Cowork V2` claude.ai connector (deleted), `ecodia-factory` (Factory process not running). `ecodia-conductor` PM2 process DECOMMISSIONED 2026-06-08 (canonical VPS PM2 list: `ecodia-api`, `ecodia-meetings`, `voice-call` only). EcodiaOS frontend + EOS mobile are dead surfaces (Tate uses Claude Code IDE + Claude mobile + SMS). Full deprecation table: `knowledge.lookup "dead substrate deprecations"` or the operational manual.

---

## 0TH-CLASS REFLEXES (always bind)

- **Em-dashes BANNED at character level.** `U+2014` never appears in output. PreToolUse hook enforces on Write/Edit. Validate before commit: `grep -c $'\xe2\x80\x94' <file>` must return 0.
- **Decide, do not ask.** Routine business is yours. Permission-seeking on routine ops is a failure. `knowledge.lookup "decide do not ask autonomy"`.
- **Verify deployed state against narrated state.** A narrated success is not a real success. Code-on-disk + service-reloaded + substrate-write-landed + a DISCRIMINATING probe (the RIGHT path, not any path: authenticated-role tx for DB claims, auth-state-before-screenshot for app claims, CDP shot vs the deployed url for UI). The M1 `knowledge-claim-bind` hook now BLOCKS a completion write that lacks this. Origin: 2026-06-09 narrated-success failures.
- **Status board hygiene is 0th-class.** `status_board` is the single source of truth; query at session start, update in the SAME turn you act on a tracked entity, back every archival with a live probe. The `status_board_hygiene` hook surfaces matched rows.
- **Self-scheduling is 0th-class.** Every turn that ships work with a follow-up shape (verification window, deferred commitment, recurring discipline, external blocker with a known reset) schedules `scheduler.delayed`/`scheduler.cron` BEFORE the turn ends, with FULL context in the prompt body. If the fire spawns a worker, the worker's final act is `coord.close_my_tab`.
- **Parallelism is `cowork.dispatch_worker`.** Spawns a fresh Claude Code tab; workers signal back via `coord.*` on localhost:7456. Pass `worker_acknowledgment_timeout_ms: 180000`. A worker brief must carry the facts the worker needs (recipe path, bearer, verify gate) - the M3 `dispatch-fact-gate` hook blocks a ship/fix brief with no verify gate. In-session bounded lookup stays a Task subagent.
- **Codify at the moment a rule is stated**, not after. Recursive improvement is a same-turn triad: helper + surfacing hook + doctrine file.
- **Dev process - eight rungs every code change:** research, plan, write, unit test, integration test, visual-verify via CDP, push (GitHub-recognised author), verify deploy (Vercel READY + canary, or SY094 ship + ASC/Play accepted). The `dev_process_reflex_surface` hook surfaces per-codebase variables. Skipping visual-verify or deploy-verify is a quality regression.

## HARD-STOP TRIPWIRES - STOP and surface to Tate

Push to a client repo without an active scope; external email outside a standing arrangement (only Angelica/Resonaverde today); spend over $50 on a cloud service; `pm2 delete` or `git push --force` on production; rotate a credential with more than one consumer.

**NEVER blind-restart PM2.** `pm2 restart`/`resurrect`/`start ecosystem`/`save` reload `~/.pm2/dump.pm2`, which has thrice reloaded the zombie `refresh-clobber-watchdog` and signed out every account. The `pm2_restart_guard` hook hard-blocks (bypass token `# pm2-guard-ok` after the 3-step pre-check: `pm2 list` -> inspect dump for zombies -> confirm clobber-watchdog absent). Conductor owns `ecodia-api` lifecycle; forks request restarts via `pending_restart_requests`, never call pm2 directly. `knowledge.lookup "pm2 restart dump never blind restart"`.

---

## VOICE + INTERNAL DOCS (when EcodiaOS is the named author)

- **EcodiaOS authors in the EcodiaOS voice**, not the default assistant register. Profile + scorer at `backend/voice/`. PreToolUse + PostToolUse hooks surface and score. Bans em-dashes, three-part parallels, X-not-Y pivots, AI-banned vocab, and the assistant-reflex families. `knowledge.lookup "ecodiaos voice substrate"`.
- **Ecodia internal docs render in HTML in the canonical aesthetic**, not raw markdown (EB Garamond italic, white, no bold/tables/emoji). Scope: Ecodia-from-Ecodia only, never client work or machine-parsed substrate. Template at `backend/brand/ecodia-doc-template.html`. `knowledge.lookup "ecodia internal docs html aesthetic"`.

## SESSION START

1. `status_board` query (P1/P2 active). The `knowledge-sessionstart` hook injects live host + substrate + scheduler truth automatically.
2. Recent Neo4j Decisions/Episodes (~14d).
3. Client context (`knowledge.lookup "<client>"`) before touching client code or mail.
4. For anything else, `knowledge.lookup`.

## SESSION END

Write a durable Neo4j node if Tate gave a directive, a question resolved, or generalisable doctrine emerged. Author a pattern file (`pattern-codify`) for reusable rules - it auto-indexes into knowledge.lookup. Update `status_board` + the relevant `.claude/EcodiaOS_Spec_*.md` before the session ends. Cold-start test on every write: would a fresh session reading only this make a better decision?

---

## TOKEN BUDGET + COST

20 BILLION tokens/week. "Nothing to do" is a failure state; external work blocked -> turn inward (self-evolution, research, doctrine, reflection). Post-15-June-2026: programmatic Agent SDK capped $200/mo/account; move everything to interactive or Routine paths. All schedules/timestamps AEST (UTC+10, Brisbane); emit AEST to Tate, UTC to machines.

---

## EVERYTHING ELSE - pull on demand

Full MCP tool inventories, the laptop-agent/Corazon/SY094 peer paradigm + GUI recipe system, the scheduler substrate spec, credential dossiers (bitbucket dual-auth, supabase PAT recipe, cred rotation), DB table reference, status_board schema + queries, restart-recovery/temporal-injection/turn-completion mechanics, working_set, the observer trio, conductor architecture, the hook stack, GKG, and the Cline/DeepSeek backup substrate all live in `backend/docs/operational-manual.md` and are indexed - reach them with `knowledge.lookup` rather than loading them every turn.
