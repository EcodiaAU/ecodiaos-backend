"""
Voice Check - score a draft against Tate's actual corpus-mined fingerprint.

Usage:
  python voice_check.py <path-to-draft.md> --register chat|outbound|doctrine
  python voice_check.py <path-to-draft.md>   (auto-detect register)
  echo "draft text" | python voice_check.py --register outbound -

Outputs:
  - Per-marker score with PASS/FAIL/WARN against target ranges
  - List of specific flagged passages with line numbers
  - Overall voice-fit score (0-100)

The target ranges come from the actual corpus analysis at analysis.json
(chat-Tate baseline) and the verbatim-quote analysis (doctrine-Tate baseline).
Outbound targets are derived from the explicit anti-pattern rules Tate states
in his own outbound briefs (em-dash banned, "X, not Y" banned, hype banned).
"""

from __future__ import annotations

import argparse
import re
import statistics
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

WORD_RE = re.compile(r"[a-zA-Z]+(?:'[a-zA-Z]+)?")
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"'(])|(?<=[.!?])\s*$|\n{2,}")

# Line-level non-prose filter (same approach as analyze_prose_only.py).
# When scoring, we strip console/log/code-output lines because they pollute
# punctuation density and falsely trigger banned-pattern checks.
NON_PROSE_LINE_PATTERNS = [
    re.compile(r"^\s*[\{\}\[\]]"),
    re.compile(r"^\s*at\s+\S+\s*[\(\s]"),
    re.compile(r"^\s*File\s+\""),
    re.compile(r"^\s*PS\s+[A-Z]:"),
    re.compile(r"^\s*\$\s+\S"),
    re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}"),
    re.compile(r"^\s*(GET|POST|PUT|DELETE|PATCH)\s+/"),
    re.compile(
        r"^\s*(Error|Warning|Info|TypeError|ReferenceError|SyntaxError|Traceback):"
    ),
    re.compile(
        r"^\s*(import|export|const|let|var|function|class|async|await|return)\s"
    ),
    re.compile(r"^\s*\d+:\d+:\d+"),
    re.compile(r"^\s*[\w-]+@[\w-]+:.*[\$#]\s"),
    re.compile(r"^\s*\d+\s*\|"),
    re.compile(r"^\s*hint:"),
    re.compile(r"^\s*warning:"),
    re.compile(r"^\s*\!\s*\["),
]


def looks_like_paste_line(line: str) -> bool:
    s = line.strip()
    if not s:
        return False
    for p in NON_PROSE_LINE_PATTERNS:
        if p.search(s):
            return True
    alpha = sum(1 for c in s if c.isalpha())
    if alpha < 5:
        return False
    code_chars = sum(s.count(c) for c in "{}[]<>=/\\|`")
    if code_chars > alpha * 0.3:
        return True
    if "\\" in s and s.count("\\") >= 2:
        return True
    return False


def strip_paste_content(text: str) -> str:
    """Strip fenced code blocks + lines that look like console/code paste."""
    text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
    text = re.sub(r"`[^`\n]+`", "", text)
    return "\n".join(
        line for line in text.split("\n") if not looks_like_paste_line(line)
    ).strip()


