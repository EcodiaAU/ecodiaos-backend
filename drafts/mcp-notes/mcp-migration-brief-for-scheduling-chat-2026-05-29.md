# Brief: MCP monolith -> narrow-connector migration (for the Scheduling Finale Setup chat)

From: the dead-substrate-audit chat (session 1f0a2607). To: the Scheduling Finale Setup chat (session 8d5db046) that owns dispatch/coord/scheduler + started the 9-namespace scheduling-MCP audit.
Date: 2026-05-29. Authority: Tate, this session.

## The decision

Deprecate the MCP monoliths, migrate to the narrow domain-scoped connectors.

- **ecodia-full (157 tools, 62 scopes)**: deprecate. Every tool is duplicated in a narrow connector. Loading all 157 in every chat burns context 24/7. Replace with the specific narrow connectors a given client needs.
- **cowork (gen-1, 22 tools)**: deprecate AFTER the scheduler is repointed (see constraint below).
- **The 10 narrow connectors are the target.** They are already authed correctly (scoped bearers in kv_store `creds.ecodia_<x>_mcp_bearer`). The design was right; the clients never moved over.
- **The local Claude Code seat's `.mcp.json` is the canonical surface for the conductor.** "Your MCP usage is based on your .mcp.json so that's what we need to be using" (Tate). claude.ai account connectors are almost 100% irrelevant now (they were for Routines).
- **Routines are being deprecated** (scheduling moved local). So the claude.ai-account narrow connectors that served Routines can go too. The narrow connectors live on as `.mcp.json` entries for the local seat.

## Why this lands with you (8d5db046)

You own the scheduler + dispatch/coord substrate and you started the scheduling-MCP-namespace map. The one hard constraint in this migration is yours: **the scheduler routes through the cowork gateway** (`scheduler.delayed`/`scheduler.cron`, 12 calls in the last 7d, verified live). cowork cannot be sunset until the scheduler is repointed to `ecodia-scheduler` and a live round-trip is verified. Do that repoint before any cowork teardown.

## Current state (full map already done)

See `drafts/mcp-surface-consolidation-plan-2026-05-29.md` for the complete surface map + auth audit. Headlines:
- Three generations live at once: cowork (Routines + scheduler), ecodia-full (monolith), 10 narrow connectors.
- Config layers: project `.mcp.json` (coord + ecodia-full + visual-test), user-global `~/.claude.json`, claude.ai account connectors.
- **Security item 1**: the ecodia-full 62-scope bearer is in plaintext in the git-tracked `.mcp.json` (and in git history). Rotate it, move it out of the tracked file, stage so the live seat is not cut off mid-rotation.

## The migration, sequenced

1. **Rotate the plaintext ecodia-full + coord bearers** (security, first). Audit consumers, move out of git-tracked `.mcp.json`, rotate server-side, verify, invalidate old.
2. **Kill ecodia-factory connector** (Tate: 100% deprecated). Remove from `connectorManifests.js`, unmount in `app.js`, drop `creds.ecodia_factory_mcp_bearer`.
3. **Google access**: verify a service account with domain-wide delegation exists covering docs + drive + calendar + gmail. Tate believes one was made. If it exists, route ecodia-comms through it (single most-capable auth). If not, create it simply and capably. Drop the duplicate claude.ai native Gmail/Calendar/Drive connectors once ecodia-comms covers it.
4. **Repoint the local `.mcp.json`** from ecodia-full to the specific narrow connectors the conductor needs (core, scheduler, comms, supabase, code, graph, shell as needed). Verify tool coverage before removing ecodia-full. This is the context-saving win.
5. **Repoint the scheduler off cowork to ecodia-scheduler**, verify a live `scheduler.delayed` round-trip, THEN sunset cowork + ecodia-full. Do this last, staged, with verification.

## Docs + hooks to change (future-proofing - do these IN the same migration, not after)

- **CLAUDE.md (user-global + backend)**: the "MCP endpoints" sections name cowork + ecodia-full as canonical. Rewrite to the narrow-connector model. Backend CLAUDE.md "System Access - MCP Tools" + the cowork-V2 sections.
- **Auto-memory**: update `reference_ecodia_full_mcp.md`, `reference_domain_scoped_mcp_connectors_2026-05-15.md` (the "alias until 2026-06-14" line is now the actual migration), `reference_local_first_architecture_2026-05-17.md` (I added a 2026-05-29 correction; extend it).
- **Hooks**: grep `~/.claude/hooks/ecodia/` + `~/ecodiaos/scripts/hooks/` for any reference to `mcp/cowork`, `ecodia-full`, or the bearer keys. The CDP-reflex + dispatch-reflex hooks reference MCP routing.
- **connectorManifests.js**: source of truth for the narrow set. Remove factory; confirm the 9 survivors cover every tool the conductor + any surviving automation needs.
- **Routine substrate** (if Routines die): `backend/routines/*` prompt bodies, `REGISTRY.md`, `populateRegistry.js`, `accountRouter.js`, the webhook fire-shims. Coordinate with the dead-substrate nuke (branch `chore/nuke-dead-conductor-substrate-2026-05-29`) so the two cleanups do not collide.
- **The 2026-06-14 sunset date** in the docs becomes the real cutover; update it or remove it.

## Artifacts from the audit chat (1f0a2607)

