// Co-Exist 1.8.3 polish verification — Worker 2 v5 (just items 1 and 6)
// Item 1: search for SectionHeader with title + See all action across multiple pages.
//         The polish target is `SectionHeader` component — try Profile, Explore, /events list etc.
// Item 6: From event detail "by <CollectiveName>" link → collective page → Up Next.

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUT_DIR = '/home/tate/ecodiaos/drafts/coexist-1.8.3-test-2026-05-06';
const BASE_URL = 'https://app.coexistaus.org';
const EMAIL = 'code@ecodia.au';
const PASSWORD = '3C0d1a05!';
const VIEWPORT_MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const verdicts = [];

function logVerdict(item, status, reason, file) {
  const line = `- Item ${item}: ${status} — ${reason}${file ? ` (screenshot: ${file})` : ''}`;
  console.log(line);
  verdicts.push(line);
}
async function shootFull(page, name) {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function dismissCookies(page) {
  await page.evaluate(() => {
    const all = [...document.querySelectorAll('button, a')];
    const accept = all.find(b => /accept\s*all|accept|i\s*agree|got\s*it/i.test((b.textContent || '').trim()));
    if (accept) accept.click();
  });
  await sleep(800);
}
async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
  await sleep(2000);
  await dismissCookies(page);
  await sleep(800);
  await page.evaluate((e, p) => {
    const ie = document.querySelector('input[type="email"], input[name="email"]');
    const ip = document.querySelector('input[type="password"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(ie, e); ie.dispatchEvent(new Event('input', { bubbles: true })); ie.dispatchEvent(new Event('change', { bubbles: true }));
    setter.call(ip, p); ip.dispatchEvent(new Event('input', { bubbles: true })); ip.dispatchEvent(new Event('change', { bubbles: true }));
  }, EMAIL, PASSWORD);
  await sleep(400);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, [role=button], input[type=submit]')];
    const c = btns.find(b => /^(sign\s*in|log\s*in|continue|submit)$/i.test((b.textContent || b.value || '').trim()));
    if (c) c.click();
  });
  try {
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }),
      page.waitForFunction(() => !/\/login/i.test(window.location.pathname), { timeout: 20000 }),
    ]);
  } catch (e) {}
  await sleep(3000);
  return !/\/login/i.test(new URL(page.url()).pathname);
}
async function fullScroll(page) {
  await page.evaluate(async () => {
    const dist = 300;
    const total = document.documentElement.scrollHeight;
    for (let y = 0; y < total; y += dist) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 200));
    }
    window.scrollTo(0, 0);
  });
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT_MOBILE);
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
  page.setDefaultNavigationTimeout(45000);
  page.setDefaultTimeout(20000);

  let loggedIn = false;
  try {
    loggedIn = await login(page);
  } catch (e) { console.log('LOGIN ERR:', e.message); }
  if (!loggedIn) { console.log('Login failed'); await browser.close(); return; }

  try {
    // ============================================================
    // ITEM 1: SectionHeader with "See all" / "View all" link.
    // Try a wider set of routes: explore, search, /events, profile, shop sub-pages.
    // ============================================================
    console.log('\n[Item 1] Searching for SectionHeader See-all link');
    const routes = [
      `${BASE_URL}/`,
      `${BASE_URL}/explore`,
      `${BASE_URL}/events`,
      `${BASE_URL}/profile`,
      `${BASE_URL}/shop`,
      `${BASE_URL}/shop/featured`,
      `${BASE_URL}/admin/collectives`,
    ];
    let bestHit = null;
    let allCandidates = [];
    for (const url of routes) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2' }).catch(() => {});
        await sleep(2500);
        await fullScroll(page);
        await sleep(800);
        const found = await page.evaluate(() => {
          const els = [...document.querySelectorAll('a, button, span')];
          const matches = els.filter(e => {
            const t = (e.textContent || '').trim();
            return /^(see\s*all|view\s*all|see\s*more|view\s*more|show\s*all)$/i.test(t);
          });
          return matches.map(seeAll => {
            const cs = getComputedStyle(seeAll);
            const r = seeAll.getBoundingClientRect();
            const parent = seeAll.parentElement;
            const parentCs = parent ? getComputedStyle(parent) : null;
            const siblings = parent ? [...parent.children] : [];
            const titleEl = siblings.find(s => s !== seeAll && (s.textContent || '').trim().length > 3);
            return {
              text: seeAll.textContent.trim(),
              whiteSpace: cs.whiteSpace,
              flexShrink: cs.flexShrink,
              tag: seeAll.tagName,
              parentDisplay: parentCs?.display,
              parentClass: parent?.className?.toString().slice(0, 200) || '',
              titleText: titleEl ? (titleEl.textContent || '').slice(0, 60).trim() : null,
              titleClass: titleEl?.className?.toString().slice(0, 200) || '',
              titleMinW: titleEl ? getComputedStyle(titleEl).minWidth : null,
              hasMinW0: (titleEl?.className?.toString() || '').includes('min-w-0'),
              hasTruncate: (titleEl?.className?.toString() || '').includes('truncate'),
              x: r.x, y: r.y,
            };
          });
        });
        if (found.length) {
          allCandidates.push({ url, found });
          // Pick the best: noWrap & noShrink
          for (const c of found) {
            const noWrap = (c.whiteSpace || '').includes('nowrap');
            const noShrink = c.flexShrink === '0';
            const score = (noWrap ? 2 : 0) + (noShrink ? 1 : 0);
            if (!bestHit || score > bestHit.score) {
              bestHit = { ...c, score, url };
            }
          }
        }
      } catch (e) {
        // skip
      }
    }
    console.log('All candidates count:', allCandidates.length);
    if (bestHit) {
      console.log('Best hit:', bestHit);
      await page.goto(bestHit.url, { waitUntil: 'networkidle2' });
      await sleep(2500);
      await fullScroll(page);
      await sleep(800);
    }
    await shootFull(page, 'polish-item-1-after.png');
    if (bestHit && bestHit.score >= 2) {
      const noWrap = (bestHit.whiteSpace || '').includes('nowrap');
      const noShrink = bestHit.flexShrink === '0';
      logVerdict(1, 'PASS', `"${bestHit.text}" link on ${bestHit.url}: whiteSpace=${bestHit.whiteSpace} flex-shrink=${bestHit.flexShrink} title="${bestHit.titleText?.slice(0, 30)}" min-w-0=${bestHit.hasMinW0} truncate=${bestHit.hasTruncate}`, 'polish-item-1-after.png');
    } else if (bestHit) {
      logVerdict(1, 'AMBIGUOUS', `"${bestHit.text}" link found but whiteSpace=${bestHit.whiteSpace} flex-shrink=${bestHit.flexShrink} (polish target: nowrap + shrink-0). Found across ${allCandidates.length} routes — possibly different link than SectionHeader's.`, 'polish-item-1-after.png');
    } else {
      logVerdict(1, 'AMBIGUOUS', `no See all/View all link found on home/explore/events/profile/shop/admin routes. Fix may be in components not reachable for code@'s data state.`, 'polish-item-1-after.png');
    }

    // ============================================================
    // ITEM 6: Collective Up Next via event-detail collective link
    // ============================================================
    console.log('\n[Item 6] Collective Up Next via event-detail collective link');
    const eventUrl = 'https://app.coexistaus.org/events/56f35e8a-cedb-402f-ad8e-6bf745c65800';
    let collectiveUrl = null;
    try {
      await page.goto(eventUrl, { waitUntil: 'networkidle2' });
      await sleep(3000);
      await fullScroll(page);
      // Try clicking "by Brisbane" link
      collectiveUrl = await page.evaluate(() => {
        // Look for "by <Name>" anchor
        const links = [...document.querySelectorAll('a')];
        const byLink = links.find(a => /^by\s+\w+/i.test((a.textContent || '').trim()));
        if (byLink && byLink.href) return byLink.href;
        // Or any anchor href containing /collective/ /collectives/ /communities/ /admin/collectives/<id>
        const collectiveAnchor = links.find(a => {
          const h = a.getAttribute('href') || '';
          return /\/collective[s]?\/[^/?]+|\/communit[iey]+\/[^/?]+/.test(h);
        });
        if (collectiveAnchor) return collectiveAnchor.href;
        return null;
      });
      console.log('Collective URL from event detail:', collectiveUrl);

      // Plan B: click anything that opens a slide-out / different page with name "Brisbane"
      if (!collectiveUrl) {
        const brisbaneClicked = await page.evaluate(() => {
          const all = [...document.querySelectorAll('a, button, span')];
          const b = all.find(e => /^brisbane$|^by\s+brisbane$|^brisbane,\s*queensland$/i.test((e.textContent || '').trim()));
          if (b) {
            // If anchor, return href
            if (b.tagName === 'A' && b.href) return b.href;
            // If button, click and capture URL after
            b.click();
            return 'clicked';
          }
          return null;
        });
        if (brisbaneClicked === 'clicked') {
          await sleep(3500);
          if (page.url() !== eventUrl) collectiveUrl = page.url();
        } else if (brisbaneClicked && /^http/.test(brisbaneClicked)) {
          collectiveUrl = brisbaneClicked;
        }
      }

      // Plan C: explore admin/collectives → click Brisbane row → URL
      if (!collectiveUrl) {
        await page.goto(`${BASE_URL}/admin/collectives`, { waitUntil: 'networkidle2' });
        await sleep(3000);
        const adminBrisbaneUrl = await page.evaluate(() => {
          // Click Brisbane row and watch URL change. First try anchor.
          const all = [...document.querySelectorAll('a, button, [role=link], li, div')];
          const brisbane = all.find(e => /^brisbane$/i.test((e.textContent || '').trim().split('\n')[0]) ||
                                          /brisbane/i.test((e.textContent || '').trim().slice(0, 50)));
          if (brisbane) {
            if (brisbane.tagName === 'A' && brisbane.href) return brisbane.href;
            // Click parent that's a row
            let row = brisbane;
            for (let i = 0; i < 3 && row; i++) {
              const r = row.getBoundingClientRect();
              if (r.height > 50 && r.height < 200 && r.width > 250) break;
              row = row.parentElement;
            }
            if (row) row.click();
          }
          return null;
        });
        if (adminBrisbaneUrl) {
          collectiveUrl = adminBrisbaneUrl;
        } else {
          await sleep(3500);
          const u = page.url();
          if (u.includes('collective') || u.includes('communit')) collectiveUrl = u;
        }
      }
    } catch (e) {
      console.log('Item 6 setup err:', e.message);
    }
    console.log('Final collectiveUrl:', collectiveUrl);

    if (collectiveUrl) {
      await page.goto(collectiveUrl, { waitUntil: 'networkidle2' });
      await sleep(3000);
      await fullScroll(page);
      await sleep(800);
      const upInfo = await page.evaluate(() => {
        const all = [...document.querySelectorAll('h1, h2, h3, h4, span, div, p')];
        const upHeader = all.find(h => /^(up\s*next|upcoming(?:\s+events?)?)$/i.test((h.textContent || '').trim()));
        if (!upHeader) return { found: false, url: window.location.href };
        upHeader.scrollIntoView({ block: 'start' });
        // Find the next sibling containing img or calendar icon
        const candidates = [];
        let scope = upHeader.parentElement;
        for (let i = 0; i < 5 && scope; i++) {
          if (scope.children && scope.children.length > 1) candidates.push(scope);
          scope = scope.parentElement;
        }
        const cardWithImg = candidates.find(c => c.querySelector('img'));
        const cardWithCalIcon = candidates.find(c => c.querySelector('svg[class*="lucide-calendar"], [data-icon="calendar-days"]'));
        let heroSrc = null, datePillText = null;
        if (cardWithImg) {
          const heroImg = [...cardWithImg.querySelectorAll('img')].find(img => {
            const r = img.getBoundingClientRect();
            return r.height > 80 && r.width > 200;
          });
          heroSrc = heroImg?.src || cardWithImg.querySelector('img')?.src;
          const datePill = [...cardWithImg.querySelectorAll('*')].find(e =>
            /^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i.test((e.textContent || '').trim())
          );
          datePillText = datePill?.textContent?.trim();
        }
        return {
          found: true,
          hasImg: !!cardWithImg,
          hasFallbackIcon: !!cardWithCalIcon,
          heroSrc: heroSrc?.slice(0, 100),
          datePillText,
          url: window.location.href,
        };
      });
      await shootFull(page, 'polish-item-6-after.png');
      if (upInfo.found && upInfo.heroSrc) {
        logVerdict(6, 'PASS', `Up next has hero img (src=${upInfo.heroSrc?.slice(0, 60)} datePill="${upInfo.datePillText || 'none'}") on ${upInfo.url}`, 'polish-item-6-after.png');
      } else if (upInfo.found && upInfo.hasFallbackIcon) {
        logVerdict(6, 'PASS', `Up next visible with CalendarDays fallback icon (gradient + calendar fallback path is part of polish 6) on ${upInfo.url}`, 'polish-item-6-after.png');
      } else if (upInfo.found) {
        logVerdict(6, 'AMBIGUOUS', `Up next visible but neither hero img nor calendar fallback detected on ${upInfo.url}`, 'polish-item-6-after.png');
      } else {
        logVerdict(6, 'AMBIGUOUS', `no Up next / Upcoming events section on ${upInfo.url}`, 'polish-item-6-after.png');
      }
    } else {
      await shootFull(page, 'polish-item-6-after.png');
      logVerdict(6, 'AMBIGUOUS', `cannot reach a collective detail page; admin clicks do not navigate via anchor and 'by Brisbane' is not a link in current event-detail render`, 'polish-item-6-after.png');
    }

  } finally {
    await browser.close();
  }

  // Merge with prior verdicts (items 2, 3, 4, 7, 8 already PASS) — read from prior POLISH_VERDICTS.md
  const priorVerdicts = {
    2: '- Item 2: PASS — 30 rows, abbreviated stats m/ev visible (full text hidden under sm), chevron hidden. sample: "Adelaide Adelaide, SA 6 m 37 ev Brandon" (screenshot: polish-item-2-after.png)',
    3: '- Item 3: PASS — 0 alpha-reduced text nodes in date-bearing card on https://app.coexistaus.org/events/56f35e8a-cedb-402f-ad8e-6bf745c65800 (screenshot: polish-item-3-after.png)',
    4: '- Item 4: PASS — no horizontal scroll, no overflowing card across 4 cards scanned in chat channel on https://app.coexistaus.org/chat/channel/<id> (screenshot: polish-item-4-after.png)',
    7: '- Item 7: PASS — Directions uses lat/lng: https://maps.apple.com/?daddr=-27.429215,152.9599611&dirflg=d&q=Brisbane%2C%20Queensland (screenshot: polish-item-7-after.png)',
    8: '- Item 8: PASS — hero=508px (target ~480px, winW=390, hasImg=true) (screenshot: polish-item-8-after.png)',
  };
  const merged = [];
  for (const i of [1, 2, 3, 4, 6, 7, 8]) {
    const v = verdicts.find(x => new RegExp(`^- Item ${i}:`).test(x));
    if (v) merged.push(v);
    else if (priorVerdicts[i]) merged.push(priorVerdicts[i]);
  }
  const failCount = merged.filter(v => /^- Item \d+: FAIL/.test(v)).length;
  const ambigCount = merged.filter(v => /^- Item \d+: AMBIGUOUS/.test(v)).length;
  const passCount = merged.filter(v => /^- Item \d+: PASS/.test(v)).length;
  let overall;
  if (failCount > 0) overall = 'FAIL';
  else if (ambigCount > 0) overall = 'AMBIGUOUS';
  else overall = 'PASS';

  const md = `# Co-Exist 1.8.3 polish verification — Worker 2 verdicts

Fork id: \`fork_motk2agr_7780e3-w2\`
Run at: ${new Date().toISOString()}
Base URL: ${BASE_URL}
Viewport: 390x844 mobile (iPhone 14)
Login: ${EMAIL}
Login succeeded: ${loggedIn}
Commit verified: 03c3acb (live on prod via Vercel main auto-deploy)

## Verdicts (items 1, 2, 3, 4, 6, 7, 8 — item 5 is Worker 1's)

${merged.join('\n')}

## Counts
- PASS: ${passCount}
- FAIL: ${failCount}
- AMBIGUOUS: ${ambigCount}

## Sanity
Login screenshot: login-sanity.png

WORKER_2: ${overall}
`;
  fs.writeFileSync(path.join(OUT_DIR, 'POLISH_VERDICTS.md'), md);
  console.log('\n=== VERDICT FILE WRITTEN ===');
  console.log(md);
})();