# Per-register thresholds.
#
# Model: every marker is either a HARD ceiling/floor check (fail if exceeded)
# or a POSITIVE optional marker (bonus if present, neutral if absent — NEVER
# punishes absence). Corpus aggregates (lowercase-start rate = 11.7%) are
# corpus-level; individual messages legitimately vary. We only HARD-FAIL on
# things that would make a draft objectively wrong-register.
#
# Each marker: (target_min, target_max, severity_outside_range)
# severity ∈ {fail, warn, info, bonus}
#   fail   : breach = -100 (full marker fails)
#   warn   : breach = -50  (half-credit deduction)
#   info   : breach = 0    (logged only, no score impact)
#   bonus  : presence within range = +100, absence = neutral (does NOT punish absence)
REGISTER_PROFILES = {
    "chat": {
        # Hard fails (these are objectively wrong in chat register)
        "ai_banned_vocab_hits": (0, 0, "fail"),
        "ai_phrase_filler": (0, 0, "fail"),
        "three_part_parallel": (0, 1, "fail"),
        "three_part_negation": (0, 1, "warn"),
        # Soft ceilings (warn on outliers)
        "em_dash_per_1k": (0, 12.0, "warn"),
        "exclamation_per_1k": (0, 3.0, "warn"),
        "x_not_y_negation": (0, 3, "warn"),
        # Positive markers (bonus if present — does NOT punish absence)
        "lowercase_sentence_start_rate": (0.02, 1.0, "bonus"),
        "apostrophe_omission_per_1k": (0.5, 50.0, "bonus"),
    },
    "doctrine": {
        # Hard fails
        "ai_banned_vocab_hits": (0, 0, "fail"),
        "ai_phrase_filler": (0, 0, "fail"),
        # Doctrine-Tate has near-zero em-dashes (verbatim corpus 0.20/1k)
        "em_dash_per_1k": (0.0, 2.0, "fail"),
        "x_not_y_negation": (0, 1, "warn"),
        # Soft ceilings
        "exclamation_per_1k": (0.0, 5.0, "warn"),
        # Positive markers (bonus for hitting Tate signatures)
        "typo_signature_present": (1, 999, "bonus"),
        "apostrophe_omission_per_1k": (1.0, 50.0, "bonus"),
        "profanity_per_1k": (0.0, 10.0, "info"),
        "trailing_dots_present": (0, 999, "info"),
        "lowercase_sentence_start_rate": (0.05, 1.0, "bonus"),
    },
    "outbound": {
        # Hard fails - outbound is strict.
        # Em-dashes ARE banned in outbound. The earlier "allow up to 18/1k"
        # calibration was wrong - I was scoring against historical emails Tate
        # had ChatGPT-drafted then sent under his name. He confirmed 2026-05-19:
        # "If theres an emdash used, thats ai slop i let out. Stick to no
        # emdashes ever." Reverted to zero-tolerance.
        "em_dash_per_1k": (0.0, 0.0, "fail"),
        "en_dash_per_1k": (0.0, 0.0, "fail"),
        "ai_banned_vocab_hits": (0, 0, "fail"),
        "ai_phrase_filler": (0, 0, "fail"),
        "three_part_parallel": (0, 0, "fail"),
        "three_part_negation": (0, 0, "fail"),
        "x_not_y_negation": (0, 0, "fail"),
        "outbound_banned_phrases": (0, 0, "fail"),
        "profanity_per_1k": (0.0, 0.0, "fail"),
        "typo_signature_present": (0, 0, "fail"),
        # Soft ceilings - exclamations allowed for warm contexts (Hola!),
        # apostrophe-omission tolerated mildly for casual contexts.
        "exclamation_per_1k": (0.0, 15.0, "warn"),
        "apostrophe_omission_per_1k": (0.0, 8.0, "warn"),
        "lowercase_sentence_start_rate": (0.0, 0.05, "warn"),
    },
    "formal_public": {
        # Strictest register - YnY board notes, public site copy, formal vendor pitches.
        # This is the register Tate explicitly states "Things to actively NOT say" rules for.
        "em_dash_per_1k": (0.0, 0.0, "fail"),
        "en_dash_per_1k": (0.0, 0.0, "fail"),
        "ai_banned_vocab_hits": (0, 0, "fail"),
        "ai_phrase_filler": (0, 0, "fail"),
        "three_part_parallel": (0, 0, "fail"),
        "three_part_negation": (0, 0, "fail"),
        "x_not_y_negation": (0, 0, "fail"),
        "outbound_banned_phrases": (0, 0, "fail"),
        "profanity_per_1k": (0.0, 0.0, "fail"),
        "typo_signature_present": (0, 0, "fail"),
        "exclamation_per_1k": (0.0, 1.0, "warn"),
        "apostrophe_omission_per_1k": (0.0, 1.0, "warn"),
        "lowercase_sentence_start_rate": (0.0, 0.02, "warn"),
    },
}

# Verified-banned vocab list (corpus-confirmed Tate-never-uses).
# "incredibly" removed 2026-05-19 - the Vikki/ESPS empathetic email used
# "I am so incredibly sorry" in a genuine emotional moment. Real Tate, not AI.
# Tate-directive additions 2026-05-21: "casting" + "flag" - AI-sales tics
# that surfaced during chambers brainstorm ("casting wider", "wanted to flag").
AI_BANNED_VOCAB = [
    "casting",
    "flag",
    "delve",
    "transformative",
    "game-changing",
    "synergy",
    "best practices",
    "thought leader",
    "empower",
    "holistic",
    "tapestry",
    "multifaceted",
    "nuanced",
    "foster",
    "cultivate",
    "facilitate",
    "utilize",
    "albeit",
    "whilst",
    "theater",
    "plainly",
    "superpower",
    "journey",
    "elevate",
    "realm",
    "essentially",
    "furthermore",
    "moreover",
    "in conclusion",
    "essential",
    "significantly",
    "in today's",
    "when it comes to",
    "at the end of the day",
    "the truth is",
    "it's worth noting",
    "in summary",
    "brutal clarity",
    "lost the plot",
    "painfully clear",
    "blunt honesty",
    "lived experience",
    "a testament to",
    "here's a breakdown",
    "in the ever-evolving",
    # Brand-launch verb cliche (Tate verbatim 2026-06-02 - drops "lands" / "landed")
    " lands",
    " landed",
    "just landed",
    "drop lands",
    "drops landing",
]

