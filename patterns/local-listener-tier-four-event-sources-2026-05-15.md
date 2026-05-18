---
triggers: local-listener-tier, listener-routing, listener-event-source, four-event-sources, file-watcher-vs-hook, hook-vs-routine, routine-vs-mcp-write, listener-decision-tree, where-does-this-listener-live, new-listener, add-a-listener, reflexive-work, haiku-listener-where, watch-for-x-do-y, chokidar-on-corazon, pretooluse-vs-posttooluse, db-listen-vs-watcher, listener-tier-codification, phase-2-lane-03, listener-doctrine, listener-substrate-routing
---

# Local listener tier - the four event sources and which one owns a given listener

## The rule

When a new "listen for X, do Y" requirement appears, the routing tree decides which of the four event sources owns it. Pick the first match top-down:

1. Is the trigger a file change on Corazon (or Mac mini in the macOS era)? -> **file watcher (2.1)** under `backend/listener-tier/listeners/`.
2. Is the trigger a tool call shape inside an active Claude Code turn? -> **hook (2.2)** under `~/.claude/hooks/ecodia/`.
3. Is the trigger a substrate write (status_board / kv_store / os_forks / cc_sessions / staged_transactions / email_events)? -> **MCP write event (2.4)** consumed by an existing VPS listener under `~/ecodiaos/src/services/listeners/`, or via the Lane-06 SSE relay if a local handler is required.
4. Is the trigger time-shaped or an external webhook? -> **Routine (2.3)** under `backend/routines/<name>.md`.

If the requirement is "an external event we cannot detect locally and have no webhook for", build a webhook /fire shim (Lane D) that turns it into a Routine /fire POST. That collapses to source 2.3.

## Why

The original 2026-04-23 Listener spec built around a custom WS bus on the VPS. The bus is brittle and the VPS-only substrate is being retired. Locally we have four cheap reliable sources that collectively cover everything the spec wanted, but only if we have a clear rule for which source owns which listener. Without the rule, four similar listener fires get authored against four different substrates and nobody can find them when something breaks.

## How to apply

Before authoring a new listener:

1. Run the four-source tree above. The first match owns it.
2. If two sources both fit (e.g. a substrate write that also touches the filesystem), the source closer to the truth wins. The filesystem change is canonical; the substrate row is a derived projection.
3. If the listener needs > 200ms of work, do not block the conductor: publish a sentinel (file write or kv_store write) and let a second listener pick it up on (2.1) or (2.4).
4. Author into `backend/listener-tier/listeners/<name>.js` for 2.1, `~/.claude/hooks/ecodia/<name>.sh` for 2.2, `backend/routines/<name>.md` for 2.3, or extend an existing VPS listener for 2.4. Always update `backend/listener-tier/registry.json` so `/listener-health` sees it.
5. Heartbeat to `kv_store.health.eos_listener_tier.<name>` on every successful fire. A silent listener is impossible to debug.
6. Declare `ownsWriteSurface`. Two listeners cannot write to the same surface.

## Anti-patterns

- Authoring a file watcher when the trigger is a substrate write that does not touch the filesystem. The bug is invisible until production breaks.
- Depending on the VPS WS bus from a local handler. That bus is private to the VPS api process.
- Duplicating a VPS listener locally. forkComplete stays on VPS; the local conductor reads completions via context-stitching or the Lane-06 relay.
- Skipping the heartbeat write.
- Running a watcher without PM2. Manual `node listener.js` does not survive a reboot.
- Letting a hook take longer than 200ms. Hand off via sentinel.

## Where the work lives

- Doctrine: `D:/.code/EcodiaOS/backend/docs/LISTENER_TIER_EVENT_SOURCES_2026-05-15.md`
- Local listeners: `D:/.code/EcodiaOS/backend/listener-tier/listeners/`
- VPS listeners: `~/ecodiaos/src/services/listeners/`
- Hooks: `~/.claude/hooks/ecodia/` (settings.json registers them)
- Routines: `D:/.code/EcodiaOS/backend/routines/` (prompts authored locally, fired on Anthropic cloud)
- Disposition audit: `D:/.code/EcodiaOS/backend/docs/VPS_LISTENERS_DISPOSITION_2026-05-15.md`
- Health: `/listener-health` skill

## Origin

Phase 2 Lane 03, 2026-05-15. Cowork session `phase2-03-listener-tier-2026-05-15`. The original spec is `D:/.code/EcodiaOS/.claude/EcodiaOS_Spec_Listeners.md` (2026-04-23, Tate via Opus); this pattern is the post-migration substrate replacement. The full 4-source taxonomy + routing tree + new listener implementations + disposition audit shipped together in this lane.

## Cross-references

- `listener-pipeline-needs-five-layer-verification.md` - producer / trigger / bridge / listener / side-effect. Applies to local and VPS tiers identically.
- `decision-quality-self-optimization-architecture.md` - the meta-cognitive layer that the observer trio implements.
- `prefer-hooks-over-written-discipline.md` - hooks (2.2) are mechanical enforcement; written rules are the fallback.
- `triggers-must-be-narrow-not-broad.md` - applies to the `triggers:` frontmatter on pattern files; the routing tree above is the equivalent for listeners.
- `context-surfacing-must-be-reliable-and-selective.md` - the doctrine layer this pattern sits inside.
