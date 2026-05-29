#!/bin/bash
# coexist-headless-ship-sy094.sh - runs ON SY094, headless ship of Co-Exist 1.8.25(1) to ASC.
# Models the validated EcodiaOS-mobile headless path.
# Origin: 2026-05-29, Tate verbatim "you can ssh and ship the build".

set -euo pipefail
trap 'echo "FAIL at line $LINENO" >&2' ERR

MACPASS="${MACPASS:?MACPASS env required}"
ASC_KEY_ID="${ASC_KEY_ID:-R8P6K38X47}"
ASC_ISSUER="${ASC_ISSUER:-4b45186b-49e4-4a25-8a63-afd28cf12d3f}"
REPO=~/Desktop/projects/coexist
ARCHIVE=/tmp/CoExist-1.8.25-1.xcarchive
EXPORTDIR=/tmp/coexist-export
DERIVED=/tmp/coexist-derived
LOG=/tmp/coexist-ship-$(date +%Y%m%d-%H%M%S).log

exec > >(tee -a "$LOG") 2>&1

echo "=== $(date) - Co-Exist 1.8.25(1) headless ship ==="
echo "log: $LOG"

# ---- Phase 0a: Keychain unlock + codesign partition-list grant ----
echo "--- Phase 0a: keychain unlock ---"
security unlock-keychain -p "$MACPASS" ~/Library/Keychains/login.keychain-db
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$MACPASS" ~/Library/Keychains/login.keychain-db >/dev/null

# ---- Phase C-F: Pipeline ----
echo "--- Phase C: git pull ---"
cd "$REPO"
git fetch origin main
git reset --hard origin/main
git log -1 --oneline

# Need PATH for nvm-installed node
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
node --version
npm --version

echo "--- Phase D: npm install ---"
npm install --no-audit --no-fund

echo "--- Phase E: npm run build ---"
npm run build

echo "--- Phase F: npx cap sync ios ---"
npx cap sync ios

# Verify version bump landed
grep -E "MARKETING_VERSION|CURRENT_PROJECT_VERSION" ios/App/App.xcodeproj/project.pbxproj | sort -u

# ---- Phase I-headless: Archive ----
echo "--- Phase I: xcodebuild archive ---"
cd "$REPO/ios/App"
rm -rf "$ARCHIVE"
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE" \
  -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates \
  -quiet \
  archive

[ -d "$ARCHIVE" ] || { echo "ARCHIVE MISSING"; exit 1; }
ls "$ARCHIVE/Products/Applications/" 2>&1

# ---- Phase J-headless: Export IPA for App Store ----
echo "--- Phase J: export IPA ---"
cat > /tmp/exportOptions.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store</string>
  <key>destination</key>
  <string>export</string>
  <key>teamID</key>
  <string>86PUY7393S</string>
  <key>uploadBitcode</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
  <key>signingStyle</key>
  <string>automatic</string>
</dict>
</plist>
EOF

rm -rf "$EXPORTDIR"
mkdir -p "$EXPORTDIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORTDIR" \
  -exportOptionsPlist /tmp/exportOptions.plist \
  -allowProvisioningUpdates \
  -quiet

IPA=$(ls "$EXPORTDIR"/*.ipa 2>/dev/null | head -1)
[ -n "$IPA" ] || { echo "IPA EXPORT MISSING"; exit 1; }
ls -la "$IPA"

# ---- Phase K-headless: Upload to ASC ----
echo "--- Phase K: upload to ASC via altool ---"
xcrun altool --upload-app -f "$IPA" -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER" \
  --output-format json

echo "=== $(date) - SHIP COMPLETE ==="
