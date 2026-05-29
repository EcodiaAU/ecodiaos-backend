---
triggers: cleanup-orphan-workers, leak-then-sweep, self-healing, audit-fix-validated, c1-loadworkerregistry, c2-tabindex-label-gate, c3-scheduler-interval, dispatch-orphan, refuse-and-leak, autonomous-collection, tabindex-sentinel-strategy, sweep-substrate, orphan-tab-self-heal, hardened-close-path
---

# cleanup_orphan_workers validates the leak-then-sweep substrate by self-healing dispatch orphans with zero human input

The 2026-05-29 ultracode-audit fix batch (commit ecf62ed eos-laptop-agent) had a posture choice baked into it: **refuse-and-leak** at close time, then collect leaked tabs later via a scheduled sweep. The choice is only safe if the sweep actually runs and actually finds + closes the right orphan tabs without wrong-closing live siblings.

Validated in production 2026-05-29T06:36Z when a dispatch under 90%+ memory pressure orphaned (worker model never booted, never sent first coord.* call, 180s ack timeout fired). The orphan worker registry row had:
- `terminated_reason: stale_heartbeat`
- `tab_handle: {sentinel_prefix: "[EOS-W-e44a5df0]", viewColumn: 1, viewType: CC chat, tabIndex: 2, captured_via: count_delta_plus_active}`

Then `cleanup_orphan_workers` (wired to scheduler.start at 7min interval per C3) fired:
- `closed_tab_ok: True`
- `closed_tab_strategy: cleanup_orphan:tabIndex+sentinel`

Zero human input. The substrate healed an orphan it had never been told about.

## What the strategy `tabIndex+sentinel` proves

That combined-match string is the C2-hardened tier (a) firing in production: the sweep accepted the tab at `group.tabs[storedTabIndex]` ONLY because BOTH the position matched AND the live label still started with the stored sentinel prefix. If position alone had matched (the pre-C2 behaviour), the sweep would have wrong-closed whatever live CC chat happened to occupy index 2 at that moment.

## The full value chain (C1 + C2 + C3) validated end-to-end

- **C1** (`coord.loadWorkerRegistry`): sweep loaded the orphan's tab_handle from `coordination/workers/<tab_id>.json` on disk - the pre-C1 lookup path returned null because `coord._loadWorkerRegistry` was never exported, so every sweep call before this fix returned `no_safe_tab_handle_or_incomplete`. The sweep COULD NOT WORK before C1.
- **C2** (label-gated tabIndex): the combo strategy `tabIndex+sentinel` proves the position-match was confirmed by a label-prefix check before accepting. Pre-C2 tier (a) was identity-blind.
- **C3** (scheduler interval): the sweep fired autonomously on the 7min tick. Pre-C3 it was wired to nothing and never ran.

## How to apply

When designing close paths for any future agent-owned UI lifecycle, the leak-then-sweep posture is the right default IF AND ONLY IF the sweep substrate is on a real schedule, can load handles from durable storage (not in-memory only), and matches by combined identity (not position alone). Without any of those three, leak-then-sweep degenerates into leak-then-leak-forever or leak-then-wrong-close.

The C1+C2+C3 triad is the minimum substrate. Test the value chain in adversarial conditions (memory pressure, tab churn, parallel chats) before declaring the close path safe.

## Verification

`tail D:/.code/EcodiaOS/coordination/workers/tab_1780036381180_e44a5df0.json` shows the validated registry row. Scheduler interval defined in `tools/scheduler.js:CLEANUP_ORPHAN_INTERVAL_MS = 7 * 60 * 1000`. Match strategy logged in `cowork.cleanup_orphan_workers` Pass 1 + `coord.close_my_tab` tier (a) + `cowork.kill_worker` tier (a).

Companion test harness `test-close-path-ladder.js` (9 cases, all pass) covers the three-tier precedence + the refuse-and-leak invariant against a stubbed ide module.

## Anti-patterns

- Wiring `cleanup_orphan_workers` only as an MCP-callable tool with no scheduler interval. Means it only runs if a human calls it.
- Looking up tab handles from an in-memory Map only. Cross-process dispatch breaks that lookup; needs disk fallback.
- Accepting a tabIndex match on `viewType === CC chat` alone. Position drifts; identity needs a second-axis confirmation (label OR sentinel).
- Treating a refuse-and-leak as a failure mode. It is the SAFE failure mode. The sweep catches it.

## Origin

2026-05-29. The ultracode adversarial audit (`backend/drafts/ultracode-scheduler-coord-audit-2026-05-29.md`) caught all three Cs as silent regressions in earlier hardening commits. Same-day fix batch shipped as ecf62ed, validated as the leak-then-sweep substrate self-healing a real dispatch orphan that evening.

Cross-refs:
- [[scheduling-is-0th-class-primitive-2026-05-28]] - the substrate this close path serves
- [[cc-webview-chat-input-and-submit-unreachable-from-extension-host-2026-05-29]] - the spawn-side gap that generates the orphans this sweep catches
- [[vs-code-webview-tabs-have-no-stable-id-pin-label-or-leak-2026-05-28]] - the architectural finding that motivated leak-over-wrong-close
- [[cowork-kill-worker-tab-handle-from-foreground-after-spawn-is-unsafe-2026-05-28]] - the earlier mass-close incident that started this whole arc
- [[verify-deployed-state-against-narrated-state]] - the audit pattern that surfaced the silent regressions
