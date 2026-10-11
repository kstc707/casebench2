"""Slim the researcher's tasks.json + out_*.json into spike-tasks.json for the 5 tasks.
usage: python3 -I prep.py <research/spike dir> <out file>
issueIds = tests that fail before and pass after (failToPass);
checkIds = every test that passes after (failToPass + passToPass)."""
import json, os, sys
src, out = sys.argv[1], sys.argv[2]
tasks = json.load(open(os.path.join(src, "tasks.json")))
res = {}
for pr in ["33127", "33643", "33176", "34815", "33362"]:
    b = json.load(open(os.path.join(src, f"out_{pr}_before.json")))["outcomes"]
    a = json.load(open(os.path.join(src, f"out_{pr}_after.json")))["outcomes"]
    t = tasks[pr]
    res[pr] = {
        "before": t["before"], "after": t["after"],
        "issueIds": sorted(k for k, v in a.items() if v == "passed" and b.get(k) != "passed"),
        "checkIds": sorted(k for k, v in a.items() if v == "passed"),
    }
json.dump(res, open(out, "w"), sort_keys=True)
print({pr: (len(r["issueIds"]), len(r["checkIds"])) for pr, r in res.items()})
