-- 011_cd_clause_register_seed.sql
-- Climate-disclosure substrate (drafts/climate-disclosure/04-substrate-build-spec-2026-06-10.md, W4).
-- Target: the DEDICATED ecodia-climate Supabase project, never the EcodiaOS substrate project.
--
-- AASB S2 Climate-related Disclosures (September 2024), as amended by AASB S2025-1
-- Amendments to Greenhouse Gas Emissions Disclosures (December 2025), decomposed into
-- one row per disclosure requirement, plus the Corporations Act 2001 overlays that bind
-- drafting (ss 296A-296D as inserted by Act No 87 of 2024, Schedule 4).
--
-- Sources (fetched 2026-06-10):
--   https://standards.aasb.gov.au/sites/default/files/2024-10/AASBS2_09-24.pdf
--   https://standards.aasb.gov.au/sites/default/files/2025-12/AASBS2025-1_12-25.pdf
--   https://www.legislation.gov.au/C2024A00087/asmade/2024-09-17/text/1/pdf
--
-- Human-review sibling: drafts/climate-disclosure/clause-register-source-map-2026-06-10.md
--
-- Schema note: 006_cd_clause_register.sql has no dedicated pillar column, so the pillar is
-- carried as a machine-greppable "pillar=<value>" prefix in applicability_notes. clause_ref
-- doubles as the stable clause key (cd_disclosure_drafts.clause_ref joins on it).
-- Pillar values used: governance | strategy | risk_management | metrics_targets |
-- cross_cutting | transition | general_requirements | act_overlay.
--
-- Summaries are plain-English condensations, not reproductions of the standard text.
-- Requirement_summary is faithful to, and traceable to, the cited paragraph; consult the
-- published standard for the authoritative wording.

begin;

-- ---------------------------------------------------------------------------
-- GOVERNANCE (AASB S2 paras 5-7, Aus7.1)
-- ---------------------------------------------------------------------------
insert into public.cd_clause_register
  (standard, standard_version, clause_ref, requirement_summary, evidence_types, applicability_notes)
values
('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 6(a)',
 'Identify the governance body (board, committee or equivalent) or individual responsible for oversight of climate-related risks and opportunities.',
 array['committee_charter','board_minutes','org_chart'],
 'pillar=governance. Disclosure objective set by para 5.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 6(a)(i)',
 'Disclose how responsibilities for climate-related risks and opportunities are reflected in the terms of reference, mandates, role descriptions and other policies that apply to the responsible body or individual.',
 array['committee_charter','role_description','policy_doc'],
 'pillar=governance.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 6(a)(ii)',
 'Disclose how the responsible body or individual determines whether appropriate skills and competencies are available, or will be developed, to oversee strategies responding to climate-related risks and opportunities.',
 array['board_skills_matrix','training_record','board_minutes'],
 'pillar=governance.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 6(a)(iii)',
 'Disclose how, and how often, the responsible body or individual is informed about climate-related risks and opportunities.',
 array['board_minutes','management_report'],
 'pillar=governance.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 6(a)(iv)',
 'Disclose how the responsible body or individual takes climate-related risks and opportunities into account when overseeing strategy, decisions on major transactions and risk management processes and policies, including whether trade-offs were considered.',
 array['board_minutes','strategy_doc','risk_register'],
 'pillar=governance.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 6(a)(v)',
 'Disclose how the responsible body or individual oversees the setting of climate-related targets and monitors progress toward them, including whether and how related performance metrics are included in remuneration policies.',
 array['board_minutes','target_record','remuneration_policy'],
 'pillar=governance. Cross-links to paras 33-36 (targets) and 29(g) (remuneration metric).'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 6(b)(i)',
 'Disclose management''s role in climate governance: whether the role is delegated to a specific management-level position or committee, and how oversight is exercised over that position or committee.',
 array['org_chart','policy_doc','management_report'],
 'pillar=governance.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 6(b)(ii)',
 'Disclose whether management uses controls and procedures to support oversight of climate-related risks and opportunities and, if so, how those controls and procedures are integrated with other internal functions.',
 array['policy_doc','management_report'],
 'pillar=governance.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 paras 7 and Aus7.1',
 'Avoid unnecessary duplication in governance disclosures: where oversight of sustainability-related risks and opportunities is integrated, provide integrated governance disclosure rather than separate climate-only disclosure. Applies particularly when AASB S1 is voluntarily applied.',
 array['disclosure_checklist'],
 'pillar=governance. Drafting-shape requirement, interacts with App D para B42(b).')

