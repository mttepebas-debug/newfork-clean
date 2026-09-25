# Jobs & departments UI contract

Scope: organization settings catalog, department/job creation, and job-centric employee assignments. Preserve existing application shell and permissions.

- Three URL-backed views: All (default; hierarchy URL remains compatible), Departments, Jobs. Shared search/archive state; jobId opens a right drawer without losing list state.
- Inter typography; 14px row titles, 12px supporting text, 11px column labels. Neutral surfaces, subtle borders, current green accent. No decorative gradients or large summary cards.
- Catalog rows: 48px minimum, 14px horizontal padding, 10px gaps. Fixed count/action columns; names truncate with full text available. Menus contain edit, archive/restore, move up/down. Group headings show distinct employee counts and job counts.
- Creation editor: max-width 720px; 16px padding, 8px row spacing, 36px controls. Department name + compact color control; editable job rows and one trailing input. Enter/Add advances focus, never submits a job draft. Final Save includes a nonempty trailing row. Blank department job list is allowed.
- Assignment drawer: 640px max, fixed header/footer and independently scrollable content. Search, location and All/Assigned/Unassigned filters. 50 rows per page. Checkboxes represent membership, not selection. Pending changes survive filters, paging and refetch. The bulk-actions dropdown was removed at the user's request; pending checkboxes still save together.
- Save assignments keeps the drawer open; successful create closes the editor. Dirty drawer close asks to discard. Escape, focus containment and focus return are required. Disabled protected rows explain why. Error states retain input and never imply partial success.
- Last-job removal is allowed here; zero jobs yields no primary. EmployeeDrawer save validation remains unchanged. Existing scheduled shifts are not released.
- <=720px: controls have 44px touch targets, secondary row information below name, drawer fills width. No horizontal page overflow at 390px. Both themes and reduced motion supported.
- Review at 1440/1024/390px with long names, populated/empty lists, keyboard-only actions, archived entities and failures. Independent review must cover visual hierarchy and critical interaction regressions.

## Accepted follow-up refinements

- All uses one Add menu with Department and Job choices. Jobs/Departments retain a direct matching Add action.
- Changing view closes the creation editor. Inputs are not automatically focused on open; keyboard focus remains visible when navigating.
- Existing department Add job opens the same continuous multi-job entry experience. Enter/Add stages the next row without closing; Save jobs atomically creates all named rows under that department.
- Editor typography: 14px/600 title; 13px/400 fields; 12px/600 labels/actions; 12px/400 helper text. Mobile fields use 16px to avoid browser zoom.
- Department employee totals include distinct employees across all current job assignments, including retained assignments to archived jobs.
- Existing department edit forms support the same multi-job rows; department changes and newly added jobs save atomically.
- Job drawer Delete job logically deletes the catalog item and ends every current assignment in one transaction. Remaining primary assignment is chosen deterministically; no replacement is required for the last job. Published shift rows remain unchanged. Database guards prohibit direct-client deletion bypass, stale restores and assignments arriving after deletion.
- Escape discards the catalog editor even with focus outside it. Job/department row and tab focus rings are suppressed as requested; assignment input keyboard focus remains visible.
- Departments and Jobs column headings toggle ascending/descending presentation sorting, retained in the URL. Manual order is unchanged and can be restored with Clear column sorting. Move actions are disabled during column sorting/search.
- Shift Label and Shift Type add/edit forms use the same catalog typography, color input, field spacing, footer and Escape behavior. Existing shift-type revision/default-hours rules remain intact.
- Locations uses the shared compact catalog, action menu and editor, with address search and responsive address/time-zone columns.
- The sidebar calendar was removed in both expanded/collapsed navigation. The Schedule topbar calendar remains available.