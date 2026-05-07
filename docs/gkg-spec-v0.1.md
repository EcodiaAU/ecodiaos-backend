---
title: GUI Knowledge Graph (GKG) - v0.1 spec
status: phase_0_bootstrap
authored_by: fork_moux6fpq_a26c37
authored_at: 2026-05-07T13:30+10:00
strategic_direction: 'GUI Knowledge Graph (GKG) - passive UI activity to Neo4j-graph + compositional replay'
supersedes: ~/ecodiaos/patterns/macros-record-mode-and-auto-author-from-runs.md (extends, does not replace)
---

# GUI Knowledge Graph (GKG) - v0.1 spec

## 1. Origin

Workshopped 7 May 2026 12:55-13:04 AEST between EcodiaOS conductor and Tate. Tate verbatim 13:04 AEST: "Fuck me.... yes i love it all. Go ahead, lets put it all in place" - approval to land Phase 0.

Four trade-off resolutions agreed in workshop:

1. **Privacy.** App-allowlist (NOT blocked-paths) + sensitive-input redaction at capture + tray pause toggle + per-Tate encryption at rest. Capture daemon refuses to record outside the allowlist by default; user opts apps INTO the graph rather than carving exclusions out of "everything".
2. **Anchor brittleness.** Multi-modal anchor identity per click - UIA name + role + position + neighbor + 384-dim text/visual embedding. Replay engine auto-heals when one modality drifts (e.g. UIA name changes but role + neighbor + embedding still match).
3. **Compositional fidelity.** State-vector matching with cosine similarity threshold > 0.85 + pre-flight verify before stitching two recorded sub-flows. Avoids the "click 7 from flow A landed Tate in a state flow B never saw" failure.
4. **Timing.** Phased: Phase 0 (this fork - spec + bootstrap from existing handlers/recipes), Phase 1 (capture daemon for ONE app: Apple Dev Console), Phase 2 (expand to 6-app target set), Phase 3 (replay engine + self-healing).

## 2. Vision

