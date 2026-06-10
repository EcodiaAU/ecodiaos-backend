(()=>{
  const sheet = document.querySelector('.trip-bottom-sheet[data-desktop-open]');
  const wrap = document.querySelector('.trip-bottom-sheet-wrap');
  const ptpane = document.querySelector('.pt-pane');
  const ptwrap = document.querySelector('.pt-wrap');
  const main = document.querySelector('.roam-main');
  const rail = document.querySelector('.roam-tabs-wrap');
  const welcome = document.querySelector('[class*="welcome"], [class*="Welcome"], [class*="onboard"]');

  const probe = (el, name) => {
    if (!el) return {name, missing: true};
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {name, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
            position: cs.position, left: cs.left, transform: cs.transform, willChange: cs.willChange,
            zIndex: cs.zIndex, display: cs.display};
  };

  return JSON.stringify({
    viewport: {w: window.innerWidth, h: window.innerHeight},
    rail: probe(rail, 'rail'),
    main: probe(main, '.roam-main'),
    ptwrap: probe(ptwrap, '.pt-wrap'),
    ptpane: probe(ptpane, '.pt-pane'),
    sheet_wrap: probe(wrap, '.trip-bottom-sheet-wrap'),
    sheet: probe(sheet, '.trip-bottom-sheet[data-desktop-open]'),
    welcome_overlay: probe(welcome, 'welcome'),
    htmlAttrs: {
      desktopPanelOpen: document.documentElement.getAttribute('data-desktop-panel-open'),
      bodyTripSheet: document.body.getAttribute('data-trip-sheet')
    }
  }, null, 2);
})()
