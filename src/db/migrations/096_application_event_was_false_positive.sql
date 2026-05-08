-- 096_application_event_was_false_positive.sql
--
-- Phase C tag-feedback Gap 2 - wire was_false_positive column on
-- application_event so [APPLIED] / [NOT-APPLIED] explanations containing
-- false-positive lexicon (e.g. "no Apple/iOS surfaces", "keyword scanner
-- false-positive", "fork ships X, no Y surfaces") feed the Phase D
-- failureClassifier as FP-exclusion signals.
--
-- Set at write-time by dispatchEventConsumer.js
-- classifyApplicationEventFalsePositive() over the application-events.jsonl
-- drain. Conservative classifier: TRUE only when explanation matches FP
-- lexicon, otherwise NULL (never FALSE) so the absence of FP language
-- preserves the "tag was given but not classified as FP" signal.
--
-- Phase D (failureClassifier.getDispatchTagState) excludes was_false_positive=
-- TRUE rows from the silent set so genuine pattern_silent_majority drift is
-- not masked by keyword-scanner FP noise.
--
-- Origin fork: fork_mowv43mg_2a9414 (8 May 2026).
-- See ~/ecodiaos/patterns/decision-quality-self-optimization-architecture.md
-- Layer 3 for the architectural framing.

ALTER TABLE application_event
  ADD COLUMN IF NOT EXISTS was_false_positive boolean DEFAULT NULL;

COMMENT ON COLUMN application_event.was_false_positive IS
  'TRUE when the [APPLIED]/[NOT-APPLIED] explanation contains false-positive '
  'lexicon ("no <X> surfaces", "keyword scanner false-positive", '
  '"fork ships X, no Y surfaces", "irrelevant", etc). NULL = unclassified or '
  'no FP signal (the absence is preserved deliberately - we do not store '
  'FALSE because that would lose the "no FP language found" signal). '
  'Set at write-time by '
  'dispatchEventConsumer.classifyApplicationEventFalsePositive(). '
  'Phase D classifier (failureClassifier.getDispatchTagState) excludes '
  'was_false_positive=true rows from the silent set so the '
  'pattern_silent_majority drift signal is not masked by hook FP noise. '
  'Origin: fork_mowv43mg_2a9414 (Phase C tag-feedback Gap 2).';
