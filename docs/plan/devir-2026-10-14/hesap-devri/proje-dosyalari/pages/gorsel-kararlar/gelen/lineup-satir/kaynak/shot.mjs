// Screenshots of the phone mockup for review.
// node shot.mjs --out DIR --v 1[,2] [--m day,end,...] [--tall] [--roles mgr,emp] [--html ../index.html]
// Files: DIR/<v>-<moment>-<role>.png (390x844 phone), DIR/<v>-<moment>-<role>-tall.png (whole scroll height) with --tall.
import pw from '/opt/node-tools/node_modules/playwright/index.js';
import path from 'path'; import fs from 'fs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = k => process.argv.includes('--' + k);
const here = path.dirname(new URL(import.meta.url).pathname);
const html = path.resolve(here, arg('html', '../index.html'));
const out = path.resolve(arg('out', path.join(here, '../shots')));
fs.mkdirSync(out, { recursive: true });
const vs = arg('v', '').split(',').filter(Boolean);
const ALL = ['day', 'end', 'person', 'add', 'calloff', 'notes', 'publish', 'published', 'started', 'nosec', 'empty', 'emp', 'empack'];
const ms = arg('m', ALL.join(',')).split(',');
const roles = arg('roles', 'mgr,emp').split(',');
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: Number(arg('dpr', '1')) });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('file://' + html);
await p.waitForTimeout(600);
for (const v of vs) {
  await p.evaluate(v => { NF.debug.setVariant(v); NF.debug.setView('both'); }, v);
  for (const m of ms) {
    await p.evaluate(m => NF.debug.moment(m), m);
    await p.waitForTimeout(v === 'o' ? 1500 : 350);
    for (const r of roles) {
      if ((m === 'emp' || m === 'empack') ? r !== 'emp' : (r === 'emp' && !['day', 'published', 'emp', 'empack'].includes(m))) continue;
      const sel = `[data-phone="${v}:${r}"]`;
      const el = await p.$(sel); if (!el) { errs.push('no phone ' + sel); continue; }
      await el.screenshot({ path: path.join(out, `${v}-${m}-${r}.png`) });
      if (has('tall')) {
        const h = await p.evaluate(sel => { const d = document.querySelector(sel), s = d.querySelector('.scroll'), n = d.querySelector('.nav'); if (!s) return 0; return s.scrollHeight + (n ? n.offsetHeight : 0) + 20; }, sel);
        if (h > 844) {
          await p.evaluate(([sel, h]) => { const d = document.querySelector(sel); d.style.height = h + 'px'; d.style.zoom = 1; }, [sel, h]);
          await p.waitForTimeout(150);
          await (await p.$(sel)).screenshot({ path: path.join(out, `${v}-${m}-${r}-tall.png`) });
          await p.evaluate(sel => { document.querySelector(sel).style.height = ''; }, sel);
        }
      }
    }
  }
}
if (has('compare')) { await p.evaluate(() => { NF.debug.moment('day'); NF.debug.setCompare(true); }); await p.waitForTimeout(1500); await p.screenshot({ path: path.join(out, 'compare.png'), fullPage: true }); }
await b.close();
console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'no errors', '\nshots in', out);
