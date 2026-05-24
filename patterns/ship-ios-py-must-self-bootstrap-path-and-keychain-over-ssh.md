---
name: ship-ios-py-must-self-bootstrap-path-and-keychain-over-ssh
triggers: ship-ios.py, ship-ios, ssh-headless-build, npm-not-found-over-ssh, pod-not-found-over-ssh, errSecInternalComponent, codesign-over-ssh, macincloud-ssh-build, ios-headless-archive, KEYCHAIN_PASSWORD, nvm-not-on-ssh-path, homebrew-not-on-ssh-path
status: active
authored_at: 2026-05-24
---

# ship-ios.py over SSH must self-bootstrap PATH and KEYCHAIN_PASSWORD

## Rule

`scripts/ship-ios.py` runs on SY094 in two contexts: (1) interactive RDP terminal where `~/.zshrc` has already exported nvm + homebrew + keychain unlock, and (2) **non-interactive SSH** (`ssh user276189@sy094 'python3 ~/asc-scripts/ship-ios.py <slug>'`) where neither has happened. The script must work in **both** contexts without a wrapper.

The two traps that recur on every iOS ship over SSH:

1. **PATH missing.** `/bin/sh` (the shell `subprocess.run(shell=True)` invokes) gets no nvm-loaded PATH and no `/opt/homebrew/bin`. First failure mode: `npm: command not found` at step [4]. Second: `pod: command not found` during `npx cap sync ios`. Sometimes also: `xcrun altool` (less common - Xcode tools are on the system PATH).
2. **Login keychain locked.** `codesign` needs the login keychain unlocked to read the signing identity. Over SSH the keychain is locked. Without `KEYCHAIN_PASSWORD` the archive step fails with the cryptic `errSecInternalComponent` from `Security.framework`, NOT a clear "keychain locked" message.

## Why ship-ios.py owns the fix, not the caller

Per `~/ecodiaos/patterns/recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18.md`, the fix lives in the closest substrate. The caller (any conductor or Routine dispatching an iOS ship) should not need to remember:

```bash
ssh user276189@sy094 "export PATH=\$HOME/.nvm/versions/node/v22.22.3/bin:/opt/homebrew/bin:\$HOME/opt/node/bin:\$HOME/.gem/ruby/2.6.0/bin:\$HOME/bin:\$PATH; export KEYCHAIN_PASSWORD='$(...)'; python3 ~/asc-scripts/ship-ios.py <slug>"
```

That command is fragile (every new app, every refresh of nvm node version, every caller-context reinvents it). The diagnosis pattern repeated twice on 2026-05-24 (Glovebox/Roam ship) - once each for PATH and keychain - burning 2 round-trips before the conductor reached for the wrapper.

## What ship-ios.py now does

Added two helpers at the top of `main()`:

```python
def bootstrap_ssh_path():
    """SSH non-interactive shells skip ~/.zshrc, so nvm + homebrew aren't on
    PATH. The shell-out subprocesses (`npm`, `pod`, `xcrun`) inherit our PATH,
    so we patch it once here. Idempotent: re-prepending the same dir is fine.
    """
    extra = []
    nvm_nodes = sorted(glob.glob(os.path.expanduser('~/.nvm/versions/node/v*/bin')))
    if nvm_nodes:
        extra.append(nvm_nodes[-1])  # highest version
    for p in ('/opt/homebrew/bin', '/usr/local/bin',
              os.path.expanduser('~/opt/node/bin'),
              os.path.expanduser('~/.gem/ruby/2.6.0/bin')):
        if os.path.isdir(p):
            extra.append(p)
    if extra:
        os.environ['PATH'] = ':'.join(extra + [os.environ.get('PATH', '')])


def ensure_keychain_password():
    """KEYCHAIN_PASSWORD over SSH or codesign throws errSecInternalComponent.
    If not in env, try VPS kv_store via SSH (creds.macincloud.password).
    """
    if os.environ.get('KEYCHAIN_PASSWORD'):
        return
    vps_alias = os.environ.get('ECODIAOS_VPS_SSH', 'tate@100.103.227.90')
    fetch = (
        f"ssh -o BatchMode=yes -o ConnectTimeout=8 {vps_alias} "
        "'set -a; . ~/ecodiaos/.env 2>/dev/null; set +a; "
        "curl -s \"$SUPABASE_URL/rest/v1/kv_store?key=eq.creds.macincloud&select=value\" "
        "-H \"apikey: $SUPABASE_SERVICE_KEY\" -H \"Authorization: Bearer $SUPABASE_SERVICE_KEY\"'"
    )
    try:
        r = subprocess.run(fetch, shell=True, capture_output=True, text=True, timeout=15)
        data = json.loads(r.stdout)
        v = data[0]['value']
        if isinstance(v, str):
            v = json.loads(v)
        pw = v.get('password')
        if pw:
            os.environ['KEYCHAIN_PASSWORD'] = pw
            print(f"[keychain] auto-loaded password from VPS kv_store ({len(pw)} chars)")
    except Exception as e:
        print(f"[keychain] WARN: could not auto-load password ({e}); codesign may fail")
```

