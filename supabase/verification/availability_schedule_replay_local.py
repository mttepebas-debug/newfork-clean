"""Replay application migrations in the owned, network-isolated availability DB.

Provider schemas come from the schema-only local bootstrap used by the existing
replay verifier. No user rows are copied and no development DB is reset.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import re
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
CONTAINER = "newfork-availability-schedule-verify-20260907"
OUTPUT = ROOT / "supabase/.temp/availability-schedule-replay"


def configure_full_chain(run_id="20260907"):
    global CONTAINER, OUTPUT
    assert re.fullmatch(r"\d{8}(?:-r[1-9]\d*)?", run_id), "Expected YYYYMMDD or YYYYMMDD-rN run id"
    CONTAINER = "newfork-availability-fullchain-" + run_id
    OUTPUT = ROOT / ("supabase/.temp/availability-fullchain-" + run_id)


def run(args, content=None):
    result = subprocess.run(args, input=content, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace")[-3500:])
    return result


def sql(statement):
    return run(["docker", "exec", "-i", CONTAINER, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], statement.encode()).stdout.decode().strip()


def owned_container():
    meta = json.loads(run(["docker", "inspect", CONTAINER]).stdout)[0]
    assert meta["Name"] == "/" + CONTAINER
    assert meta["Config"]["Labels"].get("newfork.verification") == "availability-schedule"
    assert meta["HostConfig"]["NetworkMode"] == "none" and not meta["HostConfig"]["PortBindings"]
    assert not meta["HostConfig"]["Binds"]
    return meta


def main():
    meta = owned_container()
    assert sql("select to_regclass('public.workspaces') is null") == "t", "Never reset an existing application database"
    if sql("select to_regclass('auth.users') is not null") == "t":
        assert sql("select count(*) from auth.users") == "0", "Only an empty provider bootstrap is allowed"
    OUTPUT.mkdir(parents=True, exist_ok=True)
    bootstrap = ROOT / "supabase/.temp/shift-exchange-replay"
    for name in ("managed-schemas.dump", "managed-schemas.list"):
        assert (bootstrap / name).is_file()
        run(["docker", "cp", str(bootstrap / name), CONTAINER + ":/tmp/availability-" + name])
    # This is a fresh, owned scratch container verified above, not the user's DB.
    owners = sorted(set(re.findall(r"\b(supabase_[a-z_]+)\s*$", (bootstrap / "managed-schemas.list").read_text(), re.MULTILINE)))
    roles = "".join(f"do $$ begin if not exists(select 1 from pg_roles where rolname='{owner}') then create role {owner} nologin; end if; end; $$;" for owner in owners)
    run(["docker", "exec", CONTAINER, "psql", "-X", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", roles + "drop schema if exists auth cascade; drop schema if exists storage cascade; drop schema if exists realtime cascade;"])
    restored = run(["docker", "exec", CONTAINER, "pg_restore", "-U", "supabase_admin", "-d", "postgres", "--exit-on-error", "--use-list=/tmp/availability-managed-schemas.list", "/tmp/availability-managed-schemas.dump"])
    (OUTPUT / "bootstrap.log").write_bytes(restored.stdout + restored.stderr)
    report = {"container_id": meta["Id"], "container": CONTAINER, "network": "none", "bootstrap": "schema-only provider snapshot; no user rows", "migrations": []}
    files = [(p, p.read_bytes()) for p in sorted((ROOT / "supabase/migrations").glob("*.sql"))]
    started = time.monotonic()
    for path, content in files:
        result = subprocess.run(["docker", "exec", "-i", CONTAINER, "psql", "-X", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "--single-transaction"], input=content, capture_output=True)
        (OUTPUT / (path.name + ".log")).write_bytes(result.stdout + result.stderr)
        report["migrations"].append({"file": path.name, "sha256": hashlib.sha256(content).hexdigest(), "exit_code": result.returncode})
        report["elapsed_seconds"] = round(time.monotonic() - started, 2)
        (OUTPUT / "result.json").write_text(json.dumps(report, indent=2))
        if result.returncode:
            raise RuntimeError(path.name + ": " + result.stderr.decode(errors="replace")[-2500:])
        if len(report["migrations"]) % 25 == 0:
            print(json.dumps({"applied": len(report["migrations"]), "total": len(files), "latest": path.name}), flush=True)
    assert [p for p, _ in files] == sorted((ROOT / "supabase/migrations").glob("*.sql")), "Migration inventory changed during replay"
    assert all(p.read_bytes() == content for p, content in files), "Migration files changed during replay"
    report["status"] = "PASS"
    report["source_unchanged"] = True
    (OUTPUT / "result.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({"status": "PASS", "migrations": len(files)}))


if __name__ == "__main__":
    if sys.argv[1:] == ["--regression"]:
        CONTAINER = "newfork-availability-schedule-regression-20260907"
        OUTPUT = ROOT / "supabase/.temp/availability-schedule-regression"
    elif sys.argv[1:2] == ["--full-chain"] and len(sys.argv) in (2, 3):
        configure_full_chain(sys.argv[2] if len(sys.argv) == 3 else "20260907")
    elif sys.argv[1:]:
        raise SystemExit("Only --regression or --full-chain [YYYYMMDD-rN] is supported")
    main()
