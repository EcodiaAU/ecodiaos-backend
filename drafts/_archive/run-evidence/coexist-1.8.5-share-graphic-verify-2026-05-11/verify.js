#!/usr/bin/env node
/**
 * Visual verification script for Co-Exist 1.8.5 share graphic changes.
 * Renders HTML that mirrors the EventShareGraphic component output for all 3 sizes.
 * Captures both preview-scale and download-scale screenshots.
 *
 * Outputs:
 *   preview-375x667-1to1.png    — what user sees in BottomSheet tile (220px wide)
 *   preview-375x667-4to5.png
 *   preview-375x667-9to16.png
 *   download-1to1.png           — full-resolution output from html2canvas
 *   download-4to5.png
 *   download-9to16.png
 */

const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

const OUT_DIR = __dirname

/* -- Co-Exist palette ------------------------------------------------- */
const BRAND_GREEN_400   = '#869e62'
const BRAND_GREEN_700   = '#4a5c34'
const BRAND_LIGHT_GREEN = '#e8eddf'   // primary-100, replaces tan/cream
const SCRIM             = '10, 23, 4' // near-black with green cast

/* -- Sizes ------------------------------------------------------------- */
const SIZES = {
  square:   { width: 1080, height: 1080, label: 'Square',   aspect: '1:1',  slug: '1to1'  },
  portrait: { width: 1080, height: 1350, label: 'Portrait', aspect: '4:5',  slug: '4to5'  },
  story:    { width: 1080, height: 1920, label: 'Story',    aspect: '9:16', slug: '9to16' },
}

/* -- Per-size tuning (mirrors TUNING in event-share-graphic.tsx) ------- */
const TUNING = {
  square:   { wmSz: 38, titleSz: 78, dateSz: 30, locnSz: 26, badgeH: 52, px: 48, pb: 44, topVig: 14, botClear: 44 },
  portrait: { wmSz: 42, titleSz: 88, dateSz: 34, locnSz: 30, badgeH: 60, px: 56, pb: 52, topVig: 13, botClear: 40 },
  story:    { wmSz: 46, titleSz: 96, dateSz: 36, locnSz: 32, badgeH: 68, px: 60, pb: 64, topVig: 11, botClear: 35 },
}

/* -- Sample event data ------------------------------------------------- */
const EVENT = {
  title:     'Shoreline Revegetation Working Bee',
  dateLabel: 'Sat, 10 May 2026 · 9:00 AM',
  location:  'Shelly Beach Reserve, Caloundra QLD',
  collective:'Sunshine Coast Wildlife Collective',
}

/* -- HTML generator ---------------------------------------------------- */
function makeGraphicHtml(sizeKey) {
  const spec = SIZES[sizeKey]
  const t    = TUNING[sizeKey]
  const w    = spec.width
  const h    = spec.height

  const topVig     = `linear-gradient(180deg, rgba(${SCRIM},0.42) 0%, rgba(${SCRIM},0) ${t.topVig}%)`
  const bottomScrim = `linear-gradient(0deg, rgba(${SCRIM},0.97) 0%, rgba(${SCRIM},0.82) 20%, rgba(${SCRIM},0) ${t.botClear}%)`
  const bgGradient  = `linear-gradient(150deg, ${BRAND_GREEN_400} 0%, ${BRAND_GREEN_700} 100%)`

  const joinSz   = Math.round(t.dateSz * 0.62)
  const joinMb   = Math.round(t.dateSz * 0.55)
  const titleMb  = Math.round(t.titleSz * 0.26)
  const collSz   = Math.round(t.locnSz * 0.85)
  const divMy    = Math.round(t.dateSz * 0.72)
  const divMb    = Math.round(t.dateSz * 0.60)
  const ctaSz    = Math.round(t.locnSz * 0.68)
  const ctaMb    = Math.round(t.badgeH * 0.25)
  const badgeGap = Math.round(t.badgeH * 0.28)

  // Badge heights scale: AppStore 140/42 ratio, GooglePlay 155/42 ratio
  const asW  = Math.round(t.badgeH * (140 / 42))
  const gpW  = Math.round(t.badgeH * (155 / 42))

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1a1a1a; display: flex; align-items: flex-start; justify-content: flex-start; }
</style>
</head>
<body>
<div style="
  width:${w}px; height:${h}px;
  background:${BRAND_LIGHT_GREEN};
  font-family:system-ui,-apple-system,'Helvetica Neue',sans-serif;
  overflow:hidden; position:relative;
