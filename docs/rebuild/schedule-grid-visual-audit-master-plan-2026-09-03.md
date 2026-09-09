# Schedule Grid Visual Audit and Master Fix Plan

Date: 2026-09-03

## Scope and evidence boundary

This document consolidates six role-separated frontend audits of the production
Schedule Grid, its logo/header shell, shift badges, grid geometry, edit and
preview modes, Add Shift affordances, and interaction states.

Evidence labels:

- **STATIC**: source, CSS, or component-test evidence.
- **TEST**: Vitest, TypeScript, ESLint, or production-build evidence.
- **BROWSER**: the local production-component design surface. The authenticated
  `/app/schedule` route could not be used for the final pass because the local
  workspace API returned `Timed out acquiring connection from connection pool`.

The existing dirty worktree is authoritative. No unrelated user change may be
reverted or reformatted as part of this work.

## Locked product invariants

1. Preview mode renders no Add Shift control and reserves no Add Shift space.
2. All visible day columns have one equal width, derived dynamically from the
   widest currently visible badge plus mode-specific cell chrome.
3. Every row derives its height independently from its tallest synchronized
   badge or tallest multi-badge cell stack.
4. All real badges in one row share that row's measured badge height.
5. Preview reserves no Add Shift space. In edit mode, an occupied cell reserves
   one minimum action lane below its badge stack; the lane participates in
   minimum-height measurement and stretches into any remaining row space, while
   hover/focus only changes button visibility.
6. Grid, section, unassigned, badge, focus, and selection lines have separate
   ownership. An interaction state must not move or replace a structural line.
7. Backend behavior, permissions, schedule mutations, and business rules remain
   unchanged.

## Audit 1: Shift Badge Component

### Files and owners

- `apps/web/src/schedule/components/ShiftCard.tsx`
- `apps/web/src/schedule/components/GhostShiftCard.tsx`
- `apps/web/src/schedule/components/ScheduleRow.tsx`
- `apps/web/src/styles.css`
- Component tests for ShiftCard and ScheduleRow

### Evidence-backed findings

- **STATIC** Badge state was split across outer border, native focus outline,
  selected ring, current ring, drag opacity, ghost overlay, and publication or
  warning markers. Without explicit precedence, selected/focused/dragged states
  could visually compete.
- **STATIC** The active editor cell was also making its badge appear current,
  even when the user opened the editor directly by double-click.
- **STATIC** Unassigned identical shifts need one render-only stack badge while
  preserving the representative real `shift.id` for edit and drag behavior.
- **STATIC** Badge width measurement must reserve space for both marker clusters
  and stack-count chips or the live badge can exceed the measured column width.

### Complaint match

- Inconsistent/missing badge edges, selected/focused ambiguity, stacked badge
  behavior, and preview/edit visual drift.

### Additional quality findings

- Mouse click focus and multi-select state need different semantics:
  `data-current`/focus is not `aria-pressed` selection.
- Native HTML drag must remain absent because the grid owns pointer drag.

### Visual contract

- One 1px badge border and 4px radius in every mode.
- Hover changes color/shadow only; it never scales or translates the badge.
- Selection and current-focus are non-layout overlays.
- Ghost is non-interactive and uses a dashed inset layer.
- Drag source preserves geometry; drag preview is a separate high layer.

### Applied code changes

- Unified state markers and stack-count metadata.
- Separated active-editor cell treatment from current badge focus.
- Reserved intrinsic measurement width for markers and stack indicators.
- Standardized typography, padding, border, radius, and motion tokens.

### Tests and browser checks

- ShiftCard normal/focused/selected/stacked/double-click tests.
- ScheduleRow active-editor and unassigned stack tests.
- Browser inspection of real badge border, row height, and bottom separator.

### Risks and open questions

- True atomic multi-shift drag remains intentionally deferred. The current UI
  blocks single-shift drag while a multi-selection is active.

## Audit 2: Grid Geometry and Lines

### Files and owners

- `apps/web/src/schedule/lib/scheduleGridLayout.ts`
- `apps/web/src/schedule/hooks/useScheduleBadgeMeasurements.tsx`
- `apps/web/src/schedule/components/ScheduleGrid.tsx`
- `apps/web/src/schedule/components/ScheduleRow.tsx`
- `apps/web/src/styles.css`

