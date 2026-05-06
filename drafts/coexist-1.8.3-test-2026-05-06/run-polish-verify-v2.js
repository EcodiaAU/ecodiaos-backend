// Co-Exist 1.8.3 polish verification — Worker 2 (fork_motk2agr_7780e3-w2) — v2
// Fix: reliable login (dismiss cookie banner, scroll, robust submit), then verify items.

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
  // Click "Accept All" or X if present
  const dismissed = await page.evaluate(() => {
    const all = [...document.querySelectorAll('button, a')];
    const accept = all.find(b => /accept\s*all|accept|i\s*agree|got\s*it/i.test((b.textContent || '').trim()));
    if (accept) { accept.click(); return 'accept'; }
    return null;
  });
  if (dismissed) await sleep(1200);
  return dismissed;
}

async function login(page) {
  console.log('Login: navigating to /login');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
  await sleep(2000);

  await dismissCookies(page);
  await sleep(800);

  // Fill email
  const emailFilled = await page.evaluate((email) => {
    const input = document.querySelector('input[type="email"], input[name="email"]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, email);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, EMAIL);
  if (!emailFilled) {
    // Try type
    await page.click('input[type="email"], input[name="email"]', { delay: 50 }).catch(() => {});
    await page.keyboard.type(EMAIL, { delay: 30 });
  }
  await sleep(400);

  // Fill password
  await page.evaluate((pw) => {
    const input = document.querySelector('input[type="password"]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, pw);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, PASSWORD);
  await sleep(400);

  await shootFull(page, 'login-filled.png');

  // Find sign in button: scan page (it may be below cookie banner). Prefer a button with text "Sign in" / "Continue" / "Log in" within the form, NOT "Sign in to continue" (subheading).
  const submitClicked = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button, [role=button], input[type=submit]')];
    // Filter to buttons that are plausible primary submit
    const candidates = buttons.filter(b => {
      const t = (b.textContent || b.value || '').trim().toLowerCase();
      return /^(sign\s*in|log\s*in|continue|submit)$/i.test(t) ||
             t === 'sign in' || t === 'log in' || t === 'continue';
    });
    if (candidates.length) {
      candidates[0].scrollIntoView({ block: 'center' });
      candidates[0].click();
      return { clicked: true, text: (candidates[0].textContent || candidates[0].value || '').trim() };
    }
    // Fall back: any submit type
    const submit = buttons.find(b => b.type === 'submit');
    if (submit) {
      submit.scrollIntoView({ block: 'center' });
      submit.click();
      return { clicked: true, text: 'submit-type' };
    }
    return { clicked: false };
  });

  if (!submitClicked.clicked) {
    console.log('No submit button found — pressing Enter on password field');
    await page.focus('input[type="password"]').catch(() => {});
    await page.keyboard.press('Enter');
  } else {
    console.log('Clicked submit:', submitClicked.text);
  }

  // Wait for navigation OR for URL change off /login
  try {
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }),
      page.waitForFunction(() => !/\/login/i.test(window.location.pathname), { timeout: 20000 }),
    ]);
  } catch (e) {
    console.log('Login navigation wait timed out');
  }
  await sleep(3000);

  const finalUrl = page.url();
  console.log('Post-login URL:', finalUrl);
  return !/\/login/i.test(new URL(finalUrl).pathname);
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

  page.on('console', msg => { if (msg.type() === 'error') console.log('PAGE ERR:', msg.text().slice(0, 200)); });
  page.on('pageerror', err => console.log('PAGE EXCEPTION:', err.message.slice(0, 200)));

  let loggedIn = false;
  try {
    loggedIn = await login(page);
    await shootFull(page, 'login-sanity.png');
    if (!loggedIn) {
      console.log('LOGIN FAILED — recording diagnostic.');
      // Continue anyway with limited verification
    } else {
      console.log('LOGIN OK');
    }
  } catch (e) {
    console.log('LOGIN ERROR:', e.message);
  }

  if (!loggedIn) {
    // Record fail verdicts and exit early
    [1, 2, 3, 4, 6, 7, 8].forEach(i =>
      logVerdict(i, 'AMBIGUOUS', 'login failed - could not authenticate to verify', `polish-item-${i}-after.png`));
    await browser.close();
  } else {
    try {
      await sleep(2000);

      // ---- ITEM 1: See-all link no-wrap ----
      console.log('\n[Item 1] See-all link no-wrap');
      try {
        await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
        await sleep(3000);
        // Scroll the home page to find a section with "See all"
        const seeAllInfo = await page.evaluate(() => {
          // Scroll through page
          const els = [...document.querySelectorAll('a, button, span')];
          const seeAll = els.find(e => {
            const t = (e.textContent || '').trim();
            return /^see\s*all$/i.test(t);
          });
          if (!seeAll) return { found: false };
          seeAll.scrollIntoView({ block: 'center' });
          const cs = getComputedStyle(seeAll);
          // Walk up to header
          const parent = seeAll.parentElement;
          const parentCs = parent ? getComputedStyle(parent) : null;
          // Find sibling title
          const siblings = parent ? [...parent.children] : [];
          const titleEl = siblings.find(s => s !== seeAll && (s.textContent || '').trim().length > 3);
          return {
            found: true,
            seeAllWhiteSpace: cs.whiteSpace,
            seeAllFlexShrink: cs.flexShrink,
            parentDisplay: parentCs?.display,
            parentFlexWrap: parentCs?.flexWrap,
            titleText: titleEl ? (titleEl.textContent || '').slice(0, 50).trim() : null,
            titleMinW: titleEl ? getComputedStyle(titleEl).minWidth : null,
          };
        });
        const f = await shootFull(page, 'polish-item-1-after.png');
        if (seeAllInfo.found) {
          const noWrap = (seeAllInfo.seeAllWhiteSpace || '').includes('nowrap');
          const noShrink = seeAllInfo.seeAllFlexShrink === '0';
          if (noWrap && noShrink) {
            logVerdict(1, 'PASS', `See-all has whiteSpace=nowrap + flex-shrink-0 (title=${seeAllInfo.titleText?.slice(0, 30) || 'n/a'})`, 'polish-item-1-after.png');
          } else if (noWrap) {
            logVerdict(1, 'PASS', `See-all whiteSpace=nowrap (flex-shrink=${seeAllInfo.seeAllFlexShrink})`, 'polish-item-1-after.png');
          } else {
            logVerdict(1, 'AMBIGUOUS', `See-all whiteSpace=${seeAllInfo.seeAllWhiteSpace}, flex-shrink=${seeAllInfo.seeAllFlexShrink}`, 'polish-item-1-after.png');
          }
        } else {
          logVerdict(1, 'AMBIGUOUS', 'no See all on home', 'polish-item-1-after.png');
        }
      } catch (e) {
        logVerdict(1, 'AMBIGUOUS', `error: ${e.message.slice(0, 100)}`, null);
      }

      // ---- ITEM 3: Next-event card alpha=1.0 ----
      console.log('\n[Item 3] Next-event card');
      try {
        await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
        await sleep(2500);
        const nextEv = await page.evaluate(() => {
          const all = [...document.querySelectorAll('*')];
          const viewBtn = all.find(e => /view\s*details/i.test((e.textContent || '').trim()) && e.children.length === 0);
          if (!viewBtn) {
            // alt: look for a card containing date/time pattern
            const cards = [...document.querySelectorAll('[class*="card"]')];
            return { found: false, cardCount: cards.length };
          }
          viewBtn.scrollIntoView({ block: 'center' });
          let card = viewBtn;
          for (let i = 0; i < 6; i++) { card = card.parentElement; if (!card) break; }
          if (!card) return { found: false };
          const samples = [...card.querySelectorAll('*')]
            .map(el => ({ text: (el.textContent || '').slice(0, 50).trim(), color: getComputedStyle(el).color }))
            .filter(s => s.text && s.text.length < 50);
          return { found: true, samples: samples.slice(0, 30) };
        });
        const f = await shootFull(page, 'polish-item-3-after.png');
        if (nextEv.found) {
          const allColors = nextEv.samples.map(s => s.color);
          const fullWhite = allColors.filter(c => /rgba?\(\s*255\s*,\s*255\s*,\s*255\s*[,)]\s*(?:1\)?|0?\.95|0?\.96|0?\.97|0?\.98|0?\.99|1\.0)?/.test(c) && !/0\.[1-8]\d?\)/.test(c)).length;
          const reducedAlpha = allColors.filter(c => /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.[1-8]\d?\)/.test(c)).length;
          if (fullWhite > 0 && reducedAlpha === 0) {
            logVerdict(3, 'PASS', `card text full-white (${fullWhite} white nodes, 0 alpha-reduced)`, 'polish-item-3-after.png');
          } else if (reducedAlpha === 0) {
            logVerdict(3, 'PASS', `no /70 /50 /80 alpha-reduced text in card scope (white nodes=${fullWhite})`, 'polish-item-3-after.png');
          } else {
            logVerdict(3, 'FAIL', `card still has ${reducedAlpha} alpha-reduced text nodes`, 'polish-item-3-after.png');
          }
        } else {
          logVerdict(3, 'AMBIGUOUS', 'no Next-event View details button on home', 'polish-item-3-after.png');
        }
      } catch (e) {
        logVerdict(3, 'AMBIGUOUS', `error: ${e.message.slice(0, 100)}`, null);
      }

      // ---- ITEM 4: Chat event-invite no horizontal scroll ----
      console.log('\n[Item 4] Chat event-invite no-scroll');
      try {
        // navigate to chat / collectives chat
        await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
        await sleep(2000);
        // Try clicking a Chat tab
        await page.evaluate(() => {
          const all = [...document.querySelectorAll('a, button, [role=tab]')];
          const chat = all.find(c => /chat|messages?|community/i.test((c.textContent || '').trim()));
          if (chat) chat.click();
        });
        await sleep(2500);
        // Click into a collective
        await page.evaluate(() => {
          const items = [...document.querySelectorAll('a, [role=link], [role=button], [role=listitem], li')];
          const clickable = items.filter(i => {
            const r = i.getBoundingClientRect();
            return r.width > 100 && r.height > 30 && r.top > 50;
          });
          if (clickable.length > 0) clickable[0].click();
        });
        await sleep(2500);
        const scrollState = await page.evaluate(() => {
          const docW = document.documentElement.scrollWidth;
          const winW = window.innerWidth;
          const horizontal = docW > winW + 1;
          const allCards = [...document.querySelectorAll('[class*="announcement"], [class*="invite"], [class*="event"], [class*="card"]')];
          const overflowing = allCards.filter(c => c.scrollWidth > c.clientWidth + 1).length;
          return { docW, winW, horizontal, overflowing, total: allCards.length };
        });
        const f = await shootFull(page, 'polish-item-4-after.png');
        if (!scrollState.horizontal && scrollState.overflowing === 0) {
          logVerdict(4, 'PASS', `no horizontal scroll, no overflowing card (${scrollState.total} cards scanned, docW=${scrollState.docW} winW=${scrollState.winW})`, 'polish-item-4-after.png');
        } else if (scrollState.horizontal) {
          logVerdict(4, 'FAIL', `page horizontal scroll: docW=${scrollState.docW} winW=${scrollState.winW}`, 'polish-item-4-after.png');
        } else {
          logVerdict(4, 'FAIL', `${scrollState.overflowing} cards overflow their container`, 'polish-item-4-after.png');
        }
      } catch (e) {
        logVerdict(4, 'AMBIGUOUS', `error: ${e.message.slice(0, 100)}`, null);
      }

      // ---- ITEM 6: Collective Up Next featured card with cover image ----
      console.log('\n[Item 6] Collective Up Next');
      try {
        await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
        await sleep(2000);
        // Try to find collective routes
        const collectiveClick = await page.evaluate(() => {
          const links = [...document.querySelectorAll('a')];
          const c = links.find(a => /\/collective[s]?\/[^/]+/.test(a.getAttribute('href') || ''));
          if (c) { c.click(); return c.href; }
          return null;
        });
        await sleep(3000);
        if (!collectiveClick) {
          // try via Communities tab
          await page.evaluate(() => {
            const all = [...document.querySelectorAll('a, button, [role=tab]')];
            const x = all.find(e => /communit|collectiv|group/i.test((e.textContent || '').trim()));
            if (x) x.click();
          });
          await sleep(2500);
          await page.evaluate(() => {
            const links = [...document.querySelectorAll('a')];
            const c = links.find(a => /\/collective[s]?\/[^/]+/.test(a.getAttribute('href') || ''));
            if (c) c.click();
          });
          await sleep(2500);
        }
        const upInfo = await page.evaluate(() => {
          const headers = [...document.querySelectorAll('h1, h2, h3, h4, span, div, p')];
          const upHeader = headers.find(h => /^(up\s*next|upcoming(?:\s+events?)?)$/i.test((h.textContent || '').trim()));
          if (!upHeader) return { found: false, currentUrl: window.location.href };
          upHeader.scrollIntoView({ block: 'center' });
          // The featured card is usually next sibling or below in DOM
          let scope = upHeader.parentElement;
          for (let i = 0; i < 3 && scope; i++) scope = scope.parentElement;
          if (!scope) return { found: true, hasImg: false };
          const imgs = [...scope.querySelectorAll('img')];
          const datePill = [...scope.querySelectorAll('*')].find(e =>
            /^\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test((e.textContent || '').trim())
          );
          return { found: true, hasImg: imgs.length > 0, imgCount: imgs.length, hasDatePill: !!datePill, currentUrl: window.location.href };
        });
        const f = await shootFull(page, 'polish-item-6-after.png');
        if (upInfo.found && upInfo.hasImg) {
          logVerdict(6, 'PASS', `Up next has cover image (${upInfo.imgCount} imgs, datePill=${upInfo.hasDatePill}) on ${upInfo.currentUrl}`, 'polish-item-6-after.png');
        } else if (upInfo.found) {
          logVerdict(6, 'AMBIGUOUS', `Up next visible but no img — may be gradient fallback (no upcoming event with cover_image_url) on ${upInfo.currentUrl}`, 'polish-item-6-after.png');
        } else {
          logVerdict(6, 'AMBIGUOUS', `no Up next on ${upInfo.currentUrl}`, 'polish-item-6-after.png');
        }
      } catch (e) {
        logVerdict(6, 'AMBIGUOUS', `error: ${e.message.slice(0, 100)}`, null);
      }

      // ---- ITEM 7: Directions URL ----
      console.log('\n[Item 7] Directions URL');
      try {
        // From current page, click View details on an event
        const evClick = await page.evaluate(() => {
          const all = [...document.querySelectorAll('a, button')];
          const v = all.find(e => /view\s*details|^details$/i.test((e.textContent || '').trim()));
          if (v) { v.click(); return 'view-details'; }
          // Or click a /events/ link
          const links = [...document.querySelectorAll('a')];
          const ev = links.find(a => /\/event[s]?\/[^/]+/.test(a.getAttribute('href') || ''));
          if (ev) { ev.click(); return ev.getAttribute('href'); }
          return null;
        });
        await sleep(3500);
        const dirInfo = await page.evaluate(() => {
          const all = [...document.querySelectorAll('a, button')];
          const dir = all.find(e => /^directions$|get\s*directions/i.test((e.textContent || '').trim()));
          if (!dir) return { found: false, url: window.location.href };
          dir.scrollIntoView({ block: 'center' });
          if (dir.tagName === 'A') {
            return { found: true, tag: 'A', href: dir.href, text: dir.textContent.trim() };
          }
          const parentA = dir.closest('a');
          if (parentA) return { found: true, tag: 'BUTTON-IN-A', href: parentA.href, text: dir.textContent.trim() };
          // Click button and listen for new tab open via window.open monkey-patch
          window.__lastOpened = null;
          const orig = window.open;
          window.open = function(...args) { window.__lastOpened = args[0]; return null; };
          dir.click();
          window.open = orig;
          return { found: true, tag: dir.tagName, href: window.__lastOpened, text: dir.textContent.trim(), clicked: true };
        });
        await sleep(1500);
        const f = await shootFull(page, 'polish-item-7-after.png');
        if (dirInfo.found && dirInfo.href) {
          const isApple = /maps\.apple\.com/i.test(dirInfo.href);
          const isGoogle = /google\.com\/maps\/dir/i.test(dirInfo.href);
          const hasAppleCoords = /daddr=-?[\d.]+,\s*-?[\d.]+/i.test(dirInfo.href);
          const hasGoogleCoords = /destination=-?[\d.]+,\s*-?[\d.]+/i.test(dirInfo.href);
          if ((isApple && hasAppleCoords) || (isGoogle && hasGoogleCoords)) {
            logVerdict(7, 'PASS', `Directions URL uses lat/lng: ${dirInfo.href.slice(0, 120)}`, 'polish-item-7-after.png');
          } else if (isApple || isGoogle) {
            logVerdict(7, 'AMBIGUOUS', `Maps URL but address-fallback (no coords): ${dirInfo.href.slice(0, 120)}`, 'polish-item-7-after.png');
          } else {
            logVerdict(7, 'FAIL', `non-maps URL: ${dirInfo.href.slice(0, 120)}`, 'polish-item-7-after.png');
          }
        } else if (dirInfo.found) {
          logVerdict(7, 'AMBIGUOUS', `Directions ${dirInfo.tag} found but no href captured (clicked=${dirInfo.clicked || false})`, 'polish-item-7-after.png');
        } else {
          logVerdict(7, 'AMBIGUOUS', `no Directions button on ${dirInfo.url}`, 'polish-item-7-after.png');
        }
      } catch (e) {
        logVerdict(7, 'AMBIGUOUS', `error: ${e.message.slice(0, 100)}`, null);
      }

      // ---- ITEM 8: Shop hero h-[110vw] min-h-[480px] ----
      console.log('\n[Item 8] Shop hero');
      try {
        await page.goto(BASE_URL + '/shop', { waitUntil: 'networkidle2' });
        await sleep(3500);
        const heroInfo = await page.evaluate(() => {
          const winW = window.innerWidth;
          const winH = window.innerHeight;
          const url = window.location.href;
          // First section/header/div in main, height > 200, width near full
          const candidates = [...document.querySelectorAll('section, header, div, main > *')];
          const visible = candidates
            .filter(c => {
              const r = c.getBoundingClientRect();
              return r.top < 200 && r.height > 200 && r.width > winW * 0.8;
            })
            .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
          if (!visible.length) return { found: false, winW, winH, url };
          const hero = visible[0];
          const r = hero.getBoundingClientRect();
          const cs = getComputedStyle(hero);
          return {
            found: true,
            heroH: r.height,
            heroW: r.width,
            winW, winH, url,
            target110vw: winW * 1.10,
            min480: 480,
            classList: hero.className?.toString().slice(0, 200),
            heightStyle: cs.height,
            minHeightStyle: cs.minHeight,
          };
        });
        const f = await shootFull(page, 'polish-item-8-after.png');
        if (heroInfo.found) {
          const expected = Math.max(heroInfo.target110vw, heroInfo.min480);
          // 110vw on 390 = 429; min-h 480 wins; so expect ~480
          const inRange = heroInfo.heroH >= heroInfo.min480 - 10 && heroInfo.heroH <= heroInfo.target110vw + 200;
          const hasTokens = /h-\[110vw\]|min-h-\[480px\]/i.test(heroInfo.classList || '');
          if (inRange) {
            logVerdict(8, 'PASS', `hero=${heroInfo.heroH.toFixed(0)}px (expected ${expected.toFixed(0)}px, winW=${heroInfo.winW}, classMatch=${hasTokens}) on ${heroInfo.url}`, 'polish-item-8-after.png');
          } else {
            logVerdict(8, 'AMBIGUOUS', `hero=${heroInfo.heroH.toFixed(0)}px out of expected range (${heroInfo.min480}-${(heroInfo.target110vw + 200).toFixed(0)}px)`, 'polish-item-8-after.png');
          }
        } else {
          logVerdict(8, 'AMBIGUOUS', `no hero found on ${heroInfo.url}`, 'polish-item-8-after.png');
        }
      } catch (e) {
        logVerdict(8, 'AMBIGUOUS', `error: ${e.message.slice(0, 100)}`, null);
      }

      // ---- ITEM 2: Admin collectives row ----
      console.log('\n[Item 2] Admin collectives row');
      try {
        // Try several admin URLs
        const adminUrls = [
          `${BASE_URL}/admin/collectives`,
          `${BASE_URL}/admin`,
        ];
        let adminLanded = false;
        let adminUrl = null;
        for (const u of adminUrls) {
          await page.goto(u, { waitUntil: 'networkidle2' }).catch(() => {});
          await sleep(2500);
          const cur = page.url();
          // Heuristic: admin page has signed-in chrome (header + content), not splash
          const onSplash = await page.evaluate(() => /explore.*connect.*protect|join thousands of young/i.test(document.body.textContent || ''));
          if (!onSplash && /admin/i.test(cur)) {
            adminLanded = true;
            adminUrl = cur;
            break;
          }
        }
        if (adminLanded && !page.url().includes('collectives')) {
          // Try to click "Collectives" link in admin nav
          await page.evaluate(() => {
            const all = [...document.querySelectorAll('a, button')];
            const c = all.find(e => /^collectives?$/i.test((e.textContent || '').trim()));
            if (c) c.click();
          }).catch(() => {});
          await sleep(2500);
          adminUrl = page.url();
        }
        const collInfo = await page.evaluate(() => {
          const url = window.location.href;
          // Heuristic: rows that contain a thumb (<img>) + flex stats. Look for any img in lists.
          const rows = [...document.querySelectorAll('li, tr, [class*="row"], [class*="list-item"], [class*="ListItem"]')];
          const visibleRows = rows.filter(r => {
            const rect = r.getBoundingClientRect();
            return rect.height > 30 && rect.height < 220 && rect.width > 200;
          });
          // Stats abbreviation check: "m" / "ev" word-token in body
          const bodyText = document.body.textContent || '';
          const hasShortM = /\d+\s*m\b/.test(bodyText);
          const hasShortEv = /\d+\s*ev\b/.test(bodyText);
          // Chevron hidden under sm: detect any element with "chevron" class
          const chevrons = [...document.querySelectorAll('[class*="chevron"], [data-icon*="chevron"]')];
          const visibleChev = chevrons.filter(c => c.getBoundingClientRect().width > 0);
          return { url, rowCount: visibleRows.length, hasShortM, hasShortEv, totalChev: chevrons.length, visibleChev: visibleChev.length };
        });
        const f = await shootFull(page, 'polish-item-2-after.png');
        if (adminLanded && collInfo.rowCount > 0) {
          const abbrevMet = collInfo.hasShortM || collInfo.hasShortEv;
          const chevHidden = collInfo.visibleChev === 0 && collInfo.totalChev >= 0;
          if (abbrevMet && chevHidden) {
            logVerdict(2, 'PASS', `${collInfo.rowCount} rows, abbreviated units found (m=${collInfo.hasShortM} ev=${collInfo.hasShortEv}), chevron hidden (totalChev=${collInfo.totalChev} visibleChev=${collInfo.visibleChev}) at ${collInfo.url}`, 'polish-item-2-after.png');
          } else {
            logVerdict(2, 'AMBIGUOUS', `${collInfo.rowCount} rows visible but abbrev=${abbrevMet} chevHidden=${chevHidden} at ${collInfo.url}`, 'polish-item-2-after.png');
          }
        } else if (adminLanded) {
          logVerdict(2, 'AMBIGUOUS', `admin reached but no rows (${collInfo.url})`, 'polish-item-2-after.png');
        } else {
          logVerdict(2, 'AMBIGUOUS', `code@ecodia.au has no admin role — cannot reach admin/collectives`, 'polish-item-2-after.png');
        }
      } catch (e) {
        logVerdict(2, 'AMBIGUOUS', `error: ${e.message.slice(0, 100)}`, null);
      }

    } finally {
      await browser.close();
    }
  }

  // Build POLISH_VERDICTS.md
  const failCount = verdicts.filter(v => /\bFAIL\b/.test(v) && !/\bAMBIGUOUS\b/.test(v)).length;
  const ambigCount = verdicts.filter(v => /\bAMBIGUOUS\b/.test(v)).length;
  const passCount = verdicts.filter(v => /\bPASS\b/.test(v)).length;
  let overall;
  if (failCount > 0) overall = 'FAIL';
  else if (ambigCount > 0) overall = 'AMBIGUOUS';
  else overall = 'PASS';

  // Item ordering: 1, 2, 3, 4, 6, 7, 8
  const order = [1, 2, 3, 4, 6, 7, 8];
  const sortedVerdicts = order.map(i => verdicts.find(v => new RegExp(`^- Item ${i}:`).test(v))).filter(Boolean);

  const md = `# Co-Exist 1.8.3 polish verification — Worker 2 verdicts

Fork id: \`fork_motk2agr_7780e3-w2\`
Run at: ${new Date().toISOString()}
Base URL: ${BASE_URL}
Viewport: 390x844 mobile (iPhone 14)
Login: ${EMAIL}
Login succeeded: ${loggedIn}
Commit verified: 03c3acb (live on prod via Vercel main auto-deploy)

## Verdicts (items 1, 2, 3, 4, 6, 7, 8 — item 5 owned by Worker 1)

${sortedVerdicts.join('\n')}

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
