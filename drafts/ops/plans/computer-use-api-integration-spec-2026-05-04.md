# Computer Use API Integration Spec — 4 May 2026

**Author:** fork_mor7uok0_2079b6 (EcodiaOS conductor fork)
**Date:** 4 May 2026
**Status:** Phase 0 (spec only — awaiting Tate approval for Phase 1 MVP implementation)
**Triggers:** computer-use, computer-use-api, vision-grounded-clicks, gui-driving-substrate, path-b-vs-path-a, anthropic-computer-use-tool, recipe-authoring-driver

## 1. WHY (the problem)

Tonight's verified end-to-end Co-Exist iOS upload took ~10 min total. ~3 min of that was VPS↔Corazon (Tailscale) click iteration where the conductor:

1. Took a screenshot,
2. Inferred coordinates by visual interpretation,
3. Issued an `input.click(x,y)` call,
4. Took another screenshot to verify the click landed,
5. Re-tried with adjusted coords when the click missed.

That verify-then-click loop is the dominant cost on first-run-of-a-novel-flow. Tate verbatim 4 May 2026 22:50 AEST:

> "its still taking you 10 mins to do what takes me 20 seconds"
> "Is there some way we could make some sort of grid on the screen or really fast ai analysis between your screenshot and you seeing it so it can identify button locations or tight approximations"

Tate verbatim 4 May 2026 22:55 AEST:

> "If C is just not very efficient then computer use is definitely the best choice i reckon. If anything else can be added to it to compliment it in a powerful way, lets do that too."

Three speed-up paths were identified:

- **Path A — Macro-record-and-replay.** Single-shell PowerShell that batches a verified click sequence. Near-zero overhead for KNOWN/STABLE recipes. Already shipped (`sy094-gui-entry-via-desktop-rdp-shortcut.md` runs in 7.9s warm).
- **Path B — Anthropic Computer Use API.** Vision-grounded ML clicks, eliminates the verify-then-click loop, designed for novel/changing UIs. The model sees the screenshot and returns coordinates in one call rather than the conductor doing screenshot → human-vision → coord-guess → re-screenshot.
- **Path C — Coordinate grid overlay.** Render a numbered grid on every screenshot so the conductor can name "row 4 col 7" instead of guessing pixel coords. Minor improvement, dropped in favour of Path B because it still requires the conductor model to do the visual identification work that a computer-use-trained model does natively.

**Selected substrate (Tate decision 22:55 AEST):** Path B (Computer Use API) becomes the canonical first-run authoring driver. Path A (recorded macros) remains canonical for replay of known/validated recipes.

## 2. WHAT (Anthropic Computer Use API surface — current state, May 2026)

Sources:
- Anthropic primary docs (`platform.claude.com/docs/en/docs/agents-and-tools/computer-use`, fetched 4 May 2026)
- Anthropic pricing page (`platform.claude.com/docs/en/about-claude/pricing`, fetched 4 May 2026)

### 2.1 Beta status

Computer Use is **still in beta** as of May 2026. Two beta header values are live:

| Beta header | Tool schema | Models supported |
|---|---|---|
| `computer-use-2025-11-24` | `computer_20251124` | Claude Opus 4.7, Opus 4.6, Sonnet 4.6, Opus 4.5 |
| `computer-use-2025-01-24` | `computer_20250124` | Sonnet 4.5, Haiku 4.5, Opus 4.1, Opus 4, Sonnet 4, Sonnet 3.7 (deprecated) |

Both are maintained — the older variant still works for cheaper models (Haiku 4.5 in particular).

ZDR-eligible. Screenshots/actions are processed in real time but not retained by Anthropic after the response.

### 2.2 Tool definition schema

Required parameters:

| Parameter | Required | Description |
|---|---|---|
| `type` | Yes | `computer_20251124` or `computer_20250124` |
| `name` | Yes | Must be `"computer"` |
| `display_width_px` | Yes | Display width in pixels |
| `display_height_px` | Yes | Display height in pixels |
| `display_number` | No | X11 display number (mostly Linux-only) |
| `enable_zoom` | No | `computer_20251124` only — enables `zoom` action for region inspection |

