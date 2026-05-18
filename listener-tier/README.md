# EcodiaOS Local Listener Tier

Local-native sibling to the VPS `src/services/listeners/`. Hosts file-watcher (event source 2.1) listeners on Corazon plus the registry that all four local-tier sources (file watcher, hook, routine, MCP relay) write into.

See `backend/docs/LISTENER_TIER_EVENT_SOURCES_2026-05-15.md` for the routing tree.
See `backend/docs/VPS_LISTENERS_DISPOSITION_2026-05-15.md` for the audit of which VPS listeners live where.

## Layout

- `runner.js` - PM2 entrypoint. Boots all configured file-watcher listeners.
- `registry.json` - state-of-the-world: which listeners exist, last fire timestamp, last status. Hand-edited config + machine-updated state. Atomic rewrite per fire.
- `lib/registry.js` - read/write registry.json with file locking.
- `lib/heartbeat.js` - kv_store.health.<name> writer over MCP.
- `lib/sentinel.js` - debounced watcher pattern shared by listeners.
- `listeners/` - one file per listener. Each exports `{ name, source, watch, handle }`.

## Adding a listener

Author the file under `listeners/<name>.js`, add an entry to `registry.json` under `listeners[]`, restart pm2.

## Run locally

```
pm2 start ecosystem.local.config.js
pm2 logs eos-listener-tier
```

## Health check

```
/listener-health
```

Invokes the skill that reads `registry.json` + `kv_store.health.*` and surfaces the one-screen brief.
