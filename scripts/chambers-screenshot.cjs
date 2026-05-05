/**
 * Visual verification screenshots for Chambers F3-redo.
 * Captures the surfaces named in the brief verify checklist.
 */
const puppeteer = require('puppeteer');
const path = require('path');

const OUT = process.env.OUT_DIR || '/home/tate/ecodiaos/drafts/chambers-f3-redo-screenshots';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const targets = [
    { url: '/', name: '01-home' },
    { url: '/events', name: '02-events-list' },
    { url: '/admin/events', name: '03-events-admin' },
    { url: '/signin', name: '04-signin' },
  ];

  for (const t of targets) {
    const url = `${BASE}${t.url}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    } catch (e) {
      console.log(`navigate ${url} timeout (continuing)`);
    }
    await new Promise((r) => setTimeout(r, 500));
    const file = path.join(OUT, `${t.name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`captured ${file}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
