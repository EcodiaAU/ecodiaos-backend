#!/usr/bin/env python3
"""parse-spec.py - read spec.yml, emit JSON the walker consumes.

usage: parse-spec.py <spec.yml> [platform]   (platform defaults to android)

Output shape:
{
  "app": "locals",
  "android_package": "...",
  "android_launch_activity": "...",
  "ios_bundle_id": "...",
  "surfaces": { "<id>": { "enter_via": "...", "elements": [...] } },
  "flows": [ { "id": "...", "platform": "...", "walks_surfaces": [...],
               "detectors": [...], "runs_forms": [...] } ],
  "persistence": [ { "claim": "...", "fires_after": "...", "probe": {...} } ],
  "forms": { "<id>": { "surface": "...", "fill": [...], "submit": "...",
                       "expect": {...} } }
}
"""
import json
import sys

import yaml

spec_path = sys.argv[1]
platform = sys.argv[2] if len(sys.argv) > 2 else 'android'

with open(spec_path, encoding='utf-8') as f:
    spec = yaml.safe_load(f)

flat_surfaces = {}
for s in (spec.get('surfaces') or []):
    sid = s['id']
    plat = (s.get('platforms') or {}).get(platform) or {}
    flat_surfaces[sid] = {
        'enter_via': plat.get('enter_via'),
        'elements': plat.get('elements') or [],
        'landing_after_clear': bool(plat.get('landing_after_clear')),
        'landing_after_onboarding': bool(plat.get('landing_after_onboarding')),
        'has_platform_block': bool((s.get('platforms') or {}).get(platform)),
    }

flat_flows = []
for f in (spec.get('flows') or []):
    if f.get('platform') != platform:
        continue
    flat_flows.append({
        'id': f['id'],
        'platform': f['platform'],
        'walks_surfaces': f.get('walks_surfaces') or [],
        'detectors': f.get('detectors') or [],
        'role': f.get('role'),
        'runs_forms': f.get('runs_forms') or [],
    })

persistence = []
for p in (spec.get('persistence') or []):
    probe = p.get('probe') or {}
    landing = probe.get('expect_landing_surface')
    # expect_landing_surface may be a flat id or a per-platform map.
    if isinstance(landing, dict):
        landing = landing.get(platform)
    persistence.append({
        'claim': p.get('claim') or '',
        'fires_after': p.get('fires_after') or '',
        'kill': bool(probe.get('kill', True)),
        'relaunch_clear_state': bool(probe.get('relaunch_clear_state', False)),
        'expect_landing_surface': landing,
    })

forms = {}
for fm in (spec.get('forms') or []):
    if fm.get('platform') and fm.get('platform') != platform:
        continue
    forms[fm['id']] = {
        'surface': fm.get('surface') or fm.get('on'),
        'fill': fm.get('fill') or [],
        'submit': fm.get('submit') or '',
        'expect': fm.get('expect') or {},
    }

print(json.dumps({
    'app': spec.get('app'),
    'android_package': spec.get('android_package'),
    'android_launch_activity': spec.get('android_launch_activity'),
    'ios_bundle_id': spec.get('ios_bundle_id'),
    'surfaces': flat_surfaces,
    'flows': flat_flows,
    'persistence': persistence,
    'forms': forms,
    'explore': spec.get('explore') or {},
}, indent=2))
