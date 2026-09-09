/** A real stale POST reaches the API after a fixture job assignment expires. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.argv[2]);
const state = JSON.parse(await readFile(path.join(root, 'supabase/.temp/shift-exchange-eligibility-role.json'), 'utf8'));
const final = process.argv.includes('--final');
const fixture = JSON.parse(await readFile(path.join(root, `supabase/.temp/shift-exchange-eligibility-error${final ? '-final' : ''}.json`), 'utf8'));
if (!state.eligibility_matrix_owned || fixture.workspace !== state.workspace) throw Error('Owned fixture required');
const folder = path.join(root, 'docs/rebuild/shift-hub-visual-proof-2026-09-07/eligibility-api');
await mkdir(folder, { recursive: true });
const report = { workspace: state.workspace, caseId: fixture.case_id, states: [], errors: [] };
const mutate = action => JSON.parse(execFileSync('python', ['-X', 'utf8', 'supabase/verification/shift_exchange_eligibility_error_local.py', action, ...(final ? ['--final'] : [])], { cwd: root, encoding: 'utf8' }));
const browser = await chromium.launch({ headless: true });
let blocked = false, responded = false;
try {
  const p = await browser.newPage({ viewport: { width: 390, height: 1000 } });
  p.on('pageerror', e => report.errors.push(e.message));
  await p.goto('http://localhost:5561/sign-in');
  await p.getByLabel('Email', { exact: true }).fill(state.users.manager.email);
  await p.getByLabel('Password', { exact: true }).fill(state.password);
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.waitForURL(u => u.pathname.startsWith('/app'));
  await p.goto(`http://localhost:5561/app/schedule/requests?tab=shift-changes&hub_view=ready&case=${fixture.case_id}&from=${fixture.date}&to=${fixture.date}`);
  await p.getByRole('button', { name: 'Review Eligibility Casey QA', exact: true }).click();
  await p.getByRole('button', { name: 'Approve transfer to Eligibility Casey QA', exact: true }).click();
  const dialog = p.getByRole('dialog');
  await dialog.getByLabel(/Private manager note/).fill('AT18 keep this unsent review note');
  const endpoint = `http://127.0.0.1:5560/v1/workspaces/${state.workspace}/shift-exchanges`;
  await p.route(endpoint, async route => {
    if (route.request().method() === 'POST' && route.request().postDataJSON().action === 'approve') {
      mutate('block'); blocked = true;
    }
    await route.continue();
  });
  const response = p.waitForResponse(r => r.url() === endpoint && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Confirm transfer to Eligibility Casey QA', exact: true }).click();
  const r = await response; responded = true;
  if (r.status() !== 409) throw Error('Stale final was not rejected');
  report.api = { status: r.status(), body: await r.json() };
  const expected = 'The receiving employee is not eligible for the full shift';
  await dialog.getByRole('alert').filter({ hasText: expected }).waitFor();
  report.visibleError = await dialog.getByRole('alert').filter({ hasText: expected }).innerText();
  if (report.visibleError !== expected) throw Error('Transport syntax reached UI');
  if (await dialog.getByLabel(/Private manager note/).inputValue() !== 'AT18 keep this unsent review note') throw Error('Draft lost');
  await p.waitForFunction(() => document.querySelector('dialog button[aria-label="Confirm transfer to Eligibility Casey QA"]')?.disabled);
  if (final) {
    await dialog.getByRole('heading', { name: 'Review needs updating', exact: true }).waitFor();
    if (await dialog.getByText(/This changes the published assignment immediately/).count()) throw Error('Stale approval promise remains');
    report.reviewSummaryUpdated = true;
  }
  for (const theme of ['light', 'dark']) {
    await p.evaluate(t => document.documentElement.dataset.theme = t, theme);
    await p.waitForTimeout(200);
    await dialog.getByRole('alert').filter({ hasText: expected }).scrollIntoViewIfNeeded();
    const metrics = await dialog.evaluate(el => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, width: el.clientWidth, scrollWidth: el.scrollWidth }));
    if (metrics.documentWidth > 390 || metrics.scrollWidth > metrics.width) throw Error('Error view overflow');
    const screenshot = (final ? 'final-' : '') + 'stale-eligibility-' + theme + '.png'; await p.screenshot({ path: path.join(folder, screenshot) });
    report.states.push({ theme, metrics, screenshot });
  }
  report.draftPreserved = true; report.confirmDisabled = true;
  report.result = 'PASS';
} catch (error) { report.fatal = error.message; process.exitCode = 1; }
finally {
  await browser.close();
  if (blocked && responded) { report.restore = mutate('restore'); report.data = mutate('verify'); }
  else if (blocked) report.needsRecovery = true;
  await writeFile(path.join(folder, final ? 'browser-final.json' : 'browser.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
