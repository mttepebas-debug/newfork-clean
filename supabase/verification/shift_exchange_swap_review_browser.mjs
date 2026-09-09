/** Real two-sided stale review; mutation is confined to owned QA job rows. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.argv[2]);
const state = JSON.parse(await readFile(path.join(root, 'supabase/.temp/shift-exchange-availability-swap-v2-role.json'), 'utf8'));
const final = process.argv.includes('--final');
const fixture = JSON.parse(await readFile(path.join(root, `supabase/.temp/shift-exchange-swap-review${final ? '-final' : ''}.json`), 'utf8'));
if (!state.availability_matrix_owned || fixture.workspace !== state.workspace) throw Error('Owned fixture required');
const folder = path.join(root, 'docs/rebuild/shift-hub-visual-proof-2026-09-07/availability-swap');
await mkdir(folder, { recursive: true });
const report = { workspace: state.workspace, case: fixture.case, states: [], errors: [] };
const mutate = action => JSON.parse(execFileSync('python', ['-X', 'utf8', 'supabase/verification/shift_exchange_swap_review_local.py', action, ...(final ? ['--final'] : [])], { cwd: root, encoding: 'utf8' }));
const browser = await chromium.launch({ headless: true });
let blocked = false;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto('http://localhost:5561/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(state.users.manager.email);
  await page.getByLabel('Password', { exact: true }).fill(state.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname.startsWith('/app'));
  await page.goto(`http://localhost:5561/app/schedule/requests?tab=shift-changes&hub_view=ready&case=${fixture.case}&from=2026-09-01&to=${fixture.date}`);
  await page.getByRole('button', { name: 'Review Availability Casey QA', exact: true }).click();
  await page.getByRole('button', { name: 'Approve transfer to Availability Casey QA', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Private manager note/).fill('Keep my unsent two-sided review note');
  const endpoint = `http://127.0.0.1:5560/v1/workspaces/${state.workspace}/shift-exchanges`;
  await page.route(endpoint, async route => {
    if (route.request().method() === 'POST' && route.request().postDataJSON().action === 'approve') {
      mutate('block'); blocked = true;
    }
    await route.continue();
  });
  const response = page.waitForResponse(r => r.url() === endpoint && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Confirm transfer to Availability Casey QA', exact: true }).click();
  const result = await response;
  if (result.status() !== 409) throw Error('Stale final must fail');
  report.api = { status: result.status(), body: await result.json() };
  await dialog.getByRole('heading', { name: 'Review needs updating', exact: true }).waitFor();
  if (final) {
    await dialog.getByText('Offered shift', { exact: true }).waitFor();
    await dialog.getByText('Requested shift', { exact: true }).waitFor();
    report.bothShiftDetailsVisible = true;
  }
  for (const name of ['Availability Casey QA', 'Lineup QA A']) {
    const region = dialog.getByRole('region', { name: `${name} eligibility`, exact: true });
    await region.getByText('Position assignment must cover the full shift', { exact: true }).waitFor();
  }
  if (await dialog.getByLabel(/Private manager note/).inputValue() !== 'Keep my unsent two-sided review note') throw Error('Review note lost');
  if (!await dialog.getByRole('button', { name: 'Confirm transfer to Availability Casey QA', exact: true }).isDisabled()) throw Error('Approval remained enabled');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      await page.waitForTimeout(200);
      await dialog.getByRole('heading', { name: 'Review needs updating' }).scrollIntoViewIfNeeded();
      const metrics = await dialog.evaluate(el => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, width: el.clientWidth, scrollWidth: el.scrollWidth }));
      if (metrics.documentWidth > width || metrics.scrollWidth > metrics.width) throw Error('Review overflow');
      const screenshot = `${final ? 'final-' : ''}two-sided-${width}-${theme}.png`;
      await page.screenshot({ path: path.join(folder, screenshot) });
      report.states.push({ width, theme, metrics, screenshot });
    }
  }
  if (report.errors.length) throw Error('Unexpected page error');
  report.result = 'PASS'; report.bothReasonsVisible = true; report.notePreserved = true; report.confirmDisabled = true;
} catch (error) { report.fatal = error.message; process.exitCode = 1; }
finally {
  await browser.close();
  if (blocked) report.restore = mutate('restore');
  // Normal close preserves the audit even after a browser assertion failure.
  if (blocked) report.data = mutate('verify');
  await writeFile(path.join(folder, final ? 'browser-final.json' : 'browser.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
