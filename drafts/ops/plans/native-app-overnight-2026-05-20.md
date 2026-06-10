# native app - overnight work (2026-05-20)

morning. the native chat was acting like a headless chicken (doubled replies, no real-time feel, weird sequencing). that's fixed. everything below is live on the VPS and stress-tested end-to-end with a capture gate so i didn't blow up your phone at night. delivery is back to normal now.

## what i shipped (5 commits, all on main + deployed)

1. **per-thread serialization** - two messages fired close together no longer spawn two overlapping turns that race each other and double-text you. each turn finishes (reply delivered) before the next starts. `nativeInboundQueue.js`.

2. **banter fast-path** - "yo" / "hey" / "morning" / "thanks" etc skip the model entirely and reply in ~0.3s instead of ~16s. narrow on purpose: only context-free greetings + thanks. "ok"/"yeah"/"perfect" still go to the model because standalone they're usually you approving something that should actually trigger work.

3. **sonnet triage (was haiku)** - this is the big one. figured out why oauth couldn't run sonnet/opus: the raw anthropic sdk is haiku-only on the subscription token (429s everything else), but the **agent sdk runs all models on the same token**. that's why the cli always worked. triage now runs sonnet via the agent sdk. it correctly tells "pin a row" (do it) from "pinned a row earlier" (just chatting) - that was the original misread bug.

4. **immediate ack on escalation** - when something needs real work (opus + tools), you now get an instant "on it" / "checking" so you're not staring at silence for 30-90s, then the actual result lands when it's done.

5. **killed the "tell my conductor" phrasing** + killed bare-emoji replies. you are talking to one ecodia, it doesn't hand off to a "conductor". and it acks with "yep"/"noted" not a thumbs-up now.

## proof (live tests, your phone stayed silent via a capture gate)

- "yo" -> "yo" in 0.3s
- "thanks" -> "anytime" in 0.3s
- "ok" -> "yep" (no emoji)
- "pinned a row called launch prep earlier" -> "noted", did NOT escalate (the old bug)
- 3 rapid messages -> serialized, in order, no doubling, no contradictions
- "whats our stripe balance" -> "checking" then: *"Stripe available balance: $0.00 AUD. But heads up - the only key wired to my infra is test mode, so that's a sandbox balance, not real money. No live Stripe key is connected. If you've got a live account, send me the live key and I'll pull the real number."*

zero "conductor" phrasing, zero emojis, zero em-dashes across every reply.

## test it yourself, in this order

1. `yo` -> instant echo
2. `thanks` -> instant ack
3. `you there?` -> quick reply (~15s, sonnet)
4. fire 3 fast: `whats on today` then `actually` then `nvm just give me the board` -> should be coherent, no doubling
5. `whats our stripe balance` -> "checking" then the real answer ~1-2 min later
6. eyeball: no "tell my conductor", no emoji acks

## your questions answered

**siri vs voice widget - keep both.** they're not redundant. the voice widget needs your hands + eyes (open app, hold to talk). siri ("hey siri, tell ecodia ...") is fully hands-free / eyes-free. different moments. it's 37 lines, no reason to cut it.

**carplay - it already works, via siri.** "hey siri, tell ecodia the deploy looks good" works in carplay today, no special entitlement needed. a *custom carplay screen* would need apple's restricted messaging entitlement (approval process, not worth it for a personal app). the siri path covers the actual need (talk to ecodia while driving). one gap: right now siri just says "told ecodia" and doesn't read ecodia's reply back out loud. making it speak the reply in carplay is a real but separate build (needs the intent to wait for the reply) - flag it if you want it and i'll do it.

**twilio sms - you're right, it's already fallback-only.** outbound replies go APNs-first and only fall back to SMS if APNs fails (no device token / outage). so it's already redundant as a primary path. i'd keep outbound SMS as the cheap insurance fallback, and we can retire *inbound* SMS (you texting the twilio number) whenever you're confident in the app. no rush, no cost to leaving it.

## known tradeoffs (not bugs)

- non-banter replies take ~15s (sonnet thinking). that's the cost of it reading intent correctly. banter is instant. if 15s on simple stuff bugs you, i can widen the fast-path or add a haiku middle-tier.
- heavy work (escalation to opus) takes 30-90s for the result, but you get the instant ack now so it doesn't feel dead.
- in-turn mutex across the *router* layer is the one thing i didn't touch (it's the shared sms/telegram surface, not mine to change solo). the per-thread serialization above covers the native channel fully; if you want it everywhere i'll coordinate that change.

widgets are already pure black/white, no greens (checked every file + the asset catalog). only colour left in the app is the red recording dot + red error text, both in the main app not the widgets - say the word if you want those monochrome too.
