# Clause register source map (W4)

2026-06-10. Human-review sibling of `climate-migrations/seed/011_cd_clause_register_seed.sql`.

Sources, fetched 2026-06-10:

- AASB S2 Climate-related Disclosures, September 2024: https://standards.aasb.gov.au/sites/default/files/2024-10/AASBS2_09-24.pdf
- AASB S2025-1 Amendments to Greenhouse Gas Emissions Disclosures, December 2025: https://standards.aasb.gov.au/sites/default/files/2025-12/AASBS2025-1_12-25.pdf
- Treasury Laws Amendment (Financial Market Infrastructure and Other Measures) Act 2024 (No 87 of 2024), Schedule 4, which inserted Corporations Act 2001 ss 292A and 296A-296E: https://www.legislation.gov.au/C2024A00087/asmade/2024-09-17/text/1/pdf

Conventions. The clause_ref column in the seed is the stable clause key; cd_disclosure_drafts.clause_ref joins on it. The 006 table has no pillar column, so the pillar rides as a `pillar=` prefix in applicability_notes. Summaries are plain-English condensations of the cited paragraph, never reproductions; the published standard is the authoritative wording. Every requirement_summary was written against the fetched text above, not from memory. AASB S2025-1 amendments are applied throughout (the AASB rows carry standard_version `Sep 2024 (amended by AASB S2025-1 Dec 2025)`); rows whose substance S2025-1 touched are flagged AMENDED or ADDED below and inventoried at the end.

## Governance (9 rows)

AASB S2 para 6(a). Identify the governance body or individual responsible for climate oversight. Evidence: committee_charter, board_minutes, org_chart. Source: AASB S2 (Sep 2024) para 6(a) chapeau; objective at para 5.

AASB S2 para 6(a)(i). How climate responsibilities are reflected in terms of reference, mandates, role descriptions and related policies. Evidence: committee_charter, role_description, policy_doc. Source: AASB S2 para 6(a)(i).

AASB S2 para 6(a)(ii). How the body determines whether appropriate skills and competencies are available or will be developed. Evidence: board_skills_matrix, training_record, board_minutes. Source: AASB S2 para 6(a)(ii).

AASB S2 para 6(a)(iii). How and how often the body is informed about climate-related risks and opportunities. Evidence: board_minutes, management_report. Source: AASB S2 para 6(a)(iii).

AASB S2 para 6(a)(iv). How the body takes climate into account in overseeing strategy, major transactions and risk management, including trade-offs. Evidence: board_minutes, strategy_doc, risk_register. Source: AASB S2 para 6(a)(iv).

AASB S2 para 6(a)(v). How the body oversees target-setting and monitors progress, including remuneration-policy linkage. Evidence: board_minutes, target_record, remuneration_policy. Source: AASB S2 para 6(a)(v), cross-referencing paras 33-36 and 29(g).

AASB S2 para 6(b)(i). Management's role: delegation to a position or committee and how that is overseen. Evidence: org_chart, policy_doc, management_report. Source: AASB S2 para 6(b)(i).

AASB S2 para 6(b)(ii). Whether management uses controls and procedures for climate oversight and their integration with other functions. Evidence: policy_doc, management_report. Source: AASB S2 para 6(b)(ii).

AASB S2 paras 7 and Aus7.1. Avoid duplication via integrated governance disclosure where sustainability oversight is integrated, particularly under voluntary AASB S1 application. Evidence: disclosure_checklist. Source: AASB S2 paras 7 and Aus7.1.

## Strategy (24 rows)

Para 9 is a routing chapeau over paras 10-22 and is intentionally not a row; para 12 and para 23 were deleted by the AASB; para 17 is a presentation permission (single amount or range) folded into the 15-16(a) row note.

AASB S2 para 10(a). Describe the climate-related risks and opportunities that could reasonably affect the entity's prospects. Evidence: risk_register, risk_assessment_memo. Source: AASB S2 para 10(a).

AASB S2 para 10(b). Classify each risk as physical or transition. Evidence: risk_register. Source: AASB S2 para 10(b).

AASB S2 para 10(c). Time horizon (short, medium, long) per risk and opportunity. Evidence: risk_register, strategy_doc. Source: AASB S2 para 10(c).

