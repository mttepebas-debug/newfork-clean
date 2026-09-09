// Disposable local Auth/API acceptance. Credentials never leave process memory.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, 'apps/api/.env.local'), 'utf8').split(/\r?\n/)
  .filter(line => line.includes('=') && !line.trimStart().startsWith('#'))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const base = env.SUPABASE_URL.replace(/\/$/, '');
assert(['http://localhost:55321', 'http://127.0.0.1:55321'].includes(base), 'Local Supabase only');
const apiBase = 'http://127.0.0.1:5556';
assert(process.argv.length === 2 || (process.argv.length === 4 && process.argv[2] === '--cleanup-only'), 'Use --cleanup-only <report> to recover fixture cleanup');
const recovery = process.argv[2] === '--cleanup-only';
const reportDir = path.join(root, 'artifacts/availability-redesign');
const reportPath = recovery ? path.resolve(process.argv[3]) : path.join(reportDir, `weekly-authenticated-flow-${Date.now()}.json`);
assert(path.dirname(reportPath) === reportDir && /^weekly-authenticated-flow(?:-\d+)?\.json$/.test(path.basename(reportPath)), 'Local acceptance report only');
assert(recovery || !fs.existsSync(reportPath), 'Preserve the previous run report before running again');
const previous = recovery ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : null;
const ids = Object.fromEntries(['workspace', 'location', 'department', 'job', 'type', 'employee'].map(k => [k, previous ? previous.fixture[k] : randomUUID()]));
const name = `Weekly authenticated acceptance ${ids.workspace}`;
const users = {};
const results = previous || { fixture: { ...ids, name, users: {} }, checks: [], cleanup: false };
if (recovery) {
  assert.equal(previous.fixture.name, name);
  for (const [role, user] of Object.entries(previous.fixture.users)) {
    assert(['owner', 'manager', 'employee'].includes(role));
    assert.equal(user.email, `weekly-${role}-${ids.workspace}@example.test`);
    users[role] = user;
  }
}
const persist = () => fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
function sql(statement) {
  return execFileSync('docker', ['exec', '-i', 'supabase_db_newfork-clean', 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: statement, encoding: 'utf8', timeout: 40000 }).trim();
}
async function json(url, method, headers, payload) {
  const response = await fetch(url, { method, headers: { ...headers, 'Content-Type': 'application/json' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), signal: AbortSignal.timeout(25000) });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}
