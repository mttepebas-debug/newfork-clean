/** Real batch/cron-handler verification in a private copy of the owned replay DB.
 * SQL transport replaces HTTP only; business functions and worker are unmocked.
 * No main DB, external network, provider delivery, or direct queue leasing.
 * pnpm --filter @newfork/api exec tsx ../../supabase/verification/shift_exchange_batch_local.mts
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createNotificationOutboxWorkerWithClient } from '../../apps/api/src/notifications/notification-outbox-worker';
import { registerNotificationOutboxRoutes } from '../../apps/api/src/notifications/notification-outbox-routes';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, 'apps/api/package.json'));
const Fastify = require('fastify');
const container = 'newfork-shift-exchange-replay-20260907';
const meta = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0];
assert.equal(meta.Name, '/' + container);
assert.equal(meta.HostConfig.NetworkMode, 'none');
assert.equal(meta.State.Running, true);
const db = 'sx_relay_' + Date.now();
assert.match(db, /^sx_relay_\d+$/);
const literal = (v: unknown) => typeof v === 'number' ? String(v) : "'" + String(v).replaceAll("'", "''") + "'";
function sql(statement: string, database = db): string {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'],
    { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
const w = '6ea5d512-bc7f-4cf3-aad4-2f0815de00fd';
const manager = 'd9f43e62-e099-48e1-bc6f-a5aabe8e87d5';
const actor = (n: number) => '98000000-0000-4000-8000-' + String(n).padStart(12, '0');
const emp = (n: number) => '15000000-0000-4000-8000-' + String(n).padStart(12, '0');
const shift = (n: number) => '98020000-0000-4000-8000-' + String(n).padStart(12, '0');
const sourceWorkspaces = JSON.parse(sql('select jsonb_agg(id order by id) from public.workspaces', 'postgres'));
assert.deepEqual(sourceWorkspaces, ['6','7','8','9'].map(prefix => prefix + w.slice(1)));
// Snapshot dump avoids terminating provider/background connections to postgres.
const dump = execFileSync('docker',['exec',container,'pg_dump','-U','postgres','-d','postgres','--format=plain'], { maxBuffer:128*1024*1024 });
sql(`create database ${db} template template0`, 'postgres');
execFileSync('docker',['exec','-i',container,'psql','-X','-q','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1'], { input:dump,stdio:['pipe','pipe','pipe'],maxBuffer:128*1024*1024 });
const report: Record<string, any> = { database: db, container: meta.Id, network: 'none', transport: 'psql service_role; real worker and SQL; no HTTP transport claim', batches: [], checks: [] };
const output = path.join(root, `supabase/.temp/shift-exchange-batch-${db}.json`);
const save = () => writeFileSync(output, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ database: db, report: output }));
const names = new Set(['lease_notification_outbox_service', 'process_notification_outbox_service', 'fail_notification_outbox_service', 'shift_exchanges_maintain_service']);
const client = { async rpc(name: string, args: Record<string, unknown>) {
  assert(names.has(name));
  for (const key of Object.keys(args)) assert.match(key, /^target_[a-z_]+$/);
  const call = `public.${name}(${Object.entries(args).map(([k,v]) => `${k} => ${literal(v)}`).join(',')})`;
  try {
    const expression = name === 'lease_notification_outbox_service' ? `coalesce((select jsonb_agg(t) from ${call} t),'[]')` : call;
    return { data: JSON.parse(sql(`set role service_role; select ${expression};`)), error: null };
  } catch (error: any) {
    return { data: null, error: { message: String(error.stderr || error.message).slice(0, 1000) } };
  }
}};
const worker = createNotificationOutboxWorkerWithClient(client, { workerId: db, batchSize: 100, retryBaseDelaySeconds: 1, prepareBatch: async () => {
  const result = await client.rpc('shift_exchanges_maintain_service', { target_batch_size: 100 });
  if (result.error) throw Error(result.error.message);
  return result.data;
}});
const app = Fastify();
const secret = randomUUID();
registerNotificationOutboxRoutes(app, { worker, cronSecret: secret });
async function batch(label: string) {
  const response = await app.inject({ method: 'GET', url: '/internal/cron/notification-outbox', headers: { authorization: 'Bearer ' + secret } });
  assert.equal(response.statusCode, 200);
  const result = response.json();
  report.batches.push({ label, ...result }); save();
  console.log(JSON.stringify({ batch: label, leased: result.leased, processed: result.processed, retried: result.retried }));
  return result;
}
const command = (who: string, value: unknown) => JSON.parse(sql(`select public.shift_exchanges_command_service(${literal(who)},${literal(w)},${literal(JSON.stringify(value))}::jsonb,${literal(randomUUID())});`));
const rows = (cid: string) => JSON.parse(sql(`select coalesce(jsonb_agg(jsonb_build_object('recipient',r.recipient_user_id,'title',i.title,'body',i.body,'url',i.action_url,'group',i.group_key) order by r.recipient_user_id,i.id),'[]') from public.notification_inbox_items i join public.notification_recipients r on r.id=i.recipient_projection_id where r.workspace_id=${literal(w)} and i.group_key in(${literal('shift_exchange:'+cid)},${literal('shift_exchange_review:'+cid)},${literal('shift_exchange_available:'+cid)}) and i.visibility_state='visible';`));
try {
  const unauthorized = await app.inject({ method: 'GET', url: '/internal/cron/notification-outbox' });
  assert.equal(unauthorized.statusCode, 401);
  report.checks.push('cron rejects missing secret');
  // Drain only synthetic historical events copied from our network-isolated DB.
  for (let i=0; i<10; i++) { const result = await batch('copied-fixture-baseline'); assert.equal(result.failed,0); if (!result.leased) break; }
  const fixture = readFileSync(path.join(root,'supabase/tests/shift_exchanges_v1.test.sql'),'utf8').split('\n').slice(0,30).filter(line => !line.includes('no_plan()')).join('\n');
  sql(fixture + `\nupdate public.workspaces set shift_exchanges_enabled=true where id='${w}';commit;`);
  sql(`update public.locations set lineup_operations_enabled=true where workspace_id='${w}';
    select public.share_schedule_lineup_service('${manager}','${w}','2030-01-07',array['11000000-0000-4000-8000-000000000001'::uuid],
    public.preview_schedule_lineup_share_service('${manager}','${w}','2030-01-07',array['11000000-0000-4000-8000-000000000001'::uuid])->>'fingerprint');`);
  const cid = command(actor(1), { action:'create',kind:'cover',shift_id:shift(1) }).case_id;
  for (const n of [2,3,4]) command(actor(n), { action:'apply',case_id:cid,shift_id:shift(1) });
  await batch('three-candidate-review');
  let notices = rows(cid);
  assert.equal(notices.filter((n:any) => n.recipient===manager && n.title==='3 candidates ready for review').length,1);
  assert.equal(sql(`select employee_id from public.schedule_published_shifts where id='${shift(1)}'`),emp(1));
  report.checks.push('three applications -> one manager review; owner unchanged');
  const aid = sql(`select id from public.shift_exchange_applications where case_id='${cid}' and employee_id='${emp(2)}'`);
  const preview = JSON.parse(sql(`select public.shift_exchange_preview('${manager}','${w}','${cid}','${aid}')`));
  assert.equal(preview.allowed,true);
  const revision = Number(sql(`select revision from public.shift_exchange_cases where id='${cid}'`));
  command(manager,{ action:'approve',case_id:cid,application_id:aid,expected_revision:revision,fingerprint:preview.fingerprint });
  const domain = () => sql(`select jsonb_build_object('case',(select to_jsonb(c) from public.shift_exchange_cases c where id='${cid}'),'shift',(select to_jsonb(s) from public.schedule_published_shifts s where id='${shift(1)}'),'entries',(select jsonb_agg(to_jsonb(e) order by id) from public.schedule_lineup_entries e where workspace_id='${w}'),'snapshots',(select jsonb_agg(to_jsonb(s) order by id) from public.schedule_lineup_snapshots s where workspace_id='${w}'))`);
  const beforeDelivery=domain();
  report.sharedSnapshotsBeforeDelivery=Number(sql(`select count(*) from public.schedule_lineup_snapshots where workspace_id='${w}' and lineup_date='2030-01-07'`));
  assert(report.sharedSnapshotsBeforeDelivery>=2);
  // Deliberately fail only the winning employee's terminal result in this copy.
  sql(`create function public.sx_relay_fail_one() returns trigger language plpgsql set search_path='' as $$ begin
    if new.group_key='shift_exchange:${cid}' and exists(select 1 from public.notification_recipients r where r.id=new.recipient_projection_id and r.recipient_user_id='${actor(2)}') then raise exception 'controlled relay failure'; end if; return new; end; $$;
    revoke all on function public.sx_relay_fail_one() from public,anon,authenticated,service_role;
    create trigger sx_relay_fail_one before insert on public.notification_inbox_items for each row execute function public.sx_relay_fail_one();`);
  try {
    const failed=await batch('one-result-fails-others-deliver');
    assert.equal(failed.leased,4); assert.equal(failed.processed,3); assert.equal(failed.retried,1); assert.equal(failed.failed,0);
    assert.equal(domain(),beforeDelivery);
    assert.equal(rows(cid).filter((n:any)=>n.recipient===actor(2) && n.title==='Shift change approved').length,0);
  } finally { sql('drop trigger sx_relay_fail_one on public.notification_inbox_items; drop function public.sx_relay_fail_one();'); }
  // Wait for the real recorded retry deadline; do not edit available_at.
  await new Promise(resolve=>setTimeout(resolve,1100));
  const retried=await batch('retry-winner-result'); assert.equal(retried.leased,1); assert.equal(retried.processed,1);
  assert.equal(domain(),beforeDelivery);
  report.checks.push('one inbox failure retries while other three deliver; domain and snapshots unchanged');
  notices=rows(cid);
  assert.equal(notices.filter((n:any) => n.recipient===manager).length,0);
  for (const n of [1,2]) assert.equal(notices.filter((item:any) => item.recipient===actor(n) && item.title==='Shift change approved').length,1);
  for (const n of [3,4]) assert.equal(notices.filter((item:any) => item.recipient===actor(n) && item.title==='Another teammate was selected').length,1);
  assert.equal(sql(`select employee_id from public.schedule_published_shifts where id='${shift(1)}'`),emp(2));
  report.checks.push('approval delivers owner/winner/other-selected exactly once; manager task removed');
  report.finalNotices=notices;
  const again=await batch('empty-idempotent-repeat'); assert.equal(again.leased,0); assert.deepEqual(rows(cid),notices);
  report.checks.push('next real batch has no duplicate delivery');
  const owner2 = () => sql(`select employee_id from public.schedule_published_shifts where id='${shift(2)}'`);
  for(const response of ['decline','withdraw']) {
    const direct = command(actor(1),{action:'create',kind:'cover',shift_id:shift(2),employee_id:emp(4)}).case_id;
    const application = sql(`select id from public.shift_exchange_applications where case_id='${direct}'`);
    await batch(`direct-${response}-invitation`);
    assert.equal(rows(direct).filter((n:any)=>n.recipient===actor(4)&&n.title==='A teammate needs your response').length,1);
    if(response==='withdraw') {
      command(actor(4),{action:'accept',case_id:direct,application_id:application,expected_revision:1});
      assert.equal(owner2(),emp(1));
      await batch('direct-accepted-manager-task');
      assert.equal(rows(direct).filter((n:any)=>n.recipient===manager).length,1);
    }
    command(actor(4),{action:response,case_id:direct,application_id:application,expected_revision:response==='withdraw'?2:1});
    await batch(`direct-${response}-result`);
    const result=rows(direct);
    assert.equal(result.length,1); assert.equal(result[0].recipient,actor(1));
    assert(result[0].body.includes(response==='decline'?'declined':'withdrew consent'));
    assert.equal(owner2(),emp(1));
    assert.equal(sql(`select status from public.shift_exchange_cases where id='${direct}'`),'cancelled');
    report.checks.push(`direct ${response}: owner informed, obsolete peer/manager tasks gone, ownership unchanged`);
  }
  const pool=command(actor(1),{action:'create',kind:'cover',shift_id:shift(2)}).case_id;
  for(const n of [3,4]) command(actor(n),{action:'apply',case_id:pool,shift_id:shift(2)});
  await batch('two-candidate-review');
  const rejected=sql(`select id from public.shift_exchange_applications where case_id='${pool}' and employee_id='${emp(3)}'`);
  command(manager,{action:'reject',case_id:pool,application_id:rejected,expected_revision:3,reason:'Please keep your other assignment.'});
  await batch('one-rejected-one-still-open');
  assert.equal(sql(`select count(*) from public.shift_exchange_applications where case_id='${pool}' and status='pending_manager'`),'1');
  assert.equal(rows(pool).filter((n:any)=>n.recipient===manager&&n.title==='1 candidate ready for review').length,1);
  assert.equal(owner2(),emp(1));
  command(actor(1),{action:'close',case_id:pool,expected_revision:4,reason:'I will work my original shift.'});
  await batch('owner-closes-search');
  assert.equal(rows(pool).filter((n:any)=>n.recipient===manager || n.group==='shift_exchange_available:'+pool).length,0);
  assert.equal(sql(`select status from public.shift_exchange_applications where case_id='${pool}' and employee_id='${emp(3)}'`),'rejected_by_manager');
  assert.equal(owner2(),emp(1));
  report.checks.push('one rejection keeps other candidate actionable; owner close removes review and opportunities, preserves rejection and ownership');
  const eligibility=command(actor(1),{action:'create',kind:'cover',shift_id:shift(2)}).case_id;
  const oid=sql(`select id from public.notification_outbox where subject_id='${eligibility}' and payload->>'request_action'='cover_opened'`);
  sql(`set role service_role;select public.project_notification_event_service('${oid}');select public.project_notification_recipients_service('${oid}');`);
  assert.equal(sql(`select count(*) from public.notification_recipients r join public.notification_outbox o on o.event_id=r.event_id where o.id='${oid}' and r.recipient_user_id='${actor(3)}'`),'1');
  sql(`update public.employee_job_assignments set ended_at='2029-12-31' where workspace_id='${w}' and employee_id='${emp(3)}' and ended_at is null;
    update public.workspace_memberships set status='suspended' where workspace_id='${w}' and user_id='${actor(4)}';`);
  await batch('eligibility-and-membership-revoked-after-projection');
  assert.equal(rows(eligibility).filter((n:any)=>[actor(3),actor(4)].includes(n.recipient)).length,0);
  assert.equal(rows(eligibility).filter((n:any)=>n.recipient===actor(2)&&n.group==='shift_exchange_available:'+eligibility).length,1);
  assert.equal(owner2(),emp(1));
  command(actor(1),{action:'close',case_id:eligibility,expected_revision:1,reason:'I will work my original shift.'});
  await batch('close-zero-application-search');
  assert.equal(rows(eligibility).length,0);
  report.checks.push('delivery rechecks job qualification and active membership after projection; unaffected candidate still receives opportunity; zero-application closure clears it');
  report.result='PASS';
} catch(error:any) { report.result='FAIL'; report.error=String(error.stderr || error.stack || error); process.exitCode=1; }
finally { save(); await app.close(); console.log(JSON.stringify({result:report.result,database:db,checks:report.checks,error:report.error})); }