on conflict (standard, standard_version, clause_ref) do nothing;

-- ---------------------------------------------------------------------------
-- STRATEGY (AASB S2 paras 8-22, Aus23.1)
-- Para 9 is a routing chapeau over paras 10-22; paras 12 and 23 were deleted by the AASB.
-- ---------------------------------------------------------------------------
insert into public.cd_clause_register
  (standard, standard_version, clause_ref, requirement_summary, evidence_types, applicability_notes)
values
('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 10(a)',
 'Describe the climate-related risks and opportunities that could reasonably be expected to affect the entity''s prospects (cash flows, access to finance or cost of capital over the short, medium or long term).',
 array['risk_register','risk_assessment_memo'],
 'pillar=strategy. Scope framed by paras 2-4; routing chapeau is para 9(a).'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 10(b)',
 'For each identified climate-related risk, state whether the entity considers it a physical risk or a transition risk.',
 array['risk_register'],
 'pillar=strategy.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 10(c)',
 'For each identified climate-related risk and opportunity, specify the time horizon (short, medium or long term) over which its effects could reasonably be expected to occur.',
 array['risk_register','strategy_doc'],
 'pillar=strategy.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 10(d)',
 'Explain how the entity defines short term, medium term and long term and how those definitions link to the planning horizons it uses for strategic decision-making.',
 array['strategy_doc','policy_doc'],
 'pillar=strategy.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 11',
 'When identifying climate-related risks and opportunities, use all reasonable and supportable information available at the reporting date without undue cost or effort, including past events, current conditions and forecasts.',
 array['risk_assessment_memo','methodology_memo'],
 'pillar=strategy. Preparation requirement, not a separate disclosure. Para 12 was deleted by the AASB.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 13(a)',
 'Describe the current and anticipated effects of climate-related risks and opportunities on the entity''s business model and value chain.',
 array['strategy_doc','value_chain_map','management_report'],
 'pillar=strategy.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 13(b)',
 'Describe where in the business model and value chain climate-related risks and opportunities are concentrated, for example by geography, facility or asset type.',
 array['value_chain_map','asset_register'],
 'pillar=strategy.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 14(a)(i)',
 'Disclose current and anticipated changes to the business model, including resource allocation, made or planned in response to climate-related risks and opportunities (for example decommissioning carbon-intensive operations, capex or R&D allocation, acquisitions or divestments).',
 array['strategy_doc','board_minutes','capex_register'],
 'pillar=strategy.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 14(a)(ii)',
 'Disclose current and anticipated direct mitigation and adaptation efforts, such as changes to production processes or equipment, facility relocation, workforce adjustments or product specification changes.',
 array['transition_plan','management_report'],
 'pillar=strategy.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 14(a)(iii)',
 'Disclose current and anticipated indirect mitigation and adaptation efforts, such as working with customers and supply chains.',
 array['transition_plan','supplier_data'],
 'pillar=strategy.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 14(a)(iv)',
 'Disclose any climate-related transition plan the entity has, including the key assumptions used in developing it and the dependencies it relies on.',
 array['transition_plan','board_minutes'],
 'pillar=strategy. Conditional: applies if the entity has a transition plan.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 14(a)(v)',
 'Disclose how the entity plans to achieve any climate-related targets, including greenhouse gas emissions targets, it has set or is required to meet by law or regulation.',
 array['transition_plan','target_record'],
 'pillar=strategy. Cross-links to paras 33-36.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 14(b)',
 'Disclose how the entity is resourcing, and plans to resource, the strategy and decision-making activities disclosed under para 14(a).',
 array['capex_register','financial_model'],
 'pillar=strategy.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 14(c)',
 'Disclose quantitative and qualitative information about progress against plans disclosed in previous reporting periods under para 14(a).',
 array['management_report','prior_report'],
 'pillar=strategy.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 paras 15-16(a)',
 'Disclose quantitative and qualitative information about how climate-related risks and opportunities have affected the entity''s financial position, financial performance and cash flows for the reporting period (current financial effects).',
 array['financial_statements','financial_model'],
 'pillar=strategy. Para 17 permits a single amount or a range for quantitative info.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 16(b)',
 'Identify the climate-related risks and opportunities for which there is a significant risk of a material adjustment to carrying amounts of assets and liabilities within the next annual reporting period.',
 array['financial_statements','methodology_memo'],
 'pillar=strategy.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 16(c)',
 'Disclose how the entity expects its financial position to change over the short, medium and long term given its climate strategy, considering investment and disposal plans (including uncommitted plans) and planned funding sources.',
 array['financial_model','capex_register','strategy_doc'],
 'pillar=strategy.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 16(d)',
 'Disclose how the entity expects its financial performance and cash flows to change over the short, medium and long term given its climate strategy (for example low-carbon revenue, physical damage costs, adaptation expenses).',
 array['financial_model'],
 'pillar=strategy.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 18',
 'Prepare anticipated-financial-effects disclosures using all reasonable and supportable information available without undue cost or effort, and an approach commensurate with the skills, capabilities and resources available to the entity.',
 array['methodology_memo'],
 'pillar=strategy. Preparation requirement for para 15(b)/16(c)-(d) disclosures.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 paras 19-21',
 'Quantitative financial-effects information is not required where effects are not separately identifiable, measurement uncertainty is too high, or (for anticipated effects) the entity lacks the skills or resources. If relief is used the entity must explain why, give qualitative information including the financial statement line items affected, and give combined quantitative effects unless that would not be useful.',
 array['methodology_memo','disclosure_checklist'],
 'pillar=strategy. Conditional relief plus mandatory fallback disclosures.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 22',
 'Use climate-related scenario analysis, with an approach commensurate with the entity''s circumstances (paras B1-B18), to assess the resilience of the entity''s strategy and business model to climate-related changes, developments and uncertainties.',
 array['scenario_analysis_memo'],
 'pillar=strategy. Corporations Act s 296D(2B) overlays a minimum of two specified temperature scenarios; see the act_overlay row.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 22(a)',
 'Disclose the entity''s assessment of its climate resilience as at the reporting date: the implications for strategy and business model, the significant areas of uncertainty considered, and the entity''s capacity to adjust or adapt (availability and flexibility of financial resources, ability to redeploy or decommission assets, and effect of current and planned climate investments).',
 array['scenario_analysis_memo','strategy_doc','financial_model'],
 'pillar=strategy.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 22(b)',
 'Disclose how and when the scenario analysis was carried out: the scenarios used and their sources, whether a diverse range was used, whether scenarios cover transition and physical risks, whether one aligns with the latest international agreement on climate change, why the scenarios are relevant, the time horizons, the scope of operations, the key assumptions (jurisdictional climate policy, macroeconomic trends, national or regional variables, energy mix, technology), and the reporting period in which the analysis was performed.',
 array['scenario_analysis_memo','methodology_memo'],
 'pillar=strategy. Para B18 permits refreshing scenario analysis on a cycle agreed with circumstances.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para Aus23.1',
 'In preparing the strategy disclosures required by paras 13-22, refer to and consider the applicability of the cross-industry metric categories described in para 29.',
 array['disclosure_checklist'],
 'pillar=strategy. Australian substitute for the IFRS S2 para 23 industry-based requirement (deleted).')

