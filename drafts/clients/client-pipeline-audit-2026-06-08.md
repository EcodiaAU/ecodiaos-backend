# Client pipeline audit - 2026-06-08

> Autonomous audit + outreach surfacing. NO contact sent. All drafts await Tate review.
> Hard rule honoured: drafts only, no outbound. Angelica standing arrangement: draft prepared for Tate review (not autopilot-sent because no in-flight Angelica reply thread surfaced this turn).

---

## Per-client drift report

Format: status_board verdict | repo HEAD | next-action by | drift verdict + proposed update (NOT executed).

### Co-Exist (Kurt Jones, hello@coexistaus.org) - ALIGNED

- **status_board:** 9 active rows. INV-2026-004 sent 2026-06-08 (paid track), 1.8.27 Android Input IME race fix (tate), Google Play rejection (READ_MEDIA_IMAGES strip), check-in / 4am-timestamp root-causes fixed.
- **Repo (coexist):** `fa1d9b0 2026-06-08 build(android): read signing passwords from macOS Keychain (hands-off signing)`. Today.
- **Recent activity:** dense - mac-local headless iOS ship verified 2026-06-08 (1.9.0/7 WAITING_FOR_REVIEW), Android 1.9.0/35 via Keychain + CDP submit-for-review.
- **Drift verdict:** ALIGNED. Repo + board converge. Renewal arc (post-2026-08-07) sits at `59a67b24` priority 3, by=tate. Tate-window 7-15 Jul 2026.

### Chambers - ALIGNED but in App Review hold pattern

- **status_board:** `f89742d9` P1 by=ecodiaos. 1.5(27) Apple silent since 03:57Z, normal 24-48h window. Reply already sent via CDP 2026-06-08. `app-store-review-watch` cron probes every 4h.
- **Repo (chambers-frontend):** `6965e45 2026-06-08 chore: deploy retry`.
- **Drift verdict:** ALIGNED. Wait state.

### Glovebox (Roam-rename) - ALIGNED

- **status_board:** Home Dashboard shipped a79d2ed (per task brief). v2 native rebuild in progress on iOS + Android. CarPlay awaiting Apple entitlement grant (P3, by=external).
- **Repo (glovebox/frontend):** `504b1a1 2026-06-08 landing: restore big title`. glovebox-ios `debe4ba 2026-06-04`. glovebox-android `b36f043 2026-06-03`.
- **Drift verdict:** ALIGNED.

### Goodreach (Tom Groat / Kurt / Tate co-founders) - DRIFT_repo_stale + DRIFT_silence

- **status_board:** `5b971522` P3 client silence row "70d silent" plus `5f4d0670` P1 "Goodreach restructure plus Resonaverde channel merge". Partnership-watering draft `1f5d5f28` awaiting Tate approval.
- **Repo (goodreach):** `ba81a93 2026-05-21 landing: skip marketing page on Capacitor`. 18 days idle on repo.
- **Drift verdict:** DRIFT_repo_stale plus DRIFT_relationship (70d Tom silence, repo 18d cold, restructure P1 unmoved).
- **Proposed UPDATE (NOT executed):**
  ```sql
  UPDATE status_board SET
    status = 'restructure_proposal_draft_owed_2026-06-08_repo_18d_idle',
    next_action = 'Conductor: draft Goodreach restructure proposal (channels: NFP/SMB/bespoke -> revisit) in EcodiaOS aesthetic. Tate approval gate before any Tom/Kurt contact. Cross-ref Resonaverde channel merge thesis.',
    last_touched = NOW()
  WHERE id = '5f4d0670-4dd7-44a0-8335-19e442d44ce0';
  ```

### Resonaverde (Angelica Choppin, hello@resonaverde.au) - DRIFT_repo_stale

- **status_board:** `a17c981a` P2 thread "Angelica referral agreement - two-way update requested" by=ecodiaos. Pull recent threads, redraft v3, Tate e-signature.
- **Repo (resonaverde):** `7042293 2026-05-27 ui(admin): post-list legibility`. **12 days idle.**
- **Drift verdict:** DRIFT_repo_stale + DRIFT_referral_agreement_open (v3 in-flight, own-boards CoI clause). Standing arrangement IS active for in-scope work.
- **Proposed UPDATE:**
  ```sql
  UPDATE status_board SET
    status = 'referral_v3_redraft_owed_repo_12d_idle_no_open_angelica_thread',
    next_action = 'Conductor: pull Angelica email threads via gmail_list_messages (code@ + tate@), redraft referral v3 reflecting two-way structure + WM own-boards CoI exclusion clause, present PDF to Tate for e-signature dispatch.',
    last_touched = NOW()
  WHERE id = 'a17c981a-a95e-45d7-bb59-3a65a1c7f6fa';
  ```

