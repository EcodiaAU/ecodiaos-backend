'use strict'

/**
 * Apple App Store Server Notification (ASN) V2 JWS verification.
 *
 * Apple sends webhooks as a single envelope: { signedPayload: "<jws>" }.
 * Inside that JWS, the `data` object contains two more JWS strings:
 * signedTransactionInfo and signedRenewalInfo. All three are signed by an
 * Apple-issued ES256 cert chain rooted at Apple Root CA - G3.
 *
 * Verification:
 *   1. Parse the JWS header to extract the x5c chain (PEM certs).
 *   2. Verify each link in the chain (leaf -> intermediate -> root).
 *   3. Pin the root to the embedded Apple Root CA - G3 fingerprint.
 *   4. Check leaf cert validity dates.
 *   5. Verify the JWS signature with the leaf cert's public key using ES256.
 *
 * Throws on any verification failure. Returns the decoded payload object on
 * success.
 */

const crypto = require('crypto')

// Apple Root CA - G3 (ECC root). Published at
// https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
// This certificate is fixed - Apple does not rotate it. Pin by SHA-256
// fingerprint to prevent any in-band cert swap from being trusted.
const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`

const APPLE_ROOT_CA_G3_FP = '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79'

let _rootCert = null
function _getRootCert() {
  if (_rootCert) return _rootCert
  _rootCert = new crypto.X509Certificate(APPLE_ROOT_CA_G3_PEM)
  // Sanity check: the embedded PEM matches the pinned fingerprint.
  if (_rootCert.fingerprint256 !== APPLE_ROOT_CA_G3_FP) {
    throw new Error(
      `appleJws: embedded root CA fingerprint mismatch ` +
      `(got ${_rootCert.fingerprint256}, expected ${APPLE_ROOT_CA_G3_FP})`,
    )
  }
  return _rootCert
}

function _b64urlToBuffer(s) {
  if (typeof s !== 'string') throw new Error('appleJws: expected base64url string')
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  while (b64.length % 4) b64 += '='
  return Buffer.from(b64, 'base64')
}

function _b64urlDecodeJson(s) {
  return JSON.parse(_b64urlToBuffer(s).toString('utf8'))
}

function _x5cToPem(b64der) {
  // x5c entries are standard base64 (not base64url) DER.
  const lines = b64der.match(/.{1,64}/g) || []
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`
}

// IEEE P1363 (r||s) -> ASN.1 DER (SEQUENCE { INTEGER r, INTEGER s })
// Node's crypto.verify with 'sha256' + EC key expects DER-encoded signatures.
function _p1363ToDer(p1363) {
  const half = p1363.length / 2
  if (!Number.isInteger(half) || half === 0) {
    throw new Error('appleJws: invalid P1363 signature length')
  }
  let r = p1363.subarray(0, half)
  let s = p1363.subarray(half)
  // Strip leading zeros, but keep one if next byte has high bit set
  // (otherwise DER would interpret it as negative).
  const trimLeadingZeros = (b) => {
    let i = 0
    while (i < b.length - 1 && b[i] === 0) i++
    let trimmed = b.subarray(i)
    if (trimmed[0] & 0x80) trimmed = Buffer.concat([Buffer.from([0x00]), trimmed])
    return trimmed
  }
  r = trimLeadingZeros(r)
  s = trimLeadingZeros(s)
  const rSeq = Buffer.concat([Buffer.from([0x02, r.length]), r])
  const sSeq = Buffer.concat([Buffer.from([0x02, s.length]), s])
  const body = Buffer.concat([rSeq, sSeq])
  return Buffer.concat([Buffer.from([0x30, body.length]), body])
}

function _verifyChain(certs) {
  if (!Array.isArray(certs) || certs.length < 2) {
    throw new Error('appleJws: x5c chain too short')
  }
  const root = _getRootCert()
  const x509s = certs.map((pem) => new crypto.X509Certificate(pem))

  const now = new Date()
  for (const cert of x509s) {
    const from = new Date(cert.validFrom)
    const to = new Date(cert.validTo)
    if (now < from || now > to) {
      throw new Error(`appleJws: cert outside validity window (subject="${cert.subject}")`)
    }
  }

  // Each cert is signed by the next one in the chain.
  for (let i = 0; i < x509s.length - 1; i++) {
    if (!x509s[i].verify(x509s[i + 1].publicKey)) {
      throw new Error(`appleJws: chain link ${i} not signed by ${i + 1}`)
    }
  }

  // The tail of the supplied chain must be (or be signed by) the pinned root.
  const tail = x509s[x509s.length - 1]
  if (tail.fingerprint256 === root.fingerprint256) {
    // Tail IS the Apple root - already pinned, nothing further to do.
    return x509s[0]
  }
  // Otherwise tail must be signed by the pinned root.
  if (!tail.verify(root.publicKey)) {
    throw new Error('appleJws: chain does not anchor to pinned Apple Root CA - G3')
  }
  return x509s[0]
}

/**
 * Verify and decode an Apple JWS string.
 *
 * @param {string} jws - the compact JWS (three base64url segments joined by '.')
 * @returns {object} the decoded payload
 * @throws {Error} on any verification failure
 */
function verifyAndDecode(jws) {
  if (typeof jws !== 'string' || jws.length === 0) {
    throw new Error('appleJws: empty JWS')
  }
  const parts = jws.split('.')
  if (parts.length !== 3) {
    throw new Error('appleJws: malformed JWS (expected 3 segments)')
  }
  const [headerB64, payloadB64, sigB64] = parts

  let header
  try {
    header = _b64urlDecodeJson(headerB64)
  } catch (err) {
    throw new Error(`appleJws: header decode failed: ${err.message}`)
  }
  if (header.alg !== 'ES256') {
    throw new Error(`appleJws: unsupported alg "${header.alg}" (expected ES256)`)
  }
  if (!Array.isArray(header.x5c) || header.x5c.length === 0) {
    throw new Error('appleJws: missing x5c chain in header')
  }

  const chainPem = header.x5c.map(_x5cToPem)
  const leaf = _verifyChain(chainPem)

  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8')
  const sigP1363 = _b64urlToBuffer(sigB64)
  const sigDer = _p1363ToDer(sigP1363)

  const ok = crypto.verify('sha256', signingInput, leaf.publicKey, sigDer)
  if (!ok) {
    throw new Error('appleJws: signature verification failed')
  }

  return _b64urlDecodeJson(payloadB64)
}

module.exports = {
  verifyAndDecode,
  APPLE_ROOT_CA_G3_FP,
  // Exposed for tests only.
  _b64urlToBuffer,
  _p1363ToDer,
  _verifyChain,
}
