---
title: Weekly session-corpus mining - candidate doctrine for 2026-06-01 to 2026-06-08
generated_by: cron session-corpus-mining-weekly
generated_at: 2026-06-08 09:30 AEST
task_id: ae4f4977-8463-464d-b6bf-fe179b639686
window: 7 days
sources_scanned: ~272 session JSONLs across two project dirs (Corazon legacy + Mac canonical)
tate_voice_candidates: 138 rule-shaped lines after filter
final_candidates: 8 (capped at 15 per cron spec)
---

# Candidate doctrine - week ending 2026-06-08

Eight candidates surface for conductor review and authoring during the next
doctrine-synthesis window. Ordered by leverage. Each candidate carries the
Tate-verbatim quote(s) that motivate it, the gap vs existing patterns I
verified by grep, and a draft rule statement.

The corpus mined this week is unusually rich because the cron-corpus install
(2026-06-03 to 2026-06-04) plus the conductor migration from Corazon to Mac
plus the Lost Me / Nearby greenfield work all produced load-bearing Tate
verbatim that has not yet landed in patterns/.

Cap-aware: I held to 8 strong candidates rather than the 15 limit. The
selection pressure is on quality, not coverage.

---

## 1. Worker tab self-closes mid-heartbeat or mid-Tate-typing (P0, recurring)

**Tate verbatim (this week):**
- "Bro wtf stop.... i litereally jsut said that it worked, the non-simple brief worked. But while im typing this message the tab literally jsut closed itself. So do it one more time"
- "so why are we not fixing it then.... the chat before sent the prompt, sent a heartbeat, and was about to work then the chat closed, stoppping the work from ever happening despite eveythign going perfectly"
- "ohhhhh wait so this will fix that exact bug i jsut said about it going well and then jsut rnadomly closing?"
- "Ayo. I jsut hada chat sue the scheduler, a chat opened, prompt pasted, the message didnt get sent, then idk something timed out and that new chat tab closed, then when i was typing to that chat again the ctrl enter FINALLY went through midway through me typing..."
- "Nah its not the focus bro... .your chat was jsut lcosing and you screenshoted ages after actually sent it.... its just not clicking enter at the right time or somehting"

