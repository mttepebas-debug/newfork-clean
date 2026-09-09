"""AT19: both directions of swap availability with real local HTTP/Auth.

A separately owned baseline creates the same six canonical versions as the
cover matrix. Its recorded cover outcomes are setup evidence, not swap proof.
No existing QA workspace, availability guard, or publication is overwritten.
"""
from contextlib import redirect_stdout
from datetime import date, timedelta
import io
import json
import uuid
import urllib.request
from urllib.error import HTTPError
import shift_exchange_availability_api_local as baseline
from shift_exchange_api_local import env, login, sql
from lineup_role_fixture_local import ROOT

STATE = ROOT / 'supabase/.temp/shift-exchange-availability-swap-v2-role.json'
BASE = ROOT / 'supabase/.temp/shift-exchange-availability-swap-v2-baseline.json'
PROOF = ROOT / 'supabase/.temp/shift-exchange-availability-swap-v2.json'
API = 'http://127.0.0.1:5560'


def main():
    env()
    today = date.fromisoformat(sql('select current_date'))
    if not PROOF.exists():
        baseline.STATE, baseline.PROOF = STATE, BASE
        # Persist the chosen week across partially completed setup retries.
        if BASE.exists() and json.loads(BASE.read_text()).get('rows'):
            baseline.WEEK_START = date.fromisoformat(json.loads(BASE.read_text())['rows'][0]['day'])
        else:
            start = today + timedelta(days=21)
            baseline.WEEK_START = start - timedelta(days=start.weekday())
        with redirect_stdout(io.StringIO()):
            baseline.main()
        base = json.loads(BASE.read_text())
        assert base['result'] == 'PASS'
        PROOF.write_text(json.dumps(dict(workspace=base['workspace'], baseline_verified=True,
            negative=[], positive=[]), indent=2), encoding='utf-8')
    proof, state, base = [json.loads(path.read_text()) for path in (PROOF, STATE, BASE)]
    w = str(uuid.UUID(state['workspace']))
    start = date.fromisoformat(base['rows'][0]['day'])
    assert today < start and start + timedelta(days=13) <= today + timedelta(days=62), 'Fixture must be within the real candidate search window'
    assert state['availability_matrix_owned'] and proof['workspace'] == base['workspace'] == w
    assert sql(f"select name from public.workspaces where id='{w}'") == state['name']
    tokens = {role: login(state, role) for role in ('manager', 'employee', 'casey')}
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

    def owner(shift):
        return sql(f"select employee_id from public.schedule_published_shifts where workspace_id='{w}' and id='{shift}'")

    new_negative, new_positive = 0, 0
    peer_shift = base['rows'][1]['shift']
    # A cannot offer an ineligible shift to Casey; Casey cannot request it either.
    for index in (0, 2, 4, 5):
        source = base['rows'][index]
        for reverse in (False, True):
            label = source['label'] + (' / initiator receives restricted shift' if reverse else ' / peer receives restricted shift')
            if any(row['label'] == label and row.get('result') == 'PASS' for row in proof['negative']):
                continue
            role = 'casey' if reverse else 'employee'
            offered, requested = (peer_shift, source['shift']) if reverse else (source['shift'], peer_shift)
            matches = ok(role, '/shift-exchanges?shift_id=' + offered)['shifts']
            assert all(s['id'] != requested for s in matches), label
            status, result = request(role, command=dict(action='create', kind='swap', shift_id=offered, requested_shift_id=requested))
            assert status == 422 and 'eligible' in result.get('error', '').lower(), (label, status, result)
            assert owner(source['shift']) == state['employee_a'] and owner(peer_shift) == state['employee_casey']
            assert sql(f"select count(*) from public.shift_exchange_cases where workspace_id='{w}' and kind='swap'") == '0'
            proof['negative'].append(dict(label=label, role=role, offered_shift=offered, requested_shift=requested,
                match_hidden=True, submit_status=status, reason=result['error'], no_case=True, owners_unchanged=True, result='PASS'))
            save(); new_negative += 1
    print(json.dumps(dict(negative_recorded=len(proof['negative']), new_negative=new_negative)), flush=True)

    if not proof['positive']:
        publication = str(uuid.uuid4())
        for index, base_index in enumerate((1, 3, 6)):
            proof['positive'].append(dict(label=('weekly full', 'temporary expired', 'dated exception expired')[index],
                publication=publication, day=str(start+timedelta(days=7+index)),
                new_shift=str(uuid.uuid4()), new_source=str(uuid.uuid4()), peer_shift=base['rows'][base_index]['shift'],
                role='casey' if index == 1 else 'employee', create_key=str(uuid.uuid4())))
        save()
    for row in proof['positive']:
        if row.get('result') == 'PASS':
            continue
        sql(f"""begin;
          insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
            values('{row['publication']}','{w}','{state['location_a']}','{start+timedelta(days=7)}',1,'{state['users']['manager']['id']}') on conflict(id) do nothing;
          insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
            values('{row['new_shift']}','{w}','{row['publication']}','{state['location_a']}','{state['employee_a']}','{state['job']}','{state['service']}','{row['day']}','16:00','18:00','{row['new_source']}') on conflict(id) do nothing;
          commit;""")
        role = row['role']; peer_role = 'employee' if role == 'casey' else 'casey'
        offered, requested = (row['peer_shift'], row['new_shift']) if role == 'casey' else (row['new_shift'], row['peer_shift'])
        row['offered_shift'], row['requested_shift'] = offered, requested
        query = f'/shift-exchanges?view=manager&from={start}&to={start+timedelta(days=13)}'
        def current():
            return next(c for c in ok('manager', query)['cases'] if c['id'] == row['case'])
        def unchanged():
            assert owner(row['new_shift']) == state['employee_a'] and owner(row['peer_shift']) == state['employee_casey']
        if not row.get('case'):
            assert any(s['id'] == requested for s in ok(role, '/shift-exchanges?shift_id=' + offered)['shifts'])
            row['case'] = ok(role, command=dict(action='create', kind='swap', shift_id=offered, requested_shift_id=requested), key=row['create_key'])['case_id']; save()
        latest = current(); application = latest['applications'][0]
        preview_query = f"/shift-exchanges?case_id={row['case']}&application_id={application['id']}"
        if application['status'] == 'invited':
            preview = ok('manager', preview_query)
            assert not preview['allowed']
            status, result = request('manager', command=dict(action='approve', case_id=row['case'], application_id=application['id'],
                expected_revision=latest['revision'], fingerprint=preview['fingerprint']))
            assert status == 409, (status, result)
            unchanged(); row['premature_manager_approval'] = dict(status=status, reason=result.get('error'))
            ok(peer_role, command=dict(action='accept', case_id=row['case'], application_id=application['id'], expected_revision=latest['revision']))
            row['peer_accepted'] = True; save()
        latest = current(); preview = ok('manager', preview_query)
        assert preview['allowed'] and preview['receiver']['status'] == preview['giver']['status'] == 'eligible', preview
        unchanged(); row['both_owners_until_final'] = True
        # Each employee independently attempts to narrow a published date after consent.
        for availability_role, person, revision in (('employee', state['employee_a'], 1), ('casey', state['employee_casey'], 6)):
            proposal = dict(timezone='America/Los_Angeles', effective_from=row['day'], effective_until=row['day'], kind='temporary',
                days=[dict(day=d, mode='unavailable', windows=[]) for d in range(7)])
            status, result = request(availability_role, '/availability', dict(action='submit', employee_id=person,
                expected_revision=revision, proposal=proposal, source='employee'))
            assert status == 409 and 'published' in result.get('error', '').lower(), (status, result)
            assert sql(f"select max(version_number) from public.employee_schedule_availability_versions where workspace_id='{w}' and employee_id='{person}'") == str(revision)
            row.setdefault('publication_locks', {})[availability_role] = dict(status=status, reason=result['error'])
        assert ok('manager', preview_query)['fingerprint'] == preview['fingerprint']
        unchanged(); save()
        result = ok('manager', command=dict(action='approve', case_id=row['case'], application_id=application['id'],
            expected_revision=latest['revision'], fingerprint=preview['fingerprint']))
        assert result['status'] == 'completed'
        assert owner(row['new_shift']) == state['employee_casey'] and owner(row['peer_shift']) == state['employee_a']
        row['both_assignments_swapped'] = True
        row['result'] = 'PASS'; save(); new_positive += 1
        print(json.dumps(dict(label=row['label'], initiator=role, result='PASS')), flush=True)
    assert len(proof['negative']) == 8 and len(proof['positive']) == 3
    ids = ','.join("'" + str(uuid.UUID(row['case'])) + "'" for row in proof['positive'])
    verification = json.loads(sql(f"""begin transaction read only;
      select jsonb_build_object('swap_cases',(select count(*) from public.shift_exchange_cases where workspace_id='{w}' and kind='swap' and id in({ids})),
        'completed_swaps',(select count(*) from public.shift_exchange_cases where workspace_id='{w}' and id in({ids}) and status='completed'),
        'swap_transfers',(select count(*) from public.shift_exchange_events where workspace_id='{w}' and case_id in({ids}) and action='transfer_completed'),
        'approved_applications',(select count(*) from public.shift_exchange_applications where workspace_id='{w}' and case_id in({ids}) and status='approved'),
        'open_cases',(select count(*) from public.shift_exchange_cases where workspace_id='{w}' and status='open')); commit;"""))
    assert verification == dict(swap_cases=3, completed_swaps=3, swap_transfers=3, approved_applications=3, open_cases=0), verification
    for row in proof['positive']:
        assert owner(row['new_shift']) == state['employee_casey'] and owner(row['peer_shift']) == state['employee_a']
    for index in (0, 2, 4, 5):
        assert owner(base['rows'][index]['shift']) == state['employee_a']
    verification['swapped_assignments'] = 6
    verification['restricted_shift_owners_retained'] = 4
    proof['verification'] = verification; proof['result'] = 'PASS'; save()
    print(json.dumps(dict(result='PASS', new_negative=new_negative, new_positive=new_positive, current_database=verification)))


if __name__ == '__main__':
    main()
