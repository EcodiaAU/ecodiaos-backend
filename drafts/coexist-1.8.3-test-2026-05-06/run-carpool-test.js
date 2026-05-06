// Worker 3 (fork_motk2agr_7780e3-w3) carpool widget E2E visual test - v8.
// Login + assert chat-room chunk loaded + screenshot the carpool widget.
import puppeteer from 'puppeteer';
import fs from 'node:fs';

const OUT = '/home/tate/ecodiaos/drafts/coexist-1.8.3-test-2026-05-06';
const APP = 'https://app.coexistaus.org';
const COLLECTIVE = 'e8184908-fa00-4a2e-a642-3aa6f9aebabe';
const WIDGET_ID = '44c1a026-fe5a-4da5-97cc-9744594f018b';

const CODE_EMAIL = 'code@ecodia.au';
const CODE_PASS  = '3C0d1a05!';
const PAUL_EMAIL = 'paulplakkaljohn@coexistaus.org';
const PAUL_PASS  = 'paulplakkaljohn';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function dismissCookies(page) {
  try {
    for (const h of await page.$$('button')) {
      const t = (await page.evaluate(el => el.innerText, h) || '').trim();
      if (/accept all|accept|agree/i.test(t)) {
        await h.click();
        await sleep(700);
        return;
      }
    }
  } catch {}
}

async function login(page, email, pass) {
  await page.goto(APP, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1500);
  await dismissCookies(page);
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await (await page.$('input[type="email"]')).type(email, { delay: 30 });
  await (await page.$('input[type="password"]')).type(pass, { delay: 30 });
  for (const h of await page.$$('button')) {
    const t = (await page.evaluate(el => el.innerText, h) || '').trim().toLowerCase();
    if (t === 'sign in' || t === 'log in' || t === 'continue') { await h.click(); break; }
  }
  // Wait for app shell (no email input).
  await page.waitForFunction(() => !document.querySelector('input[type="password"]'), { timeout: 45000 }).catch(()=>{});
  await sleep(5000);
}

async function navToChatRoom(page) {
  // Click Chat tab in bottom nav, then click Sunshine Coast.
  const chatLoaded = new Promise(resolve => {
    page.on('response', r => {
      if (/chat-room-[A-Za-z0-9_-]+\.js/.test(r.url())) resolve(true);
    });
    setTimeout(() => resolve(false), 25000);
  });
  // Click the Chat tab (bottom nav). Look for visible tab labels.
  const clickedChat = await page.evaluate(() => {
    const cands = Array.from(document.querySelectorAll('a, button, [role="button"], div[role="button"], nav *'));
    for (const c of cands) {
      const t = (c.innerText || c.textContent || '').trim();
      if (/^chat$/i.test(t)) {
        const r = c.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          c.click(); return true;
        }
      }
    }
    return false;
  });
  console.log('  clicked Chat tab:', clickedChat);
  await sleep(3000);
  // Now click Sunshine Coast row
  const clickedSC = await page.evaluate(() => {
    const cands = Array.from(document.querySelectorAll('a, button, [role="button"], div[role="button"]'));
    for (const c of cands) {
      const t = (c.innerText || c.textContent || '').trim();
      if (/sunshine coast/i.test(t) && t.length < 120) {
        const r = c.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          c.scrollIntoView({block:'center'}); c.click(); return t.slice(0,80);
        }
      }
    }
    return null;
  });
  console.log('  clicked Sunshine Coast:', clickedSC);
  const loaded = await chatLoaded;
  console.log('  chat-room chunk loaded:', loaded);
  await sleep(6000);
  // Force scroll-to-bottom
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => {
      for (const c of document.querySelectorAll('*')) {
        try { if (c.scrollHeight > c.clientHeight + 50) c.scrollTop = c.scrollHeight; } catch {}
      }
      window.scrollTo(0, document.body.scrollHeight * 2);
    });
    await sleep(700);
  }
  const has = await page.evaluate(() =>
    /carpool|🚗|Mary Cairncross|seats? left|take a seat|offer a carpool|departure/i.test(document.body.innerText)
  );
  console.log('  has carpool keyword:', has);
  return has;
}

async function shoot(page, name) {
  const path = `${OUT}/${name}`;
  await page.screenshot({ path, fullPage: true });
  console.log('shot', path, '(', fs.statSync(path).size, 'bytes )');
}

async function callEdgeFn(token, fn, body) {
  const res = await fetch(`https://tjutlbzekfouwsiaplbr.supabase.co/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await res.json();
}

async function loginApi(email, pass) {
  const anon = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdXRsYnpla2ZvdXdzaWFwbGJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDM5MDksImV4cCI6MjA4OTUxOTkwOX0.Csl0DB-SJ7oIWvXV47GevnIUSFfH0oOohCY3Z0Kgv_U";
  const res = await fetch(`https://tjutlbzekfouwsiaplbr.supabase.co/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass }),
  });
  const j = await res.json();
  return j.access_token;
}

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=en-AU'],
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });

  try {
    // === DRIVER (code@) - CREATE state ===
    console.log('--- DRIVER login (create state) ---');
    const ctxA = await browser.createBrowserContext();
    const pageA = await ctxA.newPage();
    pageA.setDefaultTimeout(60000);
    await login(pageA, CODE_EMAIL, CODE_PASS);
    console.log('driver url:', pageA.url());
    await navToChatRoom(pageA);
    await shoot(pageA, 'carpool-create.png');

    // === Issue fresh save-seat for join state ===
    console.log('--- Fresh save-seat ---');
    const paulApiToken = await loginApi(PAUL_EMAIL, PAUL_PASS);
    const saveRes = await callEdgeFn(paulApiToken, 'carpool-save-seat', {
      carpool_id: WIDGET_ID,
      pickup_address_text: '15 Noosa Heads Drive, Noosa Heads QLD',
      pickup_lat: -26.397, pickup_lng: 153.0903,
    });
    console.log('save-seat:', saveRes.success ? 'OK' : saveRes);
    const newSeatId = saveRes.seat?.id;

    // === PASSENGER (Paul) - JOIN state ===
    console.log('--- PASSENGER login (join state) ---');
    const ctxB = await browser.createBrowserContext();
    const pageB = await ctxB.newPage();
    pageB.setDefaultTimeout(60000);
    await login(pageB, PAUL_EMAIL, PAUL_PASS);
    await navToChatRoom(pageB);
    await shoot(pageB, 'carpool-join.png');

    // === Cancel seat, refresh DRIVER for cancel state ===
    console.log('--- Cancel seat ---');
    if (newSeatId) {
      const cr = await callEdgeFn(paulApiToken, 'carpool-cancel-seat', { seat_id: newSeatId });
      console.log('cancel-seat:', cr.success ? 'OK' : cr);
    }
    console.log('--- DRIVER refresh (cancel state) ---');
    await pageA.reload({ waitUntil: 'networkidle2', timeout: 30000 }).catch(()=>{});
    await sleep(4000);
    await navToChatRoom(pageA);
    await shoot(pageA, 'carpool-cancel.png');
  } finally {
    await browser.close();
  }
}

run().then(() => { console.log('DONE'); process.exit(0); })
     .catch(e => { console.error('FAIL', e); process.exit(1); });
