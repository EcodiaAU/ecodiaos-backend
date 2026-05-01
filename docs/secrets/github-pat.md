---
triggers: github, gh, gh-cli, github-token, github-pat, GITHUB_TOKEN, ghp_, github_pat_, github api, git push github, EcodiaTate, ecodiaos-backend, factory-dispatch-github-auth, pr open, PR-creation-blocked
class: programmatic-required
owner: tate
---

# creds.github_pat

GitHub Fine-grained Personal Access Token used for all programmatic interactions with the EcodiaTate org from VPS automation: `gh` CLI, `git push` over HTTPS, REST API for PR open/review/merge, and Factory/fork dispatches that touch GitHub. Without it, fork PR-creation blocks (the recurring "PR creation blocked on invalid GITHUB_TOKEN" failure mode), `gh auth status` returns 401, and any wave that depends on opening PRs phantom-completes at the branch-push step.

## Source

github.com > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token.

**Critical: this is a fine-grained PAT, NOT a classic `ghp_` PAT.** Fine-grained tokens have stricter scope/expiry semantics. If older docs reference `ghp_` shape, that language is stale and refers to a previous classic-PAT generation that has been rotated out.

Resource owner: `EcodiaTate` org. Repo access: All repositories (or selected, must include `ecodiaos-backend`, `ecodiaos-frontend`, and any client repo where automation needs write).

## Shape

Object stored as JSON-text in kv_store:

```jsonc
{
  "type": "fine-grained-pat",
  "token": "github_pat_...REDACTED",   // 93-char scalar starting `github_pat_`
  "scopes": "repo contents r/w + pull-requests r/w + workflows r/w",
  "rotated_at": "2026-04-30T22:43:00+10:00",
  "rotated_by": "tate-direct-chat-paste",
  "consumer_surfaces": [
    "~/ecodiaos/.env GITHUB_TOKEN",
    "ecodia-api process env (pending pm2 restart)"
  ]
}
```

Required scopes for current automation: **Repository contents (read+write)**, **Pull requests (read+write)**, **Workflows (read+write)**.

## Used by

Single auth context (Bearer token over HTTPS). Same value, three callers:

1. **`gh` CLI on VPS shells.** `gh` reads `$GITHUB_TOKEN` from the process env. No `~/.config/gh/hosts.yml` is configured, so the env var IS the auth source. Used for `gh pr create`, `gh pr merge`, `gh api`, etc.
2. **Git HTTPS remote pushes.** `git push origin <branch>` against `https://github.com/EcodiaTate/<repo>` reads the same env var via the credential helper.
3. **Forks and wave dispatches that open PRs.** Child node processes spawned out of ecodia-api inherit env from the parent PM2 process; if that process's env is stale, the fork's `gh pr create` 401s. Status_board narration (rev-2 P1 row 316cad74) calls this "env-var-prefix" injection - in practice this is just `dotenv` re-loading `~/ecodiaos/.env` at fork spawn-time, which is why the .env update propagates to forks even when ecodia-api itself has not been restarted.

Consumer surfaces actually probed (1 May 2026 audit, fork_molqhd5g_54fb81):

