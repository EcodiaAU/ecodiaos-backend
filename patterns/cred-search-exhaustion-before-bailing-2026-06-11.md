---
binding: hook=cred-search-exhaustion-surface.py + skill=knowledge-route
triggers: creds missing, cant find creds, cannot find creds, couldn't find creds, drop creds into, creds not found, env file missing, no creds, neo4j.env, where are the creds, where do creds live, look harder
---

# Cred-search exhaustion before bailing

**status:** active
**authored:** 2026-06-11
**origin incident:** Tate 2026-06-11 on the Neo4j project handoff: *"What.... how can you not find the neo4j creds. Look harder bro"*. I had searched two places, not found them, and asked Tate to drop them into a file. The creds were in `backend/.env` the whole time, sitting next to every other Aura consumer in the repo.

---

## The rule

**Before declaring credentials missing, exhaust the canonical search list AND inspect any in-repo consumer that uses the same creds.** Bailing on creds without exhausting this list is a recurring failure shape, and "look harder next time" is not a fix; the doctrine + the hook are the fix.

**General form:** any time the conductor is about to declare a thing missing or absent (creds, files, env vars, status_board rows, kv_store keys, named entities), the exhaustion list for that thing must run first. The thing's in-repo CONSUMERS are the canonical pointer to where it lives. Examples for adjacent shapes: a Vercel project that does not appear in `vercel list` is reachable through the `.vercel/project.json` of every consumer of it; a kv_store key that denies via MCP is mirrored at `PRIVATE/ecodia-creds/kv-mirror/<key>.json`; a status_board row that is not in MCP results is on a paused row in `os_scheduled_tasks` direct PG query. Same shape, same fix: grep the consumers before asking.

## The canonical search list (in this order)

1. **The project's own env files.** For ecodiaos-backend: `backend/.env`, `backend/.env.production`, `backend/.env.development`, `backend/.env.example`. Most service creds live here next to whichever consumer needs them.
2. **The project's MCP server start scripts.** `backend/mcp-servers/<service>/start.sh` is exact about which env vars it exports and where it reads them from. If an MCP connector works for a service, the creds are by definition reachable; the start script names the path.
3. **`/Users/ecodia/PRIVATE/ecodia-creds/<service>.env`.** Per-service env files for creds that don't live in repo. Search by service name (`grep -rIl <service> /Users/ecodia/PRIVATE/ecodia-creds/` if name unknown).
4. **`/Users/ecodia/PRIVATE/ecodia-creds/kv-mirror/<key>.json`.** Mirror of `kv_store.creds.*` for offline reads.
5. **`backend/docs/secrets/<service>.md`.** Location indexes; reads point at the actual cred path elsewhere.
6. **`knowledge.lookup "where do <service> creds live"`.** The knowledge index has a `secrets` category that maps service → cred location.
7. **`kv_store.creds.*`** read via MCP `kv_store_get`. Some keys deny via MCP (Supabase org PAT, ASC primary keys); treat denial as a routing signal, not absence.
8. **The codebase itself.** `grep -rIlE "<SERVICE>_(URI|URL|KEY|TOKEN|PASSWORD)" /Users/ecodia/.code/ecodiaos --exclude-dir=node_modules --exclude-dir=_archive --exclude-dir=.git`. If any tool in the repo connects to the service, the connection string is grep-able.

If steps 1 through 8 all fail, the cred genuinely does not exist on this host yet AND every consumer in the repo is also blocked. At that point the question to Tate is precise (*"step 8 grep returned zero hits across the whole repo"*), not vague (*"can't find the neo4j creds"*).

## Why

Asking Tate to "drop the creds into a file" while the running MCP connector to that exact service is reading them from somewhere already is a category of failure that should never reach Tate. Every working MCP server has the env path encoded in its start script; every working consumer in the codebase has the env vars named in a `.env` or `process.env.X` reference. The grep is faster than the question.

Today's incident: `ecodia-graph` MCP connector was working for the whole turn (every `graph_query` call returned data). The connector was reading `NEO4J_URI` from somewhere. The somewhere was `backend/.env`. A 3-second `grep -i NEO4J backend/.env*` would have surfaced it. Instead I checked one wrong directory and asked Tate to fix a problem that did not exist.

## How to apply

Before any prose that says creds are missing or asks Tate to populate a file, run at minimum:

```
# 1. project env files
grep -liE "<SERVICE>" /Users/ecodia/.code/ecodiaos/backend/.env* 2>/dev/null

# 2. MCP server starts
grep -liE "<SERVICE>" /Users/ecodia/.code/ecodiaos/backend/mcp-servers/*/start.sh 2>/dev/null

# 3. PRIVATE per-service env
grep -rIliE "<SERVICE>" /Users/ecodia/PRIVATE/ecodia-creds/ 2>/dev/null

# 4. anywhere in the codebase
grep -rIliE "<SERVICE>_(URI|URL|KEY|TOKEN|PASSWORD|SECRET)" /Users/ecodia/.code/ecodiaos --exclude-dir=node_modules --exclude-dir=_archive --exclude-dir=.git 2>/dev/null | head -20
```

Any hit produces the answer. Only if all four return empty does the question reach Tate.

## Hook enforcement

`~/.claude/hooks/ecodia/cred-search-exhaustion-surface.py` is a PreToolUse hook on Write / Edit / MultiEdit. When the new content carries one of the trigger phrases (`creds are missing`, `couldn't find creds`, `drop NEO4J_URI`, `<service>.env required`, `creds not in`, etc.), the hook surfaces the canonical search list inline. It is intentionally noisy because the cost of running four greps is zero and the cost of asking Tate is the trust hit.

## Anti-patterns

1. **"I checked PRIVATE/ecodia-creds, the creds aren't there."** PRIVATE is one of eight search paths, and not the first. A working MCP connector means the creds are reachable somewhere; find that somewhere before asking.
2. **"I'll wait for Tate to drop the file."** Wait introduces a session boundary the doctrine then cannot survive. Find the creds in the same turn.
3. **"The creds are missing from kv_store.creds.<key>."** Some kv_store keys deny via MCP (Supabase org PAT). Denial is a routing problem, not absence. Read the local kv-mirror at `/Users/ecodia/PRIVATE/ecodia-creds/kv-mirror/<key>.json`.
4. **"There's no neo4j.env."** If the file you expected does not exist, the question is whether the creds live elsewhere, not whether to create the file you expected. Grep the running consumers first.

## Cross-references

- [[hooks-are-the-epitome-of-learning-prose-without-hook-is-forgotten-2026-06-09]]. Why this rule needed a hook instead of a promise.
- [[cred-rotation-must-propagate-to-all-consumers]]. The inverse: when creds rotate, audit every consumer; the same map applies in reverse.
- [[kv-mirror-substrate]]. Why the kv-mirror exists at PRIVATE/ecodia-creds/kv-mirror/.
- [[knowledge-architecture-lookup-first-and-claim-binding-2026-06-09]]. The knowledge.lookup secrets category that maps service to cred location.
