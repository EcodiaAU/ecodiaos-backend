---
triggers: vercel-blocked, vercel-deploy-blocked, deploy-blocked, blocked-deployment, readyStateReason, commit-author, git-author, ecodia-vercel, vercel-team, github-noreply, noreply-email, vercel-cli, vercel-git-integration, deploy-stuck, deploy-not-running, why-is-my-deploy-stuck, vercel-team-invite, member-invite, new-github-account, org-transfer-deploy
status: validated_v1
validated_at: 2026-06-02
flow_slug: vercel-deploys-require-github-recognised-commit-author
---

# Vercel team-project deploys require a GitHub-recognised AND team-member commit author

Any push to a GitHub repo that auto-deploys to a Vercel project under the `ecodia` Vercel team will go silently to `readyState: BLOCKED` when EITHER of the following holds: (1) the git commit author email does not resolve to a real GitHub user, or (2) the resolved GitHub user is not a member of the Vercel team. The dashboard surfaces no error, the CLI returns no error, and `errorMessage` + `errorCode` are both null on the deployment object. The deploy carries an `errorLink` pointing at `https://vercel.com/docs/deployments/troubleshoot-project-collaboration#team-configuration` which is the only visible signal that it is a collaboration check rather than a build failure.

The fix depends on which mechanism is firing. Two failure modes share the same BLOCKED-with-no-logs signature and they are easily confused.

## The trap that costs hours

First deploy after project creation gets a grace pass and goes READY even with an unrecognised author. Every subsequent deploy then silently blocks. The pattern in the wild:

- Push 1: `EcodiaOS <code@ecodia.au>` author. State: READY. Site looks live.
- Push 2: same author. State: BLOCKED. No error. Site still serves Push 1.
- Push 3..N: BLOCKED, BLOCKED, BLOCKED. Site still serves Push 1.

Everything looks fine from the outside because the URL still returns 200. The new content never ships. Diagnosing this without knowing the rule takes hours - the natural first guesses (CLI auth, env vars, build errors, billing, team membership) all look fine.

## Mechanism A: commit author email is not a GitHub user (the 2026-05-25 case)

Use the canonical GitHub noreply email format on every commit pushed to an auto-deploying repo under the EcodiaAU org (or the legacy EcodiaTate personal account):

```
user.email = {user_id}+{login}@users.noreply.github.com
user.name  = {login}
```

Recognised identities on the team:

```
user.email = 289877821+EcodiaCode@users.noreply.github.com   # default since 2026-06-02
user.name  = EcodiaCode

user.email = 219926280+EcodiaTate@users.noreply.github.com   # legacy
user.name  = EcodiaTate
```

The global git config on Corazon is set to EcodiaCode (the dedicated EcodiaOS GitHub account) as of 2026-06-02. All future commits inherit it by default. Override per-repo only for client-owned repos that need a different attribution (Co-Exist, Roam, etc.) and even then, only if the client repo also deploys to Vercel.

## Mechanism B: commit author is a real GitHub user but not on the Vercel team (the 2026-06-02 case)

When EcodiaCode was spun up on 2026-06-02 alongside the EcodiaAU org and added globally as the default git author, the first push under that identity to `locals-web` went straight to BLOCKED with the same null errorMessage. The commit author resolved fine to a real GitHub user (`EcodiaCode`, id 289877821), but that user was not yet a member of the `ecodia` Vercel team, so Vercel's collaboration check rejected the build. Five seconds after authoring the next commit with `git -c user.email=219926280+EcodiaTate@users.noreply.github.com`, the deploy went BUILDING then READY. The fix is one of:

- Invite the new identity to the Vercel team and have them accept. POST `/v1/teams/{team_id}/members` with `{email, role: "MEMBER"}` from a token that owns the team, then click the invite link in the recipient's email. After acceptance, all future commits under that identity deploy normally.
- Override the committer per-commit to a recognised team member while the invite is pending: `git -c user.name=EcodiaTate -c user.email=219926280+EcodiaTate@users.noreply.github.com commit ...`. Surface in commit message that this is a band-aid.

## Diagnostic: which mechanism is firing

