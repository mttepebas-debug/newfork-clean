---
name: lineup-plan-thread
description: New Lineup page (child of Schedule) plan thread 2026-10-13: mockup artifact, folder, plan doc, Mert's decided answers, what is still open
metadata:
  type: project
---

Mert asked 2026-10-13 04:47Z (thread cmsg_013zBzr8GJv9vVEM4zDoaKrVBcHqdBD47tqQgkw4egbhe3) for a new daily Lineup page under Schedule. Coding stage 1 started 13:12Z (see last line).

- Mockups: https://claude.ai/artifact/T4Heypx662YmYWSnG36yxW (v29 live). Source /mnt/project-files/pages/gorsel-kararlar/gelen/lineup/ (kaynak/ + build.py), plan doc PLAN.md there.
- DECIDED by Mert 04:58Z + 05:00Z: lineup edits (time/job/label/section/order/call off/notes) stay in the lineup, Schedule unchanged; ONLY a cross-location transfer changes both Schedules. Call off doesn't change the live shift. Manager-approved Shift Hub/time off/Schedule changes reach the shared lineup instantly, no republish (manager's own edits still unpublish/republish). Cross-location move only by someone managing both. No new permission keys. Approved time-off people are visible in Add Staff; adding warns, manager can override, Schedule unchanged. Sections can be added later (list starts empty, "+ Add section…" in the dropdown).
- My default (inferred): someone added from "Available" is lineup-only, no Schedule shift. Data model = overlay rows (daily_lineup_rows hold diffs + lineup-only rows).
- Still open: PLAN §11 small questions (defaults used: catalog name order, no notify on call off, employee sees whole team).
-

**Why:** a later Claude needs where the mockups live and what Mert already decided.
**How to apply:** on Mert's answers or artifact comments, update PLAN.md + kaynak/, run build.py, copy index.html to the publish copy, bant.py, republish same URL. Demo names must be US English (no Mert). Related: [[sayfa-atlasi]] [[varyant-sayfasi-soru-yok]].

- CODING stage 1 ON MAIN (b8315a0f, 13 Oct): read-only /app/schedule/lineup (web only; reuses Schedule read). PAGES 3.4 published 2026-10-14 00:10Z https://claude.ai/artifact/AJqKmK2HZcmwV8tooCtusz (_kaynak/tools/sc/35-lineup.py). Mockup T4Hey v30 = Gösterge + anchored Publish panel. Open: Read column Q (comment d7428536), PLAN §11 Qs. Next stages (edit, call off, notes, publish) need new tables = incelemeli + live migration.
- 2026-10-14 01:13Z: Mert picked loading/error "B" (skeleton outline + card) for EVERY screen. Shared apps/web/src/shell/LoadState.tsx (Skeleton, LoadingOutline, ListOutline, LoadError). Rollout order agreed with coordinator: a Requests+Notifications/Announcements/Important Dates, b Availability, c Employees+documents, d Settings+Account, e Workspace/Employee hub, f Schedule LAST (ask coordinator first; Üst çubuk owns). Drawers/dialogs: same card, no frame, smaller. Phone: Mert left pick to Claude → B "Vardiya sekmeleri"; mockup https://claude.ai/artifact/HpPEjjYzgm6WPxrmJejGwG (src gorsel-kararlar/gelen/lineup-telefon/). Branch gotcha: remote branch keeps merged history; rebase new commits onto its tip (no force push, no merge commits — train rejects merges).
- 02:55Z: phone Lineup ON MAIN 32bbbc47. Areas a (5d83f506) and b (3b138c3b) ON MAIN; PAGES 3.3/6.0/8.0/9.0/5.0/7.3 rebuilt. Area c (Employees+Documents, new shared RefreshError) commits b3975721 68a3ccc3 91e7f7b4 in review. Branch: train cherry-picks; merging origin/main conflicts (add/add load-state.css) — don't merge, simulate cherry-pick. Publish gotcha: list files + read page before republish. Phone mockup v6 (Mert 02:49Z: time one line, Ack at page bottom, big location+date on team table, no You tag); row layout + summary picks wait Mert. Cross-location move DECIDED (PLAN.md Telefon).
- JOB ICONS (Mert 01:42Z): lineup avatars → per-job custom SVG icons, optional field set when a job is created/edited (not required). Mert will send icons; no code until then. Fallback initials. In PLAN.md "Telefon (Mert, 14 Ekim)".
