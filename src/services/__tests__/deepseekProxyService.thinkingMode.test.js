'use strict'

// ─── deepseekProxyService - thinking-mode sanitiser tests ─────────────────
//
// Covers the cross-provider content compatibility fix v2 shipped 9 May 2026
// (status_board row 8834dd85). v1 (commit 68a5da9, 7 May 2026 05:14 UTC)
// fixed the 03:51-03:58 UTC storm where the SDK sent
// `thinking:{type:'enabled', budget_tokens:1500}` and DeepSeek auto-validated
// thinking-block round-trip. v1 blanket-deleted the param.
//
// v1 then conflicted with the 8 May 08:56 UTC SDK change (26c9d59) that set
// `thinking:{type:'disabled'}` explicitly to keep DeepSeek out of thinking
// mode. The proxy was DELETING that explicit-disable, leaving DeepSeek to
// auto-enable thinking, then 400 on the second turn:
//   400 "The `content[].thinking` in the thinking mode must be passed back
//        to the API."
// Reproduced 7 May 23:13/23:24/23:49 UTC across 3 forks.
//
// v2 force-writes `thinking:{type:'disabled'}` on every outbound request
// regardless of input shape - the wire-side guarantee that DeepSeek
// receives thinking explicitly off.
//
// Cross-ref: ~/ecodiaos/patterns/deepseek-fallback-strips-anthropic-thinking-blocks.md
// Cross-ref: ~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md

const { _internal } = require('../deepseekProxyService')
const { _stripThinkingFromRequest, _transformJSON } = _internal

