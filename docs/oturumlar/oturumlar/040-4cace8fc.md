# Oturum 4cace8fc-2df8-49a5-8d31-9e5b1e5ffb50

- Döküm: `C:\Users\TheWe\.claude\projects\c--Users-TheWe-newfork\4cace8fc-2df8-49a5-8d31-9e5b1e5ffb50.jsonl`
- Klasör: `c--Users-TheWe-newfork`
- Başlık: Ponytail gain
- Zaman (UTC): 2026-07-25T08:18:23.317Z → 2026-07-25T08:31:12.713Z
- Boyut: 0.4 MB · Mert'in mesajı: 0 · Artifact linki: 0 · Giriş: claude-desktop

## Artifact linkleri

—

## Mert'in mesajları

## Asistanın son mesajı

Audit complete. Ranked ledger, biggest cut first. Applies nothing.

## Tier 1 — big deletions (verified zero prod importers)

- `delete` ~87 hand-run `california:*` npm scripts + their `scripts/california-*` files (~32k LOC); CI uses only 3 entrypoints (`test:california-overtime-release-gate`, `california-workday:runtime-readiness`, `california-overtime:monitor-sources`). Replacement: keep the 3. [package.json:32-137, scripts/] — **~32,000 lines** ⚠️ compliance-cert adjacent — confirm none feed certification evidence before cutting.
- `delete` [MyTeamPage.tsx](apps/web/src/features/employee-portal/MyTeamPage.tsx) (1452) + its 2177-line test — exported, never routed. Replacement: nothing. **~3,630 lines** (matches known open item from shift-swap track).
- `delete` marketing duplication — `src/assets/landing.html?raw` (94KB) vs [MarketingSite.tsx](apps/web/src/features/marketing/MarketingSite.tsx) (2378 lines). One route wins; delete loser. **~2,400 lines** ⚠️ verify which is live first.
- `delete` [packages/time-kernel](packages/time-kernel) — zero importers; cert doc itself records "never called". **~1,463 lines**, 1 workspace pkg.
- `delete` [packages/pay-kernel](packages/pay-kernel) — zero importers. **~1,352 lines**, 1 pkg.
- `delete` test-only orphan components: `TimeOffRequestDetailDrawer`, `ShiftDecisionDialog`, `WorkspaceQuickActions`, `LocationComplianceCard`, `HubCalendarCard`, `useEntitlement`. **~1,430 lines**.
- `delete` schedule edit-lock/edit-session feature — `useEditLock`, `useEditSessionActions`, `useEditIdleTimer`, `useScheduleViewerPresence`, `EnterEditModeDialog` + tests, zero prod importers. **~880 lines** ⚠️ this was Phase 6 edit-mode groundwork — delete only if that design is abandoned.
- `delete` [compliance-facts-hooks.ts](apps/web/src/features/labor-costs/compliance-facts-hooks.ts) — all 18 exports test-only. **~890 lines**.
- `delete` [california-wage-floor-graph-execution-coordinator.ts](apps/api/src/features/labor-rates/california-wage-floor-graph-execution-coordinator.ts) — test-only. **~785 lines** ⚠️ same compliance caveat.
- `yagni` 5-layer single-caller chain in CA compensable-time runtime (executor → pipeline → coordinator each one caller). Collapse to one function. **~600 lines**.
- `delete` 14 fully unreferenced web files (`mockData.ts`, `ShiftDrawer.tsx`, `JobChip.tsx`, `useDepartmentEditorState.ts`, `CommaInput.tsx`, `EmployeeListRow.tsx`, `BulkPublishPopover.tsx`, `SSOButtons.tsx`, etc.). **~1,060 lines**.
- `delete` Expo starter-template cluster in mobile (16 files: `app-tabs`, `themed-text/view`, `animated-icon`, `web-badge`, etc.) — zero importers. **~800 lines** + 440KB template assets.
- `delete` 302 dead exported symbols across 125 web files (dead fetchers/key factories/type aliases; worst: `time-entries/api.ts` 25, `schedule/api.ts` 20). **~800 lines**.
- `delete` `california-compensable-time-candidate-consumer.ts` (376) + `candidate-event-query-store.ts` (183) + `wage-floor-downstream-materialization.ts` (184) — all test-only. **~740 lines** ⚠️ compliance caveat.
- `delete` [apps/api/src/features/import/](apps/api/src/features/import) — abandoned parallel import feature; live one is `features/employees/import/`. Move `normalize.ts` there, delete rest. **~322 lines**.

