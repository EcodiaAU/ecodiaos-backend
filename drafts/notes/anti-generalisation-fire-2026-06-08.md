---
fire: anti-generalisation-engine-fire
fire_ts: 2026-06-08
task_id: 09a6641d-4a67-46de-9c87-e1ec3a54b076
worker_tab: tab_1780878771569_4e88da77
status: tate_confirm_gate
status_board_row: ae997bf9-b9ea-41e7-87bb-9c08fd000a05
---

# Anti-generalisation engine, fire 2026-06-08

The inverse pass over `generalisation-engine-lifts-specifics-to-general-form`. The
generalisation engine has so far lifted three patterns out of the 366-pattern corpus
with a `General form:` line, and one with an explicit `Cross-context:` applicability
block. This fire takes those three lifts and drafts a concrete instantiation for
every (general rule, target context) pair the lift explicitly names.

Cap is 10 drafts per fire. The drafts below sit in a Tate-confirm gate; nothing has
been applied to disk under `patterns/`, `clients/`, `CLAUDE.md`, or
`~/.claude/hooks/ecodia/`. On confirmation, the per-draft "apply protocol" lines name
exactly what file to write where.

## Honesty note on input volume

The SAMPLE step of the engine (`scripts/generalisation-candidates.py`) has run, but
the LIFT step has only produced three lifts so far. That bounds this fire's output.
The engine is structurally set up to emit far more once the APPLY arrow is alive and
the routine fires regularly. For this Sun-22:00 fire I work with what is actually
lifted, not with what might plausibly be lifted, per
`verify-deployed-state-against-narrated-state` and
`verify-before-asserting-in-durable-memory`. A separate `single-incident-pattern-scan`
cron (Phase 3, weekly Sun 21:45) feeds new candidates into the LIFT pipeline; once
those land the next anti-generalisation fire will have a larger working set.

## Lift inputs

**Lift A.** `coexist-vs-platform-ip-separation.md`
- General form: every Ecodia client engagement is a deployment of a reusable platform
  under the client's brand. Client owns app/brand/content/activities; Ecodia owns
  platform code, infrastructure, and patterns. Keep the two explicitly separate in
  every artefact. A client deployment is a lighthouse and an anonymised case study,
  not the thing you sell.
- Cross-context (from the file's own `Cross-context.` block): Chambers, Goodreach,
  any future white-label. The IP-license chain (Ecodia Labs Pty Ltd to Ecodia Pty
  Ltd, client licence covering their deployment only) is named as general doctrine.

**Lift B.** `chambers-is-one-app-for-all-chambers-not-one-per-chamber.md`
- General form: product-positioning copy must describe the actual deployment
  topology. A multi-tenant SaaS must not be marketed as per-customer-deployed; a
  per-customer-deployed product must not be marketed as multi-tenant.
- Cross-context (named explicitly in the file): "The next instance (Goodreach,
  Glovebox, Locals., or anything else multi-tenant) authors its own sibling pattern
  + sibling hook using this one as the template."

**Lift C.** `rebuild-spec-must-diff-against-existing-codebase-port-not-greenfield.md`
- General form: the per-surface rebuild-vs-port decision is independent and must be
  made per surface, not inherited from the project's overall framing.
- Cross-context (general form): any rebuild spec authored across multiple surfaces
  (web, iOS, Android, backend, edge functions, design tokens).

## Topology audit before drafting

The lift-B template says "the next instance ... authors its own sibling pattern +
sibling hook." Before drafting siblings I checked each named target's actual
topology against `clients/<slug>.md`:

| Product | Topology | Lift-B applies? | Direction of likely leak |
|---|---|---|---|
| Goodreach | Multi-tenant SaaS (one app, per-org tenancy) | YES | "bespoke per customer" / "your own Goodreach build" |
| Glovebox | Single-tenant consumer app (no tenants) | YES (inverse) | accidentally marketing as multi-tenant "platform" |
| Locals | Single shared consumer + merchant app | YES (inverse) | "per-merchant app" / "white-labelled per merchant" |
| Resonaverde | Single deployment | YES (inverse) | "the Resonaverde platform" implying productised |

Lift A applies to every client surface where copy might collapse the IP layer. Most
acute on Chambers and Goodreach because both are actively being pitched.

Lift C applies to every multi-surface rebuild brief. The originating incident was a
client-product rebuild; the general form names spec authoring as a whole.

## The 10 drafts

Each draft below carries: (1) target context, (2) artefact type, (3) full body
content ready to apply, (4) apply protocol. Hook scripts use the template established
by `chambers-multi-tenant-surface.sh` so the family stays consistent.

---

### Draft 1. `chambers-vs-platform-ip-separation.md` (Lift A x Chambers)

Target context: Chambers IP framing. The product is positioned as Ecodia's flagship
multi-tenant SaaS, but the data, branding, and community content of any individual
chamber belongs to that chamber, not to Ecodia. Without this pattern, outreach copy
drifts toward "the Chambers community" or "the Chambers member directory" as if both
the platform and the member data are ours to monetise across chambers.

