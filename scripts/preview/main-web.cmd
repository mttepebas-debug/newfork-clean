@echo off
rem The main session's preview web app (CLAUDE.md section 7: 5642 web / 5643 api), started by .claude/launch.json "main-web".
rem A variable already set here wins over apps/web/.env.local.
cd /d "%~dp0..\.."
set "VITE_API_URL=http://localhost:5643"
pnpm.cmd --filter @newfork/web exec vite --host 127.0.0.1 --port 5642 --strictPort
