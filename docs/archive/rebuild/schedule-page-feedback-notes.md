# Schedule Page Feedback Notes

Source: voice review on 2026-09-01, local `/app/schedule`.

## 1. Location header focus filter is unstable and too hard to clear

Status: user-reported, code-located, not fixed.

Area: schedule grid location headers and click-away filter clearing.

Definition of "empty space":

- Empty space is not only visually blank pixels.
- While a schedule filter, focus state, daily view, or weekly view state is active, any click in the schedule content area should be treated as an empty-space clear click unless it is inside the left collapsible side menu or on one of the top schedule action buttons.
- In this mode, the click target can be a cell, badge, card, header, or visibly blank part of the grid; the first click still clears the next state by the existing priority and does not activate the target underneath.
- The left collapsible side menu and top schedule action buttons remain normal interactive regions and should not be swallowed by this broad clear behavior.

Observed:

- Clicking a location-name header focuses the schedule grid to that location.
- Clicking the same location header again currently behaves like a toggle and can enter a confusing active/inactive loop.
- Clicking empty grid space while a location focus is active does nothing; the focus remains active.
- If the grid has a schedule badge, shift card, or another clickable item under the pointer, the first click may reach that item instead of being consumed by filter clearing.

Expected:

- Clicking a location header should set focus to that location.
- Clicking the already-focused location header again should be idempotent; it should keep that location focused instead of toggling the focus off.
- The existing step-by-step clear priority already in the codebase should remain unchanged. The same priority used for empty-space clicks and `Escape` should continue to decide whether location focus, another filter, daily view, or weekly view closes first.
- The definition of "empty space" should be broader: everything except the left collapsible side menu and the top schedule action buttons should count as empty space while a schedule filter/focus/view state is active.
- When any schedule focus/filter/view state is active, the first click in that broad empty-space area should clear the next state by the existing priority and be consumed, so the clicked cell, badge, card, or header does not also receive that click.

Code pointers:

- `apps/web/src/schedule/components/ScheduleLocationHeader.tsx`
- `apps/web/src/schedule/lib/scheduleLocationFilterToggle.ts`
- `apps/web/src/schedule/lib/scheduleInteractionTargets.ts`
- `apps/web/src/views/SchedulePage.tsx`

Clarify:

- No need to redefine clear order; use the existing codebase order that already works for `Escape` and current empty-space clearing.

## 2. Top-right export button does not work

Status: user-reported, behavior clarified, not investigated yet.

Area: schedule page top action bar.

Observed:

- The export button at the upper-right/top area of the schedule page appears to do nothing at first.
- After clicking `Export` and scrolling down, a small export schedule menu appears below the schedule grid.
- The menu is opening/rendering in the wrong place, so the user reasonably perceives the button as broken.

Expected:

- The export button should open the export UI in a visible, intentional, and contextually correct position near the top action area or as an app-native dialog/sheet.
- The export flow should be debugged and reworked into a coherent interaction instead of rendering below the grid.

Clarify:

- Investigate whether the export popover/menu is anchored to the wrong container, affected by layout/portal positioning, hidden by overflow/sticky layout, or rendered in the wrong DOM location.

## 3. Top action buttons disappear in schedule edit mode

Status: user-reported, not investigated yet.

Area: schedule page top action bar and new schedule blank flow.

Flow:

- Click the schedule page `New schedule` button.
- In the opened menu/dialog, choose `New schedule (blank)`.
- The schedule grid moves from view-only mode into edit mode.

Observed:

- After entering edit mode, the top-right action buttons disappear from the schedule grid/header area.
- Missing actions include `Export`, `New schedule`, `Templates`, and `Publish`.

Expected:

- `Export`, `New schedule`, `Templates`, and `Publish` should remain visible in schedule edit mode.
- These actions should remain functional while the schedule is being edited.

## 4. Discard confirmation uses native browser/OS UI

Status: user-reported, not investigated yet.

Area: schedule edit mode discard flow.

Flow:

- Enter schedule edit mode through `New schedule` -> `New schedule (blank)`.
- Click the `Discard` button at the top-right of the schedule grid/edit area.

Observed:

- A confirmation prompt appears, which is good.
- The prompt appears to come from the browser or Windows native UI instead of the application.

Expected:

- Discard should still require confirmation before changes are lost.
- The confirmation should be rendered by the application using the same visual language/theme as the rest of the app.
- A toast-style or app-native confirmation pattern should replace the browser/OS prompt.