" data-share-size="${sizeKey}">

  <!-- Layer 1: full-bleed brand gradient (no image in verify script) -->
  <div style="position:absolute;inset:0;background:${bgGradient};"></div>

  <!-- Layer 2: top vignette -->
  <div style="position:absolute;inset:0;background:${topVig};"></div>

  <!-- Layer 3: bottom scrim -->
  <div style="position:absolute;inset:0;background:${bottomScrim};"></div>

  <!-- Wordmark -->
  <div style="position:absolute;top:36px;left:${t.px}px;">
    <span style="
      font-size:${t.wmSz}px;font-weight:800;letter-spacing:-0.02em;
      color:#fff;line-height:1;
      text-shadow:0 2px 14px rgba(0,0,0,0.50);
    ">Co<span style="opacity:0.85">-</span>Exist</span>
  </div>

  <!-- Content block anchored to bottom -->
  <div style="
    position:absolute;bottom:0;left:0;right:0;
    padding:0 ${t.px}px ${t.pb}px;
    display:flex;flex-direction:column;
  ">
    <!-- "Join us" overline -->
    <div style="
      font-size:${joinSz}px;font-weight:700;
      letter-spacing:0.18em;text-transform:uppercase;
      color:${BRAND_GREEN_400};margin-bottom:${joinMb}px;
    ">Join us</div>

    <!-- Title -->
    <div style="
      font-size:${t.titleSz}px;line-height:1.02;font-weight:800;
      letter-spacing:-0.025em;color:#fff;margin:0 0 ${titleMb}px;
      word-break:break-word;
    ">${EVENT.title}</div>

    <!-- Date -->
    <div style="font-size:${t.dateSz}px;font-weight:600;color:rgba(255,255,255,0.93);line-height:1.35;">
      ${EVENT.dateLabel}
    </div>

    <!-- Location -->
    <div style="font-size:${t.locnSz}px;color:rgba(255,255,255,0.76);margin-top:8px;line-height:1.4;">
      ${EVENT.location}
    </div>

    <!-- Collective -->
    <div style="font-size:${collSz}px;color:${BRAND_GREEN_400};margin-top:12px;font-weight:600;">
      by ${EVENT.collective}
    </div>

    <!-- Divider -->
    <div style="
      width:100%;height:1px;background:rgba(255,255,255,0.18);
      margin:${divMy}px 0 ${divMb}px;
    "></div>

    <!-- CTA -->
    <div style="font-size:${ctaSz}px;color:rgba(255,255,255,0.65);margin-bottom:${ctaMb}px;font-weight:500;letter-spacing:0.01em;">
      Find this event on Co-Exist
    </div>

    <!-- Badges (SVG inline) -->
    <div style="display:flex;gap:${badgeGap}px;">
      <svg width="${asW}" height="${t.badgeH}" viewBox="0 0 140 42" xmlns="http://www.w3.org/2000/svg">
        <rect width="140" height="42" rx="8" fill="#000"/>
        <path d="M30.4 22.2c0-3.4 2.8-5 2.9-5.1-1.6-2.3-4-2.6-4.9-2.6-2.1-.2-4 1.2-5.1 1.2-1.1 0-2.7-1.2-4.4-1.2-2.3.1-4.4 1.3-5.5 3.4-2.4 4.1-.6 10.1 1.7 13.4 1.1 1.6 2.5 3.4 4.2 3.3 1.7-.1 2.4-1.1 4.5-1.1 2.1 0 2.7 1.1 4.5 1.1 1.9 0 3-1.6 4.2-3.2 1.3-1.8 1.8-3.6 1.9-3.7-.1 0-3.6-1.4-3.6-5.5zM27.1 12.6c.9-1.1 1.6-2.7 1.4-4.3-1.4 0-3.1.9-4.1 2-.9 1-1.7 2.6-1.5 4.1 1.6.2 3.2-.7 4.2-1.8z" fill="#fff"/>
        <text x="46" y="17" fill="#fff" font-family="-apple-system,system-ui,sans-serif" font-size="8.5" font-weight="400">Download on the</text>
        <text x="46" y="32" fill="#fff" font-family="-apple-system,system-ui,sans-serif" font-size="15" font-weight="600">App Store</text>
      </svg>
      <svg width="${gpW}" height="${t.badgeH}" viewBox="0 0 155 42" xmlns="http://www.w3.org/2000/svg">
        <rect width="155" height="42" rx="8" fill="#000"/>
        <g transform="translate(11 8)">
          <path d="M0 0v26l11.2-13L0 0z" fill="#00d4ff"/>
          <path d="M0 0l11.2 13L17 7.6 4.5 0H0z" fill="#00f076"/>
          <path d="M0 26l4.5-1L17 18.4 11.2 13 0 26z" fill="#ff3a44"/>
          <path d="M11.2 13l5.8 5.4 5.4-3.1c2.2-1.3 2.2-3.4 0-4.6L17 7.6 11.2 13z" fill="#ffce00"/>
        </g>
        <text x="46" y="17" fill="#fff" font-family="Roboto,system-ui,sans-serif" font-size="8.5" font-weight="400">GET IT ON</text>
        <text x="46" y="32" fill="#fff" font-family="Roboto,system-ui,sans-serif" font-size="15" font-weight="600">Google Play</text>
      </svg>
    </div>
  </div>
