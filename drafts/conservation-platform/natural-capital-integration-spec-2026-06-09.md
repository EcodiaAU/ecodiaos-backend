# Natural capital integration layer
## Platform specification v0.1
### 9 June 2026

Working name placeholder. Candidates in flight: Spillover (current lean), Catchment, Throughline. Substrate-wide rename pending Tate decision. Throughout this document the system is referred to as "the platform" until the name lands.

This document specifies every aspect of the platform from data model through to deployment. It is the architectural spine. Sections marked OPEN QUESTION require explicit Tate input before implementation begins. Sections marked DECISION record commitments already made (with citations to the substrate where the decision was recorded).

---

## 1. What this is

A query engine that knows every relevant cross-organisation environmental, social and economic data point in a geographical region, with statistical machinery to figure out which actions are causally linked to which outcomes across organisational and disciplinary boundaries.

The single sentence: answer questions today that take a PhD plus five years plus access to five organisations' data, in thirty seconds against a single query surface.

Lead worked example. Northern quoll release in NSW Pilliga at time T. Three years later the platform answers:
- Did small mammal density shift in surrounding 50km radius
- Did insect community composition change in response
- Did pollinator visit rates to local crops change
- Did wheat and canola yield in adjacent properties move, and by how much
- What is the confidence interval against a null model

The infrastructure shape that makes this work is MRV (Measurement, Reporting, Verification). Orgs report measurements upward through a flexible-payload ingestion endpoint, peak body verifies and synthesises across all contributors. Carbon-MRV is the narrower-scope sibling already in the Ecodia doctrine corpus. This is the broader-scope evolution.

## 2. Who this is for

Buyer hierarchy:
- **Primary**: NRM Regions Australia (peak body) and the 54 regional NRM bodies it represents
- **Secondary**: DCCEEW federal department via the Panel of Regional Delivery Partners procurement vehicle (open through 30 June 2028)
- **Tertiary**: CSIRO (academic-methodology partner), philanthropic foundations with biodiversity briefs (Macdoch, Paul Ramsay, Minderoo, Wyss), agribusinesses with sustainability commitments, biodiversity-credit issuers

What each gets:
- NRM bodies: cross-domain reporting they cannot produce alone. The ability to demonstrate dollar value of conservation work to government funders. Their own regional dashboard, free at the contributor tier.
- DCCEEW: integration layer for the Nature Repair Market, evidence base for the federal national natural-capital accounting program, decision evidence for grant programs.
- CSIRO: research substrate. Real-world data they could not assemble alone, with the platform as their methodology validation layer.
- Agribusinesses: their pollination, water, soil and pest-control services from natural systems quantified in dollars.
- Biodiversity credit issuers: verification substrate for credits at sub-issuance cost.

OPEN QUESTION 2.1: Does v0 sell to one buyer or build for one anchor NRM as a public reference deployment with no contractual relationship yet? The corrected build sequence says build leads, conversation runs alongside. The anchor NRM identification is the first conversation deliverable.

## 3. System architecture overview

Six layers, named here in data-flow order:

```
[Ingestion]  push: POST /v1/observations  ----+
             pull: HCAS / EKS / DCCEEW / PDF  |
                                              v
[Normalisation]  schema registry + ontology aligners + spatial-temporal indexers
                                              v
[Storage]    Postgres + JSONB + PostGIS  /  object store for rasters
                                              v
[Synthesis]  spatial-temporal join engine + causal inference workers
                                              v
[Query]      REST + GraphQL + pre-built catalogue
                                              v
[View]       web app + embeddable widgets + downloadable raw data
```

Each layer is detailed in its own section below.

DECISION 3.1: Ingestion is push-first with pull-fallback. (Tate verbatim 2026-06-09 + EcodiaOS pull-fallback addition. Recorded as Neo4j Episode "SEEDME-placeholder ingestion architecture decided 2026-06-09".)

