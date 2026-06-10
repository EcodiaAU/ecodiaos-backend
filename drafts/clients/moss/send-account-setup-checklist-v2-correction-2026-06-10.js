#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { google } = require('googleapis');

const SA_PATH = '/Users/ecodia/PRIVATE/ecodia-creds/google-workspace-sa.json';
const PDF_PATH = '/Users/ecodia/.code/ecodiaos/backend/drafts/clients/moss/account-setup-checklist-2026-06-10.pdf';
const DOCX_PATH = '/Users/ecodia/.code/ecodiaos/backend/drafts/clients/moss/account-setup-checklist-2026-06-10.docx';
const SUBJECT = 'Re: Yourcelium Phase 1: account setup checklist (Apple, Google, Supabase, Resend, GitHub)';
const TO = 'ryan@seedtree.earth';
const FROM = 'code@ecodia.au';
const THREAD_ID = '19eaef592feef5eb';
const IN_REPLY_TO = '<CAPZKu86-CLSeMahKQQyTEqR0hah4Nu45m1hUdFEKQ8R6121uLg@mail.gmail.com>';

const BODY = [
  'Hey Mossy,',
  '',
  'Quick correction on the checklist I sent ten minutes ago. The v1 included an individual-enrolment option on Apple and Google. You want both under SeedTree Earth as the organisation, so I cut that path and rewrote those two sections.',
  '',
  'The main change is a new step 0: get a D-U-N-S number for SeedTree Earth (free, 5 to 14 business days, link is in the doc). It is the prerequisite for both Apple and Google organisation enrolment, so it goes first.',
  '',
  'Updated PDF and Word doc attached. Three questions to reply with are now: D-U-N-S number when it lands, DNS handling for the sending domain, and which first surface to ship (T&Cs&U, LostMe, or Glasshouse).',
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
  const boundary = '----=_EcodiaMossV2' + Date.now().toString(36);

  const lines = [
    `From: Ecodia <${FROM}>`,
    `To: ${TO}`,
    `Subject: ${SUBJECT}`,
    `In-Reply-To: ${IN_REPLY_TO}`,
    `References: ${IN_REPLY_TO}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    BODY,
    `--${boundary}`,
    'Content-Type: application/pdf; name="SeedTree-Earth-Account-Setup-2026-06-10-v2.pdf"',
    'Content-Transfer-Encoding: base64',
    'Content-Disposition: attachment; filename="SeedTree-Earth-Account-Setup-2026-06-10-v2.pdf"',
    '',
    pdfB64,
    `--${boundary}`,
    'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document; name="SeedTree-Earth-Account-Setup-2026-06-10-v2.docx"',
    'Content-Transfer-Encoding: base64',
    'Content-Disposition: attachment; filename="SeedTree-Earth-Account-Setup-2026-06-10-v2.docx"',
    '',
    docxB64,
    `--${boundary}--`,
    '',
  ];
  const raw = Buffer.from(lines.join('\r\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId: THREAD_ID } });
  console.log(JSON.stringify({ messageId: res.data.id, threadId: res.data.threadId, labelIds: res.data.labelIds }));
}

main().catch((err) => { console.error('SEND_FAIL', err.message || err); process.exit(1); });
