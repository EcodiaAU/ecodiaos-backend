# Chambers App Privacy. Exact click-through for ASC

Apple's `appDataUsages` API is closed (every endpoint returns 404), so this has to go through the ASC web UI. Below is the truthful minimum. Five data types across three categories. Everything is "linked to the user" (it lives in their account) and "not used for tracking" (no advertising or measurement SDKs are wired, and no data is shared with a data broker).

Open: https://appstoreconnect.apple.com/apps/6770804509/distribution/privacy

---

## Page 1. "Does this app collect any data?"

Select: **Yes, we collect data from this app**

---

## Page 2. "Select all data types that you or your third-party partners collect"

Tick exactly these five boxes. Leave everything else unticked.

| Category | Data type | Why we tick it |
|---|---|---|
| Contact Info | **Name** | Member display name in profile and sign-up |
| Contact Info | **Email Address** | Supabase Auth login and chamber officer contact |
| User Content | **Photos or Videos** | Optional profile photo upload |
| User Content | **Customer Support** | Feedback page (subject plus message emailed to the team) |
| Identifiers | **User ID** | Supabase auth uid stored against profile and posts |

**Do NOT tick:** Phone Number, Physical Address, Other User Contact Info, anything under Health/Fitness, Financial Info (Stripe checkout happens off-app, so Apple's rule classifies it as not "collected" by the developer), Location (no Geolocation SDK), Sensitive Info, Contacts, Emails/Text Messages, Audio, Gameplay, Other User Content, Browsing History, Search History, Device ID, Purchases, all Usage Data, all Diagnostics (Sentry is installed but never initialised, so no crash data leaves the device), Surroundings, Body, Other.

Click **Publish** at the bottom of the data-type list to move to per-data-type configuration.

---

## Page 3. Per data type, answer the same three questions

For **every one of the five** data types ticked above, answer:

1. **Is this data used to track users?** -> **No**
   (Tracking means linking with third-party data for advertising or measurement, or sharing with a data broker. We do neither.)

2. **Is this data linked to the user's identity?** -> **Yes**
   (It lives in their Supabase account. Name in profile, photo against member row, feedback message tagged with email.)

3. **Select all the purposes for which this data type is used.**
   Tick exactly one box: **App Functionality**
   (No analytics SDK is wired. Advertising and product personalisation are off. Pure functionality.)

That's the same answer five times. Click Save / Next on each.

---

## Page 4. Final review

Confirm the privacy summary card matches:

> Data Linked to You: Contact Info (Name, Email Address), User Content (Photos or Videos, Customer Support), Identifiers (User ID)
> Data Used to Track You: None
> Data Not Linked to You: None

Click **Publish** at the top right of the review page.

Once published, the `APP_DATA_USAGES_REQUIRED` blocker on `reviewSubmissions/30219b3d-da87-487d-a131-1aa9b7c095e1` clears and the submission can be pushed to WAITING_FOR_REVIEW.

---

## Why the answer is this short

Audit at 12:35 AEST 2026-05-28 across `D:/.code/chambers-frontend-uxfix/`:

- **Auth**: Supabase Auth, email and password (no phone field)
- **Profile**: name, email (auth-locked), optional business name, optional photo (Profile.tsx:393-428)
- **Member signup**: same three fields plus display name (MemberSignUp.tsx:236-263)
- **Feedback**: subject, message, auto-attached email/chamber/page URL, emailed to tate@ecodia.au (Feedback.tsx:40-68)
- **Sentry**: in `package.json` deps but `Sentry.init` is never called. No crash data leaves the device.
- **Push notifications**: `@capacitor/push-notifications` in deps but never registered. No device tokens collected.
- **Stripe**: `@stripe/stripe-js` in deps but checkout happens on Stripe's hosted page. Apple's rule classifies that as not "collected" by us.
- **No analytics SDK** (no PostHog, Amplitude, Mixpanel, Segment, GA)
- **No Geolocation** (no `@capacitor/geolocation`, no map-based location collection)
- **No advertising identifier**, no third-party SDKs that fingerprint

This is the floor. If push notifications get wired or Sentry gets initialised in a future build, add Device ID and Crash Data and re-publish.