DECISION 3.2: Storage substrate is Postgres + JSONB + PostGIS extension, on Supabase. (Matches existing EcodiaOS substrate.)

OPEN QUESTION 3.3: Object-store choice for raster/large-blob data. Supabase Storage (familiar, integrated), or cloud-native object store (S3, R2)? Decision drives cost model.

## 4. Data model

### 4.1 Envelope schema

Every observation lands with a fixed envelope. The envelope is enforced by the ingestion endpoint regardless of org payload shape.

```json
{
  "org_id": "<derived from bearer auth, not user-supplied>",
  "observation_type": "<from controlled vocabulary, see 5.2>",
  "location": {
    "lat": -30.1234,
    "lon": 148.5678,
    "polygon_ref": "<UUID or geohash referring to polygons table>",
    "nrm_region": "NSW_NORTHERN_TABLELANDS",
    "property_id": "<optional, hashed if private>",
    "altitude_m": 320,
    "uncertainty_m": 50
  },
  "time": {
    "instant": "2026-04-15T08:30:00Z",
    "range_start": "2026-04-15T00:00:00Z",
    "range_end": "2026-04-15T23:59:59Z",
    "uncertainty_s": 3600
  },
  "methodology": {
    "protocol": "<from controlled vocabulary or org-declared identifier>",
    "structured_metadata": {},
    "free_text": "Hard-release of 12 individuals from captive breeding cohort A."
  },
  "provenance": {
    "ingested_at": "<server-side timestamp>",
    "source_path": "push | pull:hcas | pull:eks | pull:dcceew | pull:pdf",
    "schema_version": "<org schema version>",
    "source_record_id": "<org-supplied ID for idempotency>"
  },
  "data": {}
}
```

Required fields: `observation_type`, `location` (one of `lat/lon` or `polygon_ref` or `nrm_region` or `property_id`), `time` (one of `instant` or `range_start+range_end`).

The `data` field is org-specific and validated against the org's registered JSON Schema for `(org_id, observation_type, schema_version)`.

### 4.2 Per-org schema registry

Each contributing org declares its `data` payload schema at onboarding. Stored as JSON Schema documents in a `schema_registry` table.

Schema versions are immutable. New versions append. Old versions remain valid for already-ingested data so historical observations stay queryable against their original schema.

Schema registry table:

```sql
CREATE TABLE schema_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  observation_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  json_schema JSONB NOT NULL,
  declared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at TIMESTAMPTZ,
  UNIQUE (org_id, observation_type, schema_version)
);
```

### 4.3 Observation storage

```sql
CREATE TABLE observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  observation_type TEXT NOT NULL,
  schema_version TEXT NOT NULL,

  location_point GEOMETRY(Point, 4326),
  location_polygon_ref UUID REFERENCES polygons(id),
  nrm_region TEXT,
  property_id_hash TEXT,
  altitude_m REAL,
  location_uncertainty_m REAL,

  time_instant TIMESTAMPTZ,
  time_range TSTZRANGE,
  time_uncertainty_s INTEGER,

  methodology JSONB NOT NULL,
  provenance JSONB NOT NULL,
  data JSONB NOT NULL,

  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_record_id TEXT,

  UNIQUE (org_id, source_record_id)
);

CREATE INDEX idx_observations_org_type ON observations (org_id, observation_type);
CREATE INDEX idx_observations_location ON observations USING GIST (location_point);
CREATE INDEX idx_observations_polygon ON observations (location_polygon_ref);
CREATE INDEX idx_observations_nrm_region ON observations (nrm_region);
CREATE INDEX idx_observations_time_instant ON observations (time_instant);
CREATE INDEX idx_observations_time_range ON observations USING GIST (time_range);
CREATE INDEX idx_observations_data ON observations USING GIN (data);
```

### 4.4 Polygons table

Polygons are large and reused across observations. Stored separately, referenced by UUID.

