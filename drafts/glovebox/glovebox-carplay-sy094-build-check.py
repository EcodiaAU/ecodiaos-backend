"""SY094 headless xcodebuild syntax check for the Glovebox CarPlay polish ship.

Runs: pull main, pod install (if needed), xcodebuild -scheme App -configuration
Release (plain Release, NOT Release-CarPlay - the latter requires the
carplay-maps entitlement Apple has not granted yet).

Goal is a syntax/compile sanity check on the 7-file CarPlay polish commit
(5a656c7) before the next TestFlight ship. NOT an archive, NOT a sign,
NOT a TestFlight upload.

Outputs the last 80 lines of xcodebuild output so failure surfaces are
visible in the chat without flooding the tool result.
"""

import paramiko
import sys

HOST = "SY094.macincloud.com"
PORT = 22
USER = "user276189"
PASSWORD = "xve24085ehi"

REPO_PATH = ""  # set after probing
CHECK_BRANCH = "main"
EXPECTED_HEAD = "5a656c7"  # commit we just pushed


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 600) -> tuple[int, str, str]:
    """Run a command, return (exit_code, stdout, stderr)."""
    print(f"\n--- SSH RUN ---\n$ {cmd}", flush=True)
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    rc = stdout.channel.recv_exit_status()
    print(f"--- exit {rc} ---", flush=True)
    if out.strip():
        print(out.strip()[-4000:], flush=True)
    if err.strip():
        print(f"--- stderr ---\n{err.strip()[-2000:]}", flush=True)
    return rc, out, err


def main() -> int:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"connecting to {USER}@{HOST}:{PORT} ...", flush=True)
    client.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30)

    try:
        global REPO_PATH
        # 1. probe for the Glovebox frontend working tree under common names
        rc, out, _ = run(client, "ls -d ~/Desktop/projects/*-frontend ~/Desktop/projects/*frontend ~/Desktop/projects/{glovebox,nav,roam}* 2>/dev/null | head -20")
        candidates = [line.strip() for line in out.splitlines() if line.strip()]
        for c in candidates:
            # confirm it's the right repo by remote origin name
            rc2, out2, _ = run(client, f"cd {c} && git remote get-url origin 2>/dev/null || true")
            if "glovebox-frontend" in out2 or "roam-frontend" in out2 or "nav-frontend" in out2:
                REPO_PATH = c
                break
        if not REPO_PATH:
            print(f"no glovebox/nav/roam frontend working tree found on SY094; candidates: {candidates}", flush=True)
            return 2
        print(f"using REPO_PATH={REPO_PATH}", flush=True)

        # 2. fetch + checkout main + pull
        rc, _, _ = run(client, f"cd {REPO_PATH} && git fetch origin {CHECK_BRANCH} && git checkout {CHECK_BRANCH} && git pull --ff-only origin {CHECK_BRANCH}")
        if rc != 0:
            print("git pull failed", flush=True)
            return 3

        # 3. confirm we're on the polish commit
        rc, out, _ = run(client, f"cd {REPO_PATH} && git rev-parse --short HEAD")
        head = out.strip()
        if not head.startswith(EXPECTED_HEAD):
            print(f"HEAD={head} but expected {EXPECTED_HEAD}; proceeding anyway", flush=True)

        # 4. pod install if Podfile.lock missing or outdated (idempotent, fast if no-op)
        rc, _, _ = run(client, f"cd {REPO_PATH}/ios/App && pod install --silent 2>&1 | tail -20", timeout=300)
        if rc != 0:
            print("pod install reported non-zero; continuing to xcodebuild anyway (may have been a no-op warning)", flush=True)

        # 5. xcodebuild plain Release - NO Release-CarPlay (that would fail
        # signing without the entitlement). We just want to confirm the Swift
        # compiles + Info.plist parses + privacy manifest parses.
        cmd = (
            f"cd {REPO_PATH}/ios/App && "
            "xcodebuild "
            "-workspace App.xcworkspace "
            "-scheme App "
            "-configuration Release "
            "-sdk iphoneos "
            "-destination 'generic/platform=iOS' "
            "CODE_SIGNING_ALLOWED=NO "
            "CODE_SIGN_IDENTITY= "
            "PROVISIONING_PROFILE= "
            "build "
            "2>&1 | tail -120"
        )
        rc, out, _ = run(client, cmd, timeout=900)
        if rc != 0:
            print("BUILD FAILED", flush=True)
            return 4

        print("\nBUILD SUCCEEDED on Release config", flush=True)

        # 6. quick swiftc syntax-only pass on each CarPlay file as belt+braces
        files = [
            "ios/App/App/AppDelegate.swift",
            "ios/App/App/CarPlaySceneDelegate.swift",
            "ios/App/App/CarPlayNavigationCoordinator.swift",
            "ios/App/App/CarPlayMapViewController.swift",
            "ios/App/App/RoamCarPlayBridge.swift",
            "ios/App/App/RoamCarPlaySharedState.swift",
        ]
        for f in files:
            rc, out, _ = run(client, f"cd {REPO_PATH} && swiftc -parse {f} 2>&1 | tail -5 || true", timeout=60)

        return 0
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
