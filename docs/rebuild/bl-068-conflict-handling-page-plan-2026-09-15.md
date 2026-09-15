# BL-068 Conflict Handling Settings Page

Status: local implementation and acceptance complete. Checkpoint state and evidence summary are recorded in WORK and Git; push/hosted acceptance is separate.
Model recommendation: GPT-5.5 / medium; bounded UI relocation using existing behavior.

## Goal and Placement

- Add Conflict handling under Settings > Scheduling, between Schedule rules and Shift catalog.
- Route `/app/settings/scheduling/conflicts`; title `Conflict handling`.
- Use existing SettingsLayout and SettingsHeader with lucide icon and concise description.
- Match adjacent Settings pages at pixel level: header/icon/title/description, content left edge, separator, section spacing, fonts, control heights and Save placement. Measure canonical reference pages at matching viewports; reuse classes rather than inventing numbers.
- Standardize form rows, dropdowns, numeric fields, focus/disabled/loading/error states using existing UI. Light/dark and narrow layouts must match established patterns. No nested cards or excessive copy.

## Dependency and Ownership

- Wait for explicit main-session BL-064 closure and file ownership release. Sub-slice completion is not GO.
- Read-only preparation now; no application/CSS/test/migration edits before GO.
- Saved local checkout only; no new branch/worktree. Preserve unrelated WIP.
- Main owns WORK/BACKLOG/ROADMAP/REUSE and commit/push. Send final report to main.

## Reuse and Implementation

- Read AGENTS, COORDINATION, WORK, REUSE and BL-064 final evidence first.
- Canonical source after relocation: `apps/web/src/settings/ConflictHandlingSettingsPage.tsx` owns the conflict editor; `SettingsLayout.tsx` owns navigation; `apps/web/src/App.tsx` owns routes. `SchedulingSettingsPage.tsx` retains the general scheduling form.
- Extract/reuse existing conflict component, catalog, queries, save mutation, validation and revision/stale-save behavior. Maintain one authoritative editor/state path.
- Preserve `schedule.conflict_rules.manage` contract across Settings entry, navigation, direct-route guard and API; account for users with only this permission. Add no override permission.
- Remove embedded panel from Schedule rules once the dedicated page is reachable; preserve general scheduling form behavior.
- Existing conflict options, defaults, minimum travel/rest and backend stay under BL-064's accepted contract. No new policies or migrations. Documents and daily/weekly hours remain separate plans.

## Acceptance

1. Separate page works through navigation, direct URL and refresh with correct active item and permission handling.
2. Header/separator/content/control coordinates match existing Settings references; compare light/dark desktop and narrow viewport without horizontal overflow.
3. Load, edit, save, reload, unchanged/invalid/busy and stale/error behavior remains correct.
4. Schedule rules has no duplicate conflict editor; its own Save/navigation remain correct.
5. Focused route/component checks and web typecheck; reuse backend evidence unless relevant behavior changes. Avoid repeated successful checks.
6. Report changed files, reused sources, visual/test evidence, open risks and git state to main. Add useful new canonical references to REUSE through main; avoid duplicated CSS documentation.