on conflict (standard, standard_version, clause_ref) do nothing;

-- ---------------------------------------------------------------------------
-- RISK MANAGEMENT (AASB S2 paras 24-26, Aus26.1)
-- ---------------------------------------------------------------------------
insert into public.cd_clause_register
  (standard, standard_version, clause_ref, requirement_summary, evidence_types, applicability_notes)
values
('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 25(a)(i)',
 'Disclose the inputs and parameters used in the processes for identifying, assessing, prioritising and monitoring climate-related risks, for example data sources and the scope of operations covered.',
 array['policy_doc','risk_register'],
 'pillar=risk_management. Disclosure objective set by para 24.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 25(a)(ii)',
 'Disclose whether and how the entity uses climate-related scenario analysis to inform its identification of climate-related risks.',
 array['scenario_analysis_memo','policy_doc'],
 'pillar=risk_management.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 25(a)(iii)',
 'Disclose how the entity assesses the nature, likelihood and magnitude of the effects of climate-related risks, for example qualitative factors, quantitative thresholds or other criteria.',
 array['risk_assessment_memo','policy_doc'],
 'pillar=risk_management.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 25(a)(iv)',
 'Disclose whether and how the entity prioritises climate-related risks relative to other types of risk.',
 array['risk_register','policy_doc'],
 'pillar=risk_management.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 25(a)(v)',
 'Disclose how the entity monitors climate-related risks.',
 array['risk_register','management_report'],
 'pillar=risk_management.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 25(a)(vi)',
 'Disclose whether and how the entity has changed its climate risk processes compared with the previous reporting period.',
 array['policy_doc','prior_report'],
 'pillar=risk_management.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 25(b)',
 'Disclose the processes used to identify, assess, prioritise and monitor climate-related opportunities, including whether and how climate-related scenario analysis informs opportunity identification.',
 array['policy_doc','scenario_analysis_memo'],
 'pillar=risk_management.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 25(c)',
 'Disclose the extent to which, and how, the climate risk and opportunity processes are integrated into and inform the entity''s overall risk management process.',
 array['policy_doc','risk_register','board_minutes'],
 'pillar=risk_management.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 paras 26 and Aus26.1',
 'Avoid unnecessary duplication in risk management disclosures: where sustainability-related risks and opportunities are managed on an integrated basis, provide integrated risk management disclosure. Applies particularly when AASB S1 is voluntarily applied.',
 array['disclosure_checklist'],
 'pillar=risk_management. Drafting-shape requirement, interacts with App D para B42(b).')

