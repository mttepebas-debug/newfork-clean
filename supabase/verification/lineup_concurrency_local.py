"""Real two-connection Line Up race against the local test container only.

Run: python -X utf8 supabase/verification/lineup_concurrency_local.py
Creates a uniquely named workspace and one synthetic actor, then removes them.
Does not modify an existing workspace, availability, or employee.
"""
import json
import subprocess
import time
import uuid

CONTAINER = "supabase_db_newfork-clean"
OWNER = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5"
ids = {name: str(uuid.uuid4()) for name in (
    "workspace", "actor", "location", "department", "job", "service", "employee_a",
    "employee_b", "publication", "shift", "command_a", "command_b",
)}
w = ids["workspace"]
marker = "Line Up concurrency verification " + w


def args(application="lineup-verification"):
    return ["docker", "exec", "-i", "-e", "PGAPPNAME=" + application, CONTAINER,
            "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]


def sql(statement):
    result = subprocess.run(args(), input=statement, text=True, capture_output=True,
                            encoding="utf-8", timeout=25)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


def literal(value):
    return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"


def launch(application, statement):
    process = subprocess.Popen(args(application), stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, encoding="utf-8")
    process.stdin.write(statement)
    process.stdin.close()
    process.stdin = None
    return process


def observe(application, condition, process):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if sql(f"select exists(select 1 from pg_stat_activity where application_name='{application}' and {condition});") == "t":
            return
        if process.poll() is not None:
            output, error = process.communicate()
            raise AssertionError(f"Session ended before observation: {output} {error}")
        time.sleep(0.1)
    raise TimeoutError("Expected live PostgreSQL state was not observed: " + application)


def cleanup():
    # The generated id and exact generated name both have to match.
    if sql(f"select exists(select 1 from public.workspaces where id='{w}' and name='{marker}');") == "t":
        sql(f"""begin;
        update public.workspaces set lifecycle_status='deleted',closed_at=now(),closed_by='{OWNER}' where id='{w}' and name='{marker}';
        delete from public.workspace_memberships where workspace_id='{w}';
        delete from public.workspace_retention_purge_jobs where workspace_id='{w}';
        delete from public.schedule_lineups where workspace_id='{w}';
        delete from public.schedule_location_publications where workspace_id='{w}';
        delete from public.employee_profiles where workspace_id='{w}';
        delete from public.jobs where workspace_id='{w}';
        delete from public.departments where workspace_id='{w}';
        delete from public.shift_types where workspace_id='{w}';
        delete from public.locations where workspace_id='{w}';
        delete from public.workspaces where id='{w}' and name='{marker}';
        delete from auth.users where id='{ids['actor']}' and email='lineup-race-{w}@example.test';
        commit;""")
    assert sql(f"select count(*) from public.workspaces where id='{w}';") == "0"
    assert sql(f"select count(*) from auth.users where id='{ids['actor']}';") == "0"


def main():
    processes = []
    try:
        sql(f"""begin;
        insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
        values('{ids['actor']}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','lineup-race-{w}@example.test','','{{}}','{{}}',now(),now());
        insert into public.workspaces(id,name,created_by) values('{w}','{marker}','{OWNER}');
        insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations)
        values('{w}','{OWNER}','owner','active',true),('{w}','{ids['actor']}','admin','active',true);
        insert into public.locations(id,workspace_id,name,street_address,city,region,postal_code,timezone)
        values('{ids['location']}','{w}','Race floor','1 Test St','Test City','CA','90001','America/Los_Angeles');
        insert into public.departments(id,workspace_id,name) values('{ids['department']}','{w}','Service');
        insert into public.jobs(id,workspace_id,department_id,name) values('{ids['job']}','{w}','{ids['department']}','Server');
        insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time)
        values('{ids['service']}','{w}','Dinner','10:00','16:00');
        insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by)
        values('{ids['employee_a']}','{w}','E-0001','Candidate','A','{OWNER}'),('{ids['employee_b']}','{w}','E-0002','Candidate','B','{OWNER}');
        insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
        select '{w}',id,'{ids['location']}','{OWNER}' from public.employee_profiles where workspace_id='{w}';
        insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)
        select '{w}',id,'{ids['job']}','{OWNER}' from public.employee_profiles where workspace_id='{w}';
        insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by)
        select '{w}',id,1,'America/Los_Angeles',(select jsonb_agg(jsonb_build_object('day',n,'mode','unrestricted','windows','[]'::jsonb)) from generate_series(0,6) n),'manager','{OWNER}'
        from public.employee_profiles where workspace_id='{w}';
        insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
        values('{ids['publication']}','{w}','{ids['location']}','2031-01-06',1,'{OWNER}');
        insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
        values('{ids['shift']}','{w}','{ids['publication']}','{ids['location']}',null,'{ids['job']}','{ids['service']}','2031-01-06','10:00','16:00',gen_random_uuid());
        commit;""")
        target = {"date": "2031-01-06", "location_id": ids["location"], "job_id": ids["job"],
                  "shift_type_id": ids["service"], "start_time": "10:00", "end_time": "16:00",
                  "section_id": None, "station": "Race verification"}
        operations = [{"kind": "assign", "source_entry_id": ids["shift"], "target_entry_id": None,
                       "employee_id": ids[employee], "target": target, "reason": "Concurrent coverage verification",
                       "travel_minutes": 0} for employee in ("employee_a", "employee_b")]
        actors = [OWNER, ids["actor"]]
        previews = [json.loads(sql(f"select public.lineup_operation_preview('{actor}','{w}',{literal(operation)});"))
                    for actor, operation in zip(actors, operations)]
        assert all(preview["allowed"] for preview in previews), previews
        commits = [f"select public.lineup_operations_service('{actor}','{w}','apply',{literal({'operation': operation, 'fingerprint': preview['fingerprint'], 'idempotency_key': ids[key]})});"
                   for actor, operation, preview, key in zip(actors, operations, previews, ("command_a", "command_b"))]
        app_a, app_b = "lineup-race-a-" + w, "lineup-race-b-" + w
        first = launch(app_a, "begin;" + commits[0] + "select pg_sleep(8); commit;")
        processes.append(first)
        observe(app_a, "wait_event='PgSleep'", first)
        second = launch(app_b, "begin;" + commits[1] + "commit;")
        processes.append(second)
        observe(app_b, "wait_event_type='Lock'", second)
        print("PASS: two distinct manager sessions overlap; the second waits on the transaction lock.", flush=True)
        first_out, first_error = first.communicate(timeout=20)
        _, second_error = second.communicate(timeout=20)
        assert first.returncode == 0 and '"status": "applied"' in first_out, first_error
        assert second.returncode != 0 and "stale Line Up operation preview" in second_error, second_error
        assert sql(f"select employee_id from public.schedule_published_shifts where id='{ids['shift']}';") == ids["employee_a"]
        assert sql(f"select count(*) from public.lineup_operation_events where workspace_id='{w}';") == "1"
        assert sql(f"select count(*) from public.schedule_published_shifts where workspace_id='{w}' and employee_id='{ids['employee_b']}';") == "0"
        print("PASS: one assignment and audit event commit; the second manager cannot overwrite them.", flush=True)
    finally:
        for process in processes:
            if process.poll() is None:
                process.communicate(timeout=25)
        cleanup()
        print("PASS: the uniquely owned test workspace and synthetic actor were removed.", flush=True)


if __name__ == "__main__":
    main()
