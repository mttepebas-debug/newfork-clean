
(() => {
  const rows=[...document.querySelectorAll('.job-employee-row')];
  // Carlos: an unsaved add, so the "changed" look shows.
  const carlos=rows.find(r=>r.innerText.includes('Carlos Rivera')); carlos?.querySelector('input')?.click();
  const emma=rows.find(r=>r.innerText.includes('Emma Wilson')); emma?.classList.add('sim-hover');
  const s=document.createElement('style'); s.textContent="/* F \u00b7 Zemin: who is in the job reads from the row colour */\n.catalog-drawer .job-employee-list .job-employee-row{transition:background-color 120ms ease-out,box-shadow 120ms ease-out}\n.catalog-drawer .job-employee-list .job-employee-row:hover,.catalog-drawer .job-employee-list .job-employee-row.sim-hover{background-color:#f0f3f1!important}\n.catalog-drawer .job-employee-list .job-employee-row:has(input:checked){background-color:#e7f1ed!important}\n.catalog-drawer .job-employee-list .job-employee-row[data-pending=true]{box-shadow:inset 3px 0 #176954!important}\n.catalog-drawer .job-employee-row input{accent-color:#176954!important}\n"; document.head.appendChild(s); return 'ok';
})()