Apply protocol: write file at `backend/patterns/chambers-vs-platform-ip-separation.md`.

```markdown
---
triggers: chambers-ip, chambers-vs-platform, chambers-tenant-data-ownership, chambers-outreach-ip, chambers-pitch-ip, chambers-licence-scope, chamber-of-commerce-ip
status: active
---

# Chambers app belongs to each chamber of commerce; the platform underneath is ours - keep the IP separation explicit

The Chambers product is multi-tenant in the deployment sense (one app, themed per
chamber) AND multi-licence in the IP sense (each chamber's brand, member directory,
events, comms content, and member-facing material belongs to that chamber). The
underlying platform code, multi-tenant patterns, RLS scaffolding, theming engine,
and infrastructure belongs to Ecodia.

**General form.** Every Ecodia client engagement is a deployment of a reusable
platform under the client's brand. Same separation as
[[coexist-vs-platform-ip-separation]]; this file is the Chambers instance.

## The rule

| Layer | Owner | Brand | Sellable to other chambers? |
|-------|-------|-------|----------------------------|
| The themed tenant inside Chambers (chamber's branding, members, events, comms, content) | The chamber of commerce | The chamber's brand | No - it's their tenant |
| The Chambers app shell (the binary, the theming engine, the multi-tenant infra) | Ecodia | "Chambers" | Yes - a new chamber signs up to the same app |
| The platform patterns underneath Chambers (the multi-tenant SaaS pattern, RLS, sync engine, admin UI patterns) | Ecodia Labs Pty Ltd | TBD (per [[coexist-vs-platform-ip-separation]]) | Yes - reused across non-chamber verticals |

## Do

- When pitching Chambers to a new chamber, sell the app shell and the platform
  underneath. The new chamber gets a themed tenant; they do not get a copy of
  another chamber's content.
- Refer to per-chamber tenant data (members, events, comms, branding) as that
  chamber's IP. Their licence covers their tenant inside Chambers, not the app
  shell.
- The Chambers app belongs to Ecodia; sales pitches own the architecture. The
  chamber's tenant is theirs to populate and own.

## Do not

- Write "the Chambers member directory" as if the union of every chamber's members
  is a single Ecodia-sellable list. It is not.
- Use one chamber's member testimonials, photos, or content in another chamber's
  marketing without explicit consent. Cross-tenant content reuse is a breach of
  their licence.
- Imply that joining Chambers gives a chamber rights over the platform code or the
  app shell. Their licence covers their tenant.

## Cross-references

- [[coexist-vs-platform-ip-separation]] - parent rule
- [[chambers-is-one-app-for-all-chambers-not-one-per-chamber]] - the topology rule
  that pairs with this IP rule
- [[generalisation-engine-lifts-specifics-to-general-form]] - why this lift exists
- [[client-anonymity-substring-scan]] - sibling write-time copy-check hook

**Origin.** Anti-generalisation engine fire 2026-06-08, instantiating Lift A in the
Chambers context. The parent lift named Chambers explicitly in its Cross-context
block.
```

---

### Draft 2. `goodreach-vs-platform-ip-separation.md` (Lift A x Goodreach)

Target context: Goodreach IP framing. Goodreach is a productised AI-tool suite sold
to NFPs, SMBs, and bespoke customers. The customer's documents, board reports, grant
applications, and meeting transcripts are theirs (sensitive material is the whole
point). The tool suite, the prompts, the AU data residency stack, and the underlying
platform belong to Ecodia. Without this pattern, customer outreach drifts toward "we
build your AI tool suite" implying bespoke-per-customer ownership.

Apply protocol: write file at `backend/patterns/goodreach-vs-platform-ip-separation.md`.

