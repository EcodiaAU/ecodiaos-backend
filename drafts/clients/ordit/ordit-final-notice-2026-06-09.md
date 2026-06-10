# Final Notice Before QCAT Filing - INV-2026-002

## Dispatch instructions

Send the email below as a 2-track on 9 June 2026 evening:

**Track 1:** From `tate@ecodia.au` to `craige@fireauditors.com.au`, with `code@ecodia.au` in CC. Subject as shown. Body as shown. Attach the LoD PDF (`drafts/clients/ordit/ordit-lod-craige-hills-2026-05-26.legal.pdf`) and the original invoice (recover from sent folder in Gmail or from the bookkeeping system).

**Track 2:** Forward Track 1, sent separately from `code@ecodia.au` to `craige@fireauditors.com.au`, no CC. Same subject prefixed with `[FW]`. Same body and attachments. Sent within ~5 minutes of Track 1 so the chronology is tight.

If Craige has filtered or blocked either address, the other reaches him. He cannot later claim he never received the demand.

---

## Email body

**Subject:** Final notice before QCAT filing - INV-2026-002 - Ecodia Pty Ltd v Spatial & Compliance Pty Ltd

---

Craige,

This is a final notice in respect of unpaid tax invoice INV-2026-002 ($3,432.00 inc GST), issued by Ecodia Pty Ltd to Spatial & Compliance Pty Ltd on 19 April 2026 and payable by 27 April 2026.

On 26 May 2026 Ecodia Pty Ltd sent you a formal Letter of Demand by email to this address, attached again to this message for ease of reference. The Letter of Demand required payment of $3,432.00 in cleared funds within fourteen days, that is, by 9 June 2026, and gave notice that recovery proceedings would be commenced without further notice if the amount was not received in full by that date.

The fourteen day window closed today. Ecodia Pty Ltd has received no payment from you and no written response of any kind from you or from anyone acting on your behalf. This email is sent from both `tate@ecodia.au` and `code@ecodia.au` so that whichever address you currently receive mail at, the demand reaches you.

Ecodia Pty Ltd will now proceed without further notice to file a minor civil disputes claim in the Queensland Civil and Administrative Tribunal under the *Queensland Civil and Administrative Tribunal Act 2009* (Qld). The filing fee of $158.90 plus statutory interest on the unpaid amount from 27 April 2026 will be sought as part of the orders. If, before filing has been completed, you remit $3,432.00 in cleared funds to the account set out in the Letter of Demand, or you respond in writing with a particularised dispute identifying the specific deliverable said to be deficient and the contractual or factual basis for the deduction, Ecodia Pty Ltd will halt the filing process and engage in good faith with that response.

Payment details, restated:

- Account name: Ecodia Pty Ltd
- BSB: 313-140
- Account number: 12579148
- Bank: Bank Australia
- Reference: INV-2026-002

Please email confirmation of payment to `tate@ecodia.au` on the date of transfer.

Signed,

**Tate Donohoe**
Director, Ecodia Pty Ltd (ABN 89 693 123 278)
tate@ecodia.au · +61 404 247 153

9 June 2026

*Attached: ordit-lod-craige-hills-2026-05-26.legal.pdf (Letter of Demand, 26 May 2026); INV-2026-002.pdf (tax invoice, 19 April 2026)*

---

## Why this is the right send tonight

Three reasons:

1. **Closes the channel-blocked defence.** Sending from both `tate@` and `code@` means Craige cannot later argue at QCAT that he simply did not receive the demand. The Tribunal will see the dual send beside the silence.

2. **No new clock, no bluff.** The email does not set a new deadline. It says Ecodia is going ahead with QCAT now. Off-ramp only exists for as long as the filing has not been completed. That posture is harder to read as a stall.

3. **Off-ramp without sacrificing recovery.** If Craige pays before the filing has been completed, Ecodia keeps the $158.90 fee in pocket. If he responds with a particularised dispute, Ecodia engages with it before filing. Either of those outcomes is better than QCAT for both sides. The cost of writing the off-ramp is zero; the cost of not writing it is a Tribunal Member wondering why we did not give him one last chance to settle in writing.

## Voice check (run before send)

```
python3 /Users/ecodia/.code/ecodiaos/backend/voice/voice_check.py /Users/ecodia/.code/ecodiaos/backend/drafts/clients/ordit/ordit-final-notice-2026-06-09.md --register outbound
```

## Status_board update on send

Once Tate sends both tracks, update status_board row `7f843fde-0cc3-4422-98ec-000c482389f2`:
- `status`: "Final notice sent 2026-06-09 evening from tate@+code@; filing proceeds without further notice"
- `next_action_by`: ecodiaos (next action is to file QCAT)
- `next_action`: "File Form 3 minor civil dispute via QCAT online portal. Statement of claim at drafts/clients/ordit/ordit-qcat-statement-of-claim-2026-06-09.md. Filing fee $158.90. If a reply or payment arrives before filing is completed, halt and re-evaluate."

Write a Neo4j Episode capturing the dual-channel send with subject, recipient, and attachments.
