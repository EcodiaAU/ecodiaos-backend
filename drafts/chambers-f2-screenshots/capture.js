// F2 visual evidence capture - drives a headless Chromium against the
// chambers FE dev server on localhost:5173 and snapshots seven anchor
// screens. Each screenshot is the artefact that proves the F2 polish
// landed end-to-end.
//
// Doctrine: ~/ecodiaos/patterns/visual-test-before-push-when-tate-not-around.md
// (Mode A localhost). Saved into ~/ecodiaos/drafts/chambers-f2-screenshots/.

const path = require('path')
const puppeteer = require('/home/tate/ecodiaos/node_modules/puppeteer')

const BASE = process.env.CHAMBERS_BASE_URL || 'http://localhost:5173'
const OUT_DIR = '/home/tate/ecodiaos/drafts/chambers-f2-screenshots'

const screens = [
  { slug: 'home', path: '/', viewport: { width: 1280, height: 900 } },
  { slug: 'home-mobile', path: '/', viewport: { width: 390, height: 844 } },
  { slug: 'events', path: '/events', viewport: { width: 1280, height: 900 } },
  { slug: 'profile', path: '/profile', viewport: { width: 1280, height: 900 } },
  { slug: 'signin', path: '/signin', viewport: { width: 1280, height: 900 } },
  { slug: 'signup', path: '/signup', viewport: { width: 1280, height: 900 } },
  { slug: 'admin-events', path: '/admin/events', viewport: { width: 1280, height: 900 } },
  { slug: 'admin-committees', path: '/admin/committees', viewport: { width: 1280, height: 900 } },
]

;(async () => {
  let browser
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
  } catch (err) {
    console.error('puppeteer.launch failed:', err.message)
    process.exit(1)
  }

  const results = []

  for (const screen of screens) {
    const page = await browser.newPage()
    try {
      await page.setViewport(screen.viewport)
      const url = BASE + screen.path
      console.log(`[capture] ${screen.slug} ${url}`)
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
      // Let the page-transition fade settle + framer-motion stagger run.
      await new Promise((r) => setTimeout(r, 1200))
      const file = path.join(OUT_DIR, `${screen.slug}.png`)
      await page.screenshot({ path: file, fullPage: true })
      results.push({ slug: screen.slug, file, ok: true })
    } catch (err) {
      console.error(`[capture] ${screen.slug} FAILED:`, err.message)
      results.push({ slug: screen.slug, ok: false, error: err.message })
    } finally {
      await page.close()
    }
  }

  await browser.close()

  console.log('\nResults:')
  for (const r of results) {
    console.log(`  ${r.ok ? 'OK ' : 'ERR'}  ${r.slug}${r.ok ? '' : ' - ' + r.error}`)
  }
  const failed = results.filter((r) => !r.ok)
  process.exit(failed.length > 0 ? 1 : 0)
})()
