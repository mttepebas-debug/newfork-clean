"""AT22: linked placement, native extra assignment and legacy standalone rows.

Real local Auth + HTTP. Only legacy data preparation uses scoped fixture SQL;
manager Line Up commands create/release native work and hide the legacy fixture.
"""
from contextlib import redirect_stdout
from datetime import date,timedelta
import io,json,uuid,urllib.request
from urllib.error import HTTPError
import shift_exchange_availability_api_local as baseline
from shift_exchange_api_local import env,login,sql
from lineup_role_fixture_local import ROOT

STATE=ROOT/'supabase/.temp/shift-exchange-lineup-overlap-role.json'
BASE=ROOT/'supabase/.temp/shift-exchange-lineup-overlap-baseline.json'
PROOF=ROOT/'supabase/.temp/shift-exchange-lineup-overlap.json'


def main():
    env()
    if not PROOF.exists():
        baseline.STATE,baseline.PROOF=STATE,BASE
        start=date.fromisoformat(sql('select current_date'))+timedelta(days=21)
        baseline.WEEK_START=start-timedelta(days=start.weekday())
        if BASE.exists() and json.loads(BASE.read_text()).get('rows'):
            baseline.WEEK_START=date.fromisoformat(json.loads(BASE.read_text())['rows'][0]['day'])
        with redirect_stdout(io.StringIO()): baseline.main()
        base=json.loads(BASE.read_text())
        PROOF.write_text(json.dumps(dict(workspace=base['workspace'],anchor=base['rows'][0]['day'],pairs=[],publications={}),indent=2),encoding='utf-8')
    state,proof=[json.loads(p.read_text()) for p in (STATE,PROOF)]
    w=str(uuid.UUID(state['workspace'])); anchor=date.fromisoformat(proof['anchor'])
    assert state['availability_matrix_owned'] and proof['workspace']==w
    assert sql(f"select name from public.workspaces where id='{w}'")==state['name']
    save=lambda:PROOF.write_text(json.dumps(proof,indent=2),encoding='utf-8')
    tokens={role:login(state,role) for role in ('manager','employee','casey')}
    def request(role,path,body=None,method=None,key=None):
        req=urllib.request.Request('http://127.0.0.1:5560'+path,
            headers={'Authorization':'Bearer '+tokens[role],'X-Newfork-Workspace-Id':w,
                **({'Content-Type':'application/json','Idempotency-Key':key or str(uuid.uuid4())} if body is not None else {})},
            data=json.dumps(body).encode() if body is not None else None,method=method)
        try:
            with urllib.request.urlopen(req,timeout=30) as r:return r.status,json.load(r)
        except HTTPError as e:return e.code,json.load(e)
    def ok(role,path,body=None,method=None,key=None):
        status,result=request(role,path,body,method,key)
        assert status in (200,201),(path,status,result)
        return result
    sx=f'/v1/workspaces/{w}/shift-exchanges'
    def operation(kind,target,person=None,source=None):
        op=dict(kind=kind,target=target,source_entry_id=source,target_entry_id=None,employee_id=person,
            reason='Local Shift Hub overlap verification',travel_minutes=0)
        preview=ok('manager','/schedule/lineups/operations/preview',dict(operation=op))
        assert preview['allowed'],preview
        return ok('manager','/schedule/lineups/operations',dict(operation=op,fingerprint=preview['fingerprint'],idempotency_key=str(uuid.uuid4())))
    def entry(shift,person=None,source=True,hidden=False):
        return dict(source_shift_id=shift['id'] if source else None,employee_id=person or shift['owner'],job_id=state['job'],shift_type_id=state['service'],
            start_time=shift['start'],end_time=shift['end'],section_id=None,station='QA source station' if source else 'QA legacy extra',
            note='',call_off=False,hidden=hidden,display_order=0)
    def target(shift):
        return dict(date=shift['day'],location_id=shift['location'],job_id=state['job'],shift_type_id=state['service'],
            start_time=shift['start'],end_time=shift['end'],section_id=None,station='')
    if not proof['pairs']:
        def shift(offset,loc,owner,start,end):
            return dict(id=str(uuid.uuid4()),source=str(uuid.uuid4()),day=str(anchor+timedelta(days=offset)),
                location=state['location_'+loc],owner=state['employee_a'] if owner=='a' else state['employee_casey'],start=start,end=end)
        proof['pairs']=[dict(label='linked placements are not second jobs',offered=shift(14,'a','a','16:00','18:00'),requested=shift(14,'b','c','16:00','18:00'),key=str(uuid.uuid4())),
            dict(label='native and standalone extra revalidation',offered=shift(15,'a','a','09:00','11:00'),requested=shift(16,'b','c','09:00','11:00'),key=str(uuid.uuid4()))]
        save()
    new_swaps=0
    for pair in proof['pairs']:
        for shift in (pair['offered'],pair['requested']):
            if shift.get('overlay'):continue
            day=date.fromisoformat(shift['day']); week=str(day-timedelta(days=day.weekday())); k=shift['location']+week
            proof['publications'].setdefault(k,str(uuid.uuid4())); save()
            sql(f"""begin;
              insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by) values('{proof['publications'][k]}','{w}','{shift['location']}','{week}',1,'{state['users']['manager']['id']}') on conflict(id) do nothing;
              insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id) values('{shift['id']}','{w}','{proof['publications'][k]}','{shift['location']}','{shift['owner']}','{state['job']}','{state['service']}','{shift['day']}','{shift['start']}','{shift['end']}','{shift['source']}') on conflict(id) do nothing;
              commit;""")
            result=ok('manager','/schedule/lineups/entries',dict(location_id=shift['location'],date=shift['day'],entry=entry(shift)))
            shift['overlay']=result['entry_id']; save()
    def current(pair):
        return next(c for c in ok('manager',sx+f"?view=manager&from={pair['offered']['day']}&to={pair['requested']['day']}")['cases'] if c['id']==pair['case'])
    def owner(shift):return sql(f"select employee_id from public.schedule_published_shifts where workspace_id='{w}' and id='{shift['id']}'")
    def preview(pair):return ok('manager',sx+f"?case_id={pair['case']}&application_id={pair['application']}")
    for pair in proof['pairs']:
        if pair.get('result')=='PASS':continue
        a,b=pair['offered'],pair['requested']
        if not pair.get('case'):
            assert any(s['id']==b['id'] for s in ok('employee',sx+'?shift_id='+a['id'])['shifts'])
            pair['case']=ok('employee',sx,dict(action='create',kind='swap',shift_id=a['id'],requested_shift_id=b['id']),key=pair['key'])['case_id']; save()
        case=current(pair); app=case['applications'][0]; pair['application']=app['id'];save()
        if app['status']=='invited':ok('casey',sx,dict(action='accept',case_id=pair['case'],application_id=app['id'],expected_revision=case['revision']))
        before=preview(pair)
        if not pair.get('native_extra'):
            assert before['allowed'] and before['receiver']['status']==before['giver']['status']=='eligible',before
            pair['baseline_fingerprint']=before['fingerprint'];save()
        else:
            # A stopped verifier may leave its native extra active. Recover the
            # recorded consent, not a new "eligible" baseline or duplicate work.
            pair.setdefault('baseline_fingerprint',sql(f"select consent_fingerprint from public.shift_exchange_cases where workspace_id='{w}' and id='{pair['case']}'"))
            assert before['fingerprint']==pair['baseline_fingerprint'];save()
        if pair is proof['pairs'][1]:
            extra=dict(day=a['day'],location=a['location'],start='09:30',end='10:30',owner=state['employee_casey'])
            pair.setdefault('extra_target',extra); extra=pair['extra_target'];save()
            for unused in ('id','source','overlay'):extra.pop(unused,None)
            def blocked(label):
                p=preview(pair);assert not p['allowed'] and p['receiver']['status']=='ineligible',p
                assert any('overlap' in reason.lower() for reason in p['receiver']['reasons']),p
                assert all(s['id']!=b['id'] for s in ok('employee',sx+'?shift_id='+a['id'])['shifts'])
                status,result=request('manager',sx,dict(action='approve',case_id=pair['case'],application_id=pair['application'],expected_revision=current(pair)['revision'],fingerprint=pair['baseline_fingerprint']))
                assert status==409,(status,result)
                assert owner(a)==a['owner'] and owner(b)==b['owner']
                pair.setdefault('blocks',{})[label]=dict(final_status=status,reasons=p['receiver']['reasons'],match_hidden=True,owners_unchanged=True);save()
            if not pair.get('native_extra'):
                pair['native_extra']=operation('assign',target(extra),state['employee_casey']);save()
            if not pair.get('native_released'):
                blocked('committed extra assignment')
                native_entry=sql(f"select id from public.schedule_lineup_entries where workspace_id='{w}' and source_shift_id='{pair['native_extra']['shift_id']}'")
                assert native_entry
                pair['native_entry']=native_entry;save()
                result=operation('release',target(extra),source=native_entry)
                assert result['status']=='applied';pair['native_released']=True;save()
            assert preview(pair)['allowed']
            if not pair.get('legacy_extra'):
                pair['legacy_extra']=str(uuid.uuid4());save()
            legacy=pair['legacy_extra']
            if not pair.get('legacy_hidden'):
                # Reproduce a supported historical standalone working row. New work
                # must use native assignment operations; no guard is bypassed.
                sql(f"insert into public.schedule_lineup_entries(id,workspace_id,lineup_id,location_id,employee_id,job_id,shift_type_id,start_time,end_time,station,created_by,updated_by) select '{legacy}','{w}',id,'{a['location']}','{state['employee_casey']}','{state['job']}','{state['service']}','09:30','10:30','QA legacy extra','{state['users']['manager']['id']}','{state['users']['manager']['id']}' from public.schedule_lineups where workspace_id='{w}' and location_id='{a['location']}' and lineup_date='{a['day']}' on conflict(id) do nothing")
                blocked('legacy independent extra')
                revision=int(sql(f"select revision from public.schedule_lineup_entries where workspace_id='{w}' and id='{legacy}'"))
                ok('manager','/schedule/lineups/entries/'+legacy,dict(location_id=a['location'],date=a['day'],expected_revision=revision,entry=entry(extra,source=False,hidden=True)),method='PUT')
                pair['legacy_hidden']=True;save()
            assert preview(pair)['allowed']
        case=current(pair);p=preview(pair)
        assert owner(a)==a['owner'] and owner(b)==b['owner']
        result=ok('manager',sx,dict(action='approve',case_id=pair['case'],application_id=pair['application'],expected_revision=case['revision'],fingerprint=p['fingerprint']))
        assert result['status']=='completed' and owner(a)==b['owner'] and owner(b)==a['owner']
        pair['result']='PASS';save();new_swaps+=1;print(json.dumps(dict(scenario=pair['label'],result='PASS')),flush=True)
    ids=','.join("'"+str(uuid.UUID(p['case']))+"'" for p in proof['pairs'])
    verification=json.loads(sql(f"select jsonb_build_object('completed',(select count(*) from public.shift_exchange_cases where workspace_id='{w}' and id in({ids}) and status='completed'),'transfers',(select count(*) from public.shift_exchange_events where workspace_id='{w}' and case_id in({ids}) and action='transfer_completed'),'open_cases',(select count(*) from public.shift_exchange_cases where workspace_id='{w}' and status='open'))"))
    assert verification==dict(completed=2,transfers=2,open_cases=0),verification
    for pair in proof['pairs']:
        for shift,expected in ((pair['offered'],pair['requested']['owner']),(pair['requested'],pair['offered']['owner'])):
            assert owner(shift)==expected
            assert sql(f"select employee_id::text||'|'||station from public.schedule_lineup_entries where workspace_id='{w}' and id='{shift['overlay']}'")==expected+'|QA source station'
    extra=proof['pairs'][1]
    assert sql(f"select employee_id is null from public.schedule_published_shifts where workspace_id='{w}' and id='{extra['native_extra']['shift_id']}'")=='t'
    assert sql(f"select hidden and source_shift_id is null from public.schedule_lineup_entries where workspace_id='{w}' and id='{extra['legacy_extra']}'")=='t'
    verification['native_extra_released']=True
    verification['legacy_extra_hidden']=True
    verification['source_placements_preserved']=4
    proof['verification']=verification;proof['result']='PASS';save()
    print(json.dumps(dict(result='PASS',new_swaps=new_swaps,current=verification)))


if __name__=='__main__':main()
