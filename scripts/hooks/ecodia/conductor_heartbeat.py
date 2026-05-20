#!/usr/bin/env python3
"""
UserPromptSubmit hook - keep the active conductor registration fresh on the
local coord bus AND surface any pending inbound chat messages.

Each turn-start this hook does:

  1. If NO conductor is registered (or stale), register THIS tab as the
     active conductor (single global slot, v1). On takeover (different
     claude_port than existing record), the old one is archived to
     conductors/history/.
  2. Otherwise, send a coord.conductor_heartbeat to update last_seen_at.
  3. Set the in_turn=true mutex so reflex.append_to_conductor defers paste
     while this turn is running (the matching Stop hook clears it).
  4. Peek chat.conductor.inbox for unread inbound_sms / inbound_telegram /
     inbound_* messages and emit them as a <inbound_messages_pending> block
     on stdout so the conductor sees them as turn context.

Per backend/patterns/one-conductor-many-channels-2026-05-19.md.

Always exits 0. Stdout becomes UserPromptSubmit context; stderr reserved
for hook-self errors.

Reads bearer from .mcp.json (coord block).
"""

import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

MCP_JSON_PATH = Path("D:/.code/ecodiaos/backend/.mcp.json")
COORD_URL = "http://localhost:7456/api/mcp/coord"
HTTP_TIMEOUT_S = 3.0
IDE_LOCK_DIR = Path(os.path.expanduser("~/.claude/ide"))
INSTANCES_JSON = Path(os.path.expanduser("~/.ecodia-preview/instances.json"))


def _detect_ide_fields():
    """Best-effort detection of which IDE this Claude Code chat lives in.

    Correlates ~/.claude/ide/<port>.lock files (Claude Code extension) with
    ~/.ecodia-preview/instances.json (cursor-preview extension). Returns
    {claude_port, ide_pid, ide_bridge_port, workspace_root, ide_name} or {}
    on failure (best-effort; never breaks a turn).

    Heuristics (in order):
      1. Project-dir match: lock.workspaceFolders contains CLAUDE_PROJECT_DIR
         env var (set by Claude Code when launched in a workspace) or cwd.
      2. ideName <-> instances.ide pairing: pick a lock whose ideName matches
         exactly one instance, then take that pairing.
      3. Single-instance-with-workspace: if instances.json has exactly one
         entry with non-empty workspaceRoots, pair it with the lock whose
         ideName matches its ide string and whose workspaceFolders overlap.
      4. Most-recently-started instance with non-empty workspaceRoots, paired
         with any lock whose ideName matches and workspaceFolders overlap.
    """
    out = {}
    cwd_norm = str(Path.cwd()).replace("\\", "/").lower()
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or ""
    project_norm = project_dir.replace("\\", "/").lower() if project_dir else ""

    def lock_paths():
        try:
            return list(IDE_LOCK_DIR.glob("*.lock"))
        except Exception:
            return []

    def parse_lock(p):
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return None

    def lock_workspace_folders_norm(parsed):
        folders = parsed.get("workspaceFolders") or [] if parsed else []
        return [str(f).replace("\\", "/").lower() for f in folders]

    locks = [(p, parse_lock(p)) for p in lock_paths()]
    locks = [(p, parsed) for p, parsed in locks if parsed]

    def read_instances():
        try:
            if not INSTANCES_JSON.exists():
                return {}
            return json.loads(INSTANCES_JSON.read_text(encoding="utf-8")) or {}
        except Exception:
            return {}

    instances = read_instances()

    def alive(pid):
        try:
            import ctypes

            kernel = ctypes.windll.kernel32
            h = kernel.OpenProcess(0x1000, False, int(pid))
            if h:
                kernel.CloseHandle(h)
                return True
            return False
        except Exception:
            return True  # assume alive if we cant probe

    instance_list = [(int(pid), info) for pid, info in instances.items() if alive(pid)]
    instance_list.sort(key=lambda x: x[1].get("startedAt", ""), reverse=True)

    def pick_lock_for_instance(info):
        ide_needle = (info.get("ide") or "").lower()
        inst_roots = [
            str(r).replace("\\", "/").lower()
            for r in (info.get("workspaceRoots") or [])
        ]
        for p, parsed in locks:
            ln = (parsed.get("ideName") or "").lower()
            if ide_needle and ln != ide_needle:
                continue
            lock_roots = lock_workspace_folders_norm(parsed)
            if inst_roots and not any(r in inst_roots for r in lock_roots):
                continue
            return p, parsed
        return None, None

    # Heuristic 1: project-dir or cwd matches a lock's workspaceFolders.
    target_lock_path = None
    target_lock = None
    for p, parsed in locks:
        folders = lock_workspace_folders_norm(parsed)
        if project_norm and project_norm in folders:
            target_lock_path, target_lock = p, parsed
            break
        if cwd_norm in folders:
            target_lock_path, target_lock = p, parsed
            break

    # Heuristic 2-4 if no project-dir match: fall back to instance-based.
    target_instance = None
    if not target_lock:
        # Find instances with non-empty workspaceRoots; most-recent first.
        candidates = [
            (pid, info)
            for pid, info in instance_list
            if (info.get("workspaceRoots") or [])
        ]
        if not candidates and instance_list:
            candidates = instance_list  # last resort: any alive instance
        for pid, info in candidates:
            lock_path, lock_parsed = pick_lock_for_instance(info)
            if lock_path:
                target_lock_path, target_lock = lock_path, lock_parsed
                target_instance = (pid, info)
                break
        # If still no lock paired but we have a single instance, use it without lock.
        if not target_instance and len(candidates) >= 1:
            target_instance = candidates[0]

    if target_lock:
        try:
            out["claude_port"] = int(target_lock_path.stem)
        except Exception:
            pass
        out["ide_name"] = target_lock.get("ideName")
        roots = target_lock.get("workspaceFolders") or []
        if roots:
            out["workspace_root"] = roots[0]

    if not target_instance and out.get("ide_name"):
        # Pair the matched lock with an instance by ide name.
        ide_needle = out["ide_name"].lower()
        for pid, info in instance_list:
            if (info.get("ide") or "").lower() == ide_needle:
                target_instance = (pid, info)
                break

    if target_instance:
        pid, info = target_instance
        out["ide_pid"] = pid
        out["ide_bridge_port"] = info.get("port")
        if not out.get("ide_name"):
            out["ide_name"] = info.get("ide")
        if not out.get("workspace_root"):
            inst_roots = info.get("workspaceRoots") or []
            if inst_roots:
                out["workspace_root"] = inst_roots[0]

    return out


