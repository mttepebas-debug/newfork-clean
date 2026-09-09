"""Create disposable real-session Shift Hub fixture on local Supabase only.
Usage: python supabase/verification/shift_exchange_role_fixture_local.py create STATE.json
Credentials are written to ignored local state, never stdout; no email is sent.
"""
import json
from pathlib import Path
import sys
import uuid
from lineup_role_fixture_local import create as create_base, auth, sql, quote, OWNER


def create(path):
    create_base(path)
    state = json.loads(path.read_text())
    w, manager = state['workspace'], state['users']['manager']['id']
    statements = ['begin;', f"update public.workspaces set shift_exchanges_enabled=true where id='{w}';"]
    for index, name in enumerate(('Blake', 'Casey', 'Drew'), 2):
        email = f"exchange-{name.lower()}-{w}@example.test"
        user = auth('POST', 'users', {'email': email, 'password': state['password'], 'email_confirm': True})
        state['users'][name.lower()] = {'id': user['id'], 'email': email}
        person = state['employee_b'] if index == 2 else str(uuid.uuid4())
        state['employee_' + name.lower()] = person
        path.write_text(json.dumps(state, indent=2))
        statements += [f"insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) values('{w}','{user['id']}','employee','active',true);",
            f"insert into public.user_profiles(user_id,display_name) values('{user['id']}',{quote(name+' QA')}) on conflict(user_id) do nothing;"]
        if index == 2:
            statements += [f"update public.employee_profiles set user_id='{user['id']}',first_name={quote(name)},last_name='QA' where id='{person}' and workspace_id='{w}';"]
        else:
            statements += [f"insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by) values('{person}','{w}','{user['id']}','E-{index:04d}',{quote(name)},'QA','{OWNER}');",
                f"insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by) values('{w}','{person}','{state['job']}','{OWNER}');",
                f"insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) select '{w}','{person}',id,'{OWNER}' from public.locations where workspace_id='{w}';",
                f"insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by) select '{w}','{person}',1,'America/Los_Angeles',jsonb_agg(jsonb_build_object('day',n,'mode','unrestricted','windows','[]'::jsonb)),'manager','{OWNER}' from generate_series(0,6)n;"]
    statements += [f"update public.employee_profiles set first_name='Alex',last_name='Morgan' where id='{state['employee_a']}' and workspace_id='{w}';",
        f"update public.schedule_published_shifts set scheduled_date='{state['day']}'::date+1 where id='{state['shift_b']}' and workspace_id='{w}';"]
    for user in state['users'].values():
        statements += [f"insert into public.user_workspace_preferences(user_id,active_workspace_id) values('{user['id']}','{w}') on conflict(user_id) do update set active_workspace_id=excluded.active_workspace_id;"]
    statements += ['commit;']
    sql('\n'.join(statements))
    state['exchange_fixture'] = True
    path.write_text(json.dumps(state, indent=2))
    print(json.dumps({'workspace': w, 'state': str(path), 'status': 'ready; isolated local workspace'}))

if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] != 'create':
        raise SystemExit(__doc__)
    create(Path(sys.argv[2]).resolve())
