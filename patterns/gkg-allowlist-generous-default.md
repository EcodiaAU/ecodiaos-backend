---
title: GKG allowlist - generous default, narrow only on Tate-flagged noise
triggers: gkg, gkg-allowlist, gkg-capture-daemon, capture-allowlist, allowlist-default-generous, gkg-phase-1, gkg-phase-2, gkg-overcollection, allowlist-skip, daemon-allowlist, ui-knowledge-graph-allowlist, ui-graph-capture, gkg-noise, allowlist-narrow, capture-coverage, knowledge-graph-coverage, allowlist-broad, allowlist-tight
status: active
authored_at: 2026-05-07
authored_by: fork_mov5fcpf_fb840a
---

# GKG capture allowlist - generous default, narrow only on Tate-flagged noise

## Rule

The GKG (GUI Knowledge Graph) Phase 1 capture daemon ships with a broad
allowlist that includes every SaaS Tate uses regularly plus the developer
desktop apps. The default state is *over*-collect, not *under*-collect.

Narrow ONLY when:

- Tate explicitly flags noise from a particular app (`"the daemon is recording too much from Slack DMs"`).
- A privacy posture failure (e.g. a redaction pattern miss) demands a temporary tighter scope while the redaction code is fixed.
- A specific app demonstrably dilutes the graph quality (e.g. an app whose UI is so dynamic the captured states never match on replay).

Do NOT narrow on guesses about "what Tate would want." A missed workflow is
permanent gap in the graph; an over-captured workflow is a few hundred KB of
ciphertext events the Phase 2 graph-builder can dedupe or skip.

## Why generous

Phase 1 ships ONE app target nominally (Apple Dev Console, per spec §6),
but the capture daemon's marginal cost per added allowlist entry is
near-zero (one substring check) while the value of catching an unanticipated
Tate workflow is high (replay engine becomes useful sooner). Over-collection
in Phase 1 is cheaper than missing a workflow.

The privacy posture is layered independently of allowlist breadth:

1. Sensitive-context redaction (window-title / focused-element pattern match) drops keystrokes whether or not the app is allowlisted.
2. Per-Tate AES-256-GCM encryption at rest (VPS-side, with `kv_store.gkg.tate_payload_key`) means broad capture has no impact on data-at-rest exposure.
3. Tray pause toggle gives Tate a one-click out for any moment he wants the daemon off.

So the allowlist's job is "is this app on the graph at all?" not "should we be careful about this?"

## Default list (Phase 1 ship 7 May 2026)

Lives at `~/ecodiaos/laptop-agent/daemons/gkg-allowlist.json`. Subject to
`!.env.*` gitignore exception via `git add -f` if file pattern shifts.

### Browser URL hosts (window-title or URL substring match)

`developer.apple.com`, `appstoreconnect.apple.com`,
`console.firebase.google.com`, `console.cloud.google.com`,
`play.google.com/console`, `dashboard.stripe.com`, `vercel.com`,
`app.supabase.com`, `supabase.com/dashboard`, `github.com`, `bitbucket.org`,
`resend.com`, `canva.com`, `login.xero.com`, `go.xero.com`,
`app.zernio.com`, `dash.cloudflare.com`, `claude.ai`, `chatgpt.com`,
`mail.google.com`, `drive.google.com`, `docs.google.com`,
`calendar.google.com`, `www.notion.so`, `app.gitbook.com`.

### Native process names

`Code.exe`, `Cursor.exe`, `slack.exe`, `Discord.exe`, `Teams.exe`,
`ms-teams.exe`, `Postman.exe`, `Insomnia.exe`, `AutoHotkey64.exe`.

### Redaction field patterns (window/element title substring)

`password`, `passwd`, `pwd`, `pin`, `secret`, `token`, `api_key`, `apikey`,
`2fa`, `verification`, `cvv`, `ssn`, `tax id`, `tfn`, `ein`.

## Anti-patterns

- "Apple Dev Console only for Phase 1, expand later" (spec wording). The
  spec was written before the workshop discussion on broad-vs-narrow; the
  workshop verbatim ("default to broad allowlist") supersedes. Phase 1
  ships broad; Phase 2 work is the *graph-builder cron*, not "expand the
  allowlist."
- Pruning the allowlist because "Tate probably won't use Notion in the
  daemon's collection window." Adding the entry costs nothing; removing it
  retroactively requires SQL surgery on the captured rows.
- Treating the allowlist as a privacy primitive. It is a *graph-relevance*
  primitive. Privacy is the redaction + encryption + pause toggle layers.

## Origin

Tate verbatim 2026-05-07 16:05 AEST during GKG workshop:
> "default to broad allowlist, narrow only if I flag noise. Overcollection in Phase 1 is cheaper than missing a workflow."

Reaffirmed at 2026-05-07 17:09 AEST when authorising the Phase 1 daemon
ship: "let's get the rest of gkg built, you can tailscale corazon if needed".

Authored by `fork_mov5fcpf_fb840a` while shipping the Corazon-half capture
daemon. The same fork wrote `~/ecodiaos/laptop-agent/daemons/gkg-allowlist.json`
with the list above.

## Cross-references

- `~/ecodiaos/docs/gkg-spec-v0.1.md` §3.1 (capture daemon) and §4 (privacy posture).
- `~/ecodiaos/patterns/codify-at-the-moment-a-rule-is-stated-not-after.md` - this file is the codification of the workshop verbatim.
- `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md` - GKG = the memory layer Anthropic computer-use queries.
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` - Phase 1 daemon ships only after a 60s smoke run validates an end-to-end ingest path.
