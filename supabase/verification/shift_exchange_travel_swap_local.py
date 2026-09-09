"""Actual Auth/API two-sided travel eligibility; both initiating directions."""
from datetime import date,timedelta
from pathlib import Path
import json,uuid,urllib.request
from urllib.error import HTTPError
from lineup_visual_fixture_local import sql
from shift_exchange_api_local import login

s=json.loads(Path('supabase/.temp/shift-exchange-lineup-overlap-role.json').read_text());w=s['workspace'];manager=s['users']['manager']['id']
assert s['availability_matrix_owned'] and sql(f"select name from public.workspaces where id='{w}'")==s['name']=='Line Up role verification '+w
PROOF=Path('supabase/.temp/shift-exchange-travel-swaps.json')
OUT=Path('docs/rebuild/shift-hub-visual-proof-2026-09-07/travel-policy/swaps.json')
tokens={r:login(s,r) for r in ('manager','employee','casey','policy_admin')}
sx=f'/v1/workspaces/{w}/shift-exchanges';settings=f'/v1/workspaces/{w}/scheduling-settings'
def request(role,path,body=None,method=None,key=None):
    req=urllib.request.Request('http://127.0.0.1:5560'+path,headers={'Authorization':'Bearer '+tokens[role],'X-Newfork-Workspace-Id':w,'Content-Type':'application/json','Idempotency-Key':key or str(uuid.uuid4())},data=json.dumps(body).encode() if body is not None else None,method=method)
    try:
        with urllib.request.urlopen(req,timeout=30) as r:return r.status,json.load(r)
    except HTTPError as e:return e.code,json.load(e)
def ok(*args,**kwargs):
    status,result=request(*args,**kwargs);assert status==200,(status,result);return result
def descriptor(day,reverse):
    return dict(id=str(uuid.uuid4()),source=str(uuid.uuid4()),day=str(day),location=s['location_b'] if reverse else s['location_a'],owner=s['employee_casey'] if reverse else s['employee_a'])
