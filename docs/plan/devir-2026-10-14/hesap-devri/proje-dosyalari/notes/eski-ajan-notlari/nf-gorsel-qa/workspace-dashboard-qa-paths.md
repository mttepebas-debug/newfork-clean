---
name: workspace-dashboard-qa-paths
description: Workspace home (EKRAN-05) QA paths - dashboard API to mock, world admin Zeynep, scroll container, mock traps (zod enums render raw JSON)
metadata:
  type: reference
---
2026-10-06 (EKRAN-05 C, world `e2e1791130198245`, password `[GIZLI-CIKARILDI: e2e/global-setup.ts]`): owner `owner.dfb09487`, admin `zeynep.5fe97e4c` (sees Setup checklist), manager Ayse `ayse.a0bf9882` (no checklist).
- Page scrolls inside `main.app-main` (fullPage screenshots cut off); set `scrollTop` on it. Settings pages have a second `main.settings-content` (BL-486) so `locator("main")` is ambiguous.
- Dashboard read: `GET :5639/v1/workspaces/<id>/workspace` (+ `/workspace/setup-checklist`). Mock with `page.route(u=>u.port==="5639"&&/\/workspace$/.test(u.pathname))` + `route.fetch()`; world has 1 announcement, 0 todos, 0 notifications.
- Mock trap: announcement `category` must be general|operations|schedule, notification category from `notificationCategorySchema`; an invalid value makes the page print raw zod JSON (looks like a bug, is the mock).
- Customize opens without a write; Cancel closes it. Hide checklist / Save layout / Add todo write - block non-GET with a route.
- Schedule links are hidden below 768 px on purpose (KARARLAR "Schedule telefonda tamamen kapalı"): Open shifts link, Quick action, "First schedule view" checklist step.
