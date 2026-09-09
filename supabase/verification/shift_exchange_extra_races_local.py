"""Independent-case and withdrawal races in the owned local fixture only."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
import json
from pathlib import Path
import sys
from threading import Barrier
from urllib.error import HTTPError
import uuid
from shift_exchange_api_local import api, login, sql


def main(path):
    state = json.loads(path.read_text())
    w = str(uuid.UUID(state['workspace']))
    if not state.get('exchange_fixture') or sql(f"select name from public.workspaces where id='{w}';") != state['name']:
        raise RuntimeError('Owned local fixture required')
    tokens = {role: login(state, role) for role in ('employee', 'manager', 'blake', 'drew')}
    latest = sql(f"select max(scheduled_date) from public.schedule_published_shifts where workspace_id='{w}';")
    first = max(date.today()+timedelta(days=7), date.fromisoformat(latest)+timedelta(days=1))
    evidence = []
    def prepare(day, owner, location):
        week = day-timedelta(days=day.weekday())
        pub = sql(f"select id from public.schedule_location_publications where workspace_id='{w}' and location_id='{location}' and week_start='{week}' and status='current';")
        if not pub:
            pub = str(uuid.uuid4())
            sql(f"insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by) values('{pub}','{w}','{location}','{week}',1,'{state['users']['manager']['id']}');")
        shift = str(uuid.uuid4())
        person = state['employee_a'] if owner=='employee' else state['employee_blake']
        sql(f"insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id) values('{shift}','{w}','{pub}','{location}','{person}','{state['job']}','{state['service']}','{day}','16:00','22:00',gen_random_uuid());")
        case = api(state,tokens[owner],command={'action':'create','kind':'cover','shift_id':shift})
        api(state,tokens['drew'],command={'action':'apply','shift_id':shift,'case_id':case['case_id']})
        case = next(c for c in api(state,tokens['manager'],'?view=manager')['cases'] if c['id']==case['case_id'])
        a = case['applications'][0]
        preview = api(state,tokens['manager'],f"?case_id={case['id']}&application_id={a['id']}")
        assert preview['allowed'], preview
        return shift,case,a,preview
    def race(commands):
        barrier=Barrier(2)
        def run(pair):
            role,command=pair
            barrier.wait(timeout=15)
            try:
                return {'code':200,'result':api(state,tokens[role],command=command)}
            except HTTPError as error:
                return {'code':error.code,'error':json.load(error)}
        with ThreadPoolExecutor(max_workers=2) as pool:
            return list(pool.map(run,commands))
    def approval(item):
        _,c,a,p=item
        return {'action':'approve','case_id':c['id'],'application_id':a['id'],'expected_revision':c['revision'],'fingerprint':p['fingerprint']}
    for n in range(5):
        day=first+timedelta(days=n*2)
        left=prepare(day,'employee',state['location_a'])
        right=prepare(day,'blake',state['location_b'])
        result=race([('manager',approval(left)),('manager',approval(right))])
        assert sorted(r['code'] for r in result)==[200,409], result
        count=sql(f"select count(*) from public.schedule_published_shifts where workspace_id='{w}' and id in('{left[0]}','{right[0]}') and employee_id='{state['employee_drew']}';")
        assert count=='1',count
        evidence.append({'test':'same employee, overlapping shifts','round':n+1,'committed':1,'blocked':1})
        current=prepare(day+timedelta(days=1),'employee',state['location_a'])
        _,c,a,_=current
        result=race([('manager',approval(current)),('drew',{'action':'withdraw','case_id':c['id'],'application_id':a['id'],'expected_revision':c['revision']})])
        assert sorted(r['code'] for r in result)==[200,409], result
        final=sql(f"select a.status||':'||s.employee_id::text from public.shift_exchange_applications a join public.shift_exchange_cases c on c.id=a.case_id join public.schedule_published_shifts s on s.id='{current[0]}' where a.id='{a['id']}';")
        assert final in ('approved:'+state['employee_drew'],'withdrawn:'+state['employee_a']),final
        evidence.append({'test':'withdraw against approval','round':n+1,'consistent':True,'outcome':final.split(':')[0]})
        print(f'Round {n+1}/5: no double booking; withdrawal/approval consistent',flush=True)
    path.with_name('shift-exchange-extra-races-evidence.json').write_text(json.dumps({'hosted':False,'workspace':w,'results':evidence},indent=2))

if __name__=='__main__':
    main(Path(sys.argv[1]).resolve())
