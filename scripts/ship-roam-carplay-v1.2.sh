#!/usr/bin/env bash
# ship-roam-carplay-v1.2.sh
#
# Phase-2 ship for Roam CarPlay - run AFTER Apple grants the
# com.apple.developer.carplay-maps entitlement (response to the
# 2026-05-19 submission landing in code@ecodia.au).
#
# Run on SY094 over SSH:
#   ssh tate@SY094 'bash -lc "~/asc-scripts/ship-roam-carplay-v1.2.sh"'
#
# The script:
#   1. git pull on the canonical clone
#   2. npm install + build + cap copy
#   3. pod install (with UTF-8 locale workaround)
#   4. unlock keychain + set codesign ACL
#   5. bump CURRENT_PROJECT_VERSION 27 -> 28
#   6. xcodebuild archive with Release-CarPlay config (uses
#      App-CarPlay.entitlements which has the carplay-maps key)
#   7. exportArchive (auto-fetches new provisioning profile that
#      Apple stitched the entitlement into)
#   8. xcrun altool upload
#
# After this finishes, the build appears on TestFlight; install on
# iPhone, plug into real CarPlay head unit, verify the scene
# activates and renders CPMapTemplate + CPNavigationSession.

set -euo pipefail

REPO_DIR="$HOME/Desktop/projects/roam-frontend"
ARCHIVE_BASE="$HOME/builds/roam"
P8="$HOME/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8"
KEY_ID="R8P6K38X47"
ISSUER="4b45186b-49e4-4a25-8a63-afd28cf12d3f"
TEAM_ID="86PUY7393S"
KEYCHAIN_PW="${KEYCHAIN_PASSWORD:-xve24085ehi}"

export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

echo "==> [1] git pull"
cd "$REPO_DIR"
git fetch origin main
git checkout main
git pull --ff-only origin main
git log --oneline -3

echo "==> [2] npm install + build + cap copy"
npm install --no-audit --no-fund
npm run build
npx cap copy ios

echo "==> [3] pod install"
( cd ios/App && pod install )

echo "==> [4] unlock keychain + codesign ACL"
security unlock-keychain -p "$KEYCHAIN_PW" "$HOME/Library/Keychains/login.keychain-db"
security set-key-partition-list \
    -S 'apple-tool:,apple:,codesign:' \
    -s -k "$KEYCHAIN_PW" \
    "$HOME/Library/Keychains/login.keychain-db" > /dev/null

echo "==> [5] bump CURRENT_PROJECT_VERSION"
PBX="$REPO_DIR/ios/App/App.xcodeproj/project.pbxproj"
CUR=$(grep -oE 'CURRENT_PROJECT_VERSION = [0-9]+;' "$PBX" | head -1 | grep -oE '[0-9]+')
NEW=$((CUR + 1))
sed -i.bak "s/CURRENT_PROJECT_VERSION = $CUR;/CURRENT_PROJECT_VERSION = $NEW;/g" "$PBX"
rm -f "$PBX.bak"
echo "    $CUR -> $NEW"

mkdir -p "$ARCHIVE_BASE"
ARCHIVE="$ARCHIVE_BASE/Roam-1.1-$NEW-carplay.xcarchive"
EXPORT_DIR="$ARCHIVE_BASE/Roam-1.1-$NEW-carplay-export"
rm -rf "$ARCHIVE" "$EXPORT_DIR"

echo "==> [6] xcodebuild archive (Release-CarPlay config)"
xcodebuild \
    -workspace ios/App/App.xcworkspace \
    -scheme App \
    -configuration Release-CarPlay \
    -archivePath "$ARCHIVE" \
    -destination 'generic/platform=iOS' \
    archive \
    -allowProvisioningUpdates \
    -authenticationKeyPath "$P8" \
    -authenticationKeyID "$KEY_ID" \
    -authenticationKeyIssuerID "$ISSUER" \
    DEVELOPMENT_TEAM="$TEAM_ID" \
    CODE_SIGN_STYLE=Automatic

echo "==> [7] export IPA"
xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE" \
    -exportPath "$EXPORT_DIR" \
    -exportOptionsPlist ios/App/ExportOptions.plist \
    -allowProvisioningUpdates \
    -authenticationKeyPath "$P8" \
    -authenticationKeyID "$KEY_ID" \
    -authenticationKeyIssuerID "$ISSUER"

IPA="$EXPORT_DIR/App.ipa"
ls -la "$IPA"

echo "==> [8] altool upload"
xcrun altool --upload-app \
    -f "$IPA" \
    -t ios \
    --apiKey "$KEY_ID" \
    --apiIssuer "$ISSUER"

echo
echo "DONE. Build 1.1($NEW) uploaded to TestFlight."
echo "Wait ~5-10 min for ASC processing, install via TestFlight on iPhone, plug into real CarPlay head unit."
