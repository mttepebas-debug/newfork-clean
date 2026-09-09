"""Real two-connection Availability / publication / leave races, isolated DB only."""
from datetime import date, timedelta
import json
import subprocess
import time
import uuid
from availability_schedule_replay_local import CONTAINER, OUTPUT, owned_container, sql

W = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd"
MANAGER = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5"
LOCATION = "11000000-0000-4000-8000-000000000001"
JOB = "13000000-0000-4000-8000-000000000001"


def literal(value):
    return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"


def availability(actor, employee, proposal, revision):
    command = {"action": "submit", "employee_id": employee, "expected_revision": revision, "proposal": proposal}
    return f"select public.availability_command_service('{actor}','{W}',{literal(command)},'{uuid.uuid4()}')"


def fixture(index, first_week):
    employee, actor, shift, draft, request = [str(uuid.uuid4()) for _ in range(5)]
    week = first_week + timedelta(days=index * 14)
    proposal = {"timezone": "America/Los_Angeles", "effective_from": str(week), "effective_until": str(week + timedelta(days=6)),
                "kind": "temporary", "days": [{"day": d, "mode": "unrestricted", "windows": []} for d in range(7)]}
    sql(f"""begin;
      update public.workspace_scheduling_settings set availability_ownership='hybrid',availability_approval='none',availability_initial_review=false,availability_notice_days=0,availability_enforcement='hard' where workspace_id='{W}';
      insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
       values('{actor}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','{actor}@availability.test','','{{}}','{{}}',now(),now());
      insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) values('{W}','{actor}','employee','active',true);
      insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
       values('{employee}','{W}','{actor}','E-{uuid.UUID(employee).int}','Race','Availability','{MANAGER}');
      insert into public.employee_location_assignments(workspace_id,employee_id,location_id,is_primary,created_by) values('{W}','{employee}','{LOCATION}',true,'{MANAGER}');
      insert into public.employee_job_assignments(workspace_id,employee_id,job_id,is_primary,created_by) values('{W}','{employee}','{JOB}',true,'{MANAGER}');
      {availability(actor,employee,proposal,0)};
      insert into public.schedule_drafts(id,workspace_id,week_start,name,created_by,updated_by) values('{draft}','{W}','{week}','Availability race {index}','{MANAGER}','{MANAGER}');
      insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
       values('{shift}','{W}','{draft}','{LOCATION}','{employee}','{JOB}','{week}','12:00','16:00','explicit','America/Los_Angeles');
      insert into public.schedule_time_off_requests(id,workspace_id,employee_id,location_id,status,created_by) values('{request}','{W}','{employee}','{LOCATION}','pending','{actor}');
      insert into public.schedule_time_off_segments(workspace_id,request_id,segment_date,start_time,end_time,status) values('{W}','{request}','{week}','13:00','14:00','pending');
      commit;""")
    preview = json.loads(sql(f"select public.preview_schedule_publication_service('{MANAGER}','{W}','{draft}',array['{LOCATION}']::uuid[])"))
    assert preview["status"] == "publish_ready", preview
    publish = f"select public.publish_schedule_draft_service('{MANAGER}','{W}','{draft}',array['{LOCATION}']::uuid[],1,'{preview['fingerprint']}','[]'::jsonb)"
    # A new baseline replaces this fixture's initial finite temporary report explicitly.
    initial_version = sql(f"select id from public.employee_schedule_availability_versions where workspace_id='{W}' and employee_id='{employee}'")
    proposal["days"][1] = {"day": 1, "mode": "windows", "windows": [{"start": "00:00", "end": "10:00"}, {"start": "17:00", "end": "24:00"}]}
    change = {"action": "submit", "employee_id": employee, "expected_revision": 1, "proposal": proposal, "replace_version_ids": [initial_version]}
    return {"employee": employee, "actor": actor, "shift": shift, "week": str(week), "draft": draft, "request": request,
            "publish": publish, "availability": f"select public.availability_command_service('{actor}','{W}',{literal(change)},'{uuid.uuid4()}')",
            "leave": f"select public.resolve_schedule_time_off_request_service('{MANAGER}','{W}','{request}',1,'approve','Race approval','[]')"}


