'use strict'

/**
 * Golden fixture manifest (climate W3).
 *
 * Every fixture recomputes a published figure: provenance is either
 * 'official-worked-example' (a worked example printed in the NGA Factors 2025
 * workbook) or 'derived-from-published-factors' (constructed as factor value x
 * activity amount from a cited published table). Each fixture file carries its
 * source URLs and factor vintage in its header comment and `source` block.
 */

module.exports = [
  require('./nga2025-example6-stationary-diesel'),
  require('./nga2025-example4-natural-gas'),
  require('./nga2025-example5-lng'),
  require('./nga2025-example7-transport-diesel'),
  require('./nga2025-example8-refrigerant-r410a'),
  require('./nga2025-example1-electricity-location'),
  require('./nga2025-example2-electricity-market'),
  require('./nger-method1-diesel-election'),
]
