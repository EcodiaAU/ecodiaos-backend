#!/usr/bin/env bash
# prehooks/coexist.sh - metrics-vs-DB invariance feeder for Maestro.
# Sourced by run-app-tests.sh load_creds() before the coexist flows run.
# Recomputes UPCOMING / REGISTRATIONS / AVG_ATTENDANCE the same way
# src/hooks/use-admin-events.ts derives them (top-200 upcoming asc + top-200
# past desc; status != cancelled; registrations status IN registered,attended;
# avg = mean of (attended_reg + walk_in_attended) over past-eligible events
# with attendance > 0). The flow asserts these values equal the on-device cards.
set -u
KV="${KV:-/Users/ecodia/PRIVATE/ecodia-creds/kv-mirror}"
SB_URL=$(jq -r '.url' "$KV/coexist_supabase.json")
SB_KEY=$(jq -r '.service_role_key' "$KV/coexist_supabase.json")
export MAESTRO_EXPECT_UPCOMING MAESTRO_EXPECT_REGISTRATIONS MAESTRO_EXPECT_AVG_ATTENDANCE
eval "$(SB_URL="$SB_URL" SB_KEY="$SB_KEY" python3 - <<'PY'
import os, json, urllib.request
from collections import Counter
URL, KEY = os.environ["SB_URL"], os.environ["SB_KEY"]
HDR = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
def get(p):
    r = urllib.request.Request(f"{URL}/rest/v1/{p}", headers=HDR)
    return json.load(urllib.request.urlopen(r, timeout=20))
from datetime import datetime, timezone
now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
up = get(f"events?select=id,status&date_start=gte.{now}&order=date_start.asc&limit=200")
past = get(f"events?select=id,status&date_start=lt.{now}&order=date_start.desc&limit=200")
upcoming_count = sum(1 for e in up if e["status"] != "cancelled")
ids = ",".join(e["id"] for e in up + past)
regs = get(f"event_registrations?select=event_id&event_id=in.({ids})&status=in.(registered,attended)")
att  = get(f"event_registrations?select=event_id&event_id=in.({ids})&status=eq.attended")
walk = get(f"event_walk_ins?select=event_id&event_id=in.({ids})&status=eq.attended")
past_elig = {e["id"] for e in past if e["status"] != "cancelled"}
ac, wc = Counter(r["event_id"] for r in att), Counter(r["event_id"] for r in walk)
per = [ac.get(i,0)+wc.get(i,0) for i in past_elig]
with_ = [n for n in per if n > 0]
avg = round(sum(with_) / len(with_)) if with_ else 0
print(f"MAESTRO_EXPECT_UPCOMING={upcoming_count}")
print(f"MAESTRO_EXPECT_REGISTRATIONS={len(regs)}")
print(f"MAESTRO_EXPECT_AVG_ATTENDANCE={avg}")
PY
)"
echo "[prehook coexist] UPCOMING=$MAESTRO_EXPECT_UPCOMING REGISTRATIONS=$MAESTRO_EXPECT_REGISTRATIONS AVG_ATTENDANCE=$MAESTRO_EXPECT_AVG_ATTENDANCE" >&2
