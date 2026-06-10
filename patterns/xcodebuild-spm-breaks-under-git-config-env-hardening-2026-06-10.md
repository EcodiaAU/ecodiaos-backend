---
triggers: xcodebuild spm fail, cannot use bare repository, safe.bareRepository explicit, could not resolve package dependencies, swiftpm bare repo, capacitor-swift-pm resolve fail, xcodebuild sim build fail mac, GIT_CONFIG_COUNT xcodebuild, goodreach sim build, spm dependency resolution git error
priority: high
canonical: true
binding: reference-only
---

# xcodebuild SPM resolution fails under the GIT_CONFIG env hardening; strip the env for the build invocation

## 1. The rule

When xcodebuild dies with `Could not resolve package dependencies` and
`fatal: cannot use bare repository ... (safe.bareRepository is 'explicit')`,
the cause is the mac-org git hardening injected via `GIT_CONFIG_COUNT` /
`GIT_CONFIG_KEY_0=safe.bareRepository` environment variables, which SwiftPM's
git subprocesses inherit. SwiftPM's package caches ARE bare repositories.
Fix per invocation, never globally:

```bash
env -u GIT_CONFIG_COUNT -u GIT_CONFIG_KEY_0 -u GIT_CONFIG_VALUE_0 \
  GIT_CONFIG_GLOBAL=/dev/null \
  xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

## 2. Why

Goodreach's first Mac-local sim build (2026-06-10) failed twice on this.
Attempt 1: raw xcodebuild, SPM fatal on the capacitor-swift-pm cache.
Attempt 2: `GIT_CONFIG_GLOBAL=/dev/null` alone STILL failed, because
`git config --get --show-origin safe.bareRepository` showed origin
`command line:` - the setting rides env vars, not ~/.gitconfig, so nulling
the file changes nothing. Attempt 3 with the env vars stripped:
BUILD SUCCEEDED, app installed and launched on the sim. The hardening
itself stays intact for every other process; only the build subprocess
tree opts out.

## 3. How to apply

- Diagnose with `git config --get --show-origin safe.bareRepository`:
  origin `command line:` means env-injected; grep `env | grep GIT_CONFIG`
  to see the triple.
- Wrap ONLY the xcodebuild/SPM invocation. Do not unset the vars in the
  shell profile and do not write safe.bareRepository=all anywhere durable;
  the hardening exists to stop bare-repo config-injection attacks.
- Sim builds need no signing: `CODE_SIGNING_ALLOWED=NO` avoids the
  keychain entirely.
- Applies to any SPM project on this Mac: goodreach, coexist (Capacitor 8
  SPM), glovebox-ios, context.

## 4. Anti-patterns

- Re-running with a longer wait or a clean DerivedData: resolution fails
  identically; the error is environmental, not cache corruption.
- Removing the hardening globally to make one build pass.
- Concluding the global gitconfig is at fault when show-origin says
  `command line:`.

## 5. Cross-references

- [[mac-local-headless-ios-ship-via-asc-api-2026-06-08]]
- [[capacitor-plugin-spm-support]] (skill)
- backend/patterns/mac-organisation-and-branch-thrash notes (origin of the
  hardening)

## 6. Origin

2026-06-10 Goodreach first sim build, three attempts; before fix: SPM
fatal on attempts 1 and 2 / after fix: BUILD SUCCEEDED and
`GOODREACH LAUNCHED ON SIM` (pid 97740) on attempt 3.
