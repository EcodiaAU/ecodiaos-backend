# Cowork account auto-revert: re-pin GUI macro SPEC (untested)

**Status:** `untested_spec` — DO NOT codify into `macro_runbooks` until validated by real run
**Authored:** 2026-05-01 by fork_mompruls_57d85f (24h probe synthesis)
**Companion:** status_board row 62f8c918-0822-4817-bc75-e57b23fb27f8
**Related Episode:** "Cowork account auto-revert 24h probe synthesis 1 May 2026"
**Cross-refs:**
- `~/ecodiaos/patterns/cowork-conductor-dispatch-protocol.md` (account-revert phenomenon)
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` (status discipline)
- `~/ecodiaos/scripts/cowork-dispatch` (`account-chip` subcommand already exists for detection)

---

## 1. Empirical findings (24h probe, 30 Apr 2026)

15 snapshots across kv_store key `cowork.account_revert.snapshots.*` between 2026-04-29T22:47Z and 2026-04-30T15:28Z (~17h actual coverage).

### Timeline
| UTC | Owner | Event | claude.exe |
|-----|-------|-------|------------|
| 29-04 22:47 | tate@ | baseline (REVERT, install identity) | 11 |
| 29-04 23:14 | tate@ | unchanged | 11 |
| 30-04 00:18 | code@ | **manual recovery tate→code** | 10 |
| 30-04 00:50 → 04:24 | code@ | HOLDING (~5 probes, ~4h) | 9-11 |
| **30-04 05:30** | **tate@** | **AUTO-REVERT code→tate** (cli-ops mtime 05:30:04Z aligned with flip; allowlist refreshed 03:56Z + 04:50Z; no Claude Desktop UI restart) | 10 |
| 30-04 06:00 | tate@ | Claude Desktop closed (proc count 10→0) | 0 |
| 30-04 06:32 → 07:35 | tate@ | HOLDING (Cowork service still running) | 0 |
| 30-04 10:15 | tate@ | server-side refresh at 08:45:49Z **confirmed tate@ rather than restoring code@** | 10 |
| 30-04 15:28 (= 1 May 01:28 AEST) | tate@ | held ~10h cumulative | 12 |

**Revert events**: 1 (code→tate at 05:30Z). 1 manual recovery (tate→code at 00:18Z, prior session).

---

## 2. Hypothesis verdict: CONFIRMED (H4 + H5)

**H4 — Single account-agnostic `oauth:tokenCache`:** Server-side refreshes (token + allowlist) consistently land on tate@. The 08:45:49Z refresh re-wrote `cowork-enabled-cli-ops.json` and **kept tate@** rather than restoring the manually-set code@. This means the canonical refresh-target is identity-stable to tate@, not session-derived.

**H5 — Initial-activation stickiness on tate@ (install 22 Feb 2026):** `hasTrackedInitialActivation=true` persists across the entire window, anchored to tate@. The "anchor identity" is tate@ because Claude Desktop was first activated under tate@ on Corazon.

### Mechanism
- Manual flip to code@ persists ONLY until next server-side token/allowlist refresh (~4-5h interval)
- Refresh resolves to canonical install identity (= tate@)
- After auto-revert, tate@ is sticky across all subsequent refreshes (no mechanism to re-flip to code@ except manual GUI action)
- Closing Claude Desktop UI does NOT reset state — `cowork-svc.exe` background service preserves owner across UI close/reopen

### Practical consequence
Any code@-required Cowork dispatch has a **soft TTL of ~4-5h** from the last manual flip. After that window, next dispatch lands on tate@ unless the conductor has re-pinned code@.

---

## 3. Re-pin macro SPEC (untested, do not ship)

### Goal
Detect revert state pre-dispatch and, if found, drive Claude Desktop GUI to flip owner back to code@ before the bounded Cowork step runs.

### Pre-conditions
- Corazon laptop-agent reachable (`/api/health` OK)
- Claude Desktop process running (`process.listProcesses` shows `claude.exe`); if not, launch first via `process.launchApp` or `input.shortcut [super]` + "claude" + enter
- `cowork-dispatch account-chip` subcommand returns owner identity from screenshot OCR (already exists, post-30 Apr ship)

### Step sequence (untested)
1. **Detect**: `cowork-dispatch account-chip` → parse identity from chip text. If owner == code@ ecodia.au, exit 0 (no-op).
2. **Open account switcher**: `screenshot.screenshot` → locate Claude Desktop top-right account chip → `input.click` at chip coordinates. Fallback: `input.shortcut [ctrl,shift,a]` (verify shortcut against current Claude Desktop build before relying on it).
3. **Wait for menu**: `cowork-dispatch wait 2`.
4. **Click code@ entry**: `screenshot.screenshot` → locate "code@ecodia.au" text in dropdown → `input.click` at text coordinates.
5. **Wait for switch**: `cowork-dispatch wait 5` (account switch + Cowork service rebind takes ~3-4s observed).
6. **Verify**: re-run `cowork-dispatch account-chip`. If still tate@, exit 1 and surface to status_board (manual intervention needed).
7. **Persist**: write `cowork.account_revert.last_repin_at_utc = NOW()` to kv_store for telemetry.

### Failure modes to test before codification
- **Windows Hello prompt at switch time**: account switch may trigger passkey re-auth. Use existing `cowork-dispatch step-with-passkey-watch` wrapper.
- **Dropdown coordinates drift across Claude Desktop versions**: prefer text-based location (OCR or accessibility tree) over pixel coordinates.
- **Multiple accounts with similar names**: explicit string match on `code@ecodia.au` (full email, not partial).
- **Account switch fails silently**: cli-ops file mtime should advance within 10s. If not, switch did not register.
- **Focus collision (Tate typing in EcodiaOS chat)**: pre-flight `cowork-dispatch foreground-check` per `cowork-no-focus-collision.md`.

### Validation protocol (when ready to ship)
Per `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md`:
1. Manually drive each step with `cowork-dispatch step "<step>"` + screenshot verification
2. Real end-to-end run against current revert state on Corazon
3. INSERT into `macro_runbooks` with `status='untested_spec'`
4. INSERT companion `runbook_validation_runs` row only after observed success
5. Flip status to `validated_v1` only via DB trigger gate (`trg_enforce_validated_v1_has_validation_run`)

---

## 4. Operational use pattern (when shipped)

### Reactive (post-revert detection)
Run as pre-flight before any Cowork dispatch that requires code@ identity:
```bash
~/ecodiaos/scripts/cowork-dispatch account-chip
# if revert detected → run re-pin macro → re-verify → proceed with dispatch
```

### Proactive (TTL-based)
Schedule cron at ~4h cadence (shorter than empirical 4-5h refresh interval):
- Detect: `cowork-dispatch account-chip`
- If revert: re-pin macro + telemetry write
- Cost: ~15s per run × 6 runs/day = 90s/day Corazon GUI time

### Post-flight verification
After every Cowork dispatch:
- `cowork-dispatch account-chip` to confirm owner did not flip mid-task
- If flipped during task: status_board row + re-run task on code@

---

## 5. Trade-offs vs. alternative paths

| Path | Effort | Robustness | Notes |
|------|--------|------------|-------|
| **GUI re-pin macro (this spec)** | M | M | Works against current Anthropic surface; brittle to Claude Desktop UI redesign |
| **Run Cowork on a fresh Corazon Windows user account where code@ is the install identity** | H | H | Eliminates root cause (anchor identity = code@). Requires new Windows profile + Tailscale setup + Cowork service install. One-time cost, durable result. |
| **Accept tate@ for Cowork; route code@ tasks elsewhere** | L | L | Punts the problem; doesn't solve dual-account dispatch capacity |
| **Wait for Anthropic to ship account-switcher API in Claude Desktop / Cowork dispatch** | 0 | 0 | Indefinite wait, not actionable |

**Recommendation:** macro SPEC stands as a stop-gap. Long-term fix is fresh-Windows-profile re-install with code@ as install identity (defer to when Cowork operational use justifies the setup cost). Tracked separately as future status_board candidate.

---

## 6. What this spec does NOT do (per brief constraints)

- Does NOT INSERT into `macro_runbooks`
- Does NOT ship code or schedule cron
- Does NOT contact Tate
- Does NOT resume the paused probe cron (Option A path: probe data is sufficient, no further collection needed unless Anthropic ships a Claude Desktop change that invalidates this synthesis)

---

## 7. Next-step gates

Before shipping the macro:
1. **Live operational demand**: at least one queued code@-only Cowork dispatch in the next 7 days that is blocked by revert state. Without demand, this spec stays archived.
2. **Validation run**: real end-to-end test against current Corazon state.
3. **Macro_runbooks INSERT**: per validation protocol above.
4. **PreToolUse hook hint**: optional cross-ref from `cowork-conductor-dispatch-protocol.md` Step 4 (Dispatch toggle) → "if owner==tate@, run re-pin macro before proceeding".

End of spec.
