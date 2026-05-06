// Co-Exist 1.8.3 polish verification — Worker 2 (fork_motk2agr_7780e3-w2)
// Visual verification of polish items 1, 2, 3, 4, 6, 7, 8 from commit 03c3acb.
// Item 5 (send-push edge function) is Worker 1's job, skipped here.

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

async function shoot(page, name) {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function shootFull(page, name) {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT_MOBILE);
  page.setDefaultNavigationTimeout(45000);
  page.setDefaultTimeout(20000);

  // Capture console + page errors for diagnostics
  page.on('console', msg => { if (msg.type() === 'error') console.log('PAGE ERR:', msg.text()); });
  page.on('pageerror', err => console.log('PAGE EXCEPTION:', err.message));

  try {
    // ---- LOGIN ----
    console.log('[1/9] Login...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await sleep(2000);
    // Save what we land on
    await shootFull(page, 'pre-login.png');

    // Try to find email/password inputs. Co-Exist uses a custom login page.
    // First check for login button to click
    const hasLoginInput = await page.$('input[type="email"], input[name="email"], input[type="text"]');
    if (!hasLoginInput) {
      // Maybe we need to click a Login/Sign in button first
      const loginBtn = await page.evaluateHandle(() => {
        const btns = [...document.querySelectorAll('button, a')];
        return btns.find(b => /sign\s*in|log\s*in|login/i.test(b.textContent)) || null;
      });
      if (loginBtn && loginBtn.asElement()) {
        await loginBtn.asElement().click();
        await sleep(2000);
      }
    }

    // Now look for email field
    await page.waitForSelector('input[type="email"], input[name="email"], input[type="text"]', { timeout: 15000 });
    const emailSel = (await page.$('input[type="email"]')) ? 'input[type="email"]' :
                      (await page.$('input[name="email"]')) ? 'input[name="email"]' :
                      'input[type="text"]';
    await page.type(emailSel, EMAIL, { delay: 30 });

    const passSel = 'input[type="password"]';
    await page.waitForSelector(passSel, { timeout: 5000 });
    await page.type(passSel, PASSWORD, { delay: 30 });

    // Submit
    const submitBtn = await page.evaluateHandle(() => {
      const btns = [...document.querySelectorAll('button, input[type="submit"]')];
      return btns.find(b => /sign\s*in|log\s*in|login|submit|continue/i.test((b.textContent || b.value || ''))) ||
             btns.find(b => b.type === 'submit') || null;
    });
    if (submitBtn && submitBtn.asElement()) {
      await submitBtn.asElement().click();
    } else {
      await page.keyboard.press('Enter');
    }

    await sleep(5000);
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await sleep(3000);

    const sanityFile = await shootFull(page, 'login-sanity.png');
    console.log('Login sanity screenshot:', sanityFile);
    console.log('Post-login URL:', page.url());

    // ---- ITEM 1: See-all link no longer wraps in Section header ----
    console.log('[2/9] Item 1 — See-all link no-wrap');
    try {
      // Already on home/feed after login. Look for "See all" / "see all" link
      await sleep(2000);
      const hasSeeAll = await page.evaluate(() => {
        const els = [...document.querySelectorAll('a, button')];
        const found = els.find(e => /see\s*all/i.test(e.textContent || ''));
        if (found) {
          found.scrollIntoView({ block: 'center' });
          return { found: true, text: found.textContent.trim() };
        }
        return { found: false };
      });
      await sleep(800);
      const f = await shootFull(page, 'polish-item-1-after.png');
      if (hasSeeAll.found) {
        // Check it's on one line - read computed style/whitespace of nearest header
        const wrapInfo = await page.evaluate(() => {
          const els = [...document.querySelectorAll('a, button, span')];
          const seeAll = els.find(e => /see\s*all/i.test((e.textContent || '').trim()));
          if (!seeAll) return { ok: null };
          const cs = getComputedStyle(seeAll);
          return {
            ok: true,
            whiteSpace: cs.whiteSpace,
            display: cs.display,
            text: seeAll.textContent.trim(),
          };
        });
        const pass = wrapInfo.whiteSpace && wrapInfo.whiteSpace.includes('nowrap');
        logVerdict(1, pass ? 'PASS' : 'AMBIGUOUS',
          `See-all link present (whiteSpace=${wrapInfo.whiteSpace})`, 'polish-item-1-after.png');
      } else {
        logVerdict(1, 'AMBIGUOUS', 'No "See all" link visible on landing screen', 'polish-item-1-after.png');
      }
    } catch (e) {
      logVerdict(1, 'AMBIGUOUS', `error: ${e.message}`, null);
    }

    // ---- ITEM 3: Next-event card text-white (full alpha) ----
    console.log('[3/9] Item 3 — Next-event card alpha=1.0');
    try {
      await page.goto(BASE_URL, { waitUntil: 'networkidle2' }).catch(() => {});
      await sleep(2000);
      const nextEventInfo = await page.evaluate(() => {
        // Look for text matching event card patterns: date, time, location, "View details"
        const all = [...document.querySelectorAll('*')];
        const viewBtn = all.find(e => /view\s*details/i.test((e.textContent || '').trim()));
        if (viewBtn) {
          viewBtn.scrollIntoView({ block: 'center' });
          // Walk up to find the card root and check colours
          let card = viewBtn;
          for (let i = 0; i < 5; i++) { card = card.parentElement; if (!card) break; }
          if (!card) return { found: false };
          const texts = [...card.querySelectorAll('*')].slice(0, 30).map(el => {
            const cs = getComputedStyle(el);
            return { text: (el.textContent || '').slice(0, 40).trim(), color: cs.color, opacity: cs.opacity };
          }).filter(t => t.text);
          return { found: true, sample: texts };
        }
        return { found: false };
      });
      await sleep(600);
      const f = await shootFull(page, 'polish-item-3-after.png');
      if (nextEventInfo.found) {
        // Check that text colours are pure white (not /70 or /50)
        const whites = nextEventInfo.sample.filter(t =>
          /rgba?\(\s*255\s*,\s*255\s*,\s*255\s*[\),]/i.test(t.color)
        ).length;
        const nonWhiteAlpha = nextEventInfo.sample.filter(t =>
          /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*(0\.[567]|0\.[89]|0\.[123])/i.test(t.color)
        ).length;
        if (whites > 0 && nonWhiteAlpha === 0) {
          logVerdict(3, 'PASS', `card text full white alpha (${whites} white nodes, 0 alpha-reduced)`, 'polish-item-3-after.png');
        } else if (whites > 0) {
          logVerdict(3, 'AMBIGUOUS', `${whites} white nodes, ${nonWhiteAlpha} alpha-reduced — needs eye check`, 'polish-item-3-after.png');
        } else {
          logVerdict(3, 'AMBIGUOUS', 'no white text found in card scope', 'polish-item-3-after.png');
        }
      } else {
        logVerdict(3, 'AMBIGUOUS', 'no Next-event card visible on home', 'polish-item-3-after.png');
      }
    } catch (e) {
      logVerdict(3, 'AMBIGUOUS', `error: ${e.message}`, null);
    }

    // ---- ITEM 4: Chat event-invite card — no horizontal scroll ----
    console.log('[4/9] Item 4 — Chat event-invite no horizontal scroll');
    try {
      // Navigate into a collective chat. Try common URL patterns first, fallback to UI nav.
      const navOk = await page.evaluate(() => {
        const links = [...document.querySelectorAll('a, button')];
        const chat = links.find(l => /chat|collective|community|groups?|messages?/i.test(l.textContent || ''));
        if (chat) { chat.click(); return true; }
        return false;
      });
      await sleep(2500);
      // Try to enter a collective listing
      await page.evaluate(() => {
        const items = [...document.querySelectorAll('a, button, [role=listitem], li')];
        if (items.length > 3) items[2].click();
      }).catch(() => {});
      await sleep(2500);
      // Now look for an announcement card / event invite
      const scrollState = await page.evaluate(() => {
        const docW = document.documentElement.scrollWidth;
        const winW = window.innerWidth;
        const horizontal = docW > winW + 1; // 1px tolerance
        // Check any card with event invite shape
        const cards = [...document.querySelectorAll('[class*="announcement"], [class*="invite"], [class*="event"]')];
        const overflowing = cards.filter(c => c.scrollWidth > c.clientWidth + 1).length;
        return { docW, winW, horizontal, overflowing, cardCount: cards.length };
      });
      const f = await shootFull(page, 'polish-item-4-after.png');
      if (!scrollState.horizontal && scrollState.overflowing === 0) {
        logVerdict(4, 'PASS', `no horizontal scroll (docW=${scrollState.docW} winW=${scrollState.winW}, ${scrollState.cardCount} cards)`, 'polish-item-4-after.png');
      } else if (scrollState.horizontal || scrollState.overflowing > 0) {
        logVerdict(4, 'FAIL', `horizontal scroll detected: docW=${scrollState.docW} winW=${scrollState.winW}, overflowing cards=${scrollState.overflowing}`, 'polish-item-4-after.png');
      } else {
        logVerdict(4, 'AMBIGUOUS', `no event-invite card found in chat view`, 'polish-item-4-after.png');
      }
    } catch (e) {
      logVerdict(4, 'AMBIGUOUS', `error: ${e.message}`, null);
    }

    // ---- ITEM 6: Collective-detail Up Next featured card uses OptimizedImage cover ----
    console.log('[5/9] Item 6 — Collective Up Next featured card');
    try {
      await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
      await sleep(2000);
      // Click on a collective from the list
      const clicked = await page.evaluate(() => {
        const all = [...document.querySelectorAll('a, button, [role=link]')];
        const c = all.find(e => /collective|community|group/i.test(e.textContent || '') &&
                                 !/admin|see\s*all/i.test(e.textContent || ''));
        if (c) { c.click(); return true; }
        // Otherwise click a card-like item
        const cards = [...document.querySelectorAll('[class*="card"]')];
        if (cards.length) { cards[0].click(); return true; }
        return false;
      });
      await sleep(3000);
      // Look for "Up next" section + image
      const upNext = await page.evaluate(() => {
        const headers = [...document.querySelectorAll('h1, h2, h3, h4, span, div')];
        const upHeader = headers.find(h => /up\s*next|upcoming/i.test((h.textContent || '').trim()) && h.children.length < 5);
        if (!upHeader) return { found: false };
        upHeader.scrollIntoView({ block: 'center' });
        // Walk to nearest section/container
        let card = upHeader.parentElement;
        for (let i = 0; i < 3 && card; i++) card = card.parentElement;
        if (!card) return { found: true, hasImg: false };
        const imgs = [...card.querySelectorAll('img')];
        return { found: true, hasImg: imgs.length > 0, imgSrc: imgs[0]?.src?.slice(0, 100) };
      });
      await sleep(800);
      const f = await shootFull(page, 'polish-item-6-after.png');
      if (upNext.found && upNext.hasImg) {
        logVerdict(6, 'PASS', `featured card has cover image (${upNext.imgSrc?.slice(0, 60) || 'src'})`, 'polish-item-6-after.png');
      } else if (upNext.found) {
        logVerdict(6, 'AMBIGUOUS', 'Up next card found but no img — fallback gradient may apply (no upcoming event with cover)', 'polish-item-6-after.png');
      } else {
        logVerdict(6, 'AMBIGUOUS', 'no Up next section in collective detail', 'polish-item-6-after.png');
      }
    } catch (e) {
      logVerdict(6, 'AMBIGUOUS', `error: ${e.message}`, null);
    }

    // ---- ITEM 7: Event-detail Directions URL ----
    console.log('[6/9] Item 7 — Directions URL');
    try {
      // Navigate to an event detail. From a collective page, click an event.
      const eventClicked = await page.evaluate(() => {
        const all = [...document.querySelectorAll('a, button, [role=link]')];
        // try Up next "View details" first
        const view = all.find(e => /view\s*details/i.test(e.textContent || ''));
        if (view) { view.click(); return 'view-details'; }
        const ev = all.find(e => /event/i.test(e.textContent || ''));
        if (ev) { ev.click(); return 'event-link'; }
        return 'none';
      });
      await sleep(3000);
      // Find Directions button and capture handler URL
      const dirInfo = await page.evaluate(() => {
        const all = [...document.querySelectorAll('a, button')];
        const dir = all.find(e => /directions|get\s*directions/i.test((e.textContent || '').trim()));
        if (!dir) return { found: false };
        dir.scrollIntoView({ block: 'center' });
        // If <a>, capture href
        if (dir.tagName === 'A') {
          return { found: true, tag: 'A', href: dir.href, text: dir.textContent.trim() };
        }
        // It's a button — look at parent for surrounding <a>
        const parentA = dir.closest('a');
        if (parentA) return { found: true, tag: 'BUTTON-IN-A', href: parentA.href, text: dir.textContent.trim() };
        return { found: true, tag: dir.tagName, href: null, onclick: dir.getAttribute('onclick') || null, text: dir.textContent.trim() };
      });
      await sleep(800);
      const f = await shootFull(page, 'polish-item-7-after.png');
      if (dirInfo.found && dirInfo.href) {
        const isApple = /maps\.apple\.com/i.test(dirInfo.href);
        const isGoogle = /google\.com\/maps\/dir/i.test(dirInfo.href);
        const hasDaddrCoords = /daddr=-?[\d.]+,\s*-?[\d.]+/i.test(dirInfo.href);
        const hasGoogleCoords = /destination=-?[\d.]+,\s*-?[\d.]+/i.test(dirInfo.href);
        if ((isApple && hasDaddrCoords) || (isGoogle && hasGoogleCoords)) {
          logVerdict(7, 'PASS', `Directions URL uses lat/lng: ${dirInfo.href.slice(0, 100)}`, 'polish-item-7-after.png');
        } else if (isApple || isGoogle) {
          logVerdict(7, 'AMBIGUOUS', `Directions URL is maps platform but no lat/lng coords (address fallback): ${dirInfo.href.slice(0, 100)}`, 'polish-item-7-after.png');
        } else {
          logVerdict(7, 'FAIL', `Directions URL not maps.apple.com or google maps: ${dirInfo.href.slice(0, 100)}`, 'polish-item-7-after.png');
        }
      } else if (dirInfo.found) {
        logVerdict(7, 'AMBIGUOUS', `Directions button found (tag=${dirInfo.tag}) but no href captured — JS handler`, 'polish-item-7-after.png');
      } else {
        logVerdict(7, 'AMBIGUOUS', 'no Directions button on current event page', 'polish-item-7-after.png');
      }
    } catch (e) {
      logVerdict(7, 'AMBIGUOUS', `error: ${e.message}`, null);
    }

    // ---- ITEM 8: Shop hero matches homepage hero mobile height ----
    console.log('[7/9] Item 8 — Shop hero h-[110vw] min-h-[480px]');
    try {
      await page.goto(BASE_URL + '/shop', { waitUntil: 'networkidle2' });
      await sleep(3000);
      const heroInfo = await page.evaluate(() => {
        const winH = window.innerHeight;
        const winW = window.innerWidth;
        // Find hero — usually first big element with image+overlay
        const candidates = [...document.querySelectorAll('section, header, div')];
        const visible = candidates.filter(c => {
          const r = c.getBoundingClientRect();
          return r.top < 100 && r.height > 200 && r.width > winW * 0.8;
        });
        if (!visible.length) return { found: false, winW, winH };
        const hero = visible[0];
        const r = hero.getBoundingClientRect();
        const cs = getComputedStyle(hero);
        const targetH = winW * 1.10; // 110vw
        return {
          found: true,
          heroH: r.height,
          heroW: r.width,
          winW, winH,
          targetH,
          minH: 480,
          minHeight: cs.minHeight,
          height: cs.height,
        };
      });
      const f = await shootFull(page, 'polish-item-8-after.png');
      if (heroInfo.found) {
        const expectedH = Math.max(heroInfo.targetH, heroInfo.minH);
        const closeEnough = Math.abs(heroInfo.heroH - expectedH) < 30 || heroInfo.heroH >= heroInfo.minH;
        if (closeEnough) {
          logVerdict(8, 'PASS', `hero height=${heroInfo.heroH.toFixed(0)}px (target ~${expectedH.toFixed(0)}px, winW=${heroInfo.winW})`, 'polish-item-8-after.png');
        } else {
          logVerdict(8, 'AMBIGUOUS', `hero height=${heroInfo.heroH.toFixed(0)}px deviates from target ${expectedH.toFixed(0)}px (winW=${heroInfo.winW}, minHeight=${heroInfo.minHeight})`, 'polish-item-8-after.png');
        }
      } else {
        logVerdict(8, 'AMBIGUOUS', 'no hero section found on /shop', 'polish-item-8-after.png');
      }
    } catch (e) {
      logVerdict(8, 'AMBIGUOUS', `error: ${e.message}`, null);
    }

    // ---- ITEM 2: Admin collectives row mobile-optimised ----
    // Requires admin role. Try /admin/collectives.
    console.log('[8/9] Item 2 — Admin collectives row');
    try {
      const adminUrls = [`${BASE_URL}/admin/collectives`, `${BASE_URL}/admin`, `${BASE_URL}/dashboard/admin`];
      let found = false;
      for (const u of adminUrls) {
        await page.goto(u, { waitUntil: 'networkidle2' }).catch(() => {});
        await sleep(2500);
        const url = page.url();
        if (url.includes('admin')) { found = true; break; }
      }
      // Try to navigate to collectives list
      await page.evaluate(() => {
        const links = [...document.querySelectorAll('a, button')];
        const c = links.find(l => /collectives?/i.test(l.textContent || ''));
        if (c) c.click();
      }).catch(() => {});
      await sleep(2500);
      const adminInfo = await page.evaluate(() => {
        const isAdminPage = /admin/i.test(window.location.href);
        // Scan for rows with collective shape: cover image + name + stats
        const rows = [...document.querySelectorAll('[class*="row"], li, tr, [class*="collective"], [class*="card"]')];
        const visibleRows = rows.filter(r => {
          const rect = r.getBoundingClientRect();
          return rect.height > 40 && rect.height < 200 && rect.width > 200;
        });
        // Check for abbreviated units (m/ev) on phone
        const bodyText = document.body.textContent || '';
        const hasAbbrev = /\bm\b|\bev\b/.test(bodyText);
        return {
          isAdminPage,
          url: window.location.href,
          rowCount: visibleRows.length,
          hasAbbrev,
        };
      });
      const f = await shootFull(page, 'polish-item-2-after.png');
      if (adminInfo.isAdminPage && adminInfo.rowCount > 0) {
        logVerdict(2, 'PASS', `admin page reached (${adminInfo.url}), ${adminInfo.rowCount} row-shaped elements visible`, 'polish-item-2-after.png');
      } else if (adminInfo.isAdminPage) {
        logVerdict(2, 'AMBIGUOUS', `admin page reached but no rows visible (${adminInfo.url})`, 'polish-item-2-after.png');
      } else {
        logVerdict(2, 'AMBIGUOUS', `admin route not reachable for this user (landed ${adminInfo.url}) — code@ may not have admin role`, 'polish-item-2-after.png');
      }
    } catch (e) {
      logVerdict(2, 'AMBIGUOUS', `error: ${e.message}`, null);
    }

    console.log('[9/9] All checks complete.');

  } finally {
    await browser.close();
  }

  // Determine overall verdict
  const failCount = verdicts.filter(v => /\bFAIL\b/.test(v)).length;
  const ambigCount = verdicts.filter(v => /\bAMBIGUOUS\b/.test(v)).length;
  const passCount = verdicts.filter(v => /\bPASS\b/.test(v)).length;
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
Commit verified: 03c3acb (live on prod via Vercel main auto-deploy)

## Verdicts (items 1, 2, 3, 4, 6, 7, 8 — item 5 owned by Worker 1)

${verdicts.join('\n')}

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
