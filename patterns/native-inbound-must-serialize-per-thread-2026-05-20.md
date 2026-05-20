---
triggers: headless-chicken, doubled-replies, contradictory-replies, concurrent-turns, two-messages-race, thread-mirror-race, native-inbound-serialize, per-thread-mutex, inbound-queue, message-burst-doubling, conductor-turn-overlap, rapid-messages-scrambled, reply-ordering-wrong, banter-fastpath, escalation-ack
---

# Native inbound must serialize per thread (one turn finishes before the next starts)

A channel that responds to the inbound HTTP request immediately and processes the conductor turn in the **background** will spawn **concurrent turns** when two messages arrive within one turn's duration (triage is 1-16s). Both turns read the thread mirror BEFORE either has written its reply, so both answer a stale view. Result: doubled replies, contradictory replies, scrambled ordering. Tate's word for it: "acting like a headless chicken" (2026-05-20).

## The rule

Serialize conductor turns **per thread_id**. Turn N+1 waits for turn N to fully settle (reply delivered + mirrored) before it begins. By the time N+1 runs, the mirror reflects N's reply, so the model sees real context and answers coherently instead of racing.

- Key by `thread_id`, not globally. Do NOT serialize across channels - SMS, Telegram, native each have their own cadence; a shared lock head-of-line-blocks one channel behind another.
- A failing turn must NOT poison the chain - the next queued turn still runs.
- The serializer wraps the **route-to-conductor** call, after the immediate 200 and after the (parallel, idempotent) persist/mirror writes.

Implementation: `src/services/nativeInboundQueue.js` (`runSerial(threadId, taskFn)` - per-thread promise chain + drain cleanup + queue-depth observability). Wired in `src/routes/native.js` `/inbound`:
```
.then(() => runSerial(envelope.thread_id, () => routeEnvelopeToConductor({ envelope, source })))
```

## Proof it works (live test, 2026-05-20)

Fired 3 messages within 0.7s: "yo" (fast-path ~0.3s), "you there?" (Sonnet ~16s), "morning" (fast-path ~0.3s). With serialization, "morning" landed at t+18.7s - AFTER the slow "you there?"->"yeah" turn (t+16s), NOT jumping ahead to t+0.3s. The fast message was held in queue behind the in-flight slow turn. Without the mutex, "morning" would have raced ahead and scrambled the order. All 3 replied, in order, coherent, no contradictions.

## Two companion turn-UX disciplines (same surface, same date)

These live alongside serialization in the native triage path (`triageAgentSdk.js`) and are part of "working beautifully":

1. **Banter fast-path before the LLM.** Context-free inputs (bare greetings + thanks) skip the ~16s Sonnet round-trip and reply via APNs in ~1-2s. Deliberately NARROW: greetings + thanks only. Affirmations ("ok", "yeah", "perfect") are EXCLUDED because standalone they are frequently approvals of a pending action that SHOULD escalate - a canned ack there is the exact non-sequitur we are killing. False-negative (banter -> LLM) costs only latency; false-positive (real ask -> canned ack) is a correctness bug. Err toward the LLM. Flag: `TRIAGE_BANTER_FASTPATH` (default on).
2. **Immediate ack on escalation.** When triage escalates to Opus (a ~30-90s run), send the ack the moment escalation is decided (the model's `ack_first`, or default "on it"), so Tate is never in silence while the heavy path runs. Then Opus replies with the outcome. Two clean messages: instant ack + delivered result. Skip the ack if a reply already went out this turn (dedup).

## When this fires

- Designing/​debugging any channel that returns 200 then processes async (native, and any future webhook chat channel).
- "It double-texted me" / "the replies came out of order" / "it contradicted itself."
- Adding a new background-processed inbound path. Wrap the conductor call in the per-thread serializer.

Origin: 2026-05-20, native iOS app. Tate: "doubles up messages on the ui often" + "just fixing the whole sequencing so its not acting like a headless chicken". Cross-refs: [[one-conductor-many-channels-2026-05-19]], [[agent-sdk-unlocks-all-models-on-oauth-2026-05-20]], [[cli-subprocess-channels-need-parent-process-reply-forwarder-2026-05-20]].
