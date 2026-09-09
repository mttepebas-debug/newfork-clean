"""Owned local published shifts for four direct-cover browser outcomes.

Seeds only new fixture shifts. Every invitation, response and manager decision
must use the product UI/API. Existing assignments/history are never reset.
"""
import json
import sys
import uuid
from lineup_role_fixture_local import ROOT, sql

PROOF = ROOT / 'supabase/.temp/shift-exchange-direct-cover.json'


def verify():
    state = json.loads((ROOT / 'supabase/.temp/shift-exchange-role.json').read_text(encoding='utf-8'))
    proof = json.loads(PROOF.read_text(encoding='utf-8'))
    w = str(uuid.UUID(proof['workspace']))
    assert state.get('exchange_fixture') and state['workspace'] == w
    assert sql(f"select name from public.workspaces where id='{w}'") == state['name']
    expected_status = dict(decline='declined_by_employee', withdraw='withdrawn', reject='rejected_by_manager', approve='approved')
    evidence = dict(workspace=w, cases=[])
    for shift in proof['shifts']:
        assert shift.get('verified'), 'Complete the real UI workflow before asserting evidence'
        cid = str(uuid.UUID(shift['case_id']))
        data = json.loads(sql(f"""begin transaction read only;
          select jsonb_build_object('case_id',c.id,'status',c.status,'owner',p.employee_id,
            'applications',(select jsonb_agg(jsonb_build_object('status',a.status,'employee',a.employee_id,'reason',a.reason)) from public.shift_exchange_applications a where a.case_id=c.id),
            'events',(select jsonb_agg(jsonb_build_object('action',e.action,'actor',e.actor_user_id) order by e.created_at,e.id) from public.shift_exchange_events e where e.case_id=c.id),
            'snapshots',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'version',s.version_number,'content',s.content) order by s.version_number),'[]') from public.schedule_lineup_snapshots s where s.workspace_id='{w}' and s.location_id='{proof['location']}' and s.lineup_date='{shift['date']}'))
          from public.shift_exchange_cases c join public.schedule_published_shifts p on p.id='{shift['id']}' and p.workspace_id=c.workspace_id
          where c.id='{cid}' and c.workspace_id='{w}'; commit;"""))
        approved = shift['outcome'] == 'approve'
        assert data['status'] == ('completed' if approved else 'cancelled')
        assert data['owner'] == (state['employee_b'] if approved else state['employee_a'])
        assert len(data['applications']) == 1 and data['applications'][0]['status'] == expected_status[shift['outcome']]
        actions = [e['action'] for e in data['events']]
        assert actions.count('peer_invited') == 1 and actions.count('transfer_completed') == int(approved)
        assert actions.count('peer_accepted') == int(shift['outcome'] != 'decline')
        response_action = dict(decline='peer_declined', withdraw='application_withdrawn', reject='application_rejected', approve='transfer_completed')[shift['outcome']]
        assert actions.count(response_action) == 1
        actors = {e['action']: e['actor'] for e in data['events']}
        assert actors['peer_invited'] == state['users']['employee']['id']
        if shift['outcome'] != 'decline':
            assert actors['peer_accepted'] == state['users']['blake']['id']
        assert actors[response_action] == state['users']['manager' if shift['outcome'] in ('reject', 'approve') else 'blake']['id']
        if approved:
            assert [s['version'] for s in data['snapshots']] == [1, 2]
            assert data['snapshots'][0]['id'] == shift['shareResult']['snapshot_ids'][0]
            for snapshot, owner in zip(data['snapshots'], [state['employee_a'], state['employee_b']]):
                entries = [e for e in snapshot['content']['entries'] if e['id'] == shift['id']]
                assert len(entries) == 1 and entries[0]['employee_id'] == owner
        else:
            assert not data['snapshots'], 'A terminal response must not share an unshared day'
        data['outcome'] = shift['outcome']
        evidence['cases'].append(data)
    target = ROOT / 'docs/rebuild/shift-hub-visual-proof-2026-09-07/direct-cover/data.json'
    target.write_text(json.dumps(evidence, indent=2), encoding='utf-8')
    approved_count = sum(c['outcome'] == 'approve' for c in evidence['cases'])
    print(json.dumps(dict(result='PASS', outcomes=len(evidence['cases']), correct_actors=True,
                         final_transfer_events=approved_count, shared_versions=[1, 2],
                         unshared_days_unchanged=len(evidence['cases']) - approved_count)))


def main():
    state = json.loads((ROOT / 'supabase/.temp/shift-exchange-role.json').read_text(encoding='utf-8'))
    w = str(uuid.UUID(state['workspace']))
    assert state.get('exchange_fixture') and state['name'] == 'Line Up role verification ' + w
    assert sql(f"select name from public.workspaces where id='{w}'") == state['name']
    if PROOF.exists():
        proof = json.loads(PROOF.read_text(encoding='utf-8'))
        assert proof['workspace'] == w
    else:
        proof = dict(workspace=w, location=state['location_a'], week='2027-01-04',
                     publication=str(uuid.uuid4()), shifts=[])
        for date, outcome in [('2027-01-05', 'decline'), ('2027-01-06', 'withdraw'),
                              ('2027-01-07', 'reject'), ('2027-01-08', 'approve')]:
            assert sql(f"select count(*) from public.schedule_published_shifts where workspace_id='{w}' and location_id='{proof['location']}' and scheduled_date='{date}'") == '0'
            proof['shifts'].append(dict(id=str(uuid.uuid4()), source_id=str(uuid.uuid4()), date=date, outcome=outcome))
        publication = sql(f"select id from public.schedule_location_publications where workspace_id='{w}' and location_id='{proof['location']}' and week_start='{proof['week']}' and status='current'")
        if publication:
            proof['publication'] = str(uuid.UUID(publication))
        else:
            assert sql(f"select count(*) from public.schedule_location_publications where workspace_id='{w}' and location_id='{proof['location']}' and week_start='{proof['week']}'") == '0'
        PROOF.write_text(json.dumps(proof, indent=2), encoding='utf-8')
    if '--notice-pair' in sys.argv and len(proof['shifts']) == 4:
        for date, outcome in [('2027-01-09', 'decline'), ('2027-01-10', 'approve')]:
            assert sql(f"select count(*) from public.schedule_published_shifts where workspace_id='{w}' and location_id='{proof['location']}' and scheduled_date='{date}'") == '0'
            proof['shifts'].append(dict(id=str(uuid.uuid4()), source_id=str(uuid.uuid4()), date=date, outcome=outcome, notice_check=True))
        PROOF.write_text(json.dumps(proof, indent=2), encoding='utf-8')
    statements = [f"""begin;
      insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
      values('{proof['publication']}','{w}','{proof['location']}','{proof['week']}',1,'{state['users']['manager']['id']}') on conflict(id) do nothing;"""]
    for shift in proof['shifts']:
        statements.append(f"""insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
          values('{shift['id']}','{w}','{proof['publication']}','{proof['location']}','{state['employee_a']}','{state['job']}','{state['service']}','{shift['date']}','05:00','06:00','{shift['source_id']}') on conflict(id) do nothing;""")
    sql('\n'.join(statements + ['commit;']))
    print(json.dumps(dict(workspace=w, shifts=proof['shifts'])))


if __name__ == '__main__':
    if '--verify' in sys.argv:
        verify()
    else:
        main()
