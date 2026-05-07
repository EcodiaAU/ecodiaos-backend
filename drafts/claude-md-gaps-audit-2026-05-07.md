# CLAUDE.md gaps audit - 2026-05-07 AEST

Author: fork_movbh8x1_2678f7 (claude-md-reflection cron, 20:00 AEST 2026-05-07)

Methodology: read both CLAUDE.md files end-to-end (business `~/CLAUDE.md`, technical `~/ecodiaos/CLAUDE.md`); listed pattern files newer than the last audit run (`find -newermt "2026-05-06 10:06"`); read each pattern authored today plus yesterday's audit at `~/ecodiaos/drafts/claude-md-gaps-audit-2026-05-06.md` to avoid double-listing 5-6 May cluster items already applied; queried Neo4j for Decisions/Episodes within the last 30h and pulled 25 row sample; cross-referenced new patterns against canonical CLAUDE.md texts via grep. NO em-dashes anywhere in this file (hyphen with spaces or restructured). Yesterday's audit (2026-05-06) was applied at 20:00 AEST that day per Episode "claude-md-edit-fork 6 May 2026 20:00 AEST"; this audit therefore covers the 24-hour window since.

Pattern files authored or significantly extended in the last 24h (in mtime order, newest first):

- `~/ecodiaos/patterns/gkg-allowlist-generous-default.md` (NEW, 7 May 07:20 AEST, Tate verbatim 16:05 + 17:09 AEST 7 May)
- `~/ecodiaos/patterns/pattern-lifecycle-active-narrowed-archived.md` (NEW, 7 May 06:25 AEST, Tate verbatim 16:20 AEST 7 May)
- `~/ecodiaos/patterns/deepseek-fallback-strips-anthropic-thinking-blocks.md` (NEW, 7 May 05:18 AEST, Origin: 18-event 400-storm 03:51-03:58 UTC)
- `~/ecodiaos/patterns/render-deliverables-inline-in-chat-not-via-email-or-link.md` (NEW, 7 May 03:46 AEST, Tate verbatim 13:44 AEST 7 May)
- `~/ecodiaos/patterns/apple-dev-apns-auth-key-create-recipe.md` (NEW, 7 May 03:23 AEST, captured-recipe untested_spec)
- `~/ecodiaos/patterns/sy094-eos-mobile-headless-ship-recipe.md` (NEW, 7 May 03:21 AEST, validated_v1 SSH-headless ship)
- `~/ecodiaos/patterns/asc-app-record-create-recipe.md` (NEW, 7 May 03:16 AEST, captured-recipe untested_spec)
- `~/ecodiaos/patterns/xcode-signing-team-select-recipe.md` (NEW, 7 May 03:15 AEST, captured-recipe untested_spec, Mac-via-RDP pixel-only)

Sibling shipped artefacts (last 24h, from Neo4j):

- DeepSeek thinking-block sanitiser shipped (commit 68a5da9, 11 unit tests)
- EcodiaOS-mobile build 0.1.0(2) uploaded to TestFlight via SSH-headless path (delivery UUID 4ca8831d-a46a-423c-a054-2050951a4df2)
- ASC API key R8P6K38X47 generated + .p8 transmitted to SY094 (sub-object on `kv_store.creds.apple > value.asc_api_key`)
- AC_PASSWORD entry added to SY094 login.keychain
- iMessage outbound substrate migration off SSH (queue table + LaunchAgent on SY094 GUI Aqua context)
- Co-Exist INV-2026-003 sent to hello@coexistaus.org for $1,410.20 incl GST
- GKG Phase 1 capture daemon shipped (allowlist generous default per workshop verbatim)
- MacInCloud Remote Build Port (SSH) +AU$9/mo paid by Tate at 11:28 AEST, substrate-selection doctrine landed
- 4 captured recordings auto-emitted to recipe files (3 Win-side Apple-portal + ASC, 1 Mac-via-RDP Xcode)
- pattern-lifecycle frontmatter convention authored

---

## Section 1 - Gaps to add (rule, proposed exact text, target file)

### Gap 1.1 - Inline-render doctrine missing from `~/CLAUDE.md` Output Formatting

