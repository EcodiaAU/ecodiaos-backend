---
triggers: routine-corpus, routine-prompt-shape, routine-frontmatter, anthropic-routines, claude-code-routines, per-account-distribution, daily-routine-cap, cap-balancing, routine-deliverable, routine-leaf, routine-no-spawn-fork, routine-no-shell, accountRouter, REGISTRY.md, post-cutover-routines, lane-d
status: archived
archived_at: 2026-06-02
archived_reason: Routines status unverified since 2026-05-17 per backend/CLAUDE.md; corpus depends on deprecated cowork bearer + ecodia-full MCP gateway. Many routines depended on VPS substrate now gone.
superseded_by: scheduler-substrate-unification-spec-2026-06-02.md
---

# Routine corpus architecture (2026-05-15)

**MCP-surface note 2026-05-29 (status_board 2bf2c734).** Where this describes Routines reaching the substrate via ecodia-full or the cowork gateway, that surface is deprecated and sunset-pending. Routines migrate to the narrow connectors as part of the scheduler repoint. See [[mcp-narrow-connectors-are-canonical-cowork-v2-and-ecodia-full-deprecated-2026-05-29]].

The 16 Routines that replace the VPS cron pool follow one prompt structure and one distribution rationale. This pattern codifies both so future Routines and future migrations land in the same shape.

## The prompt structure (mandatory)

Every routine `.md` in `backend/routines/` has:

1. **YAML frontmatter** with these exact keys:
   - `account` - one of `tate@ecodia.au | code@ecodia.au | money@ecodia.au` (or a future fourth)
   - `schedule` - cron-style cadence string OR `"trigger: api"` for API-trigger routines
   - `trigger` - `schedule | api | github`
   - `repos` - which repos the Routine clones (default `EcodiaOS-backend`)
   - `connectors` - always at least `ecodia` (the Custom Connector wrapping the MCP)
   - `permissions` - `claude/-prefixed branches only (default)` unless an exceptional case justifies wider scope
   - `purpose` - one-line summary

2. **Opening paragraph** that names the routine identity, account, cadence, and time budget. Routines have no shell access by default; everything is MCP or sub-agent.

3. **Step 1 - Substrate orientation**: explicit MCP tool calls (status_board.query, neo4j.search, kv_store.get, etc.) so the routine knows what state to load before deciding.

4. **Step 2..N - Decision + execute**: the actual work, with concrete decision criteria and action options. Per \`_archived/decide-do-not-ask.md\`, the routine picks one path and runs it.

5. **Step N+1 - Episode write**: `neo4j.write_episode` (or write_decision/write_reflection where shape-appropriate) capturing what was read, decided, and written. Type is one of `cowork_realisation` (acted on) or `cowork_audit` (probed only).

6. **Constraints** section listing: em-dashes BANNED, autonomy doctrine, scope limits, and per-routine specific rules.

7. **Failure modes to avoid** section listing 3-5 specific failure modes for that routine.

The 5 exemplar routines authored in the Phase 0 sprint (meta-loop, email-triage, parallel-builder, system-health, morning-briefing) are the canonical templates. The 11 Lane D additions follow the same shape verbatim.

## The per-account distribution rationale

The Anthropic daily-routine-cap is undocumented but enforced. Spreading routines across the three Max 20x accounts (tate@, code@, money@) buys headroom and isolates failure - one account hitting cap does not silence the entire substrate.

The 2026-05-15 distribution:

| Account | Routines (count) | Roles |
|---|---|---|
| tate@ecodia.au | meta-loop, system-health, morning-briefing, deep-research, self-evolution, strategic-thinking, inner-life, claude-md-reflection, vercel-deploy-monitor, vercel-deploy-handler, pattern-corpus-health-check, daily-index-regen, kg-consolidation, apple-asn-handler (14) | Conductor heartbeat, doctrine evolution, app-store revenue surface |
| code@ecodia.au | email-triage, outreach-engine, inbound-email-handler (3) | Inbox + outreach |
| money@ecodia.au | parallel-builder, marketing-outreach, weekly-financial-review, stripe-event-handler, factory-cloud (5 incl. Lane C optional) | Pipeline + revenue ops |

The tate@ load is heavy. If the daily cap proves restrictive, the rebalancing target is to move pattern-corpus-health-check + daily-index-regen + kg-consolidation to money@ - they are low-frequency low-priority and money@ has slack.

## Cap-balancing protocol (ad-hoc /fire)

Scheduled routine fires count against the routine's owning account's cap. Ad-hoc fires (from webhook shims, voice commands, slash commands) use `accountRouter.pickAccount()` to land on the highest-headroom account.

The router reads `kv_store.cowork.account_usage.<account>.<YYYY-MM-DD>` for fires_today + a per-account `cap_estimate` (default 50). Picks highest headroom_pct. Excludes accounts the caller marks unavailable. Increments usage on successful fire.

Cap-hit detection: a 429 or 402 from the Routine /fire endpoint marks the picked account excluded for the current routing call and falls through to the next-best. After all accounts exhausted, returns `{ ok: false, error: 'all_accounts_exhausted' }` and the caller decides whether to retry later, surface to status_board, or fail-fast.

Tuning: as we observe actual cap-hit timing, update each account's `cap_estimate` in kv_store. The 50/day default is a guess; it will be wrong.

## Routine constraints (universal)

All routines inherit:

- **Em-dashes BANNED** at character level per `em-dashes-banned-character-level-no-exceptions.md`.
- **No client contact without Tate go-ahead** per `no-client-contact-without-tate-goahead.md` (the gmail handler enforces this server-side; routines must respect the standing-arrangement carve-outs).
- **Decide-do-not-ask** per \`_archived/decide-do-not-ask.md\`. Routines do not surface "should I do X or Y" questions to Tate.
- **Cron deliverable mandate** per `cron-fire-must-have-deliverable-not-just-narration.md`. Every fire writes at least one durable substrate artefact (Episode + status_board OR kv_store write). Narration without artefact is failure.
- **Routines are leaves**. `mcp__forks__spawn_fork` is unavailable. Decomposition belongs to the local conductor's Task subagents.
- **No `pm2 restart` of VPS processes** - routines do not have shell scope by default.
- **No destructive operations** (DELETE, DROP, archived_at flips on rows the routine did not author this run).
- **Brief-Tate-First triggers** per `100-percent-autonomy-doctrine-30-apr-2026.md`: outbound external client contact, client work over $5000, recurring spend over $50/mo, deletion of client data, signing legal weight. Nothing else gates on Tate.

## Routine creation flow (one-time, per Routine)

1. Author the prompt at `backend/routines/<name>.md` following the template above.
2. Sign in to claude.ai as the routine's `account`.
3. Visit `https://claude.ai/code/routines` -> New routine.
4. Name = filename without `.md`.
5. Prompt = the body BELOW the frontmatter (frontmatter is for routing context only, not part of the prompt sent to the model).
6. Configure schedule + repos + connectors + permissions per the frontmatter.
7. Click Create. Run-now once to verify the first end-to-end run.
8. Capture the `/fire` URL + bearer token from the Routine settings page into `backend/routines/REGISTRY.md`.
9. Run `node backend/scripts/populateRegistry.js` to push to kv_store.

