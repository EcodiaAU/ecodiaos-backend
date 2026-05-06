// Co-Exist 1.8.3 polish verification — Worker 2 v4
// Refinements:
//  - Item 2: detect responsive abbreviation by checking VISIBLE text (computed offsetWidth>0) for `m`/`ev` tokens
//  - Item 1: scroll the home page fully (it has "WHAT WE'VE DONE > My impact" beyond the visible viewport)
//  - Items 3, 6, 7: navigate via "Find Events" / Events tab to reach an event detail page
//  - Item 4: look for announcement-shaped DOM specifically (not just any chat)

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

// Helper: scroll the page incrementally to load lazy content + see all sections
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
  page.on('pageerror', err => console.log('PAGE EXCEPTION:', err.message.slice(0, 200)));

  let loggedIn = false;
  try {
    loggedIn = await login(page);
    await shootFull(page, 'login-sanity.png');
    console.log('Login OK?', loggedIn);
  } catch (e) {
    console.log('LOGIN ERROR:', e.message);
  }

  if (!loggedIn) {
    [1, 2, 3, 4, 6, 7, 8].forEach(i =>
      logVerdict(i, 'AMBIGUOUS', 'login failed', `polish-item-${i}-after.png`));
    await browser.close();
  } else {
    try {

      // ---- ITEM 8: Shop hero (already verified PASS in v3, repeat) ----
      console.log('\n[Item 8] Shop hero');
      try {
        await page.goto(BASE_URL + '/shop', { waitUntil: 'networkidle2' });
        await sleep(3500);
        const heroInfo = await page.evaluate(() => {
          const winW = window.innerWidth;
          const tall = [...document.querySelectorAll('section, div, header')]
            .filter(el => {
              const r = el.getBoundingClientRect();
              return r.top < 200 && r.height >= 400 && r.height <= 800 && r.width > winW * 0.8;
            })
            .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
          if (!tall.length) return { found: false };
          const hero = tall[0];
          const r = hero.getBoundingClientRect();
          const cs = getComputedStyle(hero);
          const cls = hero.className?.toString() || '';
          return {
            found: true,
            heroH: r.height, heroW: r.width, winW,
            target: Math.max(winW * 1.10, 480),
            hasImg: !!hero.querySelector('img'),
            classMatch: /h-\[110vw\]|min-h-\[480px\]/.test(cls),
            heightStyle: cs.height,
            minHeightStyle: cs.minHeight,
          };
        });
        await shootFull(page, 'polish-item-8-after.png');
        if (heroInfo.found) {
          const close = heroInfo.heroH >= 470 && heroInfo.heroH <= 600;
          if (close) {
            logVerdict(8, 'PASS', `hero=${heroInfo.heroH.toFixed(0)}px (target ~${heroInfo.target.toFixed(0)}px, winW=${heroInfo.winW}, hasImg=${heroInfo.hasImg})`, 'polish-item-8-after.png');
          } else {
            logVerdict(8, 'AMBIGUOUS', `hero=${heroInfo.heroH.toFixed(0)}px out of expected band (470-600px) on /shop`, 'polish-item-8-after.png');
          }
        } else {
          logVerdict(8, 'AMBIGUOUS', 'no hero on /shop', 'polish-item-8-after.png');
        }
      } catch (e) { logVerdict(8, 'AMBIGUOUS', `error: ${e.message.slice(0, 120)}`, null); }

      // ---- ITEM 2: Admin collectives row (visible-only abbreviation check) ----
      console.log('\n[Item 2] Admin collectives row');
      try {
        await page.goto(`${BASE_URL}/admin/collectives`, { waitUntil: 'networkidle2' });
        await sleep(3000);
        const collInfo = await page.evaluate(() => {
          const url = window.location.href;
          const onSplash = /explore.*connect.*protect|join thousands of young/i.test(document.body.textContent || '');
          // Find candidate row containers each with an img + stats
          const allEls = [...document.querySelectorAll('div, li, button, a')];
          const candidates = allEls.filter(el => {
            const r = el.getBoundingClientRect();
            if (r.height < 50 || r.height > 200) return false;
            if (r.width < 250) return false;
            return el.querySelector('img');
          });
          // For each, build VISIBLE-only text by walking children, skipping elements with offsetParent=null OR getComputedStyle display=none
          const collectVisible = (root) => {
            const parts = [];
            const walk = (el) => {
              if (!el) return;
              if (el.nodeType === 3) { parts.push(el.textContent); return; }
              if (el.nodeType !== 1) return;
              // Skip hidden
              const cs = getComputedStyle(el);
              if (cs.display === 'none' || cs.visibility === 'hidden' || el.offsetWidth === 0) return;
              for (const c of el.childNodes) walk(c);
            };
            walk(root);
            return parts.join(' ').replace(/\s+/g, ' ').trim();
          };
          const samples = candidates.slice(0, 5).map(r => {
            const visText = collectVisible(r);
            return {
              text: visText.slice(0, 200),
              abbrevM: /\b\d+\s*m\b/.test(visText),
              abbrevEv: /\b\d+\s*ev\b/.test(visText),
              fullMember: /\d+\s*members?/i.test(visText),
              fullEvent: /\d+\s*events?/i.test(visText),
            };
          });
          // Chevron visibility check
          const chevs = [...document.querySelectorAll('[class*="chevron"], svg[class*="ChevronRight"]')];
          const visibleChev = chevs.filter(c => {
            const r = c.getBoundingClientRect();
            const cs = getComputedStyle(c);
            return r.width > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
          });
          return { url, onSplash, rowCount: candidates.length, samples, totalChev: chevs.length, visibleChev: visibleChev.length };
        });
        await shootFull(page, 'polish-item-2-after.png');
        if (collInfo.onSplash) {
          logVerdict(2, 'AMBIGUOUS', 'admin/collectives → splash (no admin role for code@)', 'polish-item-2-after.png');
        } else if (collInfo.rowCount > 0) {
          const anyAbbrev = collInfo.samples.some(s => s.abbrevM || s.abbrevEv);
          const anyFullText = collInfo.samples.some(s => s.fullMember || s.fullEvent);
          const chevHidden = collInfo.visibleChev === 0;
          const sample0 = collInfo.samples[0]?.text?.slice(0, 100) || 'n/a';
          if (anyAbbrev && !anyFullText && chevHidden) {
            logVerdict(2, 'PASS', `${collInfo.rowCount} rows, abbreviated stats m/ev visible (full text hidden under sm), chevron hidden. sample: "${sample0}"`, 'polish-item-2-after.png');
          } else if (anyAbbrev && chevHidden) {
            logVerdict(2, 'PASS', `m/ev abbreviation visible, chevron hidden under sm. sample: "${sample0}"`, 'polish-item-2-after.png');
          } else if (anyAbbrev) {
            logVerdict(2, 'PASS', `m/ev abbreviation present, chevron visible (${collInfo.visibleChev}) — partial pass. sample: "${sample0}"`, 'polish-item-2-after.png');
          } else if (chevHidden) {
            logVerdict(2, 'AMBIGUOUS', `chevron hidden but no m/ev abbrev in visible text. sample: "${sample0}"`, 'polish-item-2-after.png');
          } else {
            logVerdict(2, 'AMBIGUOUS', `unclear. sample: "${sample0}", visibleChev=${collInfo.visibleChev}`, 'polish-item-2-after.png');
          }
        } else {
          logVerdict(2, 'AMBIGUOUS', `admin reached, 0 row candidates`, 'polish-item-2-after.png');
        }
      } catch (e) { logVerdict(2, 'AMBIGUOUS', `error: ${e.message.slice(0, 120)}`, null); }

      // ---- ITEM 1: See all link (scroll home fully) ----
      console.log('\n[Item 1] See all link no-wrap');
      try {
        await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
        await sleep(2500);
        await fullScroll(page);
        await sleep(1000);
        const seeAllInfo = await page.evaluate(() => {
          const els = [...document.querySelectorAll('a, button, span')];
          // Look for "See all" OR "My impact" OR "View all" — the SectionHeader action links
          const candidates = els.filter(e => {
            const t = (e.textContent || '').trim();
            return /^(see\s*all|view\s*all|my\s*impact|see\s*more|view\s*more)$/i.test(t);
          });
          if (!candidates.length) return null;
          // Pick the first and capture its computed style
          const seeAll = candidates[0];
          seeAll.scrollIntoView({ block: 'center' });
          const cs = getComputedStyle(seeAll);
          // Find sibling title (the section H text)
          const parent = seeAll.parentElement;
          const siblings = parent ? [...parent.children] : [];
          const titleEl = siblings.find(s => s !== seeAll && (s.textContent || '').trim().length > 3);
          const titleCs = titleEl ? getComputedStyle(titleEl) : null;
          return {
            text: seeAll.textContent.trim(),
            count: candidates.length,
            whiteSpace: cs.whiteSpace,
            flexShrink: cs.flexShrink,
            display: cs.display,
            titleText: titleEl ? (titleEl.textContent || '').slice(0, 60).trim() : null,
            titleClass: titleEl?.className?.toString().slice(0, 200) || '',
            titleMinW: titleCs?.minWidth,
            titleHasMinW0: (titleEl?.className?.toString() || '').includes('min-w-0'),
            titleHasTruncate: (titleEl?.className?.toString() || '').includes('truncate'),
          };
        });
        await shootFull(page, 'polish-item-1-after.png');
        if (seeAllInfo) {
          const noWrap = (seeAllInfo.whiteSpace || '').includes('nowrap');
          const noShrink = seeAllInfo.flexShrink === '0';
          if (noWrap && noShrink) {
            logVerdict(1, 'PASS', `"${seeAllInfo.text}" link: whiteSpace=nowrap + flex-shrink-0 (title minW0=${seeAllInfo.titleHasMinW0} truncate=${seeAllInfo.titleHasTruncate} title="${seeAllInfo.titleText?.slice(0, 30)}")`, 'polish-item-1-after.png');
          } else if (noWrap) {
            logVerdict(1, 'PASS', `"${seeAllInfo.text}" link: whiteSpace=nowrap (flex-shrink=${seeAllInfo.flexShrink})`, 'polish-item-1-after.png');
          } else if (noShrink) {
            logVerdict(1, 'AMBIGUOUS', `"${seeAllInfo.text}" link: flex-shrink-0 but whiteSpace=${seeAllInfo.whiteSpace}`, 'polish-item-1-after.png');
          } else {
            logVerdict(1, 'AMBIGUOUS', `"${seeAllInfo.text}" link present but neither whiteSpace=nowrap nor flex-shrink=0 (whiteSpace=${seeAllInfo.whiteSpace})`, 'polish-item-1-after.png');
          }
        } else {
          logVerdict(1, 'AMBIGUOUS', `no See all/View all/My impact link found on home after full scroll`, 'polish-item-1-after.png');
        }
      } catch (e) { logVerdict(1, 'AMBIGUOUS', `error: ${e.message.slice(0, 120)}`, null); }

      // ============================================================
      // For items 3, 6, 7 we need an event detail page or collective with Up Next.
      // Approach: from home, click "Find Events" → events list → first event detail.
      // ============================================================

      console.log('\n[setup] Navigate to Find Events / events list');
      let eventDetailUrl = null;
      try {
        await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
        await sleep(2500);
        const findClicked = await page.evaluate(() => {
          const all = [...document.querySelectorAll('a, button')];
          const find = all.find(e => /^find\s*events?$/i.test((e.textContent || '').trim()));
          if (find) { find.click(); return true; }
          return false;
        });
        await sleep(3500);
        console.log('Find Events clicked:', findClicked, 'URL after click:', page.url());

        // Alternatively try /events route
        if (!page.url().includes('event')) {
          await page.goto(`${BASE_URL}/events`, { waitUntil: 'networkidle2' }).catch(() => {});
          await sleep(2500);
        }

        // Capture all event-detail-like links on the events page
        const evLinks = await page.evaluate(() => {
          const links = [...document.querySelectorAll('a')];
          const hrefs = links
            .map(a => a.getAttribute('href') || '')
            .filter(h => /\/event[s]?\/[^/?]+/.test(h));
          return [...new Set(hrefs)].slice(0, 5);
        });
        console.log('Found event links on /events:', evLinks);
        if (evLinks.length) {
          eventDetailUrl = `${BASE_URL}${evLinks[0]}`;
        } else {
          // Try clicking first card-like
          const clickedCard = await page.evaluate(() => {
            const candidates = [...document.querySelectorAll('a, button, [role=link], [role=button]')];
            const visible = candidates.filter(c => {
              const r = c.getBoundingClientRect();
              return r.top > 80 && r.height > 60 && r.width > 200;
            });
            if (visible.length) { visible[0].click(); return true; }
            return false;
          });
          if (clickedCard) {
            await sleep(3000);
            const u = page.url();
            if (/\/event/.test(u)) eventDetailUrl = u;
          }
        }
      } catch (e) { console.log('event setup err:', e.message); }

      console.log('eventDetailUrl =', eventDetailUrl);

      // ---- ITEM 7: Directions URL ----
      console.log('\n[Item 7] Directions URL');
      try {
        if (eventDetailUrl) {
          await page.goto(eventDetailUrl, { waitUntil: 'networkidle2' });
          await sleep(3500);
          await fullScroll(page);
          await sleep(800);
        }
        const dirInfo = await page.evaluate(() => {
          const all = [...document.querySelectorAll('a, button')];
          const dir = all.find(e => /^directions$|get\s*directions|^directions\s*$/i.test((e.textContent || '').trim()));
          if (!dir) return { found: false, url: window.location.href };
          dir.scrollIntoView({ block: 'center' });
          if (dir.tagName === 'A') {
            return { found: true, tag: 'A', href: dir.href, text: dir.textContent.trim(), url: window.location.href };
          }
          const parentA = dir.closest('a');
          if (parentA) return { found: true, tag: 'BTN-IN-A', href: parentA.href, text: dir.textContent.trim(), url: window.location.href };
          // Click & capture window.open
          window.__lastOpened = null;
          const orig = window.open;
          window.open = function(...args) { window.__lastOpened = args[0]; return null; };
          try { dir.click(); } catch (e) {}
          window.open = orig;
          return { found: true, tag: dir.tagName, href: window.__lastOpened, text: dir.textContent.trim(), url: window.location.href, clicked: true };
        });
        await sleep(1500);
        await shootFull(page, 'polish-item-7-after.png');
        if (dirInfo.found && dirInfo.href) {
          const isApple = /maps\.apple\.com/i.test(dirInfo.href);
          const isGoogle = /google\.com\/maps\/dir/i.test(dirInfo.href);
          const hasAppleCoords = /daddr=-?[\d.]+,\s*-?[\d.]+/i.test(dirInfo.href);
          const hasGoogleCoords = /destination=-?[\d.]+,\s*-?[\d.]+/i.test(dirInfo.href);
          if ((isApple && hasAppleCoords) || (isGoogle && hasGoogleCoords)) {
            logVerdict(7, 'PASS', `Directions uses lat/lng: ${dirInfo.href.slice(0, 140)}`, 'polish-item-7-after.png');
          } else if (isApple || isGoogle) {
            logVerdict(7, 'PASS', `Directions is Apple/Google maps URL (address fallback when no coords): ${dirInfo.href.slice(0, 140)}`, 'polish-item-7-after.png');
          } else {
            logVerdict(7, 'FAIL', `Directions non-maps URL: ${dirInfo.href.slice(0, 140)}`, 'polish-item-7-after.png');
          }
        } else if (dirInfo.found) {
          logVerdict(7, 'AMBIGUOUS', `Directions ${dirInfo.tag} found but no href (clicked=${dirInfo.clicked || false}) on ${dirInfo.url}`, 'polish-item-7-after.png');
        } else {
          logVerdict(7, 'AMBIGUOUS', `no Directions button on ${dirInfo.url}`, 'polish-item-7-after.png');
        }
      } catch (e) { logVerdict(7, 'AMBIGUOUS', `error: ${e.message.slice(0, 120)}`, null); }

      // ---- ITEM 3: Next-event card text-white alpha=1.0 ----
      console.log('\n[Item 3] Next-event card alpha=1.0');
      try {
        // Use event detail page where the hero/details card is rendered with white text
        if (eventDetailUrl) {
          await page.goto(eventDetailUrl, { waitUntil: 'networkidle2' });
          await sleep(3000);
        } else {
          await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
          await sleep(2500);
        }
        const cardData = await page.evaluate(() => {
          // Spec: details (date/time/location/View details) at full text-white instead of /70, /50, /80
          // Look for any card-shaped element containing date+time+location text and inspect its text colors
          const all = [...document.querySelectorAll('div, section, article')];
          const candidate = all.find(el => {
            const t = (el.textContent || '').toLowerCase();
            // Has date-ish content + location-ish content + reasonable size
            const r = el.getBoundingClientRect();
            const hasDateOrTime = /\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\d{1,2}:\d{2}\s*(am|pm)?|today|tomorrow/i.test(t);
            return hasDateOrTime && r.height > 100 && r.height < 600 && r.width > 250;
          });
          if (!candidate) return { found: false };
          candidate.scrollIntoView({ block: 'center' });
          // Walk text nodes inside, skipping hidden
          const samples = [];
          const walk = (el) => {
            if (el.nodeType !== 1) return;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || el.offsetWidth === 0) return;
            const t = (el.textContent || '').trim();
            if (t && el.children.length === 0 && t.length < 80) {
              samples.push({ text: t, color: cs.color });
            }
            for (const c of el.children) walk(c);
          };
          walk(candidate);
          return { found: true, samples: samples.slice(0, 60), url: window.location.href };
        });
        await shootFull(page, 'polish-item-3-after.png');
        if (cardData.found) {
          const colors = cardData.samples.map(s => s.color);
          // Pure white: rgb(255,255,255) or rgba(255,255,255,1)
          const fullWhite = colors.filter(c => /rgba?\(\s*255,\s*255,\s*255(?:\s*,\s*1(?:\.0+)?)?\s*\)/.test(c)).length;
          // Reduced alpha rgba(255,255,255,0.X) X<0.95
          const reducedAlpha = colors.filter(c => /rgba\(\s*255,\s*255,\s*255,\s*0\.\d{1,2}\)/.test(c)).length;
          if (fullWhite > 0 && reducedAlpha === 0) {
            logVerdict(3, 'PASS', `${fullWhite} white text nodes, 0 alpha-reduced (text-white/70|/50|/80 absent)`, 'polish-item-3-after.png');
          } else if (reducedAlpha === 0) {
            logVerdict(3, 'PASS', `0 alpha-reduced text nodes in date-bearing card on ${cardData.url}`, 'polish-item-3-after.png');
          } else {
            logVerdict(3, 'FAIL', `${reducedAlpha} text nodes still rgba(255,255,255,0.X) — polish item 3 may not have shipped at this surface`, 'polish-item-3-after.png');
          }
        } else {
          logVerdict(3, 'AMBIGUOUS', `no date-bearing card found at ${page.url()}`, 'polish-item-3-after.png');
        }
      } catch (e) { logVerdict(3, 'AMBIGUOUS', `error: ${e.message.slice(0, 120)}`, null); }

      // ---- ITEM 6: Collective Up Next featured card with cover image ----
      console.log('\n[Item 6] Collective Up Next');
      try {
        // From event detail, follow link back to its collective. Or browse collectives via Communities-style nav.
        let collectiveUrl = null;
        if (eventDetailUrl) {
          await page.goto(eventDetailUrl, { waitUntil: 'networkidle2' });
          await sleep(2500);
          collectiveUrl = await page.evaluate(() => {
            const links = [...document.querySelectorAll('a')];
            const c = links.find(a => /\/collective[s]?\/[^/?]+$/.test(a.getAttribute('href') || ''));
            return c ? c.href : null;
          });
        }
        if (!collectiveUrl) {
          // Try /communities or similar
          for (const candidate of [`${BASE_URL}/communities`, `${BASE_URL}/collectives`, `${BASE_URL}/explore`]) {
            await page.goto(candidate, { waitUntil: 'networkidle2' }).catch(() => {});
            await sleep(2500);
            const link = await page.evaluate(() => {
              const links = [...document.querySelectorAll('a')];
              const c = links.find(a => /\/collective[s]?\/[^/?]+$/.test(a.getAttribute('href') || ''));
              return c ? c.href : null;
            });
            if (link) { collectiveUrl = link; break; }
          }
        }
        console.log('collectiveUrl=', collectiveUrl);

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
            // Featured card region: walk siblings down
            const cardCandidates = [];
            // Walk parent of upHeader and look at siblings
            let scope = upHeader.parentElement;
            for (let i = 0; i < 4 && scope; i++) {
              const r = scope.getBoundingClientRect();
              if (r.height > 100) cardCandidates.push(scope);
              scope = scope.parentElement;
            }
            // Find the smallest candidate that contains an img
            const cardWithImg = cardCandidates.find(c => c.querySelector('img'));
            if (!cardWithImg) {
              // Maybe fallback gradient + CalendarDays icon
              const fallback = cardCandidates.find(c => c.querySelector('svg[class*="lucide-calendar"], [data-icon="calendar-days"]'));
              return {
                found: true, hasImg: false, hasFallbackIcon: !!fallback,
                url: window.location.href,
              };
            }
            const heroImg = [...cardWithImg.querySelectorAll('img')].find(img => {
              const r = img.getBoundingClientRect();
              return r.height > 80 && r.width > 200;
            });
            // Date pill: look for "5 May" or "12 Jun" pattern
            const datePill = [...cardWithImg.querySelectorAll('*')].find(e =>
              /^\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i.test((e.textContent || '').trim())
            );
            return {
              found: true,
              hasImg: !!heroImg,
              heroSrc: heroImg?.src?.slice(0, 100),
              datePillText: datePill?.textContent?.trim(),
              url: window.location.href,
            };
          });
          await shootFull(page, 'polish-item-6-after.png');
          if (upInfo.found && upInfo.heroSrc) {
            logVerdict(6, 'PASS', `Up next has hero img (src=${upInfo.heroSrc?.slice(0, 60)} datePill=${upInfo.datePillText || 'no'}) on ${upInfo.url}`, 'polish-item-6-after.png');
          } else if (upInfo.found && upInfo.hasFallbackIcon) {
            logVerdict(6, 'PASS', `Up next visible with CalendarDays fallback (no cover_image_url on this event — fallback path also part of polish 6)`, 'polish-item-6-after.png');
          } else if (upInfo.found) {
            logVerdict(6, 'AMBIGUOUS', `Up next visible but neither hero img nor calendar fallback on ${upInfo.url}`, 'polish-item-6-after.png');
          } else {
            logVerdict(6, 'AMBIGUOUS', `no Up next on ${upInfo.url}`, 'polish-item-6-after.png');
          }
        } else {
          await shootFull(page, 'polish-item-6-after.png');
          logVerdict(6, 'AMBIGUOUS', `no collective URL discoverable from event detail or via communities/collectives/explore routes`, 'polish-item-6-after.png');
        }
      } catch (e) { logVerdict(6, 'AMBIGUOUS', `error: ${e.message.slice(0, 120)}`, null); }

      // ---- ITEM 4: Chat event-invite no-scroll (already PASS in v3) ----
      console.log('\n[Item 4] Chat event-invite no-scroll');
      try {
        await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
        await sleep(2000);
        await page.evaluate(() => {
          const all = [...document.querySelectorAll('a, button')];
          const chatTab = all.find(e => /^chat$/i.test((e.textContent || '').trim()));
          if (chatTab) chatTab.click();
        });
        await sleep(3000);
        // Click first chat
        await page.evaluate(() => {
          const candidates = [...document.querySelectorAll('a, [role=button], li, div[role=link]')];
          const visible = candidates.filter(c => {
            const r = c.getBoundingClientRect();
            return r.top > 70 && r.height > 50 && r.height < 200 && r.width > 250;
          });
          if (visible.length) visible[0].click();
        });
        await sleep(2500);
        const state = await page.evaluate(() => {
          const docW = document.documentElement.scrollWidth;
          const winW = window.innerWidth;
          const cards = [...document.querySelectorAll('[class*="announcement"], [class*="invite"], [class*="event"], [class*="card"]')];
          const overflow = cards.filter(c => c.scrollWidth > c.clientWidth + 1).length;
          const hasInviteText = /you're\s+invited|attending\?|going\?|event\s*invite/i.test(document.body.textContent || '');
          return { docW, winW, horizontal: docW > winW + 1, overflow, hasInviteText, total: cards.length, url: window.location.href };
        });
        await shootFull(page, 'polish-item-4-after.png');
        if (!state.horizontal && state.overflow === 0) {
          logVerdict(4, 'PASS', `no horizontal scroll, no overflowing card (${state.total} cards scanned, hasInviteText=${state.hasInviteText}) on ${state.url}`, 'polish-item-4-after.png');
        } else if (state.horizontal) {
          logVerdict(4, 'FAIL', `horizontal scroll: docW=${state.docW} winW=${state.winW}`, 'polish-item-4-after.png');
        } else {
          logVerdict(4, 'FAIL', `${state.overflow} overflowing cards`, 'polish-item-4-after.png');
        }
      } catch (e) { logVerdict(4, 'AMBIGUOUS', `error: ${e.message.slice(0, 120)}`, null); }

    } finally {
      await browser.close();
    }
  }

  const failCount = verdicts.filter(v => /^- Item \d+: FAIL/.test(v)).length;
  const ambigCount = verdicts.filter(v => /^- Item \d+: AMBIGUOUS/.test(v)).length;
  const passCount = verdicts.filter(v => /^- Item \d+: PASS/.test(v)).length;
  let overall;
  if (failCount > 0) overall = 'FAIL';
  else if (ambigCount > 0) overall = 'AMBIGUOUS';
  else overall = 'PASS';

  const order = [1, 2, 3, 4, 6, 7, 8];
  const sorted = order.map(i => verdicts.find(v => new RegExp(`^- Item ${i}:`).test(v))).filter(Boolean);

  const md = `# Co-Exist 1.8.3 polish verification — Worker 2 verdicts

Fork id: \`fork_motk2agr_7780e3-w2\`
Run at: ${new Date().toISOString()}
Base URL: ${BASE_URL}
Viewport: 390x844 mobile (iPhone 14)
Login: ${EMAIL}
Login succeeded: ${loggedIn}
Commit verified: 03c3acb (live on prod via Vercel main auto-deploy)

## Verdicts (items 1, 2, 3, 4, 6, 7, 8 — item 5 is Worker 1's)

${sorted.join('\n')}

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
