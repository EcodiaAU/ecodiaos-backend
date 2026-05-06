// Profile loading regression test for Co-Exist 1.8.4 batch
// Worker 2.5 fork_motk2agr_7780e3-w2_5
// Read-only diagnostic. NO ship from this.

const puppeteer = require('puppeteer');
const fs = require('fs');

const SR_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqdXRsYnpla2ZvdXdzaWFwbGJyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk0MzkwOSwiZXhwIjoyMDg5NTE5OTA5fQ.3imSt95D3tzgBFJB5GGssFAaNkE57UVW8hGF4sCuwtU";
const SUPA_URL = "https://tjutlbzekfouwsiaplbr.supabase.co";
const APP_URL = "https://app.coexistaus.org";
const EMAIL = "code@ecodia.au";
const PASSWORD = "3C0d1a05!";

const OUT_DIR = '/home/tate/ecodiaos/drafts/coexist-1.8.3-test-2026-05-06';

async function fetchProfilesByPrivacyTier() {
  // Use built-in fetch (Node 22)
  const recentProfiles = await fetch(`${SUPA_URL}/rest/v1/profiles?select=id,display_name,role,is_suspended,onboarding_completed,created_at&order=created_at.desc&limit=20`, {
    headers: { apikey: SR_KEY, Authorization: `Bearer ${SR_KEY}` },
  }).then(r => r.json());
  return recentProfiles;
}

async function captureProfile(page, label, userId) {
  console.log(`[${label}] navigating to /profile/${userId}`);
  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));

  await page.goto(`${APP_URL}/profile/${userId}`, { waitUntil: 'networkidle2', timeout: 30000 });
  // Wait for hydration
  await new Promise(r => setTimeout(r, 5000));

  const screenshotPath = `${OUT_DIR}/profile-loading-regression-${label}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const renderState = await page.evaluate(() => {
    const bodyText = document.body.innerText || '';
    const hasUserNotFound = bodyText.toLowerCase().includes("user not found") || bodyText.toLowerCase().includes("doesn't exist");
    const hasPrivacyNotice = bodyText.toLowerCase().includes("personal details hidden") || bodyText.toLowerCase().includes("redacted");
    const hasDisplayName = !!document.querySelector('h2');
    const hasMemberSince = bodyText.toLowerCase().includes("member since");
    const hasStats = bodyText.toLowerCase().includes("events") && bodyText.toLowerCase().includes("hours");
    return {
      hasUserNotFound,
      hasPrivacyNotice,
      hasDisplayName,
      hasMemberSince,
      hasStats,
      bodyTextSnippet: bodyText.slice(0, 800),
    };
  });

  const pageTitle = await page.title();
  const url = page.url();

  return { label, userId, screenshotPath, pageTitle, url, renderState, consoleMessages: consoleMessages.slice(-15) };
}

async function main() {
  console.log('Step 1: fetch sample profiles from DB');
  const profiles = await fetchProfilesByPrivacyTier();
  console.log(`Got ${profiles.length} profiles. Sample IDs:`, profiles.slice(0, 5).map(p => `${p.id} (${p.display_name})`));

  // Filter for suitable test targets
  const usableProfiles = profiles.filter(p => !p.is_suspended);
  // We will test 3 different other-user profiles since there's no public/private column at profile level
  const otherProfiles = usableProfiles.slice(0, 5);

  console.log('Step 2: launch browser');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  // Capture console errors throughout
  page.on('pageerror', err => console.log('[PAGE-ERROR]', err.message));

  console.log('Step 3: login');
  await page.goto(`${APP_URL}`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  // The login is at /auth/sign-in or similar. Probe.
  const currentUrl = page.url();
  console.log(`After landing: ${currentUrl}`);

  // Try direct sign-in route
  if (!currentUrl.includes('sign-in') && !currentUrl.includes('login')) {
    await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
  }

  await page.screenshot({ path: `${OUT_DIR}/regression-pre-login.png` });

  // Dismiss cookie banner if present
  try {
    const accept = await page.$x("//button[contains(., 'Accept All')]");
    if (accept[0]) {
      await accept[0].click();
      await new Promise(r => setTimeout(r, 800));
    }
  } catch {}
  // Try Reject via querySelector approach
  try {
    const buttons = await page.$$('button');
    for (const b of buttons) {
      const t = await page.evaluate(el => el.innerText, b);
      if (/accept all/i.test(t)) {
        await b.click();
        await new Promise(r => setTimeout(r, 700));
        break;
      }
    }
  } catch {}

  // Try filling in email/password
  try {
    await page.waitForSelector('input[type="email"]', { timeout: 8000 });
    await page.click('input[type="email"]', { clickCount: 3 });
    await page.type('input[type="email"]', EMAIL, { delay: 30 });
    await page.click('input[type="password"]', { clickCount: 3 });
    await page.type('input[type="password"]', PASSWORD, { delay: 30 });
    await page.screenshot({ path: `${OUT_DIR}/regression-login-filled.png` });

    // Find the Log In button (text-based, not type=submit alone)
    const buttons = await page.$$('button');
    let clicked = false;
    for (const b of buttons) {
      const t = await page.evaluate(el => el.innerText, b);
      if (/^log in$/i.test(t.trim()) || /^sign in$/i.test(t.trim())) {
        await b.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) await submitBtn.click();
    }

    await new Promise(r => setTimeout(r, 6000));
    console.log(`After login: ${page.url()}`);
  } catch (e) {
    console.log('Login probe error:', e.message);
  }

  await page.screenshot({ path: `${OUT_DIR}/regression-after-login.png` });

  // Determine our own user ID from cookies/localStorage
  const ownUserId = await page.evaluate(() => {
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.includes('auth')) {
          const v = localStorage.getItem(k);
          try {
            const parsed = JSON.parse(v);
            if (parsed?.user?.id) return parsed.user.id;
            if (parsed?.currentSession?.user?.id) return parsed.currentSession.user.id;
          } catch {}
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  });
  console.log(`Own user ID: ${ownUserId}`);

  // Step 4: capture profile pages
  const results = [];

  // a) Own profile
  if (ownUserId) {
    const r = await captureProfile(page, 'self', ownUserId);
    results.push(r);
  }

  // b) and c) two other profiles
  let labelIdx = 0;
  const labels = ['public', 'private'];
  for (const p of otherProfiles) {
    if (p.id === ownUserId) continue;
    if (labelIdx >= 2) break;
    const r = await captureProfile(page, labels[labelIdx], p.id);
    r.profileMeta = p;
    results.push(r);
    labelIdx++;
  }

  await browser.close();

  // Step 5: write diagnosis
  console.log('\n=== RESULTS ===');
  console.log(JSON.stringify(results, null, 2));

  fs.writeFileSync(`${OUT_DIR}/profile-regression-raw-results.json`, JSON.stringify(results, null, 2));

  return results;
}

main().then(() => {
  console.log('done');
  process.exit(0);
}).catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
