"""Prepare/approve a disposable case for real Schedule recovery UI testing.

Does not edit or save the Schedule session: those actions belong to the browser.
"""
from datetime import date, timedelta
import json
from pathlib import Path
import sys
import uuid
from shift_exchange_api_local import api, env, login, sql


def main(path, action):
    env()
    state = json.loads(path.read_text(encoding='utf-8'))
    w = str(uuid.UUID(state['workspace']))
    assert state.get('exchange_fixture') and sql(f"select name from public.workspaces where id='{w}'") == state['name']
    proof_path = path.with_name('shift-exchange-recovery-browser-fixture.json')
    if action == 'prepare':
        latest = date.fromisoformat(sql(f"select max(week_start) from public.schedule_location_publications where workspace_id='{w}'"))
        week = max(latest + timedelta(days=7), date.today() + timedelta(days=14))
        week -= timedelta(days=week.weekday())
        pub, shift, source = [str(uuid.uuid4()) for _ in range(3)]
        sql(f"""begin;
          insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
          values('{pub}','{w}','{state['location_a']}','{week}',1,'{state['users']['manager']['id']}');
          insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
          values('{shift}','{w}','{pub}','{state['location_a']}','{state['employee_a']}','{state['job']}','{state['service']}','{week}','16:00','22:00','{source}');
          commit;""")
        case = api(state, login(state, 'employee'), command={'action': 'create', 'kind': 'cover', 'shift_id': shift})['case_id']
        api(state, login(state, 'drew'), command={'action': 'apply', 'case_id': case, 'shift_id': shift})
        proof = {'workspace': w, 'case_id': case, 'shift_id': shift, 'source_id': source,
                 'week': str(week), 'schedule_url': f'http://localhost:5555/app/schedule?date={week}'}
        proof_path.write_text(json.dumps(proof, indent=2), encoding='utf-8')
    elif action == 'approve':
        proof = json.loads(proof_path.read_text(encoding='utf-8'))
        assert proof['workspace'] == w
        case = str(uuid.UUID(proof['case_id']))
        session = sql(f"select id from public.schedule_edit_sessions where workspace_id='{w}' and week_start='{proof['week']}' and status='active' and dirty")
        assert session, 'Browser must first create a dirty Schedule session'
        edited = json.loads(sql(f"select jsonb_build_object('owner',employee_id,'start',start_time,'break',unpaid_break_minutes) from public.schedule_edit_session_shifts where session_id='{session}' and id='{proof['source_id']}'"))
        assert edited['break'] == 30 and edited['owner'] == state['employee_a'], 'Browser must apply the material 30-minute break change first'
        app = sql(f"select id from public.shift_exchange_applications where case_id='{case}' and employee_id='{state['employee_drew']}' and status='pending_manager'")
        revision = int(sql(f"select revision from public.shift_exchange_cases where id='{case}' and status='open'"))
        token = login(state, 'manager')
        preview = api(state, token, f'?case_id={case}&application_id={app}')
        assert preview['allowed'], preview
        approved = api(state, token, command={'action':'approve', 'case_id':case, 'application_id':app,
            'expected_revision':revision, 'fingerprint':preview['fingerprint']})
        proof.update(session_id=session, edited_before_approval=edited, approval=approved)
        proof_path.write_text(json.dumps(proof, indent=2), encoding='utf-8')
    elif action == 'verify':
        proof = json.loads(proof_path.read_text(encoding='utf-8'))
        assert proof['workspace'] == w
        sid = str(uuid.UUID(proof['session_id']))
        source = str(uuid.UUID(proof['source_id']))
        final = json.loads(sql(f"""select jsonb_build_object('session_status',e.status,
          'draft_id',d.id,'draft_name',d.name,'draft_owner',s.employee_id,'draft_break',s.unpaid_break_minutes,
          'live_owner',p.employee_id,'live_break',p.unpaid_break_minutes,'publication_status',pub.status,
          'publication_version',pub.version_number)
          from public.schedule_edit_sessions e join public.schedule_drafts d on d.workspace_id=e.workspace_id and d.week_start=e.week_start and d.name='Shift Hub material recovery QA'
          join public.schedule_draft_shifts s on s.draft_id=d.id and s.id='{source}'
          join public.schedule_published_shifts p on p.id='{proof['shift_id']}'
          join public.schedule_location_publications pub on pub.id=p.publication_id where e.id='{sid}'"""))
        assert final['session_status'] == 'saved', final
        assert final['draft_owner'] == final['live_owner'] == state['employee_drew'], final
        assert final['draft_break'] == final['live_break'] == 0, final
        assert final['publication_status'] == 'current' and final['publication_version'] == 1, final
        proof.update(saved_after_browser_recovery=final, verification='PASS')
        proof_path.write_text(json.dumps(proof, indent=2), encoding='utf-8')
    else:
        raise ValueError('Use prepare, approve, or verify')
    print(json.dumps(proof))


if __name__ == '__main__':
    main(Path(sys.argv[1]).resolve(), sys.argv[2])
