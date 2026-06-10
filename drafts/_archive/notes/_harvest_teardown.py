#!/usr/bin/env python3
"""Harvest the interrupted AM-Kit teardown swarm: parse agent JSONL transcripts,
extract review findings + 3-lens verify verdicts, compute confirmed findings."""
import json, glob, os, re, sys

D = r"C:\Users\tjdTa\.claude\projects\d---code-ecodiaos-backend\b308e9ca-4115-486d-a839-f89bfb80787b\subagents\workflows\wf_62796342-bb4"

def iter_jsonl(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            for ln in f:
                ln = ln.strip()
                if not ln:
                    continue
                try:
                    yield json.loads(ln)
                except Exception:
                    continue
    except Exception:
        return

def first_user_text(path):
    for obj in iter_jsonl(path):
        if obj.get("type") == "user":
            msg = obj.get("message", {})
            c = msg.get("content")
            if isinstance(c, str):
                return c
            if isinstance(c, list):
                parts = []
                for p in c:
                    if isinstance(p, dict) and p.get("type") == "text":
                        parts.append(p.get("text", ""))
                    elif isinstance(p, str):
                        parts.append(p)
                if parts:
                    return "\n".join(parts)
    return ""

def last_structured(path):
    """Return the last tool_use input that looks like our schema output."""
    found = None
    for obj in iter_jsonl(path):
        msg = obj.get("message", {})
        c = msg.get("content")
        if not isinstance(c, list):
            continue
        for p in c:
            if isinstance(p, dict) and p.get("type") == "tool_use":
                inp = p.get("input")
                if isinstance(inp, dict) and ("findings" in inp and "dimension" in inp):
                    found = ("findings", inp)
                elif isinstance(inp, dict) and "keep" in inp:
                    found = ("verdict", inp)
    return found

reviews = {}        # dim -> findings obj
verdicts = {}       # (dim, title_norm) -> {lens: keep}
verdict_rows = []

def norm(s):
    return re.sub(r"\s+", " ", (s or "")).strip().lower()[:120]

files = glob.glob(os.path.join(D, "agent-*.jsonl"))
for path in files:
    kind = last_structured(path)
    if not kind:
        continue
    typ, inp = kind
    if typ == "findings":
        dim = inp.get("dimension", "?")
        # keep the richest (most findings) per dimension
        if dim not in reviews or len(inp.get("findings", [])) > len(reviews[dim].get("findings", [])):
            reviews[dim] = inp
    else:  # verdict
        prompt = first_user_text(path)
        mdim = re.search(r'against the "([^"]+)" dimension', prompt)
        mtitle = re.search(r"TITLE:\s*(.+)", prompt)
        mlens = re.search(r"LENS\s*=\s*(\w+)", prompt)
        if not (mdim and mtitle and mlens):
            continue
        dim = mdim.group(1)
        title = mtitle.group(1).strip()
        lens = mlens.group(1).strip()
        key = (dim, norm(title))
        verdicts.setdefault(key, {})[lens] = bool(inp.get("keep"))
        verdict_rows.append({"dim": dim, "title": title, "lens": lens,
                             "keep": bool(inp.get("keep")),
                             "reason": inp.get("reason", "")[:300],
                             "sev_adj": inp.get("severity_adjusted")})

# Build confirmed list: a finding is confirmed if it has >=3 lens votes all true,
# OR (fallback for partial overnight runs) if all available lens votes are true and >=2 lenses present.
confirmed = []
partial = []
for dim, robj in reviews.items():
    for f in robj.get("findings", []):
        if f.get("severity") == "minor":
            continue
        key = (dim, norm(f.get("title", "")))
        votes = verdicts.get(key, {})
        nv = len(votes)
        all_keep = nv > 0 and all(votes.values())
        rec = {"dimension": dim, "title": f.get("title"), "severity": f.get("severity"),
               "claim": f.get("claim_in_plan", ""), "problem": f.get("problem", ""),
               "fix": f.get("recommended_fix", ""), "lens_votes": votes, "n_votes": nv}
        if nv >= 3 and all(votes.values()):
            confirmed.append(rec)
        elif all_keep and nv >= 1:
            partial.append(rec)

sev_rank = {"critical": 0, "major": 1, "minor": 2}
confirmed.sort(key=lambda r: (sev_rank.get(r["severity"], 3), r["dimension"]))
partial.sort(key=lambda r: (sev_rank.get(r["severity"], 3), r["dimension"]))

out = {
    "files_parsed": len(files),
    "review_dimensions": sorted(reviews.keys()),
    "n_review_dims": len(reviews),
    "n_verdict_agents": len(verdict_rows),
    "confirmed_count": len(confirmed),
    "partial_count": len(partial),
    "confirmed": confirmed,
    "partial": partial,
}
outpath = os.path.join(os.path.dirname(__file__), "am-kit-teardown-harvest.json")
with open(outpath, "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2)

print("HARVEST COMPLETE")
print(f"  files parsed:       {len(files)}")
print(f"  review dimensions:  {len(reviews)} -> {sorted(reviews.keys())}")
print(f"  verdict agents:     {len(verdict_rows)}")
print(f"  CONFIRMED (3-lens unanimous): {len(confirmed)}")
print(f"  partial (all-available-lenses-keep, <3 votes): {len(partial)}")
print(f"  written: {outpath}")
print()
print("=== CONFIRMED findings (severity, dimension, title) ===")
for r in confirmed:
    print(f"  [{r['severity']:8s}] {r['dimension']:24s} | {r['title']}")
print()
print("=== PARTIAL (likely-real, panel incomplete) ===")
for r in partial:
    nk = sum(1 for v in r['lens_votes'].values() if v)
    print(f"  [{r['severity']:8s}] {r['dimension']:24s} | {r['title']}  ({nk}/{r['n_votes']} lenses kept)")
