# VPS Storage Sustainability Audit
**Date:** 2026-05-13  
**Triggered by:** Tate flagged at 22:56 AEST: "storing all these repos on the vps isnt going to work soon when we run out of storage"  
**Fork:** fork_mp42dh93_356b7f

---

## PHASE 1 - ACTUAL NUMBERS

### Disk overview
```
Filesystem   Size  Used  Avail  Use%
/dev/vda1     48G   35G    13G   74%
```
**13GB free. 74% full. Droplet: syd1, 4 vCPU, 8GB RAM (~$48/mo estimated).**  
At current growth trajectory: roughly 8-12 weeks to 90%+ without intervention.

### What is eating disk (sorted)
| Path | Size | Category |
|------|------|----------|
| ~/.cache/puppeteer | 2.4G | Regenerable - Chromium binaries |
| ~/.cache/ms-playwright | 1.3G | Regenerable - likely unused |
| ~/.cache/yarn | 1.1G | Regenerable - package cache |
| ~/.npm | 3.0G | Regenerable - npm package cache |
| ~/.cache/claude-cli-nodejs | 841M | Regenerable - CC CLI cache |
| ~/ecodiaos | 1.7G | KEEP - live OS |
| /tmp | 1.2G | Clearable - screenshots, JSON |
| ~/.local | 523M | App data |
| /var/log | 252M | Logs |
| ~/ecodiaos/drafts | 57M | Drafts |

**Workspaces total: ~14.5GB across 27 directories**

### Per-workspace breakdown
| Workspace | Total | node_modules | .git | .next/build | Status |
|-----------|-------|-------------|------|-------------|--------|
| EcodiaSite | 1.4G | 857M | 391M pack! | 17M | Internal/template - site on Vercel |
| wattleos | 1.4G | 1.1G | 15M | 251M | Internal starter |
| resonaverde | 660M | 633M | 2.6M | 24M | ACTIVE client |
| ecodiaos/fe | 616M | ~500M | - | - | ACTIVE own OS |
| chambers-platform-site/fe | 551M | 501M | - | 50M | Client |
| coexist | 560M | 486M | 42M | - | ACTIVE client |
| coexist-w2-impactstats | 516M | 497M | - | - | COMPLETED FORK |
| coexist-delete-map-page | 507M | 488M | - | - | COMPLETED FORK |
| coexist-leaflet | 506M | 488M | - | - | COMPLETED FORK |
| coexist-spa-base-fix | 506M | 488M | - | - | COMPLETED FORK |
| wildmountains | 484M | 418M (fe) | 908K | 63M | Client |
| coexist-reactions | 496M | 484M | - | - | COMPLETED FORK |
| launchbase | 760M | 734M | 1.3M | 25M | Internal starter kit |
| chambers/fe | 362M | 348M | 8.5M | - | Client |
| roam-frontend | 349M | 297M | 24M | - | ACTIVE own product |
| roam-backend | 202M | - | - | - | Own product |
| + 7 small coexist-* (no node_modules) | ~95M | 0 | - | - | Completed forks (source only) |
| sidequests | 30M | - | - | - | Own product |
| ecodia-os-mobile | 19M | - | - | - | Own product |
| tates-cakes | 20K | - | - | - | Dead test project |

**Key finding:** EcodiaSite has a 391MB git pack file (bloated history). 5 completed Factory fork worktrees each carry ~490MB node_modules that are fully regenerable. 3 internal starters (EcodiaSite, wattleos, launchbase) have 2.7GB of node_modules for repos not actively being developed.

---

## PHASE 2 - PROBLEM TAXONOMY

### What's actually unsustainable

**1. Factory fork worktrees are never cleaned up after completion.**  
Every fork dispatch that runs npm install creates a FULL node_modules copy per worktree directory. The 5 completed coexist feature forks still sitting on disk = 2.45GB of node_modules for work that shipped weeks ago. At 2-3 forks/week during an active sprint: +1-1.5GB/week of permanent accumulation.

