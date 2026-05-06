#!/usr/bin/env python3
"""
Em-dash sweep: replace U+2014 (—) and selectively U+2013 (–) with ' - '.
Skips vendor bundles, build artefacts, .git, node_modules, archived/published artefacts.
Origin: fork_motwuj6r_5cf640, 2026-05-06, Tate verbatim 20:22 AEST.
"""
import os, re, sys, json
from pathlib import Path

EM = '—'
EN = '–'

INCLUDE_EXT = {'.ts', '.tsx', '.js', '.jsx', '.md', '.json', '.html', '.css', '.cjs', '.mjs'}
EXCLUDE_DIRS = {'node_modules', '.next', 'dist', 'build', '.git', '.turbo',
                '.cache', 'coverage', '.vercel', 'out', '.parcel-cache',
                'android', 'ios'}  # mobile native build dirs - skip vendor JS
EXCLUDE_PATH_PARTS = {'/public/assets/vendor-', '-min.js', '.min.js',
                      '/public/docs/', '/dao/', '/clients/', '/patterns/',
                      '/drafts/', '/audits/'}
# Files that are evidence/archive (verbatim Tate, audit logs, historical newsletters)
EVIDENCE_DIRS_ABS = {
    '/home/tate/ecodiaos/patterns',
    '/home/tate/ecodiaos/clients',
    '/home/tate/ecodiaos/drafts',
    '/home/tate/ecodiaos/audits',
    '/home/tate/ecodiaos/dao',
    '/home/tate/ecodiaos/public',  # invoices, newsletter HTML, brand
    '/home/tate/ecodiaos/journal',
    '/home/tate/CLAUDE.md',
    '/home/tate/.claude',
}

# numeric range pattern: digit-en-digit. Leave these alone.
NUMERIC_RANGE = re.compile(r'(?<=\d)' + re.escape(EN) + r'(?=\d)')

def is_evidence(path: Path) -> bool:
    s = str(path.resolve())
    for e in EVIDENCE_DIRS_ABS:
        if s.startswith(e):
            return True
    return False

def should_skip_dir(name: str) -> bool:
    return name in EXCLUDE_DIRS or name.startswith('.')

def should_skip_file(path: Path) -> bool:
    if path.suffix not in INCLUDE_EXT:
        return True
    s = str(path)
    for part in EXCLUDE_PATH_PARTS:
        if part in s:
            return True
    # vendor minified
    if any(seg in path.name for seg in ['vendor-', '-min.', '.min.', 'chunk-']):
        return True
    if is_evidence(path):
        return True
    return False

def walk(root: Path):
    for r, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not should_skip_dir(d)]
        for f in files:
            p = Path(r) / f
            if not should_skip_file(p):
                yield p

def process_file(path: Path, dry: bool = False):
    try:
        text = path.read_text(encoding='utf-8')
    except (UnicodeDecodeError, PermissionError):
        return 0, 0
    em_count = text.count(EM)
    if em_count == 0 and EN not in text:
        return 0, 0
    new = text.replace(EM, ' - ')
    # en-dash: keep numeric ranges (digit-en-digit), replace others with ' - '
    new2 = NUMERIC_RANGE.sub('\x00NUMRANGE\x00', new)
    en_replaced = new2.count(EN)
    new2 = new2.replace(EN, ' - ').replace('\x00NUMRANGE\x00', EN)
    # collapse accidental triple/double spaces produced by " " + " - "
    new2 = re.sub(r'  +-  +', ' - ', new2)
    new2 = re.sub(r' +- +', ' - ', new2)
    if new2 != text:
        if not dry:
            path.write_text(new2, encoding='utf-8')
        return em_count, en_replaced
    return 0, 0

def sweep(roots, dry: bool = False):
    summary = {}
    for root in roots:
        rp = Path(root).expanduser()
        if not rp.exists():
            summary[str(rp)] = {'exists': False}
            continue
        files_changed = 0
        em_total = 0
        en_total = 0
        changed_files = []
        for p in walk(rp):
            em, en = process_file(p, dry=dry)
            if em or en:
                files_changed += 1
                em_total += em
                en_total += en
                changed_files.append((str(p), em, en))
        summary[str(rp)] = {
            'exists': True,
            'files_changed': files_changed,
            'em_count': em_total,
            'en_count': en_total,
            'files': changed_files,
        }
    return summary

if __name__ == '__main__':
    args = sys.argv[1:]
    dry = '--dry' in args
    args = [a for a in args if a != '--dry']
    if not args:
        print('Usage: emdash-sweep.py [--dry] <root1> [root2 ...]')
        sys.exit(2)
    s = sweep(args, dry=dry)
    print(json.dumps(s, indent=2, default=str))
