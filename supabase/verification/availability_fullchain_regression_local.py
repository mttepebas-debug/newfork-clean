"""Availability integration suites after a fresh, complete local migration replay.

Use --seed exactly once on the empty owned full-chain DB. Subsequent invocations
only run transaction-rollback suites. No existing application DB can be seeded.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time

import availability_schedule_replay_local as replay

ROOT = Path(__file__).resolve().parents[2]


def digest(content):
    return hashlib.sha256(content).hexdigest()


def execute(content):
    return subprocess.run(["docker", "exec", "-i", replay.CONTAINER, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres",
                           "-v", "ON_ERROR_STOP=1"], input=content, capture_output=True, timeout=180)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", action="store_true")
    parser.add_argument("--run-id", default="20260907")
    args = parser.parse_args()
    replay.configure_full_chain(args.run_id)
    output_dir = replay.OUTPUT
    meta = replay.owned_container()
    manifest_bytes = (output_dir / "result.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    assert manifest["status"] == "PASS" and manifest["source_unchanged"]
    assert manifest["container_id"] == meta["Id"]
    migrations = {p.name: digest(p.read_bytes()) for p in sorted((ROOT / "supabase/migrations").glob("*.sql"))}
    assert migrations == {m["file"]: m["sha256"] for m in manifest["migrations"]}, "Replay does not match current migration files"
    seed_path = ROOT / "supabase/seed.sql"
    if args.seed:
        assert replay.sql("select (select count(*) from auth.users)+(select count(*) from public.workspaces)") == "0", "Never seed an existing application database"
        seed = seed_path.read_bytes()
        seeded = execute(b"begin;\n" + seed + b"\ncommit;")
        (output_dir / "seed.log").write_bytes(seeded.stdout + seeded.stderr)
        assert seeded.returncode == 0, seeded.stderr.decode(errors="replace")[-2500:]
        (output_dir / "seed-result.json").write_text(json.dumps({"sha256": digest(seed), "exit_code": 0, "container_id": meta["Id"]}, indent=2))
        print(json.dumps({"seed": "PASS"}), flush=True)
    seed_manifest = json.loads((output_dir / "seed-result.json").read_text())
    assert seed_manifest["container_id"] == meta["Id"] and seed_manifest["sha256"] == digest(seed_path.read_bytes())
    suites = [(p, p.read_bytes()) for p in sorted((ROOT / "supabase/tests").glob("*.test.sql"))
              if "availability" in p.name or "time_off" in p.name or p.name in (
                  "schedule_time_source.test.sql", "schedule_default_hours_review.test.sql", "function_execute_privileges.test.sql",
                  "scheduling_settings_shift_types_rls.test.sql", "shift_exchange_travel_policy.test.sql")]
    report = {"container_id": meta["Id"], "replay_manifest_sha256": digest(manifest_bytes), "seed_sha256": seed_manifest["sha256"], "suites": []}
    started = time.monotonic()
    for path, content in suites:
        suite_start = time.monotonic()
        result = execute(content)
        output = (result.stdout + result.stderr).decode(errors="replace")
        (output_dir / (path.name + ".log")).write_text(output, encoding="utf8")
        plans = re.findall(r"^1\.\.(\d+)\s*$", output, re.MULTILINE)
        assertions = re.findall(r"^ok (\d+)(?:\s|$)", output, re.MULTILINE)
        failures = re.findall(r"^not ok .*", output, re.MULTILINE)
        passed = result.returncode == 0 and len(plans) == 1 and int(plans[0]) == len(assertions) > 0 and not failures
        entry = {"file": path.name, "sha256": digest(content), "exit_code": result.returncode, "assertions": len(assertions),
                 "plan": int(plans[0]) if len(plans) == 1 else None, "failures": failures, "status": "PASS" if passed else "FAIL", "seconds": round(time.monotonic() - suite_start, 2)}
        report["suites"].append(entry)
        report["elapsed_seconds"] = round(time.monotonic() - started, 2)
        (output_dir / "regression-result.json").write_text(json.dumps(report, indent=2))
        print(json.dumps(entry), flush=True)
        if not passed:
            raise AssertionError(output[-6500:])
    assert all(p.read_bytes() == content for p, content in suites), "Test source changed during run"
    assert migrations == {p.name: digest(p.read_bytes()) for p in sorted((ROOT / "supabase/migrations").glob("*.sql"))}, "Migration files changed during run"
    report.update(status="PASS", source_unchanged=True, assertions=sum(x["assertions"] for x in report["suites"]))
    (output_dir / "regression-result.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({"status": "PASS", "suites": len(suites), "assertions": report["assertions"]}), flush=True)


if __name__ == "__main__":
    main()
