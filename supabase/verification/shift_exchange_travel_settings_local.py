"""Real local API policy proof, confined to the owned overlap QA workspace."""
import json, sys, urllib.request
from urllib.error import HTTPError
from pathlib import Path
from shift_exchange_api_local import login
from lineup_visual_fixture_local import sql

STATE=Path('supabase/.temp/shift-exchange-lineup-overlap-role.json')
BASE=Path('supabase/.temp/shift-exchange-travel-settings-baseline.json')
OUT=Path('docs/rebuild/shift-hub-visual-proof-2026-09-07/travel-policy')
s=json.loads(STATE.read_text());w=s['workspace']
assert s['name']=='Line Up role verification '+w and s['availability_matrix_owned']
assert sql(f"select name from public.workspaces where id='{w}'")==s['name']
tokens={role:login(s,role) for role in ('policy_admin','employee','manager')}
def request(role,body=None,workspace=w):
    req=urllib.request.Request(f'http://127.0.0.1:5560/v1/workspaces/{workspace}/scheduling-settings',
        headers={'Authorization':'Bearer '+tokens[role],'X-Newfork-Workspace-Id':w,'Content-Type':'application/json'},
        data=json.dumps(body).encode() if body is not None else None,method='PUT' if body is not None else 'GET')
    try:
        with urllib.request.urlopen(req,timeout=30) as r:return r.status,json.load(r)
    except HTTPError as e:return e.code,json.load(e)
status,current=request('policy_admin');assert status==200,current
if sys.argv[1]=='prepare':
    if not BASE.exists():BASE.write_text(json.dumps(current,indent=2))
    assert json.loads(BASE.read_text())['workspace_id']==w
    print(json.dumps(dict(workspace=w,baseline=current['minimum_travel_minutes'])))
else:
    baseline=json.loads(BASE.read_text());assert baseline['workspace_id']==w
    report=dict(workspace=w,checks=[])
    try:
        assert current['minimum_travel_minutes']==30,current
        for role in ('employee','manager'):
            status,_=request(role,{**current,'minimum_travel_minutes':60})
            assert status==403,(role,status)
            report['checks'].append(dict(role=role,status=status))
        for value in (-1,241,30.5):
            status,_=request('policy_admin',{**current,'minimum_travel_minutes':value})
            assert status==400,(value,status)
        old_payload={k:v for k,v in current.items() if k!='minimum_travel_minutes'}
        status,saved=request('policy_admin',old_payload)
        assert status==200 and saved['minimum_travel_minutes']==30,(status,saved)
        report['old_payload_preserved']=True
        other='f16128a0-a7ed-4754-988b-923b394fe417'
        report['other_workspace_statuses']=[]
        for body in (None,{**current,'minimum_travel_minutes':60}):
            status,_=request('policy_admin',body,other);assert status==404,status
            report['other_workspace_statuses'].append(status)
        report['other_workspace_read_write_denied']=True
        actor=s['users']['policy_admin']['id']
        report['audit_actor_verified']=int(sql(f"select count(*) from public.audit_events where workspace_id='{w}' and actor_user_id='{actor}' and action='scheduling.settings_updated' and metadata->'after'->>'minimum_travel_minutes'='30'"))>=1
        assert report['audit_actor_verified']
    finally:
        status,saved=request('policy_admin',baseline)
        assert status==200 and saved['minimum_travel_minutes']==baseline['minimum_travel_minutes'],(status,saved)
        report['restored_minimum']=saved['minimum_travel_minutes']
        OUT.mkdir(parents=True,exist_ok=True);(OUT/'api.json').write_text(json.dumps(report,indent=2))
        print(json.dumps(report))
