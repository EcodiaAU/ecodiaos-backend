---
triggers: voice-call, call-ecodia, live-voice, talk-to-interrupt, barge-in, deepgram-stt, aura-tts, openai-tts, voice-call-server, voiceCallService, AVAudioEngine, voice-processing-io, AEC, echo-cancellation, half-duplex, full-duplex, utterance-end, endpointing, voice-latency, carplay-voice, native-voice, wss-voice
---

# Live "call Ecodia" voice architecture (no Twilio, no PSTN)

The native app (au.ecodia.native, "EcodiaOS") has a real hands-free voice call to Ecodia over a WebSocket. No Twilio number, no per-minute cost. Verified working end to end 2026-05-21: talk-to-interrupt, smart turn-taking, real-brain handoff, OpenAI voice.

## Topology

- **Client**: `EcodiaApp/VoiceCall/VoiceCallManager.swift` + `CallView.swift` (build 17+). AVAudioEngine captures mic (linear16/16k), streams binary frames over `wss://api.admin.ecodia.au/api/voice/call`, plays back TTS (Float32 24k) + renders JSON events.
- **Edge**: nginx proxies `/api/voice/call` -> `127.0.0.1:7461` (WS upgrade passthrough, same path so no URI rewrite).
- **Server**: `scripts/voice-call-server.js` (PM2 `voice-call` on the VPS :7461) mounts `src/services/voiceCallService.js` per connection.
- **Pipeline**: Deepgram streaming STT -> Haiku brain (`anthropicMessagesClient.createMessage`, OAuth, sub-2s) with injected live context -> OpenAI `gpt-4o-mini-tts` -> PCM frames back. Real work hands off to the Corazon away-conductor.

## Hard-won gotchas (each cost a build/iteration)

1. **`.allowBluetoothA2DP` breaks the voice-processing IO unit (AEC).** A2DP is playback-only and conflicts with the duplex VPIO. With it set, `setVoiceProcessingEnabled(true)` gives `vp=off` / silent capture. Session must be `.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker]` only. This was the fix that made talk-to-interrupt work.
2. **AVAudioEngine graph must be Float32 when VPIO is on.** Forcing an Int16 player->mixer connection (which worked WITHOUT VPIO) silently kills capture WITH VPIO. Convert TTS Int16 -> Float32 buffers; connect the player at Float32.
3. **VPIO cold-start is flaky -> retry once before half-duplex.** First call after launch sometimes enables VPIO but delivers zero mic frames. A 2.5s capture-health check (micFramesReceived==0) retries full-duplex once (re-enable VPIO + restart engine) - mirrors the manual "call again and it works" - then falls back to half-duplex. On-screen `vp=on/off dx=full/half retry/fb rx=/tx=` diagnostics make this debuggable off-device.
4. **Half-duplex is the safe fallback, with tap-to-interrupt.** If AEC will not engage, the mic is muted while speaking (no echo loop) and a screen tap sends `{type:'interrupt'}` so interruption still works. Never leave the call with no way to interrupt.
5. **Turn-taking: use Deepgram UtteranceEnd (audio VAD), NOT an SDK-event-cadence debounce.** A `setTimeout` reset on every `onTranscript` fires mid-sentence because Deepgram does not emit events at a steady beat during speech. Accumulate `is_final` segments; end the turn on `UtteranceEnd` (utterance_end_ms, real silence). Long safety timer only as a backstop.
6. **Smart endpointing serves "done" AND "thinking".** One silence threshold cannot. Fast path: `speech_final` (endpointing ~0.5s) + a finished-sounding sentence (terminal punctuation, not a trailing continuation word) commits immediately. Trailing off on "and/so/um/the..." waits for UtteranceEnd plus a ~1.6s extension, cancelled the instant he resumes.
7. **Echo guard behind AEC.** Drop a transcript that matches what we are currently/just-said (substring or >=0.6 token overlap, within a grace window) so residual bleed never triggers a false turn or false barge-in.
8. **OpenAI `gpt-4o-mini-tts` is the voice.** Far more natural than Aura, steerable via `instructions`, streams raw `response_format: 'pcm'` at 24kHz mono 16-bit = the client wire format (no resampling). Benchmarked FASTER than `tts-1` (~0.9s TTFB) and nicer. Aura is the fallback. Sanitize em/en dashes + markdown out of spoken text first.
9. **The wss is gated on the native bearer.** `VOICE_CALL_TOKEN` = `kv_store.creds.tate_native_app_bearer` (set on the voice-call PM2 env, `pm2 save`d). The app sends the same Keychain bearer on the handshake. See [[tate-native-app-bearer]] cred doc.

## Real-brain handoff (talk while it works)

The fast Haiku turn emits `HANDOFF: <task>` when Tate asks for real work or a fact it lacks. The server speaks the brief ack, dispatches the task to the away-conductor (`awayConductorClient.routeToAwayConductor`, Corazon :7460, full tools + memory + doctrine) WITHOUT blocking the call, then speaks the result back (call still up) or texts it via `notifyTate` (call ended). `pump()` drains typed queue items (`{type:'user'|'say'}`) so results splice in with barge-in intact.

## Latency budget (2026-05-21)

Endpoint ~0.5s (fast path) + Haiku brain ~1.5-2s (with trimmed context) + OpenAI TTS TTFB ~0.9s = ~3s to first audio. Biggest lever left is streaming the brain output sentence-by-sentence into TTS (overlap generation with playback) - not yet done; replies are short so the gain is modest.

## Build/ship

All server-side changes deploy with `git pull` + `pm2 restart voice-call` (no app rebuild - the client just receives more TTS/events). Client changes ship via [[ecodia-native-headless-ship-recipe-2026-05-20]] (xcodegen + SY094). Roundtrip regression test: `node scripts/voice-roundtrip-test.js "<phrase>"` (authenticates with the native bearer).

Origin: 2026-05-20/21 voice-call build arc with Tate live-testing across builds 13-18. Cross-refs: [[ecodia-native-headless-ship-recipe-2026-05-20]], [[ssh-xcodebuild-keychain-unlock-must-be-same-session-2026-05-19]], [[away-conductor-runs-on-corazon-not-vps-2026-05-20]].
