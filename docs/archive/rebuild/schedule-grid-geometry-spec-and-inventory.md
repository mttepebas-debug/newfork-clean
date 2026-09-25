# Schedule Grid Geometry Spec and Inventory

Date: 2026-09-02

## Scope and evidence boundary

This contract covers the production Schedule grid, shift badges, ghost badges,
multi-badge cell stacks, metadata layout, row height, and day-column width. The
development Schedule Shift Design page is diagnostic only. Its fixture sizes and
responses are not accepted as production parity evidence.

The job color dot is intentionally absent. Its removal is not a regression and
this work does not restore it.

Evidence levels used here:

- Source contract: production components, hooks, layout helpers, and CSS.
- Automated contract: focused Vitest and TypeScript checks.
- Runtime geometry: Playwright measurements on `/app/schedule` using the real
  production component tree and CSS. Network responses are intercepted to make
  multi-badge and long-metadata cases deterministic; no Schedule data is written.
- Visual evidence: desktop and 390px viewport screenshots from the same runtime.
- Reference/laboratory observations: design input only, never proof that the
  production app is pixel-identical.

## Inventory

| Concern | Owner | Contract |
| --- | --- | --- |
| Badge markup and real/ghost parity | `schedule/components/ShiftCard.tsx` | Both variants expose the same badge/content measurement hooks. Ghost badges use `data-ghost="true"`. |
| Intrinsic badge width and height | `schedule/hooks/useScheduleBadgeMeasurements.tsx` | Width is the widest visible metadata line. Height is content height plus computed padding and borders. |
| Synchronized row badge height | `schedule/hooks/useSynchronizedRowBadgeHeight.ts` | Every badge in a logical employee row receives the tallest required badge height. |
| Multi-badge stack height | `schedule/hooks/useScheduleBadgeMeasurements.tsx` | Tallest cell stack determines row height; each badge margin, cell padding, and Add Shift control are included. |
| Day-column minimum width | `schedule/lib/scheduleGridLayout.ts` | Maximum of baseline width, location header width, and measured badge width plus mode-specific cell chrome. |
| Measurement invalidation | `schedule/lib/scheduleGridLayout.ts`, `schedule/components/ScheduleRow.tsx` | Re-measure when IDs, names, time values, overnight state, labels, location display, visibility settings, or time format change. |
| Cell and badge visual geometry | `styles.css` | Preview is edge-to-edge; edit mode is inset and spaced. Badge content remains intrinsic and vertically centered. |
| Grid assembly and CSS variables | `schedule/components/ScheduleGrid.tsx` | Publishes measured day-column minimum and synchronized row values to the production grid. |
| Regression proof | Schedule geometry tests and `ScheduleStickyLayoutStyles.test.ts` | Protects line-based width, computed chrome, real/ghost stacks, Add Shift math, and CSS layout rules. |
| Runtime verifier | `artifacts/schedule-grid-geometry/verify-schedule-grid-geometry.cjs` | Reproduces desktop/mobile production-route measurements without backend mutations. |

## Geometry decisions

### Badge height

1. Content is measured from the rendered `.schedule-shift-badge-content`, not
   from a fixed text-line assumption.
2. Vertical chrome is read from computed padding and border widths. A 10px
   fallback exists only for environments such as JSDOM where computed chrome is
   zero.
3. The outer badge owns the synchronized exact height and uses a column flex
   layout with vertical centering.
4. The content wrapper uses `height: auto` and `flex: 0 0 auto`. It must not use
   `height: 100%`, because that allows flex shrink to hide a metadata line while
   the outer badge still appears to fit.
5. All badges in one logical employee row use the tallest intrinsic requirement.
   This keeps horizontal row lines continuous across locations and days.

### Multi-badge cells

- Preview: cell padding `0`, badge margin `0`, gap `0`. Adjacent badge edges
  share the grid rhythm without overlapping. The cell retains a 1px structural
  bottom/right grid line.
