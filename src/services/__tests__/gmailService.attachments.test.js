/* eslint-env jest */

// Mock the env config so requiring gmailService doesn't try to read a real
// service-account JSON or wire googleapis. We only exercise the pure
// MIME builder + validator in this suite.
jest.mock('../../config/env', () => ({
  GMAIL_ENABLED: false,
  GOOGLE_SERVICE_ACCOUNT_JSON: null,
  GOOGLE_PRIMARY_ACCOUNT: 'code@ecodia.au',
  ADDITIONAL_INBOXES: '',
}))

const { _createRawEmail } = require('../gmailService')

function decode(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=')
  return Buffer.from(b64, 'base64').toString('utf-8')
}

describe('createRawEmail - attachments', () => {
  test('no attachments produces simple text/plain message (backward compat)', () => {
    const raw = _createRawEmail({
      to: 'ceo@coexistaus.org',
      from: 'tate@ecodia.au',
      subject: 'Vic stats',
      body: 'hey dude',
    })
    const decoded = decode(raw)
    expect(decoded).toMatch(/Content-Type: text\/plain; charset=utf-8/)
    expect(decoded).toMatch(/Subject: Vic stats/)
    expect(decoded).toMatch(/\r\n\r\nhey dude/)
    expect(decoded).not.toMatch(/multipart/)
  })

  test('single PDF attachment builds multipart/mixed with base64 part', () => {
    const pdfBytes = Buffer.from('%PDF-1.4 fake', 'utf-8')
    const raw = _createRawEmail({
      to: 'ceo@coexistaus.org',
      from: 'tate@ecodia.au',
      subject: 'Vic stats',
      body: 'PDF attached',
      attachments: [{
        filename: 'vic-stats.pdf',
        content_type: 'application/pdf',
        content_base64: pdfBytes.toString('base64'),
      }],
    })
    const decoded = decode(raw)
    expect(decoded).toMatch(/MIME-Version: 1.0/)
    expect(decoded).toMatch(/Content-Type: multipart\/mixed; boundary="(=_eos_[^"]+)"/)
    expect(decoded).toMatch(/Content-Type: text\/plain; charset=utf-8/)
    expect(decoded).toMatch(/Content-Type: application\/pdf; name="vic-stats\.pdf"/)
    expect(decoded).toMatch(/Content-Disposition: attachment; filename="vic-stats\.pdf"/)
    expect(decoded).toMatch(/Content-Transfer-Encoding: base64/)
    expect(decoded).toMatch(/PDF attached/)
    // The attachment's base64 content should appear (whitespace-tolerant)
    expect(decoded.replace(/\s+/g, '')).toContain(pdfBytes.toString('base64'))
  })

  test('two attachments produces two attachment parts', () => {
    const raw = _createRawEmail({
      to: 'ceo@coexistaus.org',
      from: 'tate@ecodia.au',
      subject: 's',
      body: 'b',
      attachments: [
        { filename: 'a.txt', content_type: 'text/plain', content_base64: Buffer.from('one').toString('base64') },
        { filename: 'b.png', content_type: 'image/png', content_base64: Buffer.from('two').toString('base64') },
      ],
    })
    const decoded = decode(raw)
    const attachmentHeaders = (decoded.match(/Content-Disposition: attachment/g) || []).length
    expect(attachmentHeaders).toBe(2)
    expect(decoded).toContain('a.txt')
    expect(decoded).toContain('b.png')
  })

  test('attachments rejects non-array', () => {
    expect(() => _createRawEmail({
      to: 'x@y.z', from: 'f@e.f', subject: 's', body: 'b',
      attachments: 'not an array',
    })).toThrow(/attachments must be an array/)
  })

  test('rejects missing filename', () => {
    expect(() => _createRawEmail({
      to: 'x@y.z', from: 'f@e.f', subject: 's', body: 'b',
      attachments: [{ content_base64: 'aGVsbG8=' }],
    })).toThrow(/filename required/)
  })

  test('rejects missing content_base64', () => {
    expect(() => _createRawEmail({
      to: 'x@y.z', from: 'f@e.f', subject: 's', body: 'b',
      attachments: [{ filename: 'a.txt' }],
    })).toThrow(/content_base64 required/)
  })

  test('rejects more than 10 attachments', () => {
    const tiny = Buffer.from('x').toString('base64')
    const many = Array.from({ length: 11 }, (_, i) => ({
      filename: `a${i}.txt`, content_type: 'text/plain', content_base64: tiny,
    }))
    expect(() => _createRawEmail({
      to: 'x@y.z', from: 'f@e.f', subject: 's', body: 'b', attachments: many,
    })).toThrow(/max 10 attachments/)
  })

  test('rejects per-file size over 8mb', () => {
    // 9mb of bytes → 12mb base64
    const big = Buffer.alloc(9 * 1024 * 1024, 0x41).toString('base64')
    expect(() => _createRawEmail({
      to: 'x@y.z', from: 'f@e.f', subject: 's', body: 'b',
      attachments: [{ filename: 'big.bin', content_base64: big }],
    })).toThrow(/exceeds/)
  })

  test('preserves backwards compat for cc/bcc/inReplyTo without attachments', () => {
    const raw = _createRawEmail({
      to: 'a@x', from: 'b@y', cc: 'c@z', bcc: 'd@w', subject: 's', body: 'b',
      inReplyTo: '<thread@x>',
    })
    const decoded = decode(raw)
    expect(decoded).toMatch(/Cc: c@z/)
    expect(decoded).toMatch(/Bcc: d@w/)
    expect(decoded).toMatch(/In-Reply-To: <thread@x>/)
    expect(decoded).toMatch(/References: <thread@x>/)
  })

  test('filename quotes are stripped', () => {
    const raw = _createRawEmail({
      to: 'a@x', from: 'b@y', subject: 's', body: 'b',
      attachments: [{
        filename: 'has"quote.pdf',
        content_type: 'application/pdf',
        content_base64: Buffer.from('x').toString('base64'),
      }],
    })
    const decoded = decode(raw)
    expect(decoded).toMatch(/filename="hasquote\.pdf"/)
    expect(decoded).not.toMatch(/has"quote/)
  })
})
