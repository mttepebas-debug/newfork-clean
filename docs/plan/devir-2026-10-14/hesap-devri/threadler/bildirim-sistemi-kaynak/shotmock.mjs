import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const [,, out, ...specs] = process.argv;
const b = await chromium.launch();
for (const spec of specs) {
  const [name, hash, frame, click] = spec.split('|');
  const p = await b.newPage({ viewport: { width: frame === 'phone' ? 390 : 1440, height: frame === 'phone' ? 844 : 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`file://${process.env.SP}/site/mock.html#${hash}`);
  await p.waitForTimeout(800);
  if (click) for (const c of click.split(';')) { await p.click(c).catch(e => errs.push('click ' + c + ': ' + e.message.split('\n')[0])); await p.waitForTimeout(300); }
  await p.screenshot({ path: `${out}/${name}.png` });
  if (errs.length) console.log(name, errs.join(' | '));
  await p.close();
}
await b.close();
