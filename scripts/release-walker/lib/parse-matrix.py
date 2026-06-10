#!/usr/bin/env python3
"""parse-matrix.py - expand the spec's matrix block into runnable cells.

usage: parse-matrix.py <spec.yml> <platform> [--cells=N]

Emits JSON:
{
  "permissions": {<group>: {"android": [...], "ios": "..."}},
  "flows": [
    {"flow": "<id>", "platform": "android",
     "cells": [{"id": "<cell-id>", "cell": {dim: variant}}, ...],
     "dropped_dims": [{"dim": "network", "reason": "unsupported_on_ios"}]}
  ]
}

Platform honesty rules (STATE-MATRIX.md Section 1): the network dimension is
dropped at generation time for ios flows (no per-sim primitive); the drop is
recorded so the report names the uncovered dimension instead of hiding it.
A flow with no surviving dimensions still runs once with cell {} (id
"default"), keeping matrix mode a superset of a plain walk.
"""
import json
import sys

import yaml

sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from pairwise import all_pairs, cell_id  # noqa: E402

IOS_UNSUPPORTED_DIMS = {'network'}


def main():
    spec_path = sys.argv[1]
    platform = sys.argv[2]
    cap = None
    for a in sys.argv[3:]:
        if a.startswith('--cells='):
            cap = int(a.split('=', 1)[1])

    with open(spec_path, encoding='utf-8') as f:
        spec = yaml.safe_load(f)

    matrix = spec.get('matrix') or {}
    dims_pool = matrix.get('dimensions') or {}
    perm_map = matrix.get('permissions') or {}
    flow_specs = matrix.get('flows') or []

    spec_flows = {f['id']: f for f in (spec.get('flows') or [])}

    out_flows = []
    for mf in flow_specs:
        fid = mf.get('flow')
        flow = spec_flows.get(fid)
        if not flow:
            print(f"[parse-matrix] WARN: matrix references unknown flow '{fid}'", file=sys.stderr)
            continue
        if flow.get('platform') != platform:
            continue

        dropped = []
        use_dims = {}
        for dim in (mf.get('vary') or []):
            if dim not in dims_pool:
                print(f"[parse-matrix] WARN: flow '{fid}' varies undeclared dimension '{dim}'", file=sys.stderr)
                dropped.append({'dim': dim, 'reason': 'undeclared'})
                continue
            if platform == 'ios' and dim in IOS_UNSUPPORTED_DIMS:
                dropped.append({'dim': dim, 'reason': 'unsupported_on_ios'})
                continue
            use_dims[dim] = [str(v) for v in dims_pool[dim]]

        if mf.get('pairwise', True):
            cells = all_pairs(use_dims)
        else:
            # Full cross product, requested explicitly.
            cells = [{}]
            for name in sorted(use_dims.keys()):
                cells = [dict(c, **{name: v}) for c in cells for v in use_dims[name]]

        if not cells:
            cells = [{}]

        # pin: fixed dimension values merged into every cell. For flows
        # whose expectations only hold under one variant (e.g. iOS landing
        # anchors only visible when location is pre-granted; the
        # never_asked first-launch prompt is its own flow).
        pin = {k: str(v) for k, v in (mf.get('pin') or {}).items()}
        if pin:
            cells = [dict(c, **pin) for c in cells]

        if cap:
            cells = cells[:cap]

        out_flows.append({
            'flow': fid,
            'platform': platform,
            'cells': [{'id': cell_id(c), 'cell': c} for c in cells],
            'dropped_dims': dropped,
        })

    print(json.dumps({'permissions': perm_map, 'flows': out_flows}, indent=2))


if __name__ == '__main__':
    main()