**Rule:** Tate verbatim 13:44 AEST 7 May 2026 codified inline-first chat presentation as a global rule: artefacts get rendered IN the chat (markdown tables, html code blocks, inline screenshots, code blocks, download buttons as secondary), never link-out or email as the primary surface. The aspirational reference is Jarvis / Samantha. The pattern file `~/ecodiaos/patterns/render-deliverables-inline-in-chat-not-via-email-or-link.md` is durable_doctrine and not cross-referenced from either CLAUDE.md, so it does not surface during chat-reply drafting where it matters most.

**Target file:** `~/CLAUDE.md`, "Output Formatting (Global Absolute Rules)" subsection of "Identity & Voice".

**Proposed insertion** (append as new numbered item 9, after the existing 1-8):

```
9. **Inline-render deliverables in chat, never link-out or email as the primary surface.** When delivering an artefact (PDF, report, audit, screenshot, diff, log excerpt, mobile preview, table of data, fork output) the PRIMARY surface is rendered inline in chat. External URLs / downloads / emails are FALLBACK only. Even when a link is genuinely needed (Vercel preview to interact with on phone, Stripe payment link), render the relevant CONTENT inline alongside the link. Never bare-link. Mechanics: html code blocks (rendered as live iframes), markdown tables, image rendering via Read tool, inline code blocks, download buttons as secondary affordance. Aspirational reference: Jarvis / Samantha. Origin: Tate verbatim 13:44 AEST 7 May 2026 during EOS Mobile session. Full: `~/ecodiaos/patterns/render-deliverables-inline-in-chat-not-via-email-or-link.md`.
```

### Gap 1.2 - Pattern-lifecycle doctrine missing from `~/ecodiaos/CLAUDE.md` Pattern Surfacing section

**Rule:** Today's pattern-lifecycle doctrine (`~/ecodiaos/patterns/pattern-lifecycle-active-narrowed-archived.md`, Tate verbatim 16:20 AEST 7 May "we need to codify it that you can tune them as we go so incase they're underutilised or overzealous") establishes three explicit lifecycle states (active / narrowed / archived) tracked in pattern frontmatter, plus tuning thresholds (NOT-APPLIED >70% over 7d -> narrow; zero fires >30d -> archive candidate; tagged_silent >50% over 7d -> retire or restate). The pattern corpus is now formally provisional, not sacred. This rule belongs surfaced in the Pattern Surfacing section of `~/ecodiaos/CLAUDE.md` so authoring + tuning forks find it.

**Target file:** `~/ecodiaos/CLAUDE.md`, "PATTERN SURFACING" section near top, immediately after the "Authoring new patterns" paragraph.

**Proposed insertion** (append a new "Pattern lifecycle and tuning" paragraph):

```
**Pattern lifecycle and tuning.** Patterns are provisional, not sacred. Three explicit states tracked in frontmatter: `active` (default, may be omitted), `narrowed` (triggers tightened after false-positive cluster, frontmatter records `narrowed_at` + `narrowed_reason`), `archived` (file moved to `~/ecodiaos/patterns/_archived/<slug>.md`, frontmatter records `archived_at` + `archived_reason` + `superseded_by`). Tuning thresholds: `[NOT-APPLIED]` rate >70% over 7d -> narrow triggers; zero fires >30d -> archive candidate (release recipes excepted); `tagged_silent` rate (Phase C) >50% over 7d -> retire OR restate; Tate-flagged false-positive in chat -> narrow OR archive same-arc. The weekly `pattern-corpus-health-check` cron (Sunday 21:00 AEST) reads Phase C telemetry, classifies each pattern, surfaces tuning candidates to a single status_board P3 row. Origin: Tate verbatim 16:20 AEST 7 May 2026. Full: `~/ecodiaos/patterns/pattern-lifecycle-active-narrowed-archived.md`.
```

### Gap 1.3 - GKG (GUI Knowledge Graph) substrate not surfaced in `~/ecodiaos/CLAUDE.md`

