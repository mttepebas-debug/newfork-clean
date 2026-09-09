"""Add a second real manager and two new published QA shifts for AT08.

Only extends the named local synthetic workspace. Existing cases, assignments,
and snapshots are preserved. Credentials stay in the ignored role state.
"""
import json
import sys
import uuid
from lineup_role_fixture_local import ROOT, auth, sql

STATE = ROOT / 'supabase/.temp/shift-exchange-role.json'
PROOF = ROOT / 'supabase/.temp/shift-exchange-two-managers.json'


def verify(reports):
    state = json.loads(STATE.read_text(encoding='utf-8'))
    fixture = json.loads(PROOF.read_text(encoding='utf-8'))
    w = str(uuid.UUID(state['workspace']))
    assert fixture['workspace'] == w and state['name'] == 'Line Up role verification ' + w
    assert sql(f"select name from public.workspaces where id='{w}'") == state['name']
    evidence = dict(workspace=w, cases=[])
    for report_path in reports:
        report_path = (ROOT / report_path).resolve()
        assert report_path.parent == (ROOT / 'supabase/.temp').resolve()
        report = json.loads(report_path.read_text(encoding='utf-8'))
        assert report['result'] == 'PASS' and report['workspace'] == w
        for case in report['cases']:
            cid = str(uuid.UUID(case['caseId']))
            shift = next(s for s in fixture['shifts'] if s.get('case_id') == cid)
            winner = state['users'][case['winnerRole']]['id']
            loser_role = 'manager2' if case['winnerRole'] == 'manager' else 'manager'
            loser = state['users'][loser_role]['id']
            data = json.loads(sql(f"""begin transaction read only;
              select jsonb_build_object(
                'case_id',c.id,'status',c.status,'current_owner',p.employee_id,
                'approved_count',(select count(*) from public.shift_exchange_applications where case_id=c.id and status='approved'),
                'neutral_closed_count',(select count(*) from public.shift_exchange_applications where case_id=c.id and status='closed_other_selected'),
                'winner_matches_assignment',exists(select 1 from public.shift_exchange_applications where case_id=c.id and status='approved' and employee_id=p.employee_id),
                'transfer_events',(select count(*) from public.shift_exchange_events where case_id=c.id and action='transfer_completed'),
                'winner_events',(select count(*) from public.shift_exchange_events where case_id=c.id and action='transfer_completed' and actor_user_id='{winner}'),
                'loser_note_events',(select count(*) from public.shift_exchange_events where case_id=c.id and actor_user_id='{loser}' and private_note<>''),
                'approve_commands',(select count(*) from public.shift_exchange_commands where workspace_id='{w}' and command->>'case_id'=c.id::text and command->>'action'='approve'),
                'unshared_day_snapshots',(select count(*) from public.schedule_lineup_snapshots where workspace_id='{w}' and location_id='{fixture['location']}' and lineup_date='{shift['date']}')
              ) from public.shift_exchange_cases c join public.schedule_published_shifts p on p.id='{shift['id']}' and p.workspace_id=c.workspace_id
              where c.id='{cid}' and c.workspace_id='{w}'; commit;"""))
            assert data['status'] == 'completed' and data['winner_matches_assignment']
            assert data['approved_count'] == data['transfer_events'] == data['winner_events'] == data['approve_commands'] == 1
            assert data['neutral_closed_count'] == 2
            assert data['loser_note_events'] == data['unshared_day_snapshots'] == 0
            evidence['cases'].append(data)
    assert len({c['case_id'] for c in evidence['cases']}) == len(evidence['cases'])
    target = ROOT / 'docs/rebuild/shift-hub-visual-proof-2026-09-07/two-managers/data.json'
    target.write_text(json.dumps(evidence, indent=2), encoding='utf-8')
    print(json.dumps(dict(result='PASS', cases=len(evidence['cases']), single_winner=True,
                         loser_drafts_not_sent=True, unshared_days_not_published=True)))


def main():
    state = json.loads(STATE.read_text(encoding='utf-8'))
    w = str(uuid.UUID(state['workspace']))
    assert state.get('exchange_fixture') and state['name'] == 'Line Up role verification ' + w
    assert sql(f"select name from public.workspaces where id='{w}'") == state['name']
    if 'manager2' not in state['users']:
        email = f'exchange-manager2-{w}@example.test'
        user = auth('POST', 'users', dict(email=email, password=state['password'], email_confirm=True,
                    user_metadata=dict(display_name='Exchange QA Second Manager')))
        state['users']['manager2'] = dict(id=user['id'], email=email)
        STATE.write_text(json.dumps(state, indent=2), encoding='utf-8')
    manager2 = str(uuid.UUID(state['users']['manager2']['id']))
    assert manager2 != state['users']['manager']['id']
    sql(f"""begin;
      insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations)
      values('{w}','{manager2}','manager','active',true) on conflict(workspace_id,user_id) do nothing;
      insert into public.user_profiles(user_id,display_name) values('{manager2}','Exchange QA Second Manager')
      on conflict(user_id) do nothing;
      insert into public.user_workspace_preferences(user_id,active_workspace_id) values('{manager2}','{w}')
      on conflict(user_id) do nothing;
      commit;""")
    assert sql(f"select role||':'||status||':'||all_locations from public.workspace_memberships where workspace_id='{w}' and user_id='{manager2}'") == 'manager:active:true'
    if PROOF.exists():
        proof = json.loads(PROOF.read_text(encoding='utf-8'))
        assert proof['workspace'] == w
    else:
        proof = dict(workspace=w, week='2026-12-28', location=state['location_a'],
                     shifts=[dict(id=str(uuid.uuid4()), source_id=str(uuid.uuid4()), date=day)
                             for day in ['2026-12-28', '2026-12-29']])
        PROOF.write_text(json.dumps(proof, indent=2), encoding='utf-8')
    location, week = proof['location'], proof['week']
    if '--second-pair' in sys.argv and len(proof['shifts']) == 2:
        proof['shifts'] += [dict(id=str(uuid.uuid4()), source_id=str(uuid.uuid4()), date=day)
                            for day in ['2026-12-30', '2026-12-31']]
        PROOF.write_text(json.dumps(proof, indent=2), encoding='utf-8')
    publication = sql(f"select id from public.schedule_location_publications where workspace_id='{w}' and location_id='{location}' and week_start='{week}' and status='current'")
    if not publication:
        publication = str(uuid.uuid4())
        sql(f"insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by) values('{publication}','{w}','{location}','{week}',1,'{state['users']['manager']['id']}')")
    for shift in proof['shifts']:
        sql(f"""insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
          values('{shift['id']}','{w}','{publication}','{location}','{state['employee_a']}','{state['job']}','{state['service']}','{shift['date']}','05:00','06:00','{shift['source_id']}')
          on conflict(id) do nothing;""")
    proof['publication'] = publication
    PROOF.write_text(json.dumps(proof, indent=2), encoding='utf-8')
    print(json.dumps(dict(workspace=w, distinct_managers=True, shifts=proof['shifts'])))


if __name__ == '__main__':
    if '--verify' in sys.argv:
        verify(sys.argv[2:])
    else:
        main()
