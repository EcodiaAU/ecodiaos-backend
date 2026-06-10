# Chambers App Store Resolution Center reply (v2, build 28)
# Submission 1ececcd0-9528-489d-9718-7ee7e8ae4fe5
# Guideline 2.1(b) / 3.1.3 - corrects the 4 Jun 2026 reply
# Drafted 2026-06-09

## What changed since the previous reply

The 4 Jun 2026 reply asserted "no purchase capability in the app, no buy
button". That statement was inconsistent with the build under review,
which contained four Stripe Checkout surfaces reachable from the demo
account (Membership, paid event tickets, chamber-admin plan upgrade,
member dues). Build 28 (CFBundleShortVersionString 1.5, CFBundleVersion
28) gates every one of those surfaces on iOS native. Web and Android
builds are unchanged.

## Where to paste

App Store Connect > Chambers. > App Review > Resolution Center thread on
submission 1ececcd0. Paste the text below into the reply field, then
send. Attach build 28 to ASV 1.5 and resubmit.

The reply text is everything below the line.

---

Thank you for the continued review. Build 28 corrects an inconsistency in our previous response and brings the iOS app into line with the B2B framing described under Guideline 3.1.3.

In build 28, the iOS app shows no purchase affordance. Specifically:

1. Membership page - tier cards remain visible as informational pricing for the chamber's published membership tiers, with the join CTA replaced by "Contact <chamber> to join". No Stripe Checkout button is rendered on iOS. No external link to a chamber sign-up storefront is rendered on iOS.

2. Event detail page - paid event tickets show the ticket price as informational copy, with a "Contact <chamber> to purchase this ticket" prompt. No Stripe Checkout button is rendered on iOS. Free events and members-included events still RSVP normally because no payment is taken; these run entirely inside the app without any external redirect.

3. Member dues card - the dues status (current / pending / grace / overdue) and the dues amount remain visible as informational copy, with a "Contact the chamber to arrange payment for this membership period" prompt. No Stripe Checkout button is rendered on iOS. The direct-debit setup flow is also hidden on iOS; the existing-mandate cancel control is preserved because it removes a recurring charge rather than initiating one.

4. Chamber admin billing - the tier picker remains visible as informational copy showing each plan's features and AUD monthly price. The "Upgrade" button is replaced by a "Web only" indicator on iOS. No Stripe Checkout is reachable from the iOS build.

The underlying B2B framing is unchanged: chamber memberships are real-world business relationships established between a chamber organisation and a member business outside the app via the chamber's own onboarding process (signed agreement, EFT invoice, in-person registration at chamber events). The app reflects the existing relationship; on iOS, the app does not surface any path that would create a new purchase.

Demo credentials in App Review Information (apple@ecodia.au / appleecodia) sign in as a member with the President role on the Sunshine Coast Youth Chamber of Commerce demo tenant. From iOS, navigating through Membership, Events, Profile (dues card), and Admin > Billing now shows informational content only, with off-app contact prompts in place of every purchase affordance.

We appreciate the patience and are happy to provide additional context, a sample chamber membership invoice, or a copy of the standard membership agreement if useful.