AASB S2 para 10(d). How short, medium and long term are defined and linked to planning horizons. Evidence: strategy_doc, policy_doc. Source: AASB S2 para 10(d).

AASB S2 para 11. Use all reasonable and supportable information available without undue cost or effort when identifying risks and opportunities. Evidence: risk_assessment_memo, methodology_memo. Source: AASB S2 para 11.

AASB S2 para 13(a). Current and anticipated effects on business model and value chain. Evidence: strategy_doc, value_chain_map, management_report. Source: AASB S2 para 13(a).

AASB S2 para 13(b). Where in the business model and value chain risks and opportunities concentrate. Evidence: value_chain_map, asset_register. Source: AASB S2 para 13(b).

AASB S2 para 14(a)(i). Current and anticipated business-model and resource-allocation changes. Evidence: strategy_doc, board_minutes, capex_register. Source: AASB S2 para 14(a)(i).

AASB S2 para 14(a)(ii). Current and anticipated direct mitigation and adaptation efforts. Evidence: transition_plan, management_report. Source: AASB S2 para 14(a)(ii).

AASB S2 para 14(a)(iii). Current and anticipated indirect mitigation and adaptation efforts. Evidence: transition_plan, supplier_data. Source: AASB S2 para 14(a)(iii).

AASB S2 para 14(a)(iv). Any transition plan, with key assumptions and dependencies. Evidence: transition_plan, board_minutes. Source: AASB S2 para 14(a)(iv).

AASB S2 para 14(a)(v). How climate targets, including GHG targets, will be achieved. Evidence: transition_plan, target_record. Source: AASB S2 para 14(a)(v).

AASB S2 para 14(b). How the para 14(a) activities are resourced and planned to be resourced. Evidence: capex_register, financial_model. Source: AASB S2 para 14(b).

AASB S2 para 14(c). Quantitative and qualitative progress against previously disclosed plans. Evidence: management_report, prior_report. Source: AASB S2 para 14(c).

AASB S2 paras 15-16(a). Current-period effects on financial position, performance and cash flows. Evidence: financial_statements, financial_model. Source: AASB S2 paras 15(a) and 16(a); para 17 permission noted.

AASB S2 para 16(b). Risks and opportunities with significant risk of material carrying-amount adjustment next period. Evidence: financial_statements, methodology_memo. Source: AASB S2 para 16(b).

AASB S2 para 16(c). Anticipated changes to financial position over short, medium and long term, considering investment, disposal and funding plans. Evidence: financial_model, capex_register, strategy_doc. Source: AASB S2 para 16(c).

AASB S2 para 16(d). Anticipated changes to financial performance and cash flows over short, medium and long term. Evidence: financial_model. Source: AASB S2 para 16(d).

AASB S2 para 18. Preparation approach for anticipated financial effects: reasonable and supportable information, commensurate approach. Evidence: methodology_memo. Source: AASB S2 para 18.

AASB S2 paras 19-21. Conditional relief from quantitative financial-effects information and the mandatory fallback disclosures (reason, qualitative effects with affected line items, combined effects unless not useful). Evidence: methodology_memo, disclosure_checklist. Source: AASB S2 paras 19, 20 and 21.

AASB S2 para 22. Use scenario analysis commensurate with circumstances to assess climate resilience. Evidence: scenario_analysis_memo. Source: AASB S2 para 22 chapeau with paras B1-B18; statutory two-scenario minimum at Corporations Act s 296D(2B) below.

AASB S2 para 22(a). The resilience assessment: strategy and business-model implications, significant uncertainties, capacity to adjust or adapt. Evidence: scenario_analysis_memo, strategy_doc, financial_model. Source: AASB S2 para 22(a)(i)-(iii).

AASB S2 para 22(b). How and when the scenario analysis was carried out: inputs, key assumptions, and the period it was performed in. Evidence: scenario_analysis_memo, methodology_memo. Source: AASB S2 para 22(b)(i)-(iii).

AASB S2 para Aus23.1. Consider the applicability of cross-industry metric categories when preparing paras 13-22 disclosures. Evidence: disclosure_checklist. Source: AASB S2 para Aus23.1 (Australian substitute for deleted IFRS S2 para 23).

## Risk management (9 rows)