proof=json.loads(PROOF.read_text()) if PROOF.exists() else dict(workspace=w,rows=[dict(initiator='casey' if i else 'employee',peer='employee' if i else 'casey',offered=descriptor(date(2026,10,19)+timedelta(days=2*i),bool(i)),requested=descriptor(date(2026,10,20)+timedelta(days=2*i),not bool(i)),extras=[str(uuid.uuid4()),str(uuid.uuid4())],key=str(uuid.uuid4())) for i in range(2)])
assert proof['workspace']==w
def save():PROOF.write_text(json.dumps(proof,indent=2))
def current(row):return next(c for c in ok('manager',sx+f'?view=manager&from={row["offered"]["day"]}&to={row["requested"]["day"]}')['cases'] if c['id']==row['case'])
def owners(row):return [sql(f"select employee_id from public.schedule_published_shifts where workspace_id='{w}' and id='{shift['id']}'") for shift in (row['offered'],row['requested'])]
baseline=ok('policy_admin',settings);proof.setdefault('minimum_before',baseline['minimum_travel_minutes']);save();new_swaps=0
for row in proof['rows']:
    if row.get('result')=='PASS':continue
    original=[row['offered']['owner'],row['requested']['owner']]
    try:
        ok('policy_admin',settings,{**baseline,'minimum_travel_minutes':0},'PUT')
        for index,shift in enumerate((row['offered'],row['requested'])):
            d=date.fromisoformat(shift['day']);week=str(d-timedelta(days=d.weekday()));loc=shift['location']
            existing=sql(f"select id from public.schedule_location_publications where workspace_id='{w}' and location_id='{loc}' and week_start='{week}' and status='current'")
            if not existing:
                sql(f"insert into public.schedule_location_publications(workspace_id,location_id,week_start,version_number,published_by) values('{w}','{loc}','{week}',1,'{manager}')")
            sql(f"""insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
                select '{shift['id']}','{w}',id,'{loc}','{shift['owner']}','{s['job']}','{s['service']}','{d}','09:00','11:00','{shift['source']}' from public.schedule_location_publications where workspace_id='{w}' and location_id='{loc}' and week_start='{week}' and status='current' on conflict(id) do nothing""")
            extra_loc=s['location_b'] if loc==s['location_a'] else s['location_a'];person=original[1-index]
            sql(f"""begin;
                insert into public.schedule_lineups(workspace_id,location_id,lineup_date,created_by,updated_by) values('{w}','{extra_loc}','{d}','{manager}','{manager}') on conflict(workspace_id,location_id,lineup_date) do nothing;
                insert into public.schedule_lineup_entries(id,workspace_id,lineup_id,location_id,employee_id,job_id,shift_type_id,start_time,end_time,hidden,created_by,updated_by)
                select '{row['extras'][index]}','{w}',id,'{extra_loc}','{person}','{s['job']}','{s['service']}','07:00','08:45',true,'{manager}','{manager}' from public.schedule_lineups where workspace_id='{w}' and location_id='{extra_loc}' and lineup_date='{d}' on conflict(id) do nothing;
                commit;""")
        if not row.get('case'):
            row['case']=ok(row['initiator'],sx,dict(action='create',kind='swap',shift_id=row['offered']['id'],requested_shift_id=row['requested']['id']),key=row['key'])['case_id'];save()
        case=current(row);app=case['applications'][0];row['application']=app['id'];save()
        path=sx+f'?case_id={row["case"]}&application_id={app["id"]}'
        ok('policy_admin',settings,{**baseline,'minimum_travel_minutes':30},'PUT')
        # Check each side before consent, then again after consent/final preview.
        for stage in ('peer','final'):
            if stage=='final':
                case=current(row)
                if case['applications'][0]['status']=='invited':ok(row['peer'],sx,dict(action='accept',case_id=row['case'],application_id=app['id'],expected_revision=case['revision']))
                preview=ok('manager',path);assert preview['allowed'],preview
                row['baseline_fingerprint']=preview['fingerprint'];save()
            for index,side in enumerate(('receiver','giver')):
                sql(f"update public.schedule_lineup_entries set hidden=false where workspace_id='{w}' and id='{row['extras'][index]}'")
                try:
                    candidate=ok(row['initiator'],sx+'?shift_id='+row['offered']['id'])
                    assert all(x['id']!=row['requested']['id'] for x in candidate['shifts'])
                    if stage=='peer':
                        case=current(row)
                        status,body=request(row['peer'],sx,dict(action='accept',case_id=row['case'],application_id=app['id'],expected_revision=case['revision']))
                        assert status==422,(status,body)
                        assert current(row)['applications'][0]['status']=='invited'
                    else:
                        changed=ok('manager',path)
                        assert not changed['allowed'] and changed[side]['status']=='ineligible' and changed['giver' if side=='receiver' else 'receiver']['status']=='eligible',changed
                        assert any('30 minutes' in reason for reason in changed[side]['reasons']),changed
                        status,body=request('manager',sx,dict(action='approve',case_id=row['case'],application_id=app['id'],expected_revision=current(row)['revision'],fingerprint=row['baseline_fingerprint']))
                        assert status==409,(status,body)
                    assert owners(row)==original
                    row.setdefault('blocks',[]).append(dict(stage=stage,side=side,status=status,candidate_hidden=True,owners_unchanged=True));save()
                finally:
                    sql(f"update public.schedule_lineup_entries set hidden=true where workspace_id='{w}' and id='{row['extras'][index]}'")
        preview=ok('manager',path)
        assert preview['allowed'] and preview['fingerprint']==row['baseline_fingerprint'],preview
        result=ok('manager',sx,dict(action='approve',case_id=row['case'],application_id=app['id'],expected_revision=current(row)['revision'],fingerprint=preview['fingerprint']))
        assert result['status']=='completed' and owners(row)==original[::-1],result
        row['result']='PASS';new_swaps+=1;save()
    finally:
        for extra in row['extras']:sql(f"update public.schedule_lineup_entries set hidden=true where workspace_id='{w}' and id='{extra}' and source_shift_id is null")
        ok('policy_admin',settings,{**baseline,'minimum_travel_minutes':proof['minimum_before']},'PUT')
for row in proof['rows']:
    assert owners(row)==[row['requested']['owner'],row['offered']['owner']]
    row['verification']=json.loads(sql(f"select jsonb_build_object('status',status,'transfers',(select count(*) from public.shift_exchange_events where case_id=c.id and action='transfer_completed')) from public.shift_exchange_cases c where id='{row['case']}'"))
    assert row['verification']==dict(status='completed',transfers=1),row['verification']
save();OUT.write_text(json.dumps(dict(workspace=w,rows=[{k:v for k,v in row.items() if k!='key'} for row in proof['rows']],minimum_restored=ok('policy_admin',settings)['minimum_travel_minutes']),indent=2))
print(json.dumps(dict(result='PASS',new_swaps=new_swaps,blocks=sum(len(r['blocks']) for r in proof['rows']),swaps=len(proof['rows']))))
