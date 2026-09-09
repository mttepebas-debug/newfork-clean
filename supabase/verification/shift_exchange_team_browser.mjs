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
const report={startedAt:new Date().toISOString(),workspace:state.workspace,states:[],errors:[],sessions:[]};
const out=path.join(root,'supabase/.temp/employee-team-browser-'+Date.now()+'.json');
const save=()=>writeFile(out,JSON.stringify(report,null,2));
const saveFixture=()=>writeFile(fixturePath,JSON.stringify(fixture,null,2));
console.log(JSON.stringify({report:out}));
const browser=await chromium.launch({headless:true});
const tokens={},contexts={};
async function request(role,route,body){
 const response=await fetch(api+route,{headers:{Authorization:'Bearer '+tokens[role],'X-Newfork-Workspace-Id':state.workspace,...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
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
 for(const role of ['employee','blake']){
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
 const folder=path.join(root,'docs/rebuild/shift-hub-visual-proof-2026-09-07/employee-team');await mkdir(folder,{recursive:true});
 for(const [role,index] of [['employee',0],['blake',1]]){
  const shift=fixture.shifts[index];const p=await page(role,'/app/employee-hub/my-team?date='+shift.date,'.team-day-groups');
  const row=p.locator('[data-team-shift-id="'+shift.id+'"]');await row.waitFor({state:'visible'});
  const actor=role==='employee'?state.employee_a:state.employee_b;
  if(await row.getAttribute('data-team-employee-id')!==actor)throw Error('Expected final even-swap owner for visual audit');
  if(await row.getByRole('link',{name:/Find cover or swap/}).count()!==1)throw Error('Own action absent');
  for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
   await p.setViewportSize({width,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   await p.getByLabel('Team schedule date',{exact:true}).focus();
   const metrics=await p.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,focus:getComputedStyle(document.activeElement).outlineStyle,controls:[...document.querySelectorAll('.team-day-controls input,.team-day-controls button,.team-day-controls a,.employee-team-view .hub-exchange-link')].map(e=>({text:e.textContent,height:e.getBoundingClientRect().height,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}))}));
   if(metrics.documentWidth>width||metrics.focus==='none'||metrics.controls.some(c=>c.height<44||c.left<0||c.right>width))throw Error('Team layout failed '+JSON.stringify({role,width,theme,metrics}));
   const screenshot=role+'-'+width+'-'+theme+'.png';await p.screenshot({path:path.join(folder,screenshot),fullPage:false});report.states.push({role,width,theme,metrics,screenshot});
  }
  await p.setViewportSize({width:390,height:1000});await p.evaluate(()=>{document.documentElement.dataset.theme='light';document.documentElement.style.fontSize='32px';});
  const scaled=await p.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,font:parseFloat(getComputedStyle(document.querySelector('.team-day-hours')).fontSize),links:[...document.querySelectorAll('.employee-team-view a')].map(e=>({height:e.getBoundingClientRect().height,right:e.getBoundingClientRect().right}))}));
  if(scaled.documentWidth>390||scaled.font<32||scaled.links.some(l=>l.height<44||l.right>390))throw Error('Team text scaling failed '+JSON.stringify(scaled));
  await row.scrollIntoViewIfNeeded();const screenshot=role+'-390-text200.png';await p.screenshot({path:path.join(folder,screenshot),fullPage:false});report.states.push({role,width:390,textScale:2,metrics:scaled,screenshot});
  await p.evaluate(()=>document.documentElement.style.fontSize='');await p.setViewportSize({width:1440,height:1000});
  const date=p.getByLabel('Team schedule date',{exact:true});const other=index===0?fixture.shifts[1].date:fixture.shifts[0].date;
  await date.fill(other);await date.press('Enter');await p.waitForURL(u=>u.searchParams.get('date')===other);await p.locator('.team-day-groups').waitFor({state:'visible'});
  await p.goBack();await p.waitForURL(u=>u.searchParams.get('date')===shift.date);await row.waitFor({state:'visible'});if(await date.inputValue()!==shift.date)throw Error('Back lost date');
  await p.getByRole('link',{name:'My schedule',exact:true}).click();await p.waitForURL(u=>u.pathname==='/app/employee-hub/schedule'&&u.searchParams.get('date')===shift.date);await p.locator('#shift-'+shift.id).waitFor({state:'visible'});
  await p.goBack();await row.waitFor({state:'visible'});const ownLink=row.getByRole('link',{name:/Find cover or swap/});await ownLink.focus();await ownLink.press('Enter');
  await p.waitForURL(u=>u.searchParams.get('offer')===shift.id);await p.getByRole('dialog').waitFor({state:'visible'});await p.getByText('You remain responsible until a manager approves the transfer.',{exact:true}).waitFor({state:'visible'});
  report[role]={dateBack:true,scheduleRoundTrip:true,exactShiftCoverDialog:true};
 }
 report.result='PASS';
}catch(e){report.fatal=e.message;process.exitCode=1;}finally{await browser.close();report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({result:report.result,fatal:report.fatal,states:report.states.length,errors:report.errors}));}
