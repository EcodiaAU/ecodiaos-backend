# Release Walker - State Matrix Layer (2026-06-10)

Extends ARCHITECTURE.md (2026-06-09). That doc shipped the spec-driven walk +
detector taxonomy. This layer adds what the production brief demands: the
same flows exercised across the cross product of states customers actually
encounter, plus the exploration mode that doctrine
(`testing-harness-needs-exploration-layer-not-regression-only-2026-06-09`)
mandates and which never shipped in this tree.

Constraints inherited unchanged: local Mac execution, focusless
(emulator `-no-window`, headless simctl boot), findings to status_board,
walker never edits app code, ONE device per run.

---

## 1. THE NINE DIMENSIONS, HONESTLY TIERED

A dimension earns Tier 1 only when it is controllable purely from the device
side (adb / simctl / emulator console), with no app-code cooperation. Tier 2
needs either app-side debug hooks or extra tooling; those are designed here
and filed as status_board work, NOT faked.

| Dimension | Variants | Android primitive | iOS sim primitive | Tier |
|---|---|---|---|---|
| permission.<group> | granted, denied, never_asked | `pm grant` / `pm revoke` + `pm set-permission-flags <pkg> <perm> user-set user-fixed` / post-`pm clear` default | `simctl privacy <udid> grant/revoke/reset <service> <bundle>` | 1 |
| appearance | light, dark | `cmd uimode night no/yes` | `simctl ui <udid> appearance light/dark` | 1 |
| font_scale | 1.0, 1.3, 2.0 | `settings put system font_scale <x>` | `simctl ui <udid> content_size <size>` (maps 1.0->medium, 1.3->extra-large, 2.0->accessibility-extra-large) | 1 |
| network | online, offline, slow | offline: `svc wifi disable` + `svc data disable`; slow: `adb emu network speed edge` + `delay umts` (emulator console) | NONE. The iOS simulator shares the Mac NIC; no per-sim primitive exists. iOS network coverage arrives with the Tier-2 proxy. | 1 (android) / 2 (ios) |
| data_state | cold_clear, returning | cold_clear: `pm clear` pre-launch (existing behaviour); returning: skip the clear | returning: `simctl terminate` + relaunch. cold_clear needs the .app artifact to reinstall: spec field `ios_app_artifact`, applied when present | 1 (android) / 1.5 (ios) |
| auth_state | anon, authed | anon: cold_clear; authed: flow-seeded via spec `roles[].seed` + a signin form walk | same | 1.5 (needs per-app role seeding in spec) |
| api_response | 2xx, 4xx, 5xx, timeout, malformed | local reverse proxy (mitmproxy addon) + debug-build base-URL override per app | same | 2 |
| update_path | clean_install, post_update | archive previous released APK per app; install old -> exercise -> `adb install -r` new -> persistence probes | archive .app; `simctl install` over | 2 (needs artifact archive convention) |
| screen/device | per-AVD / per-sim | second AVD profile (small screen) | second sim (SE shape) | 2 (one device per run holds; matrix runs rotate devices across nights) |

Explicitly out (documented, not pretended): captive portal, IPv6-only,
low-memory jetsam, low-battery, RTL pseudo-locale, iCloud-restore. Each needs
lab tooling that does not exist on this substrate yet. They live in Section 7
as designed follow-ups with their blockers named.

Cross-platform parity is not a dimension; it is a comparator over the
both-platform run artifacts (Section 5).

## 2. SPEC SCHEMA EXTENSION

```yaml
matrix:
  permissions:                  # symbolic name -> concrete permission ids
    location:
      android: [android.permission.ACCESS_FINE_LOCATION, android.permission.ACCESS_COARSE_LOCATION]
      ios: location             # simctl privacy service name
  dimensions:                   # variant pools, referenced by flows
    permission.location: [granted, denied, never_asked]
    appearance: [light, dark]
    font_scale: ["1.0", "2.0"]
    network: [online, offline]
  flows:                        # which flows vary over which dimensions
    - flow: onboarding-to-discover-android
      vary: [permission.location, appearance, network]
      pairwise: true            # all-pairs reduction; false = full cross product
```

Semantics:
- A flow's authored expectations must hold in EVERY cell of its matrix. If a
  variant legitimately changes the expected surface (e.g. denied location
  shows an empty-state), the spec models that as a separate surface +
  separate flow, not a tolerated red.
- `data_state` is deliberately not varied on flows that walk onboarding:
  cold_clear is their premise. Returning-user landing gets its own flow
  anchored on `landing_after_onboarding` (the Locals cold-launch-routing bug
  class).
- Pairwise (all-pairs) is the default. Full cross product of
  3 permission x 2 appearance x 2 network x 2 font = 24 cells; all-pairs
  covers every 2-way interaction in ~6-8 cells. Every shipped bug in the
  brief's catalogue was a 1- or 2-way interaction (denied-location x
  Discover; dark-mode x map style; offline x Saved). Budget scales to depth:
  `--cells=N` caps, full product available per flow when a 3-way interaction
  is suspected.

