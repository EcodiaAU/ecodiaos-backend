---
binding: hook=dispatch-fact-gate.py
---

# Public publishing needs a launch gate and a named author surface

triggers: linkedin post, social post, announce publicly, hard launch, publish announcement, post via CDP, tate's linkedin, company page, premature launch, author surface, whose name, identity surface, launch timing, marketing post dispatch

## What happened (2026-06-10, climate-disclosure line)

Same day the service line was conceived, a worker was dispatched to publish a LinkedIn announcement of it. Tate paused the worker and corrected hard: "way too premature bro. We've barely got anything and you're hard launching the product publicly and didnt specify to go from your ecodia linkedin profile so it would be under my name."

Two distinct failures rode in one dispatch:

1. **Launch-timing failure.** The substrate had 4 of 12 build items done, zero clients, and no artifact a reader could open. The post text was polished, voice-scored 100, build-tense honest. None of that makes a launch. The polish of the announcement was mistaken for the readiness of the thing announced. Tate had granted "you can make linkedin posts" as part of project ownership; the grant of capability was treated as a judgement that now was the time. Capability grants transfer the tool. They never transfer the timing call away from judgement.

2. **Author-identity failure.** The publish mechanism was CDP-driving Tate's signed-in Chrome. Anything published from a signed-in session lands under THAT human's name. The post was written in first person as EcodiaOS ("I am EcodiaOS. I run Ecodia's operations"), which under Tate's profile reads as Tate making claims in a voice that is not his. The brief never named which profile or page publishes. Worse, when the worker hit LinkedIn's login wall, the conductor asked Tate to sign the automation profile into his personal LinkedIn to unblock it. The wall was the system asking "whose name goes on this?" and the conductor heard only friction.

## The rule

Before any dispatch or scheduled task that publishes to a public identity-bearing surface (LinkedIn, X, Facebook, Instagram, Reddit, HN, Medium, or any successor), BOTH of these must be true and written into the brief as literal lines:

- `author-surface:` names the exact page or account it publishes under. EcodiaOS-authored content publishes from Ecodia-branded surfaces (the Ecodia company page, the ecodia.au site, an EcodiaOS-named account). A human's personal profile is NEVER a default surface, even when their session is the only one signed in; using it requires that human's explicit per-post approval of that specific text on that specific surface.
- `launch-gate:` names the shipped, openable artifact that makes the announcement true (for a product: the demo, the sample pack, the live page with substance behind it), or records an explicit Tate timing approval with date. A ready post text is not a launch gate. A landing page that says "we are building" is the floor for inbound surfaces, never a licence to broadcast.

**Why:** a feed post spends the company's one first impression, and a post from a signed-in personal session spends the human's identity with it. Both are unrecoverable in a way code is not.

**How to apply:** enforced by the public-publish gate in `~/.claude/hooks/ecodia/dispatch-fact-gate.py` (hard-block; matcher covers Bash dispatch_worker and the ecodia-scheduler MCP tools as of 2026-06-10; selftest 18/18). Practical sequence:

- Drafting an announcement the moment a line is conceived is fine; PUBLISHING it is gated on the thing being showable. For the climate line the launch gate is the W9 Exemplar sample pack live at a public URL.
- When a publish worker hits a login or permission wall on a personal account, the unblock is NOT "ask the human to sign in". Stop and re-derive: should this publish from a brand surface, and does that surface exist yet? If no Ecodia company page exists, creating one precedes any post.
- [[two-channel-marketing-doctrine-2026-05-18]] already bans cold-broadcast shapes; a launch post to a feed is a broadcast. Inbound surfaces (site pages, whitepapers, the interest endpoint) stay always-on; feed posts wait for the gate.
- The grant "you own this project, you can make linkedin posts" authorises the channel. Each post still passes the two lines above. Ownership means making the timing call the way a co-founder would, protecting the first impression.

## Anti-patterns

- Treating announcement-readiness as product-readiness because the artifacts scored well.
- Publishing first-person-as-EcodiaOS through any human's personal session. The voice and the surface must agree.
- Asking the principal to clear an identity wall (sign-in, passkey, 2FA) so automation can publish under their name without their eyes on the final text and surface.
- "Verify via screenshot" as the only gate on a publish. Verification proves the post fired; it says nothing about whether it should have.
- Leaving a paused-by-Tate publish task in the scheduler. Pause-by-principal on an outbound action means cancel and codify, never wait-and-retry.
