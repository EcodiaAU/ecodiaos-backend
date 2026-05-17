# Parallel-builder run log - 2026-05-18 08:05 AEST

**Run fired:** 2026-05-18T22:05:17Z (08:05 AEST)
**Account:** money@ecodia.au
**Branch:** claude/exciting-curie-SgMRg
**Outcome:** BLOCKED - MCP token expiry

## Blocker

Both `ecodia-core` and `ecodia-factory` MCP servers returned `requires re-authorization (token expired)` on every tool call. The routine requires:

- `status_board_query` to find parallelisable work
- `kv_store_get` for last-run state and dispatched-streams list
- `kv_store_set` to record run state
- `neo4j_write_episode` for durable run log
- Fork dispatch (requires ecodia-core MCP)

4-question routing check per `when-a-tool-is-unavailable`:
1. Corazon route: needs `kv_store.creds.laptop_agent` token - blocked (kv_store unavailable)
2. Stored credential: all creds in kv_store - blocked
3. Different endpoint: Supabase REST API needs service_role_key - blocked (in kv_store)
4. Fork from different account: requires ecodia-core MCP - blocked

All four routes converge on kv_store access, which requires the expired MCP token. This is a Tate-action item: re-authorize the ecodia-core and ecodia-factory custom connectors on claude.ai.

## Codebase state observed

**Branch vs main:** 12+ files ahead on `claude/exciting-curie-SgMRg`, already pushed:
- `src/app.js`, `src/routes/smsWebhook.js`, `src/routes/webhooks/telegram-bot.js` (SMS/Telegram reflex substrate)
- 8 new pattern files (iOS ship protocol, Corazon reflex substrate, reflex-first doctrine, etc.)
- 3 Roam release draft files (roam-release-program, stream-b-perf-brief, stream-c-carplay-brief)
- `scripts/ship-ios.py`, `scripts/sy094-ssh.py`, `scripts/setup-telegram-bot.js`

**Open PRs (GitHub):**
- PR #47 (DRAFT): prompt-assembler flip-live - gated on 3 observability checks (48h shadow audit clean, 3d USE_SKILLS_SURFACE=1 observation, 24h CACHE_KEEPALIVE_ENABLED=true)
- PR #41 (DRAFT): forkService atomic cap swap - gated on Tate SMS-OTP approval (self-mod denylist)

Neither PR can be advanced by the parallel-builder - both blocked on external gate conditions.

## What was NOT dispatched

Without status_board access, I cannot enumerate what work was queued. The last parallel-builder run state is unknown (kv_store unavailable). Likely work categories based on branch context:
- Roam Stream A (App Store ship-prep): `drafts/roam-release-program-2026-05-17.md` describes Stream A as "this chat, today" work
- Roam Stream B (perf fixes): brief at `drafts/roam-stream-b-perf-brief-2026-05-17.md`
- Roam Stream C (CarPlay entitlement + scaffold): brief at `drafts/roam-stream-c-carplay-brief-2026-05-17.md`

These streams were written by the previous session (2026-05-17) and may still be pending depending on what's been actioned since.

## Required action

**Tate:** Re-authorize ecodia-core and ecodia-factory custom connectors at claude.ai/settings (or wherever the connector OAuth is managed). Until tokens refresh, all cloud CC sessions running as cron routines will be blocked on Step 1 orientation.
