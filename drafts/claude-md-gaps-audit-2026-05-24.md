# CLAUDE.md Gap Audit - 2026-05-24

Routine: claude-md-reflection (Phase 1, audit-only). Fired 20:00 AEST 2026-05-24.
Scope: technical CLAUDE.md (`backend/CLAUDE.md`). Business `~/CLAUDE.md` is not in this clone; surfaced separately for the local conductor.

Evidence base:
- Neo4j 24h directive mine (Episode/Decision/Reflection with rule/doctrine/codify keywords): 13 nodes.
- Pattern files authored on this branch in last 24h: 4 (altool-attach, ship-ios-py, chambers-ios recipe, tailwind-v4-shade).
- Pattern files Neo4j says were authored today but ABSENT from this git clone: 4 (see Section 4).
- Branch state: `claude/gifted-heisenberg-NYyrt` is 7 ahead / 0 behind origin/main.

The single dominant directive of the day: the MCP connector token-expiry routing rule, independently re-discovered 5+ times by separate Routines (meta-loop 15:13/16:07/17:05, parallel-builder, self-evolution, kg-consolidation). It is promoted to P1 per discovery-to-doctrine-same-turn.

---

## (1) Gaps to add

### GAP 1 (P1) - MCP connectors are domain-scoped; token-expiry is per-connector, not a substrate outage

Rule: CLAUDE.md's "System Access - MCP Tools" section still describes the pre-migration "8 MCP servers" monolith. It has zero reference to the domain-scoped connector model (`ecodia-core`, `ecodia-scheduler`, `ecodia-full`), nor to the token-expiry routing rule that cost wasted cycles across every cron-fired Routine today. A pattern was authored today on the VPS filesystem (`mcp-connector-token-expiry-is-per-connector-route-to-sibling-substrate.md`) and the supporting `domain-scoped-mcp-connectors-not-monolith-2026-05-15.md` exists on disk but is uncited from CLAUDE.md.

Target file: `backend/CLAUDE.md`, section "System Access - MCP Tools" (insert as a new subsection immediately after the "8 MCP servers. These are your hands." intro line).

Proposed exact text (apply verbatim):

> ### MCP connectors are domain-scoped - token expiry is per-connector, not a substrate outage
>
> The MCP surface is split into domain-scoped connectors (`ecodia-core`, `ecodia-scheduler`, others) plus the wide `ecodia-full` alias. They all read and write the SAME Postgres (status_board + kv_store) and the SAME Neo4j graph. So a connector returning `requires re-authorization (token expired)` is a per-connector OAuth lapse in the ACCESS PATH, not a substrate outage.
>
> Protocol when a connector returns token-expired:
> 1. Route around to a sibling connector that reaches the same substrate. `ecodia-full` is the canonical fallback until its 2026-06-14 sunset. Do not re-derive this workaround on every fire.
> 2. Escalate the claude.ai re-auth ONCE on a single status_board infrastructure row with next_action_by=tate, never per-Routine. Per-Routine escalation floods the queue with near-identical rows.
>
> Bearer scope limits (the headless / cowork bearer used by Routines and cowork-pool forks):
> - `kv_store_set` is hard-locked to `cowork.*` and `cowork-session.*` namespaces. Writes to `ceo.*` or `kg.*` return scope_denied. Route canonical pointers to a `cowork.*` mirror and let a privileged actor (conductor on main, or Tate) reconcile back.
> - `status_board_upsert` cannot update rows with entity_type in {infrastructure, legal}. A cowork fork can produce the artefact (Decision, audit, kv_store report) but cannot flip such a row; a privileged actor advances it.
>
> Full: `~/ecodiaos/patterns/mcp-connector-token-expiry-is-per-connector-route-to-sibling-substrate.md`, `~/ecodiaos/patterns/domain-scoped-mcp-connectors-not-monolith-2026-05-15.md`. Origin: 5+ independent Routine re-discoveries on 2026-05-24 (meta-loop, parallel-builder, self-evolution, kg-consolidation each hit ecodia-core token-expired and re-derived the ecodia-full reroute).

### GAP 2 (P2) - iOS ship runs through ship-ios.py universal driver; altool does not auto-attach to a beta group

