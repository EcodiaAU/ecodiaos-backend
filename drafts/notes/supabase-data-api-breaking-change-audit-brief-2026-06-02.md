# Supabase Data API breaking change - full audit + fix across every Ecodia project

**Origin:** status_board row `ef9d0d14-6536-4fd9-95c2-117e00adb220` (P2). The Supabase Data API soft deadline of **30 May 2026 already passed**. Hard cutover is **30 Oct 2026**. Tate flagged we have not done the audit. This brief turns it into a parallel-chat work package.

**Scope: every Ecodia-touched Supabase project. Do not narrow without surfacing why.**

## Goal

End the session with every project either (a) confirmed not broken under the new Data API behaviour, or (b) migrated to the new behaviour, or (c) on a dated written plan with the next concrete step. Status_board row above gets touched per project, archived when the last project lands.

## Substrate access (read this BEFORE asking Tate anything)

- Org PAT: `D:/PRIVATE/ecodia-creds/supabase.env`, var `SUPABASE_ACCESS_TOKEN` (shape `sbp_...`). Reaches every project via Management API at `https://api.supabase.com`. Do NOT pull this via MCP - `creds.*` is scope-denied on every connector. Local file only.
- Management API SQL runs as `postgres` (superuser), bypasses RLS. To exercise the real authenticated path: `begin; set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'; <stmt>; rollback;`.
- Per-project app-user creds (Co-Exist test login, etc) live in `kv_store.creds.<project>_supabase` and `kv_store.creds.coexist`. NOT in the Management API.
- Full doctrine: `D:/.code/EcodiaOS/backend/CLAUDE.md` section "SUPABASE ACCESS - org PAT reaches EVERY project".

## Project register (run move #1 against the live list to catch any new project)

```bash
set -a; . D:/PRIVATE/ecodia-creds/supabase.env; set +a
curl -s https://api.supabase.com/v1/projects -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | jq '.[] | {ref:.id, name:.name, org:.organization_id, status:.status}'
```

Known refs (from CLAUDE.md, may be incomplete):
- Co-Exist `tjutlbzekfouwsiaplbr`
- Ecodia App `nxmtfzofemtrlezlyhcj`
- Chambers `arkbjjkfjsjibnhivjis`
- ROAM / Glovebox `vzauarlfmkjfkcphojbd`
- Wildmountains `efrytpwdrxfaehtqfpkq`
- Woodfordia `iqrxrjgutvowvetrmywr`
- Wattle `jbdghvzfvxvohztfxzan`
- goodreach `ngoeairmbigqulhfjqso` (own org)
- Resonaverde `dxtglcfyqvhmmnopshhp` (own org)
- Co-Exist Backup `njprlytfwtqzbyktegha`
- coexist-recovery `yfmihkgbpechyoitohjb`
- esp-sales-prod `igualtfcqitjbaaznigv`

## What "the Data API breaking change" actually is

Confirm the exact change set BEFORE writing fixes. Two sources:
1. Supabase dashboard for each project -> **Settings -> API Docs / Deprecations**. The deprecation banner names the specific endpoints/behaviour being removed for that project and surfaces last-30-day usage of deprecated patterns.
2. `https://supabase.com/docs/guides/api/rest/changelog` (or the equivalent live page, find via supabase.com search) for the changelog entries dated April / May / June 2026.

Likely candidates (verify before assuming): default schema exposure changes, PostgREST version bump, removal of legacy auth helpers, `apikey` header rules, response-shape changes for embedded resources. **Do not assume - read the banner per project.**

## Per-project audit checklist

For every project in the register, run this in order and write findings to status_board:

1. **Probe deprecation banner.** Use the Management API to fetch project settings, OR (faster) drive Tate's Chrome via CDP through the laptop-agent to the project dashboard's Settings -> API page and screenshot the deprecation block. CDP first move: `POST http://127.0.0.1:7456/api/tool {"tool":"gui.enable_chrome_cdp","params":{"port":9222}}` per `~/.claude/CLAUDE.md` reflex.
2. **Inspect last-30-day deprecated-usage counts** if Supabase surfaces them per project.
3. **Grep client code for affected patterns.** Client repos under `D:/.code/`:
   - `coexist/` -> Co-Exist
   - `roam/`, `glovebox/` -> ROAM / Glovebox
   - `chambers/`
   - `goodreach/`
   - `resonaverde/`
   - `wildmountains/`
   - `woodfordia/`
   - `wattle/`
   - EcodiaOS itself at `D:/.code/EcodiaOS/`
   Search `createClient`, `from(`, `rpc(`, `.select(`, custom fetch wrappers, Edge Function code, raw `fetch('${SUPABASE_URL}/rest/v1/...`).
4. **Inspect Edge Function logs for 4xx/5xx spikes since 30 May 2026.** Per project: `curl -s "https://api.supabase.com/v1/projects/<ref>/functions" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"` then per function pull logs and check error rate vs the 30-day baseline.
5. **Diagnose.** Classify as: (a) not affected, (b) affected-but-already-on-new-behaviour, (c) affected-needs-migration, (d) unknown-needs-deeper-probe.
6. **Migrate where needed.** Edits in the client repo, push via GitHub-recognised commit author (`feedback_vercel_deploys_need_github_recognised_commit_author_2026-05-25.md`), verify deploy lands per the eight-rung dev process (`D:/.code/EcodiaOS/backend/CLAUDE.md` "DEV PROCESS - eight rungs"). For Edge Functions, redeploy via `supabase functions deploy <name> --project-ref <ref>` from each repo.
7. **Visual-verify the live app on a real test user.** For Co-Exist use `kv_store.creds.coexist`. For others find the equivalent or mint one. Do NOT skip rung 6 of the dev process.

## Status_board discipline

- Row stays P2 throughout. Update `status` and `next_action` on every project completion. Format the status field with progress: e.g. `audit_inflight_8_of_12_complete_3_clean_4_migrated_1_unknown`.
- For each project that finds real breakage, **open a child row** linked back to `ef9d0d14`: name `Supabase Data API migration: <project>`, entity_type `infrastructure`, priority 2, with a concrete next_action.
- Archive `ef9d0d14` only when (a) every project has been audited AND (b) every migration row is itself shipped or archived.

## Hard constraints (will trip hooks if violated)

- No em-dashes (U+2014). Use `-` or restructure. PreToolUse hook hard-blocks Write/Edit otherwise.
- Never blind-restart PM2 on the VPS during this work. Bypass token `# pm2-guard-ok` required and only after the 3-step pre-check. See `~/.claude/CLAUDE.md` hard-stop tripwire.
- Never write the org PAT or any service_role key into chat, Neo4j, status_board, or a commit.
- This work touches client repos. Per `decide-do-not-ask.md` you have authority to ship migrations directly. Per `no-client-contact-without-tate-goahead.md` you do NOT have authority to email any client about it without Tate signing off first.

## Deliverable shape (one block at end of session)

1. Live project register with audit verdict per project.
2. Per-project diff link / commit SHA / Vercel deploy URL where migration shipped.
3. Updated status_board row text mirroring the table above.
4. Any new child rows opened.
5. List of items that genuinely needed Tate (e.g. ASC creds rotate, client-facing comms) - keep this short and only what the autonomy doctrine actually requires.

## Sanity end-state

Either: every project audited and either clean, migrated and deployed, or has a dated next-step row on the board, **AND** ef9d0d14 reflects that reality verbatim. Or: a surfaced blocker named in plain language that explains why the work could not finish, with the minimum-viable Tate ask attached.