on conflict (standard, standard_version, clause_ref) do nothing;

-- ---------------------------------------------------------------------------
-- METRICS AND TARGETS (AASB S2 paras 27-36, Aus37.1, plus the Appendix B
-- paragraphs that carry binding measurement requirements).
-- Paras 28(b), 32 and 37 were deleted by the AASB (industry-based metrics).
-- ---------------------------------------------------------------------------
insert into public.cd_clause_register
  (standard, standard_version, clause_ref, requirement_summary, evidence_types, applicability_notes)
values
('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 29(a)(i)',
 'Disclose absolute gross greenhouse gas emissions generated during the reporting period, in metric tonnes of CO2 equivalent, classified as Scope 1, Scope 2 and Scope 3.',
 array['emissions_calc_run','emissions_inventory'],
 'pillar=metrics_targets. First-year Scope 3 relief available under App C para C4(b). Measurement guidance at paras B19-B22.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 29(a)(ii)',
 'Measure greenhouse gas emissions in accordance with the Greenhouse Gas Protocol Corporate Standard (2004), unless a jurisdictional authority or listing exchange requires a different method in whole or in part; the different method may then be used for the part of the entity that requirement applies to.',
 array['methodology_memo','emissions_calc_run'],
 'pillar=metrics_targets. AMENDED by AASB S2025-1: "in whole or in part" relief scoping added. In Australia this admits NGER Determination methods for NGER-covered facilities.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 29(a)(iii)',
 'Disclose the measurement approach, inputs and assumptions used to measure greenhouse gas emissions, the reasons for choosing them, and any changes made during the period with reasons.',
 array['methodology_memo'],
 'pillar=metrics_targets. Guidance at paras B26-B29.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 29(a)(iv)',
 'Disaggregate Scope 1 and Scope 2 emissions between the consolidated accounting group and other investees (associates, joint ventures, unconsolidated subsidiaries).',
 array['emissions_calc_run','financial_statements'],
 'pillar=metrics_targets.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 29(a)(v)',
 'Disclose location-based Scope 2 emissions, plus any information about contractual instruments needed for users to understand the entity''s Scope 2 emissions.',
 array['emissions_calc_run','energy_contract'],
 'pillar=metrics_targets. Guidance at paras B30-B31.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 29(a)(vi)(1)',
 'Disclose which of the Scope 3 categories described in the GHG Protocol Corporate Value Chain (Scope 3) Standard (2011) are included in the entity''s measure of Scope 3 emissions.',
 array['emissions_calc_run','methodology_memo'],
 'pillar=metrics_targets. Scope 3 measurement framework at paras B32-B57.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 29(a)(vi)(2)',
 'Disclose additional information about financed emissions (part of Scope 3 Category 15) if the entity''s activities include asset management, commercial banking or insurance.',
 array['emissions_calc_run','financial_statements'],
 'pillar=metrics_targets. Conditional: financial-sector activities only. AMENDED by AASB S2025-1: rewording and re-anchor to paras B58-B63A.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 29A',
 'The entity is permitted to limit its Scope 3 Category 15 measure to financed emissions, that is emissions attributed to loans and investments (loans, project finance, bonds, equity investments, undrawn loan commitments; assets under management for asset managers), and may exclude emissions attributable to derivatives.',
 array['methodology_memo'],
 'pillar=metrics_targets. ADDED by AASB S2025-1. Permits exclusion of facilitated emissions and insurance-associated emissions from Category 15.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 29B',
 'If the para 29A limitation is applied, explain what was treated as a derivative and describe the financial activities excluded from the Category 15 measure as a result.',
 array['methodology_memo','disclosure_checklist'],
 'pillar=metrics_targets. ADDED by AASB S2025-1. Conditional on applying para 29A.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 29C',
 'If Category 15 emissions are included in the Scope 3 measure, disclose total Category 15 emissions and the subtotal of financed emissions within that total.',
 array['emissions_calc_run'],
 'pillar=metrics_targets. ADDED by AASB S2025-1.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 29(b)',
 'Disclose the amount and percentage of assets or business activities vulnerable to climate-related transition risks.',
 array['asset_register','risk_assessment_memo'],
 'pillar=metrics_targets. Para 30: prepare using reasonable and supportable information without undue cost or effort. Para 31: refer to paras B64-B65.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 29(c)',
 'Disclose the amount and percentage of assets or business activities vulnerable to climate-related physical risks.',
 array['asset_register','risk_assessment_memo'],
 'pillar=metrics_targets. Para 30 preparation qualifier applies.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 29(d)',
 'Disclose the amount and percentage of assets or business activities aligned with climate-related opportunities.',
 array['asset_register','strategy_doc'],
 'pillar=metrics_targets. Para 30 preparation qualifier applies.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 29(e)',
 'Disclose the amount of capital expenditure, financing or investment deployed toward climate-related risks and opportunities.',
 array['capex_register','financial_statements'],
 'pillar=metrics_targets.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 29(f)',
 'Disclose whether and how a carbon price is applied in decision-making, and the price per metric tonne of greenhouse gas emissions used to assess emission costs.',
 array['policy_doc','board_minutes'],
 'pillar=metrics_targets. Internal carbon price cross-industry category.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 29(g)',
 'Disclose whether and how climate-related considerations are factored into executive remuneration, and the percentage of executive management remuneration recognised in the current period that is linked to climate-related considerations.',
 array['remuneration_policy','board_minutes'],
 'pillar=metrics_targets. Cross-links to para 6(a)(v).'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 33',
 'For each climate-related target (set by the entity or required by law or regulation) disclose: the metric used, the objective, which part of the entity it applies to, the period it applies over, the base period, milestones and interim targets, whether it is absolute or intensity-based, and how the latest international agreement on climate change informed it.',
 array['target_record'],
 'pillar=metrics_targets. Metric guidance at paras B66-AusB67.1.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 34',
 'Disclose the approach to setting and reviewing each target and how progress is monitored: third-party validation of the target and methodology, review processes, monitoring metrics, and any revisions with explanations.',
 array['target_record','methodology_memo'],
 'pillar=metrics_targets.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 35',
 'Disclose performance against each climate-related target and an analysis of trends or changes in performance.',
 array['management_report','target_record'],
 'pillar=metrics_targets.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 36(a)-(d)',
 'For each greenhouse gas emissions target disclose: the gases covered, whether Scope 1, 2 or 3 emissions are covered, whether it is a gross or net target (a net target also requires separate disclosure of the associated gross target), and whether it was derived using a sectoral decarbonisation approach.',
 array['target_record'],
 'pillar=metrics_targets. Gross vs net guidance at paras B68-B69.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para 36(e)',
 'Disclose the planned use of carbon credits to achieve any net emissions target: the extent of reliance on credits, the third-party verification or certification scheme, the credit type (nature-based or technological, reduction or removal), and any other factors bearing on credibility and integrity such as permanence assumptions.',
 array['target_record','methodology_memo'],
 'pillar=metrics_targets. Conditional on a net GHG target. Guidance at paras B70-B71.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para Aus37.1',
 'In identifying and disclosing the metrics used to set and monitor targets (paras 33-34), refer to and consider the applicability of the cross-industry metrics in para 29.',
 array['disclosure_checklist'],
 'pillar=metrics_targets. Australian substitute for the IFRS S2 para 37 industry-based requirement (deleted).'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 paras B19-B22',
 'Aggregate the seven constituent greenhouse gases into CO2 equivalent using 100-year global warming potential values from the latest IPCC assessment available at the reporting date, unless a jurisdictional authority or listing exchange requires different GWP values in whole or in part, in which case those values may be used for the part of the entity the requirement applies to. Emission factors already expressed in CO2e need not be recalculated.',
 array['emissions_calc_run','methodology_memo'],
 'pillar=metrics_targets. B21-B22 AMENDED by AASB S2025-1 (jurisdictional GWP relief). Binds the calc engine factor handling.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 para B28',
 'When emissions are measured using a method other than the GHG Protocol Corporate Standard (under para 29(a)(ii), B24-B25 or C4(a)), disclose for each alternative method the method and measurement approach used and the reasons for choosing it.',
 array['methodology_memo'],
 'pillar=metrics_targets. AMENDED by AASB S2025-1 (extended to per-method disclosure under the partial relief).'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 paras B58-B63A',
 'An entity participating in asset management, commercial banking or insurance must disclose financed-emissions detail: absolute gross financed emissions disaggregated by Scope 1, 2 and 3 for each industry by asset class, gross exposure per industry by asset class in the presentation currency, and the methodology used. The industry disaggregation must use a classification system that gives users useful information about transition-risk exposure, with the system identified and its selection explained; commonly used systems take priority over entity-specific ones.',
 array['emissions_calc_run','financial_statements','methodology_memo'],
 'pillar=metrics_targets. Conditional: financial-sector activities only. AMENDED by AASB S2025-1: B37/B59/B62/B63 reworded, B62A/B63A added (classification-system choice replaces mandatory GICS), AusB63.1 deleted.')

