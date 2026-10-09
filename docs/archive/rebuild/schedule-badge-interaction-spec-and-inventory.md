# Schedule Badge Interaction Spec and Inventory

Date: 2026-09-02

## Scope and evidence boundary

This contract covers production Schedule shift badges, selection states, ghost
badges, pointer drag, multi-selection drag safety, badge borders, and motion.
The Schedule Shift Design development page and the old application are design
references only. Their dimensions are not production parity evidence.

The job color dot is intentionally absent and remains out of scope.

## Production inventory

| Concern                      | Owner                                                                | Production contract                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Badge semantics and metadata | `schedule/components/ShiftCard.tsx`                                  | Native button, stable accessible label, `aria-pressed` selection state, title/location/label/time lines.                                  |
| Selection resolution         | `schedule/lib/scheduleShiftSelection.ts`                             | Plain selection replaces; Ctrl/Cmd selection toggles; focused shift may become the additive anchor.                                       |
| Grid-level drag policy       | `schedule/components/ScheduleGrid.tsx`                               | A shift drag is blocked while more than one shift is selected.                                                                            |
| Pointer drag session         | `schedule/hooks/useSingleShiftPointerDrag.ts`                        | 6px threshold, pointer capture, one active shift, frame-coalesced visual state, Ctrl/Cmd copy.                                            |
| Drop validation and mutation | `schedule/hooks/useScheduleGridDragControllers.ts`                   | Executes one move or copy. A pure group-target evaluator validates a resolved member target plan without starting group drag or mutation. |
| Border and state rendering   | `styles.css`                                                         | Grid owns structural seams; selection, focus, and ghost state use non-layout overlays.                                                    |
| Geometry                     | `schedule-grid-geometry-spec-and-inventory.md`                       | Production measurements own badge height, row height, column width, and multi-badge stack spacing.                                        |
| Runtime verifier             | `artifacts/schedule-grid-geometry/verify-schedule-grid-geometry.cjs` | Exercises real production components with deterministic network fixtures and no Schedule writes.                                          |

## Interaction decisions

### Native drag

Shift badges do not expose the HTML `draggable` attribute. The Schedule uses a
single custom Pointer Events implementation, avoiding a competing browser-native
drag session and browser drag image.

### Multi-selection

- Ctrl/Cmd-click toggles badge membership.
- Ctrl/Cmd+A selects visible selectable shifts.
- Escape clears the active selection layer.
- Delete uses the existing bulk-delete confirmation path.
- When selection count is greater than one, pointer and mouse drag starts are
  prevented before they reach the single-shift drag controller.
- True group drag is deferred until the API can validate and commit the group as
  one operation. The UI must not imply group movement while mutating one shift.

### Pointer drag

- Drag starts after a 6px Euclidean movement threshold.
- Pointer input is primary. A mouse-only fallback is retained without processing
  compatibility mouse movement after a pointer session has started.
- Listeners are installed once on `window`; duplicate document listeners are not
  used.
- Visual drag-state updates are coalesced to one React update per animation frame.
- Pointer capture keeps the active pointer associated with its source badge.
- Touch gestures do not start direct badge drag. This preserves Schedule scrolling
  until a deliberate touch drag handle or non-drag move workflow is provided.
- Ctrl/Cmd during the gesture changes the operation to copy.

## Border hierarchy

The grid and cell borders are structural. Badge interaction states must not
recolor, resize, or overlap those structural seams.

| State              | Contract                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Idle               | 1px shift-derived border and 4px radius in edit mode.                                            |
| Preview            | Flush stack; top/right badge edges are suppressed and the cell retains the structural grid seam. |
| Hover              | Edit mode only; slightly stronger tint and inset highlight with no translation or scale.         |
| Selected           | Outer border remains unchanged; 2px inset selection perimeter and 14px check marker.             |
| Focused            | Outer border remains unchanged; separate green inset perimeter.                                  |
| Selected + focused | Selection perimeter plus a second inner focus tint.                                              |
| Ghost              | Normal structural edge plus a 1px inset dashed overlay, striped fill, and reduced opacity.       |
| Drag source        | 54% opacity; dimensions and position remain unchanged.                                           |
| Drag preview       | Portal shadow and 86% opacity; no rotation.                                                      |
| Copy/blocked       | Explicit text chip and color outline; status is not communicated by color alone.                 |

Selected badges reserve 22px on the left when the job dot is disabled. The check
therefore cannot overlap the title. Publication and warning markers keep their
existing reserved area on the right.

## Motion contract

- Badge color, shadow, and border transitions: 150ms ease.
- Selection acknowledgement: 160ms opacity transition only.
- No badge scale, translation, rotation, bounce, or persistent pulse.
- Drag movement follows the pointer directly and is not delayed by decorative
  easing.
- `prefers-reduced-motion: reduce` disables badge and selection-ring animation
  and transitions.

## Geometry baseline

Interaction state must not change the production geometry baseline:

| Mode    | Day-column minimum | Badge height | Three-badge row | Badge gap |
| ------- | -----------------: | -----------: | --------------: | --------: |
| Preview |              260px |         57px |           172px |       0px |
| Edit    |              272px |         67px |           251px |       5px |

The runtime verifier confirms desktop and 390px viewport containment for real
and ghost three-badge stacks. Document-level horizontal overflow remains absent.

## Runtime interaction evidence

The selected-state verifier records:

- selected count: 2
- HTML native draggable: false
- draggable attribute: absent
- selected outer border equals the unselected outer border
- selection ring: 2px inset, pointer-events none
- selected content left padding: 22px
- multi-selection drag preview: absent
- browser console errors: 0

Visual artifacts:

- `artifacts/schedule-grid-geometry/actual-edit-two-selected-badges.png`
- `artifacts/schedule-grid-geometry/actual-edit-two-selected-badges-mobile.png`
- `artifacts/schedule-grid-geometry/schedule-grid-geometry-metrics.json`

## Verification inventory

- Focused badge/selection/drag suites: 6 files, 25 tests passed.
- Sticky layout style contract: 12 tests passed.
- App-level context menu, multi-select, and drag scenarios: 3 tests passed.
- Web TypeScript check: passed.
- Web ESLint: passed.
- Web production build: passed.
- Full web suite: 593 of 597 passed in the parallel run. One stale draggable
  assertion was updated. The other three failures were resource-sensitive test
  timeouts and all three passed when rerun independently.
- Production-route Playwright verifier: passed with no geometry failures or
  console errors.

## Deferred work

WCAG 2.5.7 requires an equivalent single-pointer operation that does not require
dragging. A future `Move shift` command should expose Location, Employee, and
Date controls in a context menu flow or editor. Copy plus delete is not treated
as an atomic equivalent to move.

The group target evaluator is implemented and tested. It projects all resolved
member targets together, removes moved source positions, checks policy and
group-internal conflicts, and returns one group status plus member evidence.

True group drag remains deferred. Target-plan resolution from an anchor cell,
atomic bulk mutation, conflict presentation in the UI, and an `N shifts` drag
preview remain out of scope.

## Backup and rollback

Backup:
`artifacts/backups/schedule-badge-interactions-pre-implementation-20260902-structured.zip`

SHA-256:
`073D6A4A5C913AAC1939CEE14DFA3FC4C7806A00F08ABF0A09323C6BF3420A12`

Restore keyword:
`RESTORE_SCHEDULE_BADGE_INTERACTIONS_20260902`

Manual restore:

```powershell
tar -xf "C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\backups\schedule-badge-interactions-pre-implementation-20260902-structured.zip" -C "C:\Users\TheWe\Documents\Codex\newfork-clean"
```
