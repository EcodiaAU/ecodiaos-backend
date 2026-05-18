# Migration DR Runbook - 2026-05-15

Disaster recovery runbook for the VPS-to-local Claude Code migration. Authored by Lane A. Snapshots produced by this lane are at `D:/.code/migration-snapshots/2026-05-15/` on Corazon (Tate's laptop) and `~/migration-snapshots-2026-05-15/` on the VPS.

This runbook is for situations where the migration cutover (Phase 3-4 of `backend/docs/MIGRATION_FULL_ARCHITECTURE_2026-05-15.md`) corrupts state, breaks capability, or otherwise needs to be reversed.

---

## What is actually at risk vs what is not

The migration's risk surface is narrower than the dossier framed it:

| Substrate | Where it lives | Has its own backups? | Lane A snapshot purpose |
|---|---|---|---|
| Supabase Postgres (status_board, kv_store, working_set, cc_sessions, etc) | Supabase cloud, ap-southeast-2 | Yes - PITR + daily snapshots in Supabase Dashboard | Belt-and-suspenders against **our** writes corrupting state during cutover. Not against Supabase outage (use their UI for that). |
| Neo4j (Episodes, Decisions, Patterns, etc) | Neo4j Aura cloud | Yes - Aura auto-backups | Same - belt-and-suspenders against our cypher writes corrupting graph state. |
| VPS code (`~/ecodiaos/`) | DigitalOcean droplet 170.64.170.191 | git remote `origin` on github.com:EcodiaTate/ecodiaos-backend | Mostly covered by git. The dirty working tree state is not - hence the tarball snapshot. |
| VPS `.env` (DATABASE_URL, OAuth tokens, Twilio, Stripe, Anthropic OAuth, AWS, etc) | VPS filesystem only | **NO** - not in git, not in Supabase | **This is the only truly irreplaceable artifact.** Encrypted snapshot is mandatory. |
| PM2 process state | VPS runtime | No | pm2-state.json captures what was running pre-cutover so it can be restarted to match. |

If the cutover breaks the VPS itself (disk wipe, droplet loss), the recovery is: restore Supabase from Supabase's UI, restore Neo4j from Aura's UI, redeploy code from `git checkout pre-migration-cutover-2026-05-15`, decrypt `env.encrypted` to `.env`, run `pm2 resurrect` or replay from `pm2-state.json`.

If the cutover only breaks our state (we wrote bad data via cypher / SQL during cutover), restore the affected tables/labels from the Lane A local snapshots.

---

## Lane A snapshot inventory

### On Corazon - `D:/.code/migration-snapshots/2026-05-15/`

```
2026-05-15/
├── manifest.json                            # Master manifest with sha256 of every artifact
├── working_set_audit.json                   # A6 result - 0 teardown-referencing rows
├── postgres/
│   ├── postgres-full.dump                   # pg_dump -Fc, restorable via pg_restore
│   ├── postgres-full.sql.gz                 # pg_dump -Fp gzipped, human-readable diffs
│   ├── pg_dump_fc.log                       # streaming log of -Fc dump
│   ├── pg_dump_fp.log                       # streaming log of -Fp dump
│   └── row_counts.json                      # row counts of 19 critical tables at snapshot time
├── neo4j/
│   ├── nodes.jsonl                          # one JSON per node, with id, labels, properties
│   ├── relationships.jsonl                  # one JSON per relationship, with start, end, type, properties
│   ├── counts.json                          # per-label node counts + relationships total
│   ├── export_neo4j.py                      # the export script (re-runnable)
│   └── export.log
├── creds/
│   ├── creds.encrypted                      # kv_store WHERE key LIKE 'creds.%' (44 rows) - Fernet ciphertext
│   ├── env.encrypted                        # /home/tate/ecodiaos/.env on VPS - Fernet ciphertext
│   ├── creds.salt                           # 16-byte scrypt salt - PUBLIC, paired with passphrase
│   ├── creds.manifest.json                  # which keys present, which dossier-expected keys missing
│   └── encrypt_creds.py                     # encryption + decryption tool
└── vps/
    ├── pm2-state.json                       # pm2 jlist output pre-cutover
    └── working-tree-dirty-state.tar.gz      # uncommitted files at pre-migration commit a44814d
```

### On VPS - `~/migration-snapshots-2026-05-15/`

Mirror copies of `pm2-state.json` and `working-tree-dirty-state.tar.gz` (the originals - Corazon copies are scp'd from here).

### Git
- Tag `pre-migration-cutover-2026-05-15` at commit `ae1c463` pushed to `origin` (github.com:EcodiaTate/ecodiaos-backend).

---

## Restoration procedures

### R1. Postgres restore - full database to a fresh Supabase branch first

ALWAYS restore to a Supabase branch first, verify, then promote. Direct restore over the live production DB is a one-way operation.

```powershell
# 1. Create a new Supabase branch via the Supabase MCP or Dashboard
#    (named something like "dr-restore-2026-05-15")

# 2. Get the branch's DATABASE_URL

# 3. From Corazon, restore the custom-format dump
& 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe' `
    --no-owner --no-acl --verbose `
    --dbname=$BRANCH_DBURL `
    'D:\.code\migration-snapshots\2026-05-15\postgres\postgres-full.dump'

# 4. Verify row counts match D:\.code\migration-snapshots\2026-05-15\postgres\row_counts.json

# 5. If everything checks out, merge the branch via Supabase Dashboard
#    OR for surgical restore, copy specific tables back via pg_dump from branch to prod
```

For surgical table restore (e.g. only kv_store got corrupted):

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe' `
    --no-owner --no-acl `
    --table=kv_store --data-only `
    --dbname=$PROD_DBURL `
    'D:\.code\migration-snapshots\2026-05-15\postgres\postgres-full.dump'
```

### R2. Postgres restore - from Supabase's own backups (PREFER THIS)

If the issue is anything other than "we know exactly which tables we corrupted with the migration," the right tool is Supabase's PITR / daily snapshots in their Dashboard, not our pg_dump. Their backups have transaction-log granularity. Our pg_dump is one frozen moment.

Use Lane A's pg_dump only when:
- Supabase backups can't be reached (account locked, billing issue)
- You need to compare/diff "what was here before cutover" vs "what's here now" without rolling back
- You want to extract a specific row from a specific table without touching anything else

### R3. Neo4j restore

Cloud Aura has its own backups. Use them first via the Aura console.

If you need to restore from Lane A's JSONL exports:

```python
# Pseudo-recipe (write a proper script if you actually need to run this):
import json
from neo4j import GraphDatabase
driver = GraphDatabase.driver(NEO4J_URI, auth=(USER, PASS))

# Drop affected labels first if doing a full restore (DANGEROUS - prefer Aura backup):
# session.run("MATCH (n:LabelName) DETACH DELETE n")

# Re-create nodes from nodes.jsonl
with driver.session() as s, open("nodes.jsonl") as f:
    for line in f:
        row = json.loads(line)
        labels = ":".join(f"`{l}`" for l in row["_labels"])
        s.run(f"CREATE (n:{labels}) SET n = $props", props=row["_props"])

# Re-create relationships from relationships.jsonl
# Note: id(n) in Neo4j is not stable across imports - you need to match on properties
# (e.g. all our nodes have a "name" or "id" property). Match by that, not by raw id.
```

Surgical restore (one Decision node lost or corrupted): grep nodes.jsonl for the relevant `_props.name` or `_props.id`, write a single CREATE statement.

### R4. VPS code restore

```bash
ssh tate@100.103.227.90
cd ~/ecodiaos
# Stop the live conductor first if it's still trying to run
PATH=/home/tate/.nvm/versions/node/v20.20.2/bin:$PATH pm2 stop all

git fetch --tags
git checkout pre-migration-cutover-2026-05-15
# Note: this leaves you in a detached HEAD - if you intend to continue from here,
# branch first: git checkout -b post-dr-2026-05-15

# If the dirty working tree state matters, restore from the tarball:
tar -xzf ~/migration-snapshots-2026-05-15/working-tree-dirty-state.tar.gz -C ~/ecodiaos/

npm install
PATH=/home/tate/.nvm/versions/node/v20.20.2/bin:$PATH pm2 reload ecosystem.config.js
PATH=/home/tate/.nvm/versions/node/v20.20.2/bin:$PATH pm2 save
```

### R5. .env restore (the load-bearing one)

```powershell
# On Corazon (where you have the encrypted snapshot):
cd D:\.code\migration-snapshots\2026-05-15\creds\
pip install cryptography  # if not installed
python encrypt_creds.py --decrypt env.encrypted > env.restored.txt
# Will prompt for passphrase. Same one Tate used to encrypt on 2026-05-15.

# Inspect env.restored.txt first, then ship to VPS:
scp env.restored.txt tate@100.103.227.90:~/ecodiaos/.env
# Delete the local plaintext IMMEDIATELY:
Remove-Item env.restored.txt -Force

# On the VPS:
ssh tate@100.103.227.90
cd ~/ecodiaos
chmod 600 .env
PATH=/home/tate/.nvm/versions/node/v20.20.2/bin:$PATH pm2 restart all --update-env
```

### R6. kv_store creds restore

Same recipe as R5 but for `creds.encrypted`. Output is JSON array of `{key, value, updated_at}` rows. Use psql or the Supabase MCP `execute_sql` to UPSERT each row back into `kv_store`. This is rarely needed standalone - usually R1 (full Postgres restore) covers it.

### R7. PM2 state replay

```bash
# pm2-state.json is the output of `pm2 jlist`. It lists 5 processes pre-cutover:
# ecodia-api (id 8), ecodia-conductor (id 6), ecodia-factory (id 1),
# ecodia-meetings (id 7), ecodia-rescue (id 2).
# After R4 + R5, verify pm2 list matches:
ssh tate@100.103.227.90 'PATH=/home/tate/.nvm/versions/node/v20.20.2/bin:$PATH pm2 list'
# Should show those 5 processes online. If any are missing, scp the dump back:
scp D:/.code/migration-snapshots/2026-05-15/vps/pm2-state.json tate@100.103.227.90:/tmp/
# Then on VPS:
PATH=/home/tate/.nvm/versions/node/v20.20.2/bin:$PATH pm2 start /tmp/pm2-state.json
```

---

## Decision tree - X is broken, do I roll back full or surgical?

```
Migration broke something
  │
  ├─ Supabase data corrupted / missing / wrong
  │    │
  │    ├─ Whole tables affected?
  │    │    ├─ YES → R2 (Supabase PITR / Dashboard backup) first
  │    │    │       fallback: R1 (Lane A pg_restore to fresh branch)
  │    │    └─ NO, just specific rows → R1 surgical (--table=X --data-only to branch, copy rows back)
  │    │
  │    └─ kv_store specifically broken? → R6 (decrypt creds.encrypted, UPSERT)
  │
  ├─ Neo4j data corrupted / missing / wrong
  │    │
  │    ├─ Many nodes affected?
  │    │    ├─ YES → Aura console backup restore first
  │    │    │       fallback: R3 (re-create from nodes.jsonl + relationships.jsonl)
  │    │    └─ NO, one Decision / Episode → R3 surgical (grep + single CREATE)
  │    │
  │    └─ Vector embeddings missing → re-run kg-embedding (lives in `~/ecodiaos/scripts/`)
  │
  ├─ VPS code broken
  │    │
  │    ├─ Forward-fix possible? → fix in place, commit, push, restart pm2 (skip Lane A)
  │    └─ Need to roll back?    → R4 (git checkout pre-migration-cutover-2026-05-15)
  │
  ├─ .env on VPS lost / corrupted / wiped
  │    │
  │    ├─ Have the passphrase? → R5 (decrypt env.encrypted, scp back)
  │    └─ Lost the passphrase  → manually regenerate every credential:
  │         - rotate Anthropic OAuth tokens via `claude setup-token` on each Max account
  │         - rotate Twilio Auth Token via Twilio Console
  │         - rotate Stripe live key via Stripe Dashboard
  │         - rotate Supabase service key via Supabase Settings
  │         - rotate Anthropic API key, OpenAI, AWS, GitHub PAT, etc.
  │         (Expect ~2 hours of work)
  │
  ├─ Routines on claude.ai fire but no context / wrong context
  │    │
  │    └─ SURGICAL: this is a Phase-2 reconciliation issue, not a DR issue.
  │         Don't roll back. Inspect the routine prompt, fix it on the claude.ai/code/routines UI.
  │         If many routines are wrong → likely a shared kv_store value drifted → R1 surgical on kv_store.
  │
  ├─ Local Claude Code conductor can't reach MCP
  │    │
  │    ├─ Bearer rejected? → check kv_store.creds.cowork_mcp_bearer hasn't been rotated.
  │    │                     Refresh `.mcp.json` from current value.
  │    └─ Network? → check Tailscale, then api.admin.ecodia.au reachability.
  │
  └─ Conductor missing context after cutover
       │
       └─ SURGICAL: re-enable osSessionService.js shadow read-only.
            git checkout pre-migration-cutover-2026-05-15 -- src/services/osSessionService.js
            Set OS_SESSION_READONLY=true in .env, pm2 reload.
            This lets the old conductor read state without writing while you investigate.
```

---

## Time-to-recovery estimates

| Scenario | Procedure | Estimated time |
|---|---|---|
| One table corrupted, Supabase backup available | R2 (Supabase PITR) | 5-15 min |
| One table corrupted, restore from Lane A | R1 surgical to branch + cherry-pick rows | 30-60 min |
| Full Postgres corruption, Supabase healthy | R2 (Supabase daily snapshot restore) | 15-30 min |
| Full Postgres corruption, Supabase account down | R1 full restore to fresh branch + promote | 60-90 min |
| One Decision/Episode node corrupted | R3 surgical (grep + single CREATE) | 10 min |
| Full Neo4j corruption, Aura healthy | Aura console restore | 15-30 min |
| Full Neo4j corruption, Aura account down | R3 full re-import from JSONL | 90-120 min |
| VPS code broken, forward-fix possible | edit + commit + restart | 10-30 min |
| VPS code needs rollback | R4 (git checkout + pm2 reload) | 5 min |
| VPS .env corrupted, passphrase known | R5 (decrypt + scp) | 10 min |
| VPS .env corrupted, passphrase LOST | manual rotation of every credential | 2-4 hours |
| Full VPS rebuild (droplet lost) | R4 + R5 + R7 on fresh droplet | 60-90 min |

---

## What this runbook does NOT cover

- Pre-2026-05-15 incidents (use that era's runbook if it exists in `backend/docs/`)
- App-level bugs (use forward-fix, not DR)
- Anthropic-side outages (no recovery path on our end - wait for upstream)
- Tailscale outages (use direct IP fallback, not DR)
- DigitalOcean droplet replacement (covered loosely under "Full VPS rebuild" but requires a separate DNS + Tailscale re-onboarding playbook)

---

## Snapshot freshness and rotation

These snapshots are pre-migration only. After Phase 3 (cutover) stable for 7 days, mint a new "post-migration baseline" snapshot using the same Lane A procedure and update this runbook to point at it. After 30 days, the 2026-05-15 snapshots can be deleted from Corazon (the git tag stays forever on `origin`).

To re-run a snapshot of the same shape:
1. `node` not required - all scripts are Python + PowerShell + pg_dump
2. New target dir: `D:/.code/migration-snapshots/$(date +%Y-%m-%d)/`
3. Run the four scripts: `export_neo4j.py`, `encrypt_creds.py`, and the pg_dump commands above
4. Tag the VPS again with the new date
5. Update `MIGRATION_DR_$(date).md` with new manifest paths

---

## Authorship

- Lane: A (Backups, Snapshot, DR Rollback Recipe)
- Sibling lanes (do NOT overlap with this runbook): B (hooks + skills), C (Factory migration), D (webhook routine shims), E (ecodia-full bearer, shipped before this lane).
- Authored 2026-05-15 by EcodiaOS-on-Corazon (local Claude Code) under Tate's full-autonomy mandate. Verified against live substrate before publishing.
