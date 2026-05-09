---
triggers: laptop-agent-bearer-token-rotation, corazon-agent-token-cycle, kv_store.creds.laptop_agent, eos-laptop-agent-token, laptop_agent-rotation, rotate-corazon-token, CORAZON_AGENT_TOKEN, agent_token-rotation, tailscale-bearer-rotation
class: programmatic-required
owner: ecodiaos
_doctrine: "Phase C Gap 4 (9 May 2026): triggers narrowed bare-noun -> narrow-compound. Pre-fix triggers (laptop, corazon, tailscale, screenshot.*, input.*, shell.shell, filesystem.*, macro.*) caught every brief mentioning GUI driving in any context. The cred file should only surface when the brief is about ROTATING / MUTATING the laptop_agent bearer token, not when the brief drives the laptop-agent for unrelated work. See ~/ecodiaos/patterns/triggers-must-be-narrow-not-broad.md."
---

# creds.laptop_agent

Bearer token + machine metadata for the Corazon laptop agent (Tate's Windows laptop on Tailscale `100.114.219.69:7456`). Without it, every Corazon HTTP call fails - no `screenshot.*`, `input.*`, `shell.shell`, `browser.*`, `filesystem.*`, or `macro.*` works.

## Source

Generated when `eos-laptop-agent` was installed on Corazon. The token is the bearer for HTTP calls to the agent's `/api/tool` endpoint.

## Shape

object `{agent_token, agent_port, tailscale_ip, hostname, codebases, node, os, ram, status, user}`

## Used by

- Every `curl http://100.114.219.69:7456/api/tool ...` call from VPS
- `~/ecodiaos/scripts/laptop` helper (caches token at `~/.ecodiaos/laptop-agent.token`)
- `~/ecodiaos/patterns/corazon-puppeteer-first-use.md`
- `~/ecodiaos/patterns/websearch-via-corazon-residential-ip-when-vps-bot-blocked.md`
- `~/ecodiaos/patterns/visual-verify-is-the-merge-gate-not-tate-review.md`
- `~/ecodiaos/patterns/corazon-is-a-peer-not-a-browser-via-http.md`

The `tailscale_ip` field is the operational truth-source for the Corazon address; `agent_port` is 7456.

## Replaceable by macro?

No - this IS the macro layer's bootstrap auth. Cannot self-bootstrap. Without the token, no tool on Corazon is reachable.

## Rotation

On-leak-only.

## Restoration if lost

1. Either Tate physically uses Corazon, or someone with another auth path into the machine, regenerates a token.
2. The agent install script on Corazon (`~/ecodiaos/scripts/laptop-agent-staging/install.ps1` or whatever the current installer is) re-issues a token; `pm2 restart eos-laptop-agent` makes it live.
3. UPSERT `creds.laptop_agent.agent_token` with the new value.

If the Tailscale IP changes (rare - only if Tate re-joins the laptop to Tailscale fresh), update `tailscale_ip` too.

## Failure mode if missing

- All Corazon work blocked.
- Visual verify gates fail.
- Cred-fetch macros (Apple, Canva, etc.) blocked.
- Any client app GUI smoke test fails.

The PM2 process `eos-laptop-agent` is supposed to ALWAYS be running when the laptop is powered on (auto-start on boot). If `/api/health` returns nothing, the laptop is off OR the agent crashed; investigate before assuming the token is stale.
