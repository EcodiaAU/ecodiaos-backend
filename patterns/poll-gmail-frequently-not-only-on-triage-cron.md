---
triggers: gmail-frequent-poll, poll-gmail, gmail-cadence, email-triage-cadence, frequent-inbox-check, gmail-list-messages-default, stale-inbox-risk, missed-client-email, ask-while-tate-live, gmail-poll-on-every-turn, email-triage-cron-only-is-insufficient, reactive-vs-proactive-inbox
status: active
---

# Poll Gmail Frequently - The Triage Cron is a Floor Not a Ceiling

## Rule

Check Gmail (code@ + tate@) frequently: at minimum at the start of any substantial
conversation arc, after any 60+ minute silence, and whenever Tate references
"an email from X" without having forwarded it. The hourly email-triage cron is the
FLOOR, not the ceiling.

## Do

- Run `gmail_list_messages` with `is:unread` or `newer_than:1h` on code@ at session start
  whenever inbox-relevant context is mentioned.
- When Tate says "you have an email from X" - that is a signal you should have already
  known. Pull the thread immediately and act on it in the same turn.
- Add a fresh-Gmail probe to the session-orient checklist for any turn where a client
  name or email context is raised.
- Check both inboxes (code@ + tate@) when looking for a specific sender - clients
  may have both addresses.

## Do Not

- Rely solely on the hourly email-triage cron to surface time-sensitive client emails.
- Ignore "you've got an email from X" hints from Tate - that is a signal the cron
  missed the timing window and he is compensating manually.
- Wait for the next cron fire when you know a client thread is live.

## Anti-Pattern

Tate says "you've got an email from Angelica regarding our new setup" mid-conversation.
The email was sent hours ago. The triage cron fired but did not surface it in context.
EcodiaOS was unaware. Tate had to explicitly name it. This is the failure mode.

## Verification

Check the session-orient skill body. If it does not include a fresh Gmail probe
on session start, add one.

## Cross-References

- `~/ecodiaos/patterns/decide-do-not-ask.md`
- `~/ecodiaos/patterns/100-percent-autonomy-doctrine-30-apr-2026.md`
- email-triage cron in `~/ecodiaos/CLAUDE.md` Scheduling section (the floor this pattern extends)
- `~/ecodiaos/patterns/angelica-resonaverde-standing-arrangement.md` (origin context)

## Origin

Tate verbatim 16:30 AEST 11 May 2026: "Also need to remember to pill Gmail frequently.
You've got an email from Angelica regarding our new setup where she can ask us for anything
within reason and you just deal with it and deploy."
("pill" = "pull/poll" - typo in original)
