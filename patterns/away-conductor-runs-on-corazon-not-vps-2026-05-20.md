---
triggers: away-conductor, one-brain, app-routes-to-conductor, vps-opus-diverges, inject-prompt-into-ide-chat, focus-stealing-paste, headless-conductor-on-corazon, same-brain-over-http, second-brain-divergence, away-channel-routing, tate-away-channel, conductor-as-http-service, deploy-only-vps, single-code-writer, never-two-writers-lock, conductor-heartbeat-defer, ws-version-v7-gotcha
---

# The away-brain runs on Corazon (full context), reached by HTTP - not a second VPS Opus, not a keystroke into the IDE chat

When Tate is away from the keyboard and reaches EcodiaOS through an away-channel (the iOS app, SMS, Telegram), the work must be done by the SAME brain that answers at the keyboard: full CLAUDE.md doctrine, the live local repo, MCP, memory. Two wrong ways this tends to get built, both of which Tate flagged 2026-05-20:

1. **A second Opus on the VPS** (the old `_executeViaClaudeCli` path running in `~/ecodiaos`). It lacks the conductor's loaded context + docs, and anything it edits diverges from local/main. "Sync two brains" is the wrong frame. Stop having two.
2. **Injecting the prompt into the live IDE chat** (clipboard + focus the right tab + a PID-targeted Ctrl+V/Enter). Brittle and focus-stealing: it cannot reliably tell the live conductor tab from a worker tab or from what Tate is mid-typing. Do not build on "type into a GUI text box over the network."

## The fix

The away-brain is a headless process ON CORAZON, reached by a plain HTTP POST over Tailscale. "Context" is just files on Corazon (CLAUDE.md, patterns, the repo, memory); a headless `claude` on the same machine reading the same files IS the same brain. Verified 2026-05-20: `claude --print` on Corazon with cwd in the repo loads full doctrine and auths headlessly off the Max login.

- Service: `scripts/away-conductor-server.js` (PM2 `away-conductor`, Corazon :7460). POST `/message` -> spawns the local `claude --print` (prompt via STDIN, not a CLI arg - a multiline arg through shell:true on Windows gets mangled) -> parses `<REPLY>` -> returns it.
- VPS client: `src/services/awayConductorClient.js`. The VPS prefers the away-conductor and FALLS BACK to the VPS Opus if Corazon is unreachable, so Tate is never silent. Native wiring: `headlessConductor._executeViaClaudeCli` native-only flag-gated branch (`AWAY_CONDUCTOR_URL`).
- One source of truth: the away-brain edits the LOCAL repo and pushes to origin; the VPS is deploy-only and pulls. ONE writer -> divergence is structurally impossible, not synced after the fact.

## Mandatory guards (or it bites)

- **Durable supervision**: PM2 owns it (survives crash + session-end) + a logon resurrect script for reboots. A session-tied process silently reverts to the VPS Opus the moment the session ends.
- **Never-two-writers lock**: serialize the away-conductor's own turns AND defer to the interactive IDE conductor when it is in a turn (read the conductor heartbeat `coordination/conductors/current.json` `in_turn` + `in_turn_set_at`, stale>5min = idle). Tate does not text the app while at the keyboard, so it is an edge guard, but it guarantees the away-brain is never the second concurrent writer. Proven: it waited 87s for an active IDE turn before touching the repo.
- **Continuity**: pass the recent thread mirror into the prompt - a fresh `claude` per turn has the repo but not the back-and-forth. Proven by answering a context-only question.
- **One reply channel**: the `<REPLY>` block is the only reply; forbid the away-brain from also sending via an MCP tool (double-text).
- **Idempotency**: dedupe retried POSTs so a resend does not spawn a second acting claude.

## ws version gotcha (cost real time 2026-05-20)

The VPS `ws` is v7: no `WebSocketServer` named export (use `new WebSocket.Server(...)`), and the `message` event is `(data)` with no `isBinary` arg (text arrives as String, binary as Buffer; detect by type, or try-JSON-then-treat-as-binary). Code assuming the v8 shape silently drops binary frames.

## When this fires

- Designing any away-channel (app/SMS/Telegram/watch/voice) handler. The channel is a thin adapter; the brain is the one Corazon conductor.
- Someone proposes a VPS-side agent that edits the repo, or a keystroke/IDE-paste bridge to reach the conductor. Both are the anti-patterns above.
- A reply needs the conductor's full context/docs that the VPS does not have.

Origin: Tate verbatim 2026-05-20 ("the vps triager should ALWAYS talk to you... the vps opus doesnt have everything you have"; "to send you a prompt from the vps to you is unbelievably hard... focus stealing and brittle"). Built + proven same day. Cross-refs: Neo4j Decision 1111, episodes 2346/2401/2410, [[agent-sdk-unlocks-all-models-on-oauth-2026-05-20]], [[native-inbound-must-serialize-per-thread-2026-05-20]], [[cli-subprocess-channels-need-parent-process-reply-forwarder-2026-05-20]], [[one-conductor-many-channels-2026-05-19]].
