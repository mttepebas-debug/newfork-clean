"""10 simultaneous final decisions, repeated 20 times, with real local API sessions.
Only the isolated fixture named in STATE.json is mutated. No external delivery.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
import json
from pathlib import Path
import sys
from threading import Barrier
import time
from urllib.error import HTTPError
import uuid
from shift_exchange_api_local import api, login, sql


def main(path):
    state = json.loads(path.read_text())
    w = str(uuid.UUID(state['workspace']))
    if not state.get('exchange_fixture') or sql(f"select name from public.workspaces where id='{w}';") != state['name']:
        raise RuntimeError('Owned isolated fixture required')
    tokens = {role: login(state, role) for role in ('employee', 'manager', 'blake', 'casey', 'drew')}
    results = []
    started = time.monotonic()
    first_day = date.today() + timedelta(days=14)
    latest = sql(f"select max((offered_snapshot->>'date')::date) from public.shift_exchange_cases where workspace_id='{w}';")
    if latest:
        first_day = max(first_day, date.fromisoformat(latest) + timedelta(days=1))
    for iteration in range(20):
        d = first_day + timedelta(days=iteration)
        week = d - timedelta(days=d.weekday())
        shift = str(uuid.uuid4())
        publication = sql(f"select id from public.schedule_location_publications where workspace_id='{w}' and location_id='{state['location_a']}' and week_start='{week}' and status='current';")
        if not publication:
            publication = str(uuid.uuid4())
            sql(f"insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by) values('{publication}','{w}','{state['location_a']}','{week}',1,'{state['users']['manager']['id']}');")
        sql(f"insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id) values('{shift}','{w}','{publication}','{state['location_a']}','{state['employee_a']}','{state['job']}','{state['service']}','{d}','16:00','22:00',gen_random_uuid());")
        created = api(state,tokens['employee'],command={'action':'create','kind':'cover','shift_id':shift})
        cid = created['case_id']
        for role in ('blake','casey','drew'):
            api(state,tokens[role],command={'action':'apply','shift_id':shift,'case_id':cid})
        case = next(c for c in api(state,tokens['manager'],'?view=manager')['cases'] if c['id']==cid)
        previews = {a['id']: api(state,tokens['manager'],f"?case_id={cid}&application_id={a['id']}") for a in case['applications']}
        barrier = Barrier(10)
        def decide(n):
            a = case['applications'][n%3]
            command = {'action':'approve','case_id':cid,'application_id':a['id'],'expected_revision':case['revision'],'fingerprint':previews[a['id']]['fingerprint']}
            barrier.wait(timeout=20)
            try:
                return {'code':200,'result':api(state,tokens['manager'],command=command)}
            except HTTPError as error:
                return {'code':error.code,'error':json.load(error)}
        with ThreadPoolExecutor(max_workers=10) as pool:
            outcomes = list(pool.map(decide,range(10)))
        wins = sum(o['code']==200 and o['result']['status']=='completed' for o in outcomes)
        stale = sum(o['code']==409 for o in outcomes)
        if wins != 1 or stale != 9:
            raise AssertionError(json.dumps({'iteration':iteration,'outcomes':outcomes}))
        actual = sql(f"select count(*) from public.shift_exchange_applications where case_id='{cid}' and status='approved';")
        assert actual=='1'
        results.append({'iteration':iteration+1,'winners':wins,'stale_decisions':stale})
        print(f"Round {iteration+1}/20: one winner, nine stale decisions",flush=True)
    evidence = {'kind':'shift-exchange-local-race','workspace':w,'attempts':200,'rounds':results,'elapsed_seconds':round(time.monotonic()-started,2),'hosted':False}
    target = path.with_name('shift-exchange-concurrency-evidence.json')
    target.write_text(json.dumps(evidence,indent=2))
    print('PASS: 20 rounds / 200 concurrent final attempts; evidence '+str(target))


if __name__=='__main__':
    main(Path(sys.argv[1]).resolve())
