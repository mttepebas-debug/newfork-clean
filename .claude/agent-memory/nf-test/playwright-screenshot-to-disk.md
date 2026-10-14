---
name: playwright-screenshot-to-disk
description: Claude_Browser MCP screenshots cannot be saved as files; use a throwaway Playwright script inside e2e/ instead
metadata:
  type: feedback
---

The `mcp__Claude_Browser__*` tools (computer/screenshot, zoom, etc.) only return an
inline image to the conversation — there is no call that writes it to a path on
disk. When a task explicitly needs PNG files at real paths (e.g. `artifacts/nf-test/...`),
drive the same steps with Playwright instead and call `page.screenshot({ path })`.

**Why:** discovered while producing screenshot deliverables for BL-164/167 demo
(2026-09-26) — spent several turns trying to persist Claude_Browser screenshots
before switching to Playwright.

**How to apply:**
- `@playwright/test` lives in `e2e/node_modules` (workspace-scoped). A script run
  from elsewhere (e.g. the scratchpad) fails with `ERR_MODULE_NOT_FOUND`. Write the
  throwaway driver script *inside* `e2e/` (e.g. `e2e/.tmp-shots.mjs`), run it with
  plain `node`, then delete it when done — never commit it.
- `chromium.launch()` may pick a browser build version not present under
  `~/AppData/Local/ms-playwright` (e.g. it wants `-1243` but only `-1234` is
  cached). Point `executablePath` at whatever `chromium-<n>/chrome-win64/chrome.exe`
  is actually present instead of running `playwright install` (needless download).
- Keep the driver data-driven: a JSON list of `{goto, fill, click, wait, shot}`
  steps is enough for a login → click-through → screenshot sequence; `click.role`
  lets you use `getByRole` for buttons whose only good locator is their accessible
  name.
- A `<summary role="button" aria-label="...">` (native `<details>` disclosure, used
  by `CatalogRowMenu` in Settings) does **not** match a `button[aria-label=...]`
  CSS selector — use the bare attribute selector `[aria-label='...']`.