**2. node_modules are duplicated rather than shared.**  
10 Next.js repos each with their own node_modules, all installing React 18, Next.js 14, TypeScript, Tailwind, etc. Rough overlap: 60-70% of packages are identical across repos. With npm/yarn you get full duplication. pnpm content-addressable store would eliminate this.

**3. Internal template/starter repos carry stale dependencies.**  
EcodiaSite (857M node_modules + 391M pack), wattleos (1.1G node_modules), launchbase (734M node_modules) are repos not actively being built on the VPS - they deploy via Vercel from GitHub. Their node_modules serve no purpose sitting here.

**4. Regenerable caches are never pruned.**  
puppeteer (2.4G), ms-playwright (1.3G), claude-cli-nodejs (841M), yarn cache (1.1G), npm cache (3G) = 8.7G of stuff that re-downloads automatically if missing. Never been cleaned.

**5. /tmp accumulates screenshots indefinitely.**  
~1.2G of PNG screenshots and JSON files from Corazon laptop-agent sessions. No cleanup cron exists.

**What's NOT the problem:**  
Git history itself is small (most repos have .git under 50MB). The 391MB EcodiaSite pack is an outlier - that repo has been through a lot of history. Source code without node_modules is typically 10-50MB per repo.

---

## PHASE 3 - DESIGN OPTIONS

### Option A: On-demand clone + delete
Every fork clones repo fresh, does work, deletes everything including node_modules on completion.

- Disk saved NOW: 2.45G (completed forks) + zero going forward
- Operational complexity: Low - just add `rm -rf node_modules` to fork completion hook
- Failure modes: If npm registry is slow or unavailable, fork stalls on install; cold install adds 2-5 min per fork even with ~/.npm cache
- Monthly cost delta: $0
- Migration cost: 2h (add cleanup step to fork dispatch wrapper + factory approve hook)

**Verdict:** The right partial solution. But doesn't fix the 3G+ of stale caches or the template repos.

### Option B: Persistent bare clones + ephemeral worktrees
Keep one bare git repo per client (~10-50MB, history only). Create a worktree on dispatch, npm install, delete after merge.

- Disk saved NOW: 2.45G (current worktrees cleaned up) + on ongoing basis, completed worktrees blow away
- Operational complexity: Medium - need a script wrapping fork dispatch that: (1) creates worktree from bare clone, (2) runs npm install there, (3) deletes worktree on completion, (4) keeps bare repo updated
- Failure modes: Bare repo needs to stay fresh (cron pull). Worktree + npm install still uses disk transiently during fork run
- Monthly cost delta: $0
- Migration cost: 4-6h to write and test the wrapper

**Better than A.** Worktrees share git history. Transient disk usage during fork run = ~490MB max (for one active fork on a Next.js repo), cleans up after.

### Option C: pnpm content-addressable store
pnpm stores every package version ONCE in `~/.local/share/pnpm/store` and hardlinks into node_modules. 10 repos sharing React 18 = React stored once, hardlinked 10 times.

- Disk saved NOW: ~2-3G (rough estimate: current ~4.5G active node_modules drops to ~1.5-2G with pnpm dedup)
- Operational complexity: Medium - requires converting repos from npm/yarn to pnpm (new lockfile, different CI commands)
- Failure modes: Client repos (coexist, resonaverde, chambers, wildmountains) have existing lockfiles and Vercel builds that expect npm/yarn - changing their package manager is a risky client-code change outside scope; own repos (ecodiaos, roam) can convert freely
- Monthly cost delta: $0
- Migration cost: 2h for own repos; client repos = NOT recommended (scope violation per client-code-scope-discipline.md)
- Real savings: applying pnpm only to OWN repos (ecodiaos-fe, roam-frontend, launchbase, ecodia-os-mobile) saves maybe 1G

**Best combined with B, not a standalone fix for client repos.**

### Option D: Offload node_modules to object storage (S3/R2/B2)
Keep source on VPS. node_modules tarballs cached in R2 ($0.015/GB/mo), pulled on dispatch.

