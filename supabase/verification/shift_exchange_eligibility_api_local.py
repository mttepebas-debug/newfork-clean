"""AT18: real local API eligibility at listing, submission, consent and final.

Creates a separate owned QA workspace. Only its unassigned Casey profile is
temporarily changed. finally restores every criterion; case history is retained.
Credentials remain in ignored state. No hosted calls or email delivery.
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

STATE = ROOT / 'supabase/.temp/shift-exchange-eligibility-role.json'
PROOF = ROOT / 'supabase/.temp/shift-exchange-eligibility-api.json'
API = 'http://127.0.0.1:5560'


def main():
    env()  # Asserts the local Supabase origin before any fixture/Auth mutation.
    if not STATE.exists():
        with redirect_stdout(io.StringIO()):
            create_base(STATE)
    state = json.loads(STATE.read_text(encoding='utf-8'))
    if not state.get('eligibility_matrix_owned'):
        w = str(uuid.UUID(state['workspace']))
        assert state['kind'] == 'lineup-role-fixture-v1' and state['name'] == 'Line Up role verification ' + w
        assert sql(f"select name from public.workspaces where id='{w}'") == state['name']
        assert sql(f"select count(*) from public.shift_exchange_cases where workspace_id='{w}'") == '0'
        if 'casey' not in state['users']:
            email = f'eligibility-casey-{w}@example.test'
            user = auth('POST', 'users', dict(email=email, password=state['password'], email_confirm=True))
            state['users']['casey'] = dict(id=user['id'], email=email)
            state['employee_casey'] = str(uuid.uuid4())
            STATE.write_text(json.dumps(state, indent=2), encoding='utf-8')
        person, actor = [str(uuid.UUID(value)) for value in (state['employee_casey'], state['users']['casey']['id'])]
        manager = state['users']['manager']['id']
        assert sql(f"select count(*) from public.employee_profiles where workspace_id='{w}' and id='{person}'") == '0'
        sql(f"""begin;
          update public.workspaces set shift_exchanges_enabled=true where id='{w}';
          insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) values('{w}','{actor}','employee','active',true);
          insert into public.user_profiles(user_id,display_name) values('{actor}','Eligibility Casey QA') on conflict(user_id) do nothing;
          insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by) values('{person}','{w}','{actor}','E-9001','Eligibility Casey','QA','{manager}');
          insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by) values('{w}','{person}','{state['job']}','{manager}');
          insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) select '{w}','{person}',id,'{manager}' from public.locations where workspace_id='{w}';
          insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,kind,effective_from,recurring_rules,source,recorded_by)
          select '{w}','{person}',1,'America/Los_Angeles','weekly','2027-01-01',jsonb_agg(jsonb_build_object('day',n,'mode','unrestricted','windows','[]'::jsonb)),'manager','{manager}' from generate_series(0,6)n;
          insert into public.user_workspace_preferences(user_id,active_workspace_id) values('{actor}','{w}') on conflict(user_id) do nothing;
          commit;""")
        state['eligibility_matrix_owned'] = True
        state['exchange_fixture'] = True
        STATE.write_text(json.dumps(state, indent=2), encoding='utf-8')
    state = json.loads(STATE.read_text(encoding='utf-8'))
    w, candidate = [str(uuid.UUID(state[k])) for k in ('workspace', 'employee_casey')]
    assert state.get('eligibility_matrix_owned') and state['name'] == 'Line Up role verification ' + w
    assert sql(f"select name from public.workspaces where id='{w}'") == state['name']
    assert sql(f"select count(*) from public.schedule_published_shifts where workspace_id='{w}' and employee_id='{candidate}'") == '0'
    tokens = {role: login(state, role) for role in ('manager', 'employee', 'casey')}
    proof = json.loads(PROOF.read_text()) if PROOF.exists() else dict(workspace=w, entry='real local Auth and HTTP API', rows=[])
    assert proof['workspace'] == w
    save = lambda: PROOF.write_text(json.dumps(proof, indent=2), encoding='utf-8')

    def request(role, query='', command=None):
        req = urllib.request.Request(API + f'/v1/workspaces/{w}/shift-exchanges' + query,
            headers={'Authorization': 'Bearer ' + tokens[role], 'X-Newfork-Workspace-Id': w,
                     **({'Content-Type': 'application/json', 'Idempotency-Key': str(uuid.uuid4())} if command else {})},
            data=json.dumps(command).encode() if command else None)
        try:
            with urllib.request.urlopen(req, timeout=25) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def ok(role, query='', command=None):
        code, data = request(role, query, command)
        assert code == 200, (role, code, data)
        return data

    def blocked(row, stage, role, command):
        code, data = request(role, command=command)
        row['checks'].append(dict(stage=stage, status=code, error=data.get('error')))
        save()
        assert code in (400, 403, 409, 422), (stage, code, data)

    new_criteria = 0
    for index, kind in enumerate(('job', 'location', 'excluded', 'archived')):
        old = next((r for r in proof['rows'] if r['criterion'] == kind), None)
        if old and old.get('result') == 'PASS':
            continue
        if old:
            assert old.get('criterion_restored'), 'Recover temporary metadata before resuming'
            assert len(old['cases']) == 3
            case_ids = ','.join("'" + str(uuid.UUID(cid)) + "'" for cid in old['cases'].values())
            assert sql(f"select count(*) from public.shift_exchange_cases where workspace_id='{w}' and id in({case_ids}) and status='open'") == '3'
            old.setdefault('previous_attempts', []).append(dict(checks=old['checks'], criterion_restored=True))
            old['checks'] = []
        day = date(2027, 2, 1) + timedelta(days=index)
        week = day - timedelta(days=day.weekday())
        publication = sql(f"select id from public.schedule_location_publications where workspace_id='{w}' and location_id='{state['location_a']}' and week_start='{week}' and status='current'") or str(uuid.uuid4())
        row = old or dict(criterion=kind, date=str(day), shifts={}, cases={}, checks=[])
        if not old:
            for name in ('review', 'pool', 'direct', 'consent'):
                row['shifts'][name] = dict(id=str(uuid.uuid4()), source=str(uuid.uuid4()))
            proof['rows'].append(row)
        save()
        statements = [f"begin; insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by) values('{publication}','{w}','{state['location_a']}','{week}',1,'{state['users']['manager']['id']}') on conflict(id) do nothing;"]
        for name, (start, end) in zip(row['shifts'], [('16:00', '18:00'), ('13:00', '14:00'), ('10:00', '11:00'), ('07:00', '08:00')]):
            shift = row['shifts'][name]
            statements.append(f"insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id) values('{shift['id']}','{w}','{publication}','{state['location_a']}','{state['employee_a']}','{state['job']}','{state['service']}','{day}','{start}','{end}','{shift['source']}') on conflict(id) do nothing;")
        sql('\n'.join(statements + ['commit;']))
        for name in ('review', 'pool', 'consent'):
            if name in row['cases']:
                continue
            command = dict(action='create', kind='cover', shift_id=row['shifts'][name]['id'])
            if name == 'consent':
                command['employee_id'] = candidate
            row['cases'][name] = ok('employee', command=command)['case_id']; save()
        if sql(f"select count(*) from public.shift_exchange_applications where case_id='{row['cases']['review']}' and employee_id='{candidate}' and status='pending_manager'") == '0':
            ok('casey', command=dict(action='apply', case_id=row['cases']['review'], shift_id=row['shifts']['review']['id']))
        query = f'?view=manager&from={day}&to={day}'
        cases = {c['id']: c for c in ok('manager', query)['cases']}
        review, consent = [cases[row['cases'][name]] for name in ('review', 'consent')]
        preview_query = f"?case_id={review['id']}&application_id={review['applications'][0]['id']}"
        before_preview = ok('manager', preview_query)
        assert before_preview['allowed']
        matches = lambda: ok('employee', '?shift_id=' + row['shifts']['direct']['id'])['employees']
        assert any(e['id'] == candidate for e in matches())
        before_list = ok('casey', f'?view=employee&from={day}&to={day}')
        assert any(o['case_id'] == row['cases']['pool'] for o in before_list['opportunities'])
        row['positive_baseline'] = True; save()
        if kind in ('job', 'location'):
            table = 'employee_' + kind + '_assignments'
            key = state['job'] if kind == 'job' else state['location_a']
            ids = sql(f"select string_agg(quote_literal(id::text),',') from public.{table} where workspace_id='{w}' and employee_id='{candidate}' and {kind}_id='{key}' and ended_at is null")
            assert ids
            mutate = f"update public.{table} set ended_at='{day}T00:00:00Z' where workspace_id='{w}' and id in({ids})"
            restore = f"update public.{table} set ended_at=null where workspace_id='{w}' and id in({ids})"
        else:
            column = 'is_excluded_from_schedule' if kind == 'excluded' else 'archived_at'
            assert sql(f"select {column} is {'false' if kind == 'excluded' else 'null'} from public.employee_profiles where workspace_id='{w}' and id='{candidate}'") == 't'
            mutate = f"update public.employee_profiles set {column}={'true' if kind == 'excluded' else 'now()'} where workspace_id='{w}' and id='{candidate}'"
            restore = f"update public.employee_profiles set {column}={'false' if kind == 'excluded' else 'null'} where workspace_id='{w}' and id='{candidate}'"
        try:
            sql(mutate)
            row['mutation_applied'] = True; save()
            assert all(e['id'] != candidate for e in matches())
            row['checks'].append(dict(stage='direct candidate listing', eligible=False))
            code, listed = request('casey', f'?view=employee&from={day}&to={day}')
            assert code == 403 or (code == 200 and all(o['case_id'] != row['cases']['pool'] for o in listed['opportunities'])), (code, listed)
            row['checks'].append(dict(stage='pool opportunity listing', status=code, eligible=False))
            blocked(row, 'pool submit', 'casey', dict(action='apply', case_id=row['cases']['pool'], shift_id=row['shifts']['pool']['id']))
            blocked(row, 'direct submit', 'employee', dict(action='create', kind='cover', shift_id=row['shifts']['direct']['id'], employee_id=candidate))
            blocked(row, 'peer consent', 'casey', dict(action='accept', case_id=consent['id'], application_id=consent['applications'][0]['id'], expected_revision=consent['revision']))
            invalid = ok('manager', preview_query)
            assert not invalid['allowed'] and invalid['receiver']['status'] != 'eligible', invalid
            row['checks'].append(dict(stage='manager preview', allowed=False, reasons=invalid['receiver']['reasons']))
            listed_case = next(c for c in ok('manager', query)['cases'] if c['id'] == review['id'])
            assert listed_case['applications'][0]['eligibility']['status'] != 'eligible'
            row['checks'].append(dict(stage='manager candidate list', eligible=False))
            blocked(row, 'stale final approval', 'manager', dict(action='approve', case_id=review['id'],
                    application_id=review['applications'][0]['id'], expected_revision=review['revision'], fingerprint=before_preview['fingerprint']))
            untouched = json.loads(sql(f"select jsonb_build_object('owners', (select count(*) from public.schedule_published_shifts where workspace_id='{w}' and scheduled_date='{day}' and employee_id='{state['employee_a']}'), 'transfers',(select count(*) from public.shift_exchange_events where workspace_id='{w}' and action='transfer_completed'), 'consent_status',(select status from public.shift_exchange_applications where case_id='{consent['id']}'))"))
            assert untouched == dict(owners=4, transfers=0, consent_status='invited'), untouched
            row['assignment_guard'] = untouched
        finally:
            sql(restore)
            row['criterion_restored'] = True; save()
        assert any(e['id'] == candidate for e in matches())
        assert ok('manager', preview_query)['allowed']
        positive = ok('casey', command=dict(action='apply', case_id=row['cases']['pool'], shift_id=row['shifts']['pool']['id']))
        assert positive['status'] == 'open'
        row['positive_after_restore'] = True
        # End only these owned cases using normal owner commands, retaining audit.
        latest = {c['id']: c for c in ok('manager', query)['cases']}
        for cid in row['cases'].values():
            ok('employee', command=dict(action='close', case_id=cid, expected_revision=latest[cid]['revision'], reason='Local eligibility matrix completed; owner keeps the shift.'))
        row['result'] = 'PASS'; save()
        new_criteria += 1
        print(json.dumps(dict(criterion=kind, checks=len(row['checks']), result='PASS', criterion_restored=True)), flush=True)
    assert len(proof['rows']) == 4 and all(r['result'] == 'PASS' for r in proof['rows'])
    shift_ids = ','.join("'" + str(uuid.UUID(s['id'])) + "'" for r in proof['rows'] for s in r['shifts'].values())
    case_ids = ','.join("'" + str(uuid.UUID(cid)) + "'" for r in proof['rows'] for cid in r['cases'].values())
    verification = json.loads(sql(f"""begin transaction read only;
      select jsonb_build_object(
        'matrix_shifts_owned',(select count(*) from public.schedule_published_shifts where workspace_id='{w}' and id in({shift_ids}) and employee_id='{state['employee_a']}'),
        'matrix_cases_closed',(select count(*) from public.shift_exchange_cases where workspace_id='{w}' and id in({case_ids}) and status='cancelled'),
        'transfers',(select count(*) from public.shift_exchange_events where workspace_id='{w}' and action='transfer_completed'),
        'candidate_assignments',(select count(*) from public.schedule_published_shifts where workspace_id='{w}' and employee_id='{candidate}'),
        'profile_restored',exists(select 1 from public.employee_profiles where workspace_id='{w}' and id='{candidate}' and archived_at is null and not is_excluded_from_schedule),
        'job_restored',exists(select 1 from public.employee_job_assignments where workspace_id='{w}' and employee_id='{candidate}' and job_id='{state['job']}' and ended_at is null),
        'location_restored',exists(select 1 from public.employee_location_assignments where workspace_id='{w}' and employee_id='{candidate}' and location_id='{state['location_a']}' and ended_at is null)); commit;"""))
    assert verification == dict(matrix_shifts_owned=16, matrix_cases_closed=12, transfers=0,
        candidate_assignments=0, profile_restored=True, job_restored=True, location_restored=True), verification
    proof['verification'] = verification
    proof['result'] = 'PASS'; save()
    print(json.dumps(dict(result='PASS', workspace=w, new_criteria_this_run=new_criteria,
        recorded_criteria=4, recorded_negative_checks=sum(len(r['checks']) for r in proof['rows']),
        current_database_verification=verification, report=str(PROOF))))


if __name__ == '__main__':
    main()
