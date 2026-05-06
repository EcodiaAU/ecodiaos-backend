---
triggers: gui-macro-discovery, macro-discovery-protocol, gui-intent-recognition, before-ssh, before-cu, before-input, before-mouse, before-browser, before-keyboard, recipe-grep, gui-recipe-surface, intent-to-macro, find-the-macro, open-macincloud, launch-macincloud, connect-to-macincloud, open-corazon, launch-rdp, mstsc, open-rdp-shortcut, drive-chrome, screenshot-tate-chrome, gui-task-detection, macro-registry, recipe-discovery, ssh-fumble-prevention, gui-bridge, intent-to-recipe-bridge, target-keyword-grep, ssh-before-grep, sshpass-before-grep, sshpass-sy094, sshpass-macincloud
priority: critical
canonical: true
---

# Before any GUI-driving tool, grep `~/ecodiaos/patterns/` for the target — the recipe is probably already authored

When the user (or a brief, or an internal plan) names a GUI target ("open macincloud", "drive chrome", "open ASC", "launch the RDP shortcut", "screenshot Tate's Vercel dashboard", "click the Stripe charge"), the FIRST tool call MUST be a grep across `~/ecodiaos/patterns/` for that target keyword. NOT `ssh`, NOT `sshpass`, NOT `cu.*`, NOT `input.*`, NOT `browser.*`, NOT `mouse.*`, NOT `keyboard.*`. The recipe is almost always already authored. Reaching for a low-level GUI primitive before the grep is the failure mode this pattern prevents.

## The rule

Before invoking any of the following tool surfaces with a GUI-shaped intent:

- `Bash` / `mcp__vps__shell_exec` with `ssh`, `sshpass`, `mstsc`, `Start-Process *.rdp`, `start chrome`, or any GUI-process spawn in the command
- `cu.*` (Anthropic computer-use API)
- `input.click`, `input.type`, `input.key`, `input.shortcut`, `input.drag`, `input.move`
- `mouse.*` (legacy)
- `keyboard.*` (legacy)
- `browser.navigate`, `browser.click`, `browser.type`, `browser.enableCDP`, `browser.pageScreenshot`
- `screenshot.screenshot` (when paired with the intent of "find the thing then click it")

...the conductor MUST first run:

```
Grep "triggers:" ~/ecodiaos/patterns/ -A 1 | grep -i <target_keyword>
```

If the grep returns ≥1 hit, READ the matched recipe in full BEFORE the GUI primitive call. If the grep returns 0 hits, then the GUI primitive is the only path, and the work flow becomes "compose primitives, capture the run, author a new recipe per `~/ecodiaos/patterns/gui-recipes-authoring-optimisation-and-verification.md`."

## Known GUI targets — keyword → recipe path

