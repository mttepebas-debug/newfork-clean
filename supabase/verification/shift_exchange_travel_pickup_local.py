"""Real API cover/pickup gates with shared travel policy and exact boundaries."""
from datetime import date,timedelta
from pathlib import Path
import json,uuid,urllib.request
from urllib.error import HTTPError
from lineup_visual_fixture_local import sql
from shift_exchange_api_local import login

s=json.loads(Path('supabase/.temp/shift-exchange-lineup-overlap-role.json').read_text());w=s['workspace'];manager=s['users']['manager']['id'];owner=s['employee_a'];person=s['employee_casey']
assert s['availability_matrix_owned'] and sql(f"select name from public.workspaces where id='{w}'")==s['name']=='Line Up role verification '+w
PROOF=Path('supabase/.temp/shift-exchange-travel-pickup.json')
OUT=Path('docs/rebuild/shift-hub-visual-proof-2026-09-07/travel-policy/pickup.json')
tokens={r:login(s,r) for r in ('manager','employee','casey','policy_admin')}
sx=f'/v1/workspaces/{w}/shift-exchanges';settings=f'/v1/workspaces/{w}/scheduling-settings'
def request(role,path,body=None,method=None,key=None):
    req=urllib.request.Request('http://127.0.0.1:5560'+path,headers={'Authorization':'Bearer '+tokens[role],'X-Newfork-Workspace-Id':w,'Content-Type':'application/json','Idempotency-Key':key or str(uuid.uuid4())},data=json.dumps(body).encode() if body is not None else None,method=method)
    try:
        with urllib.request.urlopen(req,timeout=30) as r:return r.status,json.load(r)
    except HTTPError as e:return e.code,json.load(e)
def ok(*args,**kwargs):
    status,result=request(*args,**kwargs);assert status==200,(status,result);return result
