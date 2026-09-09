"""Prepare/restore only the owned travel UI policy; no staffing command."""
from pathlib import Path
from datetime import date,timedelta
import sys,json,urllib.request
from shift_exchange_api_local import login
from lineup_visual_fixture_local import sql
s=json.loads(Path('supabase/.temp/shift-exchange-lineup-overlap-role.json').read_text());w=s['workspace']
assert s['availability_matrix_owned'] and sql(f"select name from public.workspaces where id='{w}'")==s['name']=='Line Up role verification '+w
p=Path('supabase/.temp/shift-exchange-travel-lineup-ui.json')
token=login(s,'policy_admin');url=f'http://127.0.0.1:5560/v1/workspaces/{w}/scheduling-settings'
def request(body=None):
    req=urllib.request.Request(url,headers={'Authorization':'Bearer '+token,'X-Newfork-Workspace-Id':w,'Content-Type':'application/json'},data=json.dumps(body).encode() if body is not None else None,method='PUT' if body is not None else 'GET')
    with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)
current=request()
if sys.argv[1]=='prepare':
    if not p.exists():
        row=json.loads(Path('supabase/.temp/shift-exchange-travel-pickup.json').read_text())['rows'][0]
        p.write_text(json.dumps(dict(workspace=w,day=row['day'],shift=row['shift'],minimum_before=current['minimum_travel_minutes']),indent=2))
    f=json.loads(p.read_text());assert f['workspace']==w
    d=date.fromisoformat(f['day']);week=str(d-timedelta(days=d.weekday()));loc=s['location_b'];actor=s['users']['manager']['id']
    if not sql(f"select id from public.schedule_location_publications where workspace_id='{w}' and location_id='{loc}' and week_start='{week}' and status='current'"):
        sql(f"insert into public.schedule_location_publications(workspace_id,location_id,week_start,version_number,published_by) values('{w}','{loc}','{week}',1,'{actor}')")
    f['owner_before']=sql(f"select employee_id from public.schedule_published_shifts where id='{f['shift']}'")
    f['events_before']=int(sql(f"select count(*) from public.lineup_operation_events where workspace_id='{w}'"));p.write_text(json.dumps(f,indent=2))
    assert request({**current,'minimum_travel_minutes':30})['minimum_travel_minutes']==30
    print(json.dumps(dict(day=f['day'],workspace=w)))
else:
    f=json.loads(p.read_text());assert f['workspace']==w
    result=request({**current,'minimum_travel_minutes':f['minimum_before']})
    assert sql(f"select employee_id from public.schedule_published_shifts where id='{f['shift']}'")==f['owner_before']
    assert int(sql(f"select count(*) from public.lineup_operation_events where workspace_id='{w}'"))==f['events_before']
    print(json.dumps(dict(minimum=result['minimum_travel_minutes'],owner_unchanged=True,staffing_commands=0)))