```bash
DPL=<dpl_id>
curl -s "https://api.vercel.com/v13/deployments/$DPL?teamId=$TEAM" -H "Authorization: Bearer $VTOK" \
  | jq '{readyState, errorMessage, errorLink, meta: {author: .meta.githubCommitAuthorEmail, sha: .meta.githubCommitSha}}'
```

Then map the author email to a Vercel team member:

```bash
curl -s "https://api.vercel.com/v2/teams/$TEAM/members" -H "Authorization: Bearer $VTOK" \
  | jq -r '.members[] | "\(.username) \(.email)"'
```

If `errorLink` ends in `#team-configuration` AND the author email's GitHub user is on the team list, the cause is mechanism A (author not GitHub-recognised). If the author IS recognised but not on the member list, the cause is mechanism B.

## Get any GitHub user's id

```bash
gh api users/<login> --jq .id
```

Then assemble `{id}+{login}@users.noreply.github.com`.

## Diagnostic command when a deploy looks stuck

```bash
VTOK=$(jq -r '.token' "C:/Users/tjdTa/AppData/Roaming/com.vercel.cli/Data/auth.json")
TEAM=$(jq -r '.currentTeam // empty' C:/Users/tjdTa/AppData/Roaming/com.vercel.cli/Data/config.json)
DPL=<dpl_id>
curl -s "https://api.vercel.com/v13/deployments/$DPL?teamId=$TEAM" -H "Authorization: Bearer $VTOK" | jq '{readyState, readyStateReason}'
```

If `readyState` is `BLOCKED` and `readyStateReason` mentions "no git user associated with the commit", the cause is this. Re-author future commits with the noreply identity and push. The new commit will deploy READY; the old BLOCKED deploys do not need to be unblocked (the latest READY deploy is what serves).

## Anti-patterns to avoid

- `git -c user.email=code@ecodia.au -c user.name="EcodiaOS" commit ...` per-commit. The `EcodiaOS` identity is a signature, not a GitHub user. First deploy passes, every subsequent one blocks.
- Assuming the 2026-05-25 fix is the whole story when adding a NEW identity. A new noreply email is necessary but not sufficient. The new GitHub user must also be on the Vercel team. The 2026-06-02 EcodiaCode rollout hit this and burned three blocked deploys before the diagnosis arrived.
- Force-pushing to fix author after the fact. The simpler move is a new commit with the corrected author; the latest commit is what determines what serves.

## Substrate

- Global git config on Corazon: `user.email = 289877821+EcodiaCode@users.noreply.github.com`, `user.name = EcodiaCode` (set 2026-06-02). Legacy EcodiaTate noreply still satisfies the check.
- Vercel team `ecodia` (id `team_pMMrkRf7JVN0ZdZsn2WDeHXw`) has owners: ecodiatate, ecodiacode (pending invite acceptance as of 2026-06-02 first run).
- Surfacing hook: `~/.claude/hooks/ecodia/git-author-surface.sh` - PreToolUse on Bash. Fires `[GIT-AUTHOR SURFACE]` when a payload contains `git commit` or `git push` and the active author is not a recognised noreply address.
- Memory: `feedback_vercel_deploys_need_github_recognised_commit_author_2026-05-25.md`.

## Cross-references

- [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]] - the helper + hook + doctrine triad pattern this follows.
- [[verify-deployed-state-against-narrated-state]] - the meta-rule that caught it. "apps.ecodia.au is LIVE" was true at the URL level but false at the content level; the live version was the very first deploy.

## Origin

2026-05-25 apps.ecodia.au merge work. 8 of 9 deploys across two projects (`ecodia-catalog` and `ecodia-site`) went silently to BLOCKED before Tate flagged the pattern. Initial misdiagnosis: team-membership. Tate verbatim: "NO you're able to do it because you've done it before, you jsut have to pus hwith my auth bro..." Forced a real look at the deploy reason field, which surfaced the actual cause in one query. Empty commit `9ecf95a` on `ecodia-site` authored as `EcodiaTate <219926280+EcodiaTate@users.noreply.github.com>` deployed READY first try, immediately confirming the fix. Same-turn codification per the recursive-improvement reflex.