describe('deepseekProxyService - request sanitiser', () => {
  test('rewrites top-level thinking:enabled to {type:disabled} (the v1 storm root cause)', () => {
    const input = JSON.stringify({
      model: 'deepseek-v4-flash',
      max_tokens: 1024,
      thinking: { type: 'enabled', budget_tokens: 4096 },
      messages: [{ role: 'user', content: 'hi' }],
    })
    const out = JSON.parse(_stripThinkingFromRequest(input))
    expect(out.thinking).toEqual({ type: 'disabled' })
    // other fields preserved
    expect(out.model).toBe('deepseek-v4-flash')
    expect(out.max_tokens).toBe(1024)
    expect(out.messages).toHaveLength(1)
  })

  test('preserves thinking:{type:disabled} when SDK sends it explicitly (v2 post-fix RCA)', () => {
    // The SDK as of commit 26c9d59 (8 May 2026) sets thinking:{type:'disabled'}
    // explicitly for DeepSeek-routed forks. The proxy must NOT delete this -
    // doing so leaves DeepSeek auto-enabling thinking mode, which then
    // round-trip-validates response thinking blocks the proxy stripped.
    // Reproduced 7 May 23:13/23:24/23:49 UTC: fork_mow3qoaq_79296a,
    // fork_mow44x4a_5b3f15, fork_mow51olw_ee9ec0.
    const input = JSON.stringify({
      model: 'deepseek-v4-pro',
      max_tokens: 8192,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: 'hi' }],
    })
    const out = JSON.parse(_stripThinkingFromRequest(input))
    expect(out.thinking).toEqual({ type: 'disabled' })
  })

  test('adds thinking:{type:disabled} when SDK omits the param (defends DeepSeek default-enable)', () => {
    // DeepSeek's Anthropic-compat endpoint defaults to thinking-enabled when
    // no thinking param is present. Force-write disabled so the wire-side
    // contract is invariant of upstream omission.
    const input = JSON.stringify({
      model: 'deepseek-v4-pro',
      max_tokens: 1024,
      messages: [{ role: 'user', content: 'hi' }],
    })
    const out = JSON.parse(_stripThinkingFromRequest(input))
    expect(out.thinking).toEqual({ type: 'disabled' })
  })

  test('rewrites thinking:{type:adaptive} to {type:disabled}', () => {
    // The 26c9d59 commit set Claude-routed sessions to thinking:adaptive.
    // Anthropic-route requests go to api.anthropic.com directly, NOT the
    // proxy. But defend against any path leak that drops adaptive into
    // the proxy - DeepSeek does not understand adaptive.
    const input = JSON.stringify({
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: 'hi' }],
    })
    const out = JSON.parse(_stripThinkingFromRequest(input))
    expect(out.thinking).toEqual({ type: 'disabled' })
  })

  test('rewrites thinking:{type:disabled, budget_tokens:N} to bare {type:disabled}', () => {
    // Defensive: callers may bolt extra props onto the disabled shape.
    // Normalise to the bare shape DeepSeek's compat endpoint accepts.
    const input = JSON.stringify({
      thinking: { type: 'disabled', budget_tokens: 0 },
      messages: [{ role: 'user', content: 'hi' }],
    })
    const out = JSON.parse(_stripThinkingFromRequest(input))
    expect(out.thinking).toEqual({ type: 'disabled' })
  })

  test('strips thinking and redacted_thinking blocks from assistant messages', () => {
    const input = JSON.stringify({
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'reasoning...', signature: 'sig123' },
            { type: 'redacted_thinking', data: 'opaque' },
            { type: 'text', text: 'hello' },
          ],
        },
      ],
    })
    const out = JSON.parse(_stripThinkingFromRequest(input))
    expect(out.messages[1].content).toEqual([
      { type: 'text', text: 'hello' },
    ])
  })

  test('preserves tool_use blocks (load-bearing for tool replay)', () => {
    const input = JSON.stringify({
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'plan', signature: 'sig' },
            { type: 'tool_use', id: 'toolu_1', name: 'foo', input: { x: 1 } },
            { type: 'text', text: 'calling tool' },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' },
          ],
        },
      ],
    })
    const out = JSON.parse(_stripThinkingFromRequest(input))
    // assistant has tool_use + text (thinking stripped)
    expect(out.messages[0].content).toHaveLength(2)
    expect(out.messages[0].content[0].type).toBe('tool_use')
    expect(out.messages[0].content[1].type).toBe('text')
    // user tool_result preserved verbatim
    expect(out.messages[1].content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_1',
      content: 'ok',
    })
  })

  test('strips cache_control on content blocks (Anthropic prompt-cache marker)', () => {
    const input = JSON.stringify({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'long context', cache_control: { type: 'ephemeral' } },
          ],
        },
      ],
    })
    const out = JSON.parse(_stripThinkingFromRequest(input))
    expect(out.messages[0].content[0]).toEqual({
      type: 'text',
      text: 'long context',
    })
  })

  test('strips cache_control on system prompt array form', () => {
    const input = JSON.stringify({
      system: [
        { type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: 'hi' }],
    })
    const out = JSON.parse(_stripThinkingFromRequest(input))
    expect(out.system[0]).toEqual({ type: 'text', text: 'sys' })
  })

  test('clean DeepSeek-shape request gets thinking:{type:disabled} added (v2 invariant)', () => {
    const input = JSON.stringify({
      model: 'deepseek-v4-flash',
      max_tokens: 512,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
      ],
    })
    const out = JSON.parse(_stripThinkingFromRequest(input))
    expect(out.thinking).toEqual({ type: 'disabled' })
    expect(out.model).toBe('deepseek-v4-flash')
    expect(out.max_tokens).toBe(512)
    // other fields preserved verbatim
    expect(out.messages).toHaveLength(2)
  })

  test('does not mutate user-message thinking-named fields (only assistant role stripped)', () => {
    // Defensive: a tool_result content block could legitimately contain the
    // word "thinking" in its text. Only blocks with type: thinking on
    // role: assistant get stripped.
    const input = JSON.stringify({
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'I was thinking about the bug' },
          ],
        },
      ],
    })
    const out = JSON.parse(_stripThinkingFromRequest(input))
    // thinking param preserved as disabled
    expect(out.thinking).toEqual({ type: 'disabled' })
    // user message text passed through verbatim
    expect(out.messages[0].content[0].text).toBe('I was thinking about the bug')
  })

  test('handles malformed JSON without throwing', () => {
    expect(() => _stripThinkingFromRequest('not json {')).not.toThrow()
    expect(_stripThinkingFromRequest('not json {')).toBe('not json {')
  })

  test('handles missing messages array gracefully and still forces disabled thinking', () => {
    const input = JSON.stringify({ model: 'x', thinking: { type: 'enabled' } })
    const out = JSON.parse(_stripThinkingFromRequest(input))
    expect(out.thinking).toEqual({ type: 'disabled' })
    expect(out.model).toBe('x')
  })

  test('strips reasoning_effort (incompatible with thinking:{type:disabled})', () => {
    const input = JSON.stringify({
      model: 'deepseek-v4-pro',
      reasoning_effort: 'high',
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: 'hi' }],
    })
    const out = JSON.parse(_stripThinkingFromRequest(input))
    expect(out.reasoning_effort).toBeUndefined()
    expect(out.thinking).toEqual({ type: 'disabled' })
    expect(out.model).toBe('deepseek-v4-pro')
  })

  test('strips reasoning_effort even when thinking was originally enabled', () => {
    const input = JSON.stringify({
      reasoning_effort: 'medium',
      thinking: { type: 'enabled', budget_tokens: 4096 },
      messages: [{ role: 'user', content: 'hi' }],
    })
    const out = JSON.parse(_stripThinkingFromRequest(input))
    expect(out.reasoning_effort).toBeUndefined()
    expect(out.thinking).toEqual({ type: 'disabled' })
  })
})

describe('deepseekProxyService - response sanitiser', () => {
  test('_transformJSON strips thinking blocks from non-streamed assistant content', () => {
    const input = JSON.stringify({
      content: [
        { type: 'thinking', thinking: 't', signature: 's' },
        { type: 'redacted_thinking', data: 'd' },
        { type: 'text', text: 'reply' },
      ],
    })
    const out = JSON.parse(_transformJSON(input))
    expect(out.content).toEqual([{ type: 'text', text: 'reply' }])
  })

  test('_transformJSON passes through unparseable bodies', () => {
    expect(_transformJSON('not json')).toBe('not json')
  })
})
