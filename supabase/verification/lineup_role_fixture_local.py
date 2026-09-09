"""Disposable local accounts/workspace for Line Up browser acceptance.

create STATE.json / cleanup STATE.json. Never sends email. Auth admin requests
are restricted to the local Supabase URL; cleanup requires the owned UUID/name.
"""
import json
from pathlib import Path
import sys
import uuid
import urllib.request
from lineup_visual_fixture_local import sql, quote, OWNER

ROOT = Path(__file__).resolve().parents[2]
DAY = "2026-09-14"


def auth(method, path, payload=None):
    env = {}
    for line in (ROOT / "apps/api/.env.local").read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    base = env["SUPABASE_URL"].rstrip("/")
    if base not in ("http://127.0.0.1:55321", "http://localhost:55321"):
        raise RuntimeError("This verifier only allows local Supabase port 55321")
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    request = urllib.request.Request(base + "/auth/v1/admin/" + path, method=method,
        headers={"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"},
        data=json.dumps(payload).encode() if payload is not None else None)
    with urllib.request.urlopen(request, timeout=20) as response:
        body = response.read()
        return json.loads(body) if body else {}


def create(path):
    if path.exists():
        raise RuntimeError("Clean the existing fixture before creating another")
    state = {"kind": "lineup-role-fixture-v1", "day": DAY, "users": {}, "password": "Local-Lineup-" + uuid.uuid4().hex}
    for name in ("workspace", "location_a", "location_b", "department", "job", "service", "employee_a", "employee_b", "publication_a", "publication_b", "shift_a", "shift_b"):
        state[name] = str(uuid.uuid4())
    state["name"] = "Line Up role verification " + state["workspace"]
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    for role in ("manager", "employee"):
        email = f"lineup-{role}-{state['workspace']}@example.test"
        user = auth("POST", "users", {"email": email, "password": state["password"], "email_confirm": True, "user_metadata": {"display_name": "Lineup QA " + role.title()}})
        state["users"][role] = {"id": user["id"], "email": email}
        path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    w, manager, employee = state["workspace"], state["users"]["manager"]["id"], state["users"]["employee"]["id"]
    statements = ["begin;", f"insert into public.workspaces(id,name,created_by) values('{w}',{quote(state['name'])},'{OWNER}');",
        f"insert into public.workspace_onboarding(workspace_id,status,current_step,completed_at,updated_by) values('{w}','complete',2,now(),'{OWNER}') on conflict(workspace_id) do update set status='complete',current_step=2,completed_at=now();",
        f"insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) values('{w}','{OWNER}','owner','active',true),('{w}','{manager}','manager','active',true),('{w}','{employee}','employee','active',true);",
        f"insert into public.user_profiles(user_id,display_name) values('{manager}','Lineup QA Manager'),('{employee}','Lineup QA Employee') on conflict(user_id) do update set display_name=excluded.display_name;",
        f"insert into public.departments(id,workspace_id,name) values('{state['department']}','{w}','Service');",
        f"insert into public.jobs(id,workspace_id,department_id,name) values('{state['job']}','{w}','{state['department']}','Server');",
        f"insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) values('{state['service']}','{w}','QA Dinner','16:00','22:00');"]
    for suffix, name in (("a", "QA Dining"), ("b", "QA Patio")):
        location, person = state['location_' + suffix], state['employee_' + suffix]
        user = quote(employee) if suffix == "a" else "null"
        statements += [f"insert into public.locations(id,workspace_id,name,street_address,city,region,postal_code,timezone) values('{location}','{w}','{name}','1 Test St','Test City','CA','90001','America/Los_Angeles');",
            f"insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by) values('{person}','{w}',{user},'E-{1 if suffix == "a" else 2:04d}','Lineup QA','{suffix.upper()}','{OWNER}');",
            f"insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by) values('{w}','{person}','{state['job']}','{OWNER}');",
            f"insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by) select '{w}','{person}',1,'America/Los_Angeles',jsonb_agg(jsonb_build_object('day',n,'mode','unrestricted','windows','[]'::jsonb)),'manager','{OWNER}' from generate_series(0,6) n;",
            f"insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by) values('{state['publication_' + suffix]}','{w}','{location}','{DAY}',1,'{manager}');",
            f"insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id) values('{state['shift_' + suffix]}','{w}','{state['publication_' + suffix]}','{location}','{person}','{state['job']}','{state['service']}','{DAY}','16:00','22:00',gen_random_uuid());"]
    statements += [f"insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) select '{w}',e.id,l.id,'{OWNER}' from public.employee_profiles e cross join public.locations l where e.workspace_id='{w}' and l.workspace_id='{w}';",
        f"insert into public.lineup_notes(workspace_id,location_id,date,category,content,visibility,pinned,updated_by) values('{w}','{state['location_a']}','{DAY}','priority','QA shared instruction: briefing at 15:45.','team',true,'{manager}'),('{w}','{state['location_a']}','{DAY}','instruction','QA PRIVATE manager instruction must stay hidden.','managers',false,'{manager}');", "commit;"]
    sql("\n".join(statements))
    print(json.dumps({"workspace": w, "date": DAY, "state": str(path), "manager": state['users']['manager']['email'], "employee": state['users']['employee']['email']}))


