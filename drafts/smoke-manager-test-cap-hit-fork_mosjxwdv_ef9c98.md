# Manager-fork smoke test: tree energy cap blocks workers

Fork: `fork_mosjxwdv_ef9c98` (manager)
Parent: `fork_mosjn5r0_8f4280` (root smoke-test fork)
Time: 5 May 2026, ~21:25 AEST window

## What I tried

POST `http://localhost:3001/api/os-session/fork` x2 (worker 1, worker 2) with `parent_fork_id=fork_mosjxwdv_ef9c98`.

## What happened

Both calls returned:

```json
{
  "error": "fork_cap_reached",
  "details": {
    "live_count": 2,
    "hard_cap": 5,
    "energy_cap": 2,
    "effective_cap": 2,
    "cap_hit": "energy",
    "tree_cap": true,
    "root_fork_id": "fork_mosjn5r0_8f4280"
  }
}
```

## The finding

The brief says "per-tree cap of 5 sub-forks". The actual substrate enforces **energy_cap = 2** as the binding tree-level limit. With root + manager alive (which is the steady state of any manager pattern - root must remain alive while waiting for the manager's consolidated report), the manager has **zero** spare slots for workers.

This means the **manager-fork pattern is structurally unviable under the current energy cap** unless either:

1. The energy budget for a tree is raised above 2, OR
2. Manager forks are exempt from the energy count (treat them as routing layer, not work-doer), OR
3. The energy cap is enforced as concurrent **leaf** forks rather than total live in tree.

Recommended fix: option (3). Manager nodes shouldn't count against energy because they don't burn tokens doing work; they consolidate. Energy should be charged at the leaves where Anthropic API calls happen.

## Stamp

fork_mosjxwdv_ef9c98
