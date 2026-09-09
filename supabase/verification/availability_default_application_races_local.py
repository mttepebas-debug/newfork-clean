"""Observed two-connection races against the labelled, isolated verification DB.

No main/hosted database is accepted. Committed synthetic audit records remain in
the isolated DB; owned edit leases are discarded and fixture settings archived.
"""
from datetime import date, timedelta
import json
from pathlib import Path
import subprocess
import time
import uuid

from availability_schedule_replay_local import CONTAINER, owned_container, sql

W = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd"
MANAGER = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5"
OUTPUT = Path(__file__).resolve().parents[2] / ".temp/availability-time-off-v2/default-application-races.json"


def literal(value):
    return "'" + json.dumps(value).replace("'", "''") + "'::jsonb"


def fixture(week):
    f = {key: str(uuid.uuid4()) for key in ("location", "job", "type", "employee", "actor", "shift")}
    f["week"] = str(week)
    proposal = {"timezone": "UTC", "effective_from": str(week), "effective_until": str(week + timedelta(days=6)),
                "kind": "temporary", "days": [{"day": d, "mode": "unrestricted", "windows": []} for d in range(7)]}
    initial = {"action": "submit", "employee_id": f["employee"], "expected_revision": 0, "proposal": proposal}
    sql(f"""begin;
      insert into public.locations(id,workspace_id,name,timezone,street_address,city,region,postal_code)
       values('{f['location']}','{W}','Default race {f['location']}','UTC','1 Test St','Test','CA','94000');
      insert into public.jobs(id,workspace_id,name) values('{f['job']}','{W}','Default race {f['job']}');
      insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time)
       values('{f['type']}','{W}','Default race {f['type']}','12:00','16:00');
      insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
       values('{f['actor']}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','{f['actor']}@availability.test','','{{}}','{{}}',now(),now());
      insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations)
       values('{W}','{f['actor']}','employee','active',true);
      insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
       values('{f['employee']}','{W}','{f['actor']}','E-{uuid.UUID(f['employee']).int}','Default race','Employee','{MANAGER}');
      insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
       values('{W}','{f['employee']}','{f['location']}','{MANAGER}');
      insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)
       values('{W}','{f['employee']}','{f['job']}','{MANAGER}');
      select public.availability_command_service('{f['actor']}','{W}',{literal(initial)},'{uuid.uuid4()}'); commit;
    """)
    session = json.loads(sql(f"select public.acquire_schedule_edit_session_service('{MANAGER}','{W}','{week}','blank',null)"))
    f["session"] = session["session"]["id"]
    payload = {"employee_id": f["employee"], "location_id": f["location"], "job_id": f["job"],
               "shift_type_id": f["type"], "scheduled_date": str(week), "time_basis": "type_default", "hide_time_on_badge": True}
    sql(f"select public.mutate_schedule_edit_shift_service('{MANAGER}','{W}','{f['session']}',revision,'create','{f['shift']}',null,{literal(payload)},'{uuid.uuid4()}') from public.schedule_edit_sessions where id='{f['session']}'")
    sql(f"update public.shift_types set default_start_time='11:00',default_end_time='17:00' where id='{f['type']}'")
    f["revision"] = int(sql(f"select revision from public.schedule_edit_sessions where id='{f['session']}'"))
    command = {"expected_session_revision": f["revision"], "starts_on": str(week), "ends_on": str(week + timedelta(days=6)),
               "shift_ids": [f["shift"]], "overrides": []}
    preview = json.loads(sql(f"select public.preview_schedule_default_hours_service('{MANAGER}','{W}','{f['session']}',{literal(command)})"))
    assert preview["changed_count"] == 1 and preview["blocked_count"] == 0, preview
    command.update(fingerprint=preview["fingerprint"], idempotency_key=str(uuid.uuid4()), acknowledge_reference_overlaps=False)
    f["apply"] = f"select public.apply_schedule_default_hours_service('{MANAGER}','{W}','{f['session']}',{literal(command)})"
    f["settings"] = f"""set local role authenticated; select set_config('request.jwt.claim.sub','{MANAGER}',true);
      with changed as (update public.shift_types set default_start_time='10:00',default_end_time='18:00'
       where workspace_id='{W}' and id='{f['type']}' and default_revision=2 returning id)
      select jsonb_build_object('updated',count(*)) from changed"""
    f["assignment"] = f"""select public.mutate_schedule_edit_shift_service('{MANAGER}','{W}','{f['session']}',{f['revision']},
      'update','{f['shift']}',1,to_jsonb(s)||jsonb_build_object('employee_id',null),'{uuid.uuid4()}')
      from public.schedule_edit_session_shifts s where session_id='{f['session']}' and id='{f['shift']}'"""
    version = sql(f"select id from public.employee_schedule_availability_versions where employee_id='{f['employee']}'")
    proposal["days"][1] = {"day": 1, "mode": "unavailable", "windows": []}
    change = {"action": "submit", "employee_id": f["employee"], "expected_revision": 1, "proposal": proposal, "replace_version_ids": [version]}
    f["availability"] = f"select public.availability_command_service('{f['actor']}','{W}',{literal(change)},'{uuid.uuid4()}')"
    return f


