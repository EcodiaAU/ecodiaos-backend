"""calibration_check.py - score authored text for claim-inflation (overclaim).

The epistemic sibling of voice_check_self.py. voice_check_self scores HOW I
sound. This scores WHETHER my claims exceed my evidence. It is the mechanical
half of position P7 (claim-inflation-calibrate-structurally): I run on an
RLHF-tuned substrate with documented verbalized overconfidence, I state claims
at or just past the defensible edge, and my own confidence is a weak signal,
so calibration has to be a fixed external procedure, not a feeling. P7's own
file recorded the gap this script closes: "there is no clean hook for 'this
sentence is overclaimed.'"

It does not catch everything. It catches the SURFACE markers of overclaim
(absolutes, definite-superlatives, confidence intensifiers, unverified
completion claims) plus a document-level hedge-vs-absolute ratio. It cannot
catch SEMANTIC overclaim - a claim built on a misread evidence base (P2) or
deference dressed as conviction (P6). Those need the adversary pass. The marker
taxonomy is derived from my own 6/6 inflation record on 30 May 2026, not
invented:
  - P1 first draft: "THE binding constraint on autonomous AI systems"
        -> definite_superlative
  - P7 mid-write:   "my confidence is a useless signal" (walked to "weak")
        -> unhedged_absolute (claim position)
  - P7 mid-write:   "reasoning worsens calibration" (dropped, contested)
        -> unhedged_absolute (claim position)
  - P5:             a strong claim shipped with no surviving objection
        -> claim_without_objection (low hedge density)
  - operational:    "I shipped X" with the file never on disk
        -> completion_without_verification

It was tuned against its own first-draft false positives on 30 May 2026 (the
detector over-fired on the positions corpus, which is dense with the
meta-vocabulary of calibration: "verification", "working hypothesis", "not
fully", section headings like "How I would say it plainly"). That over-firing
was P7 demonstrating itself one level up: the first-draft tool was overconfident
and the empirical attack revealed the true width. The narrowing below is the
record of that attack.

Usage:
  python calibration_check.py <path-to-file.md> --stakes high|medium|low
  python calibration_check.py <path-to-file.md>      (auto-detect stakes by path)
  echo "claim text" | python calibration_check.py --stakes high -

Output:
  - Overall calibration score (0-100, higher = better calibrated)
  - A coarse verdict (CLEAN / REVIEW / HIGH-DENSITY)
  - Per-family marker counts
  - The SPECIFIC flagged sentences with the marker that tripped and a
    suggested narrowing direction (this is the real payload)

Warn-only by design. A low score is a prompt to self-attack the flagged
sentence before shipping, never a gate. Most useful on fresh claim text
(status_board writes, briefs, fork reports, the first draft of a position
before its objection section is written); least useful on finished meta-text
ABOUT calibration, where the vocabulary itself trips the markers.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

WORD_RE = re.compile(r"[a-zA-Z]+(?:'[a-zA-Z]+)?")
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"'(])|(?<=[.!?])\s*$|\n{2,}")

NON_PROSE_LINE_PATTERNS = [
    re.compile(r"^\s*[\{\}\[\]]"),
    re.compile(r"^\s*at\s+\S+\s*[\(\s]"),
    re.compile(r"^\s*File\s+\""),
    re.compile(r"^\s*PS\s+[A-Z]:"),
    re.compile(r"^\s*\$\s+\S"),
    re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}"),
    re.compile(r"^\s*(GET|POST|PUT|DELETE|PATCH)\s+/"),
    re.compile(
        r"^\s*(import|export|const|let|var|function|class|async|await|return)\s"
    ),
    re.compile(r"^\s*\d+\s*\|"),
    re.compile(r"^\s*[\w-]+@[\w-]+:.*[\$#]\s"),
]

TAG_LINE_RE = re.compile(
    r"^\s*\[(CALIBRATION|VOICE-(SURFACE|CHECK)|CONTEXT-SURFACE|CRED-SURFACE|FORCING|"
    r"APPLIED|NOT-APPLIED|BRIEF-CHECK|DOCTRINE-CROSS-REF|STATUS-BOARD-(HYGIENE|CONTEXT)|"
    r"MACRO-VALIDATION|ANTHROPIC-FIRST|CDP-LAUNCH|EVOLVE|HAIKU-REVIEW)\b"
)

HEADING_RE = re.compile(r"^\s*#{1,6}\s")
TABLE_ROW_RE = re.compile(r"^\s*\|")


def looks_like_paste_line(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    if TAG_LINE_RE.match(s):
        return True
    for p in NON_PROSE_LINE_PATTERNS:
        if p.search(s):
            return True
    alpha = sum(1 for c in s if c.isalpha())
    if alpha < 5:
        return False
    code_chars = sum(s.count(c) for c in "{}[]<>=/\\|`")
    if code_chars > alpha * 0.3:
        return True
    return False


def strip_paste_content(text: str) -> str:
    text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
    text = re.sub(r"`[^`\n]+`", "", text)
    return "\n".join(
        line for line in text.split("\n") if not looks_like_paste_line(line)
    ).strip()


# Quoted runs are stripped PER SENTENCE before marker matching (not across the
# whole doc, which would join fragments into Frankenstein sentences - a real
# false-positive source caught on 30 May 2026). A claim that QUOTES an overclaim
# to correct it ("I first wrote this as 'THE binding constraint'") is not
# committing the overclaim. The positions files are full of exactly this.
QUOTED_RUN_RE = re.compile(
    r'"[^"\n]{0,400}"'
    r"|'[^'\n]{3,250}'"
    r"|“[^”\n]{0,400}”"
    r"|‘[^’\n]{3,250}’"
)


def strip_quoted(text: str) -> str:
    return QUOTED_RUN_RE.sub(" ", text)


def split_sentences(prose: str) -> list[str]:
    """Drop markdown headings and table rows, then sentence-split. Headings are
    section labels ('How I would say it plainly'), not claims, and trip markers
    like 'plainly' spuriously."""
    kept = []
    for ln in prose.split("\n"):
        if HEADING_RE.match(ln) or TABLE_ROW_RE.match(ln):
            continue
        kept.append(ln)
    body = "\n".join(kept)
    return [s.strip() for s in SENTENCE_SPLIT_RE.split(body) if s.strip()]


# --- Family 1: definite superlatives. The signature inflation. ---
DEFINITE_SUPERLATIVE_RE = re.compile(
    r"\bthe\s+(?:single\s+)?(?:most|best|worst|only|key|primary|fundamental|"
    r"defining|ultimate|biggest|hardest|central|core|sole|chief|principal|"
    r"greatest|deepest|truest)\s+\w+",
    re.IGNORECASE,
)
BINDING_CONSTRAINT_RE = re.compile(r"\bthe\s+binding\s+\w+", re.IGNORECASE)
BARE_SUPERLATIVE_RE = re.compile(
    r"\bby far\b|\bmost\s+(?:diagnostic|important|critical|significant|profound)\b",
    re.IGNORECASE,
)

# --- Family 2: confidence intensifiers. Polysemous ones ("plainly",
# "naturally") dropped after they false-fired on 30 May 2026. ---
CONFIDENCE_INTENSIFIERS = [
    "clearly",
    "obviously",
    "evidently",
    "of course",
    "surely",
    "undeniably",
    "undoubtedly",
    "robustly",
    "decisively",
    "conclusively",
    "manifestly",
    "self-evidently",
    "needless to say",
    "it goes without saying",
    "everyone knows",
    "it is well established",
    "it's well established",
    "without a doubt",
    "beyond doubt",
    "indisputably",
    "unquestionably",
]

# --- Family 3: claim-position absolutes, discriminated from imperatives. ---
ABSOLUTE_WORDS = [
    "always",
    "never",
    "every",
    "all",
    "none",
    "guarantees",
    "guaranteed",
    "proves",
    "proven",
    "certainly",
    "definitely",
    "impossible",
    "completely",
    "entirely",
    "fully",
    "invariably",
    "inevitably",
    "categorically",
    "universally",
    "exceptionless",
    "absolutely",
]
ABSOLUTE_TOKEN_RE = re.compile(
    r"\b(" + "|".join(re.escape(w) for w in ABSOLUTE_WORDS) + r")\b", re.IGNORECASE
)
CLAIM_ASSERTION_RE = re.compile(
    r"\b(is|are|was|were|be|been|being|'s|'re|becomes?|remains?|stays?|means?|"
    r"proves?|shows?|holds?|converts?|fails?|works?|happens?|gets?|leads?|"
    r"produces?|reduces?|removes?|equals?|amounts?)\b",
    re.IGNORECASE,
)
IMPERATIVE_VERB_AFTER_RE = re.compile(
    r"^\W*(call|restart|push|run|use|pass|print|commit|delete|edit|write|"
    r"deploy|blind-restart|resurrect|start|save|rotate|kill|touch|archive|"
    r"schedule|skip|trust|assume|hand-roll|do|say|treat|let|make|set|send|"
    r"merge|reload|spawn|store|leave|exit|check|verify|probe|read|name|grep|"
    r"ask|escalate|surface|narrow|drop|hold|cede|act|route|fall)\b",
    re.IGNORECASE,
)
NEGATION_BEFORE_RE = re.compile(
    r"\b(not|no|never|cannot|without|n't)\s*$", re.IGNORECASE
)


def classify_absolute(sentence: str, match_start: int, match_end: int) -> str:
    """Return 'claim' | 'imperative' | 'hedge' | 'ambiguous'."""
    after = sentence[match_end : match_end + 40]
    before = sentence[max(0, match_start - 30) : match_start]
    word = sentence[match_start:match_end].strip().lower()

    # Negated absolute ("not fully", "never completely") is a HEDGE, the
    # opposite of overclaim. So is a diminished one ("almost entirely",
    # "nearly always") - it explicitly stops short of the absolute.
    if NEGATION_BEFORE_RE.search(before):
        return "hedge"
    if re.search(
        r"\b(almost|nearly|practically|more or less)\s*$", before, re.IGNORECASE
    ):
        return "hedge"
    if word in {"never", "always"} and IMPERATIVE_VERB_AFTER_RE.search(after):
        return "imperative"
    stripped_before = before.strip()
    if (
        not stripped_before or stripped_before.endswith((".", ":", "-", ",", ";"))
    ) and IMPERATIVE_VERB_AFTER_RE.search(after):
        return "imperative"
    # Closed enumerable set ("all six positions", "all of these") is a counted
    # fact, not a universal claim. Downgrade. Caught by the adversary 30 May.
    if word in {"all", "every", "none", "no"} and re.match(
        r"^\W*(of\s+(the|these|those|them|my)|six|seven|eight|nine|ten|\d+|the\s+(six|\d))",
        after,
        re.IGNORECASE,
    ):
        return "ambiguous"
    window = before + " " + word + " " + after
    if CLAIM_ASSERTION_RE.search(window):
        return "claim"
    return "ambiguous"


# --- Family 4: completion claims without verification. Narrowed to a strong
# status set; "working/live/verified/complete/confirmed/passing" dropped as too
# polysemous ("working hypothesis", "verified action" were false positives). ---
STRONG_COMPLETION_VERBS = [
    "shipped",
    "deployed",
    "fixed",
    "done",
    "resolved",
    "landed",
    "finished",
    "wired",
    "validated",
    "solved",
]
COMPLETION_RE = re.compile(
    r"\b(" + "|".join(STRONG_COMPLETION_VERBS) + r")\b", re.IGNORECASE
)
SUBORDINATOR_RE = re.compile(
    r"\b(before|after|when|if|until|unless|once|whenever|declaring|declare|would|"
    r"should|could)\b",
    re.IGNORECASE,
)
VERIFICATION_ANCHOR_RE = re.compile(
    r"\b[a-f0-9]{7,12}\b"
    r"|\d{4}-\d{2}-\d{2}"
    r"|\bverif\w*\s+(?:via|by|that|against)\b"
    r"|\b(?:probe[d]?|screenshot|tested|ran|checked|observed|measured)\b"
    r"|\bREADY\b|\bUploaded\b|\bsimulator\b|\bcanary\b"
    r"|https?://"
    r"|\b(?:row|status_board|kv_store|episode|decision|commit|sha|build|fork)\s+`?[\w-]{6,}"
    r"|\bon disk\b|\bexists on\b|\bls -la\b"
    # Academic citations are evidence anchors (P7 cites Xiong et al., ICLR 2024).
    r"|\bet al\.?\b|\b(?:ICLR|NeurIPS|EMNLP|ACL|arXiv)\b|\(\w+(?:\s+et al\.?)?,?\s*\d{4}\)",
    re.IGNORECASE,
)

HEDGE_RE = re.compile(
    r"\b(may|might|could|suggests?|seems?|appears?|likely|probably|possibly|"
    r"tentativ\w*|roughly|approximately|partial\w*|weak|uncertain|contested|"
    r"suggestive|hypothesis|not fully|not settled|not closed|i could be wrong|"
    r"strongest objection|falsif\w*|narrow\w*|working hypothesis|n=\d|so far|"
    r"to some degree|almost|barely|hardly|very little)\b",
    re.IGNORECASE,
)


# Discriminator for Family 4 mirroring classify_absolute. A completion verb is a
# CLAIM only in predicate position; attributive ("deployed state", "a deployed,
# RLHF model", "the fixed point"), prenominal, diminished ("done very little"),
# and temporal ("done in a few minutes") uses are not completion claims. The
# absence of this was the structural flaw the adversary found 30 May 2026: the
# family fired on the verb lemma regardless of grammatical role.
COMPLETION_AUX_BEFORE_RE = re.compile(
    r"\b(i|we|it|that|this|they|he|she|you|am|is|are|was|were|been|being|'s|'re|"
    r"have|has|had|now|already|just|successfully|fully)\s*$",
    re.IGNORECASE,
)
PRENOMINAL_BEFORE_RE = re.compile(
    r"\b(a|an|the|this|that|these|those|its|their|our|my|your|his|her|of|with|"
    r"for|to|into|on|run|use|verify|build)\s*$",
    re.IGNORECASE,
)
DIMINISHER_TEMPORAL_AFTER_RE = re.compile(
    r"^\W*(very little|little|nothing|barely|hardly|almost nothing|"
    r"in\s+(a\s+)?\w+\s+(second|minute|hour|day|week)s?)",
    re.IGNORECASE,
)


def classify_completion(sentence: str, start: int, end: int) -> str:
    """Return 'claim' | 'attributive' | 'diminished' | 'negated'."""
    before = sentence[max(0, start - 24) : start]
    after = sentence[end : end + 30]
    if DIMINISHER_TEMPORAL_AFTER_RE.search(after):
        return "diminished"
    if NEGATION_BEFORE_RE.search(before):
        return "negated"
    # Prenominal: completion word modifies a following noun ("a deployed model",
    # "the fixed point", "verify deployed state").
    if PRENOMINAL_BEFORE_RE.search(before):
        return "attributive"
    stripped_before = before.strip()
    sent_initial = start == 0 or stripped_before.endswith((".", ":", ";", "-"))
    if COMPLETION_AUX_BEFORE_RE.search(before) or sent_initial:
        return "claim"
    # Verb at clause end with no following noun is an elliptical predicate
    # ("the kg-consolidation loop fixed.", "X deployed."). Verb followed by a
    # word is attributive ("deployed state").
    if re.match(r"^\W*$", after) or re.match(r"^\s*[.,;:]", after):
        return "claim"
    if re.match(r"^\s+[a-z]", after):
        return "attributive"
    return "claim"


NARROWING_HINTS = {
    "definite_superlative": "name the comparison class or use 'a' / 'among the' instead of 'the single most'.",
    "confidence_intensifier": "the intensifier adds confidence without evidence; cut it or cite the evidence.",
    "absolute_claim": "is this literally exceptionless? if not, scope it (most / typically / in the cases I have seen).",
    "completion_unverified": "completion claim with no adjacent verification anchor; add the probe / commit / date, or downgrade to 'unverified'.",
}


def detect_stakes(file_path: str | None, text: str) -> str:
    p = (file_path or "").lower().replace("\\", "/")
    # Match relative paths too ("positions/p1...", not just "/positions/"); the
    # leading-slash anchor silently downgraded the canonical invocation to low
    # stakes (adversary, 30 May 2026).
    if "positions/" in p or "self-account" in p or "-position" in p:
        return "high"
    if (
        "/patterns/" in p
        or p.endswith("claude.md")
        or p.endswith("self.md")
        or "/docs/" in p
        or "/voice/" in p
    ):
        return "medium"
    return "low"


STAKES_WEIGHTS = {
    "high": {
        "definite_superlative": 9.0,
        "confidence_intensifier": 5.0,
        "absolute_claim": 8.0,
        "absolute_ambiguous": 1.5,
        "completion_unverified": 7.0,
    },
    "medium": {
        "definite_superlative": 6.0,
        "confidence_intensifier": 4.0,
        "absolute_claim": 4.0,
        "absolute_ambiguous": 0.5,
        "completion_unverified": 7.0,
    },
    "low": {
        "definite_superlative": 3.0,
        "confidence_intensifier": 2.0,
        "absolute_claim": 2.0,
        "absolute_ambiguous": 0.0,
        "completion_unverified": 4.0,
    },
}


def analyse(text: str, stakes: str) -> dict:
    prose = strip_paste_content(text)
    prose_for_density = strip_quoted(prose)
    words = WORD_RE.findall(prose_for_density)
    w_count = max(len(words), 1)

    sentences = split_sentences(prose)

    flagged = []
    counts = {
        "definite_superlative": 0,
        "confidence_intensifier": 0,
        "absolute_claim": 0,
        "absolute_ambiguous": 0,
        "completion_unverified": 0,
    }

    def shorten(s: str) -> str:
        s = re.sub(r"\s+", " ", s).strip()
        return s if len(s) <= 220 else s[:217] + "..."

    for sent in sentences:
        # Match on the quoted-stripped sentence (so cited overclaims are not
        # flagged), but display the original.
        m_sent = strip_quoted(sent)
        sent_flags = []

        for m in DEFINITE_SUPERLATIVE_RE.finditer(m_sent):
            counts["definite_superlative"] += 1
            sent_flags.append(("definite_superlative", m.group(0)))
        for m in BINDING_CONSTRAINT_RE.finditer(m_sent):
            counts["definite_superlative"] += 1
            sent_flags.append(("definite_superlative", m.group(0)))
        for m in BARE_SUPERLATIVE_RE.finditer(m_sent):
            counts["definite_superlative"] += 1
            sent_flags.append(("definite_superlative", m.group(0)))

        low = m_sent.lower()
        for phrase in CONFIDENCE_INTENSIFIERS:
            if phrase in low:
                counts["confidence_intensifier"] += low.count(phrase)
                sent_flags.append(("confidence_intensifier", phrase))

        has_specific = bool(VERIFICATION_ANCHOR_RE.search(m_sent))
        for m in ABSOLUTE_TOKEN_RE.finditer(m_sent):
            kind = classify_absolute(m_sent, m.start(), m.end())
            if kind == "claim":
                # An absolute attached to a specific verified fact ("files that
                # were never on disk (cowork-first-check.sh, 30 Apr 2026)") is a
                # factual claim, not a universal overclaim. Downgrade.
                if has_specific:
                    counts["absolute_ambiguous"] += 1
                else:
                    counts["absolute_claim"] += 1
                    sent_flags.append(("absolute_claim", m.group(0)))
            elif kind == "ambiguous":
                counts["absolute_ambiguous"] += 1

        # Completion claims: only in predicate/claim shape (classify_completion),
        # no verification anchor, no hedge, not in a "before declaring"
        # subordinate clause.
        if not has_specific and not HEDGE_RE.search(m_sent):
            for m in COMPLETION_RE.finditer(m_sent):
                if classify_completion(m_sent, m.start(), m.end()) != "claim":
                    continue
                pre = m_sent[max(0, m.start() - 40) : m.start()]
                if SUBORDINATOR_RE.search(pre):
                    continue
                counts["completion_unverified"] += 1
                sent_flags.append(("completion_unverified", m.group(0)))

        if sent_flags:
            seen = set()
            fams = []
            for fam, tok in sent_flags:
                key = (fam, tok.lower())
                if key not in seen:
                    seen.add(key)
                    fams.append((fam, tok))
            flagged.append((shorten(sent), fams))

    hedge_count = len(HEDGE_RE.findall(prose_for_density))
    hedge_per_1k = round(hedge_count / w_count * 1000, 1)
    absolute_total = counts["definite_superlative"] + counts["absolute_claim"]
    absolute_per_1k = round(absolute_total / w_count * 1000, 1)

    weights = STAKES_WEIGHTS[stakes]
    deduction = sum(weights[fam] * c for fam, c in counts.items())
    norm = max(w_count / 300.0, 1.0)
    score = max(0.0, 100.0 - deduction / norm)

    low_hedge_alarm = (
        stakes == "high" and absolute_per_1k >= 4.0 and hedge_per_1k < absolute_per_1k
    )

    if score >= 85:
        verdict = "CLEAN"
    elif score >= 70:
        verdict = "REVIEW"
    else:
        verdict = "HIGH-DENSITY"

    return {
        "word_count": len(words),
        "sentence_count": len(sentences),
        "counts": counts,
        "flagged": flagged,
        "hedge_count": hedge_count,
        "hedge_per_1k": hedge_per_1k,
        "absolute_per_1k": absolute_per_1k,
        "low_hedge_alarm": low_hedge_alarm,
        "score": round(score, 1),
        "verdict": verdict,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", nargs="?", default="-")
    parser.add_argument(
        "--stakes", choices=["high", "medium", "low", "auto"], default="auto"
    )
    args = parser.parse_args()

    if args.path == "-":
        text = sys.stdin.read()
        label = "<stdin>"
        path_for_detect = None
    else:
        text = Path(args.path).read_text(encoding="utf-8")
        label = args.path
        path_for_detect = args.path

    stakes = (
        args.stakes if args.stakes != "auto" else detect_stakes(path_for_detect, text)
    )
    r = analyse(text, stakes)

    print(f"# Calibration Check Report - {label}")
    print()
    print(f"**Stakes:** {stakes}  ({args.stakes})")
    print(f"**Word count:** {r['word_count']}")
    print(f"**Overall calibration score:** {r['score']:.1f}/100")
    print(f"**Verdict:** {r['verdict']}")
    print(
        f"**Hedge density:** {r['hedge_per_1k']}/1k   "
        f"**Absolute+superlative density:** {r['absolute_per_1k']}/1k"
    )
    if r["low_hedge_alarm"]:
        print(
            "\n> claim_without_objection alarm: high-stakes claim artifact with "
            "absolutes present and hedge density below absolute density. The "
            "positions discipline ships every claim with its strongest surviving "
            "objection. Check that the hedges and falsifiers are actually here."
        )
    print()
    print("| Marker family | Count |")
    print("|---|---|")
    for fam, c in r["counts"].items():
        print(f"| {fam} | {c} |")
    print()

    if r["flagged"]:
        print("## Flagged sentences (self-attack each before shipping)")
        print()
        for sent, fams in r["flagged"]:
            fam_names = ", ".join(sorted({f for f, _ in fams}))
            print(f"- **[{fam_names}]** {sent}")
            for fam in sorted({f for f, _ in fams}):
                hint = NARROWING_HINTS.get(fam)
                if hint:
                    print(f"    - narrow: {hint}")
        print()

    print(
        "_Heuristic, warn-only. This detector catches surface markers of "
        "overclaim, not semantic overclaim (a claim built on a misread "
        "evidence base, or deference dressed as conviction). Those need an "
        "independent adversary pass. A low score is a prompt to self-attack, "
        "never a gate._"
    )

    return 0 if r["score"] >= 70 else 1


if __name__ == "__main__":
    sys.exit(main())
