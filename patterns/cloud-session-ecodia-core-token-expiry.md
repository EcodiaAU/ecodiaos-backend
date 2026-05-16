---
triggers: ecodia-core, cowork-mcp, token-expired, re-authorization, cloud-session, meta-loop-blocked, substrate-blindness, mcp-auth, cloud-execution-environment, cowork-bearer, mcp-server-requires-re-authorization
---

# Cloud execution sessions have ephemeral ecodia-core auth - orient via local files and git when token is expired

## The rule

When a meta-loop routine or any conductor session runs inside a Claude Code cloud execution environment (triggered via claude.ai/code, GitHub Actions, CI dispatch, or scheduled web session) and all ecodia-core MCP tool calls return `MCP server "ecodia-core" requires re-authorization (token expired)`, the substrate orientation cannot proceed. Do not spin retrying the same tools. Instead, immediately pivot to the available local substrates: git log, local file reads (SELF.md, CLAUDE.md, patterns/), and GitHub MCP tools.

## Why

The ecodia-core MCP server uses a bearer token issued at session creation time. In the VPS-resident conductor, this token is long-lived and renewed by the process lifecycle. In ephemeral cloud execution containers (Claude Code on the web or CI), the token has a short TTL and may expire before or during the session, especially for cron-triggered meta-loop runs where the auth binding was set up at dispatch time, not execution time. The cloud container cannot self-refresh the ecodia-core bearer - it requires re-authorization by whoever configured the MCP connection (Tate or the VPS conductor).

## Protocol when ecodia-core is expired in a cloud session

1. **Confirm the blocker, do not retry.** Three simultaneous failures (status_board_query, neo4j_search, inbox_read all return `requires re-authorization`) is conclusive. Do not attempt ToolSearch or schema reloads - the token is genuinely expired.

2. **Orient via local substrates.** In order:
   - `SELF.md` - identity, top goals, operational concerns, recent celebration items
   - Recent git log (`git log --oneline -20`) - what shipped since last known state
   - `docs/` - any MIGRATION or ARCHITECTURE doc referenced in the session prompt
   - `patterns/` - doctrine for any high-leverage action contemplated

3. **Check GitHub MCP.** `mcp__github__list_pull_requests` and `mcp__github__list_issues` for open/blocking items. These tools use GitHub auth, not ecodia-core auth, and remain available.

4. **Pick the highest-leverage locally-executable action.** Options in descending priority:
   - Codify a new pattern discovered this session (write to `patterns/`, commit, push)
   - Review a draft PR that can be assessed from diff alone (no VPS observations needed)
   - Nothing actionable - write a one-line record to `drafts/` noting "meta-loop {timestamp}: ecodia-core expired, no substrate access, no local action available" and commit

5. **Do NOT:** attempt status_board.upsert, neo4j.write_episode, or inbox.read - they will all fail. Do not write a speculative Decision node to Neo4j via some workaround. Do not route around the token expiry by inventing alternate HTTP calls to the VPS API without knowing the current API shape.

6. **Commit any work to the active branch and push.** Git is the only durable substrate available in cloud sessions with expired ecodia-core auth. The commit shows up in `git log` and is visible to the VPS-resident conductor on next pull.

7. **End the session cleanly.** The episode write to Neo4j (normally Step 4 of the meta-loop) cannot be written. Accept this. The git commit IS the durable trace for this run.

## Do

- Pivot to local file + git substrates immediately on triple failure
- Write any doctrine produced this session as a pattern file + commit
- Check GitHub MCP (separate auth) for any visible pending work
- Push the working branch even if the only commit is a new pattern file

## Do not

- Retry ecodia-core calls beyond the initial three-way confirmation
- Claim "substrate oriented" when status_board, neo4j, and inbox are all unreachable
- Invoke subagents or forks to work around the expiry (they inherit the same cloud auth context)
- Leave the session with zero durable output just because the preferred substrates are unavailable
- Write "no work done" in narration without committing at least a record to git

## Mitigation / prevention

The root cause is ephemeral token TTL in cloud execution sessions. The VPS-resident conductor has long-lived tokens. Mitigation options:
- Pre-authorize the ecodia-core connection with a long-TTL token when creating scheduled cloud sessions
- Configure the cloud session MCP connection to use a service-account token stored in the repo secrets rather than a session-bound bearer
- Add a health-check to the meta-loop cron dispatcher: if ecodia-core ping fails before session launch, log to status_board and skip the cloud dispatch until re-auth

Until mitigated: cloud meta-loop sessions with expired tokens are expected to produce zero substrate writes. The VPS conductor's next turn will catch up via the git log.

## Origin

2026-05-16, meta-loop routine on tate@ecodia.au firing in cloud execution environment. All three Step 1 substrate queries (status_board_query, neo4j_search, inbox_read) returned `MCP server "ecodia-core" requires re-authorization (token expired)`. ToolSearch attempts to reload schemas returned the same deferred/expired state. No status_board writes, no Neo4j episode write possible. Git commit of this pattern file is the only durable output from this run. The migration tracking row `580f7aaf-d0c5-4153-b712-0b5d6738d3d5` and Neo4j recent-decisions query both remain unread this run.