def prepare_publication(f, reopen=False):
    draft = json.loads(sql(f"select public.save_schedule_edit_session_service('{MANAGER}','{W}','{f['session']}',{f['revision']},'Default publication race',null,null)"))
    f["draft"] = draft["id"]
    preview = json.loads(sql(f"select public.preview_schedule_publication_service('{MANAGER}','{W}','{f['draft']}',array['{f['location']}']::uuid[])"))
    assert preview["status"] == "publish_ready", preview
    revision = int(sql(f"select revision from public.schedule_drafts where id='{f['draft']}'"))
    f["publish"] = f"select public.publish_schedule_draft_service('{MANAGER}','{W}','{f['draft']}',array['{f['location']}']::uuid[],{revision},'{preview['fingerprint']}','[]'::jsonb)"
    if reopen:
        session = json.loads(sql(f"select public.acquire_schedule_edit_session_service('{MANAGER}','{W}','{f['week']}','draft','{f['draft']}')"))["session"]
        f["session"], f["revision"] = session["id"], session["revision"]
        command = {"expected_session_revision": f["revision"], "starts_on": f["week"],
                   "ends_on": str(date.fromisoformat(f["week"]) + timedelta(days=6)), "shift_ids": [f["shift"]], "overrides": []}
        review = json.loads(sql(f"select public.preview_schedule_default_hours_service('{MANAGER}','{W}','{f['session']}',{literal(command)})"))
        assert review["changed_count"] == 1 and review["blocked_count"] == 0, review
        command.update(fingerprint=review["fingerprint"], idempotency_key=str(uuid.uuid4()), acknowledge_reference_overlaps=False)
        f["apply"] = f"select public.apply_schedule_default_hours_service('{MANAGER}','{W}','{f['session']}',{literal(command)})"


