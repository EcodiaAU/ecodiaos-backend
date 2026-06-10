# Ecodia Native iOS App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [2026-05-19-ecodia-native-ios-app-design.md](../specs/2026-05-19-ecodia-native-ios-app-design.md)

**Goal:** Ship a single-user, Tate-only iOS app that replaces SMS as Tate's inbound channel to EcodiaOS and exercises the full Apple native surface (Live Activities, App Intents, Share Ext, Widget, SwiftData, Background Tasks). Distribution via TestFlight.

**Architecture:** iOS app is a third channel adapter alongside `smsWebhook.js` and `webhooks/telegram-bot.js`. All decision logic lives in existing `headlessConductor.js`. New backend = `routes/native.js` + 5 services under `services/native/` + 1 status_board column. Outbound goes through universal `notifyTate` service exposed as `notify_tate` EXECUTE_TOOL on the headless conductor.

**Tech Stack:** Swift 5.10, SwiftUI, `@Observable`, URLSession + async/await, SwiftData, ActivityKit, WidgetKit, AppIntents, BackgroundTasks. Backend in Node.js extending existing EcodiaOS backend at `/Users/ecodia/.code/ecodiaos/backend/`. New iOS repo at `D:/.code/ecodia-native/`.

**Coord contract:** Headless-conductor chat owns envelope schema updates (channel enum + `media[]`→`attachments[]` rename), transport extraction to `services/transports/`, wiring `notify_tate`/`live_activity_update`/`set_tate_priority` into `EXECUTE_TOOLS`, triage system prompt updates, router-side auto-baseline Live Activity pushes, and `_loadTurnContext` switch to filter on `tate_priority`. Their work is gated on signatures defined in this plan.

**Commit cadence:** TDD where tests are tractable, frequent commits, never amend, push to `main` per `solo-fork-pushes-to-main-no-pr-ceremony` pattern. iOS repo commits use `git` from `D:/.code/ecodia-native/`. Backend commits from `/Users/ecodia/.code/ecodiaos/backend/`.

**Em-dash discipline:** the character `U+2014` does not appear in any output. Use `-` or restructure. Validate via `grep -c "—" <file>` returning 0 before every commit.

---

## Phase 0 - Project Bootstrap

### Task 0.1: Create new iOS repo and initial scaffolding

**Files:**
- Create: `D:/.code/ecodia-native/.gitignore`
- Create: `D:/.code/ecodia-native/README.md`

- [ ] **Step 1: Create directory and init git**

```powershell
New-Item -ItemType Directory -Path D:/.code/ecodia-native
cd D:/.code/ecodia-native
git init
git branch -M main
```

- [ ] **Step 2: Write `.gitignore`**

Write file `D:/.code/ecodia-native/.gitignore`:
```
# macOS
.DS_Store

# Xcode
build/
*.pbxuser
*.mode1v3
*.mode2v3
*.perspectivev3
xcuserdata/
*.xcuserstate
*.xcscmblueprint
*.xccheckout
DerivedData/

# CocoaPods (we are not using it, but block it from accidental adds)
Pods/

# Swift Package Manager
.swiftpm/
.build/
Packages/
Package.pins
Package.resolved
*.xcodeproj/project.xcworkspace/
*.xcodeproj/xcuserdata/

# Fastlane / signing
*.mobileprovision
*.p12
*.p8
*.cer

# Local env
.env
.env.local

# Logs
*.log
```

- [ ] **Step 3: Write minimal `README.md`**

Write file `D:/.code/ecodia-native/README.md`:
```markdown
# ecodia-native

Single-user iOS app for Tate. Replaces SMS as inbound channel to EcodiaOS.

See full design spec: `/Users/ecodia/.code/ecodiaos/backend/docs/specs/2026-05-19-ecodia-native-ios-app-design.md`
Implementation plan: `/Users/ecodia/.code/ecodiaos/backend/docs/plans/2026-05-19-ecodia-native-ios-app.md`

Distribution: TestFlight via Apple Dev team `code@ecodia.au`.
```

- [ ] **Step 4: Commit**

```powershell
cd D:/.code/ecodia-native
git add .gitignore README.md
git commit -m "init(ecodia-native): repo bootstrap"
```

---

### Task 0.2: Create remote, push, set upstream

**Files:**
- None (remote-only)

- [ ] **Step 1: Create remote repo on GitHub via gh CLI**

```powershell
cd D:/.code/ecodia-native
gh repo create EcodiaTate/ecodia-native --private --source=. --remote=origin --description "Single-user iOS native app for Tate. Replaces SMS inbound to EcodiaOS."
```

Expected: gh creates repo, sets `origin`, returns URL.

- [ ] **Step 2: Push**

```powershell
git push -u origin main
```

Expected: branch tracks `origin/main`.

---

### Task 0.3: Generate `tate_native_app_bearer` credential

**Files:**
- None (kv_store write only)

- [ ] **Step 1: Generate random 64-char hex string**

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$bearer = -join ($bytes | ForEach-Object { $_.ToString("x2") })
Write-Host $bearer
```

Save the output (you'll need it for kv_store write and for first-launch onboarding).

- [ ] **Step 2: Write to kv_store via ecodia-full MCP**

Call `mcp__ecodia-full__kv_store_set`:
```json
{
  "key": "creds.tate_native_app_bearer",
  "value": "<64-hex-from-step-1>"
}
```

Expected: ok response.

- [ ] **Step 3: Verify**

Call `mcp__ecodia-full__kv_store_get`:
```json
{"key": "creds.tate_native_app_bearer"}
```

Expected: returns the same 64-hex string.

- [ ] **Step 4: Document in secrets registry**

Create file `/Users/ecodia/.code/ecodiaos/backend/docs/secrets/tate-native-app-bearer.md`:
```markdown
---
triggers: tate-native-app, native-bearer, ios-app-auth, /api/native, ecodia-native-ios
---

# tate_native_app_bearer