AASB S2 para 25(a)(i). Inputs and parameters used in the climate risk processes. Evidence: policy_doc, risk_register. Source: AASB S2 para 25(a)(i); objective at para 24.

AASB S2 para 25(a)(ii). Whether and how scenario analysis informs risk identification. Evidence: scenario_analysis_memo, policy_doc. Source: AASB S2 para 25(a)(ii).

AASB S2 para 25(a)(iii). How nature, likelihood and magnitude of risk effects are assessed. Evidence: risk_assessment_memo, policy_doc. Source: AASB S2 para 25(a)(iii).

AASB S2 para 25(a)(iv). Whether and how climate risks are prioritised against other risk types. Evidence: risk_register, policy_doc. Source: AASB S2 para 25(a)(iv).

AASB S2 para 25(a)(v). How climate risks are monitored. Evidence: risk_register, management_report. Source: AASB S2 para 25(a)(v).

AASB S2 para 25(a)(vi). Whether and how the processes changed from the prior period. Evidence: policy_doc, prior_report. Source: AASB S2 para 25(a)(vi).

AASB S2 para 25(b). Processes for identifying, assessing, prioritising and monitoring opportunities, including scenario-analysis use. Evidence: policy_doc, scenario_analysis_memo. Source: AASB S2 para 25(b).

AASB S2 para 25(c). Integration of the climate processes into overall risk management. Evidence: policy_doc, risk_register, board_minutes. Source: AASB S2 para 25(c).

AASB S2 paras 26 and Aus26.1. Avoid duplication via integrated risk management disclosure. Evidence: disclosure_checklist. Source: AASB S2 paras 26 and Aus26.1.

## Metrics and targets (25 rows)

Para 28 is a routing chapeau; paras 28(b), 32 and 37 were deleted by the AASB (industry-based metrics, see the cross-cutting row); para 30 (reasonable and supportable information for 29(b)-(d)) and para 31 (refer to B64-B65 for 29(b)-(g)) are preparation qualifiers folded into the applicability_notes of the rows they qualify.

AASB S2 para 29(a)(i). Absolute gross GHG emissions in tCO2e classified Scope 1, 2, 3. Evidence: emissions_calc_run, emissions_inventory. Source: AASB S2 para 29(a)(i) with paras B19-B22.

AASB S2 para 29(a)(ii). AMENDED by S2025-1. GHG Protocol Corporate Standard measurement, with the jurisdictional or exchange alternative-method relief now available in whole OR IN PART (per-part-of-entity). Evidence: methodology_memo, emissions_calc_run. Source: AASB S2 para 29(a)(ii) as amended by AASB S2025-1; guidance B23-B25 (B24 amended).

AASB S2 para 29(a)(iii). Measurement approach, inputs, assumptions, reasons, and period changes with reasons. Evidence: methodology_memo. Source: AASB S2 para 29(a)(iii) with paras B26-B29.

AASB S2 para 29(a)(iv). Disaggregation of Scope 1 and 2 between consolidated accounting group and other investees. Evidence: emissions_calc_run, financial_statements. Source: AASB S2 para 29(a)(iv).

AASB S2 para 29(a)(v). Location-based Scope 2 plus contractual-instruments information. Evidence: emissions_calc_run, energy_contract. Source: AASB S2 para 29(a)(v) with paras B30-B31.

AASB S2 para 29(a)(vi)(1). Scope 3 categories included, per the GHG Protocol Scope 3 standard. Evidence: emissions_calc_run, methodology_memo. Source: AASB S2 para 29(a)(vi)(1) with paras B32-B57.

AASB S2 para 29(a)(vi)(2). AMENDED by S2025-1. Additional financed-emissions information for asset management, commercial banking or insurance activities. Evidence: emissions_calc_run, financial_statements. Source: AASB S2 para 29(a)(vi)(2) as amended (reworded, re-anchored to B58-B63A).

AASB S2 para 29A. ADDED by S2025-1. Permission to limit Category 15 to financed emissions (loans and investments including AUM), with derivatives excludable. Evidence: methodology_memo. Source: AASB S2025-1 inserting para 29A.

AASB S2 para 29B. ADDED by S2025-1. When the 29A limitation is used: explain derivative treatment and describe excluded activities. Evidence: methodology_memo, disclosure_checklist. Source: AASB S2025-1 inserting para 29B.

