"""Validate locally captured Shift Hub images; does not operate the browser."""
import hashlib
import json
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PROOF = ROOT / "docs/rebuild/shift-hub-visual-proof-2026-09-07"
PATTERN = re.compile(r"(available|owner-candidates|swap|stale|manager-confirm)-(light|dark)-(320|390|768|1440)\.jpg")

rows = []
for path in sorted(PROOF.glob("*.jpg")):
    match = PATTERN.fullmatch(path.name)
    if not match:
        continue
    with Image.open(path) as image:
        assert image.format == "JPEG", path.name
        assert image.size == (int(match[3]), 720), (path.name, image.size)
        rows.append({
            "file": path.name,
            "scenario": match[1], "theme": match[2], "width": int(match[3]),
            "height": 720, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "evidence": "Real local browser capture; manual visual/DOM observations are recorded in README.md",
        })
assert len(rows) == 40, len(rows)
(PROOF / "manifest.json").write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"captures": len(rows), "dimensions": "PASS", "format": "JPEG"}))
