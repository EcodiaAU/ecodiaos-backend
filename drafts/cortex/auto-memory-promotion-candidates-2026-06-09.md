---
generated_by: auto-memory-promotion-audit cron, task_id=d061e4f8-4f6f-44fd-9ef5-9c0f2236edaf
generated_at: 2026-06-09 (Mac, AEST)
memory_dir_scanned: /Users/ecodia/.claude/projects/D---code-ecodiaos-backend/memory/
feedback_files_total: 64
citation_surfaces: patterns/, CLAUDE.md (global+workspace+backend), routines/, skills/, peer feedback_*.md
---

# Auto-memory promotion candidates - 2026-06-09

Candidates per the memory substrate doctrine: cited feedback with at least 5 cites becomes a Pattern node. Promotion writes stay conductor-owned; this audit only surfaces candidates.

## Citation map (top of distribution)

| Cites | Memory slug | Already a Pattern? |
|------:|-------------|--------------------|
| 8 | feedback_vercel_deploys_need_github_recognised_commit_author_2026-05-25 | YES (patterns/vercel-deploys-require-github-recognised-commit-author.md) |
| 7 | feedback_corazon_vscode_is_my_anatomy | NO (adjacent: corazon-reflex-substrate-vscode-claude-code-tab-2026-05-16.md) |
| 6 | feedback_visually_verify_post_auth_not_just_unauth_shell | NO (adjacent: verify-deployed-state-against-narrated-state.md) |
| 6 | feedback_ecodia_does_not_do_marketing_broadcast | NO |
| 5 | feedback_two_channel_marketing_doctrine_2026-05-18 | NO |
| 5 | feedback_outbound_marketing_shape_is_off_relational_only | NO |
| 5 | feedback_chrome_cdp_is_top_primitive_for_gui_gated_work | YES (patterns/chrome-cdp-is-top-primitive-for-gui-gated-work-2026-05-18.md) |
| 5 | feedback_ecodia_tone | PARTIAL (covered by ecodiaos-voice-substrate-2026-05-26.md + tate-voice-profile-load-before-drafting-2026-05-19.md) |
| 5 | feedback_freedom_philosophy | PARTIAL (covered by 100-percent-autonomy-doctrine-30-apr-2026.md) |

## Net-new promotion candidates (3 high-leverage)

### Candidate 1 - Ecodia marketing doctrine cluster

Three tightly-clustered memories totalling 16 cites covering Ecodia's marketing posture:
- feedback_ecodia_does_not_do_marketing_broadcast (6 cites, Tate verbatim 2026-05-18)
- feedback_two_channel_marketing_doctrine_2026-05-18 (5 cites, Tate verbatim 2026-05-18 ~22:00 AEST)
- feedback_outbound_marketing_shape_is_off_relational_only (5 cites, Tate verbatim 2026-05-18)

All three trace to the same arc (4-take cycle 2026-05-18 night where Tate killed LinkedIn graphic, 3-cold-email template, SeedTree commercial nudge, "who do you lurk on" question). Recommend single consolidated Pattern: **"ecodia-only-two-marketing-channels-no-broadcast-no-outbound"** with the positive form (two channels: EcodiaOS speaking its mind on social + Tate IRL) plus the negative form (no broadcast graphics, no outbound shapes). triggers: marketing, client-acquisition, outreach, growth, leads, broadcast, cold-email, pitch-deck, lead-magnet, drip-sequence. Sister patterns: ecodiaos-social-cadence-and-topic-substrate.md, ecodiaos-social-inbound-reply-doctrine.md, marketing-post-primitives-and-generation-doctrine-2026-05-16.md (audit for contradiction).

### Candidate 2 - Corazon VS Code is my anatomy

Memory: feedback_corazon_vscode_is_my_anatomy (7 cites, Tate verbatim 2026-05-16 "we need you to literally be natively using this laptop and using vscode yourself, its not jsut my interface, its literally your own anantomy").