## 5. Edit mode needs a visible status label

Status: user-reported, not investigated yet.

Area: schedule grid mode/status indicator.

Observed:

- When edit mode is off, the top-right of the schedule grid shows a `View only` style status label.
- When schedule edit mode is on, there is not an equally clear status label showing that the grid is editable.

Expected:

- Schedule edit mode should show a visible status label in the same general place/style as the existing `View only` indicator.
- The label should make it clear that the schedule grid is open for editing.

## 6. Schedule buttons feel visually inert and not clearly clickable

Status: user-reported, not investigated yet.

Area: schedule edit modal/buttons, edit toolbar, and top schedule filters/actions.

Observed:

- In the schedule edit flow, clicking `Save draft` opens a dialog whose buttons look visually flat/inert and do not clearly read as clickable.
- Dialog buttons do not appear to react on hover.
- The bottom `Close` button in that dialog also feels like a static image, with no hover animation or visible interaction feedback.
- In schedule edit mode, the grid-top buttons such as `Templates`, `Autofill`, `Save draft`, and `Discard` also feel too static and do not give enough hover/interaction feedback.
- The page-top controls such as `Calendar`, `Settings`, and `Hide unscheduled` also feel too plain and animationless.

Expected:

- Buttons should visually communicate that they are interactive.
- Hover, focus, active, and disabled states should be clear and consistent with the app theme.
- The same interaction polish should apply across the save-draft dialog, edit-mode toolbar buttons, and top schedule filter/action buttons.
- Keep the UI restrained and product-like, but add enough visual response that controls no longer feel like static images.

## 7. Location header text should be centered

Status: user-reported, not investigated yet.

Area: seven-day schedule grid location headers.

Observed:

- In the seven-day schedule grid with multiple locations shown side by side, the location header text at the top of each location column/group sits too close to the left edge.

Expected:

- Location header text should be visually centered within the header area.
- This applies to the normal schedule grid view, not only edit mode.

## 8. Multi-location grid should only show separators between locations

Status: user-reported, not investigated yet.

Area: seven-day schedule grid with multiple locations side by side.

Observed:

- The first seven-day location grid looks acceptable.
- Location grids after the first one show extra vertical lines running top-to-bottom between internal day/cell columns.
- These internal column divider lines are visually unnecessary and make the later location grids feel inconsistent with the first grid.

Expected:

- Remove the extra internal vertical divider lines from the second, third, and later location grids so they visually match the first location grid.
- Keep a clear separator only between adjacent location groups.
- The separator should appear after each location group's Sunday column and before the next location group's Monday column.
- This inter-location separator should be a thicker vertical line so neighboring location schedules do not visually blend together.

## 9. Daily view should close through the existing empty-space dismissal flow

Status: user-reported, code-located, not fixed.

Area: day header click, daily/weekly view state, and blank-surface dismissal.

Observed:

- Clicking a date/day at the top of the schedule grid opens daily view.
- Daily view focuses the schedule to the clicked day and hides the other days.
- Clicking the broad empty-space area while daily view is active does not exit daily view.
- The page therefore stays in daily view instead of returning to weekly view.

Expected:

- Daily view should behave like the other schedule filters/layers.
- When daily view is active, empty-space click dismissal should eventually return the schedule to weekly view using the existing priority order.
- The existing dismissal priority should not be redesigned.
- Current code already contains a dismissal order in `SchedulePage.tsx`: topbar dropdowns/dialogs/editor/menu selections, `hideUnscheduled`, shift/job/employee filters, location filters, daily view, then current-week reset.
- If the current app does not contain enough detail while implementing, inspect the old Newfork schedule page as read-only reference and import only this behavior.

Code pointers:

- `apps/web/src/views/SchedulePage.tsx`
- `apps/web/src/schedule/lib/scheduleInteractionTargets.ts`

## 10. Schedule grid scroll should keep the top area sticky/frozen

Status: user-reported, not investigated yet.

Area: schedule grid vertical scrolling and sticky header behavior.

Observed:

- While the schedule grid is open, vertical scrolling does not preserve the desired frozen top layout.
- When scrolling down, even the top page buttons scroll away and disappear above the viewport.
- The affected top controls include `Calendar`, `Settings`, `Hide`, and `All locations`.

Expected:

- During up/down scrolling, the top of the schedule page/grid should remain sticky/frozen.
- The top action/filter button area should remain visible instead of scrolling away behind/above the screen.
- Specifically, the `Calendar`, `Settings`, `Hide`, and `All locations` controls should remain fixed/sticky in place while scrolling.
- The user expectation is that everything except the employee-name rows/content movement remains frozen.
- Employee names/rows can move with the scroll as appropriate, but the rest of the schedule frame/header context should stay fixed.

## 11. Day/date header design feels unpolished

Status: user-reported, not investigated yet.

Area: schedule grid day/date header cells.

Observed:

- The day header cells show content like `Tuesday 1`.
- The day name and date number feel visually disconnected: the day name sits on the left and the number sits on the right.
- The current composition does not feel polished enough.

Expected:

- Redesign the day/date header cells so the day name and date number feel like a cohesive unit.
- The design should feel more professional, enterprise-grade, and user-friendly.
- The result should improve the schedule grid's visual hierarchy without making the header noisy.

## 12. Publish status indicators should move into the grid headers

Status: user-reported, not investigated yet.

Area: schedule grid publish/live status indicators.

Observed:

- Immediately above the schedule grid there is a control/indicator showing whether a location schedule is live/published.
- This currently behaves like both a button and an indicator.
- The user wants this separate above-grid live/publish indicator removed.
- The schedule grid already has `Published` / `Non-published` text above the Sunday cell area.

Expected:

- Remove the separate live/published button-indicator located just above the schedule grid.
- Use the existing per-location status area above each location's Sunday cell as the source of publish status.
- If a location's schedule is published, show `Published` there in a clearer green treatment.
- If it is not published, show the non-published state in a normal, less prominent font treatment.
- This must work per location when multiple location schedules are open side by side: each location should show its own published/non-published state in its own Sunday/status area.
- Removing the separate row/control should also reclaim vertical space above the grid.

## 13. Add Shift drawer needs UI and logic cleanup

Status: user-reported, not investigated yet.

Area: schedule edit mode add-shift drawer.

Flow:

- Enter schedule edit mode.
- Click a schedule grid cell.
- The `Add shift` drawer opens from the right.

Observed UI issues:

- The drawer looks visually amateur/unpolished.
- `Cancel` and `Add shift` buttons look like they are floating in space rather than anchored to a clear action area.
- There is a large check mark around the middle of the drawer, but its purpose is unclear.
- The `Start` and `End` input boxes contain overlapping text/fonts, making the values hard to read.

Observed logic/content issues:

- When clicking a specific employee's cell, the drawer still shows an employee dropdown as the second option.
- This is redundant because the clicked cell already determines which employee the shift is being added to.
- The drawer also shows a `Date` field even though the clicked cell already determines the date.
- `Job` is useful and should remain.
- `Shift type` is useful and should remain.
- `Start`, `End`, and `Unpaid break` are useful and should remain.

Expected:

- Redesign the Add Shift drawer so it feels polished, functional, and consistent with the app.
- Remove or demote redundant fields when the clicked grid cell already supplies the value.
- Keep necessary editable shift details such as job, shift type, start/end time, and unpaid break.
- Fix the overlapping text/font issue in time inputs.
- Rework the footer/actions so `Cancel` and `Add shift` are clearly anchored, readable, and visually clickable.
- Remove or explain the large check mark; it should not sit in the drawer without clear purpose.

## 14. Drag-drop, copy-paste, and multi-select need to be made functional

Status: user-reported, not investigated yet.

Area: schedule edit mode shift badge interactions.

Observed:

- Drag-drop, copy-paste, and multi-select are not working functionally/reliably enough.

Expected multi-select:

- In edit mode, holding `Ctrl` and clicking a shift badge should select that shift badge.
- Holding `Ctrl` or `Shift` and clicking another shift badge should add it to the current selection, creating a multi-select.
- With multiple shift badges selected, pressing `Delete` should start a delete flow for the selected shifts.
- Before deleting multiple shifts, the app should show a confirmation warning.

Expected copy/paste:

- With one or more shift badges selected, pressing `Ctrl+C` should copy the selected shift badge data.
- Pressing `Ctrl+V` should turn paste mode on.
- While paste mode is on, clicking schedule cells should paste the copied shift into the clicked cell.
- Paste should use the clicked cell's employee/date/location context.
- Paste should validate employee location assignment, job assignment, availability, and overlapping shifts in other locations before creating the pasted shift.
- If the paste would create a conflict or violate assignment/availability rules, the app should prevent the paste and show a clear conflict/validation message.

