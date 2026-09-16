"""Classify BL-037 fixture impact in its owned replay DB; never shared storage.

Baseline comparison = HEAD fixture with only BL-037 short-name schema additions
transactionally removed from the same replay snapshot. It is NOT a clean HEAD
replay (concurrent BL-052 migrations remain in both sides).
"""
import hashlib
import json
import re
import subprocess
from pathlib import Path
import export_v2_replay_local as export
import availability_schedule_replay_local as replay

ROOT = replay.ROOT
OUTPUT = ROOT / "supabase/.temp/bl037-export-replay"

def execute(content):
    return subprocess.run(["docker", "exec", "-i", export.CONTAINER, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], input=content, capture_output=True, timeout=180)

def digest(content):
    return hashlib.sha256(content).hexdigest()

def suite(path, content, label):
    result = execute(content)
    output = (result.stdout + result.stderr).decode(errors="replace")
    (OUTPUT / (label + "-" + path.name + ".log")).write_text(output, encoding="utf8")
    plans = re.findall(r"^1\.\.(\d+)\s*$", output, re.MULTILINE)
    passed = re.findall(r"^ok \d+(?:\s|$)", output, re.MULTILINE)
    failures = re.findall(r"^not ok .*|^ERROR:.*|^# (?:Failed|       (?:have|want|caught|wanted)).*", output, re.MULTILINE)
    ok = result.returncode == 0 and len(plans) == 1 and len(passed) == int(plans[0]) and not failures
    return {"file": path.name, "sha256": digest(content), "status": "PASS" if ok else "FAIL", "passed": len(passed), "plan": plans, "failures": failures, "exit_code": result.returncode}

if __name__ == "__main__":
    meta = export.owned_container()
    replay.CONTAINER = export.CONTAINER
    manifest = json.loads((OUTPUT / "result.json").read_text())
    assert manifest["status"] == "PASS" and manifest["container_id"] == meta["Id"]
    migration_hashes = {p.name: digest(p.read_bytes()) for p in (ROOT / "supabase/migrations").glob("*.sql")}
    assert migration_hashes == {m["file"]: m["sha256"] for m in manifest["migrations"]}, "Migration snapshot changed"
    replay.sql("create extension if not exists pgtap")
    assert replay.sql("select (select count(*) from auth.users)+(select count(*) from public.workspaces)") == "0", "Seed only empty owned DB"
    seed = (ROOT / "supabase/seed.sql").read_bytes()
    seeded = execute(b"begin;\n" + seed + b"\ncommit;")
    (OUTPUT / "seed.log").write_bytes(seeded.stdout + seeded.stderr)
    baseline_prefix = b"begin; drop trigger locations_require_short_name on public.locations; alter table public.locations drop column short_name;\n"
    seed_errors = re.findall(r"^ERROR:.*", seeded.stderr.decode(errors="replace"), re.MULTILINE)
    seed_report = {"status": "PASS" if seeded.returncode == 0 else "FAIL", "errors": seed_errors}
    if seeded.returncode:
        original_seed = replay.run(["git", "show", "HEAD:supabase/seed.sql"]).stdout
        baseline_seed = execute(baseline_prefix + original_seed + b"\nrollback;")
        (OUTPUT / "seed-baseline.log").write_bytes(baseline_seed.stdout + baseline_seed.stderr)
        baseline_errors = re.findall(r"^ERROR:.*", baseline_seed.stderr.decode(errors="replace"), re.MULTILINE)
        seed_report.update(baseline_errors=baseline_errors, classification="preexisting-in-same-snapshot" if seed_errors == baseline_errors else "needs-investigation")
        assert replay.sql("select (select count(*) from auth.users)+(select count(*) from public.workspaces)") == "0", "Failed seed must leave no rows"
    names = replay.run(["git", "diff", "--name-only", "--", "supabase/tests"]).stdout.decode().splitlines()
    paths = [ROOT / name for name in names if name.endswith(".test.sql")]
    paths.append(ROOT / "supabase/tests/location_short_names.test.sql")
    sources = [(path, path.read_bytes()) for path in paths]
    report = {"container_id": meta["Id"], "seed_sha256": digest(seed), "seed": seed_report, "head": replay.run(["git", "rev-parse", "HEAD"]).stdout.decode().strip(),
              "baseline_method": __doc__, "migration_manifest_sha256": digest((OUTPUT / "result.json").read_bytes()), "suites": []}
    for path, content in sources:
        entry = {"current": suite(path, content, "current")}
        if entry["current"]["status"] == "FAIL" and path.name != "location_short_names.test.sql":
            original = replay.run(["git", "show", "HEAD:" + path.relative_to(ROOT).as_posix()]).stdout
            entry["baseline"] = suite(path, baseline_prefix + original, "baseline")
            entry["classification"] = "preexisting-in-same-snapshot" if entry["baseline"]["failures"] == entry["current"]["failures"] and entry["baseline"]["exit_code"] == entry["current"]["exit_code"] else "needs-investigation"
        report["suites"].append(entry)
        (OUTPUT / "regression-result.json").write_text(json.dumps(report, indent=2))
        print(json.dumps({"file": path.name, "status": entry["current"]["status"], "classification": entry.get("classification")}), flush=True)
    assert all(path.read_bytes() == content for path, content in sources), "Fixture snapshot changed"
    assert migration_hashes == {p.name: digest(p.read_bytes()) for p in (ROOT / "supabase/migrations").glob("*.sql")}, "Migration snapshot changed"
    report["source_unchanged"] = True
    (OUTPUT / "regression-result.json").write_text(json.dumps(report, indent=2))
