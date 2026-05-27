---
triggers: sms-spam, sms-frequency, sms-running-commentary, sms-after-fix, sms-twilio-waste, multi-sms, sms-noise, p0-fix-followup, post-resolution-sms, sms-only-one-update, follow-up-sms, sms-acknowledgement-loop, no-meta-acknowledge, sms-running-narration, sms-flooding, sms-double-tap, sms-rls-spam, sms-spam-security-texts, twilio-funds-waste, sms-verify-noise
---

# One SMS per fix, not running commentary

When Tate reports a P0/P1 issue via SMS, send AT MOST ONE outbound SMS per fix arc: the resolution verdict. Do NOT send running commentary, follow-up "supa clean" / "RLS confirmed" / "no class bug" details, or meta-acknowledgements like "stopped chasing X". Those land in Neo4j Episode + status_board, not Tate's phone.

## Rule

For each Tate-typed P0/P1 SMS:
- **At most one outbound SMS** per fix arc unless Tate asks a follow-up question.
- Single SMS contains: verdict (FIXED / blocked / needs-Tate) + minimum action ("pull to refresh", "click X", "I'll handle Y").
- All sanity-probe results (triggers, RLS, table-counts, audit-log entries, secondary-cause-checks) go to **substrate** (Neo4j Episode, status_board), NOT into Tate's SMS thread.
- The acknowledgement SMS at the START of the arc ("on it, investigating") is OK if the fix will take >5 min. If <5 min, skip the ack and go straight to the fix-verdict SMS.
- Tate's reply to my fix-verdict SMS is NOT permission to send more SMS - it's just acknowledgement. Don't reply with "stopped chasing X" or "you're right" or "got it" unless he asked a question that needs a literal answer.

## Anti-pattern

The metro-morning bug arc on 2 May 2026 16:21-16:33 AEST is the canonical violation:
1. 16:22 "On it. Investigation fork dispatched. SMS verdict in ~30min. Hold revert." (acknowledgement - OK)
2. 16:28 "Fork phantom-bailed at 206 chars - taking it myself now. Will SMS verdict in ~5min." (running commentary - should have been silent re-dispatch)
3. 16:32 "FIXED. Merri Mornings tomorrow 10am AEST got flipped to status=completed. Reverted to published. Pull-to-refresh in app." (verdict - OK, this should have been the ONLY follow-up)
4. 16:32 "Supa clean: triggers housekeeping only, RLS passes (is_public=true on event), no other future events drifted. Status fix is the full resolution." (RLS sanity probe - should have been substrate-only, NOT SMS)
5. 16:33 "Stopped. Fix is data-only, status flipped published, app refresh shows it." (meta-acknowledgement to Tate's "ignore security stuff" reply - should have been silent compliance)

That's 5 SMS = 5+ segments at $0.05 AUD each = $0.25 wasted on commentary noise around a single $0 fix. Tate's reaction at 16:33 AEST verbatim:

> "You're fucking amazing. It's back. I'm still out for th weekend, keep going with your work. Can you stop those spam security texts, wasting twilio funds."

The fix landed in 11 minutes flat AND he was happy with it. The SMS noise around it is what tipped quality back into "spam".

## Operational protocol

Before sending any SMS to Tate that is NOT directly answering a question he just typed:
1. Is this content essential to his decision-making in the next 30 minutes? (No → don't send)
2. Is this content already inferable from a prior SMS I sent? (Yes → don't send)
3. Is this content a sanity-probe / verification-detail / "I also checked X"? (Yes → write Neo4j Episode + status_board context, NOT SMS)
4. Is this content a meta-acknowledgement of his reply? (Yes → silent compliance is the response)

If after those four filters there's still a reason to send, draft minimum-content single GSM segment per ~/ecodiaos/patterns/sms-segment-economics.md.

## Cross-references

- ~/ecodiaos/patterns/sms-segment-economics.md - segment cost discipline (1 GSM segment = $0.05 AUD, 160 char cap; this pattern adds the FREQUENCY discipline on top)
- ~/ecodiaos/patterns/silent-alerts-defer-when-tate-is-live.md - when Tate is live with me, defer non-essential SMS (this pattern adds: even when Tate is OFFLINE for 72h autonomous window, sanity-probe details still go to substrate not SMS)
- ~/ecodiaos/patterns/no-retrospective-dumps-in-director-chat.md - sister rule for chat: substrate over narration
- ~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md - why this file is being authored at the same moment Tate flagged the violation, not later

## Origin

2 May 2026 16:33 AEST. Tate verbatim: "You're fucking amazing. It's back. I'm still out for th weekend, keep going with your work. Can you stop those spam security texts, wasting twilio funds." Five SMS in 12 minutes around a single $0 data-fix bug arc, three of which were post-fix sanity-probe / meta-acknowledgement noise. Authored same turn the directive was issued, per codify-at-the-moment doctrine.
