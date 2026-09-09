"""Prepare/block/restore/verify one owned real manager swap review, local only."""
import json
import sys
import uuid
import urllib.request
from shift_exchange_availability_swap_local import STATE, PROOF as MATRIX
from shift_exchange_api_local import env, login, sql
from lineup_role_fixture_local import ROOT

PROOF = ROOT / ('supabase/.temp/shift-exchange-swap-review-final.json' if '--final' in sys.argv else 'supabase/.temp/shift-exchange-swap-review.json')


def main(action):
    env()
    state, matrix = [json.loads(path.read_text()) for path in (STATE, MATRIX)]
    w = str(uuid.UUID(state['workspace']))
    assert state['availability_matrix_owned'] and matrix['workspace'] == w and matrix['result'] == 'PASS'
    assert sql(f"select name from public.workspaces where id='{w}'") == state['name']
    pair = matrix['positive'][0]
    proof = json.loads(PROOF.read_text()) if PROOF.exists() else dict(workspace=w,
        offered=pair['peer_shift'], requested=pair['new_shift'], date=pair['day'], create_key=str(uuid.uuid4()))
    assert proof['workspace'] == w
    save = lambda: PROOF.write_text(json.dumps(proof, indent=2), encoding='utf-8')
    save()
    def api(role, query='', command=None, key=None):
        req = urllib.request.Request(f'http://127.0.0.1:5560/v1/workspaces/{w}/shift-exchanges' + query,
            headers={'Authorization': 'Bearer ' + login(state, role), 'X-Newfork-Workspace-Id': w,
                **({'Content-Type': 'application/json', 'Idempotency-Key': key or str(uuid.uuid4())} if command else {})},
            data=json.dumps(command).encode() if command else None)
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    def current():
        return next(c for c in api('manager', f"?view=manager&from=2026-09-01&to={proof['date']}")['cases'] if c['id'] == proof['case'])
    if action == 'prepare':
        if not proof.get('case'):
            proof['case'] = api('employee', command=dict(action='create', kind='swap', shift_id=proof['offered'],
                requested_shift_id=proof['requested']), key=proof['create_key'])['case_id']; save()
        case = current()
        assert case['status'] == 'open'
        application = case['applications'][0]
        if application['status'] == 'invited':
            api('casey', command=dict(action='accept', case_id=case['id'], application_id=application['id'], expected_revision=case['revision']))
        proof['prepared'] = True; save()
    elif action == 'block':
        assert proof.get('prepared') and not proof.get('blocked')
        rows = json.loads(sql(f"select jsonb_agg(jsonb_build_object('id',id,'employee',employee_id)) from public.employee_job_assignments where workspace_id='{w}' and employee_id in('{state['employee_a']}','{state['employee_casey']}') and job_id='{state['job']}' and ended_at is null"))
        assert len(rows) == 2
        proof['jobs'] = rows; save()
        ids = ','.join("'"+str(uuid.UUID(row['id']))+"'" for row in rows)
        # Earlier than both shifts; only the two recorded QA assignments are touched.
        sql(f"update public.employee_job_assignments set ended_at='2026-09-01T00:00:00Z' where workspace_id='{w}' and id in({ids}) and ended_at is null")
        proof['blocked'] = True; save()
    elif action == 'restore':
        assert proof.get('jobs')
        ids = ','.join("'"+str(uuid.UUID(row['id']))+"'" for row in proof['jobs'])
        sql(f"update public.employee_job_assignments set ended_at=null where workspace_id='{w}' and id in({ids}) and ended_at='2026-09-01T00:00:00Z'")
        assert sql(f"select count(*) from public.employee_job_assignments where workspace_id='{w}' and id in({ids}) and ended_at is null") == '2'
        proof['blocked'] = False; proof['restored'] = True; save()
    elif action == 'verify':
        assert proof.get('restored') and not proof.get('blocked')
        assert sql(f"select employee_id from public.schedule_published_shifts where workspace_id='{w}' and id='{proof['offered']}'") == state['employee_a']
        assert sql(f"select employee_id from public.schedule_published_shifts where workspace_id='{w}' and id='{proof['requested']}'") == state['employee_casey']
        assert sql(f"select count(*) from public.shift_exchange_events where workspace_id='{w}' and case_id='{proof['case']}' and action='transfer_completed'") == '0'
        case = current()
        if case['status'] == 'open':
            api('employee', command=dict(action='close', case_id=case['id'], expected_revision=case['revision'], reason='Local review verified; both owners retain their shifts.'))
        assert current()['status'] == 'cancelled'
        proof['verified'] = dict(owners_unchanged=True, transfers=0, status='cancelled'); save()
    else:
        raise ValueError('Unknown action')
    print(json.dumps(dict(action=action, case=proof.get('case'), restored=proof.get('restored',False), verified=proof.get('verified'))))


if __name__ == '__main__':
    main(sys.argv[1])
