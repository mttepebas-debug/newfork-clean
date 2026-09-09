"""AT09: owner close vs manager approval, both real DB transaction orders.

Only the verified synthetic local workspace; new future weeks for every case.
Reuses the service-race harness, including observed advisory-lock contention.
This is not a browser timing or hosted delivery test.
"""
from datetime import date, timedelta
import json
from pathlib import Path
import sys
import uuid

from shift_exchange_api_local import env, sql
from shift_exchange_schedule_races_local import launch, literal, observe, result


def main(path):
    env()
    state = json.loads(path.read_text(encoding='utf-8'))
    workspace = str(uuid.UUID(state['workspace']))
    assert state.get('exchange_fixture')
    assert sql(f"select name from public.workspaces where id='{workspace}'") == state['name']
    actors = {role: str(uuid.UUID(state['users'][role]['id']))
              for role in ('employee', 'manager', 'blake', 'casey', 'drew')}
    location = str(uuid.UUID(state['location_a']))
    owner = str(uuid.UUID(state['employee_a']))
    winner = str(uuid.UUID(state['employee_drew']))
    latest = date.fromisoformat(sql(f"select max(week_start) from public.schedule_location_publications where workspace_id='{workspace}'"))
    first = max(latest + timedelta(days=7), date.today() + timedelta(days=14))
    first -= timedelta(days=first.weekday())
    report = {'workspace': workspace, 'hosted': False,
              'entry': 'public DB service functions; two actual connections', 'results': []}
    output = path.with_name('shift-exchange-owner-close-races-result.json')

    def expression(role, command, key=None):
        return f"public.shift_exchanges_command_service('{actors[role]}','{workspace}',{literal(command)},'{key or uuid.uuid4()}')"

    for index, first_writer in enumerate(('approve', 'close')):
        week = first + timedelta(days=7 * index)
        publication, shift, source = [str(uuid.uuid4()) for _ in range(3)]
        sql(f"""begin;
          insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
          values('{publication}','{workspace}','{location}','{week}',1,'{actors['manager']}');
          insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
          values('{shift}','{workspace}','{publication}','{location}','{owner}','{state['job']}','{state['service']}','{week}','16:00','22:00','{source}');
          commit;""")
        case = json.loads(sql('select ' + expression('employee', {'action': 'create', 'kind': 'cover', 'shift_id': shift})))['case_id']
        for role in ('blake', 'casey', 'drew'):
            sql('select ' + expression(role, {'action': 'apply', 'case_id': case, 'shift_id': shift}))
        application = sql(f"select id from public.shift_exchange_applications where case_id='{case}' and employee_id='{winner}'")
        revision = int(sql(f"select revision from public.shift_exchange_cases where id='{case}'"))
        preview = json.loads(sql(f"select public.shift_exchange_preview('{actors['manager']}','{workspace}','{case}','{application}')"))
        assert preview['allowed'], preview
        assert sql(f"select employee_id from public.schedule_published_shifts where id='{shift}'") == owner
        keys = {action: str(uuid.uuid4()) for action in ('approve', 'close')}
        operations = {
            'approve': expression('manager', {'action': 'approve', 'case_id': case,
                'application_id': application, 'expected_revision': revision,
                'fingerprint': preview['fingerprint']}, keys['approve']),
            'close': expression('employee', {'action': 'close', 'case_id': case,
                'expected_revision': revision, 'reason': 'I will work my shift.'}, keys['close']),
        }
        second_writer = 'close' if first_writer == 'approve' else 'approve'
        marker = 'exchange-owner-close-' + uuid.uuid4().hex
        first_process = launch(marker + '-first', operations[first_writer], True)
        second_process = None
        try:
            observe(marker + '-first', 'PgSleep', first_process)
            second_process = launch(marker + '-second', operations[second_writer])
            observe(marker + '-second', 'advisory', second_process)
            first_result = result(first_process)
            second_result = result(second_process)
        finally:
            for process in (first_process, second_process):
                if process is not None and process.poll() is None:
                    process.terminate()
                    process.wait(timeout=5)

        def snapshot():
            return json.loads(sql(f"""select jsonb_build_object(
              'status',c.status,'revision',c.revision,'owner',s.employee_id,
              'publication_status',p.status,
              'applications',(select jsonb_object_agg(status,n) from (select status,count(*) n from public.shift_exchange_applications where case_id=c.id group by status) a),
              'events',(select jsonb_object_agg(action,n) from (select action,count(*) n from public.shift_exchange_events where case_id=c.id group by action) e),
              'terminal_commands',(select count(*) from public.shift_exchange_commands where workspace_id='{workspace}' and idempotency_key in('{keys['approve']}','{keys['close']}')))
              from public.shift_exchange_cases c join public.schedule_published_shifts s on s.id='{shift}'
              join public.schedule_location_publications p on p.id=s.publication_id where c.id='{case}'"""))

        final = snapshot()
        record = {'first_writer': first_writer, 'case_id': case, 'week': str(week),
                  'advisory_wait_observed': True, 'first': first_result,
                  'second': second_result, 'final': final, 'status': 'UNVERIFIED'}
        report['results'].append(record)
        output.write_text(json.dumps(report, indent=2), encoding='utf-8')
        assert first_result['exit'] == 0, record
        assert second_result['exit'] != 0 and 'PT409' in second_result['error'], record
        assert final['revision'] == revision + 1 and final['terminal_commands'] == 1, record
        assert final['publication_status'] == 'current', record
        if first_writer == 'approve':
            assert final['status'] == 'completed' and final['owner'] == winner, record
            assert final['applications'] == {'approved': 1, 'closed_other_selected': 2}, record
            assert final['events'].get('transfer_completed') == 1, record
            assert final['events'].get('other_selected') == 2, record
            assert 'case_closed' not in final['events'], record
        else:
            assert final['status'] == 'cancelled' and final['owner'] == owner, record
            assert final['applications'] == {'closed_case_cancelled': 3}, record
            assert final['events'].get('case_closed') == 1, record
            assert 'transfer_completed' not in final['events'] and 'other_selected' not in final['events'], record
        # Retrying the winning command must not duplicate history or mutate ownership.
        assert json.loads(sql('select ' + operations[first_writer])) == first_result['result']
        assert snapshot() == final
        record.update(status='PASS', winning_retry_idempotent=True)
        output.write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps({'first_writer': first_writer, 'status': 'PASS',
                          'advisory_wait_observed': True, 'applicants': 3}), flush=True)


if __name__ == '__main__':
    main(Path(sys.argv[1]).resolve())
