JSON.stringify(
  Array.from(document.getElementsByTagName('a'))
    .map(function (a) { return a.getAttribute('href'); })
    .filter(function (v, i, s) { return v && s.indexOf(v) === i; })
)