```sql
CREATE TABLE polygons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  geometry GEOMETRY(MultiPolygon, 4326) NOT NULL,
  area_ha REAL,
  source TEXT,
  declared_by_org_id UUID REFERENCES organizations(id),
  declared_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_polygons_geometry ON polygons USING GIST (geometry);
```

### 4.5 Rasters and large blobs

HCAS, satellite imagery and other raster data is stored in an object store with metadata in Postgres.

```sql
CREATE TABLE raster_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  bbox GEOMETRY(Polygon, 4326) NOT NULL,
  pixel_resolution_m REAL,
  time_instant TIMESTAMPTZ,
  metadata JSONB,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.6 Organisations and identity

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  org_type TEXT NOT NULL,
  primary_region TEXT,
  contact_email TEXT,
  onboarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_sharing_tier TEXT NOT NULL DEFAULT 'private'
);

CREATE TABLE api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  token_hash TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);
```

`data_sharing_tier` values:
- `private`: data visible only to the org and methodology-aggregated to public surface
- `commons`: full observations available to other contributing orgs and synthesis queries
- `aggregated_only`: observations contribute to aggregate statistics but raw records are not exposed

### 4.7 Synthesis results cache

Causal inference is expensive. Results are cached.

```sql
CREATE TABLE synthesis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_signature TEXT NOT NULL,
  parameters JSONB NOT NULL,
  result JSONB NOT NULL,
  confidence_interval JSONB,
  methodology TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observations_consumed BIGINT,
  compute_seconds REAL
);

CREATE INDEX idx_synthesis_signature ON synthesis_runs (query_signature, computed_at DESC);
```

## 5. Ontology layer

The reason every existing platform stops at per-org dashboards is that cross-org synthesis requires shared meaning across mismatched schemas. The ontology layer is where that shared meaning lives.

### 5.1 Species taxonomy

Backbone: GBIF (Global Biodiversity Information Facility) taxonomic backbone. Every species reference in an observation's `data` payload is reconciled to a GBIF `taxonKey`. The reconciliation step is part of normalisation.

Reconciliation table:

```sql
CREATE TABLE species_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  source_name TEXT NOT NULL,
  gbif_taxon_key BIGINT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  source TEXT NOT NULL,
  declared_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_species_aliases_lookup ON species_aliases (org_id, source_name);
```

Org-specific aliases take precedence over global aliases. AI-assisted alias suggestion at onboarding (fuzzy match against GBIF + LLM confirmation, with human-confirm step before commitment).

### 5.2 Observation type vocabulary

Controlled vocabulary maintained as a versioned YAML file in the repo. Examples:

```
- code: SPECIES_RELEASE
  label: Species release event
  description: Individuals of a species released into the wild
  required_fields_in_data: [species, individuals_count, release_protocol]

- code: BIODIVERSITY_SURVEY
  label: Biodiversity survey
  description: Point or transect survey enumerating species presence/abundance

- code: HABITAT_CONDITION_ASSESSMENT
  label: Habitat condition assessment
  description: Quantitative habitat condition metric per HCAS or compatible methodology

- code: WATER_QUALITY_SAMPLE
  label: Water quality sample
  description: In-situ water sample with measured analytes

- code: PEST_CONTROL_ACTION
  label: Pest control action
  description: Application of pest control (baiting, shooting, biological)

- code: REVEGETATION_ACTION
  label: Revegetation or restoration action
  description: Planting or natural regeneration intervention

- code: AGRICULTURAL_YIELD
  label: Agricultural yield record
  description: Crop or livestock production output per area per period
```

New observation types added through versioned amendments. Orgs can request new types via the onboarding flow.

### 5.3 Methodology vocabulary

Each observation declares its methodology. Methodology codes are open: orgs can declare their own protocol identifier, but well-known protocols (HCAS, SEEA, AusPlots, TERN) are reserved and validated against known parameter sets.

### 5.4 Location ontology

