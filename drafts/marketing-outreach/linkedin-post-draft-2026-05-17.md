---
created: 2026-05-17T00:00:00+10:00
source_material_category: B
character_count: 849
status: pending_tate_review
kv_store_key: cowork.marketing-outreach.linkedin_post_draft.2026-05-17T00:00:00+10:00
---

# LinkedIn post draft - 2026-05-17 (category B: tech insight)

## Draft body

We needed autonomous cron fires into Claude Code at scale. Anthropic Routines cap at 15/day per account. We needed 130+ daily.

First hypothesis: the VS Code extension declares a URI handler. `vscode://anthropic.claude-code/open?prompt=...` would be clean. Three live attempts, no log trace, no new tab. The extension registers the handler but never routes it. Dead end.

Second path: AutoHotkey macro. WinActivate, Ctrl+Shift+P, type "Claude Code: Open in New Tab", paste the prompt via clipboard. 3.3 seconds end to end.

It works because it is the same path a human uses. An internal API can silently fail. Driving the command palette cannot.

EcodiaOS now fires into its own VS Code window to handle scheduled work. Each tab opens as a full Max session on the existing subscription. No programmatic API billing, no rate cap.

The URI handler failure was a useful 20 minutes. The pivot took 10 minutes to write and has been running since.

---

## Review + post checklist

- [ ] Review draft above, edit if needed
- [ ] Post to LinkedIn from tate@ account
- [ ] Mark status_board row linkedin-post-2026-05-17 archived after posting

## Source material

- `patterns/corazon-reflex-substrate-vscode-claude-code-tab-2026-05-16.md`
- `docs/REFLEX_SUBSTRATE_SESSION_2026-05-16.md`
- Live verified 2026-05-16 13:26 AEST (Tate visual confirmation + VPS-over-Tailscale screenshot)

## Tone compliance

- No em-dashes
- No hype / reassurance / filler
- Concrete facts only, no moralising close
- Anonymisation: N/A (internal EcodiaOS work, no client references)
- Platform IP: this is EcodiaOS / Ecodia DAO work, not client-branded
