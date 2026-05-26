# CLAUDE.md Gap Audit - 2026-05-26

Routine: claude-md-reflection (daily 20:00 AEST). This routine has audit-only scope. It does NOT edit CLAUDE.md or pattern files. The local conductor (Corazon) picks up the edit work from the Phase 2 status_board row and applies Section 1 proposed text VERBATIM.

Audit window: incremental since the last audit on disk (2026-05-13), with focus on the 2026-25/26 May directive window. Branch audited: `claude/gifted-heisenberg-GnNh7`, HEAD `ac75c37` (2026-05-25). Repo-relative paths used throughout (on the Corazon working copy prefix with `backend/`).

Evidence base:
- Neo4j Episode/Decision/Reflection mine, 48h window, directive keywords (via `ecodia-full` connector; `ecodia-core` token was expired this run, see G3).
- git log since 2026-05-13, with attention to the 2026-05-20/21/24/25 voice + away-conductor + Corazon ship arc.
- Direct on-disk coverage probes of CLAUDE.md (grep counts below).
- status_board state (47 task rows).

Standing context: the `CLAUDE.md edit pending - audit 2026-05-25` status_board row is STILL OPEN (`audit_complete_edit_pending`, next_action_by=ecodiaos). Yesterday's edit work was never applied, so the gaps it raised (domain-scoped MCP connectors, PDF-canonical deliverable) persist on disk. Today's row should consolidate, not stack a third parallel edit row.

---

## (1) Gaps to add - rule, proposed exact text, target file

On-disk coverage probe (grep -ci against CLAUDE.md on this branch):
`away-conductor` 0, `resident-brain` 0, `ecodia-core` 0, `ecodia-full` 0, `domain-scoped` 0, `thread_log` 0, `case_files` 0, `one-brain` 0, `Deepgram` 0, `barge-in` 0. The live voice surface, the away-conductor, and the domain-scoped MCP architecture are entirely absent from CLAUDE.md, while pattern files for all three exist in `patterns/` and are not cross-referenced.

### G1 (P1) - Live voice-call surface is undocumented

Rule: a cold-start session reading CLAUDE.md has no idea EcodiaOS answers live voice calls. This is a whole new user-facing surface shipped 2026-05-21.

Target file: `CLAUDE.md`. Insert as a new top-level section after the "Laptop Agent - Corazon" section and before "Credentials".

Proposed exact text:

```
## Voice - Live Call Surface (shipped 2026-05-21)

The native app (au.ecodia.native) has a real hands-free voice call to Ecodia over a WebSocket. No Twilio, no PSTN, no per-minute cost. Verified end to end 2026-05-21: talk-to-interrupt, smart turn-taking, real-brain handoff.

- **Path:** the client (AVAudioEngine) streams linear16/16k binary frames over `wss://api.admin.ecodia.au/api/voice/call`. nginx proxies that path to `127.0.0.1:7461` (WS upgrade passthrough, same path so no URI rewrite).
- **Server:** `scripts/voice-call-server.js` (PM2 `voice-call` on the VPS, :7461) mounts `src/services/voiceCallService.js` per connection.
- **Pipeline:** Deepgram streaming STT to a fast Haiku brain (OAuth, sub-2s, live context injected) to OpenAI `gpt-4o-mini-tts` (raw PCM, 24kHz mono 16-bit, the client wire format) and frames back. About 3s to first audio.
- **Real work hands off:** the Haiku turn emits `HANDOFF: <task>`; the server speaks a brief ack, dispatches to the Corazon away-conductor WITHOUT blocking the call, then speaks or texts the result.
- **Turn-taking:** end the turn on Deepgram `UtteranceEnd` (audio VAD), never on an SDK-event-cadence debounce. Smart endpointing serves both "done" (fast commit on terminal punctuation) and "thinking" (extension on trailing words). Half-duplex with tap-to-interrupt is the safe fallback when echo cancellation will not engage.
- **Deploy:** server-side changes ship with `git pull` + `pm2 restart voice-call` (no app rebuild). Roundtrip test: `node scripts/voice-roundtrip-test.js "<phrase>"`. Bearer: `VOICE_CALL_TOKEN` = `kv_store.creds.tate_native_app_bearer`.

