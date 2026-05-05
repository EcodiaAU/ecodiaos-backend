// Debug variant that captures console + network errors so we can see
// why the page renders blank.
const puppeteer = require('/home/tate/ecodiaos/node_modules/puppeteer')

;(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage()
  page.on('console', (msg) => console.log(`[browser ${msg.type()}]`, msg.text()))
  page.on('pageerror', (err) => console.log('[pageerror]', err.message))
  page.on('requestfailed', (r) => console.log('[reqfail]', r.url(), r.failure()?.errorText))
  await page.setViewport({ width: 1280, height: 900 })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 30000 })
  await new Promise((r) => setTimeout(r, 3500))
  const html = await page.content()
  console.log('--- BODY innerHTML head ---')
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)
  if (bodyMatch) console.log(bodyMatch[1].slice(0, 2000))
  await browser.close()
})()
