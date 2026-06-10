(()=>{
  const errs = [];
  const orig = console.error;
  console.error = (...a) => { errs.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); orig.apply(console, a); };
  return new Promise(resolve => {
    fetch('https://roam-backend-176723812810.australia-southeast1.run.app/health')
      .then(r => r.json())
      .then(j => resolve(JSON.stringify({fetchOk: true, body: j, recentErrors: errs.slice(-5)})))
      .catch(e => resolve(JSON.stringify({fetchOk: false, error: e.message, recentErrors: errs.slice(-5)})));
  });
})()