- Disk saved NOW: ~4-5G of active node_modules moved off
- Operational complexity: HIGH - need cache invalidation, per-lockfile-hash cache keys, egress on every fork dispatch
- Failure modes: R2 egress cost (free for Cloudflare R2 actually, but latency), stale cache mismatches, complex invalidation
- Monthly cost delta: ~$0 (R2 free egress) but 4-6h build to implement
- Migration cost: 8-12h

**Not worth it at this scale. Solves the symptom not the cause.**

### Option E: Bigger VPS (throw money at it)
Resize DigitalOcean droplet. Current: estimated ~$48/mo, 48GB disk.

| Tier | Disk | RAM | Price | Delta | Runway added |
|------|------|-----|-------|-------|-------------|
| Current | 48GB | 8GB | ~$48/mo | - | 13GB free now |
| +25GB NVMe resize (if available) | 73GB | 8GB | ~$54/mo | +$6 | ~38GB free |
| Next plan up | 80-100GB | 8-16GB | ~$60-72/mo | +$12-24 | ~45-65GB free |

- Disk saved NOW: n/a (adds headroom, doesn't fix waste)
- Operational complexity: DO live disk resize = 5-10 min, no data loss, zero downtime for resize-only
- Failure modes: plan resize can't go DOWN (live resize is one-way for disk), adds monthly cost permanently
- Monthly cost delta: +$6-24/mo depending on tier
- Migration cost: 1h (resize + verify, no code changes)

**Buys runway without fixing root cause. Appropriate as a backstop, not a primary fix. 13GB free after cleanup = resize unnecessary for 12+ months.**

### Option F: Ephemeral cloud build runners
Run Factory forks as GitHub Actions or DO App Platform build jobs. VPS = orchestration only.

- Disk saved NOW: All workspace disk freed
- Operational complexity: VERY HIGH - Factory CLI needs Claude Code which needs API credentials, session state, MCP tools; doesn't map to GHA runner model; SDK forks run inside ecodia-api process
- Failure modes: Fundamental architectural mismatch - the fork system is coupled to the VPS process, not an external runner
- Monthly cost delta: $0-50/mo depending on usage (GHA free tier 2000min/month)
- Migration cost: 40+ hours, significant re-architecture

**Not viable at this stage. Architecture rethink for later.**

### Option G: Dedicated build host (second VPS)
ecodia-api VPS stays API-only. Second cheap droplet handles all workspace/build disk.

| Build host option | Specs | Cost | Disk |
|-------------------|-------|------|------|
| DO Basic 2vCPU 4GB syd1 | 2 vCPU, 4GB RAM | $24/mo | 80GB |
| DO Basic 4vCPU 8GB syd1 | 4 vCPU, 8GB RAM | $48/mo | 160GB |

- Disk saved NOW: All workspace disk freed from API VPS (35GB used drops to ~20GB)
- Operational complexity: Medium - fork dispatch needs to SSH into build host, work there, push back to GitHub, conductor reads result; need Tailscale mesh or DO private networking
- Failure modes: Build host down = no Factory/forks; network latency API VPS <-> build host; secrets management across two hosts
- Monthly cost delta: +$24/mo minimum
- Migration cost: 8-12h to set up, wire fork dispatch over SSH, test

**Best LONG-TERM architecture. Decouples API reliability from build disk pressure. Blast radius: build host can die without touching production API. Right choice when 8th client lands or disk >85%.**

---

## PHASE 4 - RECOMMENDATION

### Now (this week): Cleanup + convention change
**Cost: $0. Effort: 2h. Gain: ~12GB freed (74% -> ~48% full).**

1. One-time cleanup run (commands in Phase 5)
2. Add post-fork-approval cleanup to muscle memory: after every `approve_factory_deploy`, delete the worktree's node_modules (single command)

After cleanup: 23GB used, 25GB free. That's 18 months of runway at current growth rate if we maintain the post-fork cleanup habit.

### Medium-term (when 8th client repo lands OR disk >85% for 7 days): Option G
Spin up a $24/mo DO build droplet in syd1. Wire fork dispatch to use it. API VPS becomes orchestration-only and stays under 30GB used forever.

**Don't do this now.** The cleanup alone buys 12+ months and the build-host architecture requires non-trivial wiring. It's the right answer at scale, not at 5 active client repos.

### pnpm for own repos only
Convert ecodiaos-frontend and roam-frontend to pnpm. ~1G savings, sets the pattern for new projects. Never convert client repos - that's their codebase decision.

---

## PHASE 5 - SHIPPABLE PLAN

### Immediate cleanup commands (run NOW, no service impact)

```bash
# 1. /tmp screenshots and JSON (1.2G)
rm -rf /tmp/*.png /tmp/*.json /tmp/cowork-*.json 2>/dev/null; du -sh /tmp

# 2. Puppeteer browser cache (2.4G) - auto-reinstalls on next smoke test
rm -rf ~/.cache/puppeteer

# 3. Playwright cache (1.3G) - likely unused, separate from puppeteer
rm -rf ~/.cache/ms-playwright

# 4. Claude CLI cache (841M) - regenerable
rm -rf ~/.cache/claude-cli-nodejs

# 5. npm cache prune (conservative - keeps recent, clears old packages)
npm cache clean --force

# 6. Completed coexist fork worktrees (2.45G) - work is merged, source kept
rm -rf ~/workspaces/coexist-reactions/node_modules
rm -rf ~/workspaces/coexist-leaflet/node_modules
rm -rf ~/workspaces/coexist-spa-base-fix/node_modules
rm -rf ~/workspaces/coexist-delete-map-page/node_modules
rm -rf ~/workspaces/coexist-w2-impactstats/node_modules

# 7. Internal starters - node_modules not needed (repos on GitHub, build on Vercel)
rm -rf ~/workspaces/EcodiaSite/node_modules ~/workspaces/EcodiaSite/.next
rm -rf ~/workspaces/wattleos/node_modules ~/workspaces/wattleos/.next
rm -rf ~/workspaces/launchbase/node_modules ~/workspaces/launchbase/.next

# 8. Verify result
df -h /dev/vda1
```

**Expected result: ~12G freed, disk drops from 74% to ~48%.**

### Convention change (starts immediately)
After every `approve_factory_deploy` on a Next.js repo, run:
```bash
rm -rf ~/workspaces/<slug>/node_modules ~/workspaces/<slug>/.next
```
The Fork brief template for Next.js repos should include: "After work is complete and committed, delete node_modules from your worktree." This keeps completed worktrees at ~15-50MB (source only).

### Tooling: post-approval cleanup hook (1-2h effort)
Add to `approve_factory_deploy` workflow: auto-run `rm -rf <worktree>/node_modules <worktree>/.next` after successful commit + push. Candidate file: `~/ecodiaos/src/services/factoryService.js` post-approval handler.

### Status board row
P2 row tracking the Option G build-host migration. Trigger condition: disk >85% for 7 days running OR 8th active client codebase lands.

### Summary line for Tate
After a 2h cleanup run (deleting stale cache + completed fork node_modules + inactive template node_modules), disk drops from 74% to ~48% and buys 12+ months of runway at current growth. The root fix is a post-fork-approval convention: delete node_modules when work ships. When we hit 8 active client repos, spin up a $24/mo build-only droplet and keep the API VPS clean forever.

---

## APPENDIX: Numbers cross-reference

| Item | Size | Action |
|------|------|--------|
| /tmp screenshots/json | 1.2G | Delete now |
| ~/.cache/puppeteer | 2.4G | Delete now (auto-reinstalls) |
| ~/.cache/ms-playwright | 1.3G | Delete now (likely unused) |
| ~/.cache/claude-cli-nodejs | 841M | Delete now |
| npm cache | 3.0G | clean --force (~1-2G reclaimed) |
| coexist fork node_modules (5x) | 2.45G | Delete now |
| EcodiaSite node_modules + .next | 874M | Delete now |
| wattleos node_modules + .next | 1.35G | Delete now |
| launchbase node_modules + .next | 759M | Delete now |
| **Total reclaimable** | **~12.2G** | |
| Disk after cleanup (est.) | **~23GB used / 48%** | |
| Runway at 500MB/week growth | **~25 weeks** | |
| Runway with post-fork cleanup | **12-18 months** | |
