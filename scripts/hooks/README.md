# EcodiaOS Hooks - canonical sources

This directory holds the git-tracked canonical versions of the Claude Code hooks that run on Corazon. The live deployment lives at `C:/Users/tjdTa/.claude/hooks/` where Claude Code reads them.

## Why two locations

Claude Code only reads hooks from `~/.claude/hooks/`. That path isn't a git repo and won't be (Anthropic owns the dir structure). So the canonical versions live here in the EcodiaOS backend repo for version control + recovery + cross-machine sync, and a manual copy keeps the live deployment in sync.

## Sync workflow

After editing a hook in `backend/scripts/hooks/ecodia/<name>.py`:

```powershell
Copy-Item "D:/.code/EcodiaOS/backend/scripts/hooks/ecodia/<name>.py" `
          "C:/Users/tjdTa/.claude/hooks/ecodia/<name>.py" -Force
```

Or copy the whole dir at once:

```powershell
Copy-Item "D:/.code/EcodiaOS/backend/scripts/hooks/ecodia/*.py" `
          "C:/Users/tjdTa/.claude/hooks/ecodia/" -Force
```

After that any UserPromptSubmit (just send a new chat turn) picks up the updated hook.

## Verifying a hook is live

The hook fires on UserPromptSubmit. Check it ran by looking for the side-effect:
- `conductor_heartbeat.py`: writes `D:/.code/EcodiaOS/coordination/conductors/current.json` with a fresh `last_seen_at`. Also marks `in_turn=true` then the Stop hook clears it.
- Other hooks write to their own substrates per the doctrine.

If the hook errored, it writes to `stderr` which Claude Code logs as a warn. Hook errors never break a turn (every hook exits 0 unconditionally).

## What lives here

| File | Purpose | Cross-ref |
|---|---|---|
| `ecodia/conductor_heartbeat.py` | UserPromptSubmit: register/heartbeat conductor + surface inbox prelude | `backend/patterns/one-conductor-many-channels-2026-05-19.md`, `backend/patterns/coord-inbox-filter-must-be-deny-list-not-allow-list-2026-05-20.md` |
