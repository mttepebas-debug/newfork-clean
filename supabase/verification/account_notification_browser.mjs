import { execFileSync } from 'node:child_process';
// Local-only controlled fixture. Credentials/tokens stay in memory; owned rows/mail are removed.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require(process.argv[2]);
const url = process.env.SUPABASE_URL;
if (!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw Error('Local Supabase required');
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false, autoRefreshToken:false } });
const auth = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession:false, autoRefreshToken:false } });
const tag = randomUUID(); const email = `gate3-${tag}@example.test`; const nextEmail = `gate3-next-${tag}@example.test`;
const password = `Gate3!${randomUUID()}`;
const workspaceIds = [randomUUID(),randomUUID()]; let userId, browser, activePage;
const output = new URL('../.temp/gate3-notifications/', import.meta.url);
await mkdir(output, {recursive:true});
const proof = { checks:[], pageErrors:[], cleanup:[] };
function check(value,name) { if (!value) throw Error(name); proof.checks.push(name); }
function sql(input) { return execFileSync('docker',['exec','-i','supabase_db_newfork-clean','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}); }
try {
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:'Gate 3 Verification'}});
 if(created.error) throw Error('fixture auth create'); userId=created.data.user.id;
 for(let i=0;i<workspaceIds.length;i++) {
  const id=workspaceIds[i];
  sql(`insert into public.workspaces(id,name,created_by) values('${id}','Gate 3 Workspace ${i+1}','${userId}');`);
  sql(`insert into public.workspace_memberships(workspace_id,user_id,role,status,all_locations) values('${id}','${userId}','owner','active',true);`);
  sql(`insert into public.workspace_onboarding(workspace_id,status,current_step,completed_at,updated_by) values('${id}','complete',2,now(),'${userId}') on conflict(workspace_id) do update set status='complete',current_step=2;`);
 }
 sql(`insert into public.user_workspace_preferences(user_id,active_workspace_id) values('${userId}','${workspaceIds[0]}') on conflict(user_id) do update set active_workspace_id=excluded.active_workspace_id;`);
 const signed=await auth.auth.signInWithPassword({email,password}); if(signed.error) throw Error('fixture auth sign in');
 const token=signed.data.session.access_token;
 async function api(path,body) {
  const r=await fetch('http://127.0.0.1:5556'+path,{headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
  if(!r.ok) throw Error(`API ${path.split('?')[0]} status ${r.status}`); return r.json();
 }
 await api('/v1/account/security/email-change',{newEmail:nextEmail});
 const global=await api('/v1/account/notifications');
 check(global.notifications.some(n=>n.type_key==='security.account.email_change_requested'&&n.scope==='account'&&n.workspace_id===null),'real Auth email change emits global in-app event');
 for(const id of workspaceIds) {
  const inbox=await api(`/v1/workspaces/${id}/communications/notifications`);
  check(inbox.notifications.some(n=>n.id===global.notifications[0].id),'same global event visible in workspace '+workspaceIds.indexOf(id));
 }
 let captured=[];
 for(let i=0;i<10;i++) {
  const mail=await (await fetch('http://127.0.0.1:55324/api/v1/messages')).json();
  captured=(mail.messages??[]).filter(m=>(m.To??[]).some(to=>[email,nextEmail].includes(to.Address)));
  if(captured.length) break; await new Promise(r=>setTimeout(r,250));
 }
 check(captured.length>0,'local Mailpit captured controlled Auth email change');
 proof.mail={count:captured.length,subjects:captured.map(m=>m.Subject),provider:'local Mailpit; no external send'};
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}); const page=await context.newPage(); activePage=page;
 page.on('pageerror',()=>proof.pageErrors.push('pageerror'));
 await page.goto('http://127.0.0.1:5555/sign-in');
 await page.getByLabel('Email',{exact:true}).fill(email); await page.getByLabel('Password',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.waitForURL(u=>u.pathname.startsWith('/app'),{timeout:30000});
 await page.goto('http://127.0.0.1:5555/account/preferences/notifications');
 await page.getByRole('checkbox',{name:'Schedule In-app',exact:true}).waitFor();
 check(await page.getByLabel('Workspace',{exact:true}).isVisible(),'multi-workspace selector visible');
 check(await page.getByRole('heading',{name:'Account security messages'}).count()===0,'removed security settings section stays absent');
 check(await page.getByRole('link',{name:'Account Security',exact:true}).getAttribute('href')==='/account/security','email-unavailable reason links to Security');
 check(await page.getByRole('checkbox',{name:'Schedule Email',exact:true}).isDisabled(),'email master locked');
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no horizontal overflow at ${width}px`);
  await page.screenshot({path:new URL(`preferences-${width}.png`,output).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
 }
 const master=page.getByRole('checkbox',{name:'Schedule In-app',exact:true});
 await master.click(); check(await page.getByRole('button',{name:'Save changes',exact:true}).isEnabled(),'single Save becomes enabled for draft');
 await page.getByRole('button',{name:'Discard',exact:true}).click();
 check(await page.getByRole('button',{name:'Save changes',exact:true}).isDisabled(),'Discard restores baseline without mutation');
 sql(`update public.workspaces set lifecycle_status='deleted',closed_at=now(),closed_by=created_by where id='${workspaceIds[1]}' and created_by='${userId}';`);
 await page.reload(); await page.getByRole('checkbox',{name:'Schedule In-app',exact:true}).waitFor();
 check(await page.getByLabel('Workspace',{exact:true}).count()===0,'single accessible workspace hides selector');
 await page.goto('http://127.0.0.1:5555/app/notifications'); await page.getByRole('heading',{name:'Notifications',exact:true}).waitFor();
 check(await page.getByText('Email change requested',{exact:true}).count()>0,'real global event rendered in existing inbox');
 await page.screenshot({path:new URL('inbox-390.png',output).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
 const cancelled=await fetch('http://127.0.0.1:5556/v1/account/security/email-change',{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});
 check(cancelled.ok,'controlled pending email cancellation succeeds');
 await page.getByText('Email change cancelled',{exact:true}).waitFor({timeout:10000});
 check(true,'account realtime refreshes the existing inbox after a new security event');
 sql(`update public.workspaces set lifecycle_status='deleted',closed_at=now(),closed_by=created_by where id='${workspaceIds[0]}' and created_by='${userId}';`);
 await page.goto('http://127.0.0.1:5555/account/inbox');
 await page.getByText('Email change cancelled',{exact:true}).waitFor();
 check(true,'global inbox remains usable with zero accessible workspaces');
 const action=page.getByRole('link',{name:'Open notification: Email change cancelled'});
 check(await action.getAttribute('href')==='/account/security','global event action reaches Security without a workspace');
 check(proof.pageErrors.length===0,'no browser page errors');
} catch(error) { proof.failure=error.message; if(activePage) proof.failurePage={path:new URL(activePage.url()).pathname,text:(await activePage.locator('body').innerText()).slice(0,750)}; process.exitCode=1; } finally {
 if(browser) await browser.close();
 for(const id of workspaceIds) { sql(`begin; update public.workspaces set lifecycle_status='deleted',closed_at=now(),closed_by=created_by where id='${id}' and created_by='${userId??randomUUID()}'; delete from public.workspace_memberships where workspace_id='${id}' and user_id='${userId??randomUUID()}'; delete from public.workspaces where id='${id}' and created_by='${userId??randomUUID()}'; commit;`); proof.cleanup.push('owned workspace removed'); }
 if(userId) { const r=await admin.auth.admin.deleteUser(userId); proof.cleanup.push(r.error?'user cleanup failed':'owned Auth user removed'); }
 const mail=await (await fetch('http://127.0.0.1:55324/api/v1/messages')).json();
 const ids=(mail.messages??[]).filter(m=>(m.To??[]).some(to=>[email,nextEmail].includes(to.Address))).map(m=>m.ID);
 if(ids.length) { const r=await fetch('http://127.0.0.1:55324/api/v1/messages',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({IDs:ids})}); proof.cleanup.push(r.ok?'owned capture mail removed':'mail cleanup failed'); }
 await writeFile(new URL('proof.json',output),JSON.stringify(proof,null,2));
 console.log(JSON.stringify(proof));
}
