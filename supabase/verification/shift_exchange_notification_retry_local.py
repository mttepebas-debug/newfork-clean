"""Inject one case-scoped local inbox failure, then retry the actual relay RPC.

Requires an owned synthetic workspace and a completed exchange with an unleased
terminal outbox item. Never leases unrelated work or sends email/push. The
temporary failure trigger is removed in finally. The selected fixture item is
left processed, as it would be after normal delivery.
"""
import hashlib
import json
from pathlib import Path
import sys
import time
import urllib.error
import urllib.request
import uuid

from shift_exchange_api_local import ROOT, env, sql


def rpc(name, payload):
    config = env()
    key = config['SUPABASE_SERVICE_ROLE_KEY']
    req = urllib.request.Request(config['SUPABASE_URL'].rstrip('/') + '/rest/v1/rpc/' + name,
        headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
        data=json.dumps(payload).encode())
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def main():
    state = json.loads(Path(sys.argv[1]).read_text())
    workspace, case = str(uuid.UUID(state['workspace'])), str(uuid.UUID(sys.argv[2]))
    env()  # Refuse any hosted URL before installing the scoped fixture trigger.
    assert state.get('exchange_fixture') and sql(f"select name from public.workspaces where id='{workspace}'") == state['name']
    assert sql(f"select status from public.shift_exchange_cases where workspace_id='{workspace}' and id='{case}'") == 'completed'
    item = json.loads(sql(f"""select row_to_json(o) from public.notification_outbox o
      where workspace_id='{workspace}' and subject_id='{case}' and subject_type='shift_exchange_cases'
       and payload->>'request_action'='transfer_completed' and status='pending'
      order by id limit 1"""))
    oid, event = str(uuid.UUID(item['id'])), str(uuid.UUID(item['event_id']))
    worker = 'exchange-retry-proof-' + str(uuid.uuid4())
    trigger = 'exchange_retry_proof_' + uuid.uuid4().hex
    payload = {'target_worker_id': worker, 'target_outbox_id': oid}
    report = {'case_id': case, 'outbox_id': oid, 'environment': 'local real relay RPC; one explicitly leased synthetic event'}

    def domain():
        return sql(f"""select jsonb_build_object(
          'case',(select to_jsonb(c) from public.shift_exchange_cases c where id='{case}'),
          'published',(select jsonb_agg(to_jsonb(s) order by s.id) from public.schedule_published_shifts s where workspace_id='{workspace}'),
          'lineup',(select jsonb_agg(to_jsonb(l) order by l.id) from public.schedule_lineups l where workspace_id='{workspace}'),
          'entries',(select jsonb_agg(to_jsonb(e) order by e.id) from public.schedule_lineup_entries e where workspace_id='{workspace}'))""")

    def projections():
        return int(sql(f"select count(*) from public.notification_inbox_items i join public.notification_recipients r on r.id=i.recipient_projection_id where r.event_id='{event}'"))

    def lease(expected):
        changed = sql(f"""update public.notification_outbox set status='leased',lease_owner='{worker}',
          lease_expires_at=now()+interval '60 seconds',attempt_count=attempt_count+1
          where id='{oid}' and workspace_id='{workspace}' and status='{expected}' and available_at<=now() returning id""")
        assert oid in changed, 'The selected fixture event was not available for this worker'

    before = domain()
    assert projections() == 0
    try:
        sql(f"""create function public.{trigger}() returns trigger language plpgsql set search_path='' as $$
          begin
           if new.workspace_id='{workspace}' and exists(select 1 from public.notification_recipients r where r.id=new.recipient_projection_id and r.event_id='{event}') then
            raise exception 'exchange_retry_proof_injected' using errcode='P0001';
           end if;
           return new;
          end; $$;
          revoke all on function public.{trigger}() from public,anon,authenticated,service_role;
          create trigger {trigger} before insert on public.notification_inbox_items for each row execute function public.{trigger}();""")
        lease('pending')
        try:
            rpc('process_notification_outbox_service', payload)
            raise AssertionError('Expected the injected delivery failure')
        except urllib.error.HTTPError as error:
            response = json.loads(error.read())
            assert response.get('message') == 'exchange_retry_proof_injected', response.get('code')
        assert projections() == 0 and domain() == before
        report['failed_delivery_preserves_assignment_and_lineup'] = True
        report['partial_inbox_rows_after_failure'] = 0
        failed = rpc('fail_notification_outbox_service', payload | {'target_error': 'controlled local inbox failure', 'target_max_attempts': 5, 'target_base_delay_seconds': 1})
        assert failed['status'] == 'retry'
    finally:
        sql(f'drop trigger if exists {trigger} on public.notification_inbox_items; drop function if exists public.{trigger}();')
    time.sleep(1.1)
    lease('retry')
    processed = rpc('process_notification_outbox_service', payload)
    assert processed['status'] == 'processed' and projections() == 1 and domain() == before
    rpc('project_notification_inbox_service', {'target_outbox_id': oid})
    assert projections() == 1 and domain() == before
    report.update({'retry_status': processed['status'], 'inbox_rows_after_duplicate_projection': 1,
        'domain_sha256_before_and_after': hashlib.sha256(before.encode()).hexdigest(), 'temporary_trigger_removed': True, 'status': 'PASS'})
    (ROOT/'supabase/.temp/shift-exchange-notification-retry-result.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report))


if __name__ == '__main__':
    main()
