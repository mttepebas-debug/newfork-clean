"""Prepare/block/restore/verify one owned stale eligibility UI decision."""
import json
import sys
import uuid
import urllib.request
from lineup_role_fixture_local import ROOT, sql
from shift_exchange_api_local import login
from shift_exchange_eligibility_api_local import STATE

FINAL = '--final' in sys.argv
PROOF = ROOT / ('supabase/.temp/shift-exchange-eligibility-error-final.json' if FINAL else 'supabase/.temp/shift-exchange-eligibility-error.json')
DAY = '2027-02-06' if FINAL else '2027-02-05'


def main(action):
    state = json.loads(STATE.read_text(encoding='utf-8'))
    w, candidate = [str(uuid.UUID(state[k])) for k in ('workspace', 'employee_casey')]
    assert state.get('eligibility_matrix_owned') and sql(f"select name from public.workspaces where id='{w}'") == state['name']
    proof = json.loads(PROOF.read_text()) if PROOF.exists() else dict(workspace=w, date=DAY, shift=str(uuid.uuid4()), source=str(uuid.uuid4()))
    assert proof['workspace'] == w and proof['date'] == DAY
    save = lambda: PROOF.write_text(json.dumps(proof, indent=2), encoding='utf-8')
    save()

    def command(role, body):
        token = login(state, role)
        request = urllib.request.Request(f'http://127.0.0.1:5560/v1/workspaces/{w}/shift-exchanges',
          headers={'Authorization': 'Bearer ' + token, 'X-Newfork-Workspace-Id': w,
                   'Content-Type': 'application/json', 'Idempotency-Key': str(uuid.uuid4())}, data=json.dumps(body).encode())
        with urllib.request.urlopen(request, timeout=25) as response:
            return json.load(response)

    if action == 'prepare':
        publication = sql(f"select id from public.schedule_location_publications where workspace_id='{w}' and location_id='{state['location_a']}' and week_start='2027-02-01' and status='current'")
        assert publication
        sql(f"insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id) values('{proof['shift']}','{w}','{publication}','{state['location_a']}','{state['employee_a']}','{state['job']}','{state['service']}','{DAY}','16:00','18:00','{proof['source']}') on conflict(id) do nothing;")
        if not proof.get('case_id'):
            proof['case_id'] = command('employee', dict(action='create', kind='cover', shift_id=proof['shift']))['case_id']; save()
            command('casey', dict(action='apply', shift_id=proof['shift'], case_id=proof['case_id']))
        assert sql(f"select status from public.shift_exchange_cases where id='{proof['case_id']}'") == 'open'
    elif action == 'block':
        assert not proof.get('blocked')
        assert sql(f"select count(*) from public.schedule_published_shifts where workspace_id='{w}' and employee_id='{candidate}'") == '0'
        proof['job_ids'] = json.loads(sql(f"select jsonb_agg(id) from public.employee_job_assignments where workspace_id='{w}' and employee_id='{candidate}' and job_id='{state['job']}' and ended_at is null")); save()
        assert proof['job_ids']
        ids = ','.join("'" + str(uuid.UUID(x)) + "'" for x in proof['job_ids'])
        sql(f"update public.employee_job_assignments set ended_at='{DAY}T00:00:00Z' where workspace_id='{w}' and id in({ids})")
        proof['blocked'] = True
    elif action == 'restore':
        assert proof.get('blocked')
        ids = ','.join("'" + str(uuid.UUID(x)) + "'" for x in proof['job_ids'])
        sql(f"update public.employee_job_assignments set ended_at=null where workspace_id='{w}' and id in({ids}) and ended_at='{DAY}T00:00:00Z'")
        assert sql(f"select count(*) from public.employee_job_assignments where workspace_id='{w}' and id in({ids}) and ended_at is not null") == '0'
        proof['blocked'] = False; proof['restored'] = True
    elif action == 'verify':
        cid = str(uuid.UUID(proof['case_id']))
        result = json.loads(sql(f"select jsonb_build_object('owner',(select employee_id from public.schedule_published_shifts where id='{proof['shift']}'),'status',(select status from public.shift_exchange_cases where id='{cid}'),'transfers',(select count(*) from public.shift_exchange_events where case_id='{cid}' and action='transfer_completed'),'manager_notes',(select count(*) from public.shift_exchange_events where case_id='{cid}' and private_note<>''))"))
        assert result == dict(owner=state['employee_a'], status='open', transfers=0, manager_notes=0), result
        assert proof.get('restored') and not proof.get('blocked')
        revision = int(sql(f"select revision from public.shift_exchange_cases where id='{cid}'"))
        command('employee', dict(action='close', case_id=cid, expected_revision=revision, reason='Owned stale eligibility UI check completed.'))
        proof['verification'] = result
    else:
        raise AssertionError('Unknown action')
    save()
    print(json.dumps(dict(action=action, workspace=w, case_id=proof.get('case_id'), restored=proof.get('restored'), verification=proof.get('verification'))))


if __name__ == '__main__':
    main(sys.argv[1])
