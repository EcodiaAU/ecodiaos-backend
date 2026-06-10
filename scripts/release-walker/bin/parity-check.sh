#!/usr/bin/env bash
# parity-check.sh - cross-platform parity comparator for three-native apps.
# Per cross-platform-parity-needs-explicit-verifier-2026-06-09: per-platform
# D1 only judges each platform against its OWN spec block; the class of bug
# that shipped (mustard pills vs red dots, Saved persisting on iOS only)
# lives in the gap BETWEEN the blocks. This tool judges that gap.
#
# usage: parity-check.sh <run-dir> <spec-path>
# Appends parity findings to <run-dir>/findings.jsonl and writes
# <run-dir>/parity-report.json (screenshot pairs for vision judgement).
set -euo pipefail

RUN_DIR="${1:?run dir}"
SPEC_PATH="${2:?spec path}"

python3 - "$RUN_DIR" "$SPEC_PATH" <<'PY'
import glob
import json
import os
import sys

import yaml

run_dir, spec_path = sys.argv[1], sys.argv[2]
with open(spec_path, encoding='utf-8') as f:
    spec = yaml.safe_load(f)

flows_by_platform = {'android': set(), 'ios': set()}
for fl in (spec.get('flows') or []):
    p = fl.get('platform')
    if p in flows_by_platform:
        flows_by_platform[p].add(fl['id'])


def find_capture(platform, surface_id):
    """Locate a captured hierarchy+screenshot for surface on platform.
    Plain layout: <run>/<flow>/<surface>/; matrix layout:
    <run>/cells/<platform>/<flow>/<cell>/<flow>/<surface>/."""
    for flow in sorted(flows_by_platform[platform]):
        d = os.path.join(run_dir, flow, surface_id)
        if os.path.isfile(os.path.join(d, 'hierarchy.xml')):
            return d
    pattern = os.path.join(run_dir, 'cells', platform, '*', '*', '*', surface_id)
    for d in sorted(glob.glob(pattern)):
        if os.path.isfile(os.path.join(d, 'hierarchy.xml')):
            return d
    return None


def anchors_present(hier_path, anchors):
    with open(hier_path, encoding='utf-8', errors='replace') as f:
        blob = f.read()
    out = {}
    for raw in anchors:
        needle = raw.split(':', 1)[1] if ':' in raw else raw
        out[raw] = (f'text="{needle}"' in blob) or (f'content-desc="{needle}"' in blob)
    return out


findings = []
report = {'surfaces': [], 'surfaces_android_only': [], 'surfaces_ios_only': [],
          'screenshot_pairs_for_vision': []}

for s in (spec.get('surfaces') or []):
    sid = s['id']
    plats = s.get('platforms') or {}
    a_block, i_block = plats.get('android'), plats.get('ios')
    if a_block and not i_block:
        report['surfaces_android_only'].append(sid)
        continue
    if i_block and not a_block:
        report['surfaces_ios_only'].append(sid)
        continue
    if not a_block or not i_block:
        continue

    a_anchors = a_block.get('elements') or []
    i_anchors = i_block.get('elements') or []
    a_dir = find_capture('android', sid)
    i_dir = find_capture('ios', sid)

    entry = {'id': sid,
             'android_capture': a_dir, 'ios_capture': i_dir,
             'spec_only_android': sorted(set(a_anchors) - set(i_anchors)),
             'spec_only_ios': sorted(set(i_anchors) - set(a_anchors)),
             'shared_anchor_divergence': []}

    shared = sorted(set(a_anchors) & set(i_anchors))
    if a_dir and i_dir and shared:
        a_present = anchors_present(os.path.join(a_dir, 'hierarchy.xml'), shared)
        i_present = anchors_present(os.path.join(i_dir, 'hierarchy.xml'), shared)
        for anchor in shared:
            if a_present[anchor] != i_present[anchor]:
                where = 'android' if a_present[anchor] else 'ios'
                missing = 'ios' if a_present[anchor] else 'android'
                entry['shared_anchor_divergence'].append(
                    {'anchor': anchor, 'present_on': where, 'missing_on': missing})
                findings.append({
                    'detector': 'PARITY', 'severity': 'medium',
                    'flow': '__parity', 'surface': sid,
                    'expected': f"shared anchor '{anchor}' on both platforms",
                    'observed': f'present on {where}, missing on {missing}',
                    'evidence': os.path.join(a_dir if missing == 'ios' else i_dir, 'screen.png'),
                })

    if a_dir and i_dir:
        pair = [os.path.join(a_dir, 'screen.png'), os.path.join(i_dir, 'screen.png')]
        if all(os.path.isfile(p) for p in pair):
            report['screenshot_pairs_for_vision'].append({'surface': sid, 'pair': pair})
    elif bool(a_dir) != bool(i_dir):
        walked = 'android' if a_dir else 'ios'
        entry['walk_gap'] = f'captured on {walked} only in this run'

    report['surfaces'].append(entry)

report['vision_judgement'] = ('PENDING - conductor reads screenshot_pairs_for_vision side by side '
                              'per agent-is-the-vision-llm; structural divergence above is judged')

with open(os.path.join(run_dir, 'parity-report.json'), 'w') as f:
    json.dump(report, f, indent=2)

with open(os.path.join(run_dir, 'findings.jsonl'), 'a') as f:
    for row in findings:
        f.write(json.dumps(row) + '\n')

print(f"[parity] {len(report['surfaces'])} dual-platform surface(s), "
      f"{len(findings)} divergence finding(s), "
      f"{len(report['screenshot_pairs_for_vision'])} screenshot pair(s) for vision")
PY
