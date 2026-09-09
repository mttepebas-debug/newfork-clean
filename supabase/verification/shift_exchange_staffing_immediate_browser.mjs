import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(import.meta.url);
const {chromium}=require(process.argv[2]);
const state=JSON.parse(await readFile(path.join(root,'supabase/.temp/shift-exchange-role.json'),'utf8'));
const fixturePath=path.join(root,'supabase/.temp/shift-exchange-staffing-immediate.json');
const fixture=JSON.parse(await readFile(fixturePath,'utf8'));
if(!state.exchange_fixture||fixture.workspace!==state.workspace||fixture.day!=='2026-12-21')throw Error('Owned staffing fixture required');
const api='http://127.0.0.1:5560', web='http://localhost:5561';
const report={startedAt:new Date().toISOString(),workspace:state.workspace,shift:fixture.shift_id,day:fixture.day,samples:[],errors:[],sessions:[]};
const out=path.join(root,'supabase/.temp/staffing-immediate-browser-'+Date.now()+'.json');
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
async function owner(){
 const model=await op('manager','?date='+fixture.day+'&location_ids='+state.location_a);
 const entries=model.locations.flatMap(l=>l.entries).filter(e=>e.id===fixture.shift_id||e.source_shift_id===fixture.shift_id);
 if(entries.length!==1)throw Error('One owned entry required');return entries[0].employee_id;
}
try{
 for(const role of ['manager','employee']){
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
 const managerInbox=await page('manager','/app/notifications','.notifications-page');
 const employeeInbox=await page('employee','/app/notifications','.notifications-page');
 const schedule=await page('employee','/app/employee-hub/schedule?date='+fixture.day+'&view=day','.hub-shift-list');
 const lineup=await page('manager','/app/schedule/lineup?date='+fixture.day+'&location='+state.location_a,'#lineup-title');
 const hub=await page('employee','/app/employee-hub/shift-hub?hub_view=requests','.sx-root');
 if(await owner()!==null)throw Error('Fixture already assigned; do not repeat final command');
 const navigations=[];for(const p of [managerInbox,employeeInbox,schedule,lineup,hub])p.on('framenavigated',f=>{if(f===p.mainFrame())navigations.push(new URL(f.url()).pathname);});
 const preview=await op('manager','/operations/preview',{operation:fixture.operation});
 if(!preview.allowed)throw Error('Fixture no longer eligible');
 if(fixture.proposal)throw Error('Resume the retained proposal explicitly; no duplicate create');
 fixture.proposalKey??=randomUUID();await saveFixture();
 let start=Date.now();
 fixture.proposal=await op('manager','/proposals',{kind:'offer',operation:fixture.operation,fingerprint:preview.fingerprint,idempotency_key:fixture.proposalKey});await saveFixture();
 const pid=fixture.proposal.id;report.proposal=pid;
 const offerLink=employeeInbox.locator('.notifications-page article').filter({has:employeeInbox.locator('a[href*="staffing_offer='+pid+'"]')});
 const offer=hub.locator('.lu-staffing-offers article').filter({hasText:fixture.day});
 await Promise.all([offerLink.waitFor({state:'visible',timeout:10000}),offer.getByRole('button',{name:'Accept offer',exact:true}).waitFor({state:'visible',timeout:10000})]);
 report.samples.push({stage:'offer',commandStart:start,visibleUpperMs:Date.now()-start,surfaces:['employee inbox','employee Shift Hub']});
 if(await owner()!==null)throw Error('Offer transferred assignment');
 const managerReview=managerInbox.locator('.notifications-page article').filter({has:managerInbox.locator('a[href*="date='+fixture.day+'"]')}).filter({hasText:'Shift offer accepted'});
 start=Date.now();await offer.getByRole('button',{name:'Accept offer',exact:true}).click();
 await Promise.all([managerReview.waitFor({state:'visible',timeout:10000}),offer.getByText('Accepted · Not added to your schedule yet',{exact:true}).waitFor({state:'visible',timeout:10000})]);
 report.samples.push({stage:'accept',commandStart:start,visibleUpperMs:Date.now()-start,surfaces:['manager inbox','employee Shift Hub']});
 if(await owner()!==null)throw Error('Employee acceptance transferred assignment');
 const confirm=await op('manager','/proposals/action',{id:pid,response:'preview'});if(!confirm.allowed)throw Error('Final preview denied');
 const changed=employeeInbox.locator('.notifications-page article').filter({has:employeeInbox.locator('a[href*="date='+fixture.day+'"]')}).filter({hasText:'Your assignment has changed'});
 start=Date.now();fixture.confirmation=await op('manager','/proposals/action',{id:pid,response:'confirm',fingerprint:confirm.fingerprint});await saveFixture();
 await Promise.all([changed.waitFor({state:'visible',timeout:10000}),managerReview.waitFor({state:'detached',timeout:10000}),offer.waitFor({state:'detached',timeout:10000}),schedule.locator('#shift-'+fixture.shift_id).waitFor({state:'visible',timeout:10000}),lineup.getByRole('button',{name:'Manage Alex Morgan',exact:true}).waitFor({state:'visible',timeout:10000})]);
 report.samples.push({stage:'confirm',commandStart:start,visibleUpperMs:Date.now()-start,surfaces:['employee inbox','manager inbox','employee Shift Hub','employee Schedule','manager Line Up']});
 if(await owner()!==state.employee_a)throw Error('Final owner mismatch');
 report.owner=state.employee_a;report.navigationsBeforeDeepLink=navigations.length;
 if(navigations.length)throw Error('Unexpected navigation during live propagation');
 const dir=path.join(root,'docs/rebuild/shift-hub-visual-proof-2026-09-07/staffing-immediate');await mkdir(dir,{recursive:true});
 for(const [name,p] of [['employee-inbox',employeeInbox],['manager-lineup',lineup],['employee-schedule',schedule]]){await p.screenshot({path:path.join(dir,name+'.png'),fullPage:false});}
 await changed.getByRole('link').click();await employeeInbox.waitForURL(u=>u.pathname==='/app/employee-hub/schedule'&&u.searchParams.get('date')===fixture.day);
 await employeeInbox.locator('#shift-'+fixture.shift_id).waitFor({state:'visible'});report.deepLink={day:fixture.day,ownedShiftVisible:true};
 report.result='PASS';
}catch(e){report.fatal=e.message;process.exitCode=1;}
finally{await browser.close();report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({result:report.result,fatal:report.fatal,samples:report.samples,errors:report.errors}));}