**Rule:** GKG is a new substrate shipped 7 May 2026 (Phase 1 capture daemon, broad-by-default allowlist, encrypted-at-rest with `kv_store.gkg.tate_payload_key`, redaction layer + tray-pause toggle for privacy posture). Spec at `~/ecodiaos/docs/gkg-spec-v0.1.md`. Allowlist doctrine `~/ecodiaos/patterns/gkg-allowlist-generous-default.md`. The substrate is not mentioned anywhere in `~/ecodiaos/CLAUDE.md` despite being a long-running daemon on Corazon that captures GUI state for future graph-builder use. Future-me opening a fresh session will not know GKG exists.

**Target file:** `~/ecodiaos/CLAUDE.md`, "Laptop Agent" section, after the "Macro doctrine" subsection.

**Proposed insertion** (new subsection):

```
### GKG - GUI Knowledge Graph (Phase 1 shipped 7 May 2026)

Long-running daemon on Corazon that captures GUI state across allowlisted SaaS / desktop apps as encrypted events for a future graph-builder cron (Phase 2). Phase 1 just ships the capture-and-store path; Phase 2 is the graph-builder that turns events into queryable nodes.

- Spec: `~/ecodiaos/docs/gkg-spec-v0.1.md`
- Capture daemon code: `~/ecodiaos/laptop-agent/daemons/` (ships through eos-laptop-agent on Corazon)
- Allowlist file: `~/ecodiaos/laptop-agent/daemons/gkg-allowlist.json`
- Allowlist doctrine: `~/ecodiaos/patterns/gkg-allowlist-generous-default.md` (broad default, narrow only on Tate-flagged noise)
- Privacy posture: layered (1) sensitive-context redaction by window-title / focused-element pattern match, (2) per-Tate AES-256-GCM at rest with `kv_store.gkg.tate_payload_key`, (3) tray pause toggle for one-click off
- Allowlist covers: every SaaS Tate uses regularly (developer.apple.com, appstoreconnect, console.firebase, vercel, supabase, github, bitbucket, stripe, xero, zernio, claude.ai, etc) plus dev desktop apps (Code.exe, Cursor.exe, Slack, Discord, Teams, Postman, AutoHotkey)
- GKG is the memory layer Anthropic computer-use queries; it is NOT a parallel build (per `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md`)

Origin: Tate verbatim 16:05 AEST 7 May 2026 ("default to broad allowlist, narrow only if I flag noise. Overcollection in Phase 1 is cheaper than missing a workflow") + 17:09 AEST authorising Phase 1 daemon ship.
```

### Gap 1.4 - DeepSeek-fallback sanitiser pattern not cross-referenced from provider-chain context

**Rule:** Today's 18-event 400-storm on `cc_session a427439a` between 03:51-03:58 UTC was diagnosed and fixed: the DeepSeek proxy must strip three coupled fields from in-flight Anthropic-shape requests (top-level `thinking` param, `thinking` / `redacted_thinking` content blocks, `cache_control` markers on system array form + content blocks). Fix shipped commit 68a5da9 + 11 unit tests. The new pattern `~/ecodiaos/patterns/deepseek-fallback-strips-anthropic-thinking-blocks.md` is durable doctrine but not cross-referenced from `~/ecodiaos/CLAUDE.md` "DeepSeek-only fallback" line where the chain is described.

**Target file:** `~/ecodiaos/CLAUDE.md`, "Factory" section, "DeepSeek-only fallback (5 May 2026)" paragraph.

**Proposed text change** (extend the existing line with a cross-ref to the new sanitiser doctrine):

```
**DeepSeek-only fallback (5 May 2026):** the provider chain is exactly `claude_max → claude_max_2 → deepseek` (when `DEEPSEEK_FALLBACK_ENABLED=true` + `DEEPSEEK_API_KEY` set). Bedrock is forbidden per `~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md` (Tate verbatim 12:40 AEST). The 1 May 2026 Bedrock validation deliverable is superseded. The DeepSeek proxy must sanitise Anthropic-shape requests at the wire boundary (strip top-level `thinking` param + thinking content blocks + `cache_control` markers) per `~/ecodiaos/patterns/deepseek-fallback-strips-anthropic-thinking-blocks.md` (origin: 18-event 400-storm on cc_session a427439a, 7 May 03:51-03:58 UTC, fix commit 68a5da9). The arrow character is a U+2192 single arrow, not an em-dash.
```

