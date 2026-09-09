"""Real DB approval/eligibility writer races in the owned synthetic fixture.

Reversible metadata mutations are restored in finally. Every case has a new week.
Use --baseline only before the write-lock migration to record the known defect.
"""
from datetime import date, timedelta
import json
from pathlib import Path
import subprocess
import sys
import uuid
from shift_exchange_api_local import env, sql
from shift_exchange_schedule_races_local import literal, observe, result


def launch(name, statement, hold=False):
    text = "\\set VERBOSITY verbose\nbegin; set local statement_timeout='20s'; " + statement + ';'
    if hold:
        text += 'select pg_sleep(4);'
    text += 'commit;'
    process = subprocess.Popen(['docker','exec','-i','-e','PGAPPNAME='+name,'supabase_db_newfork-clean',
        'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
        stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
    process.stdin.write(text)
    process.stdin.close()
    process.stdin = None
    return process


def main(path, baseline=False, availability_only=False):
    env()
    state = json.loads(path.read_text(encoding='utf-8'))
    w = str(uuid.UUID(state['workspace']))
    assert state.get('exchange_fixture') and sql(f"select name from public.workspaces where id='{w}'") == state['name']
    owner, receiver = [str(uuid.UUID(state[key])) for key in ('employee_a','employee_drew')]
    manager, employee, applicant = [str(uuid.UUID(state['users'][key]['id'])) for key in ('manager','employee','drew')]
    loc = str(uuid.UUID(state['location_a']))
    latest = date.fromisoformat(sql(f"select max(week_start) from public.schedule_location_publications where workspace_id='{w}'"))
    first = max(latest+timedelta(days=7),date.today()+timedelta(days=14))
    first -= timedelta(days=first.weekday())
    report = {'workspace':w,'baseline':baseline,'hosted':False,
              'entry':'Exchange public DB service versus direct eligibility DML; two real connections','results':[]}
    suffix = 'availability' if availability_only else 'baseline' if baseline else 'result'
    out = path.with_name('shift-exchange-eligibility-races-'+suffix+'.json')

    def command(actor, payload):
        return f"select public.shift_exchanges_command_service('{actor}','{w}',{literal(payload)},'{uuid.uuid4()}')"

    for kind in (['availability'] if availability_only else ['job'] if baseline else ['job','location','excluded']):
        for first_writer in (['approve'] if baseline or kind=='availability' else ['approve','eligibility']):
            week = first+timedelta(days=7*len(report['results']))
            pub, shift = [str(uuid.uuid4()) for _ in range(2)]
            sql(f"""begin;
              insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by)
              values('{pub}','{w}','{loc}','{week}',1,'{manager}');
              insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
              values('{shift}','{w}','{pub}','{loc}','{owner}','{state['job']}','{state['service']}','{week}','16:00','22:00',gen_random_uuid());
              commit;""")
            cid = json.loads(sql(command(employee,{'action':'create','kind':'cover','shift_id':shift})))['case_id']
            sql(command(applicant,{'action':'apply','case_id':cid,'shift_id':shift}))
            aid = sql(f"select id from public.shift_exchange_applications where case_id='{cid}' and employee_id='{receiver}' and status='pending_manager'")
            preview = json.loads(sql(f"select public.shift_exchange_preview('{manager}','{w}','{cid}','{aid}')"))
            assert preview['allowed'], preview
            approve = command(manager,{'action':'approve','case_id':cid,'application_id':aid,'expected_revision':2,'fingerprint':preview['fingerprint']})
            if kind == 'availability':
                version = int(sql(f"select max(version_number) from public.employee_schedule_availability_versions where workspace_id='{w}' and employee_id='{receiver}'"))
                payload = {'action':'submit','employee_id':receiver,'expected_revision':version,
                    'proposal':{'timezone':'America/Los_Angeles','kind':'temporary','effective_from':str(week),
                        'effective_until':str(week+timedelta(days=6)),
                        'days':[{'day':day,'mode':'unavailable','windows':[]} for day in range(7)]}}
                writer = f"select public.availability_command_service('{applicant}','{w}',{literal(payload)},'{uuid.uuid4()}')"
                restore = 'select 1'
                invalid = f"(select max(version_number)<>{version} from public.employee_schedule_availability_versions where workspace_id='{w}' and employee_id='{receiver}')"
            elif kind in ('job','location'):
                table = 'employee_'+kind+'_assignments'
                key = state['job'] if kind=='job' else loc
                ids = sql(f"select string_agg(quote_literal(id::text),',') from public.{table} where workspace_id='{w}' and employee_id='{receiver}' and {kind}_id='{key}' and ended_at is null")
                assert ids
                update = f"update public.{table} set ended_at=now() where workspace_id='{w}' and id in({ids})"
                restore = f"update public.{table} set ended_at=null where workspace_id='{w}' and id in({ids})"
                invalid = f"not exists(select 1 from public.{table} where workspace_id='{w}' and employee_id='{receiver}' and {kind}_id='{key}' and ended_at is null)"
            else:
                assert sql(f"select is_excluded_from_schedule from public.employee_profiles where workspace_id='{w}' and id='{receiver}'") == 'f'
                update = f"update public.employee_profiles set is_excluded_from_schedule=true where workspace_id='{w}' and id='{receiver}'"
                restore = update.replace('=true','=false')
                invalid = f"(select is_excluded_from_schedule from public.employee_profiles where workspace_id='{w}' and id='{receiver}')"
            if kind != 'availability':
                writer = update + ";select jsonb_build_object('eligibility_changed',true)"
            marker = 'exchange-eligibility-'+uuid.uuid4().hex
            first_process = second_process = None
            try:
                first_process = launch(marker+'-first',approve if first_writer=='approve' else writer,True)
                observe(marker+'-first','PgSleep',first_process)
                second_process = launch(marker+'-second',writer if first_writer=='approve' else approve)
                waited = False
                if first_writer == 'eligibility' and not baseline:
                    observe(marker+'-second','advisory',second_process)
                    waited = True
                second_result = result(second_process)
                first_result = result(first_process)
                final = json.loads(sql(f"""select jsonb_build_object('case_status',c.status,'owner',s.employee_id,
                  'application_status',a.status,'eligibility_revoked',{invalid},
                  'transfer_events',(select count(*) from public.shift_exchange_events where case_id=c.id and action='transfer_completed'))
                  from public.shift_exchange_cases c join public.shift_exchange_applications a on a.id='{aid}'
                  join public.schedule_published_shifts s on s.id='{shift}' where c.id='{cid}'"""))
                record = {'kind':kind,'first_writer':first_writer,'case_id':cid,'week':str(week),
                          'advisory_wait_observed':waited,'first':first_result,'second':second_result,'final':final}
                report['results'].append(record)
                out.write_text(json.dumps(report,indent=2),encoding='utf-8')
                assert first_result['exit']==0,record
                if baseline:
                    assert second_result['exit']==0 and final['owner']==receiver and final['eligibility_revoked'],record
                    record['status']='DEFECT_REPRODUCED'
                elif kind == 'availability':
                    assert second_result['exit']!=0 and '23514' in second_result['error'] and 'published' in second_result['error'],record
                    assert final['case_status']=='completed' and final['owner']==receiver and not final['eligibility_revoked'],record
                    assert final['transfer_events']==1,record
                    record.update(status='PASS',protection='Existing published-period immutability; no new availability lock')
                else:
                    assert second_result['exit']!=0 and 'PT409' in second_result['error'],record
                    if first_writer=='approve':
                        assert final['case_status']=='completed' and final['owner']==receiver and not final['eligibility_revoked'],record
                        assert final['application_status']=='approved' and final['transfer_events']==1,record
                    else:
                        assert final['case_status']=='open' and final['owner']==owner and final['eligibility_revoked'],record
                        assert final['application_status']=='pending_manager' and final['transfer_events']==0,record
                    record['status']='PASS'
            finally:
                for process in (first_process,second_process):
                    if process is not None and process.poll() is None:
                        process.terminate()
                        process.wait(timeout=5)
                sql(restore)
                if report['results'] and report['results'][-1].get('case_id')==cid:
                    report['results'][-1]['metadata_restored'] = sql('select '+invalid)=='f'
                    out.write_text(json.dumps(report,indent=2),encoding='utf-8')
            assert report['results'][-1]['metadata_restored']
            print(json.dumps({'kind':kind,'first_writer':first_writer,'status':record['status'],'metadata_restored':True}),flush=True)


if __name__=='__main__':
    main(Path(sys.argv[1]).resolve(),'--baseline' in sys.argv[2:],'--availability' in sys.argv[2:])
