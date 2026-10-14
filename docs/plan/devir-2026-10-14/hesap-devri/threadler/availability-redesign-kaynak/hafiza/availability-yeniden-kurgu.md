---
name: availability-yeniden-kurgu
description: Availability end-to-end UI/UX redesign (Mert 2026-10-13) in the Important Dates thread: Mert picked 4 Day by day; code (3 parts) waits "kodla"; handoff report in /mnt/project-files/devir/threadler/availability-redesign.md
metadata:
  type: project
  modified: 2026-10-14T16:48:00.551Z
---

This work runs in the Important Dates thread (cmsg_013zBzr8GJv9vVEM4zDoaKrVF9qY395yPWmWkPPzNfPD9w).

**Mert's rules (2026-10-13)**
- Availability is the employee's preference only. Employees enter it in onboarding (skippable) and in My Availability.
- In the Employees drawer the manager views it read-only and writes own notes ("Yalnız görsün").
- On the Schedule, the cell shows a mark only and never a conflict. Each assignment shows a short toast with no confirm. This replaces M8's "box on every write".

**Mockups**
- The first set was rejected as amateur (fake shell, collage) and deleted.
- The rebuild lives at /mnt/project-files/pages/gorsel-kararlar/gelen/availability-tercih/. Rebuild it with `python3 kaynak/build.py`.
  - index.html is the built page; the sources are in kaynak/.
  - Hash keys: v=o|1..5, s=mine|onboard|team|drawer|schedule|mysched, view, mode=hours|types.
- **Mert picked 4 · Day by day (2026-10-13 14:43Z).**
  - Desktop: a day list, then three option cards, then a knob slider.
  - Phone: push navigation.
  - Team view: master-detail.

**Plan**
- File: /mnt/project-files/notes/availability/2-spec-plan.md, section "Seçilen tasarım".
- Three parts, each on its own train:
  1. Toast + Undo on every assign path, plus the texts.
  2. The day-by-day editor, replacing WeeklyUnavailableEditor.
  3. Drawer tiles and the Availability page list/detail.
- Class: incelemeli. No migration.

**Ownership**
- The mark is the "Nokta" (orange dot), from kart-isaretleri-40. The Vardiya kartı thread owns how it is drawn in the card and the cell.
- Part 1 must never touch the mark rendering.

**Code facts**
- The server already warns only (conflict_severity, schema.sql ~8932).
- The confirm box comes from the client (ShiftQuickEditor attemptSubmit).
- A warnOnly toast path exists.

**Stale record**
- KARARLAR "Müsaitlik tercih" item (4) on main still says "A–E, thread B'yi öneriyor", which is the rejected set.
- Fix it to the pick of 4 in the first code branch.

Related: [[important-dates-drawer]]