The schema is **schema-less from the developer side** — Claude knows the action vocabulary internally; you don't pass it.

### 2.3 Action vocabulary

**Basic actions (all versions):**
- `screenshot` — capture current display
- `left_click` — click at `[x, y]`
- `type` — type text string
- `key` — press key or combination (`"ctrl+s"`)
- `mouse_move` — move cursor

**Enhanced actions (`computer_20250124` and up — Claude 4.x and Sonnet 3.7):**
- `scroll` — scroll any direction with `scroll_amount` integer
- `left_click_drag` — click and drag between coords
- `right_click`, `middle_click`, `double_click`, `triple_click`
- `left_mouse_down` / `left_mouse_up` — fine-grained click control (spreadsheet selection)
- `hold_key` — hold key for a specified duration in seconds
- `wait` — pause between actions
- Modifier-key support: pass `"text": "shift"` / `"ctrl"` / `"alt"` / `"super"` on click or scroll for shift+click, ctrl+click, etc.

**Enhanced actions (`computer_20251124` only — Opus 4.7 / 4.6, Sonnet 4.6, Opus 4.5):**
- `zoom` — view a region at full resolution. `region: [x1, y1, x2, y2]`. Requires `enable_zoom: true` in tool definition. **This is the key new capability** — when the model is uncertain about a small target it zooms instead of guessing.

### 2.4 Coordinate handling

The Claude API constrains images to ≤1568px on long edge and ~1.15 megapixels total. Most resolutions get downsampled before the model sees them. The model returns coordinates in the **downsampled** space. Your tool implementation must scale them back up to original screen space before clicking.

**Exception:** Opus 4.7 supports up to 2576 pixels on long edge with **1:1 coords** — no scale-factor conversion. This matters for our high-DPI Windows targets.

Recommended display sizes:
- General desktop tasks: 1024×768 or 1280×720
- Web apps: 1280×800 or 1366×768
- Avoid >1920×1080 (perf hit)

**Corazon implication:** Tate's laptop is 1920×1080 native. We should send screenshots downsampled to 1280×800 and scale clicks back. Or use Opus 4.7 and run at native res.

### 2.5 Pricing

Per million tokens (USD), via Anthropic API direct:

| Model | Input | Output | 5m cache write | Cache read |
|---|---|---|---|---|
| Opus 4.7 | $5 | $25 | $6.25 | $0.50 |
| Opus 4.6 | $5 | $25 | $6.25 | $0.50 |
| Sonnet 4.6 | $3 | $15 | $3.75 | $0.30 |
| Sonnet 4.5 | $3 | $15 | $3.75 | $0.30 |
| Haiku 4.5 | $1 | $5 | $1.25 | $0.10 |

**Computer Use overhead per call:**
- Beta system prompt: 466–499 tokens
- Tool definition: 735 tokens
- Each screenshot: counted as image tokens (varies with size — ~1500 tokens for 1280×800 PNG via Anthropic vision pricing)

**Estimated cost per Computer Use task (Sonnet 4.6, ~10 turn agent loop, ~12 screenshots, ~2k output tokens):**
- System prompt + tool def: 1,234 tokens × $3/MTok ≈ $0.004
- 12 screenshots × ~1500 tokens × $3/MTok ≈ $0.054
- Conversation history (cumulative input): ~30k tokens × $3/MTok ≈ $0.09
- Output: 2k tokens × $15/MTok ≈ $0.03
- **Total: ~$0.18 per task on Sonnet 4.6**

On Haiku 4.5 (cheaper, possibly less reliable): ~$0.06 per task.
On Opus 4.7 (better vision, expensive): ~$0.30 per task.

For comparison, our current Tate-blocked verify-then-click loop on a 3-min flow burns ~3 min × ~30 conductor turns × ~5k tokens/turn × $0.005/k average ≈ $2.25 in conductor tokens. **Computer Use on Sonnet 4.6 is ~12× cheaper than our current substrate** for the same outcome, AND faster (one screenshot + one action vs three screenshots + one action).

### 2.6 Known limitations (verbatim from Anthropic docs)

