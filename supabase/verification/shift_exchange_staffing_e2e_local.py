"""Real local staffing workflow. Seed only a published open shift, never an offer.

prepare / inspect / propose / accepted / confirm / verify; browser may perform propose and
confirm instead. Auth uses existing owned local test users, never hosted data.
"""
import json
from pathlib import Path
import sys
import urllib.error
import urllib.request
import uuid

from lineup_role_fixture_local import ROOT, sql
from shift_exchange_api_local import login

STATE = ROOT / 'supabase/.temp/shift-exchange-role.json'
PROOF = ROOT / 'supabase/.temp/shift-exchange-staffing-e2e.json'
DAY = '2026-10-05'
API_ORIGIN = 'http://127.0.0.1:5556'


def request(state, token, path, body=None):
    req = urllib.request.Request(API_ORIGIN + '/schedule/lineups' + path,
        headers={'Authorization': 'Bearer ' + token, 'X-Newfork-Workspace-Id': state['workspace'],
                 'Content-Type': 'application/json'},
        data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f'{path}: HTTP {exc.code}: {exc.read().decode()}') from None


def snapshot(state, proof):
    w, shift = state['workspace'], proof['shift_id']
    return json.loads(sql(f"""select jsonb_build_object(
      'published_owner',(select employee_id from public.schedule_published_shifts where workspace_id='{w}' and id='{shift}'),
      'proposals',coalesce((select jsonb_agg(jsonb_build_object('id',id,'status',status,'employee_id',employee_id,'responded_at',responded_at) order by created_at)
        from public.lineup_proposals where workspace_id='{w}' and operation->>'source_entry_id' in('{shift}','{proof.get('entry_id',shift)}')),'[]'::jsonb),
      'entries',coalesce((select jsonb_agg(to_jsonb(e) order by id) from public.schedule_lineup_entries e where workspace_id='{w}' and source_shift_id='{shift}'),'[]'::jsonb),
      'snapshots',coalesce((select jsonb_agg(jsonb_build_object('id',id,'version',version_number,'content',content) order by version_number)
        from public.schedule_lineup_snapshots where workspace_id='{w}' and location_id='{state['location_a']}' and lineup_date='{DAY}'),'[]'::jsonb))"""))