## Tier 2 — deps

- `native` 5 web deps: `html-to-image`, `jspdf` (zero imports), `react-hook-form` + `@hookform/resolvers` (3 plain forms — FormData + existing zod covers), `zxcvbn` (~800KB for one strength meter — 15-line heuristic). **-5 deps, ~1.5MB bundle/install**.
- `delete` 6 mobile deps never imported: `@expo/ui`, `expo-crypto`, `expo-font`, `expo-glass-effect`, `expo-linking`, `zod`. **-6 deps, ~40MB install**.
- `native` `pg` in api runtime deps, only integration tests import it. Move to devDependencies. **-1 runtime dep**.

## Tier 3 — hygiene / small

- `delete` tracked junk: `tmp/` (3.9MB, 21 files), `output/pdf/`, `backups/`, `mockups/` superseded rounds (1.7MB), triple-rendered `audit-report.{html,md,pdf}`, 4.3MB un-ignored `.codex-*.log` — add `*.log`, `tmp/` to .gitignore. **~12MB**.
- `yagni` mobile dual theme system — `constants/theme.ts` alive only via `web-sidebar` reading `Colors.light.*`; point at `useDesignTokens()` (also fixes hardcoded light mode), delete file. **~73 lines**.
- `stdlib` ~30 local date/time formatter copies in web (11× `formatDateTime`, 10× `formatDate`, 5× 12h-conversion, 6× inline `getLocalTodayIso` reimpl). One `Intl.DateTimeFormat` module + existing [localDate.ts](apps/web/src/lib/localDate.ts). **~290 lines**.
- `delete` `require-feature.ts` — test-only. **~46 lines** ⚠️ known "requireFeature unwired" backlog item — decide wire-or-drop, don't silently delete.
- `delete` `packages/ui` dead exports: whole `archive-styles.ts` (7 exports, 0 refs) + 11 barrel exports with zero consumers + 2 unused package.json subpaths. **~66 lines**.
- `delete` 4 empty leftover package dirs: `applicability-kernel`, `evidence-kernel`, `jurisdiction-kernel`, `policy-source-catalog` (only .turbo logs). **4 dirs**.
- `delete` mobile: duplicate `ui.test.tsx` (subset of sibling, 62), template `reset-project.js` (114 — would nuke shipped app if run), unused layout constants web (~30). **~210 lines**.
- `stdlib` `localDate()` mobile = `toLocaleDateString("en-CA")` (6→1); `unique()` reimplemented 4× in api (16). **~22 lines**.
- `shrink` 3 real copy-paste blocks in web (ClosedDays↔ImportantDates 27, Create↔EditEntryForm 25, CA-overtime section↔dialog 26). **~78 lines**.
- `yagni` pass-through wrappers: `ScheduleMiniCalendar`, `PageHeaderActionButton`, `CompactAdminHeaderActionButton`; 26 exported `*Props` with no external importer. **~52 lines**.

## Structural note

`apps/api/src/features/time-entries/` holds 40 `california-compensable-time-*` files (~8,200 lines src+test) for a subsystem hardcoded to `payrollMutationAllowed: false` — cannot affect payroll. Biggest single YAGNI candidate **but** it's your compliance-wedge launch asset; decision is product, not code. Not counted in net below.

**net: ~47,000 lines (-32k scripts, -9k web, -5.4k api/packages, -1k mobile), -12 deps, -2 workspace packages, ~12MB tracked artifacts possible.**

Safest immediate batch (no product questions): MyTeamPage, 14 unreferenced web files, Expo template cluster, unused deps (11), time-kernel/pay-kernel, empty package dirs, tracked junk — ~9k lines, zero risk. CA scripts + edit-lock + marketing dup + requireFeature need your call first. Want fixes applied? Say which tiers.
