# Newfork-clean
Repo https://github.com/mttepebas-debug/newfork-clean. Owner Mert (GitHub mttepebas-debug), Windows PC, Claude Desktop. ALWAYS write to Mert in Turkish, times in California (UTC−7 in Oct).

## Mert's standing rules (include relevant ones in briefs)
- #8 multiple-choice ends "Yazarak cevap vereceğim"; #9 "detaylı anlat" = 5N1K/before-after/visuals; #10 California time; #11 RETIRED 2026-10-15 (was: every code task updates PAGES pages); #12 visual decisions: Original+variants under /mnt/project-files/pages/gorsel-kararlar/gelen/ITEM/, path via coordinator, /oto adds it; #13 no bare plan numbers (number only in parentheses); #14 thread count watch (Working / Waiting on you=blocked / Idle=review_ready+completed).
- #15 SCOPE-DROP (Mert 2026-10-14 03:08Z, cmsg_013zBzr8GJv9vVEM4zDoaKrVFaRBATy5xitmYAbExyAZqc): a feature that lowers product/UX/UI quality may be PROPOSED for dropping (plain words, 5N1K, with/without outcomes); drop only after Mert's OK.
- 5-MIN REPORT (Mert 2026-10-14 01:19Z, cmsg_013zBzr8GJv9vVEM4zDoaKrV5Z4Vss4nydGw1npCrRg2vo): self send_later chain every 5 min, name "5 dakikalık thread raporu", initiation human_schedule. Each firing: FIRST re-arm, then list_thread_sessions + rc_session_status; post short Turkish report ONLY when something changed. Stop only on "kontrolü durdur"/"raporu durdur". Re-arm after recycle. Latest trigger trig_01BFxoPiTHugiYkrSrSTWSJ7 (fires 12:49Z).
- USAGE: Mert 07:06Z: was at 79% all-models usage, wants warning at 83%. Coordinator can't see usage; told him to write "dur". Keep replies/reports lean.
- AUTOMATION STOPPED (2026-10-12): no new threads/tasks/backlog items; nightly routine trig_01TtcrU2j2Ee8hTRYv39rvpm disabled. Mert's direct asks still done. Backlog page https://claude.ai/artifact/7EiSLRANsdm2jyeh9kzjHT.
- UI: Original + variants before coding, simple and close to Original, popovers anchored to their button, no pick cards; variant pages carry no "which one?" question. Plain talk, no internal technical whys. No shortcuts. Never hand Mert git commands; numbered steps, full paths, Cmd. Never brief steps that trigger permission prompts.
- Design theme = newfork-clean's own system (Artifact https://claude.ai/artifact/KxiYpZDfHAUSN8KffLNxRV).
- Rulebook /mnt/project-files/MERT-KURALLARI.md; repo CLAUDE.md wins. Check old sessions (/mnt/project-files/notes/oturum-ozetleri/, KARARLAR) before design questions.
- Skills: Mert asked 10:19Z to connect a "Tailwind CSS Mobile-First / Arbitrary Variants" skill; not in his account (searched). Offered: he sends source, or coordinator drafts it via propose_skills. App styles are plain CSS files, not Tailwind (inferred).