AASB S2 para 29C. ADDED by S2025-1. Disclose total Category 15 emissions and the financed-emissions subtotal when Category 15 is included. Evidence: emissions_calc_run. Source: AASB S2025-1 inserting para 29C.

AASB S2 para 29(b). Amount and percentage of assets or activities vulnerable to transition risks. Evidence: asset_register, risk_assessment_memo. Source: AASB S2 para 29(b), qualified by paras 30-31.

AASB S2 para 29(c). Amount and percentage vulnerable to physical risks. Evidence: asset_register, risk_assessment_memo. Source: AASB S2 para 29(c), qualified by paras 30-31.

AASB S2 para 29(d). Amount and percentage aligned with climate opportunities. Evidence: asset_register, strategy_doc. Source: AASB S2 para 29(d), qualified by paras 30-31.

AASB S2 para 29(e). Capital deployment toward climate risks and opportunities. Evidence: capex_register, financial_statements. Source: AASB S2 para 29(e), qualified by para 31.

AASB S2 para 29(f). Internal carbon price application and price per tonne. Evidence: policy_doc, board_minutes. Source: AASB S2 para 29(f)(i)-(ii), qualified by para 31.

AASB S2 para 29(g). Climate in executive remuneration and the percentage linked. Evidence: remuneration_policy, board_minutes. Source: AASB S2 para 29(g)(i)-(ii), qualified by para 31.

AASB S2 para 33. Per-target characteristics: metric, objective, applicable part of entity, period, base period, milestones, absolute or intensity, international-agreement linkage. Evidence: target_record. Source: AASB S2 para 33(a)-(h) with B66-AusB67.1.

AASB S2 para 34. Target setting, review and monitoring approach, including third-party validation and revisions. Evidence: target_record, methodology_memo. Source: AASB S2 para 34(a)-(d).

AASB S2 para 35. Performance against each target with trend analysis. Evidence: management_report, target_record. Source: AASB S2 para 35.

AASB S2 para 36(a)-(d). GHG-target specifics: gases covered, scopes covered, gross versus net (net requires the gross twin), sectoral decarbonisation approach. Evidence: target_record. Source: AASB S2 para 36(a)-(d) with B68-B69.

AASB S2 para 36(e). Planned carbon-credit use for net targets: reliance, verification scheme, credit type, credibility factors. Evidence: target_record, methodology_memo. Source: AASB S2 para 36(e)(i)-(iv) with B70-B71.

AASB S2 para Aus37.1. Consider cross-industry metrics when identifying target metrics. Evidence: disclosure_checklist. Source: AASB S2 para Aus37.1 (Australian substitute for deleted IFRS S2 para 37).

AASB S2 paras B19-B22. AMENDED by S2025-1 (B21-B22). CO2e aggregation using 100-year GWP from the latest IPCC assessment, with the new jurisdictional or exchange GWP relief applicable per part of the entity; pre-converted emission factors need not be recalculated. Evidence: emissions_calc_run, methodology_memo. Source: AASB S2 paras B19-B22 as amended.

AASB S2 para B28. AMENDED by S2025-1. Per-alternative-method disclosure of method, approach and reasons when measuring under para 29(a)(ii), B24-B25 or C4(a) relief. Evidence: methodology_memo. Source: AASB S2 para B28 as amended.

AASB S2 paras B58-B63A. AMENDED by S2025-1. Financed-emissions detail for asset management, commercial banking and insurance: disaggregated absolute gross financed emissions and gross exposure per industry by asset class, with the industry-classification system now chosen for usefulness to transition-risk assessment and disclosed (mandatory GICS removed; B62A and B63A added; AusB63.1 deleted). Evidence: emissions_calc_run, financial_statements, methodology_memo. Source: AASB S2 paras B58-B63A as amended (B37 and B59 also reworded).

## Cross-cutting: industry-based guidance (1 row)

AASB S2 Comparison with IFRS S2 / BC28 (industry-based guidance). AASB S2 does not require industry-based metrics or consideration of the ISSB Industry-based Guidance disclosure topics; IFRS S2 paras 12, 23, 28(b), 32, 37, B65(d) and B67 were modified or omitted, and considering industry-based information is optional in Australia. Captured as a single optionality row per the W4 brief, not as per-industry rows. Evidence: disclosure_checklist. Source: AASB S2 "Comparison with IFRS S2" item (d) and Basis for Conclusions BC28-BC31.

