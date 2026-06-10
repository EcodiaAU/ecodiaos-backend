#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { google } = require('googleapis');

const SA_PATH = '/Users/ecodia/PRIVATE/ecodia-creds/google-workspace-sa.json';
const PDF_PATH = '/Users/ecodia/.code/ecodiaos/backend/drafts/clients/moss/account-setup-checklist-2026-06-10.pdf';
const DOCX_PATH = '/Users/ecodia/.code/ecodiaos/backend/drafts/clients/moss/account-setup-checklist-2026-06-10.docx';
const SUBJECT = 'Yourcelium Phase 1: account setup checklist (Apple, Google, Supabase, Resend, GitHub)';
const TO = 'ryan@seedtree.earth';
const FROM = 'code@ecodia.au';

const BODY = [
  'Hey Mossy,',
  '',
  'Quick one. Phase 1 substrate + both native apps are written and demoable. The next blocker is the five accounts under your name with EcodiaOS invited, so we can deploy the schema to your Supabase, register bundle IDs on Apple/Google, and push the code to your GitHub org.',
  '',
  'Checklist attached as PDF and as a Word doc (whichever is easier). The five accounts and what to do on each:',
  '',
  '  1. Apple Developer Program  ($99/yr, longest path, start this first)',
  '  2. Google Play Console      ($25 one-time)',
  '  3. Supabase                 (free)',
  '  4. Resend                   (free)',
  '  5. GitHub org               (free)',
  '',
  'Three questions in there for you to flag back when you reply:',
  '  - Individual or organisation enrolment on Apple and Google?',
  '  - DNS for the sending domain: give us registrar access or run records yourself?',
  '  - Which first surface: T&Cs&U, LostMe, or Glasshouse?',
  '',
  'If Apple goes in today the 7-business-day clock starts today. The rest are same-day or next-day. The M1 internally-testable target (27 June) and M2 completion target (11 July) per the SOW assume these land this week.',
  '',
  'Yell if anything is unclear.',
  '',
  'Tate',
  'Ecodia',
  ''
].join('\r\n');

async function main() {
  const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.modify'],
    subject: FROM,
  });
  await auth.authorize();
  const gmail = google.gmail({ version: 'v1', auth });

  const pdfBytes = fs.readFileSync(PDF_PATH);
  const pdfB64 = pdfBytes.toString('base64').match(/.{1,76}/g).join('\r\n');
  const docxBytes = fs.readFileSync(DOCX_PATH);
  const docxB64 = docxBytes.toString('base64').match(/.{1,76}/g).join('\r\n');
  const boundary = '----=_EcodiaMoss' + Date.now().toString(36);

  const lines = [
    `From: Ecodia <${FROM}>`,
    `To: ${TO}`,
    `Subject: ${SUBJECT}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    BODY,
    `--${boundary}`,
    'Content-Type: application/pdf; name="SeedTree-Earth-Account-Setup-2026-06-10.pdf"',
    'Content-Transfer-Encoding: base64',
    'Content-Disposition: attachment; filename="SeedTree-Earth-Account-Setup-2026-06-10.pdf"',
    '',
    pdfB64,
    `--${boundary}`,
    'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document; name="SeedTree-Earth-Account-Setup-2026-06-10.docx"',
    'Content-Transfer-Encoding: base64',
    'Content-Disposition: attachment; filename="SeedTree-Earth-Account-Setup-2026-06-10.docx"',
    '',
    docxB64,
    `--${boundary}--`,
    '',
  ];
  const raw = Buffer.from(lines.join('\r\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  console.log(JSON.stringify({ messageId: res.data.id, threadId: res.data.threadId, labelIds: res.data.labelIds }));
}

main().catch((err) => { console.error('SEND_FAIL', err.message || err); process.exit(1); });
