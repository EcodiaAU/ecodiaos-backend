// Chambers demo-tenant seed generator.
//
// Emits ONE idempotent SQL transaction to stdout. Deterministic UUIDs (v5
// from a fixed namespace + natural key) make re-runs upsert in place, never
// duplicate. Pure data seeding against the live production schema of the
// Chambers project (arkbjjkfjsjibnhivjis). No schema changes.
//
// Tenant: Coastal Business Network (slug: coastal-business-network).
// Cross-checked against the wavecrm.com.au client list in the feature audit
// (Caloundra, Kawana, Nambour, Cooroy, Brisbane Inner West, Greater
// Caboolture, Greater Shepparton, Logan, Kingscliff) - no collision.

const crypto = require('crypto')

// ---- deterministic uuid v5 -------------------------------------------------
const NS = '6f1c2a90-5b3e-4e21-9c44-7e0a1b2c3d4e' // fixed seed namespace
function uuid5(name) {
  const nsBytes = Buffer.from(NS.replace(/-/g, ''), 'hex')
  const hash = crypto.createHash('sha1')
  hash.update(nsBytes)
  hash.update(Buffer.from(String(name), 'utf8'))
  const h = hash.digest()
  h[6] = (h[6] & 0x0f) | 0x50 // version 5
  h[8] = (h[8] & 0x3f) | 0x80 // variant
  const hex = h.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
const id = (k) => uuid5(`cbn::${k}`)

// ---- sql helpers -----------------------------------------------------------
function q(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return `'${String(v).replace(/'/g, "''")}'`
}
function jsonb(o) {
  if (o === null || o === undefined) return 'NULL'
  return `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`
}

const TENANT_ID = id('tenant')
const SLUG = 'coastal-business-network'

// avatar URL: deterministic ui-avatars (no real people's photos)
function avatar(name, bg) {
  const n = encodeURIComponent(name)
  return `https://ui-avatars.com/api/?name=${n}&size=256&background=${bg}&color=ffffff&bold=true&format=png`
}
// picsum seeded cover (deterministic)
function cover(seed) {
  return `https://picsum.photos/seed/cbn-${seed}/1200/675`
}

const out = []
out.push('-- Chambers demo tenant seed: Coastal Business Network')
out.push('-- Idempotent. Deterministic UUIDs. Re-runs refresh in place.')
out.push('BEGIN;')

// ===========================================================================
// 1. TENANT (warm professional palette: deep teal-blue + sand + amber)
// ===========================================================================
const PRIMARY = '#1f6f6b'   // deep teal-green (warm professional, not coral)
const SECONDARY = '#2c8c86' // lighter teal
const ACCENT = '#e0a458'    // warm amber/sand
out.push(`
INSERT INTO tenants (
  id, slug, name, tagline, mission,
  primary_color, secondary_color, accent_color, font_family,
  hero_headline, hero_subheadline, footer_tagline,
  contact_email, contact_phone, contact_address,
  website_url, social_facebook, social_instagram, social_linkedin,
  currency, timezone, locale, status, chamber_type, country, region,
  subscription_tier, abn, meta_title, meta_description, onboarding_completed_at,
  privacy_settings
) VALUES (
  ${q(TENANT_ID)}, ${q(SLUG)}, ${q('Coastal Business Network')},
  ${q('Business that knows its neighbours.')},
  ${q('Coastal Business Network connects the operators, founders and trades who build the coast - through real events, honest conversation, and a membership that actually backs you in.')},
  ${q(PRIMARY)}, ${q(SECONDARY)}, ${q(ACCENT)}, ${q('Quicksand')},
  ${q('Business that knows its neighbours.')}, NULL, ${q('Coastal Business Network')},
  ${q('hello@coastalbusiness.test')}, ${q('(07) 5400 1188')}, ${q('Marina Quarter, The Esplanade, Coastvale QLD 4573')},
  ${q('https://coastalbusiness.test')}, ${q('https://facebook.com/coastalbusinessnetwork')}, ${q('https://instagram.com/coastalbusinessnetwork')}, ${q('https://linkedin.com/company/coastal-business-network')},
  ${q('AUD')}, ${q('Australia/Brisbane')}, ${q('en-AU')}, ${q('active')}, ${q('chamber_of_commerce')}, ${q('Australia')}, ${q('QLD')},
  ${q('standard')}, ${q('54 122 998 711')}, ${q('Coastal Business Network')}, ${q('The chamber of commerce for the Coastvale region. Members, events, and the people behind local business.')}, ${q('2026-03-02T00:00:00Z')},
  ${jsonb({ show_member_list_publicly: true, show_event_attendees_publicly: true, allow_non_members_to_see_events: true })}
)
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug, name = EXCLUDED.name, tagline = EXCLUDED.tagline, mission = EXCLUDED.mission,
  primary_color = EXCLUDED.primary_color, secondary_color = EXCLUDED.secondary_color, accent_color = EXCLUDED.accent_color, font_family = EXCLUDED.font_family,
  hero_headline = EXCLUDED.hero_headline, hero_subheadline = EXCLUDED.hero_subheadline, footer_tagline = EXCLUDED.footer_tagline,
  contact_email = EXCLUDED.contact_email, contact_phone = EXCLUDED.contact_phone, contact_address = EXCLUDED.contact_address,
  website_url = EXCLUDED.website_url, social_facebook = EXCLUDED.social_facebook, social_instagram = EXCLUDED.social_instagram, social_linkedin = EXCLUDED.social_linkedin,
  currency = EXCLUDED.currency, timezone = EXCLUDED.timezone, locale = EXCLUDED.locale, status = EXCLUDED.status, chamber_type = EXCLUDED.chamber_type,
  country = EXCLUDED.country, region = EXCLUDED.region, subscription_tier = EXCLUDED.subscription_tier, abn = EXCLUDED.abn,
  meta_title = EXCLUDED.meta_title, meta_description = EXCLUDED.meta_description, onboarding_completed_at = EXCLUDED.onboarding_completed_at,
  privacy_settings = EXCLUDED.privacy_settings;`)

// supporting config rows (dues config, invoice seq, notification settings)
out.push(`
INSERT INTO tenant_dues_config (tenant_id, renewal_lead_days, grace_days, overdue_days, lapse_days, gst_rate_bps, invoice_prefix, abn, reminders_enabled)
VALUES (${q(TENANT_ID)}, 30, 7, 21, 75, 1000, ${q('CBN')}, ${q('54 122 998 711')}, TRUE)
ON CONFLICT (tenant_id) DO UPDATE SET invoice_prefix = EXCLUDED.invoice_prefix, abn = EXCLUDED.abn, grace_days = EXCLUDED.grace_days, overdue_days = EXCLUDED.overdue_days, lapse_days = EXCLUDED.lapse_days;`)
out.push(`
INSERT INTO tenant_dues_invoice_seq (tenant_id, last_value) VALUES (${q(TENANT_ID)}, 0)
ON CONFLICT (tenant_id) DO NOTHING;`)
out.push(`
INSERT INTO tenant_notification_settings (tenant_id) VALUES (${q(TENANT_ID)})
ON CONFLICT (tenant_id) DO NOTHING;`)

// ===========================================================================
// 2. VALUES (Home "What we stand for")
// ===========================================================================
const values = [
  ['Belonging', 'Every operator on the coast has a seat at the table, no matter the size of the business.'],
  ['Collaboration', 'We win more together than we ever do alone. Referrals, intros, shared know-how.'],
  ['Growth', 'Practical support that moves the needle: skills, contacts, and the occasional hard truth.'],
  ['Sustainability', 'Business that respects the coast it depends on - for the long run, not the quarter.'],
]
values.forEach((v, i) => {
  out.push(`INSERT INTO tenant_values (id, tenant_id, label, description, sort_order) VALUES (${q(id('value:' + i))}, ${q(TENANT_ID)}, ${q(v[0])}, ${q(v[1])}, ${i + 1}) ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;`)
})

// ===========================================================================
// 3. MEMBERSHIP TIERS (display catalogue)
// ===========================================================================
const tiers = [
  ['Sole Trader', 22000, 'year', ['Member directory listing', 'Discounted event tickets', 'Monthly newsletter', 'Focus group access'], true],
  ['Small Business', 44000, 'year', ['Everything in Sole Trader', 'Bring a +1 to events', 'Committee eligibility', 'Featured in member spotlights'], true],
  ['Corporate Partner', 96000, 'year', ['Everything in Small Business', 'Sponsor logo on events', 'Two named seats', 'Quarterly strategy roundtable'], true],
]
const tierIds = {}
tiers.forEach((t, i) => {
  const tid = id('tier:' + i)
  tierIds[t[0]] = tid
  out.push(`INSERT INTO tenant_membership_tiers (id, tenant_id, name, price_cents, currency, interval, benefits, sort_order, available) VALUES (${q(tid)}, ${q(TENANT_ID)}, ${q(t[0])}, ${t[1]}, ${q('AUD')}, ${q(t[2])}, ${jsonb(t[3])}, ${i + 1}, ${t[4] ? 'TRUE' : 'FALSE'}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price_cents = EXCLUDED.price_cents, interval = EXCLUDED.interval, benefits = EXCLUDED.benefits, sort_order = EXCLUDED.sort_order, available = EXCLUDED.available;`)
})

// ===========================================================================
// 4. MEMBERS (realistic AU names + coastal businesses + industries)
//    These two layers seed in parallel for the same people:
//    - tenant_team  -> drives the public Members directory + profile sheet
//    - tenant_members -> the auth/dues ledger (officers, dues, focus groups)
// ===========================================================================
const firstNames = ['Sarah', 'James', 'Priya', 'Daniel', 'Emma', 'Liam', 'Chloe', 'Marcus', 'Aisha', 'Tom', 'Grace', 'Nathan', 'Olivia', 'Ben', 'Hannah', 'Cooper', 'Mia', 'Jack', 'Ruby', 'Ethan', 'Zoe', 'Lachlan', 'Isla', 'Riley', 'Ava', 'Noah', 'Charlotte', 'Hudson', 'Freya', 'Oscar', 'Maya', 'Leo', 'Stella', 'Felix', 'Willow', 'Archie', 'Indi', 'Hugo']
const lastNames = ['Whitlock', 'Nguyen', 'Patel', 'Brennan', 'Cardoso', 'Fitzgerald', 'Mercer', 'Adeyemi', 'Hollings', 'Pereira', 'Sutton', 'Vella', 'Donnelly', 'Okafor', 'Reidy', 'Tran', 'Castellano', 'Beck', 'Macklin', 'Sandberg', 'Quintero', 'Hartley', 'Singh', 'Mowbray', 'Larsson', 'Esposito', 'Yates', 'Bianchi', 'Cole', 'Rahman', 'Forsythe', 'Delacroix', 'Pham', 'Lindqvist', 'Ashworth', 'Bauer', 'Calderon', 'Voss']
const businesses = [
  ['Saltline Coffee Roasters', 'Hospitality', 'Coastvale'],
  ['Dune & Pine Architecture', 'Professional Services', 'Marina Heads'],
  ['Coastvale Physio Collective', 'Health & Wellbeing', 'Coastvale'],
  ['Bluewater Electrical', 'Trades', 'Pelican Bay'],
  ['Harbourside Legal', 'Professional Services', 'Coastvale'],
  ['The Esplanade Bakehouse', 'Hospitality', 'Marina Heads'],
  ['Tidewatch Surf Co', 'Retail', 'Pelican Bay'],
  ['Greenfields Landscaping', 'Trades', 'Hintervale'],
  ['Northpoint Accounting', 'Finance', 'Coastvale'],
  ['Lumen Digital Studio', 'Creative & Media', 'Marina Heads'],
  ['Coastal Plumbing Works', 'Trades', 'Pelican Bay'],
  ['Mangrove Yoga & Pilates', 'Health & Wellbeing', 'Hintervale'],
  ['Anchor & Ash Interiors', 'Retail', 'Coastvale'],
  ['Seabreeze Childcare', 'Education', 'Marina Heads'],
  ['Pelican Bay Real Estate', 'Property', 'Pelican Bay'],
  ['Foreshore Fitness', 'Health & Wellbeing', 'Coastvale'],
  ['Two Bays Brewing', 'Hospitality', 'Hintervale'],
  ['Driftwood Marketing', 'Creative & Media', 'Marina Heads'],
  ['Coastvale Veterinary', 'Health & Wellbeing', 'Coastvale'],
  ['Highline Roofing', 'Trades', 'Pelican Bay'],
  ['Marina Quarter Dental', 'Health & Wellbeing', 'Marina Heads'],
  ['Sandbar Events Co', 'Events', 'Coastvale'],
  ['Coastal IT Solutions', 'Technology', 'Coastvale'],
  ['Wattle & Wren Florist', 'Retail', 'Hintervale'],
  ['Bayview Financial Planning', 'Finance', 'Marina Heads'],
  ['The Net Shed Seafood', 'Hospitality', 'Pelican Bay'],
  ['Coastvale Print & Sign', 'Trades', 'Coastvale'],
  ['Horizon Solar', 'Trades', 'Hintervale'],
  ['Lighthouse Bookkeeping', 'Finance', 'Coastvale'],
  ['Reefline Charters', 'Tourism', 'Pelican Bay'],
  ['Stonefruit Cafe', 'Hospitality', 'Marina Heads'],
  ['Coastal Conveyancing', 'Professional Services', 'Coastvale'],
  ['Banksia Building Group', 'Construction', 'Hintervale'],
  ['Tern Photography', 'Creative & Media', 'Marina Heads'],
  ['Seagrass Skincare', 'Retail', 'Coastvale'],
  ['Coastvale Mortgage Brokers', 'Finance', 'Coastvale'],
  ['Eastwind Signage', 'Trades', 'Pelican Bay'],
  ['Foreland Consulting', 'Professional Services', 'Marina Heads'],
]
const titles = ['Owner', 'Director', 'Founder', 'Principal', 'Managing Director', 'General Manager', 'Co-Founder', 'Partner', 'Owner-Operator']
const bgColors = ['1f6f6b', '2c8c86', 'e0a458', '3a6b8c', '6b4f8c', '8c5a3a', '4f8c6b', '8c3a5a']
const N = 36

const members = []
for (let i = 0; i < N; i++) {
  const fn = firstNames[i % firstNames.length]
  const ln = lastNames[i % lastNames.length]
  const name = `${fn} ${ln}`
  const biz = businesses[i % businesses.length]
  const [bizName, industry, suburb] = biz
  const title = titles[i % titles.length]
  const slugName = `${fn}.${ln}`.toLowerCase()
  const emailDomain = bizName.toLowerCase().replace(/[^a-z]+/g, '') + '.test'
  members.push({
    idx: i,
    name, fn, ln, bizName, industry, suburb, title,
    email: `${fn.toLowerCase()}@${emailDomain}`,
    bg: bgColors[i % bgColors.length],
    tierName: i % 7 === 0 ? 'Corporate Partner' : i % 3 === 0 ? 'Small Business' : 'Sole Trader',
  })
}

// Officers (first 3 are officers with @coastalbusiness.test emails).
// The President is linked to a real (email-confirmed) Supabase auth user so
// the officer gate + member-facing auth screens can be driven for the launch
// screenshots. The auth user is created out-of-band via the GoTrue admin API;
// its id is pinned here so re-runs preserve the link instead of nulling it.
const PRESIDENT_AUTH_USER_ID = 'e327455f-ea57-4593-8edb-4f14a7b0e6be'
const officerDefs = [
  { idx: 0, role: 'president', title: 'President', email: 'president@coastalbusiness.test', userId: PRESIDENT_AUTH_USER_ID },
  { idx: 1, role: 'officer', title: 'Events Officer', email: 'events@coastalbusiness.test' },
  { idx: 8, role: 'officer', title: 'Treasurer', email: 'treasurer@coastalbusiness.test' },
]
const officerByIdx = {}
officerDefs.forEach((o) => { officerByIdx[o.idx] = o })

const bios = [
  (m) => `Runs ${m.bizName} in ${m.suburb}. Joined to meet other operators who get the realities of trading on the coast.`,
  (m) => `${m.title} at ${m.bizName}. Big on referrals and showing up - you'll see ${m.fn} at most events.`,
  (m) => `Founded ${m.bizName} after years working for someone else. Now mentors a few of the newer members.`,
  (m) => `${m.fn} leads ${m.bizName} (${m.industry.toLowerCase()}). Always up for a coffee and a chat about local trade.`,
  (m) => `Third-generation local. ${m.bizName} has been part of ${m.suburb} for over a decade.`,
]

members.forEach((m) => {
  const teamId = id('team:' + m.idx)
  const memberRowId = id('member:' + m.idx)
  m.teamId = teamId
  m.memberRowId = memberRowId
  const off = officerByIdx[m.idx]
  const role = off ? off.role : 'member'
  const status = m.idx % 11 === 7 ? 'pending' : 'active' // a couple pending applicants
  const email = off ? off.email : m.email
  const title = off ? off.title : `${m.title}, ${m.bizName}`
  const bio = bios[m.idx % bios.length](m)
  const photo = avatar(m.name, m.bg)
  m.status = status
  m.role = role
  m.emailFinal = email
  // tenant_team (public directory)
  out.push(`INSERT INTO tenant_team (id, tenant_id, name, title, bio, photo_url, sort_order) VALUES (${q(teamId)}, ${q(TENANT_ID)}, ${q(m.name)}, ${q(title)}, ${q(bio)}, ${q(photo)}, ${m.idx + 1}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, title = EXCLUDED.title, bio = EXCLUDED.bio, photo_url = EXCLUDED.photo_url, sort_order = EXCLUDED.sort_order;`)
  // tenant_members (ledger). user_id is NULL for the bulk; the President is
  // linked to a real auth user so the auth-gated screens can be driven.
  const joinedDaysAgo = 30 + (m.idx * 11) % 700
  const userIdExpr = off && off.userId ? q(off.userId) : 'NULL'
  out.push(`INSERT INTO tenant_members (id, tenant_id, user_id, role, tier, status, name, email, business, industry, bio, photo_url, joined_at, last_seen_at) VALUES (${q(memberRowId)}, ${q(TENANT_ID)}, ${userIdExpr}, ${q(role)}, ${q(m.tierName)}, ${q(status)}, ${q(m.name)}, ${q(email)}, ${q(m.bizName)}, ${q(m.industry)}, ${q(bio)}, ${q(photo)}, NOW() - INTERVAL '${joinedDaysAgo} days', NOW() - INTERVAL '${(m.idx * 3) % 20} days') ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, role = EXCLUDED.role, tier = EXCLUDED.tier, status = EXCLUDED.status, name = EXCLUDED.name, email = EXCLUDED.email, business = EXCLUDED.business, industry = EXCLUDED.industry, bio = EXCLUDED.bio, photo_url = EXCLUDED.photo_url, last_seen_at = EXCLUDED.last_seen_at;`)
})

// ===========================================================================
// 5. EVENTS (8-12 upcoming next 90d + 4-6 past) with member/nonmember pricing
// ===========================================================================
// price tuple: [memberCents, nonmemberCents | null, members_free, legacyPriceCents, maxAttendees|null]
const upcomingEvents = [
  ['Coastal Business Breakfast - June', 'Monthly members breakfast at the Marina Quarter. Guest speaker plus open networking. Coffee and a proper feed included.', 'Marina Quarter Function Room, Coastvale', 6, 8, [0, 2500, true, 0, 60]],
  ['After-Hours Networking at Two Bays Brewing', 'Casual drinks and connections at Two Bays. First drink on the chamber for members.', 'Two Bays Brewing, Hintervale', 12, 19, [0, 1500, true, 0, 80]],
  ['Grant Writing Workshop for Small Business', 'Practical, hands-on session on writing winning grant applications. Bring a laptop and a project in mind.', 'Coastvale Library Meeting Room', 18, 9, [2500, 4500, false, 0, 30]],
  ['Women in Coastal Business Lunch', 'Long-table lunch celebrating the women running business on the coast. Two-course meal and a panel.', 'The Net Shed Seafood, Pelican Bay', 27, 12, [6500, 8500, false, 0, 40]],
  ['Trades Night: Pricing for Profit', 'Sharp session for the trades - quoting, margins, and getting paid on time. Beers after.', 'Bluewater Electrical Yard, Pelican Bay', 35, 18, [0, 3000, true, 0, 50]],
  ['Coastvale Business Awards - Nominations Open Night', 'Launch of this year\'s awards. Find out the categories, meet last year\'s winners, get your nomination in early.', 'Marina Quarter Function Room, Coastvale', 44, 19, [0, 0, false, 0, 120]],
  ['Sustainability in Practice: Cutting Costs the Green Way', 'Solar, waste, water - the practical wins that also save money. Case studies from Horizon Solar and others.', 'Coastvale Community Hall', 52, 17, [1500, 3500, false, 0, 45]],
  ['Marketing on a Shoestring', 'Driftwood Marketing walks through what actually works for small local business without a big budget.', 'Lumen Digital Studio, Marina Heads', 61, 18, [2000, 4000, false, 0, 25]],
  ['Coastal Business Breakfast - July', 'July members breakfast. Local economic update from Northpoint Accounting plus open networking.', 'Marina Quarter Function Room, Coastvale', 68, 7, [0, 2500, true, 0, 60]],
  ['Festive Members Mixer', 'End-of-year celebration for members and their teams. Canapes, drinks, and a few awards.', 'The Esplanade Bakehouse Courtyard, Marina Heads', 82, 20, [0, 3500, true, 0, 100]],
]
const pastEvents = [
  ['Coastal Business Breakfast - May', 'May members breakfast with a guest talk on hiring in a tight market.', 'Marina Quarter Function Room, Coastvale', -18, 7, [0, 2500, true, 0, 60]],
  ['AGM & Committee Elections', 'Annual general meeting, financials, and election of the new committee.', 'Coastvale Community Hall', -34, 18, [0, 0, false, 0, null]],
  ['Networking by the Marina', 'Sunset drinks and connections down at the marina.', 'Marina Boardwalk, Coastvale', -49, 12, [0, 1500, true, 0, 70]],
  ['Cyber Security for Small Business', 'Coastal IT Solutions on keeping your business safe online.', 'Coastvale Library Meeting Room', -63, 9, [1500, 3000, false, 0, 35]],
  ['Welcome to New Members Drinks', 'A relaxed welcome for everyone who joined in the last quarter.', 'Stonefruit Cafe, Marina Heads', -78, 17, [0, 0, true, 0, 40]],
]

const eventRecords = []
function emitEvent(key, arr, isPast) {
  const [title, desc, loc, dayOffset, startHour, price] = arr
  const [memberC, nonmemberC, membersFree, legacy, maxA] = price
  const eid = id('event:' + key)
  // The app displays starts_at in Australia/Brisbane (UTC+10). starts_at is
  // stored UTC, so to make the event show a sensible LOCAL hour H we store
  // UTC hour (H - 10). date_trunc('day', NOW() AT TIME ZONE 'Australia/Brisbane')
  // gives Brisbane-local midnight; we then build the local time and convert
  // back to UTC for storage. Simpler + robust: anchor on a Brisbane-local
  // timestamp literal and cast with the zone.
  const bne = `((date_trunc('day', (NOW() AT TIME ZONE 'Australia/Brisbane')) + INTERVAL '${dayOffset} days' + INTERVAL '${startHour} hours') AT TIME ZONE 'Australia/Brisbane')`
  const bneEnd = `((date_trunc('day', (NOW() AT TIME ZONE 'Australia/Brisbane')) + INTERVAL '${dayOffset} days' + INTERVAL '${startHour + 2} hours') AT TIME ZONE 'Australia/Brisbane')`
  const start = bne
  const end = bneEnd
  eventRecords.push({ eid, key, isPast, maxA, title })
  out.push(`INSERT INTO tenant_events (id, tenant_id, title, description, starts_at, ends_at, location, cover_url, price_cents, member_price_cents, nonmember_price_cents, members_free, currency, max_attendees) VALUES (${q(eid)}, ${q(TENANT_ID)}, ${q(title)}, ${q(desc)}, ${start}, ${end}, ${q(loc)}, ${q(cover(key))}, ${legacy}, ${memberC}, ${nonmemberC === null ? 'NULL' : nonmemberC}, ${membersFree ? 'TRUE' : 'FALSE'}, ${q('AUD')}, ${maxA === null ? 'NULL' : maxA}) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, location = EXCLUDED.location, cover_url = EXCLUDED.cover_url, price_cents = EXCLUDED.price_cents, member_price_cents = EXCLUDED.member_price_cents, nonmember_price_cents = EXCLUDED.nonmember_price_cents, members_free = EXCLUDED.members_free, max_attendees = EXCLUDED.max_attendees;`)
}
upcomingEvents.forEach((e, i) => emitEvent('up' + i, e, false))
pastEvents.forEach((e, i) => emitEvent('past' + i, e, true))

// RSVPs: clean any existing demo RSVPs for these events first (idempotent),
// then seed a realistic spread so rsvp_count + going strip render.
const eventIds = eventRecords.map((e) => e.eid)
out.push(`DELETE FROM tenant_event_rsvps WHERE tenant_id = ${q(TENANT_ID)};`)
out.push(`UPDATE tenant_events SET rsvp_count = 0 WHERE tenant_id = ${q(TENANT_ID)};`)
// active members only
const activeMembers = members.filter((m) => m.status === 'active')
eventRecords.forEach((ev, ei) => {
  // deterministic attendee subset: vary 8..28 depending on event
  const want = 8 + ((ei * 7) % 21)
  let count = 0
  for (let mi = 0; mi < activeMembers.length && count < want; mi++) {
    const m = activeMembers[(mi * 5 + ei * 3) % activeMembers.length]
    const rid = id(`rsvp:${ev.eid}:${m.memberRowId}`)
    // capacity guard: respect maxA
    if (ev.maxA !== null && count >= ev.maxA) break
    const paid = !ev.isPast && (mi % 4 === 0) // some paid tickets on upcoming
    const ps = paid ? 'paid' : 'free'
    const amt = paid ? 2500 : 0
    out.push(`INSERT INTO tenant_event_rsvps (id, event_id, member_id, tenant_id, payment_status, payment_amount_cents, currency${paid ? ', paid_at' : ''}) VALUES (${q(rid)}, ${q(ev.eid)}, ${q(m.memberRowId)}, ${q(TENANT_ID)}, ${q(ps)}, ${amt}, ${q('AUD')}${paid ? ", NOW() - INTERVAL '" + ((mi % 9) + 1) + " days'" : ''}) ON CONFLICT (event_id, member_id) DO NOTHING;`)
    count++
  }
})

// ===========================================================================
// 6. VOUCHERS (active codes; one tied to a specific event, others tenant-wide)
// ===========================================================================
const womenLunchEid = id('event:up3')
const grantWorkshopEid = id('event:up2')
const vouchers = [
  ['WELCOME25', 'percent', 25, null, 100, null, '+90 days', true],
  ['EARLYBIRD', 'percent', 15, grantWorkshopEid, 30, null, '+30 days', true],
  ['COMMUNITY10', 'fixed', 1000, null, 200, null, '+120 days', true],
  ['LUNCH5', 'fixed', 500, womenLunchEid, 40, null, '+25 days', true],
]
vouchers.forEach((v, i) => {
  const [code, dtype, dval, eid, maxUses, validFrom, validUntil, active] = v
  const vid = id('voucher:' + i)
  const vu = validUntil ? `NOW() + INTERVAL '${validUntil.replace('+', '').replace(' days', '')} days'` : 'NULL'
  out.push(`INSERT INTO tenant_event_vouchers (id, tenant_id, event_id, code, discount_type, discount_value, max_uses, used_count, valid_from, valid_until, active) VALUES (${q(vid)}, ${q(TENANT_ID)}, ${eid ? q(eid) : 'NULL'}, ${q(code)}, ${q(dtype)}, ${dval}, ${maxUses}, ${(i * 3) % 12}, NULL, ${vu}, ${active ? 'TRUE' : 'FALSE'}) ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, discount_type = EXCLUDED.discount_type, discount_value = EXCLUDED.discount_value, max_uses = EXCLUDED.max_uses, used_count = EXCLUDED.used_count, valid_until = EXCLUDED.valid_until, active = EXCLUDED.active, event_id = EXCLUDED.event_id;`)
})

// ===========================================================================
// 7. COMMITTEES (3-4 with chairs + members)
// ===========================================================================
const committees = [
  ['Events Committee', 'Plans and runs the monthly breakfasts, mixers and the annual awards night.', 1],
  ['Membership & Growth', 'Welcomes new members, runs the referral program, keeps the community connected.', 8],
  ['Advocacy & Council Liaison', 'Represents members on local planning, parking and small-business policy.', 0],
  ['Sustainability Working Group', 'Drives the chamber\'s coast-care commitments and member sustainability wins.', 5],
]
const committeeIds = []
committees.forEach((c, i) => {
  const [name, desc, chairIdx] = c
  const cid = id('committee:' + i)
  committeeIds.push({ cid, chairIdx, i })
  const chair = members[chairIdx]
  out.push(`INSERT INTO tenant_committees (id, tenant_id, name, description, chair_member_id, sort_order) VALUES (${q(cid)}, ${q(TENANT_ID)}, ${q(name)}, ${q(desc)}, ${q(chair.memberRowId)}, ${i + 1}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, chair_member_id = EXCLUDED.chair_member_id, sort_order = EXCLUDED.sort_order;`)
})
// committee members (chair + a handful each)
committeeIds.forEach(({ cid, chairIdx, i }) => {
  const memberSet = new Set([chairIdx])
  for (let k = 0; k < 5; k++) memberSet.add((chairIdx + 1 + k * 4 + i) % N)
  let mi = 0
  for (const idx of memberSet) {
    const m = members[idx]
    if (m.status !== 'active') continue
    const role = idx === chairIdx ? 'chair' : 'member'
    const cmid = id(`cmember:${cid}:${m.memberRowId}`)
    out.push(`INSERT INTO tenant_committee_members (id, committee_id, member_id, role) VALUES (${q(cmid)}, ${q(cid)}, ${q(m.memberRowId)}, ${q(role)}) ON CONFLICT (committee_id, member_id) DO UPDATE SET role = EXCLUDED.role;`)
    mi++
  }
})

// ===========================================================================
// 8. FOCUS GROUPS - seed categories explicitly for THIS tenant (the
//    migration-time trigger only seeds tenants present at migration time, so
//    a freshly-inserted tenant has none), then 2 named groups with threads.
// ===========================================================================
const fgCategories = [
  ['sustainability', 'Sustainability', 'Climate, energy, waste, regenerative business practices.', 1],
  ['politics', 'Politics & Advocacy', 'Local council, policy, advocacy, civic engagement.', 2],
  ['service-businesses', 'Service Businesses', 'Trades, professional services, hospitality, retail.', 3],
  ['finance', 'Finance & Funding', 'Capital, grants, accounting, financial literacy for SMBs.', 4],
]
const fgCatIds = {}
fgCategories.forEach((c, i) => {
  const [slug, label, desc, sort] = c
  const cid = id('fgcat:' + slug)
  fgCatIds[slug] = cid
  out.push(`INSERT INTO tenant_focus_group_categories (id, tenant_id, slug, label, description, sort_order) VALUES (${q(cid)}, ${q(TENANT_ID)}, ${q(slug)}, ${q(label)}, ${q(desc)}, ${sort}) ON CONFLICT (tenant_id, slug) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;`)
})

const focusGroups = [
  { key: 'fg0', catSlug: 'sustainability', slug: 'coast-care', name: 'Coast Care Crew', desc: 'Members swapping practical sustainability wins - solar, waste, water, packaging.' },
  { key: 'fg1', catSlug: 'service-businesses', slug: 'trades-talk', name: 'Trades Talk', desc: 'For the trades: quoting, subbies, suppliers, and getting paid on time.' },
]
focusGroups.forEach((g, gi) => {
  const gid = id('fg:' + g.key)
  g.gid = gid
  const creator = members[gi === 0 ? 5 : 3]
  out.push(`INSERT INTO tenant_focus_groups (id, tenant_id, category_id, slug, name, description, created_by) VALUES (${q(gid)}, ${q(TENANT_ID)}, ${q(fgCatIds[g.catSlug])}, ${q(g.slug)}, ${q(g.name)}, ${q(g.desc)}, ${q(creator.memberRowId)}) ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, category_id = EXCLUDED.category_id;`)
})

// messages: realistic recent chatter. Clear demo messages for these groups
// first (idempotent), reset counters, then re-seed.
const fgIds = focusGroups.map((g) => g.gid)
out.push(`DELETE FROM tenant_focus_group_messages WHERE tenant_id = ${q(TENANT_ID)};`)

const fg0Msgs = [
  [5, 'Anyone switched to compostable packaging that actually holds up? Ours keeps splitting in the cool room.'],
  [12, 'We use the BioPak range at Two Bays - solid for cold, less great for hot. Happy to share supplier details.'],
  [5, 'Legend, thanks. Will flick you a message.'],
  [27, 'Horizon Solar quoted us last week. 6.6kW system, payback under 4 years at our usage. Glad to compare notes.'],
  [16, 'We went solar in March and the difference on the last bill was real. Wish we\'d done it sooner.'],
  [3, 'Council has a small-business sustainability rebate open till end of month btw - worth a look before you commit.'],
  [27, 'Didn\'t know about that, cheers. Link?'],
  [3, 'I\'ll drop it in the resources section so it\'s easy to find.'],
  [21, 'Quick win for anyone with a cool room: door strip curtains. $200 and our compressor runs way less.'],
  [12, 'Adding that to the list. This group is paying for the membership already.'],
  [5, 'That\'s the idea. Bringing the topic to the next breakfast too if there\'s interest.'],
  [34, 'Count me in. Sustainability + cost saving is an easy sell to my partner who does the books.'],
]
const fg1Msgs = [
  [3, 'What\'s everyone using for quoting these days? Still on spreadsheets and it\'s doing my head in.'],
  [19, 'Switched to a proper job-management app last year, never looking back. The quote-to-invoice flow alone saves hours.'],
  [3, 'Which one? Happy to pay if it actually works.'],
  [19, 'Will DM you - don\'t want to look like I\'m spruiking in the group.'],
  [10, 'Reminder the trades night is on pricing for profit. Bringing real numbers, not theory.'],
  [3, 'Good. Half of us underquote and wonder why cash is tight.'],
  [33, 'Anyone got a sparky free for a small commercial job in Pelican Bay next week? Client\'s chasing.'],
  [3, 'Bluewater might - they\'re in this group. @ them.'],
  [19, 'On it. We\'ve got a gap Thursday, send through the scope.'],
  [33, 'You\'re a champion. This is exactly why I joined.'],
  [10, 'This is the stuff that doesn\'t happen on a generic CRM. Keep it coming.'],
]
function emitMsgs(g, msgs) {
  const total = msgs.length
  msgs.forEach((m, mi) => {
    const [idx, body] = m
    const author = members[idx]
    const mid = id(`fgmsg:${g.gid}:${mi}`)
    // recent: most recent message minutes ago, older ones spread over ~6 days
    const minutesAgo = (total - mi) * 90 + (mi % 3) * 17
    out.push(`INSERT INTO tenant_focus_group_messages (id, group_id, tenant_id, member_id, body, created_at) VALUES (${q(mid)}, ${q(g.gid)}, ${q(TENANT_ID)}, ${q(author.memberRowId)}, ${q(body)}, NOW() - INTERVAL '${minutesAgo} minutes') ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, created_at = EXCLUDED.created_at;`)
  })
}
emitMsgs(focusGroups[0], fg0Msgs)
emitMsgs(focusGroups[1], fg1Msgs)
// resync counters (trigger handles increments, but after our DELETE the
// counts could be stale; recompute explicitly).
fgIds.forEach((gid) => {
  out.push(`UPDATE tenant_focus_groups g SET message_count = (SELECT count(*) FROM tenant_focus_group_messages m WHERE m.group_id = g.id AND m.deleted_at IS NULL), last_message_at = (SELECT max(created_at) FROM tenant_focus_group_messages m WHERE m.group_id = g.id) WHERE g.id = ${q(gid)};`)
})

// ===========================================================================
// 9. NEWSLETTER CAMPAIGNS (3-4, one sent with open/click stats)
// ===========================================================================
const president = members[0]
function nlBody(title, paras) {
  const html = `<h1>${title}</h1>` + paras.map((p) => `<p>${p}</p>`).join('')
  const text = paras.join('\n\n')
  return { html, text }
}
const campaigns = [
  {
    key: 'nl0', status: 'sent', daysAgo: 18,
    title: 'May at the Coastal Business Network', subject: 'Your May wrap: breakfast recap, AGM, and what\'s coming',
    paras: [
      'A big month behind us. The May breakfast packed out the Marina Quarter room - thanks to everyone who came and to Northpoint Accounting for the local economic update.',
      'The AGM is locked in and committee nominations are open. If you\'ve been thinking about getting more involved, this is your moment.',
      'Coming up: after-hours drinks at Two Bays, the grant writing workshop, and the Women in Coastal Business lunch. Tickets are moving - grab yours from the app.',
      'See you out there. - the CBN team',
    ],
  },
  {
    key: 'nl1', status: 'sent', daysAgo: 46,
    title: 'Welcome to our newest members', subject: 'New faces, the awards launch, and a sustainability rebate worth knowing about',
    paras: [
      'Eight new businesses joined us this month. Say hello when you see them - that\'s what this is all about.',
      'The Coastvale Business Awards launch night is coming. Nominations open early, and last year\'s winners will be there to talk about what it meant for them.',
      'Quick heads-up: council has a small-business sustainability rebate open. Details are in the app under Resources.',
    ],
  },
  {
    key: 'nl2', status: 'draft', daysAgo: 1,
    title: 'June breakfast + festive mixer save-the-date', subject: 'June breakfast speaker announced (draft)',
    paras: [
      'Draft for review. June breakfast speaker is confirmed - hold for final details.',
      'Also flagging the festive members mixer save-the-date so teams can plan ahead.',
    ],
  },
  {
    key: 'nl3', status: 'scheduled', daysAgo: 0, scheduledInDays: 3,
    title: 'Trades night this week', subject: 'Trades night: pricing for profit - this Thursday',
    paras: [
      'A reminder that the trades night is on this week. Real numbers, straight talk, beers after.',
      'Free for members, $30 for guests. Bring someone who needs to hear it.',
    ],
  },
]
campaigns.forEach((c) => {
  const cid = id('nl:' + c.key)
  c.cid = cid
  const { html, text } = nlBody(c.title, c.paras)
  const sentAt = c.status === 'sent' ? `NOW() - INTERVAL '${c.daysAgo} days'` : 'NULL'
  const scheduledAt = c.status === 'scheduled' ? `NOW() + INTERVAL '${c.scheduledInDays} days'` : 'NULL'
  const aiCtx = { source: 'ai_compose', signals: ['upcoming_events', 'new_members', 'resources'], model: 'claude' }
  const aiPrompt = 'Draft a warm, plain-spoken monthly chamber newsletter for the Coastal Business Network. Recap recent events, surface upcoming ones, no hype.'
  out.push(`INSERT INTO tenant_newsletter_campaigns (id, tenant_id, title, subject, body_html, body_text, status, scheduled_at, sent_at, recipient_segment, ai_compose_context, ai_compose_prompt, created_by, created_at) VALUES (${q(cid)}, ${q(TENANT_ID)}, ${q(c.title)}, ${q(c.subject)}, ${q(html)}, ${q(text)}, ${q(c.status)}, ${scheduledAt}, ${sentAt}, ${jsonb({ all_active: true })}, ${jsonb(aiCtx)}, ${q(aiPrompt)}, ${q(president.memberRowId)}, NOW() - INTERVAL '${c.daysAgo} days') ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, subject = EXCLUDED.subject, body_html = EXCLUDED.body_html, body_text = EXCLUDED.body_text, status = EXCLUDED.status, scheduled_at = EXCLUDED.scheduled_at, sent_at = EXCLUDED.sent_at, ai_compose_context = EXCLUDED.ai_compose_context, ai_compose_prompt = EXCLUDED.ai_compose_prompt;`)
})
// recipients + open/click stats for the first sent campaign
out.push(`DELETE FROM tenant_newsletter_recipients WHERE campaign_id IN (${campaigns.map((c) => q(c.cid)).join(', ')});`)
const sentCampaign = campaigns[0]
activeMembers.forEach((m, mi) => {
  const rid = id(`nlr:${sentCampaign.cid}:${m.memberRowId}`)
  // ~62% opened, ~28% clicked among opened
  const opened = mi % 5 !== 0
  const clicked = opened && mi % 4 === 0
  const status = clicked ? 'clicked' : opened ? 'opened' : 'delivered'
  const openedAt = opened ? `NOW() - INTERVAL '${sentCampaign.daysAgo} days' + INTERVAL '${(mi % 20) + 1} hours'` : 'NULL'
  const clickedAt = clicked ? `NOW() - INTERVAL '${sentCampaign.daysAgo} days' + INTERVAL '${(mi % 20) + 2} hours'` : 'NULL'
  out.push(`INSERT INTO tenant_newsletter_recipients (id, campaign_id, member_id, email, status, opened_at, clicked_at) VALUES (${q(rid)}, ${q(sentCampaign.cid)}, ${q(m.memberRowId)}, ${q(m.emailFinal)}, ${q(status)}, ${openedAt}, ${clickedAt}) ON CONFLICT (campaign_id, member_id) DO UPDATE SET status = EXCLUDED.status, opened_at = EXCLUDED.opened_at, clicked_at = EXCLUDED.clicked_at;`)
})

// ===========================================================================
// 10. DUES (70% of members, mixed statuses, GST-correct)
// ===========================================================================
// GST-inclusive amount per tier; gst = round(amount * 10 / 110)
const tierAmount = { 'Sole Trader': 22000, 'Small Business': 44000, 'Corporate Partner': 96000 }
function gstInclusive(amount) { return Math.round((amount * 1000) / (10000 + 1000)) }
out.push(`DELETE FROM tenant_member_dues WHERE tenant_id = ${q(TENANT_ID)};`)
out.push(`UPDATE tenant_dues_invoice_seq SET last_value = 0 WHERE tenant_id = ${q(TENANT_ID)};`)
let invoiceN = 0
activeMembers.forEach((m, mi) => {
  // ~70% of members have a dues row
  if (mi % 10 >= 7) return
  const amount = tierAmount[m.tierName]
  const gst = gstInclusive(amount)
  // status distribution: current (paid, recent), pending (invoice issued),
  // grace, overdue
  const bucket = mi % 9
  let status, paidExpr, periodStartDaysAgo, periodLenDays, method, note
  if (bucket <= 4) {
    // current - paid
    status = 'current'; periodStartDaysAgo = 40 + (mi % 60); periodLenDays = 365
    method = mi % 3 === 0 ? 'stripe_card' : (mi % 3 === 1 ? 'manual_bank' : 'manual_offline')
    paidExpr = `NOW() - INTERVAL '${(mi % 30) + 1} days'`
  } else if (bucket === 5 || bucket === 6) {
    // pending - invoice issued, unpaid, still inside period
    status = 'pending'; periodStartDaysAgo = 10 + (mi % 20); periodLenDays = 365
    method = null; paidExpr = 'NULL'
  } else if (bucket === 7) {
    // grace - just past period_end within grace window
    status = 'grace'; periodStartDaysAgo = 366; periodLenDays = 365
    method = null; paidExpr = 'NULL'
  } else {
    // overdue
    status = 'overdue'; periodStartDaysAgo = 400; periodLenDays = 365
    method = null; paidExpr = 'NULL'
  }
  invoiceN++
  const invoiceNum = 'CBN-' + String(invoiceN).padStart(4, '0')
  const did = id('dues:' + m.memberRowId)
  const issuedExpr = `NOW() - INTERVAL '${periodStartDaysAgo - 3} days'`
  out.push(`INSERT INTO tenant_member_dues (id, tenant_id, member_id, tier_id, tier_name, amount_cents, gst_cents, currency, period_start, period_end, status, invoice_number, invoice_issued_at, paid_at, payment_method, payment_note, xero_sync_status) VALUES (${q(did)}, ${q(TENANT_ID)}, ${q(m.memberRowId)}, ${q(tierIds[m.tierName])}, ${q(m.tierName)}, ${amount}, ${gst}, ${q('AUD')}, (date_trunc('day', NOW()) - INTERVAL '${periodStartDaysAgo} days')::date, (date_trunc('day', NOW()) - INTERVAL '${periodStartDaysAgo} days' + INTERVAL '${periodLenDays} days')::date, ${q(status)}::member_dues_status, ${q(invoiceNum)}, ${issuedExpr}, ${paidExpr}, ${method ? q(method) + '::member_dues_payment_method' : 'NULL'}, ${note ? q(note) : 'NULL'}, ${q(status === 'current' && method === 'stripe_card' ? 'paid' : 'not_synced')}::xero_sync_status) ON CONFLICT (member_id, period_start) DO UPDATE SET status = EXCLUDED.status, amount_cents = EXCLUDED.amount_cents, gst_cents = EXCLUDED.gst_cents, invoice_number = EXCLUDED.invoice_number, paid_at = EXCLUDED.paid_at, payment_method = EXCLUDED.payment_method;`)
})
// bump invoice seq to match
out.push(`UPDATE tenant_dues_invoice_seq SET last_value = ${invoiceN} WHERE tenant_id = ${q(TENANT_ID)} AND last_value < ${invoiceN};`)

// ===========================================================================
// 11. RESOURCES (public)
// ===========================================================================
const resources = [
  ['Member Handbook', 'Everything you need to know about being a member - benefits, events, and how to get the most out of it.', 'https://coastalbusiness.test/handbook', 'book-open', 1],
  ['Council Small-Business Sustainability Rebate', 'Details and eligibility for the current local-government rebate. Closes end of month.', 'https://coastalbusiness.test/resources/rebate', 'leaf', 2],
  ['Sponsor & Partnership Pack', 'How local businesses can sponsor events and partner with the chamber.', 'https://coastalbusiness.test/sponsor', 'handshake', 3],
  ['Committee Charter', 'Roles, responsibilities and meeting cadence for each chamber committee.', 'https://coastalbusiness.test/committees', 'file-text', 4],
]
resources.forEach((r, i) => {
  const [title, desc, url, icon, sort] = r
  const rid = id('resource:' + i)
  out.push(`INSERT INTO tenant_resources (id, tenant_id, title, description, url, icon, sort_order) VALUES (${q(rid)}, ${q(TENANT_ID)}, ${q(title)}, ${q(desc)}, ${q(url)}, ${q(icon)}, ${sort}) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, url = EXCLUDED.url, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;`)
})

out.push('COMMIT;')
out.push(`-- TENANT_ID=${TENANT_ID}`)
process.stdout.write(out.join('\n') + '\n')
