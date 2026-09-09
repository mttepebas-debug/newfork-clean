/** Read-only rendering of the four real completed DST transfers, two roles. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.argv[2]);
const state = JSON.parse(await readFile(path.join(root, 'supabase/.temp/shift-exchange-dst-role.json'), 'utf8'));
const fixture = JSON.parse(await readFile(path.join(root, 'supabase/.temp/shift-exchange-dst-api.json'), 'utf8'));
if (!state.availability_matrix_owned || fixture.workspace !== state.workspace || fixture.result !== 'PASS') throw Error('Completed owned fixture required');
const folder = path.join(root, 'docs/rebuild/shift-hub-visual-proof-2026-09-07/clock-details');
await mkdir(folder, { recursive: true });
const report = { workspace: state.workspace, states: [], errors: [], sessions: [] };
const browser = await chromium.launch({ headless: true });
const final = process.argv.includes('--final');
const expected = [
  ['12:30 AM UTC-07:00', '2:30 AM UTC-08:00'],
  ['1:30 AM UTC-08:00', '3:30 AM UTC-07:00'],
  [final ? '1:30 AM UTC-08:00 · Second occurrence' : '1:30 AM UTC-08:00', '2:30 AM UTC-08:00'],
  [],
];
try {
  for (const role of ['manager', 'casey']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto('http://localhost:5561/sign-in');
    await page.getByLabel('Email', { exact: true }).fill(state.users[role].email);
    await page.getByLabel('Password', { exact: true }).fill(state.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(url => url.pathname.startsWith('/app'));
    report.sessions.push({ role, entry: 'normal UI password login' });
    for (const [index, row] of fixture.rows.entries()) {
      const route = role === 'manager' ? '/app/schedule/requests?tab=shift-changes&' : '/app/employee-hub/shift-hub?';
      await page.goto(`http://localhost:5561${route}hub_view=history&case=${row.case}&from=${row.day}&to=${row.day}`);
      const detail = page.locator('.sx-detail');
      await detail.getByText(new RegExp(`\\b${row.hours} scheduled hours?\\b`)).waitFor();
      for (const text of expected[index]) await detail.getByText(text, { exact: true }).waitFor();
      if (index === 2) await detail.getByText(/uses a repeated clock time/).waitFor();
      if (index === 3) {
        await detail.getByText(/Ends next day/).waitFor();
        if (await detail.locator('.sx-clock-detail').count()) throw Error('Ordinary overnight has false clock warning');
      }
      await detail.getByText('Availability Casey QA', { exact: true }).first().waitFor();
      for (const [width, theme] of [[390, 'light'], [1440, 'dark']]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
        await page.waitForTimeout(200);
        await detail.locator('.sx-shift').first().scrollIntoViewIfNeeded();
        const metrics = await detail.evaluate(el => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, width: el.clientWidth, scrollWidth: el.scrollWidth }));
        if (metrics.documentWidth > width || metrics.scrollWidth > metrics.width) throw Error('Clock detail overflow');
        const screenshot = `${final ? 'final-' : ''}${role}-${index}-${width}-${theme}.png`;
        await page.screenshot({ path: path.join(folder, screenshot) });
        report.states.push({ role, scenario: row.label, hours: row.hours, width, theme, metrics, screenshot });
      }
    }
    await context.close();
  }
  if (report.errors.length) throw Error('Unexpected page errors');
  report.result = 'PASS';
} catch (error) { report.fatal = error.message; process.exitCode = 1; }
finally {
  await browser.close();
  await writeFile(path.join(folder, final ? 'browser-final.json' : 'browser.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
