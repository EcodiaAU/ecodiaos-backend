#!/usr/bin/env node
'use strict';
// Document zoo seeding (stage-1 exit criterion 1, 04-substrate-build-spec).
// Pulls REAL attachments from our own mailboxes (code@ + tate@) via SA-JWT,
// read-only usage of the gmail.modify DWD scope, into
// backend/climate-testing/zoo/raw/ with a sha256 manifest. These are genuine
// real-world documents (invoices, statements, policy docs) for ingest +
// classification accuracy measurement. No mailbox state is changed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { google } = require('googleapis');

const SA_PATH = '/Users/ecodia/PRIVATE/ecodia-creds/google-workspace-sa.json';
const OUT_DIR = '/Users/ecodia/.code/ecodiaos/backend/climate-testing/zoo/raw';
const MANIFEST = '/Users/ecodia/.code/ecodiaos/backend/climate-testing/zoo/MANIFEST.json';
const SUBJECTS = ['code@ecodia.au', 'tate@ecodia.au'];
// Finance/utility-shaped senders; the zoo wants invoices, statements, policies.
const QUERY = 'has:attachment (invoice OR statement OR receipt OR bill OR policy OR "tax invoice") filename:pdf';
const MAX_PER_BOX = 25;
const MAX_BYTES = 8 * 1024 * 1024;

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

async function gmailFor(subject) {
  const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.modify'],
    subject,
  });
  await auth.authorize();
  return google.gmail({ version: 'v1', auth });
}

function walkParts(parts, acc) {
  for (const p of parts || []) {
    if (p.filename && p.body && (p.body.attachmentId || p.body.data)) acc.push(p);
    if (p.parts) walkParts(p.parts, acc);
  }
  return acc;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { collected_at_note: 'real documents from our own mailboxes; engagement-zero seeds', items: [] };
  const seen = new Set(manifest.items.map((i) => i.sha256));
  for (const subject of SUBJECTS) {
    const gmail = await gmailFor(subject);
    const list = await gmail.users.messages.list({ userId: 'me', q: QUERY, maxResults: MAX_PER_BOX });
    const ids = (list.data.messages || []).map((m) => m.id);
    console.log(`${subject}: ${ids.length} candidate messages`);
    for (const id of ids) {
      const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
      const headers = Object.fromEntries((msg.data.payload.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
      const atts = walkParts(msg.data.payload.parts ? msg.data.payload.parts : [msg.data.payload], []);
      for (const att of atts) {
        if (!/\.pdf$/i.test(att.filename)) continue;
        let buf;
        if (att.body.data) {
          buf = Buffer.from(att.body.data, 'base64');
        } else {
          const a = await gmail.users.messages.attachments.get({ userId: 'me', messageId: id, id: att.body.attachmentId });
          buf = Buffer.from(a.data.data, 'base64');
        }
        if (buf.length > MAX_BYTES || buf.length < 1000) continue;
        const hash = sha256(buf);
        if (seen.has(hash)) continue;
        seen.add(hash);
        const safe = att.filename.replace(/[^\w.-]+/g, '_').slice(0, 80);
        const fname = `${hash.slice(0, 12)}_${safe}`;
        fs.writeFileSync(path.join(OUT_DIR, fname), buf);
        manifest.items.push({
          file: fname,
          sha256: hash,
          bytes: buf.length,
          source_mailbox: subject,
          source_message_id: id,
          from: headers.from || null,
          subject: headers.subject || null,
          date: headers.date || null,
        });
        console.log(`  saved ${fname} (${buf.length}b) from ${headers.from}`);
      }
    }
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`MANIFEST: ${manifest.items.length} total documents`);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