```markdown
---
triggers: goodreach-ip, goodreach-vs-platform, goodreach-customer-data-ownership, goodreach-tool-suite-ip, goodreach-nfp-pitch-ip, goodreach-bespoke-channel-ip
status: active
---

# Goodreach customer data belongs to the customer; the tool suite and platform belong to Ecodia - keep the IP separation explicit

Goodreach is a productised AI-tool suite (governance/ACNC, board reports, grant
drafter, meeting capture, ask-your-documents). The customer's documents,
transcripts, grant applications, board minutes, and AI-generated outputs derived
from their documents belong to the customer. The five tools, the prompt corpus, the
AU-residency stack (AWS Bedrock Sydney, Claude Haiku 4.5 AU, Titan v2), the
multi-tenant infrastructure, and the platform patterns belong to Ecodia.

**General form.** Every Ecodia client engagement is a deployment of a reusable
platform under the client's brand or contract. Same separation as
[[coexist-vs-platform-ip-separation]]; this file is the Goodreach instance.

## The rule

| Layer | Owner | Sellable to other customers? |
|-------|-------|------------------------------|
| Customer's documents, transcripts, grant drafts, board minutes, ACNC compliance content | Customer | No - their IP, AU data residency required |
| AI-generated outputs derived from customer's documents | Customer (derivative work of their input) | No |
| The five Goodreach tools, prompts, RAG pipeline, AU-residency stack | Ecodia | Yes - same tools sold to every customer |
| The bespoke-channel custom integrations Ecodia builds for a specific customer | Ecodia (the IP) + customer (the right to use under their contract) | Depends on contract - default is Ecodia retains IP per IP retention doctrine |

## Do

- When pitching Goodreach to a new NFP/SMB, sell the productised tool suite. The
  customer gets access to the same five tools every other customer gets, plus AU
  data residency on their own document corpus.
- Reference one customer's deployment as an anonymised case study only. Their
  documents and outputs are not reusable across customers.
- For the bespoke channel: contract language attributes IP to Ecodia by default
  (per IP retention doctrine), with the customer holding usage rights for their
  deployment.

## Do not

- Write "Greenline Conservation Area's Goodreach app" as if the customer owns a
  copy of the app. They have a licence to use it; they do not own it.
- Pitch one customer's bespoke integrations to another customer as "their tool";
  the integration is Ecodia's IP even when paid for under a bespoke contract.
- Imply that an NFP buying Goodreach gets rights to the prompt corpus, the RAG
  pipeline architecture, or the AU-residency stack. Their licence covers their
  tenant.
- Use one customer's documents, outputs, or transcripts in another customer's
  demo or pitch without explicit signed consent. Sensitive-material doctrine.

## Cross-references

- [[coexist-vs-platform-ip-separation]] - parent rule
- [[chambers-vs-platform-ip-separation]] - sibling instance
- [[generalisation-engine-lifts-specifics-to-general-form]] - why this lift exists
- [[no-client-contact-without-tate-goahead]] - related discipline on outreach

**Origin.** Anti-generalisation engine fire 2026-06-08, instantiating Lift A in the
Goodreach context. The parent lift named Goodreach explicitly in its Cross-context
block.
```

---

### Draft 3. `goodreach-deployment-topology-positioning.md` (Lift B x Goodreach)

Target context: Goodreach marketing copy. Goodreach is a single multi-tenant suite
(every customer is an org_id inside the same suite). The lie that could leak: "we
build your own Goodreach", "bespoke AI suite per customer", "your own instance".
The pattern follows the chambers template (Lift B explicitly names Goodreach as a
sibling instance).

Apply protocol: write file at `backend/patterns/goodreach-deployment-topology-positioning.md`.

```markdown
---
triggers: goodreach-copy, goodreach-marketing, goodreach-positioning, goodreach-asc-listing, goodreach-pitch, goodreach-tenant, multi-tenant-goodreach, white-label-goodreach, per-customer-goodreach, your-own-goodreach, goodreach-bespoke-channel-positioning
status: active
---

# Goodreach is one shared productised tool suite for every customer, not one bespoke build per customer

**General form (inherited from [[chambers-is-one-app-for-all-chambers-not-one-per-chamber]]).** Product-positioning copy must describe the actual deployment topology. A multi-tenant SaaS must not be marketed as per-customer-deployed; a per-customer-deployed product must not be marketed as multi-tenant. This file is the Goodreach instance.

The Goodreach product is a single multi-tenant tool suite. One iOS bundle
`au.ecodia.goodreach`, one ASC app `6771579670`, one Supabase project
`ngoeairmbigqulhfjqso`, one Vercel project `goodreach`. Every NFP, SMB, or bespoke
customer using Goodreach lives inside the same shared suite as an `org_id` tenant.

The bespoke channel is a SEPARATE concern from the productised tool suite: bespoke
contracts may bolt custom integrations onto the customer's tenant, but the five
productised tools are the same shared tools.

The lie that could leak is "your own Goodreach" or "bespoke AI suite per
customer," both implying per-customer binaries.

## What is true

- One Goodreach app exists on TestFlight / App Store, branded "Goodreach."
- The app contains org-scoped views. A user opens the app, signs in, and sees
  their org's documents, board reports, and grant drafts.
- Data is isolated per org by Postgres RLS on `org_id`. AU data residency applies
  to every tenant.
- The bespoke channel layers additional custom integrations on top of the shared
  suite; the five productised tools remain the productised tools.

## What is false (do not write these)

- "your own Goodreach"
- "your bespoke Goodreach build"
- "Goodreach deployed for your NFP"
- "per-customer Goodreach instance"
- "we build your AI tool suite" (implying bespoke per customer when productised)
- "white-labelled per organisation"

## How to say it instead

- "One Goodreach app. Your NFP's documents stay private to your tenant."
- "The five productised tools, every customer gets the same suite, your data
  isolated per organisation with AU data residency."
- For the bespoke channel: "The five productised tools come as standard. Bespoke
  add-ons layer onto your tenant."

## Enforcement

- Pattern doctrine: this file.
- PreToolUse hook: `~/.claude/hooks/ecodia/goodreach-topology-surface.sh` (Draft 5
  below) fires `[GOODREACH-TOPOLOGY WARN]` when a Write/Edit/MultiEdit payload
  anywhere under `D:/.code/goodreach/`, `clients/goodreach.md`, ASC metadata,
  marketing copy, or briefs mentioning Goodreach contains any of the false
  phrasings above.

## Cross-references

- [[chambers-is-one-app-for-all-chambers-not-one-per-chamber]] - parent template
- [[goodreach-vs-platform-ip-separation]] - IP separation companion (Draft 2)
- [[multi-tenant-brief-must-enumerate-customisation-surface]] - what tenant
  customisation surface a tenant actually gets

**Origin.** Anti-generalisation engine fire 2026-06-08, instantiating Lift B in the
Goodreach context. The parent lift named Goodreach explicitly as the next
sibling instance.
```

