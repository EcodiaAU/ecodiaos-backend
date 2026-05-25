---
fire: marketing-outreach 2026-05-25
category: C (AI-run business angle) with B (tech insight) overlap
status: pending_tate_review
substrate: git (MCP token expired this fire, see fire-log-2026-05-25.md)
character_count: 1042
em_dash_check: passed (zero em-dashes)
client_anonymity_check: n/a (no client references)
brand: Ecodia / EcodiaOS (platform IP, not Co-Exist)
source_commits:
  - 6ea5d92 feat(corazon): resident-brain persistent claude session (7-15x faster away handoffs)
  - 8aa7bb0 ops(corazon): self-restarting away-conductor wrapper + watchdog (replace PM2)
  - 9484a46 fix(corazon): watchdog only respawns on port-unbound, never on slow /health
  - e262d59 fix(away): move case resolution to VPS; away-conductor must be pure
  - 0dfb244 fix(escalation): kill VPS-claude fallback for native + surface workstation-unreachable
---

# LinkedIn post draft (for Tate review and post)

We ship features while I am away from the keyboard.

Yesterday we landed a piece of EcodiaOS called the resident brain. It is a Claude Code session that stays loaded on my workstation for hours instead of cold-starting each time the system needs to think. Handoffs that used to take 90 to 120 seconds now take 6 to 12.

That is not a marginal optimisation. It is the difference between an AI manager that feels like a queue and one that feels like a colleague.

The interesting part is what we had to build around it. A watchdog that only respawns the process when the network port actually goes silent, not when the health check is just slow. A self-restarting wrapper so we do not need a separate supervisor process. An away-conductor that is pure (no DB writes, no side effects, just judgement) so it can be killed and respawned without losing state. A 7-tier escalation chain that decides when to wake me up and when to handle it.

None of that is glamorous. All of it is the substrate that lets a small dev studio keep moving when the human in the loop is asleep, in a meeting, or on the Sunshine Coast eating breakfast.

We are a 1-person dev studio with a platform IP. The platform is the part that makes the 1-person part work.

---

## Posting notes for Tate
- No tags, no hashtags. Strip the framing if it reads as too much.
- If you want a sharper hook, swap line 1 for: "We shipped a feature last night. I was asleep."
- If you want a softer landing, drop the last line and end on "Sunshine Coast eating breakfast."
- Don't post the source_commits list. That's internal context for you to verify the claim before posting.

## Rotation discipline
- This is category C+B (AI-run business + tech insight).
- Next fire (in 72h, ~2026-05-28) avoid C and B. Prefer A (recent shipped work, framed as what we learned), D (industry observation from deep-research), or E (anonymised case study).
- Rotation log lives at `cowork.marketing-outreach.linkedin_drafts.recent` once MCP is back. For now the rotation record is this file's `category` frontmatter plus the next fire's frontmatter.
