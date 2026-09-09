/** Real manager Line Up review; no final staffing action is sent. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {chromium}=createRequire(import.meta.url)(process.argv[2]);
const state=JSON.parse(await readFile(path.join(root,'supabase/.temp/shift-exchange-lineup-overlap-role.json'),'utf8'));
const folder=path.join(root,'docs/rebuild/shift-hub-visual-proof-2026-09-07/travel-policy');await mkdir(folder,{recursive:true});
const policy=action=>JSON.parse(execFileSync('python',['-X','utf8','supabase/verification/shift_exchange_travel_lineup_policy_local.py',action],{cwd:root,encoding:'utf8'}));
const fixture=policy('prepare');
const browser=await chromium.launch({headless:true});const report={workspace:state.workspace,states:[],errors:[],previews:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',async r=>{if(r.url().endsWith('/operations/preview')&&r.request().method()==='POST')report.previews.push({status:r.status(),body:await r.json()});});
 await page.goto('http://localhost:5561/sign-in');
 await page.getByLabel('Email',{exact:true}).fill(state.users.manager.email);
 await page.getByLabel('Password',{exact:true}).fill(state.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.waitForURL(url=>url.pathname.startsWith('/app'));
 await page.goto(`http://localhost:5561/app/schedule/lineup?date=${fixture.day}&location=${state.location_a}`);
 await page.getByRole('button',{name:'Manage Lineup QA A',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'Move location',exact:true}).click();
 await dialog.getByRole('combobox',{name:/^Destination location/}).selectOption(state.location_b,{timeout:5000});
 await dialog.getByLabel('Starts',{exact:true}).fill('10:00');
 await dialog.getByLabel('Ends',{exact:true}).fill('10:30');
 await dialog.getByLabel('Requested travel time (minutes)',{exact:true}).fill('0');
 await dialog.getByLabel('Reason for change',{exact:true}).fill('Review shared travel minimum');
 await dialog.getByText(/Company minimum: 30 minutes between locations/).waitFor();
 const review=dialog.getByRole('button',{name:'Review impact',exact:true});await review.focus();await review.press('Enter');
 await dialog.getByRole('button',{name:'Confirm change',exact:true}).waitFor();
 await dialog.getByText(/Travel between locations: 30 minutes/).waitFor();
 await dialog.getByText(/30 minutes of travel are reserved/).waitFor();
 for(const width of [390,1440])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  await dialog.getByText(/Travel between locations: 30 minutes/).scrollIntoViewIfNeeded();await page.waitForTimeout(200);
  const metrics=await dialog.evaluate(el=>({overflow:document.documentElement.scrollWidth-innerWidth,dialogOverflow:el.scrollWidth-el.clientWidth}));
  if(metrics.overflow>0||metrics.dialogOverflow>0)throw Error(JSON.stringify(metrics));
  const screenshot=`lineup-${width}-${theme}.png`;await page.screenshot({path:path.join(folder,screenshot)});report.states.push({width,theme,metrics,screenshot});
 }
 if(report.errors.length)throw Error(report.errors.join(';'));
}catch(error){
 const page=browser.contexts()[0]?.pages()[0];
 if(page){report.failureText=await page.locator('body').innerText();await page.screenshot({path:path.join(folder,'lineup-failed.png')});}
 throw error;
}finally{
 await browser.close();
 try{report.cleanup=policy('restore');}finally{await writeFile(path.join(folder,'lineup-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
}
