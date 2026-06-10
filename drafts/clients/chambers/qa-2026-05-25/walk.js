#!/usr/bin/env node
// Chambers visual QA walker - desktop + mobile screenshots of all routes.
// Run: node D:/.code/EcodiaOS/backend/drafts/chambers-qa-2026-05-25/walk.js [desktop|mobile]
const fs = require('fs');
const path = require('path');
const os = require('os');

const ALIAS = 'eos-cowork-chambers';
const AGENT = 'http://127.0.0.1:7456/api/tool';
const TOKEN = fs.readFileSync(path.join(os.homedir(), '.ecodiaos', 'laptop-agent.token'), 'utf8').trim();
const OUT_ROOT = 'D:/.code/EcodiaOS/backend/drafts/chambers-qa-2026-05-25';

const ROUTES = [
  ['01-home', '/'],
  ['02-events', '/events'],
  ['03-members', '/members'],
  ['04-groups', '/groups'],
  ['05-resources', '/resources'],
  ['06-profile', '/profile'],
  ['07-feedback', '/feedback'],
  ['08-signin', '/signin'],
  ['09-signup', '/signup'],
  ['10-privacy', '/privacy'],
  ['11-terms', '/terms'],
  ['12-onboarding-chamber', '/onboarding/chamber'],
  ['20-admin', '/admin'],
  ['21-admin-onboarding', '/admin/onboarding'],
  ['22-admin-events', '/admin/events'],
  ['23-admin-members', '/admin/members'],
  ['24-admin-committees', '/admin/committees'],
  ['25-admin-groups', '/admin/groups'],
  ['26-admin-branding', '/admin/branding'],
  ['27-admin-notifications', '/admin/notifications'],
  ['28-admin-privacy', '/admin/privacy'],
  ['29-admin-billing', '/admin/billing'],
];

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, mobile: false, deviceScaleFactor: 1 },
  mobile:  { width: 390,  height: 844, mobile: true,  deviceScaleFactor: 2 },
};

async function call(tool, params) {
  const res = await fetch(AGENT, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, params }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${tool}: ${JSON.stringify(json)}`);
  return json.result;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function walk(viewportName) {
  const vp = VIEWPORTS[viewportName];
  const outDir = path.join(OUT_ROOT, viewportName);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`==> setting viewport ${viewportName} (${vp.width}x${vp.height})`);
  await call('cdp.viewport', { alias: ALIAS, ...vp });

  const report = [];
  for (const [slug, route] of ROUTES) {
    const url = 'https://chambers.ecodia.au' + route;
    process.stdout.write(`[${viewportName}] ${slug.padEnd(28)} ${route.padEnd(28)} `);
    try {
      // Re-assert viewport per-route - navigate can reset device-metrics override
      await call('cdp.viewport', { alias: ALIAS, ...vp });
      try {
        await call('cdp.navigate', { alias: ALIAS, url, waitUntil: 'domcontentloaded', timeout: 25000 });
      } catch (e) {
        process.stdout.write('[slow] ');
      }
      // Re-assert viewport again after navigate (defense in depth)
      await call('cdp.viewport', { alias: ALIAS, ...vp });
      // wait for the tenant-bootstrap spinner to be gone AND real content to be present
      let ready = false;
      for (let i = 0; i < 50; i++) {
        const r = await call('cdp.runJs', {
          alias: ALIAS,
          js: `JSON.stringify({
            spin: !!document.querySelector('.animate-spin'),
            bodyLen: (document.body.innerText||'').length,
            hasH1: !!document.querySelector('h1, h2, main, [role="main"]'),
            tenantNameVisible: (document.body.innerText||'').includes('Chamber of Commerce') || (document.body.innerText||'').includes('Officers only') || (document.body.innerText||'').includes('No chamber')
          })`,
        });
        let state = {};
        try { state = JSON.parse(r?.value ?? r?.result?.value ?? '{}'); } catch {}
        if (!state.spin && state.hasH1 && state.bodyLen > 250) { ready = true; break; }
        await sleep(400);
      }
      if (!ready) process.stdout.write('[no-ready] ');
      await sleep(1800); // final settle for animations / WaveDivider / lazy images
      const shot = await call('cdp.pageScreenshot', { alias: ALIAS, fullPage: true });
      const buf = Buffer.from(shot.image, 'base64');
      const file = path.join(outDir, `${slug}.png`);
      fs.writeFileSync(file, buf);
      // Snapshot final URL + title + visible-text fingerprint
      const meta = await call('cdp.runJs', {
        alias: ALIAS,
        js: `({url: location.href, title: document.title, bodyLen: (document.body.innerText||'').length, h1: (document.querySelector('h1')||{}).innerText||null, errs: (window.__cdpErrs||[]).slice(-3)})`,
      });
      console.log(`OK  ${(buf.length/1024).toFixed(0)}KB  ${meta?.result?.title?.slice(0,40) ?? ''}`);
      report.push({ slug, route, ...meta.result, file, sizeKB: Math.round(buf.length/1024) });
    } catch (e) {
      console.log(`FAIL ${e.message}`);
      report.push({ slug, route, error: e.message });
    }
  }

  fs.writeFileSync(path.join(outDir, '_report.json'), JSON.stringify(report, null, 2));
  console.log(`==> ${viewportName} done, report at ${outDir}/_report.json`);
}

(async () => {
  const target = process.argv[2] || 'both';
  if (target === 'desktop' || target === 'both') await walk('desktop');
  if (target === 'mobile' || target === 'both') await walk('mobile');
})().catch(e => { console.error(e); process.exit(1); });
