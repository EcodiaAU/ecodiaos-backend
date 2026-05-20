---
triggers: cli-subprocess-no-mcp-reply, opus-cli-silent-native, claude-cli-print-reply, reply-tag-parsing, parent-forwards-reply, native-channel-no-notify-tool, escalation-reply-dropped, headless-execute-cli, stdout-reply-block, channel-directive-cli, REPLY-tags
---

# CLI-subprocess execute phases need a parent-process reply forwarder for channels with no MCP reply tool

The headless conductor escalates real work to a `claude --print` CLI subprocess (Opus 4.7, full tool surface). That subprocess has whatever MCP tools its own config gives it - which for the **native** channel is NOTHING that can deliver a reply (no `notify_tate`, no APNs). So if the directive just says "reply when done", the subprocess writes its answer to stdout and it is **silently dropped**. Tate sends a message, real work happens, and he gets nothing back.

## The rule

For any channel whose reply transport is NOT reachable as a tool inside the CLI subprocess, the parent process must:
1. Tell the subprocess to emit its reply as a delimited block on stdout: `<REPLY>...</REPLY>`.
2. Parse that block from the captured stdout on `child.on('close')`.
3. Forward it via the parent's own transport (the parent HAS `notifyTate`).
4. Fall back to the last short non-empty paragraph if no tags are present (covers older outputs).

Channels WITH a working MCP reply tool inside the CLI (sms via `ecodia-comms.send_sms`, telegram via `send_telegram`) let the subprocess reply directly - no forwarder needed. Native is the odd one out because APNs delivery lives only in the parent (`src/services/notifyTate.js` -> `apnsClient`).

Implementation: `src/services/headlessConductor.js` `_executeViaClaudeCli` - `channelDirective` for native asks for `<REPLY>` tags; the `child.on('close')` handler parses + calls `notifyTate({ channel:'native' })`.

## Don't confuse this with the inbox-filter bug

Two separate failures both presented as "native didn't reply" on 2026-05-20:
- Inbox filter dropped Opus's directive (allow-list vs deny-list) - see [[coord-inbox-filter-must-be-deny-list-not-allow-list-2026-05-20]].
- This one: the CLI subprocess had no native reply tool, so even when it ran, the reply never left stdout.

Fix both; verifying one does not clear the other.

## When this fires

- Adding a channel whose delivery path is only in the parent process (APNs, a bespoke push, a websocket the CLI can't see).
- "It did the work but I got no reply" on an escalated/CLI-executed turn.
- Writing a `channelDirective` for a new channel in `_executeViaClaudeCli`. Ask: can the subprocess actually deliver on this channel? If not, use the `<REPLY>` + parent-forward pattern.

Origin: 2026-05-20, native iOS app. Diagnosed when every escalated native turn ran Opus successfully but Tate received silence. Cross-refs: [[native-inbound-must-serialize-per-thread-2026-05-20]], [[one-conductor-many-channels-2026-05-19]], [[coord-inbox-filter-must-be-deny-list-not-allow-list-2026-05-20]].
