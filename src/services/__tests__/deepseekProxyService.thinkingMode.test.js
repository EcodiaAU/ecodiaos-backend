'use strict'

// ─── deepseekProxyService - thinking-mode sanitiser tests ─────────────────
//
// Covers the cross-provider content compatibility fix shipped 7 May 2026
// (status_board row 8834dd85, fork_mov10cqp_f1c933) for the storm of
// 18 turn_failures + provider_switches at 03:51-03:58 UTC where DeepSeek
// rejected requests carrying Anthropic extended-thinking residue with:
//   400 "The `content[].thinking` in the thinking mode must be passed back
//        to the API."
//
// Cross-ref: ~/ecodiaos/patterns/deepseek-fallback-strips-anthropic-thinking-blocks.md
// Cross-ref: ~/ecodiaos/patterns/no-bedrock-deepseek-only-fallback.md

const { _internal } = require('../deepseekProxyService')
const { _stripThinkingFromRequest, _transformJSON } = _internal

describe('deepseekProxyService - request sanitiser', () => {
  test('strips top-level thinking parameter (the storm root cause)', () => {
    const input = JSON.stringify({
      model: 'deepseek-v4-flash',
      max_tokens: 1024,
      thinking: { type: 'enabled', budget_tokens: 4096 },
      messages: [{ role: 'user', content: 'hi' }],
    })
    const out = JSON.parse(_stripThinkingFromRequest(input))
    expect(out.thinking).toBeUndefined()
    // other fields preserved
    expect(out.model).toBe('deepseek-v4-flash')
    expect(out.max_tokens).toBe(1024)
    expect(out.messages).toHaveLength(1)
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

  test('passes through clean DeepSeek-shape requests untouched', () => {
    const input = JSON.stringify({
      model: 'deepseek-v4-flash',
      max_tokens: 512,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: [{ type: 'text', text: 'hello' }] },
      ],
    })
    const out = _stripThinkingFromRequest(input)
    expect(out).toBe(input)  // identity when nothing to strip
  })

  test('does not mutate user-message thinking-named fields (only assistant role stripped)', () => {
    // Defensive: a tool_result content block could legitimately contain the
    // word "thinking" in its text. Only blocks with type: thinking on
    // role: assistant get stripped.
    const input = JSON.stringify({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'I was thinking about the bug' },
          ],
        },
      ],
    })
    const out = _stripThinkingFromRequest(input)
    expect(out).toBe(input)
  })

  test('handles malformed JSON without throwing', () => {
    expect(() => _stripThinkingFromRequest('not json {')).not.toThrow()
    expect(_stripThinkingFromRequest('not json {')).toBe('not json {')
  })

  test('handles missing messages array gracefully', () => {
    const input = JSON.stringify({ model: 'x', thinking: { type: 'enabled' } })
    const out = JSON.parse(_stripThinkingFromRequest(input))
    expect(out.thinking).toBeUndefined()
    expect(out.model).toBe('x')
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
