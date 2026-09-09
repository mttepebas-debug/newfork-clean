"""Observe both transaction orders of Exchange vs Schedule service operations.

Owned synthetic local workspace only. Each scenario gets a new future week.
The first writer sleeps after its operation but before commit; pg_stat_activity
must prove that the second service call waits on an advisory lock. No existing
week/session is reused, no production endpoints or unrelated work are touched.
"""
from datetime import date, timedelta
import json
from pathlib import Path
import subprocess
import sys
import time
import uuid
from shift_exchange_api_local import env, sql
from lineup_visual_fixture_local import quote

CONTAINER='supabase_db_newfork-clean'


def literal(value):
    return quote(json.dumps(value))+'::jsonb'


def launch(name, expression, hold=False):
    statement = "\\set VERBOSITY verbose\nbegin; set local statement_timeout='20s'; select "+expression+';'
    if hold:
        statement+='select pg_sleep(4);'
    statement+='commit;'
    process=subprocess.Popen(['docker','exec','-i','-e','PGAPPNAME='+name,CONTAINER,'psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
        stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
    process.stdin.write(statement);process.stdin.close();process.stdin=None
    return process


def observe(name, event, process):
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        if sql(f"select exists(select 1 from pg_stat_activity where application_name={quote(name)} and wait_event={quote(event)})")=='t':
            return
        if process.poll() is not None:
            output,error=process.communicate()
            raise AssertionError('Operation ended before observed wait: '+output+error)
        time.sleep(0.1)
    raise TimeoutError('Live wait not observed: '+name)


def result(process):
    output,error=process.communicate(timeout=25)
    rows=[json.loads(line) for line in output.splitlines() if line.startswith('{')]
    return {'exit':process.returncode,'result':rows[0] if rows else None,'error':error.strip()}


def main(path, only=None):
    env()
    state=json.loads(path.read_text(encoding='utf-8'));w=str(uuid.UUID(state['workspace']))
    assert state.get('exchange_fixture') and sql(f"select name from public.workspaces where id='{w}'")==state['name']
    manager=str(uuid.UUID(state['users']['manager']['id']));owner=str(uuid.UUID(state['users']['employee']['id']));applicant=str(uuid.UUID(state['users']['drew']['id']))
    loc=str(uuid.UUID(state['location_a']));person=str(uuid.UUID(state['employee_a']));receiver=str(uuid.UUID(state['employee_drew']))
    latest=date.fromisoformat(sql(f"select max(week_start) from public.schedule_location_publications where workspace_id='{w}'"))
    first=max(latest+timedelta(days=7),date.today()+timedelta(days=14));first-=timedelta(days=first.weekday())
    evidence=[];out=path.with_name('shift-exchange-schedule-races-result.json')
    kinds=[only] if only else ['unpublish','publish_changed','publish_same','save']
    for kind in kinds:
        for first_writer in ('exchange','schedule'):
            week=first+timedelta(days=7*len(evidence));pub,shift,source,draft=[str(uuid.uuid4()) for _ in range(4)]
            args=f"'{manager}','{w}'";scope=f"array['{loc}']::uuid[]"
            start='16:00' if kind=='publish_same' else '17:00'
            sql(f"""begin;
              insert into public.schedule_location_publications(id,workspace_id,location_id,week_start,version_number,published_by) values('{pub}','{w}','{loc}','{week}',1,'{manager}');
              insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id)
              values('{shift}','{w}','{pub}','{loc}','{person}','{state['job']}','{state['service']}','{week}','16:00','22:00','{source}');
              insert into public.schedule_drafts(id,workspace_id,week_start,name,created_by,updated_by) values('{draft}','{w}','{week}','Exchange race {kind}','{manager}','{manager}');
              insert into public.schedule_draft_shifts(id,workspace_id,draft_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,time_basis,time_timezone)
              values('{source}','{w}','{draft}','{loc}','{person}','{state['job']}','{state['service']}','{week}','{start}','22:00','explicit','America/Los_Angeles');
              commit;""")
            def exchange(actor,command):
                return f"public.shift_exchanges_command_service('{actor}','{w}',{literal(command)},'{uuid.uuid4()}')"
            case=json.loads(sql('select '+exchange(owner,{'action':'create','kind':'cover','shift_id':shift})))['case_id']
            sql('select '+exchange(applicant,{'action':'apply','shift_id':shift,'case_id':case}))
            aid=sql(f"select id from public.shift_exchange_applications where case_id='{case}' and employee_id='{receiver}' and status='pending_manager'")
            preview=json.loads(sql(f"select public.shift_exchange_preview('{manager}','{w}','{case}','{aid}')"));assert preview['allowed'],preview
            approve=exchange(manager,{'action':'approve','case_id':case,'application_id':aid,'expected_revision':2,'fingerprint':preview['fingerprint']})
            if kind=='unpublish':
                pre=json.loads(sql(f"select public.preview_schedule_unpublication_service({args},'{week}',{scope})"))
                operation=f"public.unpublish_schedule_service({args},'{week}',{scope},{quote(pre['fingerprint'])})"
            elif kind.startswith('publish'):
                pre=json.loads(sql(f"select public.preview_schedule_publication_service({args},'{draft}',{scope})"))
                assert pre['status']=='publish_ready',pre
                operation=f"public.publish_schedule_draft_service({args},'{draft}',{scope},{pre['draft_revision']},{quote(pre['fingerprint'])},'[]'::jsonb)"
            else:
                acquired=json.loads(sql(f"select public.acquire_schedule_edit_session_service({args},'{week}','published')"));session=acquired['session'];sid=session['id']
                sql(f"""update public.schedule_edit_session_shifts set start_time='17:00',time_basis='explicit',time_snapshot=null,note='Race note retained',revision=revision+1 where session_id='{sid}';
                  update public.schedule_edit_sessions set dirty=true,revision=revision+1 where id='{sid}';""")
                revision=int(sql(f"select revision from public.schedule_edit_sessions where id='{sid}'"))
                operation=f"public.save_schedule_edit_session_service({args},'{sid}',{revision},'Race saved draft')"
            marker='exchange-schedule-race-'+uuid.uuid4().hex
            first_name=marker+'-first';second_name=marker+'-second'
            first_process=launch(first_name,approve if first_writer=='exchange' else operation,True)
            second_process=None
            try:
                observe(first_name,'PgSleep',first_process)
                second_process=launch(second_name,operation if first_writer=='exchange' else approve)
                observe(second_name,'advisory',second_process)
                first_result=result(first_process);second_result=result(second_process)
            finally:
                for process in (first_process,second_process):
                    if process is not None and process.poll() is None:
                        process.terminate();process.wait(timeout=5)
            final=json.loads(sql(f"""select jsonb_build_object('case_status',c.status,'publication_status',p.status,
              'historical_owner',s.employee_id,'current',(select jsonb_agg(jsonb_build_object('employee_id',x.employee_id,'start_time',x.start_time)) from public.schedule_published_shifts x join public.schedule_location_publications y on y.id=x.publication_id and y.status='current' where x.workspace_id='{w}' and coalesce(x.source_shift_id,x.id)='{source}'))
              from public.shift_exchange_cases c join public.schedule_published_shifts s on s.id='{shift}' join public.schedule_location_publications p on p.id=s.publication_id where c.id='{case}'"""))
            record={'kind':kind,'first_writer':first_writer,'week':str(week),'case_id':case,'advisory_wait_observed':True,'first':first_result,'second':second_result,'final':final}
            evidence.append(record);out.write_text(json.dumps({'workspace':w,'hosted':False,'entry':'public database service functions; two actual connections','results':evidence},indent=2),encoding='utf-8')
            assert first_result['exit']==0,record
            if first_writer=='exchange':
                assert second_result['exit']!=0 and 'PT409' in second_result['error'],record
                assert final['case_status']=='completed' and final['current']==[{'employee_id':receiver,'start_time':'16:00:00'}],record
            elif kind in ('unpublish','publish_changed'):
                assert second_result['exit']==0 and final['case_status']=='invalidated',record
                assert final['current']==(None if kind=='unpublish' else [{'employee_id':person,'start_time':'17:00:00'}]),record
            else:
                assert second_result['exit']==0 and final['case_status']=='completed',record
                assert final['current']==[{'employee_id':receiver,'start_time':'16:00:00'}],record
            if kind=='save':
                if first_writer=='exchange':
                    assert sql(f"select note from public.schedule_edit_session_shifts where session_id='{sid}'")=='Race note retained'
                    record['working_note_preserved']=True
                else:
                    saved=first_result['result']['id']
                    assert sql(f"select note from public.schedule_draft_shifts where draft_id='{saved}' and id='{source}'")=='Race note retained'
                    record['saved_note_preserved']=True
                    reviewed=json.loads(sql(f"select public.preview_schedule_publication_service({args},'{saved}',{scope})"))
                    attempt=f"public.publish_schedule_draft_service({args},'{saved}',{scope},{reviewed['draft_revision']},{quote(reviewed['fingerprint'])},'[]'::jsonb)"
                    rejected=result(launch(marker+'-saved-draft',attempt))
                    assert rejected['exit']!=0 and 'PT409' in rejected['error'],rejected
                    record['saved_before_approval_cannot_restore_old_owner']=True
            record['status']='PASS'
            out.write_text(json.dumps({'workspace':w,'hosted':False,'entry':'public database service functions; two actual connections','results':evidence},indent=2),encoding='utf-8')
            print(json.dumps({'kind':kind,'first_writer':first_writer,'advisory_wait_observed':True,'status':'PASS'}),flush=True)


if __name__=='__main__':
    main(Path(sys.argv[1]).resolve(),sys.argv[2] if len(sys.argv)>2 else None)