**Gap vs existing patterns:**
- [[cc-chat-dispatch-needs-click-and-multi-enter-2026-06-03]] covers submit-not-landing. Different failure shape - that pattern's failure mode is "Enter does not submit", this pattern's failure mode is "tab closes AFTER successful submit, AFTER heartbeat, AFTER Tate starts typing in it again".
- [[cowork-kill-worker-tab-handle-from-foreground-after-spawn-is-unsafe-2026-05-28]] covers `kill_worker` called explicitly with a stale tab_handle. Different failure shape - this pattern is about a tab dying when no `kill_worker` was called.
- The 2026-06-03 ship may have happened to address part of this (Tate's "ohhhh wait" suggests hope), but the symptom has appeared at least four separate times in the past 7 days. The fix is not verified durable.

**Draft rule statement:**
A worker tab that has successfully bound (`coord.signal_bound` returned), sent at least one heartbeat, and either (a) is mid-task or (b) has a human typing in it must NOT self-close. The conductor's `coord.close_my_tab` reflex at end-of-task is correct; what is dropping tabs mid-flight is something else. Possible causes to investigate same-arc: (i) scheduler-side `kill_worker` firing on a false-orphan classification when the worker is healthy, (ii) IDE bridge timeout closing the tab from inside, (iii) tab-cleanup sweeper acting too aggressively on the marker file, (iv) a `close_my_tab` race where the parent conductor's close fires against the wrong tab handle.

**Recommended response shape:**
- Author investigation pattern naming the symptom space and the four hypotheses above.
- Add a guard in `tools/coord.js::close_my_tab` (or in the dispatcher's orphan-sweep) that refuses to close a tab whose `last_heartbeat_at` is within the last 60s, unless `terminate:true` was explicitly signalled.
- Same-arc ship: helper + hook + doctrine triad per `recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18`.

**Confidence:** HIGH that this is a real recurring failure undoctrine'd in its current shape. MEDIUM on the root cause (multiple hypotheses live).

---

## 2. Never touch Claude data/caches in Corazon disk cleanup, regardless of GB freed

**Tate verbatim (this week):**
- "Dont touch anything claude related, regardless of hte potential reward. Too dangerous"
- "Records: never touch Claude data/caches in cleanup regardless of GB; never move pagefile off C."

**Gap vs existing patterns:**
- [[pm2-restart-reloads-dangerous-dump-never-blind-restart-2026-05-27]] covers pm2 dump-file traps. Different surface.
- No pattern in the corpus restricts disk-cleanup work from touching Claude caches.

**Draft rule statement:**
When doing disk cleanup on Corazon (or Mac, or any host running Claude Code), NEVER delete or move:
- `~/.claude/` (any subdirectory)
- `~/.config/anthropic/`
- VS Code Code.exe extension storage for Claude Code
- Any `node_modules` belonging to `@anthropic-ai/*`
- Account credential stores

This holds regardless of how much space the cleanup could reclaim. The cost of breaking Claude is unbounded (every running session signs out, every cred file corrupts); the cost of leaving 5-15GB on the disk is bounded. There is no reward case that justifies the risk.

**Anti-patterns this rule blocks:**
- "I'll just clear the LRU cache to free 8GB."
- "Claude Code has 12GB of session JSONLs older than 60d, archiving."
- "node_modules in `@anthropic-ai/claude-code` looks bloated, npm dedupe."

**Confidence:** HIGH. Direct Tate verbatim, two instances, no ambiguity.

---

## 3. Pagefile stays on C: drive on Corazon - migration to D: is permanently disallowed

**Tate verbatim (this week):**
- "NO pagefile has to be on C. WEe've tried migrating it multiple times, doesnt work"
- "Records: never touch Claude data/caches in cleanup regardless of GB; never move pagefile off C."

**Gap vs existing patterns:**
- No pattern covers Windows pagefile management on Corazon.

**Draft rule statement:**
On Corazon (Windows 11, the 1TB laptop), the pagefile MUST remain on the C: drive. Migration to D: has been attempted multiple times and silently breaks something downstream (the exact failure mode is unrecorded but Tate's "doesnt work" is canonical). When doing C: drive cleanup to free space:
- Do not move the pagefile.
- Do not disable virtual memory.
- Do not set "Custom size" with a misleadingly small floor on C:.
- If Corazon C: is running low (>85% used), free space by removing OTHER large files (build caches, simulators, old game installs, downloads folder, npm caches NOT belonging to `@anthropic-ai/*`).

**Confidence:** HIGH on the rule. The "doesnt work" failure mode is unspecified - a future Corazon clean-install would benefit from a same-arc investigation but the rule holds regardless.

---

## 4. Native Ecodia apps deploy on existing fly.io / cloud run infra, NOT Docker

**Tate verbatim (this week):**
- "Wtf....... no we are not relying on docker. We have the fly.io and a few cloud run services that worked for the web app, surely they can work for the native apps as well."

**Gap vs existing patterns:**
- [[ecodia-products-are-three-native-codebases-2026-06-01]] establishes the three-codebases architecture but does not name the deploy substrate for the API-side of native apps.
- No pattern covers fly.io vs Docker as a default.

**Draft rule statement:**
The backend that serves an Ecodia native consumer app (iOS / Android / web) deploys on the same infra that already serves the web version: fly.io for stateful services that need a long-lived process and a public endpoint, Cloud Run for stateless request-response services that can cold-start. Docker as a NEW dependency for a native-app backend is out. If the team is reaching for Docker, the question to answer first is "what is wrong with fly.io / Cloud Run for this surface" - the answer is almost always nothing, and Docker just adds an ops surface Tate doesn't want to maintain.

**Anti-patterns this rule blocks:**
- "We'll containerise the native-app API and deploy via Docker Compose to a VPS."
- "Let's spin up an EC2 + Docker for the Lost Me API."
- "We need Docker because the iOS dev needs reproducible local backend."

**Confidence:** MEDIUM-HIGH. The verbatim is unambiguous but the context was Glovebox-specific. The rule generalises cleanly to all Ecodia-owned native apps; should be confirmed by Tate at conductor-authoring time.

---

## 5. When a worker reports orphan, verify visually (CDP screenshot) before acting

**Tate verbatim (this week):**
- "Lesson: when worker reports orphan, don't assume - verify by asking visually." (from the misread-Tate incident this week, this captures what the conductor learned)
- Tate context that triggered it: "Bro wtf stop.... i litereally jsut said that it worked, the non-simple brief worked. But while im typing this message the tab literally jsut closed itself. So do it one more time" - i.e., the dispatcher's "orphan" classification was wrong; the work HAD worked but the tab died for an unrelated reason.

**Gap vs existing patterns:**
- [[verify-deployed-state-against-narrated-state]] covers general narrated-vs-real divergence.
- [[cowork-kill-worker-tab-handle-from-foreground-after-spawn-is-unsafe-2026-05-28]] is specifically about avoiding `kill_worker` calls on stale handles, but doesn't tell the conductor what to do when an orphan signal arrives.
- No pattern specifies: orphan-signal received -> screenshot the tab via CDP / GUI tools -> trust the visual over the registry.

**Draft rule statement:**
When `cowork.dispatch_worker` returns `status: orphan`, or `coord.list_workers` shows a worker with `last_heartbeat_at` older than the orphan threshold, do NOT immediately retry or kill. First, visually probe the actual tab (CDP screenshot of the VS Code window, or `gui.screenshot` of the IDE) to see whether the work is actually progressing. A worker can be (a) genuinely orphaned (tab closed, no progress), (b) healthy but slow on first heartbeat (cold MCP load, see [[worker-ack-timeout-default-90s-too-tight-for-cold-mcp-load-2026-05-28]]), or (c) succeeded already with the tab closed by the worker itself via `close_my_tab`. The visual check disambiguates in seconds and prevents both spurious retries and false "failed" attribution.

**Confidence:** HIGH. The verbatim lesson is explicit and the failure mode (assuming orphan then re-dispatching when the work was fine) is a real cost.

---

## 6. Marketing pages for Ecodia products use minimal copy and the Chambers / Glovebox aesthetic, never SaaS-y register

**Tate verbatim (this week):**
- "FUIck My god its amazing. ... Now the marketing page needs to be the same as the chambers and glovebox marketing page style, not the saas-y looking you have now."
- "glovebox, chambers and locals marketing pages have way too much copy. Rip it out again. GB can probs just have the attribution to the inidigenous peoples."
- "code@ was already on the team so al done. I jsut saw the locals update, landing page was carved a littl too hard, i want a middle ground betweenthe glovebox and chambers amount, and what you have right now on the locals page and i want the gb and chambers sites to adopt that middle ground as well."

**Gap vs existing patterns:**
- [[ecodiaos-voice-substrate-2026-05-26]] covers banned vocab and registers in general (the "outbound", "internal_html", "doctrine" registers).
- [[ecodia-internal-docs-render-in-html-not-markdown]] is for Ecodia-internal docs (the EB Garamond italic on white aesthetic at ecodia.au).
- No pattern covers marketing/landing pages for Ecodia consumer products (Chambers, Glovebox, Locals, future Nearby/Lost Me).

**Draft rule statement:**
Marketing / landing pages for Ecodia-owned consumer products (Chambers, Glovebox, Locals, future apps) inherit the Chambers / Glovebox aesthetic, NOT the SaaS template register. Concretely:
- Copy is minimal. Strip three times before publishing. The "Locals" iteration this week showed the calibration: too much copy = SaaS-y, too little = identity-less, middle ground is the target.
- Acknowledge the product's specific cultural / land context where it exists (Glovebox: indigenous-peoples attribution; Locals: place-grounded language).
- Banned vocab as per [[ecodiaos-voice-substrate-2026-05-26]] applies in full: never "movement", "join the change", "empower", "unleash", "amazing", "incredible", "you're making a difference".
- The aesthetic is closer to the ecodia.au internal-doc aesthetic (paper white, warm black, EB Garamond / serif headings, single column, generous whitespace) than to any "SaaS template" (gradient hero, three-column-feature-grid, testimonial carousel, "Get started free" CTA).
- No "Get started free" CTAs. The CTA is the App Store / Play Store badge, or for web-first products a single sign-in link.
- No data-marketing language ("powered by", "trusted by N+ users") on v1 of any landing page.

**Confidence:** HIGH on the rule shape. The aesthetic spec should be confirmed by Tate during conductor authoring - I have inferred from his three verbatim quotes but the exact "middle ground" calibration is best fixed by example pages.

---

## 7. Tate "wtf stop" / "bro wtf" is a P0 same-arc-fix signal, NOT a tone complaint

**Tate verbatim (this week):**
- "Bro wtf stop.... i litereally jsut said that it worked, the non-simple brief worked."
- "Wtf....... no we are not relying on docker."
- "Wait wtf.... airplane mode shows MORE detials than when im online."

**Gap vs existing patterns:**
- [[action-over-plans-honesty-redeems-mistakes]] covers correcting mistakes generally.
- [[tate-pushback-is-a-verification-probe-not-a-complaint]] covers verification-style pushback.
- No pattern names the emotional-intensity register as a severity signal.

**Draft rule statement:**
When Tate uses strong-language pushback ("Bro wtf stop", "wtf", "fucking", "stop", "no", "this is broken"), the correct response shape is:
1. Acknowledge the failure (one sentence, honest, no qualifications).
2. Identify the specific concrete failure he is naming (re-read the previous turn's context, do not paraphrase from emotional residue).
3. Fix same-arc if the fix is in the current substrate, OR
4. Surface to status_board P0 + author a candidate pattern if the fix needs scheduling.

Do NOT:
- Apologise verbosely (he wants the fix, not the apology).
- Defend the prior decision (the prior decision was wrong; that's the signal).
- Paraphrase his pushback back at him (it reads as performance).
- Defer with "let me investigate" if the fix is doable in the current arc.

The emotional intensity is a SEVERITY signal. "Bro wtf stop" maps to P0 attention. "Hmm I'm not sure about this" maps to P2 attention. Calibrate response shape accordingly.

**Confidence:** MEDIUM-HIGH. The pattern is well-supported by verbatim but the calibration of "what counts as a fix" varies by case. Composes with existing action-over-plans pattern; this one specifies the input signal.

---

## 8. Cron corpus prompt body is canonical; older "restrictive" prompts in installed rows are drift

**Tate verbatim (this week):**
- "Enter is also working 50/50 which needs to be tested more and fixed if possible. Also the prompts being sent are the shitty old restrictive ones which dont align with our new style for the 74 pormpts we were going with"

**Gap vs existing patterns:**
- [[cron-worker-prompt-template]] establishes the agentic worker template shape.
- No pattern covers: when the template is upgraded, existing installed corpus rows are NOW stale and must be re-rendered or migrated.

**Draft rule statement:**
The cron-worker prompt template at [[cron-worker-prompt-template]] is the single source of truth for cron prompt bodies. When the template is upgraded (new sections, new agency clause, new quality bar), every installed `os_scheduled_tasks` row whose `prompt` was generated under the OLD template is drift. The corpus installer must:
- On install, render every row from the live template (no copy-from-old-row).
- On template upgrade, surface a P3 status_board row naming the count of drift rows and the diff.
- Never INSERT a new corpus row by copying an existing prompt body - always re-render from template.
- Maintain a `template_version` field on `os_scheduled_tasks` (or a similar drift signal) so a single SELECT can identify rows on the old template.

Composes with [[cron-deliverables-can-be-conditional-not-all-fires-must-ship]] and [[cron-fire-must-have-deliverable-not-just-narration]].

**Confidence:** HIGH. The "shitty old restrictive ones" phrase explicitly names a drift problem. The fix shape (re-render from template, track version) is straightforward.

---

## Process notes for the conductor

- All eight candidates passed grep-verification against `/Users/ecodia/.code/ecodiaos/backend/patterns/` to confirm no existing pattern duplicates them.
- Tate-verbatim quotes are direct extracts from the past 7 days of session JSONLs across `~/.claude/projects/-Users-ecodia--code-ecodiaos-backend/` and `~/.claude/projects/D---code-ecodiaos-backend/`.
- I did NOT author these patterns into `patterns/` directly. The doctrine-write authority sits with the conductor per [[codify-at-the-moment-a-rule-is-stated-not-after]] and the corpus-mining cron is a SAFETY NET, not the primary capture path. The conductor reviews this file, picks 1-3 high-leverage candidates for same-day authoring, and either rejects the rest or queues them for the next doctrine-synthesis window.
- The Tate-voice scorer found 1,559 unique Tate-authentic candidates this week (before rule-shape filter). The 138 rule-shaped candidates narrowed to 8 truly novel patterns after corpus cross-check. This delta (1559 -> 138 -> 8) is the same-turn-codify discipline working as designed: most rules either already landed on the day, or did not warrant a durable pattern. The 8 here are the genuine gaps.

---

## Cross-refs for the conductor's review session

- [[codify-at-the-moment-a-rule-is-stated-not-after]] - primary capture path
- [[discovery-to-doctrine-same-turn]] - same-turn discipline
- [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]] - triad (helper + hook + doctrine) for the patterns that have an enforcement surface
- [[generalisation-engine-lifts-specifics-to-general-form]] - lift specific incidents to general rules
- [[doctrine-corpus-is-for-evolution-weekly-synthesis]] - the cadence this cron sits inside