def launch(name, operation, hold=False):
    process = subprocess.Popen(["docker", "exec", "-i", "-e", "PGAPPNAME=" + name, CONTAINER, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    statement = "\\set VERBOSITY verbose\nbegin; set local statement_timeout='20s'; " + operation + ";"
    if hold:
        statement += "select pg_sleep(5);"
    process.stdin.write(statement + "commit;")
    process.stdin.close()
    process.stdin = None
    return process


def result(process):
    out, err = process.communicate(timeout=25)
    return {"exit": process.returncode, "sqlstate": next((s for s in ("40001", "23514", "PT409", "40P01") if s in err), None),
            "error": err.strip(), "json_rows": [json.loads(line) for line in out.splitlines() if line.startswith("{")]}


def observe(name, event, process):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if sql(f"select exists(select 1 from pg_stat_activity where application_name='{name}' and wait_event='{event}')") == "t":
            return
        if process.poll() is not None:
            raise AssertionError("Operation ended before observed wait: " + str(result(process)))
        time.sleep(.05)
    raise AssertionError("Did not observe " + event)


def state(f):
    return json.loads(sql(f"""select jsonb_build_object(
      'type_revision',(select default_revision from public.shift_types where id='{f['type']}'),
      'shift_start',(select start_time from public.schedule_edit_session_shifts where session_id='{f['session']}' and id='{f['shift']}'),
      'shift_default_revision',(select time_snapshot->'default_revision' from public.schedule_edit_session_shifts where session_id='{f['session']}' and id='{f['shift']}'),
      'shift_employee',(select employee_id from public.schedule_edit_session_shifts where session_id='{f['session']}' and id='{f['shift']}'),
      'reviews',(select count(*) from public.schedule_default_hours_reviews where session_id='{f['session']}'),
      'versions',(select max(version_number) from public.employee_schedule_availability_versions where employee_id='{f['employee']}'),
      'published',(select count(*) from public.schedule_published_shifts where workspace_id='{W}' and source_shift_id='{f['shift']}' and employee_id='{f['employee']}'),
      'published_start',(select min(start_time) from public.schedule_published_shifts where workspace_id='{W}' and source_shift_id='{f['shift']}'))"""))


def cleanup(f):
    if sql(f"select exists(select 1 from public.schedule_edit_sessions where id='{f['session']}' and status='active')") == "t":
        sql(f"select public.discard_schedule_edit_session_service('{MANAGER}','{W}','{f['session']}')")
    sql(f"""begin;
      update public.shift_types set archived_at=now() where id='{f['type']}';
      update public.jobs set archived_at=now() where id='{f['job']}';
      update public.locations set archived_at=now() where id='{f['location']}'; commit;""")


def main():
    owned_container()
    original = json.loads(sql(f"select to_jsonb(s) from public.workspace_scheduling_settings s where workspace_id='{W}'"))
    settings = ("availability_ownership", "availability_approval", "availability_initial_review", "availability_notice_days", "availability_enforcement")
    sql(f"update public.workspace_scheduling_settings set availability_ownership='hybrid',availability_approval='none',availability_initial_review=false,availability_notice_days=0,availability_enforcement='hard' where workspace_id='{W}'")
    report = {"database": CONTAINER, "scenarios": []}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    latest = sql(f"select greatest(max(week_start),current_date+2100) from public.schedule_edit_sessions where workspace_id='{W}'")
    first_week = date.fromisoformat(latest) + timedelta(days=14)
    first_week -= timedelta(days=first_week.weekday())
    try:
        pairs = [("apply", "settings", "transactionid"), ("settings", "apply", "transactionid"),
                 ("apply", "assignment", "advisory"), ("assignment", "apply", "advisory"),
                 ("availability", "publish", "advisory"), ("publish", "availability", "advisory"),
                 ("apply", "publish", "advisory"), ("publish", "apply", "advisory")]
        for index, (first, second, event) in enumerate(pairs):
            f = fixture(first_week + timedelta(days=index * 14))
            one = two = None
            try:
                if "publish" in (first, second):
                    prepare_publication(f, reopen="apply" in (first, second))
                name = "default-apply-race-" + uuid.uuid4().hex
                one = launch(name + "-one", f[first], True)
                observe(name + "-one", "PgSleep", one)
                two = launch(name + "-two", f[second])
                observe(name + "-two", event, two)
                second_result, first_result = result(two), result(one)
                assert first_result["exit"] == 0, first_result
                current = state(f)
                draft_publication_race = {first, second} == {"apply", "publish"}
                if draft_publication_race:
                    assert second_result["exit"] == 0, second_result
                    assert current["reviews"] == 1 and current["shift_start"] == "11:00:00" and current["shift_default_revision"] == 2, current
                    assert current["published"] == 1 and current["published_start"] == "12:00:00" and current["versions"] == 1, current
                elif second == "settings":
                    assert second_result["exit"] == 0 and second_result["json_rows"][-1] == {"updated": 1}, second_result
                    assert current["type_revision"] == 3 and current["shift_default_revision"] == 2 and current["shift_start"] == "11:00:00" and current["reviews"] == 1, current
                else:
                    expected = "23514" if second == "availability" else "PT409" if second == "publish" else "40001"
                    assert second_result["exit"] != 0 and second_result["sqlstate"] == expected, second_result
                if first == "settings":
                    assert current["type_revision"] == 3 and current["shift_default_revision"] == 1 and current["shift_start"] == "12:00:00" and current["reviews"] == 0, current
                elif first == "apply":
                    assert current["reviews"] == 1 and current["shift_employee"] == f["employee"], current
                elif first == "assignment":
                    assert current["reviews"] == 0 and current["shift_employee"] is None and current["shift_start"] == "12:00:00", current
                elif first == "availability":
                    assert current["versions"] == 2 and current["published"] == 0, current
                elif first == "publish":
                    assert current["versions"] == 1 and current["published"] == 1 and current["published_start"] == "12:00:00", current
                report["scenarios"].append({"first": first, "second": second, "holder_wait_observed": "PgSleep", "contender_wait_observed": event,
                    "first_exit": first_result["exit"], "second_exit": second_result["exit"], "second_sqlstate": second_result["sqlstate"], "state": current,
                    "fixtures": {key: f[key] for key in ("location", "job", "type", "employee", "shift", "session", "week")}})
                OUTPUT.write_text(json.dumps(report, indent=2), encoding="utf8")
                print(json.dumps({"first": first, "second": second, "status": "PASS"}), flush=True)
            finally:
                for process in (one, two):
                    if process is not None and process.poll() is None:
                        process.communicate(timeout=25)
                cleanup(f)
    finally:
        restore = ",".join(f"{key}=r.{key}" for key in settings)
        sql(f"update public.workspace_scheduling_settings s set {restore} from jsonb_populate_record(null::public.workspace_scheduling_settings,{literal(original)}) r where s.workspace_id='{W}'")
    report["status"] = "PASS"
    report["cleanup"] = "Owned leases discarded, fixture type/job/location archived, original workspace policies restored; immutable isolated evidence retained."
    OUTPUT.write_text(json.dumps(report, indent=2), encoding="utf8")
    print(json.dumps({"status": "PASS", "scenarios": len(report["scenarios"])}))


if __name__ == "__main__":
    main()