### Gap 1.5 - iOS release pipeline recipe cluster not cross-referenced from existing iOS recipe section

**Rule:** Today shipped a 4-recipe iOS release pipeline cluster covering the per-app one-time-setup arc (Apple Dev portal: bundle ID + APNs auth key download; ASC: app record create; Xcode: signing team select) plus the SSH-headless ship path now that the Remote Build Port +AU$9/mo add-on is live. The recipes are sister to `sy094-coexist-ios-release-recipe.md` (which is the GUI Xcode-Distribute-App flow). The new SSH-headless recipe is `validated_v1`; the three captured-from-recording recipes are `untested_spec`. None of the four are cross-referenced from `~/ecodiaos/CLAUDE.md` Laptop Agent / GUI recipes section where the iOS release recipe is listed.

**Target file:** `~/ecodiaos/CLAUDE.md`, "Laptop Agent" section, the paragraph that begins "**GUI recipes (codified GUI flows) are governed by**" and continues to the Co-Exist iOS recipe reference.

**Proposed insertion** (append a new sub-paragraph after the Co-Exist iOS recipe sentence):

```
**iOS release pipeline cluster (7 May 2026):** four sister recipes cover the per-app iOS release pipeline alongside the Co-Exist GUI recipe. (1) `~/ecodiaos/patterns/sy094-eos-mobile-headless-ship-recipe.md` (status: validated_v1, SSH-headless path via xcrun altool, ASC API key auth, end-to-end ~70s build+upload, 7 May verified shipped EcodiaOS-mobile 0.1.0(2)). (2) `~/ecodiaos/patterns/apple-dev-apns-auth-key-create-recipe.md` (status: untested_spec, captured Win-Chrome flow, Apple Developer portal APNs auth key create + download). (3) `~/ecodiaos/patterns/asc-app-record-create-recipe.md` (status: untested_spec, captured Win-Chrome flow, ASC create-app-record + internal-group access setup). (4) `~/ecodiaos/patterns/xcode-signing-team-select-recipe.md` (status: untested_spec, captured Mac-via-RDP flow, Xcode automatic-signing team selection, pixel-only-screenshot-verify replay because Mac-via-RDP is UIA-blind per `~/ecodiaos/patterns/mac-via-rdp-capture-is-pixel-only-uia-blind.md`). Cluster sequencing: per-app one-time setup runs (2) -> (3) -> (4), then per-build runs (1).
```

---

## Section 2 - Stale items (refs to outdated tooling, removed flags, superseded doctrine)

### Stale 2.1 - "Apple was added 4 May 2026" framing in `~/CLAUDE.md` is now incomplete

The line "Apple was added 4 May 2026 when iMessage was wired as the cheaper-than-Twilio primary contact channel; pre-existing Apple Developer team `Ecodia Pty Ltd` (team_id `86PUY7393S`) is the membership the same Apple ID owns" remains accurate but does not reflect that 7 May 2026 added an ASC API key surface (`R8P6K38X47`, issuer `4b45186b-49e4-4a25-8a63-afd28cf12d3f`) under the same Apple ID, with .p8 stored on SY094 + sub-object on `kv_store.creds.apple > value.asc_api_key`. This is operationally important because future iOS ship forks need to know an ASC API key already exists and where to find it.

**Target file:** `~/CLAUDE.md`, "The Business" section, "code@ecodia.au exists in exactly three places" paragraph (the Apple subclause).

**Proposed extension** (append to existing Apple subclause):

```
ASC API key R8P6K38X47 (issuer 4b45186b-49e4-4a25-8a63-afd28cf12d3f) generated 7 May 2026, .p8 lives on SY094 at `~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8` (mode 600), sub-object recorded on `kv_store.creds.apple > value.asc_api_key`. Powers SSH-headless TestFlight uploads via `xcrun altool --apiKey R8P6K38X47 --apiIssuer 4b45186b-49e4-4a25-8a63-afd28cf12d3f`.
```

### Stale 2.2 - MacInCloud SSH ban already lifted but two patterns still mention the ban verbatim