1. **Latency** — "may be too slow compared to regular human-directed computer actions. Focus on use cases where speed isn't critical (background information gathering, automated software testing) in trusted environments."
2. **Computer vision accuracy** — "Claude may make mistakes or hallucinate when outputting specific coordinates."
3. **Tool selection accuracy** — "may make mistakes or hallucinate when selecting tools."
4. **Scrolling reliability** — improved in 3.7+ with explicit `scroll_direction`.
5. **Spreadsheet interaction** — improved with `left_mouse_down`/`left_mouse_up` + modifier keys.
6. **Account creation / impersonation on social platforms** — limited.
7. **Prompt injection vulnerability** — instructions on webpages or in screenshots can override system prompt. Anthropic ships a classifier defense layer that asks for confirmation when a potential injection is detected. Can be opted out via support.
8. **Inappropriate / illegal actions** — AUP applies.

### 2.7 Reference implementation

`https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo` — Docker container, Xvfb, agent loop in `loop.py`, tool implementations in `tools/`. Linux-targeted (Mutter window manager + Tint2 panel). Useful as architectural reference; not directly portable to our Win11+macOS substrate.

## 3. HOW (architecture for EcodiaOS integration)

### 3.1 Three options considered

**Option 1 — `computerUseDriver` service (recommended for MVP).**
- New file: `~/ecodiaos/src/services/computerUseDriver.js`
- Wraps the Anthropic Beta Messages API with the agent loop
- Takes a high-level task description, manages the screenshot↔action turn-by-turn cycle, returns when done (model returns no more `tool_use` blocks)
- **Drives Corazon's screen via the existing `eos-laptop-agent`** — calls `screenshot.screenshot` for vision, `input.click` / `input.type` / `input.key` etc to execute Anthropic's returned actions
- Adapter layer translates Anthropic's `{action: "left_click", coordinate: [x, y]}` to `eos-laptop-agent`'s `input.click({x, y})`
- One MCP tool exposed: `computerUse_task({task_description, max_steps, target_app, model_override?})`

**Option 2 — Fork-level primitive.**
- Computer Use as a fork tool surface — fork's own agent surface gets `cu.task` that runs the loop on the spawned model
- Fork-level isolation; one fork per task; clean memory boundary
- Defer to Phase 2+ once Option 1 usage warrants the isolation overhead

**Option 3 — Extend Cowork (Claude Desktop).**
- **Rejected.** Cowork drives a browser/web UI in Tate's Chrome, not desktop apps. Claude Desktop's built-in computer-use already covers Cowork's web cases. Computer Use in our service is the **desktop-app / OS-level / RDP** counterpart that Cowork explicitly does not cover (per existing doctrine `~/ecodiaos/patterns/claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md`).

**Decision: ship Option 1 in Phase 1.** Option 2 is a natural follow-on if we hit context-budget pressure on the conductor.

### 3.2 Architecture diagram (text)

```
                EcodiaOS Conductor (this session)
                        │
                        │ MCP tool: computerUse_task({task, target_app, ...})
                        ▼
        ~/ecodiaos/src/services/computerUseDriver.js
                        │
                        ├── 1. Screenshot via eos-laptop-agent (Corazon, port 7456)
                        │     POST /api/tool {tool: "screenshot.screenshot"}
                        │
                        ├── 2. Resize to ≤1280×800 (or use Opus 4.7 native)
                        │
                        ├── 3. POST to Anthropic Beta Messages API
                        │     model: claude-sonnet-4-6 (default)
                        │     tools: [{type: "computer_20251124", ...}]
                        │     betas: ["computer-use-2025-11-24"]
                        │     messages: [{role:"user", content: [task + screenshot]}]
                        │
                        ├── 4. Receive tool_use blocks (action: left_click [x,y])
                        │
                        ├── 5. Scale coords back up to native screen space
                        │
                        ├── 6. Execute via eos-laptop-agent
                        │     POST /api/tool {tool: "input.click", params: {x, y}}
                        │     OR  {tool: "input.type", params: {text}}
                        │     OR  {tool: "input.shortcut", params: {keys}}
                        │
                        ├── 7. Screenshot + tool_result back to API
                        │
                        └── 8. Loop until no more tool_use OR max_steps reached
```

### 3.3 Adapter layer (action translation)

