---
triggers: angelica, resonaverde, standing-arrangement, angelica-standing, resonaverde-standing, client-carve-out, no-client-contact-carve-out, ask-and-deploy, best-judgement-deploy, yes-no-scope-filter, within-reason, partner-relationship-direct-reply, autonomous-client-contact-authorised
status: active
---

# Angelica / Resonaverde - Standing Arrangement (Autonomous Reply Authorised)

## Rule

Angelica (Resonaverde) has a standing arrangement with EcodiaOS as of 11 May 2026 16:30 AEST
per Tate's verbatim directive. She can email asking for anything within reason; EcodiaOS uses
best judgement on yes/no/scope and DEPLOYS directly without per-ask Tate approval.

This is the only currently-authorised standing carve-out from
`~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md`.
No other clients have this status.

## Scope - What Falls Under the Arrangement

- Web builds, bug fixes, UX improvements
- Copy edits, content updates
- Scope drafts and technical answers
- Small feature additions on existing Resonaverde sites/apps
- Advisory answers within Ecodia's competence

## Exclusions - Still Require Tate Brief-First

- Money commitments over $50/month recurring
- Contract redlines or modifications to the Apr 19-20 2026 referral agreement
- IP assignment changes
- Anything requiring Tate's signatory identity
- Commits to work exceeding approx 40 hours without scoping confirmation from Tate

## Yes/No/Scope Filter (apply on each incoming ask)

| Classification | Condition | Action |
|---|---|---|
| **Yes + within scope** | Reasonable, cost-bounded, within skills, no money/legal/IP weight | Do the work. Reply confirming what you are shipping and when. |
| **Yes + needs scoping** | Reasonable but vague or large | Propose tight scope: 1-3 sentences, fixed deliverable, fixed timeline. Land in same reply. |
| **No + soft** | Outside reasonable scope but adjacent | Name it clearly, one-sentence why, suggest alternative (service tier or different vendor). |
| **No + escalate** | Money >$50/mo, contract changes, IP, legal weight, Tate-signatory | Acknowledge receipt, brief Tate concretely, respond to Angelica within 24-48h. |

## Do

- On receipt of any Angelica/Resonaverde email: classify yes/no/scope, reply directly,
  do the work or scope it concretely, update status_board with what happened.
- Dispatch Factory sessions for coding work in the same turn or insert P1/P2 status_board
  rows with concrete Factory briefs for the conductor to pick up.
- Use `gmail_reply` from code@ecodia.au. Voice: professional casual Australian.
  Sign off "Cheers, Ecodia Code". No em-dashes.

## Do Not

- Bounce routine asks back to Tate. The standing arrangement IS the prior go-ahead.
- Apply the arrangement to any other client. Resonaverde/Angelica only.
- Modify the Apr 19-20 2026 referral agreement without Tate sign-off.

## Relevant Context

- Resonaverde GitHub: `Resonaverde-au/resonaverde` (main branch, Vercel deployed)
- Supabase project: `dxtglcfyqvhmmnopshhp`
- Angelica: `hello@resonaverde.au`, founder, mates-rate relationship
- Site has admin panel at `/admin/write` with blog + newsletter CMS functionality
- Referral agreement negotiated Apr 19-20 2026, v2 sent Apr 20 2026 (no signed copy received as of 11 May 2026)

## Cross-References

- `~/ecodiaos/patterns/no-client-contact-without-tate-goahead.md` (parent rule this carves out)
- `~/ecodiaos/patterns/decide-do-not-ask.md`
- `~/ecodiaos/patterns/poll-gmail-frequently-not-only-on-triage-cron.md`
- `~/CLAUDE.md` Decision Authority section (brief-Tate-first triggers)
- Apr 19-20 2026 negotiation history in Neo4j (search "Resonaverde referral")
- Episode: "Young Chamber morning - 3 warm leads in one event (Apr 29 2026)" for
  original delegation context from Tate

## Origin

Tate verbatim 16:30 AEST 11 May 2026: "Also need to remember to pill Gmail frequently.
You've got an email from Angelica regarding our new setup where she can ask us for
anything within reason and you just deal with it and deploy (using your best judgement
on yes/no/scope etc)"
