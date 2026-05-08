---
triggers: claude-agent-sdk, sdk-binary, musl, glibc, ld-musl-x86_64, optionalDependencies, native-cli-not-found, fork-dispatch-broken, claude-code-binary, pathToClaudeCodeExecutable, CLAUDE_CODE_EXECUTABLE, B7-resolver, sdk-platform-binary, binary-not-found-but-exists, exec-enoent-musl
status: active
---

# Anthropic SDK musl-vs-glibc binary auto-detect trap

## Rule

**Every `query()` / streaming-session call against `@anthropic-ai/claude-agent-sdk` MUST pass an explicit `pathToClaudeCodeExecutable`** that resolves to the glibc binary (or `process.env.CLAUDE_CODE_EXECUTABLE` set globally). Never rely on the SDK's auto-detect.

The SDK's `B7()` resolver in `sdk.mjs` tries packages in this order on Linux:

```js
[`@anthropic-ai/claude-agent-sdk-linux-${arch}-musl`, `@anthropic-ai/claude-agent-sdk-linux-${arch}`]
```

It tries `linux-x64-musl` FIRST. If both `optionalDependencies` resolved (a normal `npm install` outcome), the musl variant wins. On a glibc system (Ubuntu, Debian, RHEL, Amazon Linux, our DigitalOcean VPS), the musl binary fails to execute because its dynamic linker `/lib/ld-musl-x86_64.so.1` doesn't exist. Linux exec(2) returns ENOENT, the SDK reports "Claude Code native binary not found at ..." even though the file is on disk and 244MB.

## Symptom signature

- Forks abort within ~35ms of spawn
- abort_reason: `"Claude Code native binary not found at /home/tate/ecodiaos/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude. Please ensure Claude Code is installed via native installer or specify a valid path with options.pathToClaudeCodeExecutable."`
- The file at that path EXISTS (244MB ELF), but `ldd` shows it wants `/lib/ld-musl-x86_64.so.1`
- `<binary> --version` from a shell returns: `cannot execute: required file not found`
- `file <binary>` shows interpreter `/lib/ld-musl-x86_64.so.1`

## Verification

```bash
# Both packages installed?
ls /home/tate/ecodiaos/node_modules/@anthropic-ai/ | grep claude-agent-sdk-linux

# Which interpreter?
file node_modules/@anthropic-ai/claude-agent-sdk-linux-x64*/claude

# Glibc version (host)?
ldd --version | head -1

# Direct execution test
node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude --version       # works on glibc
node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude --version  # ENOENT on glibc
```

## Do

- Pass `pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_EXECUTABLE || '/home/tate/ecodiaos/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude'` on EVERY SDK `query({ options })` call site. Today: `forkService.js`, `voiceRelay.js`, `osSessionService.js`, `rescueRunner.js`. Any new call site added later MUST also include the override.
- Set `CLAUDE_CODE_EXECUTABLE=/home/tate/ecodiaos/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude` in `ecosystem.config.js` env block (belt-and-braces).
- After any `npm install` / `npm update` / SDK version bump, re-run the verification block above before declaring the upgrade clean.

## Do not

- Trust SDK auto-detect on Linux glibc hosts. The musl-first ordering in `B7()` is silent.
- Delete the musl `node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/` directory as a fix - it will reappear on the next `npm install` because it's an `optionalDependencies` entry in the SDK's own `package.json`.
- Use `--omit=optional` on `npm install` - the SDK's installation throws on `iz` constructor when no native binary resolves.

## Why this trap recurs

`optionalDependencies` is the npm mechanism for platform-specific packages. The SDK ships variants:

```
@anthropic-ai/claude-agent-sdk-linux-x64       # glibc
@anthropic-ai/claude-agent-sdk-linux-x64-musl  # musl
@anthropic-ai/claude-agent-sdk-darwin-x64
@anthropic-ai/claude-agent-sdk-darwin-arm64
@anthropic-ai/claude-agent-sdk-win32-x64
```

npm installs ALL whose `os`/`cpu`/`libc` constraints can match. On Linux x64, both musl and glibc variants get installed (npm doesn't sniff host libc reliably; `libc` in `package.json` is advisory). The SDK's `B7()` then tries musl first by code order. Result: glibc hosts execute the musl binary.

## Origin

8 May 2026 ~08:26 - 08:39 AEST. SDK auto-upgraded from 0.2.121 to 0.2.132 (or `npm install` re-resolved the optional deps) and the `linux-x64-musl` package landed in node_modules at 08:26. Every fork dispatch from 08:24 onwards aborted in ~35ms with "Claude Code native binary not found":

- fork_mownh0gr_794763 (W4 visual-smoke) - crashed mid-run during ecodia-api restart
- fork_mownfs10_5694cb (W3 frontend voice page) - crashed mid-run
- fork_mownmopm_783da8 (voice-pipeline-W3-recovery) - errored at spawn
- fork_mownor0p_611db7 (telemetry-consumer cron) - errored at spawn
- fork_mownwdae_be8093 (P0 emergency fix-fork) - errored at spawn (the recovery fork itself failed)

Tate diagnosed and shipped commit `2980601` at 08:39:52 UTC. ecodia-api PM2-restarted at 08:39:54 and picked up the fix. P0 recovery fork `fork_mowo2sm7_929861` confirmed the resolution by running successfully and authoring this doctrine.

The recovery-fork-itself-failed dynamic is the meta-lesson: when the diagnostic substrate depends on the broken substrate, escalation must route around it. Here, Tate's hands closed the loop manually because no fork could.

## Cross-refs

- `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md` - the abort_reason text said "binary not found" but the file existed; ground-truth probe (`file`, direct exec) revealed the interpreter mismatch.
- `~/ecodiaos/patterns/ensure-deps-must-recompute-hash-post-install-not-pre.md` - sibling pattern on dep-install correctness invariants.
- `~/ecodiaos/patterns/conductor-takes-agency-on-recovery-not-tate.md` - intended posture; this incident broke it (recovery fork couldn't run, so Tate had to). When the recovery substrate IS the broken substrate, escalation is the correct routing.
