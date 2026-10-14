---
name: font-swap-before-after-trick
description: How to get a same-session Segoe-vs-Inter (font swap) before/after in Playwright without git stash; phone widths where Inter wraps
metadata:
  type: reference
---

After BRAND step 3-4 (Inter self-hosted, 2026-10-04) a font-only "before" is made by `p.addStyleTag({content:':root{--theme-font-sans:"Segoe UI",sans-serif !important}'})` after goto; every element inherits `--theme-font-sans`, so it is a faithful old look. Compare element heights/ellipsis per route, fresh context per font (resizing a live page leaves stale layout).

Inter is wider than Segoe: breakpoints that wrapped were 375 and 360 (Schedule top bar +41..82 px, Availability filter tabs), 390 (Settings > General "Hide checklist" button). 1440/1280/390 Schedule top bar unchanged. Draft preview reachable via New Schedule -> "View ..." (aria-label^="View "), click grid to close menu.
