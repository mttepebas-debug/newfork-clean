---
name: availability-yeniden-kurgu
description: Availability end-to-end UI/UX redesign (Mert 2026-10-13) in the Important Dates thread: decisions, spec, rebuilt 5 mockups, waiting Mert's pick + "kodla"
metadata:
  type: project
  modified: 2026-10-13T13:08:57.570Z
---

The redesign runs in the Important Dates thread (cmsg_013zBzr8GJv9vVEM4zDoaKrVF9qY395yPWmWkPPzNfPD9w). Mert's order: explore → spec → plan → mockups → code + test.

**Decisions by Mert, 2026-10-13**
- Availability is purely the employee's preference. It is entered in onboarding (skippable) and in My Availability.
- Employees drawer: managers can only view it and write their own notes ("Yalnız görsün").
- Schedule: the cell shows only an orange "!", never a conflict. Every assignment shows a short toast with no confirmation. This replaces KARARLAR Müsaitlik M8.
- The first 5 mockups (list / timeline / day cards / paint grid / sentence) were REJECTED at ~11:00Z: "hepsi çok amatör ve berbat". The cause: a fake shell, collage panels and hatching gimmicks. They were deleted and rebuilt from scratch on the real app shell.

**Rebuilt set, delivered 2026-10-13 ~13:10Z**
- Page: /mnt/project-files/pages/gorsel-kararlar/gelen/availability-tercih/index.html
  - It is self-contained.
  - Hash options: v=o|1..5, s=mine|onboard|team|drawer|schedule|mysched, view=both|desk|phone, mode=hours|types, about=0|1.
- Previews: onizleme-masaustu.png and onizleme-telefon.png in the same folder.
- Source: kaynak/ (core.css/js plus o, v1..v5 .css/.js). Run `python3 build.py` there to rebuild.
- The versions:
  - Original: today's screen.
  - 1 Rows: a day row with a drag track and Available / Some hours / Unavailable.
  - 2 Week: a calendar where you drag blocks.
  - 3 Dayparts: pattern cards plus a Morning/Midday/Evening/Late × day grid.
  - 4 Day by day: a day list, three big choices and a knob slider.
  - 5 Rules: typed natural-language rules such as "No Fridays after 6pm", a builder and a hover-highlighted week.
- The schedule behavior is the same in all of 1–5: an orange ! and a toast with Undo. The Original keeps the confirm box.

**Code facts for later**
- The server already treats availability as warn: conflict_severity skips the 'availability' and 'note' codes (schema.sql ~8932).
- The box comes from the client, in ShiftQuickEditor attemptSubmit.
- A `warnOnly` path already shows the toast.
- The spec and plan (approved) are in /mnt/project-files/notes/availability/2-spec-plan.md.

**Status**
- Mert PICKED 4 · Day by day (2026-10-13 14:43Z). Plan appended to 2-spec-plan.md section "Seçilen tasarım". It is 3 parts, each going to its own train: 1 Schedule toast/!/texts, 2 employee day-by-day editor (delete WeeklyUnavailableEditor), 3 drawer tiles + Availability page list/detail. Class incelemeli; no migration; Manager notes keep today's function. Waiting for "kodla". The KARARLAR text was sent to the coordinator.
- Coordinator 21:58Z: Mert dislikes the current orange "!" mark; the "Vardiya kartı" thread owns 10 new orange mockups. Part 1 must use the design Mert picks there; the coordinator sends it. Don't touch the "!" meanwhile. PICKED 22:41Z: draft 5 "Nokta" (small orange dot), kart-isaretleri-40/README.md + kaynak/marks.ts. Vardiya kartı thread owns the card visual; Coordinator 22:45Z: Vardiya kartı owns mark drawing in card + cell code; Part 1 = no-confirm toast, assign paths, texts only, never mark rendering.
- Artifact publishing is blocked until 00:00Z Oct 14. The coordinator was sent the path for the /oto visual decisions page.

Related: [[important-dates-drawer]]
