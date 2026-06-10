#!/bin/bash
set -e
cd ~/Desktop/projects/roam-frontend
security unlock-keychain -p 'xve24085ehi' ~/Library/Keychains/login.keychain-db
rm -rf /tmp/glovebox-37.xcarchive
xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -archivePath /tmp/glovebox-37.xcarchive \
  -destination "generic/platform=iOS" \
  archive \
  -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_R8P6K38X47.p8 \
  -authenticationKeyID R8P6K38X47 \
  -authenticationKeyIssuerID 4b45186b-49e4-4a25-8a63-afd28cf12d3f \
  DEVELOPMENT_TEAM=86PUY7393S \
  CODE_SIGN_STYLE=Automatic 2>&1 | tail -30
