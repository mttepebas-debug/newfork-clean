"""AT19: real Auth/API version composition, strict cover and publication lock.

Only creates records in its separately owned local QA workspace. Availability
uses normal employee commands before publication; no guard bypass or fake apps.
Credentials stay in ignored state. Reruns verify completed evidence, not new runs.
"""
from contextlib import redirect_stdout
from datetime import date, timedelta
import io
import json
import uuid
import urllib.request
from urllib.error import HTTPError
from lineup_role_fixture_local import ROOT, sql, auth, create as create_base
from shift_exchange_api_local import env, login

STATE = ROOT / 'supabase/.temp/shift-exchange-availability-role.json'
PROOF = ROOT / 'supabase/.temp/shift-exchange-availability-api.json'
API = 'http://127.0.0.1:5560'
WEEK_START = date(2028, 3, 6)


def main():
    env()
    if not STATE.exists():
        with redirect_stdout(io.StringIO()):
            create_base(STATE)
    state = json.loads(STATE.read_text(encoding='utf-8'))
    w = str(uuid.UUID(state['workspace']))
    assert state['kind'] == 'lineup-role-fixture-v1'
    assert state['name'] == 'Line Up role verification ' + w
    assert sql(f"select name from public.workspaces where id='{w}'") == state['name']
    if 'casey' not in state['users']:
        email = f'availability-casey-{w}@example.test'
        user = auth('POST', 'users', dict(email=email, password=state['password'], email_confirm=True))
        state['users']['casey'] = dict(id=user['id'], email=email)
        state['employee_casey'] = str(uuid.uuid4())
        STATE.write_text(json.dumps(state, indent=2), encoding='utf-8')
    person, actor, manager = [str(uuid.UUID(v)) for v in (
        state['employee_casey'], state['users']['casey']['id'], state['users']['manager']['id'])]
    if not state.get('availability_matrix_owned'):
        assert sql(f"select count(*) from public.shift_exchange_cases where workspace_id='{w}'") == '0'
        sql(f"""begin;
          update public.workspaces set shift_exchanges_enabled=true where id='{w}';
          update public.workspace_scheduling_settings set availability_ownership='hybrid',
            availability_approval='none',availability_initial_review=false,availability_notice_days=0,
            availability_enforcement='hard' where workspace_id='{w}';
          insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) values('{w}','{actor}','employee','active',true);
          insert into public.user_profiles(user_id,display_name) values('{actor}','Availability Casey QA') on conflict(user_id) do nothing;
          insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
            values('{person}','{w}','{actor}','E-9019','Availability Casey','QA','{manager}');
          insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by) values('{w}','{person}','{state['job']}','{manager}');
          insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
            select '{w}','{person}',id,'{manager}' from public.locations where workspace_id='{w}';
          insert into public.user_workspace_preferences(user_id,active_workspace_id) values('{actor}','{w}') on conflict(user_id) do nothing;
          commit;""")
        state['availability_matrix_owned'] = True
        state['exchange_fixture'] = True
        STATE.write_text(json.dumps(state, indent=2), encoding='utf-8')
    tokens = {role: login(state, role) for role in ('manager', 'employee', 'casey')}
    proof = json.loads(PROOF.read_text()) if PROOF.exists() else dict(workspace=w, versions=[], rows=[])
    assert proof['workspace'] == w
    save = lambda: PROOF.write_text(json.dumps(proof, indent=2), encoding='utf-8')

    def request(role, suffix='/shift-exchanges', command=None, key=None):
        req = urllib.request.Request(API + f'/v1/workspaces/{w}' + suffix,
            headers={'Authorization': 'Bearer ' + tokens[role], 'X-Newfork-Workspace-Id': w,
                **({'Content-Type': 'application/json', 'Idempotency-Key': key or str(uuid.uuid4())} if command else {})},
            data=json.dumps(command).encode() if command else None)
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def ok(role, suffix='/shift-exchanges', command=None, key=None):
        status, result = request(role, suffix, command, key)
        assert status == 200, (role, suffix, status, result)
        return result

    def rules(mode, windows=None):
        return [dict(day=n, mode=mode, windows=windows or []) for n in range(7)]

    def proposal(start, end=None, mode='unrestricted', windows=None, **extra):
        return dict(timezone='America/Los_Angeles', effective_from=start, effective_until=end,
            kind='temporary' if end else 'weekly', days=rules(mode, windows), **extra)

    days = [str(WEEK_START + timedelta(days=n)) for n in range(7)]
    proposals = [
        ('weekly base', proposal(days[1])),
        ('temporary full-day restriction', proposal(days[2], days[2], 'unavailable')),
        ('later weekly preserving temporary', proposal(days[1])),
        ('temporary partial hours', proposal(days[4], days[4], 'windows', [dict(start='00:00', end='17:00')])),
        ('dated partial hours', proposal(days[5], days[5], 'unavailable', date_overrides=[
            dict(segment_date=days[5], start_time='17:00', end_time='18:00', mode='unavailable')])),
        ('later weekly preserving dated hours', proposal(days[1])),
    ]
    for index, (label, value) in enumerate(proposals):
        if index < len(proof['versions']) and proof['versions'][index].get('result') == 'effective':
            continue
        row = proof['versions'][index] if index < len(proof['versions']) else dict(label=label, key=str(uuid.uuid4()))
        if index == len(proof['versions']):
            proof['versions'].append(row)
        save()
        result = ok('casey', '/availability', dict(action='submit', employee_id=person,
            expected_revision=index, proposal=value, source='employee'), row['key'])
        assert result['status'] == 'effective', result
        row['result'] = result['status']; save()
        print(json.dumps(dict(version=index+1, label=label, status=result['status'])), flush=True)

    scenarios = [('missing availability', False), ('weekly full + publication lock', True),
        ('temporary survives later weekly', False), ('expired temporary restores weekly', True),
        ('partial temporary', False), ('dated partial survives later weekly', False),
        ('dated hours do not recur next day', True)]
    if not proof.get('publication'):
        proof['publication'] = str(uuid.uuid4())
        for index, (label, eligible) in enumerate(scenarios):
            proof['rows'].append(dict(label=label, eligible=eligible, day=days[index],
                shift=str(uuid.uuid4()), source=str(uuid.uuid4()), create_key=str(uuid.uuid4())))
        save()
    assert [row['day'] for row in proof['rows']] == days, 'Existing fixture dates differ; do not rewrite them'
    statements = [f"begin; insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by) values('{proof['publication']}','{w}','{state['location_a']}','{WEEK_START}',1,'{manager}') on conflict(id) do nothing;"]
    for row in proof['rows']:
        statements.append(f"insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id) values('{row['shift']}','{w}','{proof['publication']}','{state['location_a']}','{state['employee_a']}','{state['job']}','{state['service']}','{row['day']}','16:00','18:00','{row['source']}') on conflict(id) do nothing;")
    sql('\n'.join(statements + ['commit;']))
    new_rows = 0
    for index, row in enumerate(proof['rows']):
        if row.get('result') == 'PASS':
            continue
        query = f"/shift-exchanges?view=manager&from={row['day']}&to={row['day']}"
        direct = index == 6
        candidates = ok('employee', '/shift-exchanges?shift_id=' + row['shift'])['employees']
        assert any(e['id'] == person for e in candidates) == row['eligible']
        row['candidate_listing'] = row['eligible']; save()
        if not row.get('case'):
            command = dict(action='create', kind='cover', shift_id=row['shift'])
            if direct:
                command['employee_id'] = person
            row['case'] = ok('employee', command=command, key=row['create_key'])['case_id']; save()
        def current():
            return next(c for c in ok('manager', query)['cases'] if c['id'] == row['case'])
        if not direct:
            opportunities = ok('casey', f"/shift-exchanges?view=employee&from={row['day']}&to={row['day']}")['opportunities']
            assert any(o['case_id'] == row['case'] for o in opportunities) == row['eligible']
            row['pool_listing'] = row['eligible']
        if not row['eligible']:
            for label, role, command in (
                ('pool submit', 'casey', dict(action='apply', case_id=row['case'], shift_id=row['shift'])),
                ('direct submit', 'employee', dict(action='create', kind='cover', shift_id=row['shift'], employee_id=person)),
            ):
                status, result = request(role, command=command)
                row[label] = dict(status=status, error=result.get('error')); save()
                assert status == 422, (label, status, result)
                assert 'not eligible for the full shift' in result.get('error', ''), result
            assert current()['applications'] == [], current()
            row['no_application'] = True
            latest = current()
            ok('employee', command=dict(action='close', case_id=row['case'], expected_revision=latest['revision'],
                reason='Availability verification complete; owner retains this shift.'))
        else:
            latest = current()
            if direct:
                application = latest['applications'][0]
                if application['status'] == 'invited':
                    ok('casey', command=dict(action='accept', case_id=row['case'], application_id=application['id'], expected_revision=latest['revision']))
            elif not latest['applications']:
                ok('casey', command=dict(action='apply', case_id=row['case'], shift_id=row['shift']))
            latest = current()
            application = latest['applications'][0]
            preview_query = f"/shift-exchanges?case_id={row['case']}&application_id={application['id']}"
            preview = ok('manager', preview_query)
            assert preview['allowed'] and preview['receiver']['status'] == 'eligible', preview
            assert sql(f"select employee_id from public.schedule_published_shifts where id='{row['shift']}' and workspace_id='{w}'") == state['employee_a']
            row['owner_until_final'] = True
            if index == 1:
                before = sql(f"select count(*) from public.employee_schedule_availability_versions where workspace_id='{w}' and employee_id='{person}'")
                status, result = request('casey', '/availability', dict(action='submit', employee_id=person,
                    expected_revision=6, proposal=proposal(row['day'], row['day'], 'unavailable'), source='employee'))
                row['publication_lock'] = dict(status=status, error=result.get('error')); save()
                assert status == 409, (status, result)
                after = sql(f"select count(*) from public.employee_schedule_availability_versions where workspace_id='{w}' and employee_id='{person}'")
                assert before == after == '6'
                assert ok('manager', preview_query)['fingerprint'] == preview['fingerprint']
                row['rejected_write_left_version_and_preview_unchanged'] = True
            result = ok('manager', command=dict(action='approve', case_id=row['case'], application_id=application['id'],
                expected_revision=latest['revision'], fingerprint=preview['fingerprint']))
            assert result['status'] == 'completed', result
            assert sql(f"select employee_id from public.schedule_published_shifts where id='{row['shift']}' and workspace_id='{w}'") == person
            row['approved_transfer'] = True
        row['result'] = 'PASS'; save(); new_rows += 1
        print(json.dumps(dict(label=row['label'], eligible=row['eligible'], result='PASS')), flush=True)
    # Independent authoritative assessment distinguishes unknown / partial / none.
    # This is a current HTTP read, not a rerun of the recorded transfer commands.
    assessments = []
    for row, expected in zip(proof['rows'], ('unknown', 'full', 'none', 'full', 'partial', 'partial', 'full')):
        assessment = ok('manager', '/availability/shift-assessment', dict(shift=dict(
            location_id=state['location_a'], employee_id=person, job_id=state['job'],
            shift_type_id=state['service'], scheduled_date=row['day'], start_time='16:00', end_time='18:00',
            time_basis='explicit', hide_time_on_badge=False, unpaid_break_minutes=0, note='')))
        assert assessment['coverage'] == expected, (row['label'], assessment)
        assert (assessment['operation'] == 'allowed') == row['eligible'], (row['label'], assessment)
        if not row['eligible']:
            assert any(reason['message'].strip() for reason in assessment['reasons']), assessment
        assessments.append(dict(label=row['label'], coverage=assessment['coverage'],
            operation=assessment['operation'], reasons=assessment['reasons']))
    proof['current_assessments'] = assessments; save()
    ids = ','.join("'" + str(uuid.UUID(row['case'])) + "'" for row in proof['rows'])
    verification = json.loads(sql(f"""begin transaction read only;
      select jsonb_build_object(
        'cases',(select count(*) from public.shift_exchange_cases where workspace_id='{w}' and id in({ids})),
        'completed',(select count(*) from public.shift_exchange_cases where workspace_id='{w}' and id in({ids}) and status='completed'),
        'cancelled',(select count(*) from public.shift_exchange_cases where workspace_id='{w}' and id in({ids}) and status='cancelled'),
        'owner_retained',(select count(*) from public.schedule_published_shifts where workspace_id='{w}' and publication_id='{proof['publication']}' and employee_id='{state['employee_a']}'),
        'receiver_assigned',(select count(*) from public.schedule_published_shifts where workspace_id='{w}' and publication_id='{proof['publication']}' and employee_id='{person}'),
        'transfers',(select count(*) from public.shift_exchange_events where workspace_id='{w}' and action='transfer_completed'),
        'versions',(select count(*) from public.employee_schedule_availability_versions where workspace_id='{w}' and employee_id='{person}')); commit;"""))
    assert verification == dict(cases=7, completed=3, cancelled=4, owner_retained=4, receiver_assigned=3, transfers=3, versions=6), verification
    proof['verification'] = verification
    proof['result'] = 'PASS'; save()
    print(json.dumps(dict(result='PASS', new_scenarios_this_run=new_rows, current_database=verification, proof=str(PROOF))))


if __name__ == '__main__':
    main()