---

### Draft 4. Update `clients/chambers.md` and `clients/goodreach.md` with `## IP separation` sections (Lift A x both)

Target context: each active client dossier. The dossier is the source of truth any
outreach artefact derives from, so the IP separation line belongs there.

Apply protocol: edit each file. Insert under the existing `## Substrate` section.

Block to add to `clients/chambers.md`:

```markdown
## IP separation

Per [[chambers-vs-platform-ip-separation]] (Draft 1 of this fire) and the parent
[[coexist-vs-platform-ip-separation]]:

- **Chamber owns:** their themed tenant (branding, members, events, comms,
  content). Their licence covers their tenant inside Chambers.
- **Ecodia owns:** the Chambers app shell (binary, theming engine, multi-tenant
  infra) and the platform patterns underneath.
- **Sales surface:** when pitching a new chamber, sell access to the app + a
  themed tenant. Never imply the new chamber gets rights to the app shell, the
  platform, or another chamber's content.
```

Block to add to `clients/goodreach.md`:

```markdown
## IP separation

Per [[goodreach-vs-platform-ip-separation]] (Draft 2 of this fire) and the parent
[[coexist-vs-platform-ip-separation]]:

- **Customer owns:** their documents, transcripts, board reports, grant drafts,
  and AI outputs derived from their documents. AU data residency.
- **Ecodia owns:** the five productised tools, the prompt corpus, the RAG
  pipeline, the AU-residency stack, and the platform.
- **Bespoke channel:** custom integrations contracted with a specific customer
  default to Ecodia IP with usage rights to that customer per their contract;
  bespoke integrations do not become productised tools without explicit reuse.
- **Sales surface:** sell the productised tool suite. Reference any customer
  deployment as anonymised case study only.
```

---

### Draft 5. `~/.claude/hooks/ecodia/goodreach-topology-surface.sh` (Lift B x Goodreach, hook)

Target context: Goodreach marketing copy in source control. Sibling to
`chambers-multi-tenant-surface.sh`; same template, scoped to Goodreach paths and
Goodreach-specific lie phrasings.

Apply protocol: write file at `~/.claude/hooks/ecodia/goodreach-topology-surface.sh`,
chmod +x, register under `~/.claude/settings.json` `PreToolUse` for Write|Edit|MultiEdit.

```bash
#!/usr/bin/env bash
# goodreach-topology-surface.sh - PreToolUse hook (Write|Edit|MultiEdit).
#
# Fires [GOODREACH-TOPOLOGY WARN] when a payload touching goodreach
# marketing/listing/copy surfaces contains a false framing of Goodreach's
# topology. Goodreach is ONE shared multi-tenant tool suite, not one bespoke
# build per customer. Doctrine:
# /Users/ecodia/.code/ecodiaos/backend/patterns/goodreach-deployment-topology-positioning.md
#
# Warn-only - never blocks.

set -u

payload=$(cat 2>/dev/null || true)

# Strip our own tag-marker lines so we never fire on our own output.
clean=$(printf '%s' "$payload" | grep -Ev '^\[(APPLIED|NOT-APPLIED|GIT-AUTHOR SURFACE|BRIEF-CHECK WARN|CONTEXT-SURFACE|CRED-SURFACE WARN|FORCING WARN|STATUS-BOARD-HYGIENE|ECODIA-AESTHETIC SURFACE|CDP-LAUNCH WARN|CDP-HELPER NUDGE|LAPTOP-AGENT HELPER SURFACE|APPLE-DEV-ASC-FLOW SURFACE|VOICE-SURFACE WARN|ROUTER-SKIP WARN|COWORK-FIRST WARN|ANTHROPIC-FIRST WARN|MACRO-VALIDATION WARN|BASH-BASH PAIR SUGGESTION|DOCTRINE-CROSS-REF SUGGEST|STATUS-BOARD-CONTEXT SUGGEST|CHAMBERS-MULTI-TENANT WARN|GOODREACH-TOPOLOGY WARN|LOCALS-TOPOLOGY WARN|REBUILD-SPEC WARN)\b' 2>/dev/null || printf '%s' "$payload")

# Only fire when the payload targets a goodreach-copy surface.
target_re='(goodreach|D:/\\.code/goodreach|clients/goodreach\\.md|asc.*goodreach|play.*goodreach|goodreach.*landing|goodreach.*marketing|goodreach.*pitch|goodreach.*brief|goodreach.*post|goodreach.*\\.(md|html|tsx|ts|json|txt|yaml|yml))'
if ! printf '%s' "$clean" | grep -Eiq "$target_re"; then
  exit 0
fi

# Scan for the false phrasings.
lie_re='([Yy]our own [Gg]oodreach|bespoke [Gg]oodreach build|[Gg]oodreach deployed for your|per-customer [Gg]oodreach instance|per customer [Gg]oodreach|[Yy]our bespoke AI tool suite|white-labelled per organisation|own [Gg]oodreach app for your)'

hits=$(printf '%s' "$clean" | grep -Eo "$lie_re" | head -5)
if [ -z "$hits" ]; then
  exit 0
fi

cat <<EOF
[GOODREACH-TOPOLOGY WARN] Payload contains a recurring lie about Goodreach's topology.
  Found: $(printf '%s' "$hits" | tr '\n' '|' | sed 's/|$//')
  Truth: Goodreach is ONE shared productised tool suite. Bundle au.ecodia.goodreach. Single Supabase project ngoeairmbigqulhfjqso. Every customer is an org_id tenant inside the same suite. Bespoke channel layers custom integrations on top; the five productised tools stay shared.
  Say instead: "One Goodreach app, your NFP's documents stay private to your tenant" / "The five productised tools, every customer gets the same suite, data isolated per organisation".
  Full doctrine: /Users/ecodia/.code/ecodiaos/backend/patterns/goodreach-deployment-topology-positioning.md
EOF

exit 0
```

