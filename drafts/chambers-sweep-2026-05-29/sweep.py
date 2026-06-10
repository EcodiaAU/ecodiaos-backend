#!/usr/bin/env python3
"""Chambers sweep orchestrator. Run with: python sweep.py <group>"""
import base64
import json
import sys
import time
from pathlib import Path
from urllib import request

TOKEN = "fad80809116f70923d200b371d4b1b922e38951bac5fc30df516652cfea6011f"
ALIAS = "eos-chambers-sweep"
URL = "http://127.0.0.1:7456/api/tool"
BASE = "https://app.chambers.ecodia.au"
SHOTS = Path("D:/.code/EcodiaOS/backend/drafts/chambers-sweep-2026-05-29/screenshots")
LOG = Path("D:/.code/EcodiaOS/backend/drafts/chambers-sweep-2026-05-29/sweep-log.jsonl")


def _raw_agent(tool: str, params: dict, timeout: int = 45) -> dict:
    body = json.dumps({"tool": tool, "params": params}).encode()
    req = request.Request(
        URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TOKEN}",
        },
        method="POST",
    )
    with request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def reattach() -> bool:
    try:
        r = _raw_agent(
            "cdp.attach_tab",
            {"alias": ALIAS, "urlContains": "app.chambers.ecodia.au"},
            timeout=20,
        )
        return bool((r.get("result") or {}).get("ok"))
    except Exception:
        return False


def agent(tool: str, params: dict, retries: int = 2) -> dict:
    """Call laptop-agent with retry + auto-reattach on alias drop / timeout."""
    last = {"error": "unknown"}
    for attempt in range(retries + 1):
        try:
            r = _raw_agent(tool, params)
            res = r.get("result")
            # Detect dropped-alias error and reattach before retrying.
            if isinstance(res, dict) and not res.get("ok", True):
                err = str(res.get("error", ""))
                if "alias not registered" in err or "not attached" in err:
                    reattach()
                    last = r
                    continue
            return r
        except Exception as e:
            last = {"error": repr(e)}
            time.sleep(2 + attempt * 2)
            reattach()
    return last if isinstance(last, dict) else {"error": str(last)}


def nav(route: str) -> None:
    agent("cdp.navigate", {"alias": ALIAS, "url": f"{BASE}{route}"})


def shot(name: str) -> int:
    r = agent("cdp.pageScreenshot", {"alias": ALIAS, "fullPage": False})
    img = (r.get("result") or {}).get("image") or ""
    if not img:
        return 0
    (SHOTS / f"{name}.png").write_bytes(base64.b64decode(img))
    return len(img) // 1024


def inv() -> dict:
    code = (
        'JSON.stringify({url:location.href,title:document.title,'
        'h:[...document.querySelectorAll("h1,h2,h3")].slice(0,12).map(el=>({tag:el.tagName,text:(el.textContent||"").trim().slice(0,80)})),'
        'btns:[...document.querySelectorAll("button:not([disabled])")].slice(0,40).map(el=>({text:(el.textContent||"").trim().slice(0,40),aria:el.getAttribute("aria-label")||"",type:el.getAttribute("type")||""})),'
        'links:[...document.querySelectorAll("a[href]")].slice(0,40).map(el=>({text:(el.textContent||"").trim().slice(0,40),href:el.getAttribute("href")})),'
        'inputs:[...document.querySelectorAll("input,textarea,select")].slice(0,25).map(el=>({type:el.getAttribute("type")||el.tagName.toLowerCase(),name:el.getAttribute("name")||"",placeholder:el.getAttribute("placeholder")||"",aria:el.getAttribute("aria-label")||""})),'
        'errBoundary:document.body.innerText.includes("Something went wrong")||document.body.innerText.includes("ChunkLoadError")||document.body.innerText.includes("Error 5"),'
        'emptyShell:document.body.innerText.replace(/\\\\s/g,"")==="HomeEventsGroupsMore",'
        'visibleText:document.body.innerText.slice(0,900)})'
    )
    r = agent("cdp.runJs", {"alias": ALIAS, "js": code})
    val = (r.get("result") or {}).get("value")
    try:
        return json.loads(val) if isinstance(val, str) else val
    except Exception:
        return {"raw": val}


def walk(route: str, name: str, wait: float = 4.0) -> dict:
    nav(route)
    time.sleep(wait)
    kb = shot(name)
    rec = {"route": route, "name": name, "shot_kb": kb, "inv": inv()}
    with LOG.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    return rec


def summarize(rec: dict) -> str:
    inv_ = rec.get("inv", {})
    if not isinstance(inv_, dict):
        return f"{rec['route']:40s} -> invalid inventory"
    headings = ", ".join(h.get("text", "")[:35] for h in inv_.get("h", [])[:3])
    btn_count = len(inv_.get("btns", []))
    input_count = len(inv_.get("inputs", []))
    flags = []
    if inv_.get("errBoundary"):
        flags.append("ERR-BOUNDARY")
    if inv_.get("emptyShell"):
        flags.append("EMPTY-SHELL")
    flag_str = " [" + ",".join(flags) + "]" if flags else ""
    return f"{rec['route']:40s} | h={headings[:60]:60s} | btns={btn_count:2d} inputs={input_count}{flag_str}"


ROUTES = {
    "event-detail": [
        ("/events/3a04215a-bda7-43f6-bdb1-f889a113ab81", "30-event-detail-winter-showcase"),
    ],
    "committee-detail": [
        ("/committees/b8289bb0-7fa1-42c1-828e-cf2b3964f372", "31-committee-events"),
        ("/committees/35492d00-47b8-465a-b272-330eef3088bd", "32-committee-membership"),
    ],
    "group-detail": [
        ("/groups/8287380b-7368-4bf9-8825-e0ac2a114bd3", "33-group-sustainability"),
    ],
    "admin": [
        ("/admin", "40-admin-dashboard"),
        ("/admin/events", "41-admin-events"),
        ("/admin/members", "42-admin-members"),
        ("/admin/dues", "43-admin-dues"),
        ("/admin/newsletters", "44-admin-newsletters"),
        ("/admin/committees", "45-admin-committees"),
        ("/admin/groups", "46-admin-groups"),
        ("/admin/integrations", "47-admin-integrations"),
        ("/admin/settings/branding", "48-admin-branding"),
        ("/admin/settings/billing", "49-admin-billing"),
        ("/admin/settings/notifications", "50-admin-notifications"),
        ("/admin/settings/privacy", "51-admin-privacy"),
        ("/admin/onboarding", "52-admin-onboarding"),
    ],
    "platform": [
        ("/onboarding/chamber", "60-onboarding-chamber"),
        ("/sign-up/scycc", "61-member-signup-scycc"),
        ("/delete-account", "62-delete-account"),
        ("/privacy", "63-privacy"),
        ("/terms", "64-terms"),
        ("/notfound-test-404", "65-not-found"),
    ],
}


if __name__ == "__main__":
    group = sys.argv[1] if len(sys.argv) > 1 else "all"
    targets = [item for k, lst in ROUTES.items() if group in ("all", k) for item in lst]
    print(f"Sweeping {len(targets)} routes (group={group})")
    for route, name in targets:
        try:
            rec = walk(route, name)
            print(summarize(rec))
        except Exception as e:
            print(f"FAIL {route} -> {name}: {e!r}")
            time.sleep(2)
