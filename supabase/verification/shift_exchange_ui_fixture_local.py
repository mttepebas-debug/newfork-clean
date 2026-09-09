"""Prepare stable real-API scenarios for the Shift Hub visual matrix, local only."""
import json
from pathlib import Path
import sys
import uuid
from shift_exchange_api_local import api, login, sql


def main(path):
    state = json.loads(path.read_text())
    w = str(uuid.UUID(state['workspace']))
    assert state.get('exchange_fixture') and sql(f"select name from public.workspaces where id='{w}';") == state['name']
    if all(state.get('ui_'+purpose+'_case') for purpose in ('cover','available','swap')):
        print(json.dumps({k:v for k,v in state.items() if k.startswith('ui_')}))
        return
    tokens = {role:login(state,role) for role in ('employee','blake','casey','drew')}
    publication = sql(f"select id from public.schedule_location_publications where workspace_id='{w}' and location_id='{state['location_a']}' and week_start='2026-09-14' and status='current';")
    assert publication
    for day, purpose in ((18,'cover'),(19,'available'),(20,'swap')):
        shift=state.get('ui_'+purpose+'_shift')
        if not shift:
            existing=sql(f"select id from public.schedule_published_shifts where workspace_id='{w}' and publication_id='{publication}' and scheduled_date='2026-09-{day}' and employee_id='{state['employee_a']}' and start_time='16:00' and end_time='22:00';").splitlines()
            assert len(existing)<=1, 'Ambiguous fixture shift; do not overwrite unrelated records'
            shift=existing[0] if existing else str(uuid.uuid4())
            if not existing:
                sql(f"insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id) values('{shift}','{w}','{publication}','{state['location_a']}','{state['employee_a']}','{state['job']}','{state['service']}','2026-09-{day}','16:00','22:00',gen_random_uuid());")
            state['ui_'+purpose+'_shift']=shift
            path.write_text(json.dumps(state,indent=2))
        command={'action':'create','kind':'swap' if purpose=='swap' else 'cover','shift_id':shift}
        if purpose=='swap': command['requested_shift_id']=state['shift_b']
        created={'case_id':state['ui_'+purpose+'_case']} if state.get('ui_'+purpose+'_case') else api(state,tokens['employee'],command=command)
        state['ui_'+purpose+'_case']=created['case_id']; state['ui_'+purpose+'_shift']=shift
        path.write_text(json.dumps(state,indent=2))
        if purpose=='cover':
            for role in ('blake','casey','drew'):
                already=next((c for c in api(state,tokens[role])['cases'] if c['id']==created['case_id']),None)
                if not already or not any(a['status']=='pending_manager' for a in already['applications']):
                    api(state,tokens[role],command={'action':'apply','shift_id':shift,'case_id':created['case_id']})
    print(json.dumps({k:v for k,v in state.items() if k.startswith('ui_')}))


if __name__ == '__main__': main(Path(sys.argv[1]).resolve())
