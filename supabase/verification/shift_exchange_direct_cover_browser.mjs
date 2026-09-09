/** Four direct-cover outcomes through real local employee/manager UI sessions.
 * No auth injection, response mocks, fake clocks or history reset.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.argv[2]);
const state = JSON.parse(await readFile(path.join(root, 'supabase/.temp/shift-exchange-role.json'), 'utf8'));
const fixturePath = path.join(root, 'supabase/.temp/shift-exchange-direct-cover.json');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
if (!state.exchange_fixture || fixture.workspace !== state.workspace) throw Error('Owned local fixture required');
const api = 'http://127.0.0.1:5560', web = 'http://localhost:5561';
const endpoint = `/v1/workspaces/${state.workspace}/shift-exchanges`;
const folder = path.join(root, 'docs/rebuild/shift-hub-visual-proof-2026-09-07/direct-cover');
await mkdir(folder, { recursive: true });
const reportPath = path.join(root, `supabase/.temp/shift-exchange-direct-cover-browser-${Date.now()}.json`);
const report = { startedAt: new Date().toISOString(), workspace: state.workspace, sessions: [], outcomes: [], states: [], errors: [] };
console.log(JSON.stringify({ reportPath }));
const save = () => writeFile(reportPath, JSON.stringify(report, null, 2));
const saveFixture = () => writeFile(fixturePath, JSON.stringify(fixture, null, 2));
const browser = await chromium.launch({ headless: true });
const contexts = {}, tokens = {};
async function request(role, route, body) {
  const response = await fetch(api + route, { headers: { Authorization: 'Bearer ' + tokens[role], 'X-Newfork-Workspace-Id': state.workspace,
    ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() } : {}) },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000) });
  const data = await response.json();
  if (!response.ok) throw Error(`${role} ${route} ${response.status} ${JSON.stringify(data)}`);
  return data;
}
const model = (role, shift) => request(role, `${endpoint}?view=${role === 'manager' ? 'manager' : 'employee'}&from=${shift.date}&to=${shift.date}${shift.case_id ? '&case_id=' + shift.case_id : ''}`);
const current = async shift => (await model('manager', shift)).cases.find(c => c.id === shift.case_id);
const op = (route, body) => request('manager', '/schedule/lineups' + route, body);
const hubRoute = (role, shift, focused = true) => (role === 'manager' ? '/app/schedule/requests?tab=shift-changes&hub_view=ready' : '/app/employee-hub/shift-hub?hub_view=requests') + `&from=${shift.date}&to=${shift.date}${focused && shift.case_id ? '&case=' + shift.case_id : ''}`;
async function page(role, route, ready) {
  const p = await contexts[role].newPage();
  p.on('pageerror', e => report.errors.push({ role, kind: 'pageerror', message: e.message }));
  p.on('response', r => { if (r.url().startsWith(api) && r.status() >= 400) report.errors.push({ role, status: r.status(), method: r.request().method(), path: new URL(r.url()).pathname }); });
  await p.goto(web + route); await p.locator(ready).first().waitFor({ state: 'attached', timeout: 25000 });
  if (await p.evaluate(() => document.visibilityState) !== 'visible') throw Error('Surface must be visible');
  return p;
}
async function clickCommand(p, button, expectedAction) {
  const response = p.waitForResponse(r => new URL(r.url()).pathname === endpoint && r.request().method() === 'POST');
  await button.click(); const r = await response;
  if (r.request().postDataJSON().action !== expectedAction) throw Error('Unexpected UI command');
  const data = await r.json(); if (!r.ok()) throw Error('UI command failed ' + JSON.stringify(data));
  return data;
}
const inboxCase = (p, shift) => p.locator(`.notifications-page article:has(a[href*="case=${shift.case_id}"])`);
async function screenshot(p, name, width = 390, theme = 'light') {
  await p.setViewportSize({ width, height: 1000 });
  await p.evaluate(t => document.documentElement.dataset.theme = t, theme);
  // Screenshots must represent settled theme transitions, not their midpoint.
  await p.waitForTimeout(200);
  const metrics = await p.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
  if (metrics.documentWidth > width) throw Error('Horizontal overflow ' + name);
  await p.screenshot({ path: path.join(folder, name + '.png') }); report.states.push({ name, width, theme, metrics });
}
async function assertOwner(shift, owner) {
  const item = await current(shift);
  const lineup = await op(`?date=${shift.date}&location_ids=${fixture.location}`);
  const entries = lineup.locations.flatMap(l => l.entries).filter(e => e.id === shift.id || e.source_shift_id === shift.id);
  if (item.shift.employee_id !== owner || entries.length !== 1 || entries[0].employee_id !== owner) throw Error('Published/Line Up owner disagrees');
  return item;
}
try {
  for (const role of ['manager', 'employee', 'blake']) {
    contexts[role] = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await contexts[role].newPage(); await p.goto(web + '/sign-in');
    await p.getByLabel('Email', { exact: true }).fill(state.users[role].email);
    await p.getByLabel('Password', { exact: true }).fill(state.password);
    const auth = p.waitForResponse(r => r.url().includes('/auth/v1/token?grant_type=password') && r.request().method() === 'POST');
    await p.getByRole('button', { name: 'Sign in', exact: true }).click();
    const response = await auth; if (!response.ok()) throw Error('UI login failed');
    const data = await response.json(); tokens[role] = data.access_token;
    if (data.user.id !== state.users[role].id) throw Error('Wrong actor');
    await p.waitForURL(u => u.pathname.startsWith('/app'), { timeout: 25000 });
    if ((await request(role, '/v1/context')).workspace?.id !== state.workspace) throw Error('Wrong workspace');
    report.sessions.push({ role, actor: data.user.id, login: 'normal UI' }); await p.close();
  }
  for (const shift of fixture.shifts) {
    if (shift.verified) continue;
    const capturePrefix = shift.notice_check ? 'final-' : '';
    const prior = (await model('manager', shift)).cases.find(c => c.shift.source_id === shift.source_id);
    if (prior?.status !== 'open' && prior) throw Error('Completed fixture is preserved; use its saved evidence');
    const row = { outcome: shift.outcome, shiftId: shift.id, date: shift.date, stages: [] };
    const inbox = {}, hubs = {}, extra = [];
    for (const role of ['manager', 'employee', 'blake']) inbox[role] = await page(role, '/app/notifications', '.notifications-page');
    hubs.blake = await page('blake', hubRoute('blake', shift, false), '.sx-root');
    if (!prior) {
      hubs.employee = await page('employee', hubRoute('employee', shift, false) + '&offer=' + shift.id, 'dialog');
      const dialog = hubs.employee.getByRole('dialog', { name: 'Find cover or swap' });
      await dialog.getByRole('radio', { name: 'Ask a teammate', exact: true }).check();
      report.matchSelectorSnapshot = await dialog.ariaSnapshot(); await save();
      await dialog.getByRole('combobox', { name: /^Eligible teammate/ }).selectOption(state.employee_b);
      await dialog.getByLabel(/Private note for your manager/).fill('AT11 owner-only planning note');
      await dialog.getByText('You remain responsible until a manager approves the transfer.', { exact: true }).waitFor();
      const start = Date.now();
      const created = await clickCommand(hubs.employee, dialog.getByRole('button', { name: 'Send cover request' }), 'create');
      shift.case_id = created.case_id; await saveFixture();
      await inboxCase(inbox.blake, shift).waitFor({ timeout: 10000 });
      await hubs.blake.locator('.sx-case-row').click();
      await hubs.blake.getByRole('button', { name: 'Accept request', exact: true }).waitFor();
      row.stages.push({ stage: 'invite visible in open recipient hub and inbox', visibleUpperMs: Date.now() - start });
    } else {
      shift.case_id = prior.id; await saveFixture();
      hubs.employee = await page('employee', hubRoute('employee', shift), '.sx-detail');
      await hubs.blake.goto(web + hubRoute('blake', shift));
    }
    hubs.manager = await page('manager', hubRoute('manager', shift), '.sx-detail');
    const invited = await assertOwner(shift, state.employee_a);
    if (invited.stage !== 'awaiting_peer' || invited.applications[0].status !== 'invited') throw Error('New invitation stage incorrect');
    if (await inboxCase(inbox.manager, shift).count()) throw Error('Manager task exists before employee consent');
    if (await hubs.blake.getByText('AT11 owner-only planning note', { exact: true }).count()) throw Error('Private owner note leaked');
    await hubs.employee.getByText('AT11 owner-only planning note', { exact: true }).waitFor();
    await hubs.manager.getByText('AT11 owner-only planning note', { exact: true }).waitFor();
    await hubs.manager.getByRole('button', { name: 'Review Blake QA', exact: true }).click();
    if (await hubs.manager.getByRole('button', { name: 'Approve transfer to Blake QA' }).isEnabled()) throw Error('Manager can approve before consent');
    if (shift.outcome === 'decline') {
      await screenshot(hubs.blake, capturePrefix + 'recipient-invitation-light');
      await screenshot(hubs.blake, capturePrefix + 'recipient-invitation-dark', 390, 'dark');
    }
    if (shift.outcome === 'approve') {
      const body = { date: shift.date, location_ids: [fixture.location] };
      if (!shift.shared) {
        const preview = await op('/share-preview', body);
        shift.shareResult = await op('/share', { ...body, fingerprint: preview.fingerprint }); shift.shared = true; await saveFixture();
      }
      extra.push(await page('employee', `/app/employee-hub/schedule?date=${shift.date}&view=day`, '.hub-shift-list'));
      extra.push(await page('blake', `/app/employee-hub/schedule?date=${shift.date}&view=day`, '.hub-shift-list'));
      extra.push(await page('manager', `/app/schedule/lineup?date=${shift.date}&location=${fixture.location}`, '#lineup-title'));
      await extra[0].locator('#shift-' + shift.id).waitFor();
      if (await extra[1].locator('#shift-' + shift.id).count()) throw Error('Invite added pending shift to recipient schedule');
    }
    const allPages = [...Object.values(inbox), ...Object.values(hubs), ...extra];
    let navigations = 0;
    for (const p of allPages) p.on('framenavigated', f => { if (f === p.mainFrame()) navigations++; });
    if (shift.outcome !== 'decline') {
      const start = Date.now();
      await clickCommand(hubs.blake, hubs.blake.getByRole('button', { name: 'Accept request', exact: true }), 'accept');
      await Promise.all([
        hubs.blake.getByRole('button', { name: 'Withdraw acceptance', exact: true }).waitFor(),
        inboxCase(inbox.blake, shift).waitFor({ state: 'detached', timeout: 10000 }),
        inboxCase(inbox.manager, shift).waitFor({ timeout: 10000 }),
        hubs.manager.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent.includes('Approve transfer to Blake QA'))?.disabled),
      ]);
      await assertOwner(shift, state.employee_a);
      if (shift.notice_check) await hubs.blake.getByText('Request accepted. Waiting for final manager approval.', { exact: true }).waitFor();
      if (extra.length && await extra[1].locator('#shift-' + shift.id).count()) throw Error('Acceptance assigned the shift');
      row.stages.push({ stage: 'acceptance awaits manager; owner unchanged', visibleUpperMs: Date.now() - start });
      if (shift.outcome === 'withdraw') await screenshot(hubs.blake, 'recipient-awaiting-manager');
    }
    const start = Date.now();
    if (['decline', 'withdraw'].includes(shift.outcome)) {
      await clickCommand(hubs.blake, hubs.blake.getByRole('button', { name: shift.outcome === 'decline' ? 'Decline' : 'Withdraw acceptance', exact: true }), shift.outcome);
    } else {
      await hubs.manager.getByRole('button', { name: shift.outcome === 'approve' ? 'Approve transfer to Blake QA' : 'Decline this application', exact: true }).click();
      const dialog = hubs.manager.getByRole('dialog');
      if (shift.outcome === 'reject') {
        await dialog.getByLabel('Reason shared with affected employees').fill('Coverage is needed in your current role.');
        await dialog.getByLabel(/Private manager note/).fill('AT11 private manager decision note');
      }
      await clickCommand(hubs.manager, dialog.getByRole('button', { name: shift.outcome === 'approve' ? 'Confirm transfer to Blake QA' : 'Decline application', exact: true }), shift.outcome);
    }
    const approved = shift.outcome === 'approve';
    await Promise.all([
      inboxCase(inbox.manager, shift).waitFor({ state: 'detached', timeout: 10000 }),
      inboxCase(inbox.employee, shift).waitFor({ timeout: 10000 }),
      hubs.employee.locator('.sx-detail .sx-assignment strong').filter({ hasText: approved ? 'Blake QA' : 'Alex Morgan' }).waitFor({ timeout: 10000 }),
      hubs.blake.getByRole('button', { name: /Accept request|Withdraw acceptance/ }).waitFor({ state: 'detached', timeout: 10000 }),
      ...Object.values(hubs).map(p => p.locator('.sx-detail-heading .sx-pill').filter({ hasText: approved ? /^Approved$/ : /^Search closed$/ }).waitFor({ timeout: 10000 })),
    ]);
    if (approved) {
      await Promise.all([
        inboxCase(inbox.blake, shift).getByText('Shift change approved', { exact: true }).waitFor({ timeout: 10000 }),
        extra[0].locator('#shift-' + shift.id).waitFor({ state: 'detached', timeout: 10000 }),
        extra[1].locator('#shift-' + shift.id).waitFor({ timeout: 10000 }),
        extra[2].getByRole('button', { name: 'Manage Blake QA', exact: true }).waitFor({ timeout: 10000 }),
      ]);
    } else if (['decline', 'withdraw'].includes(shift.outcome)) {
      await inboxCase(inbox.blake, shift).waitFor({ state: 'detached', timeout: 10000 });
    } else {
      await inboxCase(inbox.blake, shift).waitFor({ timeout: 10000 });
      await hubs.blake.getByText('Coverage is needed in your current role.', { exact: true }).first().waitFor();
      if (await hubs.blake.getByText('AT11 private manager decision note', { exact: true }).count()) throw Error('Manager private note leaked');
    }
    const after = await assertOwner(shift, approved ? state.employee_b : state.employee_a);
    if (after.status !== (approved ? 'completed' : 'cancelled')) throw Error('Terminal case status incorrect');
    row.stages.push({ stage: 'terminal ' + shift.outcome, visibleUpperMs: Date.now() - start });
    row.caseId = shift.case_id; row.finalStatus = after.status; row.applicationStatus = after.applications[0].status;
    row.finalOwner = after.shift.employee_name; row.navigationsDuringOutcomes = navigations;
    if (navigations) throw Error('Unexpected navigation during outcomes');
    if (shift.notice_check) {
      if (await hubs.employee.locator('.sx-notice').count()) throw Error('Owner creation notice survived later response');
      if (approved) {
        if (await hubs.blake.locator('.sx-notice').count()) throw Error('Acceptance notice survived final approval');
      } else {
        await hubs.blake.getByText('Request closed. No transfer was made. Check your current schedule for your assignment.', { exact: true }).waitFor();
      }
      row.noticesMatchCurrentResult = true;
    }
    await screenshot(hubs.employee, capturePrefix + 'owner-' + shift.outcome);
    await screenshot(hubs.blake, capturePrefix + 'recipient-' + shift.outcome, 390, shift.outcome === 'approve' ? 'dark' : 'light');
    if (approved) {
      await inboxCase(inbox.blake, shift).getByRole('link').click();
      await inbox.blake.waitForURL(u => u.searchParams.get('case') === shift.case_id);
      await inbox.blake.locator('.sx-detail .sx-assignment strong').filter({ hasText: 'Blake QA' }).waitFor();
      row.recipientInboxDeepLink = true;
    } else {
      await hubs.employee.getByRole('button', { name: 'Start a new cover or swap request', exact: true }).click();
      await hubs.employee.getByRole('dialog', { name: 'Find cover or swap' }).waitFor();
      row.ownerCanRestart = true;
    }
    shift.verified = true; row.result = 'PASS'; report.outcomes.push(row); await save(); await saveFixture();
    console.log(JSON.stringify({ outcome: shift.outcome, result: 'PASS', stages: row.stages }));
    for (const p of allPages) await p.close();
  }
  if (!report.outcomes.length) throw Error('No new outcomes tested. Use the read-only verifier for completed evidence.');
  if (report.errors.length) throw Error('Unexpected HTTP/browser errors');
  report.result = 'PASS';
} catch (error) { report.fatal = error.message; process.exitCode = 1; }
finally { await browser.close(); report.finishedAt = new Date().toISOString(); await save(); console.log(JSON.stringify({ result: report.result, fatal: report.fatal, outcomes: report.outcomes.length, states: report.states.length, errors: report.errors })); }
