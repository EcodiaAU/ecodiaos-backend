# MCP surface map + consolidation plan - 2026-05-29

Scope (Tate): map + sequenced plan, execute nothing structural yet. Approve item-by-item. Bearer rotation flagged as item 1.

---

## 1. The surface map

Three server-side gateway generations, all live, exposed across three config layers.

### Server side (app.js mounts)

| gateway | tools | scopes | bearer storage | who uses it | status |
|---|---|---|---|---|---|
| cowork (`/api/mcp/cowork`) | ~22 | 17 (coworkScope) | kv_store `creds.cowork_mcp_bearer` | claude.ai Routines; **scheduler rides this** | oldest live, load-bearing |
| ecodia-full (`/api/mcp/ecodia-full`) | 157 | 62 (ecodiaFullScope) | **plaintext in project .mcp.json** + kv_store | local Corazon conductor (this seat) | "30d alias", meant to sunset ~2026-06-14 |
| 10 narrow connectors (`/api/mcp/ecodia-{core,comms,code,money,shell,supabase,scheduler,crm,graph,factory}`) | subset each | scoped subset of ecodia-full | kv_store `creds.ecodia_<x>_mcp_bearer` (one each) | claude.ai account connectors | the migration target |
| OAuth PKCE wrapper (`/api/oauth/mcp`) | n/a | wraps ecodia-full | n/a | claude.ai custom-connector forms that reject raw bearer | live |

### Client config layers (the sprawl)

1. **Project `.mcp.json`** (git-tracked): `coord` (laptop-agent), `ecodia-full`, `visual-test`. Both HTTP bearers inline plaintext.
2. **User-global `~/.claude.json`**: additional `ecodia-*` connectors surface here for the local seat.
3. **claude.ai account connectors** (`claude_ai_*` prefixes): `EcodiaOS_Cowork_V2`, the `ecodia-*` narrow set, plus native `Gmail`/`Google_Calendar`/`Google_Drive`. Configured in the claude.ai web UI, used by Routines. Not in any repo file.

---

## 2. Auth audit

- **FINDING 1 (the real one): wide bearer in plaintext, git-tracked.** `.mcp.json` carries the ecodia-full 62-scope bearer (`b31312a0...`, covers shell_exec, Stripe, full Supabase, GitHub) and the coord bearer inline. Both are in git history, so they are already exposed. Fix = rotate, which requires auditing consumers first (the local seat is the consumer of ecodia-full; rotating mid-session can break this conductor's own hands, so stage it).
- **FINDING 2: bearer sprawl.** ~12 bearers to manage: cowork + ecodia-full + 10 narrow. The narrow ones and cowork are stored properly in kv_store; only the project `.mcp.json` two are plaintext.
- **FINDING 3: least-privilege defeated for the local seat.** The conductor authenticates to everything with the 62-scope monolith bearer when the scoped connectors exist for exactly this reason.
- **GOOD: server-side narrow connectors are authed correctly** (kv_store-stored, scoped, fetched at mount). The split was built right; the clients just never moved over.

---

## 3. Redundancy findings

- **Three generations coexist**: cowork (gen 1, Routines + scheduler), ecodia-full (gen 2, monolith alias), 10 narrow connectors (gen 3, target). Every ecodia-full tool is duplicated in a narrow connector; cowork overlaps ecodia-core + ecodia-scheduler.
- **Dead connector**: `ecodia-factory` still mounted, Factory process not running. Dead auth surface.
- **Duplicate Google access**: claude.ai native `Gmail`/`Calendar`/`Drive` connectors overlap `ecodia-comms` (which carries gmail/calendar/drive tools).

---

## 4. Sequenced plan (approve item-by-item)

Ordered by risk-adjusted value. Nothing here is executed yet.

**Item 1 - Rotate the plaintext ecodia-full + coord bearers (security, do first).**
Risk: medium (this conductor's own hands). Steps: mint new scoped bearer(s), move out of git-tracked `.mcp.json` into a non-tracked include or env-injected header, rotate the old token server-side, verify this seat still has its tools, then invalidate the leaked token. Per the cred-rotation-must-propagate doctrine, audit every consumer of `b31312a0` first.

**Item 2 - Kill the dead `ecodia-factory` connector.**
Risk: low. Remove from connectorManifests + unmount. Confirm no Routine prompt references factory MCP first (Factory is dead, but check).

**Item 3 - Dedupe Google access.**
Risk: low. Decide one path: native claude.ai Google connectors OR ecodia-comms gmail/calendar/drive tools. Remove the other from the account connector set. Likely keep ecodia-comms (single auth model, audited) and drop the native trio, or vice-versa per what the Routines call.

**Item 4 - Point the local seat at scoped connectors instead of ecodia-full.**
Risk: medium. Replace the project `.mcp.json` ecodia-full entry with the narrow connectors the conductor actually needs (core, scheduler, comms, supabase, code, graph...). Removes the monolith dependency for this seat and gives least-privilege. Verify tool coverage before removing ecodia-full.

**Item 5 - Migrate Routines off cowork, then sunset cowork + ecodia-full.**
Risk: HIGH - cowork carries the scheduler and is wired into claude.ai account connectors. Staged: (a) stand up the equivalent on ecodia-scheduler + ecodia-core, (b) repoint each Routine's connector + verify a live scheduler.delayed round-trip, (c) only then retire cowork and ecodia-full. This is the end-state that collapses three generations to one. Do last, with verification at each Routine.

**Open data point for the plan**: exact claude.ai account-connector inventory needs a read of the claude.ai connectors UI (CDP/dashboard), not a repo file. Worth capturing before Item 3/5.

---

## Verdict

Real consolidation, already half-designed (the narrow split exists and is authed correctly). The blocker was never the design, it was that the clients never moved off the monolith + cowork. Items 1-3 are safe and high-value. Items 4-5 touch the scheduler lifeline and need staged verification. Recommend executing Item 1 next regardless of the rest.
