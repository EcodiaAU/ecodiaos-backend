#!/usr/bin/env python3
"""pairwise.py - all-pairs covering array generator for the state matrix.

stdin/argv: JSON object {dimension: [variant, ...], ...}
stdout: JSON list of cells [{dimension: variant, ...}, ...]

Greedy IPOG-lite: deterministic (sorted iteration, no randomness), good
enough at this scale (<=6 dimensions, <=4 variants). Guarantees every
2-way variant pair across every dimension pair appears in >=1 cell.

  python3 pairwise.py '{"a":["1","2"],"b":["x","y","z"]}'
  python3 pairwise.py --self-test
"""
import itertools
import json
import sys


def all_pairs(dims):
    """dims: dict name -> list of variants. Returns list of dicts."""
    names = sorted(dims.keys())
    if not names:
        return []
    if len(names) == 1:
        return [{names[0]: v} for v in dims[names[0]]]

    # Universe of uncovered pairs: ((dimA, valA), (dimB, valB)) with dimA < dimB.
    uncovered = set()
    for a, b in itertools.combinations(names, 2):
        for va in dims[a]:
            for vb in dims[b]:
                uncovered.add(((a, va), (b, vb)))

    cells = []
    while uncovered:
        cell = {}
        # Seed with the dimension pair owning the most uncovered pairs.
        seed = max(sorted(uncovered), key=lambda p: sum(
            1 for q in uncovered if q[0][0] == p[0][0] and q[1][0] == p[1][0]))
        cell[seed[0][0]] = seed[0][1]
        cell[seed[1][0]] = seed[1][1]
        # Fill remaining dimensions greedily by newly covered pair count.
        for name in names:
            if name in cell:
                continue
            best_v, best_gain = None, -1
            for v in dims[name]:
                gain = 0
                for other, ov in cell.items():
                    a, b = sorted([(name, v), (other, ov)])
                    if (a, b) in uncovered:
                        gain += 1
                if gain > best_gain:
                    best_v, best_gain = v, gain
            cell[name] = best_v
        # Mark covered.
        for a, b in itertools.combinations(sorted(cell.items()), 2):
            uncovered.discard((a, b))
        cells.append(cell)
    return cells


def cell_id(cell):
    """Stable directory-safe id: dim abbreviations joined by double underscore."""
    parts = []
    for k in sorted(cell.keys()):
        kk = k.replace('permission.', 'perm-').replace('.', '-')
        parts.append(f"{kk}={str(cell[k]).replace(' ', '_')}")
    return '__'.join(parts) or 'default'


def self_test():
    dims = {
        'permission.location': ['granted', 'denied', 'never_asked'],
        'appearance': ['light', 'dark'],
        'network': ['online', 'offline'],
        'font_scale': ['1.0', '2.0'],
    }
    cells = all_pairs(dims)
    full = 3 * 2 * 2 * 2
    # Verify every pair covered.
    names = sorted(dims.keys())
    missing = []
    for a, b in itertools.combinations(names, 2):
        for va in dims[a]:
            for vb in dims[b]:
                if not any(c[a] == va and c[b] == vb for c in cells):
                    missing.append((a, va, b, vb))
    assert not missing, f"uncovered pairs: {missing}"
    assert len(cells) < full, f"no reduction: {len(cells)} >= {full}"
    ids = [cell_id(c) for c in cells]
    assert len(set(ids)) == len(ids), "cell ids collide"
    # Single dimension degenerates to its variants.
    assert len(all_pairs({'a': ['1', '2', '3']})) == 3
    assert all_pairs({}) == []
    print(f"self-test OK: {len(cells)} cells cover all pairs (full product {full})")
    for c in cells:
        print(' ', cell_id(c))


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--self-test':
        self_test()
        sys.exit(0)
    raw = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    dims = json.loads(raw)
    cells = all_pairs(dims)
    print(json.dumps([{'id': cell_id(c), 'cell': c} for c in cells], indent=2))
