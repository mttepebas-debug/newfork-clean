
(() => {
  const rows=[...document.querySelectorAll('.job-employee-row')];
  // Carlos: an unsaved add, so the "changed" look shows.
  const carlos=rows.find(r=>r.innerText.includes('Carlos Rivera')); carlos?.querySelector('input')?.click();
  const emma=rows.find(r=>r.innerText.includes('Emma Wilson')); emma?.classList.add('sim-hover');
  const s=document.createElement('style'); s.textContent=".catalog-drawer .job-employee-list .job-employee-row.sim-hover{background-color:#f0f5f2!important}"; document.head.appendChild(s); return 'ok';
})()
