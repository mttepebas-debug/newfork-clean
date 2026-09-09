/** AT08: two distinct real manager UI sessions, retained review and final race.
 * Only the owned local fixture is changed. A barrier delays two real POSTs for
 * the race; no response/data/auth mocks and no fake clock are used.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.argv[2]);
const state = JSON.parse(await readFile(path.join(root, 'supabase/.temp/shift-exchange-role.json'), 'utf8'));
const fixturePath = path.join(root, 'supabase/.temp/shift-exchange-two-managers.json');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
if (!state.exchange_fixture || fixture.workspace !== state.workspace || state.users.manager.id === state.users.manager2.id) throw Error('Owned fixture and distinct managers required');
const api = 'http://127.0.0.1:5560', web = 'http://localhost:5561';
const endpoint = `/v1/workspaces/${state.workspace}/shift-exchanges`;
const folder = path.join(root, 'docs/rebuild/shift-hub-visual-proof-2026-09-07/two-managers');
await mkdir(folder, { recursive: true });
const reportPath = path.join(root, `supabase/.temp/shift-exchange-two-managers-browser-${Date.now()}.json`);
const report = { startedAt: new Date().toISOString(), workspace: state.workspace, sessions: [], cases: [], layouts: [], errors: [], navigations: 0 };
console.log(JSON.stringify({ reportPath }));
const save = () => writeFile(reportPath, JSON.stringify(report, null, 2));
const saveFixture = () => writeFile(fixturePath, JSON.stringify(fixture, null, 2));
const browser = await chromium.launch({ headless: true });
const contexts = {}, tokens = {}, employees = {};
async function request(role, route, body) {
  const r = await fetch(api + route, { headers: { Authorization: 'Bearer ' + tokens[role], 'X-Newfork-Workspace-Id': state.workspace,
    ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() } : {}) },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(25000) });
  const data = await r.json();
  if (!r.ok) throw Error(`${role} ${route} ${r.status} ${JSON.stringify(data)}`);
  return data;
}
const exchange = (role, query = '', body) => request(role, endpoint + query, body);
const model = (role, s) => exchange(role, `?view=${role.startsWith('manager') ? 'manager' : 'employee'}&from=${s.date}&to=${s.date}${s.case_id ? '&case_id=' + s.case_id : ''}`);
async function openReview(role, shift, candidate) {
  const p = await contexts[role].newPage();
  p.on('pageerror', e => report.errors.push({ role, kind: 'pageerror', message: e.message }));
  p.on('response', r => { if (r.url().startsWith(api) && r.status() >= 400) report.errors.push({ role, status: r.status(), method: r.request().method(), path: new URL(r.url()).pathname }); });
  await p.goto(web + `/app/schedule/requests?tab=shift-changes&hub_view=ready&case=${shift.case_id}&from=${shift.date}&to=${shift.date}`);
  await p.getByRole('button', { name: `Review ${candidate}`, exact: true }).click();
  await p.getByRole('button', { name: `Approve transfer to ${candidate}`, exact: true }).click();
  const dialog = p.getByRole('dialog', { name: 'Confirm your decision', exact: true });
  await dialog.getByLabel(/Private manager note/).fill(`Unsent ${role} note for AT08`);
  if (await p.evaluate(() => document.visibilityState) !== 'visible') throw Error('Review must remain visible');
  p.on('framenavigated', f => { if (f === p.mainFrame()) report.navigations++; });
  return p;
}
async function verifyLoser(p, role, winnerName, shift, observeStart) {
  const dialog = p.getByRole('dialog', { name: 'Request updated', exact: true });
  await dialog.waitFor({ timeout: 15000 });
  await dialog.getByText('This transfer has already been approved.', { exact: false }).waitFor();
  await dialog.locator('.sx-assignment strong').filter({ hasText: winnerName }).waitFor();
  const visibleUpperMs = Date.now() - observeStart;
  if (await dialog.getByLabel(/Private manager note/).inputValue() !== `Unsent ${role} note for AT08`) throw Error('Losing manager draft lost');
  if (await dialog.getByRole('button', { name: 'Confirm transfer', exact: true }).count()) throw Error('Stale confirm still shown');
  if (await dialog.locator('.sx-assignment').getAttribute('data-published-state') !== 'current') throw Error('Current assignment unavailable');
  return { dialog, visibleUpperMs };
}
try {
  for (const role of ['manager', 'manager2', 'employee', 'blake', 'casey', 'drew']) {
    contexts[role] = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await contexts[role].newPage(); await p.goto(web + '/sign-in');
    await p.getByLabel('Email', { exact: true }).fill(state.users[role].email);
    await p.getByLabel('Password', { exact: true }).fill(state.password);
    const auth = p.waitForResponse(r => r.url().includes('/auth/v1/token?grant_type=password') && r.request().method() === 'POST');
    await p.getByRole('button', { name: 'Sign in', exact: true }).click();
    const response = await auth; if (!response.ok()) throw Error('UI login failed for ' + role);
    const data = await response.json(); tokens[role] = data.access_token;
    if (data.user.id !== state.users[role].id) throw Error('Wrong actor');
    await p.waitForURL(u => u.pathname.startsWith('/app'), { timeout: 25000 });
    const context = await request(role, '/v1/context');
    if (context.workspace?.id !== state.workspace) throw Error('Wrong workspace');
    employees[role] = (await model(role, fixture.shifts[0])).employee_id;
    report.sessions.push({ role, userId: data.user.id, employeeId: employees[role], login: 'normal UI' }); await p.close();
  }
  const pair = process.argv.includes('--second-pair') ? fixture.shifts.slice(2, 4) : fixture.shifts.slice(0, 2);
  if (pair.length !== 2) throw Error('Two owned shifts required');
  for (const [index, shift] of pair.entries()) {
    let existing = (await model('manager', shift)).cases.find(c => c.shift.source_id === shift.source_id);
    if (existing?.status === 'completed') throw Error('Do not rerun completed fixture; preserve its audit');
    if (!existing) {
      const created = await exchange('employee', '', { action: 'create', kind: 'cover', shift_id: shift.id });
      shift.case_id = created.case_id; await saveFixture();
    } else { shift.case_id = existing.id; await saveFixture(); }
    for (const role of ['blake', 'casey', 'drew']) {
      existing = (await model('manager', shift)).cases.find(c => c.id === shift.case_id);
      if (!existing.applications.some(a => a.employee_id === employees[role] && a.status === 'pending_manager')) {
        await exchange(role, '', { action: 'apply', shift_id: shift.id, case_id: shift.case_id });
      }
    }
    const before = (await model('manager', shift)).cases.find(c => c.id === shift.case_id);
    if (before.shift.employee_id !== state.employee_a || before.candidate_count !== 3) throw Error('Original owner or candidates incorrect');
    const candidates = ['blake', 'casey'].map(role => before.applications.find(a => a.employee_id === employees[role]));
    if (candidates.some(c => !c || c.eligibility.status !== 'eligible')) throw Error('Both selected candidates must be eligible');
    const pages = [await openReview('manager', shift, candidates[0].employee_name), await openReview('manager2', shift, candidates[1].employee_name)];
    const row = { caseId: shift.case_id, scenario: index ? 'simultaneous final commands' : 'second manager already reviewing', ownerPreservedUntilFinal: true, candidates: candidates.map(c => c.employee_name) };
    const finalResponse = p => p.waitForResponse(r => new URL(r.url()).pathname === endpoint && r.request().method() === 'POST');
    let statuses, winnerIndex, observeStart;
    if (!index) {
      const response = finalResponse(pages[0]);
      observeStart = Date.now();
      await pages[0].getByRole('dialog').getByRole('button', { name: `Confirm transfer to ${candidates[0].employee_name}`, exact: true }).click();
      statuses = [(await response).status()]; winnerIndex = 0;
    } else {
      let release;
      const barrier = new Promise(resolve => { release = resolve; });
      let arrivals = 0;
      const barrierTimeout = setTimeout(() => release(), 12000);
      for (const p of pages) await p.route(api + endpoint, async route => {
        if (route.request().method() === 'POST' && route.request().postDataJSON().action === 'approve') {
          arrivals++; if (arrivals === 2) release(); await barrier;
        }
        await route.continue();
      });
      const responses = pages.map(finalResponse);
      observeStart = Date.now();
      await Promise.all(pages.map((p, n) => p.getByRole('dialog').getByRole('button', { name: `Confirm transfer to ${candidates[n].employee_name}`, exact: true }).click()));
      statuses = await Promise.all(responses.map(async r => (await r).status()));
      clearTimeout(barrierTimeout);
      if (arrivals !== 2 || statuses.filter(s => s === 200).length !== 1 || statuses.filter(s => s === 409).length !== 1) throw Error('Two-manager race did not yield one 200 and one 409');
      row.barrierArrivals = arrivals; winnerIndex = statuses.indexOf(200);
    }
    const loserIndex = 1 - winnerIndex, loserRole = loserIndex ? 'manager2' : 'manager';
    row.httpStatuses = statuses; row.winnerRole = winnerIndex ? 'manager2' : 'manager';
    const { dialog, visibleUpperMs } = await verifyLoser(pages[loserIndex], loserRole, candidates[winnerIndex].employee_name, shift, observeStart);
    row.loserVisibleUpperMs = visibleUpperMs;
    const after = (await model('manager', shift)).cases.find(c => c.id === shift.case_id);
    if (after.status !== 'completed' || after.shift.employee_id !== candidates[winnerIndex].employee_id || after.applications.filter(a => a.status === 'approved').length !== 1 || after.applications.filter(a => a.status === 'closed_other_selected').length !== 2) throw Error('Final data disagrees with decision');
    row.finalOwner = after.shift.employee_name; row.applicationStatuses = after.applications.map(a => ({ id: a.id, employee: a.employee_name, status: a.status }));
    if (!index) {
      const p = pages[loserIndex];
      for (const width of [320, 390, 768, 1440]) for (const theme of ['light', 'dark']) {
        await p.setViewportSize({ width, height: 1000 });
        await p.evaluate(t => document.documentElement.dataset.theme = t, theme);
        // Theme colors transition for 150ms. Wait for the actual target color,
        // otherwise a dark-theme screenshot can retain a light button surface.
        await p.waitForFunction(() => {
          const d = document.querySelector('dialog');
          return getComputedStyle(d.querySelector('.sx-icon')).backgroundColor === getComputedStyle(d).backgroundColor;
        });
        await dialog.getByLabel(/Private manager note/).focus();
        const metrics = await dialog.evaluate(el => {
          const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255)
            .map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
            .reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
          return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, width: el.clientWidth, scrollWidth: el.scrollWidth,
            focusedNote: document.activeElement?.tagName === 'TEXTAREA', buttons: [...el.querySelectorAll('button')].map(b => {
              const s = getComputedStyle(b), fg = luminance(s.color), bg = luminance(s.backgroundColor);
              return { label: b.textContent.trim(), height: b.getBoundingClientRect().height, color: s.color, background: s.backgroundColor,
                contrast: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05) };
            }) };
        });
        if (metrics.documentWidth > width || metrics.scrollWidth > metrics.width || metrics.buttons.some(b => b.height < 44 || b.contrast < 4.5)) throw Error('Layout or contrast failed ' + JSON.stringify(metrics));
        const screenshot = `final-review-updated-${width}-${theme}.png`; await p.screenshot({ path: path.join(folder, screenshot) });
        report.layouts.push({ width, theme, metrics, screenshot });
      }
      await p.setViewportSize({ width: 390, height: 1000 });
      await p.evaluate(() => { document.documentElement.style.fontSize = '32px'; document.documentElement.dataset.theme = 'light'; });
      await p.waitForFunction(() => {
        const d = document.querySelector('dialog');
        return getComputedStyle(d.querySelector('.sx-icon')).backgroundColor === getComputedStyle(d).backgroundColor;
      });
      await dialog.getByRole('button', { name: 'View latest result' }).focus();
      const metrics = await dialog.evaluate(el => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, width: el.clientWidth, scrollWidth: el.scrollWidth, font: parseFloat(getComputedStyle(el.querySelector('.sx-assignment strong')).fontSize) }));
      if (metrics.documentWidth > 390 || metrics.scrollWidth > metrics.width || metrics.font < 28) throw Error('Text reflow failed');
      await p.screenshot({ path: path.join(folder, 'final-review-updated-390-text200.png') });
      report.layouts.push({ width: 390, textScale: 2, metrics, screenshot: 'final-review-updated-390-text200.png' });
    }
    await dialog.getByRole('button', { name: 'View latest result', exact: true }).focus();
    await pages[loserIndex].keyboard.press('Enter');
    await pages[loserIndex].waitForFunction(() => document.activeElement === document.querySelector('.sx-detail-heading h3'));
    row.keyboardResultFocus = true; row.draftPreserved = true;
    if (await pages[loserIndex].locator('.sx-detail .sx-assignment strong').first().textContent() !== row.finalOwner) throw Error('Latest result wrong');
    report.cases.push(row); await save(); console.log(JSON.stringify({ scenario: row.scenario, result: 'PASS' }));
    for (const p of pages) await p.close();
  }
  if (report.navigations !== 0) throw Error('Unexpected navigation');
  if (report.errors.length !== 1 || report.errors[0].status !== 409 || report.errors[0].method !== 'POST' || report.errors[0].path !== endpoint) throw Error('Unexpected API/browser errors');
  report.result = 'PASS';
} catch (error) { report.fatal = error.message; process.exitCode = 1; }
finally { await browser.close(); report.finishedAt = new Date().toISOString(); await save(); console.log(JSON.stringify({ result: report.result, fatal: report.fatal, cases: report.cases, layouts: report.layouts.length, errors: report.errors })); }
