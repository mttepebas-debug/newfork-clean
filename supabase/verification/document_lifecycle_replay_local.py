"""BL-052 replay adapter for the established schema-only isolated replay runner.

Only the task-owned, networkless, portless scratch container is accepted.
Never creates, resets, or connects to the shared development database.
"""
import json
import hashlib
import re
import subprocess
import sys
from pathlib import Path
import availability_schedule_replay_local as replay

CONTAINER = "newfork-bl052-verify-20260915"
TASK = "01a0a77d-272e-7eb1-a405-94e860cc66f0"

def owned_container():
    meta = json.loads(replay.run(["docker", "inspect", CONTAINER]).stdout)[0]
    assert meta["Name"] == "/" + CONTAINER
    assert meta["Config"]["Labels"].get("newfork.verification") == "bl052-documents"
    assert meta["Config"]["Labels"].get("newfork.task") == TASK
    assert meta["HostConfig"]["NetworkMode"] == "none"
    assert not meta["HostConfig"]["PortBindings"] and not meta["HostConfig"]["Binds"]
    return meta

if __name__ == "__main__":
    replay.CONTAINER = CONTAINER
    replay.OUTPUT = Path(__file__).resolve().parents[1] / ".temp/bl052-document-replay"
    replay.owned_container = owned_container
    if sys.argv[1:] == ["--resume"]:
        meta = owned_container()
        report_path = replay.OUTPUT / "result.json"
        report = json.loads(report_path.read_text())
        assert report["container_id"] == meta["Id"]
        sources = [(p, p.read_bytes()) for p in sorted((replay.ROOT / "supabase/migrations").glob("*.sql"))]
        applied = [entry for entry in report["migrations"] if entry["exit_code"] == 0]
        for (path, content), entry in zip(sources, applied):
            assert path.name == entry["file"] and hashlib.sha256(content).hexdigest() == entry["sha256"], "Applied source changed"
        report["migrations"] = applied
        for path, content in sources[len(applied):]:
            result = subprocess.run(["docker", "exec", "-i", CONTAINER, "psql", "-X", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "--single-transaction"], input=content, capture_output=True)
            (replay.OUTPUT / (path.name + ".log")).write_bytes(result.stdout + result.stderr)
            report["migrations"].append({"file": path.name, "sha256": hashlib.sha256(content).hexdigest(), "exit_code": result.returncode})
            report_path.write_text(json.dumps(report, indent=2))
            if result.returncode:
                raise RuntimeError(path.name + ": " + result.stderr.decode(errors="replace")[-2500:])
            if len(report["migrations"]) % 25 == 0:
                print(json.dumps({"applied": len(report["migrations"]), "total": len(sources)}), flush=True)
        assert all(p.read_bytes() == content for p, content in sources), "Source changed during replay"
        report["status"] = "PASS"
        report["source_unchanged"] = True
        report_path.write_text(json.dumps(report, indent=2))
        print(json.dumps({"status": "PASS", "migrations": len(sources)}))
    elif not sys.argv[1:]:
        owned_container()
        assert replay.sql("select to_regclass('public.workspaces') is null") == "t", "Fresh scratch required"
        replay.run(["docker", "exec", CONTAINER, "psql", "-X", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "alter role postgres superuser"])
        replay.sql("""
          alter default privileges for role postgres in schema public revoke select,insert,update,delete on tables from anon,authenticated,service_role;
          alter default privileges for role postgres in schema public revoke select,usage on sequences from anon,authenticated,service_role;
          alter default privileges for role postgres in schema public revoke execute on functions from public,anon,authenticated,service_role;
        """)
        replay.main()
    elif sys.argv[1:] == ["--legacy-policy-check"]:
        owned_container()
        migration = replay.ROOT / "supabase/migrations/20260916005233_bl052_document_conflict_rules.sql"
        source = migration.read_text()
        fixture = (replay.ROOT / "supabase/tests/bl052_document_conflicts.test.sql").read_text().split("insert into auth.users(id,email) values('b152")[0]
        fixture += """
        insert into public.document_types(id,workspace_id,title,required_at_onboarding,accepted_formats,tracks_expiry,expiry_schedule_impact,created_by)
        select 'b1520000-0000-4000-8000-000000000098',w,'Legacy Block',true,array['pdf'],true,'block',actor from f;
        """
        # Execute the real conversion statements, without recreating the already
        # installed assessment adapter. The entire fixture rolls back.
        conversion = source.split("do $$")[0]
        conversion += "select app_private.record_security_audit_event_service" + source.split("select app_private.record_security_audit_event_service", 1)[1].split("create function app_private.document_shift_reasons", 1)[0]
        checks = """
        select is((select conflict_rules->>'document_required' from public.workspace_scheduling_settings where workspace_id=(select w from f)),'confirm','legacy Block migrates to approved central confirmation default');
        select is((select expiry_schedule_impact from public.document_types where id='b1520000-0000-4000-8000-000000000098'),'track_only','retired per-definition Block no longer drives a parallel conflict path');
        select ok(exists(select 1 from app_private.security_audit_events where event_type='document.legacy_severity_migrated' and resource_id_hash=encode(extensions.digest('b1520000-0000-4000-8000-000000000098','sha256'),'hex') and metadata->>'legacy_expiry_schedule_impact'='block' and actor_user_id is null and metadata->>'actor_kind'='system'),'former severity is retained in system audit without inventing a human actor');
        update public.workspace_scheduling_settings set conflict_rules=jsonb_set(conflict_rules,'{document_required}','"block"') where workspace_id=(select w from f);
        update public.workspace_scheduling_settings set minimum_rest_minutes=15 where workspace_id=(select w from f);
        select is((select conflict_rules->>'document_required' from public.workspace_scheduling_settings where workspace_id=(select w from f)),'block','later explicit central Block survives unrelated settings updates');
        select * from finish();rollback;
        """
        output = replay.sql(fixture + conversion + checks)
        (replay.OUTPUT / "legacy-policy.log").write_text(output)
        assert not re.search(r"^not ok", output, re.MULTILINE), output
        result = {"status": "PASS", "assertions": len(re.findall(r"^ok \d+", output, re.MULTILINE)), "source_sha256": hashlib.sha256(migration.read_bytes()).hexdigest()}
        (replay.OUTPUT / "legacy-policy.json").write_text(json.dumps(result, indent=2))
        print(json.dumps(result))
    else:
        raise SystemExit("Only --resume or --legacy-policy-check is supported")