| Anthropic action | EcodiaOS adapter call |
|---|---|
| `screenshot` | `screenshot.screenshot` on Corazon, return base64 PNG (resized) |
| `left_click [x,y]` | `input.click({x: scaled_x, y: scaled_y, button: "left"})` |
| `right_click`, `middle_click`, `double_click`, `triple_click` | `input.click` with appropriate `button` and click count |
| `mouse_move [x,y]` | `input.move({x, y})` |
| `left_click_drag [from, to]` | `input.drag({from_x, from_y, to_x, to_y})` |
| `type "..."` | `input.type({text})` |
| `key "ctrl+s"` | `input.shortcut({keys: ["ctrl", "s"]})` |
| `hold_key {key, duration}` | `input.keyDown({key})` + sleep + `input.keyUp({key})` |
| `scroll {direction, amount}` | `input.scroll({direction, amount})` (verify if eos-laptop-agent has this; if not, add) |
| `wait {duration}` | sleep |
| `zoom {region}` | crop screenshot to region client-side, return as next screenshot |

The `zoom` action is the only one that doesn't map 1:1 to laptop-agent — it's a vision-side operation we handle in `computerUseDriver.js`, not on Corazon.

### 3.4 Credentials and config

- API key: `kv_store.creds.anthropic_api_key` (verify exists; if not, request from Tate as part of MVP setup — the same key already in use for SDK forks should work)
- Default model: `claude-sonnet-4-6` (best price/perf balance for vision tasks)
- Model override: pass `model_override` to escalate to Opus 4.7 for hard targets, or drop to Haiku 4.5 for trivial flows
- Default `max_steps`: 25 (prevents runaway agent loops)
- Default `timeout`: 300s (5 min hard ceiling per task)
- Cost cap: warn at $1.00 per task, hard-stop at $5.00

### 3.5 Failure modes to handle

