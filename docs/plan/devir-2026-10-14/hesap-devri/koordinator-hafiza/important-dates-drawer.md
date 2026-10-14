---
name: important-dates-drawer
description: State of the unified Announcement + Important Dates work (EKRAN-08): what is on main, the queued follow-up commits, the risky live migration, Audience variants waiting Mert
metadata:
  type: project
  modified: 2026-10-12T23:02:31.440Z
---

Thread cmsg_013zBzr8GJv9vVEM4zDoaKrVF9qY395yPWmWkPPzNfPD9w, branch claude/important-dates-drawer-a-q470vy. Notes and screenshots: /mnt/project-files/notes/important-dates-cekmece/.

ON MAIN: one announcement record (live migration 20261012050000 applied 12:17 PM PDT after Mert's "evet"), and the four-tab drawer Details · Audience · Shifts · History (main cab698f5).

51846d47 + 36cf66f4 ON MAIN ee3b444e (4:32 PM PDT). 2c9987da ON MAIN 1d053cd2 and its live function change APPLIED and verified (4:48 PM PDT). All AM/PM work is live. Build the Audience pick on 1d053cd2 or later main. Details of the three commits:
- 51846d47: time text centered.
- 36cf66f4: Details/Shifts/publish times use AvailabilityClockInput so the workspace 12h/24h setting wins; AM/PM on both ends; Shifts choice tones Remove red / Open shift amber / Keep green.
- 2c9987da: Mert's "Her yerde" decision: the Requests list shows both halves too (clockRange option renamed `spaced`). RISKY live migration 20261012224500_announcement_hours_name_both_halves = CREATE OR REPLACE body of app_private.announcement_hours_text. nf-guvenlik ONAY @2c9987da; goes live on Mert's own typed "evet" in the PC train thread (coordinator correction 2026-10-12), and the PC thread applies it.

AUDIENCE C ON MAIN 4662a826 (live). Was: C CODED (Mert 2026-10-12 5:42 PM PDT): one list + '+ Add people' search, nobody pre-picked; 'Archive: unpublish first' removed; phone footer one row; ack box last. Commit 33df3ac1 (cherry-pick alone; parent 8d98f19b = merge of main 1d053cd2), handed to coordinator with KARARLAR text + PAGES notes. Shots /mnt/project-files/notes/important-dates-cekmece/audience-c/. Test page https://claude.ai/artifact/1tUcSJNCQhECQDtpjj6b9V shows final C.

PHONE LIST (Mert 2026-10-13 01:09Z): Announcements/Important Dates/reader use shared ListCard on phone; shell .app-main position:relative keeps bottom bar fixed (an .sr-only lengthened the document). Commits 132c7ec2 + 61750c8f (phone search+New one row, Announcements only: Mert picked 'Yalnız Announcements') + 13bc46d5 (drawer error no longer shifts neighbour box), + e21492ad (phone: manager tab row replaced by status select; Mert 2026-10-13 02:05Z), + 11dc9caf (phone page edge to edge, 16px gutter; Announcements/Important Dates only), head 11dc9caf, handed to coordinator. Test page v6. EMPLOYEES c8c6ea0f (on merge a0a3d5a3 of main df4b02ee): phone edge-to-edge, '+ Add' (shortLabel), status tabs no scrollbar (shared list-page.css), location cell one line. G2 cards not on main (told Mert). Employees moved to its own thread (Mert 2026-10-13); this thread = Announcements/Important Dates only. All phone commits on main 625c7c85; ed1807d8 (Important Dates breadcrumb removed) handed for train. Card asked: edge-to-edge for Workspace/Availability/Notifications/Requests. Offered: same for Important Dates/reader tabs. Shots notes/important-dates-cekmece/telefon-liste/. Offered: card title on two lines (shared value, Mert to say).

COLUMNS (Mert 2026-10-13): Important Dates table = Status · Important date · Category · Starts · Ends, That day removed (faeb5bd2). Announcements table = Status · Announcement · Category · Starts · Ends · Published on (0bf610f0; Mert card 'Kalsın' keeps Published on). Train order ed1807d8, faeb5bd2, 0bf610f0, handed to coordinator session_013V9HdSgCrrqbq9LKtxEprc. Shots /mnt/project-files/notes/important-dates/sutunlar/.

Backlog candidate: ExchangeShiftCard.tsx:44 hardcodes "12h".

Lessons:
- The thread hit the 24-attachment limit: link files in the text instead.
- Python rewrites dropped U+2009 thin spaces in RequestsTable: check the bytes.
- An empty place list must never widen access.
- Overflow-hidden grid children need grid-auto-rows: max-content.