Expected drag-drop:

- Drag-drop should be reviewed and fixed as part of the same schedule badge interaction system.
- Moving a shift by drag-drop should obey the same assignment, availability, and conflict rules as paste.

## 15. Cell hover Add Shift button should sit under existing shift badges

Status: user-reported, not investigated yet.

Area: schedule grid cell hover action placement.

Observed:

- When an employee already has a shift in a cell, hovering that cell reveals an `Add shift` hover button inside the cell.
- The current placement makes the button appear in the cell area rather than visually belonging with the existing shift content.

Expected:

- Move the hover `Add shift` button under the existing shift badge inside that cell.
- The action should remain available, but its placement should feel attached to the shift stack/content rather than floating elsewhere in the cell.

## 16. Top-left logo area is too small

Status: user-reported, not investigated yet.

Area: schedule grid top-left logo slot.

Observed:

- The logo area at the top-left of the schedule grid is too small.
- Text inside the logo can be unreadable at the current size.

Expected:

- Enlarge the logo area upward into a larger/wider rectangular region.
- The logo should have enough room for text/details to remain readable.
- The change should preserve the schedule grid layout and not crowd neighboring headers.
- Move the `Editing draft` / `Unsaved changes` text that currently occupies that corner to the right side of the logo boundary.
- The expanded logo should own that top-left space, while draft/unsaved status remains visible next to it.

## 17. Employee codes should be removed from grid rows

Status: user-reported, not investigated yet.

Area: schedule grid employee row labels.

Observed:

- Employee codes are displayed under employee names in the schedule grid.

Expected:

- Remove employee codes from the schedule grid row labels.
- Employee names should remain visible, but the codes are unnecessary in this context.

## 18. Shift badge text alignment and readability need improvement

Status: user-reported, not investigated yet.

Area: shift badge layout and typography.

Observed:

- Text inside shift badges is being cut off or obscured by the circular/marker element inside the badge.
- Badge text alignment feels off.
- Current badge typography is not readable enough.

Expected:

- Re-align shift badge content so text does not sit behind or collide with the badge's visual marker.
- Improve typography for readability.
- Make shift times explicit and easy to scan.
- In 24-hour mode, render times as `HH:MM - HH:MM`.
- In 12-hour mode, render times with full minutes and AM/PM, for example `9:00 AM - 5:00 PM`.
- Do not abbreviate to compact forms like `9A - 5P`.
- Preserve a compact badge layout while making key shift information legible.

## 19. Move weekly view navigation into the top button row

Status: user-reported, not investigated yet.

Area: schedule page top controls and weekly view navigation.

Observed:

- The `Weekly view` label/control and its left/right navigation arrows sit in their own row above the schedule grid.
- That row consumes vertical space.

Expected:

- Move the `Weekly view` control and its left/right arrows into the schedule page's top button row.
- Place it at the far left of that row, immediately to the left of the current `Calendar` button.
- Remove the now-empty/separate row where the weekly view control currently sits to reclaim vertical space.

## 20. Clickable grid headers need hover/cursor affordance

Status: user-reported, not investigated yet.

Area: schedule grid location headers and day/date header cells.

Observed:

- The location-name header is clickable, but the mouse cursor does not change on hover.
- The location-name header does not show a hover effect, so it does not look interactive.
- The date/day header cells are also clickable, but their interactivity is not visually obvious.

Expected:

- Add clear, restrained hover and cursor affordances to clickable location headers.
- Add matching hover/interaction affordances to clickable date/day header cells.
- Use subtle animation/transition so the controls feel interactive without making the grid noisy.
- The affordance should make it obvious that clicking location focuses a location and clicking a date opens daily view.

## 21. Unassigned shift row is missing in edit mode

Status: user-reported, not investigated yet.

Area: schedule edit mode unassigned shift row and settings toggle.

Observed:

- In schedule edit mode, the unassigned shift row is not visible.
- The schedule Settings menu has a control for hiding/showing the unassigned shift row.
- Even when using that setting to show the row, the unassigned shift row still does not appear.

Expected:

- The unassigned shift row must be visible/available in schedule edit mode when enabled.
- The Settings hide/show control must correctly control this row.
- This is important because unassigned shifts are a critical part of editing and building a schedule.