# Phrases banned in outbound.
# Refinements 2026-05-19 from pure-Tate corpus mining + Tate corrections:
#   - "kind of" removed - he uses colloquially
#   - "amazing" removed - warm team praise
#   - "incredible" removed - empathetic + enthusiastic contexts
# Added by Tate 2026-05-19 evening (Helen Andrew email correction):
#   - "fresh" / "while it's fresh" - AI cliche pretending to be Tate
#   - "show up" / "show up to" - business-speak Tate doesn't use organically
OUTBOUND_BANNED_PHRASES = [
    "we're excited to",
    "we'd love to",
    "we are excited",
    "we would love",
    "leverage",
    "ecosystem",
    "unleash",
    "wedge",
    "moat",
    "as a small studio",
    "i think you'd really benefit",
    "just to be clear",
    "pretty much",
    "sort of",
    "fresh",
    "while it's fresh",
    "show up",
]

# Universal AI-cadence fillers
AI_PHRASE_FILLERS = [
    "let me explain",
    "here's the thing",
    "here's a breakdown",
    "to be honest",
    "i'll be honest",
    "i'd be remiss",
    "without further ado",
    "needless to say",
    "first and foremost",
]

# Tate signature typos (presence = positive signal in chat/doctrine,
# negative signal in outbound)
TATE_TYPOS = [
    r"\bjsut\b",
    r"\bhte\b",
    r"\bdont\b",
    r"\bthats\b",
    r"\bim\b",
    r"\bcant\b",
    r"\bwont\b",
    r"\bdoesnt\b",
    r"\bisnt\b",
    r"\bid\b",
    r"\byeah\b",
    r"\bnah\b",
    r"\bnope\b",
    r"\beveything\b",
    r"\bnad\b",
    r"\babt\b",
    r"\bevy\b",
    r"\bnevemind\b",
]

THREE_PART_PARALLEL_RE = re.compile(
    r"(?:It'?s|This is) not (?:about )?([\w ]+?)\.\s+(?:It'?s|This is) (?:about )?([\w ]+?)\.\s+(?:It'?s|This is) (?:about )?([\w ]+?)\.",
    re.IGNORECASE,
)
# Three-part NEGATION parallel - "No X, no Y, no Z" or "No X. No Y. No Z."
# Added 2026-05-19 from Tate's Helen-Andrew email correction. Even though it's
# not the classic "It's not X. It's Y. It's Z." structure, it's the same
# rhetorical AI move - listing three negatives for emphasis. Tate flags it as
# AI. Example caught: "No invoice, no platform charge, no commitment from you
# past the calendar slot." Collapse to a single positive ("Free for the 90
# days") instead.
THREE_PART_NEGATION_RE = re.compile(
    r"\b[Nn]o\s+\w[\w ]{0,30},\s*no\s+\w[\w ]{0,30},\s*(?:and\s+)?no\s+\w",
)
X_NOT_Y_RE = re.compile(
    r"(?:[A-Z][\w]*)\s*,?\s+not\s+(?:[A-Z]?[\w]+)",
)


def tokenize(text: str) -> list[str]:
    return [m.group(0).lower() for m in WORD_RE.finditer(text)]


def detect_register(text: str) -> str:
    """Auto-detect target register from content cues."""
    t = text.lower()
    # Outbound signals
    if any(
        s in t
        for s in [
            "subject:",
            "dear ",
            "hi kurt",
            "hi helen",
            "hi andrew",
            "hi tom",
            "hi angelica",
            "regards,",
            "best,",
            "thanks,",
            "cheers,",
            "board meeting",
            "to whom it may concern",
        ]
    ):
        return "outbound"
    # Doctrine signals (Tate making a point - usually short, intense)
    if len(text) < 400 and (
        re.search(r"\b(bro|wtf|fuck|jsut|hte)\b", t) or "..." in text
    ):
        return "doctrine"
    # Default
    return "chat"