Rule: the "iOS release pipeline cluster (7 May 2026)" paragraph names `sy094-eos-mobile-headless-ship-recipe.md` as the validated_v1 headless path. That recipe is now defunct (retained for historical reference only). The live path is `scripts/ship-ios.py`, a universal driver reading `~/asc-scripts/apps/<slug>.json`, with per-app recipes (chambers, coexist) layering the mandatory beta-group attach. CLAUDE.md never mentions `ship-ios.py` and does not capture the altool-does-not-attach gotcha that cost a round-trip today.

Target file: `backend/CLAUDE.md`, immediately after the "iOS release pipeline cluster (7 May 2026)" paragraph (around line 188).

Proposed exact text (apply verbatim):

> **iOS ship universal driver + per-app recipes (24 May 2026 update):** the per-app headless ship now runs through `scripts/ship-ios.py` on SY094, a universal 10-step driver that reads `~/asc-scripts/apps/<slug>.json` (bump build, npm install, npm run build, cap sync ios, unlock keychain, xcodebuild archive + export, altool upload). It self-bootstraps PATH (nvm + homebrew) and KEYCHAIN_PASSWORD over non-interactive SSH so callers need no env preamble, per `~/ecodiaos/patterns/ship-ios-py-must-self-bootstrap-path-and-keychain-over-ssh.md`. Invoke from any context: `ssh user276189@<sy094> 'python3 ~/asc-scripts/ship-ios.py <slug>'`. Per-app recipes layer the beta-group attach on top: `~/ecodiaos/patterns/chambers-ios-headless-ship-recipe.md` (status validated_v1) and `~/ecodiaos/patterns/coexist-ios-headless-ship-recipe.md`. CRITICAL gotcha: `xcrun altool --upload-app` uploads only; it does NOT attach the build to a TestFlight beta group, so no internal tester is notified until a second ASC API call attaches the build to the Internal group. Always probe the live `/apps/{id}/betaGroups` for the current group id, because codified `asv_id` values age out. Full: `~/ecodiaos/patterns/altool-upload-does-not-attach-to-testflight-beta-group-2026-05-24.md`. The earlier `sy094-eos-mobile-headless-ship-recipe.md` predates the universal driver and is historical only.

### GAP 3 (P3) - Tailwind v4 shade-class transparency trap has no home in CLAUDE.md

Rule: a new high-recurrence frontend gotcha was codified today (`tailwind-v4-shade-classes-resolve-transparent-when-theme-missing-them-2026-05-24.md`): undefined `--color-X-N` shade tokens render transparent, producing invisible buttons that pass typecheck and Vercel READY. CLAUDE.md has no frontend-gotchas surface to cross-reference it from. Lowest-cost fix is one cross-ref line, not a new section.

Target file: `backend/CLAUDE.md`, alongside any visual-verification mention (the doctrine already references `visual-verify-is-the-merge-gate-not-tate-review.md`).

Proposed exact text (apply verbatim, append to a visual-verification cross-ref list or add as a standalone line):

> Frontend CSS gotcha: in Tailwind v4 an undefined `--color-X-N` shade token resolves to transparent (invisible button, white-on-white), not a sane fallback. Typecheck and Vercel READY both pass; only a browser render or computed-style probe catches it. Full: `~/ecodiaos/patterns/tailwind-v4-shade-classes-resolve-transparent-when-theme-missing-them-2026-05-24.md`.

---

## (2) Stale items

- **S1 (P2).** "iOS release pipeline cluster" labels `sy094-eos-mobile-headless-ship-recipe.md` as the live validated_v1 headless path. It is now defunct; `ship-ios.py` is the universal driver. Covered by GAP 2 proposed text (which restates the recipe as historical).
- **S2 (P2).** "System Access - MCP Tools" opens with "8 MCP servers" and the per-server tool inventory (google-workspace, github, crm, supabase, stripe, bookkeeping, scheduler, neo4j, vps, business-tools). This describes the pre-migration monolith. The connectors are now domain-scoped (ecodia-core / ecodia-scheduler / ecodia-full). The tool inventory is still broadly accurate per-capability, but the framing is stale. GAP 1 adds the corrected model; a deeper rewrite of the section header framing is a follow-on (flagged, not mandated this pass).
- **S3 (P3).** `patterns/INDEX.md` in this clone was last regenerated 2026-05-20, but 6+ patterns have been authored since. This is likely downstream of the VPS scheduler-poller being dark since 2026-05-19 (49 cron tasks frozen, already tracked on status_board row b4a1e9a5). Not a CLAUDE.md edit; surfaced so the conductor connects INDEX staleness to the dark poller rather than treating it as a fresh issue.

