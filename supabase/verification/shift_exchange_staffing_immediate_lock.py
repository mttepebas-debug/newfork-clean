"""Owned local staffing projection contention, real independent SQL sessions."""
import json, subprocess, sys, time, uuid
from pathlib import Path
from shift_exchange_api_local import login
import shift_exchange_staffing_e2e_local as flow
flow.DAY='2026-12-21'
flow.API_ORIGIN='http://127.0.0.1:5560'
flow.PROOF=flow.ROOT/'supabase/.temp/shift-exchange-staffing-immediate.json'
state=json.loads(flow.STATE.read_text()); fixture=json.loads(flow.PROOF.read_text())
assert state['exchange_fixture'] and fixture['workspace']==state['workspace'] and fixture['confirmation']['status']=='applied'
w=str(uuid.UUID(state['workspace'])); actor=str(uuid.UUID(state['users']['manager']['id']))
assert flow.sql(f"select name from public.workspaces where id='{w}'")==state['name']
reportPath=flow.ROOT/'supabase/.temp/staffing-immediate-lock.json'
assert not reportPath.exists(),'Inspect the existing run; do not create a duplicate proposal'
report={'workspace':w,'key':str(uuid.uuid4())}
def save(): reportPath.write_bytes(json.dumps(report,indent=2).encode())
save(); token=login(state,'manager')
model=flow.request(state,token,'?date='+flow.DAY+'&location_ids='+state['location_a'])
entry=next(e for l in model['locations'] for e in l['entries'] if e.get('source_shift_id')==fixture['shift_id'] or e['id']==fixture['shift_id'])
operation={**fixture['operation'],'source_entry_id':entry['id'],'employee_id':state['employee_b'],'reason':'AT33 owned staffing delivery lock verification'}
preview=flow.request(state,token,'/operations/preview',{'operation':operation});assert preview['allowed'],preview
payload=json.dumps(dict(kind='offer',operation=operation,fingerprint=preview['fingerprint'],idempotency_key=report['key'])).replace("'","''")
proposal=json.loads(flow.sql(f"select public.lineup_proposals_service('{actor}','{w}','propose','{payload}'::jsonb)"))
pid=str(uuid.UUID(proposal['id']));report['proposal']=pid;save()
lock=None
try:
 row=json.loads(flow.sql(f"select jsonb_build_object('id',o.id,'subject',o.subject_id,'status',o.status,'attempts',o.attempt_count) from public.notification_outbox o join public.notifications n on n.id::text=o.subject_id where o.workspace_id='{w}' and n.source_id='{pid}' and n.event_key='requested'"))
 assert row['status']=='pending'; report['beforeOutbox']=row
 lock=subprocess.Popen(['docker','exec','-i','supabase_db_newfork-clean','psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
 lock.stdin.write(f"begin;select pg_advisory_xact_lock(hashtextextended('{w}:{row['subject']}',926));select 'LOCKED';select pg_sleep(3);rollback;\n");lock.stdin.close()
 while True:
  line=lock.stdout.readline()
  if line.strip()=='LOCKED':break
  if not line:raise RuntimeError('Lock process ended before acquiring lock')
 start=time.monotonic();busy=json.loads(flow.sql(f"select public.flush_lineup_staffing_notifications_service('{w}','{pid}')"));elapsed=round((time.monotonic()-start)*1000)
 assert busy['busy'] and busy['leased']==0 and busy['remaining'] and elapsed<2000,busy
 unchanged=json.loads(flow.sql(f"select jsonb_build_object('id',id,'subject',subject_id,'status',status,'attempts',attempt_count) from public.notification_outbox where id='{row['id']}'"))
 assert unchanged==row
 report['busy']={'result':busy,'elapsedMs':elapsed,'outboxUnchanged':True};save()
 lock.wait(timeout=8);assert lock.returncode==0,lock.stderr.read()
 delivered=json.loads(flow.sql(f"select public.flush_lineup_staffing_notifications_service('{w}','{pid}')"));assert delivered['processed']==1 and not delivered['busy'],delivered
 assert flow.sql(f"select count(*) from public.notification_inbox_items i join public.notifications n on n.id=i.legacy_notification_id where n.source_id='{pid}' and n.event_key='requested'")=='1'
 report['deliveryAfterUnlock']=delivered;report['result']='PASS'
finally:
 if lock and lock.poll() is None:lock.wait(timeout=8)
 report['cleanup']=flow.request(state,token,'/proposals/action',{'id':pid,'response':'cancel'})
 final=flow.snapshot(state,fixture);assert final['published_owner']==state['employee_a']
 report['ownerPreserved']=True;save()
print(json.dumps(report))
