# Security: MacInCloud SSH credential in git history

**Severity:** Medium (credential is for MacInCloud SY094 - isolated build machine, not production database or payment processor)
**Detected:** 2026-05-17 by meta-loop routine
**Status:** Code fixed - credential rotation required by Tate

## What happened

Commit `7c0d164` on branch `claude/beautiful-tesla-nvK9r` introduced `scripts/sy094-ssh.py` with the MacInCloud SY094 SSH password hardcoded:

```python
PW = 'xve24085ehi'
```

This credential is now in the git history of this branch and on `origin/claude/beautiful-tesla-nvK9r`.

## Code fix (done this session)

`scripts/sy094-ssh.py` was updated to read the password from:
1. `MACINCLOUD_SSH_PW` env var (primary)
2. `kv_store.creds.macincloud.ssh_password` via DATABASE_URL + psycopg2 (fallback)

The hardcoded string is removed from the current file, but it remains in git history.

## Actions needed by Tate (cannot be done autonomously)

1. **Rotate the MacInCloud password.** Log into MacInCloud portal and change the SSH password for account user276189. Then update `kv_store.creds.macincloud.ssh_password` with the new value.

2. **Rewrite git history** (optional - medium effort, branch not yet merged to main). If the branch is never used again after merging, the exposure window is limited. If you want to scrub it:
   - `git filter-branch` or `git filter-repo --path scripts/sy094-ssh.py --invert-paths` + force push
   - Or squash-merge to main (discards the commit-level history)

3. **Check MacInCloud access logs** to see if any unauthorised SSH connections occurred since 2026-05-17.

## Risk assessment

- MacInCloud SY094 is a build machine only (Xcode, iOS apps). No production database access, no Stripe keys, no customer data.
- The credential is for SSH into an isolated MacInCloud VM, not a shared infrastructure host.
- Tate's Apple Developer team credentials (signing certs, ASC API key) are NOT exposed - those are stored as files on SY094 + kv_store, not in this script.
- Exposure window: from commit `7c0d164` (2026-05-17) until password is rotated.

## Cross-refs

- `~/ecodiaos/docs/secrets/macincloud.md` - canonical secret registry entry
- `~/ecodiaos/patterns/cred-rotation-must-propagate-to-all-consumers.md` - rotation checklist
- `scripts/sy094-ssh.py` - the fixed file