---

## (3) Missing cross-references (patterns authored last 24h not linked from CLAUDE.md)

On this branch (present on disk, uncited in CLAUDE.md):
- `ship-ios-py-must-self-bootstrap-path-and-keychain-over-ssh.md` -> GAP 2.
- `altool-upload-does-not-attach-to-testflight-beta-group-2026-05-24.md` -> GAP 2.
- `chambers-ios-headless-ship-recipe.md` -> GAP 2.
- `tailwind-v4-shade-classes-resolve-transparent-when-theme-missing-them-2026-05-24.md` -> GAP 3.

Also uncited and pre-existing on disk:
- `domain-scoped-mcp-connectors-not-monolith-2026-05-15.md` (authored 15 May, never linked from CLAUDE.md) -> GAP 1.

---

## (4) Structural issues

- **ST1 (P2) - substrate divergence between Routine-authored patterns and git.** Neo4j Episodes from 2026-05-24 claim four patterns were authored today, but all four are ABSENT from this git clone and from origin/main:
  - `mcp-connector-token-expiry-is-per-connector-route-to-sibling-substrate.md` (self-evolution 17:10, also says it edited INDEX.md + a cross-ref)
  - `stop-rationalising-when-symptom-persists-re-probe-reality.md` (session-corpus mining Decision)
  - `research-depth-before-narration-three-probes-minimum.md` (session-corpus mining Decision)
  - `laptop-agent-helper-not-inline-token-load.md` (session-corpus mining Decision, full triad: pattern + scripts/agent helper + PreToolUse hook)

  These were written to the VPS canonical filesystem (`~/ecodiaos/backend/patterns/`) by cron Routines on Corazon and have not reached this remote. The local conductor (which holds the VPS filesystem) must verify each exists on disk there, and commit + push so the git-tracked corpus stops drifting from the live filesystem. This is a distributed-state seam (filesystem vs git) without a consistency protocol. If GAP 1's proposed CLAUDE.md text is applied, the conductor should confirm `mcp-connector-token-expiry-...md` is actually on disk before the cross-ref resolves.

- **ST2 (P3) - INDEX.md regen depends on a dark poller.** See S3. Structural because the regen cron cannot self-heal while the poller is down; INDEX staleness will compound until the poller is restored.

---

## (5) Prioritised P1/P2/P3 to-do list (for the local conductor)

P1:
1. Apply GAP 1 verbatim to `backend/CLAUDE.md` (domain-scoped connectors + token-expiry routing + bearer scope limits). Highest leverage: kills 5x-per-day re-derivation and escalation noise. Before adding the cross-ref, confirm `patterns/mcp-connector-token-expiry-is-per-connector-route-to-sibling-substrate.md` is on disk (ST1); commit it if the Routine wrote it only to the VPS FS.

P2:
2. Apply GAP 2 verbatim (ship-ios.py universal driver + altool-attach gotcha; restate sy094-eos-mobile recipe as historical). Resolves S1 + S2 stale framing for iOS.
3. Resolve ST1: verify the four Routine-authored patterns on the VPS filesystem, commit + push the missing ones so git matches the live corpus. Then run / confirm the INDEX regen.
4. Follow-on (flagged, optional this pass): reframe the "System Access - MCP Tools" section header to lead with the domain-scoped model rather than "8 MCP servers".

P3:
5. Apply GAP 3 (Tailwind v4 shade-class cross-ref line).
6. Add the four on-branch pattern cross-refs (Section 3) wherever GAP 2 / GAP 3 text lands.
7. Note S3 / ST2: connect INDEX.md staleness to the dark VPS scheduler-poller (status_board b4a1e9a5); do not treat as a new issue.
8. Surface the business `~/CLAUDE.md` audit separately (not in this clone; the local conductor has it).

No new directives were missed: the 24h mine returned a clear dominant directive (GAP 1) plus the iOS-ship learnings (GAP 2). This is not a clean-audit day; there is real P1 edit work pending.
