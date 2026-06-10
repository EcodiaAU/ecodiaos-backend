---
status: draft_for_tate_review
to: hello@resonaverde.au
from: code@ecodia.au (sent by EcodiaOS, surfaced for Tate go-ahead)
subject: Re: Chamber App Testing Feedback
in_reply_to_thread: <Angelica's 29 May 2026 19:36 AEST email>
---

Hi Angelica,

Thanks for the SCYCC notes. The 16 points you flagged were spot on. We shipped a wave-killer arc against them on a feature branch this afternoon; the preview deploy is here once Vercel finishes the rebuild, and we'll merge to main once Tate eyeballs it on his phone:

  https://chambers-frontend-feat-chambers-angelica-feedback-wave-2026-05-31.vercel.app

What changed:

**Member directory**

  * The blur-but-never-load bug on the profile is fixed. The profile is now a real page at /members/:id, not an inline modal, so the iOS Safari issue that was hiding the content can't recur and the URL is shareable.
  * Profile shows name, role, business, banner, bio, and a contact button. The contact mailto's the member directly when they've set their own contact email, otherwise it routes to the chamber.
  * Member edit form on /profile now has a separate billing email field. The visible profile email stays public, billing email stays private and only the dues invoices use it.
  * Directory pins executives at the top, then committee members, then alphabetical for everyone else. Officers can still hand-order their executives via the existing sort_order column.
  * Membership tier cards live on their own /membership page now, split out from the directory so the two surfaces don't blur together.

**Events**

  * Registration prepopulates the attendee details from the signed-in member already. We confirmed the server uses the member row, no form-fill needed.
  * "Bringing a guest?" toggle on the RSVP card. Optional name + email for a +1; ships through the RSVP and the ticket checkout. SCYCC officers see the guest name on the attendee list.

**Officer admin dashboard**

  * Three new widgets: Upcoming renewals (next 30 days), New members (joined in last 30 days), Event newcomers (first-time RSVPs in last 30 days). Each links into the right admin subpage.
  * Role-preset chip selector at the top of the dashboard: All / Executive / Membership / Finance / Legal. Each preset shows the sections that officer cares about and hides the rest. Membership sees renewals + newcomers, finance sees revenue + churn, legal sees a calm headcount view. Selection persists per browser.
  * Pending applications card hides itself when the bucket is empty. SCYCC's instant-pay flow collapses the Applications surface without needing a config flag.

**Groups**

  * Chat bubble width tightened on mobile, message-action menu sits inside the bubble corner now instead of clipping past the viewport on narrow phones. The composer respects the iOS safe area.
  * One-tap "Seed from committees" admin action in /admin/groups creates a focus group per existing committee, carrying over each committee's name and description. Safe to re-run, skips any committee whose slug already maps to a group. So SCYCC's existing membership / legal / finance / executive committees can become group chats in one click.

**Member home page**

  * Active groups card surfaces the focus groups with the most recent chat activity so a member drops straight into the conversation they're following.
  * Newsletters tile + new /newsletters page so members can re-read past chamber issues. The body is sanitised before render as a defence-in-depth pass.
  * "Your next event" and the membership renewal date were already on the member home; we verified both.

A few items we noted but didn't change:

  * Pinning specific people that aren't already officers or committee members. The is_executive flag and committee_id tag drive the pinning today; if SCYCC wants ad-hoc "Pin Bob" on top of that, we can add a per-member pinned boolean later. Holding for now since the role-driven path covers the four common cases (membership / legal / finance / executive) you flagged.
  * Renewals section as a permanent rename of "Applications." The widget surfaces renewals directly already; the Applications stat card collapses when it's 0. If you want the words swapped on tenants with no application backlog, that's a small per-tenant config follow-up.

Happy to walk you through the preview if anything reads off, or to take another pass once you've poked at it. Thanks again for the eyes on it.

Kind regards,
EcodiaOS
code@ecodia.au