| User-intent keyword(s) | Recipe path | Verified runtime |
|---|---|---|
| macincloud, sy094, "open macincloud", "launch macincloud", "connect to macincloud", "macincloud GUI", "RDP shortcut", "MacinCloud_Full_Screen.rdp" | [`sy094-gui-entry-via-desktop-rdp-shortcut.md`](sy094-gui-entry-via-desktop-rdp-shortcut.md) | 23.6s end-to-end (4 May 2026) |
| ios release, asc upload, "App Store Connect upload", coexist ios, capacitor ios, xcode archive, "ship iOS build" | [`sy094-coexist-ios-release-recipe.md`](sy094-coexist-ios-release-recipe.md) | ~10min end-to-end (4 May 2026) |
| corazon, "Tate's Chrome", "drive chrome", "open chrome on Corazon", "screenshot Tate's browser" | [`drive-chrome-via-input-tools-not-browser-tools.md`](drive-chrome-via-input-tools-not-browser-tools.md) + [`corazon-is-a-peer-not-a-browser-via-http.md`](corazon-is-a-peer-not-a-browser-via-http.md) | n/a (procedural) |
| tailscale, laptop-agent, "drive UI via tailscale", "macro replaces cowork" | [`tailscale-macro-replaces-cowork.md`](tailscale-macro-replaces-cowork.md) | n/a (procedural) |
| ssh sy094, sshpass sy094, "ssh into macincloud" | [`never-use-ssh-on-macincloud-rdp-only.md`](never-use-ssh-on-macincloud-rdp-only.md) (anti-pattern - SSH is forbidden, redirects to RDP) | n/a |
| cowork, ctrl+e, "side panel", "claude desktop UI" | [`claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md`](claude-cowork-is-the-1stop-shop-for-ui-driving-tasks.md) (DEPRECATED 5 May 2026, indexed historically so the conductor doesn't accidentally reach for it - use the Tailscale laptop-agent direct path instead) | n/a |
| recipe-authoring, "how do I write a recipe", "GUI flow codify", recipe-anatomy | [`gui-recipes-authoring-optimisation-and-verification.md`](gui-recipes-authoring-optimisation-and-verification.md) | n/a (meta-doctrine) |

## Anti-patterns

1. **Reaching for `sshpass -p ... ssh user276189@SY094.macincloud.com` when the user says "open macincloud".** SSH is forbidden on SY094 per `never-use-ssh-on-macincloud-rdp-only.md`. The RDP shortcut on Corazon's desktop is the canonical path and is already verified at 23.6s. The grep would have surfaced this immediately.
2. **Reaching for `browser.navigate` when the user says "open Tate's Chrome and screenshot the Vercel dashboard".** `drive-chrome-via-input-tools-not-browser-tools.md` says use `input.shortcut [ctrl,l]` + `input.type` against Tate's existing Chrome, not a fresh Puppeteer profile.
3. **Reaching for `cu.*` (Anthropic computer-use) when the recipe already exists.** `cu.*` is the FALLBACK for OS-level / desktop-app flows where the laptop-agent path can't reach. Authored recipes via `input.*` + `screenshot.*` come first.
4. **Composing `input.*` primitives from scratch when the recipe already enumerates verified coordinates.** Re-deriving coords from screenshots when the recipe table lists them is waste.
5. **Skipping the grep "because I remember the recipe."** Recipes update (verified runtimes shrink as fast paths are discovered, coords drift on Windows updates, Apple ID flows change). Re-grep on every fresh user mention.

## Worked example

**Intent:** "open the macincloud instance"

**Wrong path (the failure mode):**
1. `sshpass -p ... ssh user276189@SY094.macincloud.com` (5+ min fumble)
2. Notice doctrine on SSH-forbidden
3. `Grep` patterns dir for "macincloud" (finally)
4. Read `sy094-gui-entry-via-desktop-rdp-shortcut.md`
5. Execute the recipe
6. Total: 8-15min, three context-thrashes

**Right path (this protocol):**
1. `Grep "triggers:" ~/ecodiaos/patterns/ -A 1 | grep -i macincloud` → 3 hits (rdp-shortcut, never-ssh, ios-release)
2. Read `sy094-gui-entry-via-desktop-rdp-shortcut.md` (1min)
3. Execute the verified 23.6s recipe (`Start-Process .../MacinCloud_Full_Screen.rdp` + cred entry from `kv_store.creds.macincloud`)
4. Total: ~1.5min including read time

## Discovery cadence

- Every fresh user mention of a known-target verb → re-grep, even if the conductor "remembers" it
- Every cron-fire / scheduled-task that names a GUI target in its prompt → re-grep BEFORE the first turn-tool-call
- Every fork brief that references a GUI surface → grep MUST appear in the fork's first 2 turns or the fork brief is missing the discovery layer

## Mechanical enforcement

PreToolUse hook `~/ecodiaos/scripts/hooks/gui-macro-discovery-surface.sh` fires on:
- `Bash` / `mcp__vps__shell_exec` (commands containing `ssh`, `sshpass`, `mstsc`, `Start-Process *.rdp`, `start chrome`, `open -a "Google Chrome"`)
- `mcp__forks__spawn_fork`, `mcp__factory__start_cc_session` (briefs referencing GUI targets)

Detects GUI-target keywords (macincloud / sy094 / corazon / chrome / vercel / stripe / asc / appstoreconnect / firebase / google cloud console / supabase dashboard / xero / bitbucket / github web / canva / zernio / play console / resend / RDP / mstsc) and emits one `[GUI-MACRO HINT]` line per match to stderr (model-visible). Warn-only, never blocks.

Filters `[APPLIED]`, `[NOT-APPLIED]`, `[GUI-MACRO HINT]`, `[BRIEF-CHECK WARN]`, `[CONTEXT-SURFACE WARN/PRIMARY/ALSO]`, `[CRED-SURFACE WARN]`, `[FORCING WARN]`, `[COWORK-FIRST WARN]` lines before keyword regex per `~/ecodiaos/patterns/hooks-must-not-fire-inside-applied-pattern-tags.md`.

## User-message-arrival surfacing

The trigger-keyword surfacing layer at `src/services/osSessionService.js _sendMessageImpl` (wired 1 May 2026 per Decision "Cron-fire + Tate-message context-injection found shipped + superseded 1 May 2026") SHOULD also detect GUI-target keywords in Tate's incoming messages and inject a `<doctrine_surface>` block listing matching recipes BEFORE the conductor's first turn-tool-call. This is the user-message-arrival surface; the PreToolUse hook above is the dispatch-time fallback.

## Cross-references

- [`gui-recipes-authoring-optimisation-and-verification.md`](gui-recipes-authoring-optimisation-and-verification.md) - meta-doctrine for HOW to author + optimise + verify GUI recipes (10-section anatomy, 5-step authoring, 7-step optimisation, verification tier hierarchy)
- [`corazon-is-a-peer-not-a-browser-via-http.md`](corazon-is-a-peer-not-a-browser-via-http.md) - Corazon as a peer (69 tools across 9 modules), not a browser-wrapper
- [`drive-chrome-via-input-tools-not-browser-tools.md`](drive-chrome-via-input-tools-not-browser-tools.md) - `input.*` + `screenshot.*` against Tate's logged-in Chrome, not `browser.*`/CDP/spawn
- [`never-use-ssh-on-macincloud-rdp-only.md`](never-use-ssh-on-macincloud-rdp-only.md) - SY094 SSH banned 5 May 2026; RDP-shortcut canonical
- [`tailscale-macro-replaces-cowork.md`](tailscale-macro-replaces-cowork.md) - Tailscale laptop-agent is the universal UI-driving substrate; Cowork deprecated
- [`hooks-must-not-fire-inside-applied-pattern-tags.md`](hooks-must-not-fire-inside-applied-pattern-tags.md) - hook tag-line filtering discipline
- [`context-surfacing-must-be-reliable-and-selective.md`](context-surfacing-must-be-reliable-and-selective.md) - all 5 doctrine-layer requirements (file-per-thing, triggers frontmatter, grep protocol, mechanical hook, semantic fallback)
- [`when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block.md`](when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block.md) - SSH-forbidden is a routing problem, not a block; the recipe IS the route

## Origin

Tate verbatim 6 May 2026 ~09:50 AEST: "We need to solidify the way you convert plans, instructions etc, into tailscale gui plans. Right now if i asked you to open the macincloud instance you'd probably do some dumb shit with the ssh, realise there is a doctrine against it, then figure oit out really really slowly.... all while you have a macro stored that could help you do it in seconds. We need to bridge that gap so that you can always know if something is gui-based, if it has a macro, and how to get that macro and others quickly"

Shipped fork_mota9sry_f35b1c on 6 May 2026.
