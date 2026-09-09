/** Real settings UI save. API verifier restores the owned workspace in finally. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {chromium}=createRequire(import.meta.url)(process.argv[2]);
const state=JSON.parse(await readFile(path.join(root,'supabase/.temp/shift-exchange-lineup-overlap-role.json'),'utf8'));
const folder=path.join(root,'docs/rebuild/shift-hub-visual-proof-2026-09-07/travel-policy');
await mkdir(folder,{recursive:true});
const verify=action=>JSON.parse(execFileSync('python',['-X','utf8','supabase/verification/shift_exchange_travel_settings_local.py',action],{cwd:root,encoding:'utf8'}));
verify('prepare');
const report={workspace:state.workspace,states:[],errors:[]};
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://localhost:5561/sign-in');
 await page.getByLabel('Email',{exact:true}).fill(state.users.policy_admin.email);
 await page.getByLabel('Password',{exact:true}).fill(state.password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.waitForURL(url=>url.pathname.startsWith('/app'));
 await page.goto('http://localhost:5561/app/settings/scheduling');
 const input=page.getByLabel('Minimum travel time (minutes)',{exact:true});
 await input.fill('30');
 await input.press('Tab');
 report.keyboardFocusAdvanced=await input.evaluate(el=>document.activeElement!==el);
 const response=page.waitForResponse(r=>r.url().endsWith('/scheduling-settings')&&r.request().method()==='PUT');
 await page.getByRole('button',{name:'Save rules',exact:true}).click();
 if((await response).status()!==200)throw Error('Real settings save failed');
 await page.getByText('Scheduling rules saved.',{exact:true}).waitFor();
 await page.reload();
 await page.getByText(/next location can start at 3:30 PM/).waitFor();
 if(await input.inputValue()!=='30')throw Error('Policy did not survive reload');
 for(const width of [390,1440])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});
  await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
  await input.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-window.innerWidth,fieldHeight:document.querySelector('#minimum-travel').getBoundingClientRect().height}));
  if(metrics.overflow>0||metrics.fieldHeight<44)throw Error(JSON.stringify(metrics));
  const screenshot=`settings-${width}-${theme}.png`;
  await page.screenshot({path:path.join(folder,screenshot)});
  report.states.push({width,theme,metrics,screenshot});
 }
 if(report.errors.length)throw Error(report.errors.join('; '));
}finally{
 await browser.close();
 try{report.api=verify('verify');}finally{
  await writeFile(path.join(folder,'browser.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
 }
}
