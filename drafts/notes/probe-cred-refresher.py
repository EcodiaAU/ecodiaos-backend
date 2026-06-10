"""Read-only health probe for cred-refresher PM2 process. No mutations."""
import json, urllib.request, datetime, sys

TOK = "fad80809116f70923d200b371d4b1b922e38951bac5fc30df516652cfea6011f"


def call_agent(cmd, timeout=8000):
    body = json.dumps({"tool": "shell.shell", "params": {"command": cmd, "timeout": timeout}}).encode()
    req = urllib.request.Request(
        "http://127.0.0.1:7456/api/tool",
        data=body,
        headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout / 1000 + 4) as r:
        return json.loads(r.read())


# 1. pm2 jlist - structured JSON of all processes
resp = call_agent("pm2 jlist")
out = resp.get("result", {}).get("stdout", "")
try:
    procs = json.loads(out) if out.strip().startswith("[") else []
except Exception as e:
    print("parse fail:", e)
    print(out[:400])
    sys.exit(1)

print(f"=== pm2 jlist: {len(procs)} processes ===")
target = None
for p in procs:
    name = p.get("name", "?")
    env = p.get("pm2_env", {})
    status = env.get("status")
    restarts = env.get("restart_time")
    pid = p.get("pid")
    pm_uptime = env.get("pm_uptime", 0)
    uptime_min = round((datetime.datetime.now().timestamp() * 1000 - pm_uptime) / 60000, 1) if pm_uptime else None
    script = env.get("pm_exec_path", "").replace("\\", "/").rsplit("/", 1)[-1]
    print(f"  [{p.get('pm_id')}] {name}: status={status}, restarts={restarts}, pid={pid}, uptime={uptime_min}min, script={script}")
    nl = name.lower() if name else ""
    if "cred" in nl or "refresh" in nl or "clobber" in nl:
        target = p

print()
if not target:
    print("CRED-REFRESHER NOT IN PM2 - daemon is not supervised. Per doctrine, scheduler should not rotate until refresher is alive.")
    sys.exit(0)

print(f"=== cred-refresher detail ===")
print(f"  name: {target.get('name')}")
env = target.get("pm2_env", {})
print(f"  status: {env.get('status')}")
print(f"  restart_time: {env.get('restart_time')}")
print(f"  pm_exec_path: {env.get('pm_exec_path')}")
print(f"  pm_cwd: {env.get('pm_cwd')}")
pm_uptime = env.get("pm_uptime", 0)
if pm_uptime:
    uptime_min = (datetime.datetime.now().timestamp() * 1000 - pm_uptime) / 60000
    print(f"  uptime: {uptime_min:.1f} min")
print(f"  last unstable_restarts: {env.get('unstable_restarts')}")
print(f"  exit_code: {env.get('exit_code')}")

# 2. recent stdout (last 12 lines)
print()
print("=== last 12 lines stdout ===")
log_resp = call_agent(f"pm2 logs {target.get('name')} --lines 12 --nostream --raw 2>&1 | tail -20")
print(log_resp.get("result", {}).get("stdout", "")[:1500])

# 3. error log peek
print()
print("=== last 8 lines stderr ===")
err_resp = call_agent(f"pm2 logs {target.get('name')} --lines 8 --nostream --err --raw 2>&1 | tail -10")
print(err_resp.get("result", {}).get("stdout", "")[:800])