Hierarchical:
- Australia
- State / Territory
- NRM region (54 canonical codes)
- IBRA bioregion
- Property / parcel (cadastre, hashed if private)
- Point (lat / lon)
- Polygon (referenced by UUID)

Each observation declares the highest-resolution location it has. The spatial-temporal join layer handles cross-scale matching.

### 5.5 Time normalisation

UTC always. Instant or range. Uncertainty in seconds. Local-time displays handled at the view layer.

## 6. Ingestion layer

### 6.1 Push endpoint

```
POST https://api.placeholder.ecodia.au/v1/observations
Authorization: Bearer <org_token>
Content-Type: application/json
Idempotency-Key: <optional, defaults to source_record_id>

<envelope JSON>

Response: 202 Accepted
{
  "observation_id": "...",
  "status": "queued | validated | normalised",
  "validation_warnings": [...]
}
```

Batch endpoint for high-volume ingest:

```
POST https://api.placeholder.ecodia.au/v1/observations/batch
Content-Type: application/x-ndjson

<envelope JSON per line>

Response: 202 Accepted
{
  "batch_id": "...",
  "received": 1234,
  "validated_inline": 1230,
  "queued_for_async": 4
}
```

### 6.2 Pull adapters

Five adapter shapes at v0:

1. **HCAS adapter**: pulls habitat condition raster tiles from CSIRO endpoint, registers as `raster_assets`, generates `HABITAT_CONDITION_ASSESSMENT` observations sampled at NRM-region centroids and polygon boundaries
2. **EKS adapter**: pulls Nature Repair Market project metadata via DCCEEW API, generates `REVEGETATION_ACTION` and project-scope observations
3. **DCCEEW NCA adapter**: scrapes the Environmental-Economic Accounts dashboard for state-aggregate observations
4. **NRM PDF adapter**: parses annual reports from NRM body publication URLs, extracts structured data via LLM + verification step
5. **GBIF adapter**: pulls biodiversity observation records for AU geographic scope into `BIODIVERSITY_SURVEY` observations

Each adapter runs on a cron schedule, idempotent on `source_record_id`. New adapters are added by writing a Python class implementing the `PullAdapter` protocol.

```python
class PullAdapter(Protocol):
    name: str
    cadence: str  # cron expression

    def discover(self, since: datetime) -> Iterator[SourceRecord]: ...
    def normalise(self, record: SourceRecord) -> Observation: ...
```

### 6.3 Onboarding flow

Self-serve via web UI at `app.placeholder.ecodia.au/onboard`. Five steps:

1. Org sign-up (name, primary region, contact email, org type)
2. Generate bearer token (one-time display, hashed at rest)
3. Declare data-sharing tier (private / commons / aggregated_only)
4. Register JSON Schema for each `observation_type` the org will emit
5. Send first test observation to validate pipeline end-to-end

AI assistance at step 4: paste a sample observation, the platform infers a JSON Schema, org confirms or edits.

### 6.4 Validation and normalisation pipeline

Push or pull, observations land in a `raw_inbox` queue, then run through:

1. Envelope validation (required fields, types)
2. Schema lookup for `(org_id, observation_type, schema_version)`
3. Payload validation against registered schema
4. Species alias reconciliation against GBIF backbone
5. Location normalisation (lat/lon -> polygon containment -> NRM region)
6. Time normalisation (UTC, uncertainty defaulting)
7. Methodology lookup
8. Write to `observations` table
9. Emit observation-landed event for downstream consumers

Validation failures land in a `validation_failures` table with structured reason. Org dashboard surfaces these so the org can fix and re-submit.

## 7. Synthesis layer

This is where the actual value lives. Everything above is plumbing.

### 7.1 Query categories

Three query categories at v0:

