(function () {
  var heads = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,div,span'));
  var target = heads.find(function (el) {
    return el.childNodes.length &&
      el.textContent.trim() === 'Trades Talk';
  });
  if (!target) return 'NOT FOUND';
  // walk up to a clickable ancestor (has onclick, role=button, or cursor pointer)
  var node = target;
  for (var i = 0; i < 6 && node; i++) {
    var st = window.getComputedStyle(node);
    var r = node.getBoundingClientRect();
    if ((st.cursor === 'pointer' || node.getAttribute('role') === 'button' || node.onclick) && r.width > 100) {
      return JSON.stringify({ found: true, tag: node.tagName, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, cursor: st.cursor });
    }
    node = node.parentElement;
  }
  var r2 = target.getBoundingClientRect();
  return JSON.stringify({ found: 'headingOnly', tag: target.tagName, x: r2.left + r2.width / 2, y: r2.top + r2.height / 2, w: r2.width, h: r2.height });
})()
