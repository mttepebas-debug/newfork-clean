/** Read-only real employee/manager views of completed two-zone swaps. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.argv[2]);
const state = JSON.parse(await readFile(path.join(root, 'supabase/.temp/shift-exchange-zones-role.json'), 'utf8'));
const fixture = JSON.parse(await readFile(path.join(root, 'supabase/.temp/shift-exchange-zones-api.json'), 'utf8'));
if (!state.availability_matrix_owned || fixture.workspace !== state.workspace || fixture.result !== 'PASS') throw Error('Completed owned fixture required');
const folder = path.join(root, 'docs/rebuild/shift-hub-visual-proof-2026-09-07/timezone-swaps');
await mkdir(folder, { recursive: true });
const report = { workspace: state.workspace, states: [], errors: [], sessions: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const role of ['manager', 'employee', 'casey']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto('http://localhost:5561/sign-in');
    await page.getByLabel('Email', { exact: true }).fill(state.users[role].email);
    await page.getByLabel('Password', { exact: true }).fill(state.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(url => url.pathname.startsWith('/app'));
    report.sessions.push({ role, entry: 'normal UI password login' });
    for (const [index, row] of fixture.swaps.entries()) {
      const route = role === 'manager' ? '/app/schedule/requests?tab=shift-changes&' : '/app/employee-hub/shift-hub?';
      await page.goto(`http://localhost:5561${route}hub_view=history&case=${row.case}&from=${row.offered.day}&to=${row.requested.day}`);
      const detail = page.locator('.sx-detail');
      await detail.getByText('Swap approved', { exact: true }).waitFor();
      // Source attributes remain canonical across a change of employee.
      await detail.locator(`[data-assignment-source="${row.offered.source}"]`).getByText('Availability Casey QA', { exact: true }).waitFor();
      await detail.locator(`[data-assignment-source="${row.requested.source}"]`).getByText('Lineup QA A', { exact: true }).waitFor();
      if (await detail.locator('.sx-zone').filter({ hasText: 'America/Los Angeles' }).count() !== 1) throw Error('Offered saved timezone missing');
      if (await detail.locator('.sx-zone').filter({ hasText: 'America/New York' }).count() !== 1) throw Error('Requested saved timezone missing');
      const overnightLabels = await detail.getByText(/Ends next day/).count();
      if (overnightLabels !== (index === 1 ? 2 : 0)) throw Error('Next-day label uses UTC rather than each saved timezone');
      const hours = await detail.getByText(/4 scheduled hours/).count();
      if (hours !== 2) throw Error('Two physical four-hour ranges expected');
      for (const [width, theme] of [[390, 'light'], [1440, 'dark']]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
        await page.waitForTimeout(200);
        await detail.locator('.sx-shift').first().scrollIntoViewIfNeeded();
        const metrics = await detail.evaluate(el => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, width: el.clientWidth, scrollWidth: el.scrollWidth }));
        if (metrics.documentWidth > width || metrics.scrollWidth > metrics.width) throw Error('Two-zone swap overflow');
        const screenshot = `${role}-${index}-${width}-${theme}.png`;
        await page.screenshot({ path: path.join(folder, screenshot) });
        report.states.push({ role, scenario: row.label, width, theme, nextDayLabels: overnightLabels, correctOwners: true, metrics, screenshot });
      }
    }
    await context.close();
  }
  if (report.errors.length) throw Error('Unexpected page errors');
  report.result = 'PASS';
} catch (error) { report.fatal = error.message; process.exitCode = 1; }
finally {
  await browser.close();
  await writeFile(path.join(folder, 'browser.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
