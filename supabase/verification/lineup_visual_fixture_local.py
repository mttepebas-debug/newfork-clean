"""Stage/clean a disposable roster for real local-browser visual verification.

python -X utf8 supabase/verification/lineup_visual_fixture_local.py create STATE.json
python -X utf8 supabase/verification/lineup_visual_fixture_local.py cleanup STATE.json

Uses only supabase_db_newfork-clean. Never changes existing employees or shifts.
The state file records every owned UUID before the transaction is committed.
"""
import json
from pathlib import Path
import subprocess
import sys
import uuid

CONTAINER = "supabase_db_newfork-clean"
WORKSPACE = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd"
OWNER = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5"
LOCATION = "11000000-0000-4000-8000-000000000001"
DAY = "2031-06-02"
SERVICE = "14000000-0000-4000-8000-000000000002"
JOB = "13000000-0000-4000-8000-000000000001"
SECTIONS = ["07b0bb94-343a-4a21-a3f6-34e392b658ba", "bae81363-099e-48e0-ae20-a7ca0fb3c7f7", "49556b78-e123-474a-bbb6-e1893fe8b235"]


def sql(statement):
    result = subprocess.run(["docker", "exec", "-i", CONTAINER, "psql", "-X", "-qAt", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], input=statement, text=True, encoding="utf-8", capture_output=True, timeout=40)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def ids(values):
    return ",".join(quote(str(uuid.UUID(value))) for value in values)


def create(path):
    if path.exists():
        raise RuntimeError("State already exists; clean up that fixture first")
    if sql(f"select count(*) from public.schedule_location_publications where workspace_id='{WORKSPACE}' and location_id='{LOCATION}' and week_start='{DAY}';") != "0":
        raise RuntimeError("Fixture week is occupied; existing data is left unchanged")
    state = {"kind": "lineup-visual-fixture-v1", "workspace": WORKSPACE, "day": DAY,
             "publication": str(uuid.uuid4()), "lineup": str(uuid.uuid4()),
             "employees": [str(uuid.uuid4()) for _ in range(48)],
             "shifts": [str(uuid.uuid4()) for _ in range(56)],
             "entries": [str(uuid.uuid4()) for _ in range(56)],
             "notes": [str(uuid.uuid4()) for _ in range(3)]}
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")
    statements = ["begin;", f"insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by) values('{state['publication']}','{WORKSPACE}','{LOCATION}','{DAY}',1,'{OWNER}');",
                  f"insert into public.schedule_lineups(id,workspace_id,location_id,lineup_date,created_by,updated_by) values('{state['lineup']}','{WORKSPACE}','{LOCATION}','{DAY}','{OWNER}','{OWNER}');"]
    for i, employee in enumerate(state["employees"]):
        surname = "Montgomery Wellington Fernández Nakamura" if i == 0 else ["Yılmaz", "Fernández", "Nakamura", "Williams", "O’Connor", "Nguyễn"][i % 6]
        statements.append(f"insert into public.employee_profiles(id,workspace_id,employee_code,first_name,last_name,created_by) values('{employee}','{WORKSPACE}','E-{int(uuid.UUID(employee)) % (10**20)}','Lineup QA {i+1:02d}',{quote(surname)},'{OWNER}');")
        statements.append(f"insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) values('{WORKSPACE}','{employee}','{LOCATION}','{OWNER}');")
        statements.append(f"insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by) values('{WORKSPACE}','{employee}','{JOB}','{OWNER}');")
    for i, shift in enumerate(state["shifts"]):
        employee = quote(state["employees"][i]) if i < 48 else "null"
        section = "null" if i % 7 == 0 else quote(SECTIONS[i % 3])
        station = quote("Tables 21–26 · Private dining entrance and accessible service aisle" if i == 0 else f"Tables {i*2+1}–{i*2+2}")
        statements.append(f"insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id) values('{shift}','{WORKSPACE}','{state['publication']}','{LOCATION}',{employee},'{JOB}','{SERVICE}','{DAY}','16:00','23:30',gen_random_uuid());")
        statements.append(f"insert into public.schedule_lineup_entries(id,workspace_id,lineup_id,location_id,source_shift_id,employee_id,job_id,shift_type_id,start_time,end_time,section_id,station,created_by,updated_by) values('{state['entries'][i]}','{WORKSPACE}','{state['lineup']}','{LOCATION}','{shift}',{employee},'{JOB}','{SERVICE}','16:00','23:30',{section},{station},'{OWNER}','{OWNER}');")
    notes = ["Briefing 15:45 · Lead: Jordan.\nA group of 24 arrives at 19:00. Keep the entrance and accessible aisle clear. Confirm dietary requests with the kitchen before serving.\n" + "Coordinate each course with the section lead. " * 25,
             "Menu reference: https://example.test/" + "seasonal-menu-" * 70,
             "Manager-only visual fixture. Review the private dining preparation before opening."]
    for i, note in enumerate(notes):
        statements.append(f"insert into public.lineup_notes(id,workspace_id,location_id,date,shift_type_id,category,content,visibility,pinned,updated_by) values('{state['notes'][i]}','{WORKSPACE}','{LOCATION}','{DAY}','{SERVICE}','priority',{quote(note[:1900])},'{ 'managers' if i == 2 else 'team'}',{ 'true' if i == 0 else 'false'},'{OWNER}');")
    statements.append("commit;")
    sql("\n".join(statements))
    print(json.dumps({"state": str(path.resolve()), "date": DAY, "people": 48, "open": 8, "url": f"http://127.0.0.1:5555/app/schedule/lineup?date={DAY}"}))


