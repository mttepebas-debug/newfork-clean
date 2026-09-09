/** Real local browser sessions. No auth injection, request mocks, or fake clocks.
 * node this-file PLAYWRIGHT_PACKAGE_DIRECTORY
 * stdin: inspect, sample, run30, reconnect, capture, close
 * Optional --no-realtime closes only real-time websocket attempts; HTTP stays real.
 * Report contains only QA identifiers/timing, never credentials or access tokens.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const apiOrigin = process.argv.includes('--stable-runtime') ? 'http://127.0.0.1:5560' : 'http://127.0.0.1:5556';
const webOrigin = process.argv.includes('--stable-runtime') ? 'http://localhost:5561' : 'http://localhost:5555';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const state = JSON.parse(await readFile(path.join(root, 'supabase/.temp/shift-exchange-role.json'), 'utf8'));
const fixture = JSON.parse(await readFile(path.join(root, 'supabase/.temp/shift-exchange-multisurface.json'), 'utf8'));
if (!state.exchange_fixture || fixture.workspace !== state.workspace || state.name !== `Line Up role verification ${state.workspace}`) throw Error('Owned local QA fixture required');
const reportPath = path.join(root, `supabase/.temp/shift-exchange-multisurface-browser-${Date.now()}.json`);
console.log(JSON.stringify({ reportPath }));
const report = { startedAt: new Date().toISOString(), workspace: state.workspace, sessions: [], samples: [], errors: [], diagnostics: [], commandFailures: [] };
report.runtime = { apiOrigin, webOrigin, stableBuild: process.argv.includes('--stable-runtime') };
report.realtimeBlocked = process.argv.includes('--no-realtime');
const save = () => writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
const browser = await chromium.launch({ headless: true });
const contexts = {};
const tokens = {};
const surfaces = [];
const pages = [];
let historyCaseId;
const personNames = { [state.employee_a]: 'Alex Morgan', [state.employee_b]: 'Blake QA' };
const locationNames = { [state.location_a]: 'QA Dining', [state.location_b]: 'QA Patio' };
const roleForPerson = (id) => id === state.employee_a ? 'employee' : id === state.employee_b ? 'blake' : (() => { throw Error('Unexpected owner'); })();

async function request(role, url, body) {
  if (!url.startsWith(`${apiOrigin}/`)) throw Error('Local API only');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${tokens[role]}`, 'X-Newfork-Workspace-Id': state.workspace,
      ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() } : {}) },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(25000),
  });
  const result = await response.json();
  if (!response.ok) throw Error(`Local API ${new URL(url).pathname}: ${response.status}: ${JSON.stringify(result)}`);
  return result;
}
const exchange = (role, query = '', body) => request(role, `${apiOrigin}/v1/workspaces/${state.workspace}/shift-exchanges${query}`, body);
const lineup = (shift) => request('manager', `${apiOrigin}/schedule/lineups?date=${shift.date}&location_ids=${shift.location_id}`);
async function owners() {
  return Promise.all(fixture.shifts.map(async shift => {
    const model = await lineup(shift);
    const rows = model.locations.flatMap(l => l.entries).filter(e => e.source_shift_id === shift.id || e.id === shift.id);
    if (rows.length !== 1) throw Error('Expected one live assignment for the owned shift');
    return rows[0].employee_id;
  }));
}
async function versions() {
  return Promise.all(fixture.shifts.map(async shift => {
    const data = await request('employee', `${apiOrigin}/schedule/lineups/published?from=${shift.date}&to=${shift.date}`);
    const snapshot = data.find(item => item.location_id === shift.location_id && item.date === shift.date);
    if (!snapshot) throw Error('Expected the current personal snapshot in the owned shared scope');
    return snapshot.version;
  }));
}

function observePage(page, name) {
  pages.push({ page, name });
  page.on('pageerror', error => report.errors.push({ surface: name, kind: 'pageerror', at: Date.now(), message: error.message }));
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) report.diagnostics.push({ surface: name, navigatedAt: Date.now(), path: new URL(frame.url()).pathname });
  });
  page.on('response', response => {
    if (response.url().startsWith(`${apiOrigin}/`) && response.status() >= 400)
      report.errors.push({ surface: name, kind: 'http', at: Date.now(), path: new URL(response.url()).pathname, status: response.status() });
  });
  page.on('websocket', socket => {
    socket.on('framereceived', frame => {
      // Never retain auth/control payloads. Keep only application invalidation timestamps.
      const value = typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8');
      if (value.includes('changed') && value.includes(state.workspace))
        report.diagnostics.push({ surface: name, changedAt: Date.now() });
    });
  });
}

async function signIn(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  contexts[role] = context;
  if (report.realtimeBlocked) {
    await context.routeWebSocket(/\/realtime\//, async socket => {
      report.diagnostics.push({ role, realtimeBlockedAt: Date.now() });
      await socket.close({ code: 1001, reason: 'Owned local fallback verification' });
    });
  }
  const page = await context.newPage();
  observePage(page, `${role}-auth`);
  await page.goto(`${webOrigin}/sign-in`);
  await page.getByLabel('Email', { exact: true }).fill(state.users[role].email);
  await page.getByLabel('Password', { exact: true }).fill(state.password);
  const authResponse = page.waitForResponse(response => response.url().includes('/auth/v1/token?grant_type=password') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const response = await authResponse;
  if (!response.ok()) throw Error(`QA ${role} sign-in failed`);
  tokens[role] = (await response.json()).access_token;
  await page.waitForURL(url => url.pathname.startsWith('/app'), { timeout: 25000 });
  const ctx = await request(role, `${apiOrigin}/v1/context`);
  if (ctx.workspace?.id !== state.workspace) throw Error(`QA ${role} workspace mismatch`);
  report.sessions.push({ role, auth: 'normal UI password sign-in', workspace: ctx.workspace.id });
  await page.close();
  console.log(JSON.stringify({ signedIn: role }));
}

async function openSurface(role, kind, shiftIndex) {
  const shift = fixture.shifts[shiftIndex];
  const page = await contexts[role].newPage();
  const name = `${role}-${kind}-${shift.date}`;
  observePage(page, name);
  const route = kind === 'manager-lineup'
    ? `/app/schedule/lineup?date=${shift.date}&location=${shift.location_id}`
    : kind === 'manager-schedule'
      ? `/app/schedule?date=${shift.week}&view=week&locations=${shift.location_id}`
      : kind === 'employee-team'
        ? `/app/employee-hub/my-team?date=${shift.date}`
      : kind === 'inbox'
        ? '/app/notifications'
      : kind === 'employee-lineup'
        ? `/app/employee-hub/lineup?date=${shift.date}`
        : `/app/employee-hub/schedule?date=${shift.date}&view=day`;
  await page.goto(`${webOrigin}${route}`);
  const surface = { page, role, kind, shiftIndex, name };
  surfaces.push(surface);
  await page.locator(kind === 'manager-lineup' ? '#lineup-title' : kind === 'manager-schedule' ? '[data-shift-badge="true"]' : kind === 'employee-team' ? '.team-day-groups' : kind === 'inbox' ? '.notifications-page' : kind === 'employee-lineup' ? '.lu-employee-dates' : '.hub-shift-list').first().waitFor({ timeout: 25000, state: 'attached' });
  if (await page.evaluate(() => document.visibilityState) !== 'visible') throw Error(`${name} not visible`);
}

function expectedFor(surface, expectedOwners, expectedVersions, caseId) {
  const owner = expectedOwners[surface.shiftIndex];
  const shift = fixture.shifts[surface.shiftIndex];
  return { kind: surface.kind, role: surface.role, caseId, sources: fixture.shifts.map(s => s.source_id), names: expectedOwners.map(id => personNames[id]), id: shift.id, sourceId: shift.source_id, owner, date: shift.date,
    location: locationNames[shift.location_id], version: expectedVersions?.[surface.shiftIndex],
    name: personNames[owner], hasShift: roleForPerson(owner) === surface.role };
}

// Executed in each real page. Observe DOM state; no mutation or cache access.
function visibleExpected(expected) {
  const visible = element => element && element.getClientRects().length > 0;
  if (expected.kind.startsWith('exchange-')) {
    const detail = document.querySelector('.sx-detail[aria-label="Request details"]');
    if (!visible(detail)) return false;
    if (expected.caseId && (!detail.textContent.includes('First shift') || detail.textContent.includes('You give'))) return false;
    return expected.sources.every((source, index) => {
      const row = detail.querySelector(`[data-assignment-source="${source}"]`);
      return visible(row) && row.dataset.publishedState === 'current' && row.querySelector('strong')?.textContent === expected.names[index];
    });
  }
  if (expected.kind === 'inbox') {
    if (!visible(document.querySelector('.notifications-page'))) return false;
    if (!expected.caseId) return true;
    const rows = [...document.querySelectorAll('.notifications-page article')].filter(row =>
      [...row.querySelectorAll('a[href]')].some(link => new URL(link.href).searchParams.get('case') === expected.caseId));
    return expected.role === 'manager' ? rows.length === 0 : rows.length === 1 && visible(rows[0]) && rows[0].querySelector('strong')?.textContent === 'Shift change approved';
  }
  if (expected.kind === 'employee-team') {
    const rows = [...document.querySelectorAll('[data-team-shift-id]')].filter(row => row.dataset.teamShiftId === expected.id);
    if (rows.length !== 1 || !visible(rows[0]) || rows[0].dataset.teamEmployeeId !== expected.owner) return false;
    const link = rows[0].querySelector('a[href*="offer="]');
    return expected.hasShift ? visible(link) && new URL(link.href).searchParams.get('offer') === expected.id : !link;
  }
  if (expected.kind === 'manager-lineup') {
    return [...document.querySelectorAll('button[aria-label]')].some(e =>
      e.getAttribute('aria-label') === `Manage ${expected.name}` && visible(e));
  }
  if (expected.kind === 'manager-schedule') {
    return [...document.querySelectorAll('[data-shift-badge="true"]')].some(e =>
      [expected.id, expected.sourceId].includes(e.getAttribute('data-shift-id')) &&
      e.getAttribute('data-schedule-row-key') === expected.owner && visible(e));
  }
  if (expected.kind === 'employee-lineup') {
    const cards = [...document.querySelectorAll('.lu-employee-plan')].filter(card => {
      const header = card.querySelector('header')?.textContent ?? '';
      return header.includes(expected.date) && header.includes(expected.location);
    });
    if (cards.length !== 1 || !visible(cards[0])) return false;
    if (expected.version && cards[0].querySelector('.lu-badge')?.textContent !== `v${expected.version}`) return false;
    const assignments = cards[0].querySelectorAll('.lu-personal-assignment');
    return expected.hasShift ? assignments.length === 1 : assignments.length === 0 && cards[0].textContent.includes('Your previous assignment has changed');
  }
  const entry = document.getElementById(`shift-${expected.id}`);
  const loaded = document.querySelector('.hub-shift-list');
  return Boolean(loaded && (expected.hasShift ? visible(entry) : !entry));
}

async function waitSurfaces(expectedOwners, timeout = 20000, expectedVersions, caseId) {
  return Promise.all(surfaces.map(async surface => {
    await surface.page.waitForFunction(visibleExpected, expectedFor(surface, expectedOwners, expectedVersions, caseId), { timeout, polling: 'raf' });
    return { surface: surface.name, observedAt: Date.now() };
  }));
}

function exchangeRoute(role, caseId) {
  const base = role === 'manager' ? '/app/schedule/requests?tab=shift-changes&' : '/app/employee-hub/shift-hub?';
  return `${webOrigin}${base}case=${caseId}&from=${fixture.shifts[0].date}&to=${fixture.shifts[1].date}&hub_view=history`;
}

async function openExchangeDetails() {
  const model = await exchange('manager', `?view=manager&from=${fixture.shifts[0].date}&to=${fixture.shifts[1].date}`);
  historyCaseId = model.cases.find(c => c.status === 'completed' && c.kind === 'swap' && c.shift.source_id === fixture.shifts[0].source_id && c.requested_shift?.source_id === fixture.shifts[1].source_id)?.id;
  if (!historyCaseId) throw Error('Owned completed swap is required for historical assignment checks');
  for (const role of ['manager', 'employee', 'blake']) for (const kind of ['exchange-history', 'exchange-pending']) {
    const page = await contexts[role].newPage();
    const name = `${role}-${kind}`;
    observePage(page, name);
    page.on('requestfinished', request => {
      if (!request.url().startsWith(apiOrigin) || !new URL(request.url()).pathname.endsWith('/shift-exchanges')) return;
      const timing = request.timing();
      report.diagnostics.push({ surface: name, readFinishedAt: Date.now(), httpMs: timing.responseEnd, method: request.method() });
    });
    await page.goto(exchangeRoute(role, historyCaseId));
    await page.locator('.sx-detail[aria-label="Request details"]').waitFor({ timeout: 25000 });
    if (await page.evaluate(() => document.visibilityState) !== 'visible') throw Error(`${name} not visible`);
    surfaces.push({ page, role, kind, name, shiftIndex: 0 });
  }
}

async function sample(mode = report.realtimeBlocked ? 'fallback' : 'healthy') {
  const before = await owners();
  const beforeVersions = await versions();
  const giver = roleForPerson(before[0]);
  const receiver = roleForPerson(before[1]);
  if (giver === receiver) throw Error('Two independent owners required');
  await waitSurfaces(before, 20000, beforeVersions);
  const note = 'AT32/G07 two-week two-location live browser verification';
  const existing = (await exchange('manager', `?view=manager&from=${fixture.shifts[0].date}&to=${fixture.shifts[1].date}`)).cases.filter(c =>
    c.status === 'open' && c.shift.id === fixture.shifts[0].id);
  if (existing.length > 1 || (existing[0] && (existing[0].kind !== 'swap' || existing[0].requested_shift?.id !== fixture.shifts[1].id || existing[0].owner_id !== before[0] || existing[0].private_note !== note)))
    throw Error('Refuse to resume an ambiguous or unrelated exchange');
  const created = existing[0] ? { case_id: existing[0].id } : await exchange(giver, '', { action: 'create', kind: 'swap', shift_id: fixture.shifts[0].id,
    requested_shift_id: fixture.shifts[1].id, note });
  const query = `?case_id=${created.case_id}&from=${fixture.shifts[0].date}&to=${fixture.shifts[1].date}`;
  const invited = (await exchange(receiver, query)).cases.find(c => c.id === created.case_id);
  if (!invited || invited.applications.length !== 1) throw Error('Expected one real swap invitation');
  if (invited.applications[0].status === 'invited') {
    await exchange(receiver, '', { action: 'accept', case_id: invited.id, application_id: invited.applications[0].id, expected_revision: invited.revision });
  } else if (invited.applications[0].status !== 'pending_manager') throw Error('Expected a pending consent or manager decision');
  const accepted = (await exchange('manager', `${query}&view=manager`)).cases.find(c => c.id === created.case_id);
  for (const surface of surfaces.filter(s => s.kind === 'exchange-pending')) {
    await surface.page.goto(exchangeRoute(surface.role, accepted.id).replace('hub_view=history', surface.role === 'manager' ? 'hub_view=ready' : 'hub_view=requests'));
    await surface.page.locator('.sx-detail[aria-label="Request details"]').waitFor({ timeout: 25000 });
    await surface.page.waitForFunction(visibleExpected, expectedFor(surface, before), { timeout: 20000 });
  }
  const preview = await exchange('manager', `?case_id=${accepted.id}&application_id=${accepted.applications[0].id}`);
  if (!preview.allowed || preview.requires_other_manager) throw Error(`Current manager preview blocked: ${JSON.stringify(preview)}`);
  if (JSON.stringify(await owners()) !== JSON.stringify(before)) throw Error('Ownership changed before manager approval');
  const managerInbox = surfaces.find(surface => surface.role === 'manager' && surface.kind === 'inbox');
  if (managerInbox) {
    // Prevent a vacuous approval check: the manager's actionable case must first
    // exist in this already-open inbox, before its later disappearance is timed.
    await managerInbox.page.locator(`.notifications-page article:has(a[href*="case=${created.case_id}"])`).waitFor({ timeout: report.realtimeBlocked ? 70000 : 10000 });
  }
  const expected = [before[1], before[0]];
  const expectedVersions = beforeVersions.map(version => version + 1);
  const measurement = { mode, managerReviewVisibleBeforeApproval: Boolean(managerInbox), resumedCase: Boolean(existing[0]), caseId: created.case_id, before, expected, beforeVersions, expectedVersions, startedAt: Date.now(), observations: [] };
  report.samples.push(measurement);
  await save();
  const inboxBeforeOffline = mode === 'reconnect' ? await Promise.all(surfaces.filter(surface => surface.kind === 'inbox').map(async surface => ({
    surface, text: await surface.page.locator(`.notifications-page article:has(a[href*="case=${created.case_id}"])`).allTextContents(),
  }))) : [];
  if (mode === 'reconnect') {
    await Promise.all(Object.values(contexts).map(context => context.setOffline(true)));
    measurement.offlineAt = Date.now();
    for (const surface of surfaces) {
      if (await surface.page.evaluate(() => navigator.onLine)) throw Error('Browser did not enter offline state');
    }
  }
  // Arm all observers before sending the decision. Use command start as a
  // conservative upper bound for commit-to-visible, not response-end timing.
  const observing = waitSurfaces(expected, 70000, expectedVersions, created.case_id);
  observing.catch(() => {});
  try {
    measurement.startedAt = Date.now();
    measurement.decision = await exchange('manager', '', { action: 'approve', case_id: accepted.id,
      application_id: accepted.applications[0].id, expected_revision: accepted.revision, fingerprint: preview.fingerprint });
    measurement.responseAt = Date.now();
    if (mode === 'reconnect') {
      await new Promise(resolve => setTimeout(resolve, 1200));
      const offlineStillBefore = await Promise.all(surfaces.map(surface => surface.page.evaluate(visibleExpected, expectedFor(surface, before))));
      if (!offlineStillBefore.every(Boolean)) throw Error('Offline view claimed a new assignment without receiving current data');
      measurement.offlineOwnerPreserved = true;
      for (const { surface, text } of inboxBeforeOffline) {
        const current = await surface.page.locator(`.notifications-page article:has(a[href*="case=${created.case_id}"])`).allTextContents();
        if (JSON.stringify(current) !== JSON.stringify(text)) throw Error('Offline inbox changed without receiving current data');
      }
      measurement.offlineInboxPreserved = inboxBeforeOffline.length > 0;
      measurement.reconnectStartedAt = Date.now();
      await Promise.all(Object.values(contexts).map(context => context.setOffline(false)));
    }
    measurement.observations = await observing;
    measurement.visibleUpperBoundMs = Math.max(...measurement.observations.map(o => o.observedAt)) - measurement.startedAt;
    measurement.after = await owners();
    measurement.afterVersions = await versions();
    if (JSON.stringify(measurement.afterVersions) !== JSON.stringify(expectedVersions)) throw Error('Snapshot version mismatch');
    if (mode === 'reconnect') measurement.reconnectUpperBoundMs = Math.max(...measurement.observations.map(o => o.observedAt)) - measurement.reconnectStartedAt;
    if (JSON.stringify(measurement.after) !== JSON.stringify(expected)) throw Error('Final owner mismatch');
    measurement.result = 'PASS';
  } catch (error) {
    measurement.result = 'FAIL';
    measurement.error = error.message;
    throw error;
  } finally {
    if (mode === 'reconnect') await Promise.all(Object.values(contexts).map(context => context.setOffline(false)));
    await save();
    console.log(JSON.stringify({ sample: report.samples.length, mode, result: measurement.result, visibleUpperBoundMs: measurement.visibleUpperBoundMs, reconnectUpperBoundMs: measurement.reconnectUpperBoundMs, caseId: created.case_id }));
  }
}

async function capture() {
  const directory = path.join(root, 'docs/rebuild/shift-hub-visual-proof-2026-09-07/multisurface');
  await mkdir(directory, { recursive: true });
  report.screenshots = [];
  for (const surface of surfaces.filter(s => s.kind === 'inbox' || s.kind === 'manager-lineup' || (s.role === 'employee' && ['employee-schedule', 'employee-lineup'].includes(s.kind)))) {
    const target = path.join(directory, `${surface.name}-${Date.now()}.png`);
    await surface.page.screenshot({ path: target, fullPage: true });
    report.screenshots.push(target);
  }
  await save();
  console.log(JSON.stringify({ screenshots: report.screenshots }));
}

async function inspect() {
  const currentOwners = await owners();
  const details = await Promise.all(surfaces.map(async surface => ({
    name: surface.name, url: surface.page.url(), visible: await surface.page.evaluate(visibleExpected, expectedFor(surface, currentOwners)),
    badges: surface.kind === 'manager-schedule' ? await surface.page.locator('[data-shift-badge="true"]').evaluateAll(nodes => nodes.slice(0, 12).map(e => ({ id: e.getAttribute('data-shift-id'), row: e.getAttribute('data-schedule-row-key'), label: e.getAttribute('aria-label') }))) : undefined,
    text: (await surface.page.locator('body').innerText()).slice(-1800),
  })));
  report.inspection = details;
  await save();
  console.log(JSON.stringify({ currentOwners, surfaces: details.map(d => ({ name: d.name, visible: d.visible })), errors: report.errors }));
}

async function styleAudit() {
  const candidates = surfaces.filter(s => s.role === 'employee' && s.kind === 'employee-schedule');
  let chosen;
  for (const surface of candidates) if (await surface.page.locator('.hub-exchange-link').count()) chosen = surface;
  if (!chosen) throw Error('Expected one owned employee shift action');
  const { page } = chosen;
  const shift = fixture.shifts[chosen.shiftIndex];
  const directory = path.join(root, 'docs/rebuild/shift-hub-visual-proof-2026-09-07/multisurface');
  await mkdir(directory, { recursive: true });
  const previousTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  report.actionStyle = { themeMethod: 'controlled root theme attribute; preference UI is not tested', states: [] };
  try {
    for (const width of [320, 390, 1440]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const link = page.getByRole('link', { name: 'Find cover or swap', exact: true });
      await link.scrollIntoViewIfNeeded();
      await page.keyboard.press('Tab');
      await link.focus();
      const metrics = await link.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { width: rect.width, height: rect.height, left: rect.left, right: rect.right,
          viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          color: style.color, background: style.backgroundColor,
          outline: style.outlineStyle, outlineWidth: style.outlineWidth,
          focused: document.activeElement === element, href: element.getAttribute('href') };
      });
      if (metrics.height < 44 || metrics.left < 0 || metrics.right > width + 1 || metrics.scrollWidth > width + 1 || !metrics.focused || metrics.outline === 'none')
        throw Error(`Action layout/focus failed: ${JSON.stringify({ width, theme, metrics })}`);
      const screenshot = path.join(directory, `schedule-cover-action-${width}-${theme}-${Date.now()}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      report.actionStyle.states.push({ width, theme, metrics, screenshot });
    }
    await page.getByRole('link', { name: 'Find cover or swap', exact: true }).press('Enter');
    await page.waitForURL(url => url.pathname === '/app/employee-hub/shift-hub' && url.searchParams.get('offer') === shift.id && url.searchParams.get('from') === shift.date);
    await page.getByRole('dialog').waitFor();
    report.actionStyle.destination = { url: page.url(), dialog: await page.getByRole('dialog').innerText() };
    await save();
    console.log(JSON.stringify({ actionStyle: report.actionStyle }));
  } finally {
    await page.evaluate(value => {
      if (value === undefined) delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = value;
    }, previousTheme);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
}

async function lineupControlsAudit() {
  const surface = surfaces.find(s => s.role === 'employee' && s.kind === 'employee-lineup' && s.shiftIndex === 1);
  if (!surface) throw Error('Use --include-employee-lineup for this audit');
  const { page } = surface;
  const first = fixture.shifts[0].date;
  const original = fixture.shifts[1].date;
  const directory = path.join(root, 'docs/rebuild/shift-hub-visual-proof-2026-09-07/employee-lineup-dates');
  await mkdir(directory, { recursive: true });
  const previousTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  report.lineupControls = { themeMethod: 'controlled root theme attribute; preference UI is not tested', states: [] };
  let receiptCalls = 0;
  const trackReceipt = req => {
    if (req.method() === 'POST' && new URL(req.url()).pathname.endsWith('/receipt')) receiptCalls++;
  };
  page.on('request', trackReceipt);
  try {
    for (const width of [320, 390, 768, 1440]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const form = page.getByRole('form', { name: 'Choose Line Up date' });
      const submit = form.getByRole('button', { name: 'Show day', exact: true });
      await submit.scrollIntoViewIfNeeded();
      await page.keyboard.press('Tab');
      await submit.focus();
      const metrics = await form.evaluate(element => ({
        viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        controls: [...element.querySelectorAll('input,button')].map(control => {
          const r = control.getBoundingClientRect();
          return { tag: control.tagName, text: control.textContent, width: r.width, height: r.height,
            left: r.left, right: r.right, focused: document.activeElement === control,
            outline: getComputedStyle(control).outlineStyle };
        }),
      }));
      if (metrics.scrollWidth > width + 1 || metrics.controls.some(c => c.height < 44 || c.left < 0 || c.right > width + 1))
        throw Error(`Line Up date controls overflow: ${JSON.stringify({ width, theme, metrics })}`);
      if (!metrics.controls.some(c => c.focused && c.outline !== 'none')) throw Error('Missing keyboard focus');
      const screenshot = path.join(directory, `date-controls-${width}-${theme}-${Date.now()}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      report.lineupControls.states.push({ width, theme, metrics, screenshot });
    }
    await page.getByLabel('Line Up date', { exact: true }).fill(first);
    if (new URL(page.url()).searchParams.get('date') !== original) throw Error('Typing applied a date prematurely');
    await page.getByRole('button', { name: 'Show day', exact: true }).press('Enter');
    await page.waitForURL(url => url.searchParams.get('date') === first);
    await page.locator('.lu-employee-plan').filter({ hasText: first }).first().waitFor();
    if (!await page.getByRole('button', { name: 'Show day', exact: true }).evaluate(element => document.activeElement === element))
      throw Error('Applying a date lost the action focus');
    await page.getByRole('button', { name: 'Upcoming', exact: true }).click();
    await page.waitForURL(url => !url.searchParams.has('date'));
    await page.goBack();
    await page.waitForURL(url => url.searchParams.get('date') === first);
    await page.waitForFunction(day => document.querySelector('.lu-employee-dates input')?.value === day, first, { timeout: 5000 });
    if (await page.getByLabel('Line Up date', { exact: true }).inputValue() !== first) throw Error('Browser back did not restore selected date');
    const scheduleLink = page.getByRole('navigation', { name: 'Employee Hub', exact: true }).getByRole('link', { name: 'Schedule', exact: true });
    if (await scheduleLink.getAttribute('href') !== `/app/employee-hub/schedule?date=${first}&view=day`) throw Error('Schedule navigation lost the selected day');
    await scheduleLink.click();
    await page.waitForURL(url => url.pathname === '/app/employee-hub/schedule' && url.searchParams.get('date') === first);
    await page.getByRole('navigation', { name: 'Employee Hub', exact: true }).getByRole('link', { name: 'Line-up', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/app/employee-hub/lineup' && url.searchParams.get('date') === first);
    if (receiptCalls !== 0) throw Error('Date navigation submitted a receipt');
    report.lineupControls.navigation = { appliedDay: first, upcomingAndBrowserBack: true, scheduleRoundTripPreservesDay: true, receiptCalls };
    await save();
    console.log(JSON.stringify({ lineupControls: report.lineupControls }));
  } catch (error) {
    report.lineupControls.failure = { message: error.message, url: page.url(), date: await page.getByLabel('Line Up date', { exact: true }).inputValue(), dateAttribute: await page.getByLabel('Line Up date', { exact: true }).getAttribute('value'), form: await page.locator('.lu-employee-dates').innerText() };
    await save();
    throw error;
  } finally {
    page.off('request', trackReceipt);
    await page.evaluate(value => {
      if (value === undefined) delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = value;
    }, previousTheme);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${webOrigin}/app/employee-hub/lineup?date=${original}`);
  }
}

try {
  for (const role of ['manager', 'employee', 'blake']) await signIn(role);
  for (let index = 0; index < (process.argv.includes('--notification-details') ? 0 : 2); index++) {
    await openSurface('manager', 'manager-lineup', index);
    await openSurface('manager', 'manager-schedule', index);
    await openSurface('employee', 'employee-schedule', index);
    await openSurface('blake', 'employee-schedule', index);
    if (process.argv.includes('--include-team')) {
      await openSurface('employee', 'employee-team', index);
      await openSurface('blake', 'employee-team', index);
    }
    if (process.argv.includes('--include-employee-lineup')) {
      await openSurface('employee', 'employee-lineup', index);
      await openSurface('blake', 'employee-lineup', index);
    }
  }
  if (process.argv.includes('--include-inbox') || process.argv.includes('--notification-details')) {
    for (const role of ['manager', 'employee', 'blake']) await openSurface(role, 'inbox', 0);
  }
  if (process.argv.includes('--include-exchange-details')) await openExchangeDetails();
  await inspect();
  if (process.argv.includes('--notification-details')) {
    const { auditNotificationDetails } = await import('./shift_exchange_notification_ui.mjs');
    await auditNotificationDetails({ root, fixture, surfaces, report, save, owners, versions, exchange, roleForPerson, personNames });
  } else if (process.argv.includes('--style-audit')) {
    await styleAudit();
  } else if (process.argv.includes('--lineup-controls')) {
    await lineupControlsAudit();
  } else {
  console.log('READY: inspect, sample, run30, reconnect, capture, close');
  for await (const line of createInterface({ input: process.stdin })) {
    const command = line.trim();
    try {
      if (command === 'close') break;
      if (command === 'inspect') await inspect();
      else if (command === 'capture') await capture();
      else if (command === 'sample') await sample();
      else if (command === 'reconnect') await sample('reconnect');
      else if (command === 'run30') for (let i = 0; i < 30; i++) await sample();
      else console.log('Unknown command');
    } catch (error) {
      report.commandFailures.push({ command, at: Date.now(), error: error.message });
      console.log(JSON.stringify({ command, error: error.message }));
      await save();
    }
  }
  }
} catch (error) {
  report.fatal = error.message;
  console.log(JSON.stringify({ fatal: error.message }));
  process.exitCode = 1;
} finally {
  report.closingAt = new Date().toISOString();
  await save();
  await browser.close();
  report.finishedAt = new Date().toISOString();
  await save();
  process.stdin.destroy();
}
