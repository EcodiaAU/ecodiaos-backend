---
name: pm2-list-is-not-definitive-liveness-probe-on-corazon-2026-05-17
description: Most Corazon services do not run under PM2 on Windows. An empty `pm2 list` does NOT mean nothing is running. Probe service liveness by direct HTTP `/health` (or the service-specific health endpoint) before claiming anything dead.
triggers: pm2-list-corazon, pm2-empty-corazon, pm2-vs-http-liveness, service-liveness-probe, eos-laptop-agent-status, laptop-hands-status, port-7456, port-7800, corazon-supervisor, supervisor-not-pm2, http-health-probe, liveness-by-port-probe, netstat-port-listening, windows-service-supervision, task-scheduler-vs-pm2, node-windows-service, narrated-vs-running-corazon
metadata:
  type: doctrine
  status: active
  authored_at: 2026-05-17
---

# `pm2 list` is not a definitive liveness probe on Corazon

## The rule

On Corazon (Windows), services may be supervised by **any** of:
- PM2 (often used for Node services that need clustering)
- Windows Task Scheduler (one-shot or recurring scheduled-task supervision)
- node-windows / NSSM service wrappers (true Windows services)
- Plain `node` / Electron processes started at login by a shortcut or AutoHotkey hotstring
- A foreground process started manually by Tate that runs as long as the desktop session is up

`pm2 list` reports on (1) only. Querying it and inferring "empty PM2 list means nothing is running" is a substrate-of-a-substrate error: the answer is true for the substrate I queried, false for the substrate I claimed about.

**Always probe liveness by HTTP**: `curl -sS -m 3 http://127.0.0.1:<port>/health` (or the service-specific health endpoint). Optionally also `netstat -ano | grep ":<port> "` to confirm a process is bound.

## The failure mode this prevents

2026-05-17 cold-start audit. I ran `pm2 list` on Corazon, saw the table header with no rows, and inferred "PM2 empty -> eos-laptop-agent and laptop-hands both not running." I then wrote that into the world-model summary, three new pattern files, an auto-memory reference, the backend CLAUDE.md deprecations table, and a status_board row scoped around "start eos-laptop-agent + laptop-hands + visual-test MCP." Tate caught it with "The eos laptop agent should be online tho?" Direct HTTP probe confirmed:

- **eos-laptop-agent**: alive on port 7456. `HTTP=200`. `uptime: 1184s`. PID 14252. Reachable from both `127.0.0.1` and `100.114.219.69` over Tailscale.
- **laptop-hands**: not running on port 7800. Connection refused.

Mixed truth. The PM2-inference was wrong about the agent and right about laptop-hands by coincidence. Neither service runs under PM2 on Corazon. The right probe was HTTP all along.

This is a special-case of [[world-model-staleness-needs-active-reconciliation-2026-05-17]] - the audit substrate I chose was answering a different question than the one I needed answered. It also illustrates why [[verify-deployed-state-against-narrated-state]] applies to my own world-model claims, not just to ship verification.

## How to apply

**Probe ladder, cheapest first:**
1. **HTTP `/health` (or the documented health endpoint)** to the expected port on `127.0.0.1`. 3s timeout. Most services answer in <100ms.
2. **HTTP `/health` to the Tailscale IP** (`100.114.219.69` for Corazon) if the service is supposed to be remote-reachable. Confirms binding and firewall posture.
3. **`netstat -ano`** filtered to the port. Confirms there's a listening process. Reveals the PID.
4. **`tasklist /FI "PID eq <pid>"`** if the process identity matters.
5. **`pm2 list`** ONLY if you specifically want to know whether the service is under PM2 supervision, not whether it is alive.

## Known Corazon services and their ports

| Service | Default port | Health endpoint | Supervisor |
|---|---|---|---|
| eos-laptop-agent | 7456 | `/api/health` | Not PM2 - directly-started node process |
| laptop-hands | 7800 (`BIND_PORT` env) | `/health` (verify in `src/index.ts`) | TBD (see status_board `dc807fe0`) |
| visual-test MCP | stdio (not HTTP) | n/a - probed via ecodia-full proxy registration | n/a |
| listener-tier daemon | n/a (no HTTP) | reads `backend/listener-tier/registry.json` for last_fired_ts | TBD (see status_board `4521423f`) |
| Claude Code extension hosts | n/a (lockfile presence at `~/.claude/ide/<port>.lock`) | `reflex.list_mouths()` | VS Code / Cursor process tree |

When a new service ships on Corazon, add a row to this table same-turn.

## Anti-patterns

- **"PM2 empty therefore service dead"** - the specific failure mode this pattern names.
- **Probing `/health` only on `127.0.0.1`** when the service is supposed to be Tailscale-reachable. The Tailscale binding is a separate failure surface.
- **Reading `last_fired_ts: null` from a listener registry and inferring "listener dead"** without checking whether the listener was ever started. Could be (a) never started, (b) started but never had a trigger event, or (c) started but trigger pipeline broken.
- **Reading `pm2 logs` for a service that isn't under PM2** and concluding the service has no logs. The service's actual log stream is wherever its console output was redirected (foreground terminal, file, Windows Event Log).
- **Trusting the doctrine claim over the probe** when they disagree. Doctrine drifts; the probe is reality.

## Origin

Tate verbatim 2026-05-17: "The eos laptop agent should be online tho?" - immediately after I had asserted in chat that it wasn't. Probe confirmed agent alive within 30 seconds.

Cross-refs: [[world-model-staleness-needs-active-reconciliation-2026-05-17]], [[verify-deployed-state-against-narrated-state]], [[re-probe-stale-health-check-readings-before-acting-on-cached-alerts]].
