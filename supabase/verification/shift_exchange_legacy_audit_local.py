"""Exercise the shipped read-only audit with typed temporary fixtures.

Uses only temporary tables on the local database. No application rows, flags,
constraints or assignments are changed. Orphans are deliberate temp fixtures;
they do not require disabling the real foreign keys.
"""
import json
from pathlib import Path
import subprocess
import uuid

CONTAINER = 'supabase_db_newfork-clean'
TABLES = [
    'schedule_shift_change_requests', 'schedule_published_shifts',
    'schedule_location_publications', 'schedule_shift_change_participants',
    'schedule_shift_change_events', 'shift_exchange_cases',
]


def uid():
    return str(uuid.uuid4())


def run(statement):
    result = subprocess.run(
        ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt',
         '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
        input=statement.encode(), capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.decode())
    return [json.loads(line) for line in result.stdout.decode().splitlines()
            if line.startswith('{')]


def main():
    query = Path(__file__).with_name('shift_exchange_legacy_audit.sql').read_text()
    data = {table: [] for table in TABLES}
    expected = {}
    workspace, owner, peer, actor, publication = [uid() for _ in range(5)]
    data['schedule_location_publications'].append(
        dict(id=publication, workspace_id=workspace, status='current'))

    def fixture(label, disposition, **changes):
        request_id, shift_id = uid(), uid()
        request = dict(id=request_id, workspace_id=workspace,
                       request_type='release_pickup', status='pending_manager_approval',
                       offered_shift_id=shift_id, expected_offered_employee_id=owner,
                       participant_response='not_required', revision=3, created_by=actor,
                       created_at='2026-08-01T10:00:00Z', updated_at='2026-08-01T11:00:00Z')
        request.update(changes)
        shift = dict(id=shift_id, workspace_id=workspace, publication_id=publication,
                     employee_id=owner, source_shift_id=uid())
        data['schedule_shift_change_requests'].append(request)
        data['schedule_published_shifts'].append(shift)
        expected[request_id] = (label, disposition)
        return request, shift

    def receiver(request, employee=peer):
        data['schedule_shift_change_participants'].append(dict(
            id=uid(), workspace_id=workspace, request_id=request['id'], employee_id=employee,
            participant_role='receiver', created_at='2026-08-01T10:30:00Z'))

    def swap(label, disposition, response):
        request, shift = fixture(label, disposition, request_type='direct_swap',
                                 participant_response=response,
                                 expected_requested_employee_id=peer, requested_shift_id=uid())
        other = dict(id=request['requested_shift_id'], workspace_id=workspace,
                     publication_id=publication, employee_id=peer, source_shift_id=uid())
        data['schedule_published_shifts'].append(other)
        receiver(request)
        return request, shift, other

    fixture('pending release retains matching owner', 'owner_reconsent_required_for_cover')
    approved, vacant = fixture('approved release stays vacant', 'keep_open_shift_no_owner_restore', status='approved')
    vacant['employee_id'] = None
    request, shift = fixture('open pickup retains receiver evidence', 'candidate_reconsent_required_for_open_pickup', expected_offered_employee_id=None)
    shift['employee_id'] = None
    receiver(request)
    swap('waiting peer', 'peer_consent_required_for_swap', 'pending')
    accepted, _, _ = swap('accepted peer still needs review', 'accepted_swap_scope_and_reconsent_review', 'accepted')
    event = dict(id=uid(), workspace_id=workspace, request_id=accepted['id'], action='submitted',
                 actor_user_id=actor, created_at='2026-08-01T10:00:00Z')
    data['schedule_shift_change_events'].append(event)
    for status in ['rejected', 'cancelled', 'expired', 'approved']:
        fixture('terminal ' + status, 'retain_immutable_history', status=status)
    _, shift = fixture('changed owner', 'exception_owner_changed')
    shift['employee_id'] = peer
    _, shift = fixture('orphan approved release is not vacancy', 'exception_missing_shift', status='approved')
    data['schedule_published_shifts'].remove(shift)
    _, shift = fixture('cross workspace shift is unresolved', 'exception_missing_shift')
    shift['workspace_id'] = uid()
    stale = uid()
    data['schedule_location_publications'].append(dict(id=stale, workspace_id=workspace, status='superseded'))
    _, shift = fixture('old publication', 'exception_stale_publication')
    shift['publication_id'] = stale
    _, _, other = swap('swap peer publication stale', 'exception_stale_publication', 'accepted')
    other['publication_id'] = stale
    _, _, other = swap('swap peer owner changed', 'exception_owner_changed', 'accepted')
    other['employee_id'] = owner
    _, shift = fixture('pickup missing receiver', 'exception_consent_or_request_shape', expected_offered_employee_id=None)
    shift['employee_id'] = None
    request, _, _ = swap('declined but pending manager status', 'exception_consent_or_request_shape', 'declined')
    fixture('unknown direct coverage shape', 'exception_consent_or_request_shape', request_type='direct_coverage')
    request, shift, other = swap('new case overlaps swap peer', 'exception_overlapping_new_case', 'accepted')
    new_case = dict(id=uid(), workspace_id=workspace, status='open', offered_source_id=other['source_shift_id'])
    data['shift_exchange_cases'].append(new_case)
    _, shift = fixture('cross workspace publication', 'exception_stale_publication')
    wrong_publication = uid()
    data['schedule_location_publications'].append(dict(id=wrong_publication, workspace_id=uid(), status='current'))
    shift['publication_id'] = wrong_publication

    setup = 'begin;'
    snapshot_parts = []
    for table in TABLES:
        setup += f'create temp table {table} as select * from public.{table} with no data;'
        encoded = json.dumps(data[table]).replace("'", "''")
        setup += f"insert into pg_temp.{table} select * from jsonb_populate_recordset(null::public.{table},'{encoded}'::jsonb);"
        query = query.replace('public.' + table, 'pg_temp.' + table)
        snapshot_parts.append(f"'{table}',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from pg_temp.{table} t)")
    snapshot = 'select jsonb_build_object(' + ','.join(snapshot_parts) + ');'
    # Commit temp-only setup, then force the actual audit to run READ ONLY.
    before, report, after = run(setup + 'commit; begin read only;' + snapshot + query + snapshot + 'rollback;')
    assert before == after, 'Audit changed evidence or ownership'
    assert report['request_count'] == len(expected) == len(report['requests'])
    assert sum(row['request_count'] for row in report['summary']) == len(expected)
    indexed = {row['request_id']: row for row in report['requests']}
    assert set(indexed) == set(expected), 'Missing or duplicated request ID mappings'
    for request_id, (label, disposition) in expected.items():
        assert indexed[request_id]['disposition'] == disposition, (label, indexed[request_id])
        assert indexed[request_id]['revision'] == 3
    assert indexed[approved['id']]['current_employee_id'] is None
    assert indexed[approved['id']]['expected_offered_employee_id'] == owner
    assert indexed[accepted['id']]['events'] == [event_without_links(event)]
    assert indexed[accepted['id']]['participant_response'] == 'accepted'
    assert indexed[request['id']]['overlapping_case_ids'] == [new_case['id']]
    expected_exceptions = {key for key, (_, status) in expected.items() if status.startswith('exception_')}
    assert set(report['exception_request_ids']) == expected_exceptions
    print(json.dumps(dict(result='PASS', scenarios=len(expected), exception_scenarios=len(expected_exceptions),
                          read_only=True, assignments_unchanged=True, ids_and_history_preserved=True)))


def event_without_links(event):
    return {key: ('2026-08-01T10:00:00+00:00' if key == 'created_at' else value)
            for key, value in event.items() if key not in ('workspace_id', 'request_id')}


if __name__ == '__main__':
    main()