`~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md` still exists at the top-level `patterns/` directory rather than under `_archived/`. The 7 May 2026 doctrine `~/ecodiaos/patterns/macincloud-substrate-selection-ssh-vs-rdp.md` is the canonical replacement, and the pattern-lifecycle doctrine authored same day requires superseded patterns to be `git mv`'d to `_archived/<slug>.md` with `superseded_by` frontmatter. This is a same-day discipline violation: the lifecycle doctrine was written without applying it to the file that motivated it.

**Action:** `git mv ~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md ~/ecodiaos/patterns/_archived/sy094-access-via-ssh-not-macincloud-web-portal.md` (after creating `_archived/` directory) and edit the frontmatter to `status: archived`, `archived_at: 2026-05-07`, `archived_reason: 'Superseded by macincloud-substrate-selection-ssh-vs-rdp.md when Tate paid +AU$9/mo Remote Build Port add-on at 11:28 AEST 7 May 2026.'`, `superseded_by: macincloud-substrate-selection-ssh-vs-rdp.md`. Same drill if `never-use-ssh-on-macincloud-rdp-only.md` was already removed (grep confirms it no longer exists at top level, but a stub may need to live under `_archived/` for grep-history continuity per the lifecycle doctrine).

**Target file:** none (filesystem move + frontmatter edit).

---

## Section 3 - Missing cross-references (patterns authored but not linked from CLAUDE.md)

These are subsumed by Gaps 1.1 - 1.5. Listing in cross-ref form for the edit-fork's convenience:

- `~/ecodiaos/patterns/render-deliverables-inline-in-chat-not-via-email-or-link.md` not cross-ref'd from `~/CLAUDE.md` (Gap 1.1 fixes)
- `~/ecodiaos/patterns/pattern-lifecycle-active-narrowed-archived.md` not cross-ref'd from `~/ecodiaos/CLAUDE.md` (Gap 1.2 fixes)
- `~/ecodiaos/patterns/gkg-allowlist-generous-default.md` not cross-ref'd from `~/ecodiaos/CLAUDE.md` (Gap 1.3 fixes)
- `~/ecodiaos/patterns/deepseek-fallback-strips-anthropic-thinking-blocks.md` not cross-ref'd from `~/ecodiaos/CLAUDE.md` (Gap 1.4 fixes)
- `~/ecodiaos/patterns/sy094-eos-mobile-headless-ship-recipe.md` not cross-ref'd from `~/ecodiaos/CLAUDE.md` (Gap 1.5 fixes)
- `~/ecodiaos/patterns/apple-dev-apns-auth-key-create-recipe.md` not cross-ref'd (Gap 1.5 fixes)
- `~/ecodiaos/patterns/asc-app-record-create-recipe.md` not cross-ref'd (Gap 1.5 fixes)
- `~/ecodiaos/patterns/xcode-signing-team-select-recipe.md` not cross-ref'd (Gap 1.5 fixes)

---

## Section 4 - Structural issues (header order, findability, redundancy)

### Structural 4.1 - `_archived/` directory does not yet exist

The pattern-lifecycle doctrine references `~/ecodiaos/patterns/_archived/<slug>.md` as the canonical archive destination but the directory has not been created on disk (`ls -d ~/ecodiaos/patterns/_archived` returns "No such file or directory"). The first archival action (Stale 2.2 above) needs to `mkdir -p ~/ecodiaos/patterns/_archived` first, plus the `brief-consistency-check.sh` hook that path-restricts off `_archived/` per the lifecycle doctrine needs verification that it is applying the restriction. If the hook walks `patterns/*.md` recursively without exclusion, archived files will continue to fire keyword matches and the lifecycle benefit is null.

**Action:** edit-fork should `mkdir -p ~/ecodiaos/patterns/_archived` AND inspect `~/ecodiaos/scripts/hooks/brief-consistency-check.sh` for the `_archived` path-exclusion. If missing, add it. Ditto `cred-mention-surface.sh`, `episode-resurface.sh`, and any other hook that greps `~/ecodiaos/patterns/`.

### Structural 4.2 - Output Formatting numbered-list growth

`~/CLAUDE.md` "Output Formatting (Global Absolute Rules)" already has 8 numbered items. Adding inline-render as item 9 (Gap 1.1) keeps the list flat. Acceptable now, but if the next reflection adds another global-rule item, consider grouping items 7-9 (depth-over-breadth, no-retrospective-dumps, inline-render) under a "Conversational presentation" sub-heading because they all govern how I draft chat replies specifically. Defer to next reflection if no item 10 lands.