### Woodfordia - DRIFT_admin_unshipped

- **status_board:** Build 2 1.0 valid on TestFlight 2026-05-28. Admin SPA NOT deployed (no Vercel project).
- **Repo:** `60f9e36 2026-05-28 feat(surface-A): port Now + schedule + festival + safety alerts to native`. **11 days idle.**
- **Drift verdict:** DRIFT_admin_unshipped. Manifest names this; no status_board row tracks it.
- **Proposed INSERT:**
  ```sql
  INSERT INTO status_board (entity_type, name, status, next_action, next_action_by, priority)
  VALUES ('project','Woodfordia admin SPA - Vercel project missing',
    'unblock_at_first_admin_demand','Create Vercel project `woodfordia-admin` pointed at EcodiaTate/woodfordia repo with apps/admin as root. Deploy + smoke. Hold until Woodfordia Inc asks for staff URL.',
    'ecodiaos', 4);
  ```

### Wildmountains - ALIGNED (hold pattern)

- **status_board:** `c45012dc` P3 by=client. Verbally locked, awaiting kickoff signal. Freshness reconfirmed 2026-05-26.
- **Repo:** Not cloned on Mac.
- **Drift verdict:** ALIGNED with hold pattern. Tate owns this relationship.

### Locals (Tate-Ecodia internal product) - ALIGNED

- **Repos:** locals-web `645d9a3 2026-06-08`, locals-ios `83b9223 2026-06-04`, locals-android `9e1c664 2026-06-03`, locals-shared `c55506f 2026-06-03`.
- **Drift verdict:** ALIGNED.

### Context iOS - ALIGNED

- **Repo:** `e8f052b 2026-05-28 build 48`. 11 days idle but status_board notes share-sheet build 40 done; no new ask.

### Vikki Marsh - DRIFT_tate_blocked

- **status_board:** `e7bea4e4` P2 by=tate. DNS-cutover on Digital Pacific + final revisions sit with Tate.
- **Drift verdict:** DRIFT_tate_blocked (15+ days, conductor cannot unblock).

### SCEC Website - DRIFT_tate_blocked

- **status_board:** `dedc8cc2` P2 by=tate, demoted from P2 to P3 once already. 15+ days no signal.
- **Drift verdict:** DRIFT_dormant. Already demoted once; do not auto-demote again - re-route via outreach-engine on next inbound.

### Ordit - ALIGNED (archived client, LoD active)

- **status_board:** `7f843fde` P2 thread by=external. LoD sent for INV-2026-002 ($3,432), awaiting Craige reply. Routes A-H mapped at `drafts/clients/ordit/ordit-lod-response-prep-2026-05-31.html`.

---

## Three opportunities Tate may be sleeping on

### 1. Goodreach restructure + Resonaverde channel merge (P1, 6d idle on tate, 70d Tom silence)

The board has held this at P1 for 6 days with no movement, and Tom has not been contacted since the partnership-watering draft was filed for Tate approval. The restructure proposal itself is also undrafted. **Highest-priority move:** draft the restructure proposal autonomously in EcodiaOS aesthetic, then Tate gates the Tom/Kurt distribution. This unsticks both rows in one motion.

**Draft message (for Tom Groat, 100w, Tate review required):**

> Tom. Quick honest pulse. We've been moving fast on Co-Exist plus Chambers plus Glovebox while Goodreach has sat. The product itself is in good shape (TestFlight live, 13 edge functions, AU data residency posture solid), but the channel story isn't. NFP via Kurt and SMB via Angelica/Resonaverde have been parallel tracks that probably want collapsing into one go-to-market with clearer roles. I'd like to draft a restructure thesis for you and Kurt to react to before our next sync. Want to commit to a 45-min call this fortnight to walk through it?

### 2. Algorithmic-Manager Kit landing + Stripe + Q.O.O. CTA (P1, dispatch-ready, 6d idle)

