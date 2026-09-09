"""Real HTTP settings/final races, with observed workspace advisory lock waits.

The controller only holds/releases lock 921. Both competing mutations use normal
Auth + API; no RPC responses, clocks, or transaction outcomes are mocked.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import date,timedelta
from pathlib import Path
import json,subprocess,time,uuid,urllib.request
from urllib.error import HTTPError
from lineup_visual_fixture_local import sql,CONTAINER
from shift_exchange_api_local import login

STATE=Path('supabase/.temp/shift-exchange-lineup-overlap-role.json')
PROOF=Path('supabase/.temp/shift-exchange-travel-races.json')
OUT=Path('docs/rebuild/shift-hub-visual-proof-2026-09-07/travel-policy/races.json')
s=json.loads(STATE.read_text());w=s['workspace'];owner=s['employee_a'];emp=s['employee_casey'];manager=s['users']['manager']['id']
assert s['availability_matrix_owned'] and sql(f"select name from public.workspaces where id='{w}'")==s['name']=='Line Up role verification '+w
tokens={r:login(s,r) for r in ('manager','employee','casey','policy_admin')}
sx=f'/v1/workspaces/{w}/shift-exchanges';settings=f'/v1/workspaces/{w}/scheduling-settings'
def request(role,path,body=None,method=None,key=None):
    req=urllib.request.Request('http://127.0.0.1:5560'+path,headers={
        'Authorization':'Bearer '+tokens[role],'X-Newfork-Workspace-Id':w,'Content-Type':'application/json','Idempotency-Key':key or str(uuid.uuid4())},
        data=json.dumps(body).encode() if body is not None else None,method=method)
    try:
        with urllib.request.urlopen(req,timeout=40) as r:return r.status,json.load(r)
    except HTTPError as e:return e.code,json.load(e)
def ok(*args,**kwargs):
    status,result=request(*args,**kwargs);assert status==200,(status,result);return result
proof=json.loads(PROOF.read_text()) if PROOF.exists() else dict(workspace=w,rows=[dict(first=first,day=str(date(2026,10,15)+timedelta(days=i)),shift=str(uuid.uuid4()),source=str(uuid.uuid4()),extra=str(uuid.uuid4()),key=str(uuid.uuid4())) for i,first in enumerate(('policy','approval'))])
assert proof['workspace']==w
def save():PROOF.write_text(json.dumps(proof,indent=2))
def current(row):return next(c for c in ok('manager',sx+f'?view=manager&from={row["day"]}&to={row["day"]}')['cases'] if c['id']==row['case'])
lock_condition=f"l.locktype='advisory' and l.classid::bigint=((hashtextextended('{w}',921)>>32)&4294967295) and l.objid::bigint=(hashtextextended('{w}',921)&4294967295)"
def observe(count,gate):
    deadline=time.monotonic()+12
    while time.monotonic()<deadline:
        assert gate.poll() is None,'Controller exited unexpectedly'
        rows=json.loads(sql(f"select coalesce(json_agg(json_build_object('pid',a.pid,'operation',case when a.query like '%update_scheduling_settings_service%' then 'policy' when a.query like '%shift_exchanges_command_service%' then 'approval' else 'other' end,'wait',a.wait_event,'started',a.query_start) order by a.query_start),'[]') from pg_locks l join pg_stat_activity a on a.pid=l.pid where {lock_condition} and not l.granted"))
        if len(rows)==count and all(r['wait']=='advisory' for r in rows):return rows
        time.sleep(.1)
    raise AssertionError('Expected live advisory wait was not observed')
baseline=ok('policy_admin',settings);proof.setdefault('minimum_before',baseline['minimum_travel_minutes']);save()
new_races=0
for row in proof['rows']:
    if row.get('result')=='PASS':continue
    gate=None
    try:
        ok('policy_admin',settings,{**baseline,'minimum_travel_minutes':0},'PUT')
        d=date.fromisoformat(row['day']);week=str(d-timedelta(days=d.weekday()));loc=s['location_b'];extra_loc=s['location_a']
        sql(f"""begin;
        insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
        select '{row['shift']}','{w}',id,'{loc}','{owner}','{s['job']}','{s['service']}','{d}','09:00','11:00','{row['source']}' from public.schedule_location_publications where workspace_id='{w}' and location_id='{loc}' and week_start='{week}' and status='current' on conflict(id) do nothing;
        insert into public.schedule_lineups(workspace_id,location_id,lineup_date,created_by,updated_by) values('{w}','{extra_loc}','{d}','{manager}','{manager}') on conflict(workspace_id,location_id,lineup_date) do nothing;
        insert into public.schedule_lineup_entries(id,workspace_id,lineup_id,location_id,employee_id,job_id,shift_type_id,start_time,end_time,created_by,updated_by)
        select '{row['extra']}','{w}',id,'{extra_loc}','{emp}','{s['job']}','{s['service']}','07:00','08:45','{manager}','{manager}' from public.schedule_lineups where workspace_id='{w}' and location_id='{extra_loc}' and lineup_date='{d}' on conflict(id) do nothing;
        commit;""")
        assert sql(f"select employee_id from public.schedule_published_shifts where id='{row['shift']}'")==owner
        if not row.get('case'):
            row['case']=ok('employee',sx,dict(action='create',kind='cover',shift_id=row['shift']),key=row['key'])['case_id'];save()
        case=current(row)
        if not case['applications']:ok('casey',sx,dict(action='apply',case_id=row['case'],shift_id=row['shift']))
        case=current(row);app=case['applications'][0]['id']
        preview=ok('manager',sx+f'?case_id={row["case"]}&application_id={app}');assert preview['allowed'],preview
        commands={
            'policy':lambda:request('policy_admin',settings,{**baseline,'minimum_travel_minutes':30},'PUT'),
            'approval':lambda:request('manager',sx,dict(action='approve',case_id=row['case'],application_id=app,expected_revision=case['revision'],fingerprint=preview['fingerprint'],private_note='Travel concurrency verification')),
        }
        name='travel-race-gate-'+uuid.uuid4().hex
        gate=subprocess.Popen(['docker','exec','-i','-e','PGAPPNAME='+name,CONTAINER,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        gate.stdin.write(f"begin; select pg_advisory_xact_lock(hashtextextended('{w}',921));\n");gate.stdin.flush()
        deadline=time.monotonic()+10
        while sql(f"select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid where {lock_condition} and l.granted and a.application_name='{name}'")!='1':
            assert gate.poll() is None and time.monotonic()<deadline,'Gate did not acquire lock'
            time.sleep(.1)
        first=row['first'];second='approval' if first=='policy' else 'policy'
        with ThreadPoolExecutor(max_workers=2) as executor:
            one=executor.submit(commands[first]);wait_one=observe(1,gate)
            assert wait_one[0]['operation']==first,wait_one
            two=executor.submit(commands[second]);wait_two=observe(2,gate)
            assert [r['operation'] for r in wait_two]==[first,second],wait_two
            row['observed_waits']=wait_two;save()
            gate.stdin.write('commit;\n\\q\n');gate.stdin.flush()
            out,err=gate.communicate(timeout=10);assert gate.returncode==0,err;gate=None
            results={first:one.result(timeout=30),second:two.result(timeout=30)}
        row['statuses']={kind:value[0] for kind,value in results.items()};save()
        assert results['policy'][0]==200,results
        assert results['approval'][0]==(409 if first=='policy' else 200),results
        expected_owner=owner if first=='policy' else emp
        assert sql(f"select employee_id from public.schedule_published_shifts where id='{row['shift']}'")==expected_owner
        assert ok('policy_admin',settings)['minimum_travel_minutes']==30
        row['result']='PASS';row['owner_after']=expected_owner;new_races+=1;save()
    finally:
        if gate is not None and gate.poll() is None:
            gate.stdin.write('rollback;\n\\q\n');gate.stdin.flush();gate.communicate(timeout=10)
        try:
            if row.get('case') and current(row)['status']=='open':ok('employee',sx,dict(action='close',case_id=row['case'],expected_revision=current(row)['revision'],reason='Local concurrency verification complete'))
        finally:
            sql(f"update public.schedule_lineup_entries set hidden=true where workspace_id='{w}' and id='{row['extra']}' and source_shift_id is null")
            ok('policy_admin',settings,{**baseline,'minimum_travel_minutes':proof['minimum_before']},'PUT')
for row in proof['rows']:
    verification=json.loads(sql(f"select jsonb_build_object('status',c.status,'owner',s.employee_id,'transfers',(select count(*) from public.shift_exchange_events where case_id=c.id and action='transfer_completed'),'private_notes',(select count(*) from public.shift_exchange_events where case_id=c.id and private_note<>'')) from public.shift_exchange_cases c join public.schedule_published_shifts s on s.id='{row['shift']}' where c.id='{row['case']}'"))
    positive=row['first']=='approval'
    assert verification==dict(status='completed' if positive else 'cancelled',owner=emp if positive else owner,transfers=int(positive),private_notes=int(positive)),verification
    row['verification']=verification
save();OUT.write_text(json.dumps(dict(workspace=w,rows=[{k:v for k,v in row.items() if k not in ('key','source')} for row in proof['rows']],minimum_restored=ok('policy_admin',settings)['minimum_travel_minutes']),indent=2))
print(json.dumps(dict(result='PASS',new_races=new_races,rows=[dict(first=r['first'],statuses=r['statuses'],verification=r['verification']) for r in proof['rows']])))