## Verification checklist (per routine, post-create)

After Run-now-firing once:
1. Routine reads its substrate inputs without 401.
2. Routine makes at least one durable substrate write (status_board.upsert OR neo4j.write_episode/decision OR kv_store.set).
3. Routine completes in <50% of its scheduled interval.
4. The audit-log entry in `kv_store.cowork.webhook_audit` (for API-trigger routines) shows the fire path landed.

If any check fails, see the failure-mode debugging guide in `backend/routines/README.md` "Verification" section.

## Do

- Keep each routine prompt under ~100 lines. If it exceeds, split into two routines.
- Use the existing 5 exemplars as voice + structure templates. New routines that drift in voice fail validation.
- Coordinate with `webhook-fire-shim-architecture-2026-05-15.md` for any new API-trigger routine.
- Update REGISTRY.md AND run populateRegistry.js when creating, re-keying, or removing a routine.

## Do not

- Do NOT author a routine that needs scopes the cowork bearer lacks without flagging `requires_bearer: ecodia-full` in the frontmatter (so Lane E knows to widen scope before the routine ships).
- Do NOT spawn nested forks. Routines are leaves.
- Do NOT include em-dashes anywhere - frontmatter, body, comments, examples.
- Do NOT skip the Episode/Decision/kv_store write on a "quiet day". Even a clean audit IS the deliverable.
- Do NOT fire-and-forget on long-running operations (kg-consolidation Director). Use the watermark-not-side-effect pattern from `cron-verify-watermark-not-side-effect.md`.

## Cross-references

- `backend/routines/README.md` - the operational catalogue with the per-routine table
- `backend/routines/REGISTRY.md` - per-account fire-URL/token table
- `backend/scripts/populateRegistry.js` - parses REGISTRY.md, upserts kv_store entries
- `backend/src/services/accountRouter.js` - load-balancing across accounts
- `backend/patterns/webhook-fire-shim-architecture-2026-05-15.md` - sibling pattern for API-trigger ingress
- `backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md` - the full migration plan, sections 3 and 4

## Origin

Authored 2026-05-15 as the Lane D deliverable codifying the routine corpus shipped that day. The 5 exemplars from the Phase 0 sprint (meta-loop et al, authored by the Corazon migration chat) established the prompt-shape and per-account distribution; Lane D added the 11 schedule-trigger routines + 4 API-trigger routines + REGISTRY.md + accountRouter, and this pattern codifies the architecture so the next routine authoring session lands consistently.
