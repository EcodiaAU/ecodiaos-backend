#!/usr/bin/env node
// scripts/neo4j-cross-link.mjs
//
// Graph <-> knowledge.lookup cross-link helpers.
//
// `graph-of <slug>`  -> canonical Organization or Person node for a
//                       knowledge-lookup slug (e.g. coexist, woodfordia)
// `slug-of <node>`   -> prose home (clients/<slug>.md path) for a graph node
//
// Usage:
//   node neo4j-cross-link.mjs graph-of coexist
//   node neo4j-cross-link.mjs graph-of woodfordia
//   node neo4j-cross-link.mjs slug-of "Co-Exist Australia"
//   node neo4j-cross-link.mjs map                # full slug->graph mapping

import { readdir, readFile, access } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const CLIENTS_DIR = join(ROOT, 'clients');

const NEO4J_URI = process.env.NEO4J_URI || process.env.AURA_URI;
const NEO4J_USER = process.env.NEO4J_USER || process.env.AURA_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || process.env.AURA_PASSWORD;

// Known canonical mappings (slug -> graph node name). Extend as new
// client docs are written. The map is intentionally explicit so the
// helper is deterministic.
const SLUG_TO_ORG = {
  coexist: 'Co-Exist Australia',
  woodfordia: 'Woodfordia',
  glovebox: 'Glovebox',
  chambers: 'Chambers',
  goodreach: 'Goodreach',
  locals: 'Locals',
  resonaverde: 'Resonaverde',
  wildmountains: 'Wild Mountains',
  ecodia: 'Ecodia Pty Ltd',
  'ecodia-labs': 'Ecodia Labs Pty Ltd',
  'ecodia-dao': 'Ecodia DAO LLC',
  'ecodia-site': 'Ecodia Pty Ltd',
  'ecodia-native': 'Ecodia Pty Ltd',
  'ecodiaos-backend': 'Ecodia Pty Ltd',
};

async function withSession(fn) {
  if (!NEO4J_URI || !NEO4J_PASSWORD) {
    console.error('[cross-link] NEO4J_URI + NEO4J_PASSWORD required.');
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

async function graphOf(slug) {
  const orgName = SLUG_TO_ORG[slug];
  if (!orgName) {
    return { slug, found: false, reason: `no slug mapping for "${slug}". Add to SLUG_TO_ORG in cross-link.mjs.` };
  }
  return await withSession(async session => {
    const r = await session.run(
      `MATCH (n:Organization {name: $name})
       OPTIONAL MATCH (n)<-[r]-(p:Person)
       WHERE r.confidence = 'confirmed' AND type(r) IN ['CEO_OF','FOUNDER_OF','DIRECTOR_OF','CHAIR_OF','COMMUNITY_MANAGER_OF','EMPLOYEE_OF','CONTRACTOR_FOR','ADVISOR_TO','MEMBER_OF']
       RETURN n.name AS org, collect({person: p.name, role: type(r), confidence: r.confidence, as_of: r.as_of}) AS people`,
      { name: orgName },
    );
    if (r.records.length === 0) {
      return { slug, found: false, reason: `graph has no Organization {name: "${orgName}"}` };
    }
    const rec = r.records[0].toObject();
    return { slug, found: true, node: rec.org, people: rec.people.filter(p => p.person) };
  });
}

async function slugOf(nodeName) {
  // Reverse the SLUG_TO_ORG map
  const slug = Object.keys(SLUG_TO_ORG).find(k => SLUG_TO_ORG[k] === nodeName);
  if (!slug) {
    return { node: nodeName, found: false, reason: `no SLUG_TO_ORG entry maps to "${nodeName}"` };
  }
  const file = join(CLIENTS_DIR, `${slug}.md`);
  try {
    await access(file);
    return { node: nodeName, found: true, slug, prose_home: file };
  } catch {
    return { node: nodeName, found: false, slug, reason: `mapped slug "${slug}" but ${file} does not exist on disk` };
  }
}

async function fullMap() {
  return await withSession(async session => {
    const out = [];
    for (const [slug, orgName] of Object.entries(SLUG_TO_ORG)) {
      const file = join(CLIENTS_DIR, `${slug}.md`);
      let exists = false;
      try { await access(file); exists = true; } catch {}
      const r = await session.run(
        `MATCH (n:Organization {name: $name})
         OPTIONAL MATCH (n)<-[r]-(p:Person)
         RETURN n.name AS org, count(r) AS people_edges`,
        { name: orgName },
      );
      const rec = r.records[0]?.toObject();
      out.push({
        slug,
        prose_home: file,
        prose_exists: exists,
        graph_node: orgName,
        graph_exists: !!(rec && rec.org),
        people_edges: rec?.people_edges?.toNumber?.() ?? rec?.people_edges ?? 0,
      });
    }
    return out;
  });
}

const cmd = process.argv[2];
const arg = process.argv.slice(3).join(' ');

(async () => {
  try {
    if (cmd === 'graph-of' && arg) {
      console.log(JSON.stringify(await graphOf(arg), null, 2));
    } else if (cmd === 'slug-of' && arg) {
      console.log(JSON.stringify(await slugOf(arg), null, 2));
    } else if (cmd === 'map') {
      console.log(JSON.stringify(await fullMap(), null, 2));
    } else {
      console.log('Usage: node neo4j-cross-link.mjs (graph-of <slug> | slug-of <node-name> | map)');
      process.exit(1);
    }
  } catch (e) {
    console.error('[cross-link] error:', e.message || e);
    process.exit(1);
  }
})();
