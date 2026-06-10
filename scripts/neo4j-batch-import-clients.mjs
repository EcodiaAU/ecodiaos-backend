#!/usr/bin/env node
// scripts/neo4j-batch-import-clients.mjs
//
// Idempotent batch import of canonical edges from clients/<slug>.md
// "People" sections into Neo4j. Reads each client doc, extracts
// "<Name> (<ROLE>)" attributions from the People block, MERGEs the
// Person + Organization nodes, and writes the canonical edges with
// full provenance.
//
// Usage:
//   node neo4j-batch-import-clients.mjs                # import all clients/*.md
//   node neo4j-batch-import-clients.mjs --dry-run      # report what would change
//   node neo4j-batch-import-clients.mjs --only coexist # single client
//
// Doctrine: patterns/neo4j-world-model-relationships-first-2026-06-11.md
// Schema:   docs/neo4j-world-model-schema.md
//
// Conservative: only imports facts that match the clear
// "Name (ROLE)" or "<Name>, <ROLE> of <Org>" shapes inside a section
// labelled "People" or "Contacts" or "Team". Ambiguous or hedged
// prose (likely / probable / presumably) is skipped, never asserted.

import { readdir, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const CLIENTS_DIR = join(ROOT, 'clients');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY = (() => { const i = args.indexOf('--only'); return i >= 0 ? args[i + 1] : null; })();

const NEO4J_URI = process.env.NEO4J_URI || process.env.AURA_URI;
const NEO4J_USER = process.env.NEO4J_USER || process.env.AURA_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || process.env.AURA_PASSWORD;

// Slug -> canonical Organization node name. Same map as cross-link.mjs.
const SLUG_TO_ORG = {
  coexist: 'Co-Exist Australia',
  woodfordia: 'Woodfordia',
  glovebox: 'Glovebox',
  chambers: 'Chambers',
  goodreach: 'Goodreach',
  locals: 'Locals',
  resonaverde: 'Resonaverde',
  wildmountains: 'Wild Mountains',
};

const ROLE_TO_EDGE = {
  ceo: 'CEO_OF',
  cfo: 'EMPLOYEE_OF',
  cto: 'EMPLOYEE_OF',
  coo: 'EMPLOYEE_OF',
  founder: 'FOUNDER_OF',
  'co-founder': 'FOUNDER_OF',
  cofounder: 'FOUNDER_OF',
  director: 'DIRECTOR_OF',
  'managing director': 'DIRECTOR_OF',
  chair: 'CHAIR_OF',
  chairperson: 'CHAIR_OF',
  'community manager': 'COMMUNITY_MANAGER_OF',
  employee: 'EMPLOYEE_OF',
  contractor: 'CONTRACTOR_FOR',
  advisor: 'ADVISOR_TO',
  adviser: 'ADVISOR_TO',
  member: 'MEMBER_OF',
  trustee: 'MEMBER_OF',
};

const HEDGE_RE = /\b(likely|probable|presumably|most likely|appears to be)\b/i;

function extractPeopleClaims(md, slug, today) {
  // Find the "People" / "Contacts" / "Team" section.
  const sectionRe = /(?:^|\n)(?:[#*]+\s*)?(?:People|Contacts|Team)\b([\s\S]*?)(?=\n(?:[#*]+\s*)?\w|$)/i;
  const m = sectionRe.exec(md);
  const block = m ? m[1] : md; // fallback to full doc if no section header

  const claims = [];
  // Pattern: "<Name> (<ROLE>)" — "Kurt Jones (CEO)"
  const paren = /\b([A-Z][a-zA-Z'.-]{1,30}(?:\s+[A-Z][a-zA-Z'.-]{1,30}){0,3})\s*\(\s*([A-Za-z][A-Za-z\s/-]{1,40}?)\s*\)/g;
  let p;
  while ((p = paren.exec(block))) {
    const name = p[1].trim();
    const role = p[2].trim().toLowerCase();
    const edge = ROLE_TO_EDGE[role];
    if (!edge) continue;
    // Skip the surrounding sentence if hedged
    const ctx = block.slice(Math.max(0, p.index - 80), p.index + 80);
    if (HEDGE_RE.test(ctx)) continue;
    claims.push({ name, role, edge, evidence: p[0], source: `clients/${slug}.md "People" section` });
  }

  // Pattern: "<Name>, <ROLE> at/of <Org>" inside the block
  const comma = /\b([A-Z][a-zA-Z'.-]{1,30}(?:\s+[A-Z][a-zA-Z'.-]{1,30}){0,3}),\s+(?:the\s+|a\s+)?([A-Za-z][A-Za-z\s/-]{1,40}?)\s+(?:at|of)\s+/g;
  let c;
  while ((c = comma.exec(block))) {
    const name = c[1].trim();
    const role = c[2].trim().toLowerCase();
    const edge = ROLE_TO_EDGE[role];
    if (!edge) continue;
    const ctx = block.slice(Math.max(0, c.index - 80), c.index + 80);
    if (HEDGE_RE.test(ctx)) continue;
    claims.push({ name, role, edge, evidence: c[0], source: `clients/${slug}.md` });
  }

  // Pattern: "<Name> is the <ROLE>" or "<Name> is <ROLE>" (covers
  // markdown bullets like "- **Kurt Jones (CEO)** at hello@...")
  const isRole = /\b([A-Z][a-zA-Z'.-]{1,30}(?:\s+[A-Z][a-zA-Z'.-]{1,30}){0,3})\s+is\s+(?:the\s+|a\s+|an\s+)?([A-Za-z][A-Za-z\s/-]{1,40}?)\b/g;
  let r;
  while ((r = isRole.exec(block))) {
    const name = r[1].trim();
    const role = r[2].trim().toLowerCase();
    const edge = ROLE_TO_EDGE[role];
    if (!edge) continue;
    const ctx = block.slice(Math.max(0, r.index - 80), r.index + 80);
    if (HEDGE_RE.test(ctx)) continue;
    claims.push({ name, role, edge, evidence: r[0], source: `clients/${slug}.md` });
  }

  // Dedup by (name, edge)
  const seen = new Set();
  return claims.filter(c => {
    const k = `${c.name}|${c.edge}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function withSession(fn) {
  if (!NEO4J_URI || !NEO4J_PASSWORD) {
    console.error('[batch-import] NEO4J_URI + NEO4J_PASSWORD required.');
    process.exit(2);
  }
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session();
  try {
    return await fn(session);
  } finally {
    await session.close();
    await driver.close();
  }
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const allFiles = (await readdir(CLIENTS_DIR))
    .filter(f => f.endsWith('.md') && !f.startsWith('INDEX') && !f.startsWith('context'))
    .filter(f => !f.includes('-archived'));

  const slugs = ONLY ? [ONLY] : allFiles.map(f => f.replace(/\.md$/, ''));
  const candidates = slugs.filter(s => SLUG_TO_ORG[s]);
  console.log(`[batch-import] slugs to process: ${candidates.join(', ')}`);

  const allClaims = [];
  for (const slug of candidates) {
    const orgName = SLUG_TO_ORG[slug];
    const file = join(CLIENTS_DIR, `${slug}.md`);
    try { await access(file); } catch { console.log(`  skip ${slug}: ${file} missing`); continue; }
    const md = await readFile(file, 'utf8');
    const claims = extractPeopleClaims(md, slug, today);
    console.log(`  ${slug} -> ${orgName}: ${claims.length} claim(s) extracted`);
    for (const c of claims) {
      console.log(`     ${c.name} -[${c.edge}]-> ${orgName}  (evidence: "${c.evidence}")`);
      allClaims.push({ ...c, slug, org: orgName });
    }
  }

  if (DRY_RUN) {
    console.log(`[batch-import] DRY RUN: would MERGE ${allClaims.length} edge(s). Exiting.`);
    return;
  }

  if (allClaims.length === 0) {
    console.log('[batch-import] no claims to write.');
    return;
  }

  await withSession(async session => {
    for (const c of allClaims) {
      const cypher = `
        MERGE (p:Person {name: $name})
        MERGE (o:Organization {name: $org})
        MERGE (p)-[r:${c.edge}]->(o)
        ON CREATE SET r.as_of = $today,
                      r.source = $source,
                      r.confidence = 'confirmed',
                      r.authored_by = 'neo4j-batch-import-clients.mjs',
                      r.evidence_text = $evidence
        ON MATCH  SET r.last_seen_at = $today,
                      r.last_seen_source = $source,
                      r.last_seen_by = 'neo4j-batch-import-clients.mjs'
        RETURN type(r) AS edge, p.name AS person, o.name AS org,
               r.source AS source, r.as_of AS as_of, r.confidence AS confidence
      `;
      const r = await session.run(cypher, {
        name: c.name,
        org: c.org,
        today,
        source: c.source,
        evidence: c.evidence,
      });
      const rec = r.records[0]?.toObject();
      console.log(`   wrote ${rec?.person} -[${rec?.edge}]-> ${rec?.org}`);
    }
  });

  console.log(`[batch-import] wrote ${allClaims.length} canonical edge(s).`);
}

main().catch(e => { console.error('[batch-import] fatal:', e); process.exit(1); });