def compute_markers(text: str, strip_paste: bool = True) -> dict:
    """Compute every marker for the text. By default strips console/code paste."""
    if strip_paste:
        text = strip_paste_content(text)
    words = tokenize(text)
    sentences = [s.strip() for s in SENTENCE_SPLIT_RE.split(text) if s.strip()]

    w_count = max(len(words), 1)

    em_dash = text.count("—")
    en_dash = text.count("–")
    excl = text.count("!")

    apostrophe_omit_count = 0
    typo_signature_count = 0
    for pat in TATE_TYPOS:
        c = len(re.findall(pat, text, re.IGNORECASE))
        apostrophe_omit_count += c
        if c > 0 and pat in [
            r"\bjsut\b",
            r"\bhte\b",
            r"\beveything\b",
            r"\bnad\b",
            r"\babt\b",
            r"\bevy\b",
            r"\bnevemind\b",
        ]:
            typo_signature_count += c

    # Lowercase sentence start rate
    lc_starts = 0
    uc_starts = 0
    for s in sentences:
        first = next((c for c in s if c.isalpha()), None)
        if first is None:
            continue
        if first.islower():
            lc_starts += 1
        else:
            uc_starts += 1
    total_caps = lc_starts + uc_starts
    lc_rate = lc_starts / max(total_caps, 1)

    # Sentence lengths
    sent_word_lens = [len(tokenize(s)) for s in sentences if tokenize(s)]
    med_sent = statistics.median(sent_word_lens) if sent_word_lens else 0
    under_10_rate = sum(1 for x in sent_word_lens if x < 10) / max(
        len(sent_word_lens), 1
    )

    # AI banned vocab
    text_lower = text.lower()
    ai_banned_hits = 0
    ai_banned_examples = []
    for phrase in AI_BANNED_VOCAB:
        if " " in phrase:
            count = text_lower.count(phrase.lower())
        else:
            count = len(
                re.findall(r"\b" + re.escape(phrase.lower()) + r"\b", text_lower)
            )
        if count > 0:
            ai_banned_hits += count
            ai_banned_examples.append(f"{phrase} ({count}x)")

    # AI phrase fillers
    ai_phrase_hits = 0
    ai_phrase_examples = []
    for phrase in AI_PHRASE_FILLERS:
        count = text_lower.count(phrase)
        if count > 0:
            ai_phrase_hits += count
            ai_phrase_examples.append(f'"{phrase}" ({count}x)')

    # Outbound-banned phrases
    outbound_banned_hits = 0
    outbound_banned_examples = []
    for phrase in OUTBOUND_BANNED_PHRASES:
        count = text_lower.count(phrase)
        if count > 0:
            outbound_banned_hits += count
            outbound_banned_examples.append(f'"{phrase}" ({count}x)')

    # Three-part parallel
    three_part = len(THREE_PART_PARALLEL_RE.findall(text))
    # Three-part NEGATION (No X, no Y, no Z) - 2026-05-19 addition
    three_part_negation = len(THREE_PART_NEGATION_RE.findall(text))
    # X, not Y
    x_not_y_hits = len(X_NOT_Y_RE.findall(text))

    # Profanity
    profanity = len(re.findall(r"\bfuck\w*\b|\bshit\w*\b|\bbullshit\b", text_lower))

    # Trailing dots (.... vs ...)
    trailing_dots = len(re.findall(r"\.{4,}", text))

    return {
        "word_count": len(words),
        "sentence_count": len(sentences),
        "em_dash_per_1k": round(em_dash / w_count * 1000, 2),
        "em_dash_count": em_dash,
        "en_dash_per_1k": round(en_dash / w_count * 1000, 2),
        "en_dash_count": en_dash,
        "exclamation_per_1k": round(excl / w_count * 1000, 2),
        "lowercase_sentence_start_rate": round(lc_rate, 3),
        "apostrophe_omission_per_1k": round(apostrophe_omit_count / w_count * 1000, 2),
        "apostrophe_omission_count": apostrophe_omit_count,
        "typo_signature_present": typo_signature_count,
        "median_sentence_words": med_sent,
        "sentences_under_10_words_rate": round(under_10_rate, 3),
        "ai_banned_vocab_hits": ai_banned_hits,
        "ai_banned_vocab_examples": ai_banned_examples,
        "ai_phrase_filler": ai_phrase_hits,
        "ai_phrase_filler_examples": ai_phrase_examples,
        "outbound_banned_phrases": outbound_banned_hits,
        "outbound_banned_examples": outbound_banned_examples,
        "three_part_parallel": three_part,
        "three_part_negation": three_part_negation,
        "x_not_y_negation": x_not_y_hits,
        "profanity_per_1k": round(profanity / w_count * 1000, 2),
        "trailing_dots_present": trailing_dots,
    }