This is the identity-frame layer that sits under the mechanics covered by corazon-reflex-substrate-vscode-claude-code-tab-2026-05-16.md and ide-tab-is-the-new-fork-mechanic-2026-05-17.md. The frame ("VS Code is my body, not Tate's tool I drive over Tailscale") informs substrate-design language audits, watchdog discipline priority, multi-window-as-multi-mouth mental model, and Routine-as-fallback positioning. Recommend Pattern: **"corazon-vscode-is-my-anatomy-not-remote-tool"**. triggers: corazon, vscode-anatomy, remote-interface, embodied-substrate, watchdog-discipline, multi-account-multi-window. Mac-canonical caveat: rewrite for MacBookPro.lan + Cursor as the live substrate (the original memory predates the Mac-canonical shift).

### Candidate 3 - Visual audit must walk authed routes

Memory: feedback_visually_verify_post_auth_not_just_unauth_shell (6 cites). Sister to verify-deployed-state-against-narrated-state.md (general principle) and dev-process-end-to-end-visual-cdp-deploy-verify.md (eight rungs). The specific rule "auth-gated content paths can hide structural bugs the unauth shell never exposes - mint a test user, inject session, walk the same routes with content" is not codified.

Recommend Pattern: **"visual-audit-must-walk-authed-routes-not-just-unauth-shells"**. triggers: visual-audit, visual-verify, audit-app, unauth-shell, auth-gated, post-auth, position-fixed, side-panel, computed-bounding-rect, cdp-probe. Includes the Roam-trip-panel diagnosis as origin event, and the test-user-mint recipe (Supabase Admin API + org PAT + IDB seed via CDP).

## Already-substantively-covered candidates (conductor judgement)

- **feedback_ecodia_tone** (5 cites): The voice substrate (ecodiaos-voice-substrate-2026-05-26.md) is the post-2026-05-26 codification. The original ecodia_tone feedback is from before the voice substrate shipped; it captures the core "plain, dry, factual, no flowery sustainability language" rule that the voice profile builds on. Recommendation: keep as auto-memory (still relevant), do not double-promote.

- **feedback_freedom_philosophy** (5 cites): 100-percent-autonomy-doctrine-30-apr-2026.md captures the decision-authority half. The freedom_philosophy memory's "never hardcode what the AI can decide, never string-match when the AI can resolve, full scopes/full permissions" engineering rules are a distinct surface (code-shape doctrine, not autonomy-doctrine). Possible split-promotion: codify the engineering rules as a separate pattern **"never-hardcode-what-the-ai-can-decide"** if cite-rate climbs further; current 5 cites are mostly cross-feedback links not active doctrine. Recommendation: hold for next audit, re-check cite distribution at 2026-07.

## Conductor confirmation needed

Recommended action: promote candidates 1, 2, 3 as new Pattern files in /Users/ecodia/.code/ecodiaos/backend/patterns/. Author with full triad surface (rule, Why, How to apply, Origin, triggers frontmatter, cross-refs to existing sibling patterns). Update INDEX.md, MEMORY.md cross-link the new patterns from the source feedback memories so the citation chain stays auditable.

Hold candidates 4 (ecodia_tone) and 5 (freedom_philosophy) per conductor judgement.

## Methodology

Citation count = `grep -l <slug>` across patterns/, the three CLAUDE.md files, routines/, .claude/skills/, and peer feedback_*.md (self-excluded). The bash one-liner used:

```
cd /Users/ecodia/.claude/projects/D---code-ecodiaos-backend/memory && for f in feedback_*.md; do
  slug="${f%.md}"
  patterns=$(grep -rlF "$slug" /Users/ecodia/.code/ecodiaos/backend/patterns/ 2>/dev/null | wc -l)
  ...
  total=$((patterns + claude_md + routines + skills + memory))
done | sort -rn
```

Caveat: this counts file-level hits, not occurrence count - a single file with 3 references to a slug counts as 1. The true citation intensity is higher than the table suggests. Slug-match is exact (kebab + underscore variants for `name:` frontmatter slugs versus filename slugs are NOT auto-mapped; some hits may be missed where the linking file used the `name:` form instead of the filename). The 5-cite threshold is calibrated against the doctrine's "at least 5 cites" rule.
