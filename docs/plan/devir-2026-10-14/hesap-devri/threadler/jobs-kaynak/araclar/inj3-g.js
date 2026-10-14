
(() => {
  const rows=[...document.querySelectorAll('.job-employee-row')];
  // Carlos: an unsaved add, so the "changed" look shows.
  const carlos=rows.find(r=>r.innerText.includes('Carlos Rivera')); carlos?.querySelector('input')?.click();
  const emma=rows.find(r=>r.innerText.includes('Emma Wilson')); emma?.classList.add('sim-hover');
  const s=document.createElement('style'); s.textContent="/* G \u00b7 \u00c7izgi: selection is a green line; only unsaved changes get a fill */\n.catalog-drawer .job-employee-list .job-employee-row{transition:background-color 120ms ease-out,box-shadow 120ms ease-out}\n.catalog-drawer .job-employee-list .job-employee-row:hover,.catalog-drawer .job-employee-list .job-employee-row.sim-hover{background-color:#f0f3f1!important}\n.catalog-drawer .job-employee-list .job-employee-row:has(input:checked){box-shadow:inset 3px 0 #176954!important}\n.catalog-drawer .job-employee-list .job-employee-row:has(input:checked) strong{color:#12624f}\n.catalog-drawer .job-employee-list .job-employee-row[data-pending=true]{background-color:#e7f1ed!important;box-shadow:inset 3px 0 #176954!important}\n.catalog-drawer .job-employee-row input{accent-color:#176954!important}\n"; document.head.appendChild(s); return 'ok';
})()
