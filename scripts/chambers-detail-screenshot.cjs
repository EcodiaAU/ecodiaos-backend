/**
 * Drill into a past event from the Events list to capture EventDetail.
 */
const puppeteer = require('puppeteer');
const path = require('path');

const OUT = '/home/tate/ecodiaos/drafts/chambers-f3-redo-screenshots';
const BASE = 'http://127.0.0.1:4173';

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  await page.goto(`${BASE}/events`, { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise((r) => setTimeout(r, 600));

  // Expand past events
  try {
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const past = btns.find((b) => /past/i.test(b.textContent || ''));
      if (past) past.click();
    });
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: path.join(OUT, '05-events-list-past-expanded.png') });
    console.log('captured past-expanded');
  } catch (e) {
    console.log('past expand failed', e.message);
  }

  // Click first event card to drill into EventDetail
  const eventLinks = await page.$$('a[href^="/events/"]');
  for (const link of eventLinks) {
    const href = await page.evaluate((el) => el.getAttribute('href'), link);
    if (href && href !== '/events' && href.startsWith('/events/')) {
      await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle2', timeout: 15000 });
      await new Promise((r) => setTimeout(r, 800));
      await page.screenshot({ path: path.join(OUT, '06-event-detail.png'), fullPage: true });
      console.log(`captured event-detail for ${href}`);
      break;
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
