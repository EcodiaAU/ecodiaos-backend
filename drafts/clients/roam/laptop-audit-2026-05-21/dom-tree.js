(()=>{
  // Find all position:fixed/absolute things in .roam-main and their bounding rects
  const main = document.querySelector('.roam-main') || document.body;
  const all = Array.from(main.querySelectorAll('*'));
  const fixed = [];
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || (cs.position === 'absolute' && el.tagName !== 'SPAN')) {
      const r = el.getBoundingClientRect();
      if (r.width > 100 && r.height > 100) {
        const cls = el.className || el.tagName.toLowerCase();
        fixed.push({
          cls: typeof cls === 'string' ? cls.slice(0, 80) : cls.baseVal?.slice(0, 80) || '',
          tag: el.tagName,
          pos: cs.position,
          x: Math.round(r.x), y: Math.round(r.y),
          w: Math.round(r.width), h: Math.round(r.height),
          zIndex: cs.zIndex,
          bg: cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : '',
        });
      }
    }
  }
  fixed.sort((a,b) => a.x - b.x || b.w - a.w);
  return JSON.stringify(fixed.slice(0, 25), null, 2);
})()
