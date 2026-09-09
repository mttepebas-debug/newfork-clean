"""Owned local fixture and read-only assertions for native shared-Line-Up recovery."""
from pathlib import Path
from datetime import date,timedelta
import json,sys,uuid,urllib.request
from lineup_visual_fixture_local import sql
from shift_exchange_api_local import login
s=json.loads(Path('supabase/.temp/shift-exchange-lineup-overlap-role.json').read_text());w=s['workspace']
assert s['availability_matrix_owned'] and sql(f"select name from public.workspaces where id='{w}'")==s['name']=='Line Up role verification '+w
p=Path('supabase/.temp/shift-exchange-lineup-recovery.json')
mode=sys.argv[1]
if mode=='prepare':
    if not p.exists():p.write_text(json.dumps(dict(workspace=w,day='2026-10-30',shift=str(uuid.uuid4()),source=str(uuid.uuid4()),overlay=str(uuid.uuid4()),key=str(uuid.uuid4())),indent=2))
    f=json.loads(p.read_text());assert f['workspace']==w
    d=date.fromisoformat(f['day']);week=str(d-timedelta(days=d.weekday()));loc=s['location_a'];actor=s['users']['manager']['id']
    sql(f"""begin;
    insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
    select '{f['shift']}','{w}',id,'{loc}','{s['employee_a']}','{s['job']}','{s['service']}','{d}','09:00','11:00','{f['source']}' from public.schedule_location_publications where workspace_id='{w}' and location_id='{loc}' and week_start='{week}' and status='current' on conflict(id) do nothing;
    insert into public.schedule_lineups(workspace_id,location_id,lineup_date,created_by,updated_by) values('{w}','{loc}','{d}','{actor}','{actor}') on conflict(workspace_id,location_id,lineup_date) do nothing;
    insert into public.schedule_lineup_entries(id,workspace_id,lineup_id,location_id,source_shift_id,employee_id,job_id,shift_type_id,start_time,end_time,station,call_off,note,created_by,updated_by)
    select '{f['overlay']}','{w}',id,'{loc}','{f['shift']}','{s['employee_a']}','{s['job']}','{s['service']}','09:00','11:00','Recovery station',true,'','{actor}','{actor}' from public.schedule_lineups where workspace_id='{w}' and location_id='{loc}' and lineup_date='{d}' on conflict(id) do nothing;
    commit;""")
    def api(role,query='',body=None,key=None):
        req=urllib.request.Request('http://127.0.0.1:5560/v1/workspaces/'+w+'/shift-exchanges'+query,headers={'Authorization':'Bearer '+login(s,role),'X-Newfork-Workspace-Id':w,'Content-Type':'application/json','Idempotency-Key':key or str(uuid.uuid4())},data=json.dumps(body).encode() if body else None)
        with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
    if not f.get('case'):
        f['case']=api('employee',body=dict(action='create',kind='cover',shift_id=f['shift']),key=f['key'])['case_id'];p.write_text(json.dumps(f,indent=2))
    case=next(c for c in api('manager',f'?view=manager&from={d}&to={d}')['cases'] if c['id']==f['case'])
    if not case['applications']:
        api('casey',body=dict(action='apply',case_id=f['case'],shift_id=f['shift']))
        case=next(c for c in api('manager',f'?view=manager&from={d}&to={d}')['cases'] if c['id']==f['case'])
    f['application']=case['applications'][0]['id'];f['candidate_name']=case['applications'][0]['employee_name'];f['owner_name']=case['owner_name'];f['fingerprint']=case['consent_fingerprint'] if 'consent_fingerprint' in case else api('manager',f"?case_id={f['case']}&application_id={f['application']}")['fingerprint']
    p.write_text(json.dumps(f,indent=2))
f=json.loads(p.read_text());assert f['workspace']==w
result=json.loads(sql(f"""select jsonb_build_object('workspace','{w}','day','{f['day']}','case','{f['case']}','candidate_name','{f['candidate_name']}','owner_name','{f['owner_name']}','status',c.status,'revision',c.revision,'owner',sh.employee_id,'call_off',e.call_off,'note',e.note,'station',e.station,'transfers',(select count(*) from public.shift_exchange_events where case_id=c.id and action='transfer_completed'),'shares',coalesce((select jsonb_agg(jsonb_build_object('id',ss.id,'version',ss.version_number,'hash',md5(ss.content::text),'entries',ss.content->'entries') order by ss.version_number) from public.schedule_lineup_snapshots ss where ss.workspace_id='{w}' and ss.location_id='{s['location_a']}' and ss.lineup_date='{f['day']}'),'[]'::jsonb)) from public.shift_exchange_cases c join public.schedule_published_shifts sh on sh.id='{f['shift']}' join public.schedule_lineup_entries e on e.id='{f['overlay']}' where c.id='{f['case']}'"""))
print(json.dumps(result))