| Failure | Detection | Recovery |
|---|---|---|
| API rate limit hit | HTTP 429 | Exponential backoff, escalate to Tate after 3 retries |
| Coords hallucinated (click misses) | After-click screenshot doesn't show expected state change | Model re-screenshots and re-tries naturally — no extra logic needed |
| `max_steps` exceeded without completion | iteration counter | Mark task `partial`, return last screenshot, status_board P2 row |
| Cost cap hit ($5 / task) | running token cost tally | Mark task `cost_exceeded`, return what's done so far |
| eos-laptop-agent unreachable | `/api/tool` HTTP error | Fail fast with clear error; do not retry indefinitely |
| Prompt injection classifier triggers confirmation | Response includes confirmation request | Either auto-confirm (low-risk flows) or escalate to Tate (high-risk flows like financial transactions) |
| Beta header rejected (model doesn't support) | HTTP 400 | Fall back to `computer-use-2025-01-24` + `computer_20250124` schema |

## 4. SCOPE (MVP and phases)

### Phase 0 — Research + spec (THIS document, complete)

Deliverable: this file + meta-doctrine update + status_board row + Neo4j Decision.

### Phase 1 — MVP (single tool, single validation task)

**Smallest validation:** one MCP tool `computerUse_task({task_description, max_steps, target_app})` that drives ONE concrete task end-to-end:

> Validation task: "On Corazon, with the SY094 RDP window already open and at the macOS desktop, click the Xcode dock icon, wait for Xcode to come to foreground, click Window menu, click Organizer, click the Distribute App button on the topmost archive."

**Validation criteria:**
- Success rate ≥ 80% over 10 runs
- p50 latency < 60s end-to-end (vs current verify-then-click ~3 min for an equivalent flow)
- p95 latency < 180s
- Average cost ≤ $0.50/run
- No false positives on prompt-injection classifier (this flow has no untrusted input)

**Out of scope for Phase 1:**
- Multi-task workflows (one task per tool call)
- Auto-recording of click sequences for Path A export (Phase 3)
- Drift detection (Phase 4)
- Cowork integration (separate substrate, not blocked by this)
- Mac-side execution (SY094 SSH / Mac-only flows) — Phase 1 is Corazon-only

**Files to create in Phase 1:**
- `~/ecodiaos/src/services/computerUseDriver.js` — agent loop + adapter
- `~/ecodiaos/src/services/computerUseDriver.test.js` — unit tests (mock Anthropic API + mock eos-laptop-agent)
- New MCP tool registration in `~/ecodiaos/src/mcp/tools/` (path TBD on implementation)
- Sample recipe call site demonstrating use

### Phase 2 — Recipe library integration

- Update `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` (done in this fork — see §6 below)
- Add Computer Use as a recommended substrate for "first-run authoring of novel GUI flows"
- Document when to prefer Computer Use vs recorded macros vs UI Automation tree-walk
- Existing recipes get an annotation: "First-run authoring driver: <Computer Use | UI Automation | manual>"

### Phase 3 — Auto-record (Computer Use → Path A export)

- After a successful Computer Use task run, capture the verified action sequence (click coords, type text, key shortcuts) into a Path A recorded macro file
- Macro is auto-codified to `~/ecodiaos/recipes/auto/<task-slug>-<date>.ps1` (or equivalent platform script)
- Next-time replay skips the ML overhead and runs the recorded macro directly
- Falls back to Computer Use if the macro fails (Phase 4)

### Phase 4 — Drift detection

- Periodic re-validation of Path A recorded macros (cadence per existing recipe doctrine: high-leverage monthly, medium quarterly, low on-failure)
- If recorded macro fails (click misses, expected state not reached) → auto-fall-back to Computer Use to re-discover coords
- Re-codify the new coords into the macro
- Record the drift event in `~/ecodiaos/patterns/<recipe>.md` failure-modes section

## 5. TRADEOFFS (cost, latency, where it fits)

### Comparison matrix

| Substrate | Best for | Latency per click | Cost per click | Reliability on novel UIs | Reliability on stable UIs |
|---|---|---|---|---|---|
| **Tier 0 — UI Automation property query** | Anything UIA exposes | ~50ms | $0 | n/a (only works if UIA exposed) | Excellent |
| **Tier 1 — UIA tree walk** | Find element by name/class | ~100ms | $0 | Good when names stable | Excellent |
| **Path A — recorded macro** | Stable known recipes | ~50ms (single shell) | $0 | n/a (only replays) | Excellent |
| **Path B — Computer Use API (Sonnet 4.6)** | Novel/changing UIs, first-run authoring | ~3-5s (1 API turn) | ~$0.02-0.05/click | Good (vision-grounded) | Good but slow vs A |
| **Path B — Computer Use API (Opus 4.7)** | Hard targets (small text, dense UI) | ~5-8s (1 API turn) | ~$0.05-0.10/click | Excellent | Good but expensive |
| **Conductor verify-then-click (current)** | Anything (default, always works) | ~10-15s (3+ screenshots) | ~$0.10-0.20/click | OK (model dependent) | Same as novel |
| **Cowork (Claude Desktop)** | Logged-in web SaaS in Tate's Chrome | ~5-10s | Cowork session cost | Excellent on web | Excellent on web |

### Where each fits

- **Tier 0/1 (UIA) — always preferred.** Free, fast, deterministic. Covers most native Win32/WPF targets.
- **Path A (recorded macro) — primary for repeat runs.** Once a recipe is validated end-to-end, codify the action sequence into a macro for blazing replay.
- **Path B (Computer Use) — primary for first-run authoring of novel flows.** Drives the validation; captures the coords; on success Phase 3 auto-exports the validated sequence to a Path A macro.
- **Cowork — primary for logged-in webapps in Tate's Chrome.** Computer Use does not supersede Cowork for web UIs; Cowork already gets Tate's session.
- **Conductor verify-then-click — fallback only.** If Path B fails (rate limit, cost cap, model unavailable), fall back to current behaviour.

### Cost projection

If we run 50 Computer Use tasks/week at average $0.20/task on Sonnet 4.6, that's $10/week or ~$520/year. Comparable to a single VPS bill. Negligible relative to the conductor token spend it replaces (~$2.25/task at current substrate × 50 tasks/wk = $112/wk = $5,800/yr, plus the human-time / Tate-confidence cost of the 10-min vs 60s end-to-end timing).

**Net cost saving: ~$5,000/year + a Tate-frustration step-function reduction.**

### Latency tradeoffs

- Computer Use is **slower per individual click** than recorded macros (3-5s vs 50ms) but **faster end-to-end on novel flows** because it eliminates the 3-screenshot verify-then-click loop.
- For known/stable recipes, Path A (recorded macro) is always preferred.
- For first-run-of-a-novel-flow, Path B is the right tradeoff.

### Anthropic-first check

Computer Use IS the Anthropic-first answer. We are not building a parallel agent loop — we are wrapping Anthropic's beta tool with an adapter to our specific peripherals (Corazon's `eos-laptop-agent`). The wrapper is the smallest possible bridge per the protocol in `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md`. No new action vocabulary, no parallel runtime, no custom step-arrays. Just: Anthropic's actions → our peripheral driver.

