(() => {
  const lines = document.body.innerText.split('\n').filter(s => s.trim() && s.length < 200).slice(0, 100);
  return JSON.stringify({ lines });
})()