## Appendix C: effective date and transition (5 rows)

C1 was deleted by the AASB; C2 is the date-of-initial-application definition folded into the C4 row note.

AASB S2 App C para AusC1.1. Applies to annual periods beginning on or after 1 January 2025; early application permitted and disclosed. Evidence: disclosure_checklist, compliance_statement. Source: AASB S2 para AusC1.1.

AASB S2 App C para C3. No comparatives required in the first application year. Evidence: disclosure_checklist, prior_report. Source: AASB S2 para C3.

AASB S2 App C para C4. First-year reliefs: continue the prior emissions measurement method; Scope 3 (including financed emissions) not required. Evidence: disclosure_checklist, methodology_memo. Source: AASB S2 para C4(a)-(b); C4(b) AMENDED by S2025-1 (re-anchor to B58-B63A).

AASB S2 App C para C5. C4 reliefs carry into comparatives in later periods. Evidence: disclosure_checklist. Source: AASB S2 para C5.

AASB S2 App C paras C1A-C1B and C6. ADDED by S2025-1. Amendment application date (periods beginning on or after 1 January 2027, early application permitted and disclosed) and the comparative-adjustment requirements on first applying the amendments. Evidence: disclosure_checklist, restatement_memo. Source: AASB S2025-1 inserting paras C1A, C1B and C6.

## Appendix D: general requirements (15 rows)

Appendix D is an integral part of AASB S2 with equal authority, drawn from AASB S1 with AASB S1 paragraph numbering retained. Paragraphs marked [Not included] in the published text are absent from AASB S2 and are therefore not rows. Binding requirements are consolidated into drafting-shaped clusters; the cluster boundaries follow the published subheadings.

AASB S2 App D paras 11-16. Fair presentation: complete, neutral, accurate; comparable, verifiable, timely, understandable; additional information where needed. Evidence: disclosure_checklist. Source: App D paras 11, 13, 15, 16 (12 and 14 are definitional support).

AASB S2 App D paras 17-19. Materiality: disclose material information; primary-user decision test. Evidence: methodology_memo, disclosure_checklist. Source: App D paras 17-19.

AASB S2 App D para Aus20.1. Same reporting entity as the related financial statements unless law permits otherwise. Evidence: financial_statements, disclosure_checklist. Source: App D para Aus20.1 (with AusB38.1), reflecting Corporations Act s 292A(2).

AASB S2 App D paras 21-24. Connected information; identify the related financial statements; consistent data and assumptions; same presentation currency. Evidence: disclosure_checklist, financial_statements. Source: App D paras 21, 22, 23, 24.

AASB S2 App D paras 49-50. Source identification for external metrics; full definition disclosures for entity-developed metrics. Evidence: methodology_memo. Source: App D paras 49-50.

AASB S2 App D paras 52-53. Metric consistency over time and clear labelling. Evidence: methodology_memo, prior_report. Source: App D paras 52-53.

AASB S2 App D paras 60-63. Location: part of general purpose financial reports, clearly identifiable, cross-referencing per B45-B47. Evidence: disclosure_checklist. Source: App D paras 60, 62, 63.

AASB S2 App D para 64. Same time and same period as the related financial statements. Evidence: disclosure_checklist, financial_statements. Source: App D para 64.

AASB S2 App D para 66. Changed reporting period disclosures. Evidence: disclosure_checklist. Source: App D para 66.

AASB S2 App D paras 67-68. Events after the reporting period: update for period-end conditions, disclose material post-period events. Evidence: board_minutes, management_report. Source: App D paras 67-68.

AASB S2 App D para 70. Comparative information for all amounts, and narrative where useful. Evidence: prior_report. Source: App D para 70, suspended in year one by App C para C3.

AASB S2 App D paras 72-73. Statement of compliance only on full compliance; legal-prohibition and commercial-sensitivity reliefs do not bar the assertion. Evidence: compliance_statement. Source: App D paras 72-73.

AASB S2 App D paras 74-75. Significant non-estimation judgements. Evidence: methodology_memo. Source: App D paras 74-75.