### Evidence-backed findings

- **STATIC** Grid seams, location separators, unassigned separators, badge
  borders, and state outlines were using overlapping paint channels.
- **STATIC** Add Shift visibility and row geometry were coupled, so opening an
  editor could expose a row jump and move the unassigned bottom separator.
- **STATIC** Location separators were drawn by `box-shadow`, then lost when a
  header hover/focus/today rule replaced the entire `box-shadow` property.
- **STATIC** Frozen unassigned cells had a higher z-index than header
  intersections, allowing body content to appear in front of sticky headers.

### Complaint match

- Double lines, missing top/left edges, inconsistent unassigned bottom line,
  and frozen row front/back regressions.

### Additional quality findings

- A one-pixel measurement epsilon prevented exact shrinking in some cases.
- Marker and stack widths were absent from intrinsic badge measurement.

### Visual contract

- Grid seam: 1px `--schedule-grid-line-*`.
- Location boundary: 3px section separator that survives hover/focus/today.
- Unassigned separator: one 2px cell-owned bottom overlay at `bottom: 0`.
- Badge border: 1px, contained inside the cell.
- Focus/drop/selection: outline or inset overlay, never layout border.
- Sticky layer order: body < frozen unassigned < headers < topbar/menus < drag.

### Applied code changes

- Kept the Add Shift control out of ResizeObserver input; occupied edit cells
  contribute only its stable minimum height to row measurement, avoiding a
  feedback loop when the lane stretches inside a taller row.
- Made width updates exact so columns can shrink as well as grow.
- Added composite boundary paint for location/day header state rules.
- Raised sticky header intersections above all frozen unassigned cells.

### Tests and browser checks

- Layout calculations, measurement-hook, sticky CSS, ScheduleGrid, and
  ScheduleRow tests.
- Browser computed-style proof: header z-index 10-12, frozen unassigned employee
  cell z-index 6, body unassigned cells z-index 2.
- Browser proof that unassigned row/cell stayed 68px and its 2px bottom line
  remained present after opening the edit surface.

### Risks and open questions

- Authenticated remote/browser proof should be repeated when the local workspace
  connection pool is healthy.

## Audit 3: Preview versus Edit Mode

### Files and owners

- `apps/web/src/schedule/components/ScheduleGrid.tsx`
- `apps/web/src/schedule/components/ScheduleRow.tsx`
- `apps/web/src/schedule/hooks/useScheduleBadgeMeasurements.tsx`
- `apps/web/src/schedule/lib/scheduleGridLayout.ts`
- `apps/web/src/styles.css`

### Evidence-backed findings

- **STATIC** Edit mode previously reserved substantially more row space and a
  separate occupied Add Shift block; preview and edit therefore described the
  same shift with different geometry systems.
- **STATIC** Preview still benefits from tighter cell chrome, but badge content
  hierarchy and line ownership should remain shared.

### Complaint match

- Edit-mode unassigned badges appeared thinner, gaps appeared larger, and the
  mode looked more rounded/blurred than preview.

### Visual contract

- Shared badge component, typography, border, and radius in both modes.
- Preview: 1px inset, 1px stack gap, no Add Shift DOM.
- Edit: 4px inset, 2px stack gap, full-cell Add Shift affordance for empty
  cells, and one full-width action lane below occupied badge stacks with a 28px
  minimum. In a row made taller by another cell's stack, that lane fills all
  remaining height and centers its content. Both variants are revealed only by
  cell hover or keyboard focus-within.
- Mode chrome changes column width, but every visible column remains equal.

### Applied code changes

- Both modes now use one 44px minimum row/badge baseline with dynamic expansion.
- Preview has no Add Shift control.
- Edit Add Shift visibility never changes geometry. Occupied cells reserve one
  deterministic minimum action lane; preview reserves none.

### Tests and browser checks

- Preview absence/edit presence tests, equal-column layout tests, and dynamic
  height tests.
- Earlier authenticated browser pass confirmed zero preview Add Shift controls
  and equal visible columns before the local API pool became unavailable.

