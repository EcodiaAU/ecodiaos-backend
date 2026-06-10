# CarPlay #3 - "Call Ecodia" live voice (plan)

Goal: a real hands-free voice conversation with Ecodia, in our own voice, in the car (and on the phone) - no Twilio number, no per-minute cost. It shows up in CarPlay as a native call.

## Architecture

```
iPhone (CallKit call UI)
   | mic audio  ^ tts audio
   v            |
realtime transport  (WebRTC, or WebSocket PCM for the PoC)
   |
backend realtime endpoint (/api/native/voice/live)
   -> Deepgram streaming STT  (partial + final transcripts)
   -> fast voice conductor    (Haiku via Agent SDK - sub-second turns, NOT the 16s Sonnet triage)
   -> streaming TTS           (Deepgram Aura or ElevenLabs) -> audio back down the stream
```

- **CallKit** is the magic for the car: a CallKit call appears natively in CarPlay (answer/hang up on the wheel, audio routed through the car, lock-screen controls). No CarPlay entitlement, no Twilio. The audio pipeline is entirely ours.
- **Reuse**: the Deepgram + voice-conductor loop already built for the Twilio number (voiceRelay.js / voiceChunk.js) is the core. We point it at an app socket instead of a Twilio media stream.
- **Whisper vs Deepgram**: live = Deepgram streaming (low latency). Whisper stays the push-to-talk one-shot. Same "talk to Ecodia," right tool per mode.

## Phasing (de-risk the hard part first)

- **P0 - phone-only PoC (no CallKit):** in-app "hold to talk live" / open-mic session. App streams mic over a WebSocket to /api/native/voice/live; backend runs Deepgram -> Haiku conductor -> TTS; app plays the audio. Proves the realtime loop + latency end to end with the least moving parts. ~the bulk of the value, testable at a desk.
- **P1 - CallKit wrapper (the car):** wrap the P0 session in CallKit so it's a real call in CarPlay. Outgoing ("call Ecodia" button / Siri). Background-audio + microphone + audio-session config.
- **P2 - polish:** barge-in (cut Ecodia off mid-sentence - needs echo cancellation + VAD), interruption handling, and optionally VoIP push (PushKit) so *Ecodia* can call *you* ("incoming call from Ecodia" when something urgent lands while you're driving).

## The genuinely hard parts (being straight)

- **Latency budget** ~500ms round-trip to feel natural. Deepgram STT ~100-300ms; the conductor must be fast (Haiku, streaming) and TTS must stream (start speaking before the full reply is generated). The 16s Sonnet triage is far too slow for a call - the call uses the voiceRelay-style fast loop.
- **Echo cancellation + barge-in**: the hardest UX bit. WebRTC gives you AEC for free; raw WebSocket PCM you handle yourself. This is the main argument for WebRTC in production.
- **Audio session / CallKit plumbing**: VoIP background mode, microphone permission (have it), CallKit + (for inbound) PushKit. Standard VoIP-app territory.

## Open decisions (your call)

1. **Transport**: WebSocket PCM for P0 (simplest, ships fast), WebRTC for production quality (AEC, jitter). Rec: start WebSocket, move to WebRTC at P1/P2.
2. **TTS voice**: Deepgram Aura (cheap, low latency, single vendor with the STT) vs ElevenLabs (best-in-class voice, slightly more latency + cost). Rec: Aura default to nail the loop, A/B ElevenLabs once it works. <- the one thing I'd like your pick on.
3. **Can Ecodia initiate** ("incoming call from Ecodia" while driving) or only you start it? Inbound needs PushKit/VoIP push. Rec: P0/P1 outbound-only, add inbound at P2.

## Discipline this rides on (ties to the sync issue)

The backend realtime endpoint + the fast voice conductor run on the VPS, edited from Corazon, deployed via origin. Same rule as everything: origin is the single source of truth, the VPS is deploy-only, nothing edits a working copy another process also edits. (See the sync note - the headless-Opus-edits-the-VPS-copy risk is the same class of bug.)

## Effort

P0 is a few focused sessions (realtime audio is fiddly but bounded, and the backend half exists). P1/P2 each another chunk. The prize is real: a genuine voice conversation with Ecodia on the drive, in our voice.
