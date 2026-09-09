"""Real-clock deadline races in the owned, network-isolated replay DB only.

No wall-clock mocking and no edit of case expiry: every deadline equals the new
published shift's actual start. --baseline records the pre-fix defects.
"""
import json
from pathlib import Path
import subprocess
import sys
import time
import uuid

CONTAINER = 'newfork-shift-exchange-replay-20260907'
W = '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd'
MANAGER = 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5'
LOCATION = '11000000-0000-4000-8000-000000000001'


def sql(statement):
    r = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt',
        '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
        input=statement.encode(), capture_output=True)
    if r.returncode:
        raise RuntimeError(r.stderr.decode())
    return r.stdout.decode().strip()


def launch(name, statement):
    p = subprocess.Popen(['docker', 'exec', '-i', '-e', 'PGAPPNAME='+name,
        CONTAINER, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres',
        '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    p.stdin.write(("\\set VERBOSITY verbose\nbegin; set local statement_timeout='20s';"+statement+';commit;').encode())
    p.stdin.close()
    p.stdin = None
    return p


def observe(name, event, process):
    until = time.monotonic()+10
    while time.monotonic() < until:
        if sql(f"select exists(select 1 from pg_stat_activity where application_name='{name}' and wait_event='{event}')") == 't':
            return
        assert process.poll() is None, 'Operation ended before the expected live wait'
        time.sleep(.1)
    raise AssertionError('Expected database wait was not observed')


def result(p):
    out, err = p.communicate(timeout=25)
    rows = [json.loads(row) for row in out.decode().splitlines() if row.startswith('{')]
    return {'exit':p.returncode, 'rows':rows, 'error':err.decode().strip()}


def command(actor, value, key=None):
    payload = json.dumps(value).replace("'", "''")
    return f"select public.shift_exchanges_command_service('{actor}','{W}','{payload}'::jsonb,'{key or uuid.uuid4()}')"


def fixture(lead=6):
    owner, receiver, owner_actor, receiver_actor, shift = [str(uuid.uuid4()) for _ in range(5)]
    owner_code = 'E-'+str(int(uuid.UUID(owner)))
    receiver_code = 'E-'+str(int(uuid.UUID(receiver)))
    # Capacity is recorded before assigning the new fixture employees to a
    # published location. Every scenario uses separate people to avoid overlap.
    sql(f"""begin;
      update public.workspaces set shift_exchanges_enabled=true where id='{W}';
      insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',id::text||'@example.test','','{{}}','{{}}',now(),now()
      from unnest(array['{owner_actor}','{receiver_actor}']::uuid[]) id;
      insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations)
      select '{W}',id,'employee','active',true from unnest(array['{owner_actor}','{receiver_actor}']::uuid[]) id;
      insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by)
      values('{owner}','{W}','{owner_actor}','{owner_code}','Deadline','Owner','{MANAGER}'),
      ('{receiver}','{W}','{receiver_actor}','{receiver_code}','Deadline','Receiver','{MANAGER}');
      insert into public.employee_schedule_availability_versions(workspace_id,employee_id,version_number,timezone,recurring_rules,source,recorded_by,effective_from)
      select '{W}',id,1,'America/Los_Angeles',(select jsonb_agg(jsonb_build_object('day',d,'mode','unrestricted','windows','[]'::jsonb)) from generate_series(0,6)d),'manager','{MANAGER}',current_date-1
      from unnest(array['{owner}','{receiver}']::uuid[]) id;
      insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by)
      select '{W}',id,'{LOCATION}','{MANAGER}' from unnest(array['{owner}','{receiver}']::uuid[]) id;
      insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by)
      select '{W}',id,'13000000-0000-4000-8000-000000000001','{MANAGER}' from unnest(array['{owner}','{receiver}']::uuid[]) id;
      commit;""")
    sql(f"""begin;
      create temp table timing as select date_trunc('second',clock_timestamp())+interval '{lead} seconds' start_at;
      create temp table local_timing as select start_at at time zone 'America/Los_Angeles' wall from timing;
      insert into public.schedule_location_publications(workspace_id,location_id,week_start,version_number,published_by)
      select '{W}','{LOCATION}',date_trunc('week',wall)::date,
        coalesce((select max(version_number) from public.schedule_location_publications where workspace_id='{W}' and location_id='{LOCATION}' and week_start=date_trunc('week',wall)::date),0)+1,'{MANAGER}'
      from local_timing where not exists(select 1 from public.schedule_location_publications where workspace_id='{W}' and location_id='{LOCATION}' and week_start=date_trunc('week',wall)::date and status='current');
      insert into public.schedule_published_shifts(id,workspace_id,publication_id,location_id,employee_id,job_id,shift_type_id,scheduled_date,start_time,end_time,source_shift_id,time_basis)
      select '{shift}','{W}',p.id,'{LOCATION}','{owner}','13000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001',wall::date,wall::time,(wall+interval '30 minutes')::time,gen_random_uuid(),'explicit'
      from local_timing join public.schedule_location_publications p on p.workspace_id='{W}' and p.location_id='{LOCATION}' and p.week_start=date_trunc('week',wall)::date and p.status='current';
      commit;""")
    cid = json.loads(sql(command(owner_actor,{'action':'create','kind':'cover','shift_id':shift})))['case_id']
    sql(command(receiver_actor,{'action':'apply','case_id':cid,'shift_id':shift}))
    aid = sql(f"select id from public.shift_exchange_applications where case_id='{cid}'")
    preview = json.loads(sql(f"select public.shift_exchange_preview('{MANAGER}','{W}','{cid}','{aid}')"))
    assert preview['allowed'], preview
    assert sql(f"select expires_at=(public.shift_exchange_shift('{W}','{shift}')->>'starts_at')::timestamptz from public.shift_exchange_cases where id='{cid}'") == 't'
    approve = command(MANAGER,{'action':'approve','case_id':cid,'application_id':aid,'expected_revision':2,'fingerprint':preview['fingerprint']})
    return {'case':cid,'shift':shift,'owner':owner,'receiver':receiver,'approve':approve}


def snapshot(f):
    return json.loads(sql(f"""select jsonb_build_object('status',c.status,'owner',s.employee_id,
      'deadline',c.expires_at,'observed_at',clock_timestamp(),'deadline_passed',clock_timestamp()>=c.expires_at,
      'applications',(select jsonb_agg(status order by id) from public.shift_exchange_applications where case_id=c.id),
      'events',(select coalesce(jsonb_object_agg(action,n),'{{}}'::jsonb) from (select action,count(*) n from public.shift_exchange_events where case_id=c.id group by action)e),
      'transfer_outbox',(select count(*) from public.notification_outbox where subject_id=c.id::text and payload->>'request_action' in ('transfer_completed','other_selected')),
      'votes',(select count(*) from public.shift_exchange_votes where case_id=c.id))
      from public.shift_exchange_cases c join public.schedule_published_shifts s on s.id='{f['shift']}' where c.id='{f['case']}'"""))


def run_cases(baseline):
    inspection = json.loads(subprocess.check_output(['docker','inspect',CONTAINER]))[0]
    assert inspection['HostConfig']['NetworkMode']=='none' and not inspection['HostConfig']['PortBindings']
    assert sql(f"select name from public.workspaces where id='{W}'") == 'Meyhouse'
    report = {'container':CONTAINER,'hosted':False,'baseline':baseline,'results':[]}
    out = Path('supabase/.temp/shift-exchange-deadline-'+('baseline' if baseline else 'result')+'.json')
    for scenario in (['late_lock','late_commit'] if baseline else ['late_lock','late_commit','expiry_first','approval_first']):
        f=fixture(); name='sx-deadline-'+uuid.uuid4().hex; processes=[]
        try:
            if scenario=='late_lock':
                holder=launch(name+'-holder',f"select pg_advisory_xact_lock(hashtextextended('{W}',921));select pg_sleep(8)"); processes.append(holder)
                observe(name+'-holder','PgSleep',holder)
                approval=launch(name+'-approval',f['approve']); processes.append(approval)
                observe(name+'-approval','advisory',approval)
                assert sql(f"select a.xact_start<c.expires_at from pg_stat_activity a cross join public.shift_exchange_cases c where a.application_name='{name}-approval' and c.id='{f['case']}'")=='t'
                result(holder); decision=result(approval)
            elif scenario=='late_commit':
                approval=launch(name+'-approval',f['approve']+';select pg_sleep(8)'); processes.append(approval)
                observe(name+'-approval','PgSleep',approval)
                decision=result(approval)
            elif scenario=='expiry_first':
                sql(f"select pg_sleep(greatest(0,extract(epoch from expires_at-clock_timestamp()))+.1) from public.shift_exchange_cases where id='{f['case']}'")
                holder=launch(name+'-maintenance','select public.shift_exchanges_maintain_service(500);select pg_sleep(2)'); processes.append(holder)
                observe(name+'-maintenance','PgSleep',holder)
                approval=launch(name+'-approval',f['approve']); processes.append(approval)
                observe(name+'-approval','advisory',approval)
                result(holder); decision=result(approval)
            else:
                approval=launch(name+'-approval',f['approve']); processes.append(approval)
                decision=result(approval)
                sql(f"select pg_sleep(greatest(0,extract(epoch from expires_at-clock_timestamp()))+.1) from public.shift_exchange_cases where id='{f['case']}'")
            before_maintenance=snapshot(f)
            sql('select public.shift_exchanges_maintain_service(500)')
            final=snapshot(f)
            item={'scenario':scenario,'case':f['case'],'decision':decision,'before_maintenance':before_maintenance,'final':final}
            report['results'].append(item); out.write_text(json.dumps(report,indent=2))
            assert final['deadline_passed']
            if baseline or scenario=='approval_first':
                assert decision['exit']==0 and final['status']=='completed' and final['owner']==f['receiver'],item
                assert final['events'].get('transfer_completed')==1,item
            else:
                assert final['status']=='expired' and final['owner']==f['owner'] and final['applications']==['expired'],item
                assert final['events'].get('expired')==1 and 'transfer_completed' not in final['events'] and final['votes']==0,item
                assert final['transfer_outbox']==0,item
                if scenario in ('late_commit','expiry_first'): assert decision['exit']!=0 and 'PT409' in decision['error'],item
                if scenario=='late_commit': assert before_maintenance['status']=='open',item
            item['status']='DEFECT_REPRODUCED' if baseline else 'PASS'; out.write_text(json.dumps(report,indent=2)); print(json.dumps({'scenario':scenario,'status':item['status']}),flush=True)
        finally:
            for p in processes:
                if p.poll() is None: p.terminate(); p.wait(timeout=5)


def main(baseline):
    inspection = json.loads(subprocess.check_output(['docker','inspect',CONTAINER]))[0]
    assert inspection['HostConfig']['NetworkMode']=='none' and not inspection['HostConfig']['PortBindings']
    original_flag = sql(f"select shift_exchanges_enabled from public.workspaces where id='{W}'")
    assert original_flag in ('t','f')
    try:
        run_cases(baseline)
    finally:
        sql(f"update public.workspaces set shift_exchanges_enabled={'true' if original_flag=='t' else 'false'} where id='{W}'")


if __name__=='__main__':
    main('--baseline' in sys.argv)
