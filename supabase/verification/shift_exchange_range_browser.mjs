import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(import.meta.url);
const {chromium}=require(process.argv[2]);
const state=JSON.parse(await readFile(path.join(root,'supabase/.temp/shift-exchange-role.json'),'utf8'));
const fixturePath=path.join(root,'supabase/.temp/shift-exchange-multisurface.json');
const fixture=JSON.parse(await readFile(fixturePath,'utf8'));
if(!state.exchange_fixture||fixture.workspace!==state.workspace)throw Error('Owned staffing fixture required');
const api='http://127.0.0.1:5560', web='http://localhost:5561';
const report={startedAt:new Date().toISOString(),workspace:state.workspace,states:[],observations:[],errors:[],sessions:[]};
const out=path.join(root,'supabase/.temp/exchange-range-browser-'+Date.now()+'.json');
const save=()=>writeFile(out,JSON.stringify(report,null,2));
const saveFixture=()=>writeFile(fixturePath,JSON.stringify(fixture,null,2));
console.log(JSON.stringify({report:out}));
const browser=await chromium.launch({headless:true});
const tokens={},contexts={};
async function request(role,route,body){
 const response=await fetch(api+route,{headers:{Authorization:'Bearer '+tokens[role],'X-Newfork-Workspace-Id':state.workspace,...(body?{'Content-Type':'application/json','Idempotency-Key':randomUUID()}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 const data=await response.json();if(!response.ok)throw Error(route+' '+response.status+' '+JSON.stringify(data));return data;
}
const op=(role,route,body)=>request(role,'/schedule/lineups'+route,body);
async function page(role,route,ready){
 const p=await contexts[role].newPage();
 p.on('pageerror',e=>report.errors.push({type:'pageerror',message:e.message}));
 p.on('response',r=>{if(r.url().startsWith(api)&&r.status()>=400)report.errors.push({type:'http',path:new URL(r.url()).pathname,status:r.status()});});
 await p.goto(web+route);await p.locator(ready).first().waitFor({state:'attached',timeout:25000});
 if(await p.evaluate(()=>document.visibilityState)!=='visible')throw Error('Surface must be visible');return p;
}
try{
 for(const role of ['manager','employee','blake']){
  contexts[role]=await browser.newContext({viewport:{width:1440,height:1000}});
  const p=await contexts[role].newPage();await p.goto(web+'/sign-in');
  await p.getByLabel('Email',{exact:true}).fill(state.users[role].email);await p.getByLabel('Password',{exact:true}).fill(state.password);
  const auth=p.waitForResponse(r=>r.url().includes('/auth/v1/token?grant_type=password')&&r.request().method()==='POST');
  await p.getByRole('button',{name:'Sign in',exact:true}).click();const response=await auth;
  if(!response.ok())throw Error('UI login failed');tokens[role]=(await response.json()).access_token;
  await p.waitForURL(u=>u.pathname.startsWith('/app'),{timeout:25000});
  const ctx=await request(role,'/v1/context');if(ctx.workspace?.id!==state.workspace)throw Error('Workspace mismatch');
  report.sessions.push({role,auth:'normal UI password login'});await p.close();
 }
 const exchange=(role,query='',body)=>request(role,'/v1/workspaces/'+state.workspace+'/shift-exchanges'+query,body);
 const range='from='+fixture.shifts[0].date+'&to='+fixture.shifts[1].date;

 const model=await exchange('manager','?view=manager&'+range);
 const history=model.cases.find(c=>c.status==='completed'&&c.kind==='swap'&&c.shift.source_id===fixture.shifts[0].source_id&&c.requested_shift?.source_id===fixture.shifts[1].source_id);
 if(!history)throw Error('Owned historical swap required');
 const folder=path.join(root,'docs/rebuild/shift-hub-visual-proof-2026-09-07/exchange-range');await mkdir(folder,{recursive:true});
 report.mutations=0;
 for(const role of ['manager','employee']){
  const base=role==='manager'?'/app/schedule/requests?tab=shift-changes&':'/app/employee-hub/shift-hub?';
  const p=await page(role,base+range+'&hub_view=history','.sx-list');
  p.on('request',r=>{if(r.url().startsWith(api)&&r.method()==='POST')report.mutations++;});
  await p.getByLabel('From date',{exact:true}).fill(fixture.shifts[1].date);
  await p.locator('.sx-list').waitFor({timeout:25000});
  await p.getByLabel('Through date',{exact:true}).fill(fixture.shifts[1].date);
  await p.locator('.sx-list').waitFor({timeout:25000});
  await p.getByRole('combobox',{name:'Location',exact:true}).selectOption(fixture.shifts[1].location_id);
  const targetName=history.requested_shift.employee_name;
  await p.getByRole('searchbox').fill(targetName);
  await p.locator('.sx-case-row').first().waitFor({timeout:25000});
  const targetDates=await p.locator('.sx-case-row .sx-date').allTextContents();
  if(!targetDates.length||targetDates.some(text=>!text.includes('Dec 15')))throw Error('Return-date search rendered a date outside the selected day');
  if(!await p.locator('.sx-case-row').first().getByText('Requested in return',{exact:true}).count())throw Error('Return shift match was not explained');
  await p.getByRole('searchbox').fill('No employee has this name');
  if(await p.locator('.sx-case-row').count())throw Error('Search did not narrow return matches');
  await p.getByRole('searchbox').fill(targetName);
  await p.locator('.sx-case-row').first().focus();
  await p.keyboard.press('Enter');
  await p.locator('.sx-detail[aria-label="Request details"]').waitFor();
  const selected=new URL(p.url()).searchParams.get('case');
  await p.getByLabel('From date',{exact:true}).fill('2027-02-01');
  await p.locator('.sx-detail[aria-label="Request details"]').waitFor({timeout:25000});
  await p.getByText('This request is outside your list filters. Its details are still available here.',{exact:true}).waitFor();
  if(new URL(p.url()).searchParams.get('case')!==selected)throw Error('Filtering discarded the focused case');
  if(await p.locator('.sx-case-row').count())throw Error('Focused out-of-range case leaked into the list');
  const assignments=await p.locator('.sx-detail .sx-assignment strong').allTextContents();
  if(assignments.length!==2)throw Error('Focused swap lost current owners');
  for(const width of [320,1440])for(const theme of ['light','dark']){
   await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const dims=await p.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth}));
   if(dims.documentWidth>width)throw Error('Filtered detail overflow');
   await p.locator('.sx-detail').scrollIntoViewIfNeeded();const screenshot=role+'-'+width+'-'+theme+'.png';
   await p.screenshot({path:path.join(folder,screenshot),fullPage:false});
   report.states.push({role,width,theme,dims,screenshot});
  }
  report.observations.push({role,returnDateMatches:targetDates.length,combinedLocationAndName:true,keyboardOpen:true,focusedCase: selected,outsideFilterDetailPreserved:true,assignments});
 }
 if(report.mutations)throw Error('Read/filter UI submitted a mutation');
 report.result='PASS';
}catch(e){report.fatal=e.message;process.exitCode=1;}finally{await browser.close();report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({result:report.result,fatal:report.fatal,states:report.states.length,mutations:report.mutations,errors:report.errors}));}
