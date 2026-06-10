#!/bin/bash
# Reusable helpers for the chambers sweep. Source this in every cell.
LAPTOP_AGENT="http://127.0.0.1:7456/api/tool"
LAPTOP_TOKEN="fad80809116f70923d200b371d4b1b922e38951bac5fc30df516652cfea6011f"
ALIAS="eos-chambers-sweep"
SHOTS="D:/.code/EcodiaOS/backend/drafts/chambers-sweep-2026-05-29/screenshots"

# Single-call tool wrapper. Returns raw JSON.
agent() {
  local tool="$1"; shift
  local params="$1"
  curl -s -X POST "$LAPTOP_AGENT" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $LAPTOP_TOKEN" \
    -d "{\"tool\":\"$tool\",\"params\":$params}"
}

# Screenshot helper - decodes base64 to file, echoes summary line only.
shot() {
  local name="$1"
  local full="${2:-false}"
  agent "cdp.pageScreenshot" "{\"alias\":\"$ALIAS\",\"fullPage\":$full}" | \
    python -c "
import sys, json, base64, os
try:
    d = json.load(sys.stdin)
    r = d.get('result', {})
    img = r.get('image') or r.get('data') or ''
    if not img:
        print('SHOT_ERR', json.dumps(d)[:300])
        sys.exit(1)
    path = r'$SHOTS/' + '$name' + '.png'
    open(path,'wb').write(base64.b64decode(img))
    print('SHOT_OK', '$name', len(img)//1024, 'KB_b64')
except Exception as e:
    print('SHOT_ERR', repr(e))
"
}

# JS-eval helper - returns the result string (truncated).
js() {
  local code="$1"
  local maxlen="${2:-2000}"
  agent "cdp.runJs" "{\"alias\":\"$ALIAS\",\"js\":$(python -c "import sys,json; print(json.dumps(sys.argv[1]))" "$code")}" | \
    python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    r = d.get('result', {})
    v = r.get('value') if isinstance(r, dict) else r
    s = json.dumps(v) if not isinstance(v, str) else v
    print(s[:$maxlen])
except Exception as e:
    print('JS_ERR', repr(e))
"
}

# Convenience: navigate + wait + screenshot
goshot() {
  local url="$1"
  local name="$2"
  agent "cdp.navigate" "{\"alias\":\"$ALIAS\",\"url\":\"$url\"}" > /dev/null
  sleep 1.5
  shot "$name"
}

# Visual element catalog - what buttons/inputs/headings exist on this page.
inventory() {
  js 'JSON.stringify({url:location.href,title:document.title,h1:[...document.querySelectorAll("h1,h2,h3")].slice(0,8).map(el=>({tag:el.tagName,text:(el.textContent||"").trim().slice(0,80)})),buttons:[...document.querySelectorAll("button:not([disabled])")].slice(0,30).map(el=>({text:(el.textContent||"").trim().slice(0,40),aria:el.getAttribute("aria-label")||"",type:el.getAttribute("type")||""})),links:[...document.querySelectorAll("a[href]")].slice(0,30).map(el=>({text:(el.textContent||"").trim().slice(0,40),href:el.getAttribute("href")})),inputs:[...document.querySelectorAll("input,textarea,select")].slice(0,20).map(el=>({type:el.getAttribute("type")||el.tagName.toLowerCase(),name:el.getAttribute("name")||"",placeholder:el.getAttribute("placeholder")||"",aria:el.getAttribute("aria-label")||""})),visibleText:document.body.innerText.slice(0,800)})' 3500
}

# Quick error scan - JS errors + react boundary errors in console.
errors() {
  js 'JSON.stringify({errors:(window.__sweepErrors||[]),consoleErrCount:(window.__sweepConsoleErr||0),reactBoundary:document.body.innerText.includes("Something went wrong")||document.body.innerText.includes("ChunkLoadError")})'
}
