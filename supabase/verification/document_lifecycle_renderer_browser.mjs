// Production React components/CSS in Chromium, synthetic document data only.
// This proves rendering/interactions, never shared DB/auth/storage acceptance.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const output = resolve(process.argv[3]);
await mkdir(output, { recursive: true });
const compiled = await (await fetch('http://127.0.0.1:5555/src/documents/EmployeeDocumentsList.tsx')).text();
const queryModule = compiled.match(/from ["']([^"']+@tanstack_react-query[^"']*)["']/)?.[1];
if (!queryModule) throw Error('Vite query import unavailable');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const proof = { boundary: 'Production document components and CSS; synthetic module data; no real auth/API/storage', checks: [], errors: [] };
const mockModule = `
const settings={mode:'conditional',target:{operator:'and',location_ids:[],department_ids:[],job_ids:[],employee_ids:[]},assignment_scope:'all_active',period_days:7,suspend_on_overdue:true,extra_fields:[]};
const base={workspace_id:'workspace',employee_id:'employee',employee_name:'Alex Kim',source_id:'source',kind:'document',mode:'conditional',revision:1,requires_review:true,deadline_at:null,remaining_seconds:3600,rejection_reason:null,suspended:false,submitted_id:null,approved_id:null,location_ids:['west'],location_names:['West branch'],timezone:'America/Los_Angeles',settings,accepted_formats:['pdf'],tracks_expiry:true};
const rows=[{...base,id:'review',title:'Food safety certificate',status:'pending_review',submitted_id:'submission'},{...base,id:'missing',title:'Work eligibility document',status:'missing'},{...base,id:'completed',title:'Training record',status:'completed'}];
export const documentQueryKey=(a,u,id)=>['document-lifecycle',u,a.workspaceId,a.selfOnly?'self':'manager',...(id?[id]:[])];
export const listDocuments=async()=>structuredClone(rows);
export const getDocument=async(a,id)=>({obligation:structuredClone(rows.find(r=>r.id===id)),submissions:id==='review'?[{id:'submission',version:1,state:rows[0].status==='pending_review'?'pending_review':'accepted',submitted_at:'2026-09-15T12:00:00Z',reviewed_at:null,expiry_date:'2027-09-15',metadata:{},rejection_reason:null,files:[{id:'file',filename:'certificate.pdf',media_type:'application/pdf',size_bytes:100,decision:'keep',note:''}]}]:[],history:[]});
export async function reviewDocument(a,id,input){ const r=rows.find(r=>r.id===id);r.status=input.decision==='approve'?'completed':'rejected';r.revision++;return{}; }
export const getDocumentAccess=async()=>({restricted:false});
export const downloadDocument=async()=>({});
export const setDocumentExemption=async()=>({});
export const setDocumentTimezone=async()=>({});
export const deferInitialDocument=async()=>({});
export const acknowledgeDocument=async()=>({});
export const uploadDocument=async()=>({});
export const submitDocument=async()=>({});
export const withdrawDocumentAcknowledgement=async()=>({});
export const removeDocumentDraftFile=async()=>({});
export const extendDocumentDeadline=async()=>({});
export const previewEmployeeDocumentAssignments=async()=>[];
`;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => proof.errors.push(error.message));
  await page.route('**/src/documents/document-data.ts*', route => route.fulfill({ contentType: 'text/javascript', body: mockModule }));
  await page.route('**/document-lifecycle-qa', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html data-theme="light"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Document lifecycle synthetic QA</title><div id="root"></div>
  <script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
  <script type="module" src="/@vite/client"></script><script type="module">
  import React from '/node_modules/.vite/deps/react.js';
  import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';const {createRoot}=ReactDOM;
  import {QueryClient,QueryClientProvider} from '${queryModule}';
  import {EmployeeDocumentsList} from '/src/documents/EmployeeDocumentsList.tsx';
  import '/src/styles.css';import '/src/dark-theme.css';
  const cache=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  createRoot(document.getElementById('root')).render(React.createElement(QueryClientProvider,{client:cache},React.createElement('main',{className:'settings-page jobs-settings-page',style:{padding:'24px'}},React.createElement('h1',null,'Employee documents'),React.createElement('p',null,'Synthetic UI verification — no real employee data'),React.createElement(EmployeeDocumentsList,{audience:{workspaceId:'workspace',selfOnly:false},userId:'manager',canReview:true}))));
  </script></html>` }));
  await page.goto('http://127.0.0.1:5555/document-lifecycle-qa');
  await page.getByRole('table', { name: 'Employee documents' }).waitFor();
  await page.getByRole('row', { name: /Alex Kim.*Food safety certificate.*Needs review/ }).waitFor();
  await page.screenshot({ path: resolve(output, 'list-light.png'), fullPage: true });
  await page.getByRole('button', { name: /^Needs review/ }).click();
  await page.getByRole('row', { name: /Food safety certificate/ }).click();
  await page.getByRole('dialog', { name: 'Food safety certificate' }).waitFor();
  await page.getByRole('dialog').evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
  await page.screenshot({ path: resolve(output, 'review-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByText('Version 1 · accepted').waitFor();
  if (!(await page.getByRole('dialog', { name: 'Food safety certificate' }).isVisible())) throw Error('Review closed drawer');
  proof.checks.push('Review saves and preserves drawer; filtered list does not force Next');
  await page.getByRole('button', { name: 'Close document details' }).click();
  await page.getByText('No documents match these filters.').waitFor();
  await page.getByRole('button', { name: /^All / }).click();
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await page.screenshot({ path: resolve(output, 'list-dark.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('row', { name: /Work eligibility document/ }).click();
  await page.getByRole('dialog', { name: 'Work eligibility document' }).waitFor();
  await page.getByRole('dialog').evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
  await page.screenshot({ path: resolve(output, 'review-dark-mobile.png'), fullPage: true });
  const bounds = await page.getByRole('dialog').boundingBox();
  if (!bounds || bounds.x < -1 || bounds.x + bounds.width > 391) throw Error('Mobile drawer exceeds viewport');
  await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: 'Search employee documents' }).fill('unmatched');
  await page.getByText('No documents match these filters.').waitFor();
  proof.checks.push('Missing obligations, status/search empty state, dark/mobile drawer bounds, Escape');
  if (proof.errors.length) throw Error(proof.errors.join('\n'));
  proof.status = 'PASS';
} catch (error) { proof.status = 'FAIL'; proof.errors.push(String(error)); throw error; }
finally { await writeFile(resolve(output, 'result.json'), JSON.stringify(proof,null,2)); await browser.close(); }