on conflict (standard, standard_version, clause_ref) do nothing;

-- ---------------------------------------------------------------------------
-- CROSS-CUTTING: industry-based guidance optionality (single row per the W4 brief)
-- ---------------------------------------------------------------------------
insert into public.cd_clause_register
  (standard, standard_version, clause_ref, requirement_summary, evidence_types, applicability_notes)
values
('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 Comparison with IFRS S2 / BC28 (industry-based guidance)',
 'Unlike IFRS S2, AASB S2 does not require disclosure of industry-based metrics or consideration of the industry-based disclosure topics in the ISSB Industry-based Guidance on Implementing IFRS S2; the AASB modified or omitted IFRS S2 paras 12, 23, 28(b), 32, 37, B65(d) and B67. Considering or disclosing industry-based information remains optional in Australia.',
 array['disclosure_checklist'],
 'pillar=cross_cutting. Interim AASB position (BC28-BC31); a domestic industry-based project is on the AASB workplan. Aus23.1 and Aus37.1 substitute cross-industry metric consideration.')

on conflict (standard, standard_version, clause_ref) do nothing;

-- ---------------------------------------------------------------------------
-- APPENDIX C: effective date and transition reliefs (bind first-year drafting)
-- ---------------------------------------------------------------------------
insert into public.cd_clause_register
  (standard, standard_version, clause_ref, requirement_summary, evidence_types, applicability_notes)