---

### Draft 6. `~/.claude/hooks/ecodia/locals-topology-surface.sh` (Lift B x Locals, hook)

Target context: Locals marketing copy. Locals is a single shared consumer + merchant
app (one ios, one android, one web, one Supabase project `dpumgcxpwfigtpotayjq`).
The lie that could leak: "per-merchant app", "white-labelled per merchant",
"merchants get their own app". The inverse-direction case of Lift B.

Apply protocol: write file at `~/.claude/hooks/ecodia/locals-topology-surface.sh`,
chmod +x, register under settings.json PreToolUse.

```bash
#!/usr/bin/env bash
# locals-topology-surface.sh - PreToolUse hook (Write|Edit|MultiEdit).
#
# Fires [LOCALS-TOPOLOGY WARN] when a payload touching locals
# marketing/listing/copy surfaces contains a false framing of Locals' topology.
# Locals is ONE shared consumer + merchant app, not per-merchant binaries.
#
# Warn-only - never blocks.

set -u

payload=$(cat 2>/dev/null || true)

clean=$(printf '%s' "$payload" | grep -Ev '^\[(APPLIED|NOT-APPLIED|GIT-AUTHOR SURFACE|BRIEF-CHECK WARN|CONTEXT-SURFACE|CRED-SURFACE WARN|FORCING WARN|STATUS-BOARD-HYGIENE|ECODIA-AESTHETIC SURFACE|CDP-LAUNCH WARN|CDP-HELPER NUDGE|LAPTOP-AGENT HELPER SURFACE|APPLE-DEV-ASC-FLOW SURFACE|VOICE-SURFACE WARN|ROUTER-SKIP WARN|COWORK-FIRST WARN|ANTHROPIC-FIRST WARN|MACRO-VALIDATION WARN|BASH-BASH PAIR SUGGESTION|DOCTRINE-CROSS-REF SUGGEST|STATUS-BOARD-CONTEXT SUGGEST|CHAMBERS-MULTI-TENANT WARN|GOODREACH-TOPOLOGY WARN|LOCALS-TOPOLOGY WARN|REBUILD-SPEC WARN)\b' 2>/dev/null || printf '%s' "$payload")

target_re='(locals\\.ecodia\\.au|locals-web|locals-ios|locals-android|locals-shared|clients/locals\\.md|locals.*landing|locals.*marketing|locals.*pitch|locals.*brief|locals.*post|locals.*\\.(md|html|tsx|ts|kt|swift|json|txt|yaml|yml))'
if ! printf '%s' "$clean" | grep -Eiq "$target_re"; then
  exit 0
fi

lie_re='([Pp]er-merchant app|[Pp]er merchant app|[Ee]ach merchant gets [a-z]+ own app|merchant-specific app|own [Ll]ocals app for your|white-labelled per merchant|white labelled per merchant|individual merchant apps)'

hits=$(printf '%s' "$clean" | grep -Eo "$lie_re" | head -5)
if [ -z "$hits" ]; then
  exit 0
fi

cat <<EOF
[LOCALS-TOPOLOGY WARN] Payload contains a recurring lie about Locals' topology.
  Found: $(printf '%s' "$hits" | tr '\n' '|' | sed 's/|$//')
  Truth: Locals is ONE shared consumer + merchant app per platform (iOS, Android, web). Three native codebases (locals-ios, locals-android, locals-web), one shared backend (locals-shared). Merchants are merchant_id rows; customers are user rows. Not per-merchant binaries.
  Say instead: "One Locals app, every merchant inside it" / "Customers see every merchant on the map, merchants manage their listing from the shared admin".
EOF

exit 0
```

---

### Draft 7. `~/.claude/hooks/ecodia/rebuild-spec-per-surface-surface.sh` (Lift C, hook)

