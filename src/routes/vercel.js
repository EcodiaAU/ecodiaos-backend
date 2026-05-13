const express = require('express')
const router = express.Router()
const auth = require('../middleware/auth')
const vercelService = require('../services/vercelService')

router.use(auth)

// GET /api/vercel/projects
router.get('/projects', async (_req, res, next) => {
  try {
    const projects = await vercelService.getProjects()
    res.json(projects)
  } catch (err) { next(err) }
})

// GET /api/vercel/deployments
router.get('/deployments', async (req, res, next) => {
  try {
    const { projectId, state, limit } = req.query
    const deployments = await vercelService.getDeployments({
      projectId, state, limit: parseInt(limit) || 30,
    })
    res.json(deployments)
  } catch (err) { next(err) }
})

// GET /api/vercel/deployments/:id/logs
router.get('/deployments/:id/logs', async (req, res, next) => {
  try {
    const logs = await vercelService.getBuildLogs(req.params.id)
    res.json(logs)
  } catch (err) { next(err) }
})

// GET /api/vercel/recent - last 8 deployments across all projects for Ship Board panel
// Phase 4 dashboard (fork_mp3pkavh_12c438)
router.get('/recent', async (_req, res, next) => {
  try {
    const rows = await vercelService.getDeployments({ limit: 8 })
    res.json({
      deploys: rows.map((d) => ({
        vercel_deployment_id: d.vercel_deployment_id,
        project_name:         d.project_name ?? 'unknown',
        url:                  d.url ?? null,
        state:                d.state ?? 'UNKNOWN',
        created_at:           d.created_at ? new Date(d.created_at).toISOString() : null,
        git_commit_sha:       d.git_commit_sha ? String(d.git_commit_sha).slice(0, 7) : null,
        git_commit_message:   d.git_commit_message ?? null,
      })),
    })
  } catch (err) { next(err) }
})

// GET /api/vercel/stats
router.get('/stats', async (_req, res, next) => {
  try {
    const stats = await vercelService.getStats()
    res.json(stats)
  } catch (err) { next(err) }
})

module.exports = router
