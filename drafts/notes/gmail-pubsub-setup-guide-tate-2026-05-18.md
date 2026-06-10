# Gmail Pub/Sub Push Setup — step-by-step

Goal: drop inbound-email latency from 60+ min (triage cron floor) to sub-30s. Gmail push notifies a Cloud Pub/Sub topic on every inbox change, the topic delivers to our webhook, and the existing `emailArrival` listener fires immediately.

This is mostly Google Cloud Console clicks. **Do all of this on `code@ecodia.au` Google account** (the Workspace account that owns the existing service-account JSON our backend uses).

Total time: ~20 minutes.

---

## Step 0 — Confirm prerequisites

- You're logged into Chrome on Tate-profile with `code@ecodia.au` Workspace identity.
- Backend env / kv_store has `GOOGLE_SERVICE_ACCOUNT_JSON` already (it does — `gmailService.js` uses it daily). The same service account will receive the push permission grant.
- Backend is reachable from the public internet at `https://api.admin.ecodia.au/api/webhooks/gmail-push` (this endpoint doesn't exist yet — I ship it after you finish the GCP side).

---

## Step 1 — Open or create the GCP project

Open: https://console.cloud.google.com/

Top bar → project selector → check if there's an existing **EcodiaOS** project.

- **If yes:** select it. Note the project ID (e.g. `ecodiaos-prod` or similar).
- **If no:** click "New Project" → name `ecodiaos-comms` → org `ecodia.au` → Create. Wait ~30s.

Record the **Project ID** somewhere (you'll paste it back to me). It looks like `ecodiaos-comms` or `ecodiaos-comms-123456`.

---

## Step 2 — Enable APIs

Left nav → "APIs & Services" → "Library". Search for and **enable** each:

1. **Gmail API**
2. **Cloud Pub/Sub API**

Both should say "API enabled" after a few seconds.

---

## Step 3 — Create the Pub/Sub topic

Left nav → "Pub/Sub" → "Topics" → **Create Topic**.

- Topic ID: `gmail-inbound`
- Leave "Add a default subscription" UNchecked (we make a custom one).
- Click Create.

Stay on the topic page. Look at the topic name in the header — it's `projects/<project-id>/topics/gmail-inbound`. **Copy that full name** (you'll paste to me).

---

## Step 4 — Grant Gmail the right to publish

On the same topic page → "Permissions" tab → **+ ADD PRINCIPAL**.

- New principals: `gmail-api-push@system.gserviceaccount.com`
- Role: **Pub/Sub Publisher**
- Save.

This lets Google's Gmail backend write notifications into your topic.

---

## Step 5 — Create the push subscription

Left nav → "Pub/Sub" → "Subscriptions" → **Create Subscription**.

- Subscription ID: `gmail-inbound-to-webhook`
- Cloud Pub/Sub topic: `gmail-inbound`
- Delivery type: **Push**
- Endpoint URL: `https://api.admin.ecodia.au/api/webhooks/gmail-push`
- Enable authentication: **ON**
- Service account: pick the one Gmail Service Account uses today (the one whose JSON is in `kv_store.creds.google.service_account_json`). If the dropdown is empty, see Step 5a below.
- Audience: leave default OR set to `https://api.admin.ecodia.au` (matches the webhook host).
- Acknowledgement deadline: 60s (default 10s is too tight if our backend GCs).
- Message retention: 1 day (default 7 is wasteful).
- Click Create.

### Step 5a — if the service-account dropdown is empty

The push subscription needs to authenticate to our webhook. Either:

- **Option A (recommended):** use an existing service account → IAM & Admin → Service Accounts → find the one whose email matches our `kv_store.creds.google.service_account_json`. Grant it the role "Service Account Token Creator" on itself (so it can mint OIDC tokens). Then retry Step 5.
- **Option B:** create a fresh service account `gmail-pubsub-pusher@<project>.iam.gserviceaccount.com` with no roles. Use it in Step 5. I'll wire the webhook to accept OIDC from this principal.

---

## Step 6 — Run gmail.users.watch (one-off, from your browser console OR I do this for you)

Gmail needs to be told "watch the inbox and notify the topic." This is a single API call per inbox. We need to run it once per Gmail account we want to watch (tate@, code@, money@).

**Easy path: I run it.** Once you've completed Steps 1-5 and pasted me back the project ID + topic name, I'll fire `gmail.users.watch` against each inbox via our existing OAuth + service-account auth.

**DIY path (if you want):** OAuth Playground → https://developers.google.com/oauthplayground → authorise `gmail.modify` → API: `gmail.users.watch` → request body:

```json
{
  "labelIds": ["INBOX"],
  "topicName": "projects/<your-project-id>/topics/gmail-inbound",
  "labelFilterAction": "include"
}
```

The watch expires every 7 days — I'll set up a daily refresh cron once shipped.

---

## What you give back to me

Three pieces of info:

1. **GCP project ID** (Step 1).
2. **Full topic name** `projects/<project-id>/topics/gmail-inbound` (Step 3).
3. **Service-account email** used by the push subscription (Step 5).

Then I:

- Ship `backend/src/routes/webhooks/gmail-push.js` (validates the OIDC token, parses the Pub/Sub envelope, pulls the new message via gmail.users.history.list, emits the existing `emailArrival` perception event).
- Ship the daily `gmail-watch-refresh` cron so the 7-day watch never lapses.
- Run `gmail.users.watch` against tate@/code@/money@ inboxes.
- Verify end-to-end with a self-sent email — should land in the conductor inbox in <30s.

---

## Failure modes / things to watch

- **Auth on Step 5 failing:** Pub/Sub push needs an OIDC token. If the service-account dropdown is empty, Step 5a is the workaround.
- **Webhook returning 401/403:** the push subscription's audience claim must match our verification. I'll handle this in the route, but if you see "delivery failures" in the subscription dashboard early on, that's why.
- **Watch lapses after 7 days:** the refresh cron handles this, but if it's not shipped yet you can re-run gmail.users.watch manually any time.
- **Cost:** Pub/Sub for our volume (~50 inbound emails/day) is well under the free tier. Don't worry about billing.

---

## TL;DR — your 6 clicks

1. Open https://console.cloud.google.com/
2. Project selector → create or pick `ecodiaos-comms`.
3. APIs & Services → Library → enable Gmail API + Pub/Sub API.
4. Pub/Sub → Topics → Create `gmail-inbound`.
5. Permissions → grant `gmail-api-push@system.gserviceaccount.com` the Publisher role.
6. Pub/Sub → Subscriptions → Create push sub → endpoint `https://api.admin.ecodia.au/api/webhooks/gmail-push` → auth ON → pick service account.

Paste me back: project ID, full topic name, service account email. I'll ship the rest.
