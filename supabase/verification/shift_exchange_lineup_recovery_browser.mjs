/** Native manager recovery with real local employee/manager authentication. */
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {chromium}=createRequire(import.meta.url)(process.argv[2]);
const state=JSON.parse(await readFile(path.join(root,'supabase/.temp/shift-exchange-lineup-overlap-role.json'),'utf8'));
const fixture=JSON.parse(await readFile(path.join(root,'supabase/.temp/shift-exchange-lineup-recovery.json'),'utf8'));
const folder=path.join(root,'docs/rebuild/shift-hub-visual-proof-2026-09-07/lineup-person-state');await mkdir(folder,{recursive:true});
const output=path.join(folder,'recovery-browser.json');
try{await copyFile(output,path.join(folder,`recovery-browser-attempt-${Date.now()}.json`));}catch{}
const inspect=()=>JSON.parse(execFileSync('python',['-X','utf8','supabase/verification/shift_exchange_lineup_recovery_local.py','inspect'],{cwd:root,encoding:'utf8'}));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const report={workspace:state.workspace,case:fixture.case,states:[],requests:[],errors:[],before:inspect()};
const browser=await chromium.launch({headless:true});let page;
async function persist(){await writeFile(output,JSON.stringify(report,null,2));}
async function login(role){
 const p=await browser.newPage({viewport:{width:1440,height:1000}});p.setDefaultTimeout(12000);
 p.on('pageerror',e=>report.errors.push(e.message));
 p.on('response',r=>{if(r.request().method()!=='GET')report.requests.push({method:r.request().method(),url:new URL(r.url()).pathname,status:r.status()});});
 await p.goto('http://localhost:5561/sign-in');await p.getByLabel('Email',{exact:true}).fill(state.users[role].email);await p.getByLabel('Password',{exact:true}).fill(state.password);await p.getByRole('button',{name:'Sign in',exact:true}).click();await p.waitForURL(u=>u.pathname.startsWith('/app'));return p;
}
const managerUrl=`http://localhost:5561/app/schedule/requests?tab=shift-changes&hub_view=ready&case=${fixture.case}&from=${fixture.day}&to=${fixture.day}`;
const lineupUrl=`http://localhost:5561/app/schedule/lineup?date=${fixture.day}&location=${state.location_a}`;
const employeeUrl=view=>`http://localhost:5561/app/employee-hub/shift-hub?hub_view=${view}&case=${fixture.case}&from=${fixture.day}&to=${fixture.day}`;
async function share(){
 await page.getByRole('button',{name:'Share Line Up',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Share Line-up',exact:true});
 await dialog.getByRole('button',{name:'Create share version',exact:true}).click();await dialog.waitFor({state:'hidden'});
}
async function capture(label){
 for(const width of [390,1440])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  const approve=page.getByRole('button',{name:`Approve transfer to ${fixture.candidate_name}`,exact:true});
  if(await approve.count())await approve.scrollIntoViewIfNeeded();
  const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth}));assert(metrics.overflow<=0,'Horizontal overflow '+label);
  const screenshot=`recovery-${label}-${width}-${theme}.png`;await page.screenshot({path:path.join(folder,screenshot)});report.states.push({label,width,theme,metrics,screenshot});
 }
 await persist();
}
try{
 assert(report.before.status==='open','Fixture already terminal; inspect prior evidence instead of repeating approval');
 page=await login('manager');
 if(report.before.shares.length===0){await page.goto(lineupUrl);await share();}
 report.omitted=inspect();assert(report.omitted.shares.length===1&&report.omitted.shares[0].entries.length===0,'Expected one legitimate omitted-calloff share');
 assert(report.omitted.owner===state.employee_a&&report.omitted.transfers===0,'Initial owner must remain');await persist();
 await page.goto(managerUrl);await page.getByRole('button',{name:`Review ${fixture.candidate_name}`,exact:true}).click();
 await page.getByText('This shift is missing from the shared Line Up. Review and share its assignment before approving.',{exact:true}).waitFor();
 assert(await page.getByRole('button',{name:`Approve transfer to ${fixture.candidate_name}`,exact:true}).isDisabled(),'Blocked final button must be disabled');
 await capture('blocked');
 const owner=await login('employee');await owner.goto(employeeUrl('requests'));await owner.getByText('Still your shift',{exact:true}).waitFor();report.owner_before_final=true;
 await page.goto(lineupUrl);
 if(inspect().call_off){
  await page.getByRole('button',{name:`Manage ${fixture.owner_name}`,exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Undo call-off',exact:true}).click();await dialog.waitFor({state:'hidden'});
 }else report.resumed_after_native_undo=true;
 await share();report.reconciled=inspect();assert(report.reconciled.shares.length===2&&!report.reconciled.call_off,'Native recovery share missing');assert(report.reconciled.owner===state.employee_a&&report.reconciled.transfers===0,'Sharing must not transfer responsibility');assert(report.reconciled.shares[0].hash===report.omitted.shares[0].hash,'Previous snapshot changed');await persist();
 await page.goto(managerUrl);await page.getByRole('button',{name:`Review ${fixture.candidate_name}`,exact:true}).click();
 const approve=page.getByRole('button',{name:`Approve transfer to ${fixture.candidate_name}`,exact:true});await approve.waitFor();
 await page.waitForFunction(name=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===name&&!b.disabled),`Approve transfer to ${fixture.candidate_name}`);
 await capture('ready');await approve.focus();await approve.press('Enter');
 const confirm=page.getByRole('button',{name:`Confirm transfer to ${fixture.candidate_name}`,exact:true});await confirm.focus();await confirm.press('Enter');
 await page.getByText('Transfer approved',{exact:true}).first().waitFor();
 report.after=inspect();assert(report.after.status==='completed'&&report.after.owner===state.employee_casey&&report.after.transfers===1,'Final transfer missing');assert(report.after.shares.length===3,'Expected exactly three share versions');assert(report.after.shares[0].hash===report.omitted.shares[0].hash&&report.after.shares[1].hash===report.reconciled.shares[1].hash,'Historical snapshot changed');
 assert(report.after.shares[2].entries.some(e=>e.employee_id===state.employee_casey),'New recipient absent from latest shared Line Up');
 await owner.goto(employeeUrl('history'));await owner.getByText('Transfer approved',{exact:true}).first().waitFor();
 const recipient=await login('casey');await recipient.goto(employeeUrl('history'));await recipient.getByText('Transfer approved',{exact:true}).first().waitFor();report.employee_results={old_owner:true,new_owner:true};
 await page.goto(lineupUrl);await page.getByRole('button',{name:`Manage ${fixture.candidate_name}`,exact:true}).waitFor();await capture('final-lineup');
 assert(report.errors.length===0,'Browser errors');report.result='PASS';
}catch(error){report.result='FAIL';report.failure=String(error);if(page){report.failureText=await page.locator('body').innerText();await page.screenshot({path:path.join(folder,'recovery-failed.png')});}throw error;
}finally{await persist();await browser.close();console.log(JSON.stringify({result:report.result,states:report.states.length,errors:report.errors,step:report.failure}));}
