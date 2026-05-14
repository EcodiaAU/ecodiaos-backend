#!/usr/bin/env node
'use strict'

// Static analyzer for unsafe Cypher template literals. Scans services/*.js for
// runWrite / runQuery / session.run calls and flags template-literal
// interpolations that don't go through a known-safe sanitizer.
// Origin: AUTONOMY_AUDIT_2026-05-13.

const fs = require('fs')
const path = require('path')

const SAFE_PATTERNS = [
  /sanitize[A-Z]\w*\s*\(/,
  /assertAllowed\w*\s*\(/,
  /coerceLabel\s*\(/,
  /parseInt\s*\(/,
  /Number\s*\(/,
  /Math\.(min|max|abs|floor|ceil)\s*\(/,
  /\.toString\s*\(\s*\)/,
  /String\s*\(/,
]
const ANNOTATION = /\/\/\s*cypher-safe/i

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f)
    const stat = fs.statSync(fp)
    if (stat.isDirectory()) {
      if (f === 'node_modules' || f === '__tests__' || f.startsWith('.')) continue
      walk(fp, out)
    } else if (f.endsWith('.js')) {
      out.push(fp)
    }
  }
  return out
}

function findUnsafe(content, filePath) {
  const findings = []
  const callRe = /(?:runWrite|runQuery|session\.run)\s*\(\s*`([\s\S]*?)`/g
  let m
  while ((m = callRe.exec(content)) !== null) {
    const query = m[1]
    const startIdx = m.index
    const interpRe = /\$\{([^}]+)\}/g
    let im
    while ((im = interpRe.exec(query)) !== null) {
      const expr = im[1].trim()
      if (SAFE_PATTERNS.some(p => p.test(expr))) continue
      const absIdx = startIdx + m[0].indexOf('`') + im.index
      const before = content.slice(Math.max(0, absIdx - 200), absIdx)
      if (ANNOTATION.test(before)) continue
      const lineNo = content.slice(0, absIdx).split('\n').length
      findings.push({ file: filePath, line: lineNo, expression: expr })
    }
  }
  return findings
}

function main() {
  const repoRoot = path.resolve(__dirname, '..')
  const servicesDir = path.join(repoRoot, 'src', 'services')
  const files = walk(servicesDir)
  const all = []
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf-8')
    all.push(...findUnsafe(content, path.relative(repoRoot, f)))
  }
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ findings: all, count: all.length }, null, 2) + '\n')
  } else if (all.length === 0) {
    console.log('cypher-safety: clean - no unsafe interpolations found')
  } else {
    console.error('cypher-safety: ' + all.length + ' unsafe interpolation(s) found:')
    for (const f of all) console.error('  ' + f.file + ':' + f.line + ' - ' + f.expression)
    console.error('\nIf an interpolation is safe by construction, annotate with `// cypher-safe: <reason>` on the same or prior line.')
  }
  process.exit(all.length === 0 ? 0 : 1)
}

if (require.main === module) main()

module.exports = { findUnsafe }
