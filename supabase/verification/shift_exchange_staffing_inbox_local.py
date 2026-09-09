"""Repair only the owned AT42 result and exercise the real local relay + inbox API.

No history-wide backfill, hosted access, new assignment, email or push delivery.
Reruns preserve delivered/read state and require the same confirmed fixture.
"""
import json
import sys
import urllib.request
import uuid

from shift_exchange_api_local import ROOT, env, login, sql
from shift_exchange_notification_retry_local import rpc
from shift_exchange_staffing_e2e_local import snapshot


def main():
    env()  # Local host allowlist; never print configuration or credentials.
    state = json.loads((ROOT / 'supabase/.temp/shift-exchange-role.json').read_text())
    live_day = len(sys.argv) > 1
    if live_day:
        assert sys.argv[1] == 'day-link', 'Only the owned day-link fixture is supported'
    proof_name = 'shift-exchange-staffing-realtime-day' if live_day else 'shift-exchange-staffing-e2e'
    proof = json.loads((ROOT / f'supabase/.temp/{proof_name}.json').read_text())
    workspace = str(uuid.UUID(state['workspace']))
    assert state['kind'] == 'lineup-role-fixture-v1' and proof['workspace'] == workspace
    assert sql(f"select name from public.workspaces where id='{workspace}'") == state['name']
    before = snapshot(state, proof)
    assert before['published_owner'] == state['employee_a']
    assert len(before['proposals']) == 1 and before['proposals'][0]['status'] == 'confirmed'
    proposal = str(uuid.UUID(before['proposals'][0]['id']))
    event = str(uuid.UUID(sql(f"select id from public.lineup_operation_events where workspace_id='{workspace}' and idempotency_key='{proposal}'")))
    notifications = json.loads(sql(f"""select jsonb_agg(jsonb_build_object('id',id,'recipient',recipient_user_id,'event_key',event_key))
      from public.notifications where workspace_id='{workspace}' and source_type='lineup_operation' and source_id='{event}'
      and event_key in('assignment_changed','manager_assignment_changed')"""))
    assert notifications and any(n['recipient'] == state['users']['employee']['id'] for n in notifications)
    report = dict(workspace=workspace, operation_event=event, environment='local', deliveries=[])
    for notification in notifications:
        nid = str(uuid.UUID(notification['id']))
        if live_day:
            oid = str(uuid.UUID(sql(f"select id from public.notification_outbox where workspace_id='{workspace}' and subject_type='lineup_staffing_notifications' and subject_id='{nid}'")))
        else:
            oid = str(uuid.UUID(sql(f"select public.lineup_staffing_enqueue_notification('{nid}')")))
        status = sql(f"select status from public.notification_outbox where id='{oid}' and workspace_id='{workspace}'")
        if status == 'pending':
            worker = 'staffing-inbox-proof-' + str(uuid.uuid4())
            changed = sql(f"""update public.notification_outbox set status='leased',lease_owner='{worker}',
              lease_expires_at=clock_timestamp()+interval '60 seconds',attempt_count=attempt_count+1
              where id='{oid}' and workspace_id='{workspace}' and status='pending' and available_at<=now() returning id""")
            assert oid in changed, 'Fixture event is no longer available; do not lease unrelated work'
            result = rpc('process_notification_outbox_service', {'target_worker_id':worker,'target_outbox_id':oid})
            assert result['status'] == 'processed', result
        else:
            assert status == 'processed', 'Do not override an active lease or retry state'
        count = int(sql(f"select count(*) from public.notification_inbox_items where workspace_id='{workspace}' and legacy_notification_id='{nid}'"))
        assert count == 1, 'Expected one modern inbox item for the owned original notification'
        read_state = sql(f"select jsonb_build_object('seen_at',seen_at,'read_at',read_at,'dismissed_at',dismissed_at) from public.notification_inbox_items where workspace_id='{workspace}' and legacy_notification_id='{nid}'")
        assert str(uuid.UUID(sql(f"select public.lineup_staffing_enqueue_notification('{nid}')"))) == oid
        assert rpc('project_notification_inbox_service', {'target_outbox_id':oid}) == 0
        assert sql(f"select jsonb_build_object('seen_at',seen_at,'read_at',read_at,'dismissed_at',dismissed_at) from public.notification_inbox_items where workspace_id='{workspace}' and legacy_notification_id='{nid}'") == read_state
        report['deliveries'].append(dict(notification_id=nid,outbox_id=oid,inbox_count=count,retry_created=0,read_state_preserved=True))
    token = login(state, 'employee')
    request = urllib.request.Request(f'http://127.0.0.1:5556/v1/workspaces/{workspace}/communications/notifications',
        headers={'Authorization':'Bearer '+token,'X-Newfork-Workspace-Id':workspace})
    with urllib.request.urlopen(request, timeout=25) as response:
        inbox = json.load(response)
    expected_ids = [n['id'] for n in notifications if n['recipient'] == state['users']['employee']['id']]
    item_ids = json.loads(sql(f"select jsonb_agg(id) from public.notification_inbox_items where workspace_id='{workspace}' and legacy_notification_id='{expected_ids[0]}'"))
    items = [n for n in inbox['notifications'] if n['id'] in item_ids]
    expected_url = f"/app/employee-hub/schedule?date={proof['day']}&view=day" if live_day else '/app/employee-hub/schedule'
    assert len(items) == 1 and items[0]['action_url'] == expected_url, items
    assert snapshot(state, proof) == before, 'Notification delivery must not alter ownership, proposal or Line Up'
    report.update(result='PASS', employee_inbox_item=items[0]['id'], employee_action_url=items[0]['action_url'], assignment_and_lineup_unchanged=True)
    report_name = 'shift-exchange-staffing-day-inbox' if live_day else 'shift-exchange-staffing-inbox'
    (ROOT / f'supabase/.temp/{report_name}.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report))


if __name__ == '__main__':
    main()