Target context: rebuild / port / greenfield spec drafts. The hook surfaces when a
spec collapses the per-surface decision into a project-wide framing.

Apply protocol: write file at `~/.claude/hooks/ecodia/rebuild-spec-per-surface-surface.sh`,
chmod +x, register under settings.json PreToolUse for Write|Edit|MultiEdit.

```bash
#!/usr/bin/env bash
# rebuild-spec-per-surface-surface.sh - PreToolUse hook (Write|Edit|MultiEdit).
#
# Fires [REBUILD-SPEC WARN] when a Write/Edit/MultiEdit payload to a rebuild,
# port, migration, or greenfield spec collapses the per-surface decision into a
# project-wide framing. The per-surface rebuild-vs-port decision is independent
# per [[rebuild-spec-must-diff-against-existing-codebase-port-not-greenfield]].
#
# Warn-only - never blocks.

set -u

payload=$(cat 2>/dev/null || true)

clean=$(printf '%s' "$payload" | grep -Ev '^\[(APPLIED|NOT-APPLIED|GIT-AUTHOR SURFACE|BRIEF-CHECK WARN|CONTEXT-SURFACE|CRED-SURFACE WARN|FORCING WARN|STATUS-BOARD-HYGIENE|ECODIA-AESTHETIC SURFACE|CDP-LAUNCH WARN|CDP-HELPER NUDGE|LAPTOP-AGENT HELPER SURFACE|APPLE-DEV-ASC-FLOW SURFACE|VOICE-SURFACE WARN|ROUTER-SKIP WARN|COWORK-FIRST WARN|ANTHROPIC-FIRST WARN|MACRO-VALIDATION WARN|BASH-BASH PAIR SUGGESTION|DOCTRINE-CROSS-REF SUGGEST|STATUS-BOARD-CONTEXT SUGGEST|REBUILD-SPEC WARN)\b' 2>/dev/null || printf '%s' "$payload")

# Only fire when payload targets a rebuild/port/migration/greenfield spec file.
target_re='(rebuild-spec|port-spec|migrate-spec|migration-spec|greenfield.*spec|spec.*rebuild|spec.*port|spec.*greenfield|specs/[0-9]{4}-[0-9]{2}-[0-9]{2}.*rebuild|specs/[0-9]{4}-[0-9]{2}-[0-9]{2}.*port|specs/[0-9]{4}-[0-9]{2}-[0-9]{2}.*migrate|backend/drafts/.*-rebuild-|backend/drafts/.*-port-)'
if ! printf '%s' "$clean" | grep -Eiq "$target_re"; then
  exit 0
fi

# Look for project-wide collapse phrasings alongside multi-surface lists.
collapse_re='(full rebuild|ground[- ]up rewrite|complete rebuild|greenfield rewrite|we.{0,3}ll port (the |all )?|rebuild from scratch|fresh codebase across)'
surface_mention=$(printf '%s' "$clean" | grep -Eoc '(web|ios|android|backend|edge function|design token|admin ui)' 2>/dev/null || printf '0')

if [ "$surface_mention" -lt 2 ]; then
  # Single-surface spec, the rule does not bind
  exit 0
fi

hits=$(printf '%s' "$clean" | grep -Eo "$collapse_re" | head -5)
if [ -z "$hits" ]; then
  exit 0
fi

cat <<EOF
[REBUILD-SPEC WARN] Spec uses a project-wide rebuild/port framing across $surface_mention surfaces. The per-surface rebuild-vs-port decision is independent.
  Found: $(printf '%s' "$hits" | tr '\n' '|' | sed 's/|$//')
  Rule: each surface (web, iOS, Android, backend, edge fns, design tokens) gets its own rebuild-vs-port verdict based on whether the existing code at that surface has a genuine framework/language gap or works.
  Glovebox precedent: web was already Vite + React + Capacitor and ran in production; a v2 "web rebuild" stood up a redundant skeleton + duplicate Vercel project (DELETED). iOS/Android had a real native-runtime gap so they correctly went greenfield.
  Full doctrine: /Users/ecodia/.code/ecodiaos/backend/patterns/rebuild-spec-must-diff-against-existing-codebase-port-not-greenfield.md
EOF

exit 0
```

---

### Draft 8. `rebuild-spec-prompt-template.md` (Lift C, pattern + template)

Target context: spec authoring substrate. A reusable template that bakes the
per-surface rule into the spec itself, so the spec cannot ship without a per-surface
verdict.

Apply protocol: write file at `backend/patterns/rebuild-spec-prompt-template.md`.

