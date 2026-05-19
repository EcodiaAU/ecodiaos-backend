---
triggers: scope-asymmetry-insert-vs-update, bearer-asymmetric-permissions, insert-allowed-update-denied, scope_denied-after-successful-insert, bearer-scope-per-verb, row-level-security-insert-vs-update, with-check-vs-using-policy, probe-write-verbs-separately, mcp-bearer-crud-asymmetry, github-pat-scope-asymmetry, stripe-restricted-key-write-vs-read, cowork-bearer-update-denied-after-insert
---

# Bearer scope is asymmetric across verbs - successful insert does not imply successful update

## The rule

A bearer (MCP token, API key, OAuth scope, row-level-security policy) can permit one verb on a target while denying another verb on the same target. Successfully INSERTing a row through a bearer does NOT prove the bearer can UPDATE or DELETE that row afterward. Probe each verb you intend to use; do not infer write-permission from create-permission.

## Why it exists

Scope systems gate by intent, not by row authorship. Authoring a row does not entitle the author to mutate it later, because the policy treats "row creation" and "row mutation" as separable risk surfaces. A row classified as Tate-attention-class (entity_type=infrastructure, legal) may be safe to CREATE through the cowork bearer but unsafe to silently MUTATE later, so the bearer permits the former and denies the latter.

## Where the same shape shows up

1. **Postgres row-level security.** `WITH CHECK` clauses gate INSERTs; `USING` clauses gate SELECTs and UPDATEs. The two clauses can disagree, so a row that passes INSERT can be invisible to SELECT or immutable to UPDATE by the same role.
2. **GitHub fine-grained PATs.** A token with `contents:write` can push commits but cannot delete branches without a separate `administration:write` scope. Likewise `issues:write` does not imply `pull_requests:write`.
3. **Stripe restricted keys.** A key with `customers:write` can `customer.create` but may not be permitted to `customer.update` or `customer.delete` without scope expansion. Each verb is granted independently per resource.
4. **Atlassian API keys.** `read:account`, `write:account` and `delete:account` are distinct scopes that can be granted in any combination on the same key.
5. **EcodiaOS cowork bearer.** `status_board_upsert` permits INSERT with `entity_type=infrastructure` but denies UPDATE on the same row class (2026-05-19, see [[cowork-scope-cannot-update-entity_type-infrastructure-2026-05-19]]).

Five substrate examples confirm this is a structural property of scope systems, not a quirk of any one bearer.

## How to apply

Before relying on multi-step writes through a single bearer, probe the full CRUD surface you intend to use:

1. **Read** - confirm the bearer can see existing rows of the target shape.
2. **Insert** - land a small disposable row and capture the returned id.
3. **Update** - flip a benign field on the disposable row (e.g. `status` from `staging` to `done`). If this returns `scope_denied`, you have asymmetric scope.
4. **Delete or archive** - try to archive or delete the disposable row. Same risk applies.

If any verb is denied, do not store the assumption "this bearer can write" as a generality. Capture per-verb permission in the substrate doc for that bearer. The cowork bearer's per-verb matrix lives in [[cowork-v2-api-shape-conventions]].

## When asymmetry is discovered mid-arc

Three routes once the denial fires:

a. **Re-route the denied verb through a wider bearer.** The ecodia-full bearer (68 scopes) covers cowork's denied UPDATEs on infrastructure and legal rows.
b. **Switch substrate to an append-only one.** A Neo4j Episode that references the row by name records mid-arc state without needing the denied UPDATE verb. The information lands; the row is untouched.
c. **Pick a different classifier at insert time.** Use `entity_type=task` or `thread` instead of `infrastructure` when the row really is cowork-owned process, not Tate-attention-class infrastructure. These types are mutable end-to-end on the cowork bearer.

## Anti-patterns

- Treating one successful write through a bearer as evidence the bearer can write generally. Each verb is a separate probe.
- Catching `scope_denied` and retrying with the same bearer. Retry does not change scope; route the denied verb elsewhere instead.
- Storing scope inferences in long-term doctrine ("cowork can write status_board") without per-verb qualification. Doctrine that loses the verb-level resolution is doctrine that re-creates the same surprise on the next arc.

## How this surfaced

Forward-referenced from `cowork-scope-cannot-update-entity_type-infrastructure-2026-05-19.md` (capability stress-test 2026-05-19, fork-arc that hit `scope_denied` on a mid-arc update of an infrastructure-class row the same bearer had just inserted). Authored in the next self-evolution Routine fire to fill the dangling link and lift the same-arc observation to a general rule that covers Postgres RLS, GitHub PATs, Stripe restricted keys and Atlassian API keys alongside the cowork bearer.

See also: [[cowork-scope-cannot-update-entity_type-infrastructure-2026-05-19]], [[cowork-v2-api-shape-conventions]], [[cred-rotation-must-propagate-to-all-consumers]], [[verify-before-asserting-in-durable-memory]].
