"""Ten real local applicants with long names for the Shift Hub UI audit.
Only extends the named owned synthetic fixture; credentials stay in ignored state.
"""
import json
from pathlib import Path
import sys
import uuid
from lineup_role_fixture_local import auth, quote
from shift_exchange_api_local import api, login, sql


def main(path):
    state = json.loads(path.read_text(encoding='utf-8'))
    w = str(uuid.UUID(state['workspace']))
    assert state.get('exchange_fixture') and sql(f"select name from public.workspaces where id='{w}'") == state['name']
    owner = login(state, 'employee')
    if not state.get('ui_many_shift'):
        shift = str(uuid.uuid4())
        publication = sql(f"select id from public.schedule_location_publications where workspace_id='{w}' and location_id='{state['location_a']}' and week_start='2026-09-14' and status='current'")
        assert publication
        sql(f"insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id) values('{shift}','{w}','{publication}','{state['location_a']}','{state['employee_a']}','{state['job']}','{state['service']}','2026-09-19','09:00','12:00',gen_random_uuid())")
        state['ui_many_shift'] = shift
        path.write_text(json.dumps(state, indent=2), encoding='utf-8')
    if not state.get('ui_many_case'):
        state['ui_many_case'] = api(state, owner, command={'action':'create','kind':'cover','shift_id':state['ui_many_shift']})['case_id']
        path.write_text(json.dumps(state, indent=2), encoding='utf-8')
    names = ['Alexandria-Cassandra Montgomery-Wellington', 'ChristopherAlexanderMontgomeryWellington QA',
        'María Fernanda de la Cruz QA', 'Jean-Baptiste du Laurent QA', 'Riley QA', 'Sam QA',
        'Morgan QA', 'Taylor QA', 'Jordan QA', 'Avery QA']
    for index, name in enumerate(names):
        role = 'many_' + str(index)
        if role not in state['users']:
            email = f'exchange-many-{index}-{w}@example.test'
            user = auth('POST','users',{'email':email,'password':state['password'],'email_confirm':True})
            person = str(uuid.uuid4())
            state['users'][role] = {'id':user['id'],'email':email,'employee_id':person}
            path.write_text(json.dumps(state, indent=2), encoding='utf-8')
        user = state['users'][role]
        person = user['employee_id']
        if sql(f"select count(*) from public.employee_profiles where id='{person}' and workspace_id='{w}'") == '0':
            sql(f"""begin;
              insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) values('{w}','{user['id']}','employee','active',true);
              insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by) values('{person}','{w}','{user['id']}','E-{9000+index:04d}',{quote(name)},'QA','{state['users']['manager']['id']}');
              insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by) values('{w}','{person}','{state['job']}','{state['users']['manager']['id']}');
              insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by) select '{w}','{person}',1,'America/Los_Angeles',jsonb_agg(jsonb_build_object('day',n,'mode','unrestricted','windows','[]'::jsonb)),'manager','{state['users']['manager']['id']}' from generate_series(0,6)n;
              insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) values('{w}','{person}','{state['location_a']}','{state['users']['manager']['id']}');
              commit;""")
        token = login(state, role)
        current = next((c for c in api(state,token)['cases'] if c['id']==state['ui_many_case']),None)
        if not current or not any(a['status']=='pending_manager' for a in current['applications']):
            api(state,token,command={'action':'apply','shift_id':state['ui_many_shift'],'case_id':state['ui_many_case']})
    model = api(state,login(state,'manager'),'?view=manager')
    current = next(c for c in model['cases'] if c['id']==state['ui_many_case'])
    assert current['candidate_count']==10
    print(json.dumps({'case_id':current['id'],'candidates':10,'names_include_long_and_unbroken':True}))


if __name__ == '__main__':
    main(Path(sys.argv[1]).resolve())