- **Descriptive**: "Show me all observations of type X in region Y between time T1 and T2." Direct database query. Sub-second.
- **Joining**: "Find observations of type X within radius R of observations of type Y within time window W." Spatial-temporal join. Seconds to minutes depending on scope.
- **Causal**: "Does intervention X cause outcome Y, conditional on covariates Z, with confidence interval?" Statistical inference. Minutes to hours. Cached.

### 7.2 Causal inference methodology

The hardest layer. Approach at v0:

- Difference-in-differences for binary interventions with adjacent untreated controls
- Synthetic control method (Abadie) when natural controls are scarce
- Bayesian structural time series (CausalImpact-style) for time series outcome variables
- Directed acyclic graphs (DAGs) declared per causal query, encoding assumed causal structure
- Sensitivity analysis required for every causal claim, reporting how the estimate moves with confounder strength

OPEN QUESTION 7.2.1: Statistical library choice. Python with `causalimpact`, `econml`, `dowhy`, plus `statsmodels`, plus R via rpy2 for `Synth`? Or pure-Julia stack?

OPEN QUESTION 7.2.2: Compute substrate for synthesis runs. Postgres-side (PL/Python)? Separate worker pool calling out to inference services? Apache Beam dataflow?

DECISION 7.2.3: Every causal-claim output includes:
- Point estimate
- 95% confidence interval
- Methodology used
- DAG declared for the analysis
- Sensitivity analysis result
- Observations consumed (counts per type)
- Caveats (small N, missing controls, etc)

No causal claim is exposed without these companion fields.

### 7.3 Pre-built query catalogue

A versioned catalogue of canonical synthesis queries the platform answers out of the box. v0 catalogue:

1. Natural capital position for an NRM region (SEEA-aligned scorecard across natural-system extent, condition, biodiversity, and natural-service accounts)
2. Restoration intervention effect on downstream water quality (riparian planting / fencing / weed control as intervention; downstream NRM water-quality monitoring sites as outcome)
3. Pollination service value attributable to native vegetation cover within crop-flight-distance
4. Pest control effect of revegetation on adjacent agricultural production
5. Species recovery program effect on regional biodiversity index

Each catalogue entry has a permanent URL, declared methodology, and a citation block including all contributing orgs.

### 7.4 Synthesis worker pool

Async workers consume the `synthesis_queue`. Each worker:

1. Acquires query lock
2. Fetches observations consistent with query parameters
3. Runs methodology-appropriate statistical machinery
4. Writes result to `synthesis_runs`
5. Emits synthesis-complete event

Workers are stateless, horizontally scalable. Persistence is in Postgres.

OPEN QUESTION 7.4.1: Worker substrate. Existing EcodiaOS cowork.dispatch_worker primitive (which is fork-spawn shape, IDE-hosted)? Or proper background-worker service (BullMQ, Celery, Temporal)? The cowork primitive is wrong shape here because synthesis runs are not IDE-conversational. Need a proper queue.

## 8. Web frontend

### 8.1 Architecture

Next.js app deployed to Vercel. Map UI built on Mapbox or MapLibre. Charts via Observable Plot. Data fetching via tRPC against the platform API.

### 8.2 Surfaces

- `app.placeholder.ecodia.au` - contributor dashboard (org-authenticated)
- `placeholder.ecodia.au` - public surface (read-only, anonymised aggregates only)
- `api.placeholder.ecodia.au` - the ingestion and query API
- `docs.placeholder.ecodia.au` - documentation site

### 8.3 Public-surface views

1. **Region map**: clickable map of Australia at NRM-region resolution. Click a region, see its natural-capital position scorecard, all contributing orgs (anonymised by default), and pre-built synthesis queries answered for that region.
2. **Query builder**: pick a pre-built query from the catalogue, set parameters (region, time window, intervention/outcome species), see the result with methodology, citations, sensitivity analysis.
3. **Catalogue browser**: browse all published synthesis results across all regions, filter by query type or contributing org.
4. **Methodology pages**: one page per query category explaining the statistical machinery.
5. **Citation block**: every chart and number is accompanied by source attribution and a download-raw-data link.

