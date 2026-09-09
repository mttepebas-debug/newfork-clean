"""Policy increase after real pickup consent must reject a stale manager final."""
import json,uuid,urllib.request
from pathlib import Path
from urllib.error import HTTPError
from shift_exchange_api_local import login
from lineup_visual_fixture_local import sql

STATE=Path('supabase/.temp/shift-exchange-lineup-overlap-role.json')
PROOF=Path('supabase/.temp/shift-exchange-travel-final.json')
s=json.loads(STATE.read_text());w=s['workspace']
assert s['availability_matrix_owned'] and s['name']=='Line Up role verification '+w
pair=json.loads(Path('supabase/.temp/shift-exchange-lineup-overlap.json').read_text())['pairs'][1]
shift=pair['requested'];emp=s['employee_casey'];owner=s['employee_a'];actor=s['users']['manager']['id']
tokens={r:login(s,r) for r in ('manager','employee','casey','policy_admin')}
sx=f'/v1/workspaces/{w}/shift-exchanges';settings=f'/v1/workspaces/{w}/scheduling-settings'
def request(role,path,body=None,method=None,key=None):
    req=urllib.request.Request('http://127.0.0.1:5560'+path,
        headers={'Authorization':'Bearer '+tokens[role],'X-Newfork-Workspace-Id':w,'Content-Type':'application/json','Idempotency-Key':key or str(uuid.uuid4())},
        data=json.dumps(body).encode() if body is not None else None,method=method)
    try:
        with urllib.request.urlopen(req,timeout=30) as r:return r.status,json.load(r)
    except HTTPError as e:return e.code,json.load(e)
def ok(*args,**kwargs):
    status,result=request(*args,**kwargs);assert status in (200,201),(status,result);return result
proof=json.loads(PROOF.read_text()) if PROOF.exists() else dict(workspace=w,extra=str(uuid.uuid4()),key=str(uuid.uuid4()))
assert proof['workspace']==w
def save():PROOF.write_text(json.dumps(proof,indent=2))
def current():return next(c for c in ok('manager',sx+f'?view=manager&from={shift["day"]}&to={shift["day"]}')['cases'] if c['id']==proof['case'])
before=ok('policy_admin',settings)
if not proof.get('complete'):
    proof.setdefault('minimum_before',before['minimum_travel_minutes']);save()
    assert sql(f"select employee_id from public.schedule_published_shifts where workspace_id='{w}' and id='{shift['id']}'")==owner
    try:
        ok('policy_admin',settings,{**before,'minimum_travel_minutes':0},'PUT')
        extra=proof['extra'];loc=s['location_a'];day=shift['day']
        sql(f"""begin;
        insert into public.schedule_lineups(workspace_id,location_id,lineup_date,created_by,updated_by) values('{w}','{loc}','{day}','{actor}','{actor}') on conflict(workspace_id,location_id,lineup_date) do nothing;
        insert into public.schedule_lineup_entries(id,workspace_id,lineup_id,location_id,employee_id,job_id,shift_type_id,start_time,end_time,created_by,updated_by)
        select '{extra}','{w}',id,'{loc}','{emp}','{s['job']}','{s['service']}','07:00','08:45','{actor}','{actor}' from public.schedule_lineups where workspace_id='{w}' and location_id='{loc}' and lineup_date='{day}' on conflict(id) do nothing;
        commit;""")
        if not proof.get('case'):
            proof['case']=ok('employee',sx,dict(action='create',kind='cover',shift_id=shift['id']),key=proof['key'])['case_id'];save()
        case=current()
        if not case['applications']:ok('casey',sx,dict(action='apply',case_id=proof['case'],shift_id=shift['id']))
        case=current();app=case['applications'][0]['id']
        path=sx+f'?case_id={proof["case"]}&application_id={app}'
        preview=ok('manager',path);assert preview['allowed'],preview
        ok('policy_admin',settings,{**before,'minimum_travel_minutes':30},'PUT')
        changed=ok('manager',path)
        assert not changed['allowed'] and changed['receiver']['status']=='ineligible',changed
        assert any('30 minutes' in reason for reason in changed['receiver']['reasons']),changed
        status,result=request('manager',sx,dict(action='approve',case_id=proof['case'],application_id=app,expected_revision=case['revision'],fingerprint=preview['fingerprint'],private_note='Unsent policy review note'))
        assert status==409,(status,result)
        assert sql(f"select employee_id from public.schedule_published_shifts where workspace_id='{w}' and id='{shift['id']}'")==owner
        proof.update(final_status=status,reasons=changed['receiver']['reasons'],owner_unchanged=True,complete=True);save()
    finally:
        try:
            if proof.get('case') and current()['status']=='open':
                ok('employee',sx,dict(action='close',case_id=proof['case'],expected_revision=current()['revision'],reason='Local travel verification complete'))
        finally:
            sql(f"update public.schedule_lineup_entries set hidden=true where workspace_id='{w}' and id='{proof['extra']}' and source_shift_id is null")
            ok('policy_admin',settings,{**before,'minimum_travel_minutes':proof['minimum_before']},'PUT')
        proof['restored_minimum']=proof['minimum_before'];save()
verification=json.loads(sql(f"select jsonb_build_object('status',status,'transfers',(select count(*) from public.shift_exchange_events where case_id=c.id and action='transfer_completed'),'private_notes',(select count(*) from public.shift_exchange_events where case_id=c.id and private_note<>'')) from public.shift_exchange_cases c where workspace_id='{w}' and id='{proof['case']}'"))
assert verification==dict(status='cancelled',transfers=0,private_notes=0),verification
proof['verification']=verification;save()
folder=Path('docs/rebuild/shift-hub-visual-proof-2026-09-07/travel-policy');folder.mkdir(exist_ok=True)
(folder/'stale-final.json').write_text(json.dumps({k:v for k,v in proof.items() if k!='key'},indent=2))
print(json.dumps(dict(result='PASS',final_status=proof['final_status'],verification=verification)))
