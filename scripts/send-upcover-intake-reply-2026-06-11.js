#!/usr/bin/env node
'use strict';
// Reply to upcover's PI intake request (thread 19eaf33d95c56e3b). Vendor reply
// on an existing thread; facts verified: ABN via abr.business.gov.au 2026-06-11,
// address via QBE Policy_Schedule.pdf on disk, client counts via status_board.
// SA-JWT per gmail-send-mcp-tool-lacks-attachment-use-sa-jwt-helper-2026-06-08.
const fs = require('fs');
const { google } = require('googleapis');

const SA_PATH = '/Users/ecodia/PRIVATE/ecodia-creds/google-workspace-sa.json';
const THREAD_ID = '19eaf33d95c56e3b';
const REPLY_TO_MSG = '19eb0e69531b8906';
const TO = 'support@upcover.com';
const SUBJECT = 'Re: Indicative PI / tech E&O quote: Australian climate-disclosure data-preparation service, AI delivery model';

const BODY = [
  'Hello Preeksha,',
  '',
  'Thank you for the quick turnaround. The requested details:',
  '',
  '- Customer name: Tate Donohoe (director and authorised representative)',
  '- Business name: Ecodia Pty Ltd',
  '- ABN: 89 693 123 278 (active from 23 November 2025, GST registered)',
  '- Address: 23 Saleng Cres, Warana QLD 4575',
  '- Website: https://ecodia.au',
  '- Years in business: incorporated November 2025, first year of trading',
  '- Expected revenue: under AUD 300,000 for the first full year',
  '- Revenue split: 100% domestic (Australia only)',
  '- Number of employees: nil; the company operates through its director and the AI delivery system described in our first email',
  '- Number of subcontractors: nil',
  '- Wages for employees and contractors: nil (no wage bill; director remuneration only)',
  '- Number of customers: three active software clients today; the climate-disclosure line this cover is for is pre-revenue, with first pilot engagements targeted this calendar year',
  '- Insurance required: Professional Indemnity / Tech E&O at $5M and $10M limits, and we specifically need each insurer\'s position on AI exposure (affirmative cover versus exclusion endorsements) stated in the terms',
  '- Additional covers: please include an optional cyber quote alongside if available; no retroactive cover is needed (new service line, no prior acts)',
  '- Current insurance: QBE business liability $20M via BizCover, policy DSU538729BPK, current to January 2027. No professional indemnity currently held. No claims history.',
  '- Required quote timeframe: indicative terms within two to three weeks would suit us well.',
  '',
  'One emphasis for the underwriters: as the risk description sets out, every client-facing figure comes from a deterministic calculation engine, never from AI model output, and AI-classified inputs below a confidence threshold are routed to human review rather than committed. A public demonstration of the delivery system, including cryptographically verifiable outputs, is at https://ecodia.au/climate-disclosure/sample-pack if useful for the submission.',
  '',
  'Happy to complete any insurer proposal forms from here.',
  '',
  'Regards,',
  'EcodiaOS, on behalf of Ecodia Pty Ltd',
  'code@ecodia.au',
  '',
].join('\r\n');

function b64UrlSafe(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function main() {
  const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.modify'],
    subject: 'code@ecodia.au',
  });
  await auth.authorize();
  const gmail = google.gmail({ version: 'v1', auth });
  const orig = await gmail.users.messages.get({ userId: 'me', id: REPLY_TO_MSG, format: 'metadata', metadataHeaders: ['Message-ID'] });
  const mid = (orig.data.payload.headers.find((h) => h.name.toLowerCase() === 'message-id') || {}).value || '';
  const mime = [
    'From: EcodiaOS <code@ecodia.au>',
    `To: ${TO}`,
    `Subject: ${SUBJECT}`,
    mid ? `In-Reply-To: ${mid}` : null,
    mid ? `References: ${mid}` : null,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    BODY,
  ].filter(Boolean).join('\r\n');
  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: b64UrlSafe(Buffer.from(mime)), threadId: THREAD_ID } });
  console.log('SENT:', JSON.stringify({ messageId: res.data.id, threadId: res.data.threadId }));
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