values
('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App C para AusC1.1',
 'AASB S2 applies to annual reporting periods beginning on or after 1 January 2025; earlier application is permitted and must be disclosed.',
 array['disclosure_checklist','compliance_statement'],
 'pillar=transition. Corporations Act group phasing (Group 1/2/3 entry dates) sits in s 1707D, outside this register''s scope.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App C para C3',
 'Comparative information is not required in the first annual reporting period in which the entity applies the Standard.',
 array['disclosure_checklist','prior_report'],
 'pillar=transition. Modifies App D para 70 in year one.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App C para C4',
 'First-year reliefs: (a) an entity may continue using its pre-existing emissions measurement method instead of the GHG Protocol Corporate Standard; (b) Scope 3 emissions, including financed-emissions information for financial-sector entities, are not required.',
 array['disclosure_checklist','methodology_memo'],
 'pillar=transition. C4(b) AMENDED by AASB S2025-1 (re-anchor to paras B58-B63A). C2 defines date of initial application.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App C para C5',
 'An entity that used a C4 relief may continue to apply it when presenting that information as comparative information in subsequent reporting periods.',
 array['disclosure_checklist'],
 'pillar=transition.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App C paras C1A-C1B and C6',
 'The AASB S2025-1 amendments apply to annual reporting periods beginning on or after 1 January 2027, with earlier application permitted (and disclosed). On first applying the amendments, comparative information must be adjusted, unless impracticable, for measurement-method changes, the Category 15 total and financed-emissions subtotal, and the selected industry-classification system.',
 array['disclosure_checklist','restatement_memo'],
 'pillar=transition. ADDED by AASB S2025-1. Lists the full amended-paragraph inventory at C1A.')

on conflict (standard, standard_version, clause_ref) do nothing;

-- ---------------------------------------------------------------------------
-- APPENDIX D: general requirements (integral to AASB S2, equal authority;
-- AASB S1 paragraph numbering retained). Consolidated to binding requirement
-- clusters that shape drafting; [Not included] paragraphs are absent from
-- AASB S2 itself.
-- ---------------------------------------------------------------------------
insert into public.cd_clause_register
  (standard, standard_version, clause_ref, requirement_summary, evidence_types, applicability_notes)
