'use strict'

/**
 * packManifest - integrity manifest over a rendered pack (climate-disclosure W6).
 *
 * Spec: drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md (W6)
 *
 * (allArtifacts) -> { manifest, json }
 *
 *   allArtifacts: array of { name, content, media_type? } where content is the
 *                 exact string or Buffer that will be written into the pack, or
 *                 a plain object map { name: content }.
 *
 * The manifest lists every artifact with its sha256 and byte length, so the
 * pack is integrity-checkable artifact-by-artifact, and carries pack_sha256, a
 * digest over the sorted (name, sha256) pairs, so the pack is checkable as a
 * WHOLE: dropping, adding or swapping an artifact changes pack_sha256 even if
 * every remaining file verifies individually. pack_sha256 is also the natural
 * payload to anchor (cd_anchors / W9 Polygon head).
 *
 * Byte-deterministic: artifacts sort by name, hashing is over the exact content
 * bytes (strings hashed as UTF-8), no clock, no randomness. Timestamps belong
 * inside the artifacts (where they arrived on input rows), never in the
 * manifest envelope.
 */

const crypto = require('crypto')

const MANIFEST_FORMAT = 'ecodia-climate-pack-manifest/v1'

function sha256Hex(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function toArtifactList(allArtifacts) {
  if (Array.isArray(allArtifacts)) return allArtifacts
  if (allArtifacts && typeof allArtifacts === 'object') {
    return Object.keys(allArtifacts).map((name) => ({ name, content: allArtifacts[name] }))
  }
  throw new TypeError('packManifest expects an array of { name, content } or a { name: content } map')
}

/**
 * packManifest(allArtifacts) -> { manifest, json }
 * json is the canonical serialisation (2-space indent, sorted artifact order,
 * newline-terminated); write THAT into the pack so the manifest itself is
 * byte-reproducible.
 */
function packManifest(allArtifacts) {
  const list = toArtifactList(allArtifacts)
  if (list.length === 0) throw new Error('packManifest refuses an empty pack: nothing to attest')

  const seen = new Set()
  const artifacts = list.map((artifact) => {
    const { name, content } = artifact || {}
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError('packManifest: every artifact needs a non-empty string name')
    }
    if (typeof content !== 'string' && !Buffer.isBuffer(content)) {
      throw new TypeError(`packManifest: artifact '${name}' content must be a string or Buffer (the exact bytes written to the pack)`)
    }
    if (seen.has(name)) throw new Error(`packManifest: duplicate artifact name '${name}'`)
    seen.add(name)
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
    const entry = {
      name,
      sha256: sha256Hex(buf),
      bytes: buf.length,
    }
    if (artifact.media_type != null) entry.media_type = String(artifact.media_type)
    return entry
  })

  artifacts.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

  const packHash = crypto.createHash('sha256')
  for (const a of artifacts) {
    packHash.update(`${a.name.length}:${a.name}=${a.sha256}\n`)
  }

  const manifest = {
    format: MANIFEST_FORMAT,
    artifact_count: artifacts.length,
    artifacts,
    pack_sha256: packHash.digest('hex'),
  }

  return { manifest, json: JSON.stringify(manifest, null, 2) + '\n' }
}

module.exports = { packManifest, MANIFEST_FORMAT }
