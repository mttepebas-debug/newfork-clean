---
name: documents-qa-paths
description: Documents screens (EKRAN-06) QA paths - world data, safe read-only route block, preview POST is read-only, API paths for loading/error mocks, no row role traps
metadata:
  type: reference
---
2026-10-06 (EKRAN-06 C, world `e2e1791130198245`, pw `[GIZLI-CIKARILDI: e2e/global-setup.ts]`): world has 7 published document types (no Draft/Archived) and 11 employee-document rows (1 Needs review, 3 Missing, 6 Completed, owner On file). Meyhouse workspaces have no document data. Manager Ayse has no document permission: both routes silently redirect to /app/workspace.
- Read-only guard: `page.route` on ports 5639/55321 fulfilling 500 for non-GET, but allow HEAD, `/auth/v1/token` and `.../document-types/<id>/publication-preview` (POST but STABLE, no write) - otherwise the Unpublish/Publish dialog only shows "blocked".
- Reads to mock: Settings list `GET /v1/workspaces/<id>/settings/document-types`; Employees list `GET /v1/workspaces/<id>/employee-documents`.
- Settings rows are divs (no `role=row`): use `summary[aria-label^='Actions for <title>']` for the row menu; Employees rows are `tr[tabindex=0]` (`page.locator("tr",{hasText})`).
- Editor: Next is disabled until Name is filled; Esc on step 2 closes without asking (E6-23).