### Risks and open questions

- Very narrow viewports still require horizontal grid scrolling by design; they
  must not force text wrap that changes one column independently.

## Audit 4: Interaction and Animation

### Files and owners

- `apps/web/src/schedule/components/ShiftCard.tsx`
- `apps/web/src/schedule/components/ScheduleGrid.tsx`
- `apps/web/src/schedule/hooks/useSingleShiftPointerDrag.ts`
- `apps/web/src/views/SchedulePage.tsx`
- `apps/web/src/styles.css`

### Evidence-backed findings

- **STATIC** A real double-click produced click 1, click 2, then dblclick. When
  click 2 also opened edit, focus and editor transitions could run twice.
- **STATIC** The first pointer activation also armed drag. A second activation
  needed to cancel the pending drag before edit to prevent an unassigned stack
  from visually splitting.
- **STATIC** Mouse-current, keyboard focus-visible, multi-selected, ghost,
  dragged, and drop status need distinct paint channels.

### Complaint match

- Double-click transient focus, unassigned stack split, missing bottom line,
  and focus/selection/drag ambiguity.

### Visual contract

- Edit single click resolves focus after the double-click window.
- First single click focuses; a later single click on the current badge clears
  focus. Double-click opens once without transient focus.
- Double-click on an already current badge opens edit and keeps current focus.
- Keyboard focus uses `:focus-visible`; mouse-current uses the current ring.
- Drag begins only after the existing 6px threshold.
- Motion is color/opacity/shadow only and respects reduced motion.

### Applied code changes

- Added cancellable single-click focus scheduling and dblclick-only edit.
- Cancelled pending drag/pointer state on second activation and before edit.
- Added parent focus toggle behavior.

### Tests and browser checks

- Full click-sequence tests, focused double-click test, multi-select, pointer
  drag, current/selection semantics, and App integration tests.
- Browser double-click proof: editor opened, badge count remained one, row/cell
  stayed 68px, and the 2px separator stayed intact.

### Risks and open questions

- A future touch-specific drag affordance should be designed separately.

## Audit 5: Empty Cell and Add Shift UX

### Files and owners

- `apps/web/src/schedule/components/ScheduleRow.tsx`
- `apps/web/src/schedule/hooks/useScheduleBadgeMeasurements.tsx`
- `apps/web/src/styles.css`

### Evidence-backed findings

- **STATIC** Empty and occupied actions had incompatible hit-area and
  measurement behavior. The occupied action could either consume no reachable
  space behind a badge or alter geometry when exposed.
- **STATIC** Active-editor CSS exposed the reserved occupied action and made the
  jump look like the cell had moved out of the unassigned row.

### Complaint match

- Icon-only versus text inconsistency, action visible when not hovered, occupied
  action not filling the cell, and unassigned Add Shift row/border movement.

### Visual contract

- One native button and one `+ Add shift` language in empty and occupied cells.
- Empty actions use the full cell; occupied actions use all space remaining
  below their badge stack.
- Both variants are opacity 0 and pointer-inactive at rest. The empty action is
  absolute; the occupied action remains in the edit cell's column flow so it
  can stretch safely.
- Edit cell hover or focus-within reveals it; leaving the cell hides it.
- Empty-cell actions fill the complete cell. Occupied-cell actions fill a
  dedicated full-width lane below the complete badge stack, with a 28px minimum
  that stretches through the row's remaining height.
- Preview does not render it.

### Applied code changes

- Unified empty/occupied markup and accessible names including location/date.
- Made the empty variant a full-cell overlay and the occupied variant a
  full-width action lane below the badges.
- Removed active-editor forced visibility; occupied-lane space is reserved
  before hover so visibility changes cannot move the row or its separator.

### Tests and browser checks

- Semantic button/accessibility, CSS overlay, row measurement, App create/dismiss,
  and default-time editor tests.
- Browser proof must confirm an occupied badge still leaves a reachable
  full-width Add Shift lane and that editor activation produces 0px row-height
  change.

### Risks and open questions

- Screenshot verification should include the longest localized Add Shift copy if
  product localization is introduced later.

## Audit 6: Logo and Overall Visual System