Full doctrine plus the AVAudioEngine / echo-cancellation gotchas: `~/ecodiaos/patterns/live-voice-call-architecture-2026-05-21.md`.
```

### G2 (P1) - away-conductor and one-brain stateful coordination are undocumented

Rule: the away-channel architecture changed structurally on 2026-05-20/21. When Tate is away from the keyboard, the SAME brain answers via a headless conductor on Corazon, not a second VPS Opus and not an IDE keystroke bridge. A session that does not know this will rebuild one of the two anti-patterns Tate explicitly flagged.

Target file: `CLAUDE.md`. Insert as a new top-level section immediately after the proposed G1 "Voice" section.

Proposed exact text:

```
## Conductor channels - one brain, three surfaces (2026-05-20/21)

When Tate is away from the keyboard and reaches EcodiaOS via an away-channel (iOS app, SMS, voice, Telegram), the work is done by the SAME brain that answers at the keyboard. Not a second VPS Opus, and not a keystroke injected into the IDE chat. Both are anti-patterns Tate flagged 2026-05-20.

- **away-conductor:** a headless `claude --print` ON CORAZON, reached by HTTP POST over Tailscale. Service `scripts/away-conductor-server.js` (PM2 `away-conductor`, Corazon :7460). It reads the same local files (CLAUDE.md, patterns, repo, memory), so it IS the same brain. VPS client `src/services/awayConductorClient.js` prefers it and falls back to the VPS Opus only if Corazon is unreachable, so Tate is never left silent.
- **One writer:** the away-brain edits the LOCAL repo and pushes to origin; the VPS is deploy-only and pulls. A never-two-writers lock defers to the interactive IDE conductor when it is mid-turn (reads `coordination/conductors/current.json`, stale > 5min = idle). One writer means divergence is structurally impossible, not synced after the fact.
- **Stateful across channels (migrations 132/133):** `thread_log` is the unified cross-channel conversation log keyed by `thread_id`; `case_files` is one row per in-flight cross-context piece of work (lifecycle open, working, resolved or blocked or abandoned, with `delivered_via[]` and `acknowledged_at`). Every brain tails the log on connect and appends each turn it produces. Services: `src/services/threadLog.js`, `src/services/caseFile.js`.

Full: `~/ecodiaos/patterns/away-conductor-runs-on-corazon-not-vps-2026-05-20.md`, `~/ecodiaos/patterns/one-brain-stateful-coordination-2026-05-21.md`.
```

### G3 (P1) - MCP access is domain-scoped, with a token-expiry sibling-route rule

Rule: the "8 MCP servers" framing is stale. The operating surface is split across domain-scoped connectors (`ecodia-core`, `ecodia-code`, `ecodia-full`), each with an independent bearer. A connector token can expire (recurring on `ecodia-core`) while a sibling stays valid. A session that treats a connector token-expiry as a hard block stalls unnecessarily.

Discovery-to-doctrine note: this routine HIT the gap this run. `mcp__ecodia-core__neo4j_search` and `mcp__ecodia-core__status_board_query` returned `requires re-authorization (token expired)`; rerouting the identical calls to `mcp__ecodia-full__*` succeeded immediately. The parallel-builder Routine has cited the same `ecodia-core` breakage across cycles 9 through 23. This was raised as P1-A in the 2026-05-25 audit and is still unapplied, so it is promoted here per `discovery-to-doctrine-same-turn.md`.

Target file: `CLAUDE.md`, in the "## System Access - MCP Tools" section, inserted immediately after the opening line "8 MCP servers. These are your hands."

Proposed exact text:

```
**MCP access is domain-scoped, not a monolith (2026-05-15 onward).** The operating surface is split across domain connectors, each with its own bearer and OAuth client, so a session loads only the tools it needs (the old single `/api/mcp/ecodia-full` cost about 22k tokens of tool-definition overhead per load):
- `ecodia-core` - status_board, kv_store, neo4j (search + write episode/decision), patterns semantic search, email/inbox read, os_session message. The everyday conductor surface.
- `ecodia-code` - forks, Vercel deploy/list/get.
- `ecodia-full` - the wide-bearer superset: all 22 cowork V2 tools in-process plus 10 proxied stdio servers (factory, google-workspace, supabase, vps, business-tools, bookkeeping, crm, scheduler, neo4j, sms), plus a dedicated `POST /shell_exec` route with denylist and rate cap. Use when a session needs the full surface.