- Dead-substrate nuke: branch `chore/nuke-dead-conductor-substrate-2026-05-29` (4 files deleted, pushed, not merged). Audit at `drafts/conductor-substrate-nuke-audit-2026-05-29.md`. ecodia-factory deprecation overlaps the factory cluster documented there.
- MCP surface map + auth audit: `drafts/mcp-surface-consolidation-plan-2026-05-29.md`.
- Reachability probe: `drafts/reachability-probe-2026-05-29.js`.

## Google DWD service account - PROVISIONED 2026-05-29

Tate created a dedicated, role-less SA (least-privilege, no GCP IAM roles).
- key JSON: `D:/PRIVATE/ecodia-creds/google-workspace-sa.json` (Corazon-local, laptop-agent-blocked). Move to kv_store + VPS during wiring (step 3); it needs to be VPS-readable for ecodia-comms.
- project: `ecodia-code`
- client_email: `ecodiaos-workspace@ecodia-code.iam.gserviceaccount.com`
- client_id (authorize THIS in Workspace admin console for DWD): `109787078907811760931`

Both gates confirmed GREEN 2026-05-29:
1. DWD authorized in Workspace admin console: client_id `109787078907811760931` live on `https://mail.google.com/` + calendar + 4 more (6 scopes total). (Note: there is no separate DWD enable-toggle on the SA in GCP anymore; the admin.google authorization is the whole step.)
2. Impersonation subject: **code@ecodia.au** (always). Set this as the ecodia-comms DWD subject.

Wiring (step 3): move the key off Corazon-local into kv_store (e.g. `creds.google_workspace_sa`) so the VPS ecodia-comms connector can read it, set subject=code@ecodia.au, smoke-test one gmail + one calendar + one drive call. Leave the pre-existing `ecodiaos-vps` SA in ecodia-code alone (separate purpose).

Note: the OLD VPS `.env GOOGLE_SERVICE_ACCOUNT_JSON` (was `ecodia-hub@ecodia-hub`) has already been swapped in-place to the new `ecodiaos-workspace` SA (backup `.env.bak-2026-05-29`); it takes effect on the next ecodia-api restart. So the running gmailService still holds `ecodia-hub` in memory until that restart. Order: restart ecodia-api -> verify gmail on the new SA -> only THEN is it safe to delete `ecodia-hub` in GCP.

---

## Phase 2 (AFTER connector consolidation): downgrade the VPS, move the gateway local

Decision context (Tate, 2026-05-29): "the VPS can't be deprecated 100%, but we could downgrade it and save a couple hundred a year." This is the honest end-state for the local-first direction. Do it AFTER Phase 1 (connector consolidation) lands - narrow connectors are far easier to relocate than the ecodia-full monolith, so the consolidation is a hard prerequisite.

The verdict: **downgrade, do not delete. Do it for the architecture, not the ~$200/yr** (the saving is just the gap between the current box and a ~$5/mo one; the real prize is local-first MCP with the VPS off the hot path of every tool call).

What moves LOCAL (to Corazon, where the laptop-agent already runs on :7456):
- The whole MCP gateway (`app.js` `/api/mcp/*` mounts + the narrow connectors). It only makes OUTBOUND calls (Supabase cloud, Neo4j Aura cloud, Stripe/Vercel/GitHub/Google APIs), so it runs fine on Corazon. The local Claude Code conductor then hits it at **localhost - no tunnel, no VPS, no Anthropic-cloud round-trip** (same as `coord`/`visual-test` today). Repoint `.mcp.json` to the localhost gateway.

What MUST stay on an always-on public host (the downgraded VPS):
- Webhook ingress (Stripe, Vercel, Apple ASN, GitHub, Gmail push, Twilio) and the voice-call WSS. These are INBOUND from third parties to a stable public URL on a box that never sleeps. A travelling/sleeping laptop cannot receive them. End-state VPS = a thin always-on webhook + voice relay, cheapest tier.

On the new Anthropic MCP-tunnels feature (launched 19 May 2026, research-preview, Claude Console org-level, Managed-Agents-framed): **mostly a red herring for us.** The local conductor reaches a localhost MCP server directly with no tunnel. A tunnel is only needed for claude.ai cloud clients (Routines/Desktop/mobile) to reach a local server - and those are being deprecated. It may also not be lit on Max accounts. So do NOT block the relocation on the tunnel; the localhost path is simpler.

The caveat that bounds this: the VPS is always-on, Corazon is sometimes-on. Anything that must run while Tate travels (the Africa Oct-Dec window) still needs the always-on host. Moving the gateway local is clean for INTERACTIVE work; any autonomous scheduled work that should fire while Corazon is asleep/away still needs to live on (or be reachable from) the always-on VPS. Decide per-workload which side of that line it sits on before relocating.

Sequence: (1) Phase 1 connector consolidation lands and is verified. (2) Stand up the gateway on Corazon (laptop-agent host), point `.mcp.json` at localhost, verify the full tool surface + a live scheduler round-trip. (3) Strip the VPS `ecodia-api` down to webhook ingress + voice relay only (remove the MCP mounts + conductor services). (4) Downgrade the VPS instance tier. (5) Verify webhooks + voice still land. Cross-ref the dead-substrate audit (`conductor-substrate-nuke-audit-2026-05-29.md`) for what `ecodia-api` boots that can be stripped.
