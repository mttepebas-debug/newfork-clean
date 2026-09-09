"""Separate owned fixture for live staffing invalidation, using real Auth/API.

Uses the same source-only seed and guarded real commands as the AT42 verifier.
Never overwrites the previous completed staffing evidence.
"""
import json
import sys
import time
import uuid

import shift_exchange_staffing_e2e_local as flow
from shift_exchange_api_local import login, sql

flow.DAY = '2026-11-02'
flow.PROOF = flow.ROOT / 'supabase/.temp/shift-exchange-staffing-realtime.json'


def main(action):
    if action in ('prepare', 'inspect', 'accepted', 'verify'):
        flow.main(action)
        return
    state = json.loads(flow.STATE.read_text(encoding='utf-8'))
    proof = json.loads(flow.PROOF.read_text(encoding='utf-8'))
    workspace = str(uuid.UUID(state['workspace']))
    assert state['kind'] == 'lineup-role-fixture-v1' and proof['workspace'] == workspace
    assert sql(f"select name from public.workspaces where id='{workspace}'") == state['name']
    started_ms = time.time_ns() // 1_000_000
    if action in ('propose', 'confirm'):
        flow.main(action)
        proof = json.loads(flow.PROOF.read_text(encoding='utf-8'))
    elif action == 'accept':
        before = flow.snapshot(state, proof)
        assert len(before['proposals']) == 1 and before['proposals'][0]['status'] == 'pending'
        proposal = before['proposals'][0]['id']
        proof['employee_response'] = flow.request(state, login(state, 'employee'), '/offers/respond',
            dict(id=proposal, response='accept'))
        after = flow.snapshot(state, proof)
        assert after['published_owner'] is None
        assert after['entries'] == before['entries'] and after['snapshots'] == before['snapshots']
    else:
        raise ValueError('Use prepare, inspect, propose, accept, accepted, confirm or verify')
    observed_ms = time.time_ns() // 1_000_000
    proof.setdefault('command_times', []).append(dict(action=action,started_ms=started_ms,response_observed_ms=observed_ms))
    flow.PROOF.write_bytes(json.dumps(proof, indent=2).encode('utf-8'))
    print(json.dumps(dict(action=action,started_ms=started_ms,response_observed_ms=observed_ms)))


if __name__ == '__main__':
    if len(sys.argv) > 2:
        assert sys.argv[2] == 'day-link', 'Only the separate owned day-link fixture is supported'
        flow.DAY = '2026-11-16'
        flow.PROOF = flow.ROOT / 'supabase/.temp/shift-exchange-staffing-realtime-day.json'
    main(sys.argv[1])