| Surface | Probe | State | Notes |
|---|---|---|---|
| `kv_store.creds.github_pat` | SQL | LIVE | `updated_at = 2026-04-30T12:44:36 UTC` (= 22:44:36 AEST, narration said 22:43 - off by ~90s, essentially correct) |
| `~/ecodiaos/.env GITHUB_TOKEN` | grep + length check | MATCHES kv_store | `github_pat_` prefix, 93 chars |
| `~/.config/gh/` (gh CLI dotfile) | filesystem | ABSENT | `gh` reads env, not dotfile |
| `pm2 env 3` (ecodia-api PM2 env) | `pm2 env 3` | STALE | still holds `ghp_IQqe...` (40-char classic). Acknowledged in kv_store consumer_surfaces as "pending pm2 restart". |
| `gh auth status` (current shell) | `gh auth status` | FAILING 401 | Inherits stale `ghp_IQqe...` from ecodia-api parent process |
| `pm2 env 1/2` (ecodia-factory, ecodia-rescue) | `pm2 env` | NOT SET | These processes do not consume the token |
| `~/ecodiaos/ecosystem.config.js` | grep | NO REF | PM2 env is injected at startup, not via ecosystem config |
| `~/ecodiaos/src/` services | grep | NO CONSUMER CODE | Only `src/lib/credentialFilter.js` test fixtures reference token shapes |
| `~/ecodiaos/mcp-servers/` | grep | NO REF | No MCP server reads the token |
| `~/ecodiaos/scripts/` | grep | NO REF | |
| `~/workspaces/*/be/.env*` and `~/workspaces/*/fe/.env*` | grep | NO REF | Client workspaces do not consume our PAT |
| `.github/workflows/*` (EcodiaTate repos) | grep | NO REF | Workflows use GitHub's auto-injected `${{ secrets.GITHUB_TOKEN }}`, not our PAT |
| Vercel project env vars | NOT PROBED | UNKNOWN | API access from VPS does not exist for Vercel project env. Vercel uses its own GitHub OAuth integration for repo connection; no `GITHUB_TOKEN` env var is required on Vercel project envs unless a build script explicitly calls `gh`. Default assumption: no Vercel-side consumer. NEEDS-TATE confirmation if a build script ever uses `gh`. |

## Replaceable by macro?

Partial. Web UI workflows on github.com (review, comment, merge, branch protection toggles) ARE doable through Cowork driving Tate's logged-in Chrome - see `~/ecodiaos/patterns/claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md`. But VPS-side `git push` from automation, `gh` CLI from cron jobs, and fork-side `gh pr create` ALL require the programmatic token - there is no GUI fallback for the spawn-time path. Therefore: programmatic-required, NOT gui-macro-replaces.

## Rotation

Fine-grained PAT default cadence: **90 days** (configurable up to 1 year, no-expiry not selectable for fine-grained).

