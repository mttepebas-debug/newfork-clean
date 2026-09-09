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
const out=path.join(root,'supabase/.temp/exchange-assignment-browser-'+Date.now()+'.json');
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
 const history=model.cases.filter(c=>c.status==='completed'&&c.kind==='swap'&&c.shift.source_id===fixture.shifts[0].source_id&&c.requested_shift?.source_id===fixture.shifts[1].source_id).at(-1);
 if(!history)throw Error('Owned historical swap required');report.historyCase=history.id;
 const before=[history.shift.employee_id,history.requested_shift.employee_id];report.before=before;
 const roleFor=id=>id===state.employee_a?'employee':id===state.employee_b?'blake':(()=>{throw Error('Unexpected owner');})();
 const names=id=>id===state.employee_a?'Alex Morgan':id===state.employee_b?'Blake QA':(()=>{throw Error('Unexpected person');})();
 const note='AT32 current and historical request assignment verification';
 const open=model.cases.filter(c=>c.status==='open'&&c.shift.source_id===fixture.shifts[0].source_id);
 if(open.some(c=>c.private_note!==note))throw Error('Unrelated open request on owned source');
 const created=open[0]?{case_id:open[0].id}:await exchange(roleFor(before[0]),'',{action:'create',kind:'swap',shift_id:fixture.shifts[0].id,requested_shift_id:fixture.shifts[1].id,note});
 report.pendingCase=created.case_id;report.resumedCase=Boolean(open[0]);await save();
 const caseQuery='?case_id='+created.case_id+'&'+range;
 const invited=(await exchange(roleFor(before[1]),caseQuery)).cases.find(c=>c.id===created.case_id);
 if(invited.applications[0].status==='invited')await exchange(roleFor(before[1]),'',{action:'accept',case_id:invited.id,application_id:invited.applications[0].id,expected_revision:invited.revision});
 const current=(await exchange('manager',caseQuery+'&view=manager')).cases.find(c=>c.id===created.case_id);
 if(current.status!=='open'||current.applications[0].status!=='pending_manager')throw Error('Expected a manager-pending swap');
 const surfaces=[];
 for(const role of ['manager','employee','blake'])for(const [kind,cid] of [['history',history.id],['pending',created.case_id]]){
  const route=(role==='manager'?'/app/schedule/requests?tab=shift-changes&case=':'/app/employee-hub/shift-hub?case=')+cid+'&'+range+(kind==='history'?'&hub_view=history':'');
  const p=await page(role,route,'.sx-detail[aria-label="Request details"]');surfaces.push({role,kind,p});
 }
 function matches(expected){const panel=document.querySelector('.sx-detail[aria-label="Request details"]');if(!panel)return false;
  return expected.sources.every((source,index)=>{const item=panel.querySelector('[data-assignment-source="'+source+'"]');return item?.dataset.publishedState==='current'&&item.querySelector('strong')?.textContent===expected.names[index];});}
 const sources=fixture.shifts.map(shift=>shift.source_id);
 await Promise.all(surfaces.map(({p})=>p.waitForFunction(matches,{sources,names:before.map(names)},{timeout:10000})));
 const folder=path.join(root,'docs/rebuild/shift-hub-visual-proof-2026-09-07/exchange-assignments');await mkdir(folder,{recursive:true});
 for(const role of ['manager',roleFor(before[0])]){
  const p=surfaces.find(s=>s.role===role&&s.kind==='pending').p;
  for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
   await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const metrics=await p.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,rows:[...document.querySelectorAll('.sx-detail .sx-assignment')].map(e=>({state:e.dataset.publishedState,text:e.querySelector('strong').textContent,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,font:parseFloat(getComputedStyle(e.querySelector('strong')).fontSize)}))}));
   if(metrics.documentWidth>width||metrics.rows.length!==2||metrics.rows.some(r=>r.left<0||r.right>width))throw Error('Assignment layout failed '+JSON.stringify(metrics));
   await p.locator('.sx-detail').scrollIntoViewIfNeeded();const screenshot=role+'-'+width+'-'+theme+'.png';await p.screenshot({path:path.join(folder,screenshot),fullPage:false});report.states.push({role,width,theme,metrics,screenshot});
  }
  await p.setViewportSize({width:390,height:1000});await p.evaluate(()=>{document.documentElement.dataset.theme='light';document.documentElement.style.fontSize='32px';});
  const scaled=await p.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,fonts:[...document.querySelectorAll('.sx-detail .sx-assignment strong')].map(e=>parseFloat(getComputedStyle(e).fontSize))}));
  if(scaled.documentWidth>390||scaled.fonts.some(f=>f<30))throw Error('Assignment text scaling failed');
  const screenshot=role+'-390-text200.png';await p.locator('.sx-detail .sx-assignment').first().scrollIntoViewIfNeeded();await p.screenshot({path:path.join(folder,screenshot),fullPage:false});report.states.push({role,width:390,textScale:2,metrics:scaled,screenshot});
  await p.evaluate(()=>document.documentElement.style.fontSize='');await p.setViewportSize({width:1440,height:1000});
 }
 const accepted=(await exchange('manager',caseQuery+'&view=manager')).cases.find(c=>c.id===created.case_id);
 if(accepted.shift.employee_id!==before[0]||accepted.requested_shift.employee_id!==before[1])throw Error('Consent or inspection transferred responsibility');
 const preview=await exchange('manager','?case_id='+accepted.id+'&application_id='+accepted.applications[0].id);
 if(!preview.allowed||preview.requires_other_manager)throw Error('Final review not allowed');
 let navigations=0;for(const {p}of surfaces)p.on('framenavigated',f=>{if(f===p.mainFrame())navigations++;});
 const expected={sources,names:[before[1],before[0]].map(names)};
 const observing=Promise.all(surfaces.map(async surface=>{await surface.p.waitForFunction(matches,expected,{timeout:15000,polling:'raf'});await surface.p.locator('.sx-detail').getByText('First shift',{exact:true}).waitFor({state:'visible'});if(await surface.p.locator('.sx-detail').getByText('You give',{exact:true}).count())throw Error('Completed request retained future label');return {role:surface.role,kind:surface.kind,observedAt:Date.now()};}));observing.catch(()=>{});
 report.commandStart=Date.now();report.decision=await exchange('manager','',{action:'approve',case_id:accepted.id,application_id:accepted.applications[0].id,expected_revision:accepted.revision,fingerprint:preview.fingerprint});
 report.observations=await observing;report.visibleUpperMs=Math.max(...report.observations.map(o=>o.observedAt))-report.commandStart;report.navigations=navigations;
 if(navigations)throw Error('Unexpected navigation during detail refresh');
 const final=(await exchange('manager',caseQuery+'&view=manager')).cases.find(c=>c.id===created.case_id);
 if(final.shift.employee_id!==before[1]||final.requested_shift.employee_id!==before[0])throw Error('Final owner mismatch');report.after=[final.shift.employee_id,final.requested_shift.employee_id];
 for(const role of ['manager','employee']){const p=surfaces.find(s=>s.role===role&&s.kind==='history').p;await p.locator('.sx-detail').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(folder,role+'-history-after.png'),fullPage:false});}
 report.result='PASS';
}catch(e){report.fatal=e.message;process.exitCode=1;}finally{await browser.close();report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({result:report.result,fatal:report.fatal,states:report.states.length,visibleUpperMs:report.visibleUpperMs,errors:report.errors}));}
