#!/usr/bin/env python3
"""impact-graph.py - symbol-propagating diff impact analysis for diff-walk.

Per ARCHITECTURE.md Section 6.

Inputs:
  --app <slug>        # registered app (locals, coexist, glovebox, goodreach)
  --base <git-ref>    # base commit/ref to diff against (default HEAD~1)
  --spec <path>       # spec.yml for the app
  --repo <path>       # the app repo root (where `git diff` runs)

Output (stdout): JSON
{
  "app": "locals",
  "base": "HEAD~1",
  "head": "<resolved sha>",
  "changed_files": [...],
  "changed_symbols": [...],
  "expanded_symbols": [...],
  "impacted_surfaces": [...],
  "impacted_flows": [...],
  "decision": "diff" | "full" | "empty",
  "decision_reason": "..."
}

Algorithm (capped closure):
  1. CHANGED_FILES = git diff --name-only base..HEAD
  2. CHANGED_SYMBOLS = parse each file, extract exported symbols
  3. EXPANDED = closure via import-grep, depth cap 3
  4. IMPACTED_SURFACES = spec.surfaces whose uses_components intersects EXPANDED
  5. IMPACTED_FLOWS = spec.flows whose walks_surfaces intersects IMPACTED_SURFACES
  6. If IMPACTED_FLOWS covers > 60% of all flows -> upgrade to full walk
  7. Spec changes -> full walk (the contract moved)
  8. Walker self changes -> full walk (regression discipline)
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

CLOSURE_DEPTH_CAP = 3
FLOW_RATIO_CAP = 0.6

# Per-language exported-symbol extractors. Each returns a list of (symbol, file).
LANG_PATTERNS = {
    '.kt':  [r'^(?:public\s+)?(?:open\s+|sealed\s+|data\s+|internal\s+)*(?:class|object|interface)\s+([A-Z]\w+)',
             r'^(?:public\s+)?(?:internal\s+)?fun\s+([A-Z]?\w+)\s*\(',
             r'^(?:public\s+)?(?:internal\s+)?(?:val|var)\s+([A-Z]\w+)\s*[:=]'],
    '.swift': [r'^(?:public|internal|open)?\s*(?:class|struct|enum|protocol|actor)\s+([A-Z]\w+)',
               r'^(?:public|internal|open)?\s*func\s+(\w+)\s*[(<]',
               r'^(?:public|internal)?\s*(?:let|var)\s+([A-Z]\w+)\s*[:=]'],
    '.ts': [r'^export\s+(?:default\s+)?(?:async\s+)?(?:class|function|interface|type|const|enum)\s+(\w+)',
            r'^export\s+\{\s*([^}]+)\s*\}'],
    '.tsx': [r'^export\s+(?:default\s+)?(?:async\s+)?(?:class|function|interface|type|const|enum)\s+(\w+)'],
    '.vue': [r'^export\s+default\s+\{', r'<script[^>]*setup'],  # vue SFC; usually whole-file
    '.js': [r'^export\s+(?:default\s+)?(?:async\s+)?(?:class|function|const)\s+(\w+)'],
    '.jsx': [r'^export\s+(?:default\s+)?(?:async\s+)?(?:class|function|const)\s+(\w+)'],
}


def run(cmd, cwd=None):
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=False)
        return r.stdout.strip()
    except FileNotFoundError:
        return ''


def git_diff_files(repo: Path, base: str):
    # Special mode `WORK`: include unstaged + staged changes vs HEAD.
    # Useful for pre-push verification before commits exist.
    if base.upper() == 'WORK':
        raw = run(['git', '-C', str(repo), 'diff', '--name-only', 'HEAD'], cwd=repo)
    else:
        raw = run(['git', '-C', str(repo), 'diff', '--name-only', f'{base}..HEAD'], cwd=repo)
    return [Path(f) for f in raw.splitlines() if f.strip()]


def git_head(repo: Path):
    return run(['git', '-C', str(repo), 'rev-parse', 'HEAD'], cwd=repo) or 'unknown'


def extract_symbols(repo: Path, path: Path):
    ext = path.suffix
    patterns = LANG_PATTERNS.get(ext, [])
    full = repo / path
    if not full.is_file():
        return []
    try:
        text = full.read_text(encoding='utf-8', errors='replace')
    except Exception:
        return []
    syms = set()
    for line in text.splitlines():
        s = line.lstrip()
        for pat in patterns:
            m = re.match(pat, s)
            if m:
                if m.lastindex:
                    cap = m.group(1)
                    # handle `export { A, B, C }` style
                    for tok in re.split(r'\s*,\s*', cap):
                        tok = tok.strip().split(' as ')[0]
                        if tok and re.match(r'^\w+$', tok):
                            syms.add(tok)
    # Always treat the basename without extension as an extra symbol
    # (matches `import MerchantCard` where MerchantCard is also the file name).
    base = path.stem
    if re.match(r'^[A-Za-z_]\w*$', base):
        syms.add(base)
    return sorted(syms)


def grep_importers(repo: Path, symbol: str):
    """Files that import or reference the symbol (heuristic, not parsed)."""
    # ripgrep first (faster), fallback to grep -r when rg is not installed.
    try:
        rg = subprocess.run(['rg', '-l', '--type-add', 'mobile:*.{kt,swift,ts,tsx,js,jsx,vue}', '--type', 'mobile', f'\\b{symbol}\\b', str(repo)], capture_output=True, text=True)
        if rg.returncode in (0, 1):
            return [Path(f) for f in rg.stdout.splitlines() if f.strip()]
    except FileNotFoundError:
        pass
    grep = subprocess.run(['grep', '-rl', '--include=*.kt', '--include=*.swift', '--include=*.ts', '--include=*.tsx', '--include=*.js', '--include=*.jsx', '--include=*.vue', f'\\b{symbol}\\b', str(repo)], capture_output=True, text=True)
    if grep.returncode in (0, 1):
        return [Path(f) for f in grep.stdout.splitlines() if f.strip()]
    return []


def closure(repo: Path, seed_symbols, depth_cap=CLOSURE_DEPTH_CAP):
    seen_syms = set(seed_symbols)
    frontier = list(seed_symbols)
    for depth in range(depth_cap):
        next_frontier = []
        for sym in frontier:
            importers = grep_importers(repo, sym)
            for f in importers:
                try:
                    rel = f.relative_to(repo)
                except ValueError:
                    continue
                more = extract_symbols(repo, rel)
                for m in more:
                    if m not in seen_syms:
                        seen_syms.add(m)
                        next_frontier.append(m)
        if not next_frontier:
            break
        frontier = next_frontier
    return sorted(seen_syms)


def load_spec(spec_path: Path):
    with open(spec_path, encoding='utf-8') as f:
        return yaml.safe_load(f)


def surfaces_for_symbols(spec, symbols):
    sym_set = set(symbols)
    hits = []
    for s in (spec.get('surfaces') or []):
        uses = s.get('uses_components') or {}
        all_components = []
        if isinstance(uses, dict):
            for plat_components in uses.values():
                if isinstance(plat_components, list):
                    all_components.extend(plat_components)
        elif isinstance(uses, list):
            all_components = uses
        # Component names sometimes have dotted suffixes like Tokens.Brand;
        # match on the leftmost identifier.
        norm = {c.split('.')[0] for c in all_components}
        if norm & sym_set:
            hits.append(s['id'])
    return hits


def flows_for_surfaces(spec, surfaces):
    sset = set(surfaces)
    hits = []
    for f in (spec.get('flows') or []):
        ws = set(f.get('walks_surfaces') or [])
        if ws & sset:
            hits.append(f['id'])
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--app', required=True)
    ap.add_argument('--base', default='HEAD~1')
    ap.add_argument('--spec', required=True)
    ap.add_argument('--repo', required=True, help='app repo root for git diff')
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    spec_path = Path(args.spec).resolve()
    spec = load_spec(spec_path)

    head = git_head(repo)
    changed = git_diff_files(repo, args.base)
    walker_root = Path(__file__).resolve().parent.parent
    spec_str = str(spec_path)
    walker_str = str(walker_root)

    # Spec change or walker change -> full walk.
    full_reason = None
    for cf in changed:
        full = repo / cf
        try:
            full_resolved = full.resolve()
        except Exception:
            continue
        if str(full_resolved) == spec_str:
            full_reason = 'spec_change'
            break
        if str(full_resolved).startswith(walker_str):
            full_reason = 'walker_self_change'
            break

    changed_symbols = []
    for cf in changed:
        changed_symbols.extend(extract_symbols(repo, cf))
    changed_symbols = sorted(set(changed_symbols))

    expanded = closure(repo, changed_symbols) if changed_symbols and not full_reason else changed_symbols
    impacted_surfaces = surfaces_for_symbols(spec, expanded)
    impacted_flows = flows_for_surfaces(spec, impacted_surfaces)
    total_flows = len(spec.get('flows') or [])

    decision = 'diff'
    reason = 'symbols_matched_surfaces'
    if not changed:
        decision = 'empty'
        reason = 'no_changed_files_vs_base'
    elif full_reason:
        decision = 'full'
        reason = full_reason
    elif not impacted_flows:
        decision = 'empty'
        reason = 'no_surfaces_match_changed_symbols'
    elif total_flows and (len(impacted_flows) / total_flows) > FLOW_RATIO_CAP:
        decision = 'full'
        reason = f'impacted_ratio_{len(impacted_flows)}/{total_flows}_exceeds_{FLOW_RATIO_CAP}'

    print(json.dumps({
        'app': args.app,
        'base': args.base,
        'head': head,
        'changed_files': [str(p) for p in changed],
        'changed_symbols': changed_symbols,
        'expanded_symbols': expanded,
        'impacted_surfaces': impacted_surfaces,
        'impacted_flows': impacted_flows,
        'total_flows': total_flows,
        'decision': decision,
        'decision_reason': reason,
    }, indent=2))


if __name__ == '__main__':
    main()
