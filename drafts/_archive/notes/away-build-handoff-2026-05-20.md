# Away-build handoff (2026-05-20) - what shipped while you climbed

You said build everything and don't stop. Here is the full picture for when you land. Everything below is committed + pushed. The two long-running services are PM2-supervised so they survive my session ending.

## Live + proven (you can rely on these now)

**One-brain architecture - native app talks to the full-context conductor, not a context-poor VPS Opus.**
- App message -> VPS (transport) -> banter gets an instant ack; real work routes over Tailscale to the Corazon away-conductor (`scripts/away-conductor-server.js`, PM2 `away-conductor` on Corazon :7460). It runs the local claude with your full CLAUDE.md + the live local repo, so it is the same brain, reached by HTTP instead of the brittle keystroke-into-the-IDE-chat.
- Falls back to the VPS Opus if Corazon is unreachable, so you are never left silent.
- Durable: PM2 owns it (survives crash + my session ending) + a logon Startup script resurrects it after reboot.
- Never-two-writers lock: it serializes its own turns and defers to your IDE conductor when you are active (proven: it waited 87s for me to go idle before touching the repo).
- Hardened: conversational continuity (it gets the recent thread, proven by answering "4729" from context), idempotency, single-reply guard, per-turn logging, edge cases.

**Native chat hardening (earlier today, also live):** per-thread serialization (no more doubled replies), banter fast-path (0.3s vs 16s), Sonnet triage, instant escalation ack, no "tell my conductor" phrasing, no bare-emoji acks.

**Voice call (#3) backend - PROVEN end to end.** `scripts/voice-call-server.js` (PM2 `voice-call` on the VPS :7461, `/call` WS) + `src/services/voiceCallService.js`. The roundtrip test passes: synthetic mic audio -> Deepgram STT -> Haiku brain (~1s) -> Aura-2 TTS -> audio back over the WS, with barge-in. Voice is Aura-2 (already wired, answers the Aura-vs-ElevenLabs question; ElevenLabs is an optional later upgrade). Run it yourself: `node scripts/voice-roundtrip-test.js "your phrase"`.

## Drafted, needs you / a device (not in any compiled build, so nothing is broken)

**Voice call iOS client** - `ecodia-native/drafts/voice-client/VoiceCallManager.swift`. WS + AVAudioEngine capture/playback. Written headless so it needs an Xcode compile pass (mainly Swift-6 concurrency on the audio thread) + device audio tuning. README has the wire-in steps. P1 is wrapping it in CallKit so it shows as a native call in CarPlay.

**Voice production exposure** - the call WS is on :7461 internal. To reach it from the app you need it behind `wss://` (reverse-proxy `:7461`, or a Tailscale host for first testing). Noted on the status board.

**Comms #1b (notification service extension)** - `ecodia-native/drafts/notification-extension/`. Upgrades reply pushes to communication notifications so Siri says "Ecodia" and the hands-free reply is rock solid. Optional polish on build 11. Needs the Communication Notifications capability + a profile (same drill as Share/Widget). README has exact steps. Backend already sends the right payload.

## Deferred (on purpose)

**iOS build 11 -> TestFlight.** The notification-reply code (CarPlay #1 core) is committed + pushed at build 11. I did NOT run the headless iOS upload autonomously: it has attended-only failure points (keychain unlock, signing, ASC), and you cannot test it until you are off the mountain. It is a mechanical recipe-run whenever - say the word, or I will do it the moment you are back and can catch a signing snag.

**SMS/Telegram reroute + retire the VPS Opus.** Native is on the new one-brain path; SMS/TG still hit the VPS conductor. Same wiring applies, but it is the sister chat's routing surface, so it needs coordination. Logged as a P3 on the status board.

## Production state (verified)

VPS: capture gate OFF (real delivery), `AWAY_CONDUCTOR_URL` set, `TRIAGE_VIA_AGENT_SDK` on. PM2: `away-conductor` (Corazon), `voice-call` + `ecodia-api` (VPS) all online. Doctrine + decisions written to Neo4j (1111, 2346, 2401, 2410) + three pattern files.

## First things to try when you land

1. Text the app `yo` (instant), then `whats our stripe balance` (escalates to the Corazon brain, replies with the real answer).
2. `node scripts/voice-roundtrip-test.js "hey ecodia hows it going"` to hear the voice loop work.
3. Decide on build 11 ship + whether the NSE polish is worth the capability/profile work.
