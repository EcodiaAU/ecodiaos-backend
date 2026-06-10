#!/usr/bin/env node
// Verify the 5 fixes against the local dev server.
// Run: node walk-fixed.js [desktop|mobile]
const fs = require('fs');
const path = require('path');
const os = require('os');

const ALIAS = 'eos-cowork-chambers';
const AGENT = 'http://127.0.0.1:7456/api/tool';
const TOKEN = fs.readFileSync(path.join(os.homedir(), '.ecodiaos', 'laptop-agent.token'), 'utf8').trim();
const BASE = process.env.WALK_BASE || 'http://localhost:5173';
const OUT_ROOT = process.env.WALK_OUT || 'D:/.code/EcodiaOS/backend/drafts/chambers-qa-2026-05-25/post-fix';
const CREDS = { email: 'scycc-preview@ecodia.au', password: 'ChambersSCYCC2026!' };

const ROUTES = [
  ['01-home',                '/'],
  ['08-signin',              '/signin'],
  ['09-signup',              '/signup'],
  ['22-admin-events',        '/admin/events'],
  ['23-admin-members',       '/admin/members'],
  ['21-admin-onboarding',    '/admin/onboarding'],
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

async function ensureSignedIn() {
  await call('cdp.navigate', { alias: ALIAS, url: BASE + '/signin', waitUntil: 'domcontentloaded', timeout: 25000 });
  await sleep(3500);
  // Check if already signed in (signin redirects to /profile when authed).
  const probe = await call('cdp.runJs', { alias: ALIAS, js: 'JSON.stringify({url:location.href})' });
  if ((probe.value || '').includes('/profile')) {
    console.log('  already signed in on localhost');
    return;
  }
  // Otherwise fill + submit.
  await call('cdp.runJs', {
    alias: ALIAS,
    js: `(()=>{const inputs=document.querySelectorAll('input');const setN=(el,v)=>{const p=HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};setN(inputs[0],'${CREDS.email}');setN(inputs[1],'${CREDS.password}');return 'filled';})()`,
  });
  await sleep(300);
  await call('cdp.clickByTag', { alias: ALIAS, tag: 'BUTTON', text: 'Sign in' });
  await sleep(4500);
  const after = await call('cdp.runJs', { alias: ALIAS, js: 'JSON.stringify({url:location.href})' });
  console.log('  post-signin url:', (after.value || '').slice(0, 80));
}

async function walk(viewportName) {
  const vp = VIEWPORTS[viewportName];
  const outDir = path.join(OUT_ROOT, viewportName);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`==> ${viewportName} (${vp.width}x${vp.height})`);
  await call('cdp.viewport', { alias: ALIAS, ...vp });

  await ensureSignedIn();

  const report = [];
  for (const [slug, route] of ROUTES) {
    const url = BASE + route;
    process.stdout.write(`[${viewportName}] ${slug.padEnd(28)} ${route.padEnd(28)} `);
    try {
      await call('cdp.viewport', { alias: ALIAS, ...vp });
      try {
        await call('cdp.navigate', { alias: ALIAS, url, waitUntil: 'domcontentloaded', timeout: 25000 });
      } catch {}
      await call('cdp.viewport', { alias: ALIAS, ...vp });
      for (let i = 0; i < 50; i++) {
        const r = await call('cdp.runJs', {
          alias: ALIAS,
          js: `JSON.stringify({spin:!!document.querySelector('.animate-spin'),bodyLen:(document.body.innerText||'').length,hasH1:!!document.querySelector('h1,h2,main,[role="main"]')})`,
        });
        let s = {};
        try { s = JSON.parse(r?.value || '{}'); } catch {}
        if (!s.spin && s.hasH1 && s.bodyLen > 250) break;
        await sleep(400);
      }
      await sleep(1500);
      const shot = await call('cdp.pageScreenshot', { alias: ALIAS, fullPage: true });
      const buf = Buffer.from(shot.image, 'base64');
      const file = path.join(outDir, `${slug}.png`);
      fs.writeFileSync(file, buf);
      console.log(`OK ${(buf.length / 1024).toFixed(0)}KB`);
      report.push({ slug, route, sizeKB: Math.round(buf.length / 1024) });
    } catch (e) {
      console.log(`FAIL ${e.message}`);
      report.push({ slug, route, error: e.message });
    }
  }
  fs.writeFileSync(path.join(outDir, '_report.json'), JSON.stringify(report, null, 2));
}

(async () => {
  const target = process.argv[2] || 'both';
  if (target === 'desktop' || target === 'both') await walk('desktop');
  if (target === 'mobile' || target === 'both') await walk('mobile');
})().catch(e => { console.error(e); process.exit(1); });
