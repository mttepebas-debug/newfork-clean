"""AT20: real cover transfers retain physical hours across DST/location edits.

Own local workspace only. Baseline setup is separate from the four DST results.
The location timezone is restored even on failure; shift snapshots are immutable.
"""
from contextlib import redirect_stdout
from datetime import date, datetime
import io
import json
import uuid
import urllib.request
import shift_exchange_availability_api_local as baseline
from shift_exchange_api_local import env, login, sql
from lineup_role_fixture_local import ROOT

STATE = ROOT / 'supabase/.temp/shift-exchange-dst-role.json'
BASE = ROOT / 'supabase/.temp/shift-exchange-dst-baseline.json'
PROOF = ROOT / 'supabase/.temp/shift-exchange-dst-api.json'


def main():
    env()
    if not PROOF.exists():
        baseline.STATE, baseline.PROOF, baseline.WEEK_START = STATE, BASE, date(2026, 9, 28)
        with redirect_stdout(io.StringIO()):
            baseline.main()
        base = json.loads(BASE.read_text())
        PROOF.write_text(json.dumps(dict(workspace=base['workspace'], baseline_verified=True, rows=[]), indent=2), encoding='utf-8')
    state, proof = [json.loads(path.read_text()) for path in (STATE, PROOF)]
    w = str(uuid.UUID(state['workspace']))
    assert state['availability_matrix_owned'] and proof['workspace'] == w
    assert sql(f"select name from public.workspaces where id='{w}'") == state['name']
    save = lambda: PROOF.write_text(json.dumps(proof, indent=2), encoding='utf-8')
    tokens = {role: login(state, role) for role in ('manager', 'employee', 'casey')}
    def api(role, query='', command=None, key=None):
        req = urllib.request.Request(f'http://127.0.0.1:5560/v1/workspaces/{w}/shift-exchanges' + query,
            headers={'Authorization': 'Bearer ' + tokens[role], 'X-Newfork-Workspace-Id': w,
                **({'Content-Type': 'application/json', 'Idempotency-Key': key or str(uuid.uuid4())} if command else {})},
            data=json.dumps(command).encode() if command else None)
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.load(response)
    specifications = [
        ('autumn transition', '2026-11-01', '00:30', '02:30', '2026-11-01T07:30:00Z', '2026-11-01T10:30:00Z', 3),
        ('spring transition', '2027-03-14', '01:30', '03:30', '2027-03-14T09:30:00Z', '2027-03-14T10:30:00Z', 1),
        ('second repeated clock', '2027-11-07', '01:30', '02:30', '2027-11-07T09:30:00Z', '2027-11-07T10:30:00Z', 1),
        ('ordinary overnight', '2026-12-01', '22:00', '02:00', '2026-12-02T06:00:00Z', '2026-12-02T10:00:00Z', 4),
    ]
    if not proof['rows']:
        for label, day, start, end, instant_start, instant_end, hours in specifications:
            proof['rows'].append(dict(label=label, day=day, start=start, end=end, instant_start=instant_start,
                instant_end=instant_end, hours=hours, shift=str(uuid.uuid4()), source=str(uuid.uuid4()),
                publication=str(uuid.uuid4()), create_key=str(uuid.uuid4())))
        save()
    completed = all(row.get('result') == 'PASS' for row in proof['rows'])
    def current(row):
        return next(c for c in api('manager', f"?view=manager&from={row['day']}&to={row['day']}")['cases'] if c['id'] == row['case'])
    def instants(shift, row):
        parsed = lambda value: datetime.fromisoformat(value.replace('Z', '+00:00'))
        assert parsed(shift['starts_at']) == parsed(row['instant_start']), shift
        assert parsed(shift['ends_at']) == parsed(row['instant_end']), shift
        assert (parsed(shift['ends_at'])-parsed(shift['starts_at'])).total_seconds()/3600 == row['hours']
        assert shift['time_timezone'] == 'America/Los_Angeles', shift
    if not completed:
        assert sql(f"select timezone from public.locations where workspace_id='{w}' and id='{state['location_a']}'") == 'America/Los_Angeles'
        for row in proof['rows']:
            if row.get('result') == 'PASS':
                continue
            week = sql(f"select date_trunc('week','{row['day']}'::date)::date")
            sql(f"""begin;
              insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
                values('{row['publication']}','{w}','{state['location_a']}','{week}',1,'{state['users']['manager']['id']}') on conflict(id) do nothing;
              insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
                values('{row['shift']}','{w}','{row['publication']}','{state['location_a']}','{state['employee_a']}','{state['job']}','{state['service']}','{row['day']}','{row['start']}','{row['end']}','{row['source']}') on conflict(id) do nothing;
              commit;""")
            if not row.get('case'):
                assert any(e['id'] == state['employee_casey'] for e in api('employee', '?shift_id=' + row['shift'])['employees'])
                row['case'] = api('employee', command=dict(action='create', kind='cover', shift_id=row['shift']), key=row['create_key'])['case_id']; save()
            case = current(row)
            if not case['applications']:
                api('casey', command=dict(action='apply', case_id=row['case'], shift_id=row['shift']))
            case = current(row); instants(case['shift'], row)
            row['application'] = case['applications'][0]['id']
            preview = api('manager', f"?case_id={row['case']}&application_id={row['application']}")
            assert preview['allowed'] and preview['receiver']['status'] == 'eligible'
            row['preview_before_location_edit'] = preview['fingerprint']; save()
        try:
            sql(f"update public.locations set timezone='America/New_York' where workspace_id='{w}' and id='{state['location_a']}'")
            proof['location_changed'] = True; proof['location_restored'] = False; save()
            for row in proof['rows']:
                if row.get('result') == 'PASS':
                    continue
                case = current(row); instants(case['shift'], row)
                assert case['shift']['employee_id'] == state['employee_a']
                preview = api('manager', f"?case_id={row['case']}&application_id={row['application']}")
                assert preview['allowed'] and preview['receiver']['status'] == 'eligible'
                assert preview['fingerprint'] == row['preview_before_location_edit']
                result = api('manager', command=dict(action='approve', case_id=row['case'], application_id=row['application'],
                    expected_revision=case['revision'], fingerprint=preview['fingerprint']))
                assert result['status'] == 'completed'
                final = current(row); instants(final['shift'], row)
                assert final['shift']['employee_id'] == state['employee_casey']
                row['result'] = 'PASS'; row['physical_hours_preserved'] = True; row['owner_until_final'] = True
                row['saved_timezone_after_location_edit'] = final['shift']['time_timezone']; save()
                print(json.dumps(dict(scenario=row['label'], hours=row['hours'], result='PASS')), flush=True)
        finally:
            sql(f"update public.locations set timezone='America/Los_Angeles' where workspace_id='{w}' and id='{state['location_a']}' and timezone='America/New_York'")
            proof['location_restored'] = True; save()
    ids = ','.join("'"+str(uuid.UUID(row['case']))+"'" for row in proof['rows'])
    verification = json.loads(sql(f"""begin transaction read only;
      select jsonb_build_object('completed',(select count(*) from public.shift_exchange_cases where workspace_id='{w}' and id in({ids}) and status='completed'),
        'transfers',(select count(*) from public.shift_exchange_events where workspace_id='{w}' and case_id in({ids}) and action='transfer_completed'),
        'open_cases',(select count(*) from public.shift_exchange_cases where workspace_id='{w}' and status='open'),
        'location_timezone',(select timezone from public.locations where workspace_id='{w}' and id='{state['location_a']}')); commit;"""))
    assert verification == dict(completed=4, transfers=4, open_cases=0, location_timezone='America/Los_Angeles'), verification
    for row in proof['rows']:
        case=current(row); instants(case['shift'],row)
        assert case['shift']['employee_id']==state['employee_casey']
    proof['verification'] = verification; proof['result'] = 'PASS'; save()
    print(json.dumps(dict(result='PASS', new_transfers=0 if completed else 4, current=verification)))


if __name__ == '__main__':
    main()
