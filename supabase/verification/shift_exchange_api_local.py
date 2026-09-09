"""Exercise real local Auth + API with an owned Shift Hub fixture. No mail delivery.
Usage: python supabase/verification/shift_exchange_api_local.py applications STATE.json
"""
import json
from pathlib import Path
import sys
import urllib.request
import uuid
from lineup_role_fixture_local import ROOT, sql


def env():
    values = {}
    for line in (ROOT / 'apps/api/.env.local').read_text(encoding='utf-8-sig').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.split('=', 1)
            values[k.strip()] = v.strip().strip('"').strip("'")
    if values['SUPABASE_URL'].rstrip('/') not in ('http://localhost:55321', 'http://127.0.0.1:55321'):
        raise RuntimeError('Only local Supabase is allowed')
    return values


def login(state, role):
    config = env()
    request = urllib.request.Request(config['SUPABASE_URL'].rstrip('/') + '/auth/v1/token?grant_type=password',
        headers={'apikey': config['SUPABASE_SERVICE_ROLE_KEY'], 'Content-Type': 'application/json'},
        data=json.dumps({'email': state['users'][role]['email'], 'password': state['password']}).encode())
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)['access_token']


def api(state, token, query='', command=None, key=None):
    headers = {'Authorization': 'Bearer ' + token, 'X-Newfork-Workspace-Id': state['workspace']}
    if command:
        headers.update({'Content-Type': 'application/json', 'Idempotency-Key': key or str(uuid.uuid4())})
    request = urllib.request.Request('http://127.0.0.1:5556/v1/workspaces/' + state['workspace'] + '/shift-exchanges' + query,
        headers=headers, data=json.dumps(command).encode() if command else None)
    with urllib.request.urlopen(request, timeout=25) as response:
        return json.load(response)


def applications(state):
    owner = login(state, 'employee')
    model = api(state, owner)
    cases = [c for c in model['cases'] if c['status'] == 'open' and c['shift']['id'] == state['shift_a']]
    if not cases:
        result = api(state, owner, command={'action': 'create', 'kind': 'cover', 'shift_id': state['shift_a'], 'note': ''})
        cid = result['case_id']
    else:
        cid = cases[0]['id']
    for role in ('blake', 'casey', 'drew'):
        token = login(state, role)
        before = api(state, token)
        assert any(o['case_id'] == cid for o in before['opportunities']), role + ' cannot see eligible offer'
        key = str(uuid.uuid4())
        command = {'action': 'apply', 'shift_id': state['shift_a'], 'case_id': cid}
        first = api(state, token, command=command, key=key)
        assert api(state, token, command=command, key=key) == first
        own_case = next(c for c in api(state, token)['cases'] if c['id'] == cid)
        assert len(own_case['applications']) == 1, 'Applicant privacy failed'
    current = next(c for c in api(state, owner)['cases'] if c['id'] == cid)
    assert current['candidate_count'] == 3 and current['shift']['employee_id'] == state['employee_a']
    manager = next(c for c in api(state, login(state, 'manager'), '?view=manager')['cases'] if c['id'] == cid)
    assert manager['candidate_count'] == 3 and manager['can_manage']
    print(json.dumps({'case_id': cid, 'candidates': 3, 'owner_preserved': True, 'idempotent_retries': 3, 'private_candidate_views': 3, 'auth': 'real local sessions'}))


if __name__ == '__main__':
    state = json.loads(Path(sys.argv[2]).read_text())
    if not state.get('exchange_fixture') or sql(f"select name from public.workspaces where id='{uuid.UUID(state['workspace'])}';") != state['name']:
        raise RuntimeError('Owned local fixture required')
    if sys.argv[1] == 'applications':
        applications(state)
