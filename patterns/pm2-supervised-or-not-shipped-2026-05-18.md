---
name: pm2-supervised-or-not-shipped-2026-05-18
description: Any local Corazon daemon (listener-tier, idle-loop, watchdog, eos-laptop-agent) is "shipped" only after pm2 save && pm2 startup registration. Code-on-disk plus manual-start is dormant, not shipped.
triggers: pm2-supervised, pm2-shipped, listener-tier-dormant, pm2-save, pm2-startup, daemon-supervision, code-on-disk-not-running, dormant-daemon, eos-laptop-agent, refresh-clobber-watchdog, usage-poller, laptop-hands, ship-vs-dormant, daemon-must-survive-reboot, pm2-takeover
status: active
---

# PM2-supervised or not shipped (Corazon-local daemons)

A local Corazon daemon (Node service, file watcher, timer loop, listener) is "shipped" only after BOTH:

1. **It is registered under PM2** (`pm2 start <ecosystem.config.js entry>` or `pm2 start <path> --name <name>`), AND
2. **The PM2 process list is persisted** (`pm2 save`), AND
3. **PM2 itself survives reboot** (`pm2 startup` configured, Windows Task Scheduler entry registered).

Code-on-disk plus manual-start (`node listener-tier/runner.js` from a terminal) is **dormant, not shipped**. The first laptop reboot kills it. The doctrine docs claim "running" but the substrate claims "not running."

## The rule

For any Corazon-local daemon:

- **Before merging the daemon code**, write or update an entry in `ecosystem.config.js` (or equivalent).
- **Before marking the status_board row "shipped"**, run `pm2 start` + `pm2 save` and verify `pm2 list` shows it ONLINE.
- **Before declaring "survives reboot"**, restart Corazon (or simulate via PM2 daemon stop/start) and verify the daemon comes back up.

The status_board row "next_action" for shipping a new daemon MUST include the PM2 registration step explicitly. Not just "wire the listener" but "wire the listener, add to ecosystem.config.js, pm2 start, pm2 save, verify."

## Why

Audit 2026-05-18 ambient-OS lane:

- **listener-tier** - code on disk at `backend/listener-tier/runner.js` with `ecosystem.local.config.js` ready. PM2 had zero registration. Every entry in `registry.json` had `last_fired_ts: null, fire_count: 0`. The blocker was literally one command. The reason it stayed dark for days: nobody ran `pm2 start ... && pm2 save`, and no skill/cron nagged about it. **SHIPPED 2026-05-18: pm2 start + pm2 save executed, listener-tier now ONLINE with 2 listeners watching backend/patterns/*.md and backend/.git/refs/heads/**.**
- **eos-laptop-agent** - running but standalone (port 7456). Not under PM2. Survived a Corazon reboot only because Tate manually relaunches it. (Has a PM2 entry that was thrashing on EADDRINUSE; 2026-05-18 stopped the thrash, standalone keeps serving while PM2 takeover is sequenced.)
- **usage-poller** + **refresh-clobber-watchdog** - under PM2 today, online.
- **laptop-hands (port 7800)** - worse: returns `{"error":"Not found"}`, which means *something* is bound to that port (probably half-dead) and the visual regression registry thinks it's working.

The compounding harm: every daemon assumed live by some other piece of code is actually dormant. Cascade fails on first reboot.

PM2 is not the only valid supervisor; Windows Task Scheduler, NSSM-as-service, node-windows all work. The rule is "**something** persistent supervises, with verifiable restart-on-crash and reboot survival." PM2 is the current default because we already use it.

## How to apply

**Standard daemon-ship checklist:**

```
- [ ] Daemon code at <path>
- [ ] Entry in ecosystem.config.js with `name`, `script`, `cwd`, `env`, `restart_delay`, `max_restarts`
- [ ] `pm2 start ecosystem.config.js --only <name>` then verify ONLINE in `pm2 list`
- [ ] `pm2 save`
- [ ] If first daemon on machine: `pm2 startup` + register the resulting command in Windows
- [ ] Simulate restart: `pm2 stop <name> && pm2 start <name>` then verify clean recovery
- [ ] Bonus: register an external watchdog (HTTP /health probe) that flags if the daemon goes ONLINE-to-STOPPED for >5 min
```

**For existing dormant daemons (Wave 1 priority):**

```powershell
pm2 start D:/.code/EcodiaOS/backend/listener-tier/ecosystem.local.config.js
pm2 save
pm2 startup  # follow returned command if first time
pm2 list  # verify all online
```

Then audit the existing landscape:

```powershell
pm2 list  # what's actually supervised
# Compare against the daemon list in CLAUDE.md / drafts/p3-followup-pm2-supervision-2026-05-18.md
# Anything in the doctrine list NOT in pm2 list = dormant
```

## Verification

For each daemon claimed "live" in any doctrine doc, status_board row, or CLAUDE.md section:

- `pm2 describe <name>` returns `status: online`.
- HTTP `/health` (if applicable) returns OK.
- Last restart timestamp matches expected (recent reboot or never).

If any of those fail, the daemon is dormant. Either ship it properly or rewrite the doctrine to say it's dormant.

## Origin

Audit 2026-05-18 found 4 load-bearing Corazon daemons unsupervised (listener-tier dead, eos-laptop-agent standalone, usage-poller standalone, refresh-clobber-watchdog standalone) plus laptop-hands port-bound to something dead. The fix is mechanical (one command per daemon) but the recurrence pattern is doctrinal: code on disk gets treated as shipped because no rule says otherwise. Codifying.

## Cross-refs

- [[p3-followup-pm2-supervision-2026-05-18]] (the draft doc that surfaced this; consider promoting that draft to a status_board row)
- [[verify-deployed-state-against-narrated-state]]
- [[pm2-list-is-not-definitive-liveness-probe-on-corazon-2026-05-17]] (the inverse: `pm2 list` empty doesn't mean nothing's running; this pattern is "running unsupervised doesn't mean shipped")
- [[cron-must-be-registered-not-just-documented-2026-05-18]] (sibling rule, sibling failure mode)
- [[narration-vs-disk-reconciliation-checklist]]
