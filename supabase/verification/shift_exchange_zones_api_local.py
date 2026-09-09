"""AT20: midnight availability boundaries and two-zone swaps via real local API.

Dedicated owned fixtures. No clock, Auth, response or eligibility-guard mocks.
Baseline setup is not counted as a new midnight/timezone acceptance scenario.
"""
from contextlib import redirect_stdout
from datetime import date, timedelta, datetime
import io
import json
import uuid
import urllib.request
from urllib.error import HTTPError
import shift_exchange_availability_api_local as baseline
from shift_exchange_api_local import env, login, sql
from lineup_role_fixture_local import ROOT

STATE = ROOT / 'supabase/.temp/shift-exchange-zones-role.json'
BASE = ROOT / 'supabase/.temp/shift-exchange-zones-baseline.json'
PROOF = ROOT / 'supabase/.temp/shift-exchange-zones-api.json'


def main():
    env()
    if not PROOF.exists():
        baseline.STATE, baseline.PROOF = STATE, BASE
        today = date.fromisoformat(sql('select current_date'))
        anchor = today + timedelta(days=21)
        baseline.WEEK_START = anchor - timedelta(days=anchor.weekday())
        if BASE.exists() and json.loads(BASE.read_text()).get('rows'):
            baseline.WEEK_START = date.fromisoformat(json.loads(BASE.read_text())['rows'][0]['day'])
        with redirect_stdout(io.StringIO()): baseline.main()
        base = json.loads(BASE.read_text())
        PROOF.write_text(json.dumps(dict(workspace=base['workspace'], anchor=base['rows'][0]['day'], rows=[], publications={}), indent=2), encoding='utf-8')
    state, proof = [json.loads(path.read_text()) for path in (STATE, PROOF)]
    w = str(uuid.UUID(state['workspace']))
    assert state['availability_matrix_owned'] and proof['workspace'] == w
    assert sql(f"select name from public.workspaces where id='{w}'") == state['name']
    anchor = date.fromisoformat(proof['anchor']); day = lambda offset: str(anchor + timedelta(days=offset))
    save = lambda: PROOF.write_text(json.dumps(proof, indent=2), encoding='utf-8')
    tokens = {role: login(state, role) for role in ('manager','employee','casey')}
    def request(role, suffix='/shift-exchanges', command=None, key=None):
        req = urllib.request.Request(f'http://127.0.0.1:5560/v1/workspaces/{w}' + suffix,
            headers={'Authorization':'Bearer '+tokens[role], 'X-Newfork-Workspace-Id':w,
                **({'Content-Type':'application/json','Idempotency-Key':key or str(uuid.uuid4())} if command else {})},
            data=json.dumps(command).encode() if command else None)
        try:
            with urllib.request.urlopen(req,timeout=30) as response: return response.status,json.load(response)
        except HTTPError as error: return error.code,json.load(error)
    def ok(role,suffix='/shift-exchanges',command=None,key=None):
        status,result=request(role,suffix,command,key)
        assert status==200,(role,suffix,status,result)
        return result
    if not proof.get('availability'):
        proof.setdefault('availability_key',str(uuid.uuid4())); save()
        result=ok('casey','/availability',dict(action='submit',employee_id=state['employee_casey'],expected_revision=6,source='employee',
            proposal=dict(timezone='America/Los_Angeles',effective_from=day(15),effective_until=day(15),kind='temporary',
                days=[dict(day=d,mode='unavailable',windows=[]) for d in range(7)])),proof['availability_key'])
        assert result['status']=='effective',result
        proof['availability']=True; save()
    if not proof['rows']:
        def shift(offset,loc,owner,start,end):
            return dict(id=str(uuid.uuid4()),source=str(uuid.uuid4()),day=day(offset),location=state['location_'+loc],
                owner=state['employee_a'] if owner=='a' else state['employee_casey'],start=start,end=end,
                zone='America/Los_Angeles' if loc=='a' else 'America/New_York')
        proof['night']=[dict(label=label,eligible=eligible,shift=shift(offset,'a','a','22:00','02:00'),key=str(uuid.uuid4())) for label,offset,eligible in
            [('restriction begins at midnight',14,False),('restriction ends at midnight',15,False),('full overnight after exception',16,True)]]
        proof['swaps']=[
            dict(label='same wall clock, no physical overlap',offered=shift(21,'a','a','16:00','20:00'),requested=shift(22,'b','c','19:00','23:00'),
                extra=shift(21,'b','c','16:00','17:00'),key=str(uuid.uuid4())),
            dict(label='overnight swap between timezones',offered=shift(23,'a','a','22:00','02:00'),requested=shift(24,'b','c','22:00','02:00'),key=str(uuid.uuid4())),
        ]
        proof['conflict']=dict(offered=shift(25,'a','a','16:00','20:00'),requested=shift(26,'b','c','19:00','23:00'),extra=shift(25,'b','c','20:00','21:00'))
        proof['rows']=proof['night']+proof['swaps']; save()
    # JSON reload does not preserve alias identity between rows/night/swaps.
    proof['rows']=proof['night']+proof['swaps']
    shifts=[r['shift'] for r in proof['night']]+[r[k] for r in proof['swaps'] for k in ('offered','requested','extra') if k in r]+list(proof['conflict'].values())
    if not proof.get('prepared'):
        sql(f"update public.locations set timezone='America/New_York' where workspace_id='{w}' and id='{state['location_b']}'")
        statements=['begin;']
        for shift in shifts:
            when=date.fromisoformat(shift['day']); week=str(when-timedelta(days=when.weekday()))
            key=shift['location']+week
            if key not in proof['publications']:
                proof['publications'][key]=str(uuid.uuid4())
            publication=proof['publications'][key]
            statements += [f"insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by) values('{publication}','{w}','{shift['location']}','{week}',1,'{state['users']['manager']['id']}') on conflict(id) do nothing;",
                f"insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id) values('{shift['id']}','{w}','{publication}','{shift['location']}','{shift['owner']}','{state['job']}','{state['service']}','{shift['day']}','{shift['start']}','{shift['end']}','{shift['source']}') on conflict(id) do nothing;"]
        save(); sql('\n'.join(statements+['commit;'])); proof['prepared']=True; save()
    def case(row):
        shift=row.get('shift',row.get('offered'))
        return next(c for c in ok('manager',f"/shift-exchanges?view=manager&from={shift['day']}&to={shift['day']}")['cases'] if c['id']==row['case'])
    def owner(shift):
        return sql(f"select employee_id from public.schedule_published_shifts where workspace_id='{w}' and id='{shift['id']}'")
    new_rows=0
    for row in proof['night']:
        if row.get('result')=='PASS': continue
        shift=row['shift']; eligible=row['eligible']
        assessment=ok('manager','/availability/shift-assessment',dict(shift=dict(location_id=shift['location'],employee_id=state['employee_casey'],
            job_id=state['job'],shift_type_id=state['service'],scheduled_date=shift['day'],start_time='22:00',end_time='02:00',time_basis='explicit',hide_time_on_badge=False,unpaid_break_minutes=0,note='')))
        assert assessment['coverage']==('full' if eligible else 'partial'),assessment
        row['assessment']={k:assessment[k] for k in ('coverage','operation','available_intervals','unavailable_intervals','reasons')}
        if not eligible:
            intervals=assessment['available_intervals']; assert len(intervals)==1
            parse=lambda value:datetime.fromisoformat(value.replace('Z','+00:00'))
            assert (parse(intervals[0]['end_at'])-parse(intervals[0]['start_at'])).total_seconds()==7200
        assert any(e['id']==state['employee_casey'] for e in ok('employee','/shift-exchanges?shift_id='+shift['id'])['employees'])==eligible
        if not row.get('case'):
            row['case']=ok('employee',command=dict(action='create',kind='cover',shift_id=shift['id']),key=row['key'])['case_id']; save()
        listed=ok('casey',f"/shift-exchanges?view=employee&from={shift['day']}&to={shift['day']}")
        assert any(o['case_id']==row['case'] for o in listed['opportunities'])==eligible
        status,result=request('casey',command=dict(action='apply',case_id=row['case'],shift_id=shift['id']))
        row['pickup_status']=status
        if not eligible:
            assert status==422 and 'not eligible' in result.get('error',''),result
            row['pickup_reason']=result['error']
            status,result=request('employee',command=dict(action='create',kind='cover',shift_id=shift['id'],employee_id=state['employee_casey']))
            assert status==422 and 'not eligible' in result.get('error',''),result
            row['direct_status']=status
            current=case(row); assert current['applications']==[] and owner(shift)==shift['owner']
            ok('employee',command=dict(action='close',case_id=row['case'],expected_revision=current['revision'],reason='Partial overnight cover is not a full replacement.'))
        else:
            assert status==200,result
            current=case(row); application=current['applications'][0]['id']
            preview=ok('manager',f"/shift-exchanges?case_id={row['case']}&application_id={application}")
            assert preview['allowed'] and owner(shift)==shift['owner']
            result=ok('manager',command=dict(action='approve',case_id=row['case'],application_id=application,expected_revision=current['revision'],fingerprint=preview['fingerprint']))
            assert result['status']=='completed' and owner(shift)==state['employee_casey']
        row['result']='PASS'; save(); new_rows+=1
        print(json.dumps(dict(scenario=row['label'],coverage=assessment['coverage'],result='PASS')),flush=True)
    today=date.fromisoformat(sql('select current_date'))
    if not proof.get('swap_done'):
        assert today<date.fromisoformat(day(21)) and date.fromisoformat(day(26))<=today+timedelta(days=62)
    for row in proof['swaps']:
        if row.get('result')=='PASS': continue
        offered,requested=row['offered'],row['requested']
        assert any(s['id']==requested['id'] for s in ok('employee','/shift-exchanges?shift_id='+offered['id'])['shifts'])
        if not row.get('case'):
            row['case']=ok('employee',command=dict(action='create',kind='swap',shift_id=offered['id'],requested_shift_id=requested['id']),key=row['key'])['case_id']; save()
        current=case(row); application=current['applications'][0]
        if application['status']=='invited':
            ok('casey',command=dict(action='accept',case_id=row['case'],application_id=application['id'],expected_revision=current['revision']))
        current=case(row); preview=ok('manager',f"/shift-exchanges?case_id={row['case']}&application_id={application['id']}")
        assert preview['allowed'] and preview['receiver']['status']==preview['giver']['status']=='eligible',preview
        assert owner(offered)==offered['owner'] and owner(requested)==requested['owner']
        row['before']={k:current[k] for k in ('shift','requested_shift')}
        result=ok('manager',command=dict(action='approve',case_id=row['case'],application_id=application['id'],expected_revision=current['revision'],fingerprint=preview['fingerprint']))
        assert result['status']=='completed'
        final=case(row)
        for key,definition in (('shift',offered),('requested_shift',requested)):
            assert final[key]['time_timezone']==definition['zone']
            for field in ('starts_at','ends_at','start_time','end_time','time_timezone'):
                assert final[key][field]==row['before'][key][field]
        assert owner(offered)==requested['owner'] and owner(requested)==offered['owner']
        row['result']='PASS'; row['both_physical_ranges_preserved']=True; save(); new_rows+=1
        print(json.dumps(dict(scenario=row['label'],result='PASS')),flush=True)
    proof.setdefault('conflict_checks',[])
    for role in ('employee','casey'):
        if any(r['role']==role for r in proof['conflict_checks']): continue
        offered,requested=proof['conflict']['offered'],proof['conflict']['requested']
        if role=='casey': offered,requested=requested,offered
        assert all(s['id']!=requested['id'] for s in ok(role,'/shift-exchanges?shift_id='+offered['id'])['shifts'])
        status,result=request(role,command=dict(action='create',kind='swap',shift_id=offered['id'],requested_shift_id=requested['id']))
        assert status==422 and 'eligible' in result.get('error',''),result
        assert owner(offered)==offered['owner'] and owner(requested)==requested['owner']
        proof['conflict_checks'].append(dict(role=role,match_hidden=True,status=status,reason=result['error'],owners_unchanged=True)); save()
    proof['swap_done']=True; save()
    for row in proof['night']:
        assert row['assessment']['operation']==('allowed' if row['eligible'] else 'blocked')
    for index,row in enumerate(proof['night'][:2]):
        boundary=sql(f"select ('{row['shift']['day']}'::date+1)::timestamp at time zone 'America/Los_Angeles'")
        parse=lambda value:datetime.fromisoformat(value.replace('Z','+00:00'))
        available=row['assessment']['available_intervals'][0]
        assert parse(available['end_at' if index==0 else 'start_at'])==parse(boundary)
        row['verified_midnight_boundary_utc']=parse(boundary).isoformat()
    offered,requested=proof['conflict']['offered'],proof['conflict']['requested']
    conflict_check=json.loads(sql(f"select public.lineup_candidate_check('{w}','{state['employee_casey']}',public.shift_exchange_shift('{w}','{offered['id']}'),array['{offered['id']}'::uuid,'{requested['id']}'::uuid])"))
    assert conflict_check['status']=='ineligible' and any('overlap' in reason.lower() for reason in conflict_check['reasons']),conflict_check
    proof['canonical_conflict_reason']=conflict_check['reasons']; save()
    ids=','.join("'"+str(uuid.UUID(r['case']))+"'" for r in proof['rows'])
    verification=json.loads(sql(f"""begin transaction read only;
      select jsonb_build_object('cases',(select count(*) from public.shift_exchange_cases where workspace_id='{w}' and id in({ids})),
        'completed',(select count(*) from public.shift_exchange_cases where workspace_id='{w}' and id in({ids}) and status='completed'),
        'cancelled',(select count(*) from public.shift_exchange_cases where workspace_id='{w}' and id in({ids}) and status='cancelled'),
        'transfers',(select count(*) from public.shift_exchange_events where workspace_id='{w}' and case_id in({ids}) and action='transfer_completed'),
        'open_cases',(select count(*) from public.shift_exchange_cases where workspace_id='{w}' and status='open')); commit;"""))
    assert verification==dict(cases=5,completed=3,cancelled=2,transfers=3,open_cases=0),verification
    for row in proof['night']:
        assert owner(row['shift'])==(state['employee_casey'] if row['eligible'] else state['employee_a'])
    for row in proof['swaps']:
        assert owner(row['offered'])==state['employee_casey'] and owner(row['requested'])==state['employee_a']
    for shift in proof['conflict'].values(): assert owner(shift)==shift['owner']
    proof['verification']=verification; proof['result']='PASS'; save()
    print(json.dumps(dict(result='PASS',new_rows=new_rows,night=3,swaps=2,physical_conflict_directions=2,current_database=verification)))


if __name__=='__main__': main()