async function auth(method, route, payload) {
  const result = await json(base + '/auth/v1/' + route, method,
    { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY }, payload);
  assert(result.status < 300, `Auth ${method} failed: ${result.status}`);
  return result.body;
}
async function api(role, route, payload, expected = 200, key = randomUUID()) {
  const result = await json(apiBase + route, payload === undefined ? 'GET' : 'POST', {
    Authorization: 'Bearer ' + users[role].token, 'X-Newfork-Workspace-Id': ids.workspace, 'Idempotency-Key': key,
  }, payload);
  assert.equal(result.status, expected, `${route}: ${JSON.stringify(result.body)}`);
  return result.body;
}
const wp = `/v1/workspaces/${ids.workspace}/availability/weekly`;
const week = () => ({ input_mode: 'time_range', days: Array.from({ length: 7 }, (_, day) => ({ day, all_day: false, shift_type_ids: [], range: null })) });
const check = (label, condition) => { assert(condition, label); results.checks.push(label); persist(); };
async function read(role = 'manager') { return api(role, wp + (role === 'employee' ? '' : `?employee_id=${ids.employee}`)); }
async function save(role, source, preference, extra = {}, key) {
  const model = await read(role);
  return api(role, wp, { employee_id: ids.employee, source, preference,
    expected_revision: model[source].revision, settings_revision: model.settings.revision, ...extra }, 200, key);
}
async function assess() {
  return api('manager', `/v1/workspaces/${ids.workspace}/availability/shift-assessment`, { shift: {
    employee_id: ids.employee, location_id: ids.location, job_id: ids.job, shift_type_id: ids.type,
    scheduled_date: '2035-01-15', start_time: '17:00', end_time: '21:00', time_basis: 'explicit', note: '',
  } });
}
async function candidate() {
  const body = await api('manager', '/schedule/lineups/candidates', { source_entry_id: null, target: {
    date: '2035-01-15', location_id: ids.location, job_id: ids.job, shift_type_id: ids.type,
    start_time: '17:00', end_time: '21:00', section_id: null, station: '',
  } });
  const rows = Array.isArray(body) ? body : body.candidates;
  assert(Array.isArray(rows), `Candidate envelope: ${Object.keys(body)}`);
  const row = rows.find(r => r.employee_id === ids.employee);
  assert(row, 'Employee must remain visible in Line Up');
  return row;
}
async function main() {
  persist();
  for (const role of ['owner', 'manager', 'employee']) {
    const password = 'Local-Weekly-' + randomUUID();
    const email = `weekly-${role}-${ids.workspace}@example.test`;
    const user = await auth('POST', 'admin/users', { email, password, email_confirm: true });
    users[role] = { id: user.id, email };
    results.fixture.users[role] = { id: user.id, email };
    persist();
    users[role].token = (await auth('POST', 'token?grant_type=password', { email, password })).access_token;
  }
  const w = quote(ids.workspace), owner = quote(users.owner.id);
  sql(`begin;
    insert into public.workspaces(id,name,created_by) values(${w},${quote(name)},${owner});
    insert into public.workspace_onboarding(workspace_id,status,current_step,completed_at,updated_by) values(${w},'complete',2,now(),${owner}) on conflict(workspace_id) do update set status='complete',current_step=2,completed_at=now();
    insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) values
      ${Object.entries(users).map(([role,u]) => `(${w},${quote(u.id)},${quote(role)},'active',true)`).join(',')};
    insert into public.locations(id,workspace_id,name,street_address,city,region,postal_code,timezone) values(${quote(ids.location)},${w},'QA Dining','1 Test St','Test City','CA','90001','America/Los_Angeles');
    insert into public.departments(id,workspace_id,name) values(${quote(ids.department)},${w},'QA Service');
    insert into public.jobs(id,workspace_id,department_id,name) values(${quote(ids.job)},${w},${quote(ids.department)},'QA Server');
    insert into public.shift_types(id,workspace_id,name,default_start_time,default_end_time) values(${quote(ids.type)},${w},'QA Dinner','17:00','23:00');
    insert into public.employee_profiles(id,workspace_id,user_id,employee_code,first_name,last_name,created_by) values(${quote(ids.employee)},${w},${quote(users.employee.id)},'E-994417','Weekly','Tester',${owner});
    insert into public.employee_location_assignments(workspace_id,employee_id,location_id,created_by) values(${w},${quote(ids.employee)},${quote(ids.location)},${owner});
    insert into public.employee_job_assignments(workspace_id,employee_id,job_id,created_by) values(${w},${quote(ids.employee)},${quote(ids.job)},${owner});
    commit;`);
  check('Unsubmitted employee starts without restrictions', !(await read('employee')).employee.submitted && !(await assess()).has_availability_conflict);
  const restricted = week(); restricted.days[1].range = { start: '18:00', end: '20:00' };
  const initial = await read('employee');
  const command = { employee_id: ids.employee, source: 'employee', expected_revision: initial.employee.revision,
    settings_revision: initial.settings.revision, preference: restricted };
  const key = randomUUID();
  const first = await api('employee', wp, command, 200, key);
  check('Employee preference takes effect immediately', first.model.employee.submitted && first.model.employee.revision === 1);
  await api('employee', wp, command, 200, key);
  check('Retry creates one event and no approval request', sql(`select (select count(*) from public.weekly_preference_events where workspace_id=${w})=1 and not exists(select 1 from public.availability_requests where workspace_id=${w});`) === 't');
  sql(`select public.project_notification_event_service(id) from public.notification_outbox where workspace_id=${w};
    select public.project_notification_recipients_service(id) from public.notification_outbox where workspace_id=${w};
    select public.project_notification_inbox_service(id) from public.notification_outbox where workspace_id=${w};`);
  const inbox = await api('manager', `/v1/workspaces/${ids.workspace}/communications/notifications`);
  check('Manager inbox links to employee Availability drawer', JSON.stringify(inbox).includes(`/app/employees?employeeId=${ids.employee}&section=availability`));
  const team = await api('manager', wp + '/team');
  check('Team table reads the saved employee week', team.employees.some(e => e.id === ids.employee && e.submitted && e.preference.days[1].range.start === '18:00'));
  const a = await assess();
  check('Schedule warns instead of blocking employee preference', a.has_availability_conflict && a.operation !== 'blocked' && a.employee_intervals.length > 0);
  const c = await candidate();
  check('Line Up retains selectable unavailable employee', c.has_availability_conflict && c.status === 'eligible');
  const notes = Array(7).fill(''); notes[1] = 'Private QA reminder';
  await save('manager', 'manager', restricted, { enabled: true, notes, copy_employee_revision: 1 });
  check('Copy preserves exact employee week and private notes', JSON.stringify((await read()).manager.preference) === JSON.stringify(restricted) && (await read()).manager.notes[1] === notes[1]);
  check('Employee response never exposes manager reminders', (await read('employee')).manager === null);
  await save('employee', 'employee', week());
  check('Later employee save does not automatically replace reminders', (await read()).manager.preference.days[1].range.start === '18:00');
  const onlyManager = await assess();
  check('Manager-only restriction affects Schedule', onlyManager.has_availability_conflict && onlyManager.employee_intervals.length === 0 && onlyManager.manager_intervals.length > 0);
  await save('manager', 'manager', restricted, { enabled: false, notes });
  check('Disabled reminders stop Schedule and Line Up warnings', !(await assess()).has_availability_conflict && !(await candidate()).has_availability_conflict);
  check('Disabled reminders retain selections and notes', (await read()).manager.notes[1] === notes[1] && (await read()).manager.preference.days[1].range.start === '18:00');
  await api('employee', wp + '/team', undefined, 403);
  check('Employee cannot read team availability', true);
  const settings = await api('owner', wp + '/settings');
  const settingsCommand = { input_mode: 'shift_type', warning_policy: 'confirm', onboarding_required: false,
    expected_revision: settings.settings.revision };
  await api('manager', wp + '/settings', settingsCommand, 403);
  check('Manager cannot change organization availability settings', true);
  await api('owner', wp + '/settings', settingsCommand);
  check('Owner settings are reflected in employee read', (await read('employee')).settings.input_mode === 'shift_type');
  const typeWeek = week(); typeWeek.input_mode = 'shift_type'; typeWeek.days[1].shift_type_ids = [ids.type];
  await save('employee', 'employee', typeWeek);
  const confirm = await assess();
  check('Shift-type restriction follows organization confirmation policy', confirm.has_availability_conflict &&
    confirm.warning_policy === 'confirm' && confirm.operation === 'warning_requires_override');
  // Only the disposable catalog row is changed here, not a Settings UI mutation.
  sql(`update public.shift_types set default_start_time='09:00',default_end_time='12:00' where id=${quote(ids.type)} and workspace_id=${w};`);
  const refreshed = await read('employee');
  check('Current type hours appear without rewriting employee selections', refreshed.shift_types.some(t => t.id === ids.type &&
    t.start_time === '09:00' && t.end_time === '12:00') && refreshed.employee.preference.days[1].shift_type_ids.includes(ids.type));
  check('Matching type identity outside current hours does not conflict', !(await assess()).has_availability_conflict);
  const leave = await api('employee', `/v1/workspaces/${ids.workspace}/employee-hub/time-off`, {
    location_id: ids.location, reason: 'QA approved leave', dates: ['2035-01-15'],
  });
  const leavePath = `/v1/workspaces/${ids.workspace}/schedule/requests/time-off/${leave.request_id}`;
  const viewed = await api('manager', leavePath + '/viewed', {});
  const decision = { expected_revision: viewed.revision, action: 'approve' };
  const preview = await api('manager', leavePath + '/assignment-preview', decision);
  const approved = await api('manager', leavePath + '/decision', { ...decision, operation_id: randomUUID(),
    assignment_fingerprint: preview.fingerprint, assignment_decisions: [] });
  check('Time Off still requires a separate manager approval', leave.status === 'pending' && approved.status === 'approved');
  check('Approved Time Off remains a Schedule hard blocker', (await assess()).operation === 'blocked');
  check('Approved Time Off remains a Line Up hard blocker', (await candidate()).status === 'ineligible');
}
async function cleanup() {
  const w = quote(ids.workspace);
  const existing = sql(`select name from public.workspaces where id=${w};`);
  if (existing) {
    assert.equal(existing, name, 'Fixture ownership mismatch');
    sql(`begin;
      set local lock_timeout='5s';
      -- Local synthetic history only. Table locks isolate the brief guard suspension;
      -- rollback restores guards too if any cleanup statement fails.
      alter table public.schedule_time_off_segments disable trigger b_time_off_requested_period;
      alter table public.time_off_decision_pieces disable trigger guard_time_off_decision_piece;
      update public.workspaces set lifecycle_status='deleted',closed_at=now(),closed_by=${quote(users.owner.id)} where id=${w};
      do $$ declare r record; pass integer; remaining bigint; begin
        for pass in 1..30 loop
          for r in select c.table_name from information_schema.columns c join information_schema.tables t using(table_schema,table_name) where c.table_schema='public' and c.column_name='workspace_id' and t.table_type='BASE TABLE' order by c.table_name loop
            begin execute format('delete from public.%I where workspace_id=$1',r.table_name) using ${w}::uuid;
            exception when foreign_key_violation then null; end;
          end loop;
        end loop;
      end $$;
      delete from public.workspaces where id=${w} and name=${quote(name)};
      alter table public.schedule_time_off_segments enable trigger b_time_off_requested_period;
      alter table public.time_off_decision_pieces enable trigger guard_time_off_decision_piece;
      commit;`);
  }
  for (const user of Object.values(users)) {
    assert.equal(sql(`select email from auth.users where id=${quote(user.id)};`), user.email);
    await auth('DELETE', 'admin/users/' + user.id);
  }
  check('Owned workspace and synthetic Auth users removed', sql(`select not exists(select 1 from public.workspaces where id=${w})
    and not exists(select 1 from auth.users where id = any(array[${Object.values(users).map(u => quote(u.id)).join(',')}]::uuid[]));`) === 't');
  results.cleanup = true;
  delete results.cleanup_error;
}
(async () => {
  try { if (!recovery) { await main(); results.status = 'passed'; } }
  catch (error) { results.status = 'failed'; results.error = error.message; process.exitCode = 1; }
  finally {
    try { await cleanup(); } catch (error) { results.cleanup_error = error.message; process.exitCode = 1; }
    persist(); console.log(JSON.stringify(results, null, 2));
  }
})();
