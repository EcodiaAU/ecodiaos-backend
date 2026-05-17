# P2: Fire-shim webhook routes not committed to git

**Severity:** P2 - fresh deploys broken (VPS running fine from local files)
**Detected:** 2026-05-17 by meta-loop routine
**Blocks:** fresh VPS deploy from git clone, CI, any worktree-based Factory session touching app.js

## What's missing

`src/app.js` requires five files that exist on the VPS but were never committed to git:

```javascript
app.use('/api/webhooks/resend', require('./routes/webhooks/resend-fire-shim'))
app.use('/api/webhooks/stripe-fire', require('./routes/webhooks/stripe-fire-shim'))
app.use('/api/webhooks/vercel-fire', require('./routes/webhooks/vercel-fire-shim'))
app.use('/api/webhooks/github-fire', require('./routes/webhooks/github-fire-shim'))
app.use('/api/webhooks/apple-asn', require('./routes/webhooks/apple-asn-fire-shim'))
```

Running `node src/app.js` from a fresh git clone crashes immediately:
```
Error: Cannot find module './routes/webhooks/resend-fire-shim'
```

These files were documented as "Uncommitted" in docs/REFLEX_SUBSTRATE_SESSION_2026-05-16.md:
> "src/routes/webhooks/_fireShimHelpers.js (small edit). [...] Uncommitted."

The Lane D architecture comment in app.js also references a wider spec:
> "See backend/patterns/webhook-fire-shim-architecture-2026-05-15.md"

## Action needed

**Option A (preferred):** SSH to VPS, `cat ~/ecodiaos/src/routes/webhooks/{resend,stripe-fire,vercel-fire,github-fire,apple-asn-fire}-shim.js` and commit them. These are live production files - committing them closes the git-vs-VPS drift.

**Option B (risk mitigation fallback):** Until Option A is done, wrap each require in a graceful-absence guard:

```javascript
function tryRequireShim(path) {
  try { return require(path) } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') return null
    throw e
  }
}
const resendShim = tryRequireShim('./routes/webhooks/resend-fire-shim')
if (resendShim) app.use('/api/webhooks/resend', resendShim)
// etc.
```

Option B lets Factory sessions run without crashing, but the shim endpoints would silently 404 if deployed without the files. Option A is the clean fix.

## Discovery context

Found during security scan after fixing `scripts/sy094-ssh.py` hardcoded credential. The git-vs-VPS drift is a wider pattern - see `~/ecodiaos/patterns/verify-deployed-state-against-narrated-state.md`. The VPS running EcodiaOS backend is the authoritative source; git is supposed to mirror it, not diverge from it.

## Priority logic

P2 (not P1) because:
- VPS is running correctly with the files locally
- This branch (`claude/beautiful-tesla-nvK9r`) has not been merged to main yet
- Factory sessions are using worktrees, which might still crash without the files

Next action: Factory session on VPS with access to `~/ecodiaos/src/routes/webhooks/` to commit the missing files.