Zero-friction passive UI capture - Tate uses his computer normally, the graph grows organically. UI states and transitions get recorded as nodes and edges in Neo4j. Replay = traversal through that graph, composing recorded sub-flows to handle novel goals. Generalises beyond explicit recordings; UI-redesign-resilient via multi-modal anchors; bidirectional value (replay flows + learn Tate's preference patterns).

GKG is **additive to Anthropic computer-use, not parallel infrastructure**. Anthropic ships the agent loop + vision model + click primitives. GKG ships the memory layer that loop queries: "I'm at this UI state, what edges have I previously traversed from here, and which one moves me toward the goal?" When Anthropic's loop has no graph context, it does what it does today (vision + reasoning + fresh trial-and-error). When GKG context is available, it picks the validated traversal.

## 3. Architecture

Five components. Each is a process or service with a single responsibility and a typed interface to the next.

### 3.1 Capture Daemon (Corazon)

Long-running process on Corazon. Hooks `WH_KEYBOARD_LL` + `WH_MOUSE_LL` + foreground window changes via Win32 SetWindowsHookEx. On every event:

1. Probe foreground window (process name + title + UIA tree root).
2. Gate: is foreground app on the allowlist? If no, drop event silently.
3. Capture: pre-screenshot (full + cropped 200x200 around cursor) + UIA element under cursor (name + role + automation_id + parent + 2 nearest siblings) + raw input (keycode / button / coords).
4. Sensitive-input redaction: if focused element role matches `password | credit_card | 2fa_code | ssn` regex OR autocomplete attribute contains `current-password|cc-number|one-time-code`, replace keystroke payload with `[REDACTED-<role>]`.
5. Write JSONL line to local buffer at `D:\.code\gkg-capture\<session>\events.jsonl`.
6. After each click+Δt settles, capture post-screenshot.
7. Tray icon exposes pause toggle (kv_store `gkg.capture.paused=true` also pauses).

API contract: `POST /api/gkg/ingest` (chunked NDJSON, 1MB chunks). Body: `{session_id, events: [{ts, type, app, window_title, uia, redacted, pre_screenshot_b64, post_screenshot_b64, anchor_*}]}`. Response: `{accepted: N, rejected: [{idx, reason}]}`.

Implementation language: TBD (AHK + Win32 hooks via DllCall, or PowerShell + Add-Type, or Node native module). Decision is a Phase 1 design-fork deliverable. Recorder substrate already exists at `D:\.code\eos-laptop-agent\macros\macro-recorder.ahk` (event-trigger + UIA + per-event vision enrichment); Phase 1 may extend it into a daemon stripped of explicit start/stop trigger OR run alongside. See `Phase 1` in §6.

### 3.2 Action Ingestor (VPS)

Express route `POST /api/gkg/ingest` on `api.admin.ecodia.au`. For each event in the chunk:

1. Decrypt payload (per-Tate symmetric key from `kv_store.gkg.encryption_key`).
2. Validate schema (zod or ajv).
3. Embed: text-embed `name + role + neighbor_text` via Anthropic embeddings API; visual-embed pre/post screenshots via local CLIP-style model (or Anthropic vision).
4. Write to Neo4j: MERGE the source `:UIState`, MERGE the target `:UIState`, MERGE the `:UIAction` node, CREATE edges `(:UIState)-[:LEADS_TO {via_action}]->(:UIState)` and `(:UIAction)-[:OCCURS_IN]->(:UIState)`.
5. Stash raw screenshots in Supabase Storage `documents/gkg/<session>/<event_id>.png` (encrypted at rest).

API contract documented in §3.1.

### 3.3 Reasoning Attachment (batch)

Cron-fired fork (every 6h) that walks recently-ingested `:UIAction` nodes lacking `reasoning` property. For each, packages: pre-screenshot + post-screenshot + UIA selector + neighbor context, sends to Anthropic vision (claude-sonnet-4-7) with prompt "What is the user trying to accomplish with this click?". Writes the response back to the `:UIAction.reasoning` property + bumps `reasoning_confidence` from the model's claimed certainty.

Why batch not online: keeps capture-daemon latency near-zero (no model round-trip in hot path) and lets us use bigger models on the reasoning step than would be affordable per-click.

### 3.4 Replay Engine (Phase 3)

Given a goal ("get to ASC TestFlight build page for app X"):

1. Embed goal text. Find candidate goal `:UIState`s by cosine similarity > 0.85 against `description + reasoning` of states with goal-shaped reasoning attached.
2. Probe current foreground UI state. Embed via the same pipeline (pre-screenshot + UIA tree + active app).
3. Cypher shortest-path query through `:LEADS_TO` edges from current state to candidate goal state, weighted by `:UIAction.confidence` and `:UIState.last_replayed_success_at` recency.
4. Pre-flight verify: walk the proposed path, for each `:UIAction` confirm at least 2 of 4 anchor modalities (UIA name, role, position, embedding) match the live UI. If less, abort + escalate to self-healing.
5. Replay: drive each click via `input.click` + post-verify cropped-screenshot diff against captured `post_screenshot`. Diff > threshold = abort + escalate.

API contract: `POST /api/gkg/replay {goal: string, dry_run?: bool, max_steps?: int}`. Response: `{success, traversal: [{state_id, action_id, post_verify_pixel_diff}], reasoning, screenshot_url}`.

### 3.5 Self-Healing (Phase 3)

When a replay step fails post-verify or anchor-match drops below threshold:

1. Mark the `:UIAction` `staleness=high`, `last_failed_at=now`.
2. Probe the current live UI fully (UIA tree + screenshot).
3. Search for elements within the same `:UIState` whose embedding matches the failed action's `target_embedding` > 0.85. If found, propose a replacement click.
4. Replay the proposed action with extra-strict post-verify (must match BOTH cropped-screenshot AND post-state UIA pattern).
5. On success, write `:ALIASES` edge from old action to new action with `aliased_at=now, confidence`. Future replays prefer the new action.
6. On failure, escalate to status_board P2 row "GKG self-heal failed for action <id>" with `next_action_by=ecodiaos` (re-record the flow).

## 4. Privacy posture

**App-allowlist (initial set, Phase 1 / Phase 2 as flagged):**

| App / Domain | Phase | Why |
|---|---|---|
| Apple Developer portal (`developer.apple.com`) | Phase 1 | First daemon target; 3 fresh recipes already capture flows here |
| App Store Connect (`appstoreconnect.apple.com`) | Phase 1 | Same iOS pipeline; high-leverage |
| Xcode (process: `Xcode`) | Phase 2 | Mac IDE flows via RDP - pixel-only, see `mac-via-rdp-capture-is-pixel-only-uia-blind` doctrine |
| Cursor / VS Code (process: `Cursor.exe`, `Code.exe`) | Phase 2 | Editor flows |
| MacInCloud RDP window (process: `mstsc.exe`, title contains `MacinCloud`) | Phase 2 | Mac flows pixel-only |
| Stripe dashboard (`dashboard.stripe.com`) | Phase 2 | Stub handler exists; capture demands Phase 1 stability |
| Vercel dashboard (`vercel.com`) | Phase 2 | |
| Supabase dashboard (`supabase.com/dashboard`) | Phase 2 | |
| GitHub web (`github.com`) | Phase 2 | |

Allowlist matching: `app_process_name` exact OR `window_title_contains` regex OR `chrome_url_origin_match`. Daemon refuses non-matching events at capture time, before any data hits disk.

**Sensitive-input redaction (capture-time):**

- Element role match: `Edit{password=true}`, `PasswordEdit`, autocomplete attr `current-password|new-password|cc-number|cc-csc|one-time-code`, name match `password|2fa|verification|cvv|ssn|tax id|tfn|ein` (case-insensitive).
- On match, replace keystroke payload with `[REDACTED-<role>]`. Never write the raw value to disk, even temporarily.
- Per-screenshot redaction: pre-screenshot is captured but the bounding box of the redacted field is solid-filled black before write.

**Per-Tate encryption at rest:** symmetric key in `kv_store.gkg.encryption_key`, sealed with Tate's session key. Capture daemon encrypts JSONL lines + screenshots before chunked POST to ingestor. Ingestor decrypts in-memory only, writes ciphertext blobs to Supabase Storage with the per-key reference. Neo4j stores anchor embeddings + selectors but not raw keystrokes or unredacted screenshots.

**Tray pause toggle:** Corazon system-tray icon exposes Pause/Resume. Polls `kv_store.gkg.capture.paused` every 5s. Either path pauses the daemon. Pause is logged as a `:CapturePauseEvent` node so the conductor can see "Tate paused for 90 minutes covering X..Y timeframe".

## 5. Neo4j schema

### 5.1 Node labels

#### `(:UIState)`

A canonical UI state - "what the screen looks like at a step boundary, normalised". Multiple raw screenshots collapse into one state if their visual + structural embeddings match within threshold.

| Property | Type | Description |
|---|---|---|
| `state_id` | string (uuid) | Primary key |
| `app` | string | e.g. `chrome.appstoreconnect.apple.com`, `mstsc.macincloud`, `xcode` |
| `context` | string | Free-text description (`"ASC Apps page, EOS Mobile app row visible"`) |
| `window_title` | string | Captured at observation time |
| `process_name` | string | `chrome.exe`, `Xcode`, `mstsc.exe` |
| `screenshot_url` | string | Supabase Storage URL of canonical screenshot (encrypted) |
| `uia_tree_hash` | string | Hash of UIA root subtree (collision = same state) |
| `text_embedding` | float[384] | Of `app + context + visible_text` |
| `visual_embedding` | float[N] | Of canonical screenshot (CLIP-style) |
| `captured_via` | string | `'hand-authored-handler-bootstrap' \| 'recording-recipe-bootstrap' \| 'capture-daemon' \| 'replay-engine-observed'` |
| `first_seen_at` | datetime | |
| `last_seen_at` | datetime | |
| `seen_count` | int | Times this state has been observed |

#### `(:UIAction)`

A click / keystroke / shortcut taken from one state, leading to another.

| Property | Type | Description |
|---|---|---|
| `action_id` | string (uuid) | Primary key |
| `type` | enum | `click \| keypress \| shortcut \| drag \| scroll` |
| `pixel_x`, `pixel_y` | int | Click coords (replay fallback) |
| `anchor_uia_name` | string | UIA Name property at action time |
| `anchor_uia_role` | string | UIA ControlType (`Button`, `Edit`, `Hyperlink`...) |
| `anchor_automation_id` | string | UIA AutomationId if present |
| `anchor_neighbors` | string[] | UIA names of 2 nearest siblings |
| `anchor_screenshot_url` | string | Cropped screenshot 200x200 around cursor |
| `anchor_embedding` | float[384] | Multi-modal embedding (text+visual concatenation) |
| `keypress_text` | string \| null | For `keypress`/`shortcut` types only |
| `reasoning` | string \| null | What user was trying to do (filled by Reasoning Attachment) |
| `reasoning_confidence` | float | 0..1 |
| `confidence` | float | Overall confidence in this action's anchor identity |
| `staleness` | enum | `fresh \| stale \| broken` |
| `last_replayed_at` | datetime \| null | |
| `last_replayed_success` | bool \| null | |
| `last_failed_at` | datetime \| null | |
| `captured_via` | string | Same enum as `:UIState.captured_via` |

#### `(:Handler)` (Phase 0 bootstrap)

A hand-authored or recipe-bootstrapped flow handler. Bridges existing macroHandlers / recipes into the graph as named coarse-grained edges.

| Property | Type | Description |
|---|---|---|
| `name` | string | Handler basename (`apple-signin`, `transporter-upload`, ...) |
| `source_file` | string | Path on Corazon (or `D:\.code\eos-laptop-agent\macroHandlers\<x>.js` for handlers, `~/ecodiaos/patterns/<x>.md` for recipes) |
| `validation_status` | enum | `untested_spec \| validated_v1 \| broken_needs_fix \| stub_retracted \| stub_permanent` |
| `kind` | enum | `js-handler \| recording-recipe` |
| `origin` | string | First Origin block / authored-by line |
| `bootstrapped_at` | datetime | |

### 5.2 Relationship types

- `(:UIState)-[:LEADS_TO {via_action_id, confidence, observed_count, last_observed_at}]->(:UIState)` - canonical state-transition edge.
- `(:UIAction)-[:OCCURS_IN]->(:UIState)` - source state of an action.
- `(:UIAction)-[:LANDS_AT]->(:UIState)` - target state of an action.
- `(:UIAction)-[:ALIASES {aliased_at, confidence}]->(:UIAction)` - self-healing alias when an old anchor breaks and a new equivalent click is found.
- `(:UIState)-[:RUNS_HANDLER {handler_name, source_file, validation_status, ingested_at}]->(:UIState)` - Phase 0 bootstrap edge from a handler's start state to its end state. Coarse-grained: hides the inner click sequence (Phase 1 capture daemon will record the inner sequence as `:UIAction` chains and obsolete the coarse edge).
- `(:UIAction)-[:NEXT {dt_ms}]->(:UIAction)` - sequencing within a single recording (Phase 0 bonus enrichment from the 3 fresh recipes that have full click sequences).

### 5.3 Indexes (Phase 1)

```cypher
CREATE INDEX uistate_state_id IF NOT EXISTS FOR (s:UIState) ON (s.state_id);
CREATE INDEX uistate_app IF NOT EXISTS FOR (s:UIState) ON (s.app);
CREATE INDEX uiaction_action_id IF NOT EXISTS FOR (a:UIAction) ON (a.action_id);
CREATE VECTOR INDEX uistate_text_embedding IF NOT EXISTS
  FOR (s:UIState) ON (s.text_embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 384, `vector.similarity_function`: 'cosine'}};
CREATE VECTOR INDEX uiaction_anchor_embedding IF NOT EXISTS
  FOR (a:UIAction) ON (a.anchor_embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 384, `vector.similarity_function`: 'cosine'}};
```

## 6. Phased rollout

### Phase 0 - today (this fork)

- Spec doc (this file).
- Strategic_Direction Neo4j node.
- `:Handler` nodes for the 18 macroHandlers + 3 fresh recipes.
- `:UIState` start/end seed nodes per active (non-stub) handler.
- `:RUNS_HANDLER` coarse edges for active handlers.
- Phase 0 bonus: per-click `:UIAction` chain for the 3 fresh recipes (apple-dev-bundle-id-register, xcode-signing-team-select, asc-app-record-create), sequenced with `:NEXT` edges.
- Status_board P2 row tracking Phase 1 dispatch.
- Single commit on main.

### Phase 1 - next week (after EOS Mobile TestFlight ship)

- Author capture daemon for Apple Developer portal ONLY (allowlist[0]).
- Wire `POST /api/gkg/ingest`.
- Wire sensitive-input redaction + tray pause toggle.
- Run for 3-5 days collecting Tate's natural Apple Dev portal use.
- End-of-Phase-1 deliverable: 50+ `:UIAction` nodes, 20+ `:UIState` nodes, 1 successful replay traversal of an Apple-Dev-portal task that the daemon never explicitly recorded but composed from observed sub-flows.

**PENDING - integrate with existing recorder substrate.** Recorder at `D:\.code\eos-laptop-agent\macros\macro-recorder.ahk` writes to `D:\.code\macro-recordings\<session-id>\` per fork_mouwdlen_62795c reconciliation today (7 May 2026). Phase 1 capture daemon may EITHER (a) extend the existing recorder to run as long-running daemon stripped of explicit start/stop trigger, OR (b) be a separate capture pipeline alongside. Decide in Phase 1 design fork. Option (a) reuses the per-event vision enrichment chain (claude-sonnet-4-7) already wired; option (b) avoids muddling explicit-recording semantics with passive-capture semantics and lets the two pipelines evolve independently. Lean: (a) for the AHK + UIA hooks, (b) for the JSONL emission path - i.e. shared substrate, separate emit channels.

### Phase 2 - month 2

- Expand allowlist to the 6-app target set: Xcode, Cursor/VS Code, MacInCloud RDP, Stripe dashboard, Vercel dashboard, Supabase dashboard.
- 200+ `:UIAction` nodes, 50+ `:UIState` nodes per app.
- Cross-app traversal demo: a goal that requires Chrome → Xcode → ASC.

### Phase 3 - month 3+

- Replay engine v1.
- Self-healing v1.
- Anthropic computer-use integration (computer-use loop calls `POST /api/gkg/replay` as memory-layer query).
- 5+ goal-replays/week measured.

## 7. Anti-goals

- **NOT a screen-recording-replay tool.** No video. No keystroke-replay-by-time-offset. The graph is structural; replay is traversal.
- **NOT a Selenium/Playwright wrapper.** Those drive web by DOM. GKG is OS-level + UIA-level + pixel-fallback; works on desktop apps and RDP'd Mac UIs that DOM-tools don't touch.
- **NOT parallel infrastructure to Anthropic computer-use.** GKG is the memory layer that Anthropic's loop queries. We do NOT ship a vision model; we use Anthropic's. We do NOT ship an agent loop; we use Anthropic's. We ship the persistent graph and the replay-engine-as-memory-query.

## 8. Naming TODO

Working name `GKG` (GUI Knowledge Graph) is descriptive but boring. Alternatives floated 13:00 AEST workshop:

- **GKG** - GUI Knowledge Graph - descriptive
- **Cobweb** - structural metaphor (graph that grows organically as Tate uses computer)
- **Trail** - implies path-traversal-through-history
- **GUI Memory** - the Anthropic-additive framing in plain English

Tate to pick before Phase 1 daemon ships. Default `GKG` in code/docs/Cypher until renamed.

## 9. Open questions

- **State-vector dimensions.** 384 for text (matches Anthropic embedding output). Visual: CLIP ViT-B/32 = 512, ViT-L/14 = 768. TBD - probably 512 to keep storage modest while preserving retrieval quality.
- **Embedding model choice for anchor embeddings.** Anthropic embeddings API for text path; visual path open. Local CLIP via ONNX vs Anthropic vision API. Local = free + private but lower quality + slower; API = better quality + monetary cost + privacy boundary issue (we already encrypt before send though). Lean local CLIP for capture-time, Anthropic vision API for batch reasoning attachment.
- **Capture-daemon implementation language.** AutoHotkey (already used for macro-recorder, low-friction Win32) vs PowerShell + Add-Type (more verbose but better for hooking + JSON emission) vs Node native module (cross-platform but heavyweight). Lean: extend existing AHK recorder (matches §6 Phase 1 PENDING note).
- **Compositional fidelity threshold.** 0.85 cosine similarity is a starting heuristic. Phase 2 should tune against measured replay-success rates and adjust per-app (some apps are visually noisy and need a lower threshold).
- **Encryption key rotation.** `kv_store.gkg.encryption_key` rotation cadence + backfill story for existing ciphertext. Phase 3 problem.

## 10. Phase 0 bootstrap status

This fork (`fork_moux6fpq_a26c37`) ships:

- 1 `:Strategic_Direction` node ("GUI Knowledge Graph (GKG) - passive UI activity to Neo4j-graph + compositional replay").
- This spec doc at `~/ecodiaos/docs/gkg-spec-v0.1.md`.
- `:Handler` nodes for all 18 macroHandlers files (12 .js + 3 .applescript + 3 infrastructure files).
  - Active (non-stub): 6 handlers. Get `:UIState` start/end seed nodes + `:RUNS_HANDLER` coarse edges.
  - Stub-retracted (Phase 1 stubs that throw on invocation): 6 handlers. Recorded as `:Handler` with `validation_status='stub_retracted'`, no edges (intentional gap markers).
  - Stub-permanent (`macincloud-login` per 17:11 AEST 29 Apr 2026 doctrine): 1 handler. `validation_status='stub_permanent'`.
  - Infrastructure (no flow): 3 files (`common.js`, `index.js`, `sshHelper.js`). Skipped.
  - AppleScript files (`*.applescript`): 3 files. Bundled into the corresponding .js handler nodes (referenced via property), not standalone `:Handler` nodes.
- 3 recipe `:Handler` nodes from the 3 fresh recipes promoted today (apple-dev-bundle-id-register, xcode-signing-team-select, asc-app-record-create). Each carries `kind='recording-recipe'` + per-click `:UIAction` chain bonus enrichment.
- Per-click `:UIAction` nodes from those 3 recipes (12 + 9 + 11 = 32 actions total), linked with `:NEXT` edges within each recipe.
- Status_board P2 row "GKG Phase 1 - capture daemon prototype on Apple Dev Console" with `next_action_by=ecodiaos`.
- Single commit on `main` pushed to origin.

Phase 1 dispatch trigger: after the EOS Mobile TestFlight ship lands (sibling fork resume in flight). Phase 1 fork brief lives in this status_board row's `context` field.

## Cross-references

- `~/ecodiaos/patterns/macros-record-mode-and-auto-author-from-runs.md` - pre-existing record-mode doctrine that GKG extends (does not replace).
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` - validation-status discipline applies to handlers seeded into graph.
- `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md` - GKG is Anthropic-additive (memory layer).
- `~/ecodiaos/patterns/distributed-state-seam-failures-are-the-core-infrastructure-risk.md` - 5-component architecture means 4+ seams; each needs explicit consistency protocol per this pattern.
- `~/ecodiaos/patterns/tate-recordings-are-primary-gui-learning-substrate.md` - explicit-record path that GKG passively-captured path complements.
- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` - recipe meta-doctrine; recipes feed Phase 0 bootstrap.
- `~/ecodiaos/patterns/mac-via-rdp-capture-is-pixel-only-uia-blind.md` - replay-method gating for Mac-via-RDP captures (xcode-signing-team-select recipe path).
- `~/ecodiaos/patterns/macros-pre-pivot-doctrine-archived-2026-04-29.md` - archived bespoke runtime; GKG does NOT resurrect it.
- `~/ecodiaos/patterns/tailscale-macro-replaces-cowork.md` - the substrate the GKG capture daemon and replay engine drive against (Corazon `input.*` + `screenshot.*`).
- `~/ecodiaos/patterns/substrate-before-doer.md` - GKG is substrate-first by design (capture daemon and ingestor + graph land BEFORE replay engine + self-healing).
- `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md` - replay engine drives Chrome via Tate's logged-in session and `input.*`, not bespoke browser-via-HTTP wrappers.
- `~/ecodiaos/patterns/outcome-inference-must-seek-evidence-of-failure.md` - replay-engine post-verify discipline: cropped-screenshot diff + UIA pattern check must seek failure evidence, not assume success on silence.
- `~/ecodiaos/patterns/apple-dev-bundle-id-register-recipe.md` - one of the 3 fresh recipes Phase-0-bootstrapped into the graph.
- `~/ecodiaos/patterns/xcode-signing-team-select-recipe.md` - one of the 3 fresh recipes Phase-0-bootstrapped into the graph.
- `~/ecodiaos/patterns/asc-app-record-create-recipe.md` - one of the 3 fresh recipes Phase-0-bootstrapped into the graph.