## 3. EXECUTION MODEL

```
release-walk.sh <app> --platform=android --matrix [--cells=N]
  for each matrix flow:
    cells = pairwise(dimensions[vary])
    for each cell:
      CELL_DIR = runs/<run-id>/cells/<flow>/<cell-id>/   (a mini RUN_DIR)
      apply device-scope state   (appearance, font_scale, network)
      enumerate (single flow, WALKER_CELL_JSON exported)
        -> launch path applies app-scope state AFTER pm clear, BEFORE am start
           (permissions; pm clear resets grants, so ordering is load-bearing)
      run detectors with RUN_DIR=CELL_DIR (zero detector changes)
      aggregate CELL findings into master findings.jsonl with cell tag
  reset device state (appearance light, font 1.0, network online)  [trap'd]
```

State application is split by scope because `pm clear` wipes app-scope state:
- device-scope: once per cell, before the flow (survives pm clear)
- app-scope: re-applied inside every `launch` enter_via, after the clear

Reset discipline: the run ALWAYS exits through a trap that restores
appearance/font/network. A walker that leaves the shared emulator dark,
huge-font, and offline poisons the next run.

## 4. EXPLORATION MODE (the doctrine debt)

`release-walk.sh <app> --explore [--taps=40]` rebuilds the exploratory walker
INSIDE this tree (the 2026-06-09 session's walker never reached disk; the
patterns reference code that does not exist - that drift ends here).

Six baseline detectors per doctrine:
1. dead-tap: tapped a clickable node, hierarchy signature unchanged
2. nav-loop: forward-tap signature sequence cycles (A-B-A-B)
3. left-app: foreground package != app package after a tap (walker recovers
   via relaunch; finding records which element escaped)
4. tried-tap memory: (signature, element-key) pairs never re-tapped; also the
   walk's frontier definition
5. crash: pidof empty after action (relaunch + critical finding)
6. persist-probe: after the tap budget, run every spec `persistence:` claim
   (kill + relaunch, no clear, assert expected landing anchors)

Broken-image on native surfaces is NOT decidable from the AX hierarchy.
Exploration collects every new-signature screenshot into
`explore/screens/`; the conductor vision-judges the gallery per
`agent-is-the-vision-llm-not-parallel-api-2026-06-09`. The run report says
exactly that, instead of claiming a detector it does not have.

## 5. PARITY COMPARATOR (three-native apps)

`parity-check.sh <run-dir>` after `--platform=both`:
- For every spec surface with BOTH platform blocks: anchor presence per
  platform from the captured hierarchies. Anchor present on one platform,
  absent on the other -> parity finding (class=parity.divergence).
- Emits side-by-side screenshot pair list for conductor vision judgement
  (the mustard-pills-vs-red-dots class is visual, not structural).
- Per `cross-platform-parity-needs-explicit-verifier-2026-06-09`.

## 6. SCHEDULING (operator-away posture)

- Pre-ship gate: unchanged, `/release-walk <app>` invoked by conductor; now
  with `--matrix` as the default for release cuts.
- Nightly rotation cron (scheduler.cron, Mac-local worker): one app per
  night, 02:30 AEST, `--matrix --explore`, findings to status_board
  (priority=2, next_action_by=ecodiaos). The conductor triages next session;
  while Tate is offline for weeks the board accumulates triaged truth, not
  silence. Cron prompt carries full context per `cron-worker-prompt-template`.
- Run pruning: runs/ >7d deleted by the same cron.

## 7. TIER-2 LADDER (designed, filed, not faked)

1. api_response injection: mitmproxy addon (`fault-proxy.py`, this tree) +
   per-app debug-build base-URL override. App-side work, one row per app:
   read `WALKER_API_BASE` env (iOS sim: SIMCTL_CHILD_ env / Android: debug
   BuildConfig field). Until those ship, api_response cells are SKIPPED and
   the report says so.
2. update_path: artifact archive convention
   `~/.local/state/release-walker/artifacts/<app>/<version>/` populated by
   the ship recipes at release time; runner installs (n-1) then n.
3. iOS network: rides the same proxy (slow/timeout/offline emulated at HTTP
   layer); true airplane mode on sim does not exist.
4. token-expiry / stale-refresh auth states: proxy intercepts the refresh
   endpoint (401 injection) once api_response ships.
5. Small-screen device rotation: second AVD per app
   (e.g. locals_small_330dp), matrix rotates device per night.

## 8. WHAT GREEN MEANS NOW

A release-cut GREEN claim = regression flows GREEN across the matrix cells
+ exploration run completed with zero unresolved findings + parity check
clean (three-native) + the report names: flow count, cell count, dimensions
varied, taps explored, screens vision-judged, and the dimensions NOT covered
(Tier 2). Per `exploratory-walker-is-first-class-test-substrate-2026-06-09`,
GREEN binds to both layers, and the uncovered dimensions are named in the
verdict rather than silently absent.
