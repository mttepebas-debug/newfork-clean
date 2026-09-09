const {createRequire}=require('node:module');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const req=createRequire(path.resolve(__dirname,'../../../apps/web/package.json'));
const {JSDOM,VirtualConsole}=req('jsdom');
(async()=>{
  const errors=[];
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=await JSDOM.fromFile(path.join(__dirname,'preview.html'),{url:pathToFileURL(path.join(__dirname,'preview.html')).href+'?view=employee',runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc});
  const w=dom.window;
  await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));
  const run=s=>w.eval(s);
  for(const mode of ['shift','time'])for(const view of ['employee','manager','team','onboarding','settings','schedule','lineup']){
    run(`config.mode='${mode}';nav('${view}')`);
    assert(w.document.querySelector('h1,h2'),`${mode}/${view} heading`);
    for(const el of w.document.querySelectorAll('[onclick],[onchange],[oninput]'))for(const name of ['onclick','onchange','oninput'])if(el.hasAttribute(name))new Function('event',el.getAttribute(name));
  }
  run("config.mode='shift';nav('employee')");
  const slot=w.document.querySelector('[aria-label="Monday Lunch unavailable"]');slot.click();
  assert.equal(w.document.querySelector('[aria-label="Monday Lunch unavailable"]').getAttribute('aria-pressed'),'true');
  w.document.querySelector('[aria-label="Monday all day unavailable"]').click();
  assert(w.document.querySelector('[aria-label="Monday Lunch unavailable"]').disabled);
  run("save('employee');nav('manager');copyEmployee()");
  assert.equal(run('draft.manager[0].note'),'Keep Monday dinner coverage with the senior team.');
  w.document.querySelector('[aria-label="Enable manager reminders"]').click();
  assert(w.document.querySelector('.manager-section [aria-label="Monday Lunch unavailable"]').disabled);
  run("config.layout='tabs';drawerTab='employee';render()");
  assert(w.document.querySelector('.employee-section'));
  assert(!w.document.querySelector('.manager-section'));
  run("closeDrawer();nav('schedule');preflight()");
  assert(w.document.querySelector('.preflight-row'));
  run("closeModal();editShift();saveShift()");
  run("nav('employee');tab='timeoff';render();requestTimeOff()");
  assert.equal(w.document.querySelector('.modal h2').textContent,'Request time off');
  assert.deepEqual(errors,[]);
  console.log('PASS: 14 view/mode renders, event handlers, selection, All day, copy/note retention, disabled reminders, tabs, preflight and request dialog.');
  dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1});
