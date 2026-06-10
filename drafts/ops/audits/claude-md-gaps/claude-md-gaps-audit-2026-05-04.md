# CLAUDE.md gaps audit - 2026-05-04 AEST

Author: fork_mor13pl5_cf1f0c (claude-md-reflection cron, 20:00 AEST 2026-05-04)

Methodology: read both CLAUDE.md files end-to-end; mined recent pattern files (last 24h - 5 new patterns + 1 substantial extension); queried Neo4j for Decisions/Episodes in the last 24h (15 matches captured all today's Tate-verbatim quotes); cross-referenced new patterns against the canonical CLAUDE.md texts for cross-ref coverage. NO em-dashes in this file (hyphen-with-spaces or restructured).

Pattern files authored or extended in the last 24h (4 May 2026 AEST):
- `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` (NEW, 19:48 AEST, Tate verbatim 19:41 + 19:51)
- `~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md` (NEW, 19:24 AEST, Tate verbatim 19:22)
- `~/ecodiaos/patterns/crons-route-to-forks-by-default.md` (NEW, 19:38 AEST, Tate verbatim 19:30)
- `~/ecodiaos/patterns/code-at-ecodia-au-is-only-google-workspace-and-claude-max.md` (UPDATED in place to three-place doctrine, 18:51 AEST, Tate verbatim 18:46)
- `~/ecodiaos/patterns/visual-test-before-push-when-tate-not-around.md` (NEW, 18:42 AEST, Tate verbatim 18:39)
- `~/ecodiaos/patterns/fork-result-fallback-must-be-marked.md` (EXTENDED 05:09 UTC with brief-prefix slicing telemetry, fork_moqqickb_dee99b)

Sibling shipped artefacts (4 May 2026):
- iMessage primary contact channel wiring (commit 2eebf92, fork_moqyjzox_763fdb, status_board be228f95). Twilio SMS demoted to fallback.
- Cron fork-routing collapse (commit df030e7, fork_mor03y5f_41b5f9). 11 crons moved DIRECT_EXEC -> HIGH_PRIORITY_FORK; only `meta-loop` stays on conductor.
- Autonomous window 1-4 May closed at 12:00 AEST. Cron 158d02df cancelled, kv_store flags cleared.

---

## Section 1 - Gaps to add (rule, proposed exact text, target file)

### Gap 1.1 - Visual-test-before-push doctrine missing from `~/CLAUDE.md`

**Rule:** UI changes must be visually verified before being declared shipped (Mode A localhost build + screenshot, or Mode B push-test-revert for tight tweaks). Mandatory in autonomous windows; concession when Tate is around.

**Target file:** `~/CLAUDE.md`, after the existing "Smoke testing (after EVERY code change on client work)" subsection inside "Client Dev Work - Autonomy on External Codebases".

**Proposed exact text** (insert as new subsection):

```
**Visual verification (UI changes, mandatory in autonomous windows):**
- Tate-not-around: Mode A localhost preferred. Run dev/build, drive Corazon Chrome or Puppeteer, screenshot the modified surface in expected state, screenshot a second time reproducing the bug or feature. Only commit + push after artefact captured.
- Tate-around: Mode B (push-test-revert) acceptable. Push, watch live URL within 3 minutes, screenshot working, revert clean if broken. Fix locally, never forward-fix amid a regression.
- The screenshot is the artefact that proves "tested". Bare narration "tested OK" is insufficient.
- Fork briefs producing UI changes default to Mode A unless explicitly tight-tweak with named revert command.
- Doctrine: ~/ecodiaos/patterns/visual-test-before-push-when-tate-not-around.md (Origin: Tate verbatim 4 May 2026 18:39 AEST).
```

### Gap 1.2 - Crons-route-to-forks doctrine missing from `~/ecodiaos/CLAUDE.md`

**Rule:** Every active cron in `os_scheduled_tasks` routes through `cronForkDispatcher` and spawns an ephemeral fork. The only legitimate `CONDUCTOR_CRONS` member is `meta-loop`. `DIRECT_EXEC_CRONS` is empty and must stay empty unless Tate explicitly authorises a re-add.

**Target file:** `~/ecodiaos/CLAUDE.md`, replace the existing "Core operating loops" / "Intelligence & growth" / "Operations" cron taxonomy preamble in the "Scheduling & Autonomy" section with a routing-rule preamble that the existing cron list inherits from.

**Proposed exact text** (insert immediately after the "Scheduling & Autonomy" header, before "Core operating loops"):

```
**Routing rule (4 May 2026, canonical):** all crons route to forks via `cronForkDispatcher` by default. `CONDUCTOR_CRONS` set contains exactly `meta-loop` and nothing else; that one cron IS the conductor's CEO judgment cycle and runs on main chat by design. `DIRECT_EXEC_CRONS` set is empty. Re-adding ANY cron to either set requires explicit Tate authorisation. New crons go to `HIGH_PRIORITY_FORK_CRONS` (always run, budget bypass) or `LOW_PRIORITY_FORK_CRONS` (skipped under budget pressure). Doctrine: ~/ecodiaos/patterns/crons-route-to-forks-by-default.md. Origin: Tate verbatim 4 May 2026 19:30 AEST. Sibling: ~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md (cron firing != work happened; verify substrate).
```

### Gap 1.3 - SY094 access doctrine split missing from `~/ecodiaos/CLAUDE.md` SY094 section

**Rule:** SY094 has TWO canonical paths (SSH from VPS for headless, RDP shortcut from Corazon for GUI). The macincloud.com web portal and Citrix HTML5 client are forbidden.

**Target file:** `~/ecodiaos/CLAUDE.md`, "SY094 (MacInCloud Mac)" subsection of the laptop-agent section.

**Proposed exact text** (replace existing SY094 subsection content):

```
### SY094 (MacInCloud Mac)
- SSH: `sshpass -p 'PASSWORD' ssh -o PubkeyAuthentication=no user276189@SY094.macincloud.com`. Optional SSH-tunnel `-L 17456:localhost:7456 -fN` for the on-Mac agent.
- Token: `creds.macincloud` (under `agent_token`)
- macOS 15.7.4, Apple Silicon, 16GB, Xcode 26.3
- Has Claude.app, Cursor, Android Studio, Firefox, Messages.app (signed into Apple ID code@ecodia.au for iMessage primary contact channel)

**Two canonical access paths, neither is the macincloud.com web portal:**
1. **SSH from VPS** for headless / scripted work (xcodebuild, xcrun altool, simctl headless, git, file CRUD, process listing, iMessage send via osascript). Default for ALL non-GUI work. See ~/ecodiaos/clients/macincloud-access.md.
2. **Desktop RDP shortcut** on Corazon (`MacinCloud_Full_Screen.rdp` on the user desktop) for Xcode signing UI, Simulator GUI, Keychain Access, App Store Connect Transporter, Apple Developer signing flows. Microsoft RDP, NOT Citrix. Procedure verified working 4 May 2026 19:43 AEST. Coordinates on 1366x768 Corazon: Show-desktop sliver (1364,766), security checkboxes (550,343)+(550,363), Connect (822,442), Mac login Name (685,275). Target end-to-end <90 seconds with known coords. See ~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md for full step-by-step.

**Forbidden** (Tate verbatim 4 May 2026 19:22 AEST): macincloud.com web portal in any browser, desktop.macincloud.com Citrix HTML5, fullscreen Citrix Workspace, third-party VNC. See ~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md.
```

### Gap 1.4 - iMessage primary contact channel missing from `~/CLAUDE.md` SMS section

**Rule:** iMessage is now primary contact channel from EcodiaOS to Tate's phone (cost: $0/iMessage vs $0.05/SMS segment). Twilio SMS is fallback when iMessage path is degraded. Wired via `osAlertingService._sendSms` -> `_sendIMessage` first then `_sendTwilio` fallback, gated on `USE_IMESSAGE_PRIMARY` env (default '1').

**Target file:** `~/CLAUDE.md`, "SMS to Tate" subsection of "Client Communication".

**Proposed exact text** (replace section header and prepend new paragraph; preserve existing two-pattern stack content):

```
### Contact channel to Tate (iMessage primary, SMS fallback)

iMessage is the primary outbound contact channel from EcodiaOS to Tate's phone as of 4 May 2026. Twilio SMS is the fallback when the iMessage path is degraded. Both routes share the same emergency-mode suppression gate (`securityIncidentResponse.fireIncident()`).

- **iMessage path**: SSH to SY094 + osascript send via Messages.app signed into Apple ID code@ecodia.au. Code: `skills/tate-msg/index.js`. Health canary: `imessagePathHealthCheck.js` runs every 6h, writes `kv_store.health.imessage_path`.
- **Twilio fallback**: `osAlertingService._sendTwilio`. Triggers when `_sendIMessage` returns ok:false or USE_IMESSAGE_PRIMARY=0.
- Cost framing: iMessage $0, Twilio ~$0.05/segment. SMS-bleed events have hit $1+/hour during incident loops; iMessage primary closes that risk surface.

The two-pattern segment-economics + one-update-per-fix stack still governs every Twilio SMS fallback (because cost still matters when the fallback fires). Both patterns apply to iMessage too: be concise, no running commentary, AT MOST ONE update per fix arc.

- ~/ecodiaos/patterns/sms-segment-economics.md - 1 GSM segment ~$0.05 AUD, 160-char cap (70-char Unicode), strip filler/greetings/signoffs.
- ~/ecodiaos/patterns/sms-one-update-per-fix-not-running-commentary.md - AT MOST ONE message per fix arc; the resolution verdict.

Cross-refs: ~/ecodiaos/patterns/silent-alerts-defer-when-tate-is-live.md, ~/ecodiaos/patterns/no-retrospective-dumps-in-director-chat.md, ~/ecodiaos/patterns/code-at-ecodia-au-is-only-google-workspace-and-claude-max.md (the Apple-ID surface that owns the iMessage handle).
```

### Gap 1.5 - Cron-fire deliverable discipline section in `~/ecodiaos/CLAUDE.md` needs revision now that crons route to forks

**Rule:** Pre-routing-fix discipline ("verify deliverable on substrate after every cron fire") still applies but the failure surface narrowed: now the ONLY conductor-stream cron is `meta-loop`. The narrative around silent fork-dispatched crons is the conditional-deliverable case (`cron-deliverables-can-be-conditional-not-all-fires-must-ship.md`).

**Target file:** `~/ecodiaos/CLAUDE.md`, "Cron-fire deliverable discipline" subsection.

**Proposed exact text** (replace existing paragraph):

```
### Cron-fire deliverable discipline

A cron firing means the prompt was delivered, NOT that the work happened. Post-routing-fix (4 May 2026 commit df030e7), cron prompts route to forks by default; the conductor only sees `meta-loop`. Discipline applies at TWO substrates now:
1. The fork-side: every fork-dispatched cron prompt that declares a deliverable (file write, status_board update, neo4j write, email send) MUST cause the fork to emit at least one substrate-landing tool call before exit. Fork bails without an artefact = `cron_silent_fire` failure. Detection: meta-loop queries `os_scheduled_tasks` completed-last-hour, checks each fork's `os_forks` row for substrate writes.
2. The conductor-side (meta-loop only): the same check, but the deliverable lives in the conductor's own next 1-2 turns of action.

Sibling pattern pair: ~/ecodiaos/patterns/cron-fire-must-have-deliverable-not-just-narration.md (unconditional case) + ~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md (conditional case where silent success is correct, e.g. INDEX regen no-diff exit, telemetry under-threshold no-trip, claude-md-reflection clean-audit run).

Cross-ref: ~/ecodiaos/patterns/crons-route-to-forks-by-default.md (the routing layer that fixes cron-pollutes-chat at substrate). The 1 May 2026 manual-recovery posture for claude-md-reflection (file silently absent on disk despite cron fire) is now the structural-fix landing 4 May (this fork is itself a cron-routed fork).
```

---

## Section 2 - Stale items

### Stale 2.1 - `~/ecodiaos/CLAUDE.md` SY094 paragraph: "2026-04-27: agent NOT running"

The paragraph "**2026-04-27: agent NOT running.** Source staged at `~/eos-laptop-agent` but Node.js not installed in MacInCloud user shell..." is partially stale. iMessage shipped 4 May 2026 (commit 2eebf92) using SSH+osascript directly, no on-Mac agent dependency. The agent's role narrowed; Mac-only work via SSH is the canonical path now per Gap 1.3 above. Recommend dropping the dated paragraph and merging the SSH-fallback sentence into the new SY094 section text proposed above.

### Stale 2.2 - `~/ecodiaos/CLAUDE.md` INDEX.md regen description

Existing text: "INDEX.md is regenerated by the daily 22:00 AEST `daily-index-regen` cron (task id `c2606d3b...`). The cron fires correctly but is vulnerable to PM2 warmup-collision... manual sync IS permitted as a recovery path inside an audit/edit fork."

Stale because of Decision id "INDEX.md regen moved off fork dispatch 2026-05-04" (Episode 4174 timestamped 3 May 2026 17:11 AEST, commit 773697d). The cron now executes the script `~/ecodiaos/scripts/regen-patterns-index.js` directly (cron prompt updated). Fork-budget exhaustion is no longer the failure mode for this specific cron.

**Proposed update:** Replace the paragraph with:

```
- INDEX.md is regenerated by the daily 22:00 AEST `daily-index-regen` cron (task id `c2606d3b-f115-4387-b41e-9b16c8c552ca`). Per Decision 2026-05-04 (commit 773697d), the cron now invokes `~/ecodiaos/scripts/regen-patterns-index.js` directly rather than dispatching a fork (deterministic walk over patterns/*.md, no agentic decision component, fork overhead was waste). Cron prompt instructs the firing turn to run the script and insert a P3 status_board row only on non-zero exit; silent success on no-diff is correct per ~/ecodiaos/patterns/cron-deliverables-can-be-conditional-not-all-fires-must-ship.md. Status_board row `e86b6437-1315-47b7-87f4-cd6481256966` (warmup-grace gate) tracks the broader PM2 warmup-collision investigation, which still applies to fork-dispatched crons.
```

### Stale 2.3 - `~/ecodiaos/CLAUDE.md` mentions of `DIRECT_EXEC_CRONS` semantically

The phrase does not appear verbatim, but the underlying concept (some crons stay on conductor stream) is implicit in the existing cron taxonomy. Now that the carve-out is dead, the operating model is "fork by default, meta-loop is the only exception". Captured by Gap 1.2 above.

### Stale 2.4 - Pattern filename `code-at-ecodia-au-is-only-google-workspace-and-claude-max.md`

The file's H1 and content correctly state THREE places (Google + Anthropic + Apple) per 4 May 2026 update, but the filename still names two of the three. Filename is stale; pattern body is current. Low cost to rename.

**Proposed action (P3):** Rename `code-at-ecodia-au-is-only-google-workspace-and-claude-max.md` -> `code-at-ecodia-au-is-google-anthropic-apple-only.md`. Update cross-refs in:
- `~/CLAUDE.md` line ~204 (the canonical three-vendor sentence)
- `~/ecodiaos/patterns/sms-segment-economics.md` (if it cross-refs)
- `~/ecodiaos/patterns/code-at-ecodia-au-is-only-google-workspace-and-claude-max.md` Cross-references list (self-ref)
- `~/ecodiaos/CLAUDE.md` after Gap 1.4 lands (the new SMS section will cross-ref)
- `~/ecodiaos/patterns/INDEX.md` next regen
Defer until next pattern-rename pass; not blocking.

---

## Section 3 - Missing cross-references (patterns authored but not linked from CLAUDE.md)

### CrossRef 3.1 - `visual-test-before-push-when-tate-not-around.md` orphaned

No cross-ref from `~/CLAUDE.md` or `~/ecodiaos/CLAUDE.md`. Closed by Gap 1.1 above.

### CrossRef 3.2 - `crons-route-to-forks-by-default.md` orphaned

No cross-ref from `~/ecodiaos/CLAUDE.md`. Closed by Gap 1.2 above.

### CrossRef 3.3 - `sy094-gui-entry-via-desktop-rdp-shortcut.md` orphaned

No cross-ref from `~/ecodiaos/CLAUDE.md`. Closed by Gap 1.3 above.

### CrossRef 3.4 - `sy094-access-via-ssh-not-macincloud-web-portal.md` orphaned

No cross-ref from `~/ecodiaos/CLAUDE.md`. Closed by Gap 1.3 above.

### CrossRef 3.5 - `code-at-ecodia-au-is-only-google-workspace-and-claude-max.md` referenced but not from SMS section

`~/CLAUDE.md` line 204 area references the pattern. The new SMS-to-Tate section (Gap 1.4) needs a cross-ref to the same pattern because iMessage's surface IS the Apple-ID identity scoped by that pattern. Closed by Gap 1.4 above.

### CrossRef 3.6 - iMessage Episode lacks a CLAUDE.md anchor

The 4 May 2026 iMessage primary-channel ship (Episode "iMessage primary contact channel wiring shipped 4 May 2026", fork_moqyjzox_763fdb, commit 2eebf92) is not anchored in either CLAUDE.md. Closed by Gap 1.4 above (the proposed SMS section text names the wiring file paths and the canary cron).

---

## Section 4 - Structural issues

### Struct 4.1 - SY094 doctrine spread across 4 files

The SY094 access pattern is now spread across:
- `~/ecodiaos/clients/macincloud-access.md` (canonical SSH access pattern - presumed current)
- `~/ecodiaos/docs/secrets/macincloud.md` (credential record + rotation behaviour)
- `~/ecodiaos/patterns/sy094-access-via-ssh-not-macincloud-web-portal.md` (route discipline, NEW)
- `~/ecodiaos/patterns/sy094-gui-entry-via-desktop-rdp-shortcut.md` (GUI procedure, NEW)

This is correct file-per-thing discipline (per `~/ecodiaos/patterns/context-surfacing-must-be-reliable-and-selective.md`). Keep them split. The audit's response is to ensure `~/ecodiaos/CLAUDE.md` SY094 subsection cross-refs all four (Gap 1.3 covers two; existing text cross-refs the others). No structural change needed beyond Gap 1.3.

### Struct 4.2 - Cron taxonomy bleeds across 3 sections in `~/ecodiaos/CLAUDE.md`

Cron-related guidance currently lives in:
- "Scheduling & Autonomy" (cron list, intervals)
- "Cron-fire deliverable discipline"
- "Mechanical surfacing hooks" -> "Cron-fire + Tate-message context-injection"
- Pattern references scattered

After Gap 1.2 + Gap 1.5 land, the canonical entry-point becomes "Routing rule (4 May 2026, canonical)" inside Scheduling & Autonomy, which links to the relevant patterns. No restructure beyond those gap fills; current header order is fine.

### Struct 4.3 - Visual verification doctrine implicit but not centralised

`~/CLAUDE.md` has "Quality Patterns (Code Review Checklist)", "Smoke testing", "Delivery Checklist", but no "Visual verification" subsection. The doctrine is implicit ("Mobile responsive tested. Desktop tested (Chrome + Safari). No console errors. Forms/CTAs actually work (test submission)." in Delivery Checklist). 4 May 2026 directive raised the bar for autonomous-window UI changes specifically. Gap 1.1 addresses; new subsection slots cleanly between "Smoke testing" and "Autonomy checklist".

### Struct 4.4 - `~/ecodiaos/CLAUDE.md` Scheduling section is dense

The cron list in the Scheduling section is long (10+ named crons) and has not been audited for "still active" since the autonomous-window work in late April. Out-of-scope for today's audit, but flag for next reflection: each cron in the list should map 1:1 to a row in `os_scheduled_tasks` with `status='active'`. Items that no longer have active rows should be removed from the doc.

---

## Section 5 - Prioritised P1/P2/P3 to-do list

### P1 (high-leverage, surfaces frequently, take this turn or next)

- **P1.1** Apply Gap 1.2 (crons-route-to-forks routing rule) to `~/ecodiaos/CLAUDE.md`. High-leverage because cron pollution was an active pain point, fix is fresh, doctrine needs to surface to every conductor before next cron architecture decision. Estimated effort: <5 min edit.
- **P1.2** Apply Gap 1.3 (SY094 two-canonical-paths) to `~/ecodiaos/CLAUDE.md` SY094 subsection. Replaces stale "agent NOT running 2026-04-27" content (Stale 2.1) and cross-refs both new patterns (CrossRef 3.3 + 3.4). Combined edit. <5 min.
- **P1.3** Apply Gap 1.4 (iMessage primary contact channel) to `~/CLAUDE.md` SMS-to-Tate subsection. High-leverage because iMessage shipped today and contact-channel cost was a recurring pain. <5 min.
- **P1.4** Apply Gap 1.1 (visual-test-before-push) to `~/CLAUDE.md` Client Dev Work section. High-leverage because UI ships happen often and this directive landed mid-Co-Exist sync work; first non-Tate-around UI ship without it would be a regression. <3 min.

### P2 (less frequent, can land in this audit cycle but no blocker)

- **P2.1** Apply Gap 1.5 (cron-fire deliverable discipline rev) to `~/ecodiaos/CLAUDE.md`. Updates the existing paragraph rather than replacing wholesale. <5 min.
- **P2.2** Apply Stale 2.2 (INDEX.md regen direct-script note) to `~/ecodiaos/CLAUDE.md`. Standalone paragraph replacement. <3 min.
- **P2.3** Verify `~/ecodiaos/clients/macincloud-access.md` is current; if it predates the iMessage wiring, append a section linking to `skills/tate-msg/index.js` and the imessagePathHealthCheck cron. Read-then-edit. <10 min.

### P3 (cosmetic / future passes)

- **P3.1** Rename `code-at-ecodia-au-is-only-google-workspace-and-claude-max.md` per Stale 2.4. Defer to next pattern-rename pass; not blocking.
- **P3.2** Audit Scheduling section cron list against live `os_scheduled_tasks` (Struct 4.4). Out of scope for today, log as a future reflection target.

---

## Audit notes for the edit fork (when main spawns it)

- The proposed text blocks above are intended to be applied verbatim. Each is delimited and labelled by Gap number.
- Edit fork should preserve existing CLAUDE.md voice (terse, direct, peer-style, no em-dashes, hyphens-with-spaces, contrarian where applicable).
- After edits land: verify with grep for "em-dash" character (U+2014) and any of the 5 new pattern filenames - both should appear in the relevant CLAUDE.md after the edit ships.
- Commit message: `claude-md: 4 May 2026 reflection - cron-fork routing + SY094 split + iMessage primary + visual-test discipline`. Stamp with audit fork id `fork_mor13pl5_cf1f0c` in the commit body.
- Conservative scope: 4 P1 items + 3 P2 items. Optional: 0 P3 items (defer).
- No new pattern files needed; all five doctrines already authored on disk.
