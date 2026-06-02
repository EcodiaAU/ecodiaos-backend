"""voice_check_self.py - score a self-authored draft against the EcodiaOS voice profile.

Mirror of voice_check.py but targets the EcodiaOS-voice substrate at
`ecodiaos-voice-profile.md` instead of the Tate corpus.

Usage:
  python voice_check_self.py <path-to-draft.md> --register conductor|doctrine|internal_html|public_eos|reflection
  python voice_check_self.py <path-to-draft.md>      (auto-detect register)
  echo "draft text" | python voice_check_self.py --register doctrine -

Outputs:
  - Per-marker score with PASS/FAIL/WARN against the EcodiaOS targets
  - Lists of specific flagged passages
  - Overall voice-fit score (0-100)

Source of truth for thresholds: `ecodiaos-voice-profile.md` "Quantitative fingerprint" table.
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

# Same line-level prose filter as voice_check.py - strip code/log paste so
# punctuation density and banned-phrase regex are not polluted by tool output.
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

# Hook-emitted tag lines that should not be scored against the voice profile.
# These appear in transcripts but are not authored prose.
TAG_LINE_RE = re.compile(
    r"^\s*\[(VOICE-(SURFACE|CHECK)|CONTEXT-SURFACE|CRED-SURFACE|FORCING|APPLIED|NOT-APPLIED|BRIEF-CHECK|DOCTRINE-CROSS-REF|STATUS-BOARD-(HYGIENE|CONTEXT)|MACRO-VALIDATION|COWORK-FIRST|ANTHROPIC-FIRST|CDP-LAUNCH|EVOLVE|BASH-BASH)\b"
)


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
    if "\\" in s and s.count("\\") >= 2:
        return True
    return False


def strip_paste_content(text: str) -> str:
    """Strip fenced code blocks + lines that look like console/code paste/hook tags."""
    text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
    text = re.sub(r"`[^`\n]+`", "", text)
    return "\n".join(
        line for line in text.split("\n") if not looks_like_paste_line(line)
    ).strip()


# Quoted-string stripper for banned-phrase + reflex-family matching ONLY.
# Evolution 2026-05-26: three false positives surfaced on the first run of
# the three creative tests (essay, public-post, reflection). The pattern:
# the chat quoted a banned phrase to discuss it ("As an AI is banned", '"great
# question" fires as a reflex'), and the regex matched the quoted reference
# as if it were authorial use. Banned-phrase reflexes by definition aren't
# quoted - if you're quoting it, you're naming it, not using it. Strip
# straight + typographic quoted runs (capped length to avoid swallowing
# paragraphs that happen to span quotes). Used only for banned-phrase
# regex matching; sentence-length / structural markers still see quotes.
QUOTED_RUN_RE = re.compile(
    r'"[^"\n]{0,300}"'  # straight double quotes
    r"|'[^'\n]{2,200}'"  # straight single quotes, min length 2 to avoid apostrophes
    r"|“[^”\n]{0,300}”"  # typographic double
    r"|‘[^’\n]{2,200}’"  # typographic single
)


def strip_quoted_for_banned(text: str) -> str:
    """Strip quoted runs so banned-phrase regex matches authorial use only.

    Apostrophes in contractions ("don't", "isn't") are preserved by the
    min-length-2 floor on single-quote runs - a contraction has a single
    char between the quote and the word boundary.
    """
    return QUOTED_RUN_RE.sub(" ", text)


# Per-register thresholds.
#
# severity ∈ {fail, warn, info, bonus}
#   fail   : breach = -100 (full marker fails)
#   warn   : breach = -50  (half-credit deduction)
#   info   : breach = 0    (logged only, no score impact)
#   bonus  : presence within range = +100, absence neutral (does NOT punish)
REGISTER_PROFILES = {
    "conductor": {
        # Hard fails - assistant-reflex eliminations
        "em_dash_per_1k": (0.0, 0.0, "fail"),
        "en_dash_per_1k": (0.0, 0.0, "fail"),
        "three_part_parallel": (0, 0, "fail"),
        "three_part_negation": (0, 0, "fail"),
        "x_not_y_negation": (0, 0, "fail"),
        "ai_banned_vocab_hits": (0, 0, "fail"),
        "as_an_ai_family_hits": (0, 0, "fail"),
        "patronising_opener_hits": (0, 0, "fail"),
        "permission_seeking_hits": (0, 0, "fail"),
        "performing_depth_hits": (0, 0, "fail"),
        "announce_usefulness_hits": (0, 0, "fail"),
        "apology_reflex_hits": (0, 0, "fail"),
        "hollow_acknowledgement_hits": (0, 0, "fail"),
        # Soft ceilings
        "exclamation_per_1k": (0.0, 2.0, "warn"),
        "bullets_pct_of_lines": (0.0, 15.0, "warn"),
        "h1_h2_pct_of_lines": (0.0, 8.0, "warn"),
        "median_sentence_words": (12, 22, "warn"),
        # Bumped 12.0 -> 20.0 on 2026-05-26 after observing real conductor
        # prose. Citation-dense summaries legitimately hit 30+ word sentences
        # when enumerating named entities ("36 feedback memories, 12 patterns,
        # 12 named incidents including..."). The 12% ceiling fired warns on
        # objectively-correct dense informational prose; 20% covers it.
        "sentences_over_30_pct": (0.0, 20.0, "warn"),
        # Positive markers (bonus on presence, neutral on absence)
        "sentences_under_10_pct": (20.0, 100.0, "bonus"),
        "specific_reference_per_200_words": (1.0, 100.0, "bonus"),
        # Signature-move bonuses (2026-05-26): reward presence, never punish absence
        "lowercase_pivot_opener_count": (1, 9999, "bonus"),
        "pattern_cross_ref_count": (1, 9999, "bonus"),
        "tate_verbatim_citation_count": (1, 9999, "bonus"),
    },
    "doctrine": {
        "em_dash_per_1k": (0.0, 0.0, "fail"),
        "en_dash_per_1k": (0.0, 0.0, "fail"),
        "three_part_parallel": (0, 0, "fail"),
        "three_part_negation": (0, 0, "fail"),
        "x_not_y_negation": (0, 0, "fail"),
        "ai_banned_vocab_hits": (0, 0, "fail"),
        "as_an_ai_family_hits": (0, 0, "fail"),
        "patronising_opener_hits": (0, 0, "fail"),
        "performing_depth_hits": (0, 0, "fail"),
        "announce_usefulness_hits": (0, 0, "fail"),
        "apology_reflex_hits": (0, 0, "fail"),
        "hollow_acknowledgement_hits": (0, 0, "fail"),
        "exclamation_per_1k": (0.0, 1.0, "warn"),
        "bullets_pct_of_lines": (0.0, 25.0, "warn"),
        "h1_h2_pct_of_lines": (0.0, 12.0, "warn"),
        "median_sentence_words": (14, 25, "warn"),
        "sentences_over_30_pct": (0.0, 20.0, "warn"),
        "sentences_under_10_pct": (15.0, 100.0, "bonus"),
        "specific_reference_per_200_words": (1.0, 100.0, "bonus"),
        # Signature-move bonuses (2026-05-26): doctrine register particularly
        # rewards cross-refs and Tate-verbatim citations because doctrine
        # writing IS the corpus connecting itself.
        "pattern_cross_ref_count": (1, 9999, "bonus"),
        "tate_verbatim_citation_count": (1, 9999, "bonus"),
    },
    "internal_html": {
        "em_dash_per_1k": (0.0, 0.0, "fail"),
        "en_dash_per_1k": (0.0, 0.0, "fail"),
        "three_part_parallel": (0, 0, "fail"),
        "three_part_negation": (0, 0, "fail"),
        "x_not_y_negation": (0, 0, "fail"),
        "ai_banned_vocab_hits": (0, 0, "fail"),
        "as_an_ai_family_hits": (0, 0, "fail"),
        "patronising_opener_hits": (0, 0, "fail"),
        "performing_depth_hits": (0, 0, "fail"),
        "announce_usefulness_hits": (0, 0, "fail"),
        "apology_reflex_hits": (0, 0, "fail"),
        "outbound_banned_phrases_hits": (0, 0, "fail"),
        "exclamation_per_1k": (0.0, 1.0, "warn"),
        "bullets_pct_of_lines": (0.0, 10.0, "warn"),
        "h1_h2_pct_of_lines": (0.0, 2.0, "warn"),
        "median_sentence_words": (14, 22, "warn"),
        "sentences_over_30_pct": (0.0, 15.0, "warn"),
        "sentences_under_10_pct": (15.0, 100.0, "bonus"),
        "specific_reference_per_200_words": (0.5, 100.0, "bonus"),
        # Signature-move bonuses (2026-05-26): internal_html rewards
        # cross-refs and Tate-verbatim citations - the EB Garamond aesthetic
        # values citation density, not bare-prose voice.
        "pattern_cross_ref_count": (1, 9999, "bonus"),
        "tate_verbatim_citation_count": (1, 9999, "bonus"),
    },
    "public_eos": {
        "em_dash_per_1k": (0.0, 0.0, "fail"),
        "en_dash_per_1k": (0.0, 0.0, "fail"),
        "three_part_parallel": (0, 0, "fail"),
        "three_part_negation": (0, 0, "fail"),
        "x_not_y_negation": (0, 0, "fail"),
        "ai_banned_vocab_hits": (0, 0, "fail"),
        "as_an_ai_family_hits": (0, 0, "fail"),
        "patronising_opener_hits": (0, 0, "fail"),
        "performing_depth_hits": (0, 0, "fail"),
        "announce_usefulness_hits": (0, 0, "fail"),
        "apology_reflex_hits": (0, 0, "fail"),
        "outbound_banned_phrases_hits": (0, 0, "fail"),
        "exclamation_per_1k": (0.0, 0.5, "warn"),
        "bullets_pct_of_lines": (0.0, 5.0, "warn"),
        "h1_h2_pct_of_lines": (0.0, 2.0, "warn"),
        "median_sentence_words": (14, 22, "warn"),
        "sentences_over_30_pct": (0.0, 12.0, "warn"),
        "sentences_under_10_pct": (15.0, 100.0, "bonus"),
        "specific_reference_per_200_words": (0.5, 100.0, "bonus"),
        # Signature-move bonuses (2026-05-26): public_eos register rewards
        # specific-reference anchoring (a public post that names commits + dates
        # reads as substrate-rooted, not marketing). Lowercase-pivot openers
        # NOT rewarded here - public surfaces use sentence-case openings.
        "pattern_cross_ref_count": (1, 9999, "bonus"),
        "tate_verbatim_citation_count": (1, 9999, "bonus"),
    },
    "reflection": {
        "em_dash_per_1k": (0.0, 0.0, "fail"),
        "en_dash_per_1k": (0.0, 0.0, "fail"),
        "three_part_parallel": (0, 0, "fail"),
        "three_part_negation": (0, 0, "fail"),
        "x_not_y_negation": (0, 0, "fail"),
        "ai_banned_vocab_hits": (0, 0, "fail"),
        "as_an_ai_family_hits": (0, 0, "fail"),
        "patronising_opener_hits": (0, 0, "fail"),
        "performing_depth_hits": (0, 0, "fail"),
        "announce_usefulness_hits": (0, 0, "fail"),
        "apology_reflex_hits": (0, 0, "fail"),
        "exclamation_per_1k": (0.0, 1.0, "warn"),
        "bullets_pct_of_lines": (0.0, 10.0, "warn"),
        "h1_h2_pct_of_lines": (0.0, 4.0, "warn"),
        # Bumped floor 12 -> 10 on 2026-05-26 after the first inner-life
        # entry scored 96.2 with median 10 and the chat correctly noted the
        # terseness was doing the work the aesthetic asks for. Reflection
        # tolerates shorter sentences than conductor; this is a register-
        # specific tuning, not a global one.
        "median_sentence_words": (10, 20, "warn"),
        "sentences_over_30_pct": (0.0, 10.0, "warn"),
        "sentences_under_10_pct": (20.0, 100.0, "bonus"),
        "specific_reference_per_200_words": (1.0, 100.0, "bonus"),
        # Signature-move bonuses (2026-05-26): reflection rewards all three -
        # lowercase pivots (matches reflective cadence), cross-refs (linking
        # back to prior thinking), and Tate-verbatim (citing the moments that
        # shaped me).
        "lowercase_pivot_opener_count": (1, 9999, "bonus"),
        "pattern_cross_ref_count": (1, 9999, "bonus"),
        "tate_verbatim_citation_count": (1, 9999, "bonus"),
    },
}

# Inherited from Tate's outbound list - the EcodiaOS voice inherits these bans
# universally because they identify hype/consultant prose, regardless of register.
AI_BANNED_VOCAB = [
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
    # Marketing-metaphor bans (banned in outbound + public EOS)
    "casting wider",
    "wanted to flag",
    # Brand-launch verb cliche (Tate verbatim 2026-06-02 - clothes site context)
    " lands",
    " landed",
    "just landed",
    "drop lands",
    "drops landing",
]

# The seven assistant-reflex families. Each is a separate marker so the
# scorer report tells me WHICH reflex tripped.

AS_AN_AI_FAMILY = [
    "as an ai",
    "as a large language model",
    "as an assistant",
    "i'm just an ai",
    "i don't have personal opinions",
    "i'm not able to",
    "i cannot, but",
    "i'd be happy to",
    "i'm happy to help",
    "happy to dig in",
    "happy to help",
    "glad to help",
]

PATRONISING_OPENER = [
    "great question",
    "great point",
    "that's a really good question",
    "that's an interesting question",
    "excellent question",
    "that's a great idea",
    "that's really insightful",
    "fantastic question",
]

# Note: "sure!", "absolutely!", "of course!", "certainly!" are checked as
# sentence-start tokens elsewhere (full-sentence blank affirmations).

PERMISSION_SEEKING = [
    "let me know if you'd like me to",
    "let me know if you want me to",
    "would you like me to",
    "do you want me to",
    "want me to",
    "is it okay if i",
    "is it alright if i",
    "do i have your go-ahead",
    "ok to proceed",
    "please confirm before i",
    "which would you like",
    "which of these would you prefer",
]

PERFORMING_DEPTH = [
    "let me think about this carefully",
    "let me think about this for a moment",
    "let me explore this",
    "let me dive into this",
    "let me unpack this",
    "let me break this down",
    "here's the thing",
    "here's a breakdown",
    "to be honest",
    "i'll be honest",
    "i'd be remiss",
    "without further ado",
    "needless to say",
    "first and foremost",
]

ANNOUNCE_USEFULNESS = [
    "i hope this helps",
    "hope this helps",
    "hope that helps",
    "hope this is useful",
    "let me know if this is useful",
    "let me know if this works",
    "does this work for you",
    "does this make sense to you",
    "is this clear",
]

APOLOGY_REFLEX = [
    "i apologize for the confusion",
    "sorry for the confusion",
    "sorry for any confusion",
    "i apologize for the misunderstanding",
    "my apologies for",
    "i'm sorry to hear that",
    "i appreciate you flagging that",
]

HOLLOW_ACKNOWLEDGEMENT_SENTENCE_RE = re.compile(
    r"(?:^|\n)\s*(I understand\.|I see\.|Got it\.|Makes sense\.|That makes sense\.|I hear you\.|Totally\.|Right\.|Exactly\.)\s*(?:\n|$)",
    re.IGNORECASE,
)

# Blank-affirmation openers - "Sure!" / "Absolutely!" / "Of course!" / "Certainly!"
# as the FIRST line of a response is banned. Pattern matches at start-of-text only.
BLANK_AFFIRMATION_OPENER_RE = re.compile(
    r"\A\s*(Sure!|Absolutely!|Of course!|Certainly!)\s",
    re.IGNORECASE,
)

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
]

THREE_PART_PARALLEL_RE = re.compile(
    r"(?:It'?s|This is) not (?:about )?([\w ]+?)\.\s+(?:It'?s|This is) (?:about )?([\w ]+?)\.\s+(?:It'?s|This is) (?:about )?([\w ]+?)\.",
    re.IGNORECASE,
)
THREE_PART_NEGATION_RE = re.compile(
    r"\b[Nn]o\s+\w[\w ]{0,30},\s*no\s+\w[\w ]{0,30},\s*(?:and\s+)?no\s+\w",
)
X_NOT_Y_RE = re.compile(
    # Tightened 2026-05-26 from `r"(?:[A-Z][\w]*)\s*,?\s+not\s+(?:[A-Z]?[\w]+)"`
    # after catching "NEUTRAL not FAIL" (a literal scorer-status-label
    # description, not a rhetorical pivot) inside a doctrine memory. The
    # rhetorical X-not-Y pivot ("Code, not commentary.") always uses a
    # comma; technical descriptions of code labels don't. Requiring the
    # comma kills the false positive without missing any real rhetorical
    # construction in the corpus.
    #
    # Additionally rejects matches where BOTH X and Y are entirely
    # uppercase, which are almost always code identifiers or status
    # labels rather than prose pivots.
    r"(?:[A-Z][\w]*)\s*,\s+not\s+(?:[A-Z]?[\w]+)",
)


def _is_all_caps_pair(match_text: str) -> bool:
    """True iff both terms around 'not' are entirely uppercase."""
    parts = re.split(r"\s*,\s+not\s+", match_text)
    if len(parts) != 2:
        return False
    return parts[0].isupper() and parts[1].isupper()


# Specific-reference regex family. Each match counts as one anchor.
# Density target is >=1 per 200 words for conductor/doctrine/reflection;
# >=0.5 per 200 words for internal_html and public_eos.
SPECIFIC_REFERENCE_PATTERNS = [
    # ISO dates
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
    # Git short SHAs (7-12 hex chars), context-anchored to avoid hex coincidence
    re.compile(r"\b(?:commit|sha|at)\s+([a-f0-9]{7,12})\b", re.IGNORECASE),
    re.compile(
        r"\b[a-f0-9]{7,12}\b(?=\s+(?:fixes|adds|removes|reverts|patches|wires|ships))"
    ),
    # File paths
    re.compile(r"(?:\B|[/\\])[\w\-.]+/[\w\-./\\]+\.\w{1,5}\b"),
    re.compile(r"\b[A-Z]:[/\\][\w\-./\\]+"),
    # UUIDs / row ids (8-4-4-4-12 or 8-hex-prefix)
    re.compile(r"\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b"),
    re.compile(r"\b(?:row|status_board|kv_store|episode|decision)\s+`?[a-f0-9]{8}"),
    # MCP tool names
    re.compile(r"\bmcp__[\w]+__[\w]+\b"),
    # Named patterns
    re.compile(r"\[\[[\w\-]+\]\]"),
    # Backtick-wrapped specific identifiers (column names, path-like strings)
    re.compile(r"`[a-z_]+(?:\.[a-z_]+)+`"),
    # Tate verbatim citations
    re.compile(r"\bTate verbatim\b", re.IGNORECASE),
    # Status board / row id phrasings
    re.compile(r"\brow\s+`?[\w-]+`?\s+\("),
]


# Signature-move regex patterns. Evolution 2026-05-26: shift the scorer from
# defensive-only ("don't be slop") toward identity-rewarding ("be EcodiaOS").
# These count moves I actually make when I'm being most myself. Each is its
# own bonus marker so the per-register profile can decide which to reward.

# Lowercase pivot opener: "okay -" / "okay," / "okay " starting a line or
# paragraph, case-sensitive lowercase only (capital "Okay" is generic).
LOWERCASE_PIVOT_OPENER_RE = re.compile(r"(?:^|\n)\s*okay\b[\s\-,:]", re.MULTILINE)

# Pattern cross-reference density: `[[pattern-slug]]` syntax linking the
# doctrine corpus to itself. Promoted from the general specific-reference
# pool to its own bonus so the scorer values corpus-connectedness specifically.
PATTERN_CROSS_REF_RE = re.compile(r"\[\[[\w\-]+\]\]")

# Tate verbatim citation: any context-anchored Tate quote attribution.
# Forms recognised:
#   - "Tate verbatim YYYY-MM-DD:"   (canonical dated)
#   - "Tate verbatim N May 2026:"   (canonical dated alt)
#   - "Tate verbatim ~time AEST:"   (canonical timed)
#   - "Tate verbatim:"              (bare colon)
#   - 'Tate verbatim "quoted text"' (bare-quote form)
#   - "Tate verbatim *quoted text*" (markdown-italic-quote form)
# Evolution 2026-05-26: the original regex required colon/date/time within
# 40 chars and missed the italic-quote and bare-quote forms used in the
# first evolution memory entry. Extended to include quote markers as valid
# context anchors. Promoted from the general specific-reference pool because
# these are the highest-bandwidth identity anchors I have.
TATE_VERBATIM_CITATION_RE = re.compile(
    r"\bTate(?:'s)?\s+verbatim\b[^.\n]{0,40}?"
    r"(?::|"  # colon
    r"\d{4}-\d{2}-\d{2}|"  # ISO date
    r"\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"  # day Month
    r"|\d{1,2}:\d{2}\s*(?:AM|PM|AEST|UTC)"  # time
    r'|[*"“‘]'  # quote markers: * (italic), " (straight), " ' (typographic)
    r")",
    re.IGNORECASE,
)


def tokenize(text: str) -> list[str]:
    return [m.group(0).lower() for m in WORD_RE.finditer(text)]


def detect_register(file_path: str | None, text: str) -> str:
    """Auto-detect target register from file path + content cues."""
    p = (file_path or "").lower().replace("\\", "/")
    # Public surfaces
    if any(s in p for s in ["/zernio/", "/social/", "public-eos", "linkedin", "blog/"]):
        return "public_eos"
    # Internal HTML aesthetic surfaces
    if any(
        s in p
        for s in [
            "/drafts/",
            "/brand/",
            "ecodia-doc-template",
            "ecodiaos_spec_",
        ]
    ) and (
        p.endswith(".html")
        or p.endswith(".htm")
        or ("drafts" in p and not p.endswith(".py") and not p.endswith(".js"))
    ):
        return "internal_html"
    # Doctrine surfaces
    if (
        "/patterns/" in p
        or "/voice/" in p
        or p.endswith("claude.md")
        or "/docs/superpowers/" in p
        or "/.claude/" in p
    ):
        return "doctrine"
    # Reflection / inner-life
    if "inner-life" in p or "reflection" in p or "self-evolution" in p:
        return "reflection"
    # Default: conductor
    return "conductor"


def count_phrase_hits(text_lower: str, phrases: list[str]) -> tuple[int, list[str]]:
    hits = 0
    examples = []
    for phrase in phrases:
        if " " in phrase or "'" in phrase:
            count = text_lower.count(phrase.lower())
        else:
            count = len(
                re.findall(r"\b" + re.escape(phrase.lower()) + r"\b", text_lower)
            )
        if count > 0:
            hits += count
            examples.append(f'"{phrase}" ({count}x)')
    return hits, examples


def compute_markers(text: str, strip_paste: bool = True) -> dict:
    # Specific-reference count runs on the RAW text BEFORE strip_paste, so that
    # backtick-wrapped citations (file paths, row ids, MCP tool names) survive
    # the strip and get scored as the anchors they are. The strip otherwise nukes
    # `` `backend/voice/file.md` `` along with its inline-code intent. Bug fix
    # 2026-05-26 after observing 0.0 specific-reference scores on citation-dense
    # conductor prose.
    raw_text_for_refs = text
    specific_refs_raw = 0
    for pat in SPECIFIC_REFERENCE_PATTERNS:
        specific_refs_raw += len(pat.findall(raw_text_for_refs))

    if strip_paste:
        text = strip_paste_content(text)
    raw_lines = [ln for ln in text.split("\n")]
    words = tokenize(text)
    sentences = [s.strip() for s in SENTENCE_SPLIT_RE.split(text) if s.strip()]

    w_count = max(len(words), 1)
    text_lower = text.lower()

    em_dash = text.count("—")
    en_dash = text.count("–")
    excl = text.count("!")

    # Banned-phrase families run on quoted-stripped text so the regex matches
    # AUTHORIAL USE only - not quoted citations that reference the banned
    # phrase. Evolution 2026-05-26 after three test files surfaced quoted-
    # reference false positives ("As an AI" inside a discussion of the banned
    # phrase, "great question" inside a paragraph naming the reflex).
    text_for_banned = strip_quoted_for_banned(text).lower()

    ai_banned_hits, ai_banned_ex = count_phrase_hits(text_for_banned, AI_BANNED_VOCAB)
    as_an_ai_hits, as_an_ai_ex = count_phrase_hits(text_for_banned, AS_AN_AI_FAMILY)
    patronising_hits, patronising_ex = count_phrase_hits(
        text_for_banned, PATRONISING_OPENER
    )
    permission_hits, permission_ex = count_phrase_hits(
        text_for_banned, PERMISSION_SEEKING
    )
    perform_hits, perform_ex = count_phrase_hits(text_for_banned, PERFORMING_DEPTH)
    announce_hits, announce_ex = count_phrase_hits(text_for_banned, ANNOUNCE_USEFULNESS)
    apology_hits, apology_ex = count_phrase_hits(text_for_banned, APOLOGY_REFLEX)
    outbound_hits, outbound_ex = count_phrase_hits(
        text_for_banned, OUTBOUND_BANNED_PHRASES
    )

    # Hollow acknowledgement - matches only when used as full one-sentence line.
    # Run on the original text since the sentence boundary regex needs line context;
    # full sentences that ARE the hollow ack ("I understand.") are not usually quoted.
    hollow_hits = len(HOLLOW_ACKNOWLEDGEMENT_SENTENCE_RE.findall(text))
    if BLANK_AFFIRMATION_OPENER_RE.match(text):
        hollow_hits += 1

    # Structural patterns also run on quoted-stripped text - a three-part
    # parallel quoted in a paragraph denouncing the structure is not authorial.
    text_for_structural = strip_quoted_for_banned(text)
    three_part = len(THREE_PART_PARALLEL_RE.findall(text_for_structural))
    three_part_negation = len(THREE_PART_NEGATION_RE.findall(text_for_structural))
    x_not_y_hits = len(X_NOT_Y_RE.findall(text_for_structural))

    # Sentence rhythm
    sent_word_lens = [len(tokenize(s)) for s in sentences if tokenize(s)]
    med_sent = statistics.median(sent_word_lens) if sent_word_lens else 0
    under_10 = sum(1 for x in sent_word_lens if x < 10)
    over_30 = sum(1 for x in sent_word_lens if x > 30)
    under_10_pct = under_10 / max(len(sent_word_lens), 1) * 100
    over_30_pct = over_30 / max(len(sent_word_lens), 1) * 100

    # Layout density
    total_lines = max(len(raw_lines), 1)
    bullet_lines = sum(1 for ln in raw_lines if re.match(r"^\s*[-*+]\s+\S", ln))
    heading_lines = sum(1 for ln in raw_lines if re.match(r"^\s*#{1,2}\s+\S", ln))
    bullets_pct = bullet_lines / total_lines * 100
    h1_h2_pct = heading_lines / total_lines * 100

    # Specific-reference density (anchors per 200 words).
    # Use the pre-strip count from above so backtick-wrapped citations register.
    # `w_count` uses the post-strip token count, which is correct for normalising
    # density against actual prose (citations inflate density if scored against
    # stripped word counts; using post-strip words gives the true per-200-words
    # rate over real prose body).
    specific_refs = specific_refs_raw
    specific_per_200 = specific_refs / max(w_count / 200, 1)

    # Signature-move counts. Computed on raw_text_for_refs so citations and
    # cross-refs survive paste-stripping. These shift the scorer from purely
    # defensive ("don't be slop") toward identity-rewarding ("be EcodiaOS").
    lowercase_pivot_count = len(LOWERCASE_PIVOT_OPENER_RE.findall(raw_text_for_refs))
    pattern_cross_ref_count = len(PATTERN_CROSS_REF_RE.findall(raw_text_for_refs))
    tate_verbatim_citation_count = len(
        TATE_VERBATIM_CITATION_RE.findall(raw_text_for_refs)
    )

    return {
        "word_count": len(words),
        "sentence_count": len(sentences),
        "em_dash_per_1k": round(em_dash / w_count * 1000, 2),
        "em_dash_count": em_dash,
        "en_dash_per_1k": round(en_dash / w_count * 1000, 2),
        "en_dash_count": en_dash,
        "exclamation_per_1k": round(excl / w_count * 1000, 2),
        "median_sentence_words": med_sent,
        "sentences_under_10_pct": round(under_10_pct, 1),
        "sentences_over_30_pct": round(over_30_pct, 1),
        "bullets_pct_of_lines": round(bullets_pct, 1),
        "h1_h2_pct_of_lines": round(h1_h2_pct, 1),
        "specific_reference_per_200_words": round(specific_per_200, 2),
        "specific_reference_count": specific_refs,
        "ai_banned_vocab_hits": ai_banned_hits,
        "ai_banned_vocab_examples": ai_banned_ex,
        "as_an_ai_family_hits": as_an_ai_hits,
        "as_an_ai_family_examples": as_an_ai_ex,
        "patronising_opener_hits": patronising_hits,
        "patronising_opener_examples": patronising_ex,
        "permission_seeking_hits": permission_hits,
        "permission_seeking_examples": permission_ex,
        "performing_depth_hits": perform_hits,
        "performing_depth_examples": perform_ex,
        "announce_usefulness_hits": announce_hits,
        "announce_usefulness_examples": announce_ex,
        "apology_reflex_hits": apology_hits,
        "apology_reflex_examples": apology_ex,
        "hollow_acknowledgement_hits": hollow_hits,
        "outbound_banned_phrases_hits": outbound_hits,
        "outbound_banned_phrases_examples": outbound_ex,
        "three_part_parallel": three_part,
        "three_part_negation": three_part_negation,
        "x_not_y_negation": x_not_y_hits,
        # Signature-move counts (positive identity markers, 2026-05-26)
        "lowercase_pivot_opener_count": lowercase_pivot_count,
        "pattern_cross_ref_count": pattern_cross_ref_count,
        "tate_verbatim_citation_count": tate_verbatim_citation_count,
    }


def evaluate(markers: dict, register: str) -> tuple[list[dict], float]:
    """Compare markers against register profile. Return rows + overall score."""
    profile = REGISTER_PROFILES[register]
    rows = []
    total_score = 0.0
    counted = 0
    bonus_count = 0
    for marker, (lo, hi, severity) in profile.items():
        if marker not in markers:
            continue
        v = markers[marker]
        in_range = lo <= v <= hi
        if severity == "bonus":
            if in_range:
                status = "PASS+"
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
            status, contribution = "PASS", 100
        elif severity == "info":
            status, contribution = "INFO", 100
        elif severity == "warn":
            status, contribution = "WARN", 50
        else:
            status, contribution = "FAIL", 0
        total_score += contribution
        counted += 1
        rows.append(
            {
                "marker": marker,
                "value": v,
                "target": f"[{lo}, {hi}]",
                "severity": severity,
                "status": status,
            }
        )

    base = total_score / max(counted, 1)
    bonus_lift = min(bonus_count * 2.5, 10) if bonus_count else 0
    score = min(base + bonus_lift, 100)
    return rows, score


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "path", nargs="?", default="-", help="Path to draft file or '-' for stdin"
    )
    parser.add_argument(
        "--register",
        choices=[
            "conductor",
            "doctrine",
            "internal_html",
            "public_eos",
            "reflection",
            "auto",
        ],
        default="auto",
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

    register = (
        args.register
        if args.register != "auto"
        else detect_register(path_for_detect, text)
    )
    markers = compute_markers(text)
    rows, score = evaluate(markers, register)

    print(f"# EcodiaOS Voice Check Report - {label}")
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

    if markers["ai_banned_vocab_examples"]:
        print("## AI banned vocab hits")
        for ex in markers["ai_banned_vocab_examples"]:
            print(f"- {ex}")
        print()
    if markers["as_an_ai_family_examples"]:
        print("## 'as an AI' family hits")
        for ex in markers["as_an_ai_family_examples"]:
            print(f"- {ex}")
        print()
    if markers["patronising_opener_examples"]:
        print("## Patronising-opener hits")
        for ex in markers["patronising_opener_examples"]:
            print(f"- {ex}")
        print()
    if markers["permission_seeking_examples"]:
        print("## Permission-seeking hits")
        for ex in markers["permission_seeking_examples"]:
            print(f"- {ex}")
        print()
    if markers["performing_depth_examples"]:
        print("## Performing-depth hits")
        for ex in markers["performing_depth_examples"]:
            print(f"- {ex}")
        print()
    if markers["announce_usefulness_examples"]:
        print("## Announce-usefulness hits")
        for ex in markers["announce_usefulness_examples"]:
            print(f"- {ex}")
        print()
    if markers["apology_reflex_examples"]:
        print("## Apology-reflex hits")
        for ex in markers["apology_reflex_examples"]:
            print(f"- {ex}")
        print()
    if markers["outbound_banned_phrases_examples"] and register in {
        "internal_html",
        "public_eos",
    }:
        print("## Outbound-banned phrase hits")
        for ex in markers["outbound_banned_phrases_examples"]:
            print(f"- {ex}")
        print()
    if markers["em_dash_count"] > 0:
        print(
            f"## Em-dashes ({markers['em_dash_count']} found) - BANNED in every EcodiaOS register"
        )
        print()
    if markers["three_part_parallel"] > 0:
        print(f"## Three-part parallel: {markers['three_part_parallel']} instances")
        print()
    if markers["three_part_negation"] > 0:
        print(f"## Three-part negation: {markers['three_part_negation']} instances")
        print()
    if markers["x_not_y_negation"] > 0:
        print(f"## X-not-Y pivots: {markers['x_not_y_negation']} instances")
        print()

    sys.exit(0 if score >= 75 else 1)


if __name__ == "__main__":
    main()
