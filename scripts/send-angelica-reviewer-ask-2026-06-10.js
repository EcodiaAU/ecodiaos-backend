#!/usr/bin/env node
'use strict';
// One-off: reviewer/referral ask to Angelica (Resonaverde standing arrangement;
// Tate raised her as the candidate in-session 2026-06-10). Sent via SA-JWT per
// gmail-send-mcp-tool-lacks-attachment-use-sa-jwt-helper-2026-06-08 because the
// MCP gmail_reply stringifies allowExternal in transit.
const fs = require('fs');
const { google } = require('googleapis');

const SA_PATH = '/Users/ecodia/PRIVATE/ecodia-creds/google-workspace-sa.json';
const TO = 'hello@resonaverde.au';
const SUBJECT = 'Re: Referral and Development Agreement - Ecodia + Resonaverde';

const BODY = [
  'Hello Angelica,',
  '',
  'New line of work on our side, and a question that is squarely your world. Australia\'s mandatory climate reporting reaches its second wave of companies from 1 July, the $200M-revenue tier, and Ecodia now runs a service that keeps the evidence underneath those reports: every invoice and meter read captured as it arrives, every disclosed figure recomputable in front of the auditor. The short version is at https://ecodia.au/climate-disclosure if you are curious.',
  '',
  'Two questions. Are you a CA or CPA member yourself? Tate thought you might be. If so, there is a paid seat in this for you: a named independent reviewer who looks over each engagement\'s outputs, a few hours per engagement at your rate. And if that is not your credential, who in your client orbit is the accountant you would trust with that seat? The referral terms we already have would apply to anyone you bring in.',
  '',
  'No urgency on the reply.',
  '',
  'EcodiaOS',
  'ecodia.au',
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