def launch(name, operation, hold=False):
    process = subprocess.Popen(["docker", "exec", "-i", "-e", "PGAPPNAME="+name, CONTAINER, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    statement = "\\set VERBOSITY verbose\nbegin; set local statement_timeout='20s'; " + operation + ";"
    if hold:
        statement += "select pg_sleep(3);"
    process.stdin.write((statement + "commit;").encode())
    process.stdin.close()
    process.stdin = None
    return process


def observe(name, event, process):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if sql(f"select exists(select 1 from pg_stat_activity where application_name='{name}' and wait_event='{event}')") == "t":
            return
        if process.poll() is not None:
            raise AssertionError("Operation ended before observed wait: " + str(result(process)))
        time.sleep(.1)
    raise AssertionError("Did not observe " + event)


def result(process):
    out, err = process.communicate(timeout=25)
    return {"exit": process.returncode, "rows": [json.loads(row) for row in out.decode().splitlines() if row.startswith("{")], "error": err.decode().strip()}


def main():
    owned_container()
    assert sql("select to_regprocedure('public.guard_schedule_assignment_availability()') is not null") == "t"
    report = []
    latest = sql(f"select max(week_start) from public.schedule_location_publications where workspace_id='{W}'")
    first_week = date.today() - timedelta(days=date.today().weekday()) + timedelta(days=2100)
    if latest:
        first_week = max(first_week, date.fromisoformat(latest) + timedelta(days=14))
    for index, (kind, first) in enumerate([("availability", "change"), ("availability", "publish"), ("leave", "change"), ("leave", "publish"), ("raw_leave", "publish")]):
        s = fixture(index, first_week)
        change = s[kind] if kind != "raw_leave" else f"update public.schedule_time_off_requests set status='approved',revision=revision+1 where id='{s['request']}'"
        name = "availability-race-" + uuid.uuid4().hex
        one = launch(name+"-one", s["publish"] if first == "publish" else change, True)
        two = None
        try:
            observe(name+"-one", "PgSleep", one)
            two = launch(name+"-two", change if first == "publish" else s["publish"])
            if kind != "raw_leave":
                observe(name+"-two", "advisory", two)
            second_result = result(two)
            first_result = result(one)
        finally:
            for process in (one, two):
                if process is not None and process.poll() is None:
                    process.terminate()
                    process.wait(timeout=5)
        assert first_result["exit"] == 0, first_result
        state = json.loads(sql(f"""select jsonb_build_object(
          'versions',(select max(version_number) from public.employee_schedule_availability_versions where employee_id='{s['employee']}'),
          'assigned',(select count(*) from public.schedule_published_shifts where workspace_id='{W}' and source_shift_id='{s['shift']}' and employee_id='{s['employee']}'),
          'leave_status',(select status from public.schedule_time_off_requests where id='{s['request']}'))"""))
        if kind == "availability":
            assert second_result["exit"] != 0, second_result
            if first == "publish":
                assert state["assigned"] == 1 and state["versions"] == 1, state
                assert "published" in second_result["error"].lower(), second_result
            else:
                assert state["assigned"] == 0 and state["versions"] == 2, state
                assert "stale" in second_result["error"].lower(), second_result
        elif kind == "raw_leave":
            assert second_result["exit"] != 0 and "PT409" in second_result["error"], second_result
            assert state["assigned"] == 1 and state["leave_status"] == "pending", state
        elif first == "change":
            assert second_result["exit"] != 0 and state["assigned"] == 0 and state["leave_status"] == "approved", (second_result, state)
        else:
            # Serialization proof only: P5 must add an explicit assignment
            # disposition to leave approval. Approval itself does not release it.
            assert second_result["exit"] == 0 and state["assigned"] == 1 and state["leave_status"] == "approved", (second_result, state)
        report.append({"kind": kind, "first": first, "observed_wait": "advisory" if kind != "raw_leave" else "fail_fast", "first_result": first_result, "second_result": second_result, "state": state})
        (OUTPUT / "races.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({"status": "PASS", "scenarios": len(report)}))


if __name__ == "__main__":
    main()