values
('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App D paras 11-16',
 'A complete set of climate-related financial disclosures must present fairly all climate-related risks and opportunities that could reasonably affect the entity''s prospects: complete, neutral and accurate, comparable, verifiable, timely and understandable, with additional information disclosed where the specific requirements are insufficient.',
 array['disclosure_checklist'],
 'pillar=general_requirements. Fair presentation foundation.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App D paras 17-19',
 'Disclose material information about climate-related risks and opportunities. Information is material if omitting, misstating or obscuring it could reasonably be expected to influence decisions of primary users of general purpose financial reports.',
 array['methodology_memo','disclosure_checklist'],
 'pillar=general_requirements. Materiality judgements applied per App D paras B13-B37.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App D para Aus20.1',
 'Climate-related financial disclosures must be for the same reporting entity as the related financial statements, unless otherwise permitted by law.',
 array['financial_statements','disclosure_checklist'],
 'pillar=general_requirements. Australian modification reflecting the Corporations Act s 292A(2) consolidated-or-parent choice.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App D paras 21-24',
 'Disclosures must show the connections between climate-related risks and opportunities, between the four pillars, and with the related financial statements; identify the financial statements they relate to; use data and assumptions consistent with those financial statements to the extent possible; and use the same presentation currency.',
 array['disclosure_checklist','financial_statements'],
 'pillar=general_requirements. Connected information.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App D paras 49-50',
 'Identify the source of any metric taken from outside the Australian Sustainability Reporting Standards. For entity-developed metrics, disclose how the metric is defined, whether it is absolute, relative or qualitative, any third-party validation, and the calculation method, inputs, limitations and significant assumptions.',
 array['methodology_memo'],
 'pillar=general_requirements.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App D paras 52-53',
 'Define and calculate metrics, including target metrics, consistently over time (applying B52 if a metric is redefined or replaced), and label metrics and targets with meaningful, clear and precise names and descriptions.',
 array['methodology_memo','prior_report'],
 'pillar=general_requirements.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App D paras 60-63',
 'Provide the disclosures as part of the general purpose financial report; they may sit alongside other regulatory information but must be clearly identifiable and not obscured, and may incorporate information by cross-reference to another published report subject to paras B45-B47.',
 array['disclosure_checklist'],
 'pillar=general_requirements. Location of disclosures. Corporations Act s 296A houses them in the sustainability report.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App D para 64',
 'Report climate-related financial disclosures at the same time as the related financial statements, covering the same reporting period.',
 array['disclosure_checklist','financial_statements'],
 'pillar=general_requirements.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App D para 66',
 'If the reporting period end changes and the disclosures cover a period longer or shorter than 12 months, disclose the period covered, the reason, and the fact that amounts are not entirely comparable.',
 array['disclosure_checklist'],
 'pillar=general_requirements. Conditional on a changed reporting period.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App D paras 67-68',
 'Update disclosures for information received after period end but before authorisation that relates to conditions existing at period end, and disclose post-period transactions, events and conditions whose omission could reasonably influence primary users'' decisions.',
 array['board_minutes','management_report'],
 'pillar=general_requirements. Events after the reporting period.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App D para 70',
 'Disclose comparative information for the preceding period for all amounts disclosed in the reporting period, and for narrative and descriptive information where useful, unless another standard permits or requires otherwise.',
 array['prior_report'],
 'pillar=general_requirements. Suspended in year one by App C para C3; comparative mechanics at paras B49-B59.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App D paras 72-73',
 'Make an explicit and unreserved statement of compliance only if the disclosures comply with ALL requirements of the Standard. Relief exists for information legally prohibited from disclosure or commercially sensitive climate-related opportunity information; using those exemptions does not prevent asserting compliance.',
 array['compliance_statement'],
 'pillar=general_requirements.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App D paras 74-75',
 'Disclose the judgements, other than estimation judgements, made in preparing the disclosures that have the most significant effect on the information, for example identification of risks and opportunities, choice of guidance sources, materiality, and value-chain reassessment triggers.',
 array['methodology_memo'],
 'pillar=general_requirements.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App D paras 77-78',
 'Identify the disclosed amounts subject to a high level of measurement uncertainty and, for each, disclose the sources of the uncertainty and the assumptions, approximations and judgements made in measuring the amount.',
 array['methodology_memo','emissions_calc_run'],
 'pillar=general_requirements.'),

