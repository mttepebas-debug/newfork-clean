import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export async function auditNotificationDetails({ root, fixture, surfaces, report, save, owners, versions, exchange, roleForPerson, personNames }) {
  const before = await owners();
  const beforeVersions = await versions();
  const giver = roleForPerson(before[0]);
  const receiver = roleForPerson(before[1]);
  const query = `?view=manager&from=${fixture.shifts[0].date}&to=${fixture.shifts[1].date}`;
  const initial = (await exchange('manager', query)).cases;
  const note = 'AT34 notification detail layout QA';
  const pending = initial.filter(c => c.status === 'open' && c.shift.id === fixture.shifts[0].id);
  if (pending.length > 1 || pending.some(c => c.private_note !== note || c.requested_shift?.id !== fixture.shifts[1].id)) throw Error('Unrelated pending request: refuse to replace');
  const historic = initial.filter(c => c.status === 'completed' && c.kind === 'swap' && c.shift.id === fixture.shifts[0].id && c.requested_shift?.id === fixture.shifts[1].id).sort((a,b) => a.created_at.localeCompare(b.created_at)).at(-1);
  if (!historic) throw Error('Existing completed QA swap required');
  const directory = path.join(root, 'docs/rebuild/shift-hub-visual-proof-2026-09-07/notification-details');
  await mkdir(directory, { recursive: true });
  report.notificationDetails = { before, beforeVersions, historicalCase: historic.id, states: [] };
  let caseId;
  try {
    caseId = pending[0]?.id ?? (await exchange(giver, '', { action: 'create', kind: 'swap', shift_id: fixture.shifts[0].id, requested_shift_id: fixture.shifts[1].id, note })).case_id;
    report.notificationDetails.pendingCase = caseId;
    const invited = (await exchange(receiver, `?case_id=${caseId}`)).cases.find(c => c.id === caseId);
    if (invited.applications[0].status === 'invited') await exchange(receiver, '', { action: 'accept', case_id: caseId, application_id: invited.applications[0].id, expected_revision: invited.revision });
    if (JSON.stringify(await owners()) !== JSON.stringify(before)) throw Error('Ownership changed before approval');
    for (const role of ['manager', giver]) {
      const page = surfaces.find(s => s.role === role && s.kind === 'inbox').page;
      const inspectedCase = role === 'manager' ? caseId : historic.id;
      const row = page.locator(`.notifications-page article:has(a[href*="case=${inspectedCase}"])`);
      await row.waitFor({ timeout: 15000 });
      if (await row.locator('.notification-shift-details').count()) throw Error('Details should start collapsed');
      let reads = 0;
      const track = request => { if (request.method() === 'POST' && request.url().includes('/communications/notifications')) reads++; };
      page.on('request', track);
      const toggle = row.getByRole('button', { name: 'View shift details', exact: true });
      await toggle.focus();
      await toggle.press('Enter');
      const panel = row.getByRole('region', { name: 'Shift request details' });
      await panel.getByText('Current request', { exact: true }).waitFor();
      const assigned = await panel.locator('.notification-shift-owner strong').allTextContents();
      if (JSON.stringify(assigned) !== JSON.stringify(before.map(p => personNames[p]))) throw Error('Details inferred old ownership instead of reading current assignments');
      if ((await panel.innerText()).includes(note)) throw Error('Private note appeared');
      const closeToggle = row.getByRole('button', { name: 'Hide shift details', exact: true });
      for (const width of [320,390,768,1440]) for (const theme of ['light','dark']) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
        await closeToggle.focus();
        const metrics = await panel.evaluate(element => {
          const r = element.getBoundingClientRect();
          const controls = [...element.querySelectorAll('a,button')].map(e => { const box = e.getBoundingClientRect(); return { text: e.textContent.trim(), height: box.height, left: box.left, right: box.right }; });
          const pageBox = document.querySelector('.notifications-page').getBoundingClientRect();
          return { pageWidth:pageBox.width, viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, left: r.left, right: r.right, controls, bodyFont: getComputedStyle(element.querySelector('p')).fontSize, focusedOutline: getComputedStyle(document.activeElement).outlineStyle };
        });
        if ((width <= 600 && metrics.pageWidth < width - 24) || metrics.documentWidth > width + 1 || metrics.left < 0 || metrics.right > width + 1 || metrics.controls.some(c => c.height < 44 || c.left < 0 || c.right > width + 1) || metrics.focusedOutline === 'none') throw Error('Details layout or keyboard focus failed: '+JSON.stringify({ role,width,theme,metrics }));
        await panel.getByRole('heading', { name: 'Message when sent' }).scrollIntoViewIfNeeded();
        const screenshot = path.join(directory, `${role}-${width}-${theme}-${Date.now()}.png`);
        await page.screenshot({ path: screenshot, fullPage: false });
        report.notificationDetails.states.push({ role,width,theme,metrics,screenshot });
      }
      await page.setViewportSize({ width: 390, height: 1000 });
      await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
      const enlarged = await panel.evaluate(e => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, font: parseFloat(getComputedStyle(e.querySelector('p')).fontSize), links: [...e.querySelectorAll('a')].map(a => { const r=a.getBoundingClientRect(); return {left:r.left,right:r.right,height:r.height}; }) }));
      if (enlarged.font < 28 || enlarged.scrollWidth > 391 || enlarged.links.some(a=>a.left<0||a.right>391||a.height<44)) throw Error('200% text lost content/actions');
      await panel.getByRole('link', { name: 'Open request', exact: true }).scrollIntoViewIfNeeded();
      const enlargedScreenshot = path.join(directory, `${role}-390-text200-${Date.now()}.png`);
      await page.screenshot({ path: enlargedScreenshot, fullPage: false });
      report.notificationDetails.states.push({ role,width:390,textScale:2,metrics:enlarged,screenshot:enlargedScreenshot });
      await page.evaluate(() => { document.documentElement.style.removeProperty('font-size'); });
      if (reads !== 0) throw Error('Expanding details submitted an inbox action');
      report.notificationDetails[role] = { caseId:inspectedCase, currentAssignees:assigned, disclosureMutations:reads };
      if (role === giver) {
        const link = panel.getByRole('link', { name: 'Open schedule · First shift', exact: true });
        await link.focus(); await link.press('Enter');
        await page.waitForURL(url => url.pathname === '/app/employee-hub/schedule' && url.searchParams.get('date') === fixture.shifts[0].date);
        await page.locator(`#shift-${fixture.shifts[0].id}`).waitFor();
        report.notificationDetails[role].scheduleDeepLink = { date: fixture.shifts[0].date, correctOwnedShiftVisible:true, readActions:reads };
      } else {
        await closeToggle.press('Enter');
        if (await panel.count()) throw Error('Keyboard collapse failed');
      }
      page.off('request',track);
      await save();
    }
    report.notificationDetails.result = 'PASS';
  } finally {
    if (caseId) {
      const current = (await exchange('manager', `?view=manager&case_id=${caseId}`)).cases.find(c => c.id === caseId);
      if (current?.status === 'open' && current.private_note === note) await exchange(giver, '', { action:'close',case_id:caseId,expected_revision:current.revision,reason:'Notification detail verification complete; original assignments remain.' });
      report.notificationDetails.cleanup = { owners:await owners(), versions:await versions(), status:(await exchange('manager', `?view=manager&case_id=${caseId}`)).cases.find(c=>c.id===caseId)?.status };
      if (JSON.stringify(report.notificationDetails.cleanup.owners)!==JSON.stringify(before) || JSON.stringify(report.notificationDetails.cleanup.versions)!==JSON.stringify(beforeVersions)) throw Error('Read-only detail verification altered schedule or snapshots');
    }
    await save();
  }
}