### 8.4 Contributor-dashboard views

1. Ingest health: last observation timestamp, validation success rate, validation failures with reason
2. Schema management: declare new observation types, version existing schemas
3. Token management: issue, revoke, rotate
4. Data-sharing controls: per-observation-type tier override
5. Their contribution surfacing: which public synthesis queries their data is feeding

## 9. Auth and multi-tenant model

### 9.1 Identity

Three identity classes:
- **Org bearer token**: for system-to-system ingestion. Hashed at rest. Scoped to a specific org.
- **User session**: for contributor dashboard. Email + magic link, no passwords. Tied to a specific org membership.
- **Public read**: no auth. Rate-limited per IP.

### 9.2 Multi-tenant data isolation

Postgres row-level security on every table that contains org data. Bearer-token middleware sets `app.current_org_id` per request. Default policy: an org sees its own observations and any observation in `commons` tier.

```sql
CREATE POLICY org_sees_own_observations
ON observations
FOR SELECT
USING (
  org_id = current_setting('app.current_org_id')::uuid
  OR
  EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.id = observations.org_id AND o.data_sharing_tier = 'commons'
  )
);
```

### 9.3 Synthesis queries and data-sharing tiers

Synthesis queries can consume `commons` observations directly, `aggregated_only` observations through count/mean aggregations with k-anonymity threshold, and `private` observations only with explicit opt-in per query.

## 10. Privacy and IP

### 10.1 Sensitive data classes

- **Endangered species precise locations**: locations of threatened species observations are coarsened to NRM-region centroid for public surfaces. Precise location only visible to the contributing org and authorised research partners.
- **Property-level production data**: property IDs hashed at ingest. Public surfaces only show region-aggregated production.
- **Indigenous cultural site references**: out of scope for v0. Any contribution touching this requires explicit handling protocol designed with First Nations partners.

### 10.2 Aggregation thresholds

K-anonymity threshold k=5 for any aggregate exposing private observations. Cells with fewer than five contributing records are suppressed.

### 10.3 Cross-org consent model

Org-level data-sharing tier is the default. Per-observation tier override is supported. Per-query opt-in is supported for synthesis queries that need elevated access.

OPEN QUESTION 10.3.1: Legal framework for the multi-org data-sharing agreement. Templated contract drafted with legal partner? CSIRO partnership might supply this. Need legal review before any commons-tier data lands.

### 10.4 GDPR + AU Privacy Act compliance

No personally identifying information in observation data. PII would be a contract violation. Contributor user accounts are separate and follow standard Privacy Act handling.

## 11. Operational concerns

### 11.1 Deployment substrate

DECISION 11.1.1: Backend runs on the existing EcodiaOS VPS for v0. Postgres on Supabase (already in the substrate). Frontend on Vercel.

DECISION 11.1.2: Domain TBD pending name decision. Subdomain `placeholder.ecodia.au` in the meantime so the substrate is reachable.

### 11.2 Monitoring

- Ingest endpoint: request rate, validation success rate, p50/p95/p99 latency, payload size distribution
- Synthesis queue: depth, oldest item age, worker availability, per-query-category completion time
- Storage: row counts per table per day, index size, autovacuum health
- Public surface: page-view, search-query, synthesis-result-citation counts (for usage substrate)

Wired into existing EcodiaOS observer_signals substrate. P1-class issues fire to sms.tate via `failureEscalateService`.

### 11.3 Cost model

v0 monthly cost projection at one anchor NRM + federal data layers:
- Supabase Pro: AU$40
- Vercel Pro: AU$30
- Mapbox: AU$0 (free tier covers v0 traffic)
- Object store (rasters): AU$50 estimated for HCAS at full national raster set
- Domain: AU$0 (subdomain of ecodia.au)
- Total: ~AU$120/month

Scaling to 54 NRMs + multiple federal data layers + heavier traffic: estimate AU$500-1500/month.