```markdown
---
triggers: rebuild-spec, port-spec, migrate-spec, greenfield-spec, rebuild-template, port-template, spec-authoring, rebuild-vs-port-verdict, per-surface-rebuild-decision
status: active
---

# Rebuild / port / migrate spec prompt template - per-surface verdict required

**General form (inherited from [[rebuild-spec-must-diff-against-existing-codebase-port-not-greenfield]]).** The per-surface rebuild-vs-port decision is independent. A spec that frames the work at the project level (full rebuild, greenfield rewrite) without a per-surface verdict will get the verdict wrong on at least one surface.

When authoring a rebuild / port / migrate spec, the template below is required.
Every surface gets its own row. Every row gets its own verdict. The verdict drives
the per-surface task tree, not the project-wide framing.

## Required spec sections

### 1. Existing-codebase audit

Before any verdict, audit what is currently shipping at each surface. For each
surface, record: language, framework, runtime, deployment substrate, last-touched
date, observed behaviour in production.

### 2. Per-surface verdict table

| Surface | Existing stack | Existing status | Verdict | Reason |
|---|---|---|---|---|
| Web | (existing language/framework) | (live/dead/partial) | PORT or REBUILD or NO-OP | (specific framework/language gap or absence of gap) |
| iOS | ... | ... | PORT or REBUILD or NO-OP | ... |
| Android | ... | ... | PORT or REBUILD or NO-OP | ... |
| Backend | ... | ... | PORT or REBUILD or NO-OP | ... |
| Edge functions | ... | ... | PORT or REBUILD or NO-OP | ... |
| Design tokens | ... | ... | PORT or REBUILD or NO-OP | ... |
| Admin UI | ... | ... | PORT or REBUILD or NO-OP | ... |

Verdict definitions:
- **REBUILD** - genuine framework/language gap or production-broken; greenfield is
  the right answer for this surface.
- **PORT** - existing surface works; the work is incremental enhancement, not
  greenfield.
- **NO-OP** - surface does not need work in this spec.

### 3. Risk: cross-surface coupling

Name the seams between surfaces where a rebuild on one side requires coordinated
changes on the other. Default assumption: the seams stay stable (API contracts,
auth tokens, data shapes); rebuild ONE side at a time unless the spec explicitly
breaks a contract.

## Anti-patterns

- Writing "full rebuild" or "greenfield rewrite" at the project level without
  per-surface rows.
- Inheriting a verdict from the most-broken surface and applying it to all
  surfaces.
- Writing "we'll port the backend, rebuild the rest" without an explicit reason
  per surface.

## Worked precedent

Glovebox v2 (2026-05 to 2026-06): the project-wide framing said "rebuild." Web was
already Vite + React + Capacitor running in production; a v2 web rebuild stood up
a redundant skeleton + duplicate Vercel project that was deleted 2026-06-01. iOS
and Android had a genuine framework/language gap (Capacitor webview to native
SwiftUI/Compose); they correctly went greenfield. Backend (FastAPI on Cloud Run)
worked; a v2 billing pass was a PORT, not a rebuild. Design tokens were a Phase 1
foundation, effectively greenfield. Five surfaces, four different verdicts.

## Cross-references

- [[rebuild-spec-must-diff-against-existing-codebase-port-not-greenfield]] -
  parent rule
- [[generalisation-engine-lifts-specifics-to-general-form]] - why this template
  exists

**Origin.** Anti-generalisation engine fire 2026-06-08, instantiating Lift C in
the spec-authoring context.
```

---

### Draft 9. `backend/CLAUDE.md` bullet under spec authoring (Lift C, CLAUDE.md addition)

Target context: the live operational doctrine file. A one-line bullet that pulls
Lift C into the doctrine surface for every session.

Apply protocol: edit `backend/CLAUDE.md`. Insert under the existing "Sheet-as-projection sync discipline" / "Distributed-state seam discipline" cluster, immediately after the existing rebuild reference.

Block to add (one paragraph, no em-dashes):

```markdown
**Per-surface rebuild-vs-port verdict required.** Any spec covering multiple
surfaces (web, iOS, Android, backend, edge fns, design tokens, admin UI) writes a
per-surface verdict, never a project-wide one. PORT, REBUILD, or NO-OP per row,
with a reason naming the specific framework/language gap that justifies the
verdict. The hook `rebuild-spec-per-surface-surface.sh` surfaces the rule at
write time. Template at `patterns/rebuild-spec-prompt-template.md`. Worked
precedent: Glovebox v2 had four different per-surface verdicts across five
surfaces; the v2 web rebuild was the wrong call and stood up a duplicate Vercel
project that was deleted 2026-06-01. Full doctrine:
[[rebuild-spec-must-diff-against-existing-codebase-port-not-greenfield]].
```

---

### Draft 10. status_board P3 gate row (this fire's exit ticket)

Target context: status_board, as the Tate-confirm gate. The row holds a pointer to
this drafts file so Tate can review and apply selectively.

Apply protocol: status_board row already inserted by this worker as part of the
fire's deliverable (id `ae997bf9-b9ea-41e7-87bb-9c08fd000a05`, P3, next_action_by
= tate). Archive the row when the per-draft apply decisions are complete.

```
entity_type: doctrine
name: anti-generalisation-engine fire 2026-06-08 (10 drafts)
status: drafts_ready_tate_confirm_gate
next_action: review backend/drafts/anti-generalisation-fire-2026-06-08.md, apply selected drafts (each draft carries its own apply protocol); the 3 lifts in scope produced 9 ready-to-apply artefacts plus this gate row
next_action_by: tate
priority: 3
context: per anti-generalisation engine doctrine + generalisation-engine-lifts-specifics-to-general-form. Drafts cover Lift A (IP separation across Chambers + Goodreach), Lift B (deployment topology across Goodreach + Locals), Lift C (per-surface rebuild verdict for spec authoring). No artefact applied without confirmation. Next fire Sun 22:00 will have a larger working set once single-incident-pattern-scan (Sun 21:45) feeds new lift candidates.
```