def main(action):
    state = json.loads(STATE.read_text(encoding='utf-8'))
    assert state['kind'] == 'lineup-role-fixture-v1'
    w = str(uuid.UUID(state['workspace']))
    assert sql(f"select name from public.workspaces where id='{w}'") == state['name']
    token = login(state, 'manager')
    if action == 'prepare':
        assert not PROOF.exists(), 'Reuse the existing proof; never reseed on a retry'
        publication, shift, source = [str(uuid.uuid4()) for _ in range(3)]
        proof = dict(workspace=w, day=DAY, shift_id=shift, source_id=source,
                     publication_id=publication, manager_url=f'http://localhost:5555/app/schedule/lineup?date={DAY}',
                     fixture='Only an open published shift is seeded; proposals use product API/UI')
        existing = sql(f"select id from public.schedule_location_publications where workspace_id='{w}' and location_id='{state['location_a']}' and week_start='{DAY}' and status='current'")
        if existing:
            publication = str(uuid.UUID(existing))
            proof['publication_id'] = publication
            proof['publication_reused'] = True
            publication_sql = ''
        else:
            assert sql(f"select count(*) from public.schedule_location_publications where workspace_id='{w}' and location_id='{state['location_a']}' and week_start='{DAY}'") == '0', 'Do not alter an unpublished or superseded fixture week'
            publication_sql = f"""
          insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
          values('{publication}','{w}','{state['location_a']}','{DAY}',1,'{state['users']['manager']['id']}');"""
        PROOF.write_text(json.dumps(proof, indent=2))
        sql(f"""begin;
          {publication_sql}
          insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
          values('{shift}','{w}','{publication}','{state['location_a']}',null,'{state['job']}','{state['service']}','{DAY}','09:00','12:00','{source}');
          commit;""")
        model = request(state, token, f'?date={DAY}&location_ids={state["location_a"]}')
        entries = [entry for location in model['locations'] for entry in location['entries'] if entry.get('source_shift_id') == shift or entry['id'] == shift]
        assert len(entries) == 1, 'Published open shift must resolve to one Line Up need'
        proof['entry_id'] = entries[0]['id']
        proof['operation'] = dict(kind='replace', source_entry_id=proof['entry_id'], target_entry_id=None,
            employee_id=state['employee_a'], travel_minutes=0, reason='AT42 end-to-end staffing verification',
            target=dict(date=DAY,location_id=state['location_a'],job_id=state['job'],shift_type_id=state['service'],
                        start_time='09:00',end_time='12:00',section_id=None,station=''))
        proof['initial_preview'] = request(state, token, '/operations/preview', {'operation':proof['operation']})
        assert proof['initial_preview']['allowed'], proof['initial_preview']
        proof['before'] = snapshot(state, proof)
        assert proof['before']['published_owner'] is None and not proof['before']['proposals']
    else:
        proof = json.loads(PROOF.read_text())
        assert proof['workspace'] == w
        if 'inspect' in proof:
            proof.setdefault('observations', []).append(proof['inspect'])
        if action == 'propose':
            preview = request(state, token, '/operations/preview', {'operation':proof['operation']})
            assert preview['allowed'], preview
            proof['proposal'] = request(state, token, '/proposals', dict(kind='offer',operation=proof['operation'],fingerprint=preview['fingerprint'],idempotency_key=str(uuid.uuid4())))
        elif action == 'accepted':
            current = snapshot(state, proof)
            assert len(current['proposals']) == 1 and current['proposals'][0]['status'] == 'accepted', current
            assert current['published_owner'] is None, current
            assert current['entries'] == proof['before']['entries'] and current['snapshots'] == proof['before']['snapshots']
            try:
                request(state, login(state, 'employee'), '/proposals/action',
                        dict(id=current['proposals'][0]['id'], response='confirm'))
            except RuntimeError as exc:
                assert 'HTTP 403:' in str(exc), str(exc)
                proof['employee_confirmation_denied'] = 'HTTP 403'
            else:
                raise AssertionError('Employee must never finalize their own staffing offer')
            assert snapshot(state, proof) == current, 'Denied decision changed application state'
        elif action == 'confirm':
            current = snapshot(state, proof)
            assert len(current['proposals']) == 1 and current['proposals'][0]['status'] == 'accepted', current
            assert current['published_owner'] is None, current
            proof['accepted'] = current
            proposal_id = current['proposals'][0]['id']
            preview = request(state, token, '/proposals/action', dict(id=proposal_id,response='preview'))
            assert preview['allowed'], preview
            proof['confirmation_preview'] = preview
            proof['confirmation'] = request(state, token, '/proposals/action', dict(id=proposal_id,response='confirm',fingerprint=preview['fingerprint']))
        elif action not in ('inspect','verify'):
            raise ValueError('Use prepare, inspect, propose, accepted, confirm or verify')
        proof[action] = snapshot(state, proof)
        if action == 'verify':
            final = proof[action]
            assert final['published_owner'] == state['employee_a'], final
            assert len(final['proposals']) == 1 and final['proposals'][0]['status'] == 'confirmed', final
            assert len(final['entries']) == 1 and final['entries'][0]['employee_id'] == state['employee_a'], final
            assert final['snapshots'] == proof['before']['snapshots'] == [], 'Unshared Line Up must not acquire a fake shared snapshot'
            proposal_id = final['proposals'][0]['id']
            events = json.loads(sql(f"""select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'description',description)),'[]'::jsonb)
              from public.lineup_operation_events where workspace_id='{w}' and idempotency_key='{proposal_id}'"""))
            assert len(events) == 1, events
            notifications = json.loads(sql(f"""select coalesce(jsonb_agg(jsonb_build_object('id',id,'recipient_user_id',recipient_user_id,'title',title,'action_url',action_url,'event_key',event_key)),'[]'::jsonb)
              from public.notifications where workspace_id='{w}' and source_type='lineup_operation' and source_id='{events[0]['id']}'"""))
            employee_notifications = [n for n in notifications if n['recipient_user_id'] == state['users']['employee']['id'] and n['event_key'] == 'assignment_changed']
            assert len(employee_notifications) == 1, notifications
            proof['operation_events'] = events
            proof['notifications'] = notifications
            proof['assignment_result'] = 'PASS'
            proof['employee_inbox_count'] = int(sql(f"select count(*) from public.notification_inbox_items where workspace_id='{w}' and legacy_notification_id='{employee_notifications[0]['id']}'"))
            proof['result'] = 'PASS' if proof['employee_inbox_count'] == 1 else 'PARTIAL_INBOX_GAP'
    PROOF.write_text(json.dumps(proof, indent=2))
    print(json.dumps({key:value for key,value in proof.items() if key in ('day','shift_id','entry_id','initial_preview','manager_url','proposal','result')}))
    if action == 'inspect':
        print(json.dumps(proof['inspect']))
    if action == 'verify' and proof['result'] != 'PASS':
        raise SystemExit(2)


if __name__ == '__main__':
    main(sys.argv[1])
