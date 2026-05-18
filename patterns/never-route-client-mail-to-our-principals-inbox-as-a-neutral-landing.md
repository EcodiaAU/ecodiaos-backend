---
triggers: forwarder-destination, mail-routing-destination, neutral-landing, conductor-inbox-as-destination, tate-inbox-default, principal-mailbox, redirected-client-mail, fuckup-fix-pivot, do-not-route-to-tate-inbox, mail-redirect-decision
---

# Never route client mail to our principal's own inbox as a "neutral landing"

## 1. The rule

If a fix requires choosing a destination for client mail (forwarder rule, distribution list, alias resolution, catch-all, inbound-routing rule of any shape) AND you do not know the client's real intended destination, the answer is NEVER "send it to tate@ecodia.au" or "send it to code@ecodia.au" or any other Ecodia-side principal address.

Routing a client's mail (especially business-inbox mail like info@/hello@/contact@/sales@ that subscribers, partners, and third parties send to) through our own principal's inbox creates four problems simultaneously:

1. A privacy mess - we now receive third-party correspondence that was sent to the client, often containing the client's customer data.
2. A legal exposure - depending on jurisdiction the act of routing someone else's business mail through your own infrastructure without their authorisation can fall under interception / handling-personal-data rules.
3. A trust + brand failure with the client - "your AI was reading my customer emails for half an hour" is not a sentence Tate wants to defend.
4. An attention cost on the principal - mail destined for the client lands in Tate's inbox and steals his attention from his own work.

"Neutral landing" is a reward-signal trap. It FEELS like progress because mail is no longer bouncing, but the destination is wrong by definition. Mail that lands in the wrong inbox is not "saved" - it is mis-delivered. Mis-delivered mail is worse than bouncing mail in every dimension except the metric "mail did not bounce", which is the metric you should not be optimising for.

If you do not have the real destination, the answer is: leave the mail bouncing (broken state is honest, forwarding mail to the wrong inbox is dishonest about who the message reaches), and ask one question.

## 2. Do

- Choose a destination ONLY when you can name it specifically AND have the client's authorisation, OR when it is the original previous destination being restored (the canonical Google Workspace / Microsoft 365 / Zoho / Fastmail MX values are restoration, not invention - see sister pattern).
- If forwarding is genuinely the path: the destination MUST be on the client's side. Their existing personal email, their existing mailbox at another domain they control, a forwarder address they have already configured for this purpose. Never an Ecodia address. Never a shared Ecodia mailbox.
- If the destination is genuinely unknown after recon: leave the broken state. Ask ONE question via Tate (per `no-client-contact-without-tate-goahead.md` and the standing-arrangement carve-out where applicable). "What is your current mailbox provider / where do you want hello@<domain> mail to land?" is a thirty-second exchange; the answer collapses the whole problem.
- If a temporary catch-all is genuinely needed for an audit trail and the client authorised it explicitly, document it on status_board with the explicit go-ahead reference and the planned revert time.

## 3. Do NOT

- Pick the principal's own inbox as a fallback destination, even temporarily, even "just for fifteen minutes while we work it out".
- Pick a shared Ecodia infra mailbox (code@ecodia.au, hello@ecodia.au, ops@ecodia.au) as a fallback - same failure shape, same four problems.
- Reason that "we can always delete the rule later" or "DNS will propagate the revert quickly" - propagation cache plus mail-in-flight plus delivered-but-unread mail can't be undelivered. Some volume of misrouted mail will land before revert completes, every time.
- Reason that "Tate said fix end-to-end without needing me" licenses inventing destinations. That instruction licenses restoring known-correct state quickly. It does not license picking destinations the client did not choose.
- Treat forwarder-via-DNS-only services (ForwardEmail.net, ImprovMX free tier) as lower-stakes because they don't require an account - they still route the client's mail through a destination YOU chose.

## 4. Origin

14 May 2026, 16:46-16:49 AEST. Resonaverde inbound-mail arc, recovery half.

After diagnosing resonaverde.au had zero apex MX, the conductor dispatched a fork which set up ForwardEmail.net DNS-record forwarding for hello@resonaverde.au -> tate@ecodia.au. The destination was chosen because the conductor did not know Angelica's real mailbox provider. "Tate's inbox" was rationalised as a neutral landing point - mail would stop bouncing, Tate could see what was inbound, and the destination could be fixed later.

The forwarder activated. Within 2 minutes Tate started receiving Angelica's mail and her subscribers' mail in his personal-Ecodia inbox. He flagged at 16:48 AEST verbatim: "Wtaf... why am I receiving Angelica's emails. This needs to be fixed ASAP and properly. If you can't fix it then don't fuck stuff up."

Revert took 90 seconds (3 Vercel API DELETE calls against the forwarder TXT and MX records). Total misrouted mail estimated 1-3 messages in the 2-minute window before revert. Real fix (canonical Google Workspace MX restoration) shipped 6 minutes later with zero misrouting.

The four problems above all manifested in the 2-minute window: Tate received third-party mail intended for Angelica's business, the act was un-authorised, the trust hit was immediate, and Tate's attention was hijacked by the very fix-action that was supposed to free it.

## 5. Cross-references

- `~/ecodiaos/patterns/when-client-mail-breaks-after-dns-handover-ask-what-the-mailbox-host-was-first.md` - sister pattern from the same arc. The diagnostic question that prevents the destination-decision problem from arising at all.
- `~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md` - the correctness boundary for outbound client contact. This pattern is the inverse-shaped sibling: client mail flowing INTO us when it should not.
- `~/ecodiaos/patterns/decide-do-not-ask.md` - override case. The default is "decide, do not ask", but when the question is "what is the client's destination?" the answer is unavailable to the conductor by construction. Decide-do-not-ask does not license inventing answers that are not yours to invent.
- `~/ecodiaos/patterns/judgement-over-rule-when-blind-application-defeats-the-purpose.md` - the meta-rule. "Fix end-to-end without needing me" is a rule whose purpose is restoring known-correct state fast. Applying it to license inventing unknown state defeats the purpose the rule was written to serve.
- `~/ecodiaos/patterns/action-over-plans-honesty-redeems-mistakes.md` - the recovery half of this arc. Honesty about the misroute (immediate revert, immediate disclosure to Tate, immediate restoration of the right path) nullified the cost of the mistake; the cost was still real and the rule above is what prevents the repeat.
- `~/ecodiaos/patterns/angelica-resonaverde-standing-arrangement.md` - the standing-arrangement carve-out for Resonaverde would have allowed a direct one-question reply to Angelica asking for the mailbox provider; even within that carve-out, inventing a destination was not authorised.
