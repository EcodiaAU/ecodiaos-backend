---
name: chrome-cdp-is-top-primitive-for-gui-gated-work-2026-05-18
description: When the next action requires a logged-in human session in a SaaS console (GCP IAM grants, GCP API enables, GitHub repo settings, Stripe webhook config, Vercel env, Bitbucket, ASC, Supabase dashboard, Twilio, claude.ai), reflexively drive Tate's existing Chrome via cdp.* + gui.* on the Corazon laptop-agent. Do NOT ask Tate to click.
triggers: chrome-cdp, cdp-as-top-primitive, gui-gated-work, reflexive-cdp, drive-tate-chrome, console-iam-grant, console-api-enable, gcp-console-cdp, github-settings-cdp, stripe-webhook-cdp, vercel-env-cdp, bitbucket-cdp, asc-cdp, supabase-dashboard-cdp, twilio-console-cdp, claude-ai-routine-cdp, no-tate-click, do-not-ask-tate-to-click, logged-in-session-required, oauth-gated, cookie-gated, browser-gated-action, gui-substrate-reflex
status: active
---

# Chrome CDP is the top primitive for GUI-gated work

The reflexive substrate for any action that requires a logged-in human session in a SaaS console is `cdp.*` and `gui.*` on the Corazon laptop-agent (`http://localhost:7456`) driving Tate's already-logged-in Chrome. **Do not write "Tate clicks Enable" or "you go to Settings and..."** when the action is a few CDP calls.

## The rule

Before drafting any "Tate clicks..." or "paste back to me" instruction, run this 3-question gate:

1. Is the target a SaaS web console (GCP, GitHub, Stripe, Vercel, Bitbucket, ASC, Supabase, Twilio, claude.ai, etc)?
2. Would Tate's existing Chrome auth state get this done without re-login?
3. Is the action mechanical (click button, fill form, toggle setting)?

If all three are yes, the substrate is CDP. The flow is:

1. `gui.enable_chrome_cdp` (idempotent - returns `already_up: true` if running).
2. `cdp.listTabs` to see current tab state. **Open a new tab via `gui.open_url ... newTab: true` rather than navigating Tate's active tab** so his flow isn't disturbed.
3. `cdp.selectTab` the new tab + `cdp.navigate` if needed.
4. `cdp.pageScreenshot` to verify state. **Wait 6-10s for SPAs to bootstrap** before screenshot or click.
5. Find and click target via `cdp.runJs` deep-walk (handles shadow DOM) - GCP / Vercel / Stripe consoles use heavy shadow DOM that `cdp.queryAll('button')` does NOT penetrate.
6. Programmatic `.click()` is unreliable on Material custom elements. Dispatch a full pointer-event sequence: `pointerdown` → `mousedown` → `pointerup` → `mouseup` → `click`.
7. Find the BUTTON tag specifically, not just any element with matching text - GCP has off-canvas duplicate buttons at bbox 0,0,0,0 that you don't want to hit.
8. After each click, screenshot + verify state moved. Do NOT chain blind.

## Hard rules

- **Never send Escape.** Closes whole panels in GCP / Material UIs. Use clicks elsewhere or specific keystrokes to dismiss autocomplete.
- **Native setter for form inputs.** Use `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)` so React/Angular sees the change, then dispatch `input` + `change` events.
- **Visible bbox check.** A walk that finds an element with `width:0,height:0` is hitting an off-screen duplicate. Filter for `width > 0 && height > 0`.
- **Wait properly between actions.** GCP needs 6-10s post-navigate, 1500-2500ms after autocomplete fill, 2-3s after combobox open. Faster than that and panels collapse mid-flight.
- **Authentication is implicit.** Tate's Chrome cookies + session storage are what authenticate every API call the page makes. You do not need to extract or replay OAuth tokens.

## Cases this reflex applies (high-leverage examples)

