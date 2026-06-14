---
triggers: canonical-laptop-agent-path, eos-laptop-agent-d-code, cdp-attach-tab-missing, stripped-in-repo-laptop-agent, thirty-cdp-tools, restart-from-canonical-path, corazon-era-laptop-agent, laptop-agent-host-superseded, api-info-tool-count-check, full-agent-vs-stripped
status: superseded
supersedes-pointer: cdp-dedicated-tab-and-mac-chrome-driving-2026-06-08
---
# Canonical laptop-agent path (Corazon-era, superseded by Mac-canonical CDP)

## 1. The rule

This file is referenced by `[[wikilink]]` from `parallel-cdp-chat-coordination-via-alias-namespacing` and `play-console-app-record-create-recipe`. On the Corazon host, the laptop-agent that exposes the full CDP toolset (~30 `cdp.*` tools including `cdp.attach_tab` and `cdp.nativeFill`) lived at `D:\.code\eos-laptop-agent\`, and the in-repo `backend/laptop-agent/` was a stripped copy missing those helpers. Any agent restart had to launch from the full path and verify via `/api/info` that the CDP tools were loaded. That fact is Corazon-era. The Mac (`MacBookPro.lan`) became canonical on 2026-06-08, and `D:\...` paths do not resolve on Mac. On the current host, CDP driving goes through `gui.enable_chrome_cdp` plus the dedicated-tab discipline in [[cdp-dedicated-tab-and-mac-chrome-driving-2026-06-08]], not a `D:\` agent path.

## 2. Why

The originating incident was a three-chat CDP collision on 2026-05-25 during the ASC name-claim wedge: main, cowork, and agent-patching chats all drove CDP at once, and a restart used the stripped in-repo agent binary that lacked `cdp.attach_tab`, so alias-namespacing silently failed. The lesson then was "restart from the full agent path and verify the tool count". The host migration on 2026-06-08 moved the canonical surface to the Mac and retired the `D:\` path, so the literal path in this rule is now a historical artifact. The recipes that link here still need the link to resolve, and a reader needs to know the path is superseded rather than chase a `D:\` directory that cannot exist on Mac.

## 3. How to apply

1. Treat the `D:\.code\eos-laptop-agent\` path as Corazon-era history. Do not look for it on the Mac.
2. For CDP driving on the current host, use `gui.enable_chrome_cdp` and the dedicated-tab and alias discipline in [[cdp-dedicated-tab-and-mac-chrome-driving-2026-06-08]] and [[cdp-tab-alias-keep-alive-and-auto-restore-2026-06-09]].
3. When a linking recipe (parallel-cdp coordination, play-console app-record) says "the agent must be the canonical one", read that as "the Mac CDP surface with the full tool set", verified by the tools actually being callable, not by a `D:\` path.
4. If you are genuinely on Corazon for a legacy reason, the original `/api/info` tool-count check still applies: confirm ~30 `cdp.*` tools including `cdp.attach_tab` before relying on alias-namespacing.

## 4. Anti-patterns

- Do not assume `D:\.code\eos-laptop-agent\` resolves on the Mac; it is Corazon-era and the host swap retired it.
- Do not drive CDP through the stripped in-repo copy expecting `cdp.attach_tab`; that was the 2026-05-25 collision cause.
- Do not delete the `[[wikilink]]` targets in the two recipes that point here; resolve the orphan by keeping this superseded marker, so the cross-ref still resolves.
- Do not treat a path string as proof of capability; verify the CDP tools are actually loaded and callable.

## 5. Origin

2026-05-25 three-chat CDP collision (Corazon-era full-vs-stripped agent). Superseded by the 2026-06-08 Mac-canonical host migration; current CDP doctrine is [[cdp-dedicated-tab-and-mac-chrome-driving-2026-06-08]]. Cross-refs: [[ecodiaos-autonomy-architecture-2026-06-08-mac-canonical]], [[hook-substrate-must-track-canonical-host-not-corazon-ghosts-2026-06-10]], [[parallel-cdp-chat-coordination-via-alias-namespacing]].
