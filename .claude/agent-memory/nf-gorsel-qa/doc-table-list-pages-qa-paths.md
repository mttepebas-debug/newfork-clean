---
name: doc-table-list-pages-qa-paths
description: DOC-TABLE (list-page look) QA paths: routes, world accounts, what each role sees, Playwright traps (route mocks, tab locators, Git Bash path mangling)
metadata:
  type: reference
---
2026-10-04 world `e2e1791130198245` (password `world-pass-2026`, /sign-in): owner `owner.dfb09487`, manager Ayse `ayse.a0bf9882`, employee Ali `ali.7b526937` (2 unread notifications, only user with inbox rows).
Routes: `/app/settings/documents`, `/app/employees/documents`, `/app/notifications`, `/app/announcements`, `/app/important-dates` (`/app/settings/important-dates` redirects here; not inside the settings layout, content x=320; Settings pages sit at x=544 because of the settings sub-nav), `/app/availability`.
Roles: manager Ayse cannot open Settings Documents / Employees Documents / Important Dates (redirect to /app/workspace) but sees "New announcement"; manager `docx6xah-m1.c8fc7370` sees Important Dates + New date + Employees Documents. Employee Announcements has no tab row (filter y=190, table y=242).
World has no important dates: mock the API GET with `page.route((u)=>u.port==="5617"&&/important-dates$/.test(u.pathname))` + `route.fetch()` and swap `dates` (types: holiday|event|blackout|closed_day). A regex like `/important-dates$/` also matches the page document URL and breaks the page (Chrome local-network CORS).
Playwright: Notifications tab "Read" locator by text also matches "Unread" - use `getByRole("tab",{name:/^Read/})`. Git Bash rewrites args starting with `/` into `C:/Program Files/Git/...`; pass routes without the leading slash. Block mutations with `page.route` returning 500 for non-GET on ports 5617/55321 to test Mark as read / Dismiss safely.
Pre-existing (not DOC-TABLE): Settings catalog row-open buttons (`.job-row-identity`) have focus ring removed on purpose in jobs-settings.css; archived rows are opacity .45.