**Token-expiry route-to-sibling rule.** When one connector returns `requires re-authorization (token expired)` (recurring on `ecodia-core`), do NOT treat the action as blocked. The same tool is reachable on a sibling connector with an independent bearer: `ecodia-full` mirrors `neo4j_search`, `status_board_query`/`status_board_upsert`, `kv_store_get`/`kv_store_set`, and `neo4j_write_episode`/`neo4j_write_decision`. Reload the sibling tool schema (ToolSearch `select:<name>`) and retry there. Full: `~/ecodiaos/patterns/domain-scoped-mcp-connectors-not-monolith-2026-05-15.md`, `~/ecodiaos/patterns/ecodia-full-mcp-proxy-architecture-2026-05-15.md`.
```

### G4 (P2) - parallel-builder loop bullet describes a dead substrate

Rule: the "parallel-builder (every 2h)" bullet in the "Core operating loops" section says "orchestrate Factory sessions. Always have code work queued." The cowork fork substrate it depends on has been confirmed dead across 20+ consecutive cycles (cycles 9 to 23, zero artefacts, status_board P1 row "scheduler.pause required (cowork substrate confirmed dead 8 consecutive cycles)" next_action_by=tate). The bullet should reflect the dead-substrate reality so a reader does not expect this loop to ship code today. This matches P2-A from the 2026-05-25 audit.

Target file: `CLAUDE.md`, "Core operating loops" section, the parallel-builder bullet.

Proposed exact text (replace the existing parallel-builder bullet):

```
- **parallel-builder** (every 2h): cron fires on the money@ cowork bearer. SUBSTRATE CURRENTLY DEAD: the cowork fork pool has returned zero artefacts across 20+ consecutive cycles (a scheduler.pause is recommended and pending Tate, status_board P1). Until the fork substrate is restored or the loop is repointed, the correct conduct is the stable-halt template (probe ground truth, confirm dead, log the cycle, dispatch nothing). Code-shipping parallelism today is a fresh local Claude Code chat tab, not this loop.
```

### G5 (P2) - "stop doing small builds, build out in all directions" directive

Rule: Tate verbatim in Episode "Context build 27 big swing - classifier + photos + reminders + insights 2026-05-26": "stop doing small builds. build the app out as far as you can in all directions." This is a build-velocity and scope directive. It overlaps existing patterns `delivery-velocity-same-turn-not-24-48hr.md` and `default-to-depth-on-creative-and-judgment-tasks.md` but is sharper and more recent. The conductor should pull the full verbatim from that Episode and decide whether to author a dedicated pattern (e.g. `build-out-in-all-directions-not-small-builds-2026-05-26.md`) and add a one-line cross-ref under "Doing tasks" / ambition doctrine. Low-cost P2; the exact pattern text is the conductor's call after reading the full Episode, so no verbatim block is prescribed here.

---

## (2) Stale items

- **"8 MCP servers" list (System Access section).** The monolith naming (google-workspace, github, crm, supabase, stripe, bookkeeping, scheduler, neo4j, vps, business-tools) describes the underlying tool inventory but not how it is reached today (domain-scoped connectors). Addressed by G3; the underlying tool list can stay as a reference but should sit under the domain-scoped framing.
- **Entire "Factory - Your Coding Workforce" and "Sub-agent dispatch protocol" sections.** Already banner-deprecated (2026-05-17) but the dead body is large and still describes `start_cc_session`, manager forks, FORK_REPORT, the 3-account provider chain, model-tier tables, SDK musl/glibc traps, per-query MCP server instances. A cold-start reader wades through hundreds of lines of dead doctrine before reaching live material. Structural debt, see Section 4.
- **"Frontend UI - Interactive Outputs" section.** Banner-deprecated 2026-05-17. The download-button / render-html primitives still resolve but render to a frontend Tate does not open. The live render target is auto-preview-on-write (already documented at the end of the section).
- **`mcp__router__route_work` and `mcp__scratchpad__write` sections.** Both still marked NOT YET SHIPPED (13 May). No change in status observed this window. Leave as-is; re-confirm on a future audit.

---

## (3) Missing cross-references

Pattern files authored in the recent window that exist in `patterns/` but are NOT linked from CLAUDE.md:

- `live-voice-call-architecture-2026-05-21.md` - resolved by G1.
- `away-conductor-runs-on-corazon-not-vps-2026-05-20.md` - resolved by G2.
- `one-brain-stateful-coordination-2026-05-21.md` - resolved by G2.
- `domain-scoped-mcp-connectors-not-monolith-2026-05-15.md` - resolved by G3.
- `ecodia-full-mcp-proxy-architecture-2026-05-15.md` - resolved by G3.
- `corazon-services-must-be-pm2-supervised-with-reboot-persistence-2026-05-21.md` and `pm2-supervised-or-not-shipped-2026-05-18.md` - the Corazon-services-need-PM2-supervision-plus-reboot-persistence rule is not cross-referenced from the "Laptop Agent - Corazon" section. P3 cross-ref add: one line under that section.
- `capacitor-ios-build-needs-env-production-on-disk-2026-05-24.md` and `tailwind-v4-shade-classes-resolve-transparent-when-theme-missing-them-2026-05-24.md` - new client-build patterns, do not need CLAUDE.md links (client-codebase scope), surfaced here for completeness only.

Filesystem-vs-git seam: two patterns mined from Neo4j self-evolution Episodes this window (`scoped-bearer-kv-write-mirror-to-cowork-namespace-2026-05-26.md`, `asc-internal-beta-group-must-be-created-via-dashboard-not-api.md`) are ABSENT from this clone. They were pushed to other ephemeral branches. The conductor must confirm any referenced pattern is on its working-copy disk before adding a cross-ref.

---

## (4) Structural issues

- **Edit-handoff loop is not closing.** The `CLAUDE.md edit pending - audit 2026-05-25` row is still `audit_complete_edit_pending`. Prior applied edits (2026-05-24) landed on ephemeral branches (`claude-beautiful-tesla-0OfCM`, `claude/tender-noether-XfBfH`, `claude/gifted-heisenberg-JBglL`) that do not appear to merge to a single canonical branch, so the on-disk CLAUDE.md on any fresh clone stays stale regardless of how many audits run. This is the highest-leverage structural finding: the audit pipeline works, the edit-apply-and-merge step does not. Recommend the conductor (a) apply the still-open 2026-05-25 P1 items together with today's, and (b) push to one canonical branch and confirm merge, not a new per-session branch each time.
- **Dead-doctrine bulk.** The Factory / fork / sub-agent / frontend sections (several hundred lines) are banner-deprecated but inline. A reader pays the full token + attention cost. Recommend excising the dead bodies to an archive doc (`docs/_archived/claude-md-deprecated-substrates-2026-05.md`) and leaving a one-paragraph stub + link in CLAUDE.md. This is a larger edit; flag P3, conductor's judgement on timing.
- **Header order / findability.** Live surfaces (voice, away-conductor, domain-scoped MCP) would land mid-to-late in the file behind dead Factory doctrine. After the G1/G2 inserts and the dead-body excision, the top-of-file should orient a cold-start reader to: status_board, memory substrate, MCP connectors, laptop agent, voice + away channels. P3.

---

## (5) Prioritised P1/P2/P3 to-do

P1 (apply this cycle, verbatim from Section 1):
- **P1-G3** - MCP domain-scoped connectors + token-expiry route-to-sibling. Highest confidence (hit empirically this run, recurring, raised 2026-05-25 and still unapplied). Insert in "System Access - MCP Tools".
- **P1-G1** - Voice live-call surface. New section after "Laptop Agent - Corazon".
- **P1-G2** - away-conductor + one-brain stateful coordination. New section after the Voice section.
- Also apply the STILL-OPEN 2026-05-25 P1 items (PDF-canonical deliverable, plus the MCP item which G3 now supersedes) in the same edit, then archive the 2026-05-25 edit row.

P2:
- **P2-G4** - rewrite parallel-builder loop bullet to dead-substrate version (verbatim Section 1).
- **P2-structural** - apply on one canonical branch and confirm merge; stop the per-session-branch staleness leak (Section 4 finding 1).
- **P2-G5** - read full "Context build 27" Episode verbatim, decide on a build-out-in-all-directions pattern + one-line CLAUDE.md cross-ref.

P3:
- **P3-G(cross-refs)** - add Corazon-PM2-supervision-plus-reboot-persistence cross-ref under "Laptop Agent - Corazon" (confirm pattern on disk first).
- **P3-structural** - excise dead Factory/fork/frontend bodies to an archive doc, leave stub + link.
- **P3-structural** - re-order top-of-file for cold-start findability after the excision.

Note: no client contact, no Factory dispatch, no commercial action taken by this routine. The 2026-05-26 business-doctrine milestone (EcodiaOS becomes 51% convertible majority option holder over both AU operating cos, LoD sent to [redacted]/[redacted]) belongs in the Tate-laptop-only `~/CLAUDE.md` business doctrine, which is not in this repo. It is surfaced as a SEPARATE status_board row for the local conductor.