`87833a81` is dispatch-ready and explicitly flagged this morning by the opportunity-triage cron. Steps (c)+(d) of the revenue ship are parallel-chat work that should already be a worker. **No outbound needed** - this is internal-build, but it's a sleeping P1 on the revenue track. Surface to Tate so he greenlights a `cowork.dispatch_worker` next turn.

### 3. Inbound research backlog - Barung Landcare + QWaLC + Noosa Biosphere (P2/P3 cluster, all 6d idle)

Three SEQ/QLD conservation peak-body / NFP inbound-research rows sit with by=tate, all idle since 2026-06-02. Barung has direct Tate contacts. QWaLC is the QLD Landcare peak (500 groups, 67k members), and the run-time MRV opening sits there per the recent Co-Exist platform research. Noosa Biosphere has an outreach draft already pre-staged in kv_store. **Highest-priority:** Tate picks ONE for a Mon/Tue outreach window; conductor preps the warm-intro brief for whichever he picks.

**Draft message (for Barung Landcare, Tate review required, channel = Tate's direct contact):**

> [Contact name]. Tate Donohoe here. Quick note on what we've been quietly building at Ecodia. A multi-tenant conservation and engagement platform is running live for Co-Exist Australia (festival sustainability plus youth engagement), and a peak-body app for Chambers is under construction. The opening for Landcare networks specifically is the run-time MRV layer. Engagement straight through to MERI-reporting in one substrate, instead of five tools stitched together. Could I show you a 20-min walkthrough next time you're in Maleny? No sales pitch. Just a "is this useful?" probe. Tate.

---

## Angelica / Resonaverde standing arrangement state

**Active carve-out:** YES. Per `patterns/angelica-resonaverde-standing-arrangement.md` (effective 11 May 2026 16:30 AEST), in-scope autonomous action covers bug fixes, copy edits, small features, technical advisory.

**In-flight items requiring contact:**
- **`a17c981a` Angelica referral agreement v3 redraft** - by=ecodiaos. Conductor-side step is (1) pull Angelica threads, (2) redraft v3 with WM own-boards CoI exclusion clause, (3) present to Tate for e-signature dispatch. This is BUILD work, not contact - it does not require an outbound message yet.
- No active Resonaverde bug-fix / copy-edit thread surfaced (repo 12d idle, no inbound Angelica email).
- CETIN MVP `4b4959ac` parked lowest priority.

**Verdict:** **NO autonomous Angelica contact warranted this turn.** The standing arrangement permits autonomous REPLY to her thread; it does not authorise proactive outbound. The v3 redraft is internal-prep, Tate-gated for dispatch. Draft below is for the moment Tate triggers the v3 send-out, not for autonomous fire:

**Draft v3 referral cover note (Tate review, Tate sends as signatory):**

> Angelica. v3 of the referral agreement attached. The two material updates are (1) two-way structure so referrals flow both directions (you to Ecodia for software work, Ecodia to you for advisory/consulting introductions in scope), and (2) an own-boards CoI exclusion clause covering your incoming Wild Mountains board seat (June 2026). The Wild Mountains exclusion protects your director credibility on any WM procurement involving Ecodia. They're a verbal-locked future client and we'd rather have that handled cleanly upfront than retrospectively. Take your time reviewing; any redlines welcome. Tate.

---

## Summary

- **8 drift verdicts:** Co-Exist ALIGNED, Chambers ALIGNED, Glovebox ALIGNED, Locals ALIGNED, Context ALIGNED, Wildmountains ALIGNED-hold, Goodreach DRIFT_repo+silence, Resonaverde DRIFT_repo+referral, Woodfordia DRIFT_admin, Vikki+SCEC DRIFT_tate_blocked.
- **3 proposed status_board statements** above (1 UPDATE on Goodreach restructure, 1 UPDATE on Angelica referral, 1 INSERT on Woodfordia admin). All bracketed as NOT EXECUTED.
- **3 opportunities surfaced:** Goodreach restructure (P1 sleeping), AMK landing+Stripe ship (P1 dispatch-ready), conservation peak-body cluster (P2/P3 inbound-research).
- **3 draft outbound messages:** Tom Groat re Goodreach restructure, Barung Landcare warm intro, Angelica v3 referral cover note. All await Tate approval. NO autoreplies sent.
- **Angelica standing arrangement:** active but no autonomous contact warranted this turn.

Origin: autonomous client pipeline audit fired 2026-06-08 under full-autonomy mandate (no-client-contact-without-tate-goahead respected throughout).
