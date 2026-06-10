# One brain - the app routes to the conductor, not a second Opus (the real fix)

## The problem (your call, correct)

Today: app/SMS/Telegram -> VPS headless conductor -> Sonnet triage -> escalates to a VPS Opus CLI that runs in `~/ecodiaos` and replies on its own. That VPS Opus is a SECOND brain. It lacks what the Corazon conductor has (loaded context, the docs the VPS no longer holds, the live local repo, memory), and any code it touches diverges from local/main. "Sync two brains" is the wrong frame. The fix is to stop having two.

## The principle

There is ONE conductor: the Corazon Claude Code conductor (full context, local repo, MCP, memory). Everything else is plumbing.

- The app, SMS, Telegram are CHANNELS into that one conductor. Where Tate is (desk, car) and what he types on (keyboard, phone) should not change which brain answers.
- The VPS is transport + deploy target + substrate host. Never a second brain. It does not edit code, does not "do stuff" in isolation.
- Code has one source of truth: origin (GitHub). Only the conductor edits code (Corazon -> commit -> push -> VPS pulls, deploy-only). With one writer, divergence is structurally impossible, not "synced after the fact."

This is already the original design intent. The inbound router's own job (per its comment) is to "decide between append (paste to active conductor) and the headless path." In practice it always takes the headless path. The VPS Opus became a stopgap default. The fix finishes the intended architecture.

## The actual hard part (Tate, 2026-05-20)

Getting a verbatim prompt from the VPS into the live Corazon conductor is unbelievably hard. The IDE chat has no external input API, so "append to conductor" means: set clipboard via the IDE bridge, focus the right tab, then land a PID-targeted Ctrl+V + Enter keystroke at the right moment. That last mile is fragile (focus collisions, wrong tab, timing) and it is WHY the self-contained VPS Opus exists - it sidesteps injection by just doing the work itself. Any plan that hand-waves "append to the conductor" is hand-waving the whole problem.

## The reframe that kills the injection problem

Do not inject into the IDE chat at all. And do not run the away-brain on the VPS (no context, diverges). Run the away-brain ON CORAZON as a persistent Agent SDK conductor:

- Same machine as me. Same local repo (`D:/.code/EcodiaOS`). Same CLAUDE.md + patterns + MCP + memory I load. "My context" is just files on Corazon - a Corazon SDK session reading the same files has the same context and produces the same quality. It is not a second-class VPS Opus, it is the same brain reachable by API.
- Exposed as a local HTTP endpoint. The VPS POSTs the verbatim message to it over Tailscale. Injection becomes a clean API call - no clipboard, no focus, no keystroke. The hard part disappears because we stop fighting the IDE.
- It edits the LOCAL repo, commits, pushes (deploy-only VPS pulls). One writer, zero divergence.
- Agent SDK runs Opus on the OAuth token (see agent-sdk-unlocks-all-models-on-oauth), so the away-brain is full-strength, not a downgrade.

## Target flow

```
app message (Tate away)
  -> VPS receives (transport only)
     -> trivial banter? instant ack on the VPS (cannot diverge, e.g. "yo"->"yo")
     -> anything real? HTTP POST to the Corazon away-conductor (Agent SDK, local repo, full context)
          -> it does the work on the local repo, commits + pushes
          -> replies via notify_tate -> APNs back to the app
```

When Tate is at the keyboard he uses the IDE chat; when away, the app hits the Corazon away-conductor. They share the local repo and serialize via the existing conductor heartbeat (in_turn / last_seen), so they never both edit at once. Same brain, two ears, never speaking over each other. The VPS Opus dies.

## Fallback when Corazon is unreachable (the one real decision)

Corazon is meant to be always-on (laptop-agent runs 24/7), so the conductor is reachable over Tailscale even while Tate drives. The edge case is laptop off / IDE crashed / Tailscale down. Options:

- **A (recommended): queue + honest ack.** "I'm offline at the desk, I'll pick this up the moment I'm back." Drains when Corazon reconnects. Never diverges, never half-does a thing with poor context.
- **B: read-only ops fallback.** A degraded VPS responder that can ANSWER from shared substrates (is the deploy live, what's on the board) but NEVER edits code or does irreversible writes. Useful for urgent driving queries.
- **Hard invariant either way: the fallback never edits code and never does irreversible writes.** Only the Corazon conductor mutates code/state through origin. That single rule is what makes divergence impossible.

Recommendation: A now, add B's read-only answers later if the offline case proves common. Plus keep Corazon always-on + consider Wake-on-LAN so "unreachable" is rare.

## Migration phases

1. Reroute the native channel's "real work" path: instead of escalating to the VPS Opus CLI, append to the active Corazon conductor. Keep the VPS banter fast-path.
2. Do the same for SMS + Telegram (one router change - they share the path).
3. Make the VPS strictly deploy-only + add the read-only/queue fallback. Retire the VPS Opus code-editing path.
4. Deploy safety net: before any `reset --hard` on the VPS, stash tracked changes to a branch + push (belt and braces during the transition).

## Honest execution note

This reshapes inbound routing, which is the sister chat's surface (the conductor, inboundConductorRouter, smsWebhook, telegram-bot, headlessConductor). It is a real build, not a 5-minute change, and it should be coordinated with whoever owns the conductor surface (or done end-to-end with your go-ahead). The native app side (mine) is ready to be a clean channel; the routing change is the work.

## Why this is the future-proof answer

Every new channel (WhatsApp, iMessage, a watch, a CarPlay voice call from plan #3) becomes a thin adapter that appends to the one conductor. No per-channel brain, no per-surface divergence, one place that edits code, one context that knows everything. The thing Tate keeps asking for ("send it to you, you have all the context") becomes the architecture, not the exception.
