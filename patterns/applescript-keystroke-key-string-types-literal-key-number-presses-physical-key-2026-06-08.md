---
triggers: applescript-keystroke, applescript-key-code, applescript-types-literal, keystroke-return-types-word, key-code-36, applescript.keystroke, system-events-keystroke, mac-keystroke-bug, applescript-named-key, osascript-keystroke
status: active
---

# `applescript.keystroke({key: "return"})` types the LITERAL WORD; pass `key: 36` for a physical Return

**Rule.** The laptop-agent's `applescript.keystroke({key: <val>})` tool has two branches based on `typeof val`. A STRING goes through `tell application "System Events" to keystroke "<text>"` which AppleScript interprets as text-to-type, so `keystroke "return"` types the literal six-character word "return" into the focused input. A NUMBER goes through `tell application "System Events" to key code <n>` which presses the physical key with that key code. For Return, the key code is **36**.

**Why.** AppleScript's `keystroke` command interprets quoted strings as text to type. There IS a way to send a named key without quotes (`keystroke return`), but the tool helper escapes its argument into a quoted string for safety. The tool's number-branch (`key code 36`) is the right path for any physical key press — Tab is 48, Escape is 53, Space is 49, Up is 126, Down is 125, Left is 123, Right is 124.

**How to apply.** When porting any submit / focus / cursor-move chain from Windows AHK or Linux xdotool to Mac AppleScript:
```js
// WRONG - types the word "return" four times
await applescript.keystroke({ key: 'return' })

// RIGHT - presses Return key
await applescript.keystroke({ key: 36 })

// Other common key codes:
// Return = 36, Tab = 48, Escape = 53, Space = 49
// Arrow Up/Down/Left/Right = 126 / 125 / 123 / 124
```

For text input, use `keystroke({ text: "hello" })` instead — the `text` parameter is explicit about intent.

**Anti-patterns.**
- Using `keystroke({ key: 'return' })` or `keystroke({ key: 'enter' })` — both type the literal word.
- Mixing the two parameters: `keystroke({ text: '\\n', key: 36 })` — the implementation prefers `text` if present, ignoring `key`.
- Using `key: 'tab'` / `key: 'escape'` for the same reason — also types the literal word.

**Origin.** Mac mini day-1, 2026-06-08. The first mac-dispatcher submit chain used `keystroke({ key: 'return' })` and Tate observed "that just pasted the word return 4 times..." in the worker chat input. Switching to `key: 36` made the very next dispatch submit cleanly. Burned ~20 minutes plus one user-visible misfire.

**Cross-refs.**
- [[mac-dispatcher-via-set-dispatcher-injection-seam-2026-06-08]]
- [[sy094-third-substrate-applescript-2026-05-18]]
- [[corazon-is-a-peer-not-a-browser-via-http]]