def cleanup(path):
    state = json.loads(path.read_text(encoding="utf-8"))
    if state.get("kind") != "lineup-visual-fixture-v1" or state.get("workspace") != WORKSPACE or state.get("day") != DAY:
        raise RuntimeError("State is not this local visual fixture")
    pub, lineup = str(uuid.UUID(state["publication"])), str(uuid.UUID(state["lineup"]))
    employees, shifts, entries, notes = (ids(state[key]) for key in ("employees", "shifts", "entries", "notes"))
    plans = ids(state.get("section_plans", [])) or "null"
    events = ids(state.get("events", [])) or "null"
    sql(f"""begin;
    do $$ begin
      if exists(select 1 from public.employee_profiles where id in({employees}) and (workspace_id<>'{WORKSPACE}' or first_name not like 'Lineup QA %')) then raise exception 'Employee fixture scope changed'; end if;
      if exists(select 1 from public.schedule_published_shifts where employee_id in({employees}) and id not in({shifts})) then raise exception 'Fixture employee was used outside this verification'; end if;
      if exists(select 1 from public.schedule_lineup_snapshots where workspace_id='{WORKSPACE}' and location_id='{LOCATION}' and lineup_date='{DAY}') then raise exception 'Fixture was shared; preserve it for explicit audit cleanup'; end if;
      if exists(select 1 from public.notifications where workspace_id='{WORKSPACE}' and source_id in({events}) and source_type='lineup_operation') then raise exception 'Fixture notified an account; preserve its event for audit'; end if;
    end $$;
    delete from public.lineup_notes where workspace_id='{WORKSPACE}' and id in({notes});
    delete from public.lineup_section_plans where workspace_id='{WORKSPACE}' and id in({plans}) and location_id='{LOCATION}' and date='{DAY}' and stations like 'QA autosave setup%';
    delete from public.lineup_operation_events where workspace_id='{WORKSPACE}' and actor_user_id='{OWNER}' and date='{DAY}' and kind='placement' and before_state->>'id' in({entries});
    delete from public.lineup_operation_events where workspace_id='{WORKSPACE}' and actor_user_id='{OWNER}' and date='{DAY}' and id in({events});
    delete from public.schedule_lineup_entries where workspace_id='{WORKSPACE}' and id in({entries}) and lineup_id='{lineup}';
    delete from public.schedule_published_shifts where workspace_id='{WORKSPACE}' and id in({shifts}) and publication_id='{pub}';
    delete from public.schedule_lineups where workspace_id='{WORKSPACE}' and id='{lineup}' and lineup_date='{DAY}';
    delete from public.schedule_location_publications where workspace_id='{WORKSPACE}' and id='{pub}' and week_start='{DAY}';
    delete from public.employee_profiles where workspace_id='{WORKSPACE}' and id in({employees}) and first_name like 'Lineup QA %';
    commit;
    """)
    assert sql(f"select count(*) from public.employee_profiles where id in({employees});") == "0"
    path.unlink()
    print("CLEANED: owned roster, shifts, overlays, notes and state file")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("create", "cleanup"):
        raise SystemExit(__doc__)
    (create if sys.argv[1] == "create" else cleanup)(Path(sys.argv[2]).resolve())
