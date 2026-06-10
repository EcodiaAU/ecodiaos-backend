#!/bin/bash
set -e
cd ~/Desktop/projects/roam-frontend
security unlock-keychain -p 'xve24085ehi' ~/Library/Keychains/login.keychain-db
rm -rf /tmp/glovebox-37-export
xcodebuild \
  -exportArchive \
  -archivePath /tmp/glovebox-37.xcarchive \
  -exportPath /tmp/glovebox-37-export \
  -exportOptionsPlist ios/App/ExportOptions.plist \
  -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8 \
  -authenticationKeyID R8P6K38X47 \
  -authenticationKeyIssuerID 4b45186b-49e4-4a25-8a63-afd28cf12d3f 2>&1 | tail -15

echo "---ipa---"
ls -la /tmp/glovebox-37-export/

echo "---altool upload---"
xcrun altool --upload-app \
  -f /tmp/glovebox-37-export/App.ipa \
  -t ios \
  --apiKey R8P6K38X47 \
  --apiIssuer 4b45186b-49e4-4a25-8a63-afd28cf12d3f 2>&1 | tail -15