def _load_coord_bearer():
    try:
        cfg = json.loads(MCP_JSON_PATH.read_text(encoding="utf-8"))
        coord = (cfg.get("mcpServers") or {}).get("coord") or {}
        auth = (coord.get("headers") or {}).get("Authorization") or ""
        if auth.startswith("Bearer "):
            return auth[len("Bearer ") :].strip()
    except Exception as err:
        sys.stderr.write(f"[conductor_heartbeat] bearer load failed: {err}\n")
    return None


def _coord_call(method, params, bearer):
    body = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": int.from_bytes(os.urandom(4), "big"),
            "method": "tools/call",
            "params": {"name": method, "arguments": params or {}},
        }
    ).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    req = urllib.request.Request(COORD_URL, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            parsed = json.loads(raw) if raw else {}
            inner = (parsed.get("result") or {}).get("content") or []
            if inner and isinstance(inner, list) and inner[0].get("text"):
                try:
                    return {"ok": True, "result": json.loads(inner[0]["text"])}
                except Exception:
                    return {"ok": True, "result": inner[0]["text"]}
            return {"ok": True, "result": parsed.get("result")}
    except urllib.error.HTTPError as err:
        return {"ok": False, "status": err.code, "error": str(err)}
    except Exception as err:
        return {"ok": False, "status": 0, "error": str(err)}


def _format_inbox_prelude(messages):
    if not messages:
        return ""
    lines = [
        f"<inbound_messages_pending count={len(messages)}>",
        "These messages arrived via SMS / Telegram / other channels while this turn was idle.",
        "Handle them now; per cron-fire-must-have-deliverable-not-just-narration, each one needs a substrate write.",
    ]
    for m in messages:
        body = m.get("body") or {}
        env = body.get("envelope") or {}
        ch = env.get("channel", "?")
        who = env.get("sender_name") or env.get("from") or "?"
        thread = env.get("thread_id") or ""
        msg = env.get("body") or "(no text body)"
        idem = env.get("idempotency_key") or m.get("id") or "?"
        lines.append(
            f"  - [{ch} from {who} | thread {thread} | key {idem}] {str(msg)[:240]}"
        )
        media = env.get("media") or []
        if media:
            for i, md in enumerate(media):
                lines.append(
                    f"      media[{i}]: {md.get('content_type', '?')} at {md.get('url', '?')}"
                )
    lines.append("</inbound_messages_pending>")
    return "\n".join(lines) + "\n"


def main():
    bearer = _load_coord_bearer()
    # 2026-05-19: detect richer IDE fields up front so register/beat get them.
    ide_fields = _detect_ide_fields()
    # Map Claude Code's ideName to coord's ide hint vocabulary.
    ide_name = (ide_fields.get("ide_name") or "").lower()
    if "insider" in ide_name:
        ide_hint = "insiders"
    elif "cursor" in ide_name:
        ide_hint = "cursor"
    elif "code" in ide_name:
        ide_hint = "stable"
    else:
        ide_hint = "cursor"

    state = _coord_call("coord.get_conductor_state", {}, bearer)
    if not state.get("ok"):
        sys.stderr.write(f"[conductor_heartbeat] probe failed: {state.get('error')}\n")
        print("")
        return 0

    result = state.get("result") or {}
    is_active = bool(result.get("is_active"))
    existing = result.get("conductor") or {}
    same_chat = ide_fields.get("claude_port") and existing.get(
        "claude_port"
    ) == ide_fields.get("claude_port")

    if is_active and same_chat:
        # Same chat, just heartbeat + refresh moving fields.
        beat_params = {"ide": ide_hint, **ide_fields}
        # ide_name not a server field; drop.
        beat_params.pop("ide_name", None)
        beat = _coord_call("coord.conductor_heartbeat", beat_params, bearer)
        if not beat.get("ok"):
            sys.stderr.write(
                f"[conductor_heartbeat] heartbeat failed: {beat.get('error')}\n"
            )
    else:
        # No conductor OR different chat than registered (takeover).
        reg_params = {"ide": ide_hint, **ide_fields}
        reg_params.pop("ide_name", None)
        reg = _coord_call("coord.register_conductor", reg_params, bearer)
        if not reg.get("ok"):
            sys.stderr.write(
                f"[conductor_heartbeat] register failed: {reg.get('error')}\n"
            )

    # 2026-05-19: set the in_turn mutex so reflex.append_to_conductor defers
    # paste while this turn is in flight. Stop hook clears it on turn end.
    set_in = _coord_call("coord.set_conductor_in_turn", {"in_turn": True}, bearer)
    if not set_in.get("ok"):
        sys.stderr.write(
            f"[conductor_heartbeat] set_in_turn failed: {set_in.get('error')}\n"
        )

    # 2026-05-19: peek inbox for unread inbound_* messages. Emit a prelude on
    # stdout so this turn handles them as context.
    inbox = _coord_call(
        "coord.peek_inbox",
        {"topic": "chat.conductor.inbox", "limit": 20},
        bearer,
    )
    if inbox.get("ok"):
        msgs = (inbox.get("result") or {}).get("messages") or []
        # Deny-list filter: drop only known heartbeat noise. Anything else is
        # signal worth surfacing. Per the build-8 diagnostic
        # (2026-05-20): the prior allow-list (`startswith("inbound_")`)
        # silently dropped Opus's cross-chat directives sent via
        # whisper_to_active_conductor, because their type was
        # `tate_directive_via_native_app` not `inbound_*`. Better default:
        # surface everything except the explicit noise types.
        NOISE_TYPES = {"idle_check", "heartbeat", "ping"}
        pending = []
        for m in msgs:
            body = m.get("body") or {}
            t = (body.get("type") or "").lower()
            if t in NOISE_TYPES:
                continue
            pending.append(m)
        prelude = _format_inbox_prelude(pending)
        if prelude:
            sys.stdout.write(prelude)
            # Mark them seen so they don't repeat next turn.
            _coord_call(
                "coord.read_inbox",
                {"topic": "chat.conductor.inbox", "limit": 20},
                bearer,
            )
        else:
            print("")
    else:
        print("")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as err:
        sys.stderr.write(f"[conductor_heartbeat] unhandled: {err}\n")
        sys.exit(0)