scenarios=[('15 minute gap before',False,False,'07:00','08:45','b'),('exact 30 minute boundary',True,False,'07:00','08:30','b'),('same location adjacency',True,True,'07:00','09:00','a'),('15 minute gap after',False,False,'11:15','12:00','b')]
proof=json.loads(PROOF.read_text()) if PROOF.exists() else dict(workspace=w,rows=[dict(label=label,eligible=eligible,direct=direct,start=start,end=end,extra_location=s['location_'+loc],day=str(date(2026,10,26)+timedelta(days=i)),shift=str(uuid.uuid4()),source=str(uuid.uuid4()),extra=str(uuid.uuid4()),key=str(uuid.uuid4())) for i,(label,eligible,direct,start,end,loc) in enumerate(scenarios)])
assert proof['workspace']==w
def save():PROOF.write_text(json.dumps(proof,indent=2))
def current(row):return next(c for c in ok('manager',sx+f'?view=manager&from={row["day"]}&to={row["day"]}')['cases'] if c['id']==row['case'])
baseline=ok('policy_admin',settings);proof.setdefault('minimum_before',baseline['minimum_travel_minutes']);save();new_rows=0
try:
    ok('policy_admin',settings,{**baseline,'minimum_travel_minutes':30},'PUT')
    for row in proof['rows']:
        if row.get('result')=='PASS':continue
        d=date.fromisoformat(row['day']);week=str(d-timedelta(days=d.weekday()));loc=s['location_a'];extra_loc=row['extra_location']
        existing=sql(f"select id from public.schedule_location_publications where workspace_id='{w}' and location_id='{loc}' and week_start='{week}' and status='current'")
        if not existing:sql(f"insert into public.schedule_location_publications(workspace_id,location_id,week_start,version_number,published_by) values('{w}','{loc}','{week}',1,'{manager}')")
        sql(f"""begin;
        insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
        select '{row['shift']}','{w}',id,'{loc}','{owner}','{s['job']}','{s['service']}','{d}','09:00','11:00','{row['source']}' from public.schedule_location_publications where workspace_id='{w}' and location_id='{loc}' and week_start='{week}' and status='current' on conflict(id) do nothing;
        insert into public.schedule_lineups(workspace_id,location_id,lineup_date,created_by,updated_by) values('{w}','{extra_loc}','{d}','{manager}','{manager}') on conflict(workspace_id,location_id,lineup_date) do nothing;
        insert into public.schedule_lineup_entries(id,workspace_id,lineup_id,location_id,employee_id,job_id,shift_type_id,start_time,end_time,created_by,updated_by)
        select '{row['extra']}','{w}',id,'{extra_loc}','{person}','{s['job']}','{s['service']}','{row['start']}','{row['end']}','{manager}','{manager}' from public.schedule_lineups where workspace_id='{w}' and location_id='{extra_loc}' and lineup_date='{d}' on conflict(id) do nothing;
        commit;""")
        candidates=ok('employee',sx+'?shift_id='+row['shift'])['employees']
        assert any(e['id']==person for e in candidates)==row['eligible'];row['candidate_listing']=row['eligible']
        if not row.get('case'):
            command=dict(action='create',kind='cover',shift_id=row['shift'])
            if row['direct']:command['employee_id']=person
            row['case']=ok('employee',sx,command,key=row['key'])['case_id'];save()
        if not row['direct']:
            opportunities=ok('casey',sx+f'?view=employee&from={d}&to={d}')['opportunities']
            assert any(o['case_id']==row['case'] for o in opportunities)==row['eligible'];row['pool_listing']=row['eligible']
        if not row['eligible']:
            for kind,role,command in [('pickup','casey',dict(action='apply',case_id=row['case'],shift_id=row['shift'])),('direct','employee',dict(action='create',kind='cover',shift_id=row['shift'],employee_id=person))]:
                status,body=request(role,sx,command);assert status==422,(kind,status,body)
                row.setdefault('blocked_submits',[]).append(dict(kind=kind,status=status))
            assert current(row)['applications']==[]
            assert sql(f"select employee_id from public.schedule_published_shifts where id='{row['shift']}'")==owner
            row['no_application']=True
            ok('employee',sx,dict(action='close',case_id=row['case'],expected_revision=current(row)['revision'],reason='Local travel gate verification complete'))
        else:
            case=current(row)
            if row['direct']:
                app=case['applications'][0]
                if app['status']=='invited':ok('casey',sx,dict(action='accept',case_id=row['case'],application_id=app['id'],expected_revision=case['revision']))
            elif not case['applications']:ok('casey',sx,dict(action='apply',case_id=row['case'],shift_id=row['shift']))
            case=current(row);app=case['applications'][0]
            preview=ok('manager',sx+f'?case_id={row["case"]}&application_id={app["id"]}')
            assert preview['allowed'] and preview['receiver']['status']=='eligible',preview
            assert sql(f"select employee_id from public.schedule_published_shifts where id='{row['shift']}'")==owner
            row['owner_until_final']=True
            ok('manager',sx,dict(action='approve',case_id=row['case'],application_id=app['id'],expected_revision=case['revision'],fingerprint=preview['fingerprint']))
        row['result']='PASS';new_rows+=1;save()
finally:
    for row in proof['rows']:sql(f"update public.schedule_lineup_entries set hidden=true where workspace_id='{w}' and id='{row['extra']}' and source_shift_id is null")
    ok('policy_admin',settings,{**baseline,'minimum_travel_minutes':proof['minimum_before']},'PUT')
for row in proof['rows']:
    row['verification']=json.loads(sql(f"select jsonb_build_object('status',c.status,'owner',sh.employee_id,'transfers',(select count(*) from public.shift_exchange_events where case_id=c.id and action='transfer_completed')) from public.shift_exchange_cases c join public.schedule_published_shifts sh on sh.id='{row['shift']}' where c.id='{row['case']}'"))
    assert row['verification']==dict(status='completed' if row['eligible'] else 'cancelled',owner=person if row['eligible'] else owner,transfers=int(row['eligible'])),row['verification']
save();OUT.write_text(json.dumps(dict(workspace=w,rows=[{k:v for k,v in row.items() if k not in ('key','source')} for row in proof['rows']],minimum_restored=ok('policy_admin',settings)['minimum_travel_minutes']),indent=2))
print(json.dumps(dict(result='PASS',new_rows=new_rows,rows=len(proof['rows']),blocked_submits=4,completed=2,cancelled=2)))