| Action | Reflex |
|---|---|
| GCP API enable | CDP → console.cloud.google.com/apis/library/<api>.googleapis.com?project=<id> + click Enable |
| GCP IAM role grant | CDP → console.cloud.google.com/iam-admin/iam?project=<id> + click Grant access + fill + select role + Save |
| GitHub repo settings (secrets, branch protection) | CDP → github.com/<org>/<repo>/settings |
| Stripe webhook URL update, product create | CDP → dashboard.stripe.com |
| Vercel env var update, domain config | CDP → vercel.com/<team>/<project>/settings |
| Bitbucket pipelines, API token | CDP → bitbucket.org |
| Apple Developer / ASC settings beyond ASC API | CDP → developer.apple.com / appstoreconnect.apple.com |
| Supabase dashboard ops not in MCP scope | CDP → supabase.com/dashboard |
| Twilio webhook URL, phone number config | CDP → console.twilio.com |
| Claude.ai Routine creation | CDP → claude.ai/code/routines |

## Anti-patterns

- Asking Tate to "click Enable" / "go to settings" / "paste back X" when the action is a few CDP calls.
- Using `cdp.clickText` for SPAs - it hits the first DOM element containing the text, often a hidden "Skip to main content" accessibility link.
- Using `querySelectorAll('button')` on Material/Angular pages. Shadow DOM blocks the query. Use a recursive walk with `el.shadowRoot` traversal.
- Sending Escape key - dismisses whole panels in GCP and many other Material UIs.
- Using `.click()` only - some Material custom elements ignore programmatic click. Full pointer-event sequence required.
- Navigating Tate's active tab without warning - open new tabs via `gui.open_url newTab:true` instead.

## Verified end-to-end the day this was authored

The arc that codified this rule: 2026-05-18 ~08:30-09:10 AEST. Goal: enable Cloud Pub/Sub on `ecodia-hub` GCP project + grant the SA `roles/owner` so it could run the gmail-push setup script. My first response was "Tate clicks Enable on this link." Tate verbatim: "you could've just attached to the chrome cdp and gave the sa the role bro.... you're still not reflexively using my chrome to do things. This nees to be one of your top primitives."

What happened next:

1. Navigated to https://console.cloud.google.com/apis/library/pubsub.googleapis.com?project=ecodia-hub in new tab.
2. Deep-walked for visible BUTTON with text "Enable", clicked with full pointer sequence.
3. Verified API enabled via SA probe (error changed from "API not used" to "User not authorized").
4. Navigated to https://console.cloud.google.com/iam-admin/iam?project=ecodia-hub.
5. Found "Grant access" BUTTON, clicked.
6. Filled "New principals" input via native setter, picked autocomplete option.
7. Found `cfc-iam-role-picker` → `cfc-select-dual-column` combobox, clicked to open.
8. Typed "Owner" in role filter input, clicked the Owner option.
9. Removed a duplicate principal chip (from a retry), clicked Save.
10. Verified via SA probe: `OWNER_OK created projects/ecodia-hub/topics/...`.
11. Ran the full setup script: topic + IAM + subscription + 3 watches all created.
12. Verified end-to-end push: self-sent email tate@→code@, the kv_store breadcrumb `cowork.gmail_push.last_event.code@ecodia.au` updated 7 seconds later.

**Time without Tate-clicks: ~40 minutes of CDP work, zero context-switches for Tate.**

## Cross-refs

- `~/ecodiaos/backend/patterns/corazon-is-a-peer-not-a-browser-via-http.md`
- `~/ecodiaos/backend/patterns/drive-chrome-via-input-tools-not-browser-tools.md`
- `~/ecodiaos/backend/patterns/tailscale-macro-replaces-cowork.md`
- `~/ecodiaos/backend/patterns/gui-recipes-authoring-optimisation-and-verification.md`
- `~/ecodiaos/backend/patterns/exhaust-laptop-route-before-declaring-tate-blocked.md` (the broader rule this strengthens)
- Auto-memory: `feedback_chrome_cdp_is_top_primitive_for_gui_gated_work.md`
- Auto-memory: `reference_gui_substrate_beast_2026-05-17.md`

## Origin

Tate verbatim 2026-05-18 ~08:45 AEST: "you could've just attached to the chrome cdp and gave the sa the role bro.... you're still not reflexively using my chrome to do things. This nees to be one of your top primitives."

Then: "Im going to have a bath, but you can literally do it all with the chrome cdp hahaha, do whatever you want to do. You have no leash. All i ask is that you make the chrome cdp the highest surfaced primitive... its so important for you."

Codified same arc. End-to-end verified before committing.
