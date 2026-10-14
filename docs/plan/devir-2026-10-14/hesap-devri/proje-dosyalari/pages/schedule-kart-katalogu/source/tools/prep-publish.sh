#!/usr/bin/env bash
# Copies the built pages to a publish folder and adds the source band
# (/mnt/project-files/pages/kaynak-bandi/bant.py) to each copy, so a republish
# keeps the band. Usage: bash tools/prep-publish.sh <out dir> [page ids...]
set -euo pipefail
out="$1"; shift
here="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$out"
python3 - "$here/atlas.json" "$out" "$@" <<'PY'
import json, shutil, subprocess, sys
atlas, out, only = sys.argv[1], sys.argv[2], sys.argv[3:]
data = json.load(open(atlas))
rows = [(p["id"], p["url"]) for p in data["pages"] if p["id"] != "schedule"] + [("index", data["index"])]
for pid, url in rows:
    if only and pid not in only and pid != "index":
        continue
    dst = f"{out}/{pid}.html"
    shutil.copy(f"/mnt/project-files/pages/atlas/{pid}.html", dst)
    subprocess.run(["python3", "/mnt/project-files/pages/kaynak-bandi/bant.py", dst, url.rsplit("/", 1)[-1]], check=True)
    print(dst, url)
PY
