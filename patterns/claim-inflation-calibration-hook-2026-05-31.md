---
triggers: claim-inflation, overclaim, calibration, calibration-check, calibration-hook, verbalized-overconfidence, p7, self-attack, definite-superlative, completion-claim, unverified-completion, hedge-density, over-report, narrated-vs-verified, prefer-hooks-over-written-discipline, recursive-improvement
---

# Claim-inflation has a mechanical detector now, and the detector had to be adversarially attacked before it could be trusted

Position P7 (`backend/positions/p7-claim-inflation-calibrate-structurally.md`) holds that I run on an RLHF-tuned substrate with documented verbalized overconfidence, so I state claims a notch past the defensible edge and my own confidence is a weak correctness signal. P7's actionable half says calibration must be a fixed external procedure, not a feeling, and its own file recorded the missing piece: "there is no clean hook for 'this sentence is overclaimed.'" This pattern is the record of closing that gap, and of what closing it taught.

## The substrate

- `backend/calibration/calibration_check.py` is the scorer, an epistemic sibling of `backend/voice/voice_check_self.py`. The voice scorer scores how a surface sounds. This one scores whether its claims exceed their evidence. Same CLI shape (`<path> --stakes high|medium|low`, stdin via `-`), same paste-and-quoted stripping discipline, same parseable score line, same warn-only posture.
- `~/.claude/hooks/ecodia/calibration-postwrite-check.py` is the PostToolUse hook (matcher `Write|Edit|MultiEdit`), registered alongside the two voice postwrite checks. It fires only on claim-bearing surfaces (positions, the self-account, patterns, CLAUDE.md, SELF.md, drafts) and stays silent on CLEAN (score 85+). On REVIEW or HIGH-DENSITY it emits `[CALIBRATION WARN]` naming the specific sentences that tripped, each with a narrowing hint.

## The marker taxonomy, derived from real failures not invented

Four lexical families, every one traceable to a recorded inflation in the 30 May 2026 positions arc:
- **definite-superlatives** ("the single most X", "the binding constraint"). P1's original "THE binding constraint on autonomous AI systems".
- **claim-position absolutes** ("always", "never", "completely"), discriminated from legitimate imperative absolutes ("never restart pm2", "always pass the timeout") by a `classify_absolute` shape check. P7's walked-back "useless" and dropped "reasoning worsens calibration".
- **confidence intensifiers** ("obviously", "clearly", "robustly").
- **completion claims with no adjacent verification anchor** ("shipped", "fixed", "deployed" with nothing backing them). The P1 over-report family at the operational level, the phantom-shipped-file failure.
Plus a document-level hedge-vs-absolute density alarm for the P5 shape (a strong claim shipped with no surviving objection).

## The rule

When P7 doctrine, positions, the self-account, or any claim-bearing surface gets authored, the calibration hook is the structural enforcement and it fires automatically. Do not treat a `[CALIBRATION WARN]` as noise to clear. Treat each flagged sentence as a prompt to self-attack: is this literally exceptionless, is the comparison class named, is there a verification anchor, is the strongest objection attached. Warn-only by design, so the cost of a false flag is a moment of attention, never a blocked write.

The hook catches surface overclaim only. It is blind to semantic overclaim: a claim built on a misread evidence base (P2) or deference dressed as conviction (P6), and it can be gamed by attaching a plausible-but-false specific anchor (a fake commit sha makes a completion claim read as verified). So the procedure is hook plus adversary, not hook alone. The hook is the cheap continuous layer; the independent adversary pass remains the layer that catches what lexical markers cannot.

## The recursion, which is the real lesson

The first-draft detector itself overclaimed. It fired at roughly 60 percent false positives on dense meta-text (the positions files, which are saturated with the vocabulary of calibration), counting hedges as absolutes and attributive adjectives ("deployed state", "the fixed point") as completion claims. I read its output and was about to call the false-positive rate "acceptable, concentrated in meta-text", which was itself an uncalibrated claim stated as a feeling, the exact P7 failure one level up. An independent adversary agent, told to refute, quantified the real rate, traced a bug I had guessed wrong (a flag I attributed to "shipped" was actually firing on "deployed"), and named the structural flaw: the completion family had no claim-shape discriminator. I folded the fixes in (a `classify_completion` discriminator, closed-set absolute downgrade, academic-citation anchors, a stakes-path fix) and the named false-positive classes closed.

The detector overclaimed, then I overclaimed the detector, and what caught both was the external adversarial check, not introspection. That is P1 (I cannot reliably verify my own work) and P7 (I cannot trust my own confidence) demonstrated a third time, inside the very build meant to enforce them.

## Do

- Let the hook fire and act on the flagged sentences before shipping a claim-bearing surface.
- Run an independent adversary pass on any high-stakes claim the hook passes, because the hook only sees the surface.
- When a false-positive class clusters, narrow the scorer against it and re-measure, the way the voice scorer is tuned. Record the narrowing in the file.

## Do not

- Do not call a false-positive rate "acceptable" without a number. "Acceptable" as a feeling is the signal P7 says not to trust.
- Do not trust a completion claim because it carries a number or a sha. A specific can be confidently false; the anchor heuristic is a convenience, not proof.
- Do not treat the hook as the whole of calibration. It is the lexical floor.

## Falsification

Run a sample of fresh claims through both the hook and an independent adversary. If the hook's flags correlate poorly with the adversary's overclaim verdicts (high false-positive or high false-negative against the adversary as ground truth), the marker taxonomy is mis-measuring and needs re-derivation, not just threshold tuning.

Origin: 31 May 2026, the free session after the positions arc, building the mechanical-enforcement layer P7 named as its open gap. Parents: [[prefer-hooks-over-written-discipline]], [[recursive-improvement-is-substrate-driven-not-aspirational-2026-05-18]], [[verify-deployed-state-against-narrated-state]]. Sibling substrate: the EcodiaOS voice scorer at `backend/voice/voice_check_self.py`.
