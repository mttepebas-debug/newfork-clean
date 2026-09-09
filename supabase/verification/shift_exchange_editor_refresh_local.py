"""Owned local QA: change one candidate while a manager replacement review is open.

busy creates an actual manager assignment; restore releases only that assignment,
preserving its open need and audit. No direct product-table writes or hosted calls.
"""
import json
import sys
import uuid

from shift_exchange_api_local import ROOT, login
from shift_exchange_staffing_e2e_local import request
from lineup_role_fixture_local import sql

PROOF = ROOT / 'supabase/.temp/shift-exchange-editor-refresh.json'
DAY = '2026-11-16'


def main(action):
    state = json.loads((ROOT / 'supabase/.temp/shift-exchange-role.json').read_text(encoding='utf-8'))
    assert state['kind'] == 'lineup-role-fixture-v1'
    workspace = str(uuid.UUID(state['workspace']))
    assert sql(f"select name from public.workspaces where id='{workspace}'") == state['name']
    token = login(state, 'manager')
    path = f'?date={DAY}&location_ids={state["location_a"]}'
    model = request(state, token, path)
    entries = [e for loc in model['locations'] for e in loc['entries']]
    if action == 'busy':
        assert not PROOF.exists(), 'Reuse recorded IDs; never create another assignment on retry'
        operation = dict(kind='assign', source_entry_id=None, target_entry_id=None,
            employee_id=state['employee_a'], travel_minutes=0,
            reason='AT35 owned local candidate refresh verification',
            target=dict(date=DAY, location_id=state['location_a'], job_id=state['job'],
                shift_type_id=state['service'], start_time='17:00', end_time='18:00',
                section_id=None, station=''))
        proof = dict(workspace=workspace, before=entries, operation=operation,
                     idempotency_key=str(uuid.uuid4()))
    else:
        proof = json.loads(PROOF.read_text(encoding='utf-8'))
        assert proof['workspace'] == workspace
        if action == 'inspect':
            print(json.dumps(entries))
            return
        assert action == 'restore' and 'restored' not in proof
        new_entries = [e for e in entries if e['id'] not in {x['id'] for x in proof['before']}
                       and e.get('employee_id') == state['employee_a']
                       and e['start_time'] == '17:00' and e['end_time'] == '18:00']
        assert len(new_entries) == 1, 'Refuse to release an ambiguous or unrelated assignment'
        operation = dict(proof['operation'], kind='release', source_entry_id=new_entries[0]['id'], employee_id=None,
                         reason='AT35 restore candidate availability after owned local verification')
        proof['restore_entry_id'] = new_entries[0]['id']
        proof['restore_key'] = str(uuid.uuid4())
    preview = request(state, token, '/operations/preview', {'operation': operation})
    assert preview['allowed'], preview
    proof[action + '_preview'] = preview
    PROOF.write_bytes(json.dumps(proof, indent=2).encode('utf-8'))
    result = request(state, token, '/operations', dict(operation=operation,
        fingerprint=preview['fingerprint'],
        idempotency_key=proof['idempotency_key'] if action == 'busy' else proof['restore_key']))
    after = request(state, token, path)
    proof[action + '_result'] = result
    proof[action + '_model'] = after
    after_entries = [e for loc in after['locations'] for e in loc['entries']]
    assert all(e in after_entries for e in proof['before']), 'Original assignments changed'
    if action == 'restore':
        restored = [e for e in after_entries if e['id'] == proof['restore_entry_id']]
        assert len(restored) == 1 and restored[0]['employee_id'] is None
        proof['restored'] = True
    PROOF.write_bytes(json.dumps(proof, indent=2).encode('utf-8'))
    print(json.dumps(dict(action=action, result=result)))


if __name__ == '__main__':
    main(sys.argv[1])
