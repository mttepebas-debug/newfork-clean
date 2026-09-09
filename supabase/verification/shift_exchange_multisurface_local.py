"""Prepare/inspect owned local two-week, two-location swap browser evidence.

Only initial published shifts are seeded. Shares and every exchange use real APIs.
Never deletes history or touches hosted data. Existing fixture scopes must be empty.
"""
import json
import sys
import uuid
from shift_exchange_api_local import ROOT, login, sql
from shift_exchange_staffing_e2e_local import request

PROOF = ROOT / 'supabase/.temp/shift-exchange-multisurface.json'


def save(proof):
    PROOF.write_bytes(json.dumps(proof, indent=2).encode('utf-8'))


def main(action):
    state = json.loads((ROOT / 'supabase/.temp/shift-exchange-role.json').read_text(encoding='utf-8'))
    w = str(uuid.UUID(state['workspace']))
    assert state.get('exchange_fixture') and sql(f"select name from public.workspaces where id='{w}'") == state['name']
    manager = login(state, 'manager')
    if action == 'prepare':
        assert not PROOF.exists(), 'Recorded fixture already exists; inspect it instead'
        proof = dict(workspace=w, shifts=[], shares=[])
        statements = ['begin;']
        for date, week, loc, person in (
            ('2026-12-08', '2026-12-07', state['location_a'], state['employee_a']),
            ('2026-12-15', '2026-12-14', state['location_b'], state['employee_b']),
        ):
            model = request(state, manager, f'?date={date}&location_ids={loc}')
            assert all(not item['entries'] for item in model['locations']), 'Existing assignments in scope'
            assert sql(f"select count(*) from public.schedule_lineup_snapshots where workspace_id='{w}' and location_id='{loc}' and lineup_date='{date}'") == '0'
            assert sql(f"select count(*) from public.lineup_notes where workspace_id='{w}' and location_id='{loc}' and date='{date}'") == '0'
            publication = sql(f"select id from public.schedule_location_publications where workspace_id='{w}' and location_id='{loc}' and week_start='{week}' and status='current'")
            if not publication:
                assert sql(f"select count(*) from public.schedule_location_publications where workspace_id='{w}' and location_id='{loc}' and week_start='{week}'") == '0'
                publication = str(uuid.uuid4())
                statements.append(f"insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by) values('{publication}','{w}','{loc}','{week}',1,'{state['users']['manager']['id']}');")
            shift, source = str(uuid.uuid4()), str(uuid.uuid4())
            proof['shifts'].append(dict(id=shift, source_id=source, date=date, week=week, location_id=loc, initial_owner=person, publication_id=publication))
            statements.append(f"insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id) values('{shift}','{w}','{publication}','{loc}','{person}','{state['job']}','{state['service']}','{date}','06:00','07:00','{source}');")
        statements.append('commit;')
        save(proof)
        sql('\n'.join(statements))
        for shift in proof['shifts']:
            body = dict(date=shift['date'], location_ids=[shift['location_id']])
            preview = request(state, manager, '/share-preview', body)
            share = request(state, manager, '/share', dict(body, fingerprint=preview['fingerprint']))
            proof['shares'].append(share)
            save(proof)
    else:
        proof = json.loads(PROOF.read_text(encoding='utf-8'))
        assert proof['workspace'] == w
        assert action in ('inspect', 'verify')
    original_snapshots = [s.get('snapshots', []) for s in proof['shifts']]
    for shift in proof['shifts']:
        model = request(state, manager, f'?date={shift["date"]}&location_ids={shift["location_id"]}')
        shift['current_entries'] = [e for loc in model['locations'] for e in loc['entries'] if e.get('source_shift_id') == shift['id'] or e['id'] == shift['id']]
        shift['snapshots'] = json.loads(sql(f"select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version_number,'content',content) order by version_number),'[]') from public.schedule_lineup_snapshots where workspace_id='{w}' and location_id='{shift['location_id']}' and lineup_date='{shift['date']}'"))
    if action == 'verify':
        counts = [len(s['snapshots']) for s in proof['shifts']]
        assert counts[0] == counts[1] and counts[0] > 1, 'Both scopes must have one version per completed swap'
        for index, shift in enumerate(proof['shifts']):
            old = {s['id']: s for s in original_snapshots[index]}
            for snapshot in shift['snapshots']:
                if snapshot['id'] in old:
                    assert snapshot == old[snapshot['id']], 'An immutable prior snapshot changed'
                expected = proof['shifts'][index if snapshot['version'] % 2 else 1-index]['initial_owner']
                entries = [e for e in snapshot['content']['entries'] if e.get('source_shift_id') == shift['id'] or e['id'] == shift['id']]
                assert len(entries) == 1 and entries[0]['employee_id'] == expected, 'Snapshot contains wrong owner or duplicate assignment'
            expected = proof['shifts'][index if counts[index] % 2 else 1-index]['initial_owner']
            assert len(shift['current_entries']) == 1 and shift['current_entries'][0]['employee_id'] == expected
        proof['verification'] = dict(result='PASS', snapshot_counts=counts, prior_snapshots_unchanged=sum(len(s) for s in original_snapshots), every_snapshot_has_one_correct_owner=True)
    save(proof)
    print(json.dumps(dict(workspace=w, shifts=[{k:v for k,v in shift.items() if k not in ('current_entries','snapshots')} for shift in proof['shifts']], snapshot_counts=[len(s['snapshots']) for s in proof['shifts']], verification=proof.get('verification'))))


if __name__ == '__main__':
    main(sys.argv[1])
