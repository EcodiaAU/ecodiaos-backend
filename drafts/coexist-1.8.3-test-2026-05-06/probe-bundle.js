// Probe what JS chunks actually load when navigating to /chat/<collective>
import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 390, height: 844 },
  });
  const page = await browser.newPage();
  const chunks = new Set();
  page.on('response', r => {
    const u = r.url();
    if (/\.js(\?|$)/.test(u) && /coexistaus|app\.coexist/i.test(u)) chunks.add(u);
  });
  // Login first
  await page.goto('https://app.coexistaus.org', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1500));
  // Dismiss cookies
  for (const b of await page.$$('button')) {
    const t = (await page.evaluate(el => el.innerText, b) || '').trim();
    if (/accept all/i.test(t)) { await b.click(); break; }
  }
  await page.waitForSelector('input[type="email"]');
  await (await page.$('input[type="email"]')).type('code@ecodia.au', { delay: 30 });
  await (await page.$('input[type="password"]')).type('3C0d1a05!', { delay: 30 });
  for (const b of await page.$$('button')) {
    const t = (await page.evaluate(el => el.innerText, b) || '').trim().toLowerCase();
    if (t === 'sign in' || t === 'log in') { await b.click(); break; }
  }
  await new Promise(r => setTimeout(r, 6000));
  // Now /chat/{collective}
  await page.goto('https://app.coexistaus.org/chat/e8184908-fa00-4a2e-a642-3aa6f9aebabe', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 5000));
  console.log('CHUNKS:');
  for (const c of [...chunks].sort()) console.log(' ', c);
  // Capture body text for any carpool reference
  const has = await page.evaluate(() => /carpool|🚗|Mary Cairncross/i.test(document.body.innerText));
  console.log('UI has carpool keyword:', has);
  // List all unique data-testid or visible text elements with 'Sunshine Coast'
  await browser.close();
})();