AASB S2 App D paras 77-78. High-measurement-uncertainty amounts and their sources, assumptions, approximations and judgements. Evidence: methodology_memo, emissions_calc_run. Source: App D paras 77-78.

AASB S2 App D paras 83-86. Material prior-period error correction by restatement unless impracticable. Evidence: restatement_memo, prior_report. Source: App D paras 83-86 with B55-B59.

## Corporations Act overlays (6 rows)

All inserted by the Treasury Laws Amendment (Financial Market Infrastructure and Other Measures) Act 2024 (No 87 of 2024), Schedule 4, item 26.

Corporations Act s 296A(1)-(5). Sustainability report contents: climate statements, notes (including anything needed to make the s 296D disclosures), Minister-required statements and notes, directors' declaration. Evidence: compliance_statement, directors_declaration, disclosure_checklist. Source: s 296A(1)-(5) as inserted.

Corporations Act s 296A(6)-(7). Directors' declaration on s 296C and s 296D conformity; by resolution, dated, signed. Evidence: directors_declaration, board_minutes. Source: s 296A(6)-(7) as inserted.

Corporations Act s 296B. The "no material climate risks or opportunities" alternative statement and the size, NGER and asset-value carve-outs that disqualify entities from using it. Evidence: risk_assessment_memo, board_minutes, directors_declaration. Source: s 296B(1)-(7) as inserted.

Corporations Act s 296C. Substantive provisions must comply with sustainability standards and any Ministerial determinations. Evidence: compliance_statement. Source: s 296C as inserted.

Corporations Act s 296D(1)-(2). Climate statements and notes must disclose the standards-required material climate risks and opportunities, metrics and targets (Scope 1, 2 and 3 including financed emissions), and governance, strategy and risk-management information. Evidence: disclosure_checklist, compliance_statement. Source: s 296D(1)-(2) as inserted.

Corporations Act s 296D(2A)-(2B). The statutory scenario floor: a scenario-analysis disclosure counts only if the analysis used at least one scenario well exceeding the Climate Change Act 2022 s 3(a)(i) increase (well exceeds 2 degrees C) and one limited to the s 3(a)(ii) increase (1.5 degrees C). Evidence: scenario_analysis_memo. Source: s 296D(2A)-(2B) as inserted.

## Reconciliation

Section-by-section count of requirements in the published standard against rows authored. "Requirement" means a paragraph or sub-paragraph imposing a distinct disclosure, preparation or relief obligation; objectives, routing chapeaus, deleted paragraphs and pure permissions are accounted for in the notes so a reviewer can confirm nothing was dropped.

Governance (paras 5-7, Aus7.1). Requirements: 6(a) chapeau, 6(a)(i)-(v), 6(b)(i)-(ii), 7 with Aus7.1 = 9. Rows authored: 9. Para 5 is the objective, not a requirement.

Strategy (paras 8-23, Aus23.1). Requirements: 10(a)-(d) = 4; 11 = 1; 13(a)-(b) = 2; 14(a)(i)-(v), 14(b), 14(c) = 7; 15-16(a), 16(b), 16(c), 16(d) = 4; 18 = 1; 19-21 (relief plus fallback) = 1; 22 chapeau, 22(a), 22(b) = 3; Aus23.1 = 1. Total 24. Rows authored: 24. Para 8 is the objective; para 9 routes to 10-22; paras 12 and 23 are deleted; para 17 is a permission noted on the 15-16(a) row.

Risk management (paras 24-26, Aus26.1). Requirements: 25(a)(i)-(vi) = 6; 25(b) = 1; 25(c) = 1; 26 with Aus26.1 = 1. Total 9. Rows authored: 9. Para 24 is the objective.

Metrics and targets (paras 27-37, Aus37.1, plus binding Appendix B carriers). Requirements: 29(a)(i)-(v) = 5; 29(a)(vi)(1)-(2) = 2; 29A-29C = 3; 29(b)-(g) = 6; 33 = 1; 34 = 1; 35 = 1; 36(a)-(d) = 1; 36(e) = 1; Aus37.1 = 1; B19-B22 = 1; B28 = 1; B58-B63A = 1. Total 25. Rows authored: 25. Para 27 is the objective; para 28 routes; paras 28(b), 32 and 37 are deleted; paras 30-31 are preparation qualifiers folded into the 29(b)-(g) row notes. The remaining Appendix B paragraphs are application guidance on the para 29/33-36 requirements already rowed (B1-B18 scenario approach, B23-B27 and B29-B57 measurement guidance, B64-B67 metric guidance, B68-B71 target guidance) and deliberately do not get separate rows.

