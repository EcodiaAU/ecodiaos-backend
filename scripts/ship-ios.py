#!/usr/bin/env python3
"""Universal iOS app ship-to-Apple-review driver. Run on SY094 only.

Usage:
  python3 ship-ios.py <app-slug> [--build-num N] [--skip-bump] [--no-submit]

Reads ~/asc-scripts/apps/<slug>.json, runs the 10-step protocol from
~/ecodiaos/patterns/ios-app-asc-headless-ship-protocol.md, leaves the
submission in WAITING_FOR_REVIEW state. Auto-release on approval (if the
App Store version has releaseType=AFTER_APPROVAL) happens after Apple
reviews; no further script invocation needed.

Prereqs on SY094:
  pip3 install --user --break-system-packages pyjwt cryptography
  ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8 (mode 600)
  GitHub PAT in env GITHUB_PAT or in kv_store.creds.github_pat
  Login keychain password in env KEYCHAIN_PASSWORD (or rely on prior unlock)
"""
import argparse, json, os, re, subprocess, sys, time
import urllib.request, urllib.error
try:
    import jwt as pyjwt
except ImportError:
    sys.exit("pip3 install --user --break-system-packages pyjwt cryptography")

ROOT = os.path.expanduser('~/asc-scripts/apps')


def load_spec(slug):
    path = os.path.join(ROOT, f'{slug}.json')
    if not os.path.exists(path):
        sys.exit(f"no spec at {path}")
    with open(path) as f:
        s = json.load(f)
    s['build_dir'] = os.path.expanduser(s['build_dir'])
    s['asc_api_p8_path'] = os.path.expanduser(s['asc_api_p8_path'])
    return s


def sh(cmd, cwd=None, check=True, capture=True, env=None):
    print(f"$ {cmd}")
    e = os.environ.copy()
    if env:
        e.update(env)
    r = subprocess.run(cmd, shell=True, cwd=cwd, env=e,
                       stdout=subprocess.PIPE if capture else None,
                       stderr=subprocess.STDOUT if capture else None,
                       text=True)
    if capture and r.stdout:
        print(r.stdout)
    if check and r.returncode != 0:
        sys.exit(f"FAILED (rc={r.returncode}): {cmd}")
    return r


def mint_jwt(spec):
    with open(spec['asc_api_p8_path']) as f:
        key = f.read()
    return pyjwt.encode(
        {'iss': spec['asc_api_issuer_id'], 'iat': int(time.time()),
         'exp': int(time.time()) + 1200, 'aud': 'appstoreconnect-v1'},
        key, algorithm='ES256',
        headers={'kid': spec['asc_api_key_id'], 'typ': 'JWT'})


def api(spec, path, method='GET', body=None):
    url = 'https://api.appstoreconnect.apple.com' + path
    req = urllib.request.Request(url, method=method)
    req.add_header('Authorization', f'Bearer {mint_jwt(spec)}')
    req.add_header('Content-Type', 'application/json')
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=30) as r:
            return r.getcode(), (json.loads(r.read().decode()) if r.getcode() != 204 else {})
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or '{}')


def resolve_asv_id(spec):
    rc, j = api(spec,
                f"/v1/apps/{spec['asc_app_id']}/appStoreVersions"
                f"?filter[versionString]={spec['marketing_version']}"
                f"&filter[platform]=IOS&limit=10")
    if rc != 200:
        sys.exit(f"could not list app store versions (rc={rc}): {j}")
    candidates = [v for v in j.get('data', [])
                  if v['attributes']['appStoreState'] in
                  ('PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED',
                   'METADATA_REJECTED', 'REJECTED',
                   'INVALID_BINARY')]
    if not candidates:
        sys.exit(f"no submittable App Store version found at versionString={spec['marketing_version']}. "
                 f"Create one in ASC web first.")
    return candidates[0]['id']


def bump_build(spec):
    proj = os.path.join(spec['build_dir'], spec['xcode_project'], 'project.pbxproj')
    txt = open(proj).read()
    m = max(int(x) for x in re.findall(r'CURRENT_PROJECT_VERSION = (\d+);', txt))
    new = m + 1
    txt2 = re.sub(rf'CURRENT_PROJECT_VERSION = {m};', f'CURRENT_PROJECT_VERSION = {new};', txt)
    open(proj, 'w').write(txt2)
    print(f"bumped CURRENT_PROJECT_VERSION {m} -> {new}")
    return new


