// Real Chromium renderer/download smoke with synthetic data only. No API/auth/DB
// mock is presented as real authorization evidence; production modules are loaded
// through the existing Vite server, including the actual PDF.js worker.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const output = resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const source = {
  version: 1, workspaceId: 'synthetic', workspaceName: 'Örnek İşletme', weekStart: '2026-09-14', source: { kind: 'published' },
  dates: Array.from({ length: 7 }, (_, i) => `2026-09-${14 + i}`), layout: 'unified', filename: 'synthetic-export-v2',
  locations: [{ id: 'a', name: 'Merkez', shortName: 'MRK' }, { id: 'b', name: 'Sahil', shortName: 'SHL' }],
  rows: Array.from({ length: 8 }, (_, i) => ({ id: `employee-${i}`, name: `Çalışan ${i + 1}`, group: null, total: null })),
  shifts: Array.from({ length: 8 }, (_, i) => [0, 1, 2].map(j => ({ id: `shift-${i}-${j}`, employeeId: `employee-${i}`,
    locationId: j === 2 ? 'b' : 'a', date: '2026-09-14', title: `AM-Server ${i}-${j}`, position: 'Server', shiftType: 'AM',
    label: 'Açılış', location: j === 2 ? 'Sahil' : 'Merkez', color: '#15803d', time: '09:00 - 13:00',
    start: '09:00', end: '13:00', overnight: false, focused: i === 0 && j === 0 }))).flat(),
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const proof = { boundary: 'real Chromium and production renderers; synthetic snapshot; no real API authorization or native printer/Excel', checks: [], errors: [], files: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => proof.errors.push(error.message));
  await page.route('**/export-v2-renderer-qa', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><title>Export renderer QA</title>
    <button id="pdf">PDF</button><button id="png">PNG</button><button id="xlsx">Excel</button><button id="print">Print PDF</button><p id="status">Ready</p><main></main>
    <script type="module">
      import { renderExportFiles, downloadExportFile } from '/src/schedule/export-v2/files.ts';
      import { defaultExportPreferences } from '/src/schedule/export-v2/preferences.ts';
      const snapshot = ${JSON.stringify(source)};
      for (const format of ['pdf', 'png', 'xlsx', 'print']) document.getElementById(format).onclick = async () => {
        document.querySelector('#status').textContent = 'Preparing';
        try {
          const files = await renderExportFiles(snapshot, { ...defaultExportPreferences, format: format === 'print' ? 'pdf' : format, destination: format === 'print' ? 'print' : 'download' });
          document.querySelector('main').replaceChildren();
          for (const file of files) {
            const url = URL.createObjectURL(file.blob); downloadExportFile({ ...file, url });
            if (format === 'png') { const image = document.createElement('img'); image.src = url; image.style.maxWidth = '100%'; document.querySelector('main').append(image); }
          }
          document.querySelector('#status').textContent = 'Done';
        } catch(error) { document.querySelector('#status').textContent = 'ERROR: ' + error.message; }
      };
    </script>` }));
  await page.goto('http://127.0.0.1:5555/export-v2-renderer-qa');
  for (const format of ['pdf', 'png', 'xlsx', 'print']) {
    const downloadPromise = page.waitForEvent('download', { timeout: 45000 });
    await page.locator(`#${format}`).click();
    const download = await downloadPromise;
    const path = resolve(output, `${format}-${download.suggestedFilename()}`);
    await download.saveAs(path); await page.getByText('Done', { exact: true }).waitFor();
    const bytes = await readFile(path);
    if (format === 'pdf' || format === 'print') { if (bytes.subarray(0, 5).toString() !== '%PDF-') throw Error('Invalid PDF'); }
    if (format === 'png') {
      if (bytes.subarray(1, 4).toString() !== 'PNG') throw Error('Invalid PNG');
      await page.locator('img').evaluate(image => image.decode());
      proof.checks.push({ pngWidth: bytes.readUInt32BE(16), pngHeight: bytes.readUInt32BE(20), realWorkerAndCanvas: true });
      await page.screenshot({ path: resolve(output, 'png-browser.png'), fullPage: true });
    }
    if (format === 'xlsx' && bytes.subarray(0, 2).toString() !== 'PK') throw Error('Invalid XLSX');
    proof.files.push({ format, path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  if (proof.errors.length) throw Error('Browser page errors');
  proof.status = 'PASS';
} catch (error) { proof.status = 'FAIL'; proof.failure = error.message; process.exitCode = 1; }
finally { await browser.close(); await writeFile(resolve(output, 'result.json'), JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof)); }
