# Intrepid Landcare - Research Dossier
**Authored:** 2026-05-12 | **Fork:** fork_mp244gsl_eba68e | **Status:** research_complete

---

## 1. Org Structure

Intrepid Landcare Australia is a national youth-focused environmental movement, founded in 2015 by Megan Lee and Naomi Edwards (National Young Landcare Ambassadors). The model: inspire late teens and 20-somethings to lead local Landcare action, filling the age gap between junior programs and the broader Landcare community.

**Scale:** 26 local groups across six states and two territories. Queensland (3), NSW (9), Victoria (10), ACT (1), Tasmania (1), South Australia (1), Western Australia (1). NT has no groups yet.

**Key structural reality: essentially volunteer-run.** The national body is governed by a volunteer board (10 people, all doing board roles alongside day jobs or university). There are no visible paid staff on the website. Megan Lee and Naomi Edwards are now listed as co-founders and mentors, not active management - the org has transitioned to a volunteer-governed model. This has major implications for who can make a commercial decision and at what pace.

**Mission:** "Inspire, connect and empower young people to do stuff that matters." On-ground activities include native planting, citizen science, threatened species recovery, regenerative agriculture, and marine cleanups. A retreats and leadership development program sits alongside the field work.

**Geography:** National in name, VIC/NSW-heavy in density. The Victoria footprint (10 groups) is notable - highest concentration of any state.

---

## 2. Decision-Makers

| Name | Role | Notes |
|------|------|-------|
| **Megan Lee** | Co-founder, Mentor | QLD-based. 14+ years Landcare. Publicly recognised nationally. Effectively the brand and the warm intro target - she is the founder people listen to, even as a mentor now. |
| **Naomi Edwards** | Co-founder, Mentor | QLD-based. PhD student at Griffith University. National Young Landcare Leader (2016). Also a key relationship node - she is who Megan would defer to on a tech decision. |
| **Annette Cavanagh** | Chair, VIC | Botanist in north-eastern Victoria. Community-driven conservation focus. Formal governance lead. Any commercial commitment needs her sign-off. |
| **Miranda Braakhuis** | Vice Chair, QLD | Ecologist and conservation detection dog handler. Early-career. Less likely to drive a commercial decision independently. |
| **Ben Brice** | Secretary, SA | Environmental consultant. Masters in Environment and Climate Emergency. Governance/compliance lens. |
| **Rhea Lincoln** | Treasurer, QLD | UQ vet science student. This tells you the budget reality - the Treasurer is a student. |

**Read:** The financial decision-maker is Rhea (a student), and the founding vision still sits with Megan and Naomi even though they've stepped to mentor roles. Any outreach should target Megan Lee as the primary. She is reachable via LinkedIn and intrepidlandcare.org.

**LinkedIn:** Intrepid Landcare org page has 121 followers - small national profile despite 26 active groups. The co-founders are findable individually.

---

## 3. Digital Footprint

- **Website:** intrepidlandcare.org - standard WordPress NFP site. Clean but no notable tech. Group finder, blog, newsletter subscribe, contact form.
- **Instagram:** @intrepidlandcare - active, field-focused imagery
- **Facebook:** landcareintrepid - local groups use this heavily
- **App/platform:** None. Zero. No custom app, no community platform, no volunteer management tool. Groups coordinate via email, Facebook, and word of mouth. This is the entire gap.
- **Tech stack signals:** Nothing visible. There is no CRM, no volunteer database, no event management system beyond a basic contact form. The "how groups work" page is largely text and PDFs. This is a pre-digital org in operational terms.

**Landcare Australia connection:** Landcare Australia's own website names Co-Exist Australia and Intrepid Landcare side-by-side as part of the youth Landcare movement. They are already in the same ecosystem.

---

## 4. Fit Assessment: Co-Exist Platform vs Custom Build

**Take: Co-Exist platform is the obvious fit. A custom build conversation is wrong framing entirely.**

Here is what Intrepid Landcare actually needs: a way for 26 local groups to coordinate events, log volunteer activity, build community identity, and surface impact data nationally. That is precisely what the Co-Exist platform does - multiple collectives, each with their own identity, feeding into a national dashboard.

Mapping their structure to the Co-Exist architecture:
- Intrepid Landcare (national) = the parent org / platform tenant
- Each of the 26 local groups = a collective
- Events, plantings, cleanups = activities
- Group members = participants
- National impact aggregation = already built

This is not a development engagement. This is a **platform licensing conversation**. The build is done. What Intrepid gets is their own branded instance, 26 pre-configured collectives, and a deployment that costs Ecodia maybe 2-3 days of configuration work.

Custom build is wrong for this org at this size. They cannot afford $15k+, their Treasurer is a student, and they don't have operational capacity to manage a custom software build and delivery process. The platform model at ~$200/mo ongoing licence is priced for exactly this context. A grant can cover a modest setup fee.