Both are called as the first two lines of `main()` before `load_spec()`. The PATH helper is **idempotent and harmless** when invoked from an interactive shell that already has the dirs (just re-prepends). The keychain helper short-circuits on `KEYCHAIN_PASSWORD` already set.

## Do

- Run from any context: `ssh user276189@sy094 'python3 ~/asc-scripts/ship-ios.py glovebox'` - no PATH or env preamble needed.
- Override the VPS SSH alias via `ECODIAOS_VPS_SSH` if the keychain auto-fetch needs to talk to a different host.
- When updating `D:/.code/EcodiaOS/backend/scripts/ship-ios.py`, scp the same file to `user276189@sy094.macincloud.com:~/asc-scripts/ship-ios.py` - the SY094 copy is the runtime; the EcodiaOS-backend copy is the source.

## Do NOT

- Add the PATH export as a caller-side wrapper string in any conductor doctrine or Routine prompt. The fix is in the script.
- Catch `errSecInternalComponent` higher up and retry without unlock - the keychain genuinely needs the password.
- Cache `KEYCHAIN_PASSWORD` to a local file on SY094 (Tate's machine; secrets stay in kv_store).

## Verification

After editing the script:
1. `python3 -m py_compile D:/.code/EcodiaOS/backend/scripts/ship-ios.py` - syntax clean.
2. `scp` to SY094.
3. `ssh user276189@sy094.macincloud.com 'python3 ~/asc-scripts/ship-ios.py --help'` - succeeds with helper output.
4. End-to-end smoke is the next real ship.

## Cross-refs

- `~/ecodiaos/patterns/macincloud-substrate-selection-ssh-vs-rdp.md` - the parent doctrine on SSH-headless vs RDP-GUI work on SY094. This pattern is a concrete instantiation of the "SSH-headless work" half.
- `~/ecodiaos/patterns/recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18.md` - the meta-doctrine that says: helper, hook, doctrine all SAME-TURN. This pattern is the helper + doctrine legs; no hook is needed because the trap is contained inside the script (not a recurring pattern across many tools).
- `~/ecodiaos/patterns/sy094-eos-mobile-headless-ship-recipe.md` - the original headless-ship pattern, predates `ship-ios.py` universal driver.
- `~/ecodiaos/patterns/ios-app-asc-headless-ship-protocol.md` - the protocol `ship-ios.py` implements.

## Origin

2026-05-24 Glovebox (ex-Roam) TestFlight ship. First SSH-only invocation by the Corazon conductor (Tate verbatim "ship a new tf version of the app so i can see it"). Two round-trips were burned: first on `npm: command not found`, second on `errSecInternalComponent`. Both already documented as known constraints in the macincloud-substrate-selection pattern, but the failure mode was "ship-ios.py works fine but only if caller does the right preamble." This pattern moves the responsibility into the script so future iOS ships across any app (coexist, chambers, goodreach, glovebox, eos-mobile) just work over SSH without ceremony.