def ensure_export_options(spec):
    path = os.path.join(spec['build_dir'], 'ios/App/ExportOptions.plist')
    plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>{spec['team_id']}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadBitcode</key><false/>
  <key>uploadSymbols</key><true/>
  <key>compileBitcode</key><false/>
  <key>destination</key><string>export</string>
</dict></plist>
"""
    open(path, 'w').write(plist)
    print(f"wrote {path}")


def step_pull(spec):
    pat = os.environ.get('GITHUB_PAT')
    if pat:
        url = f"https://x-access-token:{pat}@github.com/{spec['github_repo']}.git"
    else:
        url = f"https://github.com/{spec['github_repo']}.git"
    sh(f"git fetch origin main && git checkout main && git pull --ff-only {url} main",
       cwd=spec['build_dir'])
    sh("git log --oneline -3", cwd=spec['build_dir'])


def step_archive(spec, marketing_version, build_num):
    pw = os.environ.get('KEYCHAIN_PASSWORD')
    if pw:
        sh(f'security unlock-keychain -p "{pw}" ~/Library/Keychains/login.keychain-db')
        sh(f'security set-keychain-settings -lut 7200 ~/Library/Keychains/login.keychain-db')
    archive_path = f"/tmp/{spec['slug']}-{marketing_version}.{build_num}.xcarchive"
    sh(f"rm -rf {archive_path}")
    workspace_flag = (f"-workspace ios/App/App.xcworkspace"
                      if spec.get('build_system') == 'cocoapods'
                      else f"-project {spec['xcode_project']}")
    sh(f"""xcodebuild {workspace_flag} -scheme {spec['xcode_scheme']} -configuration Release \\
        -archivePath {archive_path} \\
        -destination "generic/platform=iOS" archive \\
        -allowProvisioningUpdates \\
        -authenticationKeyPath {spec['asc_api_p8_path']} \\
        -authenticationKeyID {spec['asc_api_key_id']} \\
        -authenticationKeyIssuerID {spec['asc_api_issuer_id']} \\
        DEVELOPMENT_TEAM={spec['team_id']} \\
        CODE_SIGN_STYLE=Automatic""",
       cwd=spec['build_dir'])
    return archive_path


def step_export(spec, archive_path):
    pw = os.environ.get('KEYCHAIN_PASSWORD')
    if pw:
        sh(f'security unlock-keychain -p "{pw}" ~/Library/Keychains/login.keychain-db')
    export_path = archive_path.replace('.xcarchive', '-export')
    sh(f"rm -rf {export_path}")
    sh(f"""xcodebuild -exportArchive \\
        -archivePath {archive_path} \\
        -exportPath {export_path} \\
        -exportOptionsPlist {spec['build_dir']}/ios/App/ExportOptions.plist \\
        -allowProvisioningUpdates \\
        -authenticationKeyPath {spec['asc_api_p8_path']} \\
        -authenticationKeyID {spec['asc_api_key_id']} \\
        -authenticationKeyIssuerID {spec['asc_api_issuer_id']}""")
    return f"{export_path}/App.ipa"


def step_upload(spec, ipa):
    sh(f"""xcrun altool --upload-app -f {ipa} -t ios \\
        --apiKey {spec['asc_api_key_id']} \\
        --apiIssuer {spec['asc_api_issuer_id']}""")


def step_poll_build(spec, build_num, timeout=900):
    print(f"polling for build {spec['marketing_version']}({build_num}) state=VALID...")
    deadline = time.time() + timeout
    while time.time() < deadline:
        rc, j = api(spec, f"/v1/builds?filter[app]={spec['asc_app_id']}"
                          f"&filter[preReleaseVersion.version]={spec['marketing_version']}"
                          f"&filter[version]={build_num}")
        rows = j.get('data', [])
        if rows:
            b = rows[0]
            st = b['attributes']['processingState']
            print(f"  build_id={b['id']} state={st}")
            if st == 'VALID':
                return b['id']
            if st == 'FAILED':
                sys.exit("build state FAILED")
        else:
            print("  not yet visible")
        time.sleep(30)
    sys.exit("timeout waiting for build VALID")


def step_attach(spec, asv_id, build_id):
    rc, j = api(spec, f"/v1/appStoreVersions/{asv_id}/relationships/build",
                method='PATCH',
                body={'data': {'type': 'builds', 'id': build_id}})
    if rc not in (200, 204):
        sys.exit(f"attach failed (rc={rc}): {j}")
    print(f"attached build {build_id} to ASV {asv_id}")


def step_submit_for_review(spec, asv_id):
    # reuse existing open reviewSubmission if any
    rc, j = api(spec, f"/v1/reviewSubmissions?filter[app]={spec['asc_app_id']}"
                      f"&filter[platform]=IOS"
                      f"&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES")
    if rc != 200:
        sys.exit(f"reviewSubmissions list failed: {j}")
    existing = j.get('data', [])
    if existing:
        sid = existing[0]['id']
        print(f"reusing reviewSubmission {sid} state={existing[0]['attributes']['state']}")
    else:
        rc, j = api(spec, '/v1/reviewSubmissions', method='POST', body={
            'data': {'type': 'reviewSubmissions',
                     'attributes': {'platform': 'IOS'},
                     'relationships': {'app': {'data': {'type': 'apps',
                                                         'id': spec['asc_app_id']}}}}})
        if rc not in (200, 201):
            sys.exit(f"reviewSubmission POST failed: {j}")
        sid = j['data']['id']
        print(f"created reviewSubmission {sid}")

    rc, j = api(spec, '/v1/reviewSubmissionItems', method='POST', body={
        'data': {'type': 'reviewSubmissionItems',
                 'relationships': {
                     'reviewSubmission': {'data': {'type': 'reviewSubmissions', 'id': sid}},
                     'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': asv_id}}}}})
    if rc not in (200, 201, 409):
        sys.exit(f"reviewSubmissionItem POST failed: {j}")

    rc, j = api(spec, f'/v1/reviewSubmissions/{sid}', method='PATCH', body={
        'data': {'type': 'reviewSubmissions', 'id': sid,
                 'attributes': {'submitted': True}}})
    if rc not in (200, 204):
        sys.exit(f"reviewSubmission PATCH submitted=true failed: {j}")
    print(f"SUBMITTED. reviewSubmission {sid} now state={j.get('data', {}).get('attributes', {}).get('state', '?')}")
    return sid


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('slug')
    ap.add_argument('--build-num', type=int)
    ap.add_argument('--skip-bump', action='store_true')
    ap.add_argument('--no-submit', action='store_true',
                    help='upload only, skip review submission')
    args = ap.parse_args()
    spec = load_spec(args.slug)
    print(f"=== ship-ios.py {spec['name']} marketing={spec['marketing_version']} ===")

    asv_id = spec.get('asv_id') or resolve_asv_id(spec)
    print(f"App Store version: {asv_id}")

    print("=== [1] pull main ===")
    step_pull(spec)

    if args.skip_bump:
        # read current build from pbxproj
        proj = os.path.join(spec['build_dir'], spec['xcode_project'], 'project.pbxproj')
        nums = [int(x) for x in re.findall(r'CURRENT_PROJECT_VERSION = (\d+);', open(proj).read())]
        build_num = args.build_num or max(nums)
    else:
        build_num = args.build_num or bump_build(spec)
    print(f"build number: {build_num}")

    print("=== [3] ensure ExportOptions.plist ===")
    ensure_export_options(spec)

    if spec.get('cap_sync_required'):
        print("=== [4] npm install + cap sync ===")
        sh("npm install --no-audit --no-fund", cwd=spec['build_dir'])
        sh("npx cap sync ios", cwd=spec['build_dir'])

    print("=== [5] archive ===")
    archive_path = step_archive(spec, spec['marketing_version'], build_num)

    print("=== [6] export IPA ===")
    ipa = step_export(spec, archive_path)
    print(f"IPA: {ipa}")

    print("=== [7] altool upload ===")
    step_upload(spec, ipa)

    if args.no_submit:
        print("--no-submit set, stopping at TestFlight upload")
        return

    print("=== [8] poll for VALID ===")
    build_id = step_poll_build(spec, build_num)

    print("=== [9a] attach build to ASV ===")
    step_attach(spec, asv_id, build_id)

    print("=== [9b] submit for review ===")
    sid = step_submit_for_review(spec, asv_id)

    print("=== [10] verify final state ===")
    rc, j = api(spec, f'/v1/reviewSubmissions/{sid}')
    print(f"final submission state: {j['data']['attributes']['state']} submittedDate={j['data']['attributes']['submittedDate']}")
    rc, j = api(spec, f'/v1/appStoreVersions/{asv_id}')
    print(f"App Store version state: {j['data']['attributes']['appStoreState']} releaseType: {j['data']['attributes']['releaseType']}")
    print("DONE.")


if __name__ == '__main__':
    main()
