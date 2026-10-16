# Oturum panosu

A Claude Code mod (function hooks plugin) for Mert's desktop app. It lives in this project's `.claude/skills`, so it loads in newfork-clean sessions only (worktree sessions included) and in each of them opens a pane on the right listing this project's open sessions, with one keyword each:

- **İZİN VER** a tool call has been waiting over 30 s in a session that is not in bypass mode
- **SORUYU CEVAPLA** an open question box, or the turn ended with a question
- **KARAR VER** the turn ended with a next-step question and buttons
- **PLANI ONAYLA** a plan waits for approval
- **HATA** the turn stopped on an API error
- **TASK BİTTİ** the turn ended; **YENİ** when you have not opened the session since
- **DURDURULDU** you interrupted it
- **ÇALIŞIYOR** the turn runs, or it ended while a background job (tests, a train, a worker agent) still runs

The header names the project and switches between two layouts, Ayrıntılı (detail, options and the next step under each session) and Kompakt (one line a session). The list is one board: drag a group header onto another to reorder the groups, click a header to fold it, click a session to open it in the app (`claude://` link). **Summarize** fetches the sessions afresh, then asks the model (sonnet) for each session's done / open / next step and the single most important thing to do now.

**— Küçült** (or the pane's close mark) swaps the pane for a one-line band above the prompt with the counts and **Büyüt**; that choice holds in every session. `/pano` opens the pane again. Layout, group order and folded groups are kept in the plugin store, shared by all sessions.

The board refreshes every 10 s, and at once when a session is opened, archived or renamed (`bin/watch.mjs` watches the app's session folder). `bin/collect.mjs` reads the app's session files for the signed-in account under `%APPDATA%\Claude\claude-code-sessions` (the other account's folder is skipped) and the tail of each transcript under `~/.claude/projects`; the one thing it writes is a cache of its answer in the temp folder, valid 8 s, so the panes of all open sessions cost one collection. A toast says when a session starts waiting on you or finishes.

Checks: `claude plugin validate .claude/skills/oturum-panosu` and `claude plugin test .claude/skills/oturum-panosu`.
