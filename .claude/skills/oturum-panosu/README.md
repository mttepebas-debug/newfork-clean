# Oturum panosu

A Claude Code mod (function hooks plugin) for Mert's desktop app. Type `/pano` in any newfork-clean session: a pane lists every open session from the last 48 hours with one keyword each, the ones waiting on you first:

- **İZİN VER** a tool call has been waiting over 30 s in a session that is not in bypass mode
- **SORUYU CEVAPLA** an open question box, or the turn ended with a question
- **KARAR VER** the turn ended with a next-step question and buttons
- **PLANI ONAYLA** a plan waits for approval
- **HATA** the turn stopped on an API error
- **TASK BİTTİ** the turn ended; **YENİ** when you have not opened the session since
- **DURDURULDU** you interrupted it
- **ÇALIŞIYOR** still running

The pane refreshes every 20 s while open (it stops when closed), raises a toast when a session starts waiting on you or finishes, and keeps "Pano: n oturum seni bekliyor" in the status line. **Summarize** refreshes, then asks the model (sonnet) for each session's done / open / next step and the single most important thing to do now.

`bin/collect.mjs` reads the desktop app's session files under `%APPDATA%\Claude\claude-code-sessions` and the tail of each transcript under `~/.claude/projects`; it reads only and writes nothing. Checks: `claude plugin validate .claude/skills/oturum-panosu` and `claude plugin test .claude/skills/oturum-panosu`.
