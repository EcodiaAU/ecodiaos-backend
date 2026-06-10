# Claude Max Account Auto-Rotator - One-Time Setup

**Goal:** stage three pre-authed credential bundles (tate@/code@/money@), each verified on the correct personal Anthropic org, so the rotator can swap between them autonomously without you having to `claude login` again.

**Your time cost:** ~15 min, one time. After that the rotator handles everything.

**Why this is the only manual step:** Anthropic's OAuth flow does not accept an `--org` flag. The token always binds to your "primary" org at login time. The only way to GUARANTEE the right org is to set the primary in the claude.ai web UI before each login. There is no programmatic shortcut.

---

## Prerequisites

- Python 3.10+ on Corazon (already present per `py --version`).
- Three Anthropic Max accounts you can sign in to: tate@ecodia.au, code@ecodia.au, money@ecodia.au.
- Each account's **personal org UUID** known. If unknown, you'll capture it during step 3 below.

Open PowerShell on Corazon. Stay in PS for the entire procedure (don't switch to cmd).

```powershell
$env:CLAUDE_DIR = "$env:USERPROFILE\.claude"
$env:STAGE_DIR  = "$env:USERPROFILE\.claude\creds-staged"
New-Item -ItemType Directory -Force -Path $env:STAGE_DIR | Out-Null
```

---

## Per-account loop (repeat 3 times: tate, code, money)

Pick one account. Substitute `<ACCOUNT>` below (use `tate`, `code`, or `money` - the slug, not the email).

### 1. Nuke current auth state

```powershell
Remove-Item -Force "$env:CLAUDE_DIR\.credentials.json" -ErrorAction SilentlyContinue
Remove-Item -Force "$env:USERPROFILE\.claude.json" -ErrorAction SilentlyContinue
```

This guarantees no carry-over from the previous account.

### 2. Set the correct primary org in claude.ai web UI

This is the **load-bearing** step. The CLI login will bind the token to whatever org is your primary in the web UI when you sign in.

1. Open https://claude.ai in your default browser (the one Claude Code's OAuth flow will use).
2. Sign in as `<ACCOUNT>@ecodia.au` (full sign-out and sign-in if you were on a different account).
3. Click the workspace/org switcher (top-left, your initials/avatar).
4. Switch to the **personal** org for this account. Not "Ecodia (shared)" or any team workspace.
   - tate@ personal org should look like `Tate's workspace` (typically the one that says "Personal").
   - code@ personal org = the one created when code@ signed up, not any shared workspace it was invited to.
   - money@ personal org = `b61b5261-6768-4a9b-8b43-06bada28723a` based on the prior incident; verify it's the one showing 95% quota remaining.
5. Confirm the URL or footer shows the personal org is active.

### 3. Run `claude login` from PowerShell

```powershell
claude login
```

Browser opens. Authorise. You should land back on PowerShell with "Logged in" output.

### 4. Verify the token is bound to the right org (the step the prior bug hit)

```powershell
$creds = Get-Content "$env:CLAUDE_DIR\.credentials.json" | ConvertFrom-Json
$token = $creds.claudeAiOauth.accessToken
$claimedOrg = $creds.claudeAiOauth.organizationUuid

Write-Host "claimed org (from file): $claimedOrg"

# Ground truth - what does Anthropic actually charge against?
$response = Invoke-WebRequest -Uri "https://api.anthropic.com/v1/messages" `
  -Method POST `
  -Headers @{
    "Authorization" = "Bearer $token"
    "anthropic-version" = "2023-06-01"
    "content-type" = "application/json"
  } `
  -Body (@{
    model = "claude-haiku-4-5-20251001"
    max_tokens = 1
    messages = @(@{ role = "user"; content = "hi" })
  } | ConvertTo-Json) `
  -SkipHttpErrorCheck

$actualOrg = $response.Headers["anthropic-organization-id"]
Write-Host "actual org (from header): $actualOrg"

if ($claimedOrg -eq $actualOrg) {
    Write-Host "[OK] org binding matches" -ForegroundColor Green
} else {
    Write-Host "[FAIL] org mismatch - DO NOT STAGE THIS CREDENTIAL" -ForegroundColor Red
    Write-Host "Re-do step 2 (set primary org in claude.ai web UI), then redo step 3."
}
```

**Bar:** the `[OK]` line must appear. If `[FAIL]`, go back to step 2 - the web UI org switcher didn't take effect before login. Do not proceed until matched.

Also confirm the org in the header is a **personal org** for this account, not a shared/team org. If you have any doubt, paste the actual-org UUID and your account into a chat with me and I'll verify against what's expected.

### 5. Stage the bundle

```powershell
$accountSlug = "<ACCOUNT>"  # tate | code | money

# Bundle both .credentials.json AND the oauthAccount block from .claude.json
$claudeJson = Get-Content "$env:USERPROFILE\.claude.json" | ConvertFrom-Json
$bundle = @{
    account = "$accountSlug@ecodia.au"
    verified_at = (Get-Date).ToUniversalTime().ToString("o")
    organization_uuid_from_header = $actualOrg
    credentials = $creds
    oauthAccount = $claudeJson.oauthAccount
}
$bundle | ConvertTo-Json -Depth 10 | Set-Content "$env:STAGE_DIR\$accountSlug.json"

Write-Host "Staged: $env:STAGE_DIR\$accountSlug.json" -ForegroundColor Green
```

### 6. Repeat steps 1-5 for the other two accounts

After the third pass, you should have:

```
%USERPROFILE%\.claude\creds-staged\tate.json
%USERPROFILE%\.claude\creds-staged\code.json
%USERPROFILE%\.claude\creds-staged\money.json
```

Verify:

```powershell
ls "$env:STAGE_DIR"
```

Each file should be ~2-4 KB. Each should contain a `credentials.claudeAiOauth.accessToken` field and an `oauthAccount.emailAddress` matching the expected account.

---

## Verify staged bundles all probe successfully

After all three are staged, run:

```powershell
py "/Users/ecodia/.code/ecodiaos/backend/laptop-agent/account_rotator/rotator.py" --probe-only
```

Expected output: a table showing each account, its actual-org UUID, and current rate-limit headroom percentages. All three should report successfully. If any errors (401, 403, etc), that account's bundle is bad - re-do steps 1-5 for it.

---

## Manual rotation test (do this once before letting the timer take over)

Pick the account currently NOT active in `.credentials.json`. Run:

```powershell
py "/Users/ecodia/.code/ecodiaos/backend/laptop-agent/account_rotator/rotator.py" --force-rotate <ACCOUNT_SLUG>
```

This will:
1. Back up the current `.credentials.json` to `.credentials.json.bak`.
2. Swap in the staged bundle for the named account.
3. Patch the `oauthAccount` block in `.claude.json` to match.
4. Re-probe to confirm new active account is now bound to the expected org.
5. Write a rotation event to `~/.claude/account-rotator.log`.

**Verification after the manual swap:**
- Open a NEW Claude Code chat tab (Ctrl+Alt+Shift+C). The new tab should connect under the swapped-to account.
- Currently-open chat tabs (including this one) will still be on the previous account in memory - that's expected per the documented constraint.

If both behaviours hold, the rotator is correctly wired. You can then enable the autonomous 10-min loop (separate step, see `account-rotator-runtime.md` once shipped).

---

## Kill switch

Pause the rotator at any time:

```powershell
New-Item -ItemType File "$env:CLAUDE_DIR\account-rotator.disabled" -Force | Out-Null
```

Resume:

```powershell
Remove-Item "$env:CLAUDE_DIR\account-rotator.disabled"
```

The rotator checks this file at every tick before touching anything.

---

## Re-staging an individual account later

If one of the three accounts needs re-auth (token expired beyond refresh, password rotation, etc), repeat steps 1-5 for just that account. The other two stay valid. The rotator will skip the broken one until it's restaged.