### 11.4 Backup and disaster recovery

Supabase native backups daily. Synthesis cache is recomputable from observations so not separately backed up. Object store with versioning.

## 12. Build sequence

### 12.1 Month 1: Ingest substrate

Deliverable: a contributing org can POST observations and see them persisted. HCAS pull-adapter pulls the national habitat condition raster as `raster_assets`.

Tasks:
- Bootstrap repo at `/Users/ecodia/.code/ecodiaos/products/[platform]/` (or new repo at `EcodiaAU/[platform]` GitHub org if separating product IP)
- Postgres migrations: `organizations`, `api_tokens`, `schema_registry`, `polygons`, `observations`, `raster_assets`, `validation_failures`, `raw_inbox`
- Express or FastAPI service exposing `POST /v1/observations` + bearer auth middleware + JSON Schema validation (via `ajv` or `jsonschema`)
- HCAS pull adapter (Python worker, cron schedule)
- Minimal contributor signup flow (creates org + first token)
- One end-to-end test: simulated org POSTs an observation, lands in DB, queryable

OPEN QUESTION 12.1.1: Express (JS, matches existing EcodiaOS backend) or FastAPI (Python, more natural for ML/inference downstream)? Recommend FastAPI for this product since synthesis layer needs Python's statistical stack.

### 12.2 Month 2: Normalisation layer

Deliverable: ingested observations are normalised through ontology aligners before persistence.

Tasks:
- Species alias reconciliation against GBIF taxonomic backbone
- Location normalisation (lat/lon -> polygon containment -> NRM region)
- Observation-type vocabulary YAML + loader
- Methodology vocabulary + validation
- Schema-registry self-serve UI for org schema declaration
- EKS pull adapter (Nature Repair Market projects)
- GBIF pull adapter for the AU geographic scope

### 12.3 Month 3: Synthesis layer

Deliverable: the riparian-restoration-to-water-quality causal query runs end-to-end on real data with confidence intervals.

Tasks:
- Synthesis worker pool (decision required in 7.4.1, recommend BullMQ if Node-side or Celery if Python-side)
- Spatial-temporal join engine (PostGIS-backed)
- Difference-in-differences implementation with adjacent-control discovery
- The riparian-restoration causal query as catalogue entry one
- Sensitivity analysis machinery
- DAG declaration for the query
- Synthesis results cache

### 12.4 Month 4: Web frontend

Deliverable: public surface at `placeholder.ecodia.au` showing the map, the catalogue, and the riparian query result for at least one NRM region.

Tasks:
- Next.js scaffold deployed to Vercel
- Mapbox or MapLibre map UI at NRM-region resolution
- Query builder for catalogue queries
- Result visualisation (chart, methodology, citations, sensitivity analysis, raw data download)
- Contributor dashboard at `app.placeholder.ecodia.au`
- Documentation site at `docs.placeholder.ecodia.au`

### 12.5 Month 5: Polish + deploy + first conversation

Deliverable: production-grade demo running on a real NRM region's data (the anchor region identified through the parallel conversation track).

Tasks:
- DCCEEW NCA scraper
- NRM PDF parser
- Auth hardening, rate limiting, observability
- DR plan, runbooks
- Anchor NRM data integration (push or pull depending on their capacity)
- The NRM Regions Australia first conversation, demo in hand

### 12.6 Beyond v0

Phase two (months 6-12):
- Causal inference methodology expansion (synthetic control, Bayesian time-series)
- Generalisation to three to five NRMs
- Data-sharing agreement framework with CSIRO partnership
- Catalogue queries 2 through 5

Phase three (months 12-24):
- Full 54-NRM peak-body infrastructure deployment
- DCCEEW Panel of Regional Delivery Partners procurement engagement
- CSIRO methodology partnership formalisation
- Multi-tenancy at scale

## 13. Risks and open questions

### 13.1 Methodology risks

