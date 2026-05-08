/**
 * GET /api/cortex/attachments
 *
 * Round-3 stub for the CortexAmbient navigation surface (tab + document
 * viewer). Returns a small list of example attachments the UI can open.
 * Tate verbatim 16:23 AEST 8 May 2026 directs the navigation surface
 * (Decision id 1007 in Neo4j). Authored 8 May 2026 by manager fork
 * fork_mowj7img_1c4d56.
 *
 * Round 4 will replace this stub with a real query against
 * `documents` storage + a per-session attachment table. For now the
 * URLs are illustrative and may 404; the UI's empty/error states
 * handle that gracefully.
 */
const express = require('express')

const router = express.Router()

const ATTACHMENTS = [
  {
    id: 'doc-round-3-spec',
    name: 'Cortex round-3 spec',
    kind: 'md',
    url: 'https://api.admin.ecodia.au/api/files/docs/cortex-ambient-round-3-spec.md',
  },
  {
    id: 'doc-round-2-screenshot',
    name: 'Round-2 polish reference',
    kind: 'image',
    url: 'https://api.admin.ecodia.au/api/files/docs/cortex-ambient-polish-round-2-2026-05-08-post-idle.png',
  },
  {
    id: 'doc-html-preview',
    name: 'Sample HTML preview',
    kind: 'html',
    url: 'https://api.admin.ecodia.au/api/files/docs/sample-preview.html',
  },
]

router.get('/attachments', (req, res) => {
  res.json(ATTACHMENTS)
})

module.exports = router
