# Methodology memo

Every disclosed figure in this memo resolves to an immutable calculation run recording its inputs hash, calculator code SHA, factor vintage and the evidence-register rows it consumed. Recalculation never rewrites a run; a factor-vintage change produces new runs with the old runs marked superseded (appendix B). All arithmetic on disclosed figures is exact scaled-integer; rounding occurs exactly once per figure, at the output boundary, into micro-tonnes CO2e.

Factor vintages in effect: 2025.

## 1. Method elections

Method election is recorded per facility on every calculation run (GHG Protocol default; NGER Determination methods where elected for NGER-covered facilities per AASB S2025-1, Dec 2025).

| Facility | Election | Basis |
| --- | --- | --- |
| fleet/diesel | GHG_PROTOCOL | engagement default |
| site/nsw-warehouse | GHG_PROTOCOL | engagement default |
| site/qld-office | GHG_PROTOCOL | engagement default |

## 2. Calculation methods applied

### electricityS2Location

Scope 2, location-based. E (t CO2e) = Q (kWh) x state grid emission factor (kg CO2e/kWh) / 1000 per the NGA state factor table for the vintage. Exact scaled-integer arithmetic; rounding once at the output boundary.

### electricityS2Market

Scope 2, market-based. Residual consumption (purchased kWh net of surrendered certificates) x residual mix factor, per the NGA market-based method. Exact scaled-integer arithmetic; rounding once at the output boundary.

### fuelCombustionS1

Scope 1, fuel combustion (stationary and transport). E (t CO2e, per gas) = Q x EC x EF_gas / 1000 per NGA Factors "Using emission factors"; scope 1 total is the sum over CO2, CH4 and N2O. Exact scaled-integer arithmetic; rounding once at the output boundary into micro-tonnes CO2e.

### refrigerantsS1

Scope 1, fugitive refrigerant emissions. E (t CO2e) = leakage (kg) x GWP / 1000 against the published GWP table for the elected factor set and vintage. Exact scaled-integer arithmetic; rounding once at the output boundary.

## 3. Current figures and their lineage

| Calculator | t CO2e | Calc run id | Factor vintage | Inputs hash | Code SHA | Evidence rows | Run at |
| --- | --- | --- | --- | --- | --- | --- | --- |
| electricityS2Location | 18620.000000 | 0610753c-bce2-4918-8fe0-90a0808dd77d | 2025 | 9ab7c16834a540a9af04fd0006dbf759d8f106009fc35c03101e3032658b8920 | f730a2de | 1 | 2026-06-10T05:30:00.000Z |
| electricityS2Market | 6839.611650 | bea4fd97-e775-4a46-9abf-5abadb65ac93 | 2025 | a71cee45c4b7af856dd7f8e3c8701391d2ffad986cdddb18bc3398faae8f0732 | f730a2de | 1 | 2026-06-10T05:30:00.000Z |
| fuelCombustionS1 | 27139.660000 | 8e7fdf53-ce3b-4cd9-b704-bec05a698a25 | 2025 | 12f518a78654c5ccc029768999e57812441865060fa66a853c1f4ba744e34499 | f730a2de | 1 | 2026-06-10T05:30:00.000Z |
| refrigerantsS1 | 0.202020 | b87ea601-f568-48b0-b8df-949eae1d6232 | 2025 | e1a09d1e60f49f6a221f2009d7e4910e84eb8e9256b1bd39c6ae1fcd4ad82f21 | f730a2de | 1 | 2026-06-10T05:30:00.000Z |

- 18620.000000 t CO2e (electricityS2Location) is the output of calc run `0610753c-bce2-4918-8fe0-90a0808dd77d` against factor vintage 2025, inputs hash `9ab7c16834a540a9af04fd0006dbf759d8f106009fc35c03101e3032658b8920`, consuming 1 evidence-register row(s).
- 6839.611650 t CO2e (electricityS2Market) is the output of calc run `bea4fd97-e775-4a46-9abf-5abadb65ac93` against factor vintage 2025, inputs hash `a71cee45c4b7af856dd7f8e3c8701391d2ffad986cdddb18bc3398faae8f0732`, consuming 1 evidence-register row(s).
- 27139.660000 t CO2e (fuelCombustionS1) is the output of calc run `8e7fdf53-ce3b-4cd9-b704-bec05a698a25` against factor vintage 2025, inputs hash `12f518a78654c5ccc029768999e57812441865060fa66a853c1f4ba744e34499`, consuming 1 evidence-register row(s).
- 0.202020 t CO2e (refrigerantsS1) is the output of calc run `b87ea601-f568-48b0-b8df-949eae1d6232` against factor vintage 2025, inputs hash `e1a09d1e60f49f6a221f2009d7e4910e84eb8e9256b1bd39c6ae1fcd4ad82f21`, consuming 1 evidence-register row(s).

## Appendix A. Emission factors consumed

| Factor set | Vintage | Category | Value | Unit | Effective from | Effective to | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NGA | 2025 | electricity.location.NSW_ACT.scope2 | 0.64 | kg CO2-e/kWh | 2025-07-01T00:00:00.000Z | 2026-06-30T00:00:00.000Z | https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf |
| NGA | 2025 | electricity.location.VIC.scope2 | 0.78 | kg CO2-e/kWh | 2025-07-01T00:00:00.000Z | 2026-06-30T00:00:00.000Z | https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf |
| NGA | 2025 | electricity.market.residual_mix.scope2 | 0.81 | kg CO2-e/kWh | 2025-07-01T00:00:00.000Z | 2026-06-30T00:00:00.000Z | https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf |
| NGA | 2025 | fuel.diesel_oil.transport_post_2004.ef_ch4 | 0.01 | kg CO2-e/GJ | 2025-07-01T00:00:00.000Z | 2026-06-30T00:00:00.000Z | https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf |
| NGA | 2025 | fuel.diesel_oil.transport_post_2004.ef_co2 | 69.9 | kg CO2-e/GJ | 2025-07-01T00:00:00.000Z | 2026-06-30T00:00:00.000Z | https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf |
| NGA | 2025 | fuel.diesel_oil.transport_post_2004.ef_n2o | 0.4 | kg CO2-e/GJ | 2025-07-01T00:00:00.000Z | 2026-06-30T00:00:00.000Z | https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf |
| NGA | 2025 | fuel.diesel_oil.transport_post_2004.energy_content | 38.6 | GJ/kL | 2025-07-01T00:00:00.000Z | 2026-06-30T00:00:00.000Z | https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf |
| NGA | 2025 | refrigerant.R410A.gwp | 1924 | kg CO2-e/kg | 2025-07-01T00:00:00.000Z | 2026-06-30T00:00:00.000Z | https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf |
| NGA | 2025 | refrigerant.leakage_rate.domestic_ac_split | 3.5 | percent/year | 2025-07-01T00:00:00.000Z | 2026-06-30T00:00:00.000Z | https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf |

## Appendix B. Superseded runs (lineage)

No superseded runs: no factor-vintage bump or recalculation has occurred over the supplied runs.
