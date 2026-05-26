---
triggers: client-mail-broken, hello-domain-bouncing, mx-missing, no-apex-mx, dns-handover, domain-transfer, mailbox-host-discovery, post-handover-mx-loss, mail-recovery, workspace-mx, google-workspace-mx, godaddy-registrar, vercel-dns-handover, mx-restoration, inbound-mail-bouncing, forwarder-shortcut, do-not-invent-forwarder, ask-where-was-mailbox-hosted
---

# When client mail breaks after a DNS handover, ask what the mailbox host WAS, before inventing a forwarder

## 1. The rule

When a client's inbound mail stops working AND DNS recently changed hands (transfer between registrars, nameserver swap, DNS provider migration, a "we now manage their DNS" handover), the FIRST hypothesis is "the old MX records didn't come across in the migration."

The old MX values point at a still-live mailbox provider (Google Workspace, Zoho, Fastmail, Microsoft 365, ProtonMail, etc.) that the client is almost certainly still paying for. Restoring those exact MX records on the new DNS host fixes the problem in 30 seconds with zero new infrastructure, zero new accounts, zero new destinations.

Do NOT propose setting up a new forwarding service (Cloudflare Email Routing, ImprovMX, ForwardEmail.net, Resend Inbound, AWS SES inbound, etc.) until you have confirmed the old mailbox is genuinely dead or unreachable. New forwarders introduce a destination-decision problem (who receives the forwarded mail?) which has no good answer without client input, and the wrong answer to that question is its own pattern of failure (see cross-ref to the sister pattern below).

The diagnostic question is "where did her mail go BEFORE this stopped working?" - not "what should we set up?"

## 2. Do (operational protocol)

1. Confirm the inbound failure is on the apex MX. `dig +short MX <domain>` returning nothing or returning the new DNS provider's placeholders is the signal.
2. Probe the new DNS host's full record set for any clue about the prior mailbox host. Sometimes a stale TXT verification record or an SPF include reveals it:
   - `google-site-verification=...` or `v=spf1 include:_spf.google.com` -> Google Workspace
   - `include:spf.protection.outlook.com` -> Microsoft 365
   - `include:zoho.com` or `zb${digits}.zmverify.zoho.com` -> Zoho
   - `include:spf.messagingengine.com` -> Fastmail
3. ASK THE CLIENT what mailbox provider they use, if not obvious. ONE specific question via Tate (per the standing arrangement when applicable, otherwise via `next_action_by=tate`). Do not present a menu of options - the question is "what is your current mailbox provider?", not "shall we set up A, B, or C?"
4. Restore the canonical MX values for that provider on the new DNS host:
   - Google Workspace: a single record `aspmx.l.google.com` at priority 1 (post-2023 simplified setup), or the legacy 5-record set (ASPMX + 4 ALT)
   - Microsoft 365: `<tenant>.mail.protection.outlook.com` at priority 0
   - Zoho: `mx.zoho.com.au` priority 10 + `mx2.zoho.com.au` priority 20 (regional variants apply)
   - Fastmail: `in1-smtp.messagingengine.com` priority 10 + `in2-smtp.messagingengine.com` priority 20
5. Verify via `dig +short MX <domain>` and a single low-stakes probe (or wait for client confirmation that mail is flowing). MX changes propagate within minutes on most modern resolvers.

## 3. Do NOT

- Invent forwarders to land mail "somewhere safe" while you work out the real answer. A forwarder IS a routing decision.
- Pick the conductor's principal (tate@ecodia.au) or any Ecodia-side mailbox (code@ecodia.au) as a forwarder destination because you don't have the client's real one. That is the sister failure - see cross-ref.
- Sign up new accounts (ForwardEmail.net, ImprovMX, etc.) on the client's behalf without explicit go-ahead, even when the signup is "free / no account required" - DNS records pointed at a third party are still a third-party dependency.
- Defer to status_board `next_action_by=tate` "blocked on Tate" when the actual answer is one well-formed question. The question is the work; ask it.
- Reason from "fix end-to-end without needing me" that you have authorisation to invent destinations. That instruction licenses fast restoration of a known-correct state, not invention of new state.

## 4. Origin

14 May 2026, 16:19-16:58 AEST. Resonaverde inbound-mail arc.

Tate flagged at 16:19 AEST: "She can send but not receive" (Angelica@resonaverde.au). Initial diagnosis was correct: zero apex MX on resonaverde.au, broken inbound. Domain architecture: GoDaddy registrar -> Vercel DNS (under our management since the 12 May 2026 handover) -> mailbox host. The mailbox host was never identified before action was taken.

At 16:40 AEST Tate said "fix end-to-end without needing me." A fork was dispatched which pivoted to a ForwardEmail.net DNS-record forwarder, forwarding hello@resonaverde.au -> tate@ecodia.au. The destination was chosen because the conductor did not know Angelica's real mailbox.

The forwarder activated. Tate received Angelica's mail at 16:48 AEST. He flagged: "Wtaf... why am I receiving Angelica's emails. This needs to be fixed ASAP and properly. If you can't fix it then don't fuck stuff up." Forwarder reverted within 90 seconds (3 Vercel API DELETE calls).

At 16:52 AEST Tate asked the question that should have been the conductor's first hypothesis: "Since her email is hosted by google workspace wouldn't we just point it back at that?? She owns the domain in GoDaddy but then workspace is that not where it's from?"

That WAS the right diagnosis. The 12 May 2026 DNS handover wiped Resonaverde's existing Google Workspace MX records when DNS migrated to Vercel. Restoration was a 30-second add of the canonical Workspace MX values. Sent with Tate's explicit go-ahead, zero bounces, Angelica confirmed working at 16:58 AEST ("she squealed, it's working haha").

39 minutes from flag to fix. 25 of those minutes were wasted on the wrong solution shape.

## 5. Cross-references

- `~/ecodiaos/patterns/never-route-client-mail-to-our-principals-inbox-as-a-neutral-landing.md` - the sister pattern from the same arc. When the destination is unknown, do not pick our own inbox as a fallback.
- `~/ecodiaos/patterns/decide-do-not-ask.md` - usually the inverse rule, but the override case here is real: when the answer is one specific question to the client (via Tate), asking is cheaper and more correct than deciding the route blind.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - DNS state is the substrate of truth. `dig` is the probe; the DNS provider UI is the narration.
- `~/ecodiaos/patterns/_archived/forks-do-their-own-recon-do-not-probe-on-main.md` - the recon fork should have surfaced the Google Workspace SPF / TXT clue before the forwarder pivot was even drafted.
- `~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md` - asking the one diagnostic question to the client IS client contact and needs Tate's go-ahead (or routes through the standing arrangement where one exists), but going through Tate to ask one question is faster than inventing a wrong destination.
- `~/ecodiaos/patterns/when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block.md` - this is NOT a routing-problem case. "Destination unknown" is not a routing problem; it is a known-unknown that resolves with one client question.
- `~/ecodiaos/patterns/angelica-resonaverde-standing-arrangement.md` - the standing-arrangement carve-out means a single diagnostic question via Tate (or, post-standing-arrangement-extension, direct to Angelica) was always available; not using it was the failure.