## Safety / git
- main only via train in PC thread "Bilgisayarındaki Claude 2 (tren)" cmsg_013zBzr8GJv9vVEM4zDoaKrV2oapkSEYBAkXV9pDkemycJ (session cse_01S6hsHoLNujRr639hUGtvCt). Relay cherry-pick list (+ KARARLAR text inline; PC can't read /mnt/project-files). Cloud threads can't send_message the PC session: coordinator relays train requests via message_thread. Single CI runner: no parallel trains (PC may merge non-conflicting queued branches into one train). PC runs the relevant e2e specs locally first (db --e2e lock) before a full train. Train-landed notes arrive as cross-session messages. RC may drop or go offline (computer asleep) and resumes on Mert's next message there. (PAGES retired 2026-10-15: no PAGES step after trains.) PC thread asks Mert live-DB questions itself in its thread. PC checks diff file lists (incl. auth-hold files); confirm ONAY covers whole range when asked.
- Cloud threads push only their claude/... branch, no force push; force/mirror/prune denied. Every commit needs nf-guvenlik ONAY (Agent subagent_type "nf-guvenlik"). Records: PC thread alone commits on coord/kayit2.
- LIVE DB WRITES and CLAUDE.md changes need Mert's own typed words IN THE PC THREAD; coordinator never approves live changes. Live data is test data.
- OFF-LIMITS: "devir testi" sessions 569-2577cf3c and 576-5f3f2c33 never read/summarize/back up. No password values. artifacts/note-mark-r3/.session.json holds tokens, never back up. NEVER delete an Artifact unprompted.
- DO NOT DELETE branches: task/ekran-02-c2r, task/ekran-03-c1a, backup/task/bl-969, task/ekran-02-c2-css, task/arayuz-salt-hata, archive/*, task/avail-design, task/ekran-02-c3, task/bl-969-kurtarma, backup/tanitim-sitesi/*, keep/*, coord/kayit2; Jobs worktree keen-brahmagupta-8c4853.
- HOLDS: auth screens until Mert's "go" (WorkspaceHubPage, WorkspaceStatusPage, ProtectedRoute; route guards ActionRoute/PermissionRoute/resolveLanding are NOT held); design canvas; B1 until email service. Vercel main-only.

## Trains
- MAIN 9b871a97 (2026-10-14 ~12:50Z, CI 38564289664 green full e2e): NEW-mark-on-time fix (6d7654a5, row ResizeObserver watches border box). Sha sent to Üst çubuk + Vardiya kartı; told Mert.
- 80c772bf (~11:45Z, CI 38557927074): Vardiya kartı new look (LIVE mark, NEW mark, paperclip, one-line text, first-line alignment, "!" moved to name cell with "Changed after publishing" window, fitted single-location week). Picks b31d99ba 21f00a5d 5d633c3b 82bba4ae + coord 313e9dd4 39955a3f.
- ORANGE DOT 70f3004a HELD: asked Mert (post cmsg_013zBzr8GJv9vVEM4zDoaKrVUkPCemVRSU3nKYPMMHuUeh): 1 own train now (recommended), 2 with Availability, 3 written. Waiting. Branch claude/project-thread-nezlm0 differs from main by the dot only.
- Before: be055596 (access card + load-error card centered; KARARLAR coord/kayit2@94a4e0d2), 28aeb82b, 5950292c, 373c9c39, e0c18aae, e0ffc3fc, bfba6796, ff275b71, ae458808 (LIVE migration department_archive_takes_its_jobs).
- Train queue empty.
- ARTIFACT LIMIT: 200/day used up on 2026-10-14 ~08:20Z; resets 00:00Z (17:00 California). Takas, icon, Jobs (list-selection inventory) threads republish their own pages in the new account only when their work reopens.
- Schedule New Schedule window B look is LIVE (Mert checked 09:40Z). NOT on main: template preview on grid and template editing on grid (approved 2026-10-12, /mnt/project-files/pages/gorsel-kararlar/gelen/new-schedule-tablo/KARARLAR-NOTU.md; need DB+API). Raise only if Mert asks.

## Threads
- MVP İNCELEMESİ cmsg_013zBzr8GJv9vVEM4zDoaKrVDNHTwaFBbtgP2giDhjAibS (cse_01PCVNrbqYerGE3ihAFrJEoP): Mert 10:45Z MVP list + progress plan; notes /mnt/project-files/notes/mvp/. Mert cancelled "publish after 17:00" for this page; asked which built features are proven.
- LINEUP DEVAM cmsg_013zBzr8GJv9vVEM4zDoaKrV6y9D6tXH6P2sbqqaT7tBz2 (cse_013n6bR58oddwnSRvmLnuiZ2): owns LoadState.tsx and Lineup. Mockups: phone https://claude.ai/artifact/HpPEjjYzgm6WPxrmJejGwG, desktop https://claude.ai/artifact/T4Heypx662YmYWSnG36yxW. Mert 10:11Z: keep "Vardiya sekmeleri" (B); 3 new variants covering the WHOLE phone view; rows: Department + Add staff, Job/Label/Section, ICON + employee name + tag; job icons will replace initials; may bend his rules for better design. Variants file /mnt/project-files/pages/gorsel-kararlar/gelen/lineup-satir/index.html (Original, 1 Sakin liste rec., 2 Hizalı çizelge, 3 İstasyon kartları). Mert 11:09Z: go faster, skip unnecessary steps, no quality loss. Code waits "kodla".
- ERIŞIM YOK cmsg_013zBzr8GJv9vVEM4zDoaKrV8mykP1YNBCvPYtu4PC79ki (cse_01C2DxBLAaiuCZgn3T9mPDzo). Page https://claude.ai/artifact/Xr1CkDfyGejXq74pWdmnCW. Part 1 + centering on main. Part 2: one-line notices (17 places) page https://claude.ai/artifact/7pQDWftLVrPVLGuxVRLuMV, files gelen/tek-cumle-uyarilar/; waiting Mert's pick; Jobs "This job is no longer available" waits on it.
- RESTORAN JOB İKON PAKETİ cmsg_013zBzr8GJv9vVEM4zDoaKrVEZzueb6zKJzrzGYCcBUYdK (cse_016HD8goATcADsWo9sgdqYvx): gallery https://claude.ai/artifact/XxfpgGwRtUH2P5jJKup5qi, files /mnt/project-files/pages/gorsel-kararlar/gelen/job-ikonlari/. PAUSED: 173 pieces; Mert gives keep/sil by number tomorrow; gallery republishes 17:05. Icons go LEFT OF NAME IN LINEUP (replace initials); only role or its most-used tool.
- JOBS cmsg_013zBzr8GJv9vVEM4zDoaKrVPoj4UK3atGpoYVrMUgULjT (cse_01L2e1Q3Dkfke8VXL9Up5NYf). List-selection inventory /mnt/project-files/pages/liste-secim-envanteri.html. Drawer color: F (assigned rows light green, unsaved + green left line; recommended) and G (white + left line) in gelen/jobs-cekmece-renk/; C/D/E still there; waiting Mert.
- VARDIYA KARTI cmsg_013zBzr8GJv9vVEM4zDoaKrVYDCaHRPBwN4oG2GS9gzxhB (cse_01UzM2QRCH53mZ4LjBKb95Yp): LANDED 80c772bf + NEW fix 9b871a97; only orange dot 70f3004a held. Owns mark rendering, ShiftCard/ScheduleRow/ScheduleGridShell/styles.css.
- AVAILABILITY REDESIGN cmsg_013zBzr8GJv9vVEM4zDoaKrVF9qY395yPWmWkPPzNfPD9w: plan /mnt/project-files/notes/availability/2-spec-plan.md. Waits "kodla".
- TAKAS cmsg_013zBzr8GJv9vVEM4zDoaKrVCnRzBPs48HquXVHbUpY6fP (cse_01UiR9BEgDy3v44Mmen6WZnE): plan /mnt/project-files/notes/vardiya-degisim/PLAN.md; waits "kodla"; owns exchange screens. Republishes mockup 17:05. Meyhouse demo live (Palo Alto Oct 19–25), offer delete after test.
- ÜST ÇUBUK cmsg_013zBzr8GJv9vVEM4zDoaKrVJAfPhQHDy1LjB8n7gUtVDL (cse_01EC6VqwpFJ97nZEShzBKHwG): piece 3 model question waits Mert. Found the NEW-on-time bug.
- /oto cmsg_013zBzr8GJv9vVEM4zDoaKrVFXhaZr3oab4VMoQvY5zJwF (cse_01Uuy7KgLf4h4DoiVYRsLbf9): visual decisions page https://claude.ai/artifact/JqDJXpTnExgEuNnjhxpimG (v34).
- Others: Employees yorumları cmsg_013zBzr8GJv9vVEM4zDoaKrVKyzVBLEj84oSeTurX5ZWNF; Availability cmsg_013zBzr8GJv9vVEM4zDoaKrVTrMehkitrTQC2LctCcPKJL; Sayfa sayfa denetimi cmsg_013zBzr8GJv9vVEM4zDoaKrVLdQe82L7XsAeqVzC17s5K5; Eski atlas cmsg_013zBzr8GJv9vVEM4zDoaKrV8Wizcm8rcPrPfVTVXbRvxE. Resolve Employees yorumları, Availability üst bölümü, İzinli günde only on Mert's "kapat".

## Product rules
- Manager can't schedule over approved time off; employee may pick up/cover/swap onto a leave day by own will (warning; approval cancels that day's leave). Lineup: add with warning only. Availability = preference only.
- Invite: manager→Employee; admin→Manager+Employee; owner→all.
- Phone text fields 16px at ≤767px. Archiving a department archives its active jobs.
- Settings list pages: header/tabs/filters fixed, only list scrolls. No separate sort ×; header click cycles asc→desc→default. Settings delete warning "Cancel" inline.
- Access: no permission → page not drawn, only C card (440px) at same URL, no silent redirect; no role/location reason; card centered in page area on every screen.
- Two-location swap: one manager's denial closes it (Declined).
- Published shift card shows LIVE mark; while editing a LIVE card its "!" sits in the person's name cell. Corner marks never touch text.

## Gotchas
- Coordinator has no Write tool (memory via update_memory, ≤16KB). message_thread: needs the thread ROOT id of a thread with a session (not my own post); no angle-bracket placeholders. send_message to sessions fails; use message_thread. start_thread_session ack needs thread_id; with no user msg id, post_message first and start on that post.
- Artifact comments on a thread's own mockup are handled by that thread. /mnt/project-files has no Windows path (Project → Files).
- Auto-mode classifier may refuse Artifact republishes when it only has a coordinator relay ("External System Writes"); attach Mert's own message that asked for it.
- When nudging a thread to keep going, restate the goal so it doesn't drift.
- Artifact limit counts re-publishes too (account-wide 200/day): republish only when content really changed.
- PAGES RETIRED (Mert 2026-10-15): no screen-by-screen Artifact docs; old PAGES Artifacts are never rebuilt or republished; no thread gets a "update PAGES" step. PAGES/_kaynak stays only as the demo-app tool for "Original" views on variant pages (Mert picked "keep the tool only"). Publish guard may refuse one-file app.html: split into app.js.
- Local checkout C:\Users\TheWe\Documents\Codex\newfork-clean. RC can't reach /mnt/project-files. Cloud has no Docker.
- [[project-koordinator-modeli]] [[mert-calisma-anlasmasi-2026-10-09]] [[git-yetki-devri]] [[sayfa-atlasi]] [[important-dates-drawer]] [[artifact-silme-onayi]] [[varyant-sayfasi-soru-yok]] [[lineup-plan-thread]] [[lineup-devir]] [[job-ikon-paketi]]
