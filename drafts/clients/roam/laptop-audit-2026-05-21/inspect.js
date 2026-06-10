(()=>{
  const wrap = document.querySelector('.roam-tabs-wrap');
  const nav = document.querySelector('.roam-tabs');
  const tabs = Array.from(document.querySelectorAll('.roam-tab'));
  const offline = document.querySelector('[class*="offline"], [data-offline]');
  if(!wrap||!nav) return JSON.stringify({error:'no tabbar'});
  const cs = getComputedStyle(nav);
  const wcs = getComputedStyle(wrap);
  return JSON.stringify({
    viewport: {w: window.innerWidth, h: window.innerHeight},
    wrap: {w: wrap.offsetWidth, h: wrap.offsetHeight, pos: wcs.position, top: wcs.top, bottom: wcs.bottom, left: wcs.left, right: wcs.right, zIndex: wcs.zIndex},
    nav: {w: nav.offsetWidth, h: nav.offsetHeight, flexDir: cs.flexDirection, justify: cs.justifyContent, align: cs.alignItems, padding: cs.padding, gap: cs.gap, bg: cs.backgroundColor},
    tabs: tabs.map(t=>{const r=t.getBoundingClientRect();return {label:t.getAttribute('aria-label'),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}}),
    mediaMatches: { md900: matchMedia('(min-width: 900px)').matches, md768: matchMedia('(min-width: 768px)').matches },
    serverBanner: { exists: !!offline, html: offline ? offline.outerHTML.slice(0,300) : null },
    main: (()=>{const m=document.querySelector('.roam-main');if(!m) return null;const mcs=getComputedStyle(m);return {pos:mcs.position,left:mcs.left,right:mcs.right,top:mcs.top,bottom:mcs.bottom,inset:mcs.inset};})()
  }, null, 2);
})()