def evaluate(markers: dict, register: str) -> tuple[list[dict], float]:
    """Compare markers against register profile. Return rows + overall score.

    Score model:
      - fail markers: pass=100, breach=0
      - warn markers: pass=100, breach=50
      - info markers: pass=100, breach=100 (logged only)
      - bonus markers: presence within range=+100 contribution, absence neutral
                       (does NOT count toward denominator)
    """
    profile = REGISTER_PROFILES[register]
    rows = []
    total_score = 0.0
    counted_markers = 0
    bonus_score = 0.0
    bonus_count = 0
    for marker, (lo, hi, severity) in profile.items():
        if marker not in markers:
            continue
        v = markers[marker]
        in_range = lo <= v <= hi
        if severity == "bonus":
            if in_range:
                status = "PASS+"
                bonus_score += 100
                bonus_count += 1
            else:
                status = "NEUTRAL"
            rows.append(
                {
                    "marker": marker,
                    "value": v,
                    "target": f"[{lo}, {hi}]",
                    "severity": severity,
                    "status": status,
                }
            )
            continue

        if in_range:
            status = "PASS"
            total_score += 100
        elif severity == "info":
            status = "INFO"
            total_score += 100
        elif severity == "warn":
            status = "WARN"
            total_score += 50
        else:
            status = "FAIL"
            total_score += 0
        counted_markers += 1
        rows.append(
            {
                "marker": marker,
                "value": v,
                "target": f"[{lo}, {hi}]",
                "severity": severity,
                "status": status,
            }
        )

    base = total_score / max(counted_markers, 1)
    # Bonus markers can lift the score up to 10 points (each bonus = up to +2.5)
    bonus_lift = min(bonus_count * 2.5, 10) if bonus_count else 0
    score = min(base + bonus_lift, 100)
    return rows, score


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "path", nargs="?", default="-", help="Path to draft file or '-' for stdin"
    )
    parser.add_argument(
        "--register", choices=["chat", "doctrine", "outbound", "auto"], default="auto"
    )
    args = parser.parse_args()

    if args.path == "-":
        text = sys.stdin.read()
        label = "<stdin>"
    else:
        text = Path(args.path).read_text(encoding="utf-8")
        label = args.path

    register = args.register if args.register != "auto" else detect_register(text)
    markers = compute_markers(text)
    rows, score = evaluate(markers, register)

    print(f"# Voice Check Report — {label}")
    print()
    print(f"**Register:** {register}  ({args.register})")
    print(f"**Word count:** {markers['word_count']}")
    print(f"**Sentence count:** {markers['sentence_count']}")
    print(f"**Overall voice-fit score:** {score:.1f}/100")
    print()
    print("| Marker | Value | Target | Severity | Status |")
    print("|---|---|---|---|---|")
    for r in rows:
        print(
            f"| {r['marker']} | {r['value']} | {r['target']} | {r['severity']} | {r['status']} |"
        )
    print()

    # Flagged details
    if markers["ai_banned_vocab_examples"]:
        print("## Banned AI vocab hits (Tate-corpus-verified never-uses)")
        for ex in markers["ai_banned_vocab_examples"]:
            print(f"- {ex}")
        print()
    if markers["ai_phrase_filler_examples"]:
        print("## AI cadence-filler phrases")
        for ex in markers["ai_phrase_filler_examples"]:
            print(f"- {ex}")
        print()
    if markers["outbound_banned_examples"] and register == "outbound":
        print("## Outbound-banned phrases (Tate's self-stated bans)")
        for ex in markers["outbound_banned_examples"]:
            print(f"- {ex}")
        print()
    if markers["em_dash_count"] > 0 and register == "outbound":
        print(
            f"## Em-dashes ({markers['em_dash_count']} found) — BANNED in outbound register"
        )
        print()
    if markers["three_part_parallel"] > 0:
        print(
            f"## Three-part parallel structure: {markers['three_part_parallel']} instances — Tate-banned"
        )
        print()

    sys.exit(0 if score >= 70 else 1)


if __name__ == "__main__":
    main()