def cleanup(path):
    state = json.loads(path.read_text(encoding="utf-8"))
    if state.get("kind") != "lineup-role-fixture-v1":
        raise RuntimeError("Unknown fixture state")
    w = str(uuid.UUID(state["workspace"]))
    expected = "Line Up role verification " + w
    if state.get("name") != expected:
        raise RuntimeError("Unexpected fixture name")
    exists = sql(f"select count(*) from public.workspaces where id='{w}';")
    if exists != "0":
        if sql(f"select name from public.workspaces where id='{w}';") != expected:
            raise RuntimeError("Workspace ownership changed")
        sql(f"""begin;
        update public.workspaces set lifecycle_status='deleted',closed_at=now(),closed_by='{OWNER}' where id='{w}' and name={quote(expected)};
        delete from public.workspace_memberships where workspace_id='{w}';
        delete from public.workspace_retention_purge_jobs where workspace_id='{w}';
        delete from public.lineup_notification_outbox where workspace_id='{w}';
        delete from public.lineup_receipts where workspace_id='{w}';
        delete from public.schedule_lineup_snapshots where workspace_id='{w}';
        delete from public.notifications where workspace_id='{w}';
        delete from public.lineup_notes where workspace_id='{w}';
        delete from public.lineup_section_plans where workspace_id='{w}';
        delete from public.lineup_proposals where workspace_id='{w}';
        delete from public.lineup_operation_events where workspace_id='{w}';
        delete from public.schedule_lineups where workspace_id='{w}';
        delete from public.schedule_location_publications where workspace_id='{w}';
        delete from public.employee_profiles where workspace_id='{w}';
        delete from public.jobs where workspace_id='{w}';
        delete from public.departments where workspace_id='{w}';
        delete from public.shift_types where workspace_id='{w}';
        delete from public.locations where workspace_id='{w}';
        delete from public.workspaces where id='{w}' and name={quote(expected)};
        commit;""")
    for role, user in state["users"].items():
        user_id = str(uuid.UUID(user['id']))
        expected_email = f"lineup-{role}-{w}@example.test"
        if sql(f"select email from auth.users where id='{user_id}';") == expected_email:
            auth("DELETE", "users/" + user_id)
    assert sql(f"select count(*) from public.workspaces where id='{w}';") == "0"
    path.unlink()
    print("CLEANED: owned role-verification workspace and synthetic Auth accounts")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("create", "cleanup"):
        raise SystemExit(__doc__)
    (create if sys.argv[1] == "create" else cleanup)(Path(sys.argv[2]).resolve())
