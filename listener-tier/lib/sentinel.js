'use strict'

const chokidar = require('chokidar')

function watch(globs, { debounceMs = 500, ignoreInitial = true } = {}) {
  return chokidar.watch(globs, {
    ignoreInitial,
    awaitWriteFinish: {
      stabilityThreshold: debounceMs,
      pollInterval: 100,
    },
    persistent: true,
  })
}

function debounce(fn, ms) {
  let timer = null
  let pendingArgs = null
  return function debounced(...args) {
    pendingArgs = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const a = pendingArgs
      pendingArgs = null
      timer = null
      Promise.resolve(fn.apply(null, a)).catch(err => {
        process.stderr.write(`[listener-tier] debounced handler threw: ${err.message}\n`)
      })
    }, ms)
  }
}

module.exports = { watch, debounce }
