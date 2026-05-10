---
triggers: cross-implementation-script-pair, hmac-awk-nf, libressl-vs-openssl, fix-applied-to-one-script-not-the-pair, sibling-script-drift, openssl-output-format-difference, macos-libressl, gnu-openssl, awk-print-2-vs-nf, imessage-watcher-hmac-bug, sibling-watcher-bug, fork-fix-only-half-the-pair, watcher-pair-asymmetry, listener-pipeline-five-layer-verification-script-instance
---

# Cross-implementation script pair must stay in sync on fixes

## Rule

When a bug is fixed in one script of a paired set (inbound watcher + outbound watcher, sender + receiver, encoder + decoder, signer + verifier), the fix MUST be propagated to every sibling that performs the same primitive. Otherwise the pair drifts: one half works, the other silently fails on the same upstream cause.

## Concrete origin (9 May 2026)

iMessage watcher pair on SY094:
- `~/.bin/imessage-outbound-watcher.sh` line 26 — patched 7 May 2026 (fork_moutg6ld_898d58) from `awk '{print $2}'` to `awk '{print $NF}'` because macOS LibreSSL outputs `<hex>` (1 field) while GNU OpenSSL on Linux outputs `(stdin)= <hex>` (2 fields). `$2` returns empty on macOS → empty signature → 401.
- `~/.bin/imessage-watcher.sh` (inbound) line 21 — STILL had `awk '{print $2}'` 9 days later. Every inbound POST since 7 May has carried an empty `X-Imessage-Signature` header → server rejected with HTTP 400/401. Surfaced via `/tmp/imessage-watcher.err` showing 80+ consecutive 400s and finally a 401, never an HMAC success.

The outbound script's own comment names the bug class verbatim: "awk $NF (last field) instead of $2 because LibreSSL on macOS outputs just '<hex>' (single field) while GNU OpenSSL on Linux outputs '(stdin)= <hex>' (two fields). $NF works for both."

Same author, same shell language, same failure-mode comment in the codebase, fix landed in only one of the two files. Pair drifted for 9 days, masked by the Twilio fallback being automatic.

## Do

- When fixing a primitive (HMAC sig, JSON parse, retry policy, env loader, log format, secret read), grep the repo for the same primitive in every sibling script before declaring the fix complete:
  ```bash
  grep -rn "openssl dgst -sha256 -hmac" ~/.bin/
  grep -rn "openssl dgst -sha256 -hmac" ~/ecodiaos/scripts/
  ```
- For watcher-pair primitives, write the fix as a sourced helper (`source ~/.bin/lib/hmac.sh`) so future divergence is structurally impossible.
- When authoring the second script of a pair, copy the first verbatim and edit only the deltas (URL, payload shape) — never re-derive primitives from memory.
- Land both scripts in the same commit when a primitive is patched. Single-script commits to a known-pair are a code smell.
- Listener-pipeline five-layer verification (`listener-pipeline-needs-five-layer-verification.md`) MUST run on each script of a pair separately — green on outbound does not imply green on inbound.

## Do not

- Patch one half of a pair and assume the comment "this fix applies wherever HMAC happens" is enforced. It isn't.
- Trust per-script unit tests over end-to-end live verification — sibling drift only shows up when production traffic hits both paths.
- Use grep on `awk '{print $NF}'` (the fixed form) to find unpatched call sites — you'll miss them. Grep the buggy primitive instead.

## Verification protocol

After patching primitive X in script A:
1. `grep -rn "<primitive-X buggy form>" <repo or directory>` — must return zero matches OR list of every sibling needing the same patch.
2. Patch every sibling in the same arc.
3. Run end-to-end live verification on each sibling separately (POST a real payload, observe 2xx response, observe DB row landed). Green on the patched original is not transitive.
4. Commit all sibling patches together with a "Co-fix: <sibling-paths>" trailer in the commit message.

## Cross-references

- `~/ecodiaos/patterns/listener-pipeline-needs-five-layer-verification.md` — sibling-pair drift is a class of layer-4 failure (signature/encoding) that survives upstream all-green when only one sibling was tested.
- `~/ecodiaos/patterns/imessage-is-primary-contact-channel-to-tate.md` — the substrate where this drift was caught.
- `~/ecodiaos/patterns/macincloud-substrate-selection-ssh-vs-rdp.md` — patching from SSH worked here; the watcher's *runtime* environment was the GUI-required half.
- `~/ecodiaos/patterns/discovery-to-doctrine-same-turn.md` — fix lands AND doctrine lands in the same arc.

## Origin

2026-05-09 23:05 AEST. Fork `fork_moyczp7o_1dcf2b` probing 46-cycle iMessage health canary degradation. Outbound failed via TCC AppleEvents denial (class b/e); inbound failed via stale HMAC `awk '{print $2}'` that the 7 May fork had patched in the sibling outbound script and not propagated. 9-day silent failure window because Twilio SMS fallback auto-fires whenever the iMessage path is degraded, hiding the issue from operator-visible signal.