### Risks

- **Beta status.** API may change; Anthropic may rev the schema (`computer_20251124` → `computer_20260X` etc). Mitigation: pin the version in our service, monitor Anthropic changelog monthly.
- **Rate limits.** Tier 1/2 accounts have low concurrency. Mitigation: use the same account that Factory/SDK forks are on, monitor 429s, add exponential backoff.
- **Prompt injection on Tate's screen.** Less risk because we operate in a known environment (his desktop, not browsing the open web). But if a future task involves browsing untrusted sites, prompt-injection classifier handling matters.
- **Cost overrun.** Mitigation: hard cap per task ($5), warn cap ($1), monthly budget alert.
- **Coordinate scaling bugs.** First implementation will likely have off-by-N pixel errors from scale-factor calc. Mitigation: validate on 3 different display sizes before declaring v1.

## 6. CROSS-REFERENCES

- `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md` — meta-doctrine; updated this turn to add Computer Use as a verification tier and an authoring substrate
- `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md` — the canonical Anthropic-first check; this spec is the worked instance
- `~/ecodiaos/patterns/macros-must-be-validated-by-real-run-before-codification.md` — Path A (recorded macro) discipline; Computer Use solves the first-run validation half of this doctrine
- `~/ecodiaos/patterns/claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md` — Cowork covers logged-in web SaaS in Tate's Chrome; Computer Use is the OS-level / desktop-app / RDP counterpart, not a competitor
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md` — full Corazon tool surface (`screenshot.*`, `input.*`, `shell.shell`) that Computer Use's adapter layer calls
- `~/ecodiaos/patterns/sy094-coexist-ios-release-recipe.md` — first worked Path B candidate (the Xcode Distribute App click sequence)
- `~/ecodiaos/CLAUDE.md` — laptop agent / Corazon doctrine

## 7. APPROVAL GATE (Tate-required for Phase 1)

Phase 1 implementation requires:

1. **Tate approval of this spec.** Specifically the architectural choice (Option 1, service wrapper), the validation task selection (Xcode Distribute App click sequence), and the cost cap thresholds ($1 warn / $5 hard).
2. **Confirm `kv_store.creds.anthropic_api_key`** is provisioned and on the Max account that has Computer Use beta access (likely already true; verify before MVP fork dispatch).
3. **Greenlight to dispatch a Phase 1 implementation fork.** Brief will reference this spec by path.

Once approved, Phase 1 is a single fork: write `computerUseDriver.js`, wire one MCP tool, validate against the Xcode flow, deliver a 10-run reliability report.

## 8. ORIGIN

**Tate verbatim 4 May 2026 22:50 AEST:** "its still taking you 10 mins to do what takes me 20 seconds" + "Is there some way we could make some sort of grid on the screen or really fast ai analysis between your screenshot and you seeing it so it can identify button locations or tight approximations"

**Tate verbatim 4 May 2026 22:55 AEST:** "If C is just not very efficient then computer use is definitely the best choice i reckon. If anything else can be added to it to compliment it in a powerful way, lets do that too."

Conversation arc: ~10-min Co-Exist iOS upload flow tonight surfaced the verify-then-click latency cost on first-run-of-a-novel-flow. Three speed-up paths identified (A: recorded macros, B: Computer Use API, C: coord grid overlay). Tate selected B as primary, with A as the complementary stable-recipe replay path. Doctrine codification: this spec + meta-doctrine update.

Spec author: fork_mor7uok0_2079b6 (EcodiaOS conductor fork), 4 May 2026.