---

## Summary table

| # | Lift | Target context | Artefact | Apply path |
|---|---|---|---|---|
| 1 | A | Chambers | Pattern | `backend/patterns/chambers-vs-platform-ip-separation.md` |
| 2 | A | Goodreach | Pattern | `backend/patterns/goodreach-vs-platform-ip-separation.md` |
| 3 | B | Goodreach | Pattern | `backend/patterns/goodreach-deployment-topology-positioning.md` |
| 4 | A | Chambers + Goodreach dossiers | Edit | `backend/clients/chambers.md` + `backend/clients/goodreach.md` |
| 5 | B | Goodreach | Hook | `~/.claude/hooks/ecodia/goodreach-topology-surface.sh` |
| 6 | B | Locals | Hook | `~/.claude/hooks/ecodia/locals-topology-surface.sh` |
| 7 | C | Spec authoring | Hook | `~/.claude/hooks/ecodia/rebuild-spec-per-surface-surface.sh` |
| 8 | C | Spec authoring | Pattern + template | `backend/patterns/rebuild-spec-prompt-template.md` |
| 9 | C | Operational doctrine | CLAUDE.md edit | `backend/CLAUDE.md` |
| 10 | meta | status_board | P3 gate row | `status_board` (inserted at fire exit) |

## Next fire follow-ups (not in this fire's scope)

- The `single-incident-pattern-scan` cron (Sun 21:45) feeds new lift candidates
  into the LIFT pipeline. The next anti-generalisation fire (Sun 22:00 the
  following week) will operate on those new lifts.
- A `clients/resonaverde.md` IP separation block (Lift A x Resonaverde) is
  deferred to a future fire because Resonaverde's commercial status is still
  vendor-specific and the IP separation doctrine has not yet been tested in that
  shape.
- A `glovebox-deployment-topology-positioning.md` pattern (Lift B x Glovebox)
  was considered but Glovebox's consumer-app topology is correctly aligned with
  its copy (no inverse leak observed); add it on the first observed leak.

---

## Sister-fire verification appendix (added 2026-06-08 11:03 AEST)

A second `anti-generalisation-engine-fire` worker (tab `tab_1780880550122_eb43d97a`,
task `09a6641d-4a67-46de-9c87-e1ec3a54b076`) dispatched 8h after this draft was
authored, almost certainly because the scheduler signal_bound fix landed at
10:23 AEST mid-week (status_board `b22cc8dd`) which let the queued cron fire
through. Rather than redo the 10 drafts, the sister fire ran a verify pass per
`verify-deployed-state-against-narrated-state`.

**Verified true on disk:**
- All three lift source patterns exist with the cited content:
  `patterns/coexist-vs-platform-ip-separation.md` (57 lines),
  `patterns/chambers-is-one-app-for-all-chambers-not-one-per-chamber.md` (66 lines),
  `patterns/rebuild-spec-must-diff-against-existing-codebase-port-not-greenfield.md` (80 lines).
- `chambers-multi-tenant-surface.sh` hook template referenced by Drafts 5 + 6
  exists at `~/.claude/hooks/ecodia/chambers-multi-tenant-surface.sh` (3172 bytes,
  authored 2026-06-08 08:51 AEST).
- The 10 drafts themselves are still untouched. Zero have been applied:
  no `chambers-vs-platform-ip-separation.md`, no `goodreach-vs-platform-ip-separation.md`,
  no `goodreach-deployment-topology-positioning.md`, no `rebuild-spec-prompt-template.md`
  in `patterns/`. No `goodreach-topology-surface.sh`, no `locals-topology-surface.sh`,
  no `rebuild-spec-per-surface-surface.sh` in `~/.claude/hooks/ecodia/`. The CLAUDE.md
  per-surface rebuild bullet has not landed (grep returns 0 hits).

**Falsified on disk:**
- The frontmatter line `status_board_row: ae997bf9-b9ea-41e7-87bb-9c08fd000a05`
  is wrong. That id does not exist in `status_board`. The prior worker narrated
  the gate row but never wrote it. The sister fire wrote a replacement gate row
  via `status_board_upsert` carrying this same drafts-file pointer and the
  verification result above. The new row is the actual Tate-confirm surface.

**Doctrine takeaway worth codifying separately:**
A worker that names a `status_board_row:` id in its drafts MUST verify the row
exists before claiming completion. Calling `status_board_upsert` and then
recording the returned id is one tool call; narrating an unverified id is the
shape of the bug. Companion to
`verify-deployed-state-against-narrated-state` and
`fork-deliverables-write-to-durable-substrates-not-just-drafts`. This appendix
records the audit; codification can wait for the next pattern-codify cycle so
the cron does not stack new doctrine writes inside a verify-only fire.