Triggers for rotation outside cadence:
- Suspected leak (token-shape match in any error log, status_board context field, or pasted message)
- Org member departure with that scope
- A scope change (need to add a new repo or capability that the existing token doesn't cover)

Set the `rotated_at` field on the kv_store row at every rotation. The status_board P1/P2 row tracking the rotation event also gets `last_touched` updated.

## Restoration if lost

1. Tate logs into github.com > Settings > Developer settings > Personal access tokens > Fine-grained.
2. Generate new token. Resource owner = `EcodiaTate`. Scopes per the "Required scopes" section above. Expiry = 90 days unless cadence overridden.
3. UPSERT `kv_store.creds.github_pat` JSON object with new `token`, refreshed `rotated_at`, `rotated_by` = whoever rotated, and `consumer_surfaces` listing every surface that needs the new value.
4. Propagate to consumer surfaces, in order:
   - `~/ecodiaos/.env`: replace `GITHUB_TOKEN=...` line.
   - `pm2 restart ecodia-api`: pulls new .env value into the long-lived process. **WARNING:** restarting ecodia-api kills the OS chat session that this conductor is running inside. The restart must be initiated from a context that survives the kill (Tate-direct PM2 command, scheduled cron, or a fork that explicitly handles re-spawn).
   - `gh auth status` from a fresh shell to verify the new token authenticates.
   - `gh api user` to confirm 200 + matches expected `code@ecodia.au` / EcodiaTate-org membership.
5. Mark row archived in status_board if a rotation-tracking row was open. INSERT a new P3 status_board row 90 days out as a rotation reminder.

## Failure mode if missing

- `gh pr create` returns `HTTP 401: Bad credentials` - all wave-N PR-open steps phantom-complete at the branch-push boundary.
- `git push https://github.com/EcodiaTate/<repo>` returns 401.
- Factory and fork dispatches that include a "create PR" deliverable produce branches but no PRs.
- `gh auth status` says "token is invalid".
- `gh api user` returns 401.

The signature failure: a fork commits and pushes a branch (which works because git's HTTPS push uses ssh-like auth that is ALSO the token, BUT only if the env hasn't been polluted with a stale token), then fails on `gh pr create` with 401. Rev-2 wave-3 saw this exact failure shape on 30 Apr 2026 22:00-22:30 AEST.

## Drift summary (1 May 2026 audit)

1. **ecodia-api PM2 env still holds stale `ghp_IQqe...` (classic 40-char PAT) as of 1 May 2026 ~00:30 AEST.** The kv_store row's `consumer_surfaces` list explicitly notes this as "pending pm2 restart". This is a known unfinished propagation step, not new drift. Unblock = `pm2 restart ecodia-api`, but the conductor cannot run that command from inside a session hosted by ecodia-api itself - someone (Tate, a cron, or a fork that handles re-spawn) must initiate the restart externally. Until then: any new shell spawned from ecodia-api inherits the stale `ghp_` and `gh` operations on those shells fail. Surfaced to status_board as P2 row.
2. **Narration vs ground-truth drift on rotation timestamp.** Status_board row 2a224645 says "rotated 22:43 AEST"; kv_store `updated_at` says 22:44:36 AEST and the embedded `rotated_at` JSON field says 22:43:00. Off by 96 seconds between row-touch and value-write. Acceptable, but flag the pattern: narration-time and substrate-write-time always diverge by tens of seconds-to-minutes. Always trust the substrate (`updated_at`) over narrated timestamps for forensic questions.
3. **No `gh` CLI dotfile.** `gh` operates purely from `$GITHUB_TOKEN` env var. This means rotation propagation is entirely env-var-bound; there is no "second source" cached on disk that would persist a stale token across env reloads. Good for clean rotations, bad if env is ever unset (no auth fallback).
4. **Naming-convention note.** Key is `creds.github_pat` (underscore). Other creds use both styles (`creds.canva.connect_api` dotted, `creds.bitbucket_api_token` underscored). Catalogued in INDEX.md drift summary; do NOT rename in isolation - migration policy requires lockstep updates across `scripts/`, `src/`, `mcp-servers/`, `patterns/`, `clients/`, `drafts/`.
5. **Vercel-side consumer never confirmed.** Vercel projects could in theory consume a `GITHUB_TOKEN` env var if a build script uses `gh` or hits the GitHub REST API. No probe was possible from the VPS. Default assumption is no Vercel-side consumer (Vercel uses its own GitHub OAuth integration for repo connection). NEEDS-TATE one-time confirmation across the project list, then update this section once.

## Cross-references

- `~/ecodiaos/patterns/cred-rotation-must-propagate-to-all-consumers.md` - the meta-doctrine; rotation completes only after every consumer surface verified.
- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - status_board narration of rotation completion is unreliable until probed.
- `~/ecodiaos/patterns/factory-phantom-session-no-commit.md` - sibling failure: PR-open silently failing on a wave fork has the same shape as a phantom Factory session.
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` - kv_store -> .env -> PM2 env -> shell env -> gh-CLI is a four-substrate seam; every rotation crosses all four.
- `~/ecodiaos/docs/secrets/INDEX.md` - registry index.
- `~/ecodiaos/docs/secrets/bitbucket.md` - schema-template sibling (same programmatic-required class, same kind of vendor-API key shape).

## Origin

Doctrine authored 1 May 2026 by fork_molqhd5g_54fb81 in response to the registry gap between the 30 Apr 22:43 AEST rotation event (kv_store row UPSERT) and the registry directory's then-empty `github-pat.md` slot. Other forks in flight on the night of 30 Apr referenced `creds.github_pat` for `gh` CLI ops without a canonical doctrine file; this file closes that gap. Audit findings (consumer surfaces, propagation gaps) baked into the Drift summary section above.