- Edit: cell padding `6px` on every side and badge bottom margin `5px`.
- A populated editable cell reserves an Add Shift control of `22px`, a `1px`
  top margin, and the final `6px` bottom padding.
- Example for three synchronized 67px badges:
  `3 * 67 + 3 * 5 + 22 + 1 + 12 = 251px` row height.
- Ghost badges participate in the same stack measurement as real badges. Their
  extra location line may increase the synchronized row height; they may not
  overflow the cell or use an independent stack rhythm.

### Column width

The hidden width surface renders title, location, labels, and time as separate
lines. Therefore the measured width is the longest visible line, not the sum of
all lines.

Minimum day-column width is:

`max(view baseline, location header width, measured badge width + cell chrome)`

- Preview cell chrome: `1px` structural right border.
- Edit cell chrome: `13px` (`6px + 6px` horizontal padding and `1px` border).
- Week baseline: `112px`.
- Day baseline: `168px`.
- When content needs more room, the schedule grid grows inside its horizontal
  scroll container. The document itself must not overflow.

## Production runtime findings

The deterministic long-metadata fixture uses three badges in one cell and ghost
copies in the other locations.

| Mode | Viewport | Column min | Rendered column | Badge height | Row height | Badge gaps | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Preview | 1440px | 260px | 313.859px | 57px | 172px | 0px | contained, no clipping |
| Preview | 390px | 260px | 313.859px | 57px | 172px | 0px | contained, no clipping |
| Edit | 1440px | 272px | 326.859px | 67px | 251px | 5px | contained, no clipping |
| Edit | 390px | 272px | 326.859px | 67px | 251px | 5px | contained, no clipping |

Additional runtime facts:

- Preview real and ghost stacks leave exactly `1px` for the structural grid line.
- Edit real stack has a `5px` badge-to-Add-Shift gap, a `22px` control, and `7px`
  remainder (`1px` control margin plus `6px` cell bottom padding).
- Long metadata produces a 12px minimum-column increase from preview to edit,
  exactly matching `13px - 1px` mode chrome.
- Desktop document width remained `1440px`; mobile remained `390px`. The large
  schedule width stayed inside the grid scroller.
- No browser console errors were recorded.

Runtime files:

- `artifacts/schedule-grid-geometry/schedule-grid-geometry-metrics.json`
- `artifacts/schedule-grid-geometry/actual-preview-three-badges.png`
- `artifacts/schedule-grid-geometry/actual-edit-three-badges.png`
- `artifacts/schedule-grid-geometry/actual-preview-three-badges-mobile.png`
- `artifacts/schedule-grid-geometry/actual-edit-three-badges-mobile.png`

## Acceptance criteria

- Every badge rectangle is contained by its Schedule cell.
- Badge content `scrollHeight` does not exceed visible content height by more
  than one device-pixel rounding unit.
- Preview stack gaps are `0px`; edit stack gaps are `5px`.
- Real and ghost badges use one synchronized row badge height.
- A populated edit cell includes every badge margin, Add Shift height/margin,
  and vertical cell padding in its row height.
- Preview badge width equals cell width minus the 1px grid edge.
- Edit badge width equals cell width minus 13px of cell chrome.
- Metadata visibility or content changes invalidate both width and height
  measurements.
- Narrow viewports preserve geometry through internal horizontal scrolling and
  do not create document-level horizontal overflow.

## Backup and rollback

Backup:
`artifacts/backups/schedule-grid-pre-geometry-implementation-20260902-structured.zip`

SHA-256:
`CD2B8ADDA4CE0DD7A909186A83BF20469C68C98B6338AEA821426819998CAB55`

Restore keyword:
`RESTORE_SCHEDULE_GRID_20260902_PRE_GEOMETRY`

Manual restore:

```powershell
tar -xf "C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\backups\schedule-grid-pre-geometry-implementation-20260902-structured.zip" -C "C:\Users\TheWe\Documents\Codex\newfork-clean"
```