**kv_store key:** `creds.tate_native_app_bearer`
**Format:** 64-char hex
**Scope:** `/api/native/*` routes only
**Consumer:** iOS Keychain (single device: Tate's iPhone)
**Rotation:** cheap - regenerate, kv_store_set, re-onboard device via first-launch paste

## Surfaces

- `/Users/ecodia/.code/ecodiaos/backend/src/routes/native.js` (auth middleware)
- iOS Keychain at access group `group.au.ecodia.native`
- Widget extension reads via shared Keychain access group

## Rotation procedure

1. Regenerate via `[System.Security.Cryptography.RandomNumberGenerator]` (see Step 1)
2. `kv_store_set creds.tate_native_app_bearer <new-bearer>`
3. Open iOS app, trigger re-onboard flow (Settings -> Re-paste bearer)
4. Verify roundtrip: send a message, confirm 200 from `/api/native/inbound`
```

- [ ] **Step 5: Commit secrets doc**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
git add docs/secrets/tate-native-app-bearer.md
git commit -m "docs(secrets): tate_native_app_bearer registry entry for ecodia-native"
```

---

### Task 0.4: Create APNs auth key on Apple Developer portal

**Files:**
- None (Apple Dev portal flow)

- [ ] **Step 1: Open Apple Dev portal via Chrome CDP**

Use the `apple-dev-apns-auth-key-create-recipe.md` pattern. Drive the flow via `cdp.*` + `gui.*` on the Corazon laptop-agent at `http://localhost:7456`.

```
gui.enable_chrome_cdp
gui.open_url url="https://developer.apple.com/account/resources/authkeys/add" newTab:true
```

- [ ] **Step 2: Create the key**

Per recipe:
- Key Name: `EcodiaNativeAPNs2026-05`
- Check `Apple Push Notifications service (APNs)`
- Click `Continue` -> `Register`
- Download the `.p8` file

The download lands in `~/Downloads/AuthKey_<KEY_ID>.p8` on Corazon.

- [ ] **Step 3: Capture Key ID and Team ID**

After Register, Apple shows the Key ID (10-char alphanumeric). Capture via screenshot or copy-text:
```
cdp.findVisible text="Key ID"
```

Team ID is visible at `https://developer.apple.com/account` top-right; read via `cdp.findVisible`.

- [ ] **Step 4: Write to kv_store**

```json
mcp__ecodia-full__kv_store_set {
  "key": "creds.apple_apns_auth_key",
  "value": "<contents of AuthKey_*.p8 file, base64-encoded>"
}

mcp__ecodia-full__kv_store_set {
  "key": "creds.apple_apns_key_id",
  "value": "<10-char KEY_ID>"
}

mcp__ecodia-full__kv_store_set {
  "key": "creds.apple_apns_team_id",
  "value": "<10-char TEAM_ID>"
}
```

- [ ] **Step 5: Document in secrets registry**

Create `/Users/ecodia/.code/ecodiaos/backend/docs/secrets/apple-apns-auth-key.md` with triggers `apns, apple-push, ios-push, ecodia-native-push`, kv keys listed, rotation procedure.

- [ ] **Step 6: Commit doc**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
git add docs/secrets/apple-apns-auth-key.md
git commit -m "docs(secrets): APNs auth key registry entry"
```

---

### Task 0.5: Create ASC app record

**Files:**
- None (App Store Connect flow)

- [ ] **Step 1: Apply `asc-app-record-create-recipe.md`**

Drive Chrome to `https://appstoreconnect.apple.com/apps` via `gui.open_url`. Login should be persistent in Tate's Chrome session.

- [ ] **Step 2: Create the record**

Click `+ -> New App`. Fields:
- Platform: iOS
- Name: `Ecodia Native`
- Primary Language: English (U.K.)
- Bundle ID: `au.ecodia.native` (will need to be registered in Apple Dev portal first if not present)
- SKU: `ecodia-native-001`
- User Access: Limited

Click `Create`.

- [ ] **Step 3: Register bundle IDs if needed**

If bundle ID is not in the dropdown, register via `https://developer.apple.com/account/resources/identifiers/list`:
- `au.ecodia.native` (App ID, Explicit, capabilities: Push Notifications, App Groups, BackgroundModes)
- `au.ecodia.native.widget` (App ID, Explicit, capabilities: App Groups)
- `au.ecodia.native.share` (App ID, Explicit, capabilities: App Groups)

- [ ] **Step 4: Create App Group**

In Apple Dev portal -> Identifiers -> Group IDs:
- ID: `group.au.ecodia.native`
- Description: `Ecodia Native App Group`

- [ ] **Step 5: Update provisioning profiles**

Force regeneration of provisioning profiles for the three App IDs above with App Group enabled.

- [ ] **Step 6: Set up internal TestFlight group**

In ASC -> Ecodia Native -> TestFlight -> Internal Testing:
- Create group: `Tate Only`
- Add `tatedonohoe@gmail.com` as tester

---

### Task 0.6: Create Xcode project + EcodiaCore Swift package

**Files:**
- Create: `D:/.code/ecodia-native/EcodiaNative.xcodeproj/`
- Create: `D:/.code/ecodia-native/EcodiaCore/Package.swift`
- Create: `D:/.code/ecodia-native/EcodiaApp/EcodiaApp.swift`
- Create: `D:/.code/ecodia-native/EcodiaApp/Info.plist`
- Create: `D:/.code/ecodia-native/EcodiaApp/EcodiaApp.entitlements`

NOTE: Xcode project creation requires macOS. This task runs on SY094 via SSH OR via RDP per `macincloud-substrate-selection-ssh-vs-rdp.md`. The repo lives on Corazon at `D:/.code/ecodia-native/` and is git-synced; SY094 clones it for build steps.

- [ ] **Step 1: Clone repo on SY094**

```bash
ssh tate@<sy094-tailscale-ip>
cd ~
git clone https://github.com/EcodiaTate/ecodia-native.git
cd ecodia-native
```

- [ ] **Step 2: Open Xcode (via RDP - SSH cannot drive Xcode UI)**

Per `macincloud-substrate-selection-ssh-vs-rdp.md`, Xcode project creation is GUI-bound. RDP into SY094 via the `MacinCloud_Full_Screen.rdp` shortcut on Corazon desktop.

- [ ] **Step 3: Create iOS App project in Xcode**

In Xcode -> File -> New -> Project -> iOS -> App:
- Product Name: `EcodiaApp`
- Team: `Ecodia Pty Ltd` (code@ecodia.au team)
- Organization Identifier: `au.ecodia`
- Interface: SwiftUI
- Language: Swift
- Storage: None (we add SwiftData manually)
- Save in: `~/ecodia-native/`

This creates `EcodiaApp/` at the repo root.

- [ ] **Step 4: Add Swift Package "EcodiaCore" to the project**

In Xcode -> File -> New -> Package:
- Name: `EcodiaCore`
- Save in: `~/ecodia-native/`
- Add to: `EcodiaNative` workspace

This creates `EcodiaCore/` with `Package.swift`. Overwrite `EcodiaCore/Package.swift`:

```swift
// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "EcodiaCore",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "EcodiaCore", targets: ["EcodiaCore"]),
    ],
    targets: [
        .target(name: "EcodiaCore", path: "Sources/EcodiaCore"),
        .testTarget(name: "EcodiaCoreTests", dependencies: ["EcodiaCore"], path: "Tests/EcodiaCoreTests"),
    ]
)
```

- [ ] **Step 5: Make EcodiaApp depend on EcodiaCore**

In Xcode -> EcodiaApp target -> General -> Frameworks, Libraries, and Embedded Content -> + -> `EcodiaCore` (local package).

- [ ] **Step 6: Configure EcodiaApp signing + capabilities**

Target EcodiaApp -> Signing & Capabilities:
- Team: `Ecodia Pty Ltd`
- Bundle Identifier: `au.ecodia.native`
- Add capability: Push Notifications
- Add capability: App Groups -> select `group.au.ecodia.native`
- Add capability: Background Modes -> check `Remote notifications`, `Background fetch`, `Background processing`

This creates `EcodiaApp/EcodiaApp.entitlements`.

- [ ] **Step 7: Build to verify**

```bash
cd ~/ecodia-native
xcodebuild -scheme EcodiaApp -destination 'platform=iOS Simulator,name=iPhone 15' build
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 8: Commit**

```bash
cd ~/ecodia-native
git add .
git commit -m "init(xcode): EcodiaApp + EcodiaCore package, signing, capabilities"
git push origin main
```

- [ ] **Step 9: Pull on Corazon**

```powershell
cd D:/.code/ecodia-native
git pull
```

---

## Phase 1 - Core SMS Replacement

Phase-1 goal: Tate types in app, headless triage receives, reply arrives as APNs push. Twilio out of the happy path.

### Task 1.1: Backend - new auth middleware for `/api/native/*`

**Files:**
- Create: `/Users/ecodia/.code/ecodiaos/backend/src/middleware/nativeAuth.js`
- Test: `/Users/ecodia/.code/ecodiaos/backend/tests/nativeAuth.test.js`

- [ ] **Step 1: Write the failing test**

Write file `/Users/ecodia/.code/ecodiaos/backend/tests/nativeAuth.test.js`:

```javascript
const test = require('node:test')
const assert = require('node:assert')
const { nativeAuth } = require('../src/middleware/nativeAuth')

function mockReq(headers) { return { headers } }
function mockRes() {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

test('rejects missing Authorization', async () => {
  const req = mockReq({})
  const res = mockRes()
  let nextCalled = false
  await nativeAuth(req, res, () => { nextCalled = true })
  assert.strictEqual(res.statusCode, 401)
  assert.strictEqual(nextCalled, false)
})

test('rejects wrong bearer', async () => {
  const req = mockReq({ authorization: 'Bearer wrong-bearer' })
  const res = mockRes()
  let nextCalled = false
  await nativeAuth(req, res, () => { nextCalled = true })
  assert.strictEqual(res.statusCode, 401)
  assert.strictEqual(nextCalled, false)
})

test('accepts correct bearer', async () => {
  const req = mockReq({ authorization: `Bearer ${process.env.TEST_NATIVE_BEARER}` })
  const res = mockRes()
  let nextCalled = false
  await nativeAuth(req, res, () => { nextCalled = true })
  assert.strictEqual(nextCalled, true)
})
```

- [ ] **Step 2: Run test, expect failure**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
node --test tests/nativeAuth.test.js
```

Expected: FAIL (`nativeAuth` not defined).

- [ ] **Step 3: Implement**

Write file `/Users/ecodia/.code/ecodiaos/backend/src/middleware/nativeAuth.js`:

```javascript
const { kvStoreGet } = require('../services/kvStore')

let cachedBearer = null
let cachedAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000

async function getBearer() {
  const now = Date.now()
  if (cachedBearer && now - cachedAt < CACHE_TTL_MS) return cachedBearer
  const v = process.env.TEST_NATIVE_BEARER || await kvStoreGet('creds.tate_native_app_bearer')
  cachedBearer = v
  cachedAt = now
  return v
}

async function nativeAuth(req, res, next) {
  const auth = req.headers.authorization || req.headers.Authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_bearer' })
  }
  const presented = auth.slice('Bearer '.length).trim()
  const expected = await getBearer()
  if (!expected || presented !== expected) {
    return res.status(401).json({ error: 'invalid_bearer' })
  }
  return next()
}

module.exports = { nativeAuth }
```

- [ ] **Step 4: Run test, expect pass**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
$env:TEST_NATIVE_BEARER = 'test-bearer-abc'
node --test tests/nativeAuth.test.js
Remove-Item Env:TEST_NATIVE_BEARER
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
git add src/middleware/nativeAuth.js tests/nativeAuth.test.js
git commit -m "feat(native): nativeAuth middleware for /api/native/* bearer gate"
```

---

### Task 1.2: Backend - `services/native/apnsClient.js`

**Files:**
- Create: `/Users/ecodia/.code/ecodiaos/backend/src/services/native/apnsClient.js`
- Test: `/Users/ecodia/.code/ecodiaos/backend/tests/apnsClient.test.js`

- [ ] **Step 1: Add `http2` and `jsonwebtoken` to package.json if missing**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
npm ls jsonwebtoken
```

If not present:
```powershell
npm install jsonwebtoken
```

(`http2` is a Node built-in.)

- [ ] **Step 2: Write the failing test**

Write file `/Users/ecodia/.code/ecodiaos/backend/tests/apnsClient.test.js`:

```javascript
const test = require('node:test')
const assert = require('node:assert')
const { buildJwt, buildAlertPayload, buildBackgroundPayload, buildActivityPayload, urgencyToInterruptionLevel } = require('../src/services/native/apnsClient')

test('urgency maps to interruption-level', () => {
  assert.strictEqual(urgencyToInterruptionLevel('routine'), 'passive')
  assert.strictEqual(urgencyToInterruptionLevel('alert'), 'active')
  assert.strictEqual(urgencyToInterruptionLevel('critical'), 'time-sensitive')
})

test('alert payload includes aps.alert.body and interruption-level', () => {
  const p = buildAlertPayload({ body: 'hello', urgency: 'alert', message_id: 'm1' })
  assert.deepStrictEqual(p.aps.alert, { body: 'hello' })
  assert.strictEqual(p.aps['interruption-level'], 'active')
  assert.strictEqual(p.message_id, 'm1')
})

test('background payload is content-available only', () => {
  const p = buildBackgroundPayload({ payload: { kind: 'refresh' } })
  assert.strictEqual(p.aps['content-available'], 1)
  assert.deepStrictEqual(p.payload, { kind: 'refresh' })
  assert.strictEqual(p.aps.alert, undefined)
})

test('activity payload includes event and content-state', () => {
  const p = buildActivityPayload({ event: 'update', contentState: { state: 'thinking' }, body: 'probing' })
  assert.strictEqual(p.aps.event, 'update')
  assert.deepStrictEqual(p.aps['content-state'], { state: 'thinking' })
  assert.strictEqual(p.aps.alert.body, 'probing')
})

test('buildJwt produces a header.payload.signature string', () => {
  const fakeKey = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgevZzL1gdAFr88hb2
OF/2NxApJCzGCEDdfSp6VQO30hyhRANCAAQRWz+jn65BtOMvdyHKcvjBeBSDZH2r
1RTwjmYSi9R/zpBnuQ4EiMnCqfMPWiZqB4QdbAd0E7oH50VpuZ1P087G
-----END PRIVATE KEY-----`
  const jwt = buildJwt({ p8Pem: fakeKey, keyId: 'ABC1234567', teamId: 'XYZ7654321' })
  assert.match(jwt, /^[\w-]+\.[\w-]+\.[\w-]+$/)
})
```

- [ ] **Step 3: Run test, expect failure**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
node --test tests/apnsClient.test.js
```

Expected: FAIL (module not found).

- [ ] **Step 4: Implement**

Write file `/Users/ecodia/.code/ecodiaos/backend/src/services/native/apnsClient.js`:

```javascript
const http2 = require('node:http2')
const jwt = require('jsonwebtoken')
const { kvStoreGet } = require('../kvStore')

const APNS_HOST = process.env.APNS_HOST || 'https://api.push.apple.com'
const BUNDLE_ID = 'au.ecodia.native'

let cachedKey = null
let cachedJwt = null
let cachedJwtAt = 0
const JWT_TTL_MS = 50 * 60 * 1000

let client = null

function urgencyToInterruptionLevel(urgency) {
  switch (urgency) {
    case 'critical': return 'time-sensitive'
    case 'alert': return 'active'
    case 'routine':
    default: return 'passive'
  }
}

function buildAlertPayload({ body, urgency = 'alert', message_id, deep_link }) {
  return {
    aps: {
      alert: { body },
      'interruption-level': urgencyToInterruptionLevel(urgency),
      sound: urgency === 'critical' ? 'default' : undefined,
    },
    message_id,
    deep_link,
  }
}

function buildBackgroundPayload({ payload }) {
  return {
    aps: { 'content-available': 1 },
    payload,
  }
}

function buildActivityPayload({ event, contentState, body, dismissalDate }) {
  return {
    aps: {
      event,
      'content-state': contentState,
      timestamp: Math.floor(Date.now() / 1000),
      alert: body ? { body } : undefined,
      'dismissal-date': dismissalDate,
    },
  }
}

function buildJwt({ p8Pem, keyId, teamId }) {
  return jwt.sign({}, p8Pem, {
    algorithm: 'ES256',
    issuer: teamId,
    expiresIn: '50m',
    header: { alg: 'ES256', kid: keyId },
  })
}

async function getJwt() {
  const now = Date.now()
  if (cachedJwt && now - cachedJwtAt < JWT_TTL_MS) return cachedJwt
  if (!cachedKey) {
    const p8Base64 = await kvStoreGet('creds.apple_apns_auth_key')
    const keyId = await kvStoreGet('creds.apple_apns_key_id')
    const teamId = await kvStoreGet('creds.apple_apns_team_id')
    cachedKey = {
      p8Pem: Buffer.from(p8Base64, 'base64').toString('utf8'),
      keyId,
      teamId,
    }
  }
  cachedJwt = buildJwt(cachedKey)
  cachedJwtAt = now
  return cachedJwt
}

function getClient() {
  if (client && !client.destroyed) return client
  client = http2.connect(APNS_HOST)
  client.on('error', (e) => { console.error('[apnsClient] http2 error', e); client = null })
  return client
}

async function push({ deviceToken, payload, topic = BUNDLE_ID, pushType = 'alert', priority = 10, expiration = 0 }) {
  const jwtToken = await getJwt()
  const c = getClient()
  return new Promise((resolve, reject) => {
    const req = c.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      'authorization': `bearer ${jwtToken}`,
      'apns-topic': topic,
      'apns-push-type': pushType,
      'apns-priority': String(priority),
      'apns-expiration': String(expiration),
      'content-type': 'application/json',
    })
    let status = 0
    let body = ''
    req.on('response', (headers) => { status = headers[':status'] })
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {}
        resolve({ status, body: parsed })
      } catch (e) {
        resolve({ status, body: { raw: body } })
      }
    })
    req.on('error', reject)
    req.end(JSON.stringify(payload))
  })
}

module.exports = {
  push,
  buildJwt,
  buildAlertPayload,
  buildBackgroundPayload,
  buildActivityPayload,
  urgencyToInterruptionLevel,
}
```

- [ ] **Step 5: Run test, expect pass**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
node --test tests/apnsClient.test.js
```

Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
git add src/services/native/apnsClient.js tests/apnsClient.test.js package.json package-lock.json
git commit -m "feat(native): apnsClient with HTTP/2 + JWT + alert/background/activity payload builders"
```

---

### Task 1.3: Backend - `services/native/deviceState.js`

**Files:**
- Create: `/Users/ecodia/.code/ecodiaos/backend/src/services/native/deviceState.js`
- Test: `/Users/ecodia/.code/ecodiaos/backend/tests/deviceState.test.js`

- [ ] **Step 1: Write the failing test**

Write file `/Users/ecodia/.code/ecodiaos/backend/tests/deviceState.test.js`:

```javascript
const test = require('node:test')
const assert = require('node:assert')

const fakeKv = new Map()
const kvStub = {
  kvStoreGet: async (k) => fakeKv.get(k) ?? null,
  kvStoreSet: async (k, v) => { fakeKv.set(k, v) },
}

require.cache[require.resolve('../src/services/kvStore')] = { exports: kvStub }
const ds = require('../src/services/native/deviceState')

test('pickChannel mirrors recent inbound channel within 60min', async () => {
  fakeKv.clear()
  await ds.recordInbound({ channel: 'sms', at: new Date().toISOString() })
  const c = await ds.pickChannel()
  assert.strictEqual(c, 'sms')
})

test('pickChannel returns native when APNs token recent and no recent inbound', async () => {
  fakeKv.clear()
  await ds.registerApnsToken({ token: 'abc' })
  await ds.recordApnsDelivery({ ok: true, at: new Date().toISOString() })
  const c = await ds.pickChannel()
  assert.strictEqual(c, 'native')
})

test('pickChannel falls back to sms when no APNs and no recent inbound', async () => {
  fakeKv.clear()
  const c = await ds.pickChannel()
  assert.strictEqual(c, 'sms')
})

test('pickChannel never returns telegram from auto', async () => {
  fakeKv.clear()
  await ds.recordInbound({ channel: 'telegram', at: new Date().toISOString() })
  // last inbound was tg but auto must NOT pick tg unless explicit
  const c = await ds.pickChannel()
  assert.notStrictEqual(c, 'telegram')
})
```

- [ ] **Step 2: Run test, expect failure**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
node --test tests/deviceState.test.js
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Write file `/Users/ecodia/.code/ecodiaos/backend/src/services/native/deviceState.js`:

```javascript
const { kvStoreGet, kvStoreSet } = require('../kvStore')

const KEY = 'cowork.native.device_state.tate'
const INBOUND_RECENCY_MIN = 60
const APNS_RECENCY_HOURS = 24

async function read() {
  return (await kvStoreGet(KEY)) || {}
}
async function write(state) {
  await kvStoreSet(KEY, state)
}

async function registerApnsToken({ token, app_version, ios_version }) {
  const s = await read()
  s.apns_token = token
  s.apns_token_registered_at = new Date().toISOString()
  if (app_version) s.app_version = app_version
  if (ios_version) s.ios_version = ios_version
  await write(s)
  return { ok: true }
}

async function recordApnsDelivery({ ok, at = new Date().toISOString() }) {
  const s = await read()
  if (ok) s.last_apns_delivery_success_at = at
  else s.last_apns_delivery_failure_at = at
  await write(s)
}

async function recordInbound({ channel, at = new Date().toISOString() }) {
  const s = await read()
  s.last_inbound_channel = channel
  s.last_inbound_at = at
  await write(s)
}

function minutesSince(iso) {
  if (!iso) return Infinity
  return (Date.now() - new Date(iso).getTime()) / 60000
}
function hoursSince(iso) { return minutesSince(iso) / 60 }

async function pickChannel() {
  const s = await read()
  if (s.last_inbound_channel && s.last_inbound_channel !== 'telegram' && minutesSince(s.last_inbound_at) < INBOUND_RECENCY_MIN) {
    return s.last_inbound_channel
  }
  if (s.apns_token && hoursSince(s.last_apns_delivery_success_at) < APNS_RECENCY_HOURS) {
    return 'native'
  }
  return 'sms'
}

module.exports = { registerApnsToken, recordApnsDelivery, recordInbound, pickChannel, read }
```

- [ ] **Step 4: Run test, expect pass**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
node --test tests/deviceState.test.js
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
git add src/services/native/deviceState.js tests/deviceState.test.js
git commit -m "feat(native): deviceState service with auto channel-pick policy"
```

---

### Task 1.4: Backend - `services/native/notifyTate.js`

**Files:**
- Create: `/Users/ecodia/.code/ecodiaos/backend/src/services/native/notifyTate.js`
- Test: `/Users/ecodia/.code/ecodiaos/backend/tests/notifyTate.test.js`

GATE: requires `services/transports/smsTransport.js` and `services/transports/telegramTransport.js` extracted by the headless-conductor chat. Until they land, mock with shims and add a TODO-removal step in Task 1.5.

- [ ] **Step 1: Verify transports exist OR add shims**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
Test-Path src/services/transports/smsTransport.js
Test-Path src/services/transports/telegramTransport.js
```

If both `True`: proceed to Step 2.

If either `False`: add shim file(s). Write `/Users/ecodia/.code/ecodiaos/backend/src/services/transports/smsTransport.js`:

```javascript
// SHIM: real implementation pending headless-conductor chat extraction
async function sendSmsToTate({ body }) {
  throw new Error('smsTransport not yet extracted by headless-conductor chat')
}
module.exports = { sendSmsToTate }
```

Same shape for `telegramTransport.js` with `sendTelegramMessage({ chat_id, text })`.

Commit shims separately:
```powershell
git add src/services/transports/
git commit -m "feat(transports): shim files pending headless-conductor extraction"
```

- [ ] **Step 2: Write the failing test**

Write file `/Users/ecodia/.code/ecodiaos/backend/tests/notifyTate.test.js`:

```javascript
const test = require('node:test')
const assert = require('node:assert')

const apnsStub = {
  push: async ({ deviceToken, payload }) => ({ status: 200, body: {} }),
  buildAlertPayload: ({ body }) => ({ aps: { alert: { body } } }),
}
const smsStub = { sendSmsToTate: async ({ body }) => ({ ok: true, sid: 'SM_xxx' }) }
const tgStub = { sendTelegramMessage: async ({ text }) => ({ ok: true, message_id: 1 }) }
const deviceStub = {
  pickChannel: async () => 'native',
  recordApnsDelivery: async () => {},
  read: async () => ({ apns_token: 'abc' }),
}

require.cache[require.resolve('../src/services/native/apnsClient')] = { exports: apnsStub }
require.cache[require.resolve('../src/services/transports/smsTransport')] = { exports: smsStub }
require.cache[require.resolve('../src/services/transports/telegramTransport')] = { exports: tgStub }
require.cache[require.resolve('../src/services/native/deviceState')] = { exports: deviceStub }

const { notifyTate } = require('../src/services/native/notifyTate')

test('channel=native dispatches via APNs', async () => {
  const r = await notifyTate({ body: 'hi', channel: 'native' })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.transport, 'apns')
})

test('channel=sms dispatches via smsTransport', async () => {
  const r = await notifyTate({ body: 'hi', channel: 'sms' })
  assert.strictEqual(r.transport, 'sms')
})

test('channel=telegram dispatches via telegramTransport', async () => {
  const r = await notifyTate({ body: 'hi', channel: 'telegram' })
  assert.strictEqual(r.transport, 'telegram')
})

test('channel=auto resolves via deviceState.pickChannel', async () => {
  const r = await notifyTate({ body: 'hi', channel: 'auto' })
  assert.strictEqual(r.transport, 'apns')
})

test('APNs failure falls back to SMS on native channel', async () => {
  apnsStub.push = async () => ({ status: 410, body: { reason: 'BadDeviceToken' } })
  const r = await notifyTate({ body: 'hi', channel: 'native' })
  assert.strictEqual(r.transport, 'sms')
})
```

- [ ] **Step 3: Run test, expect failure**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
node --test tests/notifyTate.test.js
```

Expected: FAIL.

- [ ] **Step 4: Implement**

Write file `/Users/ecodia/.code/ecodiaos/backend/src/services/native/notifyTate.js`:

```javascript
const apns = require('./apnsClient')
const { sendSmsToTate } = require('../transports/smsTransport')
const { sendTelegramMessage } = require('../transports/telegramTransport')
const deviceState = require('./deviceState')
const { kvStoreGet } = require('../kvStore')
const crypto = require('node:crypto')

const TG_CHAT_KEY = 'creds.telegram_bot'

async function viaApns({ body, urgency, deep_link }) {
  const ds = await deviceState.read()
  if (!ds.apns_token) return { ok: false, reason: 'no_apns_token' }
  const message_id = crypto.randomUUID()
  const payload = apns.buildAlertPayload({ body, urgency, message_id, deep_link })
  const resp = await apns.push({ deviceToken: ds.apns_token, payload, pushType: 'alert' })
  if (resp.status === 200) {
    await deviceState.recordApnsDelivery({ ok: true })
    return { ok: true, transport: 'apns', message_id }
  }
  await deviceState.recordApnsDelivery({ ok: false })
  return { ok: false, reason: `apns_${resp.status}`, body: resp.body, message_id }
}

async function viaSms({ body }) {
  const r = await sendSmsToTate({ body, append_to_mirror: true })
  return { ok: r.ok, transport: 'sms', message_id: r.sid }
}

async function viaTelegram({ body }) {
  const cfg = await kvStoreGet(TG_CHAT_KEY)
  const chat_id = cfg?.allowed_user_ids?.[0]
  if (!chat_id) return { ok: false, reason: 'no_telegram_chat_id' }
  const r = await sendTelegramMessage({ chat_id, text: body, append_to_mirror: true })
  return { ok: r.ok, transport: 'telegram', message_id: String(r.message_id) }
}

async function notifyTate({ body, urgency = 'alert', channel = 'auto', thread_id, deep_link }) {
  let effectiveChannel = channel
  if (channel === 'auto') effectiveChannel = await deviceState.pickChannel()

  if (effectiveChannel === 'native') {
    const r = await viaApns({ body, urgency, deep_link })
    if (r.ok) return r
    return viaSms({ body })
  }
  if (effectiveChannel === 'sms') return viaSms({ body })
  if (effectiveChannel === 'telegram') return viaTelegram({ body })
  return { ok: false, reason: `unknown_channel_${effectiveChannel}` }
}

module.exports = { notifyTate, viaApns, viaSms, viaTelegram }
```

- [ ] **Step 5: Run test, expect pass**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
node --test tests/notifyTate.test.js
```

Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
git add src/services/native/notifyTate.js tests/notifyTate.test.js
git commit -m "feat(native): notifyTate universal outbound dispatcher (native/sms/telegram/auto + fallback)"
```

---

### Task 1.5: Backend - `routes/native.js` (4 endpoints for Phase 1)

**Files:**
- Create: `/Users/ecodia/.code/ecodiaos/backend/src/routes/native.js`
- Modify: `/Users/ecodia/.code/ecodiaos/backend/src/app.js` (mount route)
- Test: `/Users/ecodia/.code/ecodiaos/backend/tests/routes.native.test.js`

- [ ] **Step 1: Write the failing route test**

Write file `/Users/ecodia/.code/ecodiaos/backend/tests/routes.native.test.js`:

```javascript
const test = require('node:test')
const assert = require('node:assert')
const express = require('express')
const request = require('supertest')

const routedEnvelopes = []
const routerStub = {
  routeEnvelopeToConductor: async ({ envelope }) => { routedEnvelopes.push(envelope); return { ok: true } },
}
const fakeKv = new Map()
const kvStub = {
  kvStoreGet: async (k) => fakeKv.get(k) ?? null,
  kvStoreSet: async (k, v) => { fakeKv.set(k, v) },
}
const dsStub = {
  registerApnsToken: async (a) => { fakeKv.set('reg', a); return { ok: true } },
  read: async () => ({}),
  recordInbound: async () => {},
}

require.cache[require.resolve('../src/services/inboundConductorRouter')] = { exports: routerStub }
require.cache[require.resolve('../src/services/kvStore')] = { exports: kvStub }
require.cache[require.resolve('../src/services/native/deviceState')] = { exports: dsStub }

process.env.TEST_NATIVE_BEARER = 'test-bearer-abc'
const nativeRouter = require('../src/routes/native')

const app = express()
app.use(express.json())
app.use('/api/native', nativeRouter)

const auth = { Authorization: 'Bearer test-bearer-abc' }

test('POST /inbound 401 without bearer', async () => {
  const r = await request(app).post('/api/native/inbound').send({ body: 'hi' })
  assert.strictEqual(r.statusCode, 401)
})

test('POST /inbound builds envelope and routes to conductor', async () => {
  routedEnvelopes.length = 0
  const r = await request(app).post('/api/native/inbound').set(auth).send({
    body: 'hello ecodia',
    source: 'chat',
    idempotency_key: 'idem-1',
    attachments: [],
    live_activity_push_token: 'lat_xyz',
    metadata: { app_version: '1.0.0', ios_version: '17.4' },
  })
  assert.strictEqual(r.statusCode, 200)
  assert.strictEqual(routedEnvelopes.length, 1)
  const env = routedEnvelopes[0]
  assert.strictEqual(env.channel, 'native')
  assert.strictEqual(env.body, 'hello ecodia')
  assert.strictEqual(env.live_activity_push_token, 'lat_xyz')
})

test('POST /inbound persists raw payload for replay', async () => {
  await request(app).post('/api/native/inbound').set(auth).send({
    body: 'persist me',
    source: 'chat',
    idempotency_key: 'idem-2',
  })
  assert.notStrictEqual(fakeKv.get('cowork.inbound_raw.idem-2'), undefined)
})

test('POST /inbound writes live_activity_push_token to kv on receipt', async () => {
  fakeKv.delete('cowork.native.live_activity_token.tate')
  await request(app).post('/api/native/inbound').set(auth).send({
    body: 'la check',
    source: 'chat',
    idempotency_key: 'idem-3',
    live_activity_push_token: 'lat_zzz',
  })
  const stored = fakeKv.get('cowork.native.live_activity_token.tate')
  assert.strictEqual(stored.token, 'lat_zzz')
  assert.strictEqual(stored.envelope_idempotency_key, 'idem-3')
})

test('POST /devices/register stores token', async () => {
  const r = await request(app).post('/api/native/devices/register').set(auth).send({
    apns_token: 'apns_abc',
    app_version: '1.0.0',
    ios_version: '17.4',
  })
  assert.strictEqual(r.statusCode, 200)
  assert.strictEqual(fakeKv.get('reg').token, 'apns_abc')
})

test('GET /recent returns curated messages from mirror', async () => {
  fakeKv.set('cowork.message_thread.native.tate', {
    messages: [
      { id: 'm1', direction: 'in', text: 'a', ts: '2026-05-19T00:00:00Z', source: 'chat' },
      { id: 'm2', direction: 'out', text: 'b', ts: '2026-05-19T00:00:05Z', source: 'chat', _twilio_sid: 'should-be-stripped' },
    ],
  })
  const r = await request(app).get('/api/native/recent').set(auth)
  assert.strictEqual(r.statusCode, 200)
  assert.strictEqual(r.body.messages.length, 2)
  assert.strictEqual(r.body.messages[1]._twilio_sid, undefined)
})

test('POST /messages/:id/ack marks ack in kv', async () => {
  fakeKv.set('cowork.message_thread.native.tate', { messages: [{ id: 'mAck', direction: 'in', text: 'x', ts: 't' }] })
  const r = await request(app).post('/api/native/messages/mAck/ack').set(auth).send({})
  assert.strictEqual(r.statusCode, 200)
  const stored = fakeKv.get('cowork.message_thread.native.tate')
  assert.strictEqual(stored.messages[0].acked, true)
})
```

- [ ] **Step 2: Install `supertest` if missing**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
npm ls supertest
```

If missing:
```powershell
npm install --save-dev supertest
```

- [ ] **Step 3: Run test, expect failure**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
node --test tests/routes.native.test.js
```

Expected: FAIL (route not defined).

- [ ] **Step 4: Implement**

Write file `/Users/ecodia/.code/ecodiaos/backend/src/routes/native.js`:

```javascript
const express = require('express')
const { nativeAuth } = require('../middleware/nativeAuth')
const { routeEnvelopeToConductor } = require('../services/inboundConductorRouter')
const { kvStoreGet, kvStoreSet } = require('../services/kvStore')
const deviceState = require('../services/native/deviceState')

const router = express.Router()

router.use(nativeAuth)

const THREAD_KEY = 'cowork.message_thread.native.tate'
const RAW_KEY_PREFIX = 'cowork.inbound_raw.'
const ACTIVITY_TOKEN_KEY = 'cowork.native.live_activity_token.tate'

const CHANNEL_CRUFT_FIELDS = ['_twilio_sid', '_telegram_update_id', 'push_token', 'apns_token', 'internal']

function stripCruft(msg) {
  const out = { ...msg }
  for (const f of CHANNEL_CRUFT_FIELDS) delete out[f]
  return out
}

router.post('/inbound', async (req, res) => {
  const { body = '', source = 'chat', idempotency_key, attachments = [], live_activity_push_token, metadata = {} } = req.body || {}
  if (!idempotency_key) return res.status(400).json({ error: 'missing_idempotency_key' })

  await kvStoreSet(RAW_KEY_PREFIX + idempotency_key, { received_at: new Date().toISOString(), payload: req.body })

  if (live_activity_push_token) {
    await kvStoreSet(ACTIVITY_TOKEN_KEY, {
      token: live_activity_push_token,
      started_at: new Date().toISOString(),
      envelope_idempotency_key: idempotency_key,
    })
  }

  await deviceState.recordInbound({ channel: 'native' })

  const envelope = {
    channel: 'native',
    source,
    thread_id: 'tate',
    idempotency_key,
    body,
    attachments,
    live_activity_push_token: live_activity_push_token || null,
    metadata: { ...metadata, ts: new Date().toISOString() },
  }

  setImmediate(() => {
    routeEnvelopeToConductor({ envelope }).catch(e => console.error('[native/inbound] router error', e))
  })

  return res.status(200).json({ ok: true, idempotency_key })
})

router.post('/devices/register', async (req, res) => {
  const { apns_token, app_version, ios_version } = req.body || {}
  if (!apns_token) return res.status(400).json({ error: 'missing_apns_token' })
  await deviceState.registerApnsToken({ token: apns_token, app_version, ios_version })
  return res.status(200).json({ ok: true })
})

router.get('/recent', async (req, res) => {
  const { since } = req.query
  const mirror = (await kvStoreGet(THREAD_KEY)) || { messages: [] }
  let msgs = mirror.messages.map(stripCruft)
  if (since) {
    const idx = msgs.findIndex(m => m.id === since)
    if (idx >= 0) msgs = msgs.slice(idx + 1)
  }
  const next_cursor = msgs.length ? msgs[msgs.length - 1].id : null
  return res.status(200).json({ messages: msgs, next_cursor })
})

router.post('/messages/:id/ack', async (req, res) => {
  const { id } = req.params
  const mirror = (await kvStoreGet(THREAD_KEY)) || { messages: [] }
  const idx = mirror.messages.findIndex(m => m.id === id)
  if (idx < 0) return res.status(404).json({ error: 'message_not_found' })
  mirror.messages[idx].acked = true
  mirror.messages[idx].acked_at = new Date().toISOString()
  await kvStoreSet(THREAD_KEY, mirror)
  return res.status(200).json({ ok: true })
})

module.exports = router
```

- [ ] **Step 5: Mount in app.js**

Open `/Users/ecodia/.code/ecodiaos/backend/src/app.js`. Find the routes-mounting section (look for `app.use('/api/...`). Add:

```javascript
app.use('/api/native', require('./routes/native'))
```

If `app.js` uses a different mount pattern (check `/Users/ecodia/.code/ecodiaos/backend/src/server.js` or `index.js`), follow the existing convention.

- [ ] **Step 6: Run test, expect pass**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
node --test tests/routes.native.test.js
```

Expected: 7 tests pass.

- [ ] **Step 7: Commit**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
git add src/routes/native.js src/app.js tests/routes.native.test.js
git commit -m "feat(native): /api/native/{inbound,devices/register,recent,messages/:id/ack} routes"
```

---

### Task 1.6: Backend - deploy to VPS, smoke test

**Files:**
- None (deploy + smoke)

- [ ] **Step 1: SSH to VPS and pull**

```powershell
ssh tate@100.103.227.90 "cd ~/ecodiaos && git pull && npm install"
```

- [ ] **Step 2: Restart ecodia-api**

(Per CLAUDE.md: forks must request restart via `pending_restart_requests`. As the main conductor, we have authority.)

```powershell
ssh tate@100.103.227.90 "source ~/.nvm/nvm.sh && pm2 restart ecodia-api"
```

- [ ] **Step 3: Smoke test /api/native/inbound from main**

```powershell
$bearer = "<paste from Task 0.3 step 1>"
curl -X POST https://api.admin.ecodia.au/api/native/inbound `
  -H "Authorization: Bearer $bearer" `
  -H "Content-Type: application/json" `
  -d '{"body":"smoke from main","source":"chat","idempotency_key":"smoke-1"}'
```

Expected: `{"ok": true, "idempotency_key": "smoke-1"}`

- [ ] **Step 4: Verify envelope arrived at conductor**

Wait 10s, then query the thread mirror:

```
mcp__ecodia-full__kv_store_get key="cowork.inbound_raw.smoke-1"
```

Expected: payload present with `received_at` timestamp.

- [ ] **Step 5: Verify auth gate**

```powershell
curl -X POST https://api.admin.ecodia.au/api/native/inbound `
  -H "Authorization: Bearer wrong" `
  -H "Content-Type: application/json" `
  -d '{"body":"should-fail","idempotency_key":"smoke-fail"}'
```

Expected: HTTP 401, `{"error":"invalid_bearer"}`.

---

### Task 1.7: iOS - `BearerStore` in EcodiaCore

**Files:**
- Create: `D:/.code/ecodia-native/EcodiaCore/Sources/EcodiaCore/Keychain/BearerStore.swift`
- Test: `D:/.code/ecodia-native/EcodiaCore/Tests/EcodiaCoreTests/BearerStoreTests.swift`

- [ ] **Step 1: Write the failing test**

Write file `D:/.code/ecodia-native/EcodiaCore/Tests/EcodiaCoreTests/BearerStoreTests.swift`:

```swift
import XCTest
@testable import EcodiaCore

final class BearerStoreTests: XCTestCase {
    let store = BearerStore(service: "test.ecodia.bearer")

    override func setUp() async throws {
        try? store.delete()
    }

    func testStoreAndLoadRoundtrip() throws {
        try store.save("abc-123")
        XCTAssertEqual(try store.load(), "abc-123")
    }

    func testLoadReturnsNilWhenEmpty() throws {
        XCTAssertNil(try store.load())
    }

    func testOverwrite() throws {
        try store.save("first")
        try store.save("second")
        XCTAssertEqual(try store.load(), "second")
    }

    func testDelete() throws {
        try store.save("to-delete")
        try store.delete()
        XCTAssertNil(try store.load())
    }
}
```

- [ ] **Step 2: Run test, expect failure**

```bash
ssh tate@<sy094>
cd ~/ecodia-native
swift test --package-path EcodiaCore
```

Expected: FAIL (BearerStore undefined).

- [ ] **Step 3: Implement**

Write file `D:/.code/ecodia-native/EcodiaCore/Sources/EcodiaCore/Keychain/BearerStore.swift`:

```swift
import Foundation
import Security

public enum BearerStoreError: Error {
    case unhandled(OSStatus)
}

public final class BearerStore {
    private let service: String
    private let account: String

    public init(service: String = "au.ecodia.native.bearer", account: String = "default") {
        self.service = service
        self.account = account
    }

    public func save(_ bearer: String) throws {
        let data = Data(bearer.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: "group.au.ecodia.native",
        ]
        SecItemDelete(query as CFDictionary)
        var addQuery = query
        addQuery[kSecValueData as String] = data
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let status = SecItemAdd(addQuery as CFDictionary, nil)
        guard status == errSecSuccess else { throw BearerStoreError.unhandled(status) }
    }

    public func load() throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: "group.au.ecodia.native",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw BearerStoreError.unhandled(status)
        }
        return String(data: data, encoding: .utf8)
    }

    public func delete() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: "group.au.ecodia.native",
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw BearerStoreError.unhandled(status)
        }
    }
}
```

NOTE: Keychain access groups behave differently in the SwiftPM test bin vs the iOS app target. If tests fail on access-group, drop the `kSecAttrAccessGroup` line conditionally (or run tests only inside the EcodiaApp scheme on simulator). Update test setup with `let store = BearerStore(service: "test.ecodia.bearer", account: "test")` and consider gating access group with `#if !TEST` build flag.

- [ ] **Step 4: Run test, expect pass (on simulator scheme if SwiftPM CLI fails on access group)**

```bash
cd ~/ecodia-native
xcodebuild test -scheme EcodiaApp -destination 'platform=iOS Simulator,name=iPhone 15' -only-testing:EcodiaCoreTests/BearerStoreTests
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd ~/ecodia-native
git add EcodiaCore/Sources EcodiaCore/Tests
git commit -m "feat(core): BearerStore Keychain wrapper with App Group access"
git push origin main
```

---

### Task 1.8: iOS - `EcodiaClient` networking layer in EcodiaCore

**Files:**
- Create: `D:/.code/ecodia-native/EcodiaCore/Sources/EcodiaCore/Networking/EcodiaClient.swift`
- Create: `D:/.code/ecodia-native/EcodiaCore/Sources/EcodiaCore/Networking/EcodiaEndpoint.swift`
- Create: `D:/.code/ecodia-native/EcodiaCore/Sources/EcodiaCore/Models/Message.swift`
- Test: `D:/.code/ecodia-native/EcodiaCore/Tests/EcodiaCoreTests/EcodiaClientTests.swift`

- [ ] **Step 1: Write the failing test**

Write `EcodiaClientTests.swift`:

```swift
import XCTest
@testable import EcodiaCore

final class MockURLProtocol: URLProtocol {
    static var handler: ((URLRequest) -> (HTTPURLResponse, Data))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let (resp, data) = MockURLProtocol.handler?(request) else { return }
        client?.urlProtocol(self, didReceive: resp, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

final class EcodiaClientTests: XCTestCase {
    func makeClient() -> EcodiaClient {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.protocolClasses = [MockURLProtocol.self]
        let session = URLSession(configuration: cfg)
        return EcodiaClient(baseURL: URL(string: "https://api.test")!, bearerProvider: { "test-bearer" }, session: session)
    }

    func testSendMessagePostsCanonicalEnvelope() async throws {
        var capturedBody: Data?
        var capturedAuth: String?
        MockURLProtocol.handler = { req in
            capturedBody = req.httpBody ?? Data()
            capturedAuth = req.value(forHTTPHeaderField: "Authorization")
            let resp = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (resp, "{\"ok\":true,\"idempotency_key\":\"x\"}".data(using: .utf8)!)
        }
        let client = makeClient()
        let r = try await client.sendMessage(body: "hi", source: .chat, attachments: [], liveActivityToken: "lat-1")
        XCTAssertTrue(r.ok)
        let json = try JSONSerialization.jsonObject(with: capturedBody ?? Data()) as! [String: Any]
        XCTAssertEqual(json["body"] as? String, "hi")
        XCTAssertEqual(json["source"] as? String, "chat")
        XCTAssertEqual(json["live_activity_push_token"] as? String, "lat-1")
        XCTAssertNotNil(json["idempotency_key"])
        XCTAssertEqual(capturedAuth, "Bearer test-bearer")
    }

    func testFetchRecentParsesResponse() async throws {
        MockURLProtocol.handler = { req in
            let resp = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let body = """
            {"messages":[{"id":"m1","direction":"in","text":"hi","ts":"2026-05-19T00:00:00Z","source":"chat"}],"next_cursor":"m1"}
            """
            return (resp, body.data(using: .utf8)!)
        }
        let client = makeClient()
        let r = try await client.fetchRecent(since: nil)
        XCTAssertEqual(r.messages.count, 1)
        XCTAssertEqual(r.messages[0].text, "hi")
    }

    func testRegisterDevicePostsToken() async throws {
        var captured: Data?
        MockURLProtocol.handler = { req in
            captured = req.httpBody
            let resp = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (resp, "{\"ok\":true}".data(using: .utf8)!)
        }
        let client = makeClient()
        try await client.registerDevice(apnsToken: "abc", appVersion: "1.0.0", iosVersion: "17.4")
        let json = try JSONSerialization.jsonObject(with: captured ?? Data()) as! [String: Any]
        XCTAssertEqual(json["apns_token"] as? String, "abc")
    }
}
```

- [ ] **Step 2: Write the model**

Write `EcodiaCore/Sources/EcodiaCore/Models/Message.swift`:

```swift
import Foundation

public enum MessageSource: String, Codable, Sendable {
    case chat, share, siri, sms, telegram
}

public enum MessageDirection: String, Codable, Sendable {
    case `in`, out
}

public struct Attachment: Codable, Sendable, Equatable {
    public enum Kind: String, Codable, Sendable { case url, image, file, text, audio, video }
    public let kind: Kind
    public let url: String?
    public let inline: String?
    public let contentType: String?
    public let bytes: Int?
    public let authHint: String?

    enum CodingKeys: String, CodingKey {
        case kind, url, inline
        case contentType = "content_type"
        case bytes
        case authHint = "auth_hint"
    }

    public init(kind: Kind, url: String? = nil, inline: String? = nil, contentType: String? = nil, bytes: Int? = nil, authHint: String? = "supabase_signed") {
        self.kind = kind; self.url = url; self.inline = inline
        self.contentType = contentType; self.bytes = bytes; self.authHint = authHint
    }
}

public struct Message: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public let direction: MessageDirection
    public let text: String
    public let ts: String
    public let source: MessageSource?
    public let attachments: [Attachment]?

    public init(id: String, direction: MessageDirection, text: String, ts: String, source: MessageSource? = nil, attachments: [Attachment]? = nil) {
        self.id = id; self.direction = direction; self.text = text; self.ts = ts; self.source = source; self.attachments = attachments
    }
}

public struct RecentResponse: Codable, Sendable {
    public let messages: [Message]
    public let nextCursor: String?
    enum CodingKeys: String, CodingKey { case messages; case nextCursor = "next_cursor" }
}

public struct InboundResponse: Codable, Sendable {
    public let ok: Bool
    public let idempotencyKey: String?
    enum CodingKeys: String, CodingKey { case ok; case idempotencyKey = "idempotency_key" }
}
```

- [ ] **Step 3: Write the endpoint enum**

Write `EcodiaCore/Sources/EcodiaCore/Networking/EcodiaEndpoint.swift`:

```swift
import Foundation

public enum EcodiaEndpoint {
    case inbound, deviceRegister, recent(since: String?), ack(id: String), tatePriority
    case attachmentSign

    public func url(base: URL) -> URL {
        switch self {
        case .inbound: return base.appendingPathComponent("api/native/inbound")
        case .deviceRegister: return base.appendingPathComponent("api/native/devices/register")
        case .recent(let since):
            var c = URLComponents(url: base.appendingPathComponent("api/native/recent"), resolvingAgainstBaseURL: false)!
            if let s = since { c.queryItems = [.init(name: "since", value: s)] }
            return c.url!
        case .ack(let id): return base.appendingPathComponent("api/native/messages/\(id)/ack")
        case .tatePriority: return base.appendingPathComponent("api/native/tate-priority")
        case .attachmentSign: return base.appendingPathComponent("api/native/attachments/sign")
        }
    }
}
```

- [ ] **Step 4: Implement EcodiaClient**

Write `EcodiaCore/Sources/EcodiaCore/Networking/EcodiaClient.swift`:

```swift
import Foundation

public enum EcodiaClientError: Error {
    case http(Int, String)
    case noBearer
    case decoding(Error)
}

public final class EcodiaClient {
    private let baseURL: URL
    private let bearerProvider: () -> String?
    private let session: URLSession

    public init(baseURL: URL = URL(string: "https://api.admin.ecodia.au")!,
                bearerProvider: @escaping () -> String?,
                session: URLSession = .shared) {
        self.baseURL = baseURL
        self.bearerProvider = bearerProvider
        self.session = session
    }

    private func makeRequest(_ ep: EcodiaEndpoint, method: String, body: [String: Any]? = nil) throws -> URLRequest {
        var req = URLRequest(url: ep.url(base: baseURL))
        req.httpMethod = method
        guard let bearer = bearerProvider() else { throw EcodiaClientError.noBearer }
        req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { req.httpBody = try JSONSerialization.data(withJSONObject: body) }
        return req
    }

    private func send<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, resp) = try await session.data(for: req)
        let http = resp as? HTTPURLResponse
        let status = http?.statusCode ?? 0
        guard (200...299).contains(status) else {
            let s = String(data: data, encoding: .utf8) ?? ""
            throw EcodiaClientError.http(status, s)
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw EcodiaClientError.decoding(error)
        }
    }

    @discardableResult
    public func sendMessage(body: String, source: MessageSource, attachments: [Attachment], liveActivityToken: String?) async throws -> InboundResponse {
        var payload: [String: Any] = [
            "body": body,
            "source": source.rawValue,
            "idempotency_key": UUID().uuidString,
            "attachments": try attachments.map { try $0.asJSON() },
            "metadata": [
                "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0",
                "ios_version": UIDevice.current.systemVersion,
                "ts": ISO8601DateFormatter().string(from: Date()),
            ],
        ]
        if let t = liveActivityToken { payload["live_activity_push_token"] = t }
        let req = try makeRequest(.inbound, method: "POST", body: payload)
        return try await send(req)
    }

    public func fetchRecent(since: String?) async throws -> RecentResponse {
        let req = try makeRequest(.recent(since: since), method: "GET")
        return try await send(req)
    }

    public func registerDevice(apnsToken: String, appVersion: String, iosVersion: String) async throws {
        let body: [String: Any] = [
            "apns_token": apnsToken,
            "app_version": appVersion,
            "ios_version": iosVersion,
        ]
        let req = try makeRequest(.deviceRegister, method: "POST", body: body)
        let _: InboundResponse = try await send(req)
    }

    public func ack(messageId: String) async throws {
        let req = try makeRequest(.ack(id: messageId), method: "POST", body: [:])
        let _: InboundResponse = try await send(req)
    }
}

private extension Attachment {
    func asJSON() throws -> [String: Any] {
        let data = try JSONEncoder().encode(self)
        return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }
}

#if canImport(UIKit)
import UIKit
#else
struct UIDevice { static let current = UIDevice(); var systemVersion: String { "0.0" } }
#endif
```

- [ ] **Step 5: Run tests**

```bash
cd ~/ecodia-native
xcodebuild test -scheme EcodiaApp -destination 'platform=iOS Simulator,name=iPhone 15' -only-testing:EcodiaCoreTests/EcodiaClientTests
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add EcodiaCore/Sources EcodiaCore/Tests
git commit -m "feat(core): EcodiaClient networking + Message models + endpoints"
git push origin main
```

---

### Task 1.9: iOS - OnboardingView (paste bearer on first launch)

**Files:**
- Create: `D:/.code/ecodia-native/EcodiaApp/OnboardingView.swift`
- Modify: `D:/.code/ecodia-native/EcodiaApp/EcodiaApp.swift`

- [ ] **Step 1: Write OnboardingView**

Write `EcodiaApp/OnboardingView.swift`:

```swift
import SwiftUI
import EcodiaCore

struct OnboardingView: View {
    @Binding var hasBearer: Bool
    @State private var pasted = ""
    @State private var error: String?
    private let store = BearerStore()

    var body: some View {
        VStack(spacing: 16) {
            Text("Paste Ecodia bearer")
                .font(.title2.weight(.semibold))
            Text("One-time setup. The bearer is stored in Keychain and never leaves the device.")
                .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            SecureField("64-hex bearer", text: $pasted)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(12)
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            if let error { Text(error).foregroundStyle(.red).font(.footnote) }
            Button("Save") {
                let trimmed = pasted.trimmingCharacters(in: .whitespacesAndNewlines)
                guard trimmed.count == 64, trimmed.allSatisfy({ $0.isHexDigit }) else {
                    error = "Expected 64 hex chars."; return
                }
                do {
                    try store.save(trimmed)
                    hasBearer = true
                } catch { self.error = "Keychain error: \(error)" }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }
}

private extension Character {
    var isHexDigit: Bool { "0123456789abcdefABCDEF".contains(self) }
}
```

- [ ] **Step 2: Update EcodiaApp.swift**

Write `EcodiaApp/EcodiaApp.swift`:

```swift
import SwiftUI
import EcodiaCore

@main
struct EcodiaApp: App {
    @State private var hasBearer: Bool = (try? BearerStore().load()) != nil

    var body: some Scene {
        WindowGroup {
            if hasBearer {
                ChatView()
            } else {
                OnboardingView(hasBearer: $hasBearer)
            }
        }
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add EcodiaApp/OnboardingView.swift EcodiaApp/EcodiaApp.swift
git commit -m "feat(app): first-launch onboarding (paste bearer to Keychain)"
git push origin main
```

---

### Task 1.10: iOS - ChatView + ChatViewModel (minimal send-only)

**Files:**
- Create: `D:/.code/ecodia-native/EcodiaApp/ChatView.swift`
- Create: `D:/.code/ecodia-native/EcodiaApp/ChatViewModel.swift`

- [ ] **Step 1: Write ChatViewModel**

Write `EcodiaApp/ChatViewModel.swift`:

```swift
import Foundation
import EcodiaCore
import Observation

@MainActor
@Observable
final class ChatViewModel {
    var messages: [Message] = []
    var draft: String = ""
    var sending: Bool = false
    var lastError: String?

    private let client: EcodiaClient
    private let store = BearerStore()

    init() {
        let provider = { [unowned self] in (try? self.store.load()) }
        self.client = EcodiaClient(bearerProvider: provider)
    }

    func send() async {
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        sending = true; lastError = nil
        let localId = UUID().uuidString
        messages.append(Message(id: localId, direction: .out, text: body, ts: ISO8601DateFormatter().string(from: Date()), source: .chat))
        draft = ""
        do {
            _ = try await client.sendMessage(body: body, source: .chat, attachments: [], liveActivityToken: nil)
        } catch {
            lastError = "send failed: \(error)"
        }
        sending = false
    }

    func refresh() async {
        do {
            let lastIn = messages.last(where: { $0.direction == .in })?.id
            let r = try await client.fetchRecent(since: lastIn)
            messages.append(contentsOf: r.messages)
        } catch {
            lastError = "fetch failed: \(error)"
        }
    }
}
```

- [ ] **Step 2: Write ChatView**

Write `EcodiaApp/ChatView.swift`:

```swift
import SwiftUI
import EcodiaCore

struct ChatView: View {
    @State private var vm = ChatViewModel()
    @Environment(\.scenePhase) private var phase

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(vm.messages) { msg in
                            HStack {
                                if msg.direction == .out { Spacer() }
                                Text(msg.text)
                                    .padding(10)
                                    .background(msg.direction == .out ? Color.accentColor.opacity(0.9) : Color(.systemGray6))
                                    .foregroundStyle(msg.direction == .out ? .white : .primary)
                                    .clipShape(RoundedRectangle(cornerRadius: 14))
                                if msg.direction == .in { Spacer() }
                            }
                            .id(msg.id)
                        }
                    }
                    .padding()
                }
                .onChange(of: vm.messages.count) {
                    if let last = vm.messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
            }
            if let err = vm.lastError {
                Text(err).font(.footnote).foregroundStyle(.red).padding(.horizontal)
            }
            HStack {
                TextField("message ecodia", text: $vm.draft, axis: .vertical)
                    .lineLimit(1...5)
                    .padding(10)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 18))
                Button {
                    Task { await vm.send() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 30))
                }
                .disabled(vm.sending || vm.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding()
        }
        .onChange(of: phase) {
            if phase == .active { Task { await vm.refresh() } }
        }
    }
}
```

- [ ] **Step 3: Build & run on simulator**

```bash
cd ~/ecodia-native
xcodebuild -scheme EcodiaApp -destination 'platform=iOS Simulator,name=iPhone 15' build
```

Then in Xcode (RDP): cmd+R, manually paste the bearer from Task 0.3, type a message, hit send.

Expected: 200 response, message appears as outbound bubble, no crash.

Verify backend received: query `kv_store.cowork.inbound_raw.<idempotency>` for the most recent.

- [ ] **Step 4: Commit**

```bash
git add EcodiaApp/ChatView.swift EcodiaApp/ChatViewModel.swift
git commit -m "feat(app): SwiftUI chat surface (send-only)"
git push origin main
```

---

### Task 1.11: iOS - APNs registration + push reception

**Files:**
- Create: `D:/.code/ecodia-native/EcodiaApp/AppDelegate.swift`
- Create: `D:/.code/ecodia-native/EcodiaApp/PushHandler.swift`
- Modify: `D:/.code/ecodia-native/EcodiaApp/EcodiaApp.swift`

- [ ] **Step 1: Write AppDelegate (for APNs callbacks)**

Write `EcodiaApp/AppDelegate.swift`:

```swift
import UIKit
import UserNotifications
import EcodiaCore

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound, .timeSensitive]) { _, _ in
            DispatchQueue.main.async { application.registerForRemoteNotifications() }
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        PushHandler.shared.handleNewToken(token)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[APNs] registration failed: \(error)")
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        return [.banner, .badge, .sound]
    }
}
```

- [ ] **Step 2: Write PushHandler (registers with backend)**

Write `EcodiaApp/PushHandler.swift`:

```swift
import Foundation
import UIKit
import EcodiaCore

@MainActor
final class PushHandler {
    static let shared = PushHandler()
    private let store = BearerStore()
    private var registeredToken: String?

    private var client: EcodiaClient {
        EcodiaClient(bearerProvider: { try? self.store.load() })
    }

    func handleNewToken(_ token: String) {
        if registeredToken == token { return }
        registeredToken = token
        Task {
            do {
                try await client.registerDevice(
                    apnsToken: token,
                    appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0",
                    iosVersion: UIDevice.current.systemVersion
                )
                print("[APNs] registered \(token.prefix(8))…")
            } catch {
                print("[APNs] register failed: \(error)")
            }
        }
    }
}
```

- [ ] **Step 3: Wire AppDelegate into App**

Update `EcodiaApp/EcodiaApp.swift`:

```swift
import SwiftUI
import EcodiaCore

@main
struct EcodiaApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var hasBearer: Bool = (try? BearerStore().load()) != nil

    var body: some Scene {
        WindowGroup {
            if hasBearer { ChatView() } else { OnboardingView(hasBearer: $hasBearer) }
        }
    }
}
```

- [ ] **Step 4: Build, run on physical device (simulator cannot receive APNs)**

In Xcode (RDP): connect Tate's iPhone to SY094 via USB OR enable wireless debugging via Xcode -> Window -> Devices. Cmd+R targeting the physical device.

Grant push permission when prompted. Verify Xcode console shows `[APNs] registered <token-prefix>...`

Verify backend: `mcp__ecodia-full__kv_store_get key="cowork.native.device_state.tate"` should return `{apns_token: "…", apns_token_registered_at: "…"}`.

- [ ] **Step 5: Smoke test outbound push**

Manually push a test message via `notifyTate` from the VPS:

```bash
ssh tate@100.103.227.90 "cd ~/ecodiaos && node -e \"const {notifyTate} = require('./src/services/native/notifyTate'); notifyTate({body: 'hi from vps', urgency: 'alert', channel: 'native'}).then(console.log)\""
```

Expected: push arrives on phone within ~2 seconds. Tap notification: app foregrounds.

- [ ] **Step 6: Commit**

```bash
git add EcodiaApp/AppDelegate.swift EcodiaApp/PushHandler.swift EcodiaApp/EcodiaApp.swift
git commit -m "feat(app): APNs registration + device-register call + push presentation"
git push origin main
```

---

### Task 1.12: First TestFlight build

**Files:**
- None (build + upload)

- [ ] **Step 1: Apply `sy094-eos-mobile-headless-ship-recipe.md`**

```bash
ssh tate@<sy094>
cd ~/ecodia-native
git pull
xcodebuild -scheme EcodiaApp -configuration Release -archivePath build/EcodiaApp.xcarchive archive
xcodebuild -exportArchive -archivePath build/EcodiaApp.xcarchive -exportPath build/export -exportOptionsPlist exportOptions.plist
xcrun altool --upload-app --type ios --file build/export/EcodiaApp.ipa \
  --apiKey <ASC_API_KEY_ID> --apiIssuer <ASC_API_ISSUER>
```

If `exportOptions.plist` does not exist:

```bash
cat > exportOptions.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store</string>
  <key>teamID</key><string><TEAM_ID></string>
  <key>uploadBitcode</key><false/>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
EOF
```

- [ ] **Step 2: Wait for ASC processing**

5-15 min. Check ASC -> Ecodia Native -> TestFlight -> Builds for "Ready to Submit" state.

- [ ] **Step 3: Install via TestFlight on Tate's iPhone**

Tate installs from TestFlight app. Open app, paste bearer.

- [ ] **Step 4: End-to-end smoke**

- Type "ping" in app -> backend receives, headless triage responds
- VPS notifyTate -> push arrives
- Tap push, app opens, chat shows latest

- [ ] **Step 5: Tag Phase 1 release**

```bash
cd ~/ecodia-native
git tag phase-1-v1.0.0
git push origin phase-1-v1.0.0
```

PHASE 1 COMPLETE. Use the app for ~1 day before starting Phase 2.

---

## Phase 2 - Capture Surfaces (Share Ext + Siri)

### Task 2.1: Backend - `POST /api/native/attachments/sign` endpoint

**Files:**
- Modify: `/Users/ecodia/.code/ecodiaos/backend/src/routes/native.js`
- Test: extend `/Users/ecodia/.code/ecodiaos/backend/tests/routes.native.test.js`

- [ ] **Step 1: Add test for the new endpoint**

Append to `tests/routes.native.test.js`:

```javascript
const storageStub = {
  createSignedPutUrl: async ({ bucket, path, contentType }) => ({
    put_url: `https://supabase.test/put/${path}`,
    public_url: `https://supabase.test/public/${path}`,
  }),
}
require.cache[require.resolve('../src/services/supabaseStorage')] = { exports: storageStub }

test('POST /attachments/sign returns presigned PUT + final URL', async () => {
  const r = await request(app).post('/api/native/attachments/sign').set(auth).send({
    filename: 'photo.png',
    content_type: 'image/png',
    bytes: 12345,
  })
  assert.strictEqual(r.statusCode, 200)
  assert.match(r.body.put_url, /supabase\.test\/put/)
  assert.match(r.body.signed_url, /supabase\.test\/public/)
})
```

- [ ] **Step 2: Stub `supabaseStorage` if missing**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
Test-Path src/services/supabaseStorage.js
```

If False, write a thin wrapper around the existing `mcp__ecodia-full__storage_get_url` / `storage_upload` path. If the existing code uses a different module, adapt the require path in the test.

- [ ] **Step 3: Add route handler**

Add to `/Users/ecodia/.code/ecodiaos/backend/src/routes/native.js` before `module.exports`:

```javascript
const { createSignedPutUrl } = require('../services/supabaseStorage')

router.post('/attachments/sign', async (req, res) => {
  const { filename, content_type, bytes } = req.body || {}
  if (!filename || !content_type) return res.status(400).json({ error: 'missing_fields' })
  const path = `native/${new Date().toISOString().slice(0,10)}/${Date.now()}-${filename}`
  const r = await createSignedPutUrl({ bucket: 'documents', path, contentType: content_type })
  return res.status(200).json({ put_url: r.put_url, signed_url: r.public_url, path, bytes })
})
```

- [ ] **Step 4: Run test, expect pass**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
node --test tests/routes.native.test.js
```

Expected: all tests including new one pass.

- [ ] **Step 5: Commit + deploy**

```powershell
git add src/routes/native.js tests/routes.native.test.js src/services/supabaseStorage.js
git commit -m "feat(native): /attachments/sign endpoint for iOS Share Ext uploads"
ssh tate@100.103.227.90 "cd ~/ecodiaos && git pull && pm2 restart ecodia-api"
```

---

### Task 2.2: iOS - `AttachmentUploader` in EcodiaCore

**Files:**
- Create: `D:/.code/ecodia-native/EcodiaCore/Sources/EcodiaCore/Uploads/AttachmentUploader.swift`

- [ ] **Step 1: Implement**

Write file:

```swift
import Foundation

public actor AttachmentUploader {
    private let client: EcodiaClient
    public init(client: EcodiaClient) { self.client = client }

    public struct UploadResult {
        public let signedURL: String
        public let contentType: String
        public let bytes: Int
    }

    public func upload(data: Data, filename: String, contentType: String) async throws -> UploadResult {
        let sign = try await client.signAttachment(filename: filename, contentType: contentType, bytes: data.count)
        var req = URLRequest(url: URL(string: sign.putURL)!)
        req.httpMethod = "PUT"
        req.setValue(contentType, forHTTPHeaderField: "Content-Type")
        let (_, resp) = try await URLSession.shared.upload(for: req, from: data)
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200...299).contains(status) else { throw EcodiaClientError.http(status, "upload failed") }
        return .init(signedURL: sign.signedURL, contentType: contentType, bytes: data.count)
    }
}

public extension EcodiaClient {
    struct SignResponse: Decodable { let putURL: String; let signedURL: String
        enum CodingKeys: String, CodingKey { case putURL = "put_url"; case signedURL = "signed_url" }
    }
    func signAttachment(filename: String, contentType: String, bytes: Int) async throws -> SignResponse {
        var req = URLRequest(url: EcodiaEndpoint.attachmentSign.url(base: URL(string: "https://api.admin.ecodia.au")!))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // bearer
        let payload: [String: Any] = ["filename": filename, "content_type": contentType, "bytes": bytes]
        req.httpBody = try JSONSerialization.data(withJSONObject: payload)
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONDecoder().decode(SignResponse.self, from: data)
    }
}
```

(Refactor opportunity: the `signAttachment` extension duplicates the auth/JSON plumbing from `EcodiaClient.send`. If the duplication grates, extract a shared private helper that exposes `makeRequest`/`send` as `internal` and have `AttachmentUploader` call through `client.sign(...)`. Skip the refactor unless adding a third such endpoint.)

- [ ] **Step 2: Commit**

```bash
git add EcodiaCore/Sources/EcodiaCore/Uploads
git commit -m "feat(core): AttachmentUploader for Supabase signed-URL PUT"
git push origin main
```

---

### Task 2.3: iOS - Share Extension target + UI

**Files:**
- Create: `D:/.code/ecodia-native/EcodiaShare/ShareViewController.swift`
- Create: `D:/.code/ecodia-native/EcodiaShare/ShareView.swift`
- Create: `D:/.code/ecodia-native/EcodiaShare/Info.plist`
- Create: `D:/.code/ecodia-native/EcodiaShare/EcodiaShare.entitlements`

- [ ] **Step 1: Create Share Extension target in Xcode (RDP)**

Xcode -> File -> New -> Target -> iOS -> Share Extension. Product Name `EcodiaShare`. Bundle ID `au.ecodia.native.share`. Team `Ecodia Pty Ltd`.

Enable App Groups capability -> select `group.au.ecodia.native`. This generates `EcodiaShare.entitlements`.

Add EcodiaCore as a dependency to the share target.

- [ ] **Step 2: Write ShareViewController.swift**

```swift
import UIKit
import SwiftUI
import UniformTypeIdentifiers
import EcodiaCore

class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        let host = UIHostingController(rootView: ShareView(items: items, onClose: { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }, onCancel: { [weak self] in
            self?.extensionContext?.cancelRequest(withError: NSError(domain: "cancel", code: 0))
        }))
        addChild(host)
        view.addSubview(host.view)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        host.didMove(toParent: self)
    }
}
```

- [ ] **Step 3: Write ShareView.swift**

```swift
import SwiftUI
import EcodiaCore
import UniformTypeIdentifiers

struct ShareView: View {
    let items: [NSExtensionItem]
    let onClose: () -> Void
    let onCancel: () -> Void
    @State private var comment: String = ""
    @State private var sending = false
    @State private var status: String?
    private let store = BearerStore()

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text("Share with Ecodia").font(.headline)
                ScrollView {
                    ForEach(extractedPreviewItems(), id: \.self) { Text($0).font(.footnote).foregroundStyle(.secondary) }
                }
                .frame(maxHeight: 120)
                TextField("optional comment", text: $comment, axis: .vertical)
                    .lineLimit(1...4)
                    .padding(8)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                if let status { Text(status).font(.footnote).foregroundStyle(.secondary) }
                HStack {
                    Button("Cancel", role: .cancel, action: onCancel)
                    Spacer()
                    Button(sending ? "Sending..." : "Send") { Task { await send() } }
                        .buttonStyle(.borderedProminent)
                        .disabled(sending)
                }
            }
            .padding()
        }
    }

    func extractedPreviewItems() -> [String] {
        var out: [String] = []
        for item in items {
            for prov in item.attachments ?? [] {
                if prov.hasItemConformingToTypeIdentifier(UTType.url.identifier) { out.append("URL") }
                if prov.hasItemConformingToTypeIdentifier(UTType.image.identifier) { out.append("Image") }
                if prov.hasItemConformingToTypeIdentifier(UTType.text.identifier) { out.append("Text") }
                if prov.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) { out.append("PDF") }
            }
        }
        return out
    }

    func send() async {
        sending = true; status = "preparing..."
        let client = EcodiaClient(bearerProvider: { try? store.load() })
        let uploader = AttachmentUploader(client: client)
        var attachments: [Attachment] = []
        for item in items {
            for prov in item.attachments ?? [] {
                if let url = await loadURL(prov) {
                    attachments.append(.init(kind: .url, url: url.absoluteString))
                } else if let text = await loadText(prov) {
                    attachments.append(.init(kind: .text, inline: text))
                } else if let imgData = await loadImageData(prov) {
                    do {
                        let r = try await uploader.upload(data: imgData, filename: "share-\(UUID().uuidString).png", contentType: "image/png")
                        attachments.append(.init(kind: .image, url: r.signedURL, contentType: r.contentType, bytes: r.bytes))
                    } catch { status = "upload failed: \(error)"; sending = false; return }
                }
            }
        }
        do {
            _ = try await client.sendMessage(body: comment, source: .share, attachments: attachments, liveActivityToken: nil)
            status = "sent"
            try? await Task.sleep(nanoseconds: 700_000_000)
            onClose()
        } catch { status = "send failed: \(error)"; sending = false }
    }

    private func loadURL(_ p: NSItemProvider) async -> URL? {
        guard p.hasItemConformingToTypeIdentifier(UTType.url.identifier) else { return nil }
        return try? await withCheckedThrowingContinuation { c in
            p.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
                c.resume(returning: item as? URL)
            }
        }
    }
    private func loadText(_ p: NSItemProvider) async -> String? {
        guard p.hasItemConformingToTypeIdentifier(UTType.text.identifier) else { return nil }
        return try? await withCheckedThrowingContinuation { c in
            p.loadItem(forTypeIdentifier: UTType.text.identifier, options: nil) { item, _ in
                c.resume(returning: item as? String)
            }
        }
    }
    private func loadImageData(_ p: NSItemProvider) async -> Data? {
        guard p.hasItemConformingToTypeIdentifier(UTType.image.identifier) else { return nil }
        return try? await withCheckedThrowingContinuation { c in
            p.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { data, _ in
                c.resume(returning: data)
            }
        }
    }
}
```

- [ ] **Step 4: Build + run via simulator + share-from-Safari**

In simulator: Safari -> any URL -> Share -> EcodiaShare. Add comment, tap Send.

Expected: 200 from backend, envelope arrives with `source: "share"` and `attachments[0].kind = "url"`.

- [ ] **Step 5: Commit + new TestFlight build**

```bash
git add EcodiaShare/
git commit -m "feat(share): Share Extension target with URL/text/image intake + upload"
git push origin main
```

Then archive + altool upload per Task 1.12.

---

### Task 2.4: iOS - App Intent (`SendToEcodiaIntent`)

**Files:**
- Create: `D:/.code/ecodia-native/EcodiaApp/Intents/SendToEcodiaIntent.swift`

- [ ] **Step 1: Write the intent**

```swift
import AppIntents
import EcodiaCore

struct SendToEcodiaIntent: AppIntent {
    static var title: LocalizedStringResource = "Tell Ecodia"
    static var description = IntentDescription("Send a message to Ecodia from anywhere.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Message") var text: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let client = EcodiaClient(bearerProvider: { try? BearerStore().load() })
        _ = try await client.sendMessage(body: text, source: .siri, attachments: [], liveActivityToken: nil)
        return .result(dialog: "told Ecodia")
    }
}

struct EcodiaShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SendToEcodiaIntent(),
            phrases: [
                "Tell \(.applicationName) \(\.$text)",
                "Send to \(.applicationName) \(\.$text)",
            ],
            shortTitle: "Tell Ecodia",
            systemImageName: "bubble.left.and.bubble.right.fill"
        )
    }
}
```

- [ ] **Step 2: Verify Siri donation**

Build + install on device. Open Shortcuts app -> see "Tell Ecodia" listed. Test "Hey Siri, tell Ecodia ping".

Expected: Siri transcribes, intent fires, dialog confirms "told Ecodia", backend receives envelope with `source: "siri"`.

- [ ] **Step 3: Commit**

```bash
git add EcodiaApp/Intents
git commit -m "feat(intents): SendToEcodiaIntent + AppShortcutsProvider for Siri"
git push origin main
```

- [ ] **Step 4: New TestFlight build**

Archive + upload. PHASE 2 COMPLETE after Tate uses for ~1 day.

---

## Phase 3 - Glance Surfaces (Widget + Live Activity + tate_priority)

### Task 3.1: Backend - `128_tate_priority_column.sql` migration

**Files:**
- Create: `/Users/ecodia/.code/ecodiaos/backend/migrations/128_tate_priority_column.sql`

- [ ] **Step 1: Write migration**

Write:

```sql
-- Migration 128: tate_priority column on status_board
-- Adds ranked 1..3 "what Tate should see at a glance" surface.
-- Consumed by iOS widget + headless-conductor _loadTurnContext filter.

BEGIN;

ALTER TABLE status_board
  ADD COLUMN IF NOT EXISTS tate_priority int NULL
    CHECK (tate_priority IS NULL OR tate_priority BETWEEN 1 AND 3);

CREATE INDEX IF NOT EXISTS idx_status_board_tate_priority
  ON status_board (tate_priority)
  WHERE tate_priority IS NOT NULL;

COMMIT;
```

- [ ] **Step 2: Apply via Supabase MCP**

```
mcp__ecodia-full__db_execute sql="<paste the migration body>"
```

Expected: ok.

- [ ] **Step 3: Verify**

```
mcp__ecodia-full__db_describe_table table="status_board"
```

Expected: `tate_priority int4 nullable` present.

- [ ] **Step 4: Notify headless-conductor chat**

Send a coord message confirming migration shipped. They can wire `_loadTurnContext` swap.

- [ ] **Step 5: Commit**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
git add migrations/128_tate_priority_column.sql
git commit -m "feat(db): migration 128 - tate_priority column on status_board"
```

---

### Task 3.2: Backend - `services/native/tatePriorityCurator.js`

**Files:**
- Create: `/Users/ecodia/.code/ecodiaos/backend/src/services/native/tatePriorityCurator.js`
- Test: `/Users/ecodia/.code/ecodiaos/backend/tests/tatePriorityCurator.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
const test = require('node:test')
const assert = require('node:assert')

let executed = []
const sbStub = {
  query: async (sql, args) => {
    if (sql.includes('SELECT')) return [
      { id: 'A', priority: 1, next_action_by: 'tate', next_action_due: null, last_touched: '2026-05-18T00:00:00Z' },
      { id: 'B', priority: 2, next_action_by: 'ecodiaos', next_action_due: null, last_touched: '2026-05-17T00:00:00Z' },
      { id: 'C', priority: 3, next_action_by: 'tate', next_action_due: '2026-05-20T00:00:00Z', last_touched: '2026-05-19T00:00:00Z' },
    ]
    executed.push({ sql, args })
    return { ok: true }
  },
  transaction: async (fn) => { await fn(sbStub); return { ok: true } },
}
require.cache[require.resolve('../src/services/supabaseDb')] = { exports: sbStub }

const { setTatePriority, selectTop3, refresh } = require('../src/services/native/tatePriorityCurator')

test('selectTop3 prefers tate-blocking + recent + approaching-deadline', async () => {
  const ranked = await selectTop3()
  assert.strictEqual(ranked.length, 3)
  assert.strictEqual(ranked[0], 'A') // tate-blocking + P1
  assert.ok(ranked.includes('C'))
})

test('setTatePriority writes 4 statements atomically', async () => {
  executed = []
  const r = await setTatePriority({ ranked_ids: ['x', 'y', 'z'] })
  assert.strictEqual(r.ok, true)
  assert.ok(executed.length >= 4) // 1 clear + 3 sets
})
```

- [ ] **Step 2: Stub `supabaseDb` if missing**

Adapt require path to match existing DB module (`src/db/index.js` or similar).

- [ ] **Step 3: Implement**

Write file:

```javascript
const db = require('../supabaseDb')

const SELECT_CANDIDATES_SQL = `
  SELECT id, name, priority, next_action_by, next_action_due, last_touched
  FROM status_board
  WHERE archived_at IS NULL
  ORDER BY
    CASE WHEN next_action_by = 'tate' THEN 0 ELSE 1 END,
    priority ASC,
    CASE WHEN next_action_due IS NULL THEN 1 ELSE 0 END,
    next_action_due ASC NULLS LAST,
    last_touched DESC
  LIMIT 25
`

async function selectTop3() {
  const rows = await db.query(SELECT_CANDIDATES_SQL, [])
  return rows.slice(0, 3).map(r => r.id)
}

async function setTatePriority({ ranked_ids }) {
  if (!Array.isArray(ranked_ids) || ranked_ids.length > 3) {
    return { ok: false, reason: 'expected_1_to_3_ids' }
  }
  await db.transaction(async (tx) => {
    await tx.query('UPDATE status_board SET tate_priority = NULL WHERE tate_priority IS NOT NULL', [])
    for (let i = 0; i < ranked_ids.length; i++) {
      await tx.query('UPDATE status_board SET tate_priority = $1 WHERE id = $2', [i + 1, ranked_ids[i]])
    }
  })
  return { ok: true, ranked: ranked_ids }
}

async function refresh() {
  const ids = await selectTop3()
  return setTatePriority({ ranked_ids: ids })
}

let cronTimer = null
function startCron({ everyMs = 20 * 60 * 1000 } = {}) {
  if (cronTimer) return
  cronTimer = setInterval(() => { refresh().catch(e => console.error('[tatePriorityCurator] cron', e)) }, everyMs)
}
function stopCron() { if (cronTimer) { clearInterval(cronTimer); cronTimer = null } }

module.exports = { selectTop3, setTatePriority, refresh, startCron, stopCron }
```

- [ ] **Step 4: Run test**

```powershell
cd /Users/ecodia/.code/ecodiaos/backend
node --test tests/tatePriorityCurator.test.js
```

Expected: 2 tests pass.

- [ ] **Step 5: Boot curator on app start**

In `src/app.js` (or wherever the app boots services):

```javascript
require('./services/native/tatePriorityCurator').startCron()
```

- [ ] **Step 6: Commit + deploy**

```powershell
git add src/services/native/tatePriorityCurator.js tests/tatePriorityCurator.test.js src/app.js
git commit -m "feat(native): tatePriorityCurator with selectTop3, setTatePriority, 20-min cron"
ssh tate@100.103.227.90 "cd ~/ecodiaos && git pull && pm2 restart ecodia-api"
```

---

### Task 3.3: Backend - `GET /api/native/tate-priority` and `POST /api/native/tate-priority/set`

**Files:**
- Modify: `/Users/ecodia/.code/ecodiaos/backend/src/routes/native.js`
- Test: extend `tests/routes.native.test.js`

- [ ] **Step 1: Add tests**

Append:

```javascript
const curatorStub = {
  setTatePriority: async ({ ranked_ids }) => ({ ok: true, ranked: ranked_ids }),
}
require.cache[require.resolve('../src/services/native/tatePriorityCurator')] = { exports: curatorStub }

test('GET /tate-priority returns top 3', async () => {
  // requires the db stub to return some rows; for the route test, just confirm shape
  const dbStub = { query: async () => [
    { id: 'a', name: 'one', status: 'doing', next_action: 'x', next_action_by: 'tate', last_touched: 't' },
    { id: 'b', name: 'two', status: 'doing', next_action: 'y', next_action_by: 'tate', last_touched: 't' },
    { id: 'c', name: 'three', status: 'doing', next_action: 'z', next_action_by: 'tate', last_touched: 't' },
  ]}
  require.cache[require.resolve('../src/services/supabaseDb')] = { exports: dbStub }
  const r = await request(app).get('/api/native/tate-priority').set(auth)
  assert.strictEqual(r.statusCode, 200)
  assert.strictEqual(r.body.items.length, 3)
})

test('POST /tate-priority/set forwards to curator', async () => {
  const r = await request(app).post('/api/native/tate-priority/set').set(auth).send({ ranked_ids: ['x','y','z'] })
  assert.strictEqual(r.statusCode, 200)
  assert.deepStrictEqual(r.body.ranked, ['x','y','z'])
})
```

- [ ] **Step 2: Add handlers**

Add to `src/routes/native.js`:

```javascript
const tatePriorityCurator = require('../services/native/tatePriorityCurator')
const db = require('../services/supabaseDb')

router.get('/tate-priority', async (req, res) => {
  const items = await db.query(
    `SELECT id, name, status, next_action, next_action_by, last_touched
     FROM status_board
     WHERE tate_priority IS NOT NULL AND archived_at IS NULL
     ORDER BY tate_priority ASC LIMIT 3`,
    []
  )
  res.status(200).json({ items })
})

router.post('/tate-priority/set', async (req, res) => {
  const { ranked_ids } = req.body || {}
  const r = await tatePriorityCurator.setTatePriority({ ranked_ids })
  res.status(r.ok ? 200 : 400).json(r)
})
```

- [ ] **Step 3: Run test, commit, deploy**

```powershell
node --test tests/routes.native.test.js
git add src/routes/native.js tests/routes.native.test.js
git commit -m "feat(native): /tate-priority GET + /tate-priority/set POST endpoints"
ssh tate@100.103.227.90 "cd ~/ecodiaos && git pull && pm2 restart ecodia-api"
```

---

### Task 3.4: Backend - `services/native/liveActivityPush.js`

**Files:**
- Create: `/Users/ecodia/.code/ecodiaos/backend/src/services/native/liveActivityPush.js`
- Test: `/Users/ecodia/.code/ecodiaos/backend/tests/liveActivityPush.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
const test = require('node:test')
const assert = require('node:assert')

const fakeKv = new Map()
const kvStub = {
  kvStoreGet: async (k) => fakeKv.get(k) ?? null,
  kvStoreSet: async (k, v) => { fakeKv.set(k, v) },
}
const apnsCalls = []
const apnsStub = {
  push: async (args) => { apnsCalls.push(args); return { status: 200, body: {} } },
  buildActivityPayload: ({ event, contentState, body }) => ({ aps: { event, 'content-state': contentState, alert: body ? { body } : undefined } }),
}
require.cache[require.resolve('../src/services/kvStore')] = { exports: kvStub }
require.cache[require.resolve('../src/services/native/apnsClient')] = { exports: apnsStub }

const lap = require('../src/services/native/liveActivityPush')

test('update reads token from kv and pushes', async () => {
  apnsCalls.length = 0
  fakeKv.set('cowork.native.live_activity_token.tate', { token: 'lat-1', started_at: new Date().toISOString() })
  const r = await lap.update({ state: 'thinking', body: 'probing repos' })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(apnsCalls[0].deviceToken, 'lat-1')
  assert.strictEqual(apnsCalls[0].pushType, 'liveactivity')
})

test('update no-ops when token missing', async () => {
  fakeKv.delete('cowork.native.live_activity_token.tate')
  const r = await lap.update({ state: 'thinking', body: 'x' })
  assert.strictEqual(r.ok, false)
})

test('expireStale ends activities older than 4h', async () => {
  apnsCalls.length = 0
  const old = new Date(Date.now() - 5 * 3600 * 1000).toISOString()
  fakeKv.set('cowork.native.live_activity_token.tate', { token: 'old', started_at: old })
  await lap.expireStale()
  assert.ok(apnsCalls.length >= 1)
  assert.strictEqual(apnsCalls[0].payload.aps.event, 'end')
})
```

- [ ] **Step 2: Implement**

Write file:

```javascript
const { kvStoreGet, kvStoreSet } = require('../kvStore')
const apns = require('./apnsClient')

const TOKEN_KEY = 'cowork.native.live_activity_token.tate'
const BUNDLE_ID = 'au.ecodia.native'
const ACTIVITY_TOPIC = `${BUNDLE_ID}.push-type.liveactivity`
const MAX_AGE_MS = 4 * 60 * 60 * 1000

async function update({ state, body }) {
  const t = await kvStoreGet(TOKEN_KEY)
  if (!t?.token) return { ok: false, reason: 'no_active_activity' }
  const payload = apns.buildActivityPayload({
    event: state === 'done' ? 'end' : 'update',
    contentState: { state, body: body || null, updated_at: new Date().toISOString() },
    body,
  })
  const r = await apns.push({ deviceToken: t.token, payload, topic: ACTIVITY_TOPIC, pushType: 'liveactivity', priority: 10 })
  if (state === 'done') await kvStoreSet(TOKEN_KEY, null)
  return { ok: r.status === 200, apns_status: r.status }
}

async function expireStale() {
  const t = await kvStoreGet(TOKEN_KEY)
  if (!t?.token || !t.started_at) return { ok: true, expired: 0 }
  if (Date.now() - new Date(t.started_at).getTime() < MAX_AGE_MS) return { ok: true, expired: 0 }
  const payload = apns.buildActivityPayload({
    event: 'end',
    contentState: { state: 'expired', updated_at: new Date().toISOString() },
  })
  await apns.push({ deviceToken: t.token, payload, topic: ACTIVITY_TOPIC, pushType: 'liveactivity', priority: 10 })
  await kvStoreSet(TOKEN_KEY, null)
  return { ok: true, expired: 1 }
}

let timer = null
function startExpiryScan({ everyMs = 5 * 60 * 1000 } = {}) {
  if (timer) return
  timer = setInterval(() => { expireStale().catch(e => console.error('[liveActivityPush] expire', e)) }, everyMs)
}
function stopExpiryScan() { if (timer) { clearInterval(timer); timer = null } }

module.exports = { update, expireStale, startExpiryScan, stopExpiryScan, liveActivityPush: { update, expireStale } }
```

- [ ] **Step 3: Boot scanner in app.js**

```javascript
require('./services/native/liveActivityPush').startExpiryScan()
```

- [ ] **Step 4: Run test, commit, deploy**

```powershell
node --test tests/liveActivityPush.test.js
git add src/services/native/liveActivityPush.js tests/liveActivityPush.test.js src/app.js
git commit -m "feat(native): liveActivityPush service (update + 4h expiry scan)"
ssh tate@100.103.227.90 "cd ~/ecodiaos && git pull && pm2 restart ecodia-api"
```

---

### Task 3.5: iOS - `EcodiaActivityAttributes` + LiveActivities UI

**Files:**
- Create: `D:/.code/ecodia-native/EcodiaApp/LiveActivities/EcodiaActivityAttributes.swift`
- Create: `D:/.code/ecodia-native/EcodiaApp/LiveActivities/EcodiaLiveActivityWidget.swift`
- Modify: `EcodiaApp/Info.plist` (add `NSSupportsLiveActivities = YES`)

- [ ] **Step 1: Write ActivityAttributes**

```swift
import ActivityKit

struct EcodiaActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var state: String  // received | thinking | progress | done | expired
        public var body: String?
        public var updatedAt: String?
    }
    public var startedAt: String
}
```

- [ ] **Step 2: Write the Live Activity Widget**

```swift
import WidgetKit
import SwiftUI
import ActivityKit

struct EcodiaLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: EcodiaActivityAttributes.self) { context in
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Image(systemName: stateIcon(context.state.state))
                    Text(stateLabel(context.state.state)).font(.headline)
                    Spacer()
                }
                if let body = context.state.body { Text(body).font(.footnote).foregroundStyle(.secondary).lineLimit(2) }
            }
            .padding(12)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: stateIcon(context.state.state))
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(stateLabel(context.state.state)).font(.headline)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let body = context.state.body { Text(body).font(.footnote) }
                }
            } compactLeading: {
                Image(systemName: stateIcon(context.state.state))
            } compactTrailing: {
                Text(stateLabel(context.state.state).prefix(8))
            } minimal: {
                Image(systemName: stateIcon(context.state.state))
            }
        }
    }

    func stateIcon(_ s: String) -> String {
        switch s {
        case "received": return "envelope"
        case "thinking": return "brain.head.profile"
        case "progress": return "ellipsis.bubble"
        case "done": return "checkmark.circle.fill"
        default: return "moon.zzz"
        }
    }
    func stateLabel(_ s: String) -> String {
        switch s {
        case "received": return "received"
        case "thinking": return "thinking..."
        case "progress": return "in progress"
        case "done": return "done"
        default: return s
        }
    }
}
```

This widget belongs in EcodiaApp's bundle. Add `EcodiaLiveActivityWidget` to a `WidgetBundle` if creating the Widget extension target (next task), OR keep it inline in EcodiaApp for Live Activity-only support.

- [ ] **Step 3: Update Info.plist**

Add to `EcodiaApp/Info.plist`:

```xml
<key>NSSupportsLiveActivities</key>
<true/>
<key>NSSupportsLiveActivitiesFrequentUpdates</key>
<true/>
```

- [ ] **Step 4: Modify ChatViewModel to start Live Activity on send**

In `ChatViewModel.swift`, replace `send()` with:

```swift
import ActivityKit

func send() async {
    let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !body.isEmpty else { return }
    sending = true; lastError = nil

    var activityToken: String? = nil
    if #available(iOS 17.2, *) {
        do {
            let attrs = EcodiaActivityAttributes(startedAt: ISO8601DateFormatter().string(from: Date()))
            let state = EcodiaActivityAttributes.ContentState(state: "received", body: nil, updatedAt: nil)
            let activity = try Activity.request(
                attributes: attrs,
                content: .init(state: state, staleDate: Date().addingTimeInterval(4 * 3600)),
                pushType: .token
            )
            for await tokenData in activity.pushTokenUpdates {
                activityToken = tokenData.map { String(format: "%02x", $0) }.joined()
                break
            }
        } catch { print("[LiveActivity] start failed: \(error)") }
    }

    let localId = UUID().uuidString
    messages.append(Message(id: localId, direction: .out, text: body, ts: ISO8601DateFormatter().string(from: Date()), source: .chat))
    draft = ""
    do {
        _ = try await client.sendMessage(body: body, source: .chat, attachments: [], liveActivityToken: activityToken)
    } catch { lastError = "send failed: \(error)" }
    sending = false
}
```

- [ ] **Step 5: Build, run on device, send a message**

Expected: lock-screen Live Activity appears with state "received". If headless conductor pushes auto-baseline updates (their work), state transitions visible.

- [ ] **Step 6: Commit**

```bash
git add EcodiaApp/LiveActivities EcodiaApp/Info.plist EcodiaApp/ChatViewModel.swift
git commit -m "feat(live-activity): ActivityAttributes + lock-screen/Dynamic Island UI + start on send"
git push origin main
```

---

### Task 3.6: iOS - Widget Extension target + Top3 widget

**Files:**
- Create: `D:/.code/ecodia-native/EcodiaWidget/EcodiaWidget.swift`
- Create: `D:/.code/ecodia-native/EcodiaWidget/TopThreeView.swift`
- Create: `D:/.code/ecodia-native/EcodiaWidget/Info.plist`
- Create: `D:/.code/ecodia-native/EcodiaWidget/EcodiaWidget.entitlements`

- [ ] **Step 1: Create Widget Extension target in Xcode (RDP)**

Xcode -> File -> New -> Target -> Widget Extension. Product Name `EcodiaWidget`. Bundle ID `au.ecodia.native.widget`. Team `Ecodia Pty Ltd`. Enable App Groups -> `group.au.ecodia.native`. Add EcodiaCore dependency.

Delete the boilerplate `EcodiaWidget.swift` that Xcode generates.

- [ ] **Step 2: Define a thin StatusBoardItem model**

Add to `EcodiaCore/Sources/EcodiaCore/Models/StatusBoardItem.swift`:

```swift
import Foundation

public struct StatusBoardItem: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public let name: String
    public let status: String?
    public let nextAction: String?
    public let nextActionBy: String?
    public let lastTouched: String?

    enum CodingKeys: String, CodingKey {
        case id, name, status
        case nextAction = "next_action"
        case nextActionBy = "next_action_by"
        case lastTouched = "last_touched"
    }
}

public struct TopThreeResponse: Codable, Sendable {
    public let items: [StatusBoardItem]
}
```

Add to `EcodiaClient`:

```swift
public func fetchTatePriority() async throws -> TopThreeResponse {
    let req = try makeRequest(.tatePriority, method: "GET")
    return try await send(req)
}
```

- [ ] **Step 3: Write Widget**

Write `EcodiaWidget/EcodiaWidget.swift`:

```swift
import WidgetKit
import SwiftUI
import EcodiaCore

struct TopThreeEntry: TimelineEntry {
    let date: Date
    let items: [StatusBoardItem]
    let error: String?
}

struct TopThreeProvider: TimelineProvider {
    func placeholder(in context: Context) -> TopThreeEntry {
        TopThreeEntry(date: Date(), items: [
            .init(id: "p1", name: "loading...", status: nil, nextAction: nil, nextActionBy: nil, lastTouched: nil)
        ], error: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (TopThreeEntry) -> Void) {
        Task {
            let e = await fetch()
            completion(e)
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TopThreeEntry>) -> Void) {
        Task {
            let e = await fetch()
            let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
            completion(Timeline(entries: [e], policy: .after(next)))
        }
    }

    private func fetch() async -> TopThreeEntry {
        let client = EcodiaClient(bearerProvider: { try? BearerStore().load() })
        do {
            let r = try await client.fetchTatePriority()
            return TopThreeEntry(date: Date(), items: r.items, error: nil)
        } catch {
            return TopThreeEntry(date: Date(), items: [], error: "\(error)")
        }
    }
}

@main
struct EcodiaWidgetBundle: WidgetBundle {
    var body: some Widget {
        EcodiaTopThreeWidget()
        EcodiaLiveActivityWidget()  // shared from EcodiaApp/LiveActivities (must be added to widget target)
    }
}

struct EcodiaTopThreeWidget: Widget {
    let kind: String = "EcodiaTopThree"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TopThreeProvider()) { entry in
            TopThreeView(entry: entry)
        }
        .configurationDisplayName("Tate Priority")
        .description("The three things Ecodia thinks you should glance at.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
```

- [ ] **Step 4: Write TopThreeView**

```swift
import SwiftUI
import EcodiaCore
import WidgetKit

struct TopThreeView: View {
    let entry: TopThreeEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        if let err = entry.error {
            VStack(alignment: .leading) {
                Text("ecodia").font(.caption).foregroundStyle(.secondary)
                Text(err).font(.caption2).foregroundStyle(.red).lineLimit(3)
            }.padding()
        } else if entry.items.isEmpty {
            VStack(alignment: .leading) {
                Text("ecodia").font(.caption).foregroundStyle(.secondary)
                Text("nothing pinned").font(.callout).foregroundStyle(.secondary)
            }.padding()
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text("tate priority").font(.caption).foregroundStyle(.secondary)
                ForEach(Array(entry.items.prefix(family == .systemSmall ? 1 : 3).enumerated()), id: \.offset) { i, item in
                    HStack(alignment: .top, spacing: 6) {
                        Text("\(i+1)").font(.caption2.weight(.bold)).foregroundStyle(.accent)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name).font(.footnote.weight(.semibold)).lineLimit(1)
                            if let s = item.status { Text(s).font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
                        }
                        Spacer(minLength: 0)
                    }
                    .widgetURL(URL(string: "ecodia://status/\(item.id)"))
                }
            }
            .padding()
        }
    }
}
```

- [ ] **Step 5: Build, install, add widget to home screen**

In Xcode: cmd+R EcodiaApp on device. Long-press home screen -> + -> EcodiaTopThree -> Add.

Expected: widget shows nothing-pinned initially. Manually call `setTatePriority` via Supabase MCP:

```
mcp__ecodia-full__db_execute sql="UPDATE status_board SET tate_priority = 1 WHERE id = (SELECT id FROM status_board WHERE archived_at IS NULL ORDER BY last_touched DESC LIMIT 1)"
```

Within 15 min (or after WidgetCenter.reload from app foreground), widget reflects the row.

- [ ] **Step 6: Commit + new TestFlight build**

```bash
git add EcodiaWidget EcodiaCore/Sources/EcodiaCore/Models/StatusBoardItem.swift
git commit -m "feat(widget): EcodiaWidget extension + TopThreeWidget timeline + UI"
git push origin main
```

Archive + altool upload.

PHASE 3 COMPLETE after Tate uses for ~1 day.

---

## Phase 4 - Resilience (SwiftData + Background Tasks)

### Task 4.1: iOS - SwiftData schema in EcodiaCore

**Files:**
- Create: `D:/.code/ecodia-native/EcodiaCore/Sources/EcodiaCore/Persistence/CachedMessage.swift`
- Create: `D:/.code/ecodia-native/EcodiaCore/Sources/EcodiaCore/Persistence/PendingSend.swift`
- Create: `D:/.code/ecodia-native/EcodiaCore/Sources/EcodiaCore/Persistence/CacheStore.swift`

- [ ] **Step 1: Write `CachedMessage`**

```swift
import Foundation
import SwiftData

@Model
public final class CachedMessage {
    @Attribute(.unique) public var id: String
    public var direction: String
    public var text: String
    public var ts: String
    public var source: String?
    public var acked: Bool

    public init(id: String, direction: String, text: String, ts: String, source: String?, acked: Bool = false) {
        self.id = id; self.direction = direction; self.text = text; self.ts = ts; self.source = source; self.acked = acked
    }
}
```

- [ ] **Step 2: Write `PendingSend`**

```swift
import Foundation
import SwiftData

@Model
public final class PendingSend {
    @Attribute(.unique) public var localId: String
    public var body: String
    public var source: String
    public var attachmentsJSON: String  // encoded [Attachment]
    public var createdAt: Date
    public var attempts: Int
    public var lastAttemptError: String?

    public init(localId: String = UUID().uuidString, body: String, source: String, attachmentsJSON: String, createdAt: Date = Date(), attempts: Int = 0, lastAttemptError: String? = nil) {
        self.localId = localId; self.body = body; self.source = source
        self.attachmentsJSON = attachmentsJSON; self.createdAt = createdAt
        self.attempts = attempts; self.lastAttemptError = lastAttemptError
    }
}
```

- [ ] **Step 3: Write `CacheStore`**

```swift
import Foundation
import SwiftData

@MainActor
public final class CacheStore {
    public static let shared = CacheStore()

    public let container: ModelContainer

    private init() {
        let schema = Schema([CachedMessage.self, PendingSend.self])
        let groupURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.au.ecodia.native")!
        let storeURL = groupURL.appendingPathComponent("EcodiaCache.sqlite")
        let cfg = ModelConfiguration(schema: schema, url: storeURL)
        container = try! ModelContainer(for: schema, configurations: [cfg])
    }

    public var context: ModelContext { container.mainContext }

    public func upsert(_ msgs: [Message]) throws {
        for m in msgs {
            let id = m.id
            let existing = try context.fetch(FetchDescriptor<CachedMessage>(predicate: #Predicate { $0.id == id })).first
            if let e = existing {
                e.text = m.text; e.direction = m.direction.rawValue; e.ts = m.ts
            } else {
                context.insert(CachedMessage(id: m.id, direction: m.direction.rawValue, text: m.text, ts: m.ts, source: m.source?.rawValue))
            }
        }
        try context.save()
        try pruneToMaxCount(100)
    }

    public func recent(limit: Int = 100) throws -> [CachedMessage] {
        var d = FetchDescriptor<CachedMessage>(sortBy: [SortDescriptor(\.ts, order: .reverse)])
        d.fetchLimit = limit
        return try context.fetch(d).reversed()
    }

    public func pruneToMaxCount(_ n: Int) throws {
        let all = try context.fetch(FetchDescriptor<CachedMessage>(sortBy: [SortDescriptor(\.ts, order: .reverse)]))
        if all.count <= n { return }
        for old in all.dropFirst(n) { context.delete(old) }
        try context.save()
    }

    public func enqueuePending(body: String, source: MessageSource, attachments: [Attachment]) throws -> PendingSend {
        let data = try JSONEncoder().encode(attachments)
        let json = String(data: data, encoding: .utf8) ?? "[]"
        let p = PendingSend(body: body, source: source.rawValue, attachmentsJSON: json)
        context.insert(p)
        try context.save()
        return p
    }

    public func pending() throws -> [PendingSend] {
        try context.fetch(FetchDescriptor<PendingSend>(sortBy: [SortDescriptor(\.createdAt)]))
    }

    public func delete(_ p: PendingSend) throws {
        context.delete(p); try context.save()
    }
}
```

- [ ] **Step 4: Commit**

```bash
git add EcodiaCore/Sources/EcodiaCore/Persistence
git commit -m "feat(core): SwiftData schema CachedMessage + PendingSend + CacheStore (App Group)"
git push origin main
```

---

### Task 4.2: iOS - Offline send queue in ChatViewModel

**Files:**
- Modify: `D:/.code/ecodia-native/EcodiaApp/ChatViewModel.swift`

- [ ] **Step 1: Refactor `send()` to enqueue first, then flush**

Replace `send()`:

```swift
import Network

func send() async {
    let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !body.isEmpty else { return }
    sending = true; lastError = nil

    var activityToken: String? = nil
    // ... (Live Activity start code from Task 3.5 unchanged)

    let localId = UUID().uuidString
    messages.append(Message(id: localId, direction: .out, text: body, ts: ISO8601DateFormatter().string(from: Date()), source: .chat))
    draft = ""

    do {
        let pending = try CacheStore.shared.enqueuePending(body: body, source: .chat, attachments: [])
        try await flushPending(activityToken: activityToken, justEnqueued: pending)
    } catch { lastError = "queue failed: \(error)" }
    sending = false
}

func flushPending(activityToken: String? = nil, justEnqueued: PendingSend? = nil) async throws {
    let store = CacheStore.shared
    for p in try store.pending() {
        do {
            let atts = (try? JSONDecoder().decode([Attachment].self, from: p.attachmentsJSON.data(using: .utf8) ?? Data())) ?? []
            let token = (p.localId == justEnqueued?.localId) ? activityToken : nil
            _ = try await client.sendMessage(body: p.body, source: MessageSource(rawValue: p.source) ?? .chat, attachments: atts, liveActivityToken: token)
            try store.delete(p)
        } catch {
            p.attempts += 1
            p.lastAttemptError = "\(error)"
            try store.context.save()
            throw error
        }
    }
}
```

- [ ] **Step 2: Wire NWPathMonitor for retry**

In `EcodiaApp.swift`:

```swift
import Network

@MainActor
final class NetworkMonitor: ObservableObject {
    let monitor = NWPathMonitor()
    let queue = DispatchQueue(label: "net.monitor")
    var onReachable: (() -> Void)?

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            if path.status == .satisfied { DispatchQueue.main.async { self?.onReachable?() } }
        }
        monitor.start(queue: queue)
    }
}

@main
struct EcodiaApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var hasBearer: Bool = (try? BearerStore().load()) != nil
    @StateObject private var net = NetworkMonitor()

    var body: some Scene {
        WindowGroup {
            if hasBearer {
                ChatView()
                    .onAppear {
                        net.onReachable = {
                            Task { try? await ChatViewModel.sharedTryFlush() }
                        }
                    }
            } else {
                OnboardingView(hasBearer: $hasBearer)
            }
        }
    }
}
```

Add a static convenience to ChatViewModel:

```swift
static func sharedTryFlush() async throws {
    let vm = ChatViewModel()
    try await vm.flushPending()
}
```

- [ ] **Step 3: Test offline -> online**

In simulator: Settings -> Developer -> Network Link Conditioner -> 100% loss. Send a message in app. Verify it stays in PendingSend (check via DB Browser for SQLite at the App Group container).

Disable conditioner. Within 1-2 seconds the queue flushes.

- [ ] **Step 4: Commit**

```bash
git add EcodiaApp/ChatViewModel.swift EcodiaApp/EcodiaApp.swift
git commit -m "feat(resilience): offline send queue via SwiftData PendingSend + NWPathMonitor flush"
git push origin main
```

---

### Task 4.3: iOS - Background Tasks for silent sync

**Files:**
- Modify: `D:/.code/ecodia-native/EcodiaApp/EcodiaApp.swift`
- Modify: `D:/.code/ecodia-native/EcodiaApp/Info.plist`

- [ ] **Step 1: Add background task identifiers to Info.plist**

Add to `EcodiaApp/Info.plist`:

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
  <string>au.ecodia.native.refresh</string>
  <string>au.ecodia.native.process</string>
</array>
```

- [ ] **Step 2: Register and schedule in App lifecycle**

Update `EcodiaApp.swift`:

```swift
import BackgroundTasks

func registerBackgroundTasks() {
    BGTaskScheduler.shared.register(forTaskWithIdentifier: "au.ecodia.native.refresh", using: nil) { task in
        handleRefresh(task: task as! BGAppRefreshTask)
    }
    BGTaskScheduler.shared.register(forTaskWithIdentifier: "au.ecodia.native.process", using: nil) { task in
        handleProcess(task: task as! BGProcessingTask)
    }
}

func scheduleRefresh() {
    let req = BGAppRefreshTaskRequest(identifier: "au.ecodia.native.refresh")
    req.earliestBeginDate = Date().addingTimeInterval(15 * 60)
    try? BGTaskScheduler.shared.submit(req)
}

func scheduleProcess() {
    let req = BGProcessingTaskRequest(identifier: "au.ecodia.native.process")
    req.requiresExternalPower = true
    req.requiresNetworkConnectivity = true
    req.earliestBeginDate = Date().addingTimeInterval(3 * 3600)
    try? BGTaskScheduler.shared.submit(req)
}

func handleRefresh(task: BGAppRefreshTask) {
    scheduleRefresh()
    let op = Task {
        do {
            let vm = await MainActor.run { ChatViewModel() }
            try await vm.flushPending()
            await vm.refresh()
            task.setTaskCompleted(success: true)
        } catch {
            task.setTaskCompleted(success: false)
        }
    }
    task.expirationHandler = { op.cancel() }
}

func handleProcess(task: BGProcessingTask) {
    scheduleProcess()
    let op = Task {
        do {
            let vm = await MainActor.run { ChatViewModel() }
            try await vm.flushPending()
            await vm.refresh()
            task.setTaskCompleted(success: true)
        } catch {
            task.setTaskCompleted(success: false)
        }
    }
    task.expirationHandler = { op.cancel() }
}
```

In `EcodiaApp.body`:

```swift
.onAppear {
    registerBackgroundTasks()
}
.onChange(of: phase) {
    if phase == .background {
        scheduleRefresh()
        scheduleProcess()
    }
}
```

(Move `@Environment(\.scenePhase)` into the App if not present.)

- [ ] **Step 3: Test via Xcode**

In Xcode debugger console while app is backgrounded:

```
e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"au.ecodia.native.refresh"]
```

Expected: `flushPending` + `refresh` runs.

- [ ] **Step 4: Commit + final TestFlight build**

```bash
git add EcodiaApp/EcodiaApp.swift EcodiaApp/Info.plist
git commit -m "feat(resilience): BGAppRefreshTask + BGProcessingTask for silent sync"
git push origin main
```

Archive + altool upload.

PHASE 4 COMPLETE. Use the app for ~1 day, observe offline behaviour, missed-push recovery.

---

## Self-Review Checklist (after all phases)

- [ ] Every `/api/native/*` endpoint in the spec has a route handler in `src/routes/native.js`.
- [ ] Every service in the spec (`notifyTate`, `apnsClient`, `liveActivityPush`, `deviceState`, `tatePriorityCurator`) has a file in `src/services/native/` and a test in `tests/`.
- [ ] The migration `128_tate_priority_column.sql` has been applied to production Supabase.
- [ ] All `kv_store` paths referenced by services match the spec:
    - `creds.tate_native_app_bearer`
    - `creds.apple_apns_auth_key` / `apple_apns_key_id` / `apple_apns_team_id`
    - `cowork.native.device_state.tate`
    - `cowork.native.live_activity_token.tate`
    - `cowork.message_thread.native.tate`
    - `cowork.inbound_raw.<idempotency_key>`
- [ ] iOS targets: `EcodiaApp`, `EcodiaWidget`, `EcodiaShare`, `EcodiaCore` (package) — all with App Group entitlement `group.au.ecodia.native`.
- [ ] Bundle IDs: `au.ecodia.native` / `.widget` / `.share`.
- [ ] APNs entitlement enabled. Background Modes: `Remote notifications`, `Background fetch`, `Background processing`.
- [ ] `NSSupportsLiveActivities = YES` in Info.plist.
- [ ] BGTaskScheduler identifiers in Info.plist match registered handlers.
- [ ] `ecodia://` URL scheme registered (via `CFBundleURLTypes` in Info.plist).
- [ ] Headless-conductor chat has been pinged at each blocker landing: notifyTate path, liveActivityPush path, set_tate_priority endpoint, tate_priority migration.
- [ ] Em-dash check on every committed markdown: `grep -c "—" docs/specs/2026-05-19*.md docs/plans/2026-05-19*.md` returns 0.

---

## Coord Re-Sync Points

After each phase's TestFlight ships, post a note to the headless-conductor chat:
- Phase 1 done: notifyTate live, native channel envelopes flowing
- Phase 2 done: attachments via /attachments/sign
- Phase 3 done: migration applied + curator running + Live Activity push receiving
- Phase 4 done: offline resilience verified

---

## Out-of-scope (parking lot)

- Unified Tate-conversation view at `/api/native/recent` (SMS + TG + native merge). Currently strict-native. v2.
- watchOS companion. Tate does not own a Watch. v2 if Watch arrives.
- Multi-device support (more than one phone). Single bearer + single device for v1.
- Audio attachments via Share Ext (voice memos forwarded into EcodiaOS). Schema supports it (`kind: audio`), Share Ext UI does not handle audio extraction in v1.
- HealthKit context. Not in v1, may never be.
