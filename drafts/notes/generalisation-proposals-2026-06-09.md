# Generalisation proposals from the 2026-06-09 sunday-doctrine-synthesis fire

Authored 2026-06-09 17:42 AEST by the consolidated sunday-doctrine-synthesis cron worker (task 31450328).

The generalisation engine looks at specific-incident patterns (those with a YYYY-MM-DD suffix or a single client/service name) and asks: is there a general-form rule that covers the incident plus N adjacent cases that have not yet shown up?

Each proposal lists the specific anchor, the proposed general form, the adjacent cases it should cover, and a confidence note. Drafts only. Adoption is a separate codification step.

## P1 - claims-grep-verified-against-codebase-before-send

Anchor: `patterns/apple-store-claims-must-be-grep-verified-against-codebase-before-send-2026-06-09.md`. Chambers ASC reply asserted "no in-app purchase, all B2B contracts" and the reviewer found a Stripe checkout button in the live build within 53 minutes. The pattern restricts to Apple App Store Resolution Center.

Proposed general form: `external-claims-about-codebase-must-be-grep-verified-before-send-2026-06-09.md`.

Rule: Any claim made to a regulator, reviewer, vendor, client, or counterparty about the codebase's behaviour MUST be grep-verified against the deployed surface before the claim leaves Ecodia. The claim is a substrate write under `verify-deployed-state-against-narrated-state`; the only thing that distinguishes "narrated to a human reviewer" from "narrated to ourselves" is the cost of being wrong. The cost is higher for human reviewers.

Adjacent cases this would cover:
- Play Store Console reply about user data handling.
- ATO BAS lodgement assertions about GST status of specific transactions.
- ASIC director declaration about share structure.
- An invoice cover note that asserts "scope X was delivered" when only X-prime was.
- A Tate-presented spec update that asserts "feature Y is wired" when it is on disk but unrouted.

Confidence: high. The general form is already implicit in `verify-deployed-state-against-narrated-state` but the Apple-specific incident shows the human-reviewer surface has a tighter feedback loop than the machine surface (53-minute auto-bounce in the Apple case).

## P2 - tool-payload-status-must-survive-channel-translation

Anchor: `patterns/scheduler-signal-done-status-must-survive-coord-to-inbox-2026-06-09.md`. The success/failed status field in coord.signal_done was being stripped during the coord-to-inbox relay, causing every cron to look failed even when work landed.

Proposed general form: `tool-payload-status-fields-must-survive-channel-translation-2026-06-09.md`.

Rule: When a tool call carries a load-bearing status enum (success, failed, partial, retry) across a relay layer (coord-to-inbox, MCP-to-bus, queue-to-worker), the relay MUST preserve the field verbatim. A relay that drops, defaults, or remaps the field is a misclassification engine. The fix is to relay the entire payload as an opaque body, not pick fields by name.

Adjacent cases this would cover:
- HTTP-to-MCP bridges that drop response status codes when wrapping JSON-RPC.
- Stripe webhook fan-out where `event.type` survives but `event.data.object.status` does not.
- Status board updates routed through email or SMS where the substrate enum loses fidelity.
- Scheduler-to-status-board completion writes where a worker says "failed" but the scheduler records "completed".

Confidence: high. The signal-done case is the third instance of this shape inside scheduler substrate alone (worker-tab-self-closes, success-summary-leaks-to-last_error, signal-done-coord-strip).

## P3 - mcp-connector-not-mounted-implies-substrate-fallback

Anchor: `patterns/gmail-inbox-poll-worker-tabs-need-direct-node-fallback-or-comms-connector-2026-06-09.md`. cowork.dispatch_worker tabs inherit the conductor's MCP set from `backend/.mcp.json`. If a cron brief calls a connector not in that file, the call 404s silently. Fix was a direct node fallback path.

Proposed general form: `mcp-connector-coverage-mismatch-requires-substrate-fallback-2026-06-09.md`.

Rule: Before authoring a cron brief that calls an MCP connector, audit `backend/.mcp.json` to confirm the connector is mounted. If not, EITHER mount it OR specify a non-MCP fallback substrate (direct node script with a documented credential path, supabase-postgres direct, kv_store retrieval). A brief that assumes a connector without verification will silently degrade in the worker tab.

Adjacent cases this would cover:
- A cron that calls `ecodia-money` connector tools when only `ecodia-core` is mounted.
- A cron that calls `ecodia-graph` Neo4j when only the core neo4j_search is exposed.
- Any worker brief that names an MCP server by short alias without verifying the mount.
- The deprecated `ecodia-full` calls that still exist in older cron briefs.

Confidence: medium. The general form exists but worker-brief authoring rarely checks the .mcp.json mount, which is the root cause.

## P4 - cdp-tab-focus-discipline

Anchor: `patterns/cdp-tab-focus-steal-banned-batch-one-burst-2026-06-09.md`. Hitting `POST /json/activate/{targetId}` per click steals focus from Tate. The rule is: one coordinated foreground burst at wizard start, all clicks chained inside the window.

Proposed general form: `shared-resource-foreground-activation-must-be-batched-2026-06-09.md`.

Rule: Any operation that contends with Tate for a shared physical resource (Chrome focus, the Mac keyboard, the iOS simulator, the Xcode signing dialog) must be batched into one coordinated foreground window rather than activated per-click. Mid-task focus theft is an autonomy regression.

Adjacent cases this would cover:
- iOS Simulator activation via `idb` instead of `xcrun simctl bringtosubject` to avoid foreground steal.
- Android emulator parallel-chat collision (already partly covered).
- Keychain unlock prompts during signing.
- The keyboard-extension build flow that triggers a system permission dialog mid-build.

Confidence: high. Three instances inside CDP alone, one in simulator, one in adb. The general form has reached generalisation threshold.

## P5 - archived-pattern-still-cited-implies-doctrine-drift

Anchor: This fire's session-corpus mining surfaced TWO archived patterns being cited 5x each in last 7d transcripts (`cron-fires-during-pm2-warmup-must-fail-soft.md`, `cron-clean-noop-fork-reports-suppressed.md`).

Proposed general form: `archived-pattern-cited-three-or-more-times-week-implies-unarchive-or-supersede-2026-06-09.md`.

Rule: If a pattern under `_archived/` is cited 3 or more times in 7d session transcripts, the archival was wrong. The pattern is still load-bearing. Two recoveries: (a) unarchive and restore to active, OR (b) write an explicit `supersedes_archived: <slug>` frontmatter in the canonical replacement and update INDEX.md so future cites land on the canonical.

Adjacent cases this would cover:
- A renamed pattern still referenced by old slug in hook config files.
- A pattern marked `archived` for "consolidation" where the consolidation target never landed.
- An old recipe path still referenced in a cron brief or worker template.

Confidence: high. The pattern lifecycle file (`pattern-lifecycle-active-narrowed-archived.md`) has the framework but lacks the "live citation check" enforcement step.

## Next step

Pick the highest-leverage proposal (P1 or P5 by my read) and codify as an active pattern in the same arc as authoring this draft. The other proposals stay as drafts until the third occurrence of the shape lifts them above noise.

The recursive-improvement triad applies: pattern file PLUS surfacing hook PLUS doctrine. Without the hook the pattern is symbolic.