**Recommendation:** price this as Platform Onboarding ($1,500-2,500 one-time setup/configuration) + $200/mo operating licence. Frame it as grant-fundable - National Landcare Program, state-based Landcare networks, and youth/environment grant pools (VYF, ACF, state environment departments) all fund operational digital tools for conservation orgs.

---

## 5. Our Orbit - Comparable Orgs

From Neo4j and prior research:

- **Co-Exist Australia (Kurt Jones)** - our current lighthouse client. Youth conservation, multi-collective, events-driven. The exact template. Kurt is the most direct warm-intro path to Intrepid. Both orgs are named side-by-side on Landcare Australia's website.
- **Landcare Australia (national body)** - we have a deep research dossier (Apr 15 2026). Their own site cross-references Intrepid. The broader Landcare opportunity is gated by Co-Exist platform readiness, but Intrepid is separate from that gate.
- **Hinterland Bush Links** - in Neo4j, partnered with Co-Exist and affiliated with Kurt Jones. Another conservation org in the same network.
- **Wild Mountains** - Kurt chairs from June 2026. Adjacent conservation org in the network.

The Landcare youth movement is a tight community. Intrepid, Co-Exist, and Landcare Australia youth programs all know each other. Getting Intrepid as a second platform tenant strengthens every subsequent Landcare pitch.

---

## 6. Recommended Outreach Angle

**Lead with:** The Co-Exist connection. "We built the Co-Exist app - you probably already know them, you're mentioned in the same breath on Landcare Australia's website." Do not lead with "we build apps." Lead with "we work inside the Landcare youth ecosystem already."

**The pitch in one sentence:** "Co-Exist runs on a multi-group platform we own - Intrepid Landcare could have its own branded instance, with all 26 groups pre-configured, for less than the cost of a new laptop per year."

**Who to address:** Megan Lee first. She is the co-founder with the most national profile and still acts as a trusted voice even as a mentor. A message that references Co-Exist and Kurt Jones will land with her immediately - she will know who Kurt is. If Megan responds positively, Annette Cavanagh (Chair) needs to be in the room for any commercial conversation.

**What NOT to lead with:**
- Custom development scope or pricing
- "We're a software agency"
- Technical architecture details
- Asking them to fund a build

**Warm path:** Kurt Jones to Megan Lee. Kurt knows the Landcare youth network deeply and is a credible voice to Intrepid. Ask Kurt to make a specific intro: "Tate built the Co-Exist app, he has something worth 15 minutes of your time." Then Tate has the conversation. Do not outreach directly without Kurt's intro - cold outreach from a tech agency to a volunteer-run NFP lands poorly.

**Grant angle:** NLP (National Landcare Program), state Landcare network grants, or youth environment grants can fund a $2,000-3,000 platform setup fee. Offer to help them write the tech component of a grant application. That converts a "we can't afford it" into a 3-6 month path to a signed deal.

---

## 7. Risk Flags

| Flag | Severity | Notes |
|------|----------|-------|
| **Zero budget authority** | High | Volunteer board, student Treasurer. Commercial decisions require co-founder endorsement + board vote. Minimum 4-6 week decision cycle even if enthusiastic. |
| **Grant dependency** | Medium | Any setup fee likely requires a grant. That extends timeline to 3-12 months. BUT - the grant path is real and the licence model is fundable. |
| **No internal champion with procurement power** | High | Megan and Naomi are mentors, not management. Annette is Chair but doing this alongside her day job as a botanist. Nobody's job is "evaluate technology." |
| **Coordination overhead** | Low | 26 groups + national coordination = they will need hand-holding during platform onboarding. Budget for 2-3 days of setup/configuration time. |
| **Small social footprint** | Low | 121 LinkedIn followers at national level is very small. They are not a high-visibility partner. Value is platform validation + pathway to Landcare AU and other Landcare networks, not the Intrepid deal itself. |
| **Co-Exist IP disclosure risk** | Low | The pitch must clearly position this as a separate deployment. Do not describe Co-Exist's architecture in detail. The platform is Ecodia's IP. Co-Exist is a case study referenced anonymously until Kurt explicitly OKs named use. |

**Bottom line:** This is a low-urgency, medium-probability, high-strategic-value opportunity. The deal size is small ($2k setup + $200/mo). The value is: (a) proof that the platform is multi-tenant in production with a second client, (b) warm path into the broader Landcare network that is gated behind it. Pursue via Kurt warm intro when the moment is right - do not cold outreach.

---

*Research by fork_mp244gsl_eba68e. Sources: intrepidlandcare.org, Landcare NSW Gateway, Neo4j pipeline snapshot 5 May 2026, Landcare Australia deep research Apr 15 2026, Co-Exist client knowledge file.*