### Files and owners

- `apps/web/src/schedule/components/ScheduleLogoFrame.tsx`
- `apps/web/src/schedule/components/ScheduleGridHeaders.tsx`
- `apps/web/src/schedule/components/ScheduleLogoUploadDialog.tsx`
- `apps/web/src/styles.css`

### Evidence-backed findings

- **STATIC** The logo frame and image both carried visual inset, making uploaded
  logos look smaller than the available frame.
- **STATIC** A safe fill strategy needs frame-owned overflow and image-owned
  `object-fit: contain`; `cover` would crop arbitrary customer logos.
- **STATIC** Logo load errors need to restore the generated organization mark.

### Complaint match

- Excessive apparent padding and a logo that did not fill the header frame.

### Visual contract

- Frame owns border, radius, clipping, and aspect ratio.
- Image uses full width/height, `object-fit: contain`, centered origin, and saved
  scale/offset placement without distortion or cropping.
- No extra image padding. Failure falls back to the generated mark.

### Applied code changes

- Removed extra frame/image inset, expanded the usable area, and retained
  contain/overflow safety.
- Added reliable image error fallback.
- Aligned the logo/header edge with the grid line system.

### Tests and browser checks

- Logo frame/upload component tests and production build.
- Browser screenshot on the local production-component design surface.

### Risks and open questions

- Customer assets with large transparent pixels inside the file will still look
  optically small; the app must not destructively crop those pixels.

## Prioritized fix list

### P0: interaction and geometry integrity — applied

1. Double-click edit without focus/drag side effects.
2. Stable occupied Add Shift lane included in cell geometry without hover or
   editor-activation row jumps.
3. Unassigned stack, row height, and bottom separator stability.
4. Frozen unassigned row layer order below headers.
5. Employee drawer trigger excluded from blank-grid dismissal.

### P1: visual consistency — applied

1. Shared badge border/radius/typography/state contract.
2. Preview compactness and absence of Add Shift DOM.
3. Equal dynamic day-column width and exact shrink/grow updates.
4. Location separator persistence on hover/focus/today.
5. Logo usable-area expansion without cropping/distortion.

### P2: follow-up validation — deferred

1. Repeat authenticated browser matrix after the local API pool is healthy.
2. Add screenshot baselines at desktop, 125% zoom, and narrow viewport if a
   stable repository visual-regression runner is selected.
3. Design true atomic group drag separately from the existing single-drag flow.

## File-based implementation map

Changes that must ship together:

- `ShiftCard.tsx`, `ScheduleGrid.tsx`, and `SchedulePage.tsx`: click, focus,
  double-click, and drag cancellation contract.
- `ScheduleRow.tsx`, `useScheduleBadgeMeasurements.tsx`,
  `scheduleGridLayout.ts`, and `styles.css`: dynamic geometry and Add Shift
  overlay contract.
- `ScheduleEmployeeCard.tsx` and `scheduleInteractionTargets.ts`: employee
  drawer first-click behavior while preserving view and filters.
- `styles.css` sticky z-index rules and header boundary state rules: frozen-row
  and location-separator paint order.

Changes that should remain separate:

- Logo presentation can be reviewed/reverted independently of grid interaction.
- Future group drag, touch drag, localization, and visual-regression tooling are
  separate projects and must not be mixed into this fix.
- Backend, permissions, schedule conflict rules, and mutation semantics are out
  of scope.

## Verification record

- **TEST** Complete Schedule feature suite: 110 files, 510 tests passed.
- **TEST** Full App integration file: 58 tests passed.
- **TEST** Focused visual/geometry/interaction suite: 10 files, 81 tests passed.
- **TEST** Web TypeScript check passed.
- **TEST** Targeted ESLint passed.
- **TEST** Web production build passed.
- **BROWSER** Freeze off/on and hide/show/restore passed on the local
  production-component design surface.
- **BROWSER** Unassigned double-click retained row/cell height and separator.
- **BROWSER** Location header interaction retained the 3px left separator.
- **BROWSER LIMIT** Authenticated `/app/schedule` final pass was blocked by the
  local workspace connection-pool timeout, not by a frontend exception.