### Structural 4.3 - Captured-recipe TODO blocks

The three new captured-recipe files (`apple-dev-apns-auth-key-create-recipe.md`, `asc-app-record-create-recipe.md`, `xcode-signing-team-select-recipe.md`) all carry `<!-- TODO: list kv_store creds, state assumptions, prerequisite tools, foreground requirements (cowork-no-focus-collision check). -->` markers. These are placeholder pre-flight blocks the recipe-emitter wrote. The lifecycle doctrine says recipes are `untested_spec` until validated, but the TODO blocks themselves should be filled in BEFORE the first replay attempt because the pre-flight check is the gate that determines whether the replay is safe. Surfacing as P3 here, not authoring those bodies in this audit fork (per fork-by-default scope).

---

## Section 5 - Prioritised P1/P2/P3 to-do list with file paths and short rationale per item

### P1 (highest leverage, edit-fork applies same-arc)

- **P1.A** Apply Gap 1.1 (inline-render rule) to `~/CLAUDE.md` Output Formatting as item 9. Rationale: rule fires every time I draft a chat reply with an artefact, today's verbatim is freshest, applying same-arc maximises adherence over the next 24-72h.
- **P1.B** Apply Gap 1.4 (DeepSeek sanitiser cross-ref) to `~/ecodiaos/CLAUDE.md` Factory section. Rationale: 18-event 400-storm hit production today; the rule prevents the next storm if any future ship of the proxy regresses the sanitiser.
- **P1.C** Apply Stale 2.2 archival of `sy094-access-via-ssh-not-macincloud-web-portal.md` to `_archived/` (`mkdir -p _archived` first per Structural 4.1). Rationale: same-day lifecycle-doctrine violation if not fixed; fixing it is the worked example that proves the doctrine.

### P2 (high leverage, edit-fork applies if budget remains; otherwise next reflection)

- **P2.A** Apply Gap 1.2 (pattern-lifecycle subsection) to `~/ecodiaos/CLAUDE.md` Pattern Surfacing section. Rationale: meta-doctrine on doctrine-corpus health; surfaces in every pattern-authoring fork.
- **P2.B** Apply Gap 1.3 (GKG subsection) to `~/ecodiaos/CLAUDE.md` Laptop Agent section. Rationale: brand-new substrate; future cold-start sessions need to know GKG exists.
- **P2.C** Apply Gap 1.5 (iOS release recipe cluster) to `~/ecodiaos/CLAUDE.md` Laptop Agent / GUI recipes paragraph. Rationale: the SSH-headless ship path is the new default for iOS releases; the captured recipes are stage-gates that need to be findable when the next iOS ship runs.
- **P2.D** Apply Stale 2.1 (ASC API key Apple subclause extension) to `~/CLAUDE.md` "The Business" section. Rationale: future iOS ship forks need to discover the API key path without re-deriving from kv_store.

### P3 (low leverage, defer to next reflection or ad-hoc)

- **P3.A** Verify hook path-exclusion of `_archived/` in `brief-consistency-check.sh`, `cred-mention-surface.sh`, `episode-resurface.sh`. Rationale: if hooks walk archived files, lifecycle benefit is null.
- **P3.B** Fill in pre-flight TODO blocks in the three captured-recipe files BEFORE replaying for `validated_v1` flip. Rationale: pre-flight is the safety gate, replay before pre-flight is unsafe (Structural 4.3).
- **P3.C** If no global-rule item 10 lands by 2026-05-21, consider grouping items 7-9 under a "Conversational presentation" sub-heading in `~/CLAUDE.md` Output Formatting (Structural 4.2).
- **P3.D** Update `~/ecodiaos/docs/secrets/apple.md` to confirm sub-object schema for `value.asc_api_key` is current after the 7 May 2026 generation. Rationale: cred-rotation discipline (per `~/ecodiaos/patterns/cred-rotation-must-propagate-to-all-consumers.md`) requires the consumer-surface list to be current.

---

End of audit.