</div>
</body>
</html>`
}

/* -- Main -------------------------------------------------------------- */
async function run() {
  const browser = await chromium.launch()
  const page    = await browser.newPage()

  const PREVIEW_WIDTH = 220

  for (const [key, spec] of Object.entries(SIZES)) {
    const html = makeGraphicHtml(key)

    /* ---- Download screenshot (full resolution) ---- */
    await page.setViewportSize({ width: spec.width, height: spec.height })
    await page.setContent(html, { waitUntil: 'networkidle' })
    const dlPath = path.join(OUT_DIR, `download-${spec.slug}.png`)
    await page.locator(`[data-share-size="${key}"]`).screenshot({ path: dlPath })
    console.log(`✓ download-${spec.slug}.png  (${spec.width}×${spec.height})`)

    /* ---- Preview screenshot (CSS-scaled, 220px wide tile, 375px viewport) ---- */
    const scale     = PREVIEW_WIDTH / spec.width
    const tileH     = Math.round(spec.height * scale)
    const previewHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#f5f5f5; width:375px; }
</style></head><body>
<div style="
  width:${PREVIEW_WIDTH}px;height:${tileH}px;
  border-radius:16px;overflow:hidden;
  box-shadow:0 1px 3px rgba(0,0,0,0.15);
  position:relative;margin:20px;
">
  <div style="
    position:absolute;top:0;left:0;
    transform:scale(${scale});transform-origin:top left;
    width:${spec.width}px;height:${spec.height}px;
  ">
    ${makeGraphicHtml(key).replace(/<!DOCTYPE html>\n<html>.*?<body>/s, '').replace(/<\/body>\n<\/html>/, '')}
  </div>
</div>
</body></html>`

    await page.setViewportSize({ width: 375, height: tileH + 40 })
    await page.setContent(previewHtml, { waitUntil: 'networkidle' })
    const pvPath = path.join(OUT_DIR, `preview-375x667-${spec.slug}.png`)
    await page.screenshot({ path: pvPath, clip: { x: 0, y: 0, width: 375, height: tileH + 40 } })
    console.log(`✓ preview-375x667-${spec.slug}.png  (375×${tileH + 40}, tile ${PREVIEW_WIDTH}×${tileH})`)
  }

  await browser.close()
  console.log('\nAll verification screenshots captured.')
}

run().catch((e) => { console.error(e); process.exit(1) })
