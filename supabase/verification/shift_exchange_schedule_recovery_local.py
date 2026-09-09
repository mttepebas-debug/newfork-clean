"""Real local API: dirty Schedule edit -> approved transfer -> explicit recovery.
Only the owned disposable Shift Hub fixture is changed. Never publishes a draft.
"""
import json
from pathlib import Path
import sys
import urllib.request
from urllib.error import HTTPError
import uuid
from shift_exchange_api_local import api, login, sql


def main(path):
    state = json.loads(path.read_text())
    workspace = str(uuid.UUID(state['workspace']))
    assert state.get('exchange_fixture') and sql(f"select name from public.workspaces where id='{workspace}';") == state['name']
    manager = login(state, 'manager')

    def call(route, body=None, method=None, key=None):
        headers = {'Authorization': 'Bearer ' + manager, 'X-Newfork-Workspace-Id': workspace}
        if body is not None:
            headers['Content-Type'] = 'application/json'
        if key:
            headers['Idempotency-Key'] = key
        request = urllib.request.Request('http://127.0.0.1:5556/v1/workspaces/' + workspace + route,
            headers=headers, data=json.dumps(body).encode() if body is not None else None,
            method=method or ('POST' if body is not None else 'GET'))
        with urllib.request.urlopen(request, timeout=25) as response:
            return json.load(response)

    cid = state['review_case']
    case = next(c for c in api(state, manager, '?view=manager')['cases'] if c['id'] == cid)
    assert case['status'] == 'open', 'Prepare a new review case before this proof'
    week = sql(f"select pub.week_start from public.schedule_published_shifts s join public.schedule_location_publications pub on pub.id=s.publication_id where s.workspace_id='{workspace}' and s.id='{uuid.UUID(state['review_shift'])}';")
    acquired = call('/schedule/edit-sessions', {'week_start': week, 'source_kind': 'published'})
    session = acquired['session']
    assert not session['dirty'], 'Do not overwrite an existing dirty fixture session'
    source_id = sql(f"select coalesce(source_shift_id,id) from public.schedule_published_shifts where workspace_id='{workspace}' and id='{uuid.UUID(state['review_shift'])}';")
    shift = next(s for s in session['shifts'] if s.get('source_published_shift_id') == state['review_shift'] or s['id'] in (state['review_shift'], source_id))
    edit = {k: shift.get(k) for k in ('location_id','employee_id','job_id','shift_type_id','scheduled_date','start_time','end_time','time_basis','time_snapshot','time_timezone','unpaid_break_minutes','hide_time_on_badge')}
    edit.update(start_time='17:00', time_basis='explicit', time_snapshot=None, note='RECOVERY QA NOTE TO PRESERVE')
    session = call(f"/schedule/edit-sessions/{session['id']}/shifts/{shift['id']}",
        {'expected_session_revision': session['revision'], 'expected_shift_revision': shift['revision'], 'shift': edit}, 'PATCH')
    application = next(a for a in case['applications'] if a['employee_id'] == state['employee_casey'])
    preview = api(state, manager, f"?case_id={cid}&application_id={application['id']}")
    api(state, manager, command={'action':'approve','case_id':cid,'application_id':application['id'],'expected_revision':case['revision'],'fingerprint':preview['fingerprint']})
    save_body = {'expected_session_revision': session['revision'], 'name': 'Exchange recovery QA'}
    try:
        call(f"/schedule/edit-sessions/{session['id']}/save", save_body)
        raise AssertionError('Stale edit unexpectedly saved')
    except HTTPError as error:
        assert error.code == 409, error.read().decode()
    route = f"/shift-exchanges/schedule-recovery/{session['id']}"
    comparison = call(route)
    assert any(c['current']['employee_id'] == state['employee_casey'] for c in comparison['changes'])
    key = str(uuid.uuid4())
    updated = call(route, {'fingerprint':comparison['fingerprint']}, key=key)
    assert call(route, {'fingerprint':comparison['fingerprint']}, key=key) == updated
    restored = next(s for s in updated['shifts'] if s['id'] == shift['id'])
    assert restored['employee_id'] == state['employee_casey'] and restored['start_time'].startswith('16:00')
    assert restored['note'] == 'RECOVERY QA NOTE TO PRESERVE'
    saved = call(f"/schedule/edit-sessions/{session['id']}/save", {**save_body, 'expected_session_revision':updated['revision']})
    result = {'case_id':cid, 'session_id':session['id'], 'draft_id':saved['id'], 'save_blocked_before_recovery':True,
              'idempotent_recovery':True, 'note_preserved':True, 'saved_after_recovery':True, 'draft_published':False}
    path.with_name('shift-exchange-schedule-recovery-result.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    main(Path(sys.argv[1]).resolve())
