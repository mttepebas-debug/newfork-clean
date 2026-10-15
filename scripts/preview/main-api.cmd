@echo off
rem The main session's preview API (CLAUDE.md section 7: 5642 web / 5643 api), started by .claude/launch.json "main-api".
rem Variables already set here win over apps/api/.env.local (node --env-file never overrides them).
cd /d "%~dp0..\.."
set "PORT=5643"
set "APP_URL=http://127.0.0.1:5642"
pnpm.cmd --filter @newfork/api dev
