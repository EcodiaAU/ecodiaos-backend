#!/usr/bin/env python3
"""explore-android.py - the exploration layer (doctrine: six baseline detectors).

usage: explore-android.py <serial> <package> <activity> <parsed-spec.json>
                          <explore-dir> <findings.jsonl> [--taps=40]

Per testing-harness-needs-exploration-layer-not-regression-only-2026-06-09:
regression flows prove what the spec author imagined; this walker probes the
space between. Detectors (X namespace, distinct from spec-anchored D1-D11):

  X-dead-tap    tapped clickable node, hierarchy signature unchanged
  X-nav-loop    forward-tap signature sequence cycles A-B-A-B
  X-left-app    foreground package left the app after a tap
  X-crash       app process gone after a tap (critical)
  X-persist     spec persistence claims re-run at walk end (kill+relaunch),
                judged only for surfaces the walk demonstrably reached
  tried-tap memory is the frontier definition: (signature, element) pairs
                never re-tapped

Broken-image is NOT decidable from the AX tree on native surfaces. Every
new-signature screenshot goes to <explore-dir>/screens/ for conductor
vision judgement (agent-is-the-vision-llm-not-parallel-api-2026-06-09);
the summary records that this judgement is pending, not done.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import time

SETTLE_TICK = 1.5
SETTLE_CAP = 6

# System/IME surfaces and obviously dangerous controls the walker must not
# poke: dialer/emergency, external intents are caught by left-app recovery.
SKIP_TEXT = {'Call 000'}


def adb(serial, *args, binary=False, timeout=30):
    r = subprocess.run(['adb', '-s', serial, *args], capture_output=True, timeout=timeout)
    return r.stdout if binary else r.stdout.decode('utf-8', 'replace')


def shell(serial, *args, timeout=30):
    return adb(serial, 'shell', *args, timeout=timeout)


def dump_hierarchy(serial, dest):
    shell(serial, 'uiautomator', 'dump', '/sdcard/ui.xml')
    adb(serial, 'pull', '/sdcard/ui.xml', dest)
    try:
        with open(dest, encoding='utf-8', errors='replace') as f:
            return f.read()
    except OSError:
        return ''


def signature(blob):
    stripped = re.sub(r' (index|focusable|focused|selected)="[^"]*"', '', blob)
    return hashlib.sha256(stripped.encode()).hexdigest()


def screenshot(serial, dest):
    png = adb(serial, 'exec-out', 'screencap', '-p', binary=True)
    with open(dest, 'wb') as f:
        f.write(png)


def settle(serial):
    prev, same = -1, 0
    for _ in range(SETTLE_CAP):
        time.sleep(SETTLE_TICK)
        size = len(adb(serial, 'exec-out', 'screencap', '-p', binary=True))
        if size == prev and size > 30000:
            same += 1
            if same >= 1:
                return
        else:
            same = 0
        prev = size


def parse_nodes(blob, package):
    """Tappable candidates belonging to the app, from a uiautomator dump.

    Compose puts the click handler on a container and the contentDescription
    on a child Icon; TalkBack merges them but uiautomator does not. An
    unlabeled clickable inherits the label of the smallest labeled node
    spatially contained in its bounds (verified on Locals Discover: the
    'unlabeled' action buttons wrap desc=Recenter/Favorites/etc children).
    """
    labeled = []
    raw = []
    for m in re.finditer(r'<node\b[^>]*>', blob):
        s = m.group(0)
        def attr(name):
            mm = re.search(r'\b%s="([^"]*)"' % name, s)
            return mm.group(1) if mm else ''
        if attr('package') != package:
            continue
        bm = re.search(r'\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', s)
        if not bm:
            continue
        x1, y1, x2, y2 = map(int, bm.groups())
        lab = attr('text') or attr('content-desc')
        if lab:
            labeled.append((x1, y1, x2, y2, lab))
        already_on = attr('selected') == 'true' or attr('checked') == 'true'
        raw.append((s, x1, y1, x2, y2, lab, attr('clickable') == 'true', already_on))

    def inherited_label(x1, y1, x2, y2):
        best = None
        for (a1, b1, a2, b2, lab) in labeled:
            if a1 >= x1 and b1 >= y1 and a2 <= x2 and b2 <= y2:
                area = (a2 - a1) * (b2 - b1)
                if best is None or area < best[0]:
                    best = (area, lab)
        return best[1] if best else ''

    out = []
    for (s, x1, y1, x2, y2, lab, clickable, already_on) in raw:
        w, h = x2 - x1, y2 - y1
        if w < 24 or h < 24 or w * h < 1200:
            continue
        if not clickable:
            continue
        label = lab or inherited_label(x1, y1, x2, y2)
        if label in SKIP_TEXT:
            continue
        out.append({
            'label': label,
            'key': f"{label}|{(x1 + x2) // 2 // 32}x{(y1 + y2) // 2 // 32}",
            'cx': (x1 + x2) // 2,
            'cy': (y1 + y2) // 2,
            'area_frac': (w * h) / (1080 * 2400),
            'already_on': already_on,
        })
    return out


def foreground_package(serial):
    out = shell(serial, 'dumpsys', 'activity', 'activities')
    m = re.search(r'topResumedActivity.*?\s([\w.]+)/', out)
    if not m:
        m = re.search(r'mResumedActivity.*?\s([\w.]+)/', out)
    return m.group(1) if m else ''


def pid_of(serial, package):
    return shell(serial, 'pidof', package).strip()


def relaunch(serial, package, activity):
    if activity:
        shell(serial, 'am', 'start', '-n', f'{package}/{activity}')
    else:
        shell(serial, 'monkey', '-p', package, '-c', 'android.intent.category.LAUNCHER', '1')
    settle(serial)


def main():
    serial, package, activity, parsed_path, explore_dir, findings_path = sys.argv[1:7]
    taps_budget = 40
    for a in sys.argv[7:]:
        if a.startswith('--taps='):
            taps_budget = int(a.split('=', 1)[1])

    screens_dir = os.path.join(explore_dir, 'screens')
    os.makedirs(screens_dir, exist_ok=True)
    with open(parsed_path) as f:
        parsed = json.load(f)

    def finding(detector, severity, expected, observed, evidence):
        row = {'detector': detector, 'severity': severity, 'flow': '__explore',
               'surface': '__explore', 'expected': expected, 'observed': observed,
               'evidence': evidence}
        with open(findings_path, 'a') as ff:
            ff.write(json.dumps(row) + '\n')
        print(f'[explore] FIRE {detector}: {observed}')

    # Launch in the returning-user state (no clear); the regression layer
    # already covers cold_clear.
    shell(serial, 'am', 'force-stop', package)
    time.sleep(1)
    relaunch(serial, package, activity)

    tried = set()           # (signature, element-key)
    seen_sigs = {}          # signature -> screenshot path
    fired_dead = set()      # element keys already reported dead
    fired_loops = set()     # (sigA, sigB) pairs already reported
    forward_trace = []      # signatures after forward taps
    surfaces_matched = set()
    taps = 0
    backs = 0

    hier_path = os.path.join(explore_dir, '_current.xml')

    while taps < taps_budget:
        blob = dump_hierarchy(serial, hier_path)
        sig = signature(blob)

        if sig not in seen_sigs:
            shot = os.path.join(screens_dir, f'{len(seen_sigs):03d}-{sig[:8]}.png')
            screenshot(serial, shot)
            seen_sigs[sig] = shot
            # Which spec surfaces does this screen satisfy? (for X-persist)
            for sid, sdef in (parsed.get('surfaces') or {}).items():
                anchors = sdef.get('elements') or []
                if anchors and all(
                        (f'text="{a.split(":", 1)[1] if ":" in a else a}"' in blob
                         or f'content-desc="{a.split(":", 1)[1] if ":" in a else a}"' in blob)
                        for a in anchors):
                    surfaces_matched.add(sid)

        candidates = [c for c in parse_nodes(blob, package) if (sig, c['key']) not in tried]
        if not candidates:
            # Frontier empty here: back out, or relaunch when back exits.
            if backs >= 3:
                print('[explore] frontier exhausted at root; ending walk early')
                break
            shell(serial, 'input', 'keyevent', '4')
            backs += 1
            settle(serial)
            if foreground_package(serial) != package:
                relaunch(serial, package, activity)
            continue

        backs = 0
        cand = candidates[0]
        tried.add((sig, cand['key']))
        taps += 1
        print(f"[explore] tap {taps}/{taps_budget}: '{cand['label']}' @({cand['cx']},{cand['cy']})")
        shell(serial, 'input', 'tap', str(cand['cx']), str(cand['cy']))
        settle(serial)

        # X-crash
        if not pid_of(serial, package):
            finding('X-crash', 'critical',
                    f'process alive after tapping "{cand["label"]}"',
                    f'process gone after tap on "{cand["label"]}"', seen_sigs[sig])
            relaunch(serial, package, activity)
            forward_trace = []
            continue

        # X-left-app. The OS permission controller is the app behaving
        # correctly (it asked for a permission), not an escape; judged
        # benign on runs 20260610T003209Z + 005504Z.
        BENIGN_FOREGROUNDS = {'com.google.android.permissioncontroller',
                              'com.android.permissioncontroller'}
        fg = foreground_package(serial)
        if fg in BENIGN_FOREGROUNDS:
            shell(serial, 'input', 'keyevent', '4')
            settle(serial)
            fg = foreground_package(serial)
        if fg and fg != package:
            shot = os.path.join(screens_dir, f'leftapp-{taps:03d}.png')
            screenshot(serial, shot)
            finding('X-left-app', 'medium',
                    f'tap on "{cand["label"]}" stays in {package}',
                    f'foreground became {fg}', shot)
            relaunch(serial, package, activity)
            forward_trace = []
            continue

        post_blob = dump_hierarchy(serial, hier_path)
        post_sig = signature(post_blob)

        # X-dead-tap (once per element). Map canvases pan/zoom without
        # mutating the AX tree, so a signature-stable map tap is expected,
        # not dead (judged benign on run 20260610T003209Z: 'Google Map').
        # Canvas-like targets legitimately absorb taps without tree
        # mutation: anything labelled map, or an unlabeled container
        # covering most of the screen (the full-bleed map FrameLayout
        # fired false dead-taps on runs 003209Z + 005504Z).
        # Already-selected/checked controls no-op by design (the active
        # theme chip; judged on glovebox run 20260610T040658Z).
        is_canvas = ('map' in (cand['label'] or '').lower()
                     or (not cand['label'] and cand.get('area_frac', 0) > 0.6)
                     or cand.get('already_on'))
        if post_sig == sig and not is_canvas and cand['key'] not in fired_dead:
            fired_dead.add(cand['key'])
            if cand['label']:
                finding('X-dead-tap', 'medium',
                        f'clickable "{cand["label"]}" changes the hierarchy',
                        f'signature unchanged after tap on "{cand["label"]}"', seen_sigs[sig])
            else:
                # Unlabeled + dead is indistinguishable from clickable
                # decoration until the app labels its controls (tracked as
                # the a11y finding, status_board e2d50791). Notes channel,
                # not a finding; flips back to a hard finding per element
                # once labels exist.
                with open(os.path.join(explore_dir, 'notes.jsonl'), 'a') as nf:
                    nf.write(json.dumps({'note': 'unlabeled-dead-tap',
                                         'key': cand['key'],
                                         'at': [cand['cx'], cand['cy']],
                                         'evidence': seen_sigs[sig]}) + '\n')
                print(f"[explore] note: unlabeled dead tap at ({cand['cx']},{cand['cy']})")

        # X-nav-loop on the forward trace
        forward_trace.append(post_sig)
        if len(forward_trace) >= 4:
            a, b, c, d = forward_trace[-4:]
            if a == c and b == d and a != b and (a[:16], b[:16]) not in fired_loops:
                fired_loops.add((a[:16], b[:16]))
                finding('X-nav-loop', 'high',
                        'forward taps reach new surfaces',
                        f'A-B-A-B signature cycle after tapping "{cand["label"]}"',
                        seen_sigs.get(post_sig, seen_sigs[sig]))

    # X-persist: re-run spec persistence claims whose expected surface the
    # walk demonstrably reached.
    persist_results = []
    for i, claim in enumerate(parsed.get('persistence') or []):
        expect = claim.get('expect_landing_surface')
        if not expect or expect not in surfaces_matched:
            persist_results.append({'claim': claim.get('claim'), 'status': 'skipped_surface_not_reached'})
            continue
        shell(serial, 'am', 'force-stop', package)
        time.sleep(1)
        relaunch(serial, package, activity)
        blob = dump_hierarchy(serial, hier_path)
        anchors = (parsed['surfaces'].get(expect) or {}).get('elements') or []
        missing = [a for a in anchors
                   if not ((f'text="{a.split(":", 1)[1] if ":" in a else a}"' in blob)
                           or (f'content-desc="{a.split(":", 1)[1] if ":" in a else a}"' in blob))]
        shot = os.path.join(screens_dir, f'persist-{i}.png')
        screenshot(serial, shot)
        if missing:
            finding('X-persist', 'high',
                    f'"{expect}" anchors after kill+relaunch ({claim.get("claim")})',
                    f'missing: {missing}', shot)
            persist_results.append({'claim': claim.get('claim'), 'status': 'violated', 'missing': missing})
        else:
            persist_results.append({'claim': claim.get('claim'), 'status': 'held'})

    summary = {
        'taps': taps,
        'taps_budget': taps_budget,
        'unique_screens': len(seen_sigs),
        'tried_elements': len(tried),
        'dead_taps_fired': len(fired_dead),
        'notes_file': os.path.join(explore_dir, 'notes.jsonl'),
        'nav_loops_fired': len(fired_loops),
        'surfaces_matched': sorted(surfaces_matched),
        'persist_results': persist_results,
        'screens_dir': screens_dir,
        'vision_judgement': 'PENDING - conductor reads screens_dir per agent-is-the-vision-llm',
    }
    with open(os.path.join(explore_dir, 'explore-summary.json'), 'w') as f:
        json.dump(summary, f, indent=2)
    print(f'[explore] done: {taps} taps, {len(seen_sigs)} unique screens, '
          f'{len(surfaces_matched)} spec surfaces matched')


if __name__ == '__main__':
    main()
