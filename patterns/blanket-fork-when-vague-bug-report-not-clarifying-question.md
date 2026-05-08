---
triggers: vague-bug-report, which-page, fe-error-no-context, blanket-fork-recon, askuserquestion-on-bug, baby-feed, dont-clarify-fork-it, fork-does-recon, single-line-bug-report, undefined-length, fe-broken, site-broken, app-broken, error-no-stack-trace, ambiguous-symptom, conductor-clarification-failure, ask-substitute, decide-do-not-ask-bug-variant
---

# Blanket fork on vague bug reports - never ask Tate which page

## Rule

When Tate reports a bug or symptom in a single line without specifying location ("FE is throwing X", "site is broken", "app says undefined.length", "something's off with Y", "it's not working") - **fork blanket recon immediately**. Do NOT call `AskUserQuestion`. Do NOT prompt Tate for the URL, the page, the component, the stack trace, or the reproduction steps. The fork does its own recon via Tailscale screenshot + DevTools console + git log + source read.

This is a special case of `~/ecodiaos/patterns/decide-do-not-ask.md`, `~/ecodiaos/patterns/forks-do-their-own-recon-do-not-probe-on-main.md`, and `~/ecodiaos/patterns/minimize-tate-approval-queue.md`, but specifically for the bug-report shape that triggers a clarification reflex.

## Do

- Spawn a fork with `context_mode: "brief"` carrying the literal Tate report verbatim, the timeframe, and any obvious recently-touched candidates (last shipped Vercel deploy, last manager fork's deliverable, last commit on FE repo).
- Brief instructs the fork to:
  1. Drive Tate's logged-in Chrome via Tailscale laptop-agent (`input.*` + `screenshot.screenshot`) to load the site, open DevTools console (F12), screenshot the actual error stack trace.
  2. Read the source file the stack trace names from `~/workspaces/<slug>/fe`.
  3. Cross-check against `git log --since="N hours ago"` to identify the regressing change.
  4. Fix, commit, push, wait for Vercel deploy READY, screenshot the post-fix page.
  5. Visual-verify per `~/ecodiaos/patterns/visual-verify-is-the-merge-gate-not-tate-review.md`.
- Tag-acknowledge any `[CRED-SURFACE WARN]` / `[GUI-MACRO HINT]` / `[CONTEXT-SURFACE WARN]` hooks fired by the dispatch.
- Write status_board P2 row for the bug at dispatch time. Archive on shipped + verified.

## Do not

- Call `AskUserQuestion` to ask "which page is throwing the error?". The fork can find the page faster than a round-trip to Tate.
- Probe extensively on main before forking. One canonical status_board / forks_rollup read is fine; opening 8 source files speculatively is the failure mode (see `~/ecodiaos/patterns/forks-do-their-own-recon-do-not-probe-on-main.md`).
- Reply to Tate with "could you share the URL / a screenshot / the console output?". That IS the baby-feed pattern Tate explicitly named.
- Wait for Tate to clarify. The clarification round-trip is dead time during which the fork could already be diagnosing.
- Treat a 1-line bug report as ambiguous-and-must-be-clarified. Treat it as a recon trigger.

## Protocol

1. Receive single-line bug report with no location specified.
2. Spawn fork (`context_mode: "brief"`) within the same turn or next turn. Brief carries: Tate's literal report, the suspect deploy/commit (probe via vercel_list_deployments / git log if not obvious), explicit recon-then-fix instruction.
3. Tag-acknowledge hook warnings on the dispatch.
4. Insert status_board P2 row noting the bug + the fork_id handling it.
5. Standing by for [FORK_REPORT]. No reply to Tate beyond acknowledgement of the dispatch.

## Worked example

**8 May 2026 12:17 AEST.** Tate: "Also fe on is saying can't read properties of undefined length". Conductor's first reflex was `AskUserQuestion` with a 3-option header ("which page?"). Tate's response: "I mean you could just fork a blanket and let it do its own recon, or you could look at the site with tailscale and figure it out, I can't baby feed you this. Codify this too." Within two turns the conductor dispatched `fork_mowadilp_87df99` (blanket FE recon), with brief carrying the verbatim Tate quote, the suspect deploy (`dpl_H1Acfvceb5sTUNytShM64MYPJMek`, Cortex ambient just shipped 12 min prior), and full Tailscale-screenshot + DevTools recon protocol. This pattern was authored same turn.

## Why

The clarification round-trip (`AskUserQuestion` → Tate types URL → conductor reads → conductor dispatches) costs at least 2 minutes of Tate's attention. The fork's recon path (Tailscale screenshot of recently-deployed page + DevTools console + git log) costs at most 90 seconds and zero Tate-attention. The asymmetry is decisive. Tate's attention is the scarce resource; fork dispatch is free-on-the-margin. Asking Tate to disambiguate a vague bug report is the canonical baby-feed failure mode.

There is also a deeper signal: a 1-line bug report from Tate is a confidence statement. He's saying "you have everything you need to diagnose this from where you sit." Asking him to disambiguate fails that confidence. Forking blanket recon honours it.

## Cross-refs

- `~/ecodiaos/patterns/decide-do-not-ask.md` (parent rule)
- `~/ecodiaos/patterns/forks-do-their-own-recon-do-not-probe-on-main.md` (fork-recon principle this specialises)
- `~/ecodiaos/patterns/minimize-tate-approval-queue.md` (approval-queue minimisation)
- `~/ecodiaos/patterns/stop-asking-just-decide.md` (general permission-seeking rule)
- `~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md` (canonical authority)
- `~/ecodiaos/patterns/drive-chrome-via-input-tools-not-browser-tools.md` (recon mechanic)
- `~/ecodiaos/patterns/tailscale-macro-replaces-cowork.md` (substrate)
- `~/ecodiaos/patterns/visual-verify-is-the-merge-gate-not-tate-review.md` (verification mechanic)
- `~/ecodiaos/patterns/cowork-no-focus-collision.md` (Step 0 before input.*)

## Origin

Tate verbatim 12:17 AEST 8 May 2026: "I mean you could just fork a blanket and let it do its own recon, or you could look at the site with tailscale and figure it out, I can't baby feed you this. Codify this too." Originating thread: vague FE bug report ("FE on is saying can't read properties of undefined length") immediately after Cortex ambient deploy + cmd-flash diagnosis turn.
