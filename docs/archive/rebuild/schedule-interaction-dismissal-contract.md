# Schedule Interaction and Dismissal Contract

This document records the click, outside-click, Escape, filter, header, drawer,
and view behavior for the rebuilt Schedule page. It combines the verified
behavior of the read-only reference app with the decisions made for the clean
app. When the two differ, the clean-app decision below is authoritative.

## Core rule

Schedule interactions use two distinct paths:

1. **Open surface dismissal:** if a dropdown, menu, dialog, sheet, editor, or
   drawer is open, the first outside interaction closes only that surface and
   is consumed. The underlying cell, badge, header, filter, or button must not
   activate from the same click.
2. **Schedule state dismissal:** when no open surface owns the interaction, a
   genuinely blank schedule-area click or Escape clears one state layer at a
   time using the existing priority order.

These paths must not be merged. An applied filter is state; an open filter list
is a surface.

## Interaction matrix

| Current state                                   | Target                                  | Required result                                  | Click passes through? |
| ----------------------------------------------- | --------------------------------------- | ------------------------------------------------ | --------------------- |
| Top-bar list open                               | Outside the list, including a grid cell | Close the list only                              | No                    |
| Top action menu/dialog open                     | Outside its surface                     | Close that surface only                          | No                    |
| Shift editor/drawer open and clean              | Outside its surface                     | Close the editor/drawer only                     | No                    |
| Shift editor/drawer dirty                       | Outside its surface                     | Keep the drawer or show its discard confirmation | No                    |
| No surface open; filters are applied            | Editable grid cell/add-shift affordance | Preserve filters and open Add Shift              | Yes                   |
| No surface open; filters/view layers are active | Genuinely blank schedule background     | Clear the next dismissal layer                   | No                    |
| No surface open                                 | Location header                         | Run location-header filtering behavior           | Yes                   |
| No surface open                                 | Day/date header                         | Run day-view navigation behavior                 | Yes                   |
| Any schedule surface                            | Escape                                  | Close/clear only the highest-priority layer      | Not applicable        |

## Top-bar dropdowns

The Calendar, Settings, Location, Shift, Job, and Employee lists share one
controlled open state and one outside-click owner.

- Opening one closes the previously open list.
- Clicking inside the list does not trigger schedule dismissal.
- Clicking its own trigger toggles that list without activating another layer.
- The first outside pointer/click pair closes the list and is fully consumed.
- Escape closes the list, stops further Escape handling for that keypress, and
  leaves applied filter values unchanged.

## Applied filters and grid editing

Applied filters (`hideUnscheduled`, location, shift type, job, and employee)
are allowed to remain active while the user writes the schedule.

- An actual grid cell or Add Shift control opens the shift drawer without
  clearing applied filters.
- A blank background click clears one state layer by the priority below and is
  consumed.
- Interactive controls, menus, dialogs, headers, badges, and drawer contents
  are never treated as blank background.

## Schedule lifecycle actions

- Preview mode owns Export, New Schedule, Templates, and Publish/Published.
  Edit mode hides those top-row actions and keeps Auto-fill, Save draft, and
  Discard together on the right.
- Selecting a saved draft row loads its draft shifts into read-only preview;
  it must not acquire an edit lock. The row's explicit edit affordance is the
  only saved-draft path that enters edit mode.
- Selecting the published source returns to live preview. Editing published
  data acquires a working copy; it never mutates the live publication in place.
- Save and publish saves the intended draft first, then opens the publish
  wizard with that exact draft selected.
- Publish uses Locations, Pre-flight, and Notify steps. Escape and backdrop
  dismissal consume the interaction so the grid cannot activate underneath.
- A live published preview renders a green, disabled Published indicator.
  Per-location publication state remains authoritative in the grid headers.
- Discard is a direct edit-mode action: the UI immediately returns to the
  current weekly live preview and releases/cleans the edit session in the
  background. Save-failure recovery remains a separate Retry / Keep editing /
  Discard surface.

## Header behavior

- A location header click selects that location as the focused location. If it
  already exactly matches the current location selection, it clears the
  location selection. It does not clear daily view, content filters, or
  `hideUnscheduled`.
- In weekly view, a day/date header click enters daily view for that date.
- In separate-location daily view, a day/date header click focuses the clicked
  location while remaining in daily view.
- In unified daily view, the duplicated day/date header action is ignored.
- Publication/status controls are explicit interactive targets, not blank
  dismissal targets.

## Dismissal priority

One Escape press or one eligible blank-background click handles only the first
matching layer:

1. Open top-bar dropdown.
2. Conflict, publication, autofill, save, source, template, export, logo, or
   employee-card surface.
3. Shift editor/drawer or cell/shift context menu.
4. Paste mode or multi-selection.
5. `hideUnscheduled`.
6. Shift type, job, or employee filters.
7. Location filters.
8. Daily view back to weekly view.
9. Non-current schedule period back to the current period.

Daily location focus is the exception to steps 6-7: while daily view and a
location selection are both active, the location focus is cleared before the
content filters.

## Event implementation rules

- The component that owns an open surface owns its outside dismissal.
- While a top-bar list is open, a transparent dismiss layer is rendered by
  `SchedulePage`, outside the sticky/blurred top-bar stacking context. It sits
  above the full schedule grid and below the top-bar controls, making it
  physically impossible for the first outside click to hit Add Shift.
- The dismiss layer is an interaction surface, never a blank-dismiss target.
  It must remain mounted through `pointerdown` and `pointerup`, then close the
  list from its own `click`. Removing it during `pointerdown` lets the browser
  retarget the later click to the underlying Add Shift control.
- Outside dismissal records the pointer target, prevents and stops the
  `pointerdown`, then consumes the matching capture-phase `click` as well.
- Pointer and click targets must be tracked as generic DOM elements, not only
  HTML elements. Icon clicks often target an inner SVG or path before bubbling
  to the Add Shift button.
- Do not rely on stopping only `pointerdown`; browsers can still synthesize a
  `click` that activates the underlying cell.
- Only one owner may implement outside dismissal for a given surface. Nested
  duplicate listeners create ordering races.
- A consumed surface-closing click must not also execute the schedule state
  dismissal ladder.
- Tests must cover the complete pointerdown-plus-click sequence, not only a
  standalone click.

## Intentional difference from the reference app

The reference app generally closes a top-bar popover on outside pointerdown but
can allow that same interaction to activate an underlying grid cell. The clean
app intentionally consumes that first interaction. This prevents an accidental
Add Shift drawer from opening when the user's intent was to dismiss a list,
window, or drawer.