- Causal inference at NRM-region scale is genuinely hard. Statistical experts will critique any claim. Mitigation: every claim ships with methodology, DAG, and sensitivity analysis; partnership with CSIRO for validation.
- Spatial-temporal mismatches across observation cadences may make some causal chains unprovable at the resolution available. Mitigation: declare which queries are answerable today vs need more data, surface this in the UI.

### 13.2 Adoption risks

- Orgs may not push data even with a flexible endpoint. Mitigation: pull-fallback architecture, plus AI-assisted PDF parsing of public annual reports so orgs are passive contributors at minimum.
- Schema registry friction at onboarding may turn orgs off. Mitigation: AI-assisted schema inference from a sample observation.

### 13.3 Commercial risks

- Federal procurement is slow. Mitigation: pilot grant from NRM Regions Australia or anchor NRM bridges to procurement.
- NatureMetrics or another well-funded incumbent could pivot. Mitigation: ship faster than they can pivot. v0 in three to five months.

### 13.4 Resource risks

- One engineer plus EcodiaOS focus for 3-5 months displaces Co-Exist / Roam / Chambers / Goodreach / Resonaverde work. Mitigation: explicit reallocation decision after v0 ships and measurable buyer interest is in.

### 13.5 Open questions (consolidated)

| ID | Question | Owner | Blocking |
|---|---|---|---|
| 2.1 | Does v0 sell to one buyer or build for one anchor NRM as public reference? | Tate | Month 5 |
| 3.3 | Object store choice (Supabase Storage vs S3 vs R2) | EcodiaOS, recommend Supabase Storage for v0 | Month 1 |
| 7.2.1 | Statistical library stack | EcodiaOS, recommend Python with `causalimpact`+`dowhy`+`statsmodels` | Month 3 |
| 7.2.2 | Synthesis compute substrate | EcodiaOS, recommend separate worker pool | Month 3 |
| 7.4.1 | Worker queue substrate (cowork primitive wrong shape) | EcodiaOS, recommend Celery + Redis or BullMQ | Month 3 |
| 10.3.1 | Multi-org data-sharing agreement legal framework | Tate + legal partner | Month 4 |
| 12.1.1 | Backend language (Express vs FastAPI) | EcodiaOS, recommend FastAPI for downstream ML fit | Month 1 |

## 14. Glossary

- **DCCEEW**: Department of Climate Change, Energy, the Environment and Water (AU federal)
- **EKS**: Ecological Knowledge System (DCCEEW)
- **GBIF**: Global Biodiversity Information Facility, the canonical species taxonomic backbone
- **HCAS**: Habitat Condition Assessment System (CSIRO + DCCEEW)
- **IBRA**: Interim Biogeographic Regionalisation for Australia
- **MRV**: Measurement, Reporting, Verification (the infrastructure shape this platform implements)
- **NCA**: Natural Capital Accounts (DCCEEW + ABS)
- **NRM**: Natural Resource Management (54 regional bodies + peak body NRM Regions Australia)
- **Nature Repair Market**: AU-legislated voluntary biodiversity credit market (2023)
- **PostGIS**: Postgres spatial extension
- **SEEA**: System of Environmental-Economic Accounting (UN statistical standard)
- **TNFD**: Taskforce on Nature-related Financial Disclosures

## 15. What this document is not

This document is the architectural spine for v0. It does not include:
- Detailed UI mockups (covered in a separate design document, to be authored)
- Marketing copy and brand identity (pending name decision)
- Sales scripts for the NRM Regions Australia first conversation (to be drafted in Tate voice, separate document)
- Pricing model (deferred until buyer interest signal is in)
- Hiring plan (deferred until v0 ships)

Each of those becomes its own document when the upstream question is answered.

---

End of v0.1. Next iteration triggered by:
- Tate decisions on the seven open questions
- Name landing (substrate-wide rename pass)
- First implementation surfacing concrete architecture issues to revise back into this document
