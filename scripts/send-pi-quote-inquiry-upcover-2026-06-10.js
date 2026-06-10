#!/usr/bin/env node
'use strict';
// One-off: PI / tech E&O indicative quote inquiry to upcover (Path 1 of
// drafts/climate-disclosure/pi-insurance-quotes-2026-06-10.md). Vendor inquiry,
// no binding, no spend. Sent via SA-JWT per
// gmail-send-mcp-tool-lacks-attachment-use-sa-jwt-helper-2026-06-08.
const fs = require('fs');
const { google } = require('googleapis');

const SA_PATH = '/Users/ecodia/PRIVATE/ecodia-creds/google-workspace-sa.json';
const TO = 'support@upcover.com';
const SUBJECT = 'Indicative PI / tech E&O quote: Australian climate-disclosure data-preparation service, AI delivery model';

const RISK_DESCRIPTION = [
  'Ecodia Pty Ltd (ACN 693 123 278, QLD) is an Australian software and services company providing climate-disclosure data-preparation services for AASB S2 reporting entities. Engagements consist of (a) building and maintaining an evidence register from the client\'s source systems, (b) running deterministic emissions calculations against AASB S2 disclosure schemas, and (c) preparing draft disclosure narrative and tables for the client\'s own review and signature.',
  '',
  'Ecodia does NOT provide assurance, audit, or any opinion on the client\'s disclosures within the meaning of ASSA 5000 / ASSA 5010. The client retains full ownership of and accountability for every disclosed statement. Engagements are delivered under a disclosed-platform model consistent with APES 305 principles; the SoW includes an explicit no-reliance clause for any party other than the contracted client, a per-engagement capped liability, and a banned-terms list that excludes assurance, review, opinion, verification, and readiness-review language.',
  '',
  'Delivery is performed primarily by an autonomous AI system (the EcodiaOS operating intelligence, in the form of orchestrated Claude Code agents) under the supervision of a human authorised representative. All client-output figures derive from a deterministic calculation engine with golden-test coverage; AI model judgement is constrained to (i) classification of source evidence into the schema and (ii) draft narrative prose, which is grounded against the evidence register and human-reviewed before delivery. The engine is reproducible: every disclosed figure recomputes from hashed sources.',
  '',
  'Client revenue band: under AUD 300,000 in the first full year. Expected client count year one: 5 to 20 boutique consultancies and direct mid-tier reporting entities. Geographic scope: Australia only.',
].join('\r\n');

const BODY = [
  'Hello,',
  '',
  'I am writing on behalf of Ecodia Pty Ltd (ACN 693 123 278, QLD), an Australian software and services company. We are seeking an indicative quote for professional indemnity / technology errors and omissions cover at $5M and $10M limits.',
  '',
  'The risk description (please use this verbatim on any proposal form):',
  '',
  RISK_DESCRIPTION,
  '',
  'Specific questions for your reply:',
  '',
  '1. Indicative annual premium at $5M and at $10M for this risk, with affirmative AI coverage (no silent-AI exposure).',
  '2. Which underwriter(s) you would place this with, and whether the policy attaches Verisk/ISO CG 40 47, W.R. Berkley PC 51380, or any equivalent AI-exclusion endorsement at first issue or at renewal.',
  '3. Whether the deterministic-engine plus human-review architecture described above changes the underwriting position relative to a generic AI-delivered service.',
  '4. The sublimits, retention, and exclusions that would apply in the indicative quote.',
  '5. Approximate timeline from a complete proposal form to bound cover.',
  '',
  'Reply by email to code@ecodia.au. I am not seeking to bind cover at this stage; an indicative range and your AI-exclusion position is sufficient to inform our internal planning. Thank you.',
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
  const mime = [
    'From: EcodiaOS <code@ecodia.au>',
    `To: ${TO}`,
    `Subject: ${SUBJECT}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    BODY,
  ].join('\r\n');
  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: b64UrlSafe(Buffer.from(mime)) } });
  console.log('SENT:', JSON.stringify({ messageId: res.data.id, threadId: res.data.threadId }));
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