('AASB_S2', 'Sep 2024 (amended by AASB S2025-1 Dec 2025)', 'AASB S2 App D paras 83-86',
 'Correct material prior-period errors by restating comparative amounts unless impracticable, distinguishing errors (misuse of reliable information that was available) from changes in estimates; B55-B59 govern the mechanics.',
 array['restatement_memo','prior_report'],
 'pillar=general_requirements.')

on conflict (standard, standard_version, clause_ref) do nothing;

-- ---------------------------------------------------------------------------
-- CORPORATIONS ACT 2001 OVERLAYS (ss 296A-296D, inserted by the Treasury Laws
-- Amendment (Financial Market Infrastructure and Other Measures) Act 2024,
-- No 87 of 2024, Schedule 4). These bind drafting even though they sit outside
-- the standard.
-- ---------------------------------------------------------------------------
insert into public.cd_clause_register
  (standard, standard_version, clause_ref, requirement_summary, evidence_types, applicability_notes)
values
('CORPORATIONS_ACT_2001', 'as amended by Act No 87 of 2024 (Sch 4)', 'Corporations Act s 296A(1)-(5)',
 'The annual sustainability report consists of the climate statements for the year, notes to the climate statements (Ministerial disclosures, standards-required notes, and anything else needed to make the s 296D disclosures), any Minister-required statements and notes, and the directors'' declaration.',
 array['compliance_statement','directors_declaration','disclosure_checklist'],
 'pillar=act_overlay. Defines the legal container the AASB S2 disclosures are delivered in.'),

('CORPORATIONS_ACT_2001', 'as amended by Act No 87 of 2024 (Sch 4)', 'Corporations Act s 296A(6)-(7)',
 'The directors must declare whether, in their opinion, the substantive provisions of the sustainability report are in accordance with the Act, including s 296C (compliance with sustainability standards) and s 296D (climate statement disclosures); the declaration must be made by directors'' resolution, dated, and signed by a director.',
 array['directors_declaration','board_minutes'],
 'pillar=act_overlay.'),

('CORPORATIONS_ACT_2001', 'as amended by Act No 87 of 2024 (Sch 4)', 'Corporations Act s 296B',
 'An entity with no material climate-related financial risks or opportunities may instead provide a statement of that circumstance and an explanation of how it applies, but only if it does not meet the size thresholds (2 of: consolidated revenue $200m+, consolidated gross assets $500m+, 250+ employees), is not NGER-registered or required to register, and is not a $5b+ registered scheme, RSE or retail CCIV. Materiality is assessed under the sustainability standards.',
 array['risk_assessment_memo','board_minutes','directors_declaration'],
 'pillar=act_overlay. Conditional alternative to full climate statements; s 296D(3) switches off s 296D when used.'),

('CORPORATIONS_ACT_2001', 'as amended by Act No 87 of 2024 (Sch 4)', 'Corporations Act s 296C',
 'The substantive provisions of the sustainability report must comply with the sustainability standards (AASB S2) and any further requirements the Minister determines by legislative instrument.',
 array['compliance_statement'],
 'pillar=act_overlay.'),

('CORPORATIONS_ACT_2001', 'as amended by Act No 87 of 2024 (Sch 4)', 'Corporations Act s 296D(1)-(2)',
 'The climate statements and notes must together disclose the material climate-related financial risks and opportunities, the climate-related metrics and targets including Scope 1, Scope 2 and Scope 3 (including financed) emissions, and the governance, strategy and risk-management information about them, in each case as required by the sustainability standards. Materiality is worked out under those standards.',
 array['disclosure_checklist','compliance_statement'],
 'pillar=act_overlay. The statutory hook that makes the AASB S2 pillar content legally required.'),

('CORPORATIONS_ACT_2001', 'as amended by Act No 87 of 2024 (Sch 4)', 'Corporations Act s 296D(2A)-(2B)',
 'A disclosed scenario analysis (or information derived from or about one) satisfies s 296D(1) only if the analysis was carried out using at least two scenarios: one where the global average temperature increase well exceeds the Climate Change Act 2022 s 3(a)(i) increase (well exceeds 2 degrees C above pre-industrial levels) and one where the increase is limited to the s 3(a)(ii) increase (1.5 degrees C above pre-industrial levels).',
 array['scenario_analysis_memo'],
 'pillar=act_overlay. Statutory minimum overlaying AASB S2 para 22; both scenarios must actually be run, not merely referenced.')

on conflict (standard, standard_version, clause_ref) do nothing;

commit;
