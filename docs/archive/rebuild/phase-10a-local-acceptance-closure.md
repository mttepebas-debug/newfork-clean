# Phase 10A Local Acceptance Closure

Status: implemented and locally verified on 2026-08-17. Static-reference Schedule
parity and the bundle advisory are closed. Live old-runtime interaction parity remains
unverified because the read-only old runtime could not resolve organization access.

## Preserved

- `/app/schedule` remains the manager day/week scheduling surface.
- URL-backed period navigation, filters, separate/unified locations, published state,
  edit sources, templates, publication, unpublish, export, and the existing grid model
  remain available.
- Line-up and Requests remain separate Phase 6 routes and are reachable from the
  Schedule Settings menu.
- The old application remained read-only and was not modified.

## Changed And Improved

- Replaced the page-title and tab composition with the compact reference command bar:
  previous/next period, Weekly/Daily view, Settings, Hide Unscheduled, Export, New
  Schedule, and Published/Publish.
- New Schedule retains edit-source and template actions. Published retains unpublish
  and publish-another-draft actions.
- Command menus are mutually exclusive, expose button semantics, and close after an
  action so overlays cannot stack.
- Hide Unscheduled is URL-backed and removes employee rows with no visible shifts.
- The grid now begins directly below the compact filter and publication bands, matching
  the approved reference geometry more closely in expanded and 64 px rail modes.
- Vite splits React, TanStack Query, and Supabase into stable vendor chunks. The main
  chunk fell from 622.57 kB minified / 177.80 kB gzip to 321.32 kB / 93.88 kB. The
  over-500 kB build advisory is gone.

## Visual Evidence

- [Desktop light](phase-10a-schedule-desktop-light.png)
- [Desktop collapsed rail](phase-10a-schedule-collapsed-light.png)
- [Desktop dark](phase-10a-schedule-desktop.png)
- [Mobile](phase-10a-schedule-mobile.png)

The desktop collapsed-rail result was compared with the approved old Schedule
reference screenshot at 1440 by 900. Command order, compact toolbar height, 64 px rail,
published status, employee column, day columns, unassigned row, shift cards, and internal
horizontal grid scrolling now follow the reference composition. Fixture content differs
because the clean seed intentionally contains two locations and richer warning cases.

## Runtime Evidence

- A real local owner Supabase session opened the clean Schedule and loaded its API model.
- Weekly/Daily switching updated the URL and reloaded the matching grid.
- Settings exposed Today, Line-up, and Requests.
- New Schedule opened the real edit-source dialog; Published exposed Unpublish and
  Publish another draft; menus closed after action.
- Desktop light/dark and 390 by 844 mobile were inspected. At mobile width, document and
  body widths remained 390 px while the 1,984 px grid scrolled inside its 388 px owner.
- The accessibility tree contained no unnamed interactive controls. Empty grid cells are
  intentionally unnamed; the document retained one `h1` and no duplicate IDs.
- No browser warning or error was recorded during the final flows.

## Old Runtime Boundary

The old Vite runtime started successfully at `localhost:5173`, but its organization
access request did not respond, so it rendered its fail-closed retry state before
Schedule. No old backend, database, environment, or source file was changed to bypass
that boundary. Live old/new interaction parity therefore remains unverified; static old
source and the approved old screenshot are the evidence used for this local visual
closure.

## Intentionally Omitted

- No undo/redo control was faked because the clean Schedule has no approved undo history
  contract.
- No old backend or authentication state was repaired or copied into the clean project.
- No hosted deployment, KMS, email, storage, realtime, observability, formal WCAG audit,
  or future time/payroll/compliance domain was added.

## Readiness Decision

The local Schedule visual composition and bundle advisory are closed. The project remains
locally ready as a future-design base, while hosted production proof and live old-runtime
interaction parity stay explicitly unverified. No later domain is approved by this phase.