Industry-based guidance. One optionality row per the W4 brief, sourced to the Comparison with IFRS S2 item (d) and BC28-BC31. Zero per-industry rows by design.

Appendix C (AusC1.1, C2-C6, C1A-C1B). Requirements: AusC1.1 = 1; C3 = 1; C4 = 1; C5 = 1; C1A-C1B with C6 = 1. Total 5. Rows authored: 5. C1 deleted; C2 definitional, noted on the C4 row.

Appendix D. Binding requirement paragraphs present in AASB S2: 11-16 (fair presentation), 17-19 (materiality), Aus20.1 (reporting entity), 21-24 (connected information), 49-50 (metric sourcing), 52-53 (consistency and labelling), 60-63 (location), 64 (timing), 66 (changed period), 67-68 (subsequent events), 70 (comparatives), 72-73 (compliance statement and reliefs), 74-75 (judgements), 77-78 (measurement uncertainty), 83-86 (errors) = 15 clusters. Rows authored: 15. Paragraphs 1-9, 20, 25-30, 32-48, 51, 54-59, 61, 65 (narrative), 69 (interim, conditional on other law), 71, 76, 79-82 (narrative), and the [Not included] gaps are not requirements in AASB S2 or are explanatory text supporting a rowed requirement. Appendix D's own application guidance (B paragraphs from AASB S1) is guidance on the rowed requirements.

Corporations Act overlays. Captured at drafting-relevant level per the brief: 296A(1)-(5) = 1; 296A(6)-(7) = 1; 296B = 1; 296C = 1; 296D(1)-(2) = 1; 296D(2A)-(2B) = 1. Total 6. Rows authored: 6. s 296E (ASIC directions) is an enforcement power, not a drafting requirement; s 292A (who must prepare, consolidated-or-parent choice) is reflected in the App D Aus20.1 row note.

Grand total rows: 9 + 24 + 9 + 25 + 1 + 5 + 15 + 6 = 94.

## Rows modified by AASB S2025-1 (December 2025)

Per the amendment inventory at new para C1A: amended 29(a)(ii), 29(a)(vi)(2), B21-B22, B24, B28, B37, B59, B62(a), B63(a), C4(b) and the heading before B26; added 29A-29C, B62A, B63A, C1B and C6; deleted AusB63.1.

Rows in this register carrying S2025-1 substance:

1. AASB S2 para 29(a)(ii) - AMENDED ("in whole or in part" method relief).
2. AASB S2 para 29(a)(vi)(2) - AMENDED (rewording, re-anchor to B58-B63A).
3. AASB S2 para 29A - ADDED (financed-emissions limitation).
4. AASB S2 para 29B - ADDED (limitation disclosures).
5. AASB S2 para 29C - ADDED (Category 15 total and financed subtotal).
6. AASB S2 paras B19-B22 - AMENDED (jurisdictional GWP relief, B21-B22).
7. AASB S2 para B28 - AMENDED (per-method disclosure under partial relief).
8. AASB S2 paras B58-B63A - AMENDED (classification-system choice replaces mandatory GICS; B62A/B63A added; AusB63.1 deleted; B37/B59 reworded).
9. AASB S2 App C para C4 - AMENDED (C4(b) re-anchor).
10. AASB S2 App C paras C1A-C1B and C6 - ADDED (amendment application and transition).

All other rows are unchanged from the September 2024 text.

## Known schema gap (reported, not bent)

006_cd_clause_register.sql has no dedicated pillar or clause_key column. The seed carries the pillar as a `pillar=` prefix in applicability_notes (greppable, queryable with a LIKE) and uses clause_ref as the stable clause key, which is also what cd_disclosure_drafts.clause_ref joins on. No constraint in 006 blocked any row; if a first client engagement wants pillar-level coverage rollups, promote pillar to a real column in a later migration and strip the prefix.
